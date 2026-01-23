import { recordChanges } from "@fontra/core/change-recorder.js";
import {
  ChangeCollector,
  applyChange,
  consolidateChanges,
} from "@fontra/core/changes.js";
import { translate } from "@fontra/core/localization.js";
import { connectContours, toggleSmooth } from "@fontra/core/path-functions.js";
import {
  generateContoursFromSkeleton,
  calculateNormalAtSkeletonPoint,
  getPointHalfWidth,
} from "@fontra/core/skeleton-contour-generator.js";
import {
  centeredRect,
  normalizeRect,
  offsetRect,
  pointInRect,
  rectSize,
} from "@fontra/core/rectangle.js";
import {
  difference,
  isSuperset,
  symmetricDifference,
  union,
} from "@fontra/core/set-ops.js";
import { Transform } from "@fontra/core/transform.js";
import {
  arrowKeyDeltas,
  assert,
  boolInt,
  commandKeyProperty,
  enumerate,
  parseSelection,
  range,
} from "@fontra/core/utils.js";
import { copyBackgroundImage, copyComponent } from "@fontra/core/var-glyph.js";
import { VarPackedPath, packContour } from "@fontra/core/var-path.js";
import * as vector from "@fontra/core/vector.js";
import { EditBehaviorFactory, constrainHorVerDiag } from "./edit-behavior.js";
import {
  createSkeletonEditBehavior,
  getSkeletonBehaviorName,
  createRibEditBehavior,
} from "./skeleton-edit-behavior.js";
import { getSkeletonDataFromGlyph } from "./skeleton-visualization-layers.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import { getPinPoint } from "./panel-transformation.js";
import { equalGlyphSelection } from "./scene-controller.js";
import {
  glyphSelector,
  registerVisualizationLayerDefinition,
  strokeRoundNode,
  strokeSquareNode,
} from "./visualization-layer-definitions.js";

const transformHandleMargin = 6;
const transformHandleSize = 8;
const rotationHandleSizeFactor = 1.2;
const SKELETON_CUSTOM_DATA_KEY = "fontra.skeleton";

export class PointerTools {
  identifier = "pointer-tools";
  subTools = [PointerTool, PointerToolScale];
}

export class PointerTool extends BaseTool {
  iconPath = "/images/pointer.svg";
  identifier = "pointer-tool";

  handleHover(event) {
    const sceneController = this.sceneController;
    const point = sceneController.localPoint(event);
    const size = sceneController.mouseClickMargin;
    const selRect = centeredRect(point.x, point.y, size);
    const { selection, pathHit } = this.sceneModel.selectionAtPoint(
      point,
      size,
      sceneController.selection,
      sceneController.hoverSelection,
      event.altKey
    );

    // Check for rib point hover (before setting hoverSelection)
    const ribHit = this._hitTestRibPoints(event);
    let finalSelection = selection;
    if (ribHit) {
      // Add rib point to hover selection
      const ribSelKey = `skeletonRibPoint/${ribHit.contourIndex}/${ribHit.pointIndex}/${ribHit.side}`;
      finalSelection = new Set(selection);
      finalSelection.add(ribSelKey);
    }

    sceneController.hoverSelection = finalSelection;
    sceneController.hoverPathHit = pathHit;

    if (!sceneController.hoverSelection.size && !sceneController.hoverPathHit) {
      sceneController.hoveredGlyph = this.sceneModel.glyphAtPoint(point);
    } else {
      sceneController.hoveredGlyph = undefined;
    }

    this.sceneController.sceneModel.showTransformSelection = true;

    const resizeHandle = this.getResizeHandle(event, sceneController.selection);
    const rotationHandle = !resizeHandle
      ? this.getRotationHandle(event, sceneController.selection)
      : undefined;
    if (this.sceneController.sceneModel.hoverResizeHandle != resizeHandle) {
      this.sceneController.sceneModel.hoverResizeHandle = resizeHandle;
      this.canvasController.requestUpdate();
    }
    if (rotationHandle) {
      this.setCursorForRotationHandle(rotationHandle);
    } else if (resizeHandle) {
      this.setCursorForResizeHandle(resizeHandle);
    } else {
      this.setCursor();
    }
  }

  /**
   * Handle arrow key movement for skeleton points.
   * Falls back to default handler for regular path points.
   */
  async handleArrowKeys(event) {
    const sceneController = this.sceneController;

    // Check if we have skeleton points selected
    const { skeletonPoint: skeletonPointSelection } = parseSelection(
      sceneController.selection
    );

    if (!skeletonPointSelection?.size) {
      // No skeleton points - use default handler
      return sceneController.handleArrowKeys(event);
    }

    // Handle skeleton point nudging
    let [dx, dy] = arrowKeyDeltas[event.key];
    if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
      dx *= 100;
      dy *= 100;
    } else if (event.shiftKey) {
      dx *= 10;
      dy *= 10;
    }
    const delta = { x: dx, y: dy };

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const editLayerName = sceneController.editingLayerNames?.[0];
      if (!editLayerName || !glyph.layers[editLayerName]) {
        return;
      }

      const layer = glyph.layers[editLayerName];
      let skeletonData = layer.customData?.[SKELETON_CUSTOM_DATA_KEY];
      if (!skeletonData) return;

      // Deep clone for manipulation
      const originalSkeletonData = JSON.parse(JSON.stringify(skeletonData));
      const workingSkeletonData = JSON.parse(JSON.stringify(skeletonData));

      // Create behaviors and apply delta
      // For arrow keys: altKey enables constrain mode (horizontal/vertical)
      const behaviorName = getSkeletonBehaviorName(false, event.altKey);
      const behaviors = createSkeletonEditBehavior(
        originalSkeletonData,
        skeletonPointSelection,
        behaviorName
      );

      for (const behavior of behaviors) {
        const changes = behavior.applyDelta(delta);
        const contour = workingSkeletonData.contours[behavior.contourIndex];
        for (const { pointIndex, x, y } of changes) {
          contour.points[pointIndex].x = x;
          contour.points[pointIndex].y = y;
        }
      }

      // Helper to regenerate outline
      const regenerateOutline = (staticGlyph, skelData) => {
        const oldGeneratedIndices = skelData.generatedContourIndices || [];
        const sortedIndices = [...oldGeneratedIndices].sort((a, b) => b - a);
        for (const idx of sortedIndices) {
          if (idx < staticGlyph.path.numContours) {
            staticGlyph.path.deleteContour(idx);
          }
        }

        const generatedContours = generateContoursFromSkeleton(skelData);
        const newGeneratedIndices = [];
        for (const contour of generatedContours) {
          const newIndex = staticGlyph.path.numContours;
          staticGlyph.path.insertContour(staticGlyph.path.numContours, packContour(contour));
          newGeneratedIndices.push(newIndex);
        }
        skelData.generatedContourIndices = newGeneratedIndices;
      };

      // Record changes
      const changes = [];

      // 1. FIRST: Generate outline contours (updates workingSkeletonData.generatedContourIndices)
      const staticGlyph = layer.glyph;
      const pathChange = recordChanges(staticGlyph, (sg) => {
        regenerateOutline(sg, workingSkeletonData);
      });
      changes.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

      // 2. THEN: Save skeletonData to customData (now with updated generatedContourIndices)
      const customDataChange = recordChanges(layer, (l) => {
        l.customData[SKELETON_CUSTOM_DATA_KEY] = workingSkeletonData;
      });
      changes.push(customDataChange.prefixed(["layers", editLayerName]));

      const combinedChange = new ChangeCollector().concat(...changes);
      await sendIncrementalChange(combinedChange.change);

      return {
        changes: combinedChange,
        undoLabel: translate("action.nudge-selection"),
        broadcast: true,
      };
    });
  }

  setCursorForRotationHandle(handleName) {
    this.setCursor(`url('/images/cursor-rotate-${handleName}.svg') 16 16, auto`);
  }

  setCursorForResizeHandle(handleName) {
    if (handleName === "bottom-left" || handleName === "top-right") {
      this.setCursor("nesw-resize");
    } else if (handleName === "bottom-right" || handleName === "top-left") {
      this.setCursor("nwse-resize");
    } else if (handleName === "bottom-center" || handleName === "top-center") {
      this.setCursor("ns-resize");
    } else if (handleName === "middle-left" || handleName === "middle-right") {
      this.setCursor("ew-resize");
    } else {
      this.setCursor();
    }
  }

  setCursor(cursor = undefined) {
    if (cursor) {
      this.canvasController.canvas.style.cursor = cursor;
    } else if (
      this.sceneController.hoverSelection?.size ||
      this.sceneController.hoverPathHit
    ) {
      this.canvasController.canvas.style.cursor = "pointer";
    } else {
      this.canvasController.canvas.style.cursor = "default";
    }
  }

  async handleDrag(eventStream, initialEvent) {
    const sceneController = this.sceneController;
    const initialSelection = sceneController.selection;

    const resizeHandle = this.getResizeHandle(initialEvent, initialSelection);
    const rotationHandle = this.getRotationHandle(initialEvent, initialSelection);
    if (resizeHandle || rotationHandle) {
      sceneController.sceneModel.clickedTransformSelectionHandle =
        resizeHandle || rotationHandle;
      await this.handleBoundsTransformSelection(
        initialSelection,
        eventStream,
        initialEvent,
        !!rotationHandle
      );
      delete sceneController.sceneModel.clickedTransformSelectionHandle;
      initialEvent.preventDefault();
      return;
    }

    const point = sceneController.localPoint(initialEvent);
    const size = sceneController.mouseClickMargin;
    const { selection, pathHit } = this.sceneModel.selectionAtPoint(
      point,
      size,
      sceneController.selection,
      sceneController.hoverSelection,
      initialEvent.altKey
    );

    // Check for rib point hit - but only if no skeleton point is under cursor
    // (skeleton points have priority over rib points when they overlap)
    const { skeletonPoint: clickedSkeletonPoint } = parseSelection(selection);
    const hasSkeletonPointUnderCursor = clickedSkeletonPoint?.size > 0;

    const ribHit = this._hitTestRibPoints(initialEvent);
    if (ribHit && !hasSkeletonPointUnderCursor) {
      await this._handleDragRibPoint(eventStream, initialEvent, ribHit);
      initialEvent.preventDefault();
      return;
    }
    let initialClickedPointIndex;
    if (!pathHit) {
      const { point: pointIndices } = parseSelection(selection);
      if (pointIndices?.length) {
        initialClickedPointIndex = pointIndices[0];
      }
    }
    if (initialEvent.detail == 2 || initialEvent.myTapCount == 2) {
      initialEvent.preventDefault(); // don't let our dbl click propagate to other elements
      eventStream.done();
      await this.handleDoubleClick(selection, point, initialEvent);
      return;
    }

    if (!this.sceneSettings.selectedGlyph?.isEditing) {
      this.sceneSettings.selectedGlyph = this.sceneModel.glyphAtPoint(point);
      eventStream.done();
      return;
    }

    let initiateDrag = false;
    let initiateRectSelect = false;

    const modeFunc = getSelectModeFunction(event);
    const newSelection = modeFunc(sceneController.selection, selection);
    const cleanSel = selection;

    // Check if clicking on skeleton segment (for immediate drag support)
    const { skeletonSegment: clickedSkeletonSegment } = parseSelection(cleanSel);
    const clickingOnSkeletonSegment = clickedSkeletonSegment?.size > 0;

    if (
      !selection.size ||
      event.shiftKey ||
      event.altKey ||
      !isSuperset(sceneController.selection, cleanSel) ||
      clickingOnSkeletonSegment // Always update selection when clicking on skeleton segment
    ) {
      this._selectionBeforeSingleClick = sceneController.selection;
      sceneController.selection = newSelection;
    }

    if (isSuperset(sceneController.selection, cleanSel)) {
      initiateDrag = true;
    }
    if (!selection.size) {
      initiateRectSelect = true;
    }

    if (initiateRectSelect || initiateDrag) {
      if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
        initiateRectSelect = false;
        initiateDrag = false;
        if (!selection.size) {
          const selectedGlyph = this.sceneModel.glyphAtPoint(point);
          if (
            selectedGlyph &&
            !equalGlyphSelection(selectedGlyph, this.sceneSettings.selectedGlyph)
          ) {
            this.sceneSettings.selectedGlyph = selectedGlyph;
            eventStream.done();
            return;
          }
        }
      }
    }

    sceneController.hoveredGlyph = undefined;
    if (initiateRectSelect) {
      return await this.handleRectSelect(eventStream, initialEvent, initialSelection);
    } else if (initiateDrag) {
      this.sceneController.sceneModel.initialClickedPointIndex =
        initialClickedPointIndex;
      const result = await this.handleDragSelection(eventStream, initialEvent);
      delete this.sceneController.sceneModel.initialClickedPointIndex;
      return result;
    }
  }

  async handleDoubleClick(selection, point, event) {
    const sceneController = this.sceneController;
    if (!sceneController.hoverPathHit && (!selection || !selection.size)) {
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph?.isUndefined) {
        sceneController._dispatchEvent("doubleClickedUndefinedGlyph");
      } else {
        const selectedGlyph = this.sceneModel.glyphAtPoint(point);
        this.sceneSettings.selectedGlyph = selectedGlyph
          ? { ...selectedGlyph, isEditing: true }
          : undefined;
      }
    } else {
      const instance = this.sceneModel.getSelectedPositionedGlyph().glyph.instance;

      // Parse the CLICKED selection (what was clicked, not current selection)
      const { skeletonSegment: clickedSkeletonSegment } = parseSelection(selection);

      // Handle skeleton segment double-click FIRST - select entire contour
      // This takes priority over toggling smooth on already-selected points
      if (clickedSkeletonSegment?.size) {
        await this._handleSkeletonSegmentDoubleClick(event, clickedSkeletonSegment);
        return;
      }

      const {
        point: pointIndices,
        component: componentIndices,
        anchor: anchorIndices,
        guideline: guidelineIndices,
        skeletonPoint: skeletonPointSelection,
        // TODO: Font Guidelines
        // fontGuideline: fontGuidelineIndices,
      } = parseSelection(sceneController.selection);

      // Handle skeleton point double-click (toggle smooth/sharp)
      if (skeletonPointSelection?.size) {
        await this._handleSkeletonPointsDoubleClick(skeletonPointSelection);
        return;
      }

      if (componentIndices?.length && !pointIndices?.length && !anchorIndices?.length) {
        componentIndices.sort();
        sceneController.doubleClickedComponentIndices = componentIndices;
        sceneController._dispatchEvent("doubleClickedComponents");
      } else if (
        anchorIndices?.length &&
        !pointIndices?.length &&
        !componentIndices?.length
      ) {
        anchorIndices.sort();
        sceneController.doubleClickedAnchorIndices = anchorIndices;
        sceneController._dispatchEvent("doubleClickedAnchors");
      } else if (
        guidelineIndices?.length &&
        !pointIndices?.length &&
        !componentIndices?.length
      ) {
        guidelineIndices.sort();
        sceneController.doubleClickedGuidelineIndices = guidelineIndices;
        sceneController._dispatchEvent("doubleClickedGuidelines");
      } else if (pointIndices?.length && !sceneController.hoverPathHit) {
        await this.handlePointsDoubleClick(pointIndices);
      } else if (sceneController.hoverPathHit) {
        const contourIndex = sceneController.hoverPathHit.contourIndex;
        const startPoint = instance.path.getAbsolutePointIndex(contourIndex, 0);
        const endPoint = instance.path.contourInfo[contourIndex].endPoint;
        const newSelection = new Set();
        for (const i of range(startPoint, endPoint + 1)) {
          const pointType = instance.path.pointTypes[i] & VarPackedPath.POINT_TYPE_MASK;
          if (pointType === VarPackedPath.ON_CURVE) {
            newSelection.add(`point/${i}`);
          }
        }
        const selection = this._selectionBeforeSingleClick || sceneController.selection;
        this._selectionBeforeSingleClick = undefined;
        const modeFunc = getSelectModeFunction(event);
        sceneController.selection = modeFunc(selection, newSelection);
      }
    }
  }

  async handlePointsDoubleClick(pointIndices) {
    let newPointType;
    await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      for (const layerGlyph of Object.values(layerGlyphs)) {
        newPointType = toggleSmooth(layerGlyph.path, pointIndices, newPointType);
      }
      return translate("edit-tools-pointer.undo.toggle-smooth");
    });
  }

  /**
   * Toggle smooth/sharp on skeleton points (double-click handler)
   */
  async _handleSkeletonPointsDoubleClick(skeletonPointSelection) {
    const sceneController = this.sceneController;

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      // Setup data for ALL editable layers (multi-source editing support)
      const layersData = {};
      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        layersData[editLayerName] = {
          layer,
          skeletonData: JSON.parse(JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])),
        };
      }

      if (Object.keys(layersData).length === 0) return;

      // Determine new smooth value from first layer (all layers should have same structure)
      const firstLayerData = Object.values(layersData)[0];
      let newSmooth = null;

      // Find newSmooth value from first layer
      for (const selKey of skeletonPointSelection) {
        const [contourIdx, pointIdx] = selKey.split("/").map(Number);
        const contour = firstLayerData.skeletonData.contours?.[contourIdx];
        if (!contour) continue;

        const point = contour.points?.[pointIdx];
        if (!point || point.type === "cubic" || point.type === "quad") continue;

        const points = contour.points;
        const numPoints = points.length;
        const isClosed = contour.isClosed;

        // Check if this is an endpoint of an open contour
        if (!isClosed) {
          let firstOnCurve = -1;
          let lastOnCurve = -1;
          for (let i = 0; i < numPoints; i++) {
            if (!points[i].type) {
              if (firstOnCurve === -1) firstOnCurve = i;
              lastOnCurve = i;
            }
          }
          if (pointIdx === firstOnCurve || pointIdx === lastOnCurve) continue;
        }

        const prevIdx = (pointIdx - 1 + numPoints) % numPoints;
        const nextIdx = (pointIdx + 1) % numPoints;
        const hasPrevHandle = points[prevIdx]?.type === "cubic" || points[prevIdx]?.type === "quad";
        const hasNextHandle = points[nextIdx]?.type === "cubic" || points[nextIdx]?.type === "quad";

        if (!hasPrevHandle && !hasNextHandle) continue;

        newSmooth = !point.smooth;
        break;
      }

      if (newSmooth === null) return; // No valid on-curve points selected

      // Helper to apply smooth toggle to skeleton data
      const applySmoothToggle = (skeletonData) => {
        for (const selKey of skeletonPointSelection) {
          const [contourIdx, pointIdx] = selKey.split("/").map(Number);
          const contour = skeletonData.contours?.[contourIdx];
          if (!contour) continue;

          const point = contour.points?.[pointIdx];
          if (!point || point.type === "cubic" || point.type === "quad") continue;

          const points = contour.points;
          const numPoints = points.length;
          const isClosed = contour.isClosed;

          if (!isClosed) {
            let firstOnCurve = -1;
            let lastOnCurve = -1;
            for (let i = 0; i < numPoints; i++) {
              if (!points[i].type) {
                if (firstOnCurve === -1) firstOnCurve = i;
                lastOnCurve = i;
              }
            }
            if (pointIdx === firstOnCurve || pointIdx === lastOnCurve) continue;
          }

          const prevIdx = (pointIdx - 1 + numPoints) % numPoints;
          const nextIdx = (pointIdx + 1) % numPoints;
          const hasPrevHandle = points[prevIdx]?.type === "cubic" || points[prevIdx]?.type === "quad";
          const hasNextHandle = points[nextIdx]?.type === "cubic" || points[nextIdx]?.type === "quad";

          if (!hasPrevHandle && !hasNextHandle) continue;

          point.smooth = newSmooth;

          // If switching to smooth, align handle(s) to be collinear
          if (newSmooth) {
            if (hasPrevHandle && hasNextHandle) {
              const prevPoint = points[prevIdx];
              const nextPoint = points[nextIdx];

              const prevDx = prevPoint.x - point.x;
              const prevDy = prevPoint.y - point.y;
              const nextDx = nextPoint.x - point.x;
              const nextDy = nextPoint.y - point.y;

              const prevDist = Math.sqrt(prevDx * prevDx + prevDy * prevDy);
              const nextDist = Math.sqrt(nextDx * nextDx + nextDy * nextDy);

              if (prevDist > 0 && nextDist > 0) {
                const avgDx = nextDx / nextDist - prevDx / prevDist;
                const avgDy = nextDy / nextDist - prevDy / prevDist;
                const avgLen = Math.sqrt(avgDx * avgDx + avgDy * avgDy);

                if (avgLen > 0) {
                  const dirX = avgDx / avgLen;
                  const dirY = avgDy / avgLen;

                  prevPoint.x = point.x - dirX * prevDist;
                  prevPoint.y = point.y - dirY * prevDist;
                  nextPoint.x = point.x + dirX * nextDist;
                  nextPoint.y = point.y + dirY * nextDist;
                }
              }
            } else if (hasPrevHandle || hasNextHandle) {
              const handleIdx = hasPrevHandle ? prevIdx : nextIdx;
              const handlePoint = points[handleIdx];

              const otherSideIdx = hasPrevHandle ? nextIdx : prevIdx;
              let lineEndIdx = otherSideIdx;

              while (points[lineEndIdx]?.type) {
                lineEndIdx = hasPrevHandle
                  ? (lineEndIdx + 1) % numPoints
                  : (lineEndIdx - 1 + numPoints) % numPoints;
                if (lineEndIdx === pointIdx) break;
              }

              const lineEnd = points[lineEndIdx];
              if (lineEnd && !lineEnd.type) {
                const lineDx = lineEnd.x - point.x;
                const lineDy = lineEnd.y - point.y;
                const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy);

                if (lineLen > 0) {
                  const lineDirX = lineDx / lineLen;
                  const lineDirY = lineDy / lineLen;

                  const handleDx = handlePoint.x - point.x;
                  const handleDy = handlePoint.y - point.y;
                  const handleDist = Math.sqrt(handleDx * handleDx + handleDy * handleDy);

                  if (handleDist > 0) {
                    handlePoint.x = point.x - lineDirX * handleDist;
                    handlePoint.y = point.y - lineDirY * handleDist;
                  }
                }
              }
            }
          }
        }
      };

      // Helper function to regenerate outline contours
      const regenerateOutline = (staticGlyph, skelData) => {
        const oldGeneratedIndices = skelData.generatedContourIndices || [];
        const sortedIndices = [...oldGeneratedIndices].sort((a, b) => b - a);
        for (const idx of sortedIndices) {
          if (idx < staticGlyph.path.numContours) {
            staticGlyph.path.deleteContour(idx);
          }
        }

        const generatedContours = generateContoursFromSkeleton(skelData);
        const newGeneratedIndices = [];
        for (const contour of generatedContours) {
          const newIndex = staticGlyph.path.numContours;
          staticGlyph.path.insertContour(staticGlyph.path.numContours, packContour(contour));
          newGeneratedIndices.push(newIndex);
        }
        skelData.generatedContourIndices = newGeneratedIndices;
      };

      const allChanges = [];

      // Apply changes to ALL editable layers
      for (const [editLayerName, data] of Object.entries(layersData)) {
        const { layer, skeletonData } = data;

        // Apply the smooth toggle to this layer's skeleton data
        applySmoothToggle(skeletonData);

        // Record changes for this layer
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          regenerateOutline(sg, skeletonData);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        const customDataChange = recordChanges(layer, (l) => {
          l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      const combinedChange = new ChangeCollector().concat(...allChanges);
      await sendIncrementalChange(combinedChange.change);

      return {
        changes: combinedChange,
        undoLabel: translate("edit-tools-pointer.undo.toggle-smooth"),
      };
    });
  }

  /**
   * Handle double-click on skeleton segment - select entire skeleton contour
   * @param {Event} event - The mouse event
   * @param {Set} clickedSkeletonSegment - The clicked skeleton segment selection
   */
  async _handleSkeletonSegmentDoubleClick(event, clickedSkeletonSegment) {
    const sceneController = this.sceneController;

    if (!clickedSkeletonSegment?.size) return;

    // Get the contour index from the clicked segment
    const segmentKey = [...clickedSkeletonSegment][0]; // e.g., "0/2"
    const [contourIdx] = segmentKey.split("/").map(Number);

    // Get skeleton data to find all on-curve points in this contour
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    const layer = positionedGlyph?.varGlyph?.glyph?.layers?.[
      sceneController.editingLayerNames?.[0]
    ];
    const skeletonData = layer?.customData?.[SKELETON_CUSTOM_DATA_KEY];

    if (!skeletonData?.contours?.[contourIdx]) return;

    const contour = skeletonData.contours[contourIdx];
    const newSelection = new Set();

    // Add all on-curve points of this skeleton contour
    for (let pi = 0; pi < contour.points.length; pi++) {
      if (!contour.points[pi].type) {
        // on-curve point
        newSelection.add(`skeletonPoint/${contourIdx}/${pi}`);
      }
    }

    // Apply selection with modifier support (shift to add, etc.)
    const selection = this._selectionBeforeSingleClick || sceneController.selection;
    this._selectionBeforeSingleClick = undefined;
    const modeFunc = getSelectModeFunction(event);
    sceneController.selection = modeFunc(selection, newSelection);
  }

  async handleRectSelect(eventStream, initialEvent, initialSelection) {
    const sceneController = this.sceneController;
    const initialPoint = sceneController.localPoint(initialEvent);
    for await (const event of eventStream) {
      const modifierEvent = sceneController.applicationSettings
        .rectSelectLiveModifierKeys
        ? event
        : initialEvent;
      const currentPoint = sceneController.localPoint(event);
      const selRect = normalizeRect({
        xMin: initialPoint.x,
        yMin: initialPoint.y,
        xMax: currentPoint.x,
        yMax: currentPoint.y,
      });
      const selection = this.sceneModel.selectionAtRect(
        selRect,
        modifierEvent.altKey ? (point) => !!point.type : (point) => !point.type
      );
      const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
      sceneController.selectionRect = offsetRect(
        selRect,
        -positionedGlyph.x,
        -positionedGlyph.y
      );

      const modeFunc = getSelectModeFunction(modifierEvent);
      sceneController.selection = modeFunc(initialSelection, selection);
    }
    sceneController.selectionRect = undefined;
    this._selectionBeforeSingleClick = undefined;
  }

  async handleDragSelection(eventStream, initialEvent) {
    this.sceneController.sceneModel.showTransformSelection = false;
    this._selectionBeforeSingleClick = undefined;
    const sceneController = this.sceneController;

    // Parse selection to check what types of objects are selected
    const {
      skeletonPoint: skeletonPointSelection,
      skeletonSegment: skeletonSegmentSelection,
      point: pointSelection,
      component: componentSelection,
      anchor: anchorSelection,
      guideline: guidelineSelection,
    } = parseSelection(sceneController.selection);

    // Convert skeleton segment selection to point selection
    let effectiveSkeletonPointSelection = skeletonPointSelection;
    if (skeletonSegmentSelection?.size) {
      effectiveSkeletonPointSelection = this._convertSegmentSelectionToPoints(
        skeletonSegmentSelection,
        skeletonPointSelection
      );
    }

    const hasSkeletonSelection = effectiveSkeletonPointSelection?.size > 0;
    const hasRegularSelection =
      pointSelection?.length > 0 ||
      componentSelection?.length > 0 ||
      anchorSelection?.length > 0 ||
      guidelineSelection?.length > 0;

    // If only skeleton selection, use dedicated handler
    if (hasSkeletonSelection && !hasRegularSelection) {
      await this._handleDragSkeletonPoints(
        eventStream,
        initialEvent,
        effectiveSkeletonPointSelection
      );
      this.sceneController.sceneModel.showTransformSelection = true;
      return;
    }

    // Handle regular selection (with optional skeleton selection)
    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const initialPoint = sceneController.localPoint(initialEvent);
      const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
      let behaviorName = getBehaviorName(initialEvent);

      // Setup for regular point editing
      const layerInfo = Object.entries(
        sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      ).map(([layerName, layerGlyph]) => {
        const behaviorFactory = new EditBehaviorFactory(
          layerGlyph,
          sceneController.selection,
          this.scalingEditBehavior
        );
        return {
          layerName,
          layerGlyph,
          changePath: ["layers", layerName, "glyph"],
          pathPrefix: [],
          connectDetector: sceneController.getPathConnectDetector(layerGlyph.path),
          shouldConnect: false,
          behaviorFactory,
          editBehavior: behaviorFactory.getBehavior(behaviorName),
        };
      });

      assert(layerInfo.length >= 1, "no layer to edit");
      layerInfo[0].isPrimaryLayer = true;

      // Setup for skeleton editing (if we have skeleton selection too)
      let skeletonEditState = null;
      if (hasSkeletonSelection) {
        const editLayerName = sceneController.editingLayerNames?.[0];
        const layer = editLayerName ? glyph.layers[editLayerName] : null;
        const skeletonData = layer?.customData?.[SKELETON_CUSTOM_DATA_KEY];

        if (skeletonData) {
          skeletonEditState = {
            editLayerName,
            layer,
            originalSkeletonData: JSON.parse(JSON.stringify(skeletonData)),
            workingSkeletonData: JSON.parse(JSON.stringify(skeletonData)),
            behaviors: createSkeletonEditBehavior(
              JSON.parse(JSON.stringify(skeletonData)),
              effectiveSkeletonPointSelection,
              getSkeletonBehaviorName(initialEvent.shiftKey, initialEvent.altKey)
            ),
            lastBehaviorName: getSkeletonBehaviorName(
              initialEvent.shiftKey,
              initialEvent.altKey
            ),
          };
        }
      }

      let editChange;

      for await (const event of eventStream) {
        const newEditBehaviorName = getBehaviorName(event);

        // Handle behavior change for regular points
        if (behaviorName !== newEditBehaviorName) {
          behaviorName = newEditBehaviorName;
          const rollbackChanges = [];
          for (const layer of layerInfo) {
            applyChange(layer.layerGlyph, layer.editBehavior.rollbackChange);
            rollbackChanges.push(
              consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
            );
            layer.editBehavior = layer.behaviorFactory.getBehavior(behaviorName);
          }
          await sendIncrementalChange(consolidateChanges(rollbackChanges));
        }

        // Handle behavior change for skeleton points
        if (skeletonEditState) {
          const newSkeletonBehaviorName = getSkeletonBehaviorName(
            event.shiftKey,
            event.altKey
          );
          if (newSkeletonBehaviorName !== skeletonEditState.lastBehaviorName) {
            skeletonEditState.lastBehaviorName = newSkeletonBehaviorName;
            skeletonEditState.behaviors = createSkeletonEditBehavior(
              skeletonEditState.originalSkeletonData,
              effectiveSkeletonPointSelection,
              newSkeletonBehaviorName
            );
          }
        }

        const currentPoint = sceneController.localPoint(event);
        const delta = {
          x: currentPoint.x - initialPoint.x,
          y: currentPoint.y - initialPoint.y,
        };

        const deepEditChanges = [];

        // Apply regular point changes
        for (const layer of layerInfo) {
          const layerEditChange = layer.editBehavior.makeChangeForDelta(delta);
          applyChange(layer.layerGlyph, layerEditChange);
          deepEditChanges.push(consolidateChanges(layerEditChange, layer.changePath));
          layer.shouldConnect = layer.connectDetector.shouldConnect(layer.isPrimaryLayer);
        }

        // Apply skeleton changes
        if (skeletonEditState) {
          const { originalSkeletonData, workingSkeletonData, behaviors, layer, editLayerName } =
            skeletonEditState;

          // Reset working data to original
          for (let ci = 0; ci < originalSkeletonData.contours.length; ci++) {
            const origContour = originalSkeletonData.contours[ci];
            const workContour = workingSkeletonData.contours[ci];
            for (let pi = 0; pi < origContour.points.length; pi++) {
              workContour.points[pi].x = origContour.points[pi].x;
              workContour.points[pi].y = origContour.points[pi].y;
            }
          }

          // Apply behavior changes
          for (const behavior of behaviors) {
            const changes = behavior.applyDelta(delta);
            const contour = workingSkeletonData.contours[behavior.contourIndex];
            for (const { pointIndex, x, y } of changes) {
              contour.points[pointIndex].x = x;
              contour.points[pointIndex].y = y;
            }
          }

          // Regenerate outline and update customData
          const staticGlyph = layer.glyph;
          const skeletonChanges = recordChanges(staticGlyph, (sg) => {
            // Remove old generated contours
            const oldGeneratedIndices = workingSkeletonData.generatedContourIndices || [];
            const sortedIndices = [...oldGeneratedIndices].sort((a, b) => b - a);
            for (const idx of sortedIndices) {
              if (idx < sg.path.numContours) {
                sg.path.deleteContour(idx);
              }
            }
            // Generate new contours
            const generatedContours = generateContoursFromSkeleton(workingSkeletonData);
            const newGeneratedIndices = [];
            for (const contour of generatedContours) {
              const newIndex = sg.path.numContours;
              sg.path.insertContour(sg.path.numContours, packContour(contour));
              newGeneratedIndices.push(newIndex);
            }
            workingSkeletonData.generatedContourIndices = newGeneratedIndices;
          });
          deepEditChanges.push(skeletonChanges.prefixed(["layers", editLayerName, "glyph"]));

          // Update customData
          const customDataChange = recordChanges(layer, (l) => {
            l.customData[SKELETON_CUSTOM_DATA_KEY] = JSON.parse(
              JSON.stringify(workingSkeletonData)
            );
          });
          deepEditChanges.push(customDataChange.prefixed(["layers", editLayerName]));
        }

        editChange = consolidateChanges(deepEditChanges);
        await sendIncrementalChange(editChange, true);
      }

      let changes = ChangeCollector.fromChanges(
        editChange,
        consolidateChanges(
          layerInfo.map((layer) =>
            consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
          )
        )
      );

      let shouldConnect;
      for (const layer of layerInfo) {
        if (!layer.shouldConnect) {
          continue;
        }
        shouldConnect = true;
        if (layer.isPrimaryLayer) {
          layer.connectDetector.clearConnectIndicator();
        }

        const connectChanges = recordChanges(layer.layerGlyph, (layerGlyph) => {
          const selection = connectContours(
            layerGlyph.path,
            layer.connectDetector.connectSourcePointIndex,
            layer.connectDetector.connectTargetPointIndex
          );
          if (layer.isPrimaryLayer) {
            sceneController.selection = selection;
          }
        });
        if (connectChanges.hasChange) {
          changes = changes.concat(connectChanges.prefixed(layer.changePath));
        }
      }

      return {
        undoLabel: shouldConnect
          ? translate("edit-tools-pointer.undo.drag-selection-and-connect-contours")
          : translate("edit-tools-pointer.undo.drag-selection"),
        changes: changes,
        broadcast: true,
      };
    });
    this.sceneController.sceneModel.showTransformSelection = true;
  }

  /**
   * Convert skeleton segment selection to point selection.
   * Returns a Set of point keys ("contourIdx/pointIdx") for all points in selected segments.
   */
  _convertSegmentSelectionToPoints(segmentSelection, existingPointSelection) {
    const result = new Set(existingPointSelection || []);

    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph?.varGlyph?.glyph?.layers) {
      return result;
    }

    const editLayerName =
      this.sceneController.sceneSettings?.editLayerName ||
      positionedGlyph.glyph?.layerName;
    if (!editLayerName) {
      return result;
    }

    const layer = positionedGlyph.varGlyph.glyph.layers[editLayerName];
    const skeletonData = layer?.customData?.[SKELETON_CUSTOM_DATA_KEY];
    if (!skeletonData?.contours?.length) {
      return result;
    }

    for (const selKey of segmentSelection) {
      const [contourIdx, segmentIdx] = selKey.split("/").map(Number);
      const contour = skeletonData.contours[contourIdx];
      if (!contour) continue;

      // Find on-curve indices
      const onCurveIndices = [];
      for (let i = 0; i < contour.points.length; i++) {
        if (!contour.points[i].type) {
          onCurveIndices.push(i);
        }
      }

      if (segmentIdx >= onCurveIndices.length) continue;

      // Determine segment start and end indices
      let startIdx, endIdx;
      const isClosingSegment =
        contour.isClosed && segmentIdx === onCurveIndices.length - 1;

      if (isClosingSegment) {
        startIdx = onCurveIndices[onCurveIndices.length - 1];
        endIdx = onCurveIndices[0];
      } else {
        startIdx = onCurveIndices[segmentIdx];
        endIdx = onCurveIndices[segmentIdx + 1];
      }

      // Add start and end on-curve points
      result.add(`${contourIdx}/${startIdx}`);
      result.add(`${contourIdx}/${endIdx}`);

      // Add off-curve points between them
      if (isClosingSegment) {
        for (let j = startIdx + 1; j < contour.points.length; j++) {
          if (contour.points[j].type) {
            result.add(`${contourIdx}/${j}`);
          }
        }
        for (let j = 0; j < endIdx; j++) {
          if (contour.points[j].type) {
            result.add(`${contourIdx}/${j}`);
          }
        }
      } else {
        for (let j = startIdx + 1; j < endIdx; j++) {
          if (contour.points[j].type) {
            result.add(`${contourIdx}/${j}`);
          }
        }
      }
    }

    return result;
  }

  /**
   * Handle dragging skeleton points with the Pointer Tool.
   * Uses the rule-based SkeletonEditBehavior system.
   * @param {AsyncIterable} eventStream - Event stream for drag
   * @param {Event} initialEvent - Initial mouse event
   * @param {Set} [overrideSelection] - Optional selection to use instead of parsing from sceneController
   */
  async _handleDragSkeletonPoints(eventStream, initialEvent, overrideSelection) {
    const sceneController = this.sceneController;
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();

    if (!positionedGlyph) return;

    // Get initial point in glyph coordinates
    const localPoint = sceneController.localPoint(initialEvent);
    const startGlyphPoint = {
      x: localPoint.x - positionedGlyph.x,
      y: localPoint.y - positionedGlyph.y,
    };

    // Use override selection or parse from sceneController
    let selectedSkeletonPoints = overrideSelection;
    if (!selectedSkeletonPoints) {
      const parsed = parseSelection(sceneController.selection);
      selectedSkeletonPoints = parsed.skeletonPoint;
    }
    if (!selectedSkeletonPoints?.size) return;

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      // Setup data for ALL editable layers (multi-source editing support)
      const layersData = {};
      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = layer.customData[SKELETON_CUSTOM_DATA_KEY];
        layersData[editLayerName] = {
          layer,
          original: JSON.parse(JSON.stringify(skeletonData)),
          working: JSON.parse(JSON.stringify(skeletonData)),
          behaviors: null, // Will be created below
        };
      }

      if (Object.keys(layersData).length === 0) return;

      // Helper function to regenerate outline contours
      const regenerateOutline = (staticGlyph, skelData) => {
        const oldGeneratedIndices = skelData.generatedContourIndices || [];
        const sortedIndices = [...oldGeneratedIndices].sort((a, b) => b - a);
        for (const idx of sortedIndices) {
          if (idx < staticGlyph.path.numContours) {
            staticGlyph.path.deleteContour(idx);
          }
        }

        const generatedContours = generateContoursFromSkeleton(skelData);
        const newGeneratedIndices = [];
        for (const contour of generatedContours) {
          const newIndex = staticGlyph.path.numContours;
          staticGlyph.path.insertContour(staticGlyph.path.numContours, packContour(contour));
          newGeneratedIndices.push(newIndex);
        }
        skelData.generatedContourIndices = newGeneratedIndices;
      };

      // Track last used behavior name (based on shift + alt modifiers)
      let lastBehaviorName = getSkeletonBehaviorName(
        initialEvent.shiftKey,
        initialEvent.altKey
      );

      // Create initial behaviors for each layer
      for (const data of Object.values(layersData)) {
        data.behaviors = createSkeletonEditBehavior(
          data.original,
          selectedSkeletonPoints,
          lastBehaviorName
        );
      }

      // Accumulate changes (following Pen Tool pattern)
      let accumulatedChanges = new ChangeCollector();

      // Drag loop
      for await (const event of eventStream) {
        const currentLocalPoint = sceneController.localPoint(event);
        const currentGlyphPoint = {
          x: currentLocalPoint.x - positionedGlyph.x,
          y: currentLocalPoint.y - positionedGlyph.y,
        };

        const delta = vector.subVectors(currentGlyphPoint, startGlyphPoint);
        const behaviorName = getSkeletonBehaviorName(event.shiftKey, event.altKey);

        // Recreate behaviors if behavior changed (shift or alt state changed)
        if (behaviorName !== lastBehaviorName) {
          lastBehaviorName = behaviorName;
          for (const data of Object.values(layersData)) {
            data.behaviors = createSkeletonEditBehavior(
              data.original,
              selectedSkeletonPoints,
              behaviorName
            );
          }
        }

        const allChanges = [];

        // Apply changes to ALL editable layers
        for (const [editLayerName, data] of Object.entries(layersData)) {
          const { layer, original, working, behaviors } = data;

          // Reset working data to original before applying changes
          for (let ci = 0; ci < original.contours.length; ci++) {
            const origContour = original.contours[ci];
            const workContour = working.contours[ci];
            for (let pi = 0; pi < origContour.points.length; pi++) {
              workContour.points[pi].x = origContour.points[pi].x;
              workContour.points[pi].y = origContour.points[pi].y;
            }
          }

          // Apply behavior changes
          for (const behavior of behaviors) {
            const changes = behavior.applyDelta(delta);
            const contour = working.contours[behavior.contourIndex];
            for (const { pointIndex, x, y } of changes) {
              contour.points[pointIndex].x = x;
              contour.points[pointIndex].y = y;
            }
          }

          // Record changes for this layer
          // 1. FIRST: Generate outline contours
          const staticGlyph = layer.glyph;
          const pathChange = recordChanges(staticGlyph, (sg) => {
            regenerateOutline(sg, working);
          });
          allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

          // 2. THEN: Save skeletonData to customData
          const customDataChange = recordChanges(layer, (l) => {
            l.customData[SKELETON_CUSTOM_DATA_KEY] = JSON.parse(JSON.stringify(working));
          });
          allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
        }

        const combinedChange = new ChangeCollector().concat(...allChanges);
        // Accumulate changes for proper undo/redo
        accumulatedChanges = accumulatedChanges.concat(combinedChange);
        await sendIncrementalChange(combinedChange.change, true);
      }

      // Final send without "may drop" flag (required for proper undo)
      await sendIncrementalChange(accumulatedChanges.change);

      // Return accumulated changes
      return {
        changes: accumulatedChanges,
        undoLabel: translate("edit-tools-pointer.undo.move-skeleton-points"),
        broadcast: true,
      };
    });
  }

  /**
   * Handle dragging a rib point (width control point).
   * Constrains movement to the normal direction and updates point width.
   */
  async _handleDragRibPoint(eventStream, initialEvent, ribHit) {
    const sceneController = this.sceneController;
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();

    if (!positionedGlyph) return;

    // Get initial point in glyph coordinates
    const localPoint = sceneController.localPoint(initialEvent);
    const startGlyphPoint = {
      x: localPoint.x - positionedGlyph.x,
      y: localPoint.y - positionedGlyph.y,
    };

    // Check if point is in asymmetric mode (leftWidth and rightWidth exist AND are different)
    // Use first layer for check - all layers should have same structure
    const editLayerNameForCheck = sceneController.editingLayerNames?.[0];
    const layerForCheck = positionedGlyph?.varGlyph?.glyph?.layers?.[editLayerNameForCheck];
    const skeletonDataForCheck = layerForCheck?.customData?.[SKELETON_CUSTOM_DATA_KEY];
    const pointForCheck = skeletonDataForCheck?.contours?.[ribHit.contourIndex]?.points?.[ribHit.pointIndex];
    const isAsymmetric = pointForCheck?.leftWidth !== undefined &&
                         pointForCheck?.rightWidth !== undefined &&
                         pointForCheck.leftWidth !== pointForCheck.rightWidth;

    // Set selection based on mode
    const leftKey = `skeletonRibPoint/${ribHit.contourIndex}/${ribHit.pointIndex}/left`;
    const rightKey = `skeletonRibPoint/${ribHit.contourIndex}/${ribHit.pointIndex}/right`;
    if (isAsymmetric) {
      // Asymmetric mode: select only the dragged side
      const draggedKey = ribHit.side === "left" ? leftKey : rightKey;
      sceneController.selection = new Set([draggedKey]);
    } else {
      // Symmetric mode: select both sides
      sceneController.selection = new Set([leftKey, rightKey]);
    }

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      // Setup data for ALL editable layers (multi-source editing support)
      const layersData = {};
      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = layer.customData[SKELETON_CUSTOM_DATA_KEY];
        layersData[editLayerName] = {
          layer,
          original: JSON.parse(JSON.stringify(skeletonData)),
          working: JSON.parse(JSON.stringify(skeletonData)),
          ribBehavior: null, // Will be created below
        };
      }

      if (Object.keys(layersData).length === 0) return;

      // Create rib edit behavior for each layer
      for (const data of Object.values(layersData)) {
        data.ribBehavior = createRibEditBehavior(data.original, ribHit);
      }

      // Helper function to regenerate outline contours
      const regenerateOutline = (staticGlyph, skelData) => {
        const oldGeneratedIndices = skelData.generatedContourIndices || [];
        const sortedIndices = [...oldGeneratedIndices].sort((a, b) => b - a);
        for (const idx of sortedIndices) {
          if (idx < staticGlyph.path.numContours) {
            staticGlyph.path.deleteContour(idx);
          }
        }

        const generatedContours = generateContoursFromSkeleton(skelData);
        const newGeneratedIndices = [];
        for (const contour of generatedContours) {
          const newIndex = staticGlyph.path.numContours;
          staticGlyph.path.insertContour(staticGlyph.path.numContours, packContour(contour));
          newGeneratedIndices.push(newIndex);
        }
        skelData.generatedContourIndices = newGeneratedIndices;
      };

      let accumulatedChanges = new ChangeCollector();

      // Drag loop
      for await (const event of eventStream) {
        const currentLocalPoint = sceneController.localPoint(event);
        const currentGlyphPoint = {
          x: currentLocalPoint.x - positionedGlyph.x,
          y: currentLocalPoint.y - positionedGlyph.y,
        };

        const delta = vector.subVectors(currentGlyphPoint, startGlyphPoint);

        const allChanges = [];

        // Apply changes to ALL editable layers
        for (const [editLayerName, data] of Object.entries(layersData)) {
          const { layer, working, ribBehavior } = data;

          // Apply behavior to get new width (each layer has its own behavior based on its data)
          const widthChange = ribBehavior.applyDelta(delta);

          // Update working skeleton data with new width
          const contour = working.contours[widthChange.contourIndex];
          const point = contour.points[widthChange.pointIndex];

          if (isAsymmetric) {
            // Asymmetric mode: update only the dragged side
            if (ribHit.side === "left") {
              point.leftWidth = widthChange.halfWidth;
            } else {
              point.rightWidth = widthChange.halfWidth;
            }
            delete point.width;
          } else {
            // Symmetric mode: update width property (affects both sides)
            // The halfWidth from behavior is the new half-width, so full width = halfWidth * 2
            point.width = widthChange.halfWidth * 2;
            // Clear any asymmetric widths to ensure symmetric behavior
            delete point.leftWidth;
            delete point.rightWidth;
          }

          // Record changes for this layer
          // 1. FIRST: Generate outline contours
          const staticGlyph = layer.glyph;
          const pathChange = recordChanges(staticGlyph, (sg) => {
            regenerateOutline(sg, working);
          });
          allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

          // 2. THEN: Save skeletonData to customData
          const customDataChange = recordChanges(layer, (l) => {
            l.customData[SKELETON_CUSTOM_DATA_KEY] = JSON.parse(JSON.stringify(working));
          });
          allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
        }

        const combinedChange = new ChangeCollector().concat(...allChanges);
        accumulatedChanges = accumulatedChanges.concat(combinedChange);
        await sendIncrementalChange(combinedChange.change, true);
      }

      // Final send without "may drop" flag
      await sendIncrementalChange(accumulatedChanges.change);

      return {
        changes: accumulatedChanges,
        undoLabel: translate("edit-tools-pointer.undo.change-skeleton-width"),
        broadcast: true,
      };
    });
  }

  /**
   * Handle bounding box transforms (scale/rotate) for skeleton points only.
   */
  async _handleSkeletonBoundsTransform(selection, eventStream, initialEvent, rotation) {
    const sceneController = this.sceneController;
    const { skeletonPoint: skeletonPointSelection } = parseSelection(selection);

    if (!skeletonPointSelection?.size) return;

    const clickedHandle = sceneController.sceneModel.clickedTransformSelectionHandle;

    // Calculate origin (opposite corner from clicked handle)
    const [handlePositionY, handlePositionX] = clickedHandle.split("-");
    const origin = { x: handlePositionX, y: handlePositionY };
    if (handlePositionX === "left") origin.x = "right";
    else if (handlePositionX === "right") origin.x = "left";
    if (handlePositionY === "top") origin.y = "bottom";
    else if (handlePositionY === "bottom") origin.y = "top";

    const fixDragLeftValue = clickedHandle.includes("left") ? -1 : 1;
    const fixDragBottomValue = clickedHandle.includes("bottom") ? -1 : 1;

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const editLayerName = sceneController.editingLayerNames?.[0];
      if (!editLayerName || !glyph.layers[editLayerName]) return;

      const layer = glyph.layers[editLayerName];
      const originalSkeletonData = layer.customData?.[SKELETON_CUSTOM_DATA_KEY];
      if (!originalSkeletonData) return;

      const layerGlyph = layer.glyph;

      // Calculate bounds and pin point
      const bounds = getSkeletonSelectionBounds(selection, originalSkeletonData);
      if (!bounds) return;

      const pinPoint = getPinPoint(bounds, origin.x, origin.y);
      const selectionWidth = bounds.xMax - bounds.xMin;
      const selectionHeight = bounds.yMax - bounds.yMin;

      const initialPoint = sceneController.selectedGlyphPoint(initialEvent);

      // For rotation, we need a consistent pin point
      const rotationPinPoint = getPinPoint(bounds, origin.x, origin.y);
      const altRotationPinPoint = getPinPoint(bounds, undefined, undefined);

      let accumulatedChanges = new ChangeCollector();

      for await (const event of eventStream) {
        const currentPoint = sceneController.selectedGlyphPoint(event);

        // Calculate transformation
        let transformation;
        if (rotation) {
          sceneController.sceneModel.showTransformSelection = false;
          const usePinPoint = event.altKey ? altRotationPinPoint : rotationPinPoint;
          const angle = Math.atan2(
            usePinPoint.y - currentPoint.y,
            usePinPoint.x - currentPoint.x
          );
          const angleInitial = Math.atan2(
            usePinPoint.y - initialPoint.y,
            usePinPoint.x - initialPoint.x
          );
          const rotationAngle = !event.shiftKey
            ? angle - angleInitial
            : Math.round((angle - angleInitial) / (Math.PI / 4)) * (Math.PI / 4);
          transformation = new Transform().rotate(rotationAngle);
        } else {
          // Scale
          const delta = {
            x: (currentPoint.x - initialPoint.x) * fixDragLeftValue,
            y: (currentPoint.y - initialPoint.y) * fixDragBottomValue,
          };

          let scaleX = selectionWidth > 0 ? (selectionWidth + delta.x) / selectionWidth : 1;
          let scaleY = selectionHeight > 0 ? (selectionHeight + delta.y) / selectionHeight : 1;

          if (clickedHandle.includes("middle")) {
            scaleY = event.shiftKey ? scaleX : 1;
          } else if (clickedHandle.includes("center")) {
            scaleX = event.shiftKey ? scaleY : 1;
          } else if (event.shiftKey) {
            scaleX = scaleY = Math.max(scaleX, scaleY);
          }
          transformation = new Transform().scale(scaleX, scaleY);
        }

        const usePinPoint = event.altKey
          ? getPinPoint(bounds, undefined, undefined)
          : pinPoint;

        const pinnedTransformation = new Transform()
          .translate(usePinPoint.x, usePinPoint.y)
          .transform(transformation)
          .translate(-usePinPoint.x, -usePinPoint.y);

        // Deep clone original skeleton data and apply transform
        const workingSkeletonData = JSON.parse(JSON.stringify(originalSkeletonData));
        transformSkeletonPoints(workingSkeletonData, skeletonPointSelection, pinnedTransformation);

        // Regenerate outline
        const regenerateOutline = (staticGlyph, skelData) => {
          const oldGeneratedIndices = skelData.generatedContourIndices || [];
          const sortedIndices = [...oldGeneratedIndices].sort((a, b) => b - a);
          for (const idx of sortedIndices) {
            if (idx < staticGlyph.path.numContours) {
              staticGlyph.path.deleteContour(idx);
            }
          }

          const generatedContours = generateContoursFromSkeleton(skelData);
          const newGeneratedIndices = [];
          for (const contour of generatedContours) {
            const newIndex = staticGlyph.path.numContours;
            staticGlyph.path.insertContour(staticGlyph.path.numContours, packContour(contour));
            newGeneratedIndices.push(newIndex);
          }
          skelData.generatedContourIndices = newGeneratedIndices;
        };

        // Record changes
        const changes = [];

        const pathChange = recordChanges(layerGlyph, (sg) => {
          regenerateOutline(sg, workingSkeletonData);
        });
        changes.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        const customDataChange = recordChanges(layer, (l) => {
          l.customData[SKELETON_CUSTOM_DATA_KEY] = workingSkeletonData;
        });
        changes.push(customDataChange.prefixed(["layers", editLayerName]));

        const combinedChange = new ChangeCollector().concat(...changes);
        accumulatedChanges = accumulatedChanges.concat(combinedChange);
        await sendIncrementalChange(combinedChange.change, true);
      }

      // Final send without "may drop" flag
      await sendIncrementalChange(accumulatedChanges.change);

      return {
        changes: accumulatedChanges,
        undoLabel: rotation
          ? translate("edit-tools-pointer.undo.rotate-skeleton")
          : translate("edit-tools-pointer.undo.scale-skeleton"),
        broadcast: true,
      };
    });
  }

  async handleBoundsTransformSelection(
    selection,
    eventStream,
    initialEvent,
    rotation = false
  ) {
    const sceneController = this.sceneController;

    // Check selection type - skeleton transforms are handled separately
    const selectionType = getSelectionType(selection);
    if (selectionType === "mixed") {
      // Should not happen (no bounding box for mixed), but safety check
      return;
    }
    if (selectionType === "skeleton") {
      await this._handleSkeletonBoundsTransform(
        selection,
        eventStream,
        initialEvent,
        rotation
      );
      return;
    }

    const clickedHandle = sceneController.sceneModel.clickedTransformSelectionHandle;

    // The following may seem wrong, but it's correct, because we say
    // for example bottom-left and not left-bottom. Y-X order.
    const [handlePositionY, handlePositionX] = clickedHandle.split("-");

    const origin = { x: handlePositionX, y: handlePositionY };
    // origin must be the opposite side of where we have our mouse
    if (handlePositionX === "left") {
      origin.x = "right";
    } else if (handlePositionX === "right") {
      origin.x = "left";
    }
    if (handlePositionY === "top") {
      origin.y = "bottom";
    } else if (handlePositionY === "bottom") {
      origin.y = "top";
    }
    // no else because could be middle or center

    // must be set to the opposite side of the mouse if left or bottom
    const fixDragLeftValue = clickedHandle.includes("left") ? -1 : 1;
    const fixDragBottomValue = clickedHandle.includes("bottom") ? -1 : 1;

    const glyphController =
      await sceneController.sceneModel.getSelectedStaticGlyphController();

    // The following is only needed in case of rotation, because we want to have
    // the roation angle for all layers the same and not different.
    let regularPinPointSelectedLayer, altPinPointSelectedLayer;
    if (rotation) {
      const selectedLayerBounds = glyphController.getSelectionBounds(
        selection,
        this.editor.fontController.getBackgroundImageBoundsFunc
      );
      regularPinPointSelectedLayer = getPinPoint(
        selectedLayerBounds,
        origin.x,
        origin.y
      );
      altPinPointSelectedLayer = getPinPoint(selectedLayerBounds, undefined, undefined);
    }

    const staticGlyphControllers = await sceneController.getStaticGlyphControllers();

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const initialPoint = sceneController.selectedGlyphPoint(initialEvent);

      const layerInfo = Object.entries(
        sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      ).map(([layerName, layerGlyph]) => {
        const behaviorFactory = new EditBehaviorFactory(
          layerGlyph,
          sceneController.selection,
          this.scalingEditBehavior
        );
        const layerBounds = (
          staticGlyphControllers[layerName] || glyphController
        ).getSelectionBounds(
          selection,
          this.editor.fontController.getBackgroundImageBoundsFunc
        );

        return {
          layerName,
          changePath: ["layers", layerName, "glyph"],
          layerGlyph: layerGlyph,
          editBehavior: behaviorFactory.getTransformBehavior("default"),
          regularPinPoint: getPinPoint(layerBounds, origin.x, origin.y),
          altPinPoint: getPinPoint(layerBounds, undefined, undefined),
          regularPinPointSelectedLayer: regularPinPointSelectedLayer,
          altPinPointSelectedLayer: altPinPointSelectedLayer,
          selectionWidth: layerBounds.xMax - layerBounds.xMin,
          selectionHeight: layerBounds.yMax - layerBounds.yMin,
        };
      });

      let editChange;
      for await (const event of eventStream) {
        const currentPoint = sceneController.selectedGlyphPoint(event);

        const deepEditChanges = [];
        for (const layer of layerInfo) {
          const layerGlyph = layer.layerGlyph;
          const pinPoint = event.altKey ? layer.altPinPoint : layer.regularPinPoint;
          let transformation;
          if (rotation) {
            // Rotate (based on pinPoint of selected layer)
            this.sceneController.sceneModel.showTransformSelection = false;
            const pinPointSelectedLayer = event.altKey
              ? layer.altPinPointSelectedLayer
              : layer.regularPinPointSelectedLayer;
            const angle = Math.atan2(
              pinPointSelectedLayer.y - currentPoint.y,
              pinPointSelectedLayer.x - currentPoint.x
            );
            const angleInitial = Math.atan2(
              pinPointSelectedLayer.y - initialPoint.y,
              pinPointSelectedLayer.x - initialPoint.x
            );
            // Snap to 45 degrees by rounding to the nearest 45 degree angle if shift is pressed
            const rotationAngle = !event.shiftKey
              ? angle - angleInitial
              : Math.round((angle - angleInitial) / (Math.PI / 4)) * (Math.PI / 4);
            transformation = new Transform().rotate(rotationAngle);
          } else {
            // Scale (based on pinPoint)
            const delta = {
              x: (currentPoint.x - initialPoint.x) * fixDragLeftValue,
              y: (currentPoint.y - initialPoint.y) * fixDragBottomValue,
            };

            let scaleX = (layer.selectionWidth + delta.x) / layer.selectionWidth;
            let scaleY = (layer.selectionHeight + delta.y) / layer.selectionHeight;

            if (clickedHandle.includes("middle")) {
              scaleY = event.shiftKey ? scaleX : 1;
            } else if (clickedHandle.includes("center")) {
              scaleX = event.shiftKey ? scaleY : 1;
            } else if (event.shiftKey) {
              scaleX = scaleY = Math.max(scaleX, scaleY);
            }
            transformation = new Transform().scale(scaleX, scaleY);
          }

          const pinnedTransformation = new Transform()
            .translate(pinPoint.x, pinPoint.y)
            .transform(transformation)
            .translate(-pinPoint.x, -pinPoint.y);

          const editChange =
            layer.editBehavior.makeChangeForTransformation(pinnedTransformation);

          applyChange(layerGlyph, editChange);
          deepEditChanges.push(consolidateChanges(editChange, layer.changePath));
        }

        editChange = consolidateChanges(deepEditChanges);
        await sendIncrementalChange(editChange, true); // true: "may drop"
      }

      let changes = ChangeCollector.fromChanges(
        editChange,
        consolidateChanges(
          layerInfo.map((layer) =>
            consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
          )
        )
      );

      return {
        undoLabel: rotation
          ? translate("edit-tools-pointer.undo.rotate-selection")
          : translate("edit-tools-pointer.undo.resize-selection"),
        changes: changes,
        broadcast: true,
      };
    });
  }

  getRotationHandle(event, selection) {
    return this.getTransformSelectionHandle(event, selection, true);
  }

  getResizeHandle(event, selection) {
    return this.getTransformSelectionHandle(event, selection);
  }

  getTransformSelectionHandle(event, selection, rotation = false) {
    if (!this.editor.visualizationLayersSettings.model["fontra.transform.selection"]) {
      return undefined;
    }
    if (!selection.size) {
      return undefined;
    }
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    const glyph = positionedGlyph?.glyph;
    if (!glyph) {
      return undefined;
    }

    // Get skeleton data for bounds calculation
    const layer = positionedGlyph?.varGlyph?.glyph?.layers?.[
      this.sceneController.editingLayerNames?.[0]
    ];
    const skeletonData = layer?.customData?.[SKELETON_CUSTOM_DATA_KEY];

    const bounds = getTransformSelectionBounds(
      glyph,
      selection,
      this.editor.fontController.getBackgroundImageBoundsFunc,
      skeletonData
    );
    // bounds can be undefined if for example only one point is selected or mixed selection
    if (!bounds) {
      return undefined;
    }

    const handleSize =
      transformHandleSize * this.editor.visualizationLayers.scaleFactor;
    const handleMargin =
      transformHandleMargin * this.editor.visualizationLayers.scaleFactor;

    const point = this.sceneController.selectedGlyphPoint(event);
    const resizeHandles = getTransformHandles(bounds, handleMargin + handleSize / 2);
    const rotationHandles = rotation
      ? getTransformHandles(
          bounds,
          handleMargin + (handleSize * rotationHandleSizeFactor) / 2 + handleSize / 2
        )
      : {};
    for (const [handleName, handle] of Object.entries(resizeHandles)) {
      const inCircle = pointInCircleHandle(point, handle, handleSize);
      if (rotation) {
        const inSquare = pointInSquareHandle(
          point,
          rotationHandles[handleName],
          handleSize * rotationHandleSizeFactor
        );
        if (inSquare && !inCircle) {
          return handleName;
        }
      } else {
        if (inCircle) {
          return handleName;
        }
      }
    }
    return undefined;
  }

  /**
   * Hit test skeleton rib points (width control points).
   * Returns { contourIndex, pointIndex, side, point, normal, onCurvePoint } if hit, null otherwise.
   */
  _hitTestRibPoints(event) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph?.glyph?.canEdit) {
      return null;
    }

    const varGlyph = positionedGlyph.varGlyph;
    if (!varGlyph?.glyph?.layers) {
      return null;
    }

    const editLayerName = this.sceneController.editingLayerNames?.[0];
    if (!editLayerName) {
      return null;
    }

    const layer = varGlyph.glyph.layers[editLayerName];
    if (!layer) {
      return null;
    }

    const skeletonData = layer.customData?.[SKELETON_CUSTOM_DATA_KEY];
    if (!skeletonData?.contours?.length) {
      return null;
    }

    const localPoint = this.sceneController.localPoint(event);
    const glyphPoint = {
      x: localPoint.x - positionedGlyph.x,
      y: localPoint.y - positionedGlyph.y,
    };

    const margin = this.sceneController.mouseClickMargin;

    for (let contourIndex = 0; contourIndex < skeletonData.contours.length; contourIndex++) {
      const contour = skeletonData.contours[contourIndex];
      const defaultWidth = contour.defaultWidth || 20;

      for (let pointIndex = 0; pointIndex < contour.points.length; pointIndex++) {
        const skeletonPoint = contour.points[pointIndex];

        // Only test on-curve points
        if (skeletonPoint.type) continue;

        const normal = calculateNormalAtSkeletonPoint(contour, pointIndex);
        const leftHW = getPointHalfWidth(skeletonPoint, defaultWidth, "left");
        const rightHW = getPointHalfWidth(skeletonPoint, defaultWidth, "right");

        // Calculate rib point positions
        const leftRibPoint = {
          x: skeletonPoint.x + normal.x * leftHW,
          y: skeletonPoint.y + normal.y * leftHW,
        };
        const rightRibPoint = {
          x: skeletonPoint.x - normal.x * rightHW,
          y: skeletonPoint.y - normal.y * rightHW,
        };

        // Check left rib point
        const leftDist = vector.distance(glyphPoint, leftRibPoint);
        if (leftDist <= margin) {
          return {
            contourIndex,
            pointIndex,
            side: "left",
            point: leftRibPoint,
            normal,
            onCurvePoint: skeletonPoint,
          };
        }

        // Check right rib point
        const rightDist = vector.distance(glyphPoint, rightRibPoint);
        if (rightDist <= margin) {
          return {
            contourIndex,
            pointIndex,
            side: "right",
            point: rightRibPoint,
            normal,
            onCurvePoint: skeletonPoint,
          };
        }
      }
    }

    return null;
  }

  get scalingEditBehavior() {
    return false;
  }

  activate() {
    super.activate();
    this.sceneController.sceneModel.showTransformSelection = true;
    this.canvasController.requestUpdate();
  }

  deactivate() {
    super.deactivate();
    this.sceneController.sceneModel.showTransformSelection = false;
    this.canvasController.requestUpdate();
  }
}

function pointInSquareHandle(point, handle, handleSize) {
  const selRect = centeredRect(handle.x, handle.y, handleSize);
  return pointInRect(point.x, point.y, selRect);
}

function pointInCircleHandle(point, handle, handleSize) {
  return vector.distance(handle, point) <= handleSize / 2;
}

function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}

function replace(setA, setB) {
  return setB;
}

function getSelectModeFunction(event) {
  return event.shiftKey
    ? event[commandKeyProperty]
      ? difference
      : symmetricDifference
    : event[commandKeyProperty]
    ? union
    : replace;
}

registerVisualizationLayerDefinition({
  identifier: "fontra.transform.selection",
  name: "edit-tools-pointer.transform.selection",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 400,
  screenParameters: {
    strokeWidth: 1,
    lineDash: [2, 4],
    handleSize: transformHandleSize,
    hoverStrokeOffset: 4,
    margin: transformHandleMargin,
  },

  colors: { handleColor: "#BBB", strokeColor: "#DDD" },
  colorsDarkMode: { handleColor: "#777", strokeColor: "#555" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    if (!model.showTransformSelection) {
      return;
    }
    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, model);
    const transformBounds = getTransformSelectionBounds(
      positionedGlyph.glyph,
      model.selection,
      model.fontController.getBackgroundImageBoundsFunc,
      skeletonData
    );
    if (!transformBounds) {
      return;
    }

    context.strokeStyle = parameters.handleColor;
    context.lineWidth = parameters.strokeWidth;

    // The following code is helpful for designing/adjusting the invisible rotation handle areas
    // draw rotation handles
    // const rotationHandles = getTransformHandles(transformBounds, parameters.margin + parameters.handleSize * rotationHandleSizeFactor / 2 + parameters.handleSize / 2);
    // for (const [handleName, handle] of Object.entries(rotationHandles)) {
    //   strokeSquareNode(context, handle, parameters.handleSize * rotationHandleSizeFactor);
    // }

    // draw resize handles
    const handles = getTransformHandles(
      transformBounds,
      parameters.margin + parameters.handleSize / 2
    );
    for (const [handleName, handle] of Object.entries(handles)) {
      strokeRoundNode(context, handle, parameters.handleSize);
    }

    // draw resize handles hover
    if (!model.clickedTransformSelectionHandle && handles[model.hoverResizeHandle]) {
      strokeRoundNode(
        context,
        handles[model.hoverResizeHandle],
        parameters.handleSize + parameters.hoverStrokeOffset
      );
    }

    // because of the dashed line draw resize bounding box last
    context.strokeStyle = parameters.strokeColor;
    context.setLineDash(parameters.lineDash);
    context.strokeRect(
      transformBounds.xMin,
      transformBounds.yMin,
      transformBounds.xMax - transformBounds.xMin,
      transformBounds.yMax - transformBounds.yMin
    );
  },
});

export class PointerToolScale extends PointerTool {
  iconPath = "/images/pointerscale.svg";
  identifier = "pointer-tool-scale";

  get scalingEditBehavior() {
    return true;
  }
}

function getTransformHandles(transformBounds, margin) {
  const { width, height } = rectSize(transformBounds);

  const [x, y, w, h] = [
    transformBounds.xMin - margin,
    transformBounds.yMin - margin,
    transformBounds.xMax - transformBounds.xMin + margin * 2,
    transformBounds.yMax - transformBounds.yMin + margin * 2,
  ];

  const handles = {
    "bottom-left": { x: x, y: y },
    "bottom-center": { x: x + w / 2, y: y },
    "bottom-right": { x: x + w, y: y },
    "top-left": { x: x, y: y + h },
    "top-center": { x: x + w / 2, y: y + h },
    "top-right": { x: x + w, y: y + h },
    "middle-left": { x: x, y: y + h / 2 },
    "middle-right": { x: x + w, y: y + h / 2 },
  };

  if (width != 0 && height != 0) {
    return handles;
  }

  for (const handleName of Object.keys(handles)) {
    if (width == 0 && handleName != "top-center" && handleName != "bottom-center") {
      delete handles[handleName];
    }
    if (height == 0 && handleName != "middle-left" && handleName != "middle-right") {
      delete handles[handleName];
    }
  }

  return handles;
}

/**
 * Determine the type of selection for bounding box purposes.
 * @returns "regular" | "skeleton" | "mixed" | "none"
 */
function getSelectionType(selection) {
  const {
    point,
    component,
    anchor,
    backgroundImage,
    guideline,
    skeletonPoint,
  } = parseSelection(selection);

  const hasRegular =
    point?.length > 0 ||
    component?.length > 0 ||
    anchor?.length > 0 ||
    backgroundImage?.length > 0 ||
    guideline?.length > 0;
  const hasSkeleton = skeletonPoint?.size > 0;

  if (hasRegular && hasSkeleton) return "mixed"; // NO bounding box
  if (hasSkeleton) return "skeleton";
  if (hasRegular) return "regular";
  return "none";
}

/**
 * Transform selected skeleton points (and their handles) by applying a transformation matrix.
 */
function transformSkeletonPoints(skeletonData, skeletonPointSelection, transform) {
  // Collect all points to transform (on-curves + their handles)
  const pointsToTransform = new Set();

  for (const selKey of skeletonPointSelection) {
    const [contourIdx, pointIdx] = selKey.split("/").map(Number);
    const contour = skeletonData.contours[contourIdx];
    if (!contour) continue;

    const numPoints = contour.points.length;

    // Add the on-curve point
    pointsToTransform.add(`${contourIdx}/${pointIdx}`);

    // Add adjacent handles
    const prevIdx = (pointIdx - 1 + numPoints) % numPoints;
    const nextIdx = (pointIdx + 1) % numPoints;

    if (contour.points[prevIdx]?.type === "cubic") {
      pointsToTransform.add(`${contourIdx}/${prevIdx}`);
    }
    if (contour.points[nextIdx]?.type === "cubic") {
      pointsToTransform.add(`${contourIdx}/${nextIdx}`);
    }
  }

  // Transform all collected points
  for (const key of pointsToTransform) {
    const [contourIdx, pointIdx] = key.split("/").map(Number);
    const point = skeletonData.contours[contourIdx]?.points[pointIdx];
    if (point) {
      const [newX, newY] = transform.transformPoint(point.x, point.y);
      point.x = newX;
      point.y = newY;
    }
  }
}

/**
 * Calculate bounds for selected skeleton points only.
 */
function getSkeletonSelectionBounds(selection, skeletonData) {
  const { skeletonPoint: skeletonPointSelection } = parseSelection(selection);
  if (!skeletonPointSelection?.size || !skeletonData?.contours) {
    return null;
  }

  let xMin = Infinity,
    yMin = Infinity,
    xMax = -Infinity,
    yMax = -Infinity;

  for (const selKey of skeletonPointSelection) {
    const [contourIdx, pointIdx] = selKey.split("/").map(Number);
    const point = skeletonData.contours[contourIdx]?.points[pointIdx];
    if (point) {
      xMin = Math.min(xMin, point.x);
      yMin = Math.min(yMin, point.y);
      xMax = Math.max(xMax, point.x);
      yMax = Math.max(yMax, point.y);
    }
  }

  if (xMin === Infinity) return null;
  return { xMin, yMin, xMax, yMax };
}

function getTransformSelectionBounds(
  glyph,
  selection,
  getBackgroundImageBoundsFunc,
  skeletonData
) {
  const selectionType = getSelectionType(selection);

  // No bounding box for mixed selection
  if (selectionType === "mixed") {
    return undefined;
  }

  // Skeleton-only selection
  if (selectionType === "skeleton") {
    const skeletonBounds = getSkeletonSelectionBounds(selection, skeletonData);
    if (!skeletonBounds) return undefined;
    const { xMin, yMin, xMax, yMax } = skeletonBounds;
    const width = xMax - xMin;
    const height = yMax - yMin;
    if (width == 0 && height == 0) return undefined;
    return skeletonBounds;
  }

  // Regular selection - existing logic
  if (selection.size == 1 && parseSelection(selection).point?.length == 1) {
    // Return if only a single point is selected, as in that case the "selection bounds"
    // is not really useful for the user, and is distracting instead.
    return undefined;
  }
  const selectionBounds = glyph.getSelectionBounds(
    selection,
    getBackgroundImageBoundsFunc
  );
  if (!selectionBounds) {
    return undefined;
  }
  const { width, height } = rectSize(selectionBounds);
  if (width == 0 && height == 0) {
    // return undefined if for example only one point is selected
    return undefined;
  }

  return selectionBounds;
}
