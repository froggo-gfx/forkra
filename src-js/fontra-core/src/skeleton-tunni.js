import {
  areTensionsEqualized,
  calculateControlHandlePoint,
  calculateEqualizedControlPoints,
  calculateTunniPoint,
} from "./tunni-calculations.js";
import {
  addVectors,
  distance,
  dotVector,
  mulVectorScalar,
  normalizeVector,
  subVectors,
} from "./vector.js";

export function buildSkeletonTunniSegments(contour) {
  const points = contour?.points || [];
  const onCurveIndices = [];
  for (let i = 0; i < points.length; i++) {
    if (!points[i]?.type) {
      onCurveIndices.push(i);
    }
  }
  if (onCurveIndices.length < 2) {
    return [];
  }

  const segments = [];
  for (let i = 0; i < onCurveIndices.length - 1; i++) {
    segments.push(
      makeSkeletonTunniSegment(contour, onCurveIndices[i], onCurveIndices[i + 1])
    );
  }
  if (contour?.closed) {
    segments.push(
      makeSkeletonTunniSegment(
        contour,
        onCurveIndices[onCurveIndices.length - 1],
        onCurveIndices[0]
      )
    );
  }
  return segments.map((segment, segmentIndex) => ({ ...segment, segmentIndex }));
}

export function segmentToTunniPoints(segment) {
  if (!segment?.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }
  return [
    segment.startPoint,
    segment.controlPoints[0],
    segment.controlPoints[1],
    segment.endPoint,
  ];
}

export function calculateSkeletonTunniPoint(segment) {
  const points = segmentToTunniPoints(segment);
  return points ? calculateControlHandlePoint(points) : null;
}

export function calculateSkeletonTrueTunniPoint(segment) {
  const points = segmentToTunniPoints(segment);
  return points ? (calculateTunniPoint(points) ?? null) : null;
}

export function calculateSkeletonControlPointsFromTunniDelta(
  delta,
  segment,
  preserveTensions = true
) {
  const points = segmentToTunniPoints(segment);
  if (!points) {
    return null;
  }
  const [startPoint, controlPoint1, controlPoint2, endPoint] = points;
  const direction1 = normalizeVector(subVectors(controlPoint1, startPoint));
  const direction2 = normalizeVector(subVectors(controlPoint2, endPoint));

  const averageDirection = normalizeVector(addVectors(direction1, direction2));
  const projection = dotVector(delta, averageDirection);

  if (preserveTensions) {
    const trueTunniPoint = calculateSkeletonTrueTunniPoint(segment);
    if (trueTunniPoint) {
      const startDistance = distance(startPoint, trueTunniPoint);
      const endDistance = distance(endPoint, trueTunniPoint);
      if (startDistance > 0 && endDistance > 0) {
        const scale = (2 * projection) / (startDistance + endDistance);
        return [
          addProjected(controlPoint1, direction1, scale * startDistance),
          addProjected(controlPoint2, direction2, scale * endDistance),
        ];
      }
    }
    return [
      addProjected(controlPoint1, direction1, projection),
      addProjected(controlPoint2, direction2, projection),
    ];
  }

  return [
    addProjected(controlPoint1, direction1, dotVector(delta, direction1)),
    addProjected(controlPoint2, direction2, dotVector(delta, direction2)),
  ];
}

export function calculateSkeletonOnCurveFromTunni(
  nextTrueTunniPoint,
  segment,
  equalizeDistances = true
) {
  const points = segmentToTunniPoints(segment);
  if (!points) {
    return null;
  }
  const [startPoint, controlPoint1, controlPoint2, endPoint] = points;
  const originalTrueTunniPoint = calculateSkeletonTrueTunniPoint(segment);
  if (!originalTrueTunniPoint) {
    return null;
  }

  const direction1 = normalizeVector(subVectors(controlPoint1, startPoint));
  const direction2 = normalizeVector(subVectors(controlPoint2, endPoint));
  const delta = subVectors(nextTrueTunniPoint, originalTrueTunniPoint);
  const projection1 = dotVector(delta, direction1);
  const projection2 = dotVector(delta, direction2);
  const finalProjection = equalizeDistances ? (projection1 + projection2) / 2 : null;

  return [
    addProjected(startPoint, direction1, finalProjection ?? projection1),
    addProjected(endPoint, direction2, finalProjection ?? projection2),
  ];
}

export function calculateSkeletonEqualizedControlPoints(segment) {
  const points = segmentToTunniPoints(segment);
  return points ? calculateEqualizedControlPoints(points) : null;
}

export function areSkeletonTensionsEqualized(segment, tolerance = 0.01) {
  const points = segmentToTunniPoints(segment);
  return points ? areTensionsEqualized(points, tolerance) : true;
}

export function skeletonTunniHitTest(point, size, skeletonData, options = {}) {
  if (!skeletonData?.contours?.length) {
    return null;
  }
  const { midpointOnly = false, includeTrueTunni = true } = options;

  for (
    let contourIndex = skeletonData.contours.length - 1;
    contourIndex >= 0;
    contourIndex--
  ) {
    const contour = skeletonData.contours[contourIndex];
    const segments = buildSkeletonTunniSegments(contour);
    for (let i = segments.length - 1; i >= 0; i--) {
      const segment = segments[i];
      if (segment.controlPoints.length !== 2) {
        continue;
      }
      if (!midpointOnly && includeTrueTunni) {
        const trueTunniPoint = calculateSkeletonTrueTunniPoint(segment);
        if (trueTunniPoint && distance(point, trueTunniPoint) <= size) {
          return {
            type: "true-tunni",
            contourId: contour.id,
            contourIndex,
            segmentIndex: segment.segmentIndex,
            segment,
            tunniPoint: trueTunniPoint,
          };
        }
      }

      const tunniPoint = calculateSkeletonTunniPoint(segment);
      if (tunniPoint && distance(point, tunniPoint) <= size) {
        return {
          type: "tunni",
          contourId: contour.id,
          contourIndex,
          segmentIndex: segment.segmentIndex,
          segment,
          tunniPoint,
        };
      }
    }
  }
  return null;
}

function makeSkeletonTunniSegment(contour, startIndex, endIndex) {
  const points = contour.points || [];
  const controlEntries =
    startIndex < endIndex
      ? collectControlEntries(points, startIndex + 1, endIndex)
      : [
          ...collectControlEntries(points, startIndex + 1, points.length),
          ...collectControlEntries(points, 0, endIndex),
        ];
  return {
    contourId: contour.id,
    startPoint: points[startIndex],
    endPoint: points[endIndex],
    controlPoints: controlEntries.map((entry) => entry.point),
    startPointId: points[startIndex]?.id,
    endPointId: points[endIndex]?.id,
    controlPointIds: controlEntries.map((entry) => entry.point.id),
    startIndex,
    endIndex,
    controlIndices: controlEntries.map((entry) => entry.index),
  };
}

function collectControlEntries(points, startIndex, endIndex) {
  const entries = [];
  for (let i = startIndex; i < endIndex; i++) {
    if (points[i]?.type === "cubic") {
      entries.push({ point: points[i], index: i });
    }
  }
  return entries;
}

function addProjected(point, direction, projection) {
  const offset = mulVectorScalar(direction, projection);
  return {
    x: point.x + offset.x,
    y: point.y + offset.y,
  };
}
