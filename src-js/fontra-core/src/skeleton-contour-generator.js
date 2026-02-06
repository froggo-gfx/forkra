import { Bezier } from "bezier-js";
import * as vector from "./vector.js";
import { VarPackedPath } from "./var-path.js";
import { fitCubic, chordLengthParameterize, computeMaxError } from "./fit-cubic.js";

const DEFAULT_WIDTH = 80;
const DEFAULT_CAP_RADIUS_RATIO = 1 / 8;
const MAX_CAP_RADIUS_RATIO = 1 / 4;
const DEFAULT_CAP_TENSION = 0.55;

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

/**
 * Apply nudge offset to a rib point position.
 * Nudge moves the point along the tangent direction (perpendicular to normal).
 * @param {Object} ribPoint - The rib point {x, y} to modify
 * @param {Object} skeletonPoint - The skeleton point (may have nudge values)
 * @param {Object} normal - The normal vector at this point
 * @param {string} side - "left" or "right"
 * @param {number} halfWidth - The half-width for this side (don't apply nudge if near 0)
 * @returns {Object} Modified rib point {x, y}
 */
function applyNudgeToRibPoint(ribPoint, skeletonPoint, normal, side, halfWidth) {
  // Don't apply nudge if width is near 0 (single-sided mode - this side matches skeleton)
  if (halfWidth !== undefined && halfWidth < 0.5) {
    return ribPoint;
  }

  // Check per-side editable flag
  const editableKey = side === "left" ? "leftEditable" : "rightEditable";
  if (!skeletonPoint?.[editableKey]) {
    return ribPoint;
  }

  const nudgeKey = side === "left" ? "leftNudge" : "rightNudge";
  const nudge = skeletonPoint[nudgeKey];

  if (nudge === undefined || nudge === 0) {
    return ribPoint;
  }

  // Tangent is perpendicular to normal (rotate 90 CCW)
  const tangent = { x: -normal.y, y: normal.x };

  return {
    x: Math.round(ribPoint.x + tangent.x * nudge),
    y: Math.round(ribPoint.y + tangent.y * nudge),
  };
}

/**
 * Get the skeleton handle direction for a given segment endpoint.
 * @param {Object} segment - The segment containing the on-curve point
 * @param {string} position - "start" or "end" (which end of segment)
 * @param {string} handleType - "in" or "out" (which direction from on-curve)
 * @returns {Object|null} Normalized direction vector {x, y} or null if no handle
 */
function getSkeletonHandleDirection(segment, position, handleType) {
  if (segment.controlPoints.length === 0) {
    // Line segment - no handles
    return null;
  }

  let onCurvePoint, controlPoint;

  if (position === "start" && handleType === "out") {
    // Outgoing handle from start = first control point
    onCurvePoint = segment.startPoint;
    controlPoint = segment.controlPoints[0];
  } else if (position === "end" && handleType === "in") {
    // Incoming handle to end = last control point
    onCurvePoint = segment.endPoint;
    controlPoint = segment.controlPoints[segment.controlPoints.length - 1];
  } else {
    // Other combinations not handled here (would need previous/next segment)
    return null;
  }

  if (!controlPoint) return null;

  const dir = {
    x: controlPoint.x - onCurvePoint.x,
    y: controlPoint.y - onCurvePoint.y,
  };
  const length = Math.hypot(dir.x, dir.y);

  if (length < 0.001) return null;

  const normalized = { x: dir.x / length, y: dir.y / length };
  return normalized;
}

/**
 * Apply handle offset to a generated control point position.
 * Supports both 2D offsets (X/Y) and legacy 1D offsets (along skeleton handle direction).
 * In "detached" mode, offsets are absolute positions relative to the rib point,
 * independent of skeleton handle lengths.
 * @param {Object} controlPoint - The generated control point {x, y}
 * @param {Object} skeletonPoint - The skeleton on-curve point (may have handle offset values)
 * @param {Object} skeletonHandleDir - Normalized direction of skeleton handle
 * @param {string} side - "left" or "right"
 * @param {string} handleType - "in" or "out" (incoming or outgoing handle)
 * @param {Object} ribPoint - Optional rib point position {x, y} for detached mode
 * @returns {Object} Modified control point {x, y}
 */
function applyHandleOffsetToControlPoint(controlPoint, skeletonPoint, skeletonHandleDir, side, handleType, ribPoint = null) {
  // Check per-side editable flag
  const editableKey = side === "left" ? "leftEditable" : "rightEditable";
  if (!skeletonPoint?.[editableKey]) {
    return controlPoint;
  }

  // Check if handles are detached (absolute positioning)
  const detachedKey = side === "left" ? "leftHandleDetached" : "rightHandleDetached";
  const isDetached = skeletonPoint[detachedKey];

  // 2D offset keys (new format for precise interpolation)
  const offsetKeyX = side === "left"
    ? (handleType === "in" ? "leftHandleInOffsetX" : "leftHandleOutOffsetX")
    : (handleType === "in" ? "rightHandleInOffsetX" : "rightHandleOutOffsetX");
  const offsetKeyY = side === "left"
    ? (handleType === "in" ? "leftHandleInOffsetY" : "leftHandleOutOffsetY")
    : (handleType === "in" ? "rightHandleInOffsetY" : "rightHandleOutOffsetY");

  // Legacy 1D offset key (backwards compatibility)
  const offset1DKey = side === "left"
    ? (handleType === "in" ? "leftHandleInOffset" : "leftHandleOutOffset")
    : (handleType === "in" ? "rightHandleInOffset" : "rightHandleOutOffset");

  const offset2DX = skeletonPoint[offsetKeyX];
  const offset2DY = skeletonPoint[offsetKeyY];
  const offset1D = skeletonPoint[offset1DKey];

  // In detached mode with 2D offsets, use ribPoint as base (absolute positioning)
  if (isDetached && ribPoint && (offset2DX !== undefined || offset2DY !== undefined)) {
    return {
      x: Math.round(ribPoint.x + (offset2DX || 0)),
      y: Math.round(ribPoint.y + (offset2DY || 0)),
    };
  }

  // Priority: 2D offset if present, else 1D (relative to controlPoint)
  if (offset2DX !== undefined || offset2DY !== undefined) {
    return {
      x: Math.round(controlPoint.x + (offset2DX || 0)),
      y: Math.round(controlPoint.y + (offset2DY || 0)),
    };
  }

  if (offset1D !== undefined && offset1D !== 0) {
    return {
      x: Math.round(controlPoint.x + skeletonHandleDir.x * offset1D),
      y: Math.round(controlPoint.y + skeletonHandleDir.y * offset1D),
    };
  }

  return controlPoint;
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
  const {
    points,
    isClosed,
    defaultWidth = DEFAULT_WIDTH,
    capStyle = "butt",
    reversed = false,
    singleSided = false,
    singleSidedDirection = "left",
  } = skeletonContour;

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
    let startLeftHalfWidth = getPointHalfWidth(segment.startPoint, defaultWidth, "left");
    let startRightHalfWidth = getPointHalfWidth(segment.startPoint, defaultWidth, "right");
    let endLeftHalfWidth = getPointHalfWidth(segment.endPoint, defaultWidth, "left");
    let endRightHalfWidth = getPointHalfWidth(segment.endPoint, defaultWidth, "right");

    // Single-sided mode: redirect all width to one side
    if (singleSided) {
      const startTotal = startLeftHalfWidth + startRightHalfWidth;
      const endTotal = endLeftHalfWidth + endRightHalfWidth;

      if (singleSidedDirection === "left") {
        // All width goes to the left side
        startLeftHalfWidth = startTotal;
        startRightHalfWidth = 0;
        endLeftHalfWidth = endTotal;
        endRightHalfWidth = 0;
      } else {
        // All width goes to the right side
        startLeftHalfWidth = 0;
        startRightHalfWidth = startTotal;
        endLeftHalfWidth = 0;
        endRightHalfWidth = endTotal;
      }
    }

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

    // DISABLED for performance testing - alignHandleDirections is O(n³)
    // const alignedLeftSide = alignHandleDirections(leftSide, segments, true);
    // const alignedRightSide = alignHandleDirections(reversedRight, segments, false);

    let contours = [
      { points: enforceSmoothColinearity(leftSide, true), isClosed: true },
      { points: enforceSmoothColinearity(reversedRight, true), isClosed: true },
    ];

    // Apply reverse if flag is set
    if (reversed) {
      contours = contours.map((c) => reverseContour(c));
    }

    return contours;
  } else {
    // For open skeleton: ONE contour with caps at ends
    // Get per-point widths for first and last on-curve points
    const firstOnCurvePoint = segments[0].startPoint;
    const lastOnCurvePoint = segments[segments.length - 1].endPoint;
    let startCapLeftHW = getPointHalfWidth(firstOnCurvePoint, defaultWidth, "left");
    let startCapRightHW = getPointHalfWidth(firstOnCurvePoint, defaultWidth, "right");
    let endCapLeftHW = getPointHalfWidth(lastOnCurvePoint, defaultWidth, "left");
    let endCapRightHW = getPointHalfWidth(lastOnCurvePoint, defaultWidth, "right");

    // Single-sided mode: redirect all width to one side for caps too
    if (singleSided) {
      const startTotal = startCapLeftHW + startCapRightHW;
      const endTotal = endCapLeftHW + endCapRightHW;

      if (singleSidedDirection === "left") {
        startCapLeftHW = startTotal;
        startCapRightHW = 0;
        endCapLeftHW = endTotal;
        endCapRightHW = 0;
      } else {
        startCapLeftHW = 0;
        startCapRightHW = startTotal;
        endCapLeftHW = 0;
        endCapRightHW = endTotal;
      }
    }

    const startCapStyleRaw = firstOnCurvePoint.capStyle ?? capStyle;
    const endCapStyleRaw = lastOnCurvePoint.capStyle ?? capStyle;
    const startCapStyle = normalizeCapStyle(startCapStyleRaw);
    const endCapStyle = normalizeCapStyle(endCapStyleRaw);

    const startIsRound = startCapStyle === "round";
    const endIsRound = endCapStyle === "round";

    let startCap = [];
    let endCap = [];

    if (startIsRound) {
      let startTangent = getSegmentTangent(segments[0], "start");
      let leftStart = getFirstOnCurvePoint(leftSide);
      let rightStart = getFirstOnCurvePoint(rightSide);
      if (leftStart && rightStart) {
        const capVector = vector.subVectors(leftStart, rightStart);
        const capLength = Math.hypot(capVector.x, capVector.y);
        const capWidth = startCapLeftHW + startCapRightHW;
        const capRadiusRatio =
          firstOnCurvePoint.capRadiusRatio ??
          skeletonContour.capRadiusRatio ??
          DEFAULT_CAP_RADIUS_RATIO;
        const capTension =
          firstOnCurvePoint.capTension ??
          skeletonContour.capTension ??
          DEFAULT_CAP_TENSION;
        const r = capWidth * capRadiusRatio;
        const maxShift = Math.max(capWidth / 2 - capWidth / 128, 0);
        const shift = Math.min(r * 2, maxShift);
        const mergeCap = capRadiusRatio >= MAX_CAP_RADIUS_RATIO - 1e-6;
        const cornerShift = shift; // move existing corner points inward along skeleton
        const normalShift = mergeCap ? capWidth / 2 : shift; // move new points along normal only
        if (capLength > 0.001 && r > 0.001) {
          let startNormal = getEffectiveNormal(
            firstOnCurvePoint,
            vector.rotateVector90CW(startTangent)
          );
          let capDir = vector.normalizeVector(startNormal); // right -> left
          let tOut = { x: -startTangent.x, y: -startTangent.y };
          let tIn = { x: -tOut.x, y: -tOut.y };

          const origRight = { x: rightStart.x, y: rightStart.y };
          const origLeft = { x: leftStart.x, y: leftStart.y };

          if (singleSided) {
            trimCurveAtStart(leftSide, cornerShift);
            trimCurveAtStart(rightSide, cornerShift);
            leftStart = getFirstOnCurvePoint(leftSide) || leftStart;
            rightStart = getFirstOnCurvePoint(rightSide) || rightStart;
          } else {
            // Shift existing corner points inward along skeleton
            rightStart.x = Math.round(rightStart.x + tIn.x * cornerShift);
            rightStart.y = Math.round(rightStart.y + tIn.y * cornerShift);
            leftStart.x = Math.round(leftStart.x + tIn.x * cornerShift);
            leftStart.y = Math.round(leftStart.y + tIn.y * cornerShift);
            rescaleAdjacentHandles(rightSide, rightStart, origRight, "forward");
            rescaleAdjacentHandles(leftSide, leftStart, origLeft, "forward");
          }
          if (segments[0]?.controlPoints?.length) {
            rightStart.smooth = true;
            leftStart.smooth = true;
          }
          const rightNormalShift = normalShift;
          const leftNormalShift = normalShift;
          const newRight = {
            x: Math.round(origRight.x + capDir.x * rightNormalShift),
            y: Math.round(origRight.y + capDir.y * rightNormalShift),
            smooth: true,
          };
          const newLeft = {
            x: Math.round(origLeft.x - capDir.x * leftNormalShift),
            y: Math.round(origLeft.y - capDir.y * leftNormalShift),
            smooth: true,
          };
          const midPoint = mergeCap
            ? {
                x: Math.round((newRight.x + newLeft.x) / 2),
                y: Math.round((newRight.y + newLeft.y) / 2),
                smooth: true,
              }
            : null;

          const rightSegHandles = computeTunniHandleLengths(
            rightStart,
            tOut,
            mergeCap ? midPoint : newRight,
            { x: -capDir.x, y: -capDir.y },
            capTension
          );
          const leftSegHandles = computeTunniHandleLengths(
            mergeCap ? midPoint : newLeft,
            capDir,
            leftStart,
            tOut,
            capTension
          );

          if (mergeCap) {
            startCap = [
              {
                x: Math.round(rightStart.x + tOut.x * rightSegHandles.startLen),
                y: Math.round(rightStart.y + tOut.y * rightSegHandles.startLen),
                type: "cubic",
              },
              {
                x: Math.round(midPoint.x - capDir.x * rightSegHandles.endLen),
                y: Math.round(midPoint.y - capDir.y * rightSegHandles.endLen),
                type: "cubic",
              },
              midPoint,
              {
                x: Math.round(midPoint.x + capDir.x * leftSegHandles.startLen),
                y: Math.round(midPoint.y + capDir.y * leftSegHandles.startLen),
                type: "cubic",
              },
              {
                x: Math.round(leftStart.x + tOut.x * leftSegHandles.endLen),
                y: Math.round(leftStart.y + tOut.y * leftSegHandles.endLen),
                type: "cubic",
              },
            ];
          } else {
            startCap = [
              {
                x: Math.round(rightStart.x + tOut.x * rightSegHandles.startLen),
                y: Math.round(rightStart.y + tOut.y * rightSegHandles.startLen),
                type: "cubic",
              },
              {
                x: Math.round(newRight.x - capDir.x * rightSegHandles.endLen),
                y: Math.round(newRight.y - capDir.y * rightSegHandles.endLen),
                type: "cubic",
              },
              newRight,
              newLeft,
              {
                x: Math.round(newLeft.x + capDir.x * leftSegHandles.startLen),
                y: Math.round(newLeft.y + capDir.y * leftSegHandles.startLen),
                type: "cubic",
              },
              {
                x: Math.round(leftStart.x + tOut.x * leftSegHandles.endLen),
                y: Math.round(leftStart.y + tOut.y * leftSegHandles.endLen),
                type: "cubic",
              },
            ];
          }
        }
      }
    } else {
      startCap = generateCap(
        firstOnCurvePoint,
        segments[0],
        defaultWidth,
        startCapStyle,
        "start",
        startCapLeftHW,
        startCapRightHW
      );
    }

    if (endIsRound) {
      let endTangent = getSegmentTangent(segments[segments.length - 1], "end");
      let leftEnd = getLastOnCurvePoint(leftSide);
      let rightEnd = getLastOnCurvePoint(rightSide);
      if (leftEnd && rightEnd) {
        const capVector = vector.subVectors(leftEnd, rightEnd);
        const capLength = Math.hypot(capVector.x, capVector.y);
        const capWidth = endCapLeftHW + endCapRightHW;
        const capRadiusRatio =
          lastOnCurvePoint.capRadiusRatio ??
          skeletonContour.capRadiusRatio ??
          DEFAULT_CAP_RADIUS_RATIO;
        const capTension =
          lastOnCurvePoint.capTension ??
          skeletonContour.capTension ??
          DEFAULT_CAP_TENSION;
        const r = capWidth * capRadiusRatio;
        const maxShift = Math.max(capWidth / 2 - capWidth / 128, 0);
        const shift = Math.min(r * 2, maxShift);
        const mergeCap = capRadiusRatio >= MAX_CAP_RADIUS_RATIO - 1e-6;
        const cornerShift = shift; // move existing corner points inward along skeleton
        const normalShift = mergeCap ? capWidth / 2 : shift; // move new points along normal only
        if (capLength > 0.001 && r > 0.001) {
          let endNormal = getEffectiveNormal(
            lastOnCurvePoint,
            vector.rotateVector90CW(endTangent)
          );
          let capDir = vector.normalizeVector(endNormal); // right -> left
          let tOut = endTangent;
          let tIn = { x: -tOut.x, y: -tOut.y };

          const origLeft = { x: leftEnd.x, y: leftEnd.y };
          const origRight = { x: rightEnd.x, y: rightEnd.y };

          if (singleSided) {
            trimCurveAtEnd(leftSide, cornerShift);
            trimCurveAtEnd(rightSide, cornerShift);
            leftEnd = getLastOnCurvePoint(leftSide) || leftEnd;
            rightEnd = getLastOnCurvePoint(rightSide) || rightEnd;
          } else {
            // Shift existing corner points inward along skeleton
            leftEnd.x = Math.round(leftEnd.x + tIn.x * cornerShift);
            leftEnd.y = Math.round(leftEnd.y + tIn.y * cornerShift);
            rightEnd.x = Math.round(rightEnd.x + tIn.x * cornerShift);
            rightEnd.y = Math.round(rightEnd.y + tIn.y * cornerShift);
            rescaleAdjacentHandles(leftSide, leftEnd, origLeft, "backward");
            rescaleAdjacentHandles(rightSide, rightEnd, origRight, "backward");
          }
          if (segments[segments.length - 1]?.controlPoints?.length) {
            leftEnd.smooth = true;
            rightEnd.smooth = true;
          }
          const leftNormalShift = normalShift;
          const rightNormalShift = normalShift;
          const newLeft = {
            x: Math.round(origLeft.x + capDir.x * leftNormalShift),
            y: Math.round(origLeft.y + capDir.y * leftNormalShift),
            smooth: true,
          };
          const newRight = {
            x: Math.round(origRight.x - capDir.x * rightNormalShift),
            y: Math.round(origRight.y - capDir.y * rightNormalShift),
            smooth: true,
          };
          const midPoint = mergeCap
            ? {
                x: Math.round((newLeft.x + newRight.x) / 2),
                y: Math.round((newLeft.y + newRight.y) / 2),
                smooth: true,
              }
            : null;

          const leftSegHandles = computeTunniHandleLengths(
            leftEnd,
            tOut,
            mergeCap ? midPoint : newLeft,
            { x: -capDir.x, y: -capDir.y },
            capTension
          );
          const rightSegHandles = computeTunniHandleLengths(
            mergeCap ? midPoint : newRight,
            capDir,
            rightEnd,
            tOut,
            capTension
          );

          if (mergeCap) {
            endCap = [
              {
                x: Math.round(leftEnd.x + tOut.x * leftSegHandles.startLen),
                y: Math.round(leftEnd.y + tOut.y * leftSegHandles.startLen),
                type: "cubic",
              },
              {
                x: Math.round(midPoint.x - capDir.x * leftSegHandles.endLen),
                y: Math.round(midPoint.y - capDir.y * leftSegHandles.endLen),
                type: "cubic",
              },
              midPoint,
              {
                x: Math.round(midPoint.x + capDir.x * rightSegHandles.startLen),
                y: Math.round(midPoint.y + capDir.y * rightSegHandles.startLen),
                type: "cubic",
              },
              {
                x: Math.round(rightEnd.x + tOut.x * rightSegHandles.endLen),
                y: Math.round(rightEnd.y + tOut.y * rightSegHandles.endLen),
                type: "cubic",
              },
            ];
          } else {
            endCap = [
              {
                x: Math.round(leftEnd.x + tOut.x * leftSegHandles.startLen),
                y: Math.round(leftEnd.y + tOut.y * leftSegHandles.startLen),
                type: "cubic",
              },
              {
                x: Math.round(newLeft.x - capDir.x * leftSegHandles.endLen),
                y: Math.round(newLeft.y - capDir.y * leftSegHandles.endLen),
                type: "cubic",
              },
              newLeft,
              newRight,
              {
                x: Math.round(newRight.x + capDir.x * rightSegHandles.startLen),
                y: Math.round(newRight.y + capDir.y * rightSegHandles.startLen),
                type: "cubic",
              },
              {
                x: Math.round(rightEnd.x + tOut.x * rightSegHandles.endLen),
                y: Math.round(rightEnd.y + tOut.y * rightSegHandles.endLen),
                type: "cubic",
              },
            ];
          }
        }
      }
    } else {
      endCap = generateCap(
        lastOnCurvePoint,
        segments[segments.length - 1],
        defaultWidth,
        endCapStyle,
        "end",
        endCapLeftHW,
        endCapRightHW
      );
    }

    const outlinePoints = [];
    // Left side forward
    outlinePoints.push(...leftSide);
    // End cap
    outlinePoints.push(...endCap);
    // Right side backward
    outlinePoints.push(...rightSide.reverse());
    // Start cap
    outlinePoints.push(...startCap);

    // DISABLED for performance testing - alignHandleDirections is O(n³)
    // const alignedOutlinePoints = alignHandleDirections(outlinePoints, segments, null);

    let contour = { points: enforceSmoothColinearity(outlinePoints, true), isClosed: true };

    // Apply reverse if flag is set
    if (reversed) {
      contour = reverseContour(contour);
    }

    return [contour];
  }
}

/**
 * Reverse a contour's point order.
 * @param {Object} contour - Contour with points array and isClosed flag
 * @returns {Object} New contour with reversed points
 */
function reverseContour(contour) {
  const points = [...contour.points];
  points.reverse();
  if (contour.isClosed && points.length > 0) {
    // For closed contours, rotate so start point stays consistent
    const [lastPoint] = points.splice(-1, 1);
    points.splice(0, 0, lastPoint);
  }
  return { ...contour, points };
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

  // Use minimum threshold for error calculation when halfWidth is very small
  // This ensures simplification still works when one side collapses to skeleton
  const effectiveHalfWidth = Math.max(halfWidth, 1);

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
  const minError = effectiveHalfWidth * MIN_ERROR_PERCENT;
  const maxError = effectiveHalfWidth * MAX_ERROR_PERCENT;
  const step = effectiveHalfWidth * ERROR_STEP_PERCENT;

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
      // Apply nudge offset if point is editable
      let startLeftPt = {
        x: Math.round(segment.startPoint.x + startNormal.x * startLeftHW),
        y: Math.round(segment.startPoint.y + startNormal.y * startLeftHW),
      };
      startLeftPt = applyNudgeToRibPoint(startLeftPt, segment.startPoint, startNormal, "left", startLeftHW);
      left.push({ ...startLeftPt, smooth: segment.startPoint.smooth });

      let startRightPt = {
        x: Math.round(segment.startPoint.x - startNormal.x * startRightHW),
        y: Math.round(segment.startPoint.y - startNormal.y * startRightHW),
      };
      startRightPt = applyNudgeToRibPoint(startRightPt, segment.startPoint, startNormal, "right", startRightHW);
      right.push({ ...startRightPt, smooth: segment.startPoint.smooth });
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
      // Apply nudge offset if point is editable
      let endLeftPt = {
        x: Math.round(segment.endPoint.x + endNormal.x * endLeftHW),
        y: Math.round(segment.endPoint.y + endNormal.y * endLeftHW),
      };
      endLeftPt = applyNudgeToRibPoint(endLeftPt, segment.endPoint, endNormal, "left", endLeftHW);
      left.push({ ...endLeftPt, smooth: segment.endPoint.smooth });

      let endRightPt = {
        x: Math.round(segment.endPoint.x - endNormal.x * endRightHW),
        y: Math.round(segment.endPoint.y - endNormal.y * endRightHW),
      };
      endRightPt = applyNudgeToRibPoint(endRightPt, segment.endPoint, endNormal, "right", endRightHW);
      right.push({ ...endRightPt, smooth: segment.endPoint.smooth });
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
    // Apply nudge offset if points are editable
    let fixedStartLeft = {
      x: Math.round(segment.startPoint.x + startNormal.x * startLeftHW),
      y: Math.round(segment.startPoint.y + startNormal.y * startLeftHW),
    };
    fixedStartLeft = applyNudgeToRibPoint(fixedStartLeft, segment.startPoint, startNormal, "left", startLeftHW);

    let fixedStartRight = {
      x: Math.round(segment.startPoint.x - startNormal.x * startRightHW),
      y: Math.round(segment.startPoint.y - startNormal.y * startRightHW),
    };
    fixedStartRight = applyNudgeToRibPoint(fixedStartRight, segment.startPoint, startNormal, "right", startRightHW);

    let fixedEndLeft = {
      x: Math.round(segment.endPoint.x + endNormal.x * endLeftHW),
      y: Math.round(segment.endPoint.y + endNormal.y * endLeftHW),
    };
    fixedEndLeft = applyNudgeToRibPoint(fixedEndLeft, segment.endPoint, endNormal, "left", endLeftHW);

    let fixedEndRight = {
      x: Math.round(segment.endPoint.x - endNormal.x * endRightHW),
      y: Math.round(segment.endPoint.y - endNormal.y * endRightHW),
    };
    fixedEndRight = applyNudgeToRibPoint(fixedEndRight, segment.endPoint, endNormal, "right", endRightHW);

    // Helper to add offset curves to output array
    const addOffsetCurves = (curves, output, fixedStart, fixedEnd, shouldAddStart, shouldAddEnd, smoothStart, smoothEnd, sideHalfWidth, isLeftSide) => {
      const side = isLeftSide ? "left" : "right";
      // When halfWidth is near zero, contour should exactly match skeleton
      // Copy control points directly instead of using offset curves
      if (sideHalfWidth < 0.5 && segment.controlPoints.length > 0) {
        if (shouldAddStart) {
          output.push({ x: fixedStart.x, y: fixedStart.y, smooth: smoothStart });
        }
        // Copy skeleton control points (they're already at the right positions since offset is ~0)
        for (const cp of segment.controlPoints) {
          output.push({ x: Math.round(cp.x), y: Math.round(cp.y), type: "cubic" });
        }
        if (shouldAddEnd) {
          output.push({ x: fixedEnd.x, y: fixedEnd.y, smooth: smoothEnd });
        }
        return;
      }

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
        let adjustedHandle1 = {
          x: Math.round(fixedStart.x + h1Offset.x),
          y: Math.round(fixedStart.y + h1Offset.y),
        };
        let adjustedHandle2 = {
          x: Math.round(fixedEnd.x + h2Offset.x),
          y: Math.round(fixedEnd.y + h2Offset.y),
        };

        // Apply handle offsets if the skeleton points are editable
        const startHandleDir = getSkeletonHandleDirection(segment, "start", "out");
        const endHandleDir = getSkeletonHandleDirection(segment, "end", "in");

        if (startHandleDir) {
          adjustedHandle1 = applyHandleOffsetToControlPoint(
            adjustedHandle1, segment.startPoint, startHandleDir, side, "out", fixedStart
          );
        }
        if (endHandleDir) {
          adjustedHandle2 = applyHandleOffsetToControlPoint(
            adjustedHandle2, segment.endPoint, endHandleDir, side, "in", fixedEnd
          );
        }

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
          let adjustedH1 = {
            x: Math.round(currentStart.x + h1Offset.x),
            y: Math.round(currentStart.y + h1Offset.y),
          };
          let adjustedH2 = {
            x: Math.round(currentEnd.x + h2Offset.x),
            y: Math.round(currentEnd.y + h2Offset.y),
          };

          // Apply handle offsets for first and last curves
          if (isFirstCurve) {
            const startHandleDir = getSkeletonHandleDirection(segment, "start", "out");
            if (startHandleDir) {
              adjustedH1 = applyHandleOffsetToControlPoint(
                adjustedH1, segment.startPoint, startHandleDir, side, "out", fixedStart
              );
            }
          }
          if (isLastCurve) {
            const endHandleDir = getSkeletonHandleDirection(segment, "end", "in");
            if (endHandleDir) {
              adjustedH2 = applyHandleOffsetToControlPoint(
                adjustedH2, segment.endPoint, endHandleDir, side, "in", fixedEnd
              );
            }
          }

          output.push({
            x: adjustedH1.x,
            y: adjustedH1.y,
            type: "cubic",
          });
          output.push({
            x: adjustedH2.x,
            y: adjustedH2.y,
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
      avgLeftHW,
      true  // isLeftSide
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
      avgRightHW,
      false  // isLeftSide
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

function normalizeCapStyle(style) {
  if (!style) return "butt";
  if (style === "square") return "butt"; // Temporary: square behaves like flat
  return style;
}

function getSegmentTangent(segment, position) {
  if (segment.controlPoints.length === 0) {
    const direction = vector.normalizeVector(
      vector.subVectors(segment.endPoint, segment.startPoint)
    );
    return direction;
  }
  const bezier = createBezierFromPoints([
    segment.startPoint,
    ...segment.controlPoints,
    segment.endPoint,
  ]);
  const t = position === "start" ? 0 : 1;
  const deriv = bezier.derivative(t);
  return vector.normalizeVector({ x: deriv.x, y: deriv.y });
}

function getFirstOnCurvePoint(points) {
  if (!points) return null;
  for (const point of points) {
    if (!point.type) return point;
  }
  return null;
}

function getLastOnCurvePoint(points) {
  if (!points) return null;
  for (let i = points.length - 1; i >= 0; i--) {
    if (!points[i].type) return points[i];
  }
  return null;
}

function rescaleAdjacentHandles(points, onCurvePoint, origPos, direction) {
  if (!points || !onCurvePoint || !origPos) return;
  const idx = points.indexOf(onCurvePoint);
  if (idx === -1) return;
  const step = direction === "backward" ? -1 : 1;

  let neighborIdx = null;
  for (let i = idx + step; i >= 0 && i < points.length; i += step) {
    if (!points[i]?.type) {
      neighborIdx = i;
      break;
    }
  }
  if (neighborIdx === null) return;

  const neighbor = points[neighborIdx];
  const distBefore = Math.hypot(neighbor.x - origPos.x, neighbor.y - origPos.y);
  const distAfter = Math.hypot(neighbor.x - onCurvePoint.x, neighbor.y - onCurvePoint.y);
  const scale = distBefore > 0.001 ? distAfter / distBefore : 1;

  for (let i = idx + step; i !== neighborIdx; i += step) {
    const point = points[i];
    if (!point?.type) break;
    const offsetX = point.x - origPos.x;
    const offsetY = point.y - origPos.y;
    point.x = Math.round(onCurvePoint.x + offsetX * scale);
    point.y = Math.round(onCurvePoint.y + offsetY * scale);
  }
}

function findTAtLength(bezier, targetLen, steps = 80) {
  const lut = bezier.getLUT(steps);
  let prev = lut[0];
  let accumulated = 0;

  for (let i = 1; i < lut.length; i++) {
    const curr = lut[i];
    const segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (accumulated + segLen >= targetLen) {
      const ratio = segLen > 0.001 ? (targetLen - accumulated) / segLen : 0;
      return prev.t + (curr.t - prev.t) * ratio;
    }
    accumulated += segLen;
    prev = curr;
  }

  return 1;
}

function getCurveSegmentIndices(points, fromEnd = false) {
  if (!points || points.length < 2) return null;
  if (!fromEnd) {
    let startIdx = -1;
    for (let i = 0; i < points.length; i++) {
      if (!points[i]?.type) {
        startIdx = i;
        break;
      }
    }
    if (startIdx < 0) return null;
    let endIdx = -1;
    for (let i = startIdx + 1; i < points.length; i++) {
      if (!points[i]?.type) {
        endIdx = i;
        break;
      }
    }
    if (endIdx < 0) return null;
    return { startIdx, endIdx };
  }

  let endIdx = -1;
  for (let i = points.length - 1; i >= 0; i--) {
    if (!points[i]?.type) {
      endIdx = i;
      break;
    }
  }
  if (endIdx < 0) return null;
  let startIdx = -1;
  for (let i = endIdx - 1; i >= 0; i--) {
    if (!points[i]?.type) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return null;
  return { startIdx, endIdx };
}

function applySegmentPoints(points, startIdx, endIdx, newPoints) {
  const controlCount = endIdx - startIdx - 1;
  if (newPoints.length !== controlCount + 2) return false;

  const writePoint = (idx, src) => {
    points[idx].x = Math.round(src.x);
    points[idx].y = Math.round(src.y);
  };

  writePoint(startIdx, newPoints[0]);
  for (let i = 0; i < controlCount; i++) {
    writePoint(startIdx + 1 + i, newPoints[1 + i]);
  }
  writePoint(endIdx, newPoints[newPoints.length - 1]);
  return true;
}

function trimCurveAtStart(points, distance) {
  if (!points || distance <= 0.001) return false;
  const segment = getCurveSegmentIndices(points, false);
  if (!segment) return false;
  const { startIdx, endIdx } = segment;
  const controls = points.slice(startIdx + 1, endIdx);
  const bezier = createBezierFromPoints([points[startIdx], ...controls, points[endIdx]]);
  const totalLen = bezier.length();
  if (!(totalLen > 0.001)) return false;

  const targetLen = Math.min(distance, Math.max(totalLen - 0.001, 0));
  if (!(targetLen > 0.001)) return false;

  const t = findTAtLength(bezier, targetLen);
  const split = bezier.split(t);
  return applySegmentPoints(points, startIdx, endIdx, split.right.points);
}

function trimCurveAtEnd(points, distance) {
  if (!points || distance <= 0.001) return false;
  const segment = getCurveSegmentIndices(points, true);
  if (!segment) return false;
  const { startIdx, endIdx } = segment;
  const controls = points.slice(startIdx + 1, endIdx);
  const bezier = createBezierFromPoints([points[startIdx], ...controls, points[endIdx]]);
  const totalLen = bezier.length();
  if (!(totalLen > 0.001)) return false;

  const targetLen = Math.max(totalLen - distance, 0.001);
  if (!(targetLen > 0.001)) return false;

  const t = findTAtLength(bezier, targetLen);
  const split = bezier.split(t);
  return applySegmentPoints(points, startIdx, endIdx, split.left.points);
}

function computeTunniHandleLengths(startPoint, startDir, endPoint, endDir, tension) {
  const dir1 = vector.normalizeVector(startDir);
  const dir2 = vector.normalizeVector(endDir);
  const line1End = vector.addVectors(startPoint, dir1);
  const line2End = vector.addVectors(endPoint, dir2);

  const intersection = vector.intersect(startPoint, line1End, endPoint, line2End);
  if (intersection && Number.isFinite(intersection.t1) && Number.isFinite(intersection.t2)) {
    const distStartToTunni = Math.abs(intersection.t1);
    const distEndToTunni = Math.abs(intersection.t2);
    return {
      startLen: distStartToTunni * tension,
      endLen: distEndToTunni * tension,
    };
  }

  const distTotal = vector.distance(startPoint, endPoint);
  const fallbackLen = (distTotal * tension) / 2;
  return { startLen: fallbackLen, endLen: fallbackLen };
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
