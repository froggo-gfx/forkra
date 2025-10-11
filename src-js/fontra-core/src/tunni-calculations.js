import { intersect, distance, addVectors, subVectors, normalizeVector } from "./vector.js";

/* Distance and Angle imports
import {
  unitVectorFromTo,
  calculateBadgeDimensions,
  calculateBadgePosition,
  calculateOffCurveAngle,
  DISTANCE_ANGLE_FONT_SIZE,
  DISTANCE_ANGLE_BADGE_RADIUS
} from "./distance-angle.js";
*/

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

/*
export function drawTunniLabels(context, positionedGlyph, parameters, model, controller) {
  const path = positionedGlyph.glyph.path;
 
 // Extract visibility settings from model or controller
 // Try multiple ways to access scene settings to ensure compatibility
 const showDistance = model.sceneSettings?.showTunniDistance ?? true;
 const showTension = model.sceneSettings?.showTunniTension ?? true;
 const showAngle = model.sceneSettings?.showTunniAngle ?? true;
 
 // Debug logging to see if the function is being called and what values we're getting
 // console.log("drawTunniLabels called", { showDistance, showTension, showAngle, model });
  
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
            // Get all points
            const p1 = segment.points[0];  // on-curve start point
            const p2 = segment.points[1];  // off-curve control point 1
            const p3 = segment.points[2];  // off-curve control point 2
            const p4 = segment.points[3];  // on-curve end point
            
            // Calculate Tunni point for visualization (keep midpoint)
            const visualPt = calculateTunniPoint(segment.points);

            // Calculate true Tunni point for tension calculations
            const truePt = calculateTrueTunniPoint(segment.points);

            // Calculate tensions using the true intersection point (with fallback to midpoint)
            const tensionPt1 = truePt || visualPt;
            const tensionPt2 = truePt || visualPt;
            const tension1 = distance(p1, p2) / distance(p1, tensionPt1);  // tension for p2
            const tension2 = distance(p4, p3) / distance(p4, tensionPt2);  // tension for p3
            
            // Calculate distances from on-curve to off-curve points
            const dist1 = distance(p1, p2);  // distance for p2
            const dist2 = distance(p4, p3);  // distance for p3
            
            // Calculate angles for off-curve points
            const angle1 = calculateOffCurveAngle(p2, p1);  // angle for p2
            const angle2 = calculateOffCurveAngle(p3, p4);  // angle for p3
            
            // Format text based on visibility settings
            const visibleComponents = [];
            if (showDistance) visibleComponents.push(dist1.toFixed(1));
            if (showTension) visibleComponents.push(tension1.toFixed(2));
            if (showAngle) visibleComponents.push(`${angle1.toFixed(1)}°`);
            const text1 = visibleComponents.join('\n');

            // Same logic for text2
            const visibleComponents2 = [];
            if (showDistance) visibleComponents2.push(dist2.toFixed(1));
            if (showTension) visibleComponents2.push(tension2.toFixed(2));
            if (showAngle) visibleComponents2.push(`${angle2.toFixed(1)}°`);
            const text2 = visibleComponents2.join('\n');
            
            // Calculate badge dimensions for both labels
            const badgeDimensions1 = calculateBadgeDimensions(text1, 6); // 6pt font
            const badgeDimensions2 = calculateBadgeDimensions(text2, 6); // 6pt font
            
            // Calculate unit vector from p1 to p2 for p2 label positioning
            const unitVector1 = unitVectorFromTo(p1, p2);
            
            // Calculate unit vector from p4 to p3 for p3 label positioning
            const unitVector2 = unitVectorFromTo(p4, p3);
            
            // Calculate badge positions for both labels and shift to the right of the off-curve point
            const badgePosition1 = calculateBadgePosition(
              { x: p2.x + 14, y: p2.y }, // Shift to the right
              { x: -unitVector1.y, y: unitVector1.x },
              badgeDimensions1.width,
              badgeDimensions1.height
            );
            
            const badgePosition2 = calculateBadgePosition(
              { x: p3.x + 14, y: p3.y }, // Shift to the right
              { x: -unitVector2.y, y: unitVector2.x },
              badgeDimensions2.width,
              badgeDimensions2.height
            );
            
            // Draw text for p2 with distance, tension, angle (top to bottom)
            context.save();
            context.fillStyle = "rgba(4, 28, 44, 1)"; // New text color
            context.font = `6px fontra-ui-regular, sans-serif`; // 6pt font, medium weight
            context.textAlign = "left";
            context.textBaseline = "middle";
            context.scale(1, -1);
            
            // Split the text into lines and draw each line
            const lines1 = text1.split('\n');
            const lineHeight = 6; // font size
            const totalHeight = lines1.length * lineHeight;
            const startY = -(badgePosition1.y + badgeDimensions1.height / 2) - totalHeight / 2 + lineHeight / 2;
            
            for (let i = 0; i < lines1.length; i++) {
              context.fillText(lines1[i], badgePosition1.x, startY + i * lineHeight);
            }
            
            context.restore();
            
            // Draw text for p3 with distance, tension, angle (top to bottom)
            context.save();
            context.fillStyle = "rgba(44, 28, 44, 1)"; // New text color
            context.font = `6px fontra-ui-regular, sans-serif`; // 6pt font, medium weight
            context.textAlign = "left";
            context.textBaseline = "middle";
            context.scale(1, -1);
            
            // Split the text into lines and draw each line
            const lines2 = text2.split('\n');
            const totalHeight2 = lines2.length * lineHeight;
            const startY2 = -(badgePosition2.y + badgeDimensions2.height / 2) - totalHeight2 / 2 + lineHeight / 2;
            
            for (let i = 0; i < lines2.length; i++) {
              context.fillText(lines2[i], badgePosition2.x, startY2 + i * lineHeight);
            }
            
            context.restore();
          } catch (error) {
            // Skip segments where tension calculation fails
            console.warn("Failed to calculate handle tensions:", error);
          }
        }
      }
    }
  }
  
  // Now also handle off-curve points connected to on-curve points (for distance and angle only)
  // Iterate through all points in the path
  for (let pointIndex = 0; pointIndex < path.numPoints; pointIndex++) {
    const pointType = path.pointTypes[pointIndex];
    
    // Check if this is an off-curve point
    if (pointType !== 0) { // Not an on-curve point
      const offCurvePoint = path.getPoint(pointIndex);
      
      // Check if this point was already processed as part of a cubic segment
      // We need to check if this point is part of any cubic segment to avoid duplication
      let isPartOfCubicSegment = false;
      
      // Iterate through all contours to check if this point is part of a cubic segment
      for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
        for (const segment of path.iterContourDecomposedSegments(contourIndex)) {
          if (segment.points.length === 4) {
            // Check if it's a cubic segment (two off-curve points)
            const pointTypes = segment.parentPointIndices.map(
              index => path.pointTypes[index]
            );
            
            if (pointTypes[1] === 2 && pointTypes[2] === 2) { // Both are cubic control points
              // Check if our current pointIndex matches either of the control points in this segment
              if (segment.parentPointIndices[1] === pointIndex || segment.parentPointIndices[2] === pointIndex) {
                isPartOfCubicSegment = true;
                break;
              }
            }
          }
        }
        if (isPartOfCubicSegment) {
          break;
        }
      }
      
      // Skip if this point was already processed as part of a cubic segment
      if (isPartOfCubicSegment) {
        continue;
      }
      
      // Get contour information
      const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(pointIndex);
      const contourInfo = path.contourInfo[contourIndex];
      const startPoint = contourIndex === 0 ? 0 : path.contourInfo[contourIndex - 1].endPoint + 1;
      const endPoint = contourInfo.endPoint;
      const numPoints = endPoint - startPoint + 1;
      
      // Get neighboring points
      let prevPointIndex, nextPointIndex;
      if (contourInfo.isClosed) {
        prevPointIndex = startPoint + ((contourPointIndex - 1 + numPoints) % numPoints);
        nextPointIndex = startPoint + ((contourPointIndex + 1) % numPoints);
      } else {
        prevPointIndex = contourPointIndex > 0 ? pointIndex - 1 : -1;
        nextPointIndex = contourPointIndex < numPoints - 1 ? pointIndex + 1 : -1;
      }
      
      const prevPoint = prevPointIndex >= 0 ? path.getPoint(prevPointIndex) : null;
      const nextPoint = nextPointIndex >= 0 ? path.getPoint(nextPointIndex) : null;
      
      const prevPointType = prevPointIndex >= 0 ? path.pointTypes[prevPointIndex] : -1;
      const nextPointType = nextPointIndex >= 0 ? path.pointTypes[nextPointIndex] : -1;
      
      // Check if either neighbor is an on-curve point
      let onCurvePoint = null;
      let onCurveIndex = -1;
      
      if (prevPoint && prevPointType === 0) { // Previous is on-curve
        onCurvePoint = prevPoint;
        onCurveIndex = prevPointIndex;
      } else if (nextPoint && nextPointType === 0) { // Next is on-curve
        onCurvePoint = nextPoint;
        onCurveIndex = nextPointIndex;
      }
      
      // If we found an on-curve neighbor, calculate and display distance and angle only
      if (onCurvePoint && onCurveIndex >= 0) {
        try {
          // Calculate distance from on-curve to off-curve point
          const dist = distance(onCurvePoint, offCurvePoint);
          
          // Calculate angle for off-curve point relative to on-curve point
          const angle = calculateOffCurveAngle(offCurvePoint, onCurvePoint);
          
          // For off-curve points not part of cubic segments, we'll only show distance and angle (no tension)
          // Format text for display - distance, angle (top to bottom) based on visibility settings
          const visibleComponentsOff = [];
          if (showDistance) visibleComponentsOff.push(dist.toFixed(1));
          // No tension for off-curve points not part of cubic segments
          if (showAngle) visibleComponentsOff.push(`${angle.toFixed(1)}°`);
          const text = visibleComponentsOff.join('\n');
          
          // Calculate badge dimensions for the label
          const badgeDimensionsOff = calculateBadgeDimensions(text, 6); // 6pt font
          
          // Calculate unit vector from on-curve to off-curve point for label positioning
          const unitVectorOff = unitVectorFromTo(onCurvePoint, offCurvePoint);
          
          // Calculate badge position and shift to the right of the off-curve point
          const badgePositionOff = calculateBadgePosition(
            { x: offCurvePoint.x + 8, y: offCurvePoint.y }, // Shift to the right
            { x: -unitVectorOff.y, y: unitVectorOff.x },
            badgeDimensionsOff.width,
            badgeDimensionsOff.height
          );
          
          // Draw text with distance, angle (top to bottom)
          context.save();
          context.fillStyle = "rgba(44, 28, 44, 1)"; // New text color
          context.font = `6px fontra-ui-regular, sans-serif`; // 6pt font, medium weight
          context.textAlign = "left";
          context.textBaseline = "middle";
          context.scale(1, -1);
          
          // Split the text into lines and draw each line
          const linesOff = text.split('\n');
          const lineHeightOff = 6; // font size
          const totalHeightOff = linesOff.length * lineHeightOff;
          const startYOff = -(badgePositionOff.y + badgeDimensionsOff.height / 2) - totalHeightOff / 2 + lineHeightOff / 2;
          
          for (let i = 0; i < linesOff.length; i++) {
            context.fillText(linesOff[i], badgePositionOff.x, startYOff + i * lineHeightOff);
          }
          
          context.restore();
        } catch (error) {
          // Skip if calculation fails
          console.warn("Failed to calculate off-curve distance/angle:", error);
        }
      }
    }
  }
  
  // Restore context state
  context.restore();
}
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
export function findTunniPointHit(point, size, positionedGlyph, calculateTunniPoint, distance) {
  if (!positionedGlyph) {
    return null;
  }
  
  const path = positionedGlyph.glyph.path;
  
  // The point is already in the glyph coordinate system when passed from the pointer tool
  const glyphPoint = point;
  
  // Iterate through ALL contours and check if the point is near any Tunni point
  for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
    for (const segment of path.iterContourDecomposedSegments(contourIndex)) {
      // Process each segment in the contour
      if (segment.points.length === 4) {
        // Check if it's a cubic segment
        const pointTypes = segment.parentPointIndices.map(
          index => path.pointTypes[index]
        );
    
        if (pointTypes[1] === 2 && pointTypes[2] === 2) { // Both are cubic control points
          // Calculate both the true intersection point and the visual point (midpoint)
          const trueTunniPoint = calculateTrueTunniPoint(segment.points);
          const visualTunniPoint = calculateTunniPoint(segment.points);
          
          // Check both the true intersection point and the visual point (midpoint)
          if (trueTunniPoint && distance(glyphPoint, trueTunniPoint) <= size) {
            return {
              tunniPoint: trueTunniPoint,
              segment: segment,
              segmentPoints: segment.points
            };
          }
          
          if (visualTunniPoint && distance(glyphPoint, visualTunniPoint) <= size) {
            return {
              tunniPoint: visualTunniPoint,
              segment: segment,
              segmentPoints: segment.points
            };
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * Equalizes the distances of control points in a segment using arithmetic mean
 * @param {Object} point - The point where the mouse was clicked
 * @param {number} size - The click margin size
 * @param {Object} sceneModel - The scene model to access positioned glyph
 * @param {Function} findTunniPointHit - Function to find if point hits a Tunni point
 * @param {Function} equalizeSegmentDistances - Function to equalize distances in a segment
 */
export async function handleEqualizeDistances(point, size, sceneModel, findTunniPointHit, equalizeSegmentDistances) {
  // First check if we clicked on an existing Tunni point
  const positionedGlyph = sceneModel.getSelectedPositionedGlyph();
 const hit = findTunniPointHit(point, size, positionedGlyph, calculateTunniPoint, distance);
  if (hit) {
    await equalizeSegmentDistances(hit.segment, hit.segmentPoints, sceneModel, positionedGlyph);
    return;
  }
  
  // If not, check if we clicked near a cubic segment
 const pathHit = sceneModel.pathHitAtPoint(point, size);
  if (pathHit.segment && pathHit.segment.points.length === 4) {
    // Check if it's a cubic segment (two off-curve points)
    const pointTypes = pathHit.segment.parentPointIndices.map(
      index => sceneModel.getSelectedPositionedGlyph().glyph.path.pointTypes[index]
    );
    
    if (pointTypes[1] === 2 && pointTypes[2] === 2) { // Both are cubic control points
      await equalizeSegmentDistances(pathHit.segment, pathHit.segment.points, sceneModel, positionedGlyph);
    }
  }
}

/**
 * Equalize the distances of control points in a segment using arithmetic mean
 * @param {Object} segment - The segment to modify
 * @param {Array} segmentPoints - Array of 4 points: [start, control1, control2, end]
 * @param {Object} sceneModel - The scene model
 * @param {Object} positionedGlyph - The positioned glyph
 * @param {Object} sceneController - The scene controller to perform edits
 */
export async function equalizeSegmentDistances(segment, segmentPoints, sceneModel, positionedGlyph, sceneController) {
  // Check if distances are already equalized
  if (areDistancesEqualized(segmentPoints)) {
    console.log("Distances are already equalized, skipping...");
    return;
  }
  
  // Calculate new control points with equalized distances using arithmetic mean
  const newControlPoints = calculateEqualizedControlPoints(segmentPoints);
  
  // Update the path with new control points using editLayersAndRecordChanges
  try {
    await sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      for (const layerGlyph of Object.values(layerGlyphs)) {
        const path = layerGlyph.path;
        
        // Validate that the path and segment indices exist
        if (!path || !segment?.parentPointIndices) {
          console.warn("Invalid path or segment indices", {
            path: !!path,
            parentPointIndices: segment?.parentPointIndices
          });
          return "Equalize Control Point Distances"; // Return early but still provide undo label
        }
        
        // Find the indices of the control points within the segment
        // In a cubic segment, control points are typically at indices 1 and 2
        const controlPoint1Index = segment.parentPointIndices[1];
        const controlPoint2Index = segment.parentPointIndices[2];
        
        // Validate the control point indices
        if (controlPoint1Index === undefined || controlPoint2Index === undefined) {
          console.warn("Invalid control point indices", {
            controlPoint1Index: controlPoint1Index,
            controlPoint2Index: controlPoint2Index
          });
          return "Equalize Control Point Distances"; // Return early but still provide undo label
        }
        
        // Update the control points in the path
        path.setPointPosition(controlPoint1Index, newControlPoints[0].x, newControlPoints[0].y);
        path.setPointPosition(controlPoint2Index, newControlPoints[1].x, newControlPoints[1].y);
      }
      return "Equalize Control Point Distances";
    });
  } catch (error) {
    console.error("Error equalizing control point distances:", error);
    throw error; // Re-throw the error so it can be handled upstream
  }
}

/**
* Handles mouse down event when clicking on a Tunni point
* @param {Object} event - Mouse event
* @param {Object} sceneController - Scene controller for scene access
* @param {Object} visualizationLayerSettings - To check if Tunni layer is active
* @returns {Object} Initial state for drag operation (initial mouse pos, vectors, etc.)
*/
export function handleTunniPointMouseDown(event, sceneController, visualizationLayerSettings) {
 // Check if Tunni layer is active
 if (!visualizationLayerSettings.model["fontra.tunni.lines"]) {
   return null;
 }

 const point = sceneController.localPoint(event);
 const size = sceneController.mouseClickMargin;
 
 // Convert from scene coordinates to glyph coordinates
 const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
 if (!positionedGlyph) {
   return null; // No positioned glyph, so no Tunni point interaction possible
 }
 
 const glyphPoint = {
   x: point.x - positionedGlyph.x,
   y: point.y - positionedGlyph.y,
 };
 
 // First check if we clicked on an existing Tunni point
 // Use the same hit testing function that's used for hover detection to ensure consistency
 const hit = tunniLayerHitTest(glyphPoint, size, positionedGlyph);
 if (!hit) {
   return null;
 }

 const segmentPoints = hit.segmentPoints;
 
 // Store initial positions
 const initialOnPoint1 = { ...segmentPoints[0] }; // p1
 const initialOffPoint1 = { ...segmentPoints[1] }; // p2
 const initialOffPoint2 = { ...segmentPoints[2] }; // p3
 const initialOnPoint2 = { ...segmentPoints[3] }; // p4
 
 // Calculate initial vectors from on-curve to off-curve points
 const initialVector1 = {
   x: initialOffPoint1.x - initialOnPoint1.x,
   y: initialOffPoint1.y - initialOnPoint1.y
 };

 const initialVector2 = {
   x: initialOffPoint2.x - initialOnPoint2.x,
   y: initialOffPoint2.y - initialOnPoint2.y
 };

 // Calculate unit vectors for movement direction
 const length1 = Math.sqrt(initialVector1.x * initialVector1.x + initialVector1.y * initialVector1.y);
 const length2 = Math.sqrt(initialVector2.x * initialVector2.x + initialVector2.y * initialVector2.y);
 
 const unitVector1 = length1 > 0 ? {
   x: initialVector1.x / length1,
   y: initialVector1.y / length1
 } : { x: 1, y: 0 };
 
 const unitVector2 = length2 > 0 ? {
   x: initialVector2.x / length2,
   y: initialVector2.y / length2
 } : { x: 1, y: 0 };
 
 // Calculate 45-degree vector (average of the two unit vectors)
 let fortyFiveVector = {
   x: (unitVector1.x + unitVector2.x) / 2,
   y: (unitVector1.y + unitVector2.y) / 2
 };
 
 // Normalize the 45-degree vector
 const fortyFiveLength = Math.sqrt(fortyFiveVector.x * fortyFiveVector.x + fortyFiveVector.y * fortyFiveVector.y);
 if (fortyFiveLength > 0) {
   fortyFiveVector.x /= fortyFiveLength;
   fortyFiveVector.y /= fortyFiveLength;
 }

 // Store original control point positions for undo functionality
 let originalControlPoints = null;
 if (positionedGlyph && positionedGlyph.glyph && positionedGlyph.glyph.path) {
   const path = positionedGlyph.glyph.path;
   const controlPoint1Index = hit.segment.parentPointIndices[1];
   const controlPoint2Index = hit.segment.parentPointIndices[2];
   if (controlPoint1Index !== undefined && controlPoint2Index !== undefined) {
     originalControlPoints = {
       controlPoint1Index: controlPoint1Index,
       controlPoint2Index: controlPoint2Index,
       originalControlPoint1: { ...path.getPoint(controlPoint1Index) },
       originalControlPoint2: { ...path.getPoint(controlPoint2Index) }
     };
   }
 }

 // Return initial state for drag operation
 return {
   initialMousePosition: { ...glyphPoint }, // Make a copy to avoid reference issues
   initialOnPoint1,
   initialOffPoint1,
   initialOffPoint2,
   initialOnPoint2,
   initialVector1,
   initialVector2,
   unitVector1,
   unitVector2,
   fortyFiveVector,
   selectedSegment: hit.segment,
   originalSegmentPoints: [...segmentPoints],
   originalControlPoints,
   tunniPointHit: hit
 };
}

/**
* Calculates new control points based on Tunni point movement during drag
* @param {Object} event - Mouse event
* @param {Object} initialState - Initial state from mouse down
* @param {Object} sceneController - Scene controller for editing operations
* @returns {Object} Object containing control point indices and new positions
*/
export function calculateTunniPointDragChanges(event, initialState, sceneController) {
 // Check if we have the necessary data to process the drag
 if (!initialState || !initialState.initialMousePosition || !initialState.initialOffPoint1 || !initialState.initialOffPoint2 || !initialState.selectedSegment || !initialState.originalSegmentPoints) {
   return null;
 }

 const point = sceneController.localPoint(event);
 
 // Convert from scene coordinates to glyph coordinates
 const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
 if (!positionedGlyph) {
   return null; // No positioned glyph, so no Tunni point interaction possible
 }
 
 const glyphPoint = {
   x: point.x - positionedGlyph.x,
   y: point.y - positionedGlyph.y,
 };
 
 // Calculate mouse movement vector
 const mouseDelta = {
   x: glyphPoint.x - initialState.initialMousePosition.x,
   y: glyphPoint.y - initialState.initialMousePosition.y
 };
 
 // Check if Alt key is pressed to disable equalizing distances
 // (proportional editing is now the default behavior)
 const equalizeDistances = !event.altKey;
 
 let newControlPoint1, newControlPoint2;
 
 if (equalizeDistances) {
   // Proportional editing: Move both control points by the same amount along their respective vectors
   // Project mouse movement onto the 45-degree vector
   // This gives us the scalar amount to move along the 45-degree vector
   const projection = mouseDelta.x * initialState.fortyFiveVector.x + mouseDelta.y * initialState.fortyFiveVector.y;
   
   // Move both control points by the same amount along their respective vectors
   newControlPoint1 = {
     x: initialState.initialOffPoint1.x + initialState.unitVector1.x * projection,
     y: initialState.initialOffPoint1.y + initialState.unitVector1.y * projection
   };
   
   newControlPoint2 = {
     x: initialState.initialOffPoint2.x + initialState.unitVector2.x * projection,
     y: initialState.initialOffPoint2.y + initialState.unitVector2.y * projection
   };
 } else {
   // Non-proportional editing: Each control point moves independently along its own vector
   // Project mouse movement onto each control point's individual unit vector
   const projection1 = mouseDelta.x * initialState.unitVector1.x + mouseDelta.y * initialState.unitVector1.y;
   const projection2 = mouseDelta.x * initialState.unitVector2.x + mouseDelta.y * initialState.unitVector2.y;
   
   // Move each control point by its own projection amount
   newControlPoint1 = {
     x: initialState.initialOffPoint1.x + initialState.unitVector1.x * projection1,
     y: initialState.initialOffPoint1.y + initialState.unitVector1.y * projection1
   };
   
   newControlPoint2 = {
     x: initialState.initialOffPoint2.x + initialState.unitVector2.x * projection2,
     y: initialState.initialOffPoint2.y + initialState.unitVector2.y * projection2
   };
 }

 // Return the changes instead of applying them
 return {
   controlPoint1Index: initialState.selectedSegment.parentPointIndices[1],
   controlPoint2Index: initialState.selectedSegment.parentPointIndices[2],
   newControlPoint1: newControlPoint1,
   newControlPoint2: newControlPoint2
 };
}

/**
* Handles mouse drag event to calculate control point changes based on Tunni point movement
* @param {Object} event - Mouse event
* @param {Object} initialState - Initial state from mouse down
* @param {Object} sceneController - Scene controller for editing operations
* @returns {Object} Object containing control point indices and new positions
*/
export function handleTunniPointMouseDrag(event, initialState, sceneController) {
 // Calculate the changes for this mouse move event
 return calculateTunniPointDragChanges(event, initialState, sceneController);
}

/**
* Handles mouse up event to return the final state for the Tunni point drag operation
* @param {Object} initialState - Initial state from mouse down
* @param {Object} sceneController - Scene controller for editing operations
* @returns {Object} Object containing original control point indices and their final positions
*/
export function handleTunniPointMouseUp(initialState, sceneController) {
 // Check if we have the necessary data to process the mouse up event
 if (!initialState || !initialState.selectedSegment || !initialState.originalControlPoints) {
   return null;
 }

 // Return the original control point information without applying changes
 // The actual changes will be applied in the pointer tool as a single atomic operation
 return {
   controlPoint1Index: initialState.originalControlPoints.controlPoint1Index,
   controlPoint2Index: initialState.originalControlPoints.controlPoint2Index,
   originalControlPoint1: initialState.originalControlPoints.originalControlPoint1,
   originalControlPoint2: initialState.originalControlPoints.originalControlPoint2
 };
}

/**
 * Performs hit testing specifically for Tunni visualization layer elements
 * @param {Object} point - The point to check (x, y coordinates)
 * @param {number} size - The hit margin size
 * @param {Object} positionedGlyph - The positioned glyph to test against
 * @returns {Object|null} Hit result object if Tunni point is near the given point, null otherwise
 */
export function tunniLayerHitTest(point, size, positionedGlyph) {
  if (!positionedGlyph || !positionedGlyph.glyph || !positionedGlyph.glyph.path) {
    return null;
  }
  
  const path = positionedGlyph.glyph.path;
  
  // The point is already in the glyph coordinate system when passed from the pointer tool
  const glyphPoint = point;
  
  // Iterate through ALL contours and check if the point is near any Tunni point
  for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
    for (const segment of path.iterContourDecomposedSegments(contourIndex)) {
      // Process each segment in the contour
      if (segment.points.length === 4) {
        // Check if it's a cubic segment
        const pointTypes = segment.parentPointIndices.map(
          index => path.pointTypes[index]
        );
    
        if (pointTypes[1] === 2 && pointTypes[2] === 2) { // Both are cubic control points
          // Calculate the true Tunni point (intersection-based) for this segment
          const trueTunniPoint = calculateTrueTunniPoint(segment.points);
          const visualTunniPoint = calculateTunniPoint(segment.points);
          
          // Check both the true intersection point and the visual point (midpoint)
          // This ensures we can hit both the actual intersection and the visual representation
          if (trueTunniPoint && distance(glyphPoint, trueTunniPoint) <= size) {
            return {
              tunniPoint: trueTunniPoint,
              segment: segment,
              segmentPoints: segment.points,
              contourIndex: contourIndex,
              hitType: "true-tunni-point"
            };
          }
          
          if (visualTunniPoint && distance(glyphPoint, visualTunniPoint) <= size) {
            return {
              tunniPoint: visualTunniPoint,
              segment: segment,
              segmentPoints: segment.points,
              contourIndex: contourIndex,
              hitType: "tunni-point"
            };
          }
        }
      }
    }
  }
  
  // If no Tunni point is found within the hit margin, return null
  return null;
}

/**
 * Handles mouse down event when clicking on a true Tunni point (intersection)
 * @param {Object} event - Mouse event
 * @param {Object} sceneController - Scene controller for scene access
 * @param {Object} visualizationLayerSettings - To check if Tunni layer is active
 * @returns {Object} Initial state for drag operation (initial mouse pos, vectors, etc.)
 */
export function handleTrueTunniPointMouseDown(event, sceneController, visualizationLayerSettings) {
  // Check if Tunni layer is active
  if (!visualizationLayerSettings.model["fontra.tunni.lines"]) {
    return null;
  }

  const point = sceneController.localPoint(event);
  const size = sceneController.mouseClickMargin;
  
  // Convert from scene coordinates to glyph coordinates
  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return null; // No positioned glyph, so no Tunni point interaction possible
  }
  
  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };
  
  // First check if we clicked on an existing true Tunni point
  // Use the same hit testing function that's used for hover detection to ensure consistency
  const hit = tunniLayerHitTest(glyphPoint, size, positionedGlyph);
  if (!hit || hit.hitType !== "true-tunni-point") {
    return null;
  }

  const segmentPoints = hit.segmentPoints;
  
  // Store initial positions
  const initialOnPoint1 = { ...segmentPoints[0] }; // p1 (on-curve)
  const initialOffPoint1 = { ...segmentPoints[1] }; // p2 (off-curve)
  const initialOffPoint2 = { ...segmentPoints[2] }; // p3 (off-curve)
  const initialOnPoint2 = { ...segmentPoints[3] }; // p4 (on-curve)
  
  // Calculate initial vectors from on-curve to off-curve points
  const initialVector1 = {
    x: initialOffPoint1.x - initialOnPoint1.x,
    y: initialOffPoint1.y - initialOnPoint1.y
  };

  const initialVector2 = {
    x: initialOffPoint2.x - initialOnPoint2.x,
    y: initialOffPoint2.y - initialOnPoint2.y
  };

  // Calculate unit vectors for movement direction
  const length1 = Math.sqrt(initialVector1.x * initialVector1.x + initialVector1.y * initialVector1.y);
  const length2 = Math.sqrt(initialVector2.x * initialVector2.x + initialVector2.y * initialVector2.y);
  
  const unitVector1 = length1 > 0 ? {
    x: initialVector1.x / length1,
    y: initialVector1.y / length1
  } : { x: 1, y: 0 };
  
  const unitVector2 = length2 > 0 ? {
    x: initialVector2.x / length2,
    y: initialVector2.y / length2
  } : { x: 1, y: 0 };
  
  // Store original control point positions (these should remain unchanged)
  let originalControlPoints = null;
  if (positionedGlyph && positionedGlyph.glyph && positionedGlyph.glyph.path) {
    const path = positionedGlyph.glyph.path;
    const controlPoint1Index = hit.segment.parentPointIndices[1];
    const controlPoint2Index = hit.segment.parentPointIndices[2];
    if (controlPoint1Index !== undefined && controlPoint2Index !== undefined) {
      originalControlPoints = {
        controlPoint1Index: controlPoint1Index,
        controlPoint2Index: controlPoint2Index,
        originalControlPoint1: { ...path.getPoint(controlPoint1Index) },
        originalControlPoint2: { ...path.getPoint(controlPoint2Index) }
      };
    }
  }

  // Return initial state for drag operation
  return {
    initialMousePosition: { ...glyphPoint }, // Make a copy to avoid reference issues
    initialOnPoint1,
    initialOffPoint1,
    initialOffPoint2,
    initialOnPoint2,
    initialVector1,
    initialVector2,
    unitVector1,
    unitVector2,
    selectedSegment: hit.segment,
    originalSegmentPoints: [...segmentPoints],
    originalControlPoints,
    tunniPointHit: hit,
    hitType: "true-tunni-point" // Distinguish from current handle
  };
}

/**
 * Calculates new on-curve point positions based on true Tunni point movement during drag
 * @param {Object} event - Mouse event
 * @param {Object} initialState - Initial state from mouse down
 * @param {Object} sceneController - Scene controller for editing operations
 * @returns {Object} Object containing on-curve point indices and new positions
 */
export function calculateTrueTunniPointDragChanges(event, initialState, sceneController) {
  // Check if we have the necessary data to process the drag
  if (!initialState || !initialState.initialMousePosition ||
      !initialState.initialOnPoint1 || !initialState.initialOnPoint2 ||
      !initialState.selectedSegment || !initialState.originalSegmentPoints) {
    return null;
  }

  const point = sceneController.localPoint(event);
  
  // Convert from scene coordinates to glyph coordinates
  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
 if (!positionedGlyph) {
    return null; // No positioned glyph, so no Tunni point interaction possible
  }
  
  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };
  
  // Calculate mouse movement vector
  const mouseDelta = {
    x: glyphPoint.x - initialState.initialMousePosition.x,
    y: glyphPoint.y - initialState.initialMousePosition.y
  };
  
  // Check if Alt key is pressed to disable equalizing distances
  const equalizeDistances = !event.altKey;
  
  // Calculate how much to move the on-curve points along their fixed vectors
  // The movement should be based on the projection of mouse movement onto the fixed direction vectors
  const [p1, p2, p3, p4] = initialState.originalSegmentPoints;
  
  // Calculate unit vectors for the original directions (from on-curve to off-curve)
  const dir1 = normalizeVector(subVectors(p2, p1)); // direction from p1 to p2
  const dir2 = normalizeVector(subVectors(p3, p4)); // direction from p4 to p3 (reversed: from p4 to off-curve)
  
  // Project mouse movement onto the fixed direction vectors
  const projection1 = mouseDelta.x * dir1.x + mouseDelta.y * dir1.y;
  const projection2 = mouseDelta.x * dir2.x + mouseDelta.y * dir2.y;
  
  // For equalized distances, use the average of the projections
  let finalProjection1, finalProjection2;
  if (equalizeDistances) {
    const avgProjection = (projection1 + projection2) / 2;
    finalProjection1 = avgProjection;
    finalProjection2 = avgProjection;
  } else {
    finalProjection1 = projection1;
    finalProjection2 = projection2;
  }
  
  // Calculate new on-curve point positions by moving along the fixed direction vectors
  const newOnPoint1 = {
    x: initialState.initialOnPoint1.x + finalProjection1 * dir1.x,
    y: initialState.initialOnPoint1.y + finalProjection1 * dir1.y
  };
  
  const newOnPoint2 = {
    x: initialState.initialOnPoint2.x + finalProjection2 * dir2.x,
    y: initialState.initialOnPoint2.y + finalProjection2 * dir2.y
  };
  
  // Return the new on-curve points with original control points unchanged
  const newOnCurvePoints = [newOnPoint1, p2, p3, newOnPoint2];
  
  // Get the original on-curve point indices
  const onPoint1Index = initialState.selectedSegment.parentPointIndices[0];
  const onPoint2Index = initialState.selectedSegment.parentPointIndices[3];
  
  // Return the changes instead of applying them
  return {
    onPoint1Index: onPoint1Index,
    onPoint2Index: onPoint2Index,
    newOnPoint1: newOnCurvePoints[0],  // New position for initialOnPoint1
    newOnPoint2: newOnCurvePoints[3],  // New position for initialOnPoint2
    // Keep control points unchanged
    controlPoint1Index: initialState.originalControlPoints.controlPoint1Index,
    controlPoint2Index: initialState.originalControlPoints.controlPoint2Index,
    newControlPoint1: initialState.initialOffPoint1,  // Unchanged
    newControlPoint2: initialState.initialOffPoint2   // Unchanged
  };
}

/**
 * Handles mouse drag event to calculate on-curve point changes based on true Tunni point movement
 * @param {Object} event - Mouse event
 * @param {Object} initialState - Initial state from mouse down
 * @param {Object} sceneController - Scene controller for editing operations
 * @returns {Object} Object containing on-curve point indices and new positions
 */
export function handleTrueTunniPointMouseDrag(event, initialState, sceneController) {
  // Calculate the changes for this mouse move event
  return calculateTrueTunniPointDragChanges(event, initialState, sceneController);
}

/**
 * Handles mouse up event to return the final state for the true Tunni point drag operation
 * @param {Object} initialState - Initial state from mouse down
 * @param {Object} sceneController - Scene controller for editing operations
 * @returns {Object} Object containing original on-curve point indices and their final positions
 */
export function handleTrueTunniPointMouseUp(initialState, sceneController) {
  // Check if we have the necessary data to process the mouse up event
  if (!initialState || !initialState.selectedSegment || !initialState.originalControlPoints) {
    return null;
  }

  // Get the original on-curve point indices
  const onPoint1Index = initialState.selectedSegment.parentPointIndices[0];
  const onPoint2Index = initialState.selectedSegment.parentPointIndices[3];
  
  // Return the original control point information without applying changes
 // The actual changes will be applied in the pointer tool as a single atomic operation
  return {
    onPoint1Index: onPoint1Index,
    onPoint2Index: onPoint2Index,
    originalOnPoint1: initialState.initialOnPoint1,
    originalOnPoint2: initialState.initialOnPoint2,
    controlPoint1Index: initialState.originalControlPoints.controlPoint1Index,
    controlPoint2Index: initialState.originalControlPoints.controlPoint2Index,
    originalControlPoint1: initialState.originalControlPoints.originalControlPoint1,
    originalControlPoint2: initialState.originalControlPoints.originalControlPoint2
  };
}

/**
 * Calculate new on-curve point positions based on a moved Tunni point.
 *
 * @param {Object} tunniPoint - The new Tunni point position
 * @param {Array} segmentPoints - Array of 4 points: [start, control1, control2, end]
 * @param {boolean} equalizeDistances - If true, makes distances from on-curve to Tunni point equal
 * @returns {Array} Array of 4 points with new on-curve positions
 */
export function calculateOnCurvePointsFromTunni(tunniPoint, segmentPoints, equalizeDistances = true) {
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
  return [newP1, p2, p3, newP4];
}
