/**
 * Skeleton Edit Behavior System
 *
 * This module implements a rule-based editing system for skeleton points,
 * reusing the exact same rules and matching infrastructure from edit-behavior.js
 */

import { polygonIsConvex } from "@fontra/core/convex-hull.js";
import { Transform } from "@fontra/core/transform.js";
import { reversed } from "@fontra/core/utils.js";
import * as vector from "@fontra/core/vector.js";
import {
  ANY,
  NIL,
  OFF,
  SEL,
  SHA,
  SMO,
  UNS,
  buildPointMatchTree,
  findPointMatch,
} from "./edit-behavior-support.js";

// Re-export flags for convenience
export { ANY, NIL, OFF, SEL, SHA, SMO, UNS };

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

// Action factories - copied exactly from edit-behavior.js
// These take (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) and return
// a function that takes (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext)
const actionFactories = {
  DontMove: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      return thePoint;
    };
  },

  Move: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      return transform.constrained(thePoint);
    };
  },

  RotateNext: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    const handle = vector.subVectors(thePoint, prev);
    const handleLength = Math.hypot(handle.x, handle.y);
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const delta = vector.subVectors(prev, prevPrev);
      if (!delta.x && !delta.y) {
        return thePoint;
      }
      const angle = Math.atan2(delta.y, delta.x);
      const handlePoint = {
        x: prev.x + handleLength * Math.cos(angle),
        y: prev.y + handleLength * Math.sin(angle),
      };
      return handlePoint;
    };
  },

  ConstrainPrevAngle: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    const pt1 = prevPrev;
    const pt2 = prev;
    const perpVector = vector.rotateVector90CW(vector.subVectors(pt2, pt1));
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      let point = transform.free(thePoint);
      const intersection = vector.intersect(
        pt1,
        pt2,
        point,
        vector.addVectors(point, perpVector)
      );
      if (!intersection) {
        return point;
      }
      return intersection;
    };
  },

  ConstrainMiddle: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    const pt1 = prev;
    const pt2 = next;
    const perpVector = vector.rotateVector90CW(vector.subVectors(pt2, pt1));
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      let point = transform.free(thePoint);
      const intersection = vector.intersect(
        pt1,
        pt2,
        point,
        vector.addVectors(point, perpVector)
      );
      if (!intersection) {
        return point;
      }
      return intersection;
    };
  },

  ConstrainMiddleTwo: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    const pt1 = prevPrev;
    const pt2 = next;
    const perpVector = vector.rotateVector90CW(vector.subVectors(pt2, pt1));
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      let point = transform.free(thePoint);
      const intersection = vector.intersect(
        pt1,
        pt2,
        point,
        vector.addVectors(point, perpVector)
      );
      if (!intersection) {
        return point;
      }
      return intersection;
    };
  },

  TangentIntersect: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    const nextHandle = vector.subVectors(thePoint, next);
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      let point = transform.free(thePoint);
      const intersection = vector.intersect(
        prevPrev,
        prev,
        next,
        vector.addVectors(next, nextHandle)
      );
      if (!intersection) {
        return point;
      }
      return intersection;
    };
  },

  TangentIntersectLive: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      let point = transform.free(thePoint);
      const intersection = vector.intersect(prevPrev, prev, next, nextNext);
      if (!intersection) {
        return thePoint;
      }
      return intersection;
    };
  },

  HandleIntersect: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    const handlePrev = vector.subVectors(thePoint, prev);
    const handleNext = vector.subVectors(thePoint, next);
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const intersection = vector.intersect(
        prev,
        vector.addVectors(prev, handlePrev),
        next,
        vector.addVectors(next, handleNext)
      );
      if (!intersection) {
        return thePoint;
      }
      return intersection;
    };
  },

  ConstrainHandle: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const newPoint = transform.free(thePoint);
      const handleVector = transform.constrainDelta(vector.subVectors(newPoint, prev));
      return vector.addVectors(prev, handleVector);
    };
  },

  ConstrainHandleIntersect: (
    prevPrevPrev,
    prevPrev,
    prev,
    thePoint,
    next,
    nextNext
  ) => {
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const newPoint = transform.free(thePoint);
      const handlePrev = transform.constrainDelta(vector.subVectors(newPoint, prev));
      const handleNext = transform.constrainDelta(vector.subVectors(newPoint, next));

      const intersection = vector.intersect(
        prev,
        vector.addVectors(prev, handlePrev),
        next,
        vector.addVectors(next, handleNext)
      );
      if (!intersection) {
        return newPoint;
      }
      return intersection;
    };
  },

  ConstrainHandleIntersectPrev: (
    prevPrevPrev,
    prevPrev,
    prev,
    thePoint,
    next,
    nextNext
  ) => {
    const tangentPrev = vector.subVectors(prev, prevPrev);
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const newPoint = transform.free(thePoint);
      const handleNext = transform.constrainDelta(vector.subVectors(newPoint, next));

      const intersection = vector.intersect(
        prev,
        vector.addVectors(prev, tangentPrev),
        next,
        vector.addVectors(next, handleNext)
      );
      if (!intersection) {
        return newPoint;
      }
      return intersection;
    };
  },

  Interpolate: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    const lenPrevNext = vector.distance(next, prev);
    const lenPrev = vector.distance(thePoint, prev);
    let t = lenPrevNext > 0.0001 ? lenPrev / lenPrevNext : 0;
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const prevNext = vector.subVectors(next, prev);
      return vector.addVectors(prev, vector.mulVectorScalar(prevNext, t));
    };
  },

  InterpolatePrevPrevNext: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    const lenPrevPrevNext = vector.distance(next, prevPrev);
    const lenPrevPrev = vector.distance(thePoint, prevPrev);
    let t = lenPrevPrevNext > 0.0001 ? lenPrevPrev / lenPrevPrevNext : 0;
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const prevPrevNext = vector.subVectors(next, prevPrev);
      return vector.addVectors(prevPrev, vector.mulVectorScalar(prevPrevNext, t));
    };
  },

  ConstrainAroundPrevPrev: (prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const newPoint = transform.free(thePoint);
      const handleVector = transform.constrainDelta(
        vector.subVectors(newPoint, prevPrev)
      );
      return vector.addVectors(prevPrev, handleVector);
    };
  },

  ConstrainAroundPrevPrevPrev: (
    prevPrevPrev,
    prevPrev,
    prev,
    thePoint,
    next,
    nextNext
  ) => {
    return (transform, prevPrevPrev, prevPrev, prev, thePoint, next, nextNext) => {
      const newPoint = transform.free(thePoint);
      const handleVector = transform.constrainDelta(
        vector.subVectors(newPoint, prevPrevPrev)
      );
      return vector.addVectors(prevPrevPrev, handleVector);
    };
  },
};

// Rules copied exactly from edit-behavior.js
// prettier-ignore
const defaultRules = [
  //   prev3       prevPrev    prev        the point   next        nextNext    Constrain   Action

  // Default rule: if no other rules apply, just move the selected point
  [    ANY|NIL,    ANY|NIL,    ANY|NIL,    ANY|SEL,    ANY|NIL,    ANY|NIL,    false,      "Move"],

  // Unselected off-curve point next to a smooth point next to a selected point
  [    ANY|NIL,    ANY|SEL,    SMO|UNS,    OFF|UNS,    OFF|SHA|NIL,ANY|NIL,    true,       "RotateNext"],

  // Selected tangent point: its neighboring off-curve point should move
  [    ANY|NIL,    SHA|SMO|UNS,SMO|SEL,    OFF|UNS,    OFF|SHA|NIL,ANY|NIL,    true,       "RotateNext"],

  // Selected tangent point, selected handle: constrain both on original angle
  [    ANY|NIL,    SHA|SMO|UNS,SMO|SEL,    OFF|SEL,    OFF|SHA|NIL,ANY|NIL,    true,       "ConstrainPrevAngle"],
  [    ANY|NIL,    ANY,        SHA|SMO|UNS,SMO|SEL,    OFF|SEL,    OFF|SHA|NIL,true,       "ConstrainMiddle"],

  // Unselected free off-curve point, move with on-curve neighbor
  [    ANY|NIL,    ANY|NIL,    SHA|SMO|SEL,OFF|UNS,    OFF|SHA|NIL,ANY|NIL,    false,      "Move"],
  [    ANY|NIL,    OFF,        SMO|SEL,    OFF|UNS,    OFF|SHA|NIL,ANY|NIL,    false,      "Move"],

  // An unselected off-curve between two on-curve points
  [    ANY|NIL,    ANY,        SMO|SHA|SEL,OFF|UNS,    SMO|SHA,    ANY|NIL,    true,       "HandleIntersect"],
  [    ANY|NIL,    ANY|SEL,    SMO|UNS,    OFF|UNS,    SMO,        ANY|NIL,    true,       "TangentIntersectLive"],
  [    ANY|NIL,    SMO|SHA,    SMO|SEL,    OFF|UNS,    SMO|SHA,    ANY|NIL,    true,       "TangentIntersect"],
  [    ANY|NIL,    SMO|SHA,    SMO|UNS,    OFF|SEL,    SMO|SEL,    ANY|NIL,    true,       "HandleIntersect"],
  [    ANY|NIL,    ANY|SEL,    SMO|UNS,    OFF|UNS,    SHA|SEL,    ANY|NIL,    true,       "TangentIntersect"],

  // Tangent bcp constraint
  [    ANY|NIL,    SMO|SHA,    SMO|UNS,    OFF|SEL,    ANY|UNS|NIL,ANY|NIL,    false,      "ConstrainPrevAngle"],
  [    ANY|NIL,    SMO|SHA,    SMO|UNS,    OFF|SEL,    SHA|OFF,    ANY|NIL,    false,      "ConstrainPrevAngle"],

  // Two selected points with an unselected smooth point between them
  [    ANY|NIL,    ANY|SEL,    SMO|UNS,    ANY|SEL,    ANY|NIL,    ANY|NIL,    false,      "ConstrainPrevAngle"],
  [    ANY|NIL,    ANY|SEL,    SMO|UNS,    ANY|SEL,    SMO|UNS,    ANY|SEL,    false,      "DontMove"],
  [    ANY|NIL,    ANY|SEL,    SMO|UNS,    ANY|SEL,    SMO|UNS,    SMO|UNS,    false,      "DontMove"],

  // Selected tangent with selected handle: constrain at original tangent line
  [    ANY|NIL,    SMO|SHA|UNS,SMO|SEL,    OFF|SEL,    ANY|NIL,    ANY|NIL,    false,      "ConstrainPrevAngle"],
  [    ANY|NIL,    ANY,        SHA|SMO|UNS,SMO|SEL,    OFF|SEL,    ANY|NIL,    true,       "ConstrainMiddle"],

  // Selected tangent, selected off-curve, selected smooth
  [    ANY|NIL,    SMO|SHA|UNS,SMO|SEL,    OFF|SEL,    SMO|SEL,    ANY|NIL,    true,       "HandleIntersect"],

  // Selected single off-curve, locked between two unselected smooth points
  [    ANY|NIL,    SHA|SMO|UNS,SMO|UNS,    OFF|SEL,    SMO|UNS,    OFF|SEL,    false,      "DontMove"],

];

// prettier-ignore
const constrainRules = defaultRules.concat([

  // Selected free off curve: constrain to 0, 45 or 90 degrees
  [    ANY|NIL,    OFF|UNS,    SMO|UNS,    OFF|SEL,    OFF|NIL,    ANY|NIL,    false,      "ConstrainHandle"],
  [    ANY|NIL,    ANY|NIL,    SHA|UNS,    OFF|SEL,    OFF|NIL,    ANY|NIL,    false,      "ConstrainHandle"],
  [    ANY|NIL,    OFF|UNS,    SMO|UNS,    OFF|SEL,    SMO|UNS,    OFF|UNS,    false,      "ConstrainHandleIntersect"],
  [    ANY|NIL,    ANY|NIL,    SHA|UNS,    OFF|SEL,    SHA|UNS,    ANY|NIL,    false,      "ConstrainHandleIntersect"],
  [    ANY|NIL,    OFF|UNS,    SMO|UNS,    OFF|SEL,    SHA|UNS,    ANY|NIL,    false,      "ConstrainHandleIntersect"],
  [    ANY|NIL,    SHA|SMO|UNS,SMO|UNS,    OFF|SEL,    SMO|UNS,    OFF|UNS,    false,      "ConstrainHandleIntersectPrev"],

  // Selected smooth between unselected on-curve and off-curve
  [    ANY|NIL,    ANY|UNS,    SMO|SHA|UNS,SMO|SEL,    OFF|UNS,    ANY|NIL,    false,      "ConstrainHandle"],

]);

// prettier-ignore
const alternateRules = [
  //   prev3       prevPrev    prev        the point   next        nextNext    Constrain   Action

  // Default rule: if no other rules apply, just move the selected point
  [    ANY|NIL,    ANY|NIL,    ANY|NIL,    ANY|SEL,    ANY|NIL,    ANY|NIL,    false,      "Move"],

  // Selected smooth before unselected off-curve
  [    ANY|NIL,    ANY|NIL,    ANY|UNS,    SMO|SEL,    OFF,        ANY|NIL,    false,      "ConstrainMiddle"],
  [    ANY|NIL,    OFF,        SMO|SEL,    SMO|SEL,    OFF|UNS,    ANY|NIL,    false,      "ConstrainMiddleTwo"],
  [    ANY|NIL,    OFF|UNS,    SMO|SEL,    SMO|SEL,    OFF|SEL,    ANY|NIL,    false,      "ConstrainMiddleTwo"],
  [    ANY|NIL,    SMO|SEL,    SMO|SEL,    OFF|SEL,    ANY|NIL,    ANY|NIL,    true,       "RotateNext"],
  [    ANY|NIL,    SMO|SEL,    SMO|UNS,    OFF|SEL,    ANY|NIL,    ANY|NIL,    true,       "ConstrainPrevAngle"],
  [    ANY|NIL,    SMO|UNS,    SMO|SEL,    OFF|SEL,    ANY|NIL,    ANY|NIL,    true,       "ConstrainPrevAngle"],

  // Smooth with two selected neighbors
  [    ANY|NIL,    ANY|NIL,    ANY|SEL,    SMO|SEL,    OFF|SEL,    ANY|NIL,    false,      "ConstrainMiddle"],

  // Unselected smooth between sharp and off-curve, one of them selected
  [    ANY|NIL,    ANY|NIL,    SHA|OFF|UNS,SMO|UNS,    OFF|SEL,    ANY|NIL,    true,       "Interpolate"],
  [    ANY|NIL,    ANY|NIL,    SHA|OFF|SEL,SMO|UNS,    OFF|UNS,    ANY|NIL,    true,       "Interpolate"],

  // Two unselected smooth points between two off-curves, one of them selected
  [    ANY|NIL,    OFF|UNS,    SMO|UNS,    SMO|UNS,    OFF|SEL,    ANY|NIL,    true,       "InterpolatePrevPrevNext"],
  [    ANY|NIL,    OFF|SEL,    SMO|UNS,    SMO|UNS,    OFF|UNS,    ANY|NIL,    true,       "InterpolatePrevPrevNext"],

  // An unselected smooth point between two selected off-curves
  [    ANY|NIL,    ANY|NIL,    OFF|SEL,    SMO|UNS,    OFF|SEL,    ANY|NIL,    true,       "Move"],

  // Two unselected smooth points between two selected off-curves
  [    ANY|NIL,    OFF|SEL,    SMO|UNS,    SMO|UNS,    OFF|SEL,    ANY|NIL,    true,       "Move"],

  // Two selected points locked by angle
  [    ANY|NIL,    ANY,        SHA|SEL,    SMO|SEL,    OFF|UNS,    OFF|SHA|NIL,false,      "ConstrainMiddle"],
  [    ANY|NIL,    ANY,        SMO|SEL,    SHA|SEL,    ANY|NIL,    ANY|NIL,    false,      "ConstrainPrevAngle"],
  [    ANY|NIL,    ANY,        SMO|SEL,    OFF|SEL,    ANY|NIL,    ANY|NIL,    false,      "ConstrainPrevAngle"],

  // Selected off-curve locked between two selected smooth points
  [    ANY|NIL,    ANY|NIL,    SMO|SEL,    OFF|SEL,    SMO|SEL,    ANY|NIL,    false,      "DontMove"],

];

// prettier-ignore
const alternateConstrainRules = alternateRules.concat([

  [    ANY|NIL,    SHA|OFF|UNS,SMO|UNS,    SHA|OFF|SEL,ANY|NIL,    ANY|NIL,    false,      "ConstrainAroundPrevPrev"],

  // Two unselected smooth points between two off-curves, one of them selected
  [    ANY|UNS,    SMO|UNS,    SMO|UNS,    OFF|SEL,    ANY|NIL,    ANY|NIL,    false,      "ConstrainAroundPrevPrevPrev"],

]);

// Build match trees
const defaultMatchTree = buildPointMatchTree(defaultRules);
const constrainMatchTree = buildPointMatchTree(constrainRules);
const alternateMatchTree = buildPointMatchTree(alternateRules);
const alternateConstrainMatchTree = buildPointMatchTree(alternateConstrainRules);

// Behavior types mapping (same as edit-behavior.js)
const behaviorTypes = {
  default: {
    matchTree: defaultMatchTree,
    constrainDelta: null,
  },
  constrain: {
    matchTree: constrainMatchTree,
    constrainDelta: constrainHorVerDiag,
  },
  alternate: {
    matchTree: alternateMatchTree,
    constrainDelta: null,
  },
  "alternate-constrain": {
    matchTree: alternateConstrainMatchTree,
    constrainDelta: constrainHorVerDiag,
  },
};

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
    enableScalingEdit = false
  ) {
    this.skeletonData = skeletonData;
    this.contourIndex = contourIndex;
    this.contour = skeletonData.contours[contourIndex];
    this.points = this.contour.points;
    this.isClosed = this.contour.isClosed;
    this.selectedIndices = new Set(selectedPointIndices);

    // Get behavior from behaviorTypes (same pattern as edit-behavior.js)
    const behavior = behaviorTypes[behaviorName] || behaviorTypes["default"];
    this.matchTree = behavior.matchTree;
    this.constrainDelta = behavior.constrainDelta || ((v) => v);
    this.enableScalingEdit = enableScalingEdit;

    // Mark selected points
    this._preparePoints();

    // Build edit functions for each point
    this.editFuncs = this._buildEditFuncs();

    // Store original positions for rollback
    this.originalPositions = this.points.map((p) => ({ x: p.x, y: p.y }));
  }

  _preparePoints() {
    // Add 'selected' flag to points for findPointMatch
    for (let i = 0; i < this.points.length; i++) {
      this.points[i].selected = this.selectedIndices.has(i);
    }
  }

  _buildEditFuncs() {
    const editFuncsTransform = [];
    const editFuncsConstrain = [];
    const numPoints = this.points.length;
    const participatingPointIndices = [];

    for (let i = 0; i < numPoints; i++) {
      const [match, neighborIndices] = findPointMatch(
        this.matchTree,
        i,
        this.points,
        numPoints,
        this.isClosed
      );

      if (!match) continue;

      // Use direction to get correct neighbor order (same as edit-behavior.js)
      const [prevPrevPrev, prevPrev, prev, thePoint, next, nextNext, nextNextNext] =
        match.direction > 0 ? neighborIndices : reversed(neighborIndices);

      const actionFactory = actionFactories[match.action];
      if (!actionFactory) {
        console.warn(`Unknown action: ${match.action}`);
        continue;
      }

      participatingPointIndices.push(thePoint);

      // Create action function with original points
      const actionFunc = actionFactory(
        this.points[prevPrevPrev],
        this.points[prevPrev],
        this.points[prev],
        this.points[thePoint],
        this.points[next],
        this.points[nextNext]
      );

      const editEntry = {
        pointIndex: thePoint,
        neighborIndices: { prevPrevPrev, prevPrev, prev, thePoint, next, nextNext },
        constrain: match.constrain,
        actionFunc,
      };

      if (!match.constrain) {
        editFuncsTransform.push(editEntry);
      } else {
        editFuncsConstrain.push(editEntry);
      }
    }

    // Add segment-based additional edit funcs (for interpolation)
    const additionalEditFuncs = this._makeAdditionalEditFuncs(participatingPointIndices);

    // Transform (non-constrain) first, then constrain, then additional
    return [...editFuncsTransform, ...editFuncsConstrain, ...additionalEditFuncs];
  }

  /**
   * Create additional edit functions for segments.
   * This handles floating off-curve points and scaling edits.
   */
  _makeAdditionalEditFuncs(participatingPointIndices) {
    const additionalFuncs = [];
    const points = this.points;

    // Determine condition and segment func based on scaling mode
    let conditionFunc, segmentFunc;
    if (this.enableScalingEdit) {
      segmentFunc = this._makeSegmentScalingEditFuncs.bind(this);
      conditionFunc = (segment) =>
        segment.length >= 4 &&
        (points[segment[0]].selected || points[segment.at(-1)].selected) &&
        segment.slice(1, -1).every((i) => !points[i].selected);
    } else {
      segmentFunc = this._makeSegmentFloatingOffCurveEditFuncs.bind(this);
      conditionFunc = (segment) =>
        segment.length >= 5 &&
        points[segment[0]].selected &&
        points[segment.at(-1)].selected &&
        segment.slice(1, -1).every((i) => !points[i].selected);
    }

    for (const segment of this._iterSegmentPointIndices()) {
      if (!conditionFunc(segment)) continue;
      const [editFuncs, indices] = segmentFunc(segment);
      additionalFuncs.push(...editFuncs);
      participatingPointIndices.push(...indices);
    }

    return additionalFuncs;
  }

  /**
   * Iterate over segments (on-curve to on-curve point spans)
   */
  *_iterSegmentPointIndices() {
    const points = this.points;
    const lastPointIndex = points.length - 1;
    const firstOnCurve = this._findFirstOnCurvePoint();
    if (firstOnCurve === undefined) {
      return;
    }
    let currentOnCurve = firstOnCurve;
    while (true) {
      const indices = [...this._iterUntilNextOnCurvePoint(currentOnCurve)];
      if (!indices.length) {
        break;
      }
      yield indices;
      currentOnCurve = indices.at(-1);
      if (
        (this.isClosed && currentOnCurve === firstOnCurve) ||
        (!this.isClosed && currentOnCurve === lastPointIndex)
      ) {
        break;
      }
    }
  }

  _findFirstOnCurvePoint() {
    const numPoints = this.points.length;
    for (let i = 0; i < numPoints; i++) {
      if (!this.points[i].type) {
        return i;
      }
    }
    return undefined;
  }

  *_iterUntilNextOnCurvePoint(startIndex) {
    yield startIndex;
    const numPoints = this.points.length;
    for (let i = startIndex + 1; i < numPoints; i++) {
      yield i;
      if (!this.points[i].type) {
        return;
      }
    }
    if (!this.isClosed || !startIndex) {
      return;
    }
    for (let i = 0; i < startIndex; i++) {
      yield i;
      if (!this.points[i].type) {
        return;
      }
    }
  }

  /**
   * Create edit functions for floating off-curve points between two selected on-curves.
   * These off-curves should move with the transform.
   */
  _makeSegmentFloatingOffCurveEditFuncs(segment) {
    const originalPoints = this.points;
    const editFuncs = [];
    const pointIndices = [];

    // segment.slice(2, -2) gets the "floating" off-curves (not the handles adjacent to endpoints)
    for (const i of segment.slice(2, -2)) {
      pointIndices.push(i);
      const pointIndex = i;
      editFuncs.push({
        pointIndex,
        neighborIndices: { thePoint: pointIndex },
        constrain: false,
        // The actionFunc takes transform and returns new point position
        actionFunc: (transform) => transform.constrained(originalPoints[pointIndex]),
        isAdditional: true,
      });
    }
    return [editFuncs, pointIndices];
  }

  /**
   * Create edit functions for scaling a segment proportionally.
   * When endpoints move, scale internal off-curves proportionally.
   */
  _makeSegmentScalingEditFuncs(segment) {
    const originalPoints = this.points;
    const editFuncs = [];
    const pointIndices = [];

    // Calculate original transform based on segment endpoints and their handles
    const A = this._makeSegmentTransform(originalPoints, segment, false);
    const Ainv = A?.inverse();

    if (A && Ainv) {
      // Shared state for transform calculation
      let T = null;

      // First entry calculates the new transform based on edited endpoint positions
      editFuncs.push({
        pointIndex: -1, // Marker for transform calculation
        neighborIndices: {},
        constrain: false,
        actionFunc: (transform, editedPoints) => {
          const B = this._makeSegmentTransform(editedPoints, segment, true);
          T = B?.transform(Ainv);
          return null; // Don't actually move any point
        },
        isTransformCalculation: true,
      });

      // Then create edit funcs for each internal point
      for (const i of segment.slice(1, -1)) {
        pointIndices.push(i);
        const pointIndex = i;
        editFuncs.push({
          pointIndex,
          neighborIndices: { thePoint: pointIndex },
          constrain: false,
          actionFunc: (transform, editedPoints) => {
            if (T) {
              return T.transformPointObject(originalPoints[pointIndex]);
            }
            return editedPoints ? editedPoints[pointIndex] : originalPoints[pointIndex];
          },
          isAdditional: true,
        });
      }
    }
    return [editFuncs, pointIndices];
  }

  /**
   * Create a transform matrix from segment endpoint and handle positions.
   */
  _makeSegmentTransform(points, pointIndices, allowConcave) {
    const pt0 = points[pointIndices[0]];
    const pt1 = points[pointIndices[1]];
    const pt2 = points[pointIndices.at(-2)];
    const pt3 = points[pointIndices.at(-1)];
    if (!pt0 || !pt1 || !pt2 || !pt3) {
      return undefined;
    }
    if (!allowConcave && !polygonIsConvex([pt0, pt1, pt2, pt3])) {
      return undefined;
    }
    const intersection = vector.intersect(pt0, pt1, pt2, pt3);
    if (!intersection) {
      return undefined;
    }
    const v1 = vector.subVectors(intersection, pt0);
    const v2 = vector.subVectors(pt3, intersection);
    return new Transform(v1.x, v1.y, v2.x, v2.y, pt0.x, pt0.y);
  }

  /**
   * Apply a delta to all affected points
   * Returns array of { pointIndex, x, y } for changed points
   */
  applyDelta(delta) {
    const editedPoints = [...this.points]; // Copy for mutation
    const changes = [];

    // Create transform object matching edit-behavior.js interface
    const constrainedDelta = this.constrainDelta(delta);
    const transformConstrained = (point) => ({
      x: point.x + constrainedDelta.x,
      y: point.y + constrainedDelta.y,
    });
    const transformFree = (point) => ({
      x: point.x + delta.x,
      y: point.y + delta.y,
    });

    const transform = {
      constrained: transformConstrained,
      free: transformFree,
      constrainDelta: this.constrainDelta,
    };

    for (const editEntry of this.editFuncs) {
      const { pointIndex, neighborIndices, actionFunc, isAdditional, isTransformCalculation } =
        editEntry;

      let newPoint;
      if (isAdditional || isTransformCalculation) {
        // Additional edit funcs take (transform, editedPoints) directly
        newPoint = actionFunc(transform, editedPoints);
      } else {
        // Regular rule-based edit funcs take neighbor points as arguments
        const { prevPrevPrev, prevPrev, prev, thePoint, next, nextNext } = neighborIndices;
        newPoint = actionFunc(
          transform,
          editedPoints[prevPrevPrev],
          editedPoints[prevPrev],
          editedPoints[prev],
          editedPoints[thePoint],
          editedPoints[next],
          editedPoints[nextNext]
        );
      }

      // Skip transform calculation entries (they don't produce points)
      if (isTransformCalculation || newPoint === null) {
        continue;
      }

      // Update edited points for subsequent constrain actions
      editedPoints[pointIndex] = { ...this.points[pointIndex], ...newPoint };

      changes.push({
        pointIndex,
        x: Math.round(newPoint.x),
        y: Math.round(newPoint.y),
      });
    }

    return changes;
  }

  /**
   * Get rollback data to restore original positions
   */
  getRollback() {
    return this.editFuncs
      .filter(({ pointIndex, isTransformCalculation }) => pointIndex >= 0 && !isTransformCalculation)
      .map(({ pointIndex }) => ({
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
  behaviorName = "default"
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
        new SkeletonEditBehavior(skeletonData, contourIdx, pointIndices, behaviorName)
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
  constructor(skeletonData, contourIndex, pointIndex, side, normal, onCurvePoint) {
    this.skeletonData = skeletonData;
    this.contourIndex = contourIndex;
    this.pointIndex = pointIndex;
    this.side = side;
    this.normal = normal;
    this.onCurvePoint = onCurvePoint;

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

    // Minimum half-width (1 unit)
    this.minHalfWidth = 1;
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
  applyDelta(delta) {
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
      halfWidth: Math.round(newHalfWidth),
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
    onCurvePoint
  );
}

/**
 * EditableRibBehavior - Handles dragging of editable rib points.
 * - If point is symmetric: only nudge (tangent movement), width stays the same
 * - If point is asymmetric: free movement (width + nudge)
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
  constructor(skeletonData, contourIndex, pointIndex, side, normal, onCurvePoint) {
    this.skeletonData = skeletonData;
    this.contourIndex = contourIndex;
    this.pointIndex = pointIndex;
    this.side = side;
    this.normal = normal;
    this.tangent = { x: -normal.y, y: normal.x }; // Perpendicular to normal
    this.onCurvePoint = onCurvePoint;

    const contour = skeletonData.contours[contourIndex];
    const point = contour.points[pointIndex];
    const points = contour.points;
    const defaultWidth = contour.defaultWidth || 20;

    // Determine if point is symmetric or asymmetric
    // Asymmetric = has leftWidth or rightWidth defined
    this.isAsymmetric = point.leftWidth !== undefined || point.rightWidth !== undefined;

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

    // Minimum half-width (1 unit)
    this.minHalfWidth = 1;

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

    console.log('[EDITABLE-RIB] _initHandleOffsets', {
      side,
      has2DIn, has2DOut,
      has1DIn: point[handleIn1DKey] !== undefined,
      has1DOut: point[handleOut1DKey] !== undefined,
      hasHandleOffsets: this.hasHandleOffsets,
    });

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
   * - Symmetric: only nudge changes, width stays original
   * - Asymmetric: both width and nudge can change
   * - With constrainMode: lock to tangent or normal direction
   * Also compensates 2D handle offsets when nudge changes to keep handles stationary.
   * @param {Object} delta - The drag delta {x, y}
   * @param {string|null} constrainMode - null (free), "tangent" (nudge only), or "normal" (width only)
   * @returns {Object} { halfWidth, nudge, isAsymmetric, handleInOffsetX/Y, handleOutOffsetX/Y }
   */
  applyDelta(delta, constrainMode = null) {
    let newNudge = this.originalNudge;
    let newHalfWidth = this.originalHalfWidth;

    // Constrain to tangent: only nudge changes
    if (constrainMode === "tangent") {
      const tangentDot = delta.x * this.tangent.x + delta.y * this.tangent.y;
      newNudge = this.originalNudge + tangentDot;
    }
    // Constrain to normal: only width changes
    else if (constrainMode === "normal") {
      if (this.isAsymmetric) {
        const sign = this.side === "left" ? 1 : -1;
        const normalDot = delta.x * this.normal.x + delta.y * this.normal.y;
        const normalDelta = sign * normalDot;
        newHalfWidth = this.originalHalfWidth + normalDelta;
        if (newHalfWidth < this.minHalfWidth) {
          newHalfWidth = this.minHalfWidth;
        }
      }
      // For symmetric points, normal constraint has no effect (width locked)
    }
    // Free movement (no constraint)
    else {
      // Project delta onto tangent → nudge change (always allowed)
      const tangentDot = delta.x * this.tangent.x + delta.y * this.tangent.y;
      newNudge = this.originalNudge + tangentDot;

      // Only allow width change if asymmetric
      if (this.isAsymmetric) {
        const sign = this.side === "left" ? 1 : -1;
        const normalDot = delta.x * this.normal.x + delta.y * this.normal.y;
        const normalDelta = sign * normalDot;
        newHalfWidth = this.originalHalfWidth + normalDelta;
        if (newHalfWidth < this.minHalfWidth) {
          newHalfWidth = this.minHalfWidth;
        }
      }
    }

    // Compute handle offset compensation when nudge changes
    // When rib point moves by tangent * deltaNudge, handles need opposite offset
    const deltaNudge = newNudge - this.originalNudge;
    const handleOffsetDeltaX = -this.tangent.x * deltaNudge;
    const handleOffsetDeltaY = -this.tangent.y * deltaNudge;

    const result = {
      contourIndex: this.contourIndex,
      pointIndex: this.pointIndex,
      side: this.side,
      halfWidth: Math.round(newHalfWidth),
      nudge: Math.round(newNudge),
      isAsymmetric: this.isAsymmetric,
    };

    // Only include handle offsets if there were existing offsets to preserve
    if (this.hasHandleOffsets) {
      result.handleInOffsetX = Math.round(this.originalHandleInOffsetX + handleOffsetDeltaX);
      result.handleInOffsetY = Math.round(this.originalHandleInOffsetY + handleOffsetDeltaY);
      result.handleOutOffsetX = Math.round(this.originalHandleOutOffsetX + handleOffsetDeltaX);
      result.handleOutOffsetY = Math.round(this.originalHandleOutOffsetY + handleOffsetDeltaY);
      result.hasHandleOffsets = true;

      console.log('[EDITABLE-RIB] applyDelta with handle compensation', {
        deltaNudge,
        tangent: this.tangent,
        handleOffsetDelta: { x: handleOffsetDeltaX, y: handleOffsetDeltaY },
        original: {
          inX: this.originalHandleInOffsetX, inY: this.originalHandleInOffsetY,
          outX: this.originalHandleOutOffsetX, outY: this.originalHandleOutOffsetY,
        },
        result: {
          inX: result.handleInOffsetX, inY: result.handleInOffsetY,
          outX: result.handleOutOffsetX, outY: result.handleOutOffsetY,
        },
      });
    }

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
    onCurvePoint
  );
}

/**
 * InterpolatingRibBehavior - Handles dragging of editable rib points with Alt key.
 * The rib point slides along the line between its two adjacent handles (off-curve points).
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
   * @param {Object} prevHandle - Previous handle position {x, y}
   * @param {Object} nextHandle - Next handle position {x, y}
   */
  constructor(skeletonData, contourIndex, pointIndex, side, normal, onCurvePoint, prevHandle, nextHandle) {
    console.log('[INTERPOLATE-2D] Constructor called', {
      contourIndex, pointIndex, side, prevHandle, nextHandle,
    });

    this.skeletonData = skeletonData;
    this.contourIndex = contourIndex;
    this.pointIndex = pointIndex;
    this.side = side;
    this.normal = normal;
    this.tangent = { x: -normal.y, y: normal.x };
    this.onCurvePoint = onCurvePoint;
    this.prevHandle = prevHandle;
    this.nextHandle = nextHandle;

    const contour = skeletonData.contours[contourIndex];
    const point = contour.points[pointIndex];
    const points = contour.points;
    const defaultWidth = contour.defaultWidth || 20;

    // Compute skeleton handle directions for 1D to 2D conversion
    // These are needed to correctly interpret existing 1D offsets
    this.skeletonHandleInDir = null;
    this.skeletonHandleOutDir = null;

    // Incoming handle (previous point if it's off-curve)
    const prevIdx = (pointIndex - 1 + points.length) % points.length;
    if (points[prevIdx]?.type) {
      const dx = points[prevIdx].x - point.x;
      const dy = points[prevIdx].y - point.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.001) {
        this.skeletonHandleInDir = { x: dx / len, y: dy / len };
      }
    }

    // Outgoing handle (next point if it's off-curve)
    const nextIdx = (pointIndex + 1) % points.length;
    if (points[nextIdx]?.type) {
      const dx = points[nextIdx].x - point.x;
      const dy = points[nextIdx].y - point.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.001) {
        this.skeletonHandleOutDir = { x: dx / len, y: dy / len };
      }
    }

    console.log('[INTERPOLATE-2D] Computed skeleton handle directions', {
      skeletonHandleInDir: this.skeletonHandleInDir,
      skeletonHandleOutDir: this.skeletonHandleOutDir,
      tangent: this.tangent,
    });

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

    // Debug: log all handle offset keys for this point
    console.log('[INTERPOLATE-2D] Reading offsets for side:', side, {
      handleInXKey, handleInYKey, handleOutXKey, handleOutYKey,
      handleIn1DKey, handleOut1DKey,
      rawValues: {
        inX: point[handleInXKey],
        inY: point[handleInYKey],
        outX: point[handleOutXKey],
        outY: point[handleOutYKey],
        in1D: point[handleIn1DKey],
        out1D: point[handleOut1DKey],
      },
      allPointKeys: Object.keys(point),
    });

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
      console.log('[INTERPOLATE-2D] Converting 1D to 2D for IN handle', {
        offset1D: point[handleIn1DKey],
        dir,
        result: { x: this.originalHandleInOffsetX, y: this.originalHandleInOffsetY }
      });
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
      console.log('[INTERPOLATE-2D] Converting 1D to 2D for OUT handle', {
        offset1D: point[handleOut1DKey],
        dir,
        result: { x: this.originalHandleOutOffsetX, y: this.originalHandleOutOffsetY }
      });
    } else {
      this.originalHandleOutOffsetX = 0;
      this.originalHandleOutOffsetY = 0;
    }

    // Calculate current rib point position
    this._recalculateRibPos();

    // Calculate the line direction from prevHandle to nextHandle
    this.lineDir = {
      x: nextHandle.x - prevHandle.x,
      y: nextHandle.y - prevHandle.y,
    };
    this.lineLength = Math.hypot(this.lineDir.x, this.lineDir.y);

    if (this.lineLength > 0.001) {
      this.lineDir.x /= this.lineLength;
      this.lineDir.y /= this.lineLength;
    }

    console.log('[INTERPOLATE-2D] Initial state', {
      originalRibPos: this.originalRibPos,
      tangent: this.tangent,
      lineDir: this.lineDir,
      originalOffsets: {
        in: { x: this.originalHandleInOffsetX, y: this.originalHandleInOffsetY },
        out: { x: this.originalHandleOutOffsetX, y: this.originalHandleOutOffsetY }
      }
    });
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
    console.log('[INTERPOLATE-2D] setOriginalHalfWidth called', {
      halfWidth,
      newRibPos: this.originalRibPos
    });
  }

  /**
   * Apply drag delta and return changes to nudge and 2D handle offsets.
   * Movement is constrained to the line between handles.
   * Handles stay fixed by compensating with 2D offsets.
   * @param {Object} delta - The drag delta {x, y}
   * @returns {Object} { nudge, handleInOffsetX/Y, handleOutOffsetX/Y, isInterpolation }
   */
  applyDelta(delta) {
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

    const newHandleInOffsetX = this.originalHandleInOffsetX + handleOffsetDeltaX;
    const newHandleInOffsetY = this.originalHandleInOffsetY + handleOffsetDeltaY;
    const newHandleOutOffsetX = this.originalHandleOutOffsetX + handleOffsetDeltaX;
    const newHandleOutOffsetY = this.originalHandleOutOffsetY + handleOffsetDeltaY;

    console.log('[INTERPOLATE-2D] applyDelta', {
      delta,
      deltaAlongLine,
      deltaNudge,
      tangent: this.tangent,
      handleOffsetDelta: { x: handleOffsetDeltaX, y: handleOffsetDeltaY },
      newNudge,
      newHandleOffsets: {
        in: { x: newHandleInOffsetX, y: newHandleInOffsetY },
        out: { x: newHandleOutOffsetX, y: newHandleOutOffsetY }
      }
    });

    return {
      contourIndex: this.contourIndex,
      pointIndex: this.pointIndex,
      side: this.side,
      halfWidth: Math.round(this.originalHalfWidth),  // Keep width unchanged
      nudge: Math.round(newNudge),
      handleInOffsetX: Math.round(newHandleInOffsetX),
      handleInOffsetY: Math.round(newHandleInOffsetY),
      handleOutOffsetX: Math.round(newHandleOutOffsetX),
      handleOutOffsetY: Math.round(newHandleOutOffsetY),
      isAsymmetric: false,
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
 * @param {Object} prevHandle - Previous handle position {x, y}
 * @param {Object} nextHandle - Next handle position {x, y}
 * @returns {InterpolatingRibBehavior} The behavior instance
 */
export function createInterpolatingRibBehavior(skeletonData, ribHit, prevHandle, nextHandle) {
  const { contourIndex, pointIndex, side, normal, onCurvePoint } = ribHit;
  return new InterpolatingRibBehavior(
    skeletonData,
    contourIndex,
    pointIndex,
    side,
    normal,
    onCurvePoint,
    prevHandle,
    nextHandle
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
  constructor(skeletonData, contourIndex, pointIndex, side, handleType, skeletonHandleDir) {
    console.log('[HANDLE-EDIT] Phase 4: EditableHandleBehavior constructor', {
      contourIndex, pointIndex, side, handleType, skeletonHandleDir,
    });

    this.skeletonData = skeletonData;
    this.contourIndex = contourIndex;
    this.pointIndex = pointIndex;
    this.side = side;
    this.handleType = handleType;
    this.skeletonHandleDir = skeletonHandleDir;

    const contour = skeletonData.contours[contourIndex];
    const point = contour.points[pointIndex];

    // Get the appropriate offset key based on side and handle type
    this.offsetKey = side === "left"
      ? (handleType === "in" ? "leftHandleInOffset" : "leftHandleOutOffset")
      : (handleType === "in" ? "rightHandleInOffset" : "rightHandleOutOffset");

    // Store original offset
    this.originalOffset = point[this.offsetKey] || 0;

    console.log('[HANDLE-EDIT] Phase 4: Original offset', {
      offsetKey: this.offsetKey,
      originalOffset: this.originalOffset
    });
  }

  /**
   * Apply drag delta and return the new offset.
   * Movement is constrained to skeleton handle direction.
   * @param {Object} delta - The drag delta {x, y}
   * @returns {Object} { contourIndex, pointIndex, side, handleType, offset }
   */
  applyDelta(delta) {
    // Project delta onto skeleton handle direction
    const projectedDelta = delta.x * this.skeletonHandleDir.x + delta.y * this.skeletonHandleDir.y;
    const newOffset = this.originalOffset + projectedDelta;

    console.log('[HANDLE-EDIT] Phase 4: applyDelta', {
      delta,
      projectedDelta,
      originalOffset: this.originalOffset,
      newOffset,
    });

    return {
      contourIndex: this.contourIndex,
      pointIndex: this.pointIndex,
      side: this.side,
      handleType: this.handleType,
      offset: Math.round(newOffset),
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
    skeletonHandleDir
  );
}
