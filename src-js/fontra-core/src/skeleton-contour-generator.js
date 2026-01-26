import { Bezier } from "bezier-js";
import * as vector from "./vector.js";
import { VarPackedPath } from "./var-path.js";
import { fitCubic, chordLengthParameterize, computeMaxError } from "./fit-cubic.js";

const DEFAULT_WIDTH = 80;

/**
 * Get the width for a point, with support for asymmetric left/right widths.
 * @param {Object} point - The skeleton point
 * @param {number} defaultWidth - Fallback width if point has no width
 * @param {string|null} side - "left", "right", or null for symmetric width
 * @returns {number} The width for this point (full width, not half)
 */
export function getPointWidth(point, defaultWidth, side = null) {
  if (side === "left" && point.leftWidth !== undefined) {
    return point.leftWidth * 2; // leftWidth stores half-width, return full width
  }
  if (side === "right" && point.rightWidth !== undefined) {
    return point.rightWidth * 2; // rightWidth stores half-width, return full width
  }
  if (point.width !== undefined) {
    return point.width;
  }
  return defaultWidth;
}

/**
 * Get the half-width for a specific side of a point.
 * @param {Object} point - The skeleton point
 * @param {number} defaultWidth - Fallback width if point has no width
 * @param {string} side - "left" or "right"
 * @returns {number} The half-width for this side
 */
export function getPointHalfWidth(point, defaultWidth, side) {
  if (side === "left" && point.leftWidth !== undefined) {
    return point.leftWidth;
  }
  if (side === "right" && point.rightWidth !== undefined) {
    return point.rightWidth;
  }
  if (point.width !== undefined) {
    return point.width / 2;
  }
  return defaultWidth / 2;
}

// Constants for offset curve simplification
const SIMPLIFY_OFFSET_CURVES = true;
const SAMPLES_PER_CURVE = 5;

// Adaptive error threshold (% of halfWidth)
const MIN_ERROR_PERCENT = 0.02; // 2% — initial strict threshold
const MAX_ERROR_PERCENT = 0.15; // 15% — maximum allowed
const ERROR_STEP_PERCENT = 0.02; // 2% — step increase

/**
 * Enforce colinearity for smooth points in a contour.
 * For each on-curve smooth point with two adjacent off-curve handles,
 * adjusts the handles to be colinear while preserving their lengths.
 * Also handles smooth points with linear segments (on-curve neighbors),
 * maintaining the pivot behavior where the smooth point acts as a pivot
 * for the linear segment's direction.
 * @param {Array} points - Array of contour points
 * @param {boolean} isClosed - Whether the contour is closed
 * @returns {Array} - Modified points array
 */
function enforceSmoothColinearity(points, isClosed) {
  if (!points || points.length < 2) return points;

  const numPoints = points.length;

  // Process all smooth points
  for (let i = 0; i < numPoints; i++) {
    const point = points[i];

    // Only process on-curve smooth points
    if (point.type || !point.smooth) continue;

    // Find adjacent points (could be on-curve or off-curve)
    const prevIdx = (i - 1 + numPoints) % numPoints;
    const nextIdx = (i + 1) % numPoints;

    // For open contours, handle endpoints specially
    if (!isClosed && (i === 0 || i === numPoints - 1)) {
      continue; // Skip endpoint smooth points for now, as they don't have two neighbors
    }

    const prevPoint = points[prevIdx];
    const nextPoint = points[nextIdx];

    // Determine the type of each neighbor
    const prevIsOnCurve = !prevPoint?.type;
    const nextIsOnCurve = !nextPoint?.type;

    // Case 1: Both neighbors are off-curve (traditional smooth curve behavior)
    if (!prevIsOnCurve && !nextIsOnCurve) {
      // Traditional colinearity enforcement for smooth point between two off-curve handles
      const vecIn = { x: prevPoint.x - point.x, y: prevPoint.y - point.y };
      const vecOut = { x: nextPoint.x - point.x, y: nextPoint.y - point.y };

      const lenIn = Math.hypot(vecIn.x, vecIn.y);
      const lenOut = Math.hypot(vecOut.x, vecOut.y);

      // Skip if handles are too short
      if (lenIn >= 0.001 && lenOut >= 0.001) {
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
        if (dot > -0.999) { // Not nearly opposite
          // If avgDir is zero (handles point same direction), use perpendicular
          if (Math.hypot(avgDir.x, avgDir.y) >= 0.001) {
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
        }
      }
    }
    // Case 2: One neighbor is on-curve (linear segment) and one is off-curve (smooth-linear transition)
    else if (prevIsOnCurve && !nextIsOnCurve) {
      // Smooth point with linear segment before and curve after
      // The smooth point should act as a pivot: the off-curve handle should be collinear
      // with the linear segment, extending its direction
      const linearVec = { x: point.x - prevPoint.x, y: point.y - prevPoint.y }; // Vector from prev linear point to smooth point
      const linearDir = vector.normalizeVector(linearVec);

      const curveVec = { x: nextPoint.x - point.x, y: nextPoint.y - point.y }; // Vector from smooth point to off-curve
      const curveLength = Math.hypot(curveVec.x, curveVec.y);

      if (curveLength >= 0.001) {
        // For smooth-linear transition, the off-curve should continue the linear direction
        // So the direction is the same as the linear segment direction
        const newDirectionX = linearDir.x;
        const newDirectionY = linearDir.y;

        // Calculate new position by extending the linear direction with the original handle length
        const newX = point.x + newDirectionX * curveLength;
        const newY = point.y + newDirectionY * curveLength;

        points[nextIdx] = {
          ...nextPoint,
          x: newX,
          y: newY,
        };
      }
    }
    else if (!prevIsOnCurve && nextIsOnCurve) {
      // Smooth point with curve before and linear segment after
      // The previous off-curve handle should be collinear with the next linear segment
      const linearVec = { x: nextPoint.x - point.x, y: nextPoint.y - point.y }; // Vector from smooth point to next linear point
      const linearDir = vector.normalizeVector(linearVec);

      const curveVec = { x: prevPoint.x - point.x, y: prevPoint.y - point.y }; // Vector from smooth point to prev off-curve
      const curveLength = Math.hypot(curveVec.x, curveVec.y);

      if (curveLength >= 0.001) {
        // For linear-smooth transition, the off-curve should continue the linear direction backwards
        // So the direction is the opposite of the linear segment direction
        const newDirectionX = -linearDir.x;
        const newDirectionY = -linearDir.y;

        // Calculate new position by extending in the opposite linear direction with the original handle length
        const newX = point.x + newDirectionX * curveLength;
        const newY = point.y + newDirectionY * curveLength;

        points[prevIdx] = {
          ...prevPoint,
          x: newX,
          y: newY,
        };
      }
    }
    // Case 3: Both neighbors are on-curve (smooth point between two linear segments)
    else if (prevIsOnCurve && nextIsOnCurve) {
      // This case typically shouldn't happen in generated contours from skeleton,
      // but we handle it for completeness - smooth point between two linear segments
      // In this case, the smooth point should maintain angle bisector behavior
      const vecIn = { x: point.x - prevPoint.x, y: point.y - prevPoint.y };
      const vecOut = { x: nextPoint.x - point.x, y: nextPoint.y - point.y };

      // Normalize directions
      const dirIn = vector.normalizeVector(vecIn);
      const dirOut = vector.normalizeVector(vecOut);

      // Calculate angle bisector
      const bisector = vector.normalizeVector({
        x: dirIn.x + dirOut.x,
        y: dirIn.y + dirOut.y,
      });

      // The smooth point is already in the right position, just ensure it's marked as smooth
      points[i] = { ...point, smooth: true };
    }
  }

  return points;
}

/**
 * Aligns handle directions in generated contours to match the directions of skeleton handles.
 * @param {Array} points - Array of generated contour points
 * @param {Array} segments - Original skeleton segments
 * @param {boolean|null} isLeftSide - True for left side, false for right side, null for centerline (caps)
 * @returns {Array} - Points with aligned handle directions
 */
function alignHandleDirections(points, segments, isLeftSide) {
  if (!points || points.length === 0) return points;

  const alignedPoints = [...points];

  // For each point in the generated contour
  for (let i = 0; i < alignedPoints.length; i++) {
    const point = alignedPoints[i];

    // Only process off-curve (control) points
    if (!point.type) continue;

    // Find the corresponding on-curve point (the one this control point relates to)
    let nearestOnCurveIdx = -1;
    let minDistance = Infinity;

    // Look for the nearest on-curve point to this control point
    for (let j = 0; j < alignedPoints.length; j++) {
      if (!alignedPoints[j].type) { // on-curve point
        const dist = Math.hypot(
          alignedPoints[j].x - point.x,
          alignedPoints[j].y - point.y
        );
        if (dist < minDistance) {
          minDistance = dist;
          nearestOnCurveIdx = j;
        }
      }
    }

    if (nearestOnCurveIdx !== -1) {
      const nearestGenPoint = alignedPoints[nearestOnCurveIdx];

      // Find the skeleton point that corresponds to this generated on-curve point
      let bestMatchSkeletonPoint = null;
      let minDistToSkeleton = Infinity;

      // Find the skeleton point that corresponds to this generated point
      for (const segment of segments) {
        // Check start point
        const startDist = Math.hypot(
          segment.startPoint.x - nearestGenPoint.x,
          segment.startPoint.y - nearestGenPoint.y
        );
        if (startDist < minDistToSkeleton) {
          minDistToSkeleton = startDist;
          bestMatchSkeletonPoint = segment.startPoint;
        }

        // Check end point
        const endDist = Math.hypot(
          segment.endPoint.x - nearestGenPoint.x,
          segment.endPoint.y - nearestGenPoint.y
        );
        if (endDist < minDistToSkeleton) {
          minDistToSkeleton = endDist;
          bestMatchSkeletonPoint = segment.endPoint;
        }
      }

      if (bestMatchSkeletonPoint) {
        // Find the skeleton control points associated with this skeleton point
        // We need to find the control points that belong to the same segment as the matched skeleton point
        let skelCtrlPoints = [];
        for (const segment of segments) {
          // If this segment contains the matched skeleton point as start or end
          if (segment.startPoint === bestMatchSkeletonPoint || segment.endPoint === bestMatchSkeletonPoint) {
            // Add all control points from this segment
            skelCtrlPoints = skelCtrlPoints.concat(segment.controlPoints);
            break; // Found the segment, no need to continue
          }
        }

        // Calculate the direction from the generated on-curve point to this generated control point
        const genCtrlDir = {
          x: point.x - nearestGenPoint.x,
          y: point.y - nearestGenPoint.y
        };
        const genCtrlLength = Math.hypot(genCtrlDir.x, genCtrlDir.y);

        if (genCtrlLength > 0.001 && skelCtrlPoints.length > 0) {
          // Find the skeleton control point that is most geometrically similar
          let bestSkelCtrlPoint = null;
          let bestSimilarity = -Infinity;

          for (const skelCtrlPoint of skelCtrlPoints) {
            // Calculate the direction from skeleton on-curve to its control point
            const skelCtrlDir = {
              x: skelCtrlPoint.x - bestMatchSkeletonPoint.x,
              y: skelCtrlPoint.y - bestMatchSkeletonPoint.y
            };
            const skelCtrlLength = Math.hypot(skelCtrlDir.x, skelCtrlDir.y);

            if (skelCtrlLength > 0.001) {
              // Normalize directions
              const normSkelDir = {
                x: skelCtrlDir.x / skelCtrlLength,
                y: skelCtrlDir.y / skelCtrlLength
              };
              const normGenDir = {
                x: genCtrlDir.x / genCtrlLength,
                y: genCtrlDir.y / genCtrlLength
              };

              // Calculate dot product to measure direction similarity
              const dotProduct = normSkelDir.x * normGenDir.x + normSkelDir.y * normGenDir.y;

              // Choose the skeleton control point with the highest similarity score (absolute value)
              if (Math.abs(dotProduct) > Math.abs(bestSimilarity)) {
                bestSimilarity = dotProduct;
                bestSkelCtrlPoint = skelCtrlPoint;
              }
            }
          }

          if (bestSkelCtrlPoint) {
            // Calculate the direction from skeleton on-curve point to its control point
            const skelHandleDir = {
              x: bestSkelCtrlPoint.x - bestMatchSkeletonPoint.x,
              y: bestSkelCtrlPoint.y - bestMatchSkeletonPoint.y
            };
            const skelHandleLength = Math.hypot(skelHandleDir.x, skelHandleDir.y);

            if (skelHandleLength > 0.001) {
              // Normalize skeleton handle direction
              const normalizedSkelDir = {
                x: skelHandleDir.x / skelHandleLength,
                y: skelHandleDir.y / skelHandleLength
              };

              // Determine if we need to flip the direction based on the dot product
              // If the best similarity was negative, it means the directions were opposite
              // In that case, we should flip the direction to match the skeleton
              const directionFlip = bestSimilarity < 0 ? -1 : 1;

              // Apply the aligned direction to the generated point
              alignedPoints[i] = {
                ...point,
                x: nearestGenPoint.x + normalizedSkelDir.x * genCtrlLength * directionFlip,
                y: nearestGenPoint.y + normalizedSkelDir.y * genCtrlLength * directionFlip
              };
            }
          }
        }
      }
    }
  }

  return alignedPoints;
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
  const { points, isClosed, defaultWidth = DEFAULT_WIDTH, capStyle = "butt" } =
    skeletonContour;

  if (points.length < 2) {
    return [];
  }

  // Separate on-curve and off-curve points, build segments
  const segments = buildSegmentsFromPoints(points, isClosed);

  // If no valid segments (e.g., less than 2 on-curve points), return empty
  if (segments.length === 0) {
    return [];
  }

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

    // Get per-point widths for start and end of segment
    const startLeftHalfWidth = getPointHalfWidth(segment.startPoint, defaultWidth, "left");
    const startRightHalfWidth = getPointHalfWidth(segment.startPoint, defaultWidth, "right");
    const endLeftHalfWidth = getPointHalfWidth(segment.endPoint, defaultWidth, "left");
    const endRightHalfWidth = getPointHalfWidth(segment.endPoint, defaultWidth, "right");

    const offsetPoints = generateOffsetPointsForSegment(
      segment,
      prevSegment,
      nextSegment,
      defaultWidth,
      isFirstSegment,
      isLastSegment,
      isClosed,
      capStyle,
      startLeftHalfWidth,
      startRightHalfWidth,
      endLeftHalfWidth,
      endRightHalfWidth
    );

    leftSide.push(...offsetPoints.left);
    rightSide.push(...offsetPoints.right);
  }

  if (isClosed) {
    // For closed skeleton: TWO separate contours (outer and inner)
    // The inner contour needs to be reversed for correct winding direction
    // (outer = counter-clockwise, inner = clockwise for proper fill)
    const reversedRight = [...rightSide].reverse();

    // Apply handle direction alignment to match skeleton handles
    const alignedLeftSide = alignHandleDirections(leftSide, segments, true);
    const alignedRightSide = alignHandleDirections(reversedRight, segments, false);

    return [
      { points: enforceSmoothColinearity(alignedLeftSide, true), isClosed: true },
      { points: enforceSmoothColinearity(alignedRightSide, true), isClosed: true },
    ];
  } else {
    // For open skeleton: ONE contour with caps at ends
    // Get per-point widths for first and last on-curve points
    const firstOnCurvePoint = segments[0].startPoint;
    const lastOnCurvePoint = segments[segments.length - 1].endPoint;
    const startCapLeftHW = getPointHalfWidth(firstOnCurvePoint, defaultWidth, "left");
    const startCapRightHW = getPointHalfWidth(firstOnCurvePoint, defaultWidth, "right");
    const endCapLeftHW = getPointHalfWidth(lastOnCurvePoint, defaultWidth, "left");
    const endCapRightHW = getPointHalfWidth(lastOnCurvePoint, defaultWidth, "right");

    const startCap = generateCap(
      firstOnCurvePoint,
      segments[0],
      defaultWidth,
      capStyle,
      "start",
      startCapLeftHW,
      startCapRightHW
    );
    const endCap = generateCap(
      lastOnCurvePoint,
      segments[segments.length - 1],
      defaultWidth,
      capStyle,
      "end",
      endCapLeftHW,
      endCapRightHW
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

    // Apply handle direction alignment to match skeleton handles
    const alignedOutlinePoints = alignHandleDirections(outlinePoints, segments, null);

    return [{ points: enforceSmoothColinearity(alignedOutlinePoints, true), isClosed: true }];
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
 * Try to simplify multiple offset curves into a single cubic bezier.
 * Uses fitCubic for approximation with adaptive error tolerance.
 * @param {Array} offsetCurves - Array of Bezier objects from bezier.offset()
 * @param {number} halfWidth - Half of the stroke width
 * @returns {Bezier|null} - Simplified Bezier or null if simplification is disabled/not needed
 */
function simplifyOffsetCurves(offsetCurves, halfWidth) {
  if (!SIMPLIFY_OFFSET_CURVES || !offsetCurves || offsetCurves.length === 0) {
    return null;
  }

  // If only one curve with 4 points (cubic), no simplification needed
  if (offsetCurves.length === 1 && offsetCurves[0].points.length === 4) {
    return null;
  }

  // 1. Sample points on all offset curves
  const samplePoints = [];
  for (let i = 0; i < offsetCurves.length; i++) {
    const curve = offsetCurves[i];
    const isLast = i === offsetCurves.length - 1;
    for (let j = 0; j <= SAMPLES_PER_CURVE; j++) {
      if (j === SAMPLES_PER_CURVE && !isLast) continue; // avoid duplicates at junctions
      samplePoints.push(curve.get(j / SAMPLES_PER_CURVE));
    }
  }

  // 2. Get tangents from the ends
  const startDeriv = offsetCurves[0].derivative(0);
  const leftTangent = vector.normalizeVector(startDeriv);

  const endDeriv = offsetCurves.at(-1).derivative(1);
  const rightTangent = vector.normalizeVector({ x: -endDeriv.x, y: -endDeriv.y });

  // 3. Parameterization
  const params = chordLengthParameterize(samplePoints);

  // 4. Adaptive search — from strict threshold to lenient
  const minError = halfWidth * MIN_ERROR_PERCENT;
  const maxError = halfWidth * MAX_ERROR_PERCENT;
  const step = halfWidth * ERROR_STEP_PERCENT;

  for (let errorThreshold = minError; errorThreshold <= maxError; errorThreshold += step) {
    const bezier = fitCubic(samplePoints, leftTangent, rightTangent, errorThreshold);
    const [actualError] = computeMaxError(samplePoints, bezier, params);
    if (actualError < errorThreshold) {
      return bezier; // fits within current threshold
    }
  }

  // Even maxError didn't help — return the last result anyway
  // One curve is better than many segments
  return fitCubic(samplePoints, leftTangent, rightTangent, maxError);
}

/**
 * Generate offset points for a segment.
 * For open skeletons: first segment adds start, all segments add end
 * For closed skeletons: all segments add start (end connects to next start)
 * @param {Object} segment - The segment to generate offsets for
 * @param {Object|null} prevSegment - Previous segment (for corner normals)
 * @param {Object|null} nextSegment - Next segment (for corner normals)
 * @param {number} width - Default width (fallback)
 * @param {boolean} isFirst - Is this the first segment
 * @param {boolean} isLast - Is this the last segment
 * @param {boolean} isClosed - Is the contour closed
 * @param {string} capStyle - Cap style for open endpoints
 * @param {number} startLeftHalfWidth - Half-width on left side at start point
 * @param {number} startRightHalfWidth - Half-width on right side at start point
 * @param {number} endLeftHalfWidth - Half-width on left side at end point
 * @param {number} endRightHalfWidth - Half-width on right side at end point
 */
function generateOffsetPointsForSegment(
  segment,
  prevSegment,
  nextSegment,
  width,
  isFirst,
  isLast,
  isClosed,
  capStyle = "butt",
  startLeftHalfWidth = null,
  startRightHalfWidth = null,
  endLeftHalfWidth = null,
  endRightHalfWidth = null
) {
  // Use provided half-widths or fall back to width/2
  const halfWidth = width / 2;
  const startLeftHW = startLeftHalfWidth ?? halfWidth;
  const startRightHW = startRightHalfWidth ?? halfWidth;
  const endLeftHW = endLeftHalfWidth ?? halfWidth;
  const endRightHW = endRightHalfWidth ?? halfWidth;

  const left = [];
  const right = [];

  if (segment.controlPoints.length === 0) {
    // Line segment - simple offset with per-point widths
    const direction = vector.normalizeVector(
      vector.subVectors(segment.endPoint, segment.startPoint)
    );
    const normal = vector.rotateVector90CW(direction);

    // Add start point offset:
    // - For open skeletons: only for the first segment
    // - For closed skeletons: for all segments (each adds its start)
    const shouldAddStart = isClosed || isFirst;
    if (shouldAddStart) {
      let startNormal =
        !prevSegment || (isFirst && !isClosed)
          ? normal
          : calculateCornerNormal(prevSegment, segment, startLeftHW);
      // Apply angle override if set on the point
      startNormal = getEffectiveNormal(segment.startPoint, startNormal);

      // Copy smooth property from skeleton point, round to UPM grid
      // Use per-point half-widths for left and right sides
      left.push({
        x: Math.round(segment.startPoint.x + startNormal.x * startLeftHW),
        y: Math.round(segment.startPoint.y + startNormal.y * startLeftHW),
        smooth: segment.startPoint.smooth,
      });
      right.push({
        x: Math.round(segment.startPoint.x - startNormal.x * startRightHW),
        y: Math.round(segment.startPoint.y - startNormal.y * startRightHW),
        smooth: segment.startPoint.smooth,
      });
    }

    // Add end point offset:
    // - For open skeletons: for all segments (each adds its end)
    // - For closed skeletons: don't add (next segment's start is this end)
    const shouldAddEnd = !isClosed;
    if (shouldAddEnd) {
      let endNormal =
        !nextSegment || isLast
          ? normal
          : calculateCornerNormal(segment, nextSegment, endLeftHW);
      // Apply angle override if set on the point
      endNormal = getEffectiveNormal(segment.endPoint, endNormal);

      // Copy smooth property from skeleton point, round to UPM grid
      // Use per-point half-widths for left and right sides
      left.push({
        x: Math.round(segment.endPoint.x + endNormal.x * endLeftHW),
        y: Math.round(segment.endPoint.y + endNormal.y * endLeftHW),
        smooth: segment.endPoint.smooth,
      });
      right.push({
        x: Math.round(segment.endPoint.x - endNormal.x * endRightHW),
        y: Math.round(segment.endPoint.y - endNormal.y * endRightHW),
        smooth: segment.endPoint.smooth,
      });
    }
  } else {
    // Bezier segment - use bezier.offset() for mathematically correct offset
    // For variable-width segments, we use average width for offset curves
    // and then fix endpoints to the exact per-point widths
    const bezierPoints = [
      segment.startPoint,
      ...segment.controlPoints,
      segment.endPoint,
    ];

    // Convert to bezier-js format
    const bezier = createBezierFromPoints(bezierPoints);

    // Calculate normals at endpoints for corner handling
    const startDeriv = bezier.derivative(0);
    const startTangent = vector.normalizeVector({ x: startDeriv.x, y: startDeriv.y });
    const bezierStartNormal = vector.rotateVector90CW(startTangent);

    const endDeriv = bezier.derivative(1);
    const endTangent = vector.normalizeVector({ x: endDeriv.x, y: endDeriv.y });
    const bezierEndNormal = vector.rotateVector90CW(endTangent);

    // For corners (non-smooth junctions), use averaged normal
    let startNormal =
      !prevSegment || (isFirst && !isClosed)
        ? bezierStartNormal
        : calculateCornerNormal(prevSegment, segment, startLeftHW);
    // Apply angle override if set on the point
    startNormal = getEffectiveNormal(segment.startPoint, startNormal);

    let endNormal =
      !nextSegment || (isLast && !isClosed)
        ? bezierEndNormal
        : calculateCornerNormal(segment, nextSegment, endLeftHW);
    // Apply angle override if set on the point
    endNormal = getEffectiveNormal(segment.endPoint, endNormal);

    // Get offset curves from bezier-js (returns array of Bezier objects)
    // Note: bezier-js uses CCW normal, our code uses CW normal, so signs are swapped
    // Use average widths for the offset curve generation
    const avgLeftHW = (startLeftHW + endLeftHW) / 2;
    const avgRightHW = (startRightHW + endRightHW) / 2;
    const offsetLeftCurves = bezier.offset(-avgLeftHW);
    const offsetRightCurves = bezier.offset(avgRightHW);

    // Fixed endpoint positions (using corner-aware normals and per-point widths), rounded to UPM grid
    const fixedStartLeft = {
      x: Math.round(segment.startPoint.x + startNormal.x * startLeftHW),
      y: Math.round(segment.startPoint.y + startNormal.y * startLeftHW),
    };
    const fixedStartRight = {
      x: Math.round(segment.startPoint.x - startNormal.x * startRightHW),
      y: Math.round(segment.startPoint.y - startNormal.y * startRightHW),
    };
    const fixedEndLeft = {
      x: Math.round(segment.endPoint.x + endNormal.x * endLeftHW),
      y: Math.round(segment.endPoint.y + endNormal.y * endLeftHW),
    };
    const fixedEndRight = {
      x: Math.round(segment.endPoint.x - endNormal.x * endRightHW),
      y: Math.round(segment.endPoint.y - endNormal.y * endRightHW),
    };

    // Helper to add offset curves to output array
    const addOffsetCurves = (curves, output, fixedStart, fixedEnd, shouldAddStart, shouldAddEnd, smoothStart, smoothEnd, sideHalfWidth) => {
      // Fallback: if bezier.offset() returns empty result, add straight line
      if (!curves || curves.length === 0) {
        if (shouldAddStart) {
          output.push({ x: fixedStart.x, y: fixedStart.y, smooth: smoothStart });
        }
        if (shouldAddEnd) {
          output.push({ x: fixedEnd.x, y: fixedEnd.y, smooth: smoothEnd });
        }
        return;
      }

      // Try to simplify multiple offset curves into a single cubic bezier
      const simplifiedCurve = simplifyOffsetCurves(curves, sideHalfWidth);
      if (simplifiedCurve) {
        // Use the simplified curve
        const pts = simplifiedCurve.points;
        if (shouldAddStart) {
          output.push({
            x: fixedStart.x,
            y: fixedStart.y,
            smooth: smoothStart,
          });
        }
        // Adjust control points to match the fixed endpoints
        // The offset curve was generated with average width, but endpoints use real widths
        // Scale handles proportionally to maintain curve shape
        const origStart = pts[0];
        const origEnd = pts[3];
        const handle1 = pts[1];
        const handle2 = pts[2];

        // Vector from original start to handle1
        const h1Offset = { x: handle1.x - origStart.x, y: handle1.y - origStart.y };
        // Vector from original end to handle2
        const h2Offset = { x: handle2.x - origEnd.x, y: handle2.y - origEnd.y };

        // Apply handles relative to fixed positions
        const adjustedHandle1 = {
          x: Math.round(fixedStart.x + h1Offset.x),
          y: Math.round(fixedStart.y + h1Offset.y),
        };
        const adjustedHandle2 = {
          x: Math.round(fixedEnd.x + h2Offset.x),
          y: Math.round(fixedEnd.y + h2Offset.y),
        };

        output.push({ x: adjustedHandle1.x, y: adjustedHandle1.y, type: "cubic" });
        output.push({ x: adjustedHandle2.x, y: adjustedHandle2.y, type: "cubic" });
        if (shouldAddEnd) {
          output.push({
            x: fixedEnd.x,
            y: fixedEnd.y,
            smooth: smoothEnd,
          });
        }
        return;
      }

      // Fallback: use original curves without simplification
      // Track actual start position for each curve (for handle adjustment)
      let currentStart = fixedStart;

      for (let i = 0; i < curves.length; i++) {
        const curve = curves[i];
        const pts = curve.points;
        const isFirstCurve = i === 0;
        const isLastCurve = i === curves.length - 1;

        // Determine actual end position for this curve
        const currentEnd = isLastCurve
          ? fixedEnd
          : { x: Math.round(pts[pts.length - 1].x), y: Math.round(pts[pts.length - 1].y) };

        // Add start point only for first curve if shouldAddStart
        if (isFirstCurve && shouldAddStart) {
          output.push({
            x: fixedStart.x,
            y: fixedStart.y,
            smooth: smoothStart,
          });
        }

        // Add control points based on curve type, adjusted for fixed endpoints
        if (pts.length === 4) {
          // Cubic bezier - adjust handles relative to fixed endpoints
          const origStart = pts[0];
          const origEnd = pts[3];
          const handle1 = pts[1];
          const handle2 = pts[2];

          // Vector from original start to handle1
          const h1Offset = { x: handle1.x - origStart.x, y: handle1.y - origStart.y };
          // Vector from original end to handle2
          const h2Offset = { x: handle2.x - origEnd.x, y: handle2.y - origEnd.y };

          // Apply handles relative to actual positions
          output.push({
            x: Math.round(currentStart.x + h1Offset.x),
            y: Math.round(currentStart.y + h1Offset.y),
            type: "cubic",
          });
          output.push({
            x: Math.round(currentEnd.x + h2Offset.x),
            y: Math.round(currentEnd.y + h2Offset.y),
            type: "cubic",
          });
        } else if (pts.length === 3) {
          // Quadratic bezier - adjust handle relative to midpoint
          const origStart = pts[0];
          const origEnd = pts[2];
          const handle = pts[1];

          // Calculate handle offset from midpoint of original curve
          const origMid = { x: (origStart.x + origEnd.x) / 2, y: (origStart.y + origEnd.y) / 2 };
          const hOffset = { x: handle.x - origMid.x, y: handle.y - origMid.y };

          // Apply handle relative to midpoint of actual positions
          const actualMid = { x: (currentStart.x + currentEnd.x) / 2, y: (currentStart.y + currentEnd.y) / 2 };
          output.push({
            x: Math.round(actualMid.x + hOffset.x),
            y: Math.round(actualMid.y + hOffset.y),
            type: "quad",
          });
        }
        // Linear (2 points) - no control points needed

        // Add endpoint
        if (isLastCurve) {
          // Last curve - use fixed end position if shouldAddEnd
          if (shouldAddEnd) {
            output.push({
              x: fixedEnd.x,
              y: fixedEnd.y,
              smooth: smoothEnd,
            });
          }
        } else {
          // Intermediate curve - add endpoint (it becomes next curve's start)
          output.push({
            x: currentEnd.x,
            y: currentEnd.y,
            smooth: true, // intermediate points are smooth
          });
        }

        // Update currentStart for next curve
        currentStart = currentEnd;
      }
    };

    // Determine which points to add based on closed/open and first/last
    const shouldAddStart = isClosed || isFirst;
    const shouldAddEnd = !isClosed;

    addOffsetCurves(
      offsetLeftCurves,
      left,
      fixedStartLeft,
      fixedEndLeft,
      shouldAddStart,
      shouldAddEnd,
      segment.startPoint.smooth,
      segment.endPoint.smooth,
      avgLeftHW
    );

    addOffsetCurves(
      offsetRightCurves,
      right,
      fixedStartRight,
      fixedEndRight,
      shouldAddStart,
      shouldAddEnd,
      segment.startPoint.smooth,
      segment.endPoint.smooth,
      avgRightHW
    );
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

  // Compute angle bisector using atan2 (numerically stable for all angles)
  const dot = dir1.x * dir2.x + dir1.y * dir2.y;
  const cross = dir1.x * dir2.y - dir1.y * dir2.x;

  // Angle from dir1 to dir2 (signed)
  const angle = Math.atan2(cross, dot);

  // Bisector = dir1 rotated by angle/2
  const halfAngle = angle / 2;
  const cosH = Math.cos(halfAngle);
  const sinH = Math.sin(halfAngle);

  const bisector = {
    x: dir1.x * cosH - dir1.y * sinH,
    y: dir1.x * sinH + dir1.y * cosH,
  };

  // Normal is perpendicular to bisector (rotated 90° CW)
  return { x: bisector.y, y: -bisector.x };
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
 * @param {Object} point - The endpoint
 * @param {Object} segment - The segment at this endpoint
 * @param {number} width - Default width (fallback)
 * @param {string} capStyle - Cap style ("butt", "round", "square")
 * @param {string} position - "start" or "end"
 * @param {number} leftHalfWidth - Half-width on left side
 * @param {number} rightHalfWidth - Half-width on right side
 */
function generateCap(point, segment, width, capStyle, position, leftHalfWidth = null, rightHalfWidth = null) {
  const halfWidth = width / 2;
  const leftHW = leftHalfWidth ?? halfWidth;
  const rightHW = rightHalfWidth ?? halfWidth;
  // For round caps, use average half-width for the tip point
  const avgHW = (leftHW + rightHW) / 2;
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
    // Use per-point widths for left/right sides
    const kappa = 0.5522847498; // Bezier circle approximation constant

    if (position === "end") {
      // Arc from right side to left side (going "forward")
      const rightPoint = {
        x: point.x - normal.x * rightHW,
        y: point.y - normal.y * rightHW,
      };
      const leftPoint = {
        x: point.x + normal.x * leftHW,
        y: point.y + normal.y * leftHW,
      };
      const tipPoint = {
        x: point.x + direction.x * avgHW,
        y: point.y + direction.y * avgHW,
      };

      // Control points for quarter arcs
      capPoints.push({
        x: rightPoint.x + direction.x * rightHW * kappa,
        y: rightPoint.y + direction.y * rightHW * kappa,
        type: "cubic",
      });
      capPoints.push({
        x: tipPoint.x - normal.x * rightHW * kappa,
        y: tipPoint.y - normal.y * rightHW * kappa,
        type: "cubic",
      });
      capPoints.push(tipPoint);
      capPoints.push({
        x: tipPoint.x + normal.x * leftHW * kappa,
        y: tipPoint.y + normal.y * leftHW * kappa,
        type: "cubic",
      });
      capPoints.push({
        x: leftPoint.x + direction.x * leftHW * kappa,
        y: leftPoint.y + direction.y * leftHW * kappa,
        type: "cubic",
      });
    } else {
      // Start cap - arc from left to right (going "backward")
      const rightPoint = {
        x: point.x - normal.x * rightHW,
        y: point.y - normal.y * rightHW,
      };
      const leftPoint = {
        x: point.x + normal.x * leftHW,
        y: point.y + normal.y * leftHW,
      };
      const tipPoint = {
        x: point.x - direction.x * avgHW,
        y: point.y - direction.y * avgHW,
      };

      capPoints.push({
        x: leftPoint.x - direction.x * leftHW * kappa,
        y: leftPoint.y - direction.y * leftHW * kappa,
        type: "cubic",
      });
      capPoints.push({
        x: tipPoint.x + normal.x * leftHW * kappa,
        y: tipPoint.y + normal.y * leftHW * kappa,
        type: "cubic",
      });
      capPoints.push(tipPoint);
      capPoints.push({
        x: tipPoint.x - normal.x * rightHW * kappa,
        y: tipPoint.y - normal.y * rightHW * kappa,
        type: "cubic",
      });
      capPoints.push({
        x: rightPoint.x - direction.x * rightHW * kappa,
        y: rightPoint.y - direction.y * rightHW * kappa,
        type: "cubic",
      });
    }
  } else if (capStyle === "square") {
    // Square cap - extend by per-point half-widths
    if (position === "end") {
      capPoints.push({
        x: point.x - normal.x * rightHW + direction.x * avgHW,
        y: point.y - normal.y * rightHW + direction.y * avgHW,
      });
      capPoints.push({
        x: point.x + normal.x * leftHW + direction.x * avgHW,
        y: point.y + normal.y * leftHW + direction.y * avgHW,
      });
    } else {
      capPoints.push({
        x: point.x + normal.x * leftHW - direction.x * avgHW,
        y: point.y + normal.y * leftHW - direction.y * avgHW,
      });
      capPoints.push({
        x: point.x - normal.x * rightHW - direction.x * avgHW,
        y: point.y - normal.y * rightHW - direction.y * avgHW,
      });
    }
  }
  // "butt" style needs no extra points

  return capPoints;
}

/**
 * Apply angle override to a calculated normal if the point has forceHorizontal or forceVertical set.
 * Preserves the sign (direction) of the original normal to maintain left/right orientation.
 * @param {Object} point - The skeleton point
 * @param {Object} calculatedNormal - The normal calculated from curve geometry {x, y}
 * @returns {Object} The effective normal (possibly overridden)
 */
export function getEffectiveNormal(point, calculatedNormal) {
  if (point.forceHorizontal) {
    // Horizontal ribs: normal points up or down based on original sign
    return { x: 0, y: calculatedNormal.y >= 0 ? 1 : -1 };
  }
  if (point.forceVertical) {
    // Vertical ribs: normal points left or right based on original sign
    return { x: calculatedNormal.x >= 0 ? 1 : -1, y: 0 };
  }
  return calculatedNormal;
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

  // Build segments to get proper tangent directions
  const segments = buildSegmentsFromPoints(points, isClosed);
  if (segments.length === 0) {
    return { x: 0, y: 1 };
  }

  // Find segments that end at or start from this point
  let incomingSegment = null;
  let outgoingSegment = null;

  for (const segment of segments) {
    if (segment.endPoint === point) {
      incomingSegment = segment;
    }
    if (segment.startPoint === point) {
      outgoingSegment = segment;
    }
  }

  // Calculate tangent directions using the same method as contour generation
  let dir1 = null; // incoming direction
  let dir2 = null; // outgoing direction

  if (incomingSegment) {
    if (incomingSegment.controlPoints.length === 0) {
      dir1 = vector.normalizeVector(
        vector.subVectors(incomingSegment.endPoint, incomingSegment.startPoint)
      );
    } else {
      const bezier = createBezierFromPoints([
        incomingSegment.startPoint,
        ...incomingSegment.controlPoints,
        incomingSegment.endPoint,
      ]);
      const deriv = bezier.derivative(1);
      dir1 = vector.normalizeVector({ x: deriv.x, y: deriv.y });
    }
  }

  if (outgoingSegment) {
    if (outgoingSegment.controlPoints.length === 0) {
      dir2 = vector.normalizeVector(
        vector.subVectors(outgoingSegment.endPoint, outgoingSegment.startPoint)
      );
    } else {
      const bezier = createBezierFromPoints([
        outgoingSegment.startPoint,
        ...outgoingSegment.controlPoints,
        outgoingSegment.endPoint,
      ]);
      const deriv = bezier.derivative(0);
      dir2 = vector.normalizeVector({ x: deriv.x, y: deriv.y });
    }
  }

  // Handle endpoints of open contours
  if (!dir1 && dir2) {
    const normal = vector.rotateVector90CW(dir2);
    return getEffectiveNormal(point, normal);
  }
  if (dir1 && !dir2) {
    const normal = vector.rotateVector90CW(dir1);
    return getEffectiveNormal(point, normal);
  }
  if (!dir1 && !dir2) {
    return getEffectiveNormal(point, { x: 0, y: 1 });
  }

  // Use atan2-based angle bisector (same as calculateCornerNormal)
  const dot = dir1.x * dir2.x + dir1.y * dir2.y;
  const cross = dir1.x * dir2.y - dir1.y * dir2.x;
  const angle = Math.atan2(cross, dot);
  const halfAngle = angle / 2;
  const cosH = Math.cos(halfAngle);
  const sinH = Math.sin(halfAngle);

  const bisector = {
    x: dir1.x * cosH - dir1.y * sinH,
    y: dir1.x * sinH + dir1.y * cosH,
  };

  // Normal is perpendicular to bisector (rotated 90° CW)
  const normal = { x: bisector.y, y: -bisector.x };
  return getEffectiveNormal(point, normal);
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
 * Move all skeleton points by dx, dy.
 * Modifies the skeletonData object in place.
 * @param {Object} skeletonData - The skeleton data object
 * @param {number} dx - X offset
 * @param {number} dy - Y offset
 */
export function moveSkeletonData(skeletonData, dx, dy) {
  if (!skeletonData?.contours) return;

  for (const contour of skeletonData.contours) {
    if (!contour.points) continue;
    for (const point of contour.points) {
      point.x += dx;
      point.y += dy;
    }
  }
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
 * @param {boolean} isClosed - Whether the contour is closed
 * @param {number} defaultWidth - Default width for the contour (defaults to DEFAULT_WIDTH)
 */
export function createSkeletonContour(isClosed = false, defaultWidth = DEFAULT_WIDTH) {
  return {
    isClosed,
    points: [],
    defaultWidth,
    capStyle: "butt",
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
