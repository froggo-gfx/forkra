import { Bezier } from "bezier-js";
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
  
  // Check if we have exactly two or four points selected for the new workflow
  if (selectedPointIndices.length === 2 || selectedPointIndices.length === 4) {
    // New workflow for two or four selected points
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
  // Validate that path is a VarPackedPath instance
  if (!(path instanceof VarPackedPath)) {
    throw new Error('Path is not a VarPackedPath instance in addOverlapTwoPoints');
  }
  
  // Handle both two-point and four-point configurations
  if (selectedPointIndices.length === 2) {
    // Original two-point workflow
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
    
    // Validate that path has contourInfo property
    if (!path.contourInfo || !Array.isArray(path.contourInfo)) {
      throw new Error('Path object is missing contourInfo property or it is not an array');
    }
    
    // Get contour information
    // Validate that path has the required methods
    if (typeof path.getAbsolutePointIndex !== 'function' || typeof path.getNumPointsOfContour !== 'function') {
      throw new Error('Path object is missing required methods in addOverlapTwoPoints');
    }
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
    
    // Calculate intersections between the line segment connecting the two selected points and the glyph outline
    const virtualPoints = calculateVirtualPointsForTwoPointExpansion(path, pointA, pointB, contourIndex, selectedPointIndices);
    
    // Debug logging
    console.log("Virtual points calculated:", virtualPoints);
    
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
    
    // Return both the modified path and the virtual points
    // For compatibility with existing code, we return just the path
    // but store the virtual points in a more accessible way
    path._virtualPoints = virtualPoints;
    console.log("Virtual points stored in path._virtualPoints:", virtualPoints);
    return path;
  } else if (selectedPointIndices.length === 4) {
    // New four-point workflow - implement the correct approach with proper validation
    // Validate that we have exactly four points
    if (selectedPointIndices.length !== 4) {
      throw new Error('addOverlapTwoPoints requires exactly four selected points');
    }
    
    // Sort the point indices to ensure they are in order
    const sortedIndices = [...selectedPointIndices].sort((a, b) => a - b);
    
    // Validate four-point configuration using the same logic as checkFourPointConfiguration
    // Check if all points belong to the same contour
    const selectionByContour = new Map();
    for (const pointIndex of sortedIndices) {
      const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(pointIndex);
      if (!selectionByContour.has(contourIndex)) {
        selectionByContour.set(contourIndex, []);
      }
      selectionByContour.get(contourIndex).push(contourPointIndex);
    }
    
    // Points must be on a single contour
    if (selectionByContour.size !== 1) {
      throw new Error('All selected points must be on a single contour');
    }
    
    const contourIndex = [...selectionByContour.keys()][0];
    const contourPointIndices = selectionByContour.get(contourIndex).sort((a, b) => a - b);
    
    // Check if points are consecutive on the contour
    const isClosed = path.contourInfo[contourIndex].isClosed;
    const numPointsInContour = path.getNumPointsOfContour(contourIndex);
    
    // Check consecutive differences
    let areConsecutive = true;
    for (let i = 0; i < contourPointIndices.length - 1; i++) {
      const diff = contourPointIndices[i + 1] - contourPointIndices[i];
      if (diff !== 1) {
        areConsecutive = false;
        break;
      }
    }
    
    // If not consecutive in a closed contour, check for wraparound case
    if (!areConsecutive && isClosed) {
      // Check if it's the wraparound case: [n-3, n-2, n-1, 0] where n is numPointsInContour
      if (contourPointIndices[0] === 0 &&
          contourPointIndices[1] === 1 &&
          contourPointIndices[2] === 2 &&
          contourPointIndices[3] === numPointsInContour - 1) {
        areConsecutive = true;
      }
    }
    
    if (!areConsecutive) {
      throw new Error('Selected points must be consecutive on-curve points');
    }
    
    // Map global indices to contour indices for easier access
    const contourPoints = contourPointIndices.map(i => path.getPoint(path.getAbsolutePointIndex(contourIndex, i)));
    
    // Check that all four points are on-curve points (no type attribute)
    if (contourPoints.some(point => point.type)) {
      throw new Error('All selected points must be on-curve points');
    }
    
    // Reorder points to A, B, C, D based on their order in the contour
    let [pointA, pointB, pointC, pointD] = contourPoints;
    const [indexA, indexB, indexC, indexD] = contourPointIndices;
    
    // Check if A and D each have exactly one off-curve handle
    // Get neighbors of A (first point)
    let prevIndexA, nextIndexA;
    if (isClosed) {
      prevIndexA = indexA === 0 ? numPointsInContour - 1 : indexA - 1;
      nextIndexA = indexA === numPointsInContour - 1 ? 0 : indexA + 1;
    } else {
      prevIndexA = indexA > 0 ? indexA - 1 : null;
      nextIndexA = indexA < numPointsInContour - 1 ? indexA + 1 : null;
    }
    
    // Get neighbors of D (last point)
    let prevIndexD, nextIndexD;
    if (isClosed) {
      prevIndexD = indexD === 0 ? numPointsInContour - 1 : indexD - 1;
      nextIndexD = indexD === numPointsInContour - 1 ? 0 : indexD + 1;
    } else {
      prevIndexD = indexD > 0 ? indexD - 1 : null;
      nextIndexD = indexD < numPointsInContour - 1 ? indexD + 1 : null;
    }
    
    // Count off-curve handles for A
    let offCurveCountA = 0;
    if (prevIndexA !== null) {
      const prevPointA = path.getPoint(path.getAbsolutePointIndex(contourIndex, prevIndexA));
      if (prevPointA.type) offCurveCountA++;
    }
    if (nextIndexA !== null) {
      const nextPointA = path.getPoint(path.getAbsolutePointIndex(contourIndex, nextIndexA));
      if (nextPointA.type) offCurveCountA++;
    }
    
    // Count off-curve handles for D
    let offCurveCountD = 0;
    if (prevIndexD !== null) {
      const prevPointD = path.getPoint(path.getAbsolutePointIndex(contourIndex, prevIndexD));
      if (prevPointD.type) offCurveCountD++;
    }
    if (nextIndexD !== null) {
      const nextPointD = path.getPoint(path.getAbsolutePointIndex(contourIndex, nextIndexD));
      if (nextPointD.type) offCurveCountD++;
    }
    
    // A and D must each have exactly one off-curve handle
    if (offCurveCountA !== 1 || offCurveCountD !== 1) {
      throw new Error('Points A and D must each have exactly one off-curve handle');
    }
    
    // Calculate outgoing direction for point A (based on segment from A to next point)
    const nextIndexAAdj = (indexA + 1) % numPointsInContour;
    const nextPointA = path.getPoint(path.getAbsolutePointIndex(contourIndex, nextIndexAAdj));
    
    // Calculate incoming direction for point D (based on segment from previous point to D)
    const prevIndexDAdj = (indexD - 1 + numPointsInContour) % numPointsInContour;
    const prevPointD = path.getPoint(path.getAbsolutePointIndex(contourIndex, prevIndexDAdj));
    
    // Calculate combined offsets with fixed offset distance of 30 (same as single-point scenario)
    // We need to displace in two directions:
    // 1. Perpendicular to the path (to move outside the outline)
    // 2. Along the path (negative for point A, positive for point D)
    let offsetAX, offsetAY;
    let offsetDX, offsetDY;
    
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
    
    // Calculate direction vector from previous point to D
    const dirDX = pointD.x - prevPointD.x;
    const dirDY = pointD.y - prevPointD.y;
    // Calculate unit tangent vector
    const lengthD = Math.sqrt(dirDX * dirDX + dirDY * dirDY);
    let tangentDX = 0, tangentDY = 0;
    if (lengthD !== 0) {
      tangentDX = dirDX / lengthD;
      tangentDY = dirDY / lengthD;
    }
    // Calculate perpendicular vector (rotated 90 degrees counter-clockwise)
    const perpDX = -tangentDY;
    const perpDY = tangentDX;
    
    // Combine perpendicular displacement (outside the outline) with positive tangent displacement
    offsetDX = (perpDX + tangentDX) * 30;
    offsetDY = (perpDY + tangentDY) * 30;
    
    // Create new points displaced in these directions from the original points A and D
    // Point E is displaced from A in both perpendicular and negative tangent directions
    const newPointE = {
      x: pointA.x + offsetAX,
      y: pointA.y + offsetAY
    };
    
    // Point F is displaced from D in both perpendicular and positive tangent directions
    const newPointF = {
      x: pointD.x + offsetDX,
      y: pointD.y + offsetDY
    };
    
    // Calculate intersections between the B-C chord and the glyph outline using the correct approach
    const virtualPoints = calculateVirtualPointsForFourPointConfiguration(path, pointA, pointB, pointC, pointD, contourIndex, sortedIndices);
    
    // Debug logging
    console.log("Virtual points calculated:", virtualPoints);
    
    // Insert new points
    // We want the order to be A, E, F, D
    // So we insert F first (at the higher index) to avoid affecting the lower index
    // Then we insert E
    // Get relative indices within the contour for insertion
    const startPoint = path.getAbsolutePointIndex(contourIndex, 0);
    const relativeIndexA = indexA; // indexA is already the relative index
    
    // Insert newPointE after pointA
    path.insertPoint(contourIndex, relativeIndexA + 1, newPointE);
    // Insert newPointF after newPointE (which is now at relativeIndexA + 2)
    path.insertPoint(contourIndex, relativeIndexA + 2, newPointF);
    
    // Return both the modified path and the virtual points
    // For compatibility with existing code, we return just the path
    // but store the virtual points in a more accessible way
    path._virtualPoints = virtualPoints;
    console.log("Virtual points stored in path._virtualPoints:", virtualPoints);
    return path;
  } else {
    throw new Error('addOverlapTwoPoints requires either two or four selected points');
  }
}
}

// Function to calculate virtual points for two-point expansion scenario
function calculateVirtualPointsForTwoPointExpansion(path, pointA, pointB, contourIndex, selectedPointIndices) {
  // Create a line segment between the two selected points
  const lineSegment = {
    p1: { x: pointA.x, y: pointA.y },
    p2: { x: pointB.x, y: pointB.y }
  };
  
  // Initialize array to store virtual points
  const virtualPoints = [];
  
  // Get the indices of the selected points within their contour
  const startPoint = path.getAbsolutePointIndex(contourIndex, 0);
  const relativeIndexA = selectedPointIndices[0] - startPoint;
  const relativeIndexB = selectedPointIndices[1] - startPoint;
  const numPoints = path.getNumPointsOfContour(contourIndex);
  
  // Create a set of segment point pairs that directly connect the two selected points
  // These are the segments we want to exclude from intersection calculations
  const excludedSegmentPoints = new Set();
  
  // Add the direct connection from A to B (forward direction)
  const forwardStart = Math.min(relativeIndexA, relativeIndexB);
  const forwardEnd = Math.max(relativeIndexA, relativeIndexB);
  excludedSegmentPoints.add(`${forwardStart},${forwardEnd}`);
  
  // Add the direct connection from B to A (backward direction)
  const backwardStart = Math.max(relativeIndexA, relativeIndexB);
  const backwardEnd = (Math.min(relativeIndexA, relativeIndexB) + numPoints) % numPoints;
  // Only add backward connection if it's different from forward
  if (backwardStart !== forwardStart || backwardEnd !== forwardEnd) {
    excludedSegmentPoints.add(`${backwardStart},${backwardEnd}`);
  }
  
  // Iterate through all contours to find intersections
  for (let cIndex = 0; cIndex < path.numContours; cIndex++) {
    // Iterate through segments of this contour
    let segmentIndex = 0;
    for (const segment of path.iterContourSegmentPointIndices(cIndex)) {
      // Skip segments without valid pointIndices
      if (!segment.pointIndices || !Array.isArray(segment.pointIndices)) {
        segmentIndex++;
        continue;
      }
      
      // For the contour containing the selected points, check if this segment should be excluded
      if (cIndex === contourIndex) {
        // Get the relative indices of the first and last points in this segment
        const firstPointIndex = segment.pointIndices[0] - startPoint;
        const lastPointIndex = segment.pointIndices[segment.pointIndices.length - 1] - startPoint;
        
        // Normalize indices to handle wrapping in closed contours
        const normalizedFirst = ((firstPointIndex % numPoints) + numPoints) % numPoints;
        const normalizedLast = ((lastPointIndex % numPoints) + numPoints) % numPoints;
        
        // Create a key for this segment (order doesn't matter)
        const segmentKey = `${Math.min(normalizedFirst, normalizedLast)},${Math.max(normalizedFirst, normalizedLast)}`;
        
        if (excludedSegmentPoints.has(segmentKey)) {
          segmentIndex++;
          continue;
        }
      }
      
      // Get the points of this segment
      const segmentPoints = segment.pointIndices.map(i => path.getPoint(i));
      
      // Calculate intersections for both curve and line segments
      let intersections = [];
      if (segmentPoints.length >= 3) {
        // This is a curve segment (has 3 or more points)
        // Create Bezier curve for this segment
        const bezierCurve = new Bezier(...segmentPoints);
        
        // Calculate intersections between the Bezier curve and our line segment
        intersections = bezierCurve.intersects(lineSegment);
      } else if (segmentPoints.length === 2) {
        // This is a line segment (has exactly 2 points)
        // Create a line segment for intersection calculation
        const segmentLine = {
          p1: { x: segmentPoints[0].x, y: segmentPoints[0].y },
          p2: { x: segmentPoints[1].x, y: segmentPoints[1].y }
        };
        
        // For line-line intersection, we need a different approach
        // Using a simple line intersection algorithm
        intersections = calculateLineIntersection(lineSegment, segmentLine);
      }
      
      // Convert intersection parameters to actual points and create virtual point objects
      for (const intersection of intersections) {
        let intersectionPoint;
        let tangent;
        let t; // parameter for the contour segment
        
        if (segmentPoints.length >= 3) {
          // For curve segments
          const bezierCurve = new Bezier(...segmentPoints);
          t = intersection; // For Bezier curves, intersection is the t parameter
          // Get the intersection point on the Bezier curve
          intersectionPoint = bezierCurve.compute(t);
          // Calculate tangent at the intersection point
          tangent = bezierCurve.derivative(t);
        } else if (segmentPoints.length === 2) {
          // For line segments
          // intersection is an object with t (parameter for lineSegment) and u (parameter for segmentLine)
          t = intersection.u; // Use u parameter for the contour segment
          // Linear interpolation to get the intersection point using u parameter
          intersectionPoint = {
            x: segmentPoints[0].x + t * (segmentPoints[1].x - segmentPoints[0].x),
            y: segmentPoints[0].y + t * (segmentPoints[1].y - segmentPoints[0].y)
          };
          // Tangent is just the direction of the line segment
          tangent = {
            x: segmentPoints[1].x - segmentPoints[0].x,
            y: segmentPoints[1].y - segmentPoints[0].y
          };
        }
        
        if (intersectionPoint && tangent) {
          // Create perpendicular vector for handle directions
          const perpVector = {
            x: -tangent.y,
            y: tangent.x
          };
          
          // Normalize the perpendicular vector
          const perpLength = Math.sqrt(perpVector.x * perpVector.x + perpVector.y * perpVector.y);
          if (perpLength > 0) {
            perpVector.x /= perpLength;
            perpVector.y /= perpLength;
          }
          
          // Scale the perpendicular vector to a reasonable handle length (30% of tangent length)
          const tangentLength = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
          const handleLength = tangentLength * 0.3;
          const handleVector = {
            x: perpVector.x * handleLength,
            y: perpVector.y * handleLength
          };
          
          // Create the virtual point object
          const virtualPoint = {
            x: intersectionPoint.x,
            y: intersectionPoint.y,
            suggestedHandles: {
              in: {
                x: Math.round(intersectionPoint.x - handleVector.x),
                y: Math.round(intersectionPoint.y - handleVector.y)
              },
              out: {
                x: Math.round(intersectionPoint.x + handleVector.x),
                y: Math.round(intersectionPoint.y + handleVector.y)
              }
            },
            contourIndex: cIndex,
            segmentIndex: segmentIndex,
            t: t
          };
          
          virtualPoints.push(virtualPoint);
        }
      }
      
      // Increment segment index
      segmentIndex++;
    }
  }
  
  return virtualPoints;
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

// Function to calculate intersection between two line segments
function calculateLineIntersection(line1, line2) {
  // Extract points
  const p1 = line1.p1;
  const p2 = line1.p2;
  const p3 = line2.p1;
  const p4 = line2.p2;
  
  // Calculate denominators
  const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  
  // If denominator is 0, lines are parallel
  if (Math.abs(denom) < 1e-10) {
    return [];
  }
  
  // Calculate numerators
  const tNum = (p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x);
  const uNum = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x));
  
  // Calculate parameters
  const t = tNum / denom;
  const u = uNum / denom;
  
  // Check if intersection is within both line segments (0 <= t <= 1 and 0 <= u <= 1)
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    // Return both t and u parameters
    return [{ t: t, u: u }];
  }
  
  return [];
}

// Function to calculate virtual points for four-point configuration
function calculateVirtualPointsForFourPointConfiguration(path, pointA, pointB, pointC, pointD, contourIndex, selectedPointIndices) {
  // Create the B-C chord (the line segment of interest)
  const chordSegment = {
    p1: { x: pointB.x, y: pointB.y },
    p2: { x: pointC.x, y: pointC.y }
  };
  
  // Initialize array to store virtual points
  const virtualPoints = [];
  
  // Get the indices of the selected points within their contour
  const startPoint = path.getAbsolutePointIndex(contourIndex, 0);
  const relativeIndexA = selectedPointIndices[0] - startPoint;
  const relativeIndexB = selectedPointIndices[1] - startPoint;
  const relativeIndexC = selectedPointIndices[2] - startPoint;
  const relativeIndexD = selectedPointIndices[3] - startPoint;
  
  // Find the incoming curve to point A (segment ending at point A)
  let incomingCurve = null;
  for (const segment of path.iterContourSegmentPointIndices(contourIndex)) {
    // Skip segments without valid pointIndices
    if (!segment.pointIndices || !Array.isArray(segment.pointIndices)) {
      continue;
    }
    
    // Check if this segment ends at point A (last point in segment is point A)
    const lastPointIndex = segment.pointIndices[segment.pointIndices.length - 1];
    if (lastPointIndex === (startPoint + relativeIndexA)) {
      // This is the segment we're looking for
      if (segment.pointIndices.length >= 3) {
        // This is a curve segment (has 3 or more points)
        const segmentPoints = segment.pointIndices.map(i => path.getPoint(i));
        incomingCurve = new Bezier(...segmentPoints);
      }
      break;
    }
  }
  
  // Find the outgoing curve from point D (segment starting at point D)
  let outgoingCurve = null;
  for (const segment of path.iterContourSegmentPointIndices(contourIndex)) {
    // Skip segments without valid pointIndices
    if (!segment.pointIndices || !Array.isArray(segment.pointIndices)) {
      continue;
    }
    
    // Check if this segment starts at point D (first point in segment is point D)
    const firstPointIndex = segment.pointIndices[0];
    if (firstPointIndex === (startPoint + relativeIndexD)) {
      // This is the segment we're looking for
      if (segment.pointIndices.length >= 3) {
        // This is a curve segment (has 3 or more points)
        const segmentPoints = segment.pointIndices.map(i => path.getPoint(i));
        outgoingCurve = new Bezier(...segmentPoints);
      }
      break;
    }
  }
  
  // Calculate intersections only between these specific curves and the B-C chord
  if (incomingCurve) {
    const intersections = incomingCurve.intersects(chordSegment);
    
    // Convert intersection parameters to actual points and create virtual point objects
    for (const t of intersections) {
      // Get the intersection point on the Bezier curve
      const intersectionPoint = incomingCurve.compute(t);
      // Calculate tangent at the intersection point
      const tangent = incomingCurve.derivative(t);
      
      // Create perpendicular vector for handle directions
      const perpVector = {
        x: -tangent.y,
        y: tangent.x
      };
      
      // Normalize the perpendicular vector
      const perpLength = Math.sqrt(perpVector.x * perpVector.x + perpVector.y * perpVector.y);
      if (perpLength > 0) {
        perpVector.x /= perpLength;
        perpVector.y /= perpLength;
      }
      
      // Scale the perpendicular vector to a reasonable handle length (30% of tangent length)
      const tangentLength = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
      const handleLength = tangentLength * 0.3;
      const handleVector = {
        x: perpVector.x * handleLength,
        y: perpVector.y * handleLength
      };
      
      // Create the virtual point object
      const virtualPoint = {
        x: intersectionPoint.x,
        y: intersectionPoint.y,
        suggestedHandles: {
          in: {
            x: Math.round(intersectionPoint.x - handleVector.x),
            y: Math.round(intersectionPoint.y - handleVector.y)
          },
          out: {
            x: Math.round(intersectionPoint.x + handleVector.x),
            y: Math.round(intersectionPoint.y + handleVector.y)
          }
        },
        contourIndex: contourIndex,
        segmentIndex: -1, // Not applicable for virtual points from curves
        t: t
      };
      
      virtualPoints.push(virtualPoint);
    }
  }
  
  if (outgoingCurve) {
    const intersections = outgoingCurve.intersects(chordSegment);
    
    // Convert intersection parameters to actual points and create virtual point objects
    for (const t of intersections) {
      // Get the intersection point on the Bezier curve
      const intersectionPoint = outgoingCurve.compute(t);
      // Calculate tangent at the intersection point
      const tangent = outgoingCurve.derivative(t);
      
      // Create perpendicular vector for handle directions
      const perpVector = {
        x: -tangent.y,
        y: tangent.x
      };
      
      // Normalize the perpendicular vector
      const perpLength = Math.sqrt(perpVector.x * perpVector.x + perpVector.y * perpVector.y);
      if (perpLength > 0) {
        perpVector.x /= perpLength;
        perpVector.y /= perpLength;
      }
      
      // Scale the perpendicular vector to a reasonable handle length (30% of tangent length)
      const tangentLength = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
      const handleLength = tangentLength * 0.3;
      const handleVector = {
        x: perpVector.x * handleLength,
        y: perpVector.y * handleLength
      };
      
      // Create the virtual point object
      const virtualPoint = {
        x: intersectionPoint.x,
        y: intersectionPoint.y,
        suggestedHandles: {
          in: {
            x: Math.round(intersectionPoint.x - handleVector.x),
            y: Math.round(intersectionPoint.y - handleVector.y)
          },
          out: {
            x: Math.round(intersectionPoint.x + handleVector.x),
            y: Math.round(intersectionPoint.y + handleVector.y)
          }
        },
        contourIndex: contourIndex,
        segmentIndex: -1, // Not applicable for virtual points from curves
        t: t
      };
      
      virtualPoints.push(virtualPoint);
    }
  }
  
  // Filter and create virtual points only at valid intersections on the B-C chord
  // We need to ensure the intersection points are within the B-C chord segment
  const filteredVirtualPoints = virtualPoints.filter(virtualPoint => {
    // Check if the point is within the chord segment
    const chordVector = {
      x: pointC.x - pointB.x,
      y: pointC.y - pointB.y
    };
    const pointVector = {
      x: virtualPoint.x - pointB.x,
      y: virtualPoint.y - pointB.y
    };
    
    // Calculate the dot product to determine if the point is within the chord
    const chordLengthSquared = chordVector.x * chordVector.x + chordVector.y * chordVector.y;
    const dotProduct = pointVector.x * chordVector.x + pointVector.y * chordVector.y;
    const t = dotProduct / chordLengthSquared;
    
    // The point should be within the chord segment (0 <= t <= 1)
    return t >= 0 && t <= 1;
  });
  
  return filteredVirtualPoints;
}