import { addVectors, intersect, normalizeVector, subVectors } from "./vector.js";

function assertCubicSegmentPoints(segmentPoints) {
  if (!Array.isArray(segmentPoints) || segmentPoints.length !== 4) {
    throw new Error("Segment must be an array of exactly 4 points");
  }
}

export function midpoint(pointA, pointB) {
  return {
    x: (pointA.x + pointB.x) / 2,
    y: (pointA.y + pointB.y) / 2,
  };
}

export function trueIntersection(lineAStart, lineAEnd, lineBStart, lineBEnd) {
  return intersect(lineAStart, lineAEnd, lineBStart, lineBEnd);
}

export function calculateRegularTunniPoint(segmentPoints) {
  assertCubicSegmentPoints(segmentPoints);
  const [, controlPoint1, controlPoint2] = segmentPoints;
  return midpoint(controlPoint1, controlPoint2);
}

export function calculateRegularTrueTunniPoint(segmentPoints) {
  assertCubicSegmentPoints(segmentPoints);

  const [startPoint, controlPoint1, controlPoint2, endPoint] = segmentPoints;
  const startDirection = normalizeVector(subVectors(controlPoint1, startPoint));
  const endDirection = normalizeVector(subVectors(controlPoint2, endPoint));

  return trueIntersection(
    startPoint,
    addVectors(startPoint, startDirection),
    endPoint,
    addVectors(endPoint, endDirection)
  );
}

export function calculateSkeletonTunniPoint(segment) {
  if (!segment?.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const [controlPoint1, controlPoint2] = segment.controlPoints;
  return midpoint(controlPoint1, controlPoint2);
}

export function calculateSkeletonTrueTunniPoint(segment) {
  if (!segment?.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const { startPoint, endPoint, controlPoints } = segment;
  const [controlPoint1, controlPoint2] = controlPoints;
  return trueIntersection(startPoint, controlPoint1, endPoint, controlPoint2);
}
