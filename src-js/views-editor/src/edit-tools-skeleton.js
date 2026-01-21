import { Bezier } from "bezier-js";
import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector, consolidateChanges, applyChange } from "@fontra/core/changes.js";
import { translate } from "@fontra/core/localization.js";
import { parseSelection } from "@fontra/core/utils.js";
import { packContour } from "@fontra/core/var-path.js";
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
      // Clear insert handles preview when hovering over points
      if (this.sceneModel.skeletonInsertHandles) {
        delete this.sceneModel.skeletonInsertHandles;
        this.canvasController.requestUpdate();
      }
    } else {
      if (this.sceneController.hoverSelection?.size) {
        this.sceneController.hoverSelection = new Set();
        this.canvasController.requestUpdate();
      }

      // Check for Alt+hover on skeleton centerline for handle preview
      const prevInsertHandles = this.sceneModel.skeletonInsertHandles;
      let newInsertHandles = null;

      if (event.altKey) {
        const centerlineHit = this._hitTestSkeletonCenterline(event);
        if (centerlineHit) {
          // Calculate preview handle positions at 1/3 and 2/3 along the segment
          const skeletonData = this._getSkeletonData();
          if (skeletonData) {
            const contour = skeletonData.contours[centerlineHit.contourIndex];
            if (contour) {
              const startIdx = centerlineHit.segmentStartIndex;
              const endIdx = centerlineHit.segmentEndIndex;

              // Check if segment is a line (no existing off-curves)
              let isLinearSegment = true;
              if (centerlineHit.isClosingSegment) {
                // Check wrapping
                for (let j = startIdx + 1; j < contour.points.length; j++) {
                  if (contour.points[j].type) {
                    isLinearSegment = false;
                    break;
                  }
                }
                if (isLinearSegment) {
                  for (let j = 0; j < endIdx; j++) {
                    if (contour.points[j].type) {
                      isLinearSegment = false;
                      break;
                    }
                  }
                }
              } else {
                isLinearSegment = endIdx - startIdx === 1;
              }

              // Only show preview for linear segments
              if (isLinearSegment) {
                const startPoint = contour.points[startIdx];
                const endPoint = contour.points[endIdx];
                if (startPoint && endPoint) {
                  const handle1 = {
                    x: Math.round(startPoint.x + (endPoint.x - startPoint.x) / 3),
                    y: Math.round(startPoint.y + (endPoint.y - startPoint.y) / 3),
                  };
                  const handle2 = {
                    x: Math.round(startPoint.x + ((endPoint.x - startPoint.x) * 2) / 3),
                    y: Math.round(startPoint.y + ((endPoint.y - startPoint.y) * 2) / 3),
                  };
                  newInsertHandles = {
                    points: [handle1, handle2],
                    startPoint: startPoint,
                    endPoint: endPoint,
                  };
                }
              }
            }
          }
        }
      }

      // Update preview if changed
      if (!this._insertHandlesEqual(prevInsertHandles, newInsertHandles)) {
        this.sceneModel.skeletonInsertHandles = newInsertHandles;
        this.canvasController.requestUpdate();
      }
    }
  }

  _getSkeletonData() {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph?.glyph?.canEdit) return null;

    const varGlyph = positionedGlyph.varGlyph;
    if (!varGlyph?.glyph?.layers) return null;

    const editLayerName = this.sceneController.editingLayerNames?.[0];
    if (!editLayerName) return null;

    const layer = varGlyph.glyph.layers[editLayerName];
    if (!layer) return null;

    return layer.customData?.[SKELETON_CUSTOM_DATA_KEY];
  }

  _insertHandlesEqual(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.points?.length !== b.points?.length) return false;
    for (let i = 0; i < (a.points?.length || 0); i++) {
      if (a.points[i].x !== b.points[i].x || a.points[i].y !== b.points[i].y) {
        return false;
      }
    }
    return true;
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
    delete this.sceneModel.skeletonInsertHandles;
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
      // Check if clicking on first point should close the contour
      const { skeletonPoint: selectedSkeletonPoints } = parseSelection(
        this.sceneController.selection
      );

      if (selectedSkeletonPoints?.size === 1) {
        const selectedKey = [...selectedSkeletonPoints][0];
        const [selectedContourIdx, selectedPointIdx] = selectedKey.split("/").map(Number);

        // Check if we should close the contour
        if (selectedContourIdx === skeletonHit.contourIndex) {
          const skeletonData = this._getSkeletonData();
          if (skeletonData) {
            const contour = skeletonData.contours[selectedContourIdx];
            if (contour && !contour.isClosed && contour.points.length >= 2) {
              const lastPointIdx = contour.points.length - 1;
              const clickedOnFirst = skeletonHit.pointIndex === 0;
              const clickedOnLast = skeletonHit.pointIndex === lastPointIdx;
              const selectedFirst = selectedPointIdx === 0;
              const selectedLast = selectedPointIdx === lastPointIdx;

              // Close contour if: (selected last and clicked first) or (selected first and clicked last)
              if ((selectedLast && clickedOnFirst) || (selectedFirst && clickedOnLast)) {
                await this._handleCloseSkeletonContour(
                  eventStream,
                  initialEvent,
                  selectedContourIdx
                );
                return;
              }
            }
          }
        }
      }

      // Select the clicked skeleton point
      this.sceneController.selection = new Set([
        `skeletonPoint/${skeletonHit.contourIndex}/${skeletonHit.pointIndex}`,
      ]);
      // Defer dragging to the Pointer Tool by consuming the drag without action
      // (The Pointer Tool will handle dragging if user tries to drag skeleton points)
      eventStream.done();
      return;
    }

    // Check if we clicked on a skeleton centerline (to insert point or handles)
    const centerlineHit = this._hitTestSkeletonCenterline(initialEvent);

    if (centerlineHit) {
      if (initialEvent.altKey) {
        // Alt+click: Insert handles (convert line to curve)
        await this._handleInsertSkeletonHandles(eventStream, initialEvent, centerlineHit);
      } else {
        // Normal click: Insert point on skeleton centerline
        await this._handleInsertSkeletonPoint(eventStream, initialEvent, centerlineHit);
      }
    } else {
      // Add new skeleton point
      await this._handleAddSkeletonPoint(eventStream, initialEvent);
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

    // Use a larger margin for centerline hit testing since it's a thin line
    // Regular path hit testing uses mouseClickMargin / 2, we use 1.5x for easier targeting
    const margin = this.sceneController.mouseClickMargin * 1.5;

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
        } else {
          // Bezier curve - collect control points and do bezier hit testing
          const bezierPoints = [startPoint];
          for (let j = startIdx + 1; j < endIdx; j++) {
            bezierPoints.push(points[j]);
          }
          bezierPoints.push(endPoint);

          const hitResult = this._pointToBezierDistance(glyphPoint, bezierPoints);
          if (hitResult && hitResult.distance <= margin) {
            return {
              contourIndex,
              segmentStartIndex: startIdx,
              segmentEndIndex: endIdx,
              t: hitResult.t,
              point: hitResult.point,
            };
          }
        }
      }

      // For closed contours, also test the closing segment
      if (contour.isClosed && onCurveIndices.length >= 2) {
        const lastIdx = onCurveIndices[onCurveIndices.length - 1];
        const firstIdx = onCurveIndices[0];
        const startPoint = points[lastIdx];
        const endPoint = points[firstIdx];

        // Check for off-curve points in closing segment (wrapping around)
        const closingOffCurves = [];
        for (let j = lastIdx + 1; j < points.length; j++) {
          if (points[j].type) closingOffCurves.push(points[j]);
        }
        for (let j = 0; j < firstIdx; j++) {
          if (points[j].type) closingOffCurves.push(points[j]);
        }

        let hitResult;
        if (closingOffCurves.length === 0) {
          // Line segment
          hitResult = this._pointToLineSegmentDistance(glyphPoint, startPoint, endPoint);
        } else {
          // Bezier curve
          const bezierPoints = [startPoint, ...closingOffCurves, endPoint];
          hitResult = this._pointToBezierDistance(glyphPoint, bezierPoints);
        }

        if (hitResult && hitResult.distance <= margin) {
          return {
            contourIndex,
            segmentStartIndex: lastIdx,
            segmentEndIndex: firstIdx,
            t: hitResult.t,
            point: hitResult.point,
            isClosingSegment: true,
            hasClosingOffCurves: closingOffCurves.length > 0,
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
   * Calculate distance from a point to a bezier curve.
   * Returns { distance, t, point } where t is the parameter along the curve
   * and point is the closest point on the curve.
   */
  _pointToBezierDistance(point, bezierPoints) {
    if (bezierPoints.length < 2) return null;

    let bezier;
    if (bezierPoints.length === 2) {
      // Line - use line segment distance
      return this._pointToLineSegmentDistance(point, bezierPoints[0], bezierPoints[1]);
    } else if (bezierPoints.length === 3) {
      // Quadratic bezier
      bezier = new Bezier(
        bezierPoints[0].x,
        bezierPoints[0].y,
        bezierPoints[1].x,
        bezierPoints[1].y,
        bezierPoints[2].x,
        bezierPoints[2].y
      );
    } else if (bezierPoints.length === 4) {
      // Cubic bezier
      bezier = new Bezier(
        bezierPoints[0].x,
        bezierPoints[0].y,
        bezierPoints[1].x,
        bezierPoints[1].y,
        bezierPoints[2].x,
        bezierPoints[2].y,
        bezierPoints[3].x,
        bezierPoints[3].y
      );
    } else {
      // More than 4 points - approximate with cubic
      const p0 = bezierPoints[0];
      const p3 = bezierPoints[bezierPoints.length - 1];
      const p1 = bezierPoints[1];
      const p2 = bezierPoints[bezierPoints.length - 2];
      bezier = new Bezier(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    }

    // Find closest point on bezier using bezier-js project method
    const projected = bezier.project(point);

    return {
      distance: projected.d,
      t: projected.t,
      point: { x: projected.x, y: projected.y },
    };
  }

  /**
   * Insert two cubic handles on a skeleton line segment (Alt+click).
   * This converts a line segment to a cubic bezier curve.
   */
  async _handleInsertSkeletonHandles(eventStream, initialEvent, centerlineHit) {
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

      const startIdx = centerlineHit.segmentStartIndex;
      const endIdx = centerlineHit.segmentEndIndex;

      const startPoint = contour.points[startIdx];
      const endPoint = contour.points[endIdx];

      if (!startPoint || !endPoint) return;

      // Check if segment already has off-curve points - if so, don't add more
      let hasExistingOffCurves = false;
      if (centerlineHit.isClosingSegment) {
        // Check wrapping from lastOnCurve to firstOnCurve
        for (let j = startIdx + 1; j < contour.points.length; j++) {
          if (contour.points[j].type) {
            hasExistingOffCurves = true;
            break;
          }
        }
        if (!hasExistingOffCurves) {
          for (let j = 0; j < endIdx; j++) {
            if (contour.points[j].type) {
              hasExistingOffCurves = true;
              break;
            }
          }
        }
      } else {
        // Normal segment - check between start and end
        for (let j = startIdx + 1; j < endIdx; j++) {
          if (contour.points[j].type) {
            hasExistingOffCurves = true;
            break;
          }
        }
      }

      if (hasExistingOffCurves) {
        // Segment already has off-curves - silently ignore
        return;
      }

      // Calculate handle positions at 1/3 and 2/3 along the segment
      const handle1 = {
        x: Math.round(startPoint.x + (endPoint.x - startPoint.x) / 3),
        y: Math.round(startPoint.y + (endPoint.y - startPoint.y) / 3),
        type: "cubic",
        smooth: false,
      };
      const handle2 = {
        x: Math.round(startPoint.x + ((endPoint.x - startPoint.x) * 2) / 3),
        y: Math.round(startPoint.y + ((endPoint.y - startPoint.y) * 2) / 3),
        type: "cubic",
        smooth: false,
      };

      // Insert handles between the two on-curve points
      // Insert in order: startPoint, handle1, handle2, endPoint
      // So we insert handle2 first at startIdx + 1, then handle1 at startIdx + 1
      contour.points.splice(startIdx + 1, 0, handle1, handle2);

      // Record changes
      const changes = [];

      // 1. FIRST: Generate outline contours (updates skeletonData.generatedContourIndices)
      const staticGlyph = layer.glyph;
      const pathChange = recordChanges(staticGlyph, (sg) => {
        this._regenerateOutlineContours(sg, skeletonData);
      });
      changes.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

      // 2. THEN: Save skeletonData to customData (now with updated generatedContourIndices)
      const customDataChange = recordChanges(layer, (l) => {
        l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
      });
      changes.push(customDataChange.prefixed(["layers", editLayerName]));

      const combinedChange = new ChangeCollector().concat(...changes);
      await sendIncrementalChange(combinedChange.change);

      // Select both handles
      this.sceneController.selection = new Set([
        `skeletonPoint/${centerlineHit.contourIndex}/${startIdx + 1}`,
        `skeletonPoint/${centerlineHit.contourIndex}/${startIdx + 2}`,
      ]);

      return {
        changes: combinedChange,
        undoLabel: "Insert skeleton handles",
        broadcast: true,
      };
    });
  }

  /**
   * Insert a point on a skeleton centerline segment.
   */
  async _handleInsertSkeletonPoint(eventStream, initialEvent, centerlineHit) {
    // New points without off-curve handles should be angle (not smooth)
    const insertPoint = {
      x: Math.round(centerlineHit.point.x),
      y: Math.round(centerlineHit.point.y),
      type: null,
      smooth: false,
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

      // Determine insert position and handle bezier splitting
      const startIdx = centerlineHit.segmentStartIndex;
      const endIdx = centerlineHit.segmentEndIndex;

      // Check for off-curve points (including in closing segments)
      let hasOffCurve;
      if (centerlineHit.isClosingSegment) {
        // Use the hasClosingOffCurves flag from hit testing, or calculate it
        hasOffCurve = centerlineHit.hasClosingOffCurves || false;
        if (!centerlineHit.hasClosingOffCurves) {
          // Double-check by counting off-curves
          let offCurveCount = 0;
          for (let j = startIdx + 1; j < contour.points.length; j++) {
            if (contour.points[j].type) offCurveCount++;
          }
          for (let j = 0; j < endIdx; j++) {
            if (contour.points[j].type) offCurveCount++;
          }
          hasOffCurve = offCurveCount > 0;
        }
      } else {
        hasOffCurve = endIdx - startIdx > 1;
      }

      let insertIndex;
      let pointsToRemove = 0;
      let pointsToInsert = [insertPoint];

      if (centerlineHit.isClosingSegment && !hasOffCurve) {
        // For closing segment line, insert at the end
        insertIndex = contour.points.length;
      } else if (centerlineHit.isClosingSegment && hasOffCurve) {
        // For closing segment with bezier, handle wrap-around splitting
        const closingSegmentResult = this._splitClosingSegmentBezier(
          contour, startIdx, endIdx, centerlineHit.t, centerlineHit.point
        );
        contour.points = closingSegmentResult.newPoints;
        insertIndex = closingSegmentResult.newOnCurveIndex;
        pointsToRemove = 0;
        pointsToInsert = []; // Already handled in splitClosingSegmentBezier
      } else if (!hasOffCurve) {
        // Line segment - simple insert after startIdx
        insertIndex = startIdx + 1;
      } else {
        // Bezier curve - need to split the curve
        const bezierPoints = [contour.points[startIdx]];
        for (let j = startIdx + 1; j < endIdx; j++) {
          bezierPoints.push(contour.points[j]);
        }
        bezierPoints.push(contour.points[endIdx]);

        // Create bezier and split it
        let bezier;
        if (bezierPoints.length === 3) {
          bezier = new Bezier(
            bezierPoints[0].x, bezierPoints[0].y,
            bezierPoints[1].x, bezierPoints[1].y,
            bezierPoints[2].x, bezierPoints[2].y
          );
        } else if (bezierPoints.length === 4) {
          bezier = new Bezier(
            bezierPoints[0].x, bezierPoints[0].y,
            bezierPoints[1].x, bezierPoints[1].y,
            bezierPoints[2].x, bezierPoints[2].y,
            bezierPoints[3].x, bezierPoints[3].y
          );
        } else {
          // Approximate as cubic
          bezier = new Bezier(
            bezierPoints[0].x, bezierPoints[0].y,
            bezierPoints[1].x, bezierPoints[1].y,
            bezierPoints[bezierPoints.length - 2].x, bezierPoints[bezierPoints.length - 2].y,
            bezierPoints[bezierPoints.length - 1].x, bezierPoints[bezierPoints.length - 1].y
          );
        }

        // Split the bezier at t
        const split = bezier.split(centerlineHit.t);
        const left = split.left;
        const right = split.right;

        // Build new points array
        // Remove old off-curve points (between startIdx+1 and endIdx-1)
        insertIndex = startIdx + 1;
        pointsToRemove = endIdx - startIdx - 1;

        // Create new points: left handles, new on-curve, right handles
        pointsToInsert = [];

        // Left segment control points (skip first which is startPoint)
        if (bezierPoints.length === 3) {
          // Quadratic: left.points = [p0, cp, split_point]
          pointsToInsert.push({
            x: Math.round(left.points[1].x),
            y: Math.round(left.points[1].y),
            type: "cubic",
          });
        } else {
          // Cubic: left.points = [p0, cp1, cp2, split_point]
          pointsToInsert.push({
            x: Math.round(left.points[1].x),
            y: Math.round(left.points[1].y),
            type: "cubic",
          });
          pointsToInsert.push({
            x: Math.round(left.points[2].x),
            y: Math.round(left.points[2].y),
            type: "cubic",
          });
        }

        // The new on-curve point
        pointsToInsert.push({
          x: Math.round(centerlineHit.point.x),
          y: Math.round(centerlineHit.point.y),
          type: null,
          smooth: true, // Smooth since it's on a curve
        });

        // Right segment control points (skip first which is split_point and last which is endPoint)
        if (bezierPoints.length === 3) {
          // Quadratic: right.points = [split_point, cp, p2]
          pointsToInsert.push({
            x: Math.round(right.points[1].x),
            y: Math.round(right.points[1].y),
            type: "cubic",
          });
        } else {
          // Cubic: right.points = [split_point, cp1, cp2, p3]
          pointsToInsert.push({
            x: Math.round(right.points[1].x),
            y: Math.round(right.points[1].y),
            type: "cubic",
          });
          pointsToInsert.push({
            x: Math.round(right.points[2].x),
            y: Math.round(right.points[2].y),
            type: "cubic",
          });
        }
      }

      // Insert the new point(s)
      contour.points.splice(insertIndex, pointsToRemove, ...pointsToInsert);

      // Record changes
      const changes = [];

      // 1. FIRST: Generate outline contours (updates skeletonData.generatedContourIndices)
      const staticGlyph = layer.glyph;
      const pathChange = recordChanges(staticGlyph, (sg) => {
        this._regenerateOutlineContours(sg, skeletonData);
      });
      changes.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

      // 2. THEN: Save skeletonData to customData (now with updated generatedContourIndices)
      const customDataChange = recordChanges(layer, (l) => {
        l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
      });
      changes.push(customDataChange.prefixed(["layers", editLayerName]));

      const combinedChange = new ChangeCollector().concat(...changes);
      await sendIncrementalChange(combinedChange.change);

      // Select the new on-curve point
      // For bezier splits, the on-curve is after the left segment control points
      let newOnCurveIndex = insertIndex;
      if (hasOffCurve && !centerlineHit.isClosingSegment) {
        // Find the on-curve point in pointsToInsert
        for (let i = 0; i < pointsToInsert.length; i++) {
          if (pointsToInsert[i].type === null) {
            newOnCurveIndex = insertIndex + i;
            break;
          }
        }
      }
      this.sceneController.selection = new Set([
        `skeletonPoint/${centerlineHit.contourIndex}/${newOnCurveIndex}`,
      ]);

      return {
        changes: combinedChange,
        undoLabel: "Insert skeleton point",
        broadcast: true,
      };
    });
  }

  async _handleAddSkeletonPoint(eventStream, initialEvent) {
    const anchorPoint = this._getGlyphPoint(initialEvent);
    if (!anchorPoint) return;

    // New points without off-curve handles should be angle (not smooth)
    const newOnCurve = {
      x: Math.round(anchorPoint.x),
      y: Math.round(anchorPoint.y),
      type: null,
      smooth: false,
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

        // 1. FIRST: Generate outline contours (updates skeletonData.generatedContourIndices)
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          this._regenerateOutlineContours(sg, skeletonData);
        });
        changes.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        // 2. THEN: Save skeletonData to customData (now with updated generatedContourIndices)
        const customDataChange = recordChanges(layer, (l) => {
          if (!l.customData) {
            l.customData = {};
          }
          l.customData[SKELETON_CUSTOM_DATA_KEY] = JSON.parse(JSON.stringify(skeletonData));
        });
        changes.push(customDataChange.prefixed(["layers", editLayerName]));

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
        broadcast: true,
      };
    });
  }

  /**
   * Close a skeleton contour by setting isClosed to true.
   */
  async _handleCloseSkeletonContour(eventStream, initialEvent, contourIndex) {
    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const editLayerName = this.sceneController.editingLayerNames?.[0];
      if (!editLayerName || !glyph.layers[editLayerName]) {
        return;
      }

      const layer = glyph.layers[editLayerName];
      let skeletonData = layer.customData?.[SKELETON_CUSTOM_DATA_KEY];
      if (!skeletonData) return;

      // Deep clone
      skeletonData = JSON.parse(JSON.stringify(skeletonData));

      const contour = skeletonData.contours[contourIndex];
      if (!contour) return;

      // Close the contour
      contour.isClosed = true;

      // Record changes
      const changes = [];

      // 1. FIRST: Generate outline contours (updates skeletonData.generatedContourIndices)
      const staticGlyph = layer.glyph;
      const pathChange = recordChanges(staticGlyph, (sg) => {
        this._regenerateOutlineContours(sg, skeletonData);
      });
      changes.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

      // 2. THEN: Save skeletonData to customData (now with updated generatedContourIndices)
      const customDataChange = recordChanges(layer, (l) => {
        l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
      });
      changes.push(customDataChange.prefixed(["layers", editLayerName]));

      const combinedChange = new ChangeCollector().concat(...changes);
      await sendIncrementalChange(combinedChange.change);

      // Select the first point
      this.sceneController.selection = new Set([
        `skeletonPoint/${contourIndex}/0`,
      ]);

      return {
        changes: combinedChange,
        undoLabel: "Close skeleton contour",
        broadcast: true,
      };
    });

    eventStream.done();
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
    // Use insertContour with packContour to ensure changes are recorded properly
    const newGeneratedIndices = [];
    for (const contour of generatedContours) {
      const newIndex = staticGlyph.path.numContours;
      staticGlyph.path.insertContour(newIndex, packContour(contour));
      newGeneratedIndices.push(newIndex);
    }

    // Update generated contour indices
    skeletonData.generatedContourIndices = newGeneratedIndices;
  }

  /**
   * Split a closing segment bezier curve at parameter t.
   * Handles the wrap-around case where off-curves span from lastIdx to firstIdx.
   * @returns {{ newPoints: Array, newOnCurveIndex: number }}
   */
  _splitClosingSegmentBezier(contour, lastOnCurveIdx, firstOnCurveIdx, t, splitPoint) {
    const points = contour.points;

    // Collect the closing segment bezier points
    const bezierPoints = [points[lastOnCurveIdx]];
    for (let j = lastOnCurveIdx + 1; j < points.length; j++) {
      bezierPoints.push(points[j]);
    }
    for (let j = 0; j < firstOnCurveIdx; j++) {
      bezierPoints.push(points[j]);
    }
    bezierPoints.push(points[firstOnCurveIdx]);

    // Create bezier from points
    let bezier;
    if (bezierPoints.length === 3) {
      bezier = new Bezier(
        bezierPoints[0].x, bezierPoints[0].y,
        bezierPoints[1].x, bezierPoints[1].y,
        bezierPoints[2].x, bezierPoints[2].y
      );
    } else if (bezierPoints.length === 4) {
      bezier = new Bezier(
        bezierPoints[0].x, bezierPoints[0].y,
        bezierPoints[1].x, bezierPoints[1].y,
        bezierPoints[2].x, bezierPoints[2].y,
        bezierPoints[3].x, bezierPoints[3].y
      );
    } else {
      // Approximate as cubic using first and last control points
      bezier = new Bezier(
        bezierPoints[0].x, bezierPoints[0].y,
        bezierPoints[1].x, bezierPoints[1].y,
        bezierPoints[bezierPoints.length - 2].x, bezierPoints[bezierPoints.length - 2].y,
        bezierPoints[bezierPoints.length - 1].x, bezierPoints[bezierPoints.length - 1].y
      );
    }

    // Split the bezier at t
    const split = bezier.split(t);

    // Build new points array:
    // Keep on-curve points from firstOnCurve to lastOnCurve (the non-closing segments)
    // Then add: left half handles, new on-curve, right half handles
    const newPoints = [];

    // Copy points from firstOnCurve to lastOnCurve (inclusive)
    for (let j = firstOnCurveIdx; j <= lastOnCurveIdx; j++) {
      newPoints.push({ ...points[j] });
    }

    // Add left half control points (from split.left, skip first which is lastOnCurve)
    for (let k = 1; k < split.left.points.length - 1; k++) {
      newPoints.push({
        x: Math.round(split.left.points[k].x),
        y: Math.round(split.left.points[k].y),
        type: "cubic",
        smooth: false,
      });
    }

    // Add the new on-curve point
    const newOnCurveIndex = newPoints.length;
    newPoints.push({
      x: Math.round(splitPoint.x),
      y: Math.round(splitPoint.y),
      type: null,
      smooth: true,
    });

    // Add right half control points (from split.right, skip first which is the split point)
    for (let k = 1; k < split.right.points.length - 1; k++) {
      newPoints.push({
        x: Math.round(split.right.points[k].x),
        y: Math.round(split.right.points[k].y),
        type: "cubic",
        smooth: false,
      });
    }

    return { newPoints, newOnCurveIndex };
  }
}
