import { intersect, distance, addVectors, subVectors, normalizeVector } from "./vector.js";

// Distance and Angle imports
import {
  unitVectorFromTo,
  calculateBadgeDimensions,
  calculateBadgePosition,
 DISTANCE_ANGLE_FONT_SIZE,
  DISTANCE_ANGLE_BADGE_RADIUS
} from "./distance-angle.js";

// Helper functions needed for drawTunniHandleDistance
function strokeLine(context, x1, y1, x2, y2) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function drawRoundRect(context, x, y, width, height, radii) {
  // older versions of Safari don't support roundRect,
  // so we use rect instead
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(x, y, width, height, radii);
  } else {
    context.rect(x, y, width, height);
  }
  context.fill();
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
 * Calculate new control points based on a Tunni point and segment points.
 *
 * @param {Object} tunniPoint - The Tunni point that defines the desired curve shape
 * @param {Array} segmentPoints - Array of 4 points: [start, control1, control2, end]
 * @param {boolean} equalizeDistances - If true, makes additional distances beyond intersection point equal
 * @param {boolean} useArithmeticMean - If true, makes both control points distances an arithmetic mean of the original distances
 * @returns {Array} Array of 2 new control points
 */
export function calculateControlPointsFromTunni(tunniPoint, segmentPoints, equalizeDistances = false, useArithmeticMean = false) {
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
  
  return [newP2, newP3];
}

/**
* Calculate new control points with equalized distances using arithmetic mean
 * @param {Array} segmentPoints - Array of 4 points: [start, control1, control2, end]
* @returns {Array} Array of 2 new control points
*/
export function calculateEqualizedControlPoints(segmentPoints) {
  const [p1, p2, p3, p4] = segmentPoints;
  
  // Calculate unit vectors for the original directions
  const dir1 = normalizeVector(subVectors(p2, p1));
  const dir2 = normalizeVector(subVectors(p3, p4)); // Note: p3 to p4, not p4 to p3
  
  // Calculate original distances from on-curve points to off-curve points
  const origDist1 = distance(p1, p2);
  const origDist2 = distance(p4, p3);
  
  // Calculate the arithmetic mean of the original distances
  const arithmeticMean = (origDist1 + origDist2) / 2;
  
  // Calculate new control points at the arithmetic mean distance
  // along the same direction vectors
  const newP2 = {
    x: p1.x + arithmeticMean * dir1.x,
    y: p1.y + arithmeticMean * dir1.y
  };
  
  const newP3 = {
    x: p4.x + arithmeticMean * dir2.x,
    y: p4.y + arithmeticMean * dir2.y
  };
  
  return [newP2, newP3];
}

export function balanceSegment(segmentPoints) {
  const tunniPoint = calculateTunniPoint(segmentPoints);
  if (!tunniPoint) {
    return segmentPoints; // Can't balance if lines are parallel
  }
  
  const [p1, p2, p3, p4] = segmentPoints;
  
  // Calculate distances
  const sDistance = distance(p1, tunniPoint);
  const eDistance = distance(p4, tunniPoint);
  
  // If either distance is zero, we can't balance
  if (sDistance <= 0 || eDistance <= 0) {
    return segmentPoints;
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
  const tolerance = 0.001; // Small tolerance for floating point comparison
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
 * Draw Tunni handle distance visualization
 * @param {CanvasRenderingContext2D} context - The canvas context
 * @param {Object} positionedGlyph - The positioned glyph
 * @param {Object} parameters - Visualization parameters
 * @param {Object} model - The model
 * @param {Object} controller - The controller
 */
export function drawTunniHandleDistance(context, positionedGlyph, parameters, model, controller) {
  const path = positionedGlyph.glyph.path;
  
  // Save context state
  context.save();
  
  // Iterate through all contours
  for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
    // Iterate through all segments in the contour
    for (const segment of path.iterContourDecomposedSegments(contourIndex)) {
      // Check if it's a cubic segment (4 points)
      if (segment.points.length === 4) {
        // Check if it's a cubic segment with two off-curve control points
        const pointTypes = segment.parentPointIndices.map(
          index => path.pointTypes[index]
        );
        
        // Both control points must be cubic (type 2)
        if (pointTypes[1] === 2 && pointTypes[2] === 2) {
          try {
            // Calculate the distance between the two control points
            const distance = calculateControlHandleDistance(segment.points);
            
            // Get the control points
            const controlPoint1 = segment.points[1];
            const controlPoint2 = segment.points[2];
            
            // Draw line between control points
            context.strokeStyle = parameters.strokeColor;
            strokeLine(context, controlPoint1.x, controlPoint1.y, controlPoint2.x, controlPoint2.y);
            
            // Format text for display
            const text = distance.toFixed(1);
            
            // Calculate midpoint
            const midPoint = {
              x: (controlPoint1.x + controlPoint2.x) / 2,
              y: (controlPoint1.y + controlPoint2.y) / 2
            };
            
            // Calculate badge dimensions
            const badgeDimensions = calculateBadgeDimensions(text, DISTANCE_ANGLE_FONT_SIZE);
            
            // Calculate unit vector perpendicular to the line
            const unitVector = unitVectorFromTo(controlPoint1, controlPoint2);
            
            // Calculate badge position
            const badgePosition = calculateBadgePosition(
              midPoint,
              { x: -unitVector.y, y: unitVector.x },
              badgeDimensions.width,
              badgeDimensions.height
            );
            
            // Draw badge
            context.fillStyle = parameters.badgeColor;
            drawRoundRect(context, badgePosition.x, badgePosition.y, badgeDimensions.width, badgeDimensions.height, DISTANCE_ANGLE_BADGE_RADIUS);
            
            // Draw text with proper orientation for each label individually
            context.save();
            context.fillStyle = parameters.textColor;
            context.font = `${DISTANCE_ANGLE_FONT_SIZE}px fontra-ui-regular, sans-serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.scale(1, -1);
            context.fillText(text, badgePosition.x + badgeDimensions.width / 2, -(badgePosition.y + badgeDimensions.height / 2));
            context.restore();
          } catch (error) {
            // Skip segments where distance calculation fails
            console.warn("Failed to calculate control handle distance:", error);
          }
        }
      }
    }
 }
  
  // Restore context state
  context.restore();
}