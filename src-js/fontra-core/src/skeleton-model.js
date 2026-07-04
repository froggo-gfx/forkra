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

// Path contour indices currently occupied by generated skeleton contours.
// Generated geometry is derived data: interaction surfaces (point selection,
// Tunni, segment hits) must not treat it as regular path geometry.
export function getGeneratedPathContourIndices(skeletonData) {
  const indices = new Set();
  for (const entry of skeletonData?.generated || []) {
    if (Number.isInteger(entry.pathContourIndex) && entry.pathContourIndex >= 0) {
      indices.add(entry.pathContourIndex);
    }
  }
  return indices;
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

export function setSkeletonPointSideWidth(
  point,
  defaultWidth,
  side,
  halfWidth,
  { linked = point?.width?.linked !== false, round = Math.round } = {}
) {
  assertSkeletonRibSide(side);
  const width = normalizeWidth(point?.width);
  const value = Math.max(0, round(halfWidth));
  if (side === "left") {
    width.left = value;
    if (linked) {
      width.right = value;
    }
  } else {
    width.right = value;
    if (linked) {
      width.left = value;
    }
  }
  width.linked = linked;
  point.width = width;
}

export function setSkeletonPointSideNudge(
  point,
  side,
  nudge,
  { round = Math.round } = {}
) {
  assertSkeletonRibSide(side);
  const normalizedNudge = normalizeNudge(point?.nudge);
  normalizedNudge[side] = round(asFiniteNumber(nudge, 0));
  point.nudge = normalizedNudge;
}

export function setSkeletonContourDefaultWidth(
  contour,
  defaultWidth,
  { round = Math.round } = {}
) {
  contour.defaultWidth = Math.max(0, round(asFiniteNumber(defaultWidth, 0)));
}

export function getSkeletonHandleOffsetKey(side, role) {
  assertSkeletonRibSide(side);
  assertSkeletonHandleRole(role);
  return `${side}${role === "in" ? "In" : "Out"}`;
}

export function getSkeletonHandleOffset(point, side, role) {
  const key = getSkeletonHandleOffsetKey(side, role);
  const offset = point?.handleOffsets?.[key];
  return {
    x: asFiniteNumber(offset?.x, 0),
    y: asFiniteNumber(offset?.y, 0),
    detached: offset?.detached === true,
  };
}

export function setSkeletonHandleOffset(
  point,
  side,
  role,
  offset,
  { round = Math.round } = {}
) {
  const key = getSkeletonHandleOffsetKey(side, role);
  const existing = getSkeletonHandleOffset(point, side, role);
  point.handleOffsets = {
    ...normalizeHandleOffsets(point?.handleOffsets),
    [key]: {
      x: round(asFiniteNumber(offset?.x, 0)),
      y: round(asFiniteNumber(offset?.y, 0)),
      detached: offset?.detached === true || existing.detached === true,
    },
  };
}

export function setSkeletonHandleDetached(point, side, detached) {
  assertSkeletonRibSide(side);
  for (const role of ["in", "out"]) {
    const offset = getSkeletonHandleOffset(point, side, role);
    setSkeletonHandleOffset(
      point,
      side,
      role,
      { ...offset, detached: detached === true },
      { round: (value) => value }
    );
  }
}

export function setSkeletonPointTotalWidth(
  point,
  defaultWidth,
  totalWidth,
  { round = Math.round } = {}
) {
  const width = normalizeWidth(point?.width);
  const total = Math.max(0, asFiniteNumber(totalWidth, 0));
  const currentTotal = width.left + width.right;
  const leftFrac = currentTotal > 0 ? width.left / currentTotal : 0.5;
  width.left = Math.max(0, round(total * leftFrac));
  width.right = Math.max(0, round(total * (1 - leftFrac)));
  point.width = width;
  clearCollapsedRibSides(point);
}

export function setSkeletonPointWidthDistribution(
  point,
  defaultWidth,
  distribution,
  { round = Math.round } = {}
) {
  const width = normalizeWidth(point?.width);
  const total = width.left + width.right;
  const d = Math.max(-100, Math.min(100, asFiniteNumber(distribution, 0)));
  width.left = Math.max(0, round((total * (1 + d / 100)) / 2));
  width.right = Math.max(0, round((total * (1 - d / 100)) / 2));
  point.width = width;
  clearCollapsedRibSides(point);
}

export function setSkeletonPointWidthLinked(point, linked) {
  const width = normalizeWidth(point?.width);
  width.linked = linked === true;
  point.width = width;
}

export function setSkeletonContourSingleSided(contour, sideOrNull) {
  contour.singleSided = VALID_SINGLE_SIDED.has(sideOrNull) ? sideOrNull : null;
}

export function setSkeletonCapParameters(point, values, { round = null } = {}) {
  if (!values || typeof values !== "object") {
    return;
  }
  if (VALID_CAP_STYLES.has(values.capStyle)) {
    point.capStyle = values.capStyle;
  }
  for (const field of ["capRadiusRatio", "capTension", "capAngle", "capDistance"]) {
    if (field in values && Number.isFinite(values[field])) {
      point[field] = round ? round(values[field]) : values[field];
    }
  }
}

export function setSkeletonCornerParameters(point, values, { round = null } = {}) {
  if (!values || typeof values !== "object") {
    return;
  }
  for (const field of ["roundnessStrength", "cornerAsymmetry"]) {
    if (field in values && Number.isFinite(values[field])) {
      point[field] = round ? round(values[field]) : values[field];
    }
  }
}

export function resetSkeletonEditableRibHandles(point, side) {
  assertSkeletonRibSide(side);
  const offsets = normalizeHandleOffsets(point?.handleOffsets);
  for (const role of ["in", "out"]) {
    delete offsets[getSkeletonHandleOffsetKey(side, role)];
  }
  point.handleOffsets = offsets;
}

export function resetSkeletonEditableRib(point, side) {
  assertSkeletonRibSide(side);
  const nudge = normalizeNudge(point?.nudge);
  nudge[side] = 0;
  point.nudge = nudge;
  const editable = normalizeEditable(point?.editable);
  editable[side] = false;
  point.editable = editable;
  resetSkeletonEditableRibHandles(point, side);
}

function clearCollapsedRibSides(point) {
  for (const side of ["left", "right"]) {
    if (getSkeletonPointHalfWidth(point, null, side) < 0.5) {
      resetSkeletonEditableRib(point, side);
    }
  }
}

// Pure translate of all skeleton point coordinates. Returns a new data object.
// Widths, nudges and handle offsets are relative to the point and therefore
// translation-invariant, so they are left untouched.
export function translateSkeletonData(skeletonData, dx, dy) {
  const data = deepCopyObject(skeletonData);
  for (const contour of data?.contours || []) {
    for (const point of contour.points || []) {
      point.x = asFiniteNumber(point.x, 0) + dx;
      point.y = asFiniteNumber(point.y, 0) + dy;
    }
  }
  return data;
}

// Pure affine of all skeleton point coordinates. Point positions go through the
// full affine; handle offsets are vectors relative to their point, so only the
// linear part (xx, xy, yx, yy) applies — never the translation (dx, dy).
export function transformSkeletonData(skeletonData, affine) {
  const data = deepCopyObject(skeletonData);
  const linearX = (x, y) => affine.xx * x + affine.yx * y;
  const linearY = (x, y) => affine.xy * x + affine.yy * y;
  for (const contour of data?.contours || []) {
    for (const point of contour.points || []) {
      const [x, y] = affine.transformPoint(
        asFiniteNumber(point.x, 0),
        asFiniteNumber(point.y, 0)
      );
      point.x = x;
      point.y = y;
      if (point.handleOffsets && typeof point.handleOffsets === "object") {
        for (const key of Object.keys(point.handleOffsets)) {
          const offset = point.handleOffsets[key];
          if (!offset || typeof offset !== "object") {
            continue;
          }
          const ox = asFiniteNumber(offset.x, 0);
          const oy = asFiniteNumber(offset.y, 0);
          offset.x = linearX(ox, oy);
          offset.y = linearY(ox, oy);
        }
      }
    }
  }
  return data;
}

// Re-key every contour and point id from `nextId` upward, remapping provenance
// references (generated[].skeletonContourId and each pointMap entry's
// skeletonPointId). Used on paste so pasted ids never collide with the target
// glyph's existing skeleton ids. Returns { data, nextId }.
export function allocateSkeletonIds(skeletonData, nextId) {
  const data = deepCopyObject(skeletonData);
  let counter = Number.isInteger(nextId) && nextId > 0 ? nextId : 1;
  const contourIdMap = new Map();
  const pointIdMap = new Map();
  for (const contour of data?.contours || []) {
    const oldContourId = contour.id;
    contour.id = counter++;
    contourIdMap.set(oldContourId, contour.id);
    for (const point of contour.points || []) {
      const oldPointId = point.id;
      point.id = counter++;
      pointIdMap.set(oldPointId, point.id);
    }
  }
  for (const entry of data?.generated || []) {
    if (contourIdMap.has(entry.skeletonContourId)) {
      entry.skeletonContourId = contourIdMap.get(entry.skeletonContourId);
    }
    for (const mapEntry of entry.pointMap || []) {
      if (pointIdMap.has(mapEntry.skeletonPointId)) {
        mapEntry.skeletonPointId = pointIdMap.get(mapEntry.skeletonPointId);
      }
    }
  }
  data.nextId = counter;
  return { data, nextId: counter };
}

export function getSkeletonRibSidesForPoint(contour, point) {
  if (!point || point.type) {
    return [];
  }
  if (contour?.singleSided === "left" || contour?.singleSided === "right") {
    return [contour.singleSided];
  }
  return ["left", "right"];
}

// Forward projection of a rib endpoint in glyph space (the C4 gizmo position).
// This is the single shared source used by rendering (WS-8), hit-testing
// (WS-11) and selection bounds (WS-16); never re-derive it locally.
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

function assertSkeletonRibSide(side) {
  if (side !== "left" && side !== "right") {
    throw new Error(`invalid skeleton rib side: ${side}`);
  }
}

function assertSkeletonHandleRole(role) {
  if (role !== "in" && role !== "out") {
    throw new Error(`invalid skeleton handle role: ${role}`);
  }
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
