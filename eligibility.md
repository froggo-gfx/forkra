export function checkFourPointConfiguration(path, pointIndices) {
  // Check if four selected points meet the specified geometric configuration:
  // 1. The four points must be consecutive on-curve points along a single contour
  // 2. The first and last points (A and D) must each have exactly one off-curve handle
  // 3. The segments connecting A-B, B-C, and C-D must be straight lines (no off-curve points)
  // 4. Handle both open and closed contours correctly

  // Must have exactly four points
  if (pointIndices.length !== 4) {
    return false;
  }

  // Sort point indices to ensure they are in order
  const sortedIndices = [...pointIndices].sort((a, b) => a - b);

  // Check if all points belong to the same contour
  const selectionByContour = getSelectionByContour(path, sortedIndices);
  if (selectionByContour.size !== 1) {
    return false; // Points must be on a single contour
  }

  const contourIndex = [...selectionByContour.keys()][0];
  const contourPointIndices = selectionByContour.get(contourIndex).sort((a, b) => a - b);
  
  // Check if points are consecutive on the contour
  const isClosed = path.contourInfo[contourIndex].isClosed;
  const numPointsInContour = path.getNumPointsOfContour(contourIndex);
  
  // For a valid configuration, the four points must be consecutive
  // In a closed contour, we also allow wrapping (last points followed by first points)
  let areConsecutive = true;
  
  // Check consecutive differences
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
    return false;
  }

  // Map global indices to contour indices for easier access
  const contourPoints = contourPointIndices.map(i => path.getPoint(path.getAbsolutePointIndex(contourIndex, i)));
  
  // Check that all four points are on-curve points (no type attribute)
  if (contourPoints.some(point => point.type)) {
    return false;
  }

  // Reorder points to A, B, C, D based on their order in the contour
  let [pointA, pointB, pointC, pointD] = contourPoints;
  const [indexA, indexB, indexC, indexD] = contourPointIndices;

  // Check if A and D each have exactly one off-curve handle
  // For this, we need to look at the points adjacent to A and D in the contour
  
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
    return false;
  }

  // Check that segments A-B, B-C, and C-D are straight lines (no off-curve points between them)
  // This means there should be no points between consecutive points, which is guaranteed
  // by the consecutive check above, since we verified that the indices are consecutive
  
  // For segments to be straight lines, there must be no off-curve points between the on-curve points
  // Since we've verified the points are consecutive, there are no points between them by definition
  // Therefore, the segments A-B, B-C, and C-D are automatically straight lines

  // If we've passed all checks, the configuration is valid
  return true;
}