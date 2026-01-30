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
  RibEditBehavior,
  createEditableRibBehavior,
  EditableRibBehavior,
  createInterpolatingRibBehavior,
  createEditableHandleBehavior,
  EditableHandleBehavior,
} from "./skeleton-edit-behavior.js";
import { getSkeletonDataFromGlyph } from "./skeleton-visualization-layers.js";
import {
  skeletonTunniHitTest,
  calculateSkeletonControlPointsFromTunniDelta,
  calculateSkeletonOnCurveFromTunni,
  calculateSkeletonEqualizedControlPoints,
  areSkeletonTensionsEqualized,
  calculateSkeletonTunniPoint,
  calculateSkeletonTrueTunniPoint,
} from "./skeleton-tunni-calculations.js";
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

  // Measure mode (Q-key) properties
  measureMode = false;
  _boundKeyUp = null;

  // Equalize handles mode (X-key) properties
  equalizeMode = false;
  _boundEqualizeKeyUp = null;

  handleKeyDown(event) {
    if (event.key === "q" || event.key === "Q") {
      if (!this.measureMode) {
        this.measureMode = true;
        this.sceneModel.measureMode = true;
        this.sceneModel.measureShowDirect = event.altKey;
        this._boundKeyUp = (e) => this._handleMeasureKeyUp(e);
        window.addEventListener("keyup", this._boundKeyUp);
        this.canvasController.requestUpdate();
      }
      return;
    }
    if (event.key === "x" || event.key === "X") {
      if (!this.equalizeMode) {
        this.equalizeMode = true;
        this._boundEqualizeKeyUp = (e) => this._handleEqualizeKeyUp(e);
        window.addEventListener("keyup", this._boundEqualizeKeyUp);
      }
      return;
    }
  }

  _handleMeasureKeyUp(event) {
    if (event.key === "q" || event.key === "Q") {
      this.measureMode = false;
      this.sceneModel.measureMode = false;
      this.sceneModel.measureHoverSegment = null;
      this.sceneModel.measureSelectedPoints = [];
      this.sceneModel.measureClickDirect = false;
      if (this._boundKeyUp) {
        window.removeEventListener("keyup", this._boundKeyUp);
        this._boundKeyUp = null;
      }
      this.canvasController.requestUpdate();
    }
  }

  _handleEqualizeKeyUp(event) {
    if (event.key === "x" || event.key === "X") {
      this.equalizeMode = false;
      if (this._boundEqualizeKeyUp) {
        window.removeEventListener("keyup", this._boundEqualizeKeyUp);
        this._boundEqualizeKeyUp = null;
      }
    }
  }

  handleHover(event) {
    const sceneController = this.sceneController;
    const point = sceneController.localPoint(event);
    const size = sceneController.mouseClickMargin;

    // Q-mode: find segment under cursor for measurement
    if (this.measureMode) {
      this.sceneModel.measureShowDirect = event.altKey;
      const segmentHit = this._findSegmentForMeasure(point, size);
      if (
        !this._segmentsEqual(segmentHit, this.sceneModel.measureHoverSegment)
      ) {
        this.sceneModel.measureHoverSegment = segmentHit;
        this.canvasController.requestUpdate();
      }
      return; // Don't do normal hover in measure mode
    }

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
    // Check for skeleton Tunni point hover
    let isHoveringSkeletonTunni = false;
    let skeletonTunniType = null;
    const isSkeletonTunniLayerActive =
      this.editor?.visualizationLayersSettings?.model?.["fontra.skeleton.tunni"];
    if (isSkeletonTunniLayerActive) {
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph) {
        const glyphPoint = {
          x: point.x - positionedGlyph.x,
          y: point.y - positionedGlyph.y,
        };
        const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, this.sceneModel);
        if (skeletonData) {
          const tunniHit = skeletonTunniHitTest(glyphPoint, size, skeletonData);
          if (tunniHit) {
            isHoveringSkeletonTunni = true;
            skeletonTunniType = tunniHit.type;
          }
        }
      }
    }

    if (rotationHandle) {
      this.setCursorForRotationHandle(rotationHandle);
    } else if (resizeHandle) {
      this.setCursorForResizeHandle(resizeHandle);
    } else if (isHoveringSkeletonTunni) {
      // Use different cursors for different Tunni point types
      this.canvasController.canvas.style.cursor =
        skeletonTunniType === "true-tunni" ? "crosshair" : "pointer";
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

    // Check if we have skeleton points and/or regular points selected
    const { skeletonPoint: skeletonPointSelection, point: regularPointSelection } =
      parseSelection(sceneController.selection);

    const hasSkeletonPoints = skeletonPointSelection?.size > 0;
    const hasRegularPoints = regularPointSelection?.length > 0;

    // X+arrows: equalize handles for selected off-curve skeleton points
    if (this.equalizeMode && hasSkeletonPoints) {
      await this._equalizeSelectedSkeletonHandles(skeletonPointSelection);
      return;
    }

    if (!hasSkeletonPoints) {
      // No skeleton points - use default handler
      return sceneController.handleArrowKeys(event);
    }

    // Handle skeleton point nudging (combined with regular points in one editGlyph)
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

      const allChanges = [];
      const regularRollbackParts = [];

      // 1. Regular point nudging (if any regular points selected)
      if (hasRegularPoints) {
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
            editBehavior: behaviorFactory.getBehavior(
              event.altKey ? "alternate" : "default"
            ),
          };
        });

        for (const { layerGlyph, changePath, editBehavior } of layerInfo) {
          const editChange = editBehavior.makeChangeForDelta(delta);
          applyChange(layerGlyph, editChange);
          allChanges.push(consolidateChanges(editChange, changePath));
          regularRollbackParts.push(
            consolidateChanges(editBehavior.rollbackChange, changePath)
          );
        }
      }

      // 2. Update skeleton outline contours (in-place to preserve path structure)
      const staticGlyph = layer.glyph;
      const generatedContours = generateContoursFromSkeleton(workingSkeletonData);
      const oldGeneratedIndices = workingSkeletonData.generatedContourIndices || [];

      let canUpdateInPlace = oldGeneratedIndices.length === generatedContours.length;
      const inPlaceUpdates = [];
      if (canUpdateInPlace) {
        for (let i = 0; i < oldGeneratedIndices.length; i++) {
          const contourIdx = oldGeneratedIndices[i];
          if (contourIdx >= staticGlyph.path.numContours) {
            canUpdateInPlace = false;
            break;
          }
          const startPt = contourIdx === 0
            ? 0
            : staticGlyph.path.contourInfo[contourIdx - 1].endPoint + 1;
          const endPt = staticGlyph.path.contourInfo[contourIdx].endPoint;
          const numExistingPts = endPt - startPt + 1;
          const packed = packContour(generatedContours[i]);
          const numNewPts = packed.coordinates.length / 2;
          if (numExistingPts !== numNewPts) {
            canUpdateInPlace = false;
            break;
          }
          inPlaceUpdates.push({ startPt, packed });
        }
      }

      const pathChange = recordChanges(staticGlyph, (sg) => {
        if (canUpdateInPlace) {
          for (const { startPt, packed } of inPlaceUpdates) {
            const numPts = packed.coordinates.length / 2;
            for (let pi = 0; pi < numPts; pi++) {
              sg.path.setPointPosition(
                startPt + pi,
                packed.coordinates[pi * 2],
                packed.coordinates[pi * 2 + 1]
              );
            }
          }
        } else {
          const sortedIndices = [...oldGeneratedIndices].sort((a, b) => b - a);
          for (const idx of sortedIndices) {
            if (idx < sg.path.numContours) {
              sg.path.deleteContour(idx);
            }
          }
          const newGeneratedIndices = [];
          for (const contour of generatedContours) {
            const newIndex = sg.path.numContours;
            sg.path.insertContour(sg.path.numContours, packContour(contour));
            newGeneratedIndices.push(newIndex);
          }
          workingSkeletonData.generatedContourIndices = newGeneratedIndices;
        }
      });
      allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]).change);

      // 3. Save skeletonData to customData
      const customDataChange = recordChanges(layer, (l) => {
        l.customData[SKELETON_CUSTOM_DATA_KEY] = workingSkeletonData;
      });
      allChanges.push(customDataChange.prefixed(["layers", editLayerName]).change);

      const editChange = consolidateChanges(allChanges);
      await sendIncrementalChange(editChange);

      const rollbackParts = [
        ...regularRollbackParts,
        pathChange.prefixed(["layers", editLayerName, "glyph"]).rollbackChange,
        customDataChange.prefixed(["layers", editLayerName]).rollbackChange,
      ];

      return {
        changes: ChangeCollector.fromChanges(editChange, consolidateChanges(rollbackParts)),
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
    // Handle measure mode (Q-key) clicks
    if (this.measureMode) {
      await this._handleMeasureClick(initialEvent);
      initialEvent.preventDefault();
      return;
    }

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
    let { selection, pathHit } = this.sceneModel.selectionAtPoint(
      point,
      size,
      sceneController.selection,
      sceneController.hoverSelection,
      initialEvent.altKey
    );

    // Convert skeleton segment selection to on-curve point selection immediately
    // (consistent with regular path segments selecting their on-curve points)
    // But preserve original selection for double-click handling
    const originalSelection = selection;
    const { skeletonSegment: clickedSegment } = parseSelection(selection);
    if (clickedSegment?.size) {
      const onCurvePoints = this._getSegmentOnCurvePoints(clickedSegment);
      // Replace skeletonSegment with skeletonPoint in selection
      selection = new Set(
        [...selection].filter((s) => !s.startsWith("skeletonSegment/"))
      );
      for (const pt of onCurvePoints) {
        selection.add(`skeletonPoint/${pt}`);
      }
    }

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

    // Check for skeleton Tunni point hit
    const isSkeletonTunniLayerActive =
      this.editor?.visualizationLayersSettings?.model?.["fontra.skeleton.tunni"];

    // Ctrl+Shift+click: equalize tensions (works even without Tunni layer visible)
    // Only for midpoint Tunni, not for true Tunni (intersection)
    if (initialEvent.ctrlKey && initialEvent.shiftKey) {
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph) {
        const glyphPoint = {
          x: point.x - positionedGlyph.x,
          y: point.y - positionedGlyph.y,
        };
        const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, this.sceneModel);
        if (skeletonData) {
          // Use larger hit margin and search only midpoint Tunni for equalize
          const tunniHit = skeletonTunniHitTest(glyphPoint, size * 2, skeletonData, {
            midpointOnly: true,
          });
          if (tunniHit) {
            await this._equalizeSkeletonTunniTensions(tunniHit);
            initialEvent.preventDefault();
            eventStream.done();
            return;
          }
        }
      }
    }

    // X+drag: equalize skeleton handles in real-time while dragging
    if (this.equalizeMode && hasSkeletonPointUnderCursor) {
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph) {
        const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, this.sceneModel);
        if (skeletonData) {
          // Get clicked skeleton point
          const firstKey = clickedSkeletonPoint.values().next().value;
          const [contourIdx, pointIdx] = firstKey.split("/").map(Number);
          const contour = skeletonData.contours[contourIdx];
          const clickedPt = contour?.points[pointIdx];

          // Only works on off-curve points (type === "cubic")
          if (clickedPt?.type === "cubic") {
            await this._handleEqualizeHandlesDrag(
              eventStream,
              initialEvent,
              contourIdx,
              pointIdx,
              skeletonData,
              positionedGlyph
            );
            initialEvent.preventDefault();
            return;
          }
        }
      }
    }

    // Regular Tunni point drag (requires layer to be visible)
    if (isSkeletonTunniLayerActive && !hasSkeletonPointUnderCursor) {
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph) {
        const glyphPoint = {
          x: point.x - positionedGlyph.x,
          y: point.y - positionedGlyph.y,
        };
        const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, this.sceneModel);
        if (skeletonData) {
          const tunniHit = skeletonTunniHitTest(glyphPoint, size, skeletonData);
          if (tunniHit) {
            await this._handleSkeletonTunniDrag(eventStream, initialEvent, tunniHit);
            initialEvent.preventDefault();
            return;
          }
        }
      }
    }

    let initialClickedPointIndex;
    let initialClickedSkeletonPoint;
    if (!pathHit) {
      const { point: pointIndices, skeletonPoint: skeletonPoints } = parseSelection(selection);
      if (pointIndices?.length) {
        initialClickedPointIndex = pointIndices[0];
      }
      if (skeletonPoints?.size) {
        // Get first skeleton point coordinates
        const firstKey = skeletonPoints.values().next().value;
        const [contourIdx, pointIdx] = firstKey.split("/").map(Number);
        initialClickedSkeletonPoint = { contourIdx, pointIdx };
      }
    }
    if (initialEvent.detail == 2 || initialEvent.myTapCount == 2) {
      initialEvent.preventDefault(); // don't let our dbl click propagate to other elements
      eventStream.done();
      // Use originalSelection to preserve skeletonSegment for double-click handling
      await this.handleDoubleClick(originalSelection, point, initialEvent);
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
      this.sceneController.sceneModel.initialClickedSkeletonPoint =
        initialClickedSkeletonPoint;
      const result = await this.handleDragSelection(eventStream, initialEvent);
      delete this.sceneController.sceneModel.initialClickedPointIndex;
      delete this.sceneController.sceneModel.initialClickedSkeletonPoint;
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

    // Check if any selected points are editable generated points
    // If so, redirect to dedicated handler
    if (pointSelection?.length > 0) {
      const editableGenerated = this._getEditableGeneratedPointsFromSelection(pointSelection);
      if (editableGenerated.length > 0 && !hasSkeletonSelection) {
        await this._handleDragEditableGeneratedPoints(
          eventStream,
          initialEvent,
          editableGenerated
        );
        this.sceneController.sceneModel.showTransformSelection = true;
        return;
      }

      // Check if any selected points are editable generated handles
      const editableHandles = this._getEditableGeneratedHandlesFromSelection(pointSelection);
      if (editableHandles.length > 0 && !hasSkeletonSelection) {
        console.log('[HANDLE-EDIT] Phase 4: Redirecting to handle drag');
        await this._handleDragEditableGeneratedHandles(
          eventStream,
          initialEvent,
          editableHandles
        );
        this.sceneController.sceneModel.showTransformSelection = true;
        return;
      }
    }

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
          const generatedContours = generateContoursFromSkeleton(workingSkeletonData);
          const oldGeneratedIndices = workingSkeletonData.generatedContourIndices || [];

          // Check if we can update point positions in-place (preserves path structure)
          let canUpdateInPlace = oldGeneratedIndices.length === generatedContours.length;
          const inPlaceUpdates = [];
          if (canUpdateInPlace) {
            for (let i = 0; i < oldGeneratedIndices.length; i++) {
              const contourIdx = oldGeneratedIndices[i];
              if (contourIdx >= staticGlyph.path.numContours) {
                canUpdateInPlace = false;
                break;
              }
              const startPt = contourIdx === 0
                ? 0
                : staticGlyph.path.contourInfo[contourIdx - 1].endPoint + 1;
              const endPt = staticGlyph.path.contourInfo[contourIdx].endPoint;
              const numExistingPts = endPt - startPt + 1;
              const packed = packContour(generatedContours[i]);
              const numNewPts = packed.coordinates.length / 2;
              if (numExistingPts !== numNewPts) {
                canUpdateInPlace = false;
                break;
              }
              inPlaceUpdates.push({ startPt, packed });
            }
          }

          const skeletonChanges = recordChanges(staticGlyph, (sg) => {
            if (canUpdateInPlace) {
              // Update generated contour points in-place — path structure stays the same,
              // so EditBehavior's cached point indices remain valid
              for (const { startPt, packed } of inPlaceUpdates) {
                const numPts = packed.coordinates.length / 2;
                for (let pi = 0; pi < numPts; pi++) {
                  sg.path.setPointPosition(
                    startPt + pi,
                    packed.coordinates[pi * 2],
                    packed.coordinates[pi * 2 + 1]
                  );
                }
              }
            } else {
              // Fallback: delete and re-insert (changes path structure)
              const sortedIndices = [...oldGeneratedIndices].sort((a, b) => b - a);
              for (const idx of sortedIndices) {
                if (idx < sg.path.numContours) {
                  sg.path.deleteContour(idx);
                }
              }
              const newGeneratedIndices = [];
              for (const contour of generatedContours) {
                const newIndex = sg.path.numContours;
                sg.path.insertContour(sg.path.numContours, packContour(contour));
                newGeneratedIndices.push(newIndex);
              }
              workingSkeletonData.generatedContourIndices = newGeneratedIndices;
            }
          });
          const prefixedSkeletonChanges = skeletonChanges.prefixed(["layers", editLayerName, "glyph"]);
          deepEditChanges.push(prefixedSkeletonChanges.change);

          // Update customData
          const customDataChange = recordChanges(layer, (l) => {
            l.customData[SKELETON_CUSTOM_DATA_KEY] = JSON.parse(
              JSON.stringify(workingSkeletonData)
            );
          });
          const prefixedCustomDataChange = customDataChange.prefixed(["layers", editLayerName]);
          deepEditChanges.push(prefixedCustomDataChange.change);

          // Save first frame's rollback for proper undo (it restores original state)
          if (!skeletonEditState.firstFrameRollback) {
            skeletonEditState.firstFrameRollback = [
              prefixedSkeletonChanges.rollbackChange,
              prefixedCustomDataChange.rollbackChange,
            ];
          }
        }

        editChange = consolidateChanges(deepEditChanges);
        await sendIncrementalChange(editChange, true);
      }

      const rollbackParts = layerInfo.map((layer) =>
        consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
      );
      if (skeletonEditState?.firstFrameRollback) {
        rollbackParts.push(...skeletonEditState.firstFrameRollback);
      }
      let changes = ChangeCollector.fromChanges(
        editChange,
        consolidateChanges(rollbackParts)
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
   * Get on-curve points for skeleton segment selection.
   * Returns a Set of point keys ("contourIdx/pointIdx") for on-curve points only.
   */
  _getSegmentOnCurvePoints(segmentSelection) {
    const result = new Set();

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
      // selKey format is "contourIdx/segmentIdx" (already parsed by parseSelection)
      const parts = selKey.split("/");
      const contourIdx = parseInt(parts[0], 10);
      const segmentIdx = parseInt(parts[1], 10);
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

      // Determine segment start and end on-curve indices
      const isClosingSegment =
        contour.isClosed && segmentIdx === onCurveIndices.length - 1;

      let startIdx, endIdx;
      if (isClosingSegment) {
        startIdx = onCurveIndices[onCurveIndices.length - 1];
        endIdx = onCurveIndices[0];
      } else {
        startIdx = onCurveIndices[segmentIdx];
        endIdx = onCurveIndices[segmentIdx + 1];
      }

      // Add only on-curve points
      result.add(`${contourIdx}/${startIdx}`);
      result.add(`${contourIdx}/${endIdx}`);
    }

    return result;
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

    // Capture pre-existing skeleton point selection before overwriting
    const { skeletonPoint: preSelectedPoints } = parseSelection(sceneController.selection);

    // Use first layer for structural checks
    const editLayerNameForCheck = sceneController.editingLayerNames?.[0];
    const layerForCheck = positionedGlyph?.varGlyph?.glyph?.layers?.[editLayerNameForCheck];
    const skeletonDataForCheck = layerForCheck?.customData?.[SKELETON_CUSTOM_DATA_KEY];

    // Build set of target points: always include the dragged point, plus any pre-selected
    const targetPointsMap = new Map(); // key "ci/pi" -> target info

    const addTargetPoint = (ci, pi) => {
      const key = `${ci}/${pi}`;
      if (targetPointsMap.has(key)) return;
      const contour = skeletonDataForCheck?.contours?.[ci];
      const pt = contour?.points?.[pi];
      if (!pt || pt.type) return; // skip off-curve points
      const isAsym = pt.leftWidth !== undefined || pt.rightWidth !== undefined;
      const isSingleSided = contour.singleSided ?? false;
      // Per-side editable: check based on dragSide (determined later)
      const isLeftEditable = pt.leftEditable === true;
      const isRightEditable = pt.rightEditable === true;
      targetPointsMap.set(key, {
        contourIndex: ci,
        pointIndex: pi,
        isAsymmetric: isAsym,
        isSingleSided,
        isLeftEditable,
        isRightEditable,
      });
    };

    addTargetPoint(ribHit.contourIndex, ribHit.pointIndex);
    if (preSelectedPoints) {
      for (const key of preSelectedPoints) {
        const [ci, pi] = key.split("/").map(Number);
        addTargetPoint(ci, pi);
      }
    }

    const targetPoints = [...targetPointsMap.values()];
    const dragSide = ribHit.side; // "left" or "right"

    // Build visual selection: rib point keys for all targets
    const newSelection = new Set();
    for (const tp of targetPoints) {
      const leftKey = `skeletonRibPoint/${tp.contourIndex}/${tp.pointIndex}/left`;
      const rightKey = `skeletonRibPoint/${tp.contourIndex}/${tp.pointIndex}/right`;
      if (tp.isSingleSided) {
        // Single-sided: one rib on the direction side
        newSelection.add(dragSide === "left" ? leftKey : rightKey);
      } else if (tp.isAsymmetric) {
        // Asymmetric: only the dragged side
        newSelection.add(dragSide === "left" ? leftKey : rightKey);
      } else {
        // Symmetric: only select the clicked side (not both)
        // This allows per-side editable toggle even for symmetric points
        newSelection.add(dragSide === "left" ? leftKey : rightKey);
      }
    }
    sceneController.selection = newSelection;

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
          ribBehaviors: [], // One per target point
        };
      }

      if (Object.keys(layersData).length === 0) return;

      // Create rib edit behaviors for each target point in each layer
      for (const data of Object.values(layersData)) {
        for (const tp of targetPoints) {
          const contour = data.original.contours[tp.contourIndex];
          const skeletonPoint = contour?.points[tp.pointIndex];
          if (!skeletonPoint) continue;
          const normal = calculateNormalAtSkeletonPoint(contour, tp.pointIndex);

          const ribHitForPoint = {
            contourIndex: tp.contourIndex,
            pointIndex: tp.pointIndex,
            side: dragSide,
            normal,
            onCurvePoint: { x: skeletonPoint.x, y: skeletonPoint.y },
          };

          // Check if this side is editable
          const sideIsEditable = (dragSide === "left" && tp.isLeftEditable) || (dragSide === "right" && tp.isRightEditable);

          if (tp.isSingleSided) {
            // For single-sided, create behavior with totalWidth as the effective width
            const defaultWidth = contour.defaultWidth || 20;
            const leftHW = getPointHalfWidth(skeletonPoint, defaultWidth, "left");
            const rightHW = getPointHalfWidth(skeletonPoint, defaultWidth, "right");
            const totalWidth = leftHW + rightHW;

            if (sideIsEditable) {
              // Editable single-sided: use EditableRibBehavior for nudge support
              const behavior = createEditableRibBehavior(data.original, ribHitForPoint);
              // Override to track totalWidth for width changes
              behavior.originalHalfWidth = totalWidth;
              behavior.minHalfWidth = 2;
              // Force asymmetric mode to allow width changes in single-sided
              behavior.isAsymmetric = true;
              data.ribBehaviors.push({ behavior, target: tp });
            } else {
              // Non-editable single-sided: constrained to normal direction
              const behavior = new RibEditBehavior(
                data.original,
                tp.contourIndex,
                tp.pointIndex,
                dragSide,
                normal,
                { x: skeletonPoint.x, y: skeletonPoint.y }
              );
              // Override to track totalWidth; min 2 UPM since it's the full width
              behavior.originalHalfWidth = totalWidth;
              behavior.minHalfWidth = 2;
              data.ribBehaviors.push({ behavior, target: tp });
            }
          } else if (sideIsEditable) {
            // Editable mode: use EditableRibBehavior for free movement
            data.ribBehaviors.push({
              behavior: createEditableRibBehavior(data.original, ribHitForPoint),
              target: tp,
            });
          } else {
            // Normal mode: constrained to normal direction
            data.ribBehaviors.push({
              behavior: createRibEditBehavior(data.original, ribHitForPoint),
              target: tp,
            });
          }
        }
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
          const { layer, working, ribBehaviors } = data;

          // Apply each behavior to update all target points
          for (const { behavior, target } of ribBehaviors) {
            const change = behavior.applyDelta(delta);

            const contour = working.contours[target.contourIndex];
            const point = contour.points[target.pointIndex];

            // Check if this side is editable
            const sideIsEditable = (dragSide === "left" && target.isLeftEditable) || (dragSide === "right" && target.isRightEditable);

            if (target.isSingleSided) {
              // Single-sided: halfWidth from behavior is the new totalWidth
              // Store as symmetric width (generator handles single-sided projection)
              point.width = change.halfWidth;
              delete point.leftWidth;
              delete point.rightWidth;
              // Also apply nudge if editable
              if (sideIsEditable && change.nudge !== undefined) {
                if (dragSide === "left") {
                  point.leftNudge = change.nudge;
                } else {
                  point.rightNudge = change.nudge;
                }
              }
            } else if (sideIsEditable) {
              // Editable mode: behavior determines if width changes based on symmetric/asymmetric
              if (change.isAsymmetric) {
                // Asymmetric: update per-side width and nudge
                if (dragSide === "left") {
                  point.leftWidth = change.halfWidth;
                  point.leftNudge = change.nudge;
                } else {
                  point.rightWidth = change.halfWidth;
                  point.rightNudge = change.nudge;
                }
                delete point.width;
              } else {
                // Symmetric: only update nudge, keep width unchanged
                if (dragSide === "left") {
                  point.leftNudge = change.nudge;
                } else {
                  point.rightNudge = change.nudge;
                }
                // Don't touch width - it stays symmetric
              }
            } else if (target.isAsymmetric) {
              // Asymmetric: update only the dragged side
              if (dragSide === "left") {
                point.leftWidth = change.halfWidth;
              } else {
                point.rightWidth = change.halfWidth;
              }
              delete point.width;
            } else {
              // Symmetric: update full width (both sides)
              point.width = change.halfWidth * 2;
              delete point.leftWidth;
              delete point.rightWidth;
            }
          }

          // Record changes for this layer
          const staticGlyph = layer.glyph;
          const pathChange = recordChanges(staticGlyph, (sg) => {
            regenerateOutline(sg, working);
          });
          allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

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
   * Check if selected points are editable generated points (from skeleton).
   * @param {Array} pointSelection - Array of point indices
   * @returns {Array} Array of {pointIndex, skeletonContourIndex, skeletonPointIndex, side}
   */
  _getEditableGeneratedPointsFromSelection(pointSelection) {
    const result = [];
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return result;

    for (const pointIndex of pointSelection) {
      const ribInfo = this.sceneModel._getEditableRibPointForGeneratedPoint(
        positionedGlyph,
        pointIndex
      );
      if (ribInfo) {
        result.push({
          pointIndex,
          ...ribInfo,
        });
      }
    }
    return result;
  }

  /**
   * Check if selected points are editable generated handles (from skeleton).
   * @param {Array} pointSelection - Array of point indices
   * @returns {Array} Array of {pointIndex, skeletonContourIndex, skeletonPointIndex, side, handleType}
   */
  _getEditableGeneratedHandlesFromSelection(pointSelection) {
    console.log('[HANDLE-EDIT] Phase 4: _getEditableGeneratedHandlesFromSelection', { pointSelection });

    const result = [];
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return result;

    for (const pointIndex of pointSelection) {
      const handleInfo = this.sceneModel._getEditableHandleForGeneratedPoint(
        positionedGlyph,
        pointIndex
      );
      if (handleInfo) {
        result.push({
          pointIndex,
          ...handleInfo,
        });
      }
    }

    console.log('[HANDLE-EDIT] Phase 4: Found editable handles', result);
    return result;
  }

  /**
   * Find adjacent handles (off-curve points) for a rib point in the generated path.
   * @param {Object} path - The generated path
   * @param {number} ribPointIndex - Index of the rib point in the path
   * @returns {Object|null} { prevHandle, nextHandle } or null if not found
   */
  _findAdjacentHandlesForRibPoint(path, ribPointIndex) {
    const numPoints = path.numPoints;
    if (ribPointIndex < 0 || ribPointIndex >= numPoints) return null;

    // Get contour range for this point
    const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(ribPointIndex);
    const numContourPoints = path.getNumPointsOfContour(contourIndex);
    const contourStart = ribPointIndex - contourPointIndex;

    // Helper to wrap index within contour
    const wrapIndex = (idx) => {
      const relative = idx - contourStart;
      const wrapped = ((relative % numContourPoints) + numContourPoints) % numContourPoints;
      return contourStart + wrapped;
    };

    // Find prev and next off-curve points
    let prevHandle = null;
    let nextHandle = null;

    // Look backwards for prev handle
    for (let i = 1; i <= numContourPoints; i++) {
      const checkIdx = wrapIndex(ribPointIndex - i);
      const pointType = path.pointTypes[checkIdx];
      const isOnCurve = (pointType & 0x03) === 0;
      if (!isOnCurve) {
        prevHandle = path.getPoint(checkIdx);
        break;
      }
      // If we hit another on-curve before finding off-curve, no prev handle
      if (isOnCurve && i > 1) break;
    }

    // Look forwards for next handle
    for (let i = 1; i <= numContourPoints; i++) {
      const checkIdx = wrapIndex(ribPointIndex + i);
      const pointType = path.pointTypes[checkIdx];
      const isOnCurve = (pointType & 0x03) === 0;
      if (!isOnCurve) {
        nextHandle = path.getPoint(checkIdx);
        break;
      }
      // If we hit another on-curve before finding off-curve, no next handle
      if (isOnCurve && i > 1) break;
    }

    console.log('[RIB-INTERPOLATE] _findAdjacentHandlesForRibPoint', {
      ribPointIndex, prevHandle, nextHandle,
    });

    if (!prevHandle || !nextHandle) return null;
    return { prevHandle, nextHandle };
  }

  /**
   * Handle dragging editable generated points (from skeleton contours).
   * Updates skeleton data (nudge, width) based on point movement.
   * When Alt is held, the rib point slides along the line between its adjacent handles.
   */
  async _handleDragEditableGeneratedPoints(eventStream, initialEvent, editablePoints) {
    const sceneController = this.sceneController;
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();

    if (!positionedGlyph || editablePoints.length === 0) return;

    const useInterpolation = initialEvent.altKey;
    console.log('[RIB-INTERPOLATE] Alt key:', useInterpolation);

    const localPoint = sceneController.localPoint(initialEvent);
    const startGlyphPoint = {
      x: localPoint.x - positionedGlyph.x,
      y: localPoint.y - positionedGlyph.y,
    };

    // If using interpolation, find adjacent handles for each editable rib point
    const generatedPath = positionedGlyph.glyph.path;
    const editablePointsWithHandles = useInterpolation
      ? editablePoints.map(ep => {
          // ep.pointIndex is the index in the generated path
          const handles = this._findAdjacentHandlesForRibPoint(generatedPath, ep.pointIndex);
          return { ...ep, handles };
        })
      : editablePoints.map(ep => ({ ...ep, handles: null }));

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const layersData = {};

      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = layer.customData[SKELETON_CUSTOM_DATA_KEY];
        layersData[editLayerName] = {
          layer,
          original: JSON.parse(JSON.stringify(skeletonData)),
          working: JSON.parse(JSON.stringify(skeletonData)),
          behaviors: [],
        };
      }

      if (Object.keys(layersData).length === 0) return;

      // Create behaviors for each editable point in each layer
      for (const data of Object.values(layersData)) {
        for (const ep of editablePointsWithHandles) {
          const contour = data.original.contours[ep.skeletonContourIndex];
          const skeletonPoint = contour?.points[ep.skeletonPointIndex];
          if (!skeletonPoint) continue;

          const normal = calculateNormalAtSkeletonPoint(contour, ep.skeletonPointIndex);
          const ribHit = {
            contourIndex: ep.skeletonContourIndex,
            pointIndex: ep.skeletonPointIndex,
            side: ep.side,
            normal,
            onCurvePoint: { x: skeletonPoint.x, y: skeletonPoint.y },
          };

          // Use interpolating behavior if Alt is pressed and handles are found
          let behavior;
          if (useInterpolation && ep.handles) {
            behavior = createInterpolatingRibBehavior(
              data.original, ribHit, ep.handles.prevHandle, ep.handles.nextHandle
            );
          } else {
            behavior = createEditableRibBehavior(data.original, ribHit);
          }

          data.behaviors.push({
            behavior,
            editablePoint: ep,
          });
        }
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

        for (const [editLayerName, data] of Object.entries(layersData)) {
          const { layer, working, behaviors } = data;

          for (const { behavior, editablePoint } of behaviors) {
            const change = behavior.applyDelta(delta);
            const contour = working.contours[editablePoint.skeletonContourIndex];
            const point = contour.points[editablePoint.skeletonPointIndex];
            const side = editablePoint.side;

            // Apply changes based on symmetric/asymmetric mode
            if (change.isAsymmetric) {
              if (side === "left") {
                point.leftWidth = change.halfWidth;
                point.leftNudge = change.nudge;
              } else {
                point.rightWidth = change.halfWidth;
                point.rightNudge = change.nudge;
              }
              delete point.width;
            } else {
              // Symmetric: only update nudge
              if (side === "left") {
                point.leftNudge = change.nudge;
              } else {
                point.rightNudge = change.nudge;
              }
            }
          }

          const staticGlyph = layer.glyph;
          const pathChange = recordChanges(staticGlyph, (sg) => {
            regenerateOutline(sg, working);
          });
          allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

          const customDataChange = recordChanges(layer, (l) => {
            l.customData[SKELETON_CUSTOM_DATA_KEY] = JSON.parse(JSON.stringify(working));
          });
          allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
        }

        const combinedChange = new ChangeCollector().concat(...allChanges);
        accumulatedChanges = accumulatedChanges.concat(combinedChange);
        await sendIncrementalChange(combinedChange.change, true);
      }

      await sendIncrementalChange(accumulatedChanges.change);

      return {
        changes: accumulatedChanges,
        undoLabel: "Edit generated point",
        broadcast: true,
      };
    });
  }

  /**
   * Handle dragging editable generated handles (from skeleton contours).
   * Updates skeleton data (handle offsets) based on handle movement.
   */
  async _handleDragEditableGeneratedHandles(eventStream, initialEvent, editableHandles) {
    console.log('[HANDLE-EDIT] Phase 4: _handleDragEditableGeneratedHandles starting', { editableHandles });

    const sceneController = this.sceneController;
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();

    if (!positionedGlyph || editableHandles.length === 0) return;

    const localPoint = sceneController.localPoint(initialEvent);
    const startGlyphPoint = {
      x: localPoint.x - positionedGlyph.x,
      y: localPoint.y - positionedGlyph.y,
    };

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const layersData = {};

      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = layer.customData[SKELETON_CUSTOM_DATA_KEY];
        layersData[editLayerName] = {
          layer,
          original: JSON.parse(JSON.stringify(skeletonData)),
          working: JSON.parse(JSON.stringify(skeletonData)),
          behaviors: [],
        };
      }

      if (Object.keys(layersData).length === 0) return;

      // Create behaviors for each editable handle in each layer
      for (const data of Object.values(layersData)) {
        for (const eh of editableHandles) {
          const contour = data.original.contours[eh.skeletonContourIndex];
          if (!contour) continue;

          // Calculate skeleton handle direction
          const skeletonHandleDir = this._getSkeletonHandleDirForPoint(
            contour, eh.skeletonPointIndex, eh.handleType
          );

          if (!skeletonHandleDir) {
            console.log('[HANDLE-EDIT] Phase 4: Could not find skeleton handle direction');
            continue;
          }

          console.log('[HANDLE-EDIT] Phase 4: Creating behavior', { skeletonHandleDir });

          data.behaviors.push({
            behavior: createEditableHandleBehavior(data.original, eh, skeletonHandleDir),
            editableHandle: eh,
          });
        }
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
        console.log('[HANDLE-EDIT] Phase 4: Drag delta', delta);

        const allChanges = [];

        for (const [editLayerName, data] of Object.entries(layersData)) {
          const { layer, working, behaviors } = data;

          for (const { behavior, editableHandle } of behaviors) {
            const change = behavior.applyDelta(delta);
            const point = working.contours[editableHandle.skeletonContourIndex].points[editableHandle.skeletonPointIndex];

            // Apply the offset to the appropriate key
            const offsetKey = editableHandle.side === "left"
              ? (editableHandle.handleType === "in" ? "leftHandleInOffset" : "leftHandleOutOffset")
              : (editableHandle.handleType === "in" ? "rightHandleInOffset" : "rightHandleOutOffset");

            point[offsetKey] = change.offset;
            console.log('[HANDLE-EDIT] Phase 4: Applied offset', { offsetKey, offset: change.offset });
          }

          const staticGlyph = layer.glyph;
          const pathChange = recordChanges(staticGlyph, (sg) => {
            regenerateOutline(sg, working);
          });
          allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

          const customDataChange = recordChanges(layer, (l) => {
            l.customData[SKELETON_CUSTOM_DATA_KEY] = JSON.parse(JSON.stringify(working));
          });
          allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
        }

        const combinedChange = new ChangeCollector().concat(...allChanges);
        accumulatedChanges = accumulatedChanges.concat(combinedChange);
        await sendIncrementalChange(combinedChange.change, true);
      }

      await sendIncrementalChange(accumulatedChanges.change);

      return {
        changes: accumulatedChanges,
        undoLabel: "Edit generated handle",
        broadcast: true,
      };
    });
  }

  /**
   * Get skeleton handle direction for a given skeleton point.
   * @param {Object} contour - The skeleton contour
   * @param {number} pointIndex - Index of the on-curve skeleton point
   * @param {string} handleType - "in" or "out"
   * @returns {Object|null} Normalized direction vector {x, y}
   */
  _getSkeletonHandleDirForPoint(contour, pointIndex, handleType) {
    const points = contour.points;
    const numPoints = points.length;
    const isClosed = contour.isClosed;

    const skeletonPoint = points[pointIndex];
    if (!skeletonPoint || skeletonPoint.type) return null;

    // Find adjacent control points
    // For "out" handle: look at the next point
    // For "in" handle: look at the previous point
    let controlPoint = null;

    if (handleType === "out") {
      // Look for next point (could be off-curve)
      const nextIdx = (pointIndex + 1) % numPoints;
      if (isClosed || pointIndex < numPoints - 1) {
        const nextPt = points[nextIdx];
        if (nextPt?.type === "cubic") {
          controlPoint = nextPt;
        }
      }
    } else {
      // "in" handle: look at previous point
      const prevIdx = (pointIndex - 1 + numPoints) % numPoints;
      if (isClosed || pointIndex > 0) {
        const prevPt = points[prevIdx];
        if (prevPt?.type === "cubic") {
          controlPoint = prevPt;
        }
      }
    }

    if (!controlPoint) {
      console.log('[HANDLE-EDIT] Phase 4: No control point found for handle', { pointIndex, handleType });
      return null;
    }

    const dir = {
      x: controlPoint.x - skeletonPoint.x,
      y: controlPoint.y - skeletonPoint.y,
    };
    const length = Math.hypot(dir.x, dir.y);

    if (length < 0.001) return null;

    const normalized = { x: dir.x / length, y: dir.y / length };
    console.log('[HANDLE-EDIT] Phase 4: Handle direction', { pointIndex, handleType, normalized });
    return normalized;
  }

  /**
   * Handle dragging a skeleton Tunni point.
   * - Tunni Point (midpoint): changes curve tension by moving control points
   * - True Tunni Point (intersection): moves on-curve points along projection lines
   */
  async _handleSkeletonTunniDrag(eventStream, initialEvent, tunniHit) {
    const sceneController = this.sceneController;
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();

    if (!positionedGlyph) return;

    // Get initial point in glyph coordinates
    const localPoint = sceneController.localPoint(initialEvent);
    const startGlyphPoint = {
      x: localPoint.x - positionedGlyph.x,
      y: localPoint.y - positionedGlyph.y,
    };

    const { type, contourIndex, segment } = tunniHit;
    const isTrueTunni = type === "true-tunni";

    // Store original segment data for calculations
    const originalSegment = {
      startPoint: { ...segment.startPoint },
      endPoint: { ...segment.endPoint },
      controlPoints: segment.controlPoints.map((p) => ({ ...p })),
      startIndex: segment.startIndex,
      endIndex: segment.endIndex,
      controlIndices: segment.controlIndices,
    };

    // Calculate original Tunni point position
    const origTunniPoint = isTrueTunni
      ? calculateSkeletonTrueTunniPoint(originalSegment)
      : calculateSkeletonTunniPoint(originalSegment);

    if (!origTunniPoint) return;

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

      let accumulatedChanges = new ChangeCollector();

      // Drag loop
      for await (const event of eventStream) {
        const currentLocalPoint = sceneController.localPoint(event);
        const currentGlyphPoint = {
          x: currentLocalPoint.x - positionedGlyph.x,
          y: currentLocalPoint.y - positionedGlyph.y,
        };

        // Calculate new Tunni point position
        const delta = vector.subVectors(currentGlyphPoint, startGlyphPoint);
        const newTunniPoint = {
          x: origTunniPoint.x + delta.x,
          y: origTunniPoint.y + delta.y,
        };

        // Alt key disables equalized distances
        const equalizeDistances = !event.altKey;

        const allChanges = [];

        // Apply changes to ALL editable layers
        for (const [editLayerName, data] of Object.entries(layersData)) {
          const { layer, original, working } = data;

          // Reset working data to original
          const origContour = original.contours[contourIndex];
          const workContour = working.contours[contourIndex];
          for (let pi = 0; pi < origContour.points.length; pi++) {
            workContour.points[pi].x = origContour.points[pi].x;
            workContour.points[pi].y = origContour.points[pi].y;
          }

          // Build segment from original data (for this layer)
          const layerOriginalSegment = {
            startPoint: { ...origContour.points[segment.startIndex] },
            endPoint: { ...origContour.points[segment.endIndex] },
            controlPoints: segment.controlIndices.map((i) => ({
              ...origContour.points[i],
            })),
            startIndex: segment.startIndex,
            endIndex: segment.endIndex,
            controlIndices: segment.controlIndices,
          };

          if (isTrueTunni) {
            // True Tunni: move on-curve points
            const result = calculateSkeletonOnCurveFromTunni(
              newTunniPoint,
              layerOriginalSegment,
              equalizeDistances
            );

            if (result) {
              workContour.points[segment.startIndex].x = result.newStartPoint.x;
              workContour.points[segment.startIndex].y = result.newStartPoint.y;
              workContour.points[segment.endIndex].x = result.newEndPoint.x;
              workContour.points[segment.endIndex].y = result.newEndPoint.y;
            }
          } else {
            // Midpoint Tunni: move control points
            const newCps = calculateSkeletonControlPointsFromTunniDelta(
              delta,
              layerOriginalSegment,
              equalizeDistances
            );

            if (newCps) {
              const [cp1Idx, cp2Idx] = segment.controlIndices;
              workContour.points[cp1Idx].x = newCps[0].x;
              workContour.points[cp1Idx].y = newCps[0].y;
              workContour.points[cp2Idx].x = newCps[1].x;
              workContour.points[cp2Idx].y = newCps[1].y;
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
        accumulatedChanges = accumulatedChanges.concat(combinedChange);
        await sendIncrementalChange(combinedChange.change, true);
      }

      // Final send without "may drop" flag
      await sendIncrementalChange(accumulatedChanges.change);

      return {
        changes: accumulatedChanges,
        undoLabel: isTrueTunni
          ? "Move Skeleton On-Curve Points (Tunni)"
          : "Move Skeleton Control Points (Tunni)",
        broadcast: true,
      };
    });
  }

  /**
   * Equalize tensions on a skeleton Tunni point (Ctrl+Shift+click).
   * Makes both control points have the same tension relative to the true Tunni point.
   */
  async _equalizeSkeletonTunniTensions(tunniHit) {
    const sceneController = this.sceneController;
    const { contourIndex, segment } = tunniHit;

    // Check if already equalized
    if (areSkeletonTensionsEqualized(segment)) {
      return; // Already equalized, nothing to do
    }

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      // Apply changes to ALL editable layers
      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = layer.customData[SKELETON_CUSTOM_DATA_KEY];
        const working = JSON.parse(JSON.stringify(skeletonData));
        const contour = working.contours[contourIndex];

        // Build segment from this layer's data
        const layerSegment = {
          startPoint: { ...contour.points[segment.startIndex] },
          endPoint: { ...contour.points[segment.endIndex] },
          controlPoints: segment.controlIndices.map((i) => ({
            ...contour.points[i],
          })),
          startIndex: segment.startIndex,
          endIndex: segment.endIndex,
          controlIndices: segment.controlIndices,
        };

        // Calculate equalized control points
        const newCps = calculateSkeletonEqualizedControlPoints(layerSegment);
        if (newCps) {
          const [cp1Idx, cp2Idx] = segment.controlIndices;
          contour.points[cp1Idx].x = newCps[0].x;
          contour.points[cp1Idx].y = newCps[0].y;
          contour.points[cp2Idx].x = newCps[1].x;
          contour.points[cp2Idx].y = newCps[1].y;
        }

        // Regenerate outline
        const staticGlyph = layer.glyph;
        const oldGeneratedIndices = working.generatedContourIndices || [];
        const sortedIndices = [...oldGeneratedIndices].sort((a, b) => b - a);

        const pathChange = recordChanges(staticGlyph, (sg) => {
          for (const idx of sortedIndices) {
            if (idx < sg.path.numContours) {
              sg.path.deleteContour(idx);
            }
          }
          const generatedContours = generateContoursFromSkeleton(working);
          const newGeneratedIndices = [];
          for (const generatedContour of generatedContours) {
            const newIndex = sg.path.numContours;
            sg.path.insertContour(sg.path.numContours, packContour(generatedContour));
            newGeneratedIndices.push(newIndex);
          }
          working.generatedContourIndices = newGeneratedIndices;
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        // Update customData
        const customDataChange = recordChanges(layer, (l) => {
          l.customData[SKELETON_CUSTOM_DATA_KEY] = working;
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      const combinedChange = new ChangeCollector().concat(...allChanges);
      await sendIncrementalChange(combinedChange.change);

      return {
        changes: combinedChange,
        undoLabel: "Equalize Skeleton Tunni Tensions",
        broadcast: true,
      };
    });
  }

  /**
   * Equalize skeleton handles (X+click).
   * Makes the opposite off-curve handle the same length as the clicked one.
   * @param {number} contourIndex - Index of the contour
   * @param {number} pointIndex - Index of the clicked off-curve point
   * @param {Object} skeletonData - The skeleton data
   */
  async _equalizeSkeletonHandles(contourIndex, pointIndex, skeletonData) {
    const sceneController = this.sceneController;
    const contour = skeletonData.contours[contourIndex];
    const numPoints = contour.points.length;

    // Find adjacent smooth point and opposite off-curve
    // Off-curve can be before or after a smooth point
    let smoothIndex = null;
    let oppositeIndex = null;

    const prevIndex = (pointIndex - 1 + numPoints) % numPoints;
    const nextIndex = (pointIndex + 1) % numPoints;
    const prevPoint = contour.points[prevIndex];
    const nextPoint = contour.points[nextIndex];

    // Check if prev is smooth (on-curve without type)
    if (!prevPoint?.type) {
      // prevPoint is on-curve, check if it's smooth and has off-curve on the other side
      const prevPrevIndex = (prevIndex - 1 + numPoints) % numPoints;
      const prevPrevPoint = contour.points[prevPrevIndex];
      if (prevPrevPoint?.type === "cubic") {
        smoothIndex = prevIndex;
        oppositeIndex = prevPrevIndex;
      }
    }

    // Check if next is smooth (on-curve without type)
    if (smoothIndex === null && !nextPoint?.type) {
      const nextNextIndex = (nextIndex + 1) % numPoints;
      const nextNextPoint = contour.points[nextNextIndex];
      if (nextNextPoint?.type === "cubic") {
        smoothIndex = nextIndex;
        oppositeIndex = nextNextIndex;
      }
    }

    if (smoothIndex === null || oppositeIndex === null) {
      return; // No valid smooth point with opposite off-curve found
    }

    // Calculate the length of the clicked handle
    const clickedPoint = contour.points[pointIndex];
    const smoothPoint = contour.points[smoothIndex];
    const clickedLength = Math.hypot(
      clickedPoint.x - smoothPoint.x,
      clickedPoint.y - smoothPoint.y
    );

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      // Apply changes to ALL editable layers
      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const layerSkeletonData = layer.customData[SKELETON_CUSTOM_DATA_KEY];
        const working = JSON.parse(JSON.stringify(layerSkeletonData));
        const workingContour = working.contours[contourIndex];

        // Get this layer's points
        const layerClickedPt = workingContour.points[pointIndex];
        const layerSmoothPt = workingContour.points[smoothIndex];
        const layerOppositePt = workingContour.points[oppositeIndex];

        // Calculate this layer's clicked handle length
        const layerClickedLength = Math.hypot(
          layerClickedPt.x - layerSmoothPt.x,
          layerClickedPt.y - layerSmoothPt.y
        );

        // Calculate opposite handle direction
        const oppDirX = layerOppositePt.x - layerSmoothPt.x;
        const oppDirY = layerOppositePt.y - layerSmoothPt.y;
        const oppLength = Math.hypot(oppDirX, oppDirY);

        if (oppLength > 0.001) {
          // Normalize and scale to clicked length
          const scale = layerClickedLength / oppLength;
          workingContour.points[oppositeIndex].x = layerSmoothPt.x + oppDirX * scale;
          workingContour.points[oppositeIndex].y = layerSmoothPt.y + oppDirY * scale;
        }

        // Regenerate outline
        const staticGlyph = layer.glyph;
        const oldGeneratedIndices = working.generatedContourIndices || [];
        const sortedIndices = [...oldGeneratedIndices].sort((a, b) => b - a);

        const pathChange = recordChanges(staticGlyph, (sg) => {
          for (const idx of sortedIndices) {
            if (idx < sg.path.numContours) {
              sg.path.deleteContour(idx);
            }
          }
          const generatedContours = generateContoursFromSkeleton(working);
          const newGeneratedIndices = [];
          for (const generatedContour of generatedContours) {
            const newIndex = sg.path.numContours;
            sg.path.insertContour(sg.path.numContours, packContour(generatedContour));
            newGeneratedIndices.push(newIndex);
          }
          working.generatedContourIndices = newGeneratedIndices;
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        // Update customData
        const customDataChange = recordChanges(layer, (l) => {
          l.customData[SKELETON_CUSTOM_DATA_KEY] = working;
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      const combinedChange = new ChangeCollector().concat(...allChanges);
      await sendIncrementalChange(combinedChange.change);

      return {
        changes: combinedChange,
        undoLabel: "Equalize Skeleton Handles",
        broadcast: true,
      };
    });
  }

  /**
   * Handle X+drag for equalizing skeleton handles in real-time.
   * The opposite handle mirrors the dragged handle's length while maintaining its direction.
   */
  async _handleEqualizeHandlesDrag(
    eventStream,
    initialEvent,
    contourIndex,
    pointIndex,
    skeletonData,
    positionedGlyph
  ) {
    const sceneController = this.sceneController;
    const contour = skeletonData.contours[contourIndex];
    const numPoints = contour.points.length;

    // Find adjacent smooth point and opposite off-curve
    let smoothIndex = null;
    let oppositeIndex = null;

    const prevIndex = (pointIndex - 1 + numPoints) % numPoints;
    const nextIndex = (pointIndex + 1) % numPoints;
    const prevPoint = contour.points[prevIndex];
    const nextPoint = contour.points[nextIndex];

    // Check if prev is smooth (on-curve without type)
    if (!prevPoint?.type) {
      const prevPrevIndex = (prevIndex - 1 + numPoints) % numPoints;
      const prevPrevPoint = contour.points[prevPrevIndex];
      if (prevPrevPoint?.type === "cubic") {
        smoothIndex = prevIndex;
        oppositeIndex = prevPrevIndex;
      }
    }

    // Check if next is smooth (on-curve without type)
    if (smoothIndex === null && !nextPoint?.type) {
      const nextNextIndex = (nextIndex + 1) % numPoints;
      const nextNextPoint = contour.points[nextNextIndex];
      if (nextNextPoint?.type === "cubic") {
        smoothIndex = nextIndex;
        oppositeIndex = nextNextIndex;
      }
    }

    if (smoothIndex === null || oppositeIndex === null) {
      return; // No valid smooth point with opposite off-curve found
    }

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      // Setup data for ALL editable layers
      const layersData = {};
      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const layerSkeletonData = layer.customData[SKELETON_CUSTOM_DATA_KEY];
        layersData[editLayerName] = {
          layer,
          original: JSON.parse(JSON.stringify(layerSkeletonData)),
          working: JSON.parse(JSON.stringify(layerSkeletonData)),
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
        for (const generatedContour of generatedContours) {
          const newIndex = staticGlyph.path.numContours;
          staticGlyph.path.insertContour(staticGlyph.path.numContours, packContour(generatedContour));
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

        const allChanges = [];

        // Apply changes to ALL editable layers
        for (const [editLayerName, data] of Object.entries(layersData)) {
          const { layer, original, working } = data;

          // Reset working data to original
          const origContour = original.contours[contourIndex];
          const workContour = working.contours[contourIndex];
          for (let pi = 0; pi < origContour.points.length; pi++) {
            workContour.points[pi].x = origContour.points[pi].x;
            workContour.points[pi].y = origContour.points[pi].y;
          }

          // Get smooth point position (stays fixed)
          const smoothPt = workContour.points[smoothIndex];

          // The dragged handle follows the cursor freely
          let newDragVec = {
            x: currentGlyphPoint.x - smoothPt.x,
            y: currentGlyphPoint.y - smoothPt.y,
          };

          // Shift constrains to horizontal/vertical/45-degree
          if (event.shiftKey) {
            newDragVec = constrainHorVerDiag(newDragVec);
          }

          const newDragLen = Math.hypot(newDragVec.x, newDragVec.y);

          // Minimum length of 1
          if (newDragLen < 1) {
            continue;
          }

          // Update dragged point
          workContour.points[pointIndex].x = smoothPt.x + newDragVec.x;
          workContour.points[pointIndex].y = smoothPt.y + newDragVec.y;

          // Update opposite point: same length, opposite direction
          workContour.points[oppositeIndex].x = smoothPt.x - newDragVec.x;
          workContour.points[oppositeIndex].y = smoothPt.y - newDragVec.y;

          // Record changes for this layer
          const staticGlyph = layer.glyph;
          const pathChange = recordChanges(staticGlyph, (sg) => {
            regenerateOutline(sg, working);
          });
          allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

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
        undoLabel: "Equalize Skeleton Handles",
        broadcast: true,
      };
    });
  }

  /**
   * Equalize skeleton handles for all selected off-curve points (X+arrows).
   * @param {Set} skeletonPointSelection - Set of selected skeleton point keys
   */
  async _equalizeSelectedSkeletonHandles(skeletonPointSelection) {
    const sceneController = this.sceneController;
    const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return;

    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, this.sceneModel);
    if (!skeletonData) return;

    // Collect all off-curve points from selection
    const offCurvePoints = [];
    for (const key of skeletonPointSelection) {
      const [contourIdx, pointIdx] = key.split("/").map(Number);
      const contour = skeletonData.contours[contourIdx];
      const point = contour?.points[pointIdx];
      if (point?.type === "cubic") {
        offCurvePoints.push({ contourIdx, pointIdx });
      }
    }

    if (offCurvePoints.length === 0) return;

    // Process each off-curve point
    for (const { contourIdx, pointIdx } of offCurvePoints) {
      await this._equalizeSkeletonHandles(contourIdx, pointIdx, skeletonData);
      // Re-fetch skeleton data after each change (it gets updated)
      const newPositionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (newPositionedGlyph) {
        const newSkeletonData = getSkeletonDataFromGlyph(newPositionedGlyph, this.sceneModel);
        if (newSkeletonData) {
          Object.assign(skeletonData, newSkeletonData);
        }
      }
    }
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

        // Per-side editable flags
        const isLeftEditable = skeletonPoint.leftEditable === true;
        const isRightEditable = skeletonPoint.rightEditable === true;

        // Calculate tangent and nudge offsets (only if editable, to match generator behavior)
        const tangent = { x: -normal.y, y: normal.x };
        const leftNudge = isLeftEditable ? (skeletonPoint.leftNudge || 0) : 0;
        const rightNudge = isRightEditable ? (skeletonPoint.rightNudge || 0) : 0;

        const singleSided = contour.singleSided ?? false;
        const singleSidedDirection = contour.singleSidedDirection ?? "left";

        if (singleSided) {
          // Single-sided: one rib point at total width on the chosen side
          const totalWidth = leftHW + rightHW;
          const side = singleSidedDirection;
          const sign = side === "left" ? 1 : -1;
          const nudge = side === "left" ? leftNudge : rightNudge;
          const ribPoint = {
            x: skeletonPoint.x + sign * normal.x * totalWidth + tangent.x * nudge,
            y: skeletonPoint.y + sign * normal.y * totalWidth + tangent.y * nudge,
          };
          const dist = vector.distance(glyphPoint, ribPoint);
          if (dist <= margin) {
            return {
              contourIndex,
              pointIndex,
              side,
              point: ribPoint,
              normal,
              onCurvePoint: skeletonPoint,
            };
          }
        } else {
          // Normal mode: two rib points (including nudge offset if editable)
          const leftRibPoint = {
            x: skeletonPoint.x + normal.x * leftHW + tangent.x * leftNudge,
            y: skeletonPoint.y + normal.y * leftHW + tangent.y * leftNudge,
          };
          const rightRibPoint = {
            x: skeletonPoint.x - normal.x * rightHW + tangent.x * rightNudge,
            y: skeletonPoint.y - normal.y * rightHW + tangent.y * rightNudge,
          };

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
    }

    return null;
  }

  /**
   * Handle measure mode click - select point for distance measurement.
   */
  async _handleMeasureClick(event) {
    const point = this.sceneController.localPoint(event);
    const size = this.sceneController.mouseClickMargin;

    // Find any point (regular, skeleton, or generated)
    const measurePoint = this.sceneModel.measurePointAtPoint(point, size);

    if (measurePoint) {
      if (event.shiftKey) {
        // Add to measure selection (keep existing direct mode)
        this.sceneModel.measureSelectedPoints.push(measurePoint);
      } else {
        // Replace measure selection, set direct mode based on Alt key
        this.sceneModel.measureSelectedPoints = [measurePoint];
        this.sceneModel.measureClickDirect = event.altKey;
      }
    } else {
      // Click on empty space - clear selection
      this.sceneModel.measureSelectedPoints = [];
      this.sceneModel.measureClickDirect = false;
    }
    this.canvasController.requestUpdate();
  }

  /**
   * Find segment under cursor for measure mode.
   * Returns { p1, p2, type } where p1 and p2 are on-curve endpoints.
   */
  _findSegmentForMeasure(point, size) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph?.glyph?.path) {
      return null;
    }

    const glyphPoint = {
      x: point.x - positionedGlyph.x,
      y: point.y - positionedGlyph.y,
    };

    const path = positionedGlyph.glyph.path;
    const margin = size * 1.5;

    // Check path segments (including generated contours)
    const segmentHit = this._findPathSegmentNear(path, glyphPoint, margin);
    if (segmentHit) {
      return segmentHit;
    }

    // Check skeleton segments
    const skeletonSegmentHit = this._findSkeletonSegmentNear(
      positionedGlyph,
      glyphPoint,
      margin
    );
    if (skeletonSegmentHit) {
      return skeletonSegmentHit;
    }

    return null;
  }

  /**
   * Find path segment near point.
   */
  _findPathSegmentNear(path, point, margin) {
    const contourInfo = path.contourInfo;
    if (!contourInfo?.length) return null;

    for (let contourIdx = 0; contourIdx < contourInfo.length; contourIdx++) {
      const info = contourInfo[contourIdx];
      const startPoint = contourIdx === 0 ? 0 : contourInfo[contourIdx - 1].endPoint + 1;
      const endPoint = info.endPoint;

      // Find on-curve points in this contour
      const onCurveIndices = [];
      for (let i = startPoint; i <= endPoint; i++) {
        const pt = path.getPoint(i);
        if (!pt.type) {
          onCurveIndices.push(i);
        }
      }

      // Check each segment
      for (let i = 0; i < onCurveIndices.length; i++) {
        const idx1 = onCurveIndices[i];
        const idx2 = onCurveIndices[(i + 1) % onCurveIndices.length];

        // Skip closing segment if contour is open
        if (!info.isClosed && i === onCurveIndices.length - 1) continue;

        const p1 = path.getPoint(idx1);
        const p2 = path.getPoint(idx2);

        // Simple distance-to-line check
        const dist = this._distanceToSegment(point, p1, p2);
        if (dist <= margin) {
          return { p1: { x: p1.x, y: p1.y }, p2: { x: p2.x, y: p2.y }, type: "path" };
        }
      }
    }

    return null;
  }

  /**
   * Find skeleton segment near point.
   */
  _findSkeletonSegmentNear(positionedGlyph, point, margin) {
    const varGlyph = positionedGlyph.varGlyph;
    if (!varGlyph?.glyph?.layers) return null;

    const editLayerName = this.sceneController.editingLayerNames?.[0];
    if (!editLayerName) return null;

    const layer = varGlyph.glyph.layers[editLayerName];
    const skeletonData = layer?.customData?.[SKELETON_CUSTOM_DATA_KEY];
    if (!skeletonData?.contours?.length) return null;

    for (const contour of skeletonData.contours) {
      // Find on-curve points
      const onCurvePoints = [];
      for (const pt of contour.points) {
        if (!pt.type) {
          onCurvePoints.push(pt);
        }
      }

      // Check each segment
      for (let i = 0; i < onCurvePoints.length - 1; i++) {
        const p1 = onCurvePoints[i];
        const p2 = onCurvePoints[i + 1];

        const dist = this._distanceToSegment(point, p1, p2);
        if (dist <= margin) {
          return { p1: { x: p1.x, y: p1.y }, p2: { x: p2.x, y: p2.y }, type: "skeleton" };
        }
      }

      // Check closing segment if closed
      if (contour.isClosed && onCurvePoints.length >= 2) {
        const p1 = onCurvePoints[onCurvePoints.length - 1];
        const p2 = onCurvePoints[0];
        const dist = this._distanceToSegment(point, p1, p2);
        if (dist <= margin) {
          return { p1: { x: p1.x, y: p1.y }, p2: { x: p2.x, y: p2.y }, type: "skeleton" };
        }
      }
    }

    return null;
  }

  /**
   * Calculate distance from point to line segment.
   */
  _distanceToSegment(point, p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      return Math.hypot(point.x - p1.x, point.y - p1.y);
    }

    let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const projX = p1.x + t * dx;
    const projY = p1.y + t * dy;

    return Math.hypot(point.x - projX, point.y - projY);
  }

  /**
   * Compare two segment objects for equality.
   */
  _segmentsEqual(seg1, seg2) {
    if (seg1 === seg2) return true;
    if (!seg1 || !seg2) return false;
    return (
      seg1.p1?.x === seg2.p1?.x &&
      seg1.p1?.y === seg2.p1?.y &&
      seg1.p2?.x === seg2.p2?.x &&
      seg1.p2?.y === seg2.p2?.y
    );
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
    // Clean up measure mode if active
    if (this.measureMode) {
      this.measureMode = false;
      this.sceneModel.measureMode = false;
      this.sceneModel.measureHoverSegment = null;
      this.sceneModel.measureSelectedPoints = [];
      this.sceneModel.measureClickDirect = false;
      if (this._boundKeyUp) {
        window.removeEventListener("keyup", this._boundKeyUp);
        this._boundKeyUp = null;
      }
    }
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
