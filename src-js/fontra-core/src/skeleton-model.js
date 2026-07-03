import { Bezier } from "bezier-js";
import {
  deleteFontraInternalSection,
  getFontraInternalSection,
  setFontraInternalSection,
} from "./fontra-internal-data.js";
import {
  FONTRA_INTERNAL_KEY,
  FONTRA_INTERNAL_SECTIONS,
} from "./fontra-internal-schema.js";
import { deepCopyObject } from "./utils.ts";
import { normalizeVector, rotateVector90CW, subVectors } from "./vector.js";

export const SKELETON_SCHEMA_VERSION = 1;
export const DEFAULT_SKELETON_WIDTH = 80;

const VALID_POINT_TYPES = new Set([null, "cubic"]);
const VALID_SINGLE_SIDED = new Set([null, "left", "right"]);
const VALID_CAP_STYLES = new Set(["butt", "round", "square"]);
const CAP_CORNER_POINT_FIELDS = [
  "capRadiusRatio",
  "capTension",
  "capAngle",
  "capDistance",
  "roundnessStrength",
  "cornerAsymmetry",
];

export function makeEmptySkeletonData() {
  return {
    version: SKELETON_SCHEMA_VERSION,
    nextId: 1,
    contours: [],
    generated: [],
  };
}

export function makeSkeletonContour(data = {}, skeletonData = null) {
  return normalizeSkeletonContour(
    {
      id: allocateSkeletonId(skeletonData, data.id),
      closed: false,
      defaultWidth: DEFAULT_SKELETON_WIDTH,
      singleSided: null,
      points: [],
      ...data,
    },
    skeletonData
  );
}

export function makeSkeletonPoint(data = {}, skeletonData = null) {
  return normalizeSkeletonPoint(
    {
      id: allocateSkeletonId(skeletonData, data.id),
      x: 0,
      y: 0,
      type: null,
      smooth: false,
      ...data,
    },
    skeletonData
  );
}

export function normalizeSkeletonData(data) {
  const normalized = makeEmptySkeletonData();
  const usedIds = new Set();

  for (const contour of Array.isArray(data?.contours) ? data.contours : []) {
    normalized.contours.push(normalizeSkeletonContour(contour, normalized, usedIds));
  }

  normalized.generated = Array.isArray(data?.generated)
    ? data.generated.map((entry) => ({
        skeletonContourId: asInteger(entry?.skeletonContourId, null),
        pathContourIndex: asInteger(entry?.pathContourIndex, null),
        pointMap: Array.isArray(entry?.pointMap) ? deepCopyObject(entry.pointMap) : [],
      }))
    : [];

  normalized.nextId = Math.max(
    asInteger(data?.nextId, 1),
    maxUsedId(usedIds) + 1,
    normalized.nextId
  );
  normalized.version = SKELETON_SCHEMA_VERSION;
  return normalized;
}

export function normalizeSkeletonContour(contour, skeletonData = null, usedIds = null) {
  const id = normalizeId(contour?.id, skeletonData, usedIds);
  const normalized = {
    id,
    closed: contour?.closed === true,
    defaultWidth: asNonNegativeNumber(contour?.defaultWidth, DEFAULT_SKELETON_WIDTH),
    singleSided: VALID_SINGLE_SIDED.has(contour?.singleSided)
      ? contour.singleSided
      : null,
    capStyle: VALID_CAP_STYLES.has(contour?.capStyle) ? contour.capStyle : "butt",
    reversed: contour?.reversed === true,
    points: [],
  };
  if (Number.isFinite(contour?.cornerTrimRatio)) {
    normalized.cornerTrimRatio = contour.cornerTrimRatio;
  }
  if (Number.isFinite(contour?.cornerRadiusBoost)) {
    normalized.cornerRadiusBoost = contour.cornerRadiusBoost;
  }
  for (const point of Array.isArray(contour?.points) ? contour.points : []) {
    normalized.points.push(normalizeSkeletonPoint(point, skeletonData, usedIds));
  }
  return normalized;
}

export function normalizeSkeletonPoint(point, skeletonData = null, usedIds = null) {
  const type = VALID_POINT_TYPES.has(point?.type) ? point.type : null;
  const normalized = {
    id: normalizeId(point?.id, skeletonData, usedIds),
    x: asFiniteNumber(point?.x, 0),
    y: asFiniteNumber(point?.y, 0),
    type,
    smooth: point?.smooth === true,
  };

  if (!type) {
    normalized.width = normalizeWidth(point?.width);
    normalized.nudge = normalizeNudge(point?.nudge);
    normalized.editable = normalizeEditable(point?.editable);
    normalized.handleOffsets = normalizeHandleOffsets(point?.handleOffsets);
    normalized.capStyle = VALID_CAP_STYLES.has(point?.capStyle) ? point.capStyle : null;
    for (const field of CAP_CORNER_POINT_FIELDS) {
      if (Number.isFinite(point?.[field])) {
        normalized[field] = point[field];
      }
    }
  }

  return normalized;
}

export function getSkeletonContour(skeletonData, contourId) {
  return skeletonData?.contours?.find((contour) => contour.id === contourId) ?? null;
}

export function getSkeletonPoint(skeletonData, contourId, pointId) {
  const contour = getSkeletonContour(skeletonData, contourId);
  return contour?.points?.find((point) => point.id === pointId) ?? null;
}

export function appendSkeletonContour(skeletonData, contourData = {}) {
  if (!skeletonData) {
    return null;
  }
  const contour = makeSkeletonContour(contourData, skeletonData);
  skeletonData.contours.push(contour);
  return contour;
}

export function appendSkeletonPoint(skeletonData, contourId, pointData = {}) {
  const contour = getSkeletonContour(skeletonData, contourId);
  if (!contour) {
    return null;
  }
  const point = makeSkeletonPoint(pointData, skeletonData);
  contour.points.push(point);
  return point;
}

export function updateSkeletonPoint(skeletonData, contourId, pointId, patch) {
  const contour = getSkeletonContour(skeletonData, contourId);
  if (!contour) {
    return null;
  }
  const pointIndex = contour.points.findIndex((point) => point.id === pointId);
  if (pointIndex < 0) {
    return null;
  }
  const updatedPoint = normalizeSkeletonPoint({
    ...contour.points[pointIndex],
    ...patch,
    id: pointId,
  });
  contour.points[pointIndex] = updatedPoint;
  return updatedPoint;
}

export function deleteSkeletonPoint(skeletonData, contourId, pointId) {
  const contour = getSkeletonContour(skeletonData, contourId);
  if (!contour) {
    return false;
  }
  const pointIndex = contour.points.findIndex((point) => point.id === pointId);
  if (pointIndex < 0) {
    return false;
  }
  contour.points.splice(pointIndex, 1);
  return true;
}

export function getSkeletonPointHalfWidth(point, defaultWidth, side) {
  const width = normalizeWidth(point?.width);
  if (side === "left") {
    return width.left;
  }
  if (side === "right") {
    return width.right;
  }
  return asNonNegativeNumber(defaultWidth, DEFAULT_SKELETON_WIDTH) / 2;
}

export function getSkeletonPointWidth(point, defaultWidth, side = null) {
  if (side === "left") {
    return getSkeletonPointHalfWidth(point, defaultWidth, "left") * 2;
  }
  if (side === "right") {
    return getSkeletonPointHalfWidth(point, defaultWidth, "right") * 2;
  }
  return (
    getSkeletonPointHalfWidth(point, defaultWidth, "left") +
    getSkeletonPointHalfWidth(point, defaultWidth, "right")
  );
}

export function getSkeletonPointNudge(
  point,
  side,
  defaultWidth = DEFAULT_SKELETON_WIDTH
) {
  const editable = normalizeEditable(point?.editable);
  if (!editable[side]) {
    return 0;
  }
  if (getSkeletonPointHalfWidth(point, defaultWidth, side) < 0.5) {
    return 0;
  }
  return normalizeNudge(point?.nudge)[side];
}

export function buildSegmentsFromSkeletonPoints(points, closed) {
  const segments = [];
  const onCurveIndices = [];
  for (let i = 0; i < points.length; i++) {
    if (!points[i].type) {
      onCurveIndices.push(i);
    }
  }
  if (onCurveIndices.length < 2) {
    return segments;
  }
  for (let i = 0; i < onCurveIndices.length - 1; i++) {
    segments.push(makeSegment(points, onCurveIndices[i], onCurveIndices[i + 1]));
  }
  if (closed) {
    const lastIdx = onCurveIndices[onCurveIndices.length - 1];
    const firstIdx = onCurveIndices[0];
    segments.push(makeWrappingSegment(points, lastIdx, firstIdx));
  }
  return segments;
}

export function calculateNormalAtSkeletonPoint(skeletonContour, pointIndexOrPointId) {
  const points = skeletonContour?.points || [];
  if (points.length < 2) {
    return { x: 0, y: 1 };
  }
  const pointIndex =
    pointIndexOrPointId >= 0 && pointIndexOrPointId < points.length
      ? pointIndexOrPointId
      : points.findIndex((point) => point.id === pointIndexOrPointId);
  const point = points[pointIndex];
  if (!point || point.type) {
    return { x: 0, y: 1 };
  }

  const segments = buildSegmentsFromSkeletonPoints(points, skeletonContour.closed);
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

  const dir1 = incomingSegment ? segmentEndDirection(incomingSegment) : null;
  const dir2 = outgoingSegment ? segmentStartDirection(outgoingSegment) : null;

  if (!dir1 && dir2) {
    return getEffectiveNormal(point, rotateVector90CW(dir2));
  }
  if (dir1 && !dir2) {
    return getEffectiveNormal(point, rotateVector90CW(dir1));
  }
  if (!dir1 && !dir2) {
    return getEffectiveNormal(point, { x: 0, y: 1 });
  }

  const dot = dir1.x * dir2.x + dir1.y * dir2.y;
  const cross = dir1.x * dir2.y - dir1.y * dir2.x;
  const halfAngle = Math.atan2(cross, dot) / 2;
  const cosH = Math.cos(halfAngle);
  const sinH = Math.sin(halfAngle);
  const bisector = normalizeVector({
    x: dir1.x * cosH - dir1.y * sinH,
    y: dir1.x * sinH + dir1.y * cosH,
  });
  return getEffectiveNormal(point, rotateVector90CW(bisector));
}

export function projectSkeletonRibPoint(point, normal, halfWidth, side, nudge = 0) {
  const sign = side === "left" ? 1 : -1;
  const tangent = { x: -normal.y, y: normal.x };
  const baseX = Math.round(point.x + sign * normal.x * halfWidth);
  const baseY = Math.round(point.y + sign * normal.y * halfWidth);
  return {
    x: Math.round(baseX + tangent.x * nudge),
    y: Math.round(baseY + tangent.y * nudge),
  };
}

export function getSkeletonData(layerOrCustomData) {
  if (layerOrCustomData?.customData) {
    const internalSkeleton = getFontraInternalSection(
      layerOrCustomData,
      FONTRA_INTERNAL_SECTIONS.SKELETON
    );
    return internalSkeleton ? normalizeSkeletonData(internalSkeleton) : null;
  }
  const customData = layerOrCustomData?.customData ?? layerOrCustomData;
  const internalSkeleton =
    customData?.[FONTRA_INTERNAL_KEY]?.[FONTRA_INTERNAL_SECTIONS.SKELETON];
  return internalSkeleton ? normalizeSkeletonData(internalSkeleton) : null;
}

export function setSkeletonData(layer, skeletonData) {
  if (!layer) {
    return;
  }
  if (skeletonData === null || skeletonData === undefined) {
    clearSkeletonData(layer);
    return;
  }
  setFontraInternalSection(
    layer,
    FONTRA_INTERNAL_SECTIONS.SKELETON,
    normalizeSkeletonData(skeletonData)
  );
}

export function clearSkeletonData(layer) {
  if (!layer) {
    return;
  }
  deleteFontraInternalSection(layer, FONTRA_INTERNAL_SECTIONS.SKELETON);
}

function makeSegment(points, startIdx, endIdx) {
  return {
    startPoint: points[startIdx],
    endPoint: points[endIdx],
    controlPoints: points.slice(startIdx + 1, endIdx).filter((point) => point.type),
  };
}

function makeWrappingSegment(points, lastIdx, firstIdx) {
  return {
    startPoint: points[lastIdx],
    endPoint: points[firstIdx],
    controlPoints: [
      ...points.slice(lastIdx + 1).filter((point) => point.type),
      ...points.slice(0, firstIdx).filter((point) => point.type),
    ],
  };
}

function segmentStartDirection(segment) {
  if (!segment.controlPoints.length) {
    return normalizeVector(subVectors(segment.endPoint, segment.startPoint));
  }
  const bezier = createBezierFromSegment(segment);
  const deriv = bezier.derivative(0);
  return normalizeVector({ x: deriv.x, y: deriv.y });
}

function segmentEndDirection(segment) {
  if (!segment.controlPoints.length) {
    return normalizeVector(subVectors(segment.endPoint, segment.startPoint));
  }
  const bezier = createBezierFromSegment(segment);
  const deriv = bezier.derivative(1);
  return normalizeVector({ x: deriv.x, y: deriv.y });
}

function createBezierFromSegment(segment) {
  return new Bezier(segment.startPoint, ...segment.controlPoints, segment.endPoint);
}

function getEffectiveNormal(point, calculatedNormal) {
  if (point.forceHorizontal) {
    return { x: 0, y: calculatedNormal.y >= 0 ? 1 : -1 };
  }
  if (point.forceVertical) {
    return { x: calculatedNormal.x >= 0 ? 1 : -1, y: 0 };
  }
  return calculatedNormal;
}

function allocateSkeletonId(skeletonData, requestedId = undefined) {
  if (Number.isInteger(requestedId) && requestedId > 0) {
    if (skeletonData) {
      skeletonData.nextId = Math.max(skeletonData.nextId || 1, requestedId + 1);
    }
    return requestedId;
  }
  if (!skeletonData) {
    return 1;
  }
  const id = Math.max(1, asInteger(skeletonData.nextId, 1));
  skeletonData.nextId = id + 1;
  return id;
}

function normalizeId(value, skeletonData, usedIds) {
  let id = Number.isInteger(value) && value > 0 ? value : null;
  if (!id || usedIds?.has(id)) {
    id = allocateSkeletonId(skeletonData);
  } else if (skeletonData) {
    skeletonData.nextId = Math.max(skeletonData.nextId || 1, id + 1);
  }
  usedIds?.add(id);
  return id;
}

function maxUsedId(usedIds) {
  return usedIds?.size ? Math.max(...usedIds) : 0;
}

function normalizeWidth(width) {
  return {
    left: asNonNegativeNumber(width?.left, DEFAULT_SKELETON_WIDTH / 2),
    right: asNonNegativeNumber(width?.right, DEFAULT_SKELETON_WIDTH / 2),
    linked: width?.linked !== false,
  };
}

function normalizeNudge(nudge) {
  return {
    left: asFiniteNumber(nudge?.left, 0),
    right: asFiniteNumber(nudge?.right, 0),
  };
}

function normalizeEditable(editable) {
  return {
    left: editable?.left === true,
    right: editable?.right === true,
  };
}

function normalizeHandleOffsets(handleOffsets) {
  return handleOffsets &&
    typeof handleOffsets === "object" &&
    !Array.isArray(handleOffsets)
    ? deepCopyObject(handleOffsets)
    : {};
}

function asInteger(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
}

function asFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function asNonNegativeNumber(value, fallback) {
  return Math.max(0, asFiniteNumber(value, fallback));
}
