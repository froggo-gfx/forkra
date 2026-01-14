import { Bezier } from "bezier-js";
import * as vector from "./vector.js";
import { VarPackedPath } from "./var-path.js";

const DEFAULT_WIDTH = 20;

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

    const outlineContour = generateOutlineFromSkeletonContour(skeletonContour);
    if (outlineContour) {
      generatedContours.push(outlineContour);
    }
  }

  return generatedContours;
}

/**
 * Generates a closed outline contour from a single skeleton contour.
 * @param {Object} skeletonContour - Single skeleton contour with points array
 * @returns {Object} Unpacked contour {points: [...], isClosed: true}
 */
export function generateOutlineFromSkeletonContour(skeletonContour) {
  const { points, isClosed, defaultWidth = DEFAULT_WIDTH, capStyle = "round" } =
    skeletonContour;

  if (points.length < 2) {
    return null;
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

  // Combine left and right sides into closed contour
  const outlinePoints = [];

  if (isClosed) {
    // For closed skeleton: left side forward, right side backward
    outlinePoints.push(...leftSide);
    outlinePoints.push(...rightSide.reverse());
  } else {
    // For open skeleton: add caps at ends
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

    // Left side forward
    outlinePoints.push(...leftSide);
    // End cap
    outlinePoints.push(...endCap);
    // Right side backward
    outlinePoints.push(...rightSide.reverse());
    // Start cap
    outlinePoints.push(...startCap);
  }

  return {
    points: outlinePoints,
    isClosed: true,
  };
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
    // Bezier segment - sample and offset
    const bezierPoints = [
      segment.startPoint,
      ...segment.controlPoints,
      segment.endPoint,
    ];

    // Convert to bezier-js format
    const bezier = createBezierFromPoints(bezierPoints);

    // Sample curve at regular intervals
    const numSamples = Math.max(8, segment.controlPoints.length * 4);

    // Determine start/end indices to avoid duplicate samples
    // - For open skeletons: first segment starts at 0, all end at numSamples
    // - For closed skeletons: all start at 0, don't include final sample (next segment's start)
    const startSample = isClosed || isFirst ? 0 : 1; // Skip first sample if prev segment added it
    const endSample = isClosed ? numSamples - 1 : numSamples; // Skip last for closed (next will add it)

    for (let i = startSample; i <= endSample; i++) {
      const t = i / numSamples;
      const point = bezier.get(t);
      const derivative = bezier.derivative(t);

      const tangent = vector.normalizeVector({ x: derivative.x, y: derivative.y });
      const normal = vector.rotateVector90CW(tangent);

      // Determine if this is an on-curve or off-curve point
      const isStartEndpoint = i === 0;
      const isEndEndpoint = i === numSamples;
      const isEndpoint = isStartEndpoint || isEndEndpoint;
      const pointType = isEndpoint ? null : "cubic";

      // Copy smooth from corresponding skeleton point for on-curve points
      const smooth = isStartEndpoint
        ? segment.startPoint.smooth
        : isEndEndpoint
          ? segment.endPoint.smooth
          : undefined;

      left.push({
        x: point.x + normal.x * halfWidth,
        y: point.y + normal.y * halfWidth,
        type: pointType,
        smooth,
      });
      right.push({
        x: point.x - normal.x * halfWidth,
        y: point.y - normal.y * halfWidth,
        type: pointType,
        smooth,
      });
    }
  }

  return { left, right };
}

/**
 * Calculate the normal at a corner between two segments.
 * Uses miter join logic.
 */
function calculateCornerNormal(segment1, segment2, halfWidth) {
  const dir1 = vector.normalizeVector(
    vector.subVectors(segment1.endPoint, segment1.startPoint)
  );
  const dir2 = vector.normalizeVector(
    vector.subVectors(segment2.endPoint, segment2.startPoint)
  );

  const normal1 = vector.rotateVector90CW(dir1);
  const normal2 = vector.rotateVector90CW(dir2);

  // Average of the two normals
  const avgNormal = vector.normalizeVector(
    vector.addVectors(normal1, normal2)
  );

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
