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

/**
 * Build skeleton segments from contour points.
 * Segment shape matches editor consumers:
 * { startPoint, endPoint, controlPoints, startIndex, endIndex, controlIndices, segmentIndex }
 */
export function buildSegmentsFromSkeletonPoints(points, isClosed) {
  logTunniCoreCall("buildSegmentsFromSkeletonPoints");
  const segments = [];
  const pointCount = points.length;
  if (pointCount < 2) {
    return segments;
  }

  const onCurveIndices = [];
  for (let i = 0; i < pointCount; i++) {
    if (!points[i].type) {
      onCurveIndices.push(i);
    }
  }
  if (onCurveIndices.length < 2) {
    return segments;
  }

  for (let i = 0; i < onCurveIndices.length; i++) {
    const startIndex = onCurveIndices[i];
    const isLast = i === onCurveIndices.length - 1;
    if (!isClosed && isLast) {
      continue;
    }
    const endIndex = isLast ? onCurveIndices[0] : onCurveIndices[i + 1];
    const startPoint = points[startIndex];
    const endPoint = points[endIndex];

    const controlPoints = [];
    const controlIndices = [];

    if (isLast) {
      for (let j = startIndex + 1; j < pointCount; j++) {
        if (points[j].type) {
          controlPoints.push(points[j]);
          controlIndices.push(j);
        }
      }
      for (let j = 0; j < endIndex; j++) {
        if (points[j].type) {
          controlPoints.push(points[j]);
          controlIndices.push(j);
        }
      }
    } else {
      for (let j = startIndex + 1; j < endIndex; j++) {
        if (points[j].type) {
          controlPoints.push(points[j]);
          controlIndices.push(j);
        }
      }
    }

    segments.push({
      startPoint,
      endPoint,
      controlPoints,
      startIndex,
      endIndex,
      controlIndices,
      segmentIndex: i,
    });
  }

  return segments;
}

/**
 * Hit-test skeleton midpoint/true Tunni points.
 * Returns editor-friendly hit payload or null.
 */
export function skeletonTunniHitTest(point, size, skeletonData, options = {}) {
  logTunniCoreCall("skeletonTunniHitTest");
  if (!skeletonData?.contours) {
    return null;
  }

  const { midpointOnly = false } = options;
  for (let contourIndex = 0; contourIndex < skeletonData.contours.length; contourIndex++) {
    const contour = skeletonData.contours[contourIndex];
    const segments = buildSegmentsFromSkeletonPoints(contour.points, contour.isClosed);

    for (const segment of segments) {
      if (segment.controlPoints.length !== 2) {
        continue;
      }

      if (!midpointOnly) {
        const trueTunniPoint = calculateSkeletonTrueTunniPoint(segment);
        if (trueTunniPoint && distance(point, trueTunniPoint) <= size) {
          return {
            type: "true-tunni",
            contourIndex,
            segmentIndex: segment.segmentIndex,
            segment,
            tunniPoint: trueTunniPoint,
          };
        }
      }

      const midpointTunniPoint = calculateSkeletonTunniPoint(segment);
      if (midpointTunniPoint && distance(point, midpointTunniPoint) <= size) {
        return {
          type: "tunni",
          contourIndex,
          segmentIndex: segment.segmentIndex,
          segment,
          tunniPoint: midpointTunniPoint,
        };
      }
    }
  }

  return null;
}

export function calculateSkeletonTunniPoint(segment) {
  logTunniCoreCall("calculateSkeletonTunniPoint");
  // Intentionally mirrors regular midpoint semantics for skeleton cubic segments.
  if (!segment?.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const [controlPoint1, controlPoint2] = segment.controlPoints;
  return midpoint(controlPoint1, controlPoint2);
}

export function calculateSkeletonTrueTunniPoint(segment) {
  logTunniCoreCall("calculateSkeletonTrueTunniPoint");
  // True Tunni point for skeleton segments is the intersection of start->cp1 and end->cp2.
  if (!segment?.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const { startPoint, endPoint, controlPoints } = segment;
  const [controlPoint1, controlPoint2] = controlPoints;
  return trueIntersection(startPoint, controlPoint1, endPoint, controlPoint2);
}

/**
 * Skeleton midpoint drag math:
 * 1) project pointer delta to the averaged handle direction,
 * 2) move both controls along their own rays,
 * 3) optionally preserve equalized tension by proportional motion.
 */
export function calculateSkeletonControlPointsFromTunniDelta(
  delta,
  segment,
  preserveTensions = true
) {
  logTunniCoreCall("calculateSkeletonControlPointsFromTunniDelta");
  if (!segment?.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const { startPoint, endPoint, controlPoints } = segment;
  const [controlPoint1, controlPoint2] = controlPoints;

  const direction1 = normalizeVector(subVectors(controlPoint1, startPoint));
  const direction2 = normalizeVector(subVectors(controlPoint2, endPoint));
  const averagedDirection = normalizeVector(addVectors(direction1, direction2));
  const projectedDelta = delta.x * averagedDirection.x + delta.y * averagedDirection.y;

  if (preserveTensions) {
    const truePoint = calculateSkeletonTrueTunniPoint(segment);
    if (truePoint) {
      const startToTrue = distance(startPoint, truePoint);
      const endToTrue = distance(endPoint, truePoint);
      if (startToTrue > 0 && endToTrue > 0) {
        const distanceSum = startToTrue + endToTrue;
        const proportionalScale = (2 * projectedDelta) / distanceSum;
        const move1 = proportionalScale * startToTrue;
        const move2 = proportionalScale * endToTrue;
        return [
          {
            x: controlPoint1.x + direction1.x * move1,
            y: controlPoint1.y + direction1.y * move1,
          },
          {
            x: controlPoint2.x + direction2.x * move2,
            y: controlPoint2.y + direction2.y * move2,
          },
        ];
      }
    }

    // Fallback for parallel rays: keep proportional mode but use identical scalar movement.
    return [
      {
        x: controlPoint1.x + direction1.x * projectedDelta,
        y: controlPoint1.y + direction1.y * projectedDelta,
      },
      {
        x: controlPoint2.x + direction2.x * projectedDelta,
        y: controlPoint2.y + direction2.y * projectedDelta,
      },
    ];
  }

  // Non-proportional mode: each control tracks its own projection.
  const projection1 = delta.x * direction1.x + delta.y * direction1.y;
  const projection2 = delta.x * direction2.x + delta.y * direction2.y;
  return [
    {
      x: controlPoint1.x + direction1.x * projection1,
      y: controlPoint1.y + direction1.y * projection1,
    },
    {
      x: controlPoint2.x + direction2.x * projection2,
      y: controlPoint2.y + direction2.y * projection2,
    },
  ];
}

/**
 * Skeleton true-point drag math:
 * move the two on-curve anchors along fixed start/end handle directions.
 */
export function calculateSkeletonOnCurveFromTunni(
  newTrueTunniPoint,
  segment,
  equalizeDistances = true
) {
  logTunniCoreCall("calculateSkeletonOnCurveFromTunni");
  if (!segment?.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const { startPoint, endPoint, controlPoints } = segment;
  const [controlPoint1, controlPoint2] = controlPoints;
  const originalTruePoint = trueIntersection(startPoint, controlPoint1, endPoint, controlPoint2);
  if (!originalTruePoint) {
    return null;
  }

  const direction1 = normalizeVector(subVectors(controlPoint1, startPoint));
  const direction2 = normalizeVector(subVectors(controlPoint2, endPoint));
  const delta = subVectors(newTrueTunniPoint, originalTruePoint);
  const projection1 = delta.x * direction1.x + delta.y * direction1.y;
  const projection2 = delta.x * direction2.x + delta.y * direction2.y;

  const resolvedProjection1 = equalizeDistances ? (projection1 + projection2) / 2 : projection1;
  const resolvedProjection2 = equalizeDistances ? (projection1 + projection2) / 2 : projection2;

  return {
    newStartPoint: {
      x: startPoint.x + direction1.x * resolvedProjection1,
      y: startPoint.y + direction1.y * resolvedProjection1,
    },
    newEndPoint: {
      x: endPoint.x + direction2.x * resolvedProjection2,
      y: endPoint.y + direction2.y * resolvedProjection2,
    },
  };
}

/**
 * Skeleton tension equalization:
 * keep handle directions, make scalar tension equal by averaging.
 */
export function calculateSkeletonEqualizedControlPoints(segment) {
  logTunniCoreCall("calculateSkeletonEqualizedControlPoints");
  if (!segment?.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const { startPoint, endPoint, controlPoints } = segment;
  const [controlPoint1, controlPoint2] = controlPoints;
  const truePoint = calculateSkeletonTrueTunniPoint(segment);
  if (!truePoint) {
    return [controlPoint1, controlPoint2];
  }

  const startToTrue = distance(startPoint, truePoint);
  const endToTrue = distance(endPoint, truePoint);
  if (startToTrue <= 0 || endToTrue <= 0) {
    return [controlPoint1, controlPoint2];
  }

  const tension1 = distance(startPoint, controlPoint1) / startToTrue;
  const tension2 = distance(endPoint, controlPoint2) / endToTrue;
  const targetTension = (tension1 + tension2) / 2;
  const direction1 = normalizeVector(subVectors(controlPoint1, startPoint));
  const direction2 = normalizeVector(subVectors(controlPoint2, endPoint));

  return [
    {
      x: startPoint.x + direction1.x * targetTension * startToTrue,
      y: startPoint.y + direction1.y * targetTension * startToTrue,
    },
    {
      x: endPoint.x + direction2.x * targetTension * endToTrue,
      y: endPoint.y + direction2.y * targetTension * endToTrue,
    },
  ];
}

export function areSkeletonTensionsEqualized(segment, tolerance = 0.01) {
  logTunniCoreCall("areSkeletonTensionsEqualized");
  if (!segment?.controlPoints || segment.controlPoints.length !== 2) {
    return true;
  }

  const { startPoint, endPoint, controlPoints } = segment;
  const [controlPoint1, controlPoint2] = controlPoints;
  const truePoint = calculateSkeletonTrueTunniPoint(segment);
  if (!truePoint) {
    return true;
  }

  const startToTrue = distance(startPoint, truePoint);
  const endToTrue = distance(endPoint, truePoint);
  if (startToTrue <= 0 || endToTrue <= 0) {
    return true;
  }

  const tension1 = distance(startPoint, controlPoint1) / startToTrue;
  const tension2 = distance(endPoint, controlPoint2) / endToTrue;
  return Math.abs(tension1 - tension2) < tolerance;
}
