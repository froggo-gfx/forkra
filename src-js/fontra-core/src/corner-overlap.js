import { VarPackedPath } from "./var-path.js";

export function addOverlap(path, selectedPointIndices) {
  // Validate that path has the required methods
  if (!path || typeof path !== 'object') {
    throw new Error('Path is not an object');
  }
  
  // Check if path is a VarPackedPath instance
  if (!(path instanceof VarPackedPath)) {
    throw new Error('Path is not a VarPackedPath instance');
  }
  
  // Validate that path has all required methods and properties
  const requiredMethods = ['copy', 'getPoint', 'getAbsolutePointIndex', 'getNumPointsOfContour', 'setPointPosition', 'insertPoint'];
  for (const method of requiredMethods) {
    if (typeof path[method] !== 'function') {
      throw new Error(`Path object is missing required method: ${method}`);
    }
  }
  
  if (typeof path.numContours === 'undefined') {
    throw new Error('Path object is missing required property: numContours');
  }
  
  // Validate selectedPointIndices
  if (!Array.isArray(selectedPointIndices)) {
    throw new Error('selectedPointIndices must be an array');
  }
  
  // Validate that all selectedPointIndices are valid numbers
  for (const index of selectedPointIndices) {
    if (typeof index !== 'number' || isNaN(index)) {
      throw new Error(`Invalid point index in selectedPointIndices: ${index}`);
    }
  }
  
  // Validate that selectedPointIndices are within the valid range for the path
  const maxPointIndex = path.numPoints - 1;
  for (const index of selectedPointIndices) {
    if (index < 0 || index > maxPointIndex) {
      throw new Error(`Point index ${index} is out of range for path with ${path.numPoints} points`);
    }
  }
  
  // Create a copy of the path to work on
  const newPath = path.copy();
  
  // Validate that newPath also has the required methods and properties
  if (!newPath || typeof newPath !== 'object') {
    throw new Error('Copied path is not an object');
  }
  
  // Check if newPath is a VarPackedPath instance
  if (!(newPath instanceof VarPackedPath)) {
    throw new Error('Copied path is not a VarPackedPath instance');
  }
  
  for (const method of requiredMethods) {
    if (typeof newPath[method] !== 'function') {
      throw new Error(`Copied path object is missing required method: ${method}`);
    }
  }
  
  if (typeof newPath.numContours === 'undefined') {
    throw new Error('Copied path object is missing required property: numContours');
  }
  
  // Validate that selectedPointIndices are within the valid range for the copied path
  const maxPointIndexNewPath = newPath.numPoints - 1;
  for (const index of selectedPointIndices) {
    if (index < 0 || index > maxPointIndexNewPath) {
      throw new Error(`Point index ${index} is out of range for copied path with ${newPath.numPoints} points`);
    }
  }
  
  // Convert selected point indices to a Set for faster lookup
  const selectedPointIndicesSet = new Set(selectedPointIndices);
  
  // Check if we have exactly two points selected for the new workflow
  if (selectedPointIndices.length === 2) {
    // New workflow for two selected points
    return addOverlapTwoPoints(newPath, selectedPointIndices);
  }
  
  // Process each contour (existing workflow for single point selection)
  for (let contourIndex = 0; contourIndex < newPath.numContours; contourIndex++) {
    const startPoint = newPath.getAbsolutePointIndex(contourIndex, 0);
    const numPoints = newPath.getNumPointsOfContour(contourIndex);
    
    // Skip single point contours
    if (numPoints <= 1) {
      continue;
    }
    
    // Process points in reverse order to maintain correct indices when inserting
    let insertedCount = 0;
    for (let i = numPoints - 1; i >= 0; i--) {
      const pointIndex = startPoint + i;
      const point = newPath.getPoint(pointIndex);
      
      // Check if this point is selected and is an on-curve point
      if (point && !point.type && selectedPointIndicesSet.has(pointIndex)) {
        // This is an on-curve point that is selected
        // Calculate offset points based on neighboring segments
        
        // Get previous and next points (with wrapping for closed contours)
        const prevIndex = (i - 1 + numPoints) % numPoints;
        const nextIndex = (i + 1) % numPoints;
        
        const prevPoint = newPath.getPoint(startPoint + prevIndex);
        const nextPoint = newPath.getPoint(startPoint + nextIndex);
        
        // Calculate offsets with fixed offset distance of 30
        let prevOffsetX, prevOffsetY;
        let nextOffsetX, nextOffsetY;
        
        [prevOffsetX, prevOffsetY] = calculateOffset(prevPoint, point);
        [nextOffsetX, nextOffsetY] = calculateOffset(point, nextPoint);
        
        // Handle special cases for curves when direct offset is zero
        if (nextOffsetX === 0 && nextOffsetY === 0 && nextPoint.type) {
          const nextSegment = getCurveSegment(newPath, contourIndex, i, true);
          if (nextSegment) {
            const newPoint = pointOnACurve(nextSegment, 0.9);
            [nextOffsetX, nextOffsetY] = calculateOffset(point, newPoint);
          }
        }
        
        if (prevOffsetX === 0 && prevOffsetY === 0 && prevPoint.type) {
          const prevSegment = getCurveSegment(newPath, contourIndex, i, false);
          if (prevSegment) {
            const newPoint = pointOnACurve(prevSegment, 0.9);
            [prevOffsetX, prevOffsetY] = calculateOffset(newPoint, point);
          }
        }
        
        // Create two new points (B1 and B2) that will intersect where B was:
        // B1 = B + prevOffset (moves B in the direction of the previous segment)
        // B2 = B - nextOffset (moves B in the opposite direction of the next segment)
        
        // Update current point position to B1 (B + prevOffset)
        const updatedPoint = {
          x: point.x + prevOffsetX,
          y: point.y + prevOffsetY
        };
        newPath.setPointPosition(pointIndex, updatedPoint.x, updatedPoint.y);
        
        // Create B2 point (B - nextOffset) and insert it after the current point
        const b2Point = {
          x: point.x - nextOffsetX,
          y: point.y - nextOffsetY
          // No type property = on-curve point
        };
        
        // Insert the B2 point right after the current point
        newPath.insertPoint(contourIndex, i + 1 + insertedCount, b2Point);
        insertedCount++;
      }
    }
  }
  
  return newPath;

function addOverlapTwoPoints(path, selectedPointIndices) {
  // Get the two selected points
  const pointA = path.getPoint(selectedPointIndices[0]);
  const pointB = path.getPoint(selectedPointIndices[1]);
  
  // Validate that both points are on-curve points
  if (pointA.type || pointB.type) {
    throw new Error('Both selected points must be on-curve points');
  }
  
  // Find which contour each point belongs to
  const contourIndexA = path.getContourIndex(selectedPointIndices[0]);
  const contourIndexB = path.getContourIndex(selectedPointIndices[1]);
  
  // Both points must be in the same contour
  if (contourIndexA !== contourIndexB) {
    throw new Error('Both selected points must be in the same contour');
  }
  
  const contourIndex = contourIndexA;
  
  // Get contour information
  const startPoint = path.getAbsolutePointIndex(contourIndex, 0);
  const numPoints = path.getNumPointsOfContour(contourIndex);
  
  // Get relative indices within the contour
  let relativeIndexA = selectedPointIndices[0] - startPoint;
  let relativeIndexB = selectedPointIndices[1] - startPoint;
  
  // Calculate outgoing direction for point A (based on segment from A to next point)
  const nextIndexA = (relativeIndexA + 1) % numPoints;
  const nextPointA = path.getPoint(startPoint + nextIndexA);
  
  // Calculate incoming direction for point B (based on segment from previous point to B)
  const prevIndexB = (relativeIndexB - 1 + numPoints) % numPoints;
  const prevPointB = path.getPoint(startPoint + prevIndexB);
  
  // Calculate combined offsets with fixed offset distance of 30 (same as single-point scenario)
  // We need to displace in two directions:
  // 1. Perpendicular to the path (to move outside the outline)
  // 2. Along the path (negative for point A, positive for point B)
  let offsetAX, offsetAY;
  let offsetBX, offsetBY;
  
  // Calculate direction vector from A to next point
  const dirAX = nextPointA.x - pointA.x;
  const dirAY = nextPointA.y - pointA.y;
  // Calculate unit tangent vector
  const lengthA = Math.sqrt(dirAX * dirAX + dirAY * dirAY);
  let tangentAX = 0, tangentAY = 0;
  if (lengthA !== 0) {
    tangentAX = dirAX / lengthA;
    tangentAY = dirAY / lengthA;
  }
  // Calculate perpendicular vector (rotated 90 degrees counter-clockwise)
  const perpAX = -tangentAY;
  const perpAY = tangentAX;
  
  // Combine perpendicular displacement (outside the outline) with negative tangent displacement
  offsetAX = (perpAX - tangentAX) * 30;
  offsetAY = (perpAY - tangentAY) * 30;
  
  // Calculate direction vector from previous point to B
  const dirBX = pointB.x - prevPointB.x;
  const dirBY = pointB.y - prevPointB.y;
  // Calculate unit tangent vector
  const lengthB = Math.sqrt(dirBX * dirBX + dirBY * dirBY);
  let tangentBX = 0, tangentBY = 0;
  if (lengthB !== 0) {
    tangentBX = dirBX / lengthB;
    tangentBY = dirBY / lengthB;
  }
  // Calculate perpendicular vector (rotated 90 degrees counter-clockwise)
  const perpBX = -tangentBY;
  const perpBY = tangentBX;
  
  // Combine perpendicular displacement (outside the outline) with positive tangent displacement
  offsetBX = (perpBX + tangentBX) * 30;
  offsetBY = (perpBY + tangentBY) * 30;
  
  // Create new points displaced in these directions from the original points A and B
  // Point C is displaced from A in both perpendicular and negative tangent directions
  const newPointC = {
    x: pointA.x + offsetAX,
    y: pointA.y + offsetAY
  };
  
  // Point D is displaced from B in both perpendicular and positive tangent directions
  const newPointD = {
    x: pointB.x + offsetBX,
    y: pointB.y + offsetBY
  };
  
  // Insert new points
  // We want the order to be A, C, D, B
  // So we insert D first (at the higher index) to avoid affecting the lower index
  // Then we insert C
  if (relativeIndexA < relativeIndexB) {
    // Insert newPointC after pointA
    path.insertPoint(contourIndex, relativeIndexA + 1, newPointC);
    // Insert newPointD after newPointC (which is now at relativeIndexA + 2)
    path.insertPoint(contourIndex, relativeIndexA + 2, newPointD);
  } else {
    // Insert newPointD after pointB
    path.insertPoint(contourIndex, relativeIndexB + 1, newPointD);
    // Insert newPointC after newPointD (which is now at relativeIndexB + 2, but relativeIndexA has shifted by 1)
    path.insertPoint(contourIndex, relativeIndexA + 1, newPointC);
  }
  
  return path;
}
}

function calculateOffset(pt1, pt2, offsetDistance = 30) {
  if (!pt1 || !pt2) {
    return [0, 0];
  }
  
  const deltaX = pt2.x - pt1.x;
  const deltaY = pt2.y - pt1.y;
  const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  
  if (length === 0) {
    return [0, 0];
  }
  
  const offsetX = (deltaX / length) * offsetDistance;
  const offsetY = (deltaY / length) * offsetDistance;
  
  return [Math.round(offsetX), Math.round(offsetY)];
}

function getCurveSegment(path, contourIndex, contourPointIndex, isNext) {
  try {
    const numPoints = path.getNumPointsOfContour(contourIndex);
    const startPoint = path.getAbsolutePointIndex(contourIndex, 0);
    
    if (isNext) {
      // For next segment: points at indices (contourPointIndex+3), (contourPointIndex+2), (contourPointIndex+1), contourPointIndex
      // But the curve calculation expects them in order: p1, p2, p3, p4
      if (contourPointIndex + 3 < numPoints) {
        const p1 = path.getPoint(startPoint + contourPointIndex + 3);
        const p2 = path.getPoint(startPoint + contourPointIndex + 2);
        const p3 = path.getPoint(startPoint + contourPointIndex + 1);
        const p4 = path.getPoint(startPoint + contourPointIndex);
        
        return [p1, p2, p3, p4];
      }
    } else {
      // For previous segment: points at indices (contourPointIndex-3), (contourPointIndex-2), (contourPointIndex-1), contourPointIndex
      // The curve calculation expects them in order: p1, p2, p3, p4
      if (contourPointIndex - 3 >= 0) {
        const p1 = path.getPoint(startPoint + contourPointIndex - 3);
        const p2 = path.getPoint(startPoint + contourPointIndex - 2);
        const p3 = path.getPoint(startPoint + contourPointIndex - 1);
        const p4 = path.getPoint(startPoint + contourPointIndex);
        
        return [p1, p2, p3, p4];
      }
    }
  } catch (e) {
    // Ignore errors, just return null
  }
  return null;
}

function pointOnACurve(curve, value) {
  const [p1, p2, p3, p4] = curve;
  
  // For a cubic Bézier curve defined by p1, p2, p3, p4
  // Calculate point at parameter value
  const dx = p1.x;
  const cx = (p2.x - dx) * 3.0;
  const bx = (p3.x - p2.x) * 3.0 - cx;
  const ax = p4.x - dx - cx - bx;
  
  const dy = p1.y;
  const cy = (p2.y - dy) * 3.0;
  const by = (p3.y - p2.y) * 3.0 - cy;
  const ay = p4.y - dy - cy - by;
  
  const mx = ax * Math.pow(value, 3) + bx * Math.pow(value, 2) + cx * value + dx;
  const my = ay * Math.pow(value, 3) + by * Math.pow(value, 2) + cy * value + dy;
  
  return { x: mx, y: my };
}