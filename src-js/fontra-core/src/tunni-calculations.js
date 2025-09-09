import { intersect, distance } from "./vector.js";

export function calculateTunniPoint(segmentPoints) {
  // segmentPoints should be an array of 4 points: [start, control1, control2, end]
  if (segmentPoints.length !== 4) {
    throw new Error("Segment must have exactly 4 points");
  }
  
  const [p1, p2, p3, p4] = segmentPoints;
  
  // Calculate intersection of lines (p1,p2) and (p3,p4)
  const intersection = intersect(p1, p2, p3, p4);
  
  if (!intersection) {
    return null; // Lines are parallel
  }
  
  return {
    x: intersection.x,
    y: intersection.y
  };
}

export function calculateControlPointsFromTunni(tunniPoint, segmentPoints) {
  const [p1, p2, p3, p4] = segmentPoints;
  
  // Calculate distances
  const sDistance = distance(p1, tunniPoint);
  const eDistance = distance(p4, tunniPoint);
  
  // Calculate percentages if distances are valid
  let xPercent, yPercent;
  if (sDistance > 0) {
    xPercent = distance(p1, p2) / sDistance;
  } else {
    xPercent = 0;
  }
  
  if (eDistance > 0) {
    yPercent = distance(p3, p4) / eDistance;
  } else {
    yPercent = 0;
  }
  
  // Calculate new control points
  const newP2 = {
    x: p1.x + xPercent * (tunniPoint.x - p1.x),
    y: p1.y + xPercent * (tunniPoint.y - p1.y)
  };
  
  const newP3 = {
    x: p4.x + yPercent * (tunniPoint.x - p4.x),
    y: p4.y + yPercent * (tunniPoint.y - p4.y)
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