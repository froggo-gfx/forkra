/**
 * Skeleton Edit Behavior System
 *
 * This module implements a rule-based editing system for skeleton points,
 * reusing the exact same rules and matching infrastructure from edit-behavior.js
 */

import { createPointBehaviorExecutor } from "./edit-behavior.js";
import {
  ANY,
  NIL,
  OFF,
  SEL,
  SHA,
  SMO,
  UNS,
} from "./edit-behavior-support.js";

// Re-export flags for convenience
export { ANY, NIL, OFF, SEL, SHA, SMO, UNS };
// Shared point behavior rules live in edit-behavior.js.

/**
 * SkeletonEditBehavior - manages editing of skeleton points
 * Uses the same rule matching system as edit-behavior.js
 */
export class SkeletonEditBehavior {
  constructor(
    skeletonData,
    contourIndex,
    selectedPointIndices,
    behaviorName = "default",
    enableScalingEdit = false,
    roundFunc = Math.round
  ) {
    this.skeletonData = skeletonData;
    this.contourIndex = contourIndex;
    this.contour = skeletonData.contours[contourIndex];
    this.points = this.contour.points;
    this.isClosed = this.contour.isClosed;
    this.selectedIndices = new Set(selectedPointIndices);
    this.enableScalingEdit = enableScalingEdit;
    this.roundFunc = roundFunc;
    this.executor = createPointBehaviorExecutor({
      points: this.points,
      isClosed: this.isClosed,
      selectedIndices: this.selectedIndices,
      behaviorName,
      enableScalingEdit,
      roundFunc,
    });
    this.editFuncs = this.executor.editEntries;
    this.originalPositions = this.executor.originalPositions;
    this.constrainDelta = this.executor.constrainDelta;
  }

  applyDelta(delta, roundFunc = this.roundFunc) {
    return this.executor.applyDelta(delta, roundFunc);
  }

  getRollback() {
    return this.executor.getRollback();
  }
}

/**
 * Create a SkeletonEditBehavior for the given selection
 */
export function createSkeletonEditBehavior(
  skeletonData,
  selectedSkeletonPoints,
  behaviorName = "default",
  roundFunc = Math.round
) {
  // Group selected points by contour
  const byContour = new Map();

  for (const selKey of selectedSkeletonPoints) {
    const [contourIdx, pointIdx] = selKey.split("/").map(Number);
    if (!byContour.has(contourIdx)) {
      byContour.set(contourIdx, []);
    }
    byContour.get(contourIdx).push(pointIdx);
  }

  // Create behaviors for each contour
  const behaviors = [];
  for (const [contourIdx, pointIndices] of byContour) {
    if (contourIdx < skeletonData.contours.length) {
      behaviors.push(
        new SkeletonEditBehavior(
          skeletonData,
          contourIdx,
          pointIndices,
          behaviorName,
          false,
          roundFunc
        )
      );
    }
  }

  return behaviors;
}

/**
 * Helper to get behavior name from event modifiers.
 * Same logic as getBehaviorName in edit-tools-pointer.js
 */
export function getSkeletonBehaviorName(shiftKey, altKey) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[(shiftKey ? 1 : 0) + (altKey ? 2 : 0)];
}

/**
 * RibEditBehavior - Handles dragging of rib points (width control points).
 * Constrains movement to the normal direction and updates point width.
 */
export class RibEditBehavior {
  /**
   * @param {Object} skeletonData - The skeleton data
   * @param {number} contourIndex - Index of the contour
   * @param {number} pointIndex - Index of the on-curve point
   * @param {string} side - "left" or "right"
   * @param {Object} normal - The normal vector at this point
   * @param {Object} onCurvePoint - The on-curve point position
   */
  constructor(
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    normal,
    onCurvePoint,
    roundFunc = Math.round
  ) {
    this.skeletonData = skeletonData;
    this.contourIndex = contourIndex;
    this.pointIndex = pointIndex;
    this.side = side;
    this.normal = normal;
    this.onCurvePoint = onCurvePoint;
    this.roundFunc = roundFunc;

    const contour = skeletonData.contours[contourIndex];
    const point = contour.points[pointIndex];
    const defaultWidth = contour.defaultWidth || 20;

    // Store original half-widths
    if (side === "left") {
      this.originalHalfWidth = point.leftWidth !== undefined
        ? point.leftWidth
        : (point.width !== undefined ? point.width / 2 : defaultWidth / 2);
    } else {
      this.originalHalfWidth = point.rightWidth !== undefined
        ? point.rightWidth
        : (point.width !== undefined ? point.width / 2 : defaultWidth / 2);
    }

    // Minimum half-width (allow collapse to skeleton)
    this.minHalfWidth = 0;
  }

  /**
   * Constrain drag delta to the normal direction.
   * @param {Object} delta - The drag delta {x, y}
   * @returns {Object} Constrained delta projected onto normal
   */
  constrainToNormal(delta) {
    // For left side, positive projection means wider
    // For right side, negative projection means wider
    const sign = this.side === "left" ? 1 : -1;
    const dot = delta.x * this.normal.x + delta.y * this.normal.y;
    return {
      x: sign * dot * this.normal.x,
      y: sign * dot * this.normal.y,
    };
  }

  /**
   * Apply drag delta and return the new half-width.
   * @param {Object} delta - The drag delta {x, y}
   * @returns {Object} { halfWidth, widthChange } - New half-width and width change object
   */
  applyDelta(delta, constrainMode = null, roundFunc = this.roundFunc) {
    // Project delta onto normal
    const sign = this.side === "left" ? 1 : -1;
    const dot = delta.x * this.normal.x + delta.y * this.normal.y;
    const projectedDelta = sign * dot;

    // Calculate new half-width
    let newHalfWidth = this.originalHalfWidth + projectedDelta;

    // Clamp to minimum
    if (newHalfWidth < this.minHalfWidth) {
      newHalfWidth = this.minHalfWidth;
    }

    // Return the width change object
    return {
      contourIndex: this.contourIndex,
      pointIndex: this.pointIndex,
      side: this.side,
      halfWidth: roundFunc(newHalfWidth),
    };
  }

  /**
   * Get rollback data to restore original width.
   */
  getRollback() {
    return {
      contourIndex: this.contourIndex,
      pointIndex: this.pointIndex,
      side: this.side,
      halfWidth: Math.round(this.originalHalfWidth),
    };
  }
}

/**
 * Create a RibEditBehavior for the given rib point hit.
 * @param {Object} skeletonData - The skeleton data
 * @param {Object} ribHit - Hit test result from _hitTestRibPoints
 * @returns {RibEditBehavior} The behavior instance
 */
export function createRibEditBehavior(skeletonData, ribHit) {
  const { contourIndex, pointIndex, side, normal, onCurvePoint } = ribHit;
  return new RibEditBehavior(
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    normal,
    onCurvePoint,
    ribHit.roundFunc || Math.round
  );
}

/**
 * EditableRibBehavior - Handles dragging of editable rib points.
 * - Width follows normal component by default.
 * - Nudge follows tangent only when constrained (e.g. Shift).
 * - Constrain modes can lock width or nudge.
 */
export class EditableRibBehavior {
  /**
   * @param {Object} skeletonData - The skeleton data
   * @param {number} contourIndex - Index of the contour
   * @param {number} pointIndex - Index of the on-curve point
   * @param {string} side - "left" or "right"
   * @param {Object} normal - The normal vector at this point
   * @param {Object} onCurvePoint - The on-curve point position
   */
  constructor(
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    normal,
    onCurvePoint,
    roundFunc = Math.round
  ) {
    this.skeletonData = skeletonData;
    this.contourIndex = contourIndex;
    this.pointIndex = pointIndex;
    this.side = side;
    this.normal = normal;
    this.tangent = { x: -normal.y, y: normal.x }; // Perpendicular to normal
    this.onCurvePoint = onCurvePoint;
    this.roundFunc = roundFunc;

    const contour = skeletonData.contours[contourIndex];
    const point = contour.points[pointIndex];
    const points = contour.points;
    const defaultWidth = contour.defaultWidth || 20;

    // Store original half-width
    if (side === "left") {
      this.originalHalfWidth = point.leftWidth !== undefined
        ? point.leftWidth
        : (point.width !== undefined ? point.width / 2 : defaultWidth / 2);
    } else {
      this.originalHalfWidth = point.rightWidth !== undefined
        ? point.rightWidth
        : (point.width !== undefined ? point.width / 2 : defaultWidth / 2);
    }

    // Store original nudge
    const nudgeKey = side === "left" ? "leftNudge" : "rightNudge";
    this.originalNudge = point[nudgeKey] || 0;

    // Minimum half-width (allow collapse to skeleton)
    this.minHalfWidth = 0;

    // Store original 2D handle offsets for compensation when nudge changes
    // This ensures handles stay in place when rib point moves
    this._initHandleOffsets(point, points, pointIndex, side);
  }

  /**
   * Initialize handle offset tracking for nudge compensation.
   */
  _initHandleOffsets(point, points, pointIndex, side) {
    // Compute skeleton handle directions
    this.skeletonHandleInDir = null;
    this.skeletonHandleOutDir = null;

    const prevIdx = (pointIndex - 1 + points.length) % points.length;
    if (points[prevIdx]?.type) {
      const dx = points[prevIdx].x - point.x;
      const dy = points[prevIdx].y - point.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.001) {
        this.skeletonHandleInDir = { x: dx / len, y: dy / len };
      }
    }

    const nextIdx = (pointIndex + 1) % points.length;
    if (points[nextIdx]?.type) {
      const dx = points[nextIdx].x - point.x;
      const dy = points[nextIdx].y - point.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.001) {
        this.skeletonHandleOutDir = { x: dx / len, y: dy / len };
      }
    }

    // Read existing 2D offsets or convert from 1D
    const handleInXKey = side === "left" ? "leftHandleInOffsetX" : "rightHandleInOffsetX";
    const handleInYKey = side === "left" ? "leftHandleInOffsetY" : "rightHandleInOffsetY";
    const handleOutXKey = side === "left" ? "leftHandleOutOffsetX" : "rightHandleOutOffsetX";
    const handleOutYKey = side === "left" ? "leftHandleOutOffsetY" : "rightHandleOutOffsetY";
    const handleIn1DKey = side === "left" ? "leftHandleInOffset" : "rightHandleInOffset";
    const handleOut1DKey = side === "left" ? "leftHandleOutOffset" : "rightHandleOutOffset";

    const has2DIn = point[handleInXKey] !== undefined || point[handleInYKey] !== undefined;
    const has2DOut = point[handleOutXKey] !== undefined || point[handleOutYKey] !== undefined;

    // Check if any handle offsets exist (2D or 1D)
    this.hasHandleOffsets = has2DIn || has2DOut ||
      point[handleIn1DKey] !== undefined || point[handleOut1DKey] !== undefined;

    if (has2DIn) {
      this.originalHandleInOffsetX = point[handleInXKey] || 0;
      this.originalHandleInOffsetY = point[handleInYKey] || 0;
    } else if (point[handleIn1DKey]) {
      const dir = this.skeletonHandleInDir || this.tangent;
      this.originalHandleInOffsetX = dir.x * point[handleIn1DKey];
      this.originalHandleInOffsetY = dir.y * point[handleIn1DKey];
    } else {
      this.originalHandleInOffsetX = 0;
      this.originalHandleInOffsetY = 0;
    }

    if (has2DOut) {
      this.originalHandleOutOffsetX = point[handleOutXKey] || 0;
      this.originalHandleOutOffsetY = point[handleOutYKey] || 0;
    } else if (point[handleOut1DKey]) {
      const dir = this.skeletonHandleOutDir || this.tangent;
      this.originalHandleOutOffsetX = dir.x * point[handleOut1DKey];
      this.originalHandleOutOffsetY = dir.y * point[handleOut1DKey];
    } else {
      this.originalHandleOutOffsetX = 0;
      this.originalHandleOutOffsetY = 0;
    }
  }

  /**
   * Apply drag delta and return changes to width and nudge.
   * - With constrainMode: lock to tangent or normal direction
   * Also compensates 2D handle offsets when nudge changes to keep handles stationary.
   * @param {Object} delta - The drag delta {x, y}
   * @param {string|null} constrainMode - null (free), "tangent" (nudge only), or "normal" (width only)
   * @returns {Object} { halfWidth, nudge, handleInOffsetX/Y, handleOutOffsetX/Y }
   */
  applyDelta(delta, constrainMode = null, roundFunc = this.roundFunc) {
    let newNudge = this.originalNudge;
    let newHalfWidth = this.originalHalfWidth;

    // Constrain to tangent: only nudge changes
    if (constrainMode === "tangent") {
      const tangentDot = delta.x * this.tangent.x + delta.y * this.tangent.y;
      newNudge = this.originalNudge + tangentDot;
    }
    // Constrain to normal: only width changes
    else if (constrainMode === "normal") {
      const sign = this.side === "left" ? 1 : -1;
      const normalDot = delta.x * this.normal.x + delta.y * this.normal.y;
      const normalDelta = sign * normalDot;
      newHalfWidth = this.originalHalfWidth + normalDelta;
      if (newHalfWidth < this.minHalfWidth) {
        newHalfWidth = this.minHalfWidth;
      }
    }
    // Free movement (no constraint): width only (tangent requires Shift)
    else {
      const sign = this.side === "left" ? 1 : -1;
      const normalDot = delta.x * this.normal.x + delta.y * this.normal.y;
      const normalDelta = sign * normalDot;
      newHalfWidth = this.originalHalfWidth + normalDelta;
      if (newHalfWidth < this.minHalfWidth) {
        newHalfWidth = this.minHalfWidth;
      }
    }

    const result = {
      contourIndex: this.contourIndex,
      pointIndex: this.pointIndex,
      side: this.side,
      halfWidth: roundFunc(newHalfWidth),
      nudge: roundFunc(newNudge),
    };

    // Note: we don't compensate handle offsets here.
    // Handles should move WITH the rib point in normal drag mode.
    // Handle offset compensation (keeping handles stationary) is only done
    // in InterpolatingRibBehavior (Alt+drag).

    return result;
  }

  /**
   * Get rollback data to restore original width, nudge, and handle offsets.
   */
  getRollback() {
    const result = {
      contourIndex: this.contourIndex,
      pointIndex: this.pointIndex,
      side: this.side,
      halfWidth: Math.round(this.originalHalfWidth),
      nudge: Math.round(this.originalNudge),
    };

    if (this.hasHandleOffsets) {
      result.handleInOffsetX = Math.round(this.originalHandleInOffsetX);
      result.handleInOffsetY = Math.round(this.originalHandleInOffsetY);
      result.handleOutOffsetX = Math.round(this.originalHandleOutOffsetX);
      result.handleOutOffsetY = Math.round(this.originalHandleOutOffsetY);
      result.hasHandleOffsets = true;
    }

    return result;
  }

  /**
   * Set the original half-width.
   * Use this for single-sided mode where halfWidth = totalWidth.
   */
  setOriginalHalfWidth(halfWidth) {
    this.originalHalfWidth = halfWidth;
  }
}

/**
 * Create an EditableRibBehavior for editable rib points.
 * @param {Object} skeletonData - The skeleton data
 * @param {Object} ribHit - Hit test result from _hitTestRibPoints
 * @returns {EditableRibBehavior} The behavior instance
 */
export function createEditableRibBehavior(skeletonData, ribHit) {
  const { contourIndex, pointIndex, side, normal, onCurvePoint } = ribHit;
  return new EditableRibBehavior(
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    normal,
    onCurvePoint,
    ribHit.roundFunc || Math.round
  );
}

/**
 * InterpolatingRibBehavior - Handles dragging of editable rib points with Alt key.
 * The rib point slides along an interpolation axis:
 * - two handles: line between handles
 * - one handle: line between segment anchor and handle
 * Handles remain fixed in place while the rib point moves between them.
 * Uses 2D handle offsets for precise compensation.
 */
export class InterpolatingRibBehavior {
  /**
   * @param {Object} skeletonData - The skeleton data
   * @param {number} contourIndex - Index of the skeleton contour
   * @param {number} pointIndex - Index of the on-curve skeleton point
   * @param {string} side - "left" or "right"
   * @param {Object} normal - The normal vector at this point
   * @param {Object} onCurvePoint - The skeleton on-curve point position {x, y}
   * @param {Object|null} interpolationAxis - Axis data:
   *   { prevHandle, nextHandle, segmentAnchor, lineStart, lineEnd, hasPrevHandle, hasNextHandle }
   */
  constructor(
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    normal,
    onCurvePoint,
    interpolationAxis = null,
    roundFunc = Math.round
  ) {
    this.skeletonData = skeletonData;
    this.contourIndex = contourIndex;
    this.pointIndex = pointIndex;
    this.side = side;
    this.normal = normal;
    this.tangent = { x: -normal.y, y: normal.x };
    this.onCurvePoint = onCurvePoint;
    this.interpolationAxis = interpolationAxis || null;
    this.roundFunc = roundFunc;

    const contour = skeletonData.contours[contourIndex];
    const point = contour.points[pointIndex];
    const points = contour.points;
    const isClosed = !!contour.isClosed;
    const defaultWidth = contour.defaultWidth || 20;

    // Compute skeleton handle directions for 1D to 2D conversion
    // These are needed to correctly interpret existing 1D offsets
    this.skeletonHandleInDir = null;
    this.skeletonHandleOutDir = null;
    this.hasIncomingHandle = false;
    this.hasOutgoingHandle = false;

    // Incoming handle (previous point if it's off-curve). Respect open contour endpoints.
    const prevIdx = isClosed || pointIndex > 0 ? (pointIndex - 1 + points.length) % points.length : null;
    if (prevIdx !== null && points[prevIdx]?.type) {
      this.hasIncomingHandle = true;
      const dx = points[prevIdx].x - point.x;
      const dy = points[prevIdx].y - point.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.001) {
        this.skeletonHandleInDir = { x: dx / len, y: dy / len };
      }
    }

    // Outgoing handle (next point if it's off-curve). Respect open contour endpoints.
    const nextIdx = isClosed || pointIndex < points.length - 1 ? (pointIndex + 1) % points.length : null;
    if (nextIdx !== null && points[nextIdx]?.type) {
      this.hasOutgoingHandle = true;
      const dx = points[nextIdx].x - point.x;
      const dy = points[nextIdx].y - point.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.001) {
        this.skeletonHandleOutDir = { x: dx / len, y: dy / len };
      }
    }

    // Store original half-width
    if (side === "left") {
      this.originalHalfWidth = point.leftWidth !== undefined
        ? point.leftWidth
        : (point.width !== undefined ? point.width / 2 : defaultWidth / 2);
    } else {
      this.originalHalfWidth = point.rightWidth !== undefined
        ? point.rightWidth
        : (point.width !== undefined ? point.width / 2 : defaultWidth / 2);
    }

    // Store original nudge
    const nudgeKey = side === "left" ? "leftNudge" : "rightNudge";
    this.originalNudge = point[nudgeKey] || 0;

    // Store original 2D handle offsets (new format)
    // If only 1D offsets exist, convert them to 2D using skeleton handle direction
    const handleInXKey = side === "left" ? "leftHandleInOffsetX" : "rightHandleInOffsetX";
    const handleInYKey = side === "left" ? "leftHandleInOffsetY" : "rightHandleInOffsetY";
    const handleOutXKey = side === "left" ? "leftHandleOutOffsetX" : "rightHandleOutOffsetX";
    const handleOutYKey = side === "left" ? "leftHandleOutOffsetY" : "rightHandleOutOffsetY";
    const handleIn1DKey = side === "left" ? "leftHandleInOffset" : "rightHandleInOffset";
    const handleOut1DKey = side === "left" ? "leftHandleOutOffset" : "rightHandleOutOffset";

    // Check if 2D offsets exist
    const has2DIn = point[handleInXKey] !== undefined || point[handleInYKey] !== undefined;
    const has2DOut = point[handleOutXKey] !== undefined || point[handleOutYKey] !== undefined;

    if (has2DIn) {
      this.originalHandleInOffsetX = point[handleInXKey] || 0;
      this.originalHandleInOffsetY = point[handleInYKey] || 0;
    } else if (point[handleIn1DKey]) {
      // Convert 1D to 2D using the actual skeleton handle direction
      // The 1D offset was applied along skeletonHandleInDir, so use that for conversion
      const dir = this.skeletonHandleInDir || this.tangent;
      this.originalHandleInOffsetX = dir.x * point[handleIn1DKey];
      this.originalHandleInOffsetY = dir.y * point[handleIn1DKey];
    } else {
      this.originalHandleInOffsetX = 0;
      this.originalHandleInOffsetY = 0;
    }

    if (has2DOut) {
      this.originalHandleOutOffsetX = point[handleOutXKey] || 0;
      this.originalHandleOutOffsetY = point[handleOutYKey] || 0;
    } else if (point[handleOut1DKey]) {
      // Convert 1D to 2D using the actual skeleton handle direction
      // The 1D offset was applied along skeletonHandleOutDir, so use that for conversion
      const dir = this.skeletonHandleOutDir || this.tangent;
      this.originalHandleOutOffsetX = dir.x * point[handleOut1DKey];
      this.originalHandleOutOffsetY = dir.y * point[handleOut1DKey];
    } else {
      this.originalHandleOutOffsetX = 0;
      this.originalHandleOutOffsetY = 0;
    }

    // Calculate current rib point position
    this._recalculateRibPos();

    // Choose interpolation axis.
    const prevHandle = this.interpolationAxis?.prevHandle || null;
    const nextHandle = this.interpolationAxis?.nextHandle || null;
    const segmentAnchor = this.interpolationAxis?.segmentAnchor || null;
    let lineStart = this.interpolationAxis?.lineStart || null;
    let lineEnd = this.interpolationAxis?.lineEnd || null;

    if (!lineStart || !lineEnd) {
      if (prevHandle && nextHandle) {
        lineStart = prevHandle;
        lineEnd = nextHandle;
      } else if (prevHandle || nextHandle) {
        lineStart = segmentAnchor || this.originalRibPos;
        lineEnd = prevHandle || nextHandle;
      }
    }

    if (!lineStart || !lineEnd) {
      lineStart = this.originalRibPos;
      lineEnd = {
        x: this.originalRibPos.x + this.tangent.x,
        y: this.originalRibPos.y + this.tangent.y,
      };
    }

    this.hasIncomingHandle =
      this.interpolationAxis?.hasPrevHandle ?? this.hasIncomingHandle;
    this.hasOutgoingHandle =
      this.interpolationAxis?.hasNextHandle ?? this.hasOutgoingHandle;

    // Calculate the line direction from selected axis endpoints.
    this.lineDir = {
      x: lineEnd.x - lineStart.x,
      y: lineEnd.y - lineStart.y,
    };
    this.lineLength = Math.hypot(this.lineDir.x, this.lineDir.y);

    if (this.lineLength > 0.001) {
      this.lineDir.x /= this.lineLength;
      this.lineDir.y /= this.lineLength;
    } else {
      this.lineDir = { ...this.tangent };
      this.lineLength = 1;
    }
  }

  /**
   * Recalculate the original rib point position based on current originalHalfWidth.
   * Call this after overriding originalHalfWidth for single-sided mode.
   */
  _recalculateRibPos() {
    const sign = this.side === "left" ? 1 : -1;
    this.originalRibPos = {
      x: this.onCurvePoint.x + sign * this.normal.x * this.originalHalfWidth + this.tangent.x * this.originalNudge,
      y: this.onCurvePoint.y + sign * this.normal.y * this.originalHalfWidth + this.tangent.y * this.originalNudge,
    };
  }

  /**
   * Set the original half-width and recalculate rib position.
   * Use this for single-sided mode where halfWidth = totalWidth.
   */
  setOriginalHalfWidth(halfWidth) {
    this.originalHalfWidth = halfWidth;
    this._recalculateRibPos();
  }

  /**
   * Apply drag delta and return changes to nudge and 2D handle offsets.
   * Movement is constrained to the line between handles.
   * Handles stay fixed by compensating with 2D offsets.
   * @param {Object} delta - The drag delta {x, y}
   * @returns {Object} { nudge, handleInOffsetX/Y, handleOutOffsetX/Y, isInterpolation }
   */
  applyDelta(delta, constrainMode = null, roundFunc = this.roundFunc) {
    // Project drag delta onto the handle-handle line direction
    const deltaAlongLine = delta.x * this.lineDir.x + delta.y * this.lineDir.y;

    // Decompose line movement into tangent component (nudge)
    const lineDirDotTangent = this.lineDir.x * this.tangent.x + this.lineDir.y * this.tangent.y;
    const deltaNudge = lineDirDotTangent * deltaAlongLine;
    const newNudge = this.originalNudge + deltaNudge;

    // 2D compensation: handles must stay fixed in place
    // When rib point moves by tangent * deltaNudge, we need to add
    // an opposite offset to keep handles stationary
    const handleOffsetDeltaX = -this.tangent.x * deltaNudge;
    const handleOffsetDeltaY = -this.tangent.y * deltaNudge;

    const newHandleInOffsetX = this.originalHandleInOffsetX + (this.hasIncomingHandle ? handleOffsetDeltaX : 0);
    const newHandleInOffsetY = this.originalHandleInOffsetY + (this.hasIncomingHandle ? handleOffsetDeltaY : 0);
    const newHandleOutOffsetX = this.originalHandleOutOffsetX + (this.hasOutgoingHandle ? handleOffsetDeltaX : 0);
    const newHandleOutOffsetY = this.originalHandleOutOffsetY + (this.hasOutgoingHandle ? handleOffsetDeltaY : 0);

      return {
        contourIndex: this.contourIndex,
        pointIndex: this.pointIndex,
        side: this.side,
        halfWidth: roundFunc(this.originalHalfWidth),  // Keep width unchanged
        nudge: roundFunc(newNudge),
        handleInOffsetX: roundFunc(newHandleInOffsetX),
        handleInOffsetY: roundFunc(newHandleInOffsetY),
        handleOutOffsetX: roundFunc(newHandleOutOffsetX),
        handleOutOffsetY: roundFunc(newHandleOutOffsetY),
        isInterpolation: true,
      };
  }

  /**
   * Get rollback data to restore original nudge and 2D handle offsets.
   */
  getRollback() {
    return {
      contourIndex: this.contourIndex,
      pointIndex: this.pointIndex,
      side: this.side,
      halfWidth: Math.round(this.originalHalfWidth),
      nudge: Math.round(this.originalNudge),
      handleInOffsetX: Math.round(this.originalHandleInOffsetX),
      handleInOffsetY: Math.round(this.originalHandleInOffsetY),
      handleOutOffsetX: Math.round(this.originalHandleOutOffsetX),
      handleOutOffsetY: Math.round(this.originalHandleOutOffsetY),
      isInterpolation: true,
    };
  }
}

/**
 * Create an InterpolatingRibBehavior for Alt+drag of editable rib points.
 * @param {Object} skeletonData - The skeleton data
 * @param {Object} ribHit - Hit test result
 * @param {Object|null} interpolationAxis - Axis data
 * @returns {InterpolatingRibBehavior} The behavior instance
 */
export function createInterpolatingRibBehavior(skeletonData, ribHit, interpolationAxis = null) {
  const { contourIndex, pointIndex, side, normal, onCurvePoint } = ribHit;
  return new InterpolatingRibBehavior(
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    normal,
    onCurvePoint,
    interpolationAxis,
    ribHit.roundFunc || Math.round
  );
}

/**
 * EditableHandleBehavior - Handles dragging of editable generated control points (handles).
 * Movement is constrained to the direction of the corresponding skeleton handle.
 */
export class EditableHandleBehavior {
  /**
   * @param {Object} skeletonData - The skeleton data
   * @param {number} contourIndex - Index of the contour
   * @param {number} pointIndex - Index of the on-curve skeleton point
   * @param {string} side - "left" or "right"
   * @param {string} handleType - "in" or "out" (incoming or outgoing handle)
   * @param {Object} skeletonHandleDir - Normalized direction of skeleton handle
   */
  constructor(
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    handleType,
    skeletonHandleDir,
    roundFunc = Math.round
  ) {
    this.skeletonData = skeletonData;
    this.contourIndex = contourIndex;
    this.pointIndex = pointIndex;
    this.side = side;
    this.handleType = handleType;
    this.skeletonHandleDir = skeletonHandleDir;
    this.roundFunc = roundFunc;

    const contour = skeletonData.contours[contourIndex];
    const point = contour.points[pointIndex];

    // Get the appropriate offset key based on side and handle type
    this.offsetKey = side === "left"
      ? (handleType === "in" ? "leftHandleInOffset" : "leftHandleOutOffset")
      : (handleType === "in" ? "rightHandleInOffset" : "rightHandleOutOffset");

    // 2D offset keys (created by interpolation)
    const offsetXKey = side === "left"
      ? (handleType === "in" ? "leftHandleInOffsetX" : "leftHandleOutOffsetX")
      : (handleType === "in" ? "rightHandleInOffsetX" : "rightHandleOutOffsetX");
    const offsetYKey = side === "left"
      ? (handleType === "in" ? "leftHandleInOffsetY" : "leftHandleOutOffsetY")
      : (handleType === "in" ? "rightHandleInOffsetY" : "rightHandleOutOffsetY");

    // Check if 2D offsets exist (from interpolation)
    const has2D = point[offsetXKey] !== undefined || point[offsetYKey] !== undefined;

    if (has2D) {
      // Convert 2D offset to 1D by projecting onto skeletonHandleDir
      const offset2DX = point[offsetXKey] || 0;
      const offset2DY = point[offsetYKey] || 0;
      this.originalOffset = offset2DX * skeletonHandleDir.x + offset2DY * skeletonHandleDir.y;
    } else {
      // Use 1D offset directly
      this.originalOffset = point[this.offsetKey] || 0;
    }
  }

  /**
   * Apply drag delta and return the new offset.
   * Movement is constrained to skeleton handle direction.
   * @param {Object} delta - The drag delta {x, y}
   * @returns {Object} { contourIndex, pointIndex, side, handleType, offset }
   */
  applyDelta(delta, roundFunc = this.roundFunc) {
    // Project delta onto skeleton handle direction
    const projectedDelta = delta.x * this.skeletonHandleDir.x + delta.y * this.skeletonHandleDir.y;
    const newOffset = this.originalOffset + projectedDelta;

    return {
      contourIndex: this.contourIndex,
      pointIndex: this.pointIndex,
      side: this.side,
      handleType: this.handleType,
      offset: roundFunc(newOffset),
    };
  }

  /**
   * Get rollback data to restore original offset.
   */
  getRollback() {
    return {
      contourIndex: this.contourIndex,
      pointIndex: this.pointIndex,
      side: this.side,
      handleType: this.handleType,
      offset: Math.round(this.originalOffset),
    };
  }
}

/**
 * Create an EditableHandleBehavior for editable generated handles.
 * @param {Object} skeletonData - The skeleton data
 * @param {Object} handleInfo - Handle info from _getEditableHandleForGeneratedPoint
 * @param {Object} skeletonHandleDir - Normalized direction of skeleton handle
 * @returns {EditableHandleBehavior} The behavior instance
 */
export function createEditableHandleBehavior(skeletonData, handleInfo, skeletonHandleDir) {
  return new EditableHandleBehavior(
    skeletonData,
    handleInfo.skeletonContourIndex,
    handleInfo.skeletonPointIndex,
    handleInfo.side,
    handleInfo.handleType,
    skeletonHandleDir,
    handleInfo.roundFunc || Math.round
  );
}
