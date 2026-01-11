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
 */

import * as vector from "@fontra/core/vector.js";

// Point type flags for rule matching
export const ANY = 1; // Any point type
export const NIL = 2; // No point (boundary)
export const OFF = 4; // Off-curve point (handle)
export const SEL = 8; // Selected
export const SHA = 16; // Sharp (corner) point
export const SMO = 32; // Smooth point
export const UNS = 64; // Unselected

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
 *
 * Pattern flags:
 * - ANY: match any point type (OFF/SMO/SHA) - used for "don't care" positions
 * - NIL: match when there's no point (boundary)
 * - OFF/SMO/SHA: match specific point types
 * - SEL/UNS: match selection state
 *
 * When ANY is combined with SEL/UNS, it means "any type but must match selection"
 * When ANY is combined with NIL, it means "any point or no point"
 */
function matchesPattern(flags, pattern) {
  // Handle NIL (no point / boundary)
  if (flags & NIL) {
    // NIL point matches if pattern allows NIL
    return !!(pattern & NIL);
  }

  // For non-NIL points, check type and selection

  // Check type match: ANY matches all types, or specific type must match
  const hasTypePattern = pattern & (OFF | SMO | SHA);
  const typeMatch =
    (pattern & ANY) || // ANY matches any type
    ((pattern & OFF) && (flags & OFF)) ||
    ((pattern & SMO) && (flags & SMO)) ||
    ((pattern & SHA) && (flags & SHA));

  if (!typeMatch && hasTypePattern) {
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

  // If pattern is just ANY | NIL for neighbor positions, allow anything
  if ((pattern & ANY) && (pattern & NIL) && !hasSelPattern) {
    return true;
  }

  return typeMatch;
}

/**
 * Find matching rule for a point in context
 */
function findMatchingRule(rules, pointIndex, points, selectedIndices, isClosed) {
  const numPoints = points.length;
  const isSelected = (idx) => selectedIndices.has(idx);

  // Get point with wrapping for closed contours
  const getPoint = (idx) => {
    if (idx < 0 || idx >= numPoints) {
      if (!isClosed) return null;
      return points[((idx % numPoints) + numPoints) % numPoints];
    }
    return points[idx];
  };

  const getFlags = (idx) => {
    if (idx < 0 || idx >= numPoints) {
      if (!isClosed) return NIL;
      const wrappedIdx = ((idx % numPoints) + numPoints) % numPoints;
      return getPointFlags(points[wrappedIdx], isSelected(wrappedIdx));
    }
    return getPointFlags(points[idx], isSelected(idx));
  };

  // Get flags for the point and its neighbors
  const prevPrevPrevFlags = getFlags(pointIndex - 3);
  const prevPrevFlags = getFlags(pointIndex - 2);
  const prevFlags = getFlags(pointIndex - 1);
  const thePointFlags = getFlags(pointIndex);
  const nextFlags = getFlags(pointIndex + 1);
  const nextNextFlags = getFlags(pointIndex + 2);

  // Try to match rules in order (first match wins)
  for (const rule of rules) {
    const [
      rPrevPrevPrev,
      rPrevPrev,
      rPrev,
      rThePoint,
      rNext,
      rNextNext,
      constrain,
      action,
    ] = rule;

    if (
      matchesPattern(prevPrevPrevFlags, rPrevPrevPrev) &&
      matchesPattern(prevPrevFlags, rPrevPrev) &&
      matchesPattern(prevFlags, rPrev) &&
      matchesPattern(thePointFlags, rThePoint) &&
      matchesPattern(nextFlags, rNext) &&
      matchesPattern(nextNextFlags, rNextNext)
    ) {
      return { action, constrain, pointIndex };
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
   * Used for unselected off-curve next to moved smooth point
   */
  RotateNext: (context) => {
    const { prev, thePoint } = context;
    if (!prev) return actionFactories.DontMove(context);

    const handleVector = vector.subVectors(thePoint, prev);
    const handleLength = Math.hypot(handleVector.x, handleVector.y);

    return (delta, editedPoints) => {
      const editedPrev = editedPoints[context.prevIndex] || prev;
      const editedPrevPrev = editedPoints[context.prevPrevIndex] || context.prevPrev;

      if (!editedPrevPrev) {
        return { ...thePoint };
      }

      const tangent = vector.subVectors(editedPrev, editedPrevPrev);
      if (!tangent.x && !tangent.y) {
        return { ...thePoint };
      }

      const angle = Math.atan2(tangent.y, tangent.x);
      return {
        ...thePoint,
        x: editedPrev.x + handleLength * Math.cos(angle),
        y: editedPrev.y + handleLength * Math.sin(angle),
      };
    };
  },

  /**
   * Keep handle on the same line as prev-prevPrev
   */
  ConstrainPrevAngle: (context) => {
    const { prevPrev, prev, thePoint } = context;
    if (!prevPrev || !prev) return actionFactories.Move(context);

    const tangent = vector.subVectors(prev, prevPrev);
    const perpVector = vector.rotateVector90CW(tangent);

    return (delta, editedPoints) => {
      const newPoint = {
        x: thePoint.x + delta.x,
        y: thePoint.y + delta.y,
      };

      const intersection = vector.intersect(
        prevPrev,
        prev,
        newPoint,
        vector.addVectors(newPoint, perpVector)
      );

      if (!intersection) {
        return { ...thePoint, ...newPoint };
      }
      return { ...thePoint, ...intersection };
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
        return { ...thePoint };
      }
      return { ...thePoint, ...intersection };
    };
  },

  /**
   * Constrain handle to 0/45/90 degrees from anchor
   */
  ConstrainHandle: (context) => {
    const { prev, thePoint } = context;
    if (!prev) return actionFactories.Move(context);

    return (delta, editedPoints, constrainDelta) => {
      const editedPrev = editedPoints[context.prevIndex] || prev;
      const newPoint = {
        x: thePoint.x + delta.x,
        y: thePoint.y + delta.y,
      };
      const handleVector = constrainDelta(vector.subVectors(newPoint, editedPrev));
      return {
        ...thePoint,
        x: editedPrev.x + handleVector.x,
        y: editedPrev.y + handleVector.y,
      };
    };
  },

  /**
   * Move with the anchor (for handles attached to selected on-curve)
   */
  MoveWithAnchor: (context) => {
    const { prev, thePoint } = context;
    if (!prev) return actionFactories.Move(context);

    const offset = vector.subVectors(thePoint, prev);

    return (delta, editedPoints) => {
      const editedPrev = editedPoints[context.prevIndex] || prev;
      return {
        ...thePoint,
        x: editedPrev.x + offset.x,
        y: editedPrev.y + offset.y,
      };
    };
  },
};

// Rules for skeleton point editing
// Format: [prevPrevPrev, prevPrev, prev, thePoint, next, nextNext, constrain, action]
// prettier-ignore
const defaultRules = [
  // Default rule: move selected points
  [ANY | NIL, ANY | NIL, ANY | NIL, ANY | SEL, ANY | NIL, ANY | NIL, false, "Move"],

  // Unselected off-curve next to smooth point next to selected point -> rotate
  [ANY | NIL, ANY | SEL, SMO | UNS, OFF | UNS, ANY | NIL, ANY | NIL, true, "RotateNext"],

  // Selected smooth point: neighboring off-curve should rotate
  [ANY | NIL, SHA | SMO | UNS, SMO | SEL, OFF | UNS, ANY | NIL, ANY | NIL, true, "RotateNext"],

  // Unselected off-curve attached to selected smooth -> move with it
  [ANY | NIL, ANY | NIL, SMO | SEL, OFF | UNS, ANY | NIL, ANY | NIL, false, "MoveWithAnchor"],
  [ANY | NIL, ANY | NIL, SHA | SEL, OFF | UNS, ANY | NIL, ANY | NIL, false, "MoveWithAnchor"],

  // Off-curve between two on-curve points, one selected
  [ANY | NIL, ANY, SMO | SHA | SEL, OFF | UNS, SMO | SHA, ANY | NIL, true, "HandleIntersect"],
  [ANY | NIL, SMO | SHA, SMO | SHA | SEL, OFF | UNS, SMO | SHA, ANY | NIL, true, "HandleIntersect"],
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
        prevPrevPrevIndex: this._wrapIndex(i - 3),
        prevPrevIndex: this._wrapIndex(i - 2),
        prevIndex: this._wrapIndex(i - 1),
        thePointIndex: i,
        nextIndex: this._wrapIndex(i + 1),
        nextNextIndex: this._wrapIndex(i + 2),
        prevPrevPrev: getPoint(i - 3),
        prevPrev: getPoint(i - 2),
        prev: getPoint(i - 1),
        thePoint: this.points[i],
        next: getPoint(i + 1),
        nextNext: getPoint(i + 2),
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
