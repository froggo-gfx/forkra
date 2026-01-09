import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector, consolidateChanges, applyChange } from "@fontra/core/changes.js";
import { translate } from "@fontra/core/localization.js";
import { parseSelection } from "@fontra/core/utils.js";
import * as vector from "@fontra/core/vector.js";
import {
  generateContoursFromSkeleton,
  getSkeletonData,
  createEmptySkeletonData,
  createSkeletonContour,
} from "@fontra/core/skeleton-contour-generator.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import { constrainHorVerDiag } from "./edit-behavior.js";

const SKELETON_CUSTOM_DATA_KEY = "fontra.skeleton";

export class SkeletonPenTool extends BaseTool {
  iconPath = "/images/skeleton-pen.svg";
  identifier = "skeleton-pen-tool";

  handleHover(event) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      this.editor.tools["pointer-tool"].handleHover(event);
      return;
    }
    this.setCursor();

    // Check for hovering over existing skeleton points
    const skeletonHit = this._hitTestSkeletonPoints(event);
    if (skeletonHit) {
      const hoverKey = `skeletonPoint/${skeletonHit.contourIndex}/${skeletonHit.pointIndex}`;
      const prevHover = this.sceneModel.hoverSelection;
      const newHover = new Set([hoverKey]);

      if (!prevHover || !this._setsEqual(prevHover, newHover)) {
        this.sceneController.hoverSelection = newHover;
        this.canvasController.requestUpdate();
      }
    } else {
      if (this.sceneController.hoverSelection?.size) {
        this.sceneController.hoverSelection = new Set();
        this.canvasController.requestUpdate();
      }
    }
  }

  _setsEqual(setA, setB) {
    if (setA.size !== setB.size) return false;
    for (const item of setA) {
      if (!setB.has(item)) return false;
    }
    return true;
  }

  deactivate() {
    super.deactivate();
    this.sceneController.hoverSelection = new Set();
    this.canvasController.requestUpdate();
  }

  setCursor() {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      this.editor.tools["pointer-tool"].setCursor();
    } else {
      this.canvasController.canvas.style.cursor = "crosshair";
    }
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      await this.editor.tools["pointer-tool"].handleDrag(eventStream, initialEvent);
      return;
    }

    // Check if we clicked on an existing skeleton point
    const skeletonHit = this._hitTestSkeletonPoints(initialEvent);

    if (skeletonHit) {
      // Drag existing skeleton point
      await this._handleDragSkeletonPoint(eventStream, initialEvent, skeletonHit);
    } else {
      // Check if we clicked on a skeleton centerline (to insert point)
      const centerlineHit = this._hitTestSkeletonCenterline(initialEvent);

      if (centerlineHit) {
        // Insert point on skeleton centerline
        await this._handleInsertSkeletonPoint(eventStream, initialEvent, centerlineHit);
      } else {
        // Add new skeleton point
        await this._handleAddSkeletonPoint(eventStream, initialEvent);
      }
    }
  }

  /**
   * Get the positioned glyph adjusted point from a mouse event
   */
  _getGlyphPoint(event) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return null;

    const localPoint = this.sceneController.localPoint(event);
    return {
      x: localPoint.x - positionedGlyph.x,
      y: localPoint.y - positionedGlyph.y,
    };
  }

  _hitTestSkeletonPoints(event) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph?.glyph?.canEdit) {
      return null;
    }

    const varGlyph = positionedGlyph.varGlyph;
    if (!varGlyph?.glyph?.layers) {
      return null;
    }

    // Get the editing layer name
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

    const glyphPoint = this._getGlyphPoint(event);
    if (!glyphPoint) return null;

    const margin = this.sceneController.mouseClickMargin;

    for (let contourIndex = 0; contourIndex < skeletonData.contours.length; contourIndex++) {
      const contour = skeletonData.contours[contourIndex];
      for (let pointIndex = 0; pointIndex < contour.points.length; pointIndex++) {
        const skeletonPoint = contour.points[pointIndex];
        const dist = vector.distance(glyphPoint, skeletonPoint);
        if (dist <= margin) {
          return { contourIndex, pointIndex, point: { ...skeletonPoint } };
        }
      }
    }

    return null;
  }

  /**
   * Hit test skeleton centerlines to find a point on a line segment.
   * Returns { contourIndex, segmentIndex, t, point } if hit, null otherwise.
   */
  _hitTestSkeletonCenterline(event) {
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

    const glyphPoint = this._getGlyphPoint(event);
    if (!glyphPoint) return null;

    const margin = this.sceneController.mouseClickMargin;

    for (let contourIndex = 0; contourIndex < skeletonData.contours.length; contourIndex++) {
      const contour = skeletonData.contours[contourIndex];
      const points = contour.points;

      // Find on-curve points to define segments
      const onCurveIndices = [];
      for (let i = 0; i < points.length; i++) {
        if (!points[i].type) {
          onCurveIndices.push(i);
        }
      }

      if (onCurveIndices.length < 2) continue;

      // Test each segment between consecutive on-curve points
      for (let i = 0; i < onCurveIndices.length - 1; i++) {
        const startIdx = onCurveIndices[i];
        const endIdx = onCurveIndices[i + 1];
        const startPoint = points[startIdx];
        const endPoint = points[endIdx];

        // Check for off-curve points between them
        const hasOffCurve = endIdx - startIdx > 1;

        if (!hasOffCurve) {
          // Line segment - simple distance to line test
          const hitResult = this._pointToLineSegmentDistance(
            glyphPoint,
            startPoint,
            endPoint
          );
          if (hitResult.distance <= margin) {
            return {
              contourIndex,
              segmentStartIndex: startIdx,
              segmentEndIndex: endIdx,
              t: hitResult.t,
              point: hitResult.point,
            };
          }
        }
        // For curves with off-curve points, we'd need bezier hit testing
        // For now, skip curve segments for insertion
      }

      // For closed contours, also test the closing segment
      if (contour.isClosed && onCurveIndices.length >= 2) {
        const lastIdx = onCurveIndices[onCurveIndices.length - 1];
        const firstIdx = onCurveIndices[0];
        const startPoint = points[lastIdx];
        const endPoint = points[firstIdx];

        const hitResult = this._pointToLineSegmentDistance(
          glyphPoint,
          startPoint,
          endPoint
        );
        if (hitResult.distance <= margin) {
          return {
            contourIndex,
            segmentStartIndex: lastIdx,
            segmentEndIndex: firstIdx,
            t: hitResult.t,
            point: hitResult.point,
            isClosingSegment: true,
          };
        }
      }
    }

    return null;
  }

  /**
   * Calculate distance from a point to a line segment.
   * Returns { distance, t, point } where t is the parameter along the segment
   * and point is the closest point on the segment.
   */
  _pointToLineSegmentDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      // Degenerate segment (start == end)
      const dist = vector.distance(point, lineStart);
      return { distance: dist, t: 0, point: { ...lineStart } };
    }

    // Calculate t parameter (0 to 1)
    let t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    // Calculate closest point on segment
    const closestPoint = {
      x: lineStart.x + t * dx,
      y: lineStart.y + t * dy,
    };

    const distance = vector.distance(point, closestPoint);

    return { distance, t, point: closestPoint };
  }

  /**
   * Insert a point on a skeleton centerline segment.
   */
  async _handleInsertSkeletonPoint(eventStream, initialEvent, centerlineHit) {
    const insertPoint = {
      x: Math.round(centerlineHit.point.x),
      y: Math.round(centerlineHit.point.y),
      type: null,
      smooth: true,
    };

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const editLayerName = this.sceneController.editingLayerNames?.[0];
      if (!editLayerName || !glyph.layers[editLayerName]) {
        return;
      }

      const layer = glyph.layers[editLayerName];
      let skeletonData = layer.customData?.[SKELETON_CUSTOM_DATA_KEY];
      if (!skeletonData) return;

      skeletonData = JSON.parse(JSON.stringify(skeletonData));

      const contour = skeletonData.contours[centerlineHit.contourIndex];
      if (!contour) return;

      // Determine insert position
      // For a segment from startIdx to endIdx, insert after startIdx
      let insertIndex;
      if (centerlineHit.isClosingSegment) {
        // For closing segment, insert at the end
        insertIndex = contour.points.length;
      } else {
        insertIndex = centerlineHit.segmentStartIndex + 1;
      }

      // Insert the new point
      contour.points.splice(insertIndex, 0, insertPoint);

      // Record changes
      const changes = [];

      const customDataChange = recordChanges(layer, (l) => {
        l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
      });
      changes.push(customDataChange.prefixed(["layers", editLayerName]));

      const staticGlyph = layer.glyph;
      const pathChange = recordChanges(staticGlyph, (sg) => {
        this._regenerateOutlineContours(sg, skeletonData);
      });
      changes.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

      const combinedChange = new ChangeCollector().concat(...changes);
      await sendIncrementalChange(combinedChange.change);

      // Select the new point
      this.sceneController.selection = new Set([
        `skeletonPoint/${centerlineHit.contourIndex}/${insertIndex}`,
      ]);

      return {
        changes: combinedChange,
        undoLabel: "Insert skeleton point",
      };
    });
  }

  async _handleAddSkeletonPoint(eventStream, initialEvent) {
    const anchorPoint = this._getGlyphPoint(initialEvent);
    if (!anchorPoint) return;

    const newOnCurve = {
      x: Math.round(anchorPoint.x),
      y: Math.round(anchorPoint.y),
      type: null,
      smooth: true,
    };

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const editLayerName = this.sceneController.editingLayerNames?.[0];
      if (!editLayerName || !glyph.layers[editLayerName]) {
        return;
      }

      // Get current skeleton data from layer
      const layer = glyph.layers[editLayerName];
      let skeletonData = layer.customData?.[SKELETON_CUSTOM_DATA_KEY];
      if (!skeletonData) {
        skeletonData = createEmptySkeletonData();
      } else {
        skeletonData = JSON.parse(JSON.stringify(skeletonData));
      }

      // Determine which contour to add to based on selection
      const { skeletonPoint: selectedSkeletonPoints } = parseSelection(
        this.sceneController.selection
      );

      let targetContourIndex = -1;
      let insertAtEnd = true;
      let prevSelectedPointIsOnCurve = true;

      if (selectedSkeletonPoints?.size === 1) {
        const selectedKey = [...selectedSkeletonPoints][0];
        const [contourIdx, pointIdx] = selectedKey.split("/").map(Number);

        if (contourIdx < skeletonData.contours.length) {
          targetContourIndex = contourIdx;
          const contour = skeletonData.contours[targetContourIndex];
          if (contour && !contour.isClosed) {
            insertAtEnd = pointIdx === contour.points.length - 1;
            const selectedPoint = contour.points[pointIdx];
            prevSelectedPointIsOnCurve = !selectedPoint?.type;
          }
        }
      }

      // Add point to skeleton
      let newPointIndex;
      if (targetContourIndex >= 0 && targetContourIndex < skeletonData.contours.length) {
        const contour = skeletonData.contours[targetContourIndex];
        if (insertAtEnd) {
          contour.points.push({ ...newOnCurve });
          newPointIndex = contour.points.length - 1;
        } else {
          contour.points.unshift({ ...newOnCurve });
          newPointIndex = 0;
        }
      } else {
        // Create new contour
        const newContour = createSkeletonContour(false);
        newContour.points.push({ ...newOnCurve });
        skeletonData.contours.push(newContour);
        targetContourIndex = skeletonData.contours.length - 1;
        newPointIndex = 0;
      }

      // Record initial change (add on-curve point)
      const sendChanges = async () => {
        const changes = [];
        const customDataChange = recordChanges(layer, (l) => {
          if (!l.customData) {
            l.customData = {};
          }
          l.customData[SKELETON_CUSTOM_DATA_KEY] = JSON.parse(JSON.stringify(skeletonData));
        });
        changes.push(customDataChange.prefixed(["layers", editLayerName]));

        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          this._regenerateOutlineContours(sg, skeletonData);
        });
        changes.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        return new ChangeCollector().concat(...changes);
      };

      let combinedChange = await sendChanges();
      await sendIncrementalChange(combinedChange.change);

      // Update selection to new point
      this.sceneController.selection = new Set([
        `skeletonPoint/${targetContourIndex}/${newPointIndex}`,
      ]);

      // Check if user drags to create handles
      if (await shouldInitiateDrag(eventStream, initialEvent)) {
        // User is dragging - add handle(s)
        const contour = skeletonData.contours[targetContourIndex];

        // Add outgoing handle (off-curve point after the anchor for append, before for prepend)
        const handleOut = {
          x: newOnCurve.x,
          y: newOnCurve.y,
          type: "cubic",
          smooth: false,
        };

        // Determine handle position in the contour
        let handleOutIndex;
        if (insertAtEnd) {
          // Insert handle after on-curve point
          contour.points.push({ ...handleOut });
          handleOutIndex = contour.points.length - 1;
        } else {
          // Insert handle before on-curve point (at position 0)
          contour.points.unshift({ ...handleOut });
          handleOutIndex = 0;
          newPointIndex++; // The on-curve point moved
        }

        // If prev selected point was on-curve, add an "in" handle too for smooth connection
        let handleInIndex;
        if (prevSelectedPointIsOnCurve && contour.points.length >= 2) {
          const handleIn = {
            x: newOnCurve.x,
            y: newOnCurve.y,
            type: "cubic",
            smooth: false,
          };

          if (insertAtEnd) {
            // Insert handle before on-curve point
            const insertPos = newPointIndex;
            contour.points.splice(insertPos, 0, { ...handleIn });
            handleInIndex = insertPos;
            newPointIndex++;
            handleOutIndex++;
          } else {
            // Insert handle after on-curve point
            const insertPos = newPointIndex + 1;
            contour.points.splice(insertPos, 0, { ...handleIn });
            handleInIndex = insertPos;
          }
        }

        combinedChange = await sendChanges();
        await sendIncrementalChange(combinedChange.change);

        // Drag loop - update handle positions
        for await (const event of eventStream) {
          let handlePos = this._getGlyphPoint(event);
          if (!handlePos) continue;

          if (event.shiftKey) {
            // Constrain to horizontal/vertical/45°
            const delta = constrainHorVerDiag(vector.subVectors(handlePos, newOnCurve));
            handlePos = vector.addVectors(newOnCurve, delta);
          }

          handlePos = { x: Math.round(handlePos.x), y: Math.round(handlePos.y) };

          // Update outgoing handle
          const handleOutPoint = contour.points[handleOutIndex];
          handleOutPoint.x = handlePos.x;
          handleOutPoint.y = handlePos.y;

          // Update incoming handle (opposite direction for smooth)
          if (handleInIndex !== undefined) {
            const handleInPoint = contour.points[handleInIndex];
            const opposite = vector.addVectors(
              newOnCurve,
              vector.mulVectorScalar(vector.subVectors(handlePos, newOnCurve), -1)
            );
            handleInPoint.x = Math.round(opposite.x);
            handleInPoint.y = Math.round(opposite.y);
          }

          combinedChange = await sendChanges();
          await sendIncrementalChange(combinedChange.change, true);
        }

        // Select the outgoing handle
        this.sceneController.selection = new Set([
          `skeletonPoint/${targetContourIndex}/${handleOutIndex}`,
        ]);
      }

      combinedChange = await sendChanges();

      return {
        changes: combinedChange,
        undoLabel: "Add skeleton point",
      };
    });
  }

  async _handleDragSkeletonPoint(eventStream, initialEvent, skeletonHit) {
    const startGlyphPoint = this._getGlyphPoint(initialEvent);
    if (!startGlyphPoint) return;

    // Select the clicked point
    this.sceneController.selection = new Set([
      `skeletonPoint/${skeletonHit.contourIndex}/${skeletonHit.pointIndex}`,
    ]);

    if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
      return;
    }

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const editLayerName = this.sceneController.editingLayerNames?.[0];
      if (!editLayerName || !glyph.layers[editLayerName]) {
        return;
      }

      const layer = glyph.layers[editLayerName];
      let skeletonData = layer.customData?.[SKELETON_CUSTOM_DATA_KEY];
      if (!skeletonData) return;

      // Deep clone for manipulation
      skeletonData = JSON.parse(JSON.stringify(skeletonData));

      const originalPoint = { ...skeletonHit.point };

      for await (const event of eventStream) {
        const currentGlyphPoint = this._getGlyphPoint(event);
        if (!currentGlyphPoint) continue;

        let delta = vector.subVectors(currentGlyphPoint, startGlyphPoint);

        if (event.shiftKey) {
          delta = constrainHorVerDiag(delta);
        }

        // Update skeleton point position
        const contour = skeletonData.contours[skeletonHit.contourIndex];
        if (!contour) continue;

        const point = contour.points[skeletonHit.pointIndex];
        if (!point) continue;

        point.x = Math.round(originalPoint.x + delta.x);
        point.y = Math.round(originalPoint.y + delta.y);

        // Record changes
        const changes = [];

        // Update customData
        const customDataChange = recordChanges(layer, (l) => {
          l.customData[SKELETON_CUSTOM_DATA_KEY] = JSON.parse(JSON.stringify(skeletonData));
        });
        changes.push(customDataChange.prefixed(["layers", editLayerName]));

        // Regenerate path
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          this._regenerateOutlineContours(sg, skeletonData);
        });
        changes.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        const combinedChange = new ChangeCollector().concat(...changes);
        await sendIncrementalChange(combinedChange.change, true);
      }

      // Final change
      const finalChanges = [];

      const finalCustomDataChange = recordChanges(layer, (l) => {
        l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
      });
      finalChanges.push(finalCustomDataChange.prefixed(["layers", editLayerName]));

      const staticGlyph = layer.glyph;
      const finalPathChange = recordChanges(staticGlyph, (sg) => {
        this._regenerateOutlineContours(sg, skeletonData);
      });
      finalChanges.push(finalPathChange.prefixed(["layers", editLayerName, "glyph"]));

      const finalCombinedChange = new ChangeCollector().concat(...finalChanges);

      return {
        changes: finalCombinedChange,
        undoLabel: "Move skeleton point",
      };
    });
  }

  _regenerateOutlineContours(staticGlyph, skeletonData) {
    // Get indices of previously generated contours
    const oldGeneratedIndices = skeletonData.generatedContourIndices || [];

    // Remove old generated contours (in reverse order to maintain indices)
    const sortedIndices = [...oldGeneratedIndices].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
      if (idx < staticGlyph.path.numContours) {
        staticGlyph.path.deleteContour(idx);
      }
    }

    // Generate new contours from skeleton
    const generatedContours = generateContoursFromSkeleton(skeletonData);

    // Add new contours and track their indices
    const newGeneratedIndices = [];
    for (const contour of generatedContours) {
      const newIndex = staticGlyph.path.numContours;
      staticGlyph.path.appendUnpackedContour(contour);
      newGeneratedIndices.push(newIndex);
    }

    // Update generated contour indices
    skeletonData.generatedContourIndices = newGeneratedIndices;
  }
}
