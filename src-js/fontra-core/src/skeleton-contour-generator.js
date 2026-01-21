import { Bezier } from "bezier-js";
import * as vector from "./vector.js";
import { VarPackedPath } from "./var-path.js";

const DEFAULT_WIDTH = 20;

/**
 * Chord-length parametrization for curve fitting.
 * @param {Array} points - Array of {x, y} points
 * @returns {Array} - Array of t values [0, ..., 1]
 */
function chordLengthParametrize(points) {
  const n = points.length;
  const t = new Array(n);
  t[0] = 0;

  if (n < 2) return t;

  let totalLength = 0;
  for (let i = 1; i < n; i++) {
    totalLength += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }

  if (totalLength < 0.0001) {
    // Degenerate case - all points are the same
    for (let i = 1; i < n; i++) {
      t[i] = i / (n - 1);
    }
    return t;
  }

  let cumLength = 0;
  for (let i = 1; i < n; i++) {
    cumLength += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    t[i] = cumLength / totalLength;
  }

  return t;
}

/**
 * Fit a cubic bezier to a set of points using curvature-based sizing.
 * @param {Array} points - Array of {x, y} points (at least 2)
 * @param {Object} fixedP0 - Optional fixed start point (if null, uses points[0])
 * @param {Object} fixedP3 - Optional fixed end point (if null, uses points[n-1])
 * @param {Object} tangentStart - Optional tangent direction at start (normalized)
 * @param {Object} tangentEnd - Optional tangent direction at end (normalized)
 * @param {number} curvatureStart - Curvature at start point
 * @param {number} curvatureEnd - Curvature at end point
 * @returns {Object} - {p0, p1, p2, p3} control points, or null if fitting failed
 */
function fitCubicBezier(
  points,
  fixedP0 = null,
  fixedP3 = null,
  tangentStart = null,
  tangentEnd = null,
  curvatureStart = 0,
  curvatureEnd = 0
) {
  if (!points || points.length < 2) return null;

  const n = points.length;
  // Use fixed endpoints if provided, otherwise use sampled endpoints
  const p0 = fixedP0 || points[0];
  const p3 = fixedP3 || points[n - 1];

  if (n === 2) {
    // Two points - create a line as cubic bezier
    return {
      p0,
      p1: { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 },
      p2: { x: p0.x + (2 * (p3.x - p0.x)) / 3, y: p0.y + (2 * (p3.y - p0.y)) / 3 },
      p3,
    };
  }

  // Use provided tangents or estimate from sampled points
  const t1 = tangentStart || vector.normalizeVector(vector.subVectors(points[1], points[0]));
  const t2 = tangentEnd || vector.normalizeVector(vector.subVectors(points[n - 1], points[n - 2]));

  // Calculate the arc length of the sampled curve
  let arcLength = 0;
  for (let i = 1; i < n; i++) {
    arcLength += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }

  // Calculate control point lengths based on curvature
  // Higher curvature = longer control point to achieve the bend
  const baseAlpha = arcLength / 3;

  // Validate curvature values (can be NaN/undefined for degenerate cases)
  const validCurvatureStart = Number.isFinite(curvatureStart) ? curvatureStart : 0;
  const validCurvatureEnd = Number.isFinite(curvatureEnd) ? curvatureEnd : 0;

  // Scale based on curvature: higher curvature needs longer handles
  // curvature has units 1/length, so curvature * arcLength is dimensionless
  const curvatureFactor = 0.5; // Tuning parameter
  const alpha1 = baseAlpha * (1 + Math.abs(validCurvatureStart) * arcLength * curvatureFactor);
  const alpha2 = baseAlpha * (1 + Math.abs(validCurvatureEnd) * arcLength * curvatureFactor);

  console.log('[fitCubicBezier] arcLength:', arcLength, 'curvatures:', validCurvatureStart, validCurvatureEnd);
  console.log('[fitCubicBezier] alpha1:', alpha1, 'alpha2:', alpha2);

  const p1 = {
    x: p0.x + alpha1 * t1.x,
    y: p0.y + alpha1 * t1.y,
  };
  const p2 = {
    x: p3.x - alpha2 * t2.x,
    y: p3.y - alpha2 * t2.y,
  };

  return { p0, p1, p2, p3 };
}

/**
 * Enforce colinearity for smooth points in a contour.
 * For each on-curve smooth point with two adjacent off-curve handles,
 * adjusts the handles to be colinear while preserving their lengths.
 * @param {Array} points - Array of contour points
 * @param {boolean} isClosed - Whether the contour is closed
 * @returns {Array} - Modified points array
 */
function enforceSmoothColinearity(points, isClosed) {
  if (!points || points.length < 3) return points;

  const numPoints = points.length;

  for (let i = 0; i < numPoints; i++) {
    const point = points[i];

    // Only process on-curve smooth points
    if (point.type || !point.smooth) continue;

    // Find adjacent off-curve handles
    const prevIdx = (i - 1 + numPoints) % numPoints;
    const nextIdx = (i + 1) % numPoints;

    // For open contours, skip endpoints
    if (!isClosed && (i === 0 || i === numPoints - 1)) continue;

    const prevPoint = points[prevIdx];
    const nextPoint = points[nextIdx];

    // Both neighbors must be off-curve for this to apply
    if (!prevPoint?.type || !nextPoint?.type) continue;

    // Calculate vectors from center to handles
    const vecIn = { x: prevPoint.x - point.x, y: prevPoint.y - point.y };
    const vecOut = { x: nextPoint.x - point.x, y: nextPoint.y - point.y };

    const lenIn = Math.hypot(vecIn.x, vecIn.y);
    const lenOut = Math.hypot(vecOut.x, vecOut.y);

    // Skip if handles are too short
    if (lenIn < 0.001 || lenOut < 0.001) continue;

    // Normalize directions
    const dirIn = { x: vecIn.x / lenIn, y: vecIn.y / lenIn };
    const dirOut = { x: vecOut.x / lenOut, y: vecOut.y / lenOut };

    // Calculate average tangent direction
    // We want the handles to be opposite, so we average dirIn and -dirOut
    const avgDir = vector.normalizeVector({
      x: dirIn.x - dirOut.x,
      y: dirIn.y - dirOut.y,
    });

    // If directions are nearly opposite (already colinear), skip
    const dot = dirIn.x * dirOut.x + dirIn.y * dirOut.y;
    if (dot < -0.999) continue;

    // If avgDir is zero (handles point same direction), use perpendicular
    if (Math.hypot(avgDir.x, avgDir.y) < 0.001) continue;

    // Adjust handle positions to be colinear through the on-curve point
    points[prevIdx] = {
      ...prevPoint,
      x: point.x + avgDir.x * lenIn,
      y: point.y + avgDir.y * lenIn,
    };

    points[nextIdx] = {
      ...nextPoint,
      x: point.x - avgDir.x * lenOut,
      y: point.y - avgDir.y * lenOut,
    };
  }

  return points;
}

/**
 * Generates outline contours from skeleton data.
 * @param {Object} skeletonData - The skeleton data from customData["fontra.skeleton"]
 * @returns {Array} Array of unpacked contours ready to add to path
 */
export function generateContoursFromSkeleton(skeletonData) {
  if (!skeletonData?.contours?.length) {
    return [];
  }

  const generatedContours = [];

  for (const skeletonContour of skeletonData.contours) {
    if (skeletonContour.points.length < 2) {
      continue;
    }

    const outlineContours = generateOutlineFromSkeletonContour(skeletonContour);
    // generateOutlineFromSkeletonContour now returns an array of contours
    // (1 for open skeleton, 2 for closed skeleton)
    if (outlineContours?.length) {
      generatedContours.push(...outlineContours);
    }
  }

  return generatedContours;
}

/**
 * Generates closed outline contour(s) from a single skeleton contour.
 * @param {Object} skeletonContour - Single skeleton contour with points array
 * @returns {Array} Array of unpacked contours [{points: [...], isClosed: true}, ...]
 *   - For open skeleton: returns 1 contour (stroke with caps)
 *   - For closed skeleton: returns 2 contours (outer and inner)
 */
export function generateOutlineFromSkeletonContour(skeletonContour) {
  const { points, isClosed, defaultWidth = DEFAULT_WIDTH, capStyle = "round" } =
    skeletonContour;

  if (points.length < 2) {
    return [];
  }

  // Separate on-curve and off-curve points, build segments
  const segments = buildSegmentsFromPoints(points, isClosed);

  // Generate left and right offset points
  const leftSide = [];
  const rightSide = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    // For open skeletons, don't wrap around - first/last segments have no prev/next
    const prevSegment =
      isClosed || i > 0 ? segments[(i - 1 + segments.length) % segments.length] : null;
    const nextSegment =
      isClosed || i < segments.length - 1 ? segments[(i + 1) % segments.length] : null;

    const isFirstSegment = i === 0;
    const isLastSegment = i === segments.length - 1;

    const offsetPoints = generateOffsetPointsForSegment(
      segment,
      prevSegment,
      nextSegment,
      defaultWidth,
      isFirstSegment,
      isLastSegment,
      isClosed
    );

    leftSide.push(...offsetPoints.left);
    rightSide.push(...offsetPoints.right);
  }

  if (isClosed) {
    // For closed skeleton: TWO separate contours (outer and inner)
    // The inner contour needs to be reversed for correct winding direction
    // (outer = counter-clockwise, inner = clockwise for proper fill)
    const reversedRight = [...rightSide].reverse();
    return [
      { points: enforceSmoothColinearity(leftSide, true), isClosed: true },
      { points: enforceSmoothColinearity(reversedRight, true), isClosed: true },
    ];
  } else {
    // For open skeleton: ONE contour with caps at ends
    const startCap = generateCap(
      points[0],
      segments[0],
      defaultWidth,
      capStyle,
      "start"
    );
    const endCap = generateCap(
      points[points.length - 1],
      segments[segments.length - 1],
      defaultWidth,
      capStyle,
      "end"
    );

    const outlinePoints = [];
    // Left side forward
    outlinePoints.push(...leftSide);
    // End cap
    outlinePoints.push(...endCap);
    // Right side backward
    outlinePoints.push(...rightSide.reverse());
    // Start cap
    outlinePoints.push(...startCap);

    return [{ points: enforceSmoothColinearity(outlinePoints, true), isClosed: true }];
  }
}

/**
 * Build segments from skeleton points.
 * Each segment has startPoint, endPoint, and optional control points.
 */
function buildSegmentsFromPoints(points, isClosed) {
  const segments = [];
  const numPoints = points.length;

  // Find on-curve point indices
  const onCurveIndices = [];
  for (let i = 0; i < numPoints; i++) {
    if (!points[i].type) {
      onCurveIndices.push(i);
    }
  }

  if (onCurveIndices.length < 2) {
    return segments;
  }

  // Build segments between consecutive on-curve points
  for (let i = 0; i < onCurveIndices.length - 1; i++) {
    const startIdx = onCurveIndices[i];
    const endIdx = onCurveIndices[i + 1];

    const segment = {
      startPoint: points[startIdx],
      endPoint: points[endIdx],
      controlPoints: [],
    };

    // Collect off-curve points between start and end
    for (let j = startIdx + 1; j < endIdx; j++) {
      segment.controlPoints.push(points[j]);
    }

    segments.push(segment);
  }

  // For closed contour, add segment from last to first on-curve point
  if (isClosed && onCurveIndices.length >= 2) {
    const lastIdx = onCurveIndices[onCurveIndices.length - 1];
    const firstIdx = onCurveIndices[0];

    const segment = {
      startPoint: points[lastIdx],
      endPoint: points[firstIdx],
      controlPoints: [],
    };

    // Off-curves after last on-curve
    for (let j = lastIdx + 1; j < numPoints; j++) {
      if (points[j].type) {
        segment.controlPoints.push(points[j]);
      }
    }
    // Off-curves before first on-curve
    for (let j = 0; j < firstIdx; j++) {
      if (points[j].type) {
        segment.controlPoints.push(points[j]);
      }
    }

    segments.push(segment);
  }

  return segments;
}

/**
 * Generate offset points for a segment.
 * For open skeletons: first segment adds start, all segments add end
 * For closed skeletons: all segments add start (end connects to next start)
 */
function generateOffsetPointsForSegment(
  segment,
  prevSegment,
  nextSegment,
  width,
  isFirst,
  isLast,
  isClosed
) {
  const halfWidth = width / 2;
  const left = [];
  const right = [];

  if (segment.controlPoints.length === 0) {
    // Line segment - simple offset
    const direction = vector.normalizeVector(
      vector.subVectors(segment.endPoint, segment.startPoint)
    );
    const normal = vector.rotateVector90CW(direction);

    // Add start point offset:
    // - For open skeletons: only for the first segment
    // - For closed skeletons: for all segments (each adds its start)
    const shouldAddStart = isClosed || isFirst;
    if (shouldAddStart) {
      const startNormal =
        !prevSegment || (isFirst && !isClosed)
          ? normal
          : calculateCornerNormal(prevSegment, segment, halfWidth);

      // Copy smooth property from skeleton point
      left.push({
        x: segment.startPoint.x + startNormal.x * halfWidth,
        y: segment.startPoint.y + startNormal.y * halfWidth,
        smooth: segment.startPoint.smooth,
      });
      right.push({
        x: segment.startPoint.x - startNormal.x * halfWidth,
        y: segment.startPoint.y - startNormal.y * halfWidth,
        smooth: segment.startPoint.smooth,
      });
    }

    // Add end point offset:
    // - For open skeletons: for all segments (each adds its end)
    // - For closed skeletons: don't add (next segment's start is this end)
    const shouldAddEnd = !isClosed;
    if (shouldAddEnd) {
      const endNormal =
        !nextSegment || isLast
          ? normal
          : calculateCornerNormal(segment, nextSegment, halfWidth);

      // Copy smooth property from skeleton point
      left.push({
        x: segment.endPoint.x + endNormal.x * halfWidth,
        y: segment.endPoint.y + endNormal.y * halfWidth,
        smooth: segment.endPoint.smooth,
      });
      right.push({
        x: segment.endPoint.x - endNormal.x * halfWidth,
        y: segment.endPoint.y - endNormal.y * halfWidth,
        smooth: segment.endPoint.smooth,
      });
    }
  } else {
    // Bezier segment - sample offset positions and fit cubic bezier
    const bezierPoints = [
      segment.startPoint,
      ...segment.controlPoints,
      segment.endPoint,
    ];

    // Convert to bezier-js format
    const bezier = createBezierFromPoints(bezierPoints);

    // Calculate normals at endpoints
    // Use bezier derivative for the curve's tangent direction
    const startDeriv = bezier.derivative(0);
    const startTangent = vector.normalizeVector({ x: startDeriv.x, y: startDeriv.y });
    const bezierStartNormal = vector.rotateVector90CW(startTangent);

    const endDeriv = bezier.derivative(1);
    const endTangent = vector.normalizeVector({ x: endDeriv.x, y: endDeriv.y });
    const bezierEndNormal = vector.rotateVector90CW(endTangent);

    // Get curvature at endpoints for proper control point sizing
    // bezier.curvature() returns {k, r, dk, adk} where k is the curvature value
    const curvatureObjStart = bezier.curvature(0);
    const curvatureObjEnd = bezier.curvature(1);
    const curvatureStart = Number.isFinite(curvatureObjStart?.k) ? curvatureObjStart.k : 0;
    const curvatureEnd = Number.isFinite(curvatureObjEnd?.k) ? curvatureObjEnd.k : 0;
    console.log('[curvature] start:', curvatureStart, 'end:', curvatureEnd);

    // For corners (non-smooth junctions), use averaged normal from calculateCornerNormal
    // This ensures continuity between consecutive segments
    const startNormal =
      !prevSegment || (isFirst && !isClosed)
        ? bezierStartNormal
        : calculateCornerNormal(prevSegment, segment, halfWidth);

    const endNormal =
      !nextSegment || (isLast && !isClosed)
        ? bezierEndNormal
        : calculateCornerNormal(segment, nextSegment, halfWidth);

    // Fixed endpoint positions (using corner-aware normals)
    const fixedStartLeft = {
      x: segment.startPoint.x + startNormal.x * halfWidth,
      y: segment.startPoint.y + startNormal.y * halfWidth,
    };
    const fixedStartRight = {
      x: segment.startPoint.x - startNormal.x * halfWidth,
      y: segment.startPoint.y - startNormal.y * halfWidth,
    };
    const fixedEndLeft = {
      x: segment.endPoint.x + endNormal.x * halfWidth,
      y: segment.endPoint.y + endNormal.y * halfWidth,
    };
    const fixedEndRight = {
      x: segment.endPoint.x - endNormal.x * halfWidth,
      y: segment.endPoint.y - endNormal.y * halfWidth,
    };

    // Sample offset curve at regular intervals (for fitting)
    const numSamples = Math.max(16, segment.controlPoints.length * 8);
    const sampledLeft = [];
    const sampledRight = [];

    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;

      // Use fixed positions for endpoints to ensure consistency with fitting
      if (i === 0) {
        sampledLeft.push({ x: fixedStartLeft.x, y: fixedStartLeft.y });
        sampledRight.push({ x: fixedStartRight.x, y: fixedStartRight.y });
        continue;
      }
      if (i === numSamples) {
        sampledLeft.push({ x: fixedEndLeft.x, y: fixedEndLeft.y });
        sampledRight.push({ x: fixedEndRight.x, y: fixedEndRight.y });
        continue;
      }

      const point = bezier.get(t);
      const derivative = bezier.derivative(t);

      const tangent = vector.normalizeVector({ x: derivative.x, y: derivative.y });
      const normal = vector.rotateVector90CW(tangent);

      sampledLeft.push({
        x: point.x + normal.x * halfWidth,
        y: point.y + normal.y * halfWidth,
      });
      sampledRight.push({
        x: point.x - normal.x * halfWidth,
        y: point.y - normal.y * halfWidth,
      });
    }

    // Fit cubic bezier to sampled points WITH FIXED ENDPOINTS, EXACT TANGENTS, AND CURVATURE
    const fittedLeft = fitCubicBezier(
      sampledLeft,
      fixedStartLeft,
      fixedEndLeft,
      startTangent,
      endTangent,
      curvatureStart,
      curvatureEnd
    );
    const fittedRight = fitCubicBezier(
      sampledRight,
      fixedStartRight,
      fixedEndRight,
      startTangent,
      endTangent,
      curvatureStart,
      curvatureEnd
    );

    // Determine which points to add based on closed/open and first/last
    const shouldAddStart = isClosed || isFirst;
    const shouldAddEnd = !isClosed;

    if (shouldAddStart && fittedLeft && fittedRight) {
      // Add start on-curve point (using fixed position)
      left.push({
        x: fixedStartLeft.x,
        y: fixedStartLeft.y,
        smooth: segment.startPoint.smooth,
      });
      right.push({
        x: fixedStartRight.x,
        y: fixedStartRight.y,
        smooth: segment.startPoint.smooth,
      });

      // Add first control point (off-curve)
      left.push({
        x: fittedLeft.p1.x,
        y: fittedLeft.p1.y,
        type: "cubic",
      });
      right.push({
        x: fittedRight.p1.x,
        y: fittedRight.p1.y,
        type: "cubic",
      });
    } else if (fittedLeft && fittedRight) {
      // Only add the first control point (previous segment added start)
      left.push({
        x: fittedLeft.p1.x,
        y: fittedLeft.p1.y,
        type: "cubic",
      });
      right.push({
        x: fittedRight.p1.x,
        y: fittedRight.p1.y,
        type: "cubic",
      });
    }

    if (fittedLeft && fittedRight) {
      // Add second control point (off-curve)
      left.push({
        x: fittedLeft.p2.x,
        y: fittedLeft.p2.y,
        type: "cubic",
      });
      right.push({
        x: fittedRight.p2.x,
        y: fittedRight.p2.y,
        type: "cubic",
      });

      if (shouldAddEnd) {
        // Add end on-curve point (using fixed position)
        left.push({
          x: fixedEndLeft.x,
          y: fixedEndLeft.y,
          smooth: segment.endPoint.smooth,
        });
        right.push({
          x: fixedEndRight.x,
          y: fixedEndRight.y,
          smooth: segment.endPoint.smooth,
        });
      }
    }

  }

  return { left, right };
}

/**
 * Calculate the normal at a corner between two segments.
 * Uses miter join logic.
 */
function calculateCornerNormal(segment1, segment2, halfWidth) {
  // Get outgoing tangent from segment1 at its endpoint
  let dir1;
  if (segment1.controlPoints.length === 0) {
    // Line segment - direction is constant
    dir1 = vector.normalizeVector(
      vector.subVectors(segment1.endPoint, segment1.startPoint)
    );
  } else {
    // Bezier segment - use derivative at t=1
    const bezier1 = createBezierFromPoints([
      segment1.startPoint,
      ...segment1.controlPoints,
      segment1.endPoint,
    ]);
    const deriv1 = bezier1.derivative(1);
    dir1 = vector.normalizeVector({ x: deriv1.x, y: deriv1.y });
  }

  // Get incoming tangent from segment2 at its start point
  let dir2;
  if (segment2.controlPoints.length === 0) {
    // Line segment - direction is constant
    dir2 = vector.normalizeVector(
      vector.subVectors(segment2.endPoint, segment2.startPoint)
    );
  } else {
    // Bezier segment - use derivative at t=0
    const bezier2 = createBezierFromPoints([
      segment2.startPoint,
      ...segment2.controlPoints,
      segment2.endPoint,
    ]);
    const deriv2 = bezier2.derivative(0);
    dir2 = vector.normalizeVector({ x: deriv2.x, y: deriv2.y });
  }

  const normal1 = vector.rotateVector90CW(dir1);
  const normal2 = vector.rotateVector90CW(dir2);

  // Average of the two normals
  const avgNormal = vector.normalizeVector(vector.addVectors(normal1, normal2));

  // Check for sharp corners (miter limit)
  const dot = vector.dotVector(normal1, normal2);
  if (dot < 0.2) {
    // Very sharp corner, use bevel (just return first normal)
    return normal1;
  }

  return avgNormal;
}

/**
 * Create a Bezier object from skeleton points.
 */
function createBezierFromPoints(points) {
  if (points.length === 2) {
    // Line - create as linear bezier
    return new Bezier(
      points[0].x,
      points[0].y,
      points[1].x,
      points[1].y
    );
  } else if (points.length === 3) {
    // Quadratic bezier
    return new Bezier(
      points[0].x,
      points[0].y,
      points[1].x,
      points[1].y,
      points[2].x,
      points[2].y
    );
  } else if (points.length === 4) {
    // Cubic bezier
    return new Bezier(
      points[0].x,
      points[0].y,
      points[1].x,
      points[1].y,
      points[2].x,
      points[2].y,
      points[3].x,
      points[3].y
    );
  } else {
    // Multiple control points - approximate with cubic
    // Use first and last as anchors, intermediate as averaged controls
    const p0 = points[0];
    const p3 = points[points.length - 1];
    const p1 = points[1];
    const p2 = points[points.length - 2];
    return new Bezier(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
  }
}

/**
 * Generate cap points for open skeleton endpoints.
 */
function generateCap(point, segment, width, capStyle, position) {
  const halfWidth = width / 2;
  const capPoints = [];

  // Determine direction at this endpoint
  let direction;
  if (position === "start") {
    direction = vector.normalizeVector(
      vector.subVectors(segment.endPoint, segment.startPoint)
    );
  } else {
    direction = vector.normalizeVector(
      vector.subVectors(segment.endPoint, segment.startPoint)
    );
  }

  const normal = vector.rotateVector90CW(direction);

  if (capStyle === "round") {
    // Semicircular cap using cubic bezier approximation
    const numArcPoints = 4;
    const kappa = 0.5522847498; // Bezier circle approximation constant

    if (position === "end") {
      // Arc from right side to left side (going "forward")
      const rightPoint = {
        x: point.x - normal.x * halfWidth,
        y: point.y - normal.y * halfWidth,
      };
      const leftPoint = {
        x: point.x + normal.x * halfWidth,
        y: point.y + normal.y * halfWidth,
      };
      const tipPoint = {
        x: point.x + direction.x * halfWidth,
        y: point.y + direction.y * halfWidth,
      };

      // Control points for quarter arcs
      capPoints.push({
        x: rightPoint.x + direction.x * halfWidth * kappa,
        y: rightPoint.y + direction.y * halfWidth * kappa,
        type: "cubic",
      });
      capPoints.push({
        x: tipPoint.x - normal.x * halfWidth * kappa,
        y: tipPoint.y - normal.y * halfWidth * kappa,
        type: "cubic",
      });
      capPoints.push(tipPoint);
      capPoints.push({
        x: tipPoint.x + normal.x * halfWidth * kappa,
        y: tipPoint.y + normal.y * halfWidth * kappa,
        type: "cubic",
      });
      capPoints.push({
        x: leftPoint.x + direction.x * halfWidth * kappa,
        y: leftPoint.y + direction.y * halfWidth * kappa,
        type: "cubic",
      });
    } else {
      // Start cap - arc from left to right (going "backward")
      const rightPoint = {
        x: point.x - normal.x * halfWidth,
        y: point.y - normal.y * halfWidth,
      };
      const leftPoint = {
        x: point.x + normal.x * halfWidth,
        y: point.y + normal.y * halfWidth,
      };
      const tipPoint = {
        x: point.x - direction.x * halfWidth,
        y: point.y - direction.y * halfWidth,
      };

      capPoints.push({
        x: leftPoint.x - direction.x * halfWidth * kappa,
        y: leftPoint.y - direction.y * halfWidth * kappa,
        type: "cubic",
      });
      capPoints.push({
        x: tipPoint.x + normal.x * halfWidth * kappa,
        y: tipPoint.y + normal.y * halfWidth * kappa,
        type: "cubic",
      });
      capPoints.push(tipPoint);
      capPoints.push({
        x: tipPoint.x - normal.x * halfWidth * kappa,
        y: tipPoint.y - normal.y * halfWidth * kappa,
        type: "cubic",
      });
      capPoints.push({
        x: rightPoint.x - direction.x * halfWidth * kappa,
        y: rightPoint.y - direction.y * halfWidth * kappa,
        type: "cubic",
      });
    }
  } else if (capStyle === "square") {
    // Square cap - extend by halfWidth
    if (position === "end") {
      capPoints.push({
        x: point.x - normal.x * halfWidth + direction.x * halfWidth,
        y: point.y - normal.y * halfWidth + direction.y * halfWidth,
      });
      capPoints.push({
        x: point.x + normal.x * halfWidth + direction.x * halfWidth,
        y: point.y + normal.y * halfWidth + direction.y * halfWidth,
      });
    } else {
      capPoints.push({
        x: point.x + normal.x * halfWidth - direction.x * halfWidth,
        y: point.y + normal.y * halfWidth - direction.y * halfWidth,
      });
      capPoints.push({
        x: point.x - normal.x * halfWidth - direction.x * halfWidth,
        y: point.y - normal.y * halfWidth - direction.y * halfWidth,
      });
    }
  }
  // "butt" style needs no extra points

  return capPoints;
}

/**
 * Calculate the normal vector at a specific point index in a skeleton contour.
 * Useful for visualization of ribs.
 */
export function calculateNormalAtSkeletonPoint(skeletonContour, pointIndex) {
  const { points, isClosed } = skeletonContour;
  const numPoints = points.length;

  if (numPoints < 2) {
    return { x: 0, y: 1 };
  }

  const point = points[pointIndex];

  // Skip off-curve points
  if (point.type) {
    return { x: 0, y: 1 };
  }

  // Find neighboring on-curve points
  let prevOnCurve = null;
  let nextOnCurve = null;

  // Look backward for previous on-curve
  for (let i = 1; i < numPoints; i++) {
    const idx = (pointIndex - i + numPoints) % numPoints;
    if (!points[idx].type) {
      prevOnCurve = points[idx];
      break;
    }
    if (!isClosed && idx === 0) break;
  }

  // Look forward for next on-curve
  for (let i = 1; i < numPoints; i++) {
    const idx = (pointIndex + i) % numPoints;
    if (!points[idx].type) {
      nextOnCurve = points[idx];
      break;
    }
    if (!isClosed && idx === numPoints - 1) break;
  }

  // Calculate tangent direction
  let tangent;
  if (prevOnCurve && nextOnCurve) {
    tangent = vector.normalizeVector(vector.subVectors(nextOnCurve, prevOnCurve));
  } else if (nextOnCurve) {
    tangent = vector.normalizeVector(vector.subVectors(nextOnCurve, point));
  } else if (prevOnCurve) {
    tangent = vector.normalizeVector(vector.subVectors(point, prevOnCurve));
  } else {
    tangent = { x: 1, y: 0 };
  }

  // Normal is perpendicular to tangent
  return vector.rotateVector90CW(tangent);
}

/**
 * Convert generated outline contour to VarPackedPath format.
 */
export function outlineContourToPackedPath(outlineContour) {
  const path = new VarPackedPath();
  path.appendUnpackedContour(outlineContour);
  return path;
}

/**
 * Get skeleton data from layer customData.
 */
export function getSkeletonData(layerOrCustomData) {
  const customData = layerOrCustomData?.customData ?? layerOrCustomData;
  return customData?.["fontra.skeleton"] ?? null;
}

/**
 * Create empty skeleton data structure.
 */
export function createEmptySkeletonData() {
  return {
    version: 1,
    contours: [],
    generatedContourIndices: [],
  };
}

/**
 * Create a new skeleton contour.
 */
export function createSkeletonContour(isClosed = false) {
  return {
    isClosed,
    points: [],
    defaultWidth: DEFAULT_WIDTH,
    capStyle: "round",
  };
}

/**
 * Generate sampled offset points for visualization/debugging.
 * Returns arrays of points along the left and right offset curves.
 * @param {Object} skeletonContour - Skeleton contour data
 * @returns {Object} - { left: [{x, y}, ...], right: [{x, y}, ...] }
 */
export function generateSampledOffsetPoints(skeletonContour) {
  const { points, isClosed, defaultWidth = DEFAULT_WIDTH } = skeletonContour;

  if (points.length < 2) {
    return { left: [], right: [] };
  }

  const halfWidth = defaultWidth / 2;
  const segments = buildSegmentsFromPoints(points, isClosed);
  const sampledLeft = [];
  const sampledRight = [];

  for (const segment of segments) {
    if (segment.controlPoints.length === 0) {
      // Line segment - just add endpoints
      const direction = vector.normalizeVector(
        vector.subVectors(segment.endPoint, segment.startPoint)
      );
      const normal = vector.rotateVector90CW(direction);

      sampledLeft.push({
        x: segment.startPoint.x + normal.x * halfWidth,
        y: segment.startPoint.y + normal.y * halfWidth,
      });
      sampledRight.push({
        x: segment.startPoint.x - normal.x * halfWidth,
        y: segment.startPoint.y - normal.y * halfWidth,
      });

      if (!isClosed) {
        sampledLeft.push({
          x: segment.endPoint.x + normal.x * halfWidth,
          y: segment.endPoint.y + normal.y * halfWidth,
        });
        sampledRight.push({
          x: segment.endPoint.x - normal.x * halfWidth,
          y: segment.endPoint.y - normal.y * halfWidth,
        });
      }
    } else {
      // Bezier segment - sample at intervals
      const bezierPoints = [
        segment.startPoint,
        ...segment.controlPoints,
        segment.endPoint,
      ];
      const bezier = createBezierFromPoints(bezierPoints);
      const numSamples = Math.max(16, segment.controlPoints.length * 8);

      for (let i = 0; i <= numSamples; i++) {
        // Skip last point for closed contours (next segment will add it)
        if (isClosed && i === numSamples) continue;

        const t = i / numSamples;
        const point = bezier.get(t);
        const derivative = bezier.derivative(t);
        const tangent = vector.normalizeVector({ x: derivative.x, y: derivative.y });
        const normal = vector.rotateVector90CW(tangent);

        sampledLeft.push({
          x: point.x + normal.x * halfWidth,
          y: point.y + normal.y * halfWidth,
        });
        sampledRight.push({
          x: point.x - normal.x * halfWidth,
          y: point.y - normal.y * halfWidth,
        });
      }
    }
  }

  return { left: sampledLeft, right: sampledRight };
}
