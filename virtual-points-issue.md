export function computeChordIntersections(selection, path) {
  // First, validate that we have a proper four-point configuration
  if (!checkFourPointConfiguration(path, selection) || selection.length !== 4) {
    return [];
  }

  // Sort the selection to get the points in order
  const sortedIndices = [...selection].sort((a, b) => a - b);
  
  // Get the contour index and contour point indices
  const selectionByContour = getSelectionByContour(path, sortedIndices);
  const contourIndex = [...selectionByContour.keys()][0];
  const contourPointIndices = selectionByContour.get(contourIndex).sort((a, b) => a - b);
  
  // Map to actual points
  const contourPoints = contourPointIndices.map(i =>
    path.getPoint(path.getAbsolutePointIndex(contourIndex, i))
  );
  
  // Identify points A, B, C, D based on their order
  const [pointA, pointB, pointC, pointD] = contourPoints;
  const [indexA, indexB, indexC, indexD] = contourPointIndices;
  
  // Get the previous point to A (for the incoming curve)
  const isClosed = path.contourInfo[contourIndex].isClosed;
  const numPointsInContour = path.getNumPointsOfContour(contourIndex);
  
  let prevIndexA;
  if (isClosed) {
    prevIndexA = indexA === 0 ? numPointsInContour - 1 : indexA - 1;
  } else {
    prevIndexA = indexA > 0 ? indexA - 1 : null;
  }
  
  // If there's no previous point in an open contour, we can't compute the intersection
  if (prevIndexA === null) {
    return [];
  }
  
  // Find the segment that ends at point A (the incoming curve)
  let incomingSegment = null;
  for (const segment of path.iterContourSegmentPointIndices(contourIndex)) {
    if (segment.pointIndices[segment.pointIndices.length - 1] ===
        path.getAbsolutePointIndex(contourIndex, indexA)) {
      incomingSegment = segment;
      break;
    }
  }
  
  // If we couldn't find the incoming segment, return empty array
  if (!incomingSegment) {
    return [];
  }
  
  // Get the points of the incoming segment
  const incomingPoints = incomingSegment.pointIndices.map(i => path.getPoint(i));
  
  // If the incoming segment is not a curve (less than 3 points), we can't compute intersection
  if (incomingPoints.length < 3) {
    return [];
  }
  
  // Create Bezier curve for the incoming segment
  const incomingBezier = new Bezier(...incomingPoints);
  
  // Create line segment B-C
  const lineStart = { x: pointB.x, y: pointB.y };
  const lineEnd = { x: pointC.x, y: pointC.y };
  
  // Compute intersections between the Bezier curve and the line segment
  const intersections = incomingBezier.intersects({ p1: lineStart, p2: lineEnd });
  
  // Convert intersection parameters to actual points and create virtual point objects
  const result = [];
  
  for (const t of intersections) {
    // Get the intersection point on the Bezier curve
    const intersectionPoint = incomingBezier.compute(t);
    
    // Calculate suggested handles based on local geometry
    // We'll create handles that are perpendicular to the curve's tangent at the intersection point
    const tangent = incomingBezier.derivative(t);
    
    // Create perpendicular vector for handle directions
    const perpVector = vector.normalizeVector({
      x: -tangent.y,
      y: tangent.x
    });
    
    // Scale the perpendicular vector to a reasonable handle length (30% of tangent length)
    const handleLength = vector.vectorLength(tangent) * 0.3;
    const handleVector = vector.mulVectorScalar(perpVector, handleLength);
    
    // Create the virtual point object
    const virtualPoint = {
      x: intersectionPoint.x,
      y: intersectionPoint.y,
      suggestedHandles: {
        in: vector.roundVector({
          x: intersectionPoint.x - handleVector.x,
          y: intersectionPoint.y - handleVector.y
        }),
        out: vector.roundVector({
          x: intersectionPoint.x + handleVector.x,
          y: intersectionPoint.y + handleVector.y
        })
      },
      contourIndex: contourIndex,
      segmentIndex: incomingSegment.segmentIndex,
      t: t
    };
    
    result.push(virtualPoint);
  }
  
  return result;
}