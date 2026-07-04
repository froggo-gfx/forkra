import {
  calculateNormalAtSkeletonPoint,
  getSkeletonPointHalfWidth,
  getSkeletonPointNudge,
  getSkeletonRibSidesForPoint,
  projectSkeletonRibPoint,
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
