/**
 * Skeleton Tunni Lines calculations
 *
 * Provides Tunni point calculations for skeleton contours:
 * - Tunni Point (midpoint) - dragging changes curve tension
 * - True Tunni Point (intersection) - dragging moves on-curve points along projection lines
 */

import {
  intersect,
  distance,
  addVectors,
  subVectors,
  normalizeVector,
  mulVectorScalar,
} from "@fontra/core/vector.js";

/**
 * Build segments from skeleton contour points.
 * A segment is: { startPoint, endPoint, controlPoints, startIndex, endIndex }
 *
 * @param {Array} points - Array of skeleton points
 * @param {boolean} isClosed - Whether the contour is closed
 * @returns {Array} Array of segment objects
 */
export function buildSegmentsFromSkeletonPoints(points, isClosed) {
  const segments = [];
  const numPoints = points.length;

  if (numPoints < 2) return segments;

  // Find on-curve point indices
  const onCurveIndices = [];
  for (let i = 0; i < numPoints; i++) {
    if (!points[i].type) {
      onCurveIndices.push(i);
    }
  }

  if (onCurveIndices.length < 2) return segments;

  // Build segments between consecutive on-curve points
  for (let i = 0; i < onCurveIndices.length; i++) {
    const startIdx = onCurveIndices[i];
    const isLast = i === onCurveIndices.length - 1;

    // For open contours, skip the last segment (would wrap to first point)
    if (!isClosed && isLast) continue;

    const endIdx = isLast ? onCurveIndices[0] : onCurveIndices[i + 1];

    const startPoint = points[startIdx];
    const endPoint = points[endIdx];

    // Collect off-curve (control) points between start and end
    const controlPoints = [];
    const controlIndices = [];

    if (isLast) {
      // Wrap around: collect from startIdx+1 to end, then from 0 to endIdx
      for (let j = startIdx + 1; j < numPoints; j++) {
        if (points[j].type) {
          controlPoints.push(points[j]);
          controlIndices.push(j);
        }
      }
      for (let j = 0; j < endIdx; j++) {
        if (points[j].type) {
          controlPoints.push(points[j]);
          controlIndices.push(j);
        }
      }
    } else {
      for (let j = startIdx + 1; j < endIdx; j++) {
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
      startIndex: startIdx,
      endIndex: endIdx,
      controlIndices,
      segmentIndex: i,
    });
  }

  return segments;
}

/**
 * Calculate Tunni Point (midpoint between control points).
 *
 * @param {Object} segment - Segment object with startPoint, endPoint, controlPoints
 * @returns {Object|null} Tunni point {x, y} or null if not a cubic segment
 */
export function calculateSkeletonTunniPoint(segment) {
  if (!segment.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const [cp1, cp2] = segment.controlPoints;
  return {
    x: (cp1.x + cp2.x) / 2,
    y: (cp1.y + cp2.y) / 2,
  };
}

/**
 * Calculate True Tunni Point (intersection of on-curve to off-curve lines).
 *
 * @param {Object} segment - Segment object
 * @returns {Object|null} True Tunni point {x, y} or null if lines are parallel
 */
export function calculateSkeletonTrueTunniPoint(segment) {
  if (!segment.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const { startPoint, endPoint, controlPoints } = segment;
  const [cp1, cp2] = controlPoints;

  // Lines: startPoint->cp1 and endPoint->cp2
  return intersect(startPoint, cp1, endPoint, cp2);
}

/**
 * Calculate new control point positions when dragging the Tunni Point (midpoint).
 * The control points move along their original directions to maintain curve shape.
 *
 * @param {Object} newTunniPoint - New position for the Tunni point
 * @param {Object} segment - Original segment
 * @param {boolean} equalizeDistances - If true, both control points move by same amount
 * @returns {Array|null} Array of [newCp1, newCp2] or null
 */
export function calculateSkeletonControlPointsFromTunni(
  newTunniPoint,
  segment,
  equalizeDistances = true
) {
  if (!segment.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const { startPoint, endPoint, controlPoints } = segment;
  const [cp1, cp2] = controlPoints;

  // Calculate original directions from on-curve to off-curve
  const dir1 = normalizeVector(subVectors(cp1, startPoint));
  const dir2 = normalizeVector(subVectors(cp2, endPoint));

  // Calculate original tunni point (midpoint)
  const origTunni = {
    x: (cp1.x + cp2.x) / 2,
    y: (cp1.y + cp2.y) / 2,
  };

  // Movement vector
  const tunniDelta = subVectors(newTunniPoint, origTunni);

  // Calculate 45-degree vector (average of both directions)
  const fortyFiveVec = normalizeVector(addVectors(dir1, dir2));

  if (equalizeDistances) {
    // Project tunni delta onto the 45-degree vector
    const projection = tunniDelta.x * fortyFiveVec.x + tunniDelta.y * fortyFiveVec.y;

    // Move both control points by same amount along their directions
    const newCp1 = {
      x: cp1.x + dir1.x * projection,
      y: cp1.y + dir1.y * projection,
    };
    const newCp2 = {
      x: cp2.x + dir2.x * projection,
      y: cp2.y + dir2.y * projection,
    };

    return [newCp1, newCp2];
  } else {
    // Each control point moves independently along its own direction
    const projection1 = tunniDelta.x * dir1.x + tunniDelta.y * dir1.y;
    const projection2 = tunniDelta.x * dir2.x + tunniDelta.y * dir2.y;

    const newCp1 = {
      x: cp1.x + dir1.x * projection1,
      y: cp1.y + dir1.y * projection1,
    };
    const newCp2 = {
      x: cp2.x + dir2.x * projection2,
      y: cp2.y + dir2.y * projection2,
    };

    return [newCp1, newCp2];
  }
}

/**
 * Calculate new on-curve point positions when dragging the True Tunni Point (intersection).
 * The on-curve points move along the lines to their respective off-curve points.
 *
 * @param {Object} newTrueTunniPoint - New position for the true Tunni point
 * @param {Object} segment - Original segment
 * @param {boolean} equalizeDistances - If true, both on-curve points move by same amount
 * @returns {Object|null} Object with { newStartPoint, newEndPoint } or null
 */
export function calculateSkeletonOnCurveFromTunni(
  newTrueTunniPoint,
  segment,
  equalizeDistances = true
) {
  if (!segment.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const { startPoint, endPoint, controlPoints } = segment;
  const [cp1, cp2] = controlPoints;

  // Calculate original true tunni point
  const origTrueTunni = intersect(startPoint, cp1, endPoint, cp2);
  if (!origTrueTunni) {
    return null; // Lines are parallel
  }

  // Calculate directions from on-curve to off-curve (these are fixed)
  const dir1 = normalizeVector(subVectors(cp1, startPoint));
  const dir2 = normalizeVector(subVectors(cp2, endPoint));

  // Calculate movement delta for the true tunni point
  const delta = subVectors(newTrueTunniPoint, origTrueTunni);

  // Project delta onto each direction
  const projection1 = delta.x * dir1.x + delta.y * dir1.y;
  const projection2 = delta.x * dir2.x + delta.y * dir2.y;

  let finalProjection1, finalProjection2;

  if (equalizeDistances) {
    const avgProjection = (projection1 + projection2) / 2;
    finalProjection1 = avgProjection;
    finalProjection2 = avgProjection;
  } else {
    finalProjection1 = projection1;
    finalProjection2 = projection2;
  }

  // Move on-curve points along their fixed directions
  const newStartPoint = {
    x: startPoint.x + dir1.x * finalProjection1,
    y: startPoint.y + dir1.y * finalProjection1,
  };

  const newEndPoint = {
    x: endPoint.x + dir2.x * finalProjection2,
    y: endPoint.y + dir2.y * finalProjection2,
  };

  return { newStartPoint, newEndPoint };
}

/**
 * Hit test for skeleton Tunni points.
 *
 * @param {Object} point - Point to test (in glyph coordinates)
 * @param {number} size - Hit margin size
 * @param {Object} skeletonData - Skeleton data from customData
 * @param {Object} options - Options: { midpointOnly: boolean }
 * @returns {Object|null} Hit result or null
 */
export function skeletonTunniHitTest(point, size, skeletonData, options = {}) {
  if (!skeletonData?.contours) {
    return null;
  }

  const { midpointOnly = false } = options;

  for (let contourIndex = 0; contourIndex < skeletonData.contours.length; contourIndex++) {
    const contour = skeletonData.contours[contourIndex];
    const segments = buildSegmentsFromSkeletonPoints(contour.points, contour.isClosed);

    for (const segment of segments) {
      if (segment.controlPoints.length !== 2) continue;

      // Check true tunni point first (intersection) - unless midpointOnly
      if (!midpointOnly) {
        const trueTunniPt = calculateSkeletonTrueTunniPoint(segment);
        if (trueTunniPt && distance(point, trueTunniPt) <= size) {
          return {
            type: "true-tunni",
            contourIndex,
            segmentIndex: segment.segmentIndex,
            segment,
            tunniPoint: trueTunniPt,
          };
        }
      }

      // Check midpoint tunni point
      const tunniPt = calculateSkeletonTunniPoint(segment);
      if (tunniPt && distance(point, tunniPt) <= size) {
        return {
          type: "tunni",
          contourIndex,
          segmentIndex: segment.segmentIndex,
          segment,
          tunniPoint: tunniPt,
        };
      }
    }
  }

  return null;
}

/**
 * Calculate equalized control points (same tension on both handles).
 *
 * @param {Object} segment - Segment with controlPoints
 * @returns {Array|null} [newCp1, newCp2] with equalized tensions
 */
export function calculateSkeletonEqualizedControlPoints(segment) {
  if (!segment.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const { startPoint, endPoint, controlPoints } = segment;
  const [cp1, cp2] = controlPoints;

  const trueTunni = calculateSkeletonTrueTunniPoint(segment);
  if (!trueTunni) {
    return [cp1, cp2]; // Lines parallel, return original
  }

  const distStartToTunni = distance(startPoint, trueTunni);
  const distEndToTunni = distance(endPoint, trueTunni);

  if (distStartToTunni <= 0 || distEndToTunni <= 0) {
    return [cp1, cp2];
  }

  // Calculate current tensions
  const tension1 = distance(startPoint, cp1) / distStartToTunni;
  const tension2 = distance(endPoint, cp2) / distEndToTunni;

  // Target tension is average
  const targetTension = (tension1 + tension2) / 2;

  // Calculate directions
  const dir1 = normalizeVector(subVectors(cp1, startPoint));
  const dir2 = normalizeVector(subVectors(cp2, endPoint));

  // New distances
  const newDist1 = targetTension * distStartToTunni;
  const newDist2 = targetTension * distEndToTunni;

  const newCp1 = {
    x: startPoint.x + dir1.x * newDist1,
    y: startPoint.y + dir1.y * newDist1,
  };

  const newCp2 = {
    x: endPoint.x + dir2.x * newDist2,
    y: endPoint.y + dir2.y * newDist2,
  };

  console.log("[Equalize] tension1:", tension1, "tension2:", tension2, "target:", targetTension);
  console.log("[Equalize] distStartToTunni:", distStartToTunni, "distEndToTunni:", distEndToTunni);
  console.log("[Equalize] newDist1:", newDist1, "newDist2:", newDist2);

  return [newCp1, newCp2];
}

/**
 * Check if tensions are already equalized.
 *
 * @param {Object} segment - Segment to check
 * @param {number} tolerance - Tolerance for comparison (default 0.01)
 * @returns {boolean} True if tensions are equal within tolerance
 */
export function areSkeletonTensionsEqualized(segment, tolerance = 0.01) {
  if (!segment.controlPoints || segment.controlPoints.length !== 2) {
    return true;
  }

  const { startPoint, endPoint, controlPoints } = segment;
  const [cp1, cp2] = controlPoints;

  const trueTunni = calculateSkeletonTrueTunniPoint(segment);
  if (!trueTunni) {
    return true; // Lines parallel, consider equalized
  }

  const distStartToTunni = distance(startPoint, trueTunni);
  const distEndToTunni = distance(endPoint, trueTunni);

  if (distStartToTunni <= 0 || distEndToTunni <= 0) {
    return true;
  }

  const tension1 = distance(startPoint, cp1) / distStartToTunni;
  const tension2 = distance(endPoint, cp2) / distEndToTunni;

  return Math.abs(tension1 - tension2) < tolerance;
}
