/**
 * Skeleton Edit Behavior System
 *
 * This module implements a rule-based editing system for skeleton points,
 * mirroring the architecture of edit-behavior.js for path points.
 *
 * Key concepts:
 * - Skeleton points can be on-curve (type: null) or off-curve (type: "cubic")
 * - On-curve points can be smooth (smooth: true) or sharp (smooth: false)
 * - When moving a smooth on-curve point, adjacent off-curve handles rotate to maintain tangent
 * - When moving an off-curve handle, the opposite handle of a smooth point rotates too
 * - Rules are applied bidirectionally (both prev and next handles are affected)
 */

import * as vector from "@fontra/core/vector.js";

// Point type flags for rule matching
// Note: ANY = SHA | SMO | OFF (doesn't include NIL)
export const NIL = 1 << 0; // Does not exist (boundary)
export const SEL = 1 << 1; // Selected
export const UNS = 1 << 2; // Unselected
export const SHA = 1 << 3; // Sharp On-Curve
export const SMO = 1 << 4; // Smooth On-Curve
export const OFF = 1 << 5; // Off-Curve
export const ANY = SHA | SMO | OFF; // Any point type (not including NIL)

/**
 * Get the type flags for a skeleton point
 */
function getPointFlags(point, isSelected) {
  if (!point) return NIL;

  let flags = 0;

  // Off-curve vs on-curve
  if (point.type === "cubic" || point.type === "quad") {
    flags |= OFF;
  } else {
    // On-curve point - check smooth flag
    if (point.smooth) {
      flags |= SMO;
    } else {
      flags |= SHA;
    }
  }

  // Selected state
  if (isSelected) {
    flags |= SEL;
  } else {
    flags |= UNS;
  }

  return flags;
}

/**
 * Check if a point matches a rule pattern
 */
function matchesPattern(flags, pattern) {
  // Handle NIL (no point / boundary)
  if (flags & NIL) {
    return !!(pattern & NIL);
  }

  // For non-NIL points, check type and selection
  const hasTypePattern = pattern & (OFF | SMO | SHA);
  const typeMatch =
    !hasTypePattern || // No type specified means any type
    ((pattern & OFF) && (flags & OFF)) ||
    ((pattern & SMO) && (flags & SMO)) ||
    ((pattern & SHA) && (flags & SHA));

  if (!typeMatch) {
    return false;
  }

  // Check selection match (SEL, UNS) - must be checked if specified
  const hasSelPattern = pattern & (SEL | UNS);
  if (hasSelPattern) {
    const selMatch =
      ((pattern & SEL) && (flags & SEL)) || ((pattern & UNS) && (flags & UNS));
    if (!selMatch) {
      return false;
    }
  }

  return true;
}

/**
 * Find matching rule for a point in context, checking both directions
 */
function findMatchingRule(rules, pointIndex, points, selectedIndices, isClosed) {
  const numPoints = points.length;
  const isSelected = (idx) => selectedIndices.has(idx);

  const getFlags = (idx) => {
    if (idx < 0 || idx >= numPoints) {
      if (!isClosed) return NIL;
      const wrappedIdx = ((idx % numPoints) + numPoints) % numPoints;
      return getPointFlags(points[wrappedIdx], isSelected(wrappedIdx));
    }
    return getPointFlags(points[idx], isSelected(idx));
  };

  // Get flags for the point and its neighbors
  const flags = [
    getFlags(pointIndex - 3),
    getFlags(pointIndex - 2),
    getFlags(pointIndex - 1),
    getFlags(pointIndex),
    getFlags(pointIndex + 1),
    getFlags(pointIndex + 2),
    getFlags(pointIndex + 3),
  ];

  // Try to match rules in both forward and backward directions
  for (const rule of rules) {
    const [rPPP, rPP, rP, rT, rN, rNN, constrain, action] = rule;
    const pattern = [rPPP, rPP, rP, rT, rN, rNN];

    // Try forward direction
    if (
      matchesPattern(flags[0], pattern[0]) &&
      matchesPattern(flags[1], pattern[1]) &&
      matchesPattern(flags[2], pattern[2]) &&
      matchesPattern(flags[3], pattern[3]) &&
      matchesPattern(flags[4], pattern[4]) &&
      matchesPattern(flags[5], pattern[5])
    ) {
      return { action, constrain, pointIndex, direction: 1 };
    }

    // Try backward direction (reverse the pattern around thePoint)
    const reversedPattern = [pattern[5], pattern[4], pattern[3], pattern[2], pattern[1], pattern[0]];
    if (
      matchesPattern(flags[1], reversedPattern[0]) &&
      matchesPattern(flags[2], reversedPattern[1]) &&
      matchesPattern(flags[3], reversedPattern[2]) &&
      matchesPattern(flags[4], reversedPattern[3]) &&
      matchesPattern(flags[5], reversedPattern[4]) &&
      matchesPattern(flags[6], reversedPattern[5])
    ) {
      return { action, constrain, pointIndex, direction: -1 };
    }
  }

  return null;
}

/**
 * Constrain a vector to horizontal, vertical, or 45-degree diagonal
 */
export function constrainHorVerDiag(vec) {
  const constrainedVector = { ...vec };
  const ax = Math.abs(vec.x);
  const ay = Math.abs(vec.y);
  let tan;
  if (ax < 0.001) {
    tan = 0;
  } else {
    tan = ay / ax;
  }
  if (0.414 < tan && tan < 2.414) {
    // between 22.5 and 67.5 degrees
    const d = 0.5 * (ax + ay);
    constrainedVector.x = d * Math.sign(constrainedVector.x);
    constrainedVector.y = d * Math.sign(constrainedVector.y);
  } else if (ax > ay) {
    constrainedVector.y = 0;
  } else {
    constrainedVector.x = 0;
  }
  return constrainedVector;
}

// Action factories - create functions that compute new point positions
// Each action respects the `direction` parameter:
// direction = 1: prev is "before", next is "after" (normal)
// direction = -1: prev is "after", next is "before" (reversed)
const actionFactories = {
  /**
   * Don't move the point
   */
  DontMove: (context) => {
    return (delta, editedPoints) => {
      return { ...context.thePoint };
    };
  },

  /**
   * Move the point by delta
   */
  Move: (context) => {
    return (delta, editedPoints) => {
      return {
        ...context.thePoint,
        x: context.thePoint.x + delta.x,
        y: context.thePoint.y + delta.y,
      };
    };
  },

  /**
   * Rotate handle to maintain tangent direction when anchor moves
   * Uses direction to determine which anchor to follow
   */
  RotateNext: (context) => {
    // With direction, "prev" is the anchor we're attached to
    const anchor = context.direction === 1 ? context.prev : context.next;
    const anchorIndex = context.direction === 1 ? context.prevIndex : context.nextIndex;
    const tangentRef = context.direction === 1 ? context.prevPrev : context.nextNext;
    const tangentRefIndex = context.direction === 1 ? context.prevPrevIndex : context.nextNextIndex;

    if (!anchor) return actionFactories.DontMove(context);

    const handleVector = vector.subVectors(context.thePoint, anchor);
    const handleLength = Math.hypot(handleVector.x, handleVector.y);

    return (delta, editedPoints) => {
      const editedAnchor = editedPoints[anchorIndex] || anchor;
      const editedTangentRef = editedPoints[tangentRefIndex] || tangentRef;

      if (!editedTangentRef) {
        return { ...context.thePoint };
      }

      const tangent = vector.subVectors(editedAnchor, editedTangentRef);
      if (!tangent.x && !tangent.y) {
        return { ...context.thePoint };
      }

      const angle = Math.atan2(tangent.y, tangent.x);
      return {
        ...context.thePoint,
        x: editedAnchor.x + handleLength * Math.cos(angle),
        y: editedAnchor.y + handleLength * Math.sin(angle),
      };
    };
  },

  /**
   * Keep handle on the same line as anchor-tangentRef
   */
  ConstrainPrevAngle: (context) => {
    const anchor = context.direction === 1 ? context.prev : context.next;
    const tangentRef = context.direction === 1 ? context.prevPrev : context.nextNext;

    if (!tangentRef || !anchor) return actionFactories.Move(context);

    const tangent = vector.subVectors(anchor, tangentRef);
    const perpVector = vector.rotateVector90CW(tangent);

    return (delta, editedPoints) => {
      const newPoint = {
        x: context.thePoint.x + delta.x,
        y: context.thePoint.y + delta.y,
      };

      const intersection = vector.intersect(
        tangentRef,
        anchor,
        newPoint,
        vector.addVectors(newPoint, perpVector)
      );

      if (!intersection) {
        return { ...context.thePoint, ...newPoint };
      }
      return { ...context.thePoint, ...intersection };
    };
  },

  /**
   * Find intersection of two handle directions
   */
  HandleIntersect: (context) => {
    const { prev, thePoint, next } = context;
    if (!prev || !next) return actionFactories.Move(context);

    const handlePrev = vector.subVectors(thePoint, prev);
    const handleNext = vector.subVectors(thePoint, next);

    return (delta, editedPoints) => {
      const editedPrev = editedPoints[context.prevIndex] || prev;
      const editedNext = editedPoints[context.nextIndex] || next;

      const intersection = vector.intersect(
        editedPrev,
        vector.addVectors(editedPrev, handlePrev),
        editedNext,
        vector.addVectors(editedNext, handleNext)
      );

      if (!intersection) {
        return { ...context.thePoint };
      }
      return { ...context.thePoint, ...intersection };
    };
  },

  /**
   * Constrain handle to 0/45/90 degrees from anchor
   */
  ConstrainHandle: (context) => {
    const anchor = context.direction === 1 ? context.prev : context.next;
    const anchorIndex = context.direction === 1 ? context.prevIndex : context.nextIndex;

    if (!anchor) return actionFactories.Move(context);

    return (delta, editedPoints, constrainDelta) => {
      const editedAnchor = editedPoints[anchorIndex] || anchor;
      const newPoint = {
        x: context.thePoint.x + delta.x,
        y: context.thePoint.y + delta.y,
      };
      const handleVector = constrainDelta(vector.subVectors(newPoint, editedAnchor));
      return {
        ...context.thePoint,
        x: editedAnchor.x + handleVector.x,
        y: editedAnchor.y + handleVector.y,
      };
    };
  },

  /**
   * Move with the anchor (for handles attached to selected on-curve)
   */
  MoveWithAnchor: (context) => {
    const anchor = context.direction === 1 ? context.prev : context.next;
    const anchorIndex = context.direction === 1 ? context.prevIndex : context.nextIndex;

    if (!anchor) return actionFactories.Move(context);

    const offset = vector.subVectors(context.thePoint, anchor);

    return (delta, editedPoints) => {
      const editedAnchor = editedPoints[anchorIndex] || anchor;
      return {
        ...context.thePoint,
        x: editedAnchor.x + offset.x,
        y: editedAnchor.y + offset.y,
      };
    };
  },
};

// Rules for skeleton point editing
// Format: [prevPrevPrev, prevPrev, prev, thePoint, next, nextNext, constrain, action]
// Rules are tried in both forward and backward directions
// prettier-ignore
const defaultRules = [
  // Default rule: move selected points
  [ANY | NIL, ANY | NIL, ANY | NIL, ANY | SEL, ANY | NIL, ANY | NIL, false, "Move"],

  // Unselected off-curve next to smooth point that's next to selected point -> rotate
  // This handles the case: selected_point - smooth - off_curve
  [ANY | NIL, ANY | SEL, SMO | UNS, OFF | UNS, ANY | NIL, ANY | NIL, false, "RotateNext"],

  // Selected smooth point: neighboring off-curve should rotate
  // This handles: any - smooth_selected - off_curve
  [ANY | NIL, ANY | NIL, SMO | SEL, OFF | UNS, ANY | NIL, ANY | NIL, false, "RotateNext"],

  // Unselected off-curve attached to selected on-curve -> move with it
  [ANY | NIL, ANY | NIL, SMO | SEL, OFF | UNS, ANY | NIL, ANY | NIL, false, "MoveWithAnchor"],
  [ANY | NIL, ANY | NIL, SHA | SEL, OFF | UNS, ANY | NIL, ANY | NIL, false, "MoveWithAnchor"],

  // Off-curve between two on-curve points, one selected -> find intersection
  [ANY | NIL, SMO | SHA, OFF | UNS, SMO | SHA | SEL, ANY | NIL, ANY | NIL, false, "HandleIntersect"],
];

// prettier-ignore
const constrainRules = defaultRules.concat([
  // Constrain handle to 0/45/90 degrees
  [ANY | NIL, ANY | NIL, SMO | SHA | UNS, OFF | SEL, ANY | NIL, ANY | NIL, false, "ConstrainHandle"],
  [ANY | NIL, ANY | NIL, SMO | SHA | SEL, OFF | SEL, ANY | NIL, ANY | NIL, false, "ConstrainPrevAngle"],
]);

/**
 * SkeletonEditBehavior - manages editing of skeleton points
 */
export class SkeletonEditBehavior {
  constructor(skeletonData, contourIndex, selectedPointIndices, useConstraint = false) {
    this.skeletonData = skeletonData;
    this.contourIndex = contourIndex;
    this.contour = skeletonData.contours[contourIndex];
    this.points = this.contour.points;
    this.isClosed = this.contour.isClosed;
    this.selectedIndices = new Set(selectedPointIndices);
    this.rules = useConstraint ? constrainRules : defaultRules;
    this.constrainDelta = useConstraint ? constrainHorVerDiag : (v) => v;

    // Build edit functions for each point
    this.editFuncs = this._buildEditFuncs();

    // Store original positions for rollback
    this.originalPositions = this.points.map((p) => ({ x: p.x, y: p.y }));
  }

  _buildEditFuncs() {
    const editFuncs = [];
    const numPoints = this.points.length;

    for (let i = 0; i < numPoints; i++) {
      const match = findMatchingRule(
        this.rules,
        i,
        this.points,
        this.selectedIndices,
        this.isClosed
      );

      if (!match) continue;

      // Build context for action factory
      const getPoint = (idx) => {
        if (idx < 0 || idx >= numPoints) {
          if (!this.isClosed) return null;
          return this.points[((idx % numPoints) + numPoints) % numPoints];
        }
        return this.points[idx];
      };

      const context = {
        direction: match.direction,
        prevPrevPrevIndex: this._wrapIndex(i - 3),
        prevPrevIndex: this._wrapIndex(i - 2),
        prevIndex: this._wrapIndex(i - 1),
        thePointIndex: i,
        nextIndex: this._wrapIndex(i + 1),
        nextNextIndex: this._wrapIndex(i + 2),
        nextNextNextIndex: this._wrapIndex(i + 3),
        prevPrevPrev: getPoint(i - 3),
        prevPrev: getPoint(i - 2),
        prev: getPoint(i - 1),
        thePoint: this.points[i],
        next: getPoint(i + 1),
        nextNext: getPoint(i + 2),
        nextNextNext: getPoint(i + 3),
      };

      const factory = actionFactories[match.action];
      if (!factory) {
        console.warn(`Unknown action: ${match.action}`);
        continue;
      }

      const actionFunc = factory(context);
      editFuncs.push({
        pointIndex: i,
        constrain: match.constrain,
        apply: actionFunc,
      });
    }

    // Sort: non-constrain actions first, then constrain actions
    editFuncs.sort((a, b) => (a.constrain ? 1 : 0) - (b.constrain ? 1 : 0));

    return editFuncs;
  }

  _wrapIndex(idx) {
    if (!this.isClosed) return idx;
    const n = this.points.length;
    return ((idx % n) + n) % n;
  }

  /**
   * Apply a delta to all affected points
   * Returns array of { pointIndex, x, y } for changed points
   */
  applyDelta(delta) {
    const constrainedDelta = this.constrainDelta(delta);
    const editedPoints = {};
    const changes = [];

    for (const { pointIndex, apply, constrain } of this.editFuncs) {
      const d = constrain ? constrainedDelta : delta;
      const newPos = apply(d, editedPoints, this.constrainDelta);

      editedPoints[pointIndex] = newPos;
      changes.push({
        pointIndex,
        x: Math.round(newPos.x),
        y: Math.round(newPos.y),
      });
    }

    return changes;
  }

  /**
   * Get rollback data to restore original positions
   */
  getRollback() {
    return this.editFuncs.map(({ pointIndex }) => ({
      pointIndex,
      x: this.originalPositions[pointIndex].x,
      y: this.originalPositions[pointIndex].y,
    }));
  }
}

/**
 * Create a SkeletonEditBehavior for the given selection
 */
export function createSkeletonEditBehavior(
  skeletonData,
  selectedSkeletonPoints,
  useConstraint = false
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
        new SkeletonEditBehavior(skeletonData, contourIdx, pointIndices, useConstraint)
      );
    }
  }

  return behaviors;
}
