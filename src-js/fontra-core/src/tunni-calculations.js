import { intersect, distance, addVectors, subVectors, normalizeVector } from "./vector.js";

// Grid Snap Utility Function
export function snapToGrid(point) {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y)
  };
}

export function calculateTunniPoint(segmentPoints) {
  // segmentPoints should be an array of 4 points: [start, control1, control2, end]
  if (segmentPoints.length !== 4) {
    throw new Error("Segment must have exactly 4 points");
  }
  
  const [p1, p2, p3, p4] = segmentPoints;
  
  // Calculate a point along the line segment between the two control points (p2 and p3)
 // This is the midpoint by default, but can be adjusted as needed
  const tunniPoint = {
    x: (p2.x + p3.x) / 2,
    y: (p2.y + p3.y) / 2
  };
  
  return tunniPoint;
}

/**
 * Calculate the true intersection-based Tunni point where rays from on-curve points intersect
 * @param {Array} segmentPoints - Array of 4 points: [start, control1, control2, end]
 * @returns {Object|null} The intersection point or null if lines are parallel
 */
export function calculateTrueTunniPoint(segmentPoints) {
  // segmentPoints should be an array of 4 points: [start, control1, control2, end]
  if (segmentPoints.length !== 4) {
    throw new Error("Segment must have exactly 4 points");
  }
  
  const [p1, p2, p3, p4] = segmentPoints;
  
  // Calculate unit vectors for the original directions
  const dir1 = normalizeVector(subVectors(p2, p1));
  const dir2 = normalizeVector(subVectors(p3, p4));
  
  // Calculate the intersection point of the lines along the fixed directions
 // This represents where the lines would intersect if extended infinitely
  const line1Start = p1;
  const line1End = addVectors(p1, dir1);
  const line2Start = p4;
  const line2End = addVectors(p4, dir2);
  
  // Calculate intersection of the lines along the fixed directions
  const intersection = intersect(line1Start, line1End, line2Start, line2End);
  
  return intersection;
}

/**
 * Calculate new control points based on a Tunni point and segment points.
 *
 * @param {Object} tunniPoint - The Tunni point that defines the desired curve shape
 * @param {Array} segmentPoints - Array of 4 points: [start, control1, control2, end]
 * @param {boolean} equalizeDistances - If true, makes additional distances beyond intersection point equal
 * @param {boolean} useArithmeticMean - If true, makes both control points distances an arithmetic mean of the original distances
 * @returns {Array} Array of 2 new control points
 */
export function calculateControlPointsFromTunni(tunniPoint, segmentPoints, equalizeDistances = false, useArithmeticMean = false, gridSnapEnabled = false) {
  const [p1, p2, p3, p4] = segmentPoints;
  
  // Calculate unit vectors for the original directions
  const dir1 = normalizeVector(subVectors(p2, p1));
  const dir2 = normalizeVector(subVectors(p3, p4));
  
  // Calculate the intersection point of the lines along the fixed directions
  // This represents where the lines would intersect if extended infinitely
  const line1Start = p1;
  const line1End = addVectors(p1, dir1);
  const line2Start = p4;
  const line2End = addVectors(p4, dir2);
  
  // Calculate intersection of the lines along the fixed directions
  const intersection = intersect(line1Start, line1End, line2Start, line2End);
  
  if (!intersection) {
    // Lines are parallel, return original control points
    return [p2, p3];
  }
  
  // Calculate original distances from on-curve points to off-curve points
  const origDist1 = distance(p1, p2);
  const origDist2 = distance(p4, p3);
  
  // If using arithmetic mean of original distances, calculate the mean
  let targetDist1 = origDist1;
  let targetDist2 = origDist2;
  
  if (useArithmeticMean) {
    const arithmeticMean = (origDist1 + origDist2) / 2;
    targetDist1 = arithmeticMean;
    targetDist2 = arithmeticMean;
  }
  
  // Calculate distances from on-curve points to the intersection point
  const distToIntersection1 = distance(p1, intersection);
  const distToIntersection2 = distance(p4, intersection);
  
  // Calculate distances from on-curve points to the new Tunni point
 const distToTunni1 = distance(p1, tunniPoint);
  const distToTunni2 = distance(p4, tunniPoint);
  
  // Calculate additional distances beyond the intersection point
  const additionalDist1 = distToTunni1 - distToIntersection1;
  const additionalDist2 = distToTunni2 - distToIntersection2;
  
  // If equalizing distances, make additional distances equal
  let finalAdditionalDist1 = additionalDist1;
  let finalAdditionalDist2 = additionalDist2;
  
  if (equalizeDistances) {
    const avgAdditionalDist = (additionalDist1 + additionalDist2) / 2;
    finalAdditionalDist1 = avgAdditionalDist;
    finalAdditionalDist2 = avgAdditionalDist;
  }
  
  // Calculate new distances along fixed direction vectors
  // The new distance is the target distance plus the (possibly equalized) additional distance
  const newDistance1 = targetDist1 + finalAdditionalDist1;
  const newDistance2 = targetDist2 + finalAdditionalDist2;
  
  // Calculate new control points along fixed direction vectors
 const newP2 = {
    x: p1.x + newDistance1 * dir1.x,
    y: p1.y + newDistance1 * dir1.y
  };
  
  const newP3 = {
    x: p4.x + newDistance2 * dir2.x,
    y: p4.y + newDistance2 * dir2.y
  };
  
  // Apply grid snapping if enabled
 if (gridSnapEnabled) {
    return [snapToGrid(newP2), snapToGrid(newP3)];
  }
  
  return [newP2, newP3];
}

/**
* Calculate new control points with equalized tensions using arithmetic mean
 * @param {Array} segmentPoints - Array of 4 points: [start, control1, control2, end]
 * @returns {Array} Array of 2 new control points
 */
export function calculateEqualizedControlPoints(segmentPoints) {
  const [p1, p2, p3, p4] = segmentPoints;
  
  const pt = calculateTrueTunniPoint(segmentPoints); // <- true Tunni point
  if (!pt) return [p2, p3];

  const dist1ToPt = distance(p1, pt);
  const dist4ToPt = distance(p4, pt);
 if (dist1ToPt <= 0 || dist4ToPt <= 0) return [p2, p3];

  // current tensions
  const t1 = distance(p1, p2) / dist1ToPt;
  const t2 = distance(p4, p3) / dist4ToPt;

  const targetTension = (t1 + t2) / 2;

  // directions are fixed
  const dir1 = normalizeVector(subVectors(p2, p1));
  const dir2 = normalizeVector(subVectors(p3, p4));

  // new distances to hit equal tension
  const newDist1 = targetTension * dist1ToPt;
 const newDist2 = targetTension * dist4ToPt;

  const newP2 = {
    x: p1.x + newDist1 * dir1.x,
    y: p1.y + newDist1 * dir1.y
  };

  const newP3 = {
    x: p4.x + newDist2 * dir2.x,
    y: p4.y + newDist2 * dir2.y
  };
  
  return [newP2, newP3];
}

export function balanceSegment(segmentPoints) {
  const tunniPoint = calculateTrueTunniPoint(segmentPoints);
  if (!tunniPoint) {
    const [p1, p2, p3, p4] = segmentPoints;
    return [p1, p2, p3, p4]; // Can't balance if lines are parallel
  }
  
  const [p1, p2, p3, p4] = segmentPoints;
  
  // Calculate distances
  const sDistance = distance(p1, tunniPoint);
  const eDistance = distance(p4, tunniPoint);
  
  // If either distance is zero, we can't balance
  if (sDistance <= 0 || eDistance <= 0) {
    return [p1, p2, p3, p4];
  }
  
  // Calculate percentages
  const xPercent = distance(p1, p2) / sDistance;
  const yPercent = distance(p3, p4) / eDistance;
  
  // Calculate average percentage
 const avgPercent = (xPercent + yPercent) / 2;
  
  // Calculate new control points
  const newP2 = {
    x: p1.x + avgPercent * (tunniPoint.x - p1.x),
    y: p1.y + avgPercent * (tunniPoint.y - p1.y)
  };
  
  const newP3 = {
    x: p4.x + avgPercent * (tunniPoint.x - p4.x),
    y: p4.y + avgPercent * (tunniPoint.y - p4.y)
  };
  
  return [p1, newP2, newP3, p4];
}

/**
 * Check if the distances of control points in a segment are already equalized
 * @param {Array} segmentPoints - Array of 4 points: [start, control1, control2, end]
 * @returns {boolean} - True if distances are already equalized, false otherwise
 */
export function areDistancesEqualized(segmentPoints) {
 const [p1, p2, p3, p4] = segmentPoints;
  
  // Calculate distances from on-curve points to off-curve points
 const dist1 = distance(p1, p2);
  const dist2 = distance(p4, p3);
  
  // Check if distances are equal within a small tolerance
  const tolerance = 0.01; // Small tolerance for floating point comparison
  return Math.abs(dist1 - dist2) < tolerance;
}

/**
 * Calculate the Euclidean distance between the two control points of a cubic segment
 * @param {Array} segmentPoints - Array of 4 points representing a cubic segment: [start, control1, control2, end]
 * @returns {number} The Euclidean distance between the two control points
 */
export function calculateControlHandleDistance(segmentPoints) {
  // Validate that the segment is cubic (4 points)
  if (!Array.isArray(segmentPoints) || segmentPoints.length !== 4) {
    throw new Error("Segment must be an array of exactly 4 points");
  }
  
  // Extract the control points (indices 1 and 2)
  const controlPoint1 = segmentPoints[1];
  const controlPoint2 = segmentPoints[2];
  
  // Validate that control points exist and have x,y coordinates
  if (!controlPoint1 || !controlPoint2 ||
      typeof controlPoint1.x !== 'number' || typeof controlPoint1.y !== 'number' ||
      typeof controlPoint2.x !== 'number' || typeof controlPoint2.y !== 'number') {
    throw new Error("Control points must have valid x and y coordinates");
  }
  
  // Calculate and return the Euclidean distance between the control points
  return distance(controlPoint1, controlPoint2);
}

/**
 * Draw Tunni handle tension visualization
 * @param {CanvasRenderingContext2D} context - The canvas context
 * @param {Object} positionedGlyph - The positioned glyph
 * @param {Object} parameters - Visualization parameters
 * @param {Object} model - The model
 * @param {Object} controller - The controller
 */


/**
 * Finds if a point is hitting a Tunni point within a given size margin
 * @param {Object} point - The point to check
 * @param {number} size - The size margin to check within
 * @param {Object} positionedGlyph - The positioned glyph containing the path
 * @param {Function} calculateTunniPoint - Function to calculate Tunni point from segment
 * @param {Function} distance - Function to calculate distance between two points
 * @returns {Object|null} Object with tunniPoint, segment, and segmentPoints if hit, null otherwise
 */
/**`r`n * Calculate new on-curve point positions based on a moved Tunni point.
 *
 * @param {Object} tunniPoint - The new Tunni point position
 * @param {Array} segmentPoints - Array of 4 points: [start, control1, control2, end]
 * @param {boolean} equalizeDistances - If true, makes distances from on-curve to Tunni point equal
 * @returns {Array} Array of 4 points with new on-curve positions
 */
export function calculateOnCurvePointsFromTunni(tunniPoint, segmentPoints, equalizeDistances = true, gridSnapEnabled = false) {
  const [p1, p2, p3, p4] = segmentPoints;
  
  // Calculate unit vectors for the original directions (from on-curve to off-curve)
  const dir1 = normalizeVector(subVectors(p2, p1));
  const dir2 = normalizeVector(subVectors(p3, p4));
  
  // Calculate original distances from on-curve points to their respective off-curve points
  const origDist1 = distance(p1, p2);
  const origDist2 = distance(p4, p3);
  
  // Calculate distances from on-curve points to the new Tunni point
  const distToTunni1 = distance(p1, tunniPoint);
  const distToTunni2 = distance(p4, tunniPoint);
  
  // Calculate the ratio of original distance to distance to Tunni point for each on-curve point
  const ratio1 = origDist1 / distToTunni1;
  const ratio2 = origDist2 / distToTunni2;
  
  let finalRatio1, finalRatio2;
  
  if (equalizeDistances) {
    // Use average ratio to maintain equal distances
    const avgRatio = (ratio1 + ratio2) / 2;
    finalRatio1 = avgRatio;
    finalRatio2 = avgRatio;
  } else {
    // Use individual ratios to allow uncoupled distances
    finalRatio1 = ratio1;
    finalRatio2 = ratio2;
  }
  
  // Calculate new distances from Tunni point to on-curve points
  const newDist1 = distToTunni1 * finalRatio1;
  const newDist2 = distToTunni2 * finalRatio2;
  
  // Calculate new on-curve point positions along the fixed direction vectors
  // The new on-curve points are positioned along the opposite direction from Tunni point
  const newP1 = {
    x: tunniPoint.x - newDist1 * dir1.x,
    y: tunniPoint.y - newDist1 * dir1.y
 };
  
  const newP4 = {
    x: tunniPoint.x - newDist2 * dir2.x,
    y: tunniPoint.y - newDist2 * dir2.y
  };
  
  // Return with original control points unchanged
  if (gridSnapEnabled) {
    return [snapToGrid(newP1), p2, p3, snapToGrid(newP4)];
  }
  return [newP1, p2, p3, newP4];
}


