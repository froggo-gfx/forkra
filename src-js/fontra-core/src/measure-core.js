import { intersect } from "./vector.js";

const EPSILON = 1e-10;

export function distance(pointA, pointB) {
  const dx = pointB.x - pointA.x;
  const dy = pointB.y - pointA.y;
  return Math.hypot(dx, dy);
}

export function angleDeg(pointA, pointB) {
  // Keep existing measure semantics: angle is acute (0..90) relative to the lower point.
  const bottomPoint = pointA.y <= pointB.y ? pointA : pointB;
  const topPoint = pointA.y <= pointB.y ? pointB : pointA;

  const dx = topPoint.x - bottomPoint.x;
  const dy = topPoint.y - bottomPoint.y;

  let degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
  degrees = Math.abs(degrees);
  if (degrees > 90) {
    degrees = 180 - degrees;
  }
  return degrees;
}

export function manhattan(pointA, pointB) {
  return Math.abs(pointB.x - pointA.x) + Math.abs(pointB.y - pointA.y);
}

export function offCurveAngleDeg(offCurvePoint, onCurvePoint) {
  let degrees =
    (Math.atan2(offCurvePoint.y - onCurvePoint.y, offCurvePoint.x - onCurvePoint.x) * 180) /
    Math.PI;
  degrees = Math.abs(degrees);
  if (degrees > 90) {
    degrees = 180 - degrees;
  }
  return degrees;
}

export function handleTensionFromControlPoints(
  offCurvePointA,
  onCurvePointA,
  offCurvePointB,
  onCurvePointB
) {
  const a = distance(onCurvePointA, offCurvePointA);
  const c = distance(onCurvePointB, offCurvePointB);
  if (a < EPSILON || c < EPSILON) {
    return 0;
  }

  const truePoint = intersect(onCurvePointA, offCurvePointA, onCurvePointB, offCurvePointB);
  if (!truePoint) {
    return 0;
  }

  const b = distance(onCurvePointA, truePoint);
  const d = distance(onCurvePointB, truePoint);

  const numerator = 2 * a * c;
  const denominator = a * d + b * c;
  if (Math.abs(denominator) < EPSILON) {
    return 0;
  }

  return numerator / denominator;
}

export function handleTension(segmentPoints, truePoint = null) {
  if (!Array.isArray(segmentPoints) || segmentPoints.length !== 4) {
    throw new Error("Segment must be an array of exactly 4 points");
  }

  const [startPoint, controlPoint1, controlPoint2, endPoint] = segmentPoints;
  const resolvedTruePoint =
    truePoint || intersect(startPoint, controlPoint1, endPoint, controlPoint2);

  const startToControl = distance(startPoint, controlPoint1);
  const endToControl = distance(endPoint, controlPoint2);
  if (!resolvedTruePoint) {
    return { startTension: 0, endTension: 0, truePoint: null };
  }

  const startToTrue = distance(startPoint, resolvedTruePoint);
  const endToTrue = distance(endPoint, resolvedTruePoint);

  const startTension = startToTrue > EPSILON ? startToControl / startToTrue : 0;
  const endTension = endToTrue > EPSILON ? endToControl / endToTrue : 0;

  return { startTension, endTension, truePoint: resolvedTruePoint };
}
