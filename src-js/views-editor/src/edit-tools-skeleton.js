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
  calculateNormalAtSkeletonPoint,
  getPointHalfWidth,
} from "@fontra/core/skeleton-contour-generator.js";
import { getGlyphInfoFromGlyphName } from "@fontra/core/glyph-data.js";
import { BaseTool } from "./edit-tools-base.js";

const SKELETON_CUSTOM_DATA_KEY = "fontra.skeleton";
const SKELETON_WIDTH_CAPITAL_BASE_KEY = "fontra.skeleton.capitalBase";
const SKELETON_WIDTH_LOWERCASE_BASE_KEY = "fontra.skeleton.lowercaseBase";
const SKELETON_WIDTH_CAPITAL_DISTRIBUTION_KEY = "fontra.skeleton.capitalDistribution";
const SKELETON_WIDTH_LOWERCASE_DISTRIBUTION_KEY = "fontra.skeleton.lowercaseDistribution";
const SKELETON_CAP_RADIUS_RATIO_KEY = "fontra.skeleton.capRadiusRatio";
const SKELETON_CAP_TENSION_KEY = "fontra.skeleton.capTension";
const SKELETON_CAP_ANGLE_KEY = "fontra.skeleton.capAngle";
const SKELETON_CAP_DISTANCE_KEY = "fontra.skeleton.capDistance";
const DEFAULT_WIDTH_CAPITAL_BASE = 60;
const DEFAULT_WIDTH_LOWERCASE_BASE = 60;
const DEFAULT_DISTRIBUTION = 0;
const DEFAULT_CAP_RADIUS_RATIO = 1 / 8;
const DEFAULT_CAP_TENSION = 0.55;
const DEFAULT_CAP_ANGLE = 0;
const DEFAULT_CAP_DISTANCE = 0;

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

  /**
   * Determine if the current glyph is lowercase or uppercase.
   * @returns {"lower" | "upper"} The glyph case
   */
  _getGlyphCase() {
    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    if (!glyphName) return "upper";
    const info = getGlyphInfoFromGlyphName(glyphName);
    return info?.case === "lower" ? "lower" : "upper";
  }

  /**
   * Get the default skeleton width from the current source's customData.
   * Automatically selects capital or lowercase width based on current glyph.
   * @returns {number} The default width value for new skeleton contours
   */
  _getDefaultSkeletonWidth() {
    const glyphCase = this._getGlyphCase();
    if (glyphCase === "lower") {
      return this._getSourceCustomDataValue(
        SKELETON_WIDTH_LOWERCASE_BASE_KEY,
        DEFAULT_WIDTH_LOWERCASE_BASE
      );
    }
    return this._getSourceCustomDataValue(
      SKELETON_WIDTH_CAPITAL_BASE_KEY,
      DEFAULT_WIDTH_CAPITAL_BASE
    );
  }

  _getSourceCustomDataValue(key, fallback) {
    const sourceIdentifier = this.sceneController.editingLayerNames?.[0];
    if (!sourceIdentifier) return fallback;
    const fontController = this.sceneController.sceneModel.fontController;
    const source = fontController.sources[sourceIdentifier];
    return source?.customData?.[key] ?? fallback;
  }

  _getDefaultSkeletonDistribution() {
    const glyphCase = this._getGlyphCase();
    if (glyphCase === "lower") {
      return this._getSourceCustomDataValue(
        SKELETON_WIDTH_LOWERCASE_DISTRIBUTION_KEY,
        DEFAULT_DISTRIBUTION
      );
    }
    return this._getSourceCustomDataValue(
      SKELETON_WIDTH_CAPITAL_DISTRIBUTION_KEY,
      DEFAULT_DISTRIBUTION
    );
  }

  _getDefaultSkeletonCapDefaults() {
    return {
      capRadiusRatio: this._getSourceCustomDataValue(
        SKELETON_CAP_RADIUS_RATIO_KEY,
        DEFAULT_CAP_RADIUS_RATIO
      ),
      capTension: this._getSourceCustomDataValue(
        SKELETON_CAP_TENSION_KEY,
        DEFAULT_CAP_TENSION
      ),
      capAngle: this._getSourceCustomDataValue(
        SKELETON_CAP_ANGLE_KEY,
        DEFAULT_CAP_ANGLE
      ),
      capDistance: this._getSourceCustomDataValue(
        SKELETON_CAP_DISTANCE_KEY,
        DEFAULT_CAP_DISTANCE
      ),
    };
  }

  _applyDefaultDistributionToPoint(point, contour, fallbackWidth) {
    const distribution = contour.defaultDistribution;
    if (!Number.isFinite(distribution) || Math.abs(distribution) < 1e-6) {
      return;
    }
    const clamped = Math.max(-100, Math.min(100, distribution));
    const totalWidth = contour.defaultWidth ?? fallbackWidth;
    const left = totalWidth * (0.5 + clamped / 200);
    const right = totalWidth - left;
    point.leftWidth = left;
    point.rightWidth = right;
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

  /**
   * Ensure a layer has skeleton data, copying from primary source if needed.
   * Used for multi-source editing when a layer doesn't have skeleton data yet.
   * @param {Object} layer - The layer to check
   * @param {Object} primarySkeletonData - Skeleton data to copy if layer has none
   * @returns {Object} The skeleton data (deep cloned)
   */
  _ensureSkeletonDataForLayer(layer, primarySkeletonData) {
    if (layer.customData?.[SKELETON_CUSTOM_DATA_KEY]) {
      return JSON.parse(JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY]));
    }
    // Copy skeleton structure from primary source
    return JSON.parse(JSON.stringify(primarySkeletonData));
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

    // Check if we're in "drawing mode" - have an endpoint of an open contour selected
    const { skeletonPoint: selectedSkeletonPoints } = parseSelection(
      this.sceneController.selection
    );
    const drawingContourIdx = this._getDrawingContourIndex(selectedSkeletonPoints);
    const isDrawingMode = drawingContourIdx !== null;

    // Check if we clicked on an existing skeleton point
    const skeletonHit = this._hitTestSkeletonPoints(initialEvent);

    if (skeletonHit) {
      // In drawing mode, only consider hits on the same contour (for closing)
      if (isDrawingMode && skeletonHit.contourIndex !== drawingContourIdx) {
        // Ignore hits on other contours - just add new point
        await this._handleAddSkeletonPoint(eventStream, initialEvent);
        return;
      }

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
      // In drawing mode, ignore centerline hits on other contours
      if (isDrawingMode && centerlineHit.contourIndex !== drawingContourIdx) {
        await this._handleAddSkeletonPoint(eventStream, initialEvent);
        return;
      }

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
   * Check if we're in drawing mode and return the contour index being drawn.
   * Returns contour index if an endpoint of an open contour is selected, null otherwise.
   */
  _getDrawingContourIndex(selectedSkeletonPoints) {
    if (!selectedSkeletonPoints || selectedSkeletonPoints.size !== 1) {
      return null;
    }

    const skeletonData = this._getSkeletonData();
    if (!skeletonData) return null;

    const selectedKey = [...selectedSkeletonPoints][0];
    const [contourIdx, pointIdx] = selectedKey.split("/").map(Number);

    const contour = skeletonData.contours[contourIdx];
    if (!contour || contour.isClosed) return null;

    // Count on-curve points
    const onCurveCount = contour.points.filter(p => !p.type).length;
    if (onCurveCount < 1) return null;

    // Find the on-curve index of the selected point
    let onCurveIdx = 0;
    for (let i = 0; i < pointIdx; i++) {
      if (!contour.points[i].type) onCurveIdx++;
    }

    // Check if selected point is an endpoint (first or last on-curve point)
    const isFirstOnCurve = onCurveIdx === 0 && !contour.points[pointIdx].type;
    const isLastOnCurve = onCurveIdx === onCurveCount - 1 && !contour.points[pointIdx].type;

    if (isFirstOnCurve || isLastOnCurve) {
      return contourIdx;
    }

    return null;
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
   * Hit test skeleton rib points (width control points).
   * Returns { contourIndex, pointIndex, side: "left"|"right", point } if hit, null otherwise.
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

    const glyphPoint = this._getGlyphPoint(event);
    if (!glyphPoint) return null;

    const margin = this.sceneController.mouseClickMargin;

    for (let contourIndex = 0; contourIndex < skeletonData.contours.length; contourIndex++) {
      const contour = skeletonData.contours[contourIndex];
      const defaultWidth = contour.defaultWidth || 20;

      for (let pointIndex = 0; pointIndex < contour.points.length; pointIndex++) {
        const skeletonPoint = contour.points[pointIndex];

        // Only test on-curve points
        if (skeletonPoint.type) continue;

        const normal = calculateNormalAtSkeletonPoint(contour, pointIndex);
        let leftHW = getPointHalfWidth(skeletonPoint, defaultWidth, "left");
        let rightHW = getPointHalfWidth(skeletonPoint, defaultWidth, "right");

        // Handle single-sided mode: redirect all width to one side
        const singleSided = contour.singleSided ?? false;
        const singleSidedDirection = contour.singleSidedDirection ?? "left";
        if (singleSided) {
          const totalWidth = leftHW + rightHW;
          if (singleSidedDirection === "left") {
            leftHW = totalWidth;
            rightHW = 0;
          } else {
            leftHW = 0;
            rightHW = totalWidth;
          }
        }

        // Per-side editable flags
        const isLeftEditable = skeletonPoint.leftEditable === true;
        const isRightEditable = skeletonPoint.rightEditable === true;

        // Apply nudge offset only if editable and width > 0 (matches generator behavior)
        const tangent = { x: -normal.y, y: normal.x };
        const leftNudge = (isLeftEditable && leftHW >= 0.5) ? (skeletonPoint.leftNudge || 0) : 0;
        const rightNudge = (isRightEditable && rightHW >= 0.5) ? (skeletonPoint.rightNudge || 0) : 0;

        // Calculate rib point positions (including nudge)
        const leftRibPoint = {
          x: skeletonPoint.x + normal.x * leftHW + tangent.x * leftNudge,
          y: skeletonPoint.y + normal.y * leftHW + tangent.y * leftNudge,
        };
        const rightRibPoint = {
          x: skeletonPoint.x - normal.x * rightHW + tangent.x * rightNudge,
          y: skeletonPoint.y - normal.y * rightHW + tangent.y * rightNudge,
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
      const allChanges = [];
      const startIdx = centerlineHit.segmentStartIndex;

      // Get primary skeleton data from the first layer that has it
      let primarySkeletonData = null;
      for (const layerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[layerName];
        if (layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) {
          primarySkeletonData = layer.customData[SKELETON_CUSTOM_DATA_KEY];
          break;
        }
      }
      if (!primarySkeletonData) return;

      // Apply changes to ALL editable layers (multi-source editing support)
      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer) continue;

        let skeletonData = this._ensureSkeletonDataForLayer(layer, primarySkeletonData);

        const contour = skeletonData.contours[centerlineHit.contourIndex];
        if (!contour) continue;

        const endIdx = centerlineHit.segmentEndIndex;
        const startPoint = contour.points[startIdx];
        const endPoint = contour.points[endIdx];

        if (!startPoint || !endPoint) continue;

        // Check if segment already has off-curve points - if so, don't add more
        let hasExistingOffCurves = false;
        if (centerlineHit.isClosingSegment) {
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
          for (let j = startIdx + 1; j < endIdx; j++) {
            if (contour.points[j].type) {
              hasExistingOffCurves = true;
              break;
            }
          }
        }

        if (hasExistingOffCurves) continue;

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

        contour.points.splice(startIdx + 1, 0, handle1, handle2);

        // Record changes for this layer
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          this._regenerateOutlineContours(sg, skeletonData);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        const customDataChange = recordChanges(layer, (l) => {
          l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      if (allChanges.length === 0) return;

      const combinedChange = new ChangeCollector().concat(...allChanges);
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
    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];
      const startIdx = centerlineHit.segmentStartIndex;
      const endIdx = centerlineHit.segmentEndIndex;
      let finalInsertIndex = startIdx + 1; // Will be updated for selection

      // Get primary skeleton data from the first layer that has it
      let primarySkeletonData = null;
      for (const layerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[layerName];
        if (layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) {
          primarySkeletonData = layer.customData[SKELETON_CUSTOM_DATA_KEY];
          break;
        }
      }
      if (!primarySkeletonData) return;

      // Apply changes to ALL editable layers (multi-source editing support)
      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer) continue;

        let skeletonData = this._ensureSkeletonDataForLayer(layer, primarySkeletonData);

        const contour = skeletonData.contours[centerlineHit.contourIndex];
        if (!contour) continue;

        // Check for off-curve points (including in closing segments)
        let hasOffCurve;
        if (centerlineHit.isClosingSegment) {
          hasOffCurve = centerlineHit.hasClosingOffCurves || false;
          if (!centerlineHit.hasClosingOffCurves) {
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
        let pointsToInsert = [{
          x: Math.round(centerlineHit.point.x),
          y: Math.round(centerlineHit.point.y),
          type: null,
          smooth: false,
        }];

        if (centerlineHit.isClosingSegment && !hasOffCurve) {
          insertIndex = contour.points.length;
        } else if (centerlineHit.isClosingSegment && hasOffCurve) {
          const closingSegmentResult = this._splitClosingSegmentBezier(
            contour, startIdx, endIdx, centerlineHit.t, centerlineHit.point
          );
          contour.points = closingSegmentResult.newPoints;
          insertIndex = closingSegmentResult.newOnCurveIndex;
          pointsToRemove = 0;
          pointsToInsert = [];
        } else if (!hasOffCurve) {
          insertIndex = startIdx + 1;
        } else {
          // Bezier curve - need to split the curve using this layer's actual points
          const bezierPoints = [contour.points[startIdx]];
          for (let j = startIdx + 1; j < endIdx; j++) {
            bezierPoints.push(contour.points[j]);
          }
          bezierPoints.push(contour.points[endIdx]);

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
            bezier = new Bezier(
              bezierPoints[0].x, bezierPoints[0].y,
              bezierPoints[1].x, bezierPoints[1].y,
              bezierPoints[bezierPoints.length - 2].x, bezierPoints[bezierPoints.length - 2].y,
              bezierPoints[bezierPoints.length - 1].x, bezierPoints[bezierPoints.length - 1].y
            );
          }

          const split = bezier.split(centerlineHit.t);
          const left = split.left;
          const right = split.right;

          insertIndex = startIdx + 1;
          pointsToRemove = endIdx - startIdx - 1;
          pointsToInsert = [];

          if (bezierPoints.length === 3) {
            pointsToInsert.push({
              x: Math.round(left.points[1].x),
              y: Math.round(left.points[1].y),
              type: "cubic",
            });
          } else {
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

          // The split point position for this layer
          const splitPoint = bezier.get(centerlineHit.t);
          pointsToInsert.push({
            x: Math.round(splitPoint.x),
            y: Math.round(splitPoint.y),
            type: null,
            smooth: true,
          });

          if (bezierPoints.length === 3) {
            pointsToInsert.push({
              x: Math.round(right.points[1].x),
              y: Math.round(right.points[1].y),
              type: "cubic",
            });
          } else {
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

        if (pointsToInsert.length > 0) {
          contour.points.splice(insertIndex, pointsToRemove, ...pointsToInsert);
        }

        // Track insert index for selection (from first layer)
        if (allChanges.length === 0) {
          finalInsertIndex = insertIndex;
          if (hasOffCurve && !centerlineHit.isClosingSegment) {
            for (let i = 0; i < pointsToInsert.length; i++) {
              if (pointsToInsert[i].type === null) {
                finalInsertIndex = insertIndex + i;
                break;
              }
            }
          }
        }

        // Record changes for this layer
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          this._regenerateOutlineContours(sg, skeletonData);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        const customDataChange = recordChanges(layer, (l) => {
          l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      if (allChanges.length === 0) return;

      const combinedChange = new ChangeCollector().concat(...allChanges);
      await sendIncrementalChange(combinedChange.change);

      this.sceneController.selection = new Set([
        `skeletonPoint/${centerlineHit.contourIndex}/${finalInsertIndex}`,
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
      // First, determine target contour from first layer (for selection logic)
      const firstLayerName = this.sceneController.editingLayerNames?.[0];
      if (!firstLayerName || !glyph.layers[firstLayerName]) {
        return;
      }

      const firstLayer = glyph.layers[firstLayerName];
      const firstSkeletonData = firstLayer.customData?.[SKELETON_CUSTOM_DATA_KEY];

      // Determine which contour to add to based on selection
      const { skeletonPoint: selectedSkeletonPoints } = parseSelection(
        this.sceneController.selection
      );

      let targetContourIndex = -1;
      let insertAtEnd = true;
      let creatingNewContour = false;

      if (selectedSkeletonPoints?.size === 1 && firstSkeletonData) {
        const selectedKey = [...selectedSkeletonPoints][0];
        const [contourIdx, pointIdx] = selectedKey.split("/").map(Number);

        if (contourIdx < firstSkeletonData.contours.length) {
          targetContourIndex = contourIdx;
          const contour = firstSkeletonData.contours[targetContourIndex];
          if (contour && !contour.isClosed) {
            insertAtEnd = pointIdx === contour.points.length - 1;
          }
        }
      }

      if (targetContourIndex < 0 || (firstSkeletonData && targetContourIndex >= firstSkeletonData.contours.length)) {
        creatingNewContour = true;
        targetContourIndex = firstSkeletonData ? firstSkeletonData.contours.length : 0;
      }

      // Now apply to all editable layers
      const layersData = {};
      let newPointIndex = 0;

      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer) continue;

        let skeletonData;
        if (layer.customData?.[SKELETON_CUSTOM_DATA_KEY]) {
          skeletonData = JSON.parse(JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY]));
        } else if (firstSkeletonData) {
          // Copy skeleton structure from primary layer for multi-source editing
          skeletonData = JSON.parse(JSON.stringify(firstSkeletonData));
        } else {
          skeletonData = createEmptySkeletonData();
        }

        // Add point to skeleton
          if (!creatingNewContour && targetContourIndex < skeletonData.contours.length) {
            const contour = skeletonData.contours[targetContourIndex];
            const fallbackWidth = this._getDefaultSkeletonWidth(skeletonData);
            const newPoint = { ...newOnCurve };
            this._applyDefaultDistributionToPoint(newPoint, contour, fallbackWidth);
            if (insertAtEnd) {
              contour.points.push(newPoint);
              newPointIndex = contour.points.length - 1;
            } else {
              contour.points.unshift(newPoint);
              newPointIndex = 0;
            }
          } else {
            // Create new contour with default width from source
            const defaultWidth = this._getDefaultSkeletonWidth(skeletonData);
            const newContour = createSkeletonContour(false, defaultWidth);
            const capDefaults = this._getDefaultSkeletonCapDefaults();
            newContour.capRadiusRatio = capDefaults.capRadiusRatio;
            newContour.capTension = capDefaults.capTension;
            newContour.capAngle = capDefaults.capAngle;
            newContour.capDistance = capDefaults.capDistance;
            newContour.defaultDistribution = this._getDefaultSkeletonDistribution();
            const newPoint = { ...newOnCurve };
            this._applyDefaultDistributionToPoint(newPoint, newContour, defaultWidth);
            newContour.points.push(newPoint);
            skeletonData.contours.push(newContour);
            newPointIndex = 0;
          }

        layersData[editLayerName] = { layer, skeletonData };
      }

      if (Object.keys(layersData).length === 0) return;

      // Helper to record skeleton changes for all layers
      const recordAllLayersChange = () => {
        const allChanges = [];
        for (const [editLayerName, data] of Object.entries(layersData)) {
          const { layer, skeletonData } = data;
          const staticGlyph = layer.glyph;

          // 1. Record path changes (regenerate outline contours)
          const pathChange = recordChanges(staticGlyph, (sg) => {
            this._regenerateOutlineContours(sg, skeletonData);
          });
          allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

          // 2. Record customData change (save skeletonData)
          const customDataChange = recordChanges(layer, (l) => {
            if (!l.customData) {
              l.customData = {};
            }
            l.customData[SKELETON_CUSTOM_DATA_KEY] = JSON.parse(JSON.stringify(skeletonData));
          });
          allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
        }
        return new ChangeCollector().concat(...allChanges);
      };

      // === INITIAL CHANGE: Record adding on-curve point ===
      const initialChanges = recordAllLayersChange();
      await sendIncrementalChange(initialChanges.change);

      // Update selection to new point
      this.sceneController.selection = new Set([
        `skeletonPoint/${targetContourIndex}/${newPointIndex}`,
      ]);

      // NOTE: Drag-to-curve is disabled for skeleton pen tool to avoid
      // creating invalid segments with single control points.
      // Users should add curves via converting points or inserting handles manually.

      // Consume any remaining drag events without action
      for await (const event of eventStream) {
        // Just consume events
      }

      const finalChanges = initialChanges;

      return {
        changes: finalChanges,
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
      const allChanges = [];

      // Get primary skeleton data from the first layer that has it
      let primarySkeletonData = null;
      for (const layerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[layerName];
        if (layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) {
          primarySkeletonData = layer.customData[SKELETON_CUSTOM_DATA_KEY];
          break;
        }
      }
      if (!primarySkeletonData) return;

      // Apply to all editable layers
      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer) continue;

        let skeletonData = this._ensureSkeletonDataForLayer(layer, primarySkeletonData);

        const contour = skeletonData.contours[contourIndex];
        if (!contour) continue;

        // Close the contour
        contour.isClosed = true;

        // Record changes for this layer
        // 1. FIRST: Generate outline contours (updates skeletonData.generatedContourIndices)
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          this._regenerateOutlineContours(sg, skeletonData);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        // 2. THEN: Save skeletonData to customData (now with updated generatedContourIndices)
        const customDataChange = recordChanges(layer, (l) => {
          l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      if (allChanges.length === 0) return;

      const combinedChange = new ChangeCollector().concat(...allChanges);
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
