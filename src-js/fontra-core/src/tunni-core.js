import { addVectors, distance, intersect, normalizeVector, subVectors } from "./vector.js";

// Temporary debug instrumentation for refactor verification.
// Keep enabled until final cleanup step in the plan.
const LOG_TUNNI_CORE_CALLS = true;

function logTunniCoreCall(name) {
  // Runtime trace bucket to verify which implementation path is executed.
  // This is intentionally global and temporary for refactor diagnostics.
  const trace = (globalThis.__FONTRA_TUNNI_TRACE__ ??= {
    core: {},
    wrappers: {},
    last: [],
  });
  trace.core[name] = (trace.core[name] || 0) + 1;
  trace.last.push({ source: "core", name, at: Date.now() });
  if (trace.last.length > 100) {
    trace.last.shift();
  }

  if (LOG_TUNNI_CORE_CALLS) {
    // Use warn (not debug) so calls are visible even with default DevTools filters.
    console.warn(`[tunni-core] ${name}`);
  }
}

function assertCubicSegmentPoints(segmentPoints) {
  if (!Array.isArray(segmentPoints) || segmentPoints.length !== 4) {
    throw new Error("Segment must be an array of exactly 4 points");
  }
}

function snapPoint(point) {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

export function midpoint(pointA, pointB) {
  return {
    x: (pointA.x + pointB.x) / 2,
    y: (pointA.y + pointB.y) / 2,
  };
}

export function trueIntersection(lineAStart, lineAEnd, lineBStart, lineBEnd) {
  return intersect(lineAStart, lineAEnd, lineBStart, lineBEnd);
}

export function calculateRegularTunniPoint(segmentPoints) {
  logTunniCoreCall("calculateRegularTunniPoint");
  assertCubicSegmentPoints(segmentPoints);
  const [, controlPoint1, controlPoint2] = segmentPoints;
  return midpoint(controlPoint1, controlPoint2);
}

export function calculateRegularTrueTunniPoint(segmentPoints) {
  logTunniCoreCall("calculateRegularTrueTunniPoint");
  assertCubicSegmentPoints(segmentPoints);

  const [startPoint, controlPoint1, controlPoint2, endPoint] = segmentPoints;
  const startDirection = normalizeVector(subVectors(controlPoint1, startPoint));
  const endDirection = normalizeVector(subVectors(controlPoint2, endPoint));

  return trueIntersection(
    startPoint,
    addVectors(startPoint, startDirection),
    endPoint,
    addVectors(endPoint, endDirection)
  );
}

/**
 * Rebuild cubic off-curve points from a dragged visual/true Tunni point.
 * The result keeps original ray directions from on-curve points to controls.
 */
export function calculateControlPointsFromTunni(
  tunniPoint,
  segmentPoints,
  equalizeDistances = false,
  useArithmeticMean = false,
  gridSnapEnabled = false
) {
  logTunniCoreCall("calculateControlPointsFromTunni");
  assertCubicSegmentPoints(segmentPoints);
  const [startPoint, controlPoint1, controlPoint2, endPoint] = segmentPoints;

  const startDirection = normalizeVector(subVectors(controlPoint1, startPoint));
  const endDirection = normalizeVector(subVectors(controlPoint2, endPoint));

  const intersection = trueIntersection(
    startPoint,
    addVectors(startPoint, startDirection),
    endPoint,
    addVectors(endPoint, endDirection)
  );

  // Parallel rays: no stable reconstruction, keep original controls.
  if (!intersection) {
    return [controlPoint1, controlPoint2];
  }

  const originalStartDistance = distance(startPoint, controlPoint1);
  const originalEndDistance = distance(endPoint, controlPoint2);

  let targetStartDistance = originalStartDistance;
  let targetEndDistance = originalEndDistance;
  if (useArithmeticMean) {
    const averageDistance = (originalStartDistance + originalEndDistance) / 2;
    targetStartDistance = averageDistance;
    targetEndDistance = averageDistance;
  }

  const startToIntersection = distance(startPoint, intersection);
  const endToIntersection = distance(endPoint, intersection);
  const startToTunni = distance(startPoint, tunniPoint);
  const endToTunni = distance(endPoint, tunniPoint);

  let startExtra = startToTunni - startToIntersection;
  let endExtra = endToTunni - endToIntersection;
  if (equalizeDistances) {
    const averageExtra = (startExtra + endExtra) / 2;
    startExtra = averageExtra;
    endExtra = averageExtra;
  }

  const newStartDistance = targetStartDistance + startExtra;
  const newEndDistance = targetEndDistance + endExtra;
  const newControlPoint1 = {
    x: startPoint.x + newStartDistance * startDirection.x,
    y: startPoint.y + newStartDistance * startDirection.y,
  };
  const newControlPoint2 = {
    x: endPoint.x + newEndDistance * endDirection.x,
    y: endPoint.y + newEndDistance * endDirection.y,
  };

  if (gridSnapEnabled) {
    return [snapPoint(newControlPoint1), snapPoint(newControlPoint2)];
  }
  return [newControlPoint1, newControlPoint2];
}

/**
 * Equalize two cubic handle tensions by moving controls along existing rays.
 */
export function calculateEqualizedControlPoints(segmentPoints) {
  logTunniCoreCall("calculateEqualizedControlPoints");
  assertCubicSegmentPoints(segmentPoints);
  const [startPoint, controlPoint1, controlPoint2, endPoint] = segmentPoints;
  const truePoint = calculateRegularTrueTunniPoint(segmentPoints);
  if (!truePoint) {
    return [controlPoint1, controlPoint2];
  }

  const startToTrue = distance(startPoint, truePoint);
  const endToTrue = distance(endPoint, truePoint);
  if (startToTrue <= 0 || endToTrue <= 0) {
    return [controlPoint1, controlPoint2];
  }

  const startTension = distance(startPoint, controlPoint1) / startToTrue;
  const endTension = distance(endPoint, controlPoint2) / endToTrue;
  const targetTension = (startTension + endTension) / 2;

  const startDirection = normalizeVector(subVectors(controlPoint1, startPoint));
  const endDirection = normalizeVector(subVectors(controlPoint2, endPoint));
  const newStartDistance = targetTension * startToTrue;
  const newEndDistance = targetTension * endToTrue;

  return [
    {
      x: startPoint.x + newStartDistance * startDirection.x,
      y: startPoint.y + newStartDistance * startDirection.y,
    },
    {
      x: endPoint.x + newEndDistance * endDirection.x,
      y: endPoint.y + newEndDistance * endDirection.y,
    },
  ];
}

/**
 * Legacy regular equalize predicate: compares absolute control lengths.
 * Kept as-is for behavior parity with current pointer workflows.
 */
export function areDistancesEqualized(segmentPoints, tolerance = 0.01) {
  assertCubicSegmentPoints(segmentPoints);
  const [startPoint, controlPoint1, controlPoint2, endPoint] = segmentPoints;
  const startLength = distance(startPoint, controlPoint1);
  const endLength = distance(endPoint, controlPoint2);
  return Math.abs(startLength - endLength) < tolerance;
}

export function calculateControlHandleDistance(segmentPoints) {
  assertCubicSegmentPoints(segmentPoints);
  return distance(segmentPoints[1], segmentPoints[2]);
}

/**
 * Rebuild cubic on-curve endpoints from dragged true-Tunni point.
 * Control points stay untouched; only endpoints move on fixed rays.
 */
export function calculateOnCurvePointsFromTunni(
  tunniPoint,
  segmentPoints,
  equalizeDistances = true,
  gridSnapEnabled = false
) {
  logTunniCoreCall("calculateOnCurvePointsFromTunni");
  assertCubicSegmentPoints(segmentPoints);
  const [startPoint, controlPoint1, controlPoint2, endPoint] = segmentPoints;

  const startDirection = normalizeVector(subVectors(controlPoint1, startPoint));
  const endDirection = normalizeVector(subVectors(controlPoint2, endPoint));

  const originalStartLength = distance(startPoint, controlPoint1);
  const originalEndLength = distance(endPoint, controlPoint2);
  const startToTunni = distance(startPoint, tunniPoint);
  const endToTunni = distance(endPoint, tunniPoint);

  const startRatio = originalStartLength / startToTunni;
  const endRatio = originalEndLength / endToTunni;
  const resolvedStartRatio = equalizeDistances ? (startRatio + endRatio) / 2 : startRatio;
  const resolvedEndRatio = equalizeDistances ? (startRatio + endRatio) / 2 : endRatio;

  const newStartDistance = startToTunni * resolvedStartRatio;
  const newEndDistance = endToTunni * resolvedEndRatio;
  const newStartPoint = {
    x: tunniPoint.x - newStartDistance * startDirection.x,
    y: tunniPoint.y - newStartDistance * startDirection.y,
  };
  const newEndPoint = {
    x: tunniPoint.x - newEndDistance * endDirection.x,
    y: tunniPoint.y - newEndDistance * endDirection.y,
  };

  if (gridSnapEnabled) {
    return [snapPoint(newStartPoint), controlPoint1, controlPoint2, snapPoint(newEndPoint)];
  }
  return [newStartPoint, controlPoint1, controlPoint2, newEndPoint];
}

export function calculateSkeletonTunniPoint(segment) {
  if (!segment?.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const [controlPoint1, controlPoint2] = segment.controlPoints;
  return midpoint(controlPoint1, controlPoint2);
}

export function calculateSkeletonTrueTunniPoint(segment) {
  if (!segment?.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const { startPoint, endPoint, controlPoints } = segment;
  const [controlPoint1, controlPoint2] = controlPoints;
  return trueIntersection(startPoint, controlPoint1, endPoint, controlPoint2);
}
