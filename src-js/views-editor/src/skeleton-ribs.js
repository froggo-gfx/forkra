import {
  calculateNormalAtSkeletonPoint,
  getSkeletonHandleOffset,
  getSkeletonPointHalfWidth,
  getSkeletonPointNudge,
  getSkeletonRibPosition,
  getSkeletonRibSidesForPoint,
  isSkeletonSideLocked,
  setSkeletonHandleOffset,
  setSkeletonPointSideNudge,
  setSkeletonPointSideWidth,
} from "@fontra/core/skeleton-model.js";

// getSkeletonRibPosition now lives in fontra-core (single shared forward
// projection, WS-16 Task 2); re-exported here for existing WS-8/11 call sites.
export { getSkeletonRibPosition };

const SKELETON_RIB_KEY_KIND = "skeletonRib";
const VALID_RIB_SIDES = new Set(["left", "right"]);

export function makeSkeletonRibKey(contourId, pointId, side) {
  assertSkeletonRibSide(side);
  return `${SKELETON_RIB_KEY_KIND}/${contourId}/${pointId}/${side}`;
}

export function parseSkeletonRibKey(key) {
  const parts = `${key}`.split("/");
  if (parts.length !== 4 || parts[0] !== SKELETON_RIB_KEY_KIND) {
    throw new Error(`invalid skeleton rib key: ${key}`);
  }
  const [, contourId, pointId, side] = parts;
  assertSkeletonRibSide(side);
  if (!contourId || !pointId) {
    throw new Error(`invalid skeleton rib key: ${key}`);
  }
  return { contourId, pointId, side };
}

export function getSkeletonRibBehaviorName(event, modifiers = {}) {
  if (modifiers.tangentRibMode && event?.altKey) {
    return "rib-tangent-interpolate";
  }
  if (modifiers.tangentRibMode) {
    return "rib-tangent";
  }
  if (event?.altKey) {
    return "rib-interpolate";
  }
  return "rib-default";
}

export function getSkeletonRibAddress(skeletonData, contourId, pointId, side) {
  assertSkeletonRibSide(side);
  const contours = skeletonData?.contours || [];
  const contourIndex = contours.findIndex(
    (contour) => `${contour.id}` === `${contourId}`
  );
  if (contourIndex < 0) {
    return null;
  }
  const contour = contours[contourIndex];
  const points = contour.points || [];
  const pointIndex = points.findIndex((point) => `${point.id}` === `${pointId}`);
  if (pointIndex < 0) {
    return null;
  }
  const point = points[pointIndex];
  if (point.type) {
    return null;
  }
  if (!getSkeletonRibSidesForPoint(contour, point).includes(side)) {
    return null;
  }
  return {
    contour,
    contourIndex,
    point,
    pointIndex,
    side,
    defaultWidth: contour.defaultWidth,
    normal: calculateNormalAtSkeletonPoint(contour, pointIndex),
  };
}

export function createSkeletonRibExecutor(
  address,
  behaviorName = "rib-default",
  { interpolationAxis = null } = {}
) {
  const { contour, point, side, defaultWidth, normal } = address;
  const leftHalfWidth = getSkeletonPointHalfWidth(point, defaultWidth, "left");
  const rightHalfWidth = getSkeletonPointHalfWidth(point, defaultWidth, "right");
  const isSingleSided =
    contour.singleSided === "left" || contour.singleSided === "right";
  const originalHalfWidth = isSingleSided
    ? leftHalfWidth + rightHalfWidth
    : getSkeletonPointHalfWidth(point, defaultWidth, side);
  const originalNudge = getSkeletonPointNudge(point, side, defaultWidth);
  const tangent = { x: -normal.y, y: normal.x };
  // Adjustment is available unless the side is locked.
  const adjustable = !isSkeletonSideLocked(point, side);
  const forceTangent =
    behaviorName === "rib-tangent" || behaviorName === "rib-tangent-interpolate";
  // Alt-drag interpolation (unlocked ribs only): the rib point slides along
  // the axis between its generated handles; width stays fixed and the handle
  // offsets are compensated so the handles stay put on canvas (donor
  // InterpolatingRibBehavior). Without handles the axis degrades to the
  // tangent, i.e. a pure nudge.
  const interpolate =
    adjustable &&
    (behaviorName === "rib-interpolate" || behaviorName === "rib-tangent-interpolate");
  const axis = interpolate
    ? interpolationAxis || { dir: tangent, hasHandle: {} }
    : null;
  const originalOffsets = interpolate
    ? {
        in: getSkeletonHandleOffset(point, side, "in"),
        out: getSkeletonHandleOffset(point, side, "out"),
      }
    : null;

  return {
    contourId: contour.id,
    pointId: point.id,
    side,
    normal,
    applyDelta(delta, { constrainMode = null, round = Math.round } = {}) {
      if (axis) {
        const deltaAlongAxis = delta.x * axis.dir.x + delta.y * axis.dir.y;
        const axisDotTangent = axis.dir.x * tangent.x + axis.dir.y * tangent.y;
        const deltaNudge = axisDotTangent * deltaAlongAxis;
        const handleOffsets = {};
        for (const role of ["in", "out"]) {
          if (!axis.hasHandle?.[role]) {
            continue;
          }
          const original = originalOffsets[role];
          handleOffsets[role] = {
            x: round(original.x - tangent.x * deltaNudge),
            y: round(original.y - tangent.y * deltaNudge),
            detached: original.detached,
          };
        }
        return {
          halfWidth: originalHalfWidth,
          nudge: round(originalNudge + deltaNudge),
          side,
          handleOffsets,
        };
      }
      const normalSign = side === "left" ? 1 : -1;
      const normalDelta = normalSign * (delta.x * normal.x + delta.y * normal.y);
      const tangentDelta = delta.x * tangent.x + delta.y * tangent.y;
      const tangentOnly = forceTangent || constrainMode === "tangent";
      const halfWidth = tangentOnly
        ? originalHalfWidth
        : Math.max(0, round(originalHalfWidth + normalDelta));
      // Free drag changes width only; the tangent nudge is exclusively the
      // Z-drag (donor parity: "Nudge follows tangent only when constrained").
      const nudge =
        adjustable && tangentOnly ? round(originalNudge + tangentDelta) : originalNudge;
      return { halfWidth, nudge, side };
    },
  };
}

export function applySkeletonRibExecutorResult(address, result) {
  const { contour, point, side, defaultWidth } = address;
  if (contour.singleSided === "left" || contour.singleSided === "right") {
    setSingleSidedTotalWidth(point, defaultWidth, side, result.halfWidth);
  } else {
    setSkeletonPointSideWidth(point, defaultWidth, side, result.halfWidth);
  }
  if (!isSkeletonSideLocked(point, side)) {
    setSkeletonPointSideNudge(point, side, result.nudge);
    for (const [role, offset] of Object.entries(result.handleOffsets || {})) {
      setSkeletonHandleOffset(point, side, role, offset, { round: (value) => value });
    }
  }
}

export function* iterSkeletonRibTargets(skeletonData) {
  for (const contour of skeletonData?.contours || []) {
    for (let pointIndex = 0; pointIndex < (contour.points || []).length; pointIndex++) {
      const point = contour.points[pointIndex];
      if (point.type) {
        continue;
      }
      const normal = calculateNormalAtSkeletonPoint(contour, pointIndex);
      for (const side of getSkeletonRibSidesForPoint(contour, point)) {
        yield {
          selectionKey: makeSkeletonRibKey(contour.id, point.id, side),
          contour,
          contourId: contour.id,
          point,
          pointId: point.id,
          pointIndex,
          side,
          defaultWidth: contour.defaultWidth,
          normal,
          position: getSkeletonRibPosition(contour, point, side),
        };
      }
    }
  }
}

function assertSkeletonRibSide(side) {
  if (!VALID_RIB_SIDES.has(side)) {
    throw new Error(`invalid skeleton rib side: ${side}`);
  }
}

function setSingleSidedTotalWidth(point, defaultWidth, side, totalWidth) {
  const linked = point.width?.linked !== false;
  const value = Math.max(0, totalWidth);
  if (linked) {
    // Single-sided stores the total as a symmetric split; set both halves
    // explicitly (linked no longer mirrors, it applies equal deltas).
    const half = value / 2;
    for (const s of ["left", "right"]) {
      setSkeletonPointSideWidth(point, defaultWidth, s, half, {
        linked: false,
        round: (value) => value,
      });
    }
    point.width.linked = true;
    return;
  }
  const oppositeSide = side === "left" ? "right" : "left";
  const opposite = getSkeletonPointHalfWidth(point, defaultWidth, oppositeSide);
  setSkeletonPointSideWidth(point, defaultWidth, side, value - opposite, {
    linked: false,
  });
}
