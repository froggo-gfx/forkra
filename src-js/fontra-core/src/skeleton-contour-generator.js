import { Bezier } from "bezier-js";
import * as vector from "./vector.js";
import { packContour, VarPackedPath } from "./var-path.js";
import { fitCubic, chordLengthParameterize, computeMaxError } from "./fit-cubic.js";
import {
  deleteFontraInternalSection,
  getFontraInternalSection,
  setFontraInternalSection,
} from "./fontra-internal-data.js";
import { FONTRA_INTERNAL_KEY, FONTRA_INTERNAL_SECTIONS } from "./fontra-internal-schema.js";

const DEFAULT_WIDTH = 80;
const DEFAULT_CAP_RADIUS_RATIO = 1 / 8;
const MAX_CAP_RADIUS_RATIO = 1 / 4;
const DEFAULT_CAP_TENSION = 0.55;
const DEFAULT_CAP_ANGLE = 0;
const MAX_CAP_ANGLE = 85;
const DEFAULT_CORNER_ROUNDNESS = 0;
const DEFAULT_CORNER_ASYMMETRY = 0;
const MIN_CORNER_TRIM = 0.5;
const MAX_CORNER_TRIM_RATIO = 0.5;
const MAX_HANDLE_TRIM_RATIO = 0.99;
const DEFAULT_CORNER_RADIUS_BOOST = 1;
const MIN_CORNER_RADIUS_BOOST = 0.1;
const MAX_CORNER_RADIUS_BOOST = 4;

function clampCornerTrimRatio(value) {
  if (!Number.isFinite(value)) {
    return MAX_CORNER_TRIM_RATIO;
  }
  return Math.min(Math.max(value, 0.05), 0.99);
}

function clampCornerRadiusBoost(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_CORNER_RADIUS_BOOST;
  }
  return Math.min(Math.max(value, MIN_CORNER_RADIUS_BOOST), MAX_CORNER_RADIUS_BOOST);
}

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

function clampCornerRoundness(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_CORNER_ROUNDNESS;
  }
  return Math.min(Math.max(value, 0), 1);
}

function getCornerRoundness(point) {
  return clampCornerRoundness(point?.cornerRoundness ?? DEFAULT_CORNER_ROUNDNESS);
}

function clampCornerAsymmetry(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_CORNER_ASYMMETRY;
  }
  return Math.min(Math.max(value, -1), 1);
}

function getCornerAsymmetry(point) {
  return clampCornerAsymmetry(point?.cornerAsymmetry ?? DEFAULT_CORNER_ASYMMETRY);
}

function buildGeneratedOnCurve(
  basePoint,
  smooth,
  skeletonPoint,
  halfWidth,
  cornerRoundBaseOverride = undefined
) {
  const generatedPoint = {
    x: basePoint.x,
    y: basePoint.y,
    smooth,
  };
  const cornerRoundness = getCornerRoundness(skeletonPoint);
  const cornerAsymmetry = getCornerAsymmetry(skeletonPoint);
  const cornerReach = skeletonPoint?.cornerReach;
  const roundnessStrength = skeletonPoint?.roundnessStrength;
  const cornerRoundBase = Math.max(0, cornerRoundBaseOverride ?? halfWidth ?? 0);
  if (cornerRoundness > 0 && cornerRoundBase >= 0.5) {
    generatedPoint.cornerRoundness = cornerRoundness;
    generatedPoint.cornerRoundBase = cornerRoundBase;
  }
  if (cornerAsymmetry !== 0) {
    generatedPoint.cornerAsymmetry = cornerAsymmetry;
  }
  if (Number.isFinite(cornerReach)) {
    generatedPoint.cornerReach = cornerReach;
  }
  if (Number.isFinite(roundnessStrength)) {
    generatedPoint.roundnessStrength = roundnessStrength;
  }
  return generatedPoint;
}

function stripCornerRoundMetadata(points) {
  return points.map((point) => {
    if (!point || point.type) {
      return point;
    }
    if (
      point.cornerRoundness === undefined &&
      point.cornerRoundBase === undefined &&
      point.cornerAsymmetry === undefined &&
      point.cornerReach === undefined &&
      point.roundnessStrength === undefined
    ) {
      return point;
    }
    const {
      cornerRoundness: _cornerRoundness,
      cornerRoundBase: _cornerRoundBase,
      cornerAsymmetry: _cornerAsymmetry,
      cornerReach: _cornerReach,
      roundnessStrength: _roundnessStrength,
      ...rest
    } = point;
    return rest;
  });
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
const NEAR_ZERO_HANDLE_THRESHOLD = 1.25;
const NEAR_ZERO_HANDLE_TARGET = 1;
const MAX_HANDLE_TO_CHORD_RATIO = 2.0;
const MAX_NEAR_ZERO_ROTATION_DEG = 35;
const SKELETON_DEBUG_PREFIX = "[SKELETON GEN DEBUG]";
const ENABLE_EXPERIMENTAL_HANDLE_STABILIZATION = false;

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
function enforceSmoothColinearity(
  points,
  isClosed,
  options = {}
) {
  const {
    includeLinearNeighborCases = true,
    maxHandleRotationDeg = 60,
    minReliableHandleLength = 0.75,
  } = options;
  if (!points || points.length < 2) return points;

  const numPoints = points.length;
  const hasRotationLimit =
    Number.isFinite(maxHandleRotationDeg) && maxHandleRotationDeg < 179.999;
  const maxRotationCos = hasRotationLimit
    ? Math.cos((Math.max(0, maxHandleRotationDeg) * Math.PI) / 180)
    : -1;

  // Process all smooth points
  for (let i = 0; i < numPoints; i++) {
    const point = points[i];

    // Only process on-curve smooth points
    if (point.type || !point.smooth) continue;
    if (point.skipColinear) continue;

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

        // Near-zero handles are numerically unstable: don't let them rotate long handles.
        const inIsTiny = lenIn < minReliableHandleLength;
        const outIsTiny = lenOut < minReliableHandleLength;
        if (inIsTiny || outIsTiny) {
          // Near-zero handles are too noisy for direction enforcement.
          // Leave them untouched to avoid accidental flips.
          continue;
        }

        // Use length-weighted direction so long handles dominate and short handles
        // don't cause direction flips when they approach zero length.
        const avgDir = vector.normalizeVector({
          x: dirIn.x * lenIn - dirOut.x * lenOut,
          y: dirIn.y * lenIn - dirOut.y * lenOut,
        });

        // If directions are nearly opposite (already colinear), skip
        const dot = dirIn.x * dirOut.x + dirIn.y * dirOut.y;
        if (dot > -0.999) { // Not nearly opposite
          // If avgDir is zero (handles point same direction), use perpendicular
          if (Math.hypot(avgDir.x, avgDir.y) >= 0.001) {
            // Avoid large handle flips: only enforce when required rotation is bounded.
            const prevTargetAlignment = dirIn.x * avgDir.x + dirIn.y * avgDir.y;
            const nextTargetAlignment = -dirOut.x * avgDir.x - dirOut.y * avgDir.y;
            if (
              hasRotationLimit &&
              (prevTargetAlignment < maxRotationCos ||
                nextTargetAlignment < maxRotationCos)
            ) {
              continue;
            }

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
    else if (includeLinearNeighborCases && prevIsOnCurve && !nextIsOnCurve) {
      // Smooth point with linear segment before and curve after
      // The smooth point should act as a pivot: the off-curve handle should be collinear
      // with the linear segment, extending its direction
      const linearVec = { x: point.x - prevPoint.x, y: point.y - prevPoint.y }; // Vector from prev linear point to smooth point
      const linearLen = Math.hypot(linearVec.x, linearVec.y);
      if (!(linearLen > 0.001)) {
        continue;
      }
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
    else if (includeLinearNeighborCases && !prevIsOnCurve && nextIsOnCurve) {
      // Smooth point with curve before and linear segment after
      // The previous off-curve handle should be collinear with the next linear segment
      const linearVec = { x: nextPoint.x - point.x, y: nextPoint.y - point.y }; // Vector from smooth point to next linear point
      const linearLen = Math.hypot(linearVec.x, linearVec.y);
      if (!(linearLen > 0.001)) {
        continue;
      }
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
    else if (includeLinearNeighborCases && prevIsOnCurve && nextIsOnCurve) {
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

function getPrevIndex(points, index, isClosed) {
  if (!points.length) {
    return null;
  }
  if (index > 0) {
    return index - 1;
  }
  return isClosed ? points.length - 1 : null;
}

function getNextIndex(points, index, isClosed) {
  if (!points.length) {
    return null;
  }
  if (index < points.length - 1) {
    return index + 1;
  }
  return isClosed ? 0 : null;
}

function findPrevOnCurveIndex(points, index, isClosed) {
  let cursor = getPrevIndex(points, index, isClosed);
  if (cursor === null) {
    return null;
  }
  const visited = new Set();
  while (cursor !== null && !visited.has(cursor)) {
    visited.add(cursor);
    if (!points[cursor]?.type) {
      return cursor;
    }
    cursor = getPrevIndex(points, cursor, isClosed);
  }
  return null;
}

function findNextOnCurveIndex(points, index, isClosed) {
  let cursor = getNextIndex(points, index, isClosed);
  if (cursor === null) {
    return null;
  }
  const visited = new Set();
  while (cursor !== null && !visited.has(cursor)) {
    visited.add(cursor);
    if (!points[cursor]?.type) {
      return cursor;
    }
    cursor = getNextIndex(points, cursor, isClosed);
  }
  return null;
}

function roundSharpCornersOnSide(
  sidePoints,
  { isClosed, cornerTrimRatio, cornerRadiusBoost, side }
) {
  const points = sidePoints.map((point) => ({ ...point }));
  if (points.length < 3) {
    return points;
  }

  const cornerInfos = new Map();
  const onCurvePoints = [];

  for (let i = 0; i < points.length; i++) {
    const corner = points[i];
    if (!corner || corner.type) {
      continue;
    }
    onCurvePoints.push(corner);
    if (corner.smooth) {
      continue;
    }

    const baseRoundness = clampCornerRoundness(corner.cornerRoundness);
    const cornerAsymmetry = getCornerAsymmetry(corner);
    const effectiveCornerTrimRatio = clampCornerTrimRatio(
      Number.isFinite(corner.cornerReach) ? corner.cornerReach : cornerTrimRatio
    );
    const effectiveCornerRadiusBoost = clampCornerRadiusBoost(
      Number.isFinite(corner.roundnessStrength)
        ? corner.roundnessStrength
        : cornerRadiusBoost
    );
    let cornerRoundness = baseRoundness;
    if (cornerRoundness > 0 && side && cornerAsymmetry !== 0) {
      let scale = 1;
      if (side === "left" && cornerAsymmetry < 0) {
        scale = 1 + cornerAsymmetry;
      } else if (side === "right" && cornerAsymmetry > 0) {
        scale = 1 - cornerAsymmetry;
      }
      scale = Math.min(Math.max(scale, 0), 1);
      cornerRoundness = cornerRoundness * scale;
    }
    const cornerRoundBase = Math.max(0, corner.cornerRoundBase ?? 0);
    if (cornerRoundness <= 0 || cornerRoundBase < 0.5) {
      continue;
    }

    const prevOnIndex = findPrevOnCurveIndex(points, i, isClosed);
    const nextOnIndex = findNextOnCurveIndex(points, i, isClosed);
    if (prevOnIndex === null || nextOnIndex === null) {
      continue;
    }

    const prevNeighborIndex = getPrevIndex(points, i, isClosed);
    const nextNeighborIndex = getNextIndex(points, i, isClosed);
    const prevHandleIndex =
      prevNeighborIndex !== null && points[prevNeighborIndex]?.type
        ? prevNeighborIndex
        : null;
    const nextHandleIndex =
      nextNeighborIndex !== null && points[nextNeighborIndex]?.type
        ? nextNeighborIndex
        : null;

    const prevReference =
      prevHandleIndex !== null ? points[prevHandleIndex] : points[prevOnIndex];
    const nextReference =
      nextHandleIndex !== null ? points[nextHandleIndex] : points[nextOnIndex];
    if (!prevReference || !nextReference) {
      continue;
    }

    const dirInAway = vector.normalizeVector(
      vector.subVectors(prevReference, corner)
    );
    const dirOutAway = vector.normalizeVector(
      vector.subVectors(nextReference, corner)
    );
    if (
      !Number.isFinite(dirInAway.x) ||
      !Number.isFinite(dirInAway.y) ||
      !Number.isFinite(dirOutAway.x) ||
      !Number.isFinite(dirOutAway.y)
    ) {
      continue;
    }

    const betaCos = Math.min(
      Math.max(vector.dotVector(dirInAway, dirOutAway), -1),
      1
    );
    const beta = Math.acos(betaCos);
    if (!(beta > 1e-4 && beta < Math.PI - 1e-4)) {
      continue;
    }
    const tanHalf = Math.tan(beta / 2);
    if (!(tanHalf > 1e-6)) {
      continue;
    }

    const distPrevOn = vector.distance(corner, points[prevOnIndex]);
    const distNextOn = vector.distance(corner, points[nextOnIndex]);
    const handleTrimRatio = MAX_HANDLE_TRIM_RATIO;
    const minTrim = 0;
    let maxTrimIn = distPrevOn * effectiveCornerTrimRatio;
    let maxTrimOut = distNextOn * effectiveCornerTrimRatio;

    if (prevHandleIndex !== null) {
      maxTrimIn = Math.min(
        maxTrimIn,
        vector.distance(corner, points[prevHandleIndex]) * handleTrimRatio
      );
    }
    if (nextHandleIndex !== null) {
      maxTrimOut = Math.min(
        maxTrimOut,
        vector.distance(corner, points[nextHandleIndex]) * handleTrimRatio
      );
    }

    const maxTrim = Math.min(maxTrimIn, maxTrimOut);
    if (!Number.isFinite(maxTrim) || maxTrim <= minTrim) {
      continue;
    }

    const roundnessRatio = Math.min(
      Math.max(cornerRoundness * effectiveCornerRadiusBoost, 0),
      1
    );
    if (!(roundnessRatio > 0)) {
      continue;
    }

    const trimIn = maxTrimIn * roundnessRatio;
    const trimOut = maxTrimOut * roundnessRatio;
    if (
      !Number.isFinite(trimIn) ||
      !Number.isFinite(trimOut) ||
      trimIn <= minTrim ||
      trimOut <= minTrim
    ) {
      continue;
    }

    const maxRadius = maxTrim * tanHalf;
    const radiusIn = trimIn * tanHalf;
    const radiusOut = trimOut * tanHalf;
    const kappa = (4 / 3) * Math.tan(beta / 4);
    const arcHandleLenIn =
      Number.isFinite(radiusIn) && Number.isFinite(kappa)
        ? Math.max(0, radiusIn * kappa)
        : 0;
    const arcHandleLenOut =
      Number.isFinite(radiusOut) && Number.isFinite(kappa)
        ? Math.max(0, radiusOut * kappa)
        : 0;
    const arcHandleLen = Math.max(arcHandleLenIn, arcHandleLenOut);

    cornerInfos.set(corner, {
      trimIn,
      trimOut,
      dirInAway,
      dirOutAway,
      arcHandleLen,
      prevHandlePoint: prevHandleIndex !== null ? points[prevHandleIndex] : null,
      nextHandlePoint: nextHandleIndex !== null ? points[nextHandleIndex] : null,
    });
  }

  if (cornerInfos.size > 1 && onCurvePoints.length > 1) {
    const limitSegmentTrims = (pointA, pointB) => {
      const infoA = cornerInfos.get(pointA);
      const infoB = cornerInfos.get(pointB);
      if (!infoA || !infoB) {
        return;
      }
      const minGap = 0;
      const dx = pointB.x - pointA.x;
      const dy = pointB.y - pointA.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 1e-6) {
        infoA.trim = 0;
        infoB.trim = 0;
        return;
      }

      const ux = dx / segLen;
      const uy = dy / segLen;
      const inter = vector.intersect(
        pointA,
        { x: pointA.x + infoA.dirOutAway.x, y: pointA.y + infoA.dirOutAway.y },
        pointB,
        { x: pointB.x + infoB.dirInAway.x, y: pointB.y + infoB.dirInAway.y }
      );
      if (
        inter &&
        Number.isFinite(inter.t1) &&
        Number.isFinite(inter.t2) &&
        inter.t1 >= 0 &&
        inter.t2 >= 0 &&
        inter.t1 <= infoA.trimOut + 1e-6 &&
        inter.t2 <= infoB.trimIn + 1e-6
      ) {
        infoA.trimOut = inter.t1;
        infoB.trimIn = inter.t2;
        return;
      }

      const kA = Math.max(0, infoA.dirOutAway.x * ux + infoA.dirOutAway.y * uy);
      const kB = Math.max(0, -infoB.dirInAway.x * ux - infoB.dirInAway.y * uy);
      if (!(kA > 0 || kB > 0)) {
        return;
      }

      const budget = Math.max(segLen - minGap, 0);
      const consA = kA * infoA.trimOut;
      const consB = kB * infoB.trimIn;
      const sum = consA + consB;
      if (sum <= budget) {
        return;
      }

      const scale = sum > 0 ? budget / sum : 0;
      infoA.trimOut *= scale;
      infoB.trimIn *= scale;
    };

    for (let i = 0; i < onCurvePoints.length - 1; i++) {
      limitSegmentTrims(onCurvePoints[i], onCurvePoints[i + 1]);
    }
    if (isClosed && onCurvePoints.length > 2) {
      limitSegmentTrims(
        onCurvePoints[onCurvePoints.length - 1],
        onCurvePoints[0]
      );
    }
  }

  let i = 0;
  while (i < points.length) {
    const corner = points[i];
    const cornerInfo = cornerInfos.get(corner);
    if (!cornerInfo) {
      i++;
      continue;
    }

    const trimIn = cornerInfo.trimIn;
    const trimOut = cornerInfo.trimOut;
    if (
      !Number.isFinite(trimIn) ||
      !Number.isFinite(trimOut) ||
      trimIn < 0 ||
      trimOut < 0
    ) {
      i++;
      continue;
    }

    const startPoint = {
      x: corner.x + cornerInfo.dirInAway.x * trimIn,
      y: corner.y + cornerInfo.dirInAway.y * trimIn,
      smooth: true,
    };
    const endPoint = {
      x: corner.x + cornerInfo.dirOutAway.x * trimOut,
      y: corner.y + cornerInfo.dirOutAway.y * trimOut,
      smooth: true,
    };

    const startTangent = {
      x: -cornerInfo.dirInAway.x,
      y: -cornerInfo.dirInAway.y,
    };
    const endTangent = {
      x: cornerInfo.dirOutAway.x,
      y: cornerInfo.dirOutAway.y,
    };
    let handleLengths = computeTunniHandleLengths(
      startPoint,
      startTangent,
      endPoint,
      { x: -endTangent.x, y: -endTangent.y },
      DEFAULT_CAP_TENSION
    );
    const chord = vector.distance(startPoint, endPoint);
    const fallbackLen = cornerInfo.arcHandleLen;
    if (
      (!(chord > 1e-3) ||
        !(handleLengths.startLen > 1e-3) ||
        !(handleLengths.endLen > 1e-3)) &&
      fallbackLen > 0
    ) {
      handleLengths = {
        startLen: fallbackLen,
        endLen: fallbackLen,
      };
    }

    const handleIn = {
      x: startPoint.x + startTangent.x * handleLengths.startLen,
      y: startPoint.y + startTangent.y * handleLengths.startLen,
      type: "cubic",
    };
    const handleOut = {
      x: endPoint.x - endTangent.x * handleLengths.endLen,
      y: endPoint.y - endTangent.y * handleLengths.endLen,
      type: "cubic",
    };

    const deltaIn = {
      x: startPoint.x - corner.x,
      y: startPoint.y - corner.y,
    };
    const deltaOut = {
      x: endPoint.x - corner.x,
      y: endPoint.y - corner.y,
    };

    if (cornerInfo.prevHandlePoint) {
      cornerInfo.prevHandlePoint.x += deltaIn.x;
      cornerInfo.prevHandlePoint.y += deltaIn.y;
    }
    if (cornerInfo.nextHandlePoint) {
      cornerInfo.nextHandlePoint.x += deltaOut.x;
      cornerInfo.nextHandlePoint.y += deltaOut.y;
    }

    points.splice(i, 1, startPoint, handleIn, handleOut, endPoint);
    i += 4;
  }

  return points;
}

/**
 * Generates outline contours from skeleton data.
 * @param {Object} skeletonData - The skeleton data from customData["fontra.internal"].skeleton
 * @returns {Array} Array of unpacked contours ready to add to path
 */
export function generateContoursFromSkeleton(skeletonData) {
  if (!skeletonData?.contours?.length) {
    return [];
  }

  const cornerTrimRatio = MAX_CORNER_TRIM_RATIO;
  const cornerRadiusBoost = DEFAULT_CORNER_RADIUS_BOOST;

  const generatedContours = [];

  for (let contourIndex = 0; contourIndex < skeletonData.contours.length; contourIndex++) {
    const skeletonContour = skeletonData.contours[contourIndex];
    if (skeletonContour.points.length < 2) {
      continue;
    }

    const outlineContours = generateOutlineFromSkeletonContour(skeletonContour, {
      contourIndex,
      cornerTrimRatio,
      cornerRadiusBoost,
    });
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
export function generateOutlineFromSkeletonContour(skeletonContour, options = {}) {
  const {
    points,
    isClosed,
    defaultWidth = DEFAULT_WIDTH,
    capStyle = "butt",
    reversed = false,
    singleSided = false,
    singleSidedDirection = "left",
    cornerTrimRatio = MAX_CORNER_TRIM_RATIO,
    cornerRadiusBoost = DEFAULT_CORNER_RADIUS_BOOST,
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
      endRightHalfWidth,
      {
        contourIndex: options.contourIndex ?? null,
        segmentIndex: i,
      },
      singleSided,
      singleSidedDirection
    );

    leftSide.push(...offsetPoints.left);
    rightSide.push(...offsetPoints.right);
  }

  let roundedLeftSide = roundSharpCornersOnSide(leftSide, {
    isClosed,
    cornerTrimRatio: clampCornerTrimRatio(options.cornerTrimRatio ?? cornerTrimRatio),
    cornerRadiusBoost: clampCornerRadiusBoost(
      options.cornerRadiusBoost ?? cornerRadiusBoost
    ),
    side: "left",
  });
  let roundedRightSide = roundSharpCornersOnSide(rightSide, {
    isClosed,
    cornerTrimRatio: clampCornerTrimRatio(options.cornerTrimRatio ?? cornerTrimRatio),
    cornerRadiusBoost: clampCornerRadiusBoost(
      options.cornerRadiusBoost ?? cornerRadiusBoost
    ),
    side: "right",
  });

  if (isClosed) {
    // For closed skeleton: TWO separate contours (outer and inner)
    // The inner contour needs to be reversed for correct winding direction
    // (outer = counter-clockwise, inner = clockwise for proper fill)
    const reversedRight = [...roundedRightSide].reverse();

    // DISABLED for performance testing - alignHandleDirections is O(n³)
    // const alignedLeftSide = alignHandleDirections(leftSide, segments, true);
    // const alignedRightSide = alignHandleDirections(reversedRight, segments, false);

    const leftContourPoints = enforceSmoothColinearity(
      stripCornerRoundMetadata(roundedLeftSide),
      true,
      {
      includeLinearNeighborCases: true,
      maxHandleRotationDeg: 60,
      }
    );
    const rightContourPoints = enforceSmoothColinearity(
      stripCornerRoundMetadata(reversedRight),
      true,
      {
      includeLinearNeighborCases: true,
      maxHandleRotationDeg: 60,
      }
    );

    let contours = [
      { points: leftContourPoints, isClosed: true },
      { points: rightContourPoints, isClosed: true },
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
      const startIsSquare = startCapStyle === "square";
      const endIsSquare = endCapStyle === "square";

    let startCap = [];
    let endCap = [];

      if (startIsRound) {
        const startTangent = getSegmentTangent(segments[0], "start");
        const leftStart = getFirstOnCurvePoint(roundedLeftSide);
        const rightStart = getFirstOnCurvePoint(roundedRightSide);
        if (leftStart && rightStart) {
          const capWidth = startCapLeftHW + startCapRightHW;
          const capRadiusRatio =
            firstOnCurvePoint.capRadiusRatio ??
            skeletonContour.capRadiusRatio ??
            DEFAULT_CAP_RADIUS_RATIO;
          const capTension =
            firstOnCurvePoint.capTension ??
            skeletonContour.capTension ??
            DEFAULT_CAP_TENSION;
          const frame = getRoundCapFrame({
            endpointTangent: startTangent,
            capRadiusRatio,
            capWidth,
            position: "start",
          });
          const rightNext = getNextOnCurvePoint(roundedRightSide, 0);
          const leftNext = getNextOnCurvePoint(roundedLeftSide, 0);
          const rightChordDirection = rightNext
            ? vector.normalizeVector(vector.subVectors(rightStart, rightNext))
            : frame.capTangent;
          const leftChordDirection = leftNext
            ? vector.normalizeVector(vector.subVectors(leftStart, leftNext))
            : frame.capTangent;
          const rightSplit = splitTerminalSideForRoundCap(
            roundedRightSide,
            "start",
            frame.trimDistance,
            {
              endpointTangent: frame.capTangent,
              chordDirection: rightChordDirection,
              capTangent: frame.capTangent,
            }
          );
          const leftSplit = splitTerminalSideForRoundCap(
            roundedLeftSide,
            "start",
            frame.trimDistance,
            {
              endpointTangent: frame.capTangent,
              chordDirection: leftChordDirection,
              capTangent: frame.capTangent,
            }
          );
          if (rightSplit && leftSplit) {
            roundedRightSide = trimSideForRoundCapEmission(
              rightSplit.sidePoints,
              "start",
              rightSplit.referenceEndpointIndex
            );
            roundedLeftSide = trimSideForRoundCapEmission(
              leftSplit.sidePoints,
              "start",
              leftSplit.referenceEndpointIndex
            );
            startCap = buildRoundCapGeometry({
              position: "start",
              insertedLeft: leftSplit.insertedPoint,
              insertedRight: rightSplit.insertedPoint,
              leftTangentToEndpoint: leftSplit.tangentToEndpoint,
              rightTangentToEndpoint: rightSplit.tangentToEndpoint,
              referenceLeft: leftSplit.referenceEndpoint,
              referenceRight: rightSplit.referenceEndpoint,
              capTangent: frame.capTangent,
              capTension,
              radiusFactor: frame.radiusFactor,
              capWidth,
            }).capPoints;
          }
        }
      } else if (startIsSquare) {
        const startAngle =
          firstOnCurvePoint.capAngle ??
          skeletonContour.capAngle ??
          DEFAULT_CAP_ANGLE;
        const startDistance =
          firstOnCurvePoint.capDistance ??
          skeletonContour.capDistance ??
          0;
        const clampedAngle = Math.min(Math.max(startAngle, -MAX_CAP_ANGLE), MAX_CAP_ANGLE);
        const startTangent = getSegmentTangent(segments[0], "start");
        const capTangent = { x: -startTangent.x, y: -startTangent.y };
        const capWidth = startCapLeftHW + startCapRightHW;
        const delta = Math.tan((Math.abs(clampedAngle) * Math.PI) / 180) * capWidth;
        const hasAngle = Math.abs(clampedAngle) > 0.001;
        const hasDistance = startDistance > 0.001;
        let moveLeft = clampedAngle > 0;
        if (startCapLeftHW < 0.5 && startCapRightHW > 0.5) moveLeft = false;
        if (startCapRightHW < 0.5 && startCapLeftHW > 0.5) moveLeft = true;

        const leftStart = getFirstOnCurvePoint(roundedLeftSide);
        const rightStart = getFirstOnCurvePoint(roundedRightSide);
        const leftHandleDir = getSideHandleDirection(roundedLeftSide, "start");
        const rightHandleDir = getSideHandleDirection(roundedRightSide, "start");
        const addLeft = hasDistance || (hasAngle && moveLeft);
        const addRight = hasDistance || (hasAngle && !moveLeft);
        const leftDelta = hasAngle && moveLeft ? delta : 0;
        const rightDelta = hasAngle && !moveLeft ? delta : 0;
        if (addLeft) {
          const leftExtra = createSquareCapPoint(
            leftStart,
            leftHandleDir,
            capTangent,
            hasDistance ? startDistance : 0,
            leftDelta
          );
          if (leftExtra) roundedLeftSide.unshift(leftExtra);
        }
        if (addRight) {
          const rightExtra = createSquareCapPoint(
            rightStart,
            rightHandleDir,
            capTangent,
            hasDistance ? startDistance : 0,
            rightDelta
          );
          if (rightExtra) roundedRightSide.unshift(rightExtra);
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
        const endTangent = getSegmentTangent(segments[segments.length - 1], "end");
        const leftEnd = getLastOnCurvePoint(roundedLeftSide);
        const rightEnd = getLastOnCurvePoint(roundedRightSide);
        if (leftEnd && rightEnd) {
          const capWidth = endCapLeftHW + endCapRightHW;
          const capRadiusRatio =
            lastOnCurvePoint.capRadiusRatio ??
            skeletonContour.capRadiusRatio ??
            DEFAULT_CAP_RADIUS_RATIO;
          const capTension =
            lastOnCurvePoint.capTension ??
            skeletonContour.capTension ??
            DEFAULT_CAP_TENSION;
          const frame = getRoundCapFrame({
            endpointTangent: endTangent,
            capRadiusRatio,
            capWidth,
            position: "end",
          });
          const leftPrev = getPreviousOnCurvePoint(
            roundedLeftSide,
            roundedLeftSide.length - 1
          );
          const rightPrev = getPreviousOnCurvePoint(
            roundedRightSide,
            roundedRightSide.length - 1
          );
          const leftChordDirection = leftPrev
            ? vector.normalizeVector(vector.subVectors(leftEnd, leftPrev))
            : frame.capTangent;
          const rightChordDirection = rightPrev
            ? vector.normalizeVector(vector.subVectors(rightEnd, rightPrev))
            : frame.capTangent;
          const leftSplit = splitTerminalSideForRoundCap(
            roundedLeftSide,
            "end",
            frame.trimDistance,
            {
              endpointTangent: frame.capTangent,
              chordDirection: leftChordDirection,
              capTangent: frame.capTangent,
            }
          );
          const rightSplit = splitTerminalSideForRoundCap(
            roundedRightSide,
            "end",
            frame.trimDistance,
            {
              endpointTangent: frame.capTangent,
              chordDirection: rightChordDirection,
              capTangent: frame.capTangent,
            }
          );
          if (leftSplit && rightSplit) {
            roundedLeftSide = trimSideForRoundCapEmission(
              leftSplit.sidePoints,
              "end",
              leftSplit.referenceEndpointIndex
            );
            roundedRightSide = trimSideForRoundCapEmission(
              rightSplit.sidePoints,
              "end",
              rightSplit.referenceEndpointIndex
            );
            endCap = buildRoundCapGeometry({
              position: "end",
              insertedLeft: leftSplit.insertedPoint,
              insertedRight: rightSplit.insertedPoint,
              leftTangentToEndpoint: leftSplit.tangentToEndpoint,
              rightTangentToEndpoint: rightSplit.tangentToEndpoint,
              referenceLeft: leftSplit.referenceEndpoint,
              referenceRight: rightSplit.referenceEndpoint,
              capTangent: frame.capTangent,
              capTension,
              radiusFactor: frame.radiusFactor,
              capWidth,
            }).capPoints;
          }
        }
      } else if (endIsSquare) {
        const endAngle =
          lastOnCurvePoint.capAngle ??
          skeletonContour.capAngle ??
          DEFAULT_CAP_ANGLE;
        const endDistance =
          lastOnCurvePoint.capDistance ??
          skeletonContour.capDistance ??
          0;
        const clampedAngle = Math.min(Math.max(endAngle, -MAX_CAP_ANGLE), MAX_CAP_ANGLE);
        const endTangent = getSegmentTangent(segments[segments.length - 1], "end");
        const capTangent = endTangent;
        const capWidth = endCapLeftHW + endCapRightHW;
        const delta = Math.tan((Math.abs(clampedAngle) * Math.PI) / 180) * capWidth;
        const hasAngle = Math.abs(clampedAngle) > 0.001;
        const hasDistance = endDistance > 0.001;
        let moveLeft = clampedAngle > 0;
        if (endCapLeftHW < 0.5 && endCapRightHW > 0.5) moveLeft = false;
        if (endCapRightHW < 0.5 && endCapLeftHW > 0.5) moveLeft = true;

        const leftEnd = getLastOnCurvePoint(roundedLeftSide);
        const rightEnd = getLastOnCurvePoint(roundedRightSide);
        const leftHandleDir = getSideHandleDirection(roundedLeftSide, "end");
        const rightHandleDir = getSideHandleDirection(roundedRightSide, "end");
        const addLeft = hasDistance || (hasAngle && moveLeft);
        const addRight = hasDistance || (hasAngle && !moveLeft);
        const leftDelta = hasAngle && moveLeft ? delta : 0;
        const rightDelta = hasAngle && !moveLeft ? delta : 0;
        if (addLeft) {
          const leftExtra = createSquareCapPoint(
            leftEnd,
            leftHandleDir,
            capTangent,
            hasDistance ? endDistance : 0,
            leftDelta
          );
          if (leftExtra) roundedLeftSide.push(leftExtra);
        }
        if (addRight) {
          const rightExtra = createSquareCapPoint(
            rightEnd,
            rightHandleDir,
            capTangent,
            hasDistance ? endDistance : 0,
            rightDelta
          );
          if (rightExtra) roundedRightSide.push(rightExtra);
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

    const outlinePoints = assembleOpenOutlineWithRoundCaps({
      leftSide: roundedLeftSide,
      endCap,
      rightSide: roundedRightSide,
      startCap,
    });

    // DISABLED for performance testing - alignHandleDirections is O(n³)
    // const alignedOutlinePoints = alignHandleDirections(outlinePoints, segments, null);

    const finalPoints = enforceSmoothColinearity(
      stripCornerRoundMetadata(outlinePoints),
      true,
      {
      includeLinearNeighborCases: true,
      maxHandleRotationDeg: 60,
      }
    );
    let contour = { points: finalPoints, isClosed: true };

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

function getSkeletonDebugState() {
  if (typeof globalThis === "undefined") {
    return { enabled: false, filter: null };
  }
  const enabledFlag = globalThis.__fontraSkeletonDebug;
  return {
    // Disabled by default; enable explicitly via globalThis.__fontraSkeletonDebug.
    enabled: enabledFlag === undefined ? false : !!enabledFlag,
    filter: globalThis.__fontraSkeletonDebugFilter || null,
  };
}

function shouldLogSkeletonDebug(debugContext) {
  const debugState = getSkeletonDebugState();
  if (!debugState.enabled) return false;
  const filter = debugState.filter;
  if (!filter) return true;
  if (
    filter.contourIndex !== undefined &&
    debugContext?.contourIndex !== filter.contourIndex
  ) {
    return false;
  }
  if (
    filter.segmentIndex !== undefined &&
    debugContext?.segmentIndex !== filter.segmentIndex
  ) {
    return false;
  }
  if (filter.side !== undefined && debugContext?.side !== filter.side) {
    return false;
  }
  return true;
}

function logSkeletonDebug(debugContext, payload) {
  if (!shouldLogSkeletonDebug(debugContext)) return;
  const message = {
    contourIndex: debugContext?.contourIndex ?? null,
    segmentIndex: debugContext?.segmentIndex ?? null,
    side: debugContext?.side ?? null,
    ...payload,
  };
  // Log as a single string to avoid collapsed object entries in DevTools.
  console.log(`${SKELETON_DEBUG_PREFIX} ${JSON.stringify(message)}`);
}

function normalizeDirectionOrFallback(direction, fallbackDirection) {
  const len = Math.hypot(direction?.x || 0, direction?.y || 0);
  if (len >= 1e-9) {
    return { x: direction.x / len, y: direction.y / len };
  }
  const fallbackLen = Math.hypot(fallbackDirection?.x || 0, fallbackDirection?.y || 0);
  if (fallbackLen >= 1e-9) {
    return { x: fallbackDirection.x / fallbackLen, y: fallbackDirection.y / fallbackLen };
  }
  return { x: 1, y: 0 };
}

function rotateDirection(direction, angleRad) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return {
    x: direction.x * c - direction.y * s,
    y: direction.x * s + direction.y * c,
  };
}

function clampNearZeroDirection(candidateDir, referenceDir) {
  const ref = normalizeDirectionOrFallback(referenceDir, { x: 1, y: 0 });
  const cand = normalizeDirectionOrFallback(candidateDir, ref);
  const maxRotationRad = (MAX_NEAR_ZERO_ROTATION_DEG * Math.PI) / 180;
  const cosMax = Math.cos(maxRotationRad);

  const dot = Math.max(-1, Math.min(1, cand.x * ref.x + cand.y * ref.y));
  const result = {
    direction: cand,
    preventedFlip: false,
    clampedRotation: false,
  };

  if (dot < 0) {
    result.direction = ref;
    result.preventedFlip = true;
    result.clampedRotation = true;
    return result;
  }

  if (dot >= cosMax) {
    return result;
  }

  const cross = ref.x * cand.y - ref.y * cand.x;
  const sign = cross >= 0 ? 1 : -1;
  result.direction = rotateDirection(ref, sign * maxRotationRad);
  result.clampedRotation = true;
  return result;
}

function stabilizeSingleCubicHandles(
  fixedStart,
  fixedEnd,
  handle1,
  handle2,
  startReferenceDirection = null,
  endReferenceDirection = null,
  startFallbackDirection = null,
  endFallbackDirection = null
) {
  const chord = { x: fixedEnd.x - fixedStart.x, y: fixedEnd.y - fixedStart.y };
  const chordLength = Math.hypot(chord.x, chord.y);
  const chordDir = normalizeDirectionOrFallback(chord, { x: 1, y: 0 });
  const maxHandleLength = Math.max(
    NEAR_ZERO_HANDLE_TARGET,
    chordLength * MAX_HANDLE_TO_CHORD_RATIO
  );

  const processHandle = (anchor, otherAnchor, handlePoint, referenceDirection, fallbackDirection) => {
    let vec = { x: handlePoint.x - anchor.x, y: handlePoint.y - anchor.y };
    const originalLength = Math.hypot(vec.x, vec.y);
    let length = originalLength;

    const info = {
      originalLength,
      stabilizedLength: originalLength,
      clampedByChord: false,
      nearZeroAdjusted: false,
      preventedFlip: false,
      clampedRotation: false,
    };

    if (length > maxHandleLength && length > 1e-9) {
      const scale = maxHandleLength / length;
      vec = { x: vec.x * scale, y: vec.y * scale };
      length = maxHandleLength;
      info.clampedByChord = true;
    }

    if (length < NEAR_ZERO_HANDLE_THRESHOLD) {
      const fallback = normalizeDirectionOrFallback(fallbackDirection, {
        x: otherAnchor.x - anchor.x,
        y: otherAnchor.y - anchor.y,
      });
      const reference = normalizeDirectionOrFallback(referenceDirection, fallback);
      const candidate = length >= 1e-9 ? { x: vec.x / length, y: vec.y / length } : reference;
      const clamped = clampNearZeroDirection(candidate, reference);
      vec = {
        x: clamped.direction.x * NEAR_ZERO_HANDLE_TARGET,
        y: clamped.direction.y * NEAR_ZERO_HANDLE_TARGET,
      };
      info.nearZeroAdjusted = true;
      info.preventedFlip = clamped.preventedFlip;
      info.clampedRotation = clamped.clampedRotation;
      length = NEAR_ZERO_HANDLE_TARGET;
    }

    info.stabilizedLength = length;
    return {
      point: { x: anchor.x + vec.x, y: anchor.y + vec.y },
      info,
    };
  };

  const startFallback = normalizeDirectionOrFallback(startFallbackDirection, chordDir);
  const endFallback = normalizeDirectionOrFallback(endFallbackDirection, {
    x: -chordDir.x,
    y: -chordDir.y,
  });

  const stabilizedStart = processHandle(
    fixedStart,
    fixedEnd,
    handle1,
    startReferenceDirection,
    startFallback
  );
  const stabilizedEnd = processHandle(
    fixedEnd,
    fixedStart,
    handle2,
    endReferenceDirection,
    endFallback
  );

  return {
    handle1: stabilizedStart.point,
    handle2: stabilizedEnd.point,
    debug: {
      chordLength,
      maxHandleLength,
      start: stabilizedStart.info,
      end: stabilizedEnd.info,
    },
  };
}

function lockNearZeroHandleDirection(
  anchor,
  handlePoint,
  referenceDirection,
  maxLength = Infinity,
  preferMinimalOnFlip = false
) {
  const ref = normalizeDirectionOrFallback(referenceDirection, { x: 1, y: 0 });
  const vec = {
    x: handlePoint.x - anchor.x,
    y: handlePoint.y - anchor.y,
  };
  const length = Math.hypot(vec.x, vec.y);
  const candidateDir = length > 1e-9 ? { x: vec.x / length, y: vec.y / length } : ref;
  const directionDot = candidateDir.x * ref.x + candidateDir.y * ref.y;
  const preventedFlip = directionDot < 0;
  const lockedDirection = preventedFlip ? ref : candidateDir;
  const minimalGridStep = getMinimumGridStepFromDirection(lockedDirection);
  const minimalGridLength = minimalGridStep.length;
  const projectedLength = Math.abs(vec.x * lockedDirection.x + vec.y * lockedDirection.y);
  const nearZeroLocked = projectedLength < NEAR_ZERO_HANDLE_THRESHOLD;
  const forcedNonZero = projectedLength < minimalGridLength;
  const forcedMinimal = forcedNonZero || (preferMinimalOnFlip && preventedFlip);

  let finalLength;
  let clampedByMax = false;
  let point;
  if (forcedMinimal) {
    point = {
      x: anchor.x + minimalGridStep.x,
      y: anchor.y + minimalGridStep.y,
    };
    finalLength = minimalGridLength;
  } else {
    finalLength = projectedLength;
    clampedByMax = finalLength > maxLength;
    if (clampedByMax) {
      finalLength = maxLength;
    }
    point = {
      x: anchor.x + lockedDirection.x * finalLength,
      y: anchor.y + lockedDirection.y * finalLength,
    };
  }

  return {
    point,
    info: {
      nearZeroLocked,
      preventedFlip,
      forcedNonZero,
      forcedMinimal,
      originalLength: length,
      projectedLength,
      finalLength,
      clampedByMax,
      preferMinimalOnFlip,
      minimalGridStepX: minimalGridStep.x,
      minimalGridStepY: minimalGridStep.y,
      minimalGridLength,
      referenceDot: directionDot,
    },
  };
}

function getMinimumGridStepFromDirection(direction) {
  const dir = normalizeDirectionOrFallback(direction, { x: 1, y: 0 });

  let stepX = Math.abs(dir.x) >= 0.5 ? (dir.x >= 0 ? 1 : -1) : 0;
  let stepY = Math.abs(dir.y) >= 0.5 ? (dir.y >= 0 ? 1 : -1) : 0;

  // Prevent zero-length steps for shallow directions.
  if (stepX === 0 && stepY === 0) {
    if (Math.abs(dir.x) >= Math.abs(dir.y)) {
      stepX = dir.x >= 0 ? 1 : -1;
    } else {
      stepY = dir.y >= 0 ? 1 : -1;
    }
  }

  return {
    x: stepX,
    y: stepY,
    length: Math.hypot(stepX, stepY),
  };
}

/**
 * Try to simplify multiple offset curves into a single cubic bezier.
 * Uses fitCubic for approximation with adaptive error tolerance.
 * @param {Array} offsetCurves - Array of Bezier objects from bezier.offset()
 * @param {number} halfWidth - Half of the stroke width
 * @param {Object|null} debugContext - Optional debug metadata for console logs
 * @returns {Bezier|null} - Simplified Bezier or null if simplification is disabled/not needed
 */
function simplifyOffsetCurves(offsetCurves, halfWidth, debugContext = null) {
  if (!SIMPLIFY_OFFSET_CURVES || !offsetCurves || offsetCurves.length === 0) {
    return null;
  }

  // Use minimum threshold for error calculation when halfWidth is very small
  // This ensures simplification still works when one side collapses to skeleton
  const effectiveHalfWidth = Math.max(halfWidth, 1);

  // If already one cubic, keep it as is to preserve 1-segment topology.
  if (offsetCurves.length === 1 && offsetCurves[0].points.length === 4) {
    logSkeletonDebug(debugContext, {
      stage: "simplifyOffsetCurvesBypass",
      offsetCurveCount: 1,
      sampleCount: 0,
      halfWidth,
    });
    return offsetCurves[0];
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
    if (actualError <= errorThreshold) {
      logSkeletonDebug(debugContext, {
        stage: "simplifyOffsetCurves",
        offsetCurveCount: offsetCurves.length,
        sampleCount: samplePoints.length,
        halfWidth,
        errorThreshold,
        actualErrorSq: actualError,
      });
      return bezier; // fits within current threshold
    }
  }

  // Even maxError didn't help — return the last result anyway
  // One curve is better than many segments
  const fallback = fitCubic(samplePoints, leftTangent, rightTangent, maxError);
  const [fallbackErrorSq] = computeMaxError(samplePoints, fallback, params);
  logSkeletonDebug(debugContext, {
    stage: "simplifyOffsetCurvesFallback",
    offsetCurveCount: offsetCurves.length,
    sampleCount: samplePoints.length,
    halfWidth,
    maxError,
    fallbackErrorSq,
  });
  return fallback;
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
 * @param {Object|null} debugContext - Optional debug metadata for console logs
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
  endRightHalfWidth = null,
  debugContext = null,
  singleSided = false,
  singleSidedDirection = "left"
) {
  // Use provided half-widths or fall back to width/2
  const halfWidth = width / 2;
  const startLeftHW = startLeftHalfWidth ?? halfWidth;
  const startRightHW = startRightHalfWidth ?? halfWidth;
  const endLeftHW = endLeftHalfWidth ?? halfWidth;
  const endRightHW = endRightHalfWidth ?? halfWidth;

  const isCollapsedSide = (value) => value < 0.5;
  const collapsedSideInSingleSided = singleSided
    ? singleSidedDirection === "left"
      ? "right"
      : "left"
    : null;
  const getCornerRoundBaseForSide = (side, halfWidthValue, oppositeHalfWidthValue) => {
    if (!singleSided || side !== collapsedSideInSingleSided) {
      return halfWidthValue;
    }
    if (!isCollapsedSide(halfWidthValue)) {
      return halfWidthValue;
    }
    return Math.max(halfWidthValue, oppositeHalfWidthValue ?? 0);
  };

  const startLeftRoundBase = getCornerRoundBaseForSide("left", startLeftHW, startRightHW);
  const startRightRoundBase = getCornerRoundBaseForSide(
    "right",
    startRightHW,
    startLeftHW
  );
  const endLeftRoundBase = getCornerRoundBaseForSide("left", endLeftHW, endRightHW);
  const endRightRoundBase = getCornerRoundBaseForSide("right", endRightHW, endLeftHW);

  const left = [];
  const right = [];
  const projectPoint = (basePoint, normal, halfWidth, sign) => {
    if (isCollapsedSide(halfWidth)) {
      return { x: basePoint.x, y: basePoint.y };
    }
    return {
      x: Math.round(basePoint.x + sign * normal.x * halfWidth),
      y: Math.round(basePoint.y + sign * normal.y * halfWidth),
    };
  };

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
      let startLeftPt = projectPoint(segment.startPoint, startNormal, startLeftHW, 1);
      startLeftPt = applyNudgeToRibPoint(startLeftPt, segment.startPoint, startNormal, "left", startLeftHW);
      left.push(
        buildGeneratedOnCurve(
          startLeftPt,
          segment.startPoint.smooth,
          segment.startPoint,
          startLeftHW,
          startLeftRoundBase
        )
      );

      let startRightPt = projectPoint(segment.startPoint, startNormal, startRightHW, -1);
      startRightPt = applyNudgeToRibPoint(startRightPt, segment.startPoint, startNormal, "right", startRightHW);
      right.push(
        buildGeneratedOnCurve(
          startRightPt,
          segment.startPoint.smooth,
          segment.startPoint,
          startRightHW,
          startRightRoundBase
        )
      );
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
      let endLeftPt = projectPoint(segment.endPoint, endNormal, endLeftHW, 1);
      endLeftPt = applyNudgeToRibPoint(endLeftPt, segment.endPoint, endNormal, "left", endLeftHW);
      left.push(
        buildGeneratedOnCurve(
          endLeftPt,
          segment.endPoint.smooth,
          segment.endPoint,
          endLeftHW,
          endLeftRoundBase
        )
      );

      let endRightPt = projectPoint(segment.endPoint, endNormal, endRightHW, -1);
      endRightPt = applyNudgeToRibPoint(endRightPt, segment.endPoint, endNormal, "right", endRightHW);
      right.push(
        buildGeneratedOnCurve(
          endRightPt,
          segment.endPoint.smooth,
          segment.endPoint,
          endRightHW,
          endRightRoundBase
        )
      );
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
    let fixedStartLeft = projectPoint(segment.startPoint, startNormal, startLeftHW, 1);
    fixedStartLeft = applyNudgeToRibPoint(fixedStartLeft, segment.startPoint, startNormal, "left", startLeftHW);

    let fixedStartRight = projectPoint(segment.startPoint, startNormal, startRightHW, -1);
    fixedStartRight = applyNudgeToRibPoint(fixedStartRight, segment.startPoint, startNormal, "right", startRightHW);

    let fixedEndLeft = projectPoint(segment.endPoint, endNormal, endLeftHW, 1);
    fixedEndLeft = applyNudgeToRibPoint(fixedEndLeft, segment.endPoint, endNormal, "left", endLeftHW);

    let fixedEndRight = projectPoint(segment.endPoint, endNormal, endRightHW, -1);
    fixedEndRight = applyNudgeToRibPoint(fixedEndRight, segment.endPoint, endNormal, "right", endRightHW);

    // Helper to add offset curves to output array
    const addOffsetCurves = (
      curves,
      output,
      fixedStart,
      fixedEnd,
      shouldAddStart,
      shouldAddEnd,
      smoothStart,
      smoothEnd,
      sideHalfWidth,
      isLeftSide,
      startHalfWidth,
      endHalfWidth,
      startRoundBase,
      endRoundBase
    ) => {
      const side = isLeftSide ? "left" : "right";
      // When halfWidth is near zero, contour should exactly match skeleton
      // Copy control points directly instead of using offset curves
      if (isCollapsedSide(sideHalfWidth) && segment.controlPoints.length > 0) {
        if (shouldAddStart) {
          output.push(
            buildGeneratedOnCurve(
              segment.startPoint,
              smoothStart,
              segment.startPoint,
              startHalfWidth,
              startRoundBase
            )
          );
        }
        // Collapsed side must stay exactly on skeleton geometry.
        for (const cp of segment.controlPoints) {
          output.push({ x: cp.x, y: cp.y, type: "cubic" });
        }
        if (shouldAddEnd) {
          output.push(
            buildGeneratedOnCurve(
              segment.endPoint,
              smoothEnd,
              segment.endPoint,
              endHalfWidth,
              endRoundBase
            )
          );
        }
        return;
      }

      // Fallback: if bezier.offset() returns empty result, add straight line
      if (!curves || curves.length === 0) {
        if (shouldAddStart) {
          output.push(
            buildGeneratedOnCurve(
              fixedStart,
              smoothStart,
              segment.startPoint,
              startHalfWidth,
              startRoundBase
            )
          );
        }
        if (shouldAddEnd) {
          output.push(
            buildGeneratedOnCurve(
              fixedEnd,
              smoothEnd,
              segment.endPoint,
              endHalfWidth,
              endRoundBase
            )
          );
        }
        return;
      }

      // Try to simplify multiple offset curves into a single cubic bezier
      const simplifiedCurve = simplifyOffsetCurves(curves, sideHalfWidth, {
        ...debugContext,
        side,
      });
      if (simplifiedCurve) {
        // Use the simplified curve
        const pts = simplifiedCurve.points;
        if (shouldAddStart) {
          output.push(
            buildGeneratedOnCurve(
              fixedStart,
              smoothStart,
              segment.startPoint,
              startHalfWidth,
              startRoundBase
            )
          );
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
          x: fixedStart.x + h1Offset.x,
          y: fixedStart.y + h1Offset.y,
        };
        let adjustedHandle2 = {
          x: fixedEnd.x + h2Offset.x,
          y: fixedEnd.y + h2Offset.y,
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

        const rawStartLength = Math.hypot(
          adjustedHandle1.x - fixedStart.x,
          adjustedHandle1.y - fixedStart.y
        );
        const rawEndLength = Math.hypot(
          adjustedHandle2.x - fixedEnd.x,
          adjustedHandle2.y - fixedEnd.y
        );

        // Always protect near-zero handles from 180° direction flips.
        // Start handle follows outgoing tangent; end handle follows incoming tangent.
        const startTangentFallback = getSegmentTangent(segment, "start");
        const endTangentFallback = getSegmentTangent(segment, "end");
        const startReferenceDir = startHandleDir ?? startTangentFallback;
        const endReferenceDir =
          endHandleDir ?? { x: -endTangentFallback.x, y: -endTangentFallback.y };
        const chordLength = Math.hypot(
          fixedEnd.x - fixedStart.x,
          fixedEnd.y - fixedStart.y
        );
        const maxHandleLength = Math.max(
          NEAR_ZERO_HANDLE_TARGET,
          chordLength * MAX_HANDLE_TO_CHORD_RATIO
        );
        const startNearZeroLock = lockNearZeroHandleDirection(
          fixedStart,
          adjustedHandle1,
          startReferenceDir,
          maxHandleLength,
          true
        );
        const endNearZeroLock = lockNearZeroHandleDirection(
          fixedEnd,
          adjustedHandle2,
          endReferenceDir,
          maxHandleLength,
          true
        );
        adjustedHandle1 = startNearZeroLock.point;
        adjustedHandle2 = endNearZeroLock.point;

        let stabilizedHandles = null;
        if (ENABLE_EXPERIMENTAL_HANDLE_STABILIZATION) {
          stabilizedHandles = stabilizeSingleCubicHandles(
            fixedStart,
            fixedEnd,
            adjustedHandle1,
            adjustedHandle2,
            startHandleDir ?? {
              x: adjustedHandle1.x - fixedStart.x,
              y: adjustedHandle1.y - fixedStart.y,
            },
            endHandleDir ?? {
              x: adjustedHandle2.x - fixedEnd.x,
              y: adjustedHandle2.y - fixedEnd.y,
            },
            startTangentFallback,
            { x: -endTangentFallback.x, y: -endTangentFallback.y }
          );
          adjustedHandle1 = stabilizedHandles.handle1;
          adjustedHandle2 = stabilizedHandles.handle2;
        }

        // Quantize generated handles back to UPM grid for consistent behavior.
        adjustedHandle1 = {
          x: Math.round(adjustedHandle1.x),
          y: Math.round(adjustedHandle1.y),
        };
        adjustedHandle2 = {
          x: Math.round(adjustedHandle2.x),
          y: Math.round(adjustedHandle2.y),
        };

        logSkeletonDebug(
          {
            ...debugContext,
            side,
          },
          {
            stage: "singleCubicHandles",
            stabilizationEnabled: ENABLE_EXPERIMENTAL_HANDLE_STABILIZATION,
            rawStartLength,
            rawEndLength,
            finalStartLength: Math.hypot(
              adjustedHandle1.x - fixedStart.x,
              adjustedHandle1.y - fixedStart.y
            ),
            finalEndLength: Math.hypot(
              adjustedHandle2.x - fixedEnd.x,
              adjustedHandle2.y - fixedEnd.y
            ),
            clampedByChordStart: stabilizedHandles?.debug.start.clampedByChord ?? false,
            clampedByChordEnd: stabilizedHandles?.debug.end.clampedByChord ?? false,
            nearZeroAdjustedStart:
              startNearZeroLock.info.nearZeroLocked ||
              (stabilizedHandles?.debug.start.nearZeroAdjusted ?? false),
            nearZeroAdjustedEnd:
              endNearZeroLock.info.nearZeroLocked ||
              (stabilizedHandles?.debug.end.nearZeroAdjusted ?? false),
            nearZeroForcedNonZeroStart: startNearZeroLock.info.forcedNonZero,
            nearZeroForcedNonZeroEnd: endNearZeroLock.info.forcedNonZero,
            nearZeroForcedMinimalStart: startNearZeroLock.info.forcedMinimal,
            nearZeroForcedMinimalEnd: endNearZeroLock.info.forcedMinimal,
            nearZeroRefDotStart: startNearZeroLock.info.referenceDot,
            nearZeroRefDotEnd: endNearZeroLock.info.referenceDot,
            projectedStartLength: startNearZeroLock.info.projectedLength,
            projectedEndLength: endNearZeroLock.info.projectedLength,
            nearZeroMinGridLengthStart: startNearZeroLock.info.minimalGridLength,
            nearZeroMinGridLengthEnd: endNearZeroLock.info.minimalGridLength,
            nearZeroGridStepStart: [
              startNearZeroLock.info.minimalGridStepX,
              startNearZeroLock.info.minimalGridStepY,
            ],
            nearZeroGridStepEnd: [
              endNearZeroLock.info.minimalGridStepX,
              endNearZeroLock.info.minimalGridStepY,
            ],
            clampedByMaxStart: startNearZeroLock.info.clampedByMax,
            clampedByMaxEnd: endNearZeroLock.info.clampedByMax,
            nearZeroPreventedFlipStart: startNearZeroLock.info.preventedFlip,
            nearZeroPreventedFlipEnd: endNearZeroLock.info.preventedFlip,
            nearZeroPreferMinimalOnFlipStart:
              startNearZeroLock.info.preferMinimalOnFlip,
            nearZeroPreferMinimalOnFlipEnd:
              endNearZeroLock.info.preferMinimalOnFlip,
            preventedFlipStart: stabilizedHandles?.debug.start.preventedFlip ?? false,
            preventedFlipEnd: stabilizedHandles?.debug.end.preventedFlip ?? false,
            clampedRotationStart: stabilizedHandles?.debug.start.clampedRotation ?? false,
            clampedRotationEnd: stabilizedHandles?.debug.end.clampedRotation ?? false,
            chordLength: stabilizedHandles?.debug.chordLength ?? chordLength,
            maxHandleLength: stabilizedHandles?.debug.maxHandleLength ?? maxHandleLength,
          }
        );

        output.push({ x: adjustedHandle1.x, y: adjustedHandle1.y, type: "cubic" });
        output.push({ x: adjustedHandle2.x, y: adjustedHandle2.y, type: "cubic" });
        if (shouldAddEnd) {
          output.push(
            buildGeneratedOnCurve(
              fixedEnd,
              smoothEnd,
              segment.endPoint,
              endHalfWidth,
              endRoundBase
            )
          );
        }
        return;
      }

      // Fallback: use original curves without simplification
      logSkeletonDebug(
        {
          ...debugContext,
          side,
        },
        {
          stage: "multiCurveFallbackUnexpected",
          curveCount: curves.length,
        }
      );

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
          output.push(
            buildGeneratedOnCurve(
              fixedStart,
              smoothStart,
              segment.startPoint,
              startHalfWidth,
              startRoundBase
            )
          );
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
            output.push(
              buildGeneratedOnCurve(
                fixedEnd,
                smoothEnd,
                segment.endPoint,
                endHalfWidth,
                endRoundBase
              )
            );
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
      true, // isLeftSide
      startLeftHW,
      endLeftHW,
      startLeftRoundBase,
      endLeftRoundBase
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
      false, // isLeftSide
      startRightHW,
      endRightHW,
      startRightRoundBase,
      endRightRoundBase
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

function getNextOnCurvePoint(points, startIndex) {
  if (!points) return null;
  for (let i = startIndex + 1; i < points.length; i++) {
    if (points[i] && !points[i].type) return points[i];
  }
  return null;
}

function getPreviousOnCurvePoint(points, startIndex) {
  if (!points) return null;
  for (let i = startIndex - 1; i >= 0; i--) {
    if (points[i] && !points[i].type) return points[i];
  }
  return null;
}

function getSideHandleDirection(points, position) {
  if (!points || points.length < 2) return null;
  if (position === "start") {
    const startIdx = points.findIndex((p) => p && !p.type);
    if (startIdx < 0) return null;
    const startPoint = points[startIdx];
    for (let i = startIdx + 1; i < points.length; i++) {
      const point = points[i];
      if (!point) continue;
      if (!point.type) break;
      const dir = { x: point.x - startPoint.x, y: point.y - startPoint.y };
      const len = Math.hypot(dir.x, dir.y);
      if (len > 0.001) return { x: dir.x / len, y: dir.y / len };
    }
    return null;
  }

  const endIdx = (() => {
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i] && !points[i].type) return i;
    }
    return -1;
  })();
  if (endIdx < 0) return null;
  const endPoint = points[endIdx];
  for (let i = endIdx - 1; i >= 0; i--) {
    const point = points[i];
    if (!point) continue;
    if (!point.type) break;
    const dir = { x: point.x - endPoint.x, y: point.y - endPoint.y };
    const len = Math.hypot(dir.x, dir.y);
    if (len > 0.001) return { x: dir.x / len, y: dir.y / len };
  }
  return null;
}

function createSquareCapPoint(basePoint, handleDir, capTangent, baseDistance, delta) {
  if (!basePoint) return null;
  const hasDistance = baseDistance > 0.001;
  const hasDelta = delta > 0.001;
  if (!hasDistance && !hasDelta) {
    return { x: basePoint.x, y: basePoint.y, smooth: false };
  }
  let dir = handleDir;
  if (!dir || Math.hypot(dir.x, dir.y) < 0.001) {
    dir = capTangent;
  }
  let denom = dir.x * capTangent.x + dir.y * capTangent.y;
  if (denom < 0) {
    dir = { x: -dir.x, y: -dir.y };
    denom = -denom;
  }
  let t = baseDistance;
  if (hasDelta) {
    if (denom < 0.001) {
      const total = baseDistance + delta;
      return {
        x: Math.round(basePoint.x + capTangent.x * total),
        y: Math.round(basePoint.y + capTangent.y * total),
        smooth: false,
      };
    }
    t += delta / denom;
  }
  if (!(t > 0.001)) {
    return { x: basePoint.x, y: basePoint.y, smooth: false };
  }
  return {
    x: Math.round(basePoint.x + dir.x * t),
    y: Math.round(basePoint.y + dir.y * t),
    smooth: false,
  };
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

function getRoundCapFrame({
  endpointTangent,
  capRadiusRatio,
  capWidth,
  position,
}) {
  const clampedCapRadiusRatio = Math.min(Math.max(capRadiusRatio, 0), MAX_CAP_RADIUS_RATIO);
  const radiusFactor =
    MAX_CAP_RADIUS_RATIO > 0 ? clampedCapRadiusRatio / MAX_CAP_RADIUS_RATIO : 0;
  const maxProjectionShift = Math.max(capWidth / 2 - capWidth / 128, 0);
  const trimDistance = maxProjectionShift * (1 - radiusFactor);
  const capTangent =
    position === "start"
      ? { x: -endpointTangent.x, y: -endpointTangent.y }
      : endpointTangent;
  return { radiusFactor, maxProjectionShift, trimDistance, capTangent };
}

function solveTerminalSplitForDistance(bezier, fromEnd, trimDistance) {
  const totalLength = bezier.length();
  if (!(totalLength > 0.001)) {
    return fromEnd ? 1 : 0;
  }

  const clampedTrimDistance = Math.min(Math.max(trimDistance, 0), totalLength);
  const targetLength = fromEnd ? totalLength - clampedTrimDistance : clampedTrimDistance;

  let low = 0;
  let high = 1;
  let bestT = fromEnd ? 1 : 0;
  let bestError = Infinity;

  for (let i = 0; i < 32; i++) {
    const mid = (low + high) / 2;
    const split = bezier.split(mid);
    const leftLength = split.left.length();
    const error = Math.abs(leftLength - targetLength);

    if (error < bestError) {
      bestError = error;
      bestT = mid;
    }
    if (error <= 0.5 || high - low <= 1e-4) {
      break;
    }
    if (leftLength < targetLength) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return bestT;
}

function cloneRoundCapPoint(point) {
  return point ? { ...point } : null;
}

function buildSplitOffCurve(point) {
  return {
    x: point.x,
    y: point.y,
    type: "cubic",
  };
}

function buildInsertedRoundCapPoint(point) {
  return {
    x: point.x,
    y: point.y,
    smooth: true,
  };
}

function isUsableDirection(direction) {
  return !!direction && Math.hypot(direction.x, direction.y) > 0.001;
}

function resolveRoundCapFallbackDirection(fallbackDirections) {
  const candidateDirections = [
    fallbackDirections?.endpointTangent,
    fallbackDirections?.chordDirection,
    fallbackDirections?.capTangent,
  ];
  for (const direction of candidateDirections) {
    if (isUsableDirection(direction)) {
      return vector.normalizeVector(direction);
    }
  }
  return { x: 1, y: 0 };
}

function getRoundCapTerminalSegment(points, sidePosition) {
  if (!points?.length) {
    return null;
  }

  if (sidePosition === "start") {
    const startIndex = points.findIndex((point) => point && !point.type);
    if (startIndex < 0) {
      return null;
    }
    for (let endIndex = startIndex + 1; endIndex < points.length; endIndex++) {
      if (points[endIndex] && !points[endIndex].type) {
        return {
          segmentStartIndex: startIndex,
          segmentEndIndex: endIndex,
          segmentPoints: points.slice(startIndex, endIndex + 1),
        };
      }
    }
    return null;
  }

  let segmentEndIndex = -1;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i] && !points[i].type) {
      segmentEndIndex = i;
      break;
    }
  }
  if (segmentEndIndex < 0) {
    return null;
  }
  for (let startIndex = segmentEndIndex - 1; startIndex >= 0; startIndex--) {
    if (points[startIndex] && !points[startIndex].type) {
      return {
        segmentStartIndex: startIndex,
        segmentEndIndex,
        segmentPoints: points.slice(startIndex, segmentEndIndex + 1),
      };
    }
  }
  return null;
}

function splitTerminalSideForRoundCap(
  sidePoints,
  sidePosition,
  trimDistance,
  fallbackDirections
) {
  const terminalSegment = getRoundCapTerminalSegment(sidePoints, sidePosition);
  if (!terminalSegment) {
    return null;
  }

  const {
    segmentStartIndex,
    segmentEndIndex,
    segmentPoints,
  } = terminalSegment;
  const fromEnd = sidePosition === "end";
  const referenceEndpointIndex = fromEnd ? segmentEndIndex : segmentStartIndex;
  const referenceEndpoint = cloneRoundCapPoint(sidePoints[referenceEndpointIndex]);
  const fallbackDirection = resolveRoundCapFallbackDirection(fallbackDirections);
  const startPoint = segmentPoints[0];
  const endPoint = segmentPoints[segmentPoints.length - 1];
  const chordVector = vector.subVectors(endPoint, startPoint);
  const segmentBezier =
    segmentPoints.length === 2 || segmentPoints.length === 4
      ? createBezierFromPoints(segmentPoints)
      : null;
  const terminalSegmentLength = segmentBezier
    ? segmentBezier.length()
    : Math.hypot(chordVector.x, chordVector.y);

  let effectiveTrimDistance = Math.min(Math.max(trimDistance, 0), terminalSegmentLength);
  if (terminalSegmentLength >= 2 && effectiveTrimDistance < 1) {
    effectiveTrimDistance = 1;
  }

  const synthesizeInsertedPoint = () => {
    const insertedPoint = buildInsertedRoundCapPoint({
      x: referenceEndpoint.x - fallbackDirection.x,
      y: referenceEndpoint.y - fallbackDirection.y,
    });
    const rewrittenSegment = fromEnd
      ? [cloneRoundCapPoint(startPoint), insertedPoint, referenceEndpoint]
      : [referenceEndpoint, insertedPoint, cloneRoundCapPoint(endPoint)];
    const rewrittenSidePoints = [
      ...sidePoints.slice(0, segmentStartIndex),
      ...rewrittenSegment,
      ...sidePoints.slice(segmentEndIndex + 1),
    ];
    return {
      sidePoints: rewrittenSidePoints,
      insertedPointIndex: fromEnd ? segmentStartIndex + 1 : segmentStartIndex + 1,
      insertedPoint,
      referenceEndpointIndex: fromEnd ? segmentStartIndex + 2 : segmentStartIndex,
      referenceEndpoint,
      tangentToEndpoint: fallbackDirection,
    };
  };

  if (terminalSegmentLength < 2) {
    return synthesizeInsertedPoint();
  }

  if (segmentPoints.length === 2) {
    const lineDirection = vector.normalizeVector(chordVector);
    if (!isUsableDirection(lineDirection)) {
      return synthesizeInsertedPoint();
    }
    const t = effectiveTrimDistance / terminalSegmentLength;
    const interpolationT = fromEnd ? 1 - t : t;
    const insertedCoords = vector.interpolateVectors(startPoint, endPoint, interpolationT);
    let insertedPoint = buildInsertedRoundCapPoint(insertedCoords);
    if (vector.distance(insertedPoint, referenceEndpoint) < 1) {
      insertedPoint = buildInsertedRoundCapPoint({
        x: referenceEndpoint.x - fallbackDirection.x,
        y: referenceEndpoint.y - fallbackDirection.y,
      });
    }
    const tangentToEndpoint = fromEnd
      ? lineDirection
      : { x: -lineDirection.x, y: -lineDirection.y };
    const rewrittenSegment = fromEnd
      ? [cloneRoundCapPoint(startPoint), insertedPoint, referenceEndpoint]
      : [referenceEndpoint, insertedPoint, cloneRoundCapPoint(endPoint)];
    const rewrittenSidePoints = [
      ...sidePoints.slice(0, segmentStartIndex),
      ...rewrittenSegment,
      ...sidePoints.slice(segmentEndIndex + 1),
    ];
    return {
      sidePoints: rewrittenSidePoints,
      insertedPointIndex: segmentStartIndex + 1,
      insertedPoint,
      referenceEndpointIndex: fromEnd ? segmentStartIndex + 2 : segmentStartIndex,
      referenceEndpoint,
      tangentToEndpoint,
    };
  }

  if (segmentPoints.length !== 4) {
    return synthesizeInsertedPoint();
  }

  const bezier = segmentBezier ?? createBezierFromPoints(segmentPoints);
  const splitT = solveTerminalSplitForDistance(bezier, fromEnd, effectiveTrimDistance);
  const derivative = bezier.derivative(splitT);
  const derivativeDirection = vector.normalizeVector({ x: derivative.x, y: derivative.y });
  if (!isUsableDirection(derivativeDirection)) {
    return synthesizeInsertedPoint();
  }

  const split = bezier.split(splitT);
  const leftPoints = split.left.points.map((point) => ({ x: point.x, y: point.y }));
  const rightPoints = split.right.points.map((point) => ({ x: point.x, y: point.y }));
  let insertedPoint = buildInsertedRoundCapPoint(leftPoints[leftPoints.length - 1]);
  if (vector.distance(insertedPoint, referenceEndpoint) < 1) {
    insertedPoint = buildInsertedRoundCapPoint({
      x: referenceEndpoint.x - fallbackDirection.x,
      y: referenceEndpoint.y - fallbackDirection.y,
    });
  }

  const tangentToEndpoint = fromEnd
    ? derivativeDirection
    : { x: -derivativeDirection.x, y: -derivativeDirection.y };
  const rewrittenSegment = [
    cloneRoundCapPoint(startPoint),
    buildSplitOffCurve(leftPoints[1]),
    buildSplitOffCurve(leftPoints[2]),
    insertedPoint,
    buildSplitOffCurve(rightPoints[1]),
    buildSplitOffCurve(rightPoints[2]),
    cloneRoundCapPoint(endPoint),
  ];
  const rewrittenSidePoints = [
    ...sidePoints.slice(0, segmentStartIndex),
    ...rewrittenSegment,
    ...sidePoints.slice(segmentEndIndex + 1),
  ];

  return {
    sidePoints: rewrittenSidePoints,
    insertedPointIndex: segmentStartIndex + 3,
    insertedPoint,
    referenceEndpointIndex: fromEnd ? segmentStartIndex + 6 : segmentStartIndex,
    referenceEndpoint,
    tangentToEndpoint,
  };
}

function trimSideForRoundCapEmission(sidePoints, sidePosition, referenceEndpointIndex) {
  const emitted = [...sidePoints];
  emitted.splice(referenceEndpointIndex, 1);
  return emitted;
}

function buildRoundCapEndpoint(point) {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y),
    smooth: true,
    skipColinear: true,
  };
}

function buildRoundCapTipPoint(point) {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y),
    smooth: true,
  };
}

function orientDirectionToward(direction, targetVector) {
  if (!isUsableDirection(direction)) {
    return resolveRoundCapFallbackDirection({ endpointTangent: targetVector });
  }
  if (!isUsableDirection(targetVector)) {
    return vector.normalizeVector(direction);
  }
  const normalizedDirection = vector.normalizeVector(direction);
  const normalizedTarget = vector.normalizeVector(targetVector);
  const dot = normalizedDirection.x * normalizedTarget.x + normalizedDirection.y * normalizedTarget.y;
  return dot >= 0
    ? normalizedDirection
    : { x: -normalizedDirection.x, y: -normalizedDirection.y };
}

function buildRoundCapSegment(startPoint, startDir, endPoint, endDir, tension) {
  if (
    !isUsableDirection(startDir) ||
    !isUsableDirection(endDir) ||
    vector.distance(startPoint, endPoint) < 0.001
  ) {
    return [cloneRoundCapPoint(endPoint)];
  }

  const handleLengths = computeTunniHandleLengths(startPoint, startDir, endPoint, endDir, tension);
  if (
    !Number.isFinite(handleLengths.startLen) ||
    !Number.isFinite(handleLengths.endLen)
  ) {
    return [cloneRoundCapPoint(endPoint)];
  }

  return [
    {
      x: Math.round(startPoint.x + startDir.x * handleLengths.startLen),
      y: Math.round(startPoint.y + startDir.y * handleLengths.startLen),
      type: "cubic",
    },
    {
      x: Math.round(endPoint.x + endDir.x * handleLengths.endLen),
      y: Math.round(endPoint.y + endDir.y * handleLengths.endLen),
      type: "cubic",
    },
    cloneRoundCapPoint(endPoint),
  ];
}

function buildRoundCapGeometry({
  position,
  insertedLeft,
  insertedRight,
  leftTangentToEndpoint,
  rightTangentToEndpoint,
  referenceLeft,
  referenceRight,
  capTangent,
  capTension,
  radiusFactor,
  capWidth,
}) {
  const referenceSpan = vector.subVectors(referenceLeft, referenceRight);
  const rawCapNormal = vector.normalizeVector(referenceSpan);
  const fallbackCapNormal = vector.normalizeVector(vector.rotateVector90CW(capTangent));
  const canUseRawCapNormal = isUsableDirection(rawCapNormal);
  const canUseFallbackCapNormal = isUsableDirection(fallbackCapNormal);
  const capNormal = canUseRawCapNormal
    ? rawCapNormal
    : canUseFallbackCapNormal
      ? fallbackCapNormal
      : null;

  const normalShift = (capWidth / 2) * radiusFactor;
  const zeroWidthCap = !(capWidth > 0.001);
  let finalEndpoints = null;
  let tipPoint = null;
  let isMergedTip = false;
  let preCollapseRight = null;
  let preCollapseLeft = null;

  if (!zeroWidthCap && capNormal) {
    preCollapseRight = buildRoundCapEndpoint({
      x: referenceRight.x + capNormal.x * normalShift,
      y: referenceRight.y + capNormal.y * normalShift,
    });
    preCollapseLeft = buildRoundCapEndpoint({
      x: referenceLeft.x - capNormal.x * normalShift,
      y: referenceLeft.y - capNormal.y * normalShift,
    });

    if (
      radiusFactor >= 1 - 1e-6 ||
      vector.distance(preCollapseRight, preCollapseLeft) <= 0.5
    ) {
      isMergedTip = true;
      tipPoint = buildRoundCapTipPoint({
        x: (preCollapseRight.x + preCollapseLeft.x) / 2,
        y: (preCollapseRight.y + preCollapseLeft.y) / 2,
      });
    } else {
      finalEndpoints = {
        left: preCollapseLeft,
        right: preCollapseRight,
      };
    }
  } else {
    isMergedTip = true;
    tipPoint = buildRoundCapTipPoint({
      x: (referenceLeft.x + referenceRight.x) / 2,
      y: (referenceLeft.y + referenceRight.y) / 2,
    });
  }

  const capPoints = [];

  if (isMergedTip) {
    let tipAxis = null;
    if (preCollapseLeft && preCollapseRight && vector.distance(preCollapseLeft, preCollapseRight) > 0.001) {
      tipAxis = vector.normalizeVector(vector.subVectors(preCollapseRight, preCollapseLeft));
    }
    if (!isUsableDirection(tipAxis) && canUseFallbackCapNormal) {
      tipAxis = fallbackCapNormal;
    }
    if (!isUsableDirection(tipAxis)) {
      tipAxis = vector.normalizeVector(vector.subVectors(insertedLeft, insertedRight));
    }

    const rightTipDir = orientDirectionToward(
      tipAxis,
      vector.subVectors(insertedRight, tipPoint)
    );
    const leftTipDir = orientDirectionToward(
      tipAxis,
      vector.subVectors(insertedLeft, tipPoint)
    );

    if (position === "start") {
      capPoints.push(
        ...buildRoundCapSegment(
          insertedRight,
          rightTangentToEndpoint,
          tipPoint,
          rightTipDir,
          capTension
        )
      );
      capPoints.push(
        ...buildRoundCapSegment(
          tipPoint,
          leftTipDir,
          insertedLeft,
          leftTangentToEndpoint,
          capTension
        )
      );
    } else {
      capPoints.push(
        ...buildRoundCapSegment(
          insertedLeft,
          leftTangentToEndpoint,
          tipPoint,
          leftTipDir,
          capTension
        )
      );
      capPoints.push(
        ...buildRoundCapSegment(
          tipPoint,
          rightTipDir,
          insertedRight,
          rightTangentToEndpoint,
          capTension
        )
      );
    }

    return { capPoints, finalEndpoints, tipPoint, isMergedTip };
  }

  const tipLineDirection = vector.normalizeVector(
    vector.subVectors(finalEndpoints.left, finalEndpoints.right)
  );
  const leftTipDir = orientDirectionToward(
    tipLineDirection,
    vector.subVectors(insertedLeft, finalEndpoints.left)
  );
  const rightTipDir = orientDirectionToward(
    { x: -tipLineDirection.x, y: -tipLineDirection.y },
    vector.subVectors(insertedRight, finalEndpoints.right)
  );

  if (position === "start") {
    capPoints.push(
      ...buildRoundCapSegment(
        insertedRight,
        rightTangentToEndpoint,
        finalEndpoints.right,
        rightTipDir,
        capTension
      )
    );
    capPoints.push(cloneRoundCapPoint(finalEndpoints.left));
    capPoints.push(
      ...buildRoundCapSegment(
        finalEndpoints.left,
        leftTipDir,
        insertedLeft,
        leftTangentToEndpoint,
        capTension
      )
    );
  } else {
    capPoints.push(
      ...buildRoundCapSegment(
        insertedLeft,
        leftTangentToEndpoint,
        finalEndpoints.left,
        leftTipDir,
        capTension
      )
    );
    capPoints.push(cloneRoundCapPoint(finalEndpoints.right));
    capPoints.push(
      ...buildRoundCapSegment(
        finalEndpoints.right,
        rightTipDir,
        insertedRight,
        rightTangentToEndpoint,
        capTension
      )
    );
  }

  return { capPoints, finalEndpoints, tipPoint, isMergedTip };
}

function assembleOpenOutlineWithRoundCaps({ leftSide, endCap, rightSide, startCap }) {
  const outlinePoints = [];
  outlinePoints.push(...leftSide);
  outlinePoints.push(...endCap);
  outlinePoints.push(...[...rightSide].reverse());
  outlinePoints.push(...startCap);
  return outlinePoints;
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
function generateCap(
  point,
  segment,
  width,
  capStyle,
  position,
  leftHalfWidth = null,
  rightHalfWidth = null,
  capAngle = DEFAULT_CAP_ANGLE
) {
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
  const capTangent = position === "start" ? { x: -direction.x, y: -direction.y } : direction;

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
    // Square cap - extend by per-point half-widths, with optional angle
    const capWidth = leftHW + rightHW;
    const clampedAngle = Math.max(-89.9, Math.min(89.9, capAngle ?? 0));
    const angleRad = (clampedAngle * Math.PI) / 180;
    const angleShift = (capWidth * Math.tan(angleRad)) / 2;
    const leftShift = avgHW + angleShift;
    const rightShift = avgHW - angleShift;

    capPoints.push({
      x: point.x - normal.x * rightHW + capTangent.x * rightShift,
      y: point.y - normal.y * rightHW + capTangent.y * rightShift,
    });
    capPoints.push({
      x: point.x + normal.x * leftHW + capTangent.x * leftShift,
      y: point.y + normal.y * leftHW + capTangent.y * leftShift,
    });
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
  if (layerOrCustomData?.customData) {
    const internalSkeleton = getFontraInternalSection(
      layerOrCustomData,
      FONTRA_INTERNAL_SECTIONS.SKELETON
    );
    if (internalSkeleton) {
      return internalSkeleton;
    }
  }
  const customData = layerOrCustomData?.customData ?? layerOrCustomData;
  const internalSkeleton =
    customData?.[FONTRA_INTERNAL_KEY]?.[FONTRA_INTERNAL_SECTIONS.SKELETON];
  if (internalSkeleton) {
    return internalSkeleton;
  }
  return null;
}

/**
 * Store skeleton data in the internal customData section.
 */
export function setSkeletonData(
  layer,
  skeletonData,
  { keepGeneratedContourIndices = true } = {}
) {
  if (!layer) {
    return;
  }
  if (skeletonData === null || skeletonData === undefined) {
    deleteFontraInternalSection(layer, FONTRA_INTERNAL_SECTIONS.SKELETON);
    return;
  }
  const normalized = normalizeSkeletonData(skeletonData, {
    keepGeneratedContourIndices,
  });
  setFontraInternalSection(layer, FONTRA_INTERNAL_SECTIONS.SKELETON, normalized);
}

export function clearSkeletonData(layer) {
  if (!layer) {
    return;
  }
  deleteFontraInternalSection(layer, FONTRA_INTERNAL_SECTIONS.SKELETON);
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function asNonNegativeNumber(value, fallback) {
  return Math.max(0, asFiniteNumber(value, fallback));
}

function asBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function clampCapRadiusRatio(value, fallback = DEFAULT_CAP_RADIUS_RATIO) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, 0), MAX_CAP_RADIUS_RATIO);
}

function clampCapAngle(value, fallback = DEFAULT_CAP_ANGLE) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, -MAX_CAP_ANGLE), MAX_CAP_ANGLE);
}

function normalizeSkeletonPoint(point) {
  if (!isPlainObject(point)) {
    return null;
  }

  const normalized = { ...point };
  normalized.x = asFiniteNumber(point.x, 0);
  normalized.y = asFiniteNumber(point.y, 0);

  if (point.width !== undefined) {
    normalized.width = asNonNegativeNumber(point.width, 0);
  }
  if (point.leftWidth !== undefined) {
    normalized.leftWidth = asNonNegativeNumber(point.leftWidth, 0);
  }
  if (point.rightWidth !== undefined) {
    normalized.rightWidth = asNonNegativeNumber(point.rightWidth, 0);
  }

  if (point.capStyle !== undefined) {
    normalized.capStyle = normalizeCapStyle(point.capStyle);
  }
  if (point.capRadiusRatio !== undefined) {
    normalized.capRadiusRatio = clampCapRadiusRatio(point.capRadiusRatio);
  }
  if (point.capTension !== undefined) {
    normalized.capTension = asFiniteNumber(point.capTension, DEFAULT_CAP_TENSION);
  }
  if (point.capAngle !== undefined) {
    normalized.capAngle = clampCapAngle(point.capAngle);
  }
  if (point.capDistance !== undefined) {
    normalized.capDistance = asFiniteNumber(point.capDistance, 0);
  }

  if (point.leftEditable !== undefined) {
    normalized.leftEditable = asBoolean(point.leftEditable);
  }
  if (point.rightEditable !== undefined) {
    normalized.rightEditable = asBoolean(point.rightEditable);
  }
  if (point.smooth !== undefined) {
    normalized.smooth = asBoolean(point.smooth);
  }

  return normalized;
}

function normalizeSkeletonContour(contour) {
  if (!isPlainObject(contour)) {
    return createSkeletonContour();
  }

  const normalized = { ...contour };
  normalized.isClosed = asBoolean(contour.isClosed);
  normalized.points = Array.isArray(contour.points)
    ? contour.points.map(normalizeSkeletonPoint).filter((point) => !!point)
    : [];
  normalized.defaultWidth = asNonNegativeNumber(contour.defaultWidth, DEFAULT_WIDTH);
  normalized.capStyle = normalizeCapStyle(contour.capStyle ?? "butt");
  normalized.capRadiusRatio = clampCapRadiusRatio(
    contour.capRadiusRatio,
    DEFAULT_CAP_RADIUS_RATIO
  );
  normalized.capTension = asFiniteNumber(contour.capTension, DEFAULT_CAP_TENSION);
  normalized.capAngle = clampCapAngle(contour.capAngle, DEFAULT_CAP_ANGLE);
  normalized.capDistance = asFiniteNumber(contour.capDistance, 0);
  normalized.defaultDistribution = asFiniteNumber(contour.defaultDistribution, 0);

  return normalized;
}

/**
 * Remove derived (rebuildable) fields from skeleton data.
 * By default this strips generated contour index tracking.
 */
export function stripDerivedSkeletonFields(
  skeletonData,
  { keepGeneratedContourIndices = false } = {}
) {
  if (!isPlainObject(skeletonData)) {
    return {};
  }
  const stripped = JSON.parse(JSON.stringify(skeletonData));
  if (!keepGeneratedContourIndices) {
    delete stripped.generatedContourIndices;
  }
  return stripped;
}

/**
 * Normalize skeleton data to a consistent shape.
 * This keeps unknown custom fields, but sanitizes known core fields.
 */
export function normalizeSkeletonData(
  skeletonData,
  { keepGeneratedContourIndices = false } = {}
) {
  const stripped = stripDerivedSkeletonFields(skeletonData, {
    keepGeneratedContourIndices,
  });

  const normalized = isPlainObject(stripped) ? { ...stripped } : {};
  normalized.version = asFiniteNumber(stripped.version, 1);
  normalized.contours = Array.isArray(stripped.contours)
    ? stripped.contours.map(normalizeSkeletonContour)
    : [];

  if (keepGeneratedContourIndices) {
    normalized.generatedContourIndices = Array.isArray(stripped.generatedContourIndices)
      ? stripped.generatedContourIndices.filter((index) => Number.isInteger(index) && index >= 0)
      : [];
  } else {
    delete normalized.generatedContourIndices;
  }

  return normalized;
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

function _sanitizeGeneratedIndices(indices) {
  if (!Array.isArray(indices)) {
    return [];
  }
  const seen = new Set();
  const sanitized = [];
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || seen.has(index)) {
      continue;
    }
    seen.add(index);
    sanitized.push(index);
  }
  return sanitized;
}

function _arrayShallowEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function _packedContoursEqual(contourA, contourB) {
  if (!contourA || !contourB) {
    return false;
  }
  if (!!contourA.isClosed !== !!contourB.isClosed) {
    return false;
  }
  if (
    contourA.pointTypes.length !== contourB.pointTypes.length ||
    contourA.coordinates.length !== contourB.coordinates.length
  ) {
    return false;
  }
  for (let i = 0; i < contourA.pointTypes.length; i++) {
    if (contourA.pointTypes[i] !== contourB.pointTypes[i]) {
      return false;
    }
  }
  for (let i = 0; i < contourA.coordinates.length; i++) {
    if (contourA.coordinates[i] !== contourB.coordinates[i]) {
      return false;
    }
  }
  return true;
}

function _recoverGeneratedIndices(path, generatedContours) {
  if (!path || !generatedContours.length) {
    return [];
  }
  const packedGeneratedContours = generatedContours.map((contour) => packContour(contour));
  const recoveredIndices = [];
  for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
    const existingContour = path.getContour(contourIndex);
    for (const packedGeneratedContour of packedGeneratedContours) {
      if (_packedContoursEqual(existingContour, packedGeneratedContour)) {
        recoveredIndices.push(contourIndex);
        break;
      }
    }
  }
  return recoveredIndices;
}

function _recoverGeneratedIndicesForMapping(path, generatedContours) {
  if (!path || !generatedContours.length) {
    return [];
  }
  const packedGeneratedContours = generatedContours.map((contour) => packContour(contour));
  const usedIndices = new Set();
  const recoveredIndices = [];
  for (const packedGeneratedContour of packedGeneratedContours) {
    let foundIndex = -1;
    for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
      if (usedIndices.has(contourIndex)) {
        continue;
      }
      const existingContour = path.getContour(contourIndex);
      if (_packedContoursEqual(existingContour, packedGeneratedContour)) {
        foundIndex = contourIndex;
        break;
      }
    }
    if (foundIndex < 0) {
      return [];
    }
    usedIndices.add(foundIndex);
    recoveredIndices.push(foundIndex);
  }
  return recoveredIndices;
}

/**
 * Resolve generated contour indices against the current path geometry.
 * Uses contour matching as primary source of truth, with stored indices as fallback.
 */
export function resolveGeneratedContourIndices(path, skeletonData) {
  if (!path || !skeletonData) {
    return [];
  }
  const generatedContours = generateContoursFromSkeleton(skeletonData);
  if (!generatedContours.length) {
    return [];
  }

  const recoveredMappingIndices = _sanitizeGeneratedIndices(
    _recoverGeneratedIndicesForMapping(path, generatedContours)
  );
  if (recoveredMappingIndices.length === generatedContours.length) {
    return recoveredMappingIndices;
  }

  const storedIndices = _sanitizeGeneratedIndices(skeletonData.generatedContourIndices).filter(
    (index) => index < path.numContours
  );
  if (storedIndices.length === generatedContours.length) {
    return storedIndices;
  }

  const recoveredLooseIndices = _sanitizeGeneratedIndices(
    _recoverGeneratedIndices(path, generatedContours)
  );
  if (recoveredLooseIndices.length === generatedContours.length) {
    return recoveredLooseIndices;
  }

  return [];
}

function _canUpdateGeneratedContoursInPlace(path, generatedContours, oldGeneratedIndices) {
  if (!path || oldGeneratedIndices.length !== generatedContours.length) {
    return null;
  }
  const updates = [];
  for (let i = 0; i < oldGeneratedIndices.length; i++) {
    const contourIndex = oldGeneratedIndices[i];
    if (contourIndex >= path.numContours) {
      return null;
    }
    const startPoint =
      contourIndex === 0 ? 0 : path.contourInfo[contourIndex - 1].endPoint + 1;
    const endPoint = path.contourInfo[contourIndex].endPoint;
    const numExistingPoints = endPoint - startPoint + 1;
    const packedContour = packContour(generatedContours[i]);
    const numNewPoints = packedContour.coordinates.length / 2;
    if (numExistingPoints !== numNewPoints) {
      return null;
    }
    updates.push({ startPoint, packedContour });
  }
  return updates;
}

/**
 * Regenerate outline contours for a skeleton and update generated contour indices.
 * Mutates both `staticGlyph.path` and `skeletonData.generatedContourIndices`.
 */
export function regenerateSkeletonContours(
  staticGlyph,
  skeletonData,
  { preferInPlace = false } = {}
) {
  if (!staticGlyph?.path || !skeletonData) {
    return {
      generatedContours: [],
      generatedContourIndices: [],
      didUpdateInPlace: false,
    };
  }

  const path = staticGlyph.path;
  const generatedContours = generateContoursFromSkeleton(skeletonData);
  let oldGeneratedIndices = _sanitizeGeneratedIndices(skeletonData.generatedContourIndices);
  const oldIndicesAllInRange = oldGeneratedIndices.every((index) => index < path.numContours);
  const oldIndicesAreUsable =
    oldGeneratedIndices.length === generatedContours.length &&
    oldIndicesAllInRange;
  const oldIndicesCanPurge =
    oldGeneratedIndices.length > generatedContours.length && oldIndicesAllInRange;

  // Recovery path: infer indices from contours matching generated geometry.
  // Do this not only when indices are missing, but also when stored indices drift
  // after non-skeleton contour edits that shift contour ordering.
  if (generatedContours.length) {
    const recoveredIndices = _sanitizeGeneratedIndices(
      _recoverGeneratedIndices(path, generatedContours)
    );
    const recoveredMappingIndices = _sanitizeGeneratedIndices(
      _recoverGeneratedIndicesForMapping(path, generatedContours)
    );
    const hasRecoveredMapping = recoveredMappingIndices.length === generatedContours.length;
    const recoveredHasDuplicates = recoveredIndices.length > generatedContours.length;
    const shouldRecover =
      recoveredHasDuplicates ||
      (!oldIndicesAreUsable && !oldIndicesCanPurge) ||
      (oldIndicesAreUsable &&
        hasRecoveredMapping &&
        !_arrayShallowEqual(oldGeneratedIndices, recoveredMappingIndices));
    if (shouldRecover && recoveredIndices.length >= generatedContours.length) {
      // If there are extra matching contours, preserve all for a cleanup pass
      // (replace-at-existing will be skipped because lengths differ).
      if (recoveredHasDuplicates) {
        oldGeneratedIndices = recoveredIndices;
      } else if (hasRecoveredMapping) {
        oldGeneratedIndices = recoveredMappingIndices;
      }
    }
  }

  if (preferInPlace) {
    const updates = _canUpdateGeneratedContoursInPlace(
      path,
      generatedContours,
      oldGeneratedIndices
    );
    if (updates) {
      for (const { startPoint, packedContour } of updates) {
        const numPoints = packedContour.coordinates.length / 2;
        for (let pointIndex = 0; pointIndex < numPoints; pointIndex++) {
          path.setPointPosition(
            startPoint + pointIndex,
            packedContour.coordinates[pointIndex * 2],
            packedContour.coordinates[pointIndex * 2 + 1]
          );
        }
      }
      skeletonData.generatedContourIndices = [...oldGeneratedIndices];
      return {
        generatedContours,
        generatedContourIndices: [...oldGeneratedIndices],
        didUpdateInPlace: true,
      };
    }
  }

  const canReplaceAtExistingIndices =
    oldGeneratedIndices.length === generatedContours.length &&
    oldGeneratedIndices.every((index) => index < path.numContours);
  if (canReplaceAtExistingIndices) {
    for (let i = 0; i < oldGeneratedIndices.length; i++) {
      const contourIndex = oldGeneratedIndices[i];
      path.deleteContour(contourIndex);
      path.insertContour(contourIndex, packContour(generatedContours[i]));
    }
    skeletonData.generatedContourIndices = [...oldGeneratedIndices];
    return {
      generatedContours,
      generatedContourIndices: [...oldGeneratedIndices],
      didUpdateInPlace: false,
    };
  }

  const sortedIndices = [...oldGeneratedIndices].sort((a, b) => b - a);
  for (const contourIndex of sortedIndices) {
    if (contourIndex < path.numContours) {
      path.deleteContour(contourIndex);
    }
  }

  const minOldIndex = oldGeneratedIndices.length ? Math.min(...oldGeneratedIndices) : null;
  let insertionIndex = minOldIndex === null ? path.numContours : minOldIndex;
  insertionIndex = Math.max(0, Math.min(insertionIndex, path.numContours));
  const newGeneratedIndices = [];
  for (let i = 0; i < generatedContours.length; i++) {
    const newIndex = insertionIndex + i;
    path.insertContour(newIndex, packContour(generatedContours[i]));
    newGeneratedIndices.push(newIndex);
  }
  skeletonData.generatedContourIndices = newGeneratedIndices;

  return {
    generatedContours,
    generatedContourIndices: newGeneratedIndices,
    didUpdateInPlace: false,
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
    capAngle: DEFAULT_CAP_ANGLE,
    capDistance: 0,
    defaultDistribution: 0,
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
