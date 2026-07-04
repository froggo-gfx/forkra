import {
  calculateNormalAtSkeletonPoint,
  getSkeletonPointHalfWidth,
  getSkeletonPointNudge,
  getSkeletonRibSidesForPoint,
  projectSkeletonRibPoint,
  setSkeletonPointSideNudge,
  setSkeletonPointSideWidth,
} from "@fontra/core/skeleton-model.js";

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

export function getSkeletonRibPosition(contour, point, side) {
  assertSkeletonRibSide(side);
  if (!getSkeletonRibSidesForPoint(contour, point).includes(side)) {
    return null;
  }
  const pointIndex = (contour.points || []).indexOf(point);
  const normal = calculateNormalAtSkeletonPoint(
    contour,
    pointIndex >= 0 ? pointIndex : point.id
  );
  const defaultWidth = contour.defaultWidth;
  const leftHalfWidth = getSkeletonPointHalfWidth(point, defaultWidth, "left");
  const rightHalfWidth = getSkeletonPointHalfWidth(point, defaultWidth, "right");
  const halfWidth =
    contour.singleSided === "left" || contour.singleSided === "right"
      ? leftHalfWidth + rightHalfWidth
      : getSkeletonPointHalfWidth(point, defaultWidth, side);
  const nudge = getSkeletonPointNudge(point, side, defaultWidth);
  return projectSkeletonRibPoint(point, normal, halfWidth, side, nudge);
}

export function createSkeletonRibExecutor(address, behaviorName = "rib-default") {
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
  const editable = point.editable?.[side] === true;
  const forceTangent =
    behaviorName === "rib-tangent" || behaviorName === "rib-tangent-interpolate";

  return {
    contourId: contour.id,
    pointId: point.id,
    side,
    applyDelta(delta, { constrainMode = null, round = Math.round } = {}) {
      const normalSign = side === "left" ? 1 : -1;
      const normalDelta = normalSign * (delta.x * normal.x + delta.y * normal.y);
      const tangentDelta = delta.x * tangent.x + delta.y * tangent.y;
      const tangentOnly = forceTangent || constrainMode === "tangent";
      const halfWidth = tangentOnly
        ? originalHalfWidth
        : Math.max(0, round(originalHalfWidth + normalDelta));
      const nudge =
        editable && (tangentOnly || !forceTangent)
          ? round(originalNudge + tangentDelta)
          : originalNudge;
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
  if (point.editable?.[side] === true) {
    setSkeletonPointSideNudge(point, side, result.nudge);
  }
}

export function isSkeletonRibDragAllowed(skeletonData, selection) {
  const parsed = selection instanceof Set ? [...selection] : selection || [];
  const ribKeys = parsed.filter((key) => `${key}`.startsWith("skeletonRib/"));
  if (!ribKeys.length) {
    return true;
  }
  const addresses = [];
  for (const key of ribKeys) {
    const { contourId, pointId, side } = parseSkeletonRibKey(key);
    const address = getSkeletonRibAddress(skeletonData, contourId, pointId, side);
    if (!address) {
      return false;
    }
    addresses.push(address);
  }
  if (addresses.every((address) => address.point.editable?.[address.side] === true)) {
    return true;
  }
  const contourIds = new Set(addresses.map((address) => address.contour.id));
  if (contourIds.size !== 1) {
    return false;
  }
  const contour = addresses[0].contour;
  const selectedIndices = new Set(addresses.map((address) => address.pointIndex));
  const onCurveIndices = (contour.points || [])
    .map((point, index) => (point.type ? null : index))
    .filter((index) => index !== null);
  const selectedOrderIndices = onCurveIndices
    .map((pointIndex, orderIndex) =>
      selectedIndices.has(pointIndex) ? orderIndex : null
    )
    .filter((index) => index !== null);
  if (selectedOrderIndices.length <= 1) {
    return true;
  }
  selectedOrderIndices.sort((a, b) => a - b);
  const contiguous = selectedOrderIndices.every(
    (orderIndex, index) => !index || orderIndex === selectedOrderIndices[index - 1] + 1
  );
  if (contiguous) {
    return true;
  }
  if (!contour.closed) {
    return false;
  }
  const firstRun = selectedOrderIndices[0];
  const lastRun = selectedOrderIndices.at(-1);
  return (
    firstRun === 0 &&
    lastRun === onCurveIndices.length - 1 &&
    selectedOrderIndices.every((orderIndex, index) => {
      if (!index) return true;
      return (
        orderIndex === selectedOrderIndices[index - 1] + 1 ||
        selectedOrderIndices[index - 1] === firstRun
      );
    })
  );
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
    const half = value / 2;
    setSkeletonPointSideWidth(point, defaultWidth, side, half, {
      linked: true,
      round: (value) => value,
    });
    return;
  }
  const oppositeSide = side === "left" ? "right" : "left";
  const opposite = getSkeletonPointHalfWidth(point, defaultWidth, oppositeSide);
  setSkeletonPointSideWidth(point, defaultWidth, side, value - opposite, {
    linked: false,
  });
}
