import { recordChanges } from "@fontra/core/change-recorder.js";
import {
  ChangeCollector,
  applyChange,
  consolidateChanges,
} from "@fontra/core/changes.js";
import { translate } from "@fontra/core/localization.js";
import { connectContours, toggleSmooth } from "@fontra/core/path-functions.js";
import {
  getSkeletonData,
  regenerateSkeletonContours,
  setSkeletonData,
  calculateNormalAtSkeletonPoint,
  getPointHalfWidth,
} from "@fontra/core/skeleton-contour-generator.js";
import { getBaseKeyFromKeyEvent, getShortCuts } from "@fontra/core/actions.js";
import {
  centeredRect,
  normalizeRect,
  offsetRect,
  pointInRect,
  rectSize,
} from "@fontra/core/rectangle.js";
import {
  difference,
  isSuperset,
  symmetricDifference,
  union,
} from "@fontra/core/set-ops.js";
import { Transform } from "@fontra/core/transform.js";
import {
  arrowKeyDeltas,
  assert,
  commandKeyProperty,
  enumerate,
  parseSelection,
  range,
} from "@fontra/core/utils.js";
import { copyBackgroundImage, copyComponent } from "@fontra/core/var-glyph.js";
import { VarPackedPath } from "@fontra/core/var-path.js";
import * as vector from "@fontra/core/vector.js";
import {
  EditBehaviorFactory,
  HANDLE_EXECUTOR_FAMILIES,
  RIB_EXECUTOR_FAMILIES,
  createEditableHandleBehavior,
  createRibBehaviorExecutor,
  createSkeletonEditBehavior,
  constrainHorVerDiag,
  getHandleDetachedKey,
  getHandleOffsetKeys,
  getRibHandleOffsetKeys,
  getRibNudgeKey,
  makeRoundFunc,
  resolveEditableGeneratedHandlePlan,
  resolveHandleEqualizePlan,
  resolveModifierPlan,
} from "./edit-behavior.js";
import { getSkeletonDataFromGlyph } from "./skeleton-visualization-layers.js";
import {
  skeletonTunniHitTest,
  buildSegmentsFromSkeletonPoints,
  calculateSkeletonControlPointsFromTunniDelta,
  calculateSkeletonOnCurveFromTunni,
  calculateSkeletonEqualizedControlPoints,
  areSkeletonTensionsEqualized,
  calculateSkeletonTunniPoint,
  calculateSkeletonTrueTunniPoint,
} from "@fontra/core/tunni-core.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import { getPinPoint } from "./panel-transformation.js";
import { equalGlyphSelection } from "./scene-controller.js";
import {
  glyphSelector,
  registerVisualizationLayerDefinition,
  strokeRoundNode,
  strokeSquareNode,
} from "./visualization-layer-definitions.js";
// Import Tunni functions for integration with pointer tool
import {
  handleTunniPointMouseDown,
  handleTunniPointMouseDrag,
  handleTunniPointMouseUp,
  tunniLayerHitTest,
  equalizeThenQuantizeSegmentControlPoints,
  handleTrueTunniPointMouseDown,
  handleTrueTunniPointMouseDrag,
  handleTrueTunniPointMouseUp,
  calculateTrueTunniPointDragChanges,
} from "@fontra/core/tunni-calculations.js";

const transformHandleMargin = 6;
const transformHandleSize = 8;
const rotationHandleSizeFactor = 1.2;
const DEFAULT_SKELETON_WIDTH = 80;
const REALTIME_MEASURE_ACTION = "action.realtime.measure";
const REALTIME_MEASURE_DIRECT_ACTION = "action.realtime.measure-direct";
const REALTIME_EQUALIZE_ACTION = "action.realtime.equalize";
const REALTIME_RIB_TANGENT_ACTION = "action.realtime.rib-tangent";
const REALTIME_FIXED_RIB_ACTION = "action.realtime.fixed-rib";
const REALTIME_FIXED_RIB_COMPRESS_ACTION = "action.realtime.fixed-rib-compress";
const FIXED_RIB_SCALE_CONTROL_POINTS = true;

function projectRibPoint(point, normal, halfWidth, side, nudge = 0) {
  const sign = side === "left" ? 1 : -1;
  const tangent = { x: -normal.y, y: normal.x };
  const baseX = Math.round(point.x + sign * normal.x * halfWidth);
  const baseY = Math.round(point.y + sign * normal.y * halfWidth);
  return {
    x: Math.round(baseX + tangent.x * nudge),
    y: Math.round(baseY + tangent.y * nudge),
  };
}

function getRibNudgeValue(point, side) {
  return point[getRibNudgeKey(side)] || 0;
}

function setRibNudgeValue(point, side, nudge) {
  point[getRibNudgeKey(side)] = nudge;
}

function applyRibHandleOffsetCompensation(point, side, change) {
  const handleKeys = getRibHandleOffsetKeys(side);
  // When 2D compensation is present, clear legacy 1D offsets so the schema has one source.
  point[handleKeys.in.x] = change.handleInOffsetX;
  point[handleKeys.in.y] = change.handleInOffsetY;
  point[handleKeys.out.x] = change.handleOutOffsetX;
  point[handleKeys.out.y] = change.handleOutOffsetY;
  delete point[handleKeys.in.oneD];
  delete point[handleKeys.out.oneD];
}

function getEditableHandleKeys(side, handleType) {
  const offsetKeys = getHandleOffsetKeys(side, handleType);
  return {
    offset1DKey: offsetKeys.oneD,
    offsetXKey: offsetKeys.x,
    offsetYKey: offsetKeys.y,
    detachedKey: getHandleDetachedKey(side),
  };
}

function matchEventModifiers(shortCut, event) {
  const expectedModifiers = { ...shortCut };
  if (shortCut.commandKey) {
    expectedModifiers[commandKeyProperty] = true;
  }
  return ["metaKey", "ctrlKey", "shiftKey", "altKey"].every(
    (modifierProp) => !!expectedModifiers[modifierProp] === !!event[modifierProp]
  );
}

function eventMatchesActionShortCut(actionIdentifier, event) {
  const shortCuts = getShortCuts(actionIdentifier);
  if (!shortCuts?.length) return false;
  const baseKey = getBaseKeyFromKeyEvent(event);
  for (const shortCut of shortCuts) {
    if (!shortCut?.baseKey) continue;
    if (shortCut.baseKey !== baseKey) continue;
    if (!matchEventModifiers(shortCut, event)) continue;
    return true;
  }
  return false;
}

function eventMatchesActionBaseKey(actionIdentifier, event) {
  const shortCuts = getShortCuts(actionIdentifier);
  if (!shortCuts?.length) return false;
  const baseKey = getBaseKeyFromKeyEvent(event);
  return shortCuts.some((shortCut) => shortCut?.baseKey === baseKey);
}

function findPrevOnCurveIndex(points, startIndex, isClosed) {
  for (let i = startIndex - 1; i >= 0; i--) {
    if (points[i] && !points[i].type) {
      return i;
    }
  }
  if (!isClosed) return null;
  for (let i = points.length - 1; i > startIndex; i--) {
    if (points[i] && !points[i].type) {
      return i;
    }
  }
  return null;
}

function findNextOnCurveIndex(points, startIndex, isClosed) {
  for (let i = startIndex + 1; i < points.length; i++) {
    if (points[i] && !points[i].type) {
      return i;
    }
  }
  if (!isClosed) return null;
  for (let i = 0; i < startIndex; i++) {
    if (points[i] && !points[i].type) {
      return i;
    }
  }
  return null;
}

function resetWidthStateFromOriginal(origPoint, workPoint) {
  if (origPoint.width === undefined) {
    delete workPoint.width;
  } else {
    workPoint.width = origPoint.width;
  }
  if (origPoint.leftWidth === undefined) {
    delete workPoint.leftWidth;
  } else {
    workPoint.leftWidth = origPoint.leftWidth;
  }
  if (origPoint.rightWidth === undefined) {
    delete workPoint.rightWidth;
  } else {
    workPoint.rightWidth = origPoint.rightWidth;
  }
  if (origPoint.widthLinked === undefined) {
    delete workPoint.widthLinked;
  } else {
    workPoint.widthLinked = origPoint.widthLinked;
  }
}

function hasAsymmetricWidths(point) {
  return point.leftWidth !== undefined || point.rightWidth !== undefined;
}

function isWidthLinked(point) {
  if (point.widthLinked !== undefined) {
    return !!point.widthLinked;
  }
  return !hasAsymmetricWidths(point);
}

function clearEditableWhenCollapsed(point, leftHW, rightHW) {
  if (leftHW <= 0) {
    point.leftEditable = false;
  }
  if (rightHW <= 0) {
    point.rightEditable = false;
  }
}

function applyLinkedWidthDelta(
  point,
  basePoint,
  defaultWidth,
  side,
  delta,
  linked,
  roundFunc = Math.round
) {
  const baseLeft = getPointHalfWidth(basePoint, defaultWidth, "left");
  const baseRight = getPointHalfWidth(basePoint, defaultWidth, "right");
  const baseHasAsym = hasAsymmetricWidths(basePoint);

  if (linked) {
    const newLeft = Math.max(0, roundFunc(baseLeft + delta));
    const newRight = Math.max(0, roundFunc(baseRight + delta));
    if (baseHasAsym) {
      point.leftWidth = newLeft;
      point.rightWidth = newRight;
      delete point.width;
    } else {
      point.width = Math.max(0, newLeft + newRight);
      delete point.leftWidth;
      delete point.rightWidth;
    }
    clearEditableWhenCollapsed(point, newLeft, newRight);
    return;
  }

  const newLeft =
    side === "left" ? Math.max(0, roundFunc(baseLeft + delta)) : Math.max(0, roundFunc(baseLeft));
  const newRight =
    side === "right" ? Math.max(0, roundFunc(baseRight + delta)) : Math.max(0, roundFunc(baseRight));
  point.leftWidth = newLeft;
  point.rightWidth = newRight;
  delete point.width;
  clearEditableWhenCollapsed(point, newLeft, newRight);
}

function enforceSmoothColinearityForSkeleton(points, isClosed, roundFunc = Math.round) {
  if (!points || points.length < 2) return;
  const numPoints = points.length;

  for (let i = 0; i < numPoints; i++) {
    const point = points[i];
    if (!point || point.type || !point.smooth) continue;
    if (point.skipColinear) continue;

    if (!isClosed && (i === 0 || i === numPoints - 1)) {
      continue;
    }

    const prevIdx = (i - 1 + numPoints) % numPoints;
    const nextIdx = (i + 1) % numPoints;
    const prevPoint = points[prevIdx];
    const nextPoint = points[nextIdx];
    if (!prevPoint || !nextPoint) continue;

    const prevIsOnCurve = !prevPoint.type;
    const nextIsOnCurve = !nextPoint.type;

    if (!prevIsOnCurve && !nextIsOnCurve) {
      const vecIn = { x: prevPoint.x - point.x, y: prevPoint.y - point.y };
      const vecOut = { x: nextPoint.x - point.x, y: nextPoint.y - point.y };
      const lenIn = Math.hypot(vecIn.x, vecIn.y);
      const lenOut = Math.hypot(vecOut.x, vecOut.y);
      if (lenIn < 1e-3 || lenOut < 1e-3) continue;

      const dirIn = { x: vecIn.x / lenIn, y: vecIn.y / lenIn };
      const dirOut = { x: vecOut.x / lenOut, y: vecOut.y / lenOut };
      const avgDx = dirOut.x - dirIn.x;
      const avgDy = dirOut.y - dirIn.y;
      const avgLen = Math.hypot(avgDx, avgDy);
      if (avgLen < 1e-3) continue;

      const dirX = avgDx / avgLen;
      const dirY = avgDy / avgLen;
      prevPoint.x = roundFunc(point.x - dirX * lenIn);
      prevPoint.y = roundFunc(point.y - dirY * lenIn);
      nextPoint.x = roundFunc(point.x + dirX * lenOut);
      nextPoint.y = roundFunc(point.y + dirY * lenOut);
      continue;
    }

    if (prevIsOnCurve && !nextIsOnCurve) {
      const linearVec = { x: point.x - prevPoint.x, y: point.y - prevPoint.y };
      const lineLen = Math.hypot(linearVec.x, linearVec.y);
      const curveVec = { x: nextPoint.x - point.x, y: nextPoint.y - point.y };
      const curveLen = Math.hypot(curveVec.x, curveVec.y);
      if (lineLen < 1e-3 || curveLen < 1e-3) continue;
      const dirX = linearVec.x / lineLen;
      const dirY = linearVec.y / lineLen;
      nextPoint.x = roundFunc(point.x + dirX * curveLen);
      nextPoint.y = roundFunc(point.y + dirY * curveLen);
      continue;
    }

    if (!prevIsOnCurve && nextIsOnCurve) {
      const linearVec = { x: nextPoint.x - point.x, y: nextPoint.y - point.y };
      const lineLen = Math.hypot(linearVec.x, linearVec.y);
      const curveVec = { x: prevPoint.x - point.x, y: prevPoint.y - point.y };
      const curveLen = Math.hypot(curveVec.x, curveVec.y);
      if (lineLen < 1e-3 || curveLen < 1e-3) continue;
      const dirX = linearVec.x / lineLen;
      const dirY = linearVec.y / lineLen;
      prevPoint.x = roundFunc(point.x - dirX * curveLen);
      prevPoint.y = roundFunc(point.y - dirY * curveLen);
    }
  }
}

function normalizeVectorSafe(vec, epsilon = 1e-6) {
  const len = Math.hypot(vec.x, vec.y);
  if (!(len > epsilon)) {
    return null;
  }
  return { x: vec.x / len, y: vec.y / len };
}

function rotateVector(vec, cos, sin) {
  return {
    x: vec.x * cos - vec.y * sin,
    y: vec.x * sin + vec.y * cos,
  };
}

function calculateHandleTensionsForSegment(segment) {
  if (!segment?.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }
  const [cp1, cp2] = segment.controlPoints;
  const start = segment.startPoint;
  const end = segment.endPoint;
  const trueTunni = calculateSkeletonTrueTunniPoint(segment);
  const tensionPoint = trueTunni || {
    x: (cp1.x + cp2.x) / 2,
    y: (cp1.y + cp2.y) / 2,
  };
  const distStart = Math.hypot(tensionPoint.x - start.x, tensionPoint.y - start.y);
  const distEnd = Math.hypot(tensionPoint.x - end.x, tensionPoint.y - end.y);
  const lenStart = Math.hypot(cp1.x - start.x, cp1.y - start.y);
  const lenEnd = Math.hypot(cp2.x - end.x, cp2.y - end.y);
  const tensionStart = distStart > 1e-6 ? lenStart / distStart : null;
  const tensionEnd = distEnd > 1e-6 ? lenEnd / distEnd : null;
  return { tensionStart, tensionEnd, lenStart, lenEnd };
}

function computeHandleLengthsFromTensions(
  startPoint,
  startDir,
  endPoint,
  endDir,
  tensionStart,
  tensionEnd
) {
  const line1End = { x: startPoint.x + startDir.x, y: startPoint.y + startDir.y };
  const line2End = { x: endPoint.x + endDir.x, y: endPoint.y + endDir.y };
  const intersection = vector.intersect(startPoint, line1End, endPoint, line2End);
  let distStartToTunni = null;
  let distEndToTunni = null;
  if (intersection && Number.isFinite(intersection.t1) && Number.isFinite(intersection.t2)) {
    distStartToTunni = Math.abs(intersection.t1);
    distEndToTunni = Math.abs(intersection.t2);
  } else {
    const distTotal = vector.distance(startPoint, endPoint);
    distStartToTunni = distTotal / 2;
    distEndToTunni = distTotal / 2;
  }

  const startLen = Number.isFinite(tensionStart)
    ? tensionStart * distStartToTunni
    : null;
  const endLen = Number.isFinite(tensionEnd)
    ? tensionEnd * distEndToTunni
    : null;
  return { startLen, endLen };
}

function applyFixedRibDragToSkeletonData(
  originalSkeletonData,
  workingSkeletonData,
  selectedSkeletonPoints,
  clickedSkeletonPoint,
  dragDelta,
  roundFunc,
  options = {}
) {
  if (!selectedSkeletonPoints?.size || !clickedSkeletonPoint) {
    return false;
  }

  const { contourIdx, pointIdx } = clickedSkeletonPoint;
  const clickedContour = originalSkeletonData.contours?.[contourIdx];
  const clickedPoint = clickedContour?.points?.[pointIdx];
  if (!clickedContour || !clickedPoint || clickedPoint.type) {
    return false;
  }

  const clickedNormal = calculateNormalAtSkeletonPoint(clickedContour, pointIdx);
  const normalLen = Math.hypot(clickedNormal.x, clickedNormal.y);
  if (!(normalLen > 1e-6)) {
    return false;
  }

  const d = dragDelta.x * clickedNormal.x + dragDelta.y * clickedNormal.y;
  const hasMovement = Math.abs(d) >= 1e-6;

  const selectedByContour = new Map();
  for (const key of selectedSkeletonPoints) {
    const [ci, pi] = key.split("/").map(Number);
    if (!selectedByContour.has(ci)) {
      selectedByContour.set(ci, new Set());
    }
    selectedByContour.get(ci).add(pi);
  }

  for (const [ci, pointSet] of selectedByContour) {
    const origContour = originalSkeletonData.contours?.[ci];
    const workContour = workingSkeletonData.contours?.[ci];
    if (!origContour || !workContour) continue;

    const points = origContour.points;
    const isClosed = !!origContour.isClosed;
    const defaultWidth = origContour.defaultWidth ?? DEFAULT_SKELETON_WIDTH;
    const singleSided = origContour.singleSided ?? false;
    const singleSidedDirection = origContour.singleSidedDirection ?? "left";
    const anchorToDragSide = !!options.anchorToDragSide;
    const scaleControlPoints = !!options.scaleControlPoints;
    const anchorSide = singleSided
      ? singleSidedDirection
      : anchorToDragSide
        ? d >= 0
          ? "left"
          : "right"
        : d >= 0
          ? "right"
          : "left";

    for (let pi = 0; pi < points.length; pi++) {
      const origPoint = points[pi];
      const workPoint = workContour.points[pi];
      if (!origPoint || !workPoint) continue;
      resetWidthStateFromOriginal(origPoint, workPoint);
    }

    const onCurveDeltas = new Map();
    if (hasMovement) {
      for (const pi of pointSet) {
        const origPoint = points[pi];
        if (!origPoint || origPoint.type) continue;

        const normal = calculateNormalAtSkeletonPoint(origContour, pi);
        const len = Math.hypot(normal.x, normal.y);
        if (!(len > 1e-6)) continue;

        onCurveDeltas.set(pi, { dx: normal.x * d, dy: normal.y * d });

        const workPoint = workContour.points[pi];
        const leftHW = getPointHalfWidth(origPoint, defaultWidth, "left");
        const rightHW = getPointHalfWidth(origPoint, defaultWidth, "right");

        if (singleSided) {
          const total = leftHW + rightHW;
          const raw = anchorSide === "left" ? total - d : total + d;
          const clamped = Math.max(2, roundFunc(raw));
          workPoint.width = clamped;
          delete workPoint.leftWidth;
          delete workPoint.rightWidth;
          continue;
        }

        const linked = isWidthLinked(origPoint);
        const delta = anchorSide === "left" ? -d : d;
        applyLinkedWidthDelta(
          workPoint,
          origPoint,
          defaultWidth,
          anchorSide,
          delta,
          linked,
          roundFunc
        );
      }
    }

    if (hasMovement) {
      // First move on-curve points using their normals.
      for (let pi = 0; pi < points.length; pi++) {
        const origPoint = points[pi];
        const workPoint = workContour.points[pi];
        if (!origPoint || !workPoint || origPoint.type) continue;
        const delta = onCurveDeltas.get(pi) || null;
        if (delta && (delta.dx || delta.dy)) {
          workPoint.x = roundFunc(origPoint.x + delta.dx);
          workPoint.y = roundFunc(origPoint.y + delta.dy);
        }
      }

      if (scaleControlPoints) {
        const segments = buildSegmentsFromSkeletonPoints(points, isClosed);
        const baseHandleDirections = new Map();
        const baseHandleLengths = new Map();
        const handleAnchorByIndex = new Map();
        const segmentTransforms = new Map();
        const segmentTensions = new Map();
        const baseSmoothTangents = new Map();

        for (const segment of segments) {
          if (!segment?.controlIndices?.length) continue;
          const startIdx = segment.startIndex;
          const endIdx = segment.endIndex;
          const origStart = points[startIdx];
          const origEnd = points[endIdx];
          const newStart = workContour.points[startIdx];
          const newEnd = workContour.points[endIdx];
          if (!origStart || !origEnd || !newStart || !newEnd) continue;

          const origVec = {
            x: origEnd.x - origStart.x,
            y: origEnd.y - origStart.y,
          };
          const newVec = {
            x: newEnd.x - newStart.x,
            y: newEnd.y - newStart.y,
          };
          const origLen = Math.hypot(origVec.x, origVec.y);
          const newLen = Math.hypot(newVec.x, newVec.y);
          const useTransform = origLen > 1e-6 && newLen > 1e-6;
          const scale = origLen > 1e-6 ? newLen / origLen : 1;

          let cos = 1;
          let sin = 0;
          if (useTransform) {
            const invLen = 1 / (origLen * newLen);
            cos = (origVec.x * newVec.x + origVec.y * newVec.y) * invLen;
            sin = (origVec.x * newVec.y - origVec.y * newVec.x) * invLen;
          }

          segmentTransforms.set(segment.segmentIndex, {
            cos,
            sin,
            scale,
            useTransform,
          });

          if (segment.controlIndices.length === 2) {
            const tensionInfo = calculateHandleTensionsForSegment(segment);
            if (tensionInfo) {
              segmentTensions.set(segment.segmentIndex, tensionInfo);
            }
          }

          for (const cpIdx of segment.controlIndices) {
            const origCp = points[cpIdx];
            if (!origCp) continue;
            const isFirst = cpIdx === segment.controlIndices[0];
            const isLast = cpIdx === segment.controlIndices[segment.controlIndices.length - 1];
            const anchorIdx = isFirst ? startIdx : isLast ? endIdx : null;
            const anchorPoint = anchorIdx !== null ? points[anchorIdx] : origStart;
            if (anchorIdx !== null) {
              handleAnchorByIndex.set(cpIdx, anchorIdx);
            }
            const rel = {
              x: origCp.x - anchorPoint.x,
              y: origCp.y - anchorPoint.y,
            };
            const rotated = useTransform ? rotateVector(rel, cos, sin) : rel;
            const dir = normalizeVectorSafe(rotated);
            if (dir) {
              baseHandleDirections.set(cpIdx, dir);
            }
            baseHandleLengths.set(cpIdx, Math.hypot(rel.x, rel.y));
          }
        }

        const numPoints = points.length;
        for (let i = 0; i < numPoints; i++) {
          const point = points[i];
          if (!point || point.type || !point.smooth) continue;
          if (point.skipColinear) continue;
          if (!isClosed && (i === 0 || i === numPoints - 1)) continue;

          const prevIdx = (i - 1 + numPoints) % numPoints;
          const nextIdx = (i + 1) % numPoints;
          const prevPoint = points[prevIdx];
          const nextPoint = points[nextIdx];
          if (!prevPoint || !nextPoint) continue;

          const prevIsOnCurve = !prevPoint.type;
          const nextIsOnCurve = !nextPoint.type;
          if (prevIsOnCurve || nextIsOnCurve) continue;

          const vecIn = { x: prevPoint.x - point.x, y: prevPoint.y - point.y };
          const vecOut = { x: nextPoint.x - point.x, y: nextPoint.y - point.y };
          const lenIn = Math.hypot(vecIn.x, vecIn.y);
          const lenOut = Math.hypot(vecOut.x, vecOut.y);
          if (!(lenIn > 1e-6) || !(lenOut > 1e-6)) continue;
          const dirIn = { x: vecIn.x / lenIn, y: vecIn.y / lenIn };
          const dirOut = { x: vecOut.x / lenOut, y: vecOut.y / lenOut };
          const weighted = {
            x: dirOut.x * lenOut - dirIn.x * lenIn,
            y: dirOut.y * lenOut - dirIn.y * lenIn,
          };
          const tangent =
            normalizeVectorSafe(weighted) || dirOut || { x: -dirIn.x, y: -dirIn.y };
          baseSmoothTangents.set(i, tangent);
        }

        const smoothHandleOverrides = new Map();
        for (let i = 0; i < numPoints; i++) {
          const point = points[i];
          if (!point || point.type || !point.smooth) continue;
          if (point.skipColinear) continue;
          if (!isClosed && (i === 0 || i === numPoints - 1)) continue;

          const prevIdx = (i - 1 + numPoints) % numPoints;
          const nextIdx = (i + 1) % numPoints;
          const prevPoint = points[prevIdx];
          const nextPoint = points[nextIdx];
          if (!prevPoint || !nextPoint) continue;

          const prevIsOnCurve = !prevPoint.type;
          const nextIsOnCurve = !nextPoint.type;
          const workPoint = workContour.points[i];
          const workPrev = workContour.points[prevIdx];
          const workNext = workContour.points[nextIdx];

          if (!prevIsOnCurve && !nextIsOnCurve) {
            let tangent = baseSmoothTangents.get(i) || null;
            const dirIn =
              baseHandleDirections.get(prevIdx) ||
              normalizeVectorSafe({
                x: prevPoint.x - point.x,
                y: prevPoint.y - point.y,
              });
            const dirOut =
              baseHandleDirections.get(nextIdx) ||
              normalizeVectorSafe({
                x: nextPoint.x - point.x,
                y: nextPoint.y - point.y,
              });
            const lenIn =
              baseHandleLengths.get(prevIdx) ??
              Math.hypot(prevPoint.x - point.x, prevPoint.y - point.y);
            const lenOut =
              baseHandleLengths.get(nextIdx) ??
              Math.hypot(nextPoint.x - point.x, nextPoint.y - point.y);
            if (!tangent) {
              if (dirIn && dirOut) {
                const weighted = {
                  x: dirOut.x * lenOut - dirIn.x * lenIn,
                  y: dirOut.y * lenOut - dirIn.y * lenIn,
                };
                tangent = normalizeVectorSafe(weighted) || dirOut || {
                  x: -dirIn.x,
                  y: -dirIn.y,
                };
              } else if (dirOut) {
                tangent = dirOut;
              } else if (dirIn) {
                tangent = { x: -dirIn.x, y: -dirIn.y };
              }
            }
            if (!tangent) continue;
            smoothHandleOverrides.set(nextIdx, { dir: tangent, anchorIdx: i });
            smoothHandleOverrides.set(prevIdx, {
              dir: { x: -tangent.x, y: -tangent.y },
              anchorIdx: i,
            });
            continue;
          }

          if (prevIsOnCurve && !nextIsOnCurve) {
            if (!workPoint || !workPrev) continue;
            const linearVec = {
              x: workPoint.x - workPrev.x,
              y: workPoint.y - workPrev.y,
            };
            const dir = normalizeVectorSafe(linearVec);
            if (!dir) continue;
            smoothHandleOverrides.set(nextIdx, { dir, anchorIdx: i });
            continue;
          }

          if (!prevIsOnCurve && nextIsOnCurve) {
            if (!workPoint || !workNext) continue;
            const linearVec = {
              x: workNext.x - workPoint.x,
              y: workNext.y - workPoint.y,
            };
            const dir = normalizeVectorSafe(linearVec);
            if (!dir) continue;
            smoothHandleOverrides.set(prevIdx, {
              dir: { x: -dir.x, y: -dir.y },
              anchorIdx: i,
            });
          }
        }

        for (const segment of segments) {
          if (!segment?.controlIndices?.length) continue;
          const startIdx = segment.startIndex;
          const endIdx = segment.endIndex;
          const origStart = points[startIdx];
          const origEnd = points[endIdx];
          const newStart = workContour.points[startIdx];
          const newEnd = workContour.points[endIdx];
          if (!origStart || !origEnd || !newStart || !newEnd) continue;
          const transform = segmentTransforms.get(segment.segmentIndex);
          const scale = transform?.scale ?? 1;

          if (segment.controlIndices.length === 2) {
            const cpStartIdx = segment.controlIndices[0];
            const cpEndIdx = segment.controlIndices[segment.controlIndices.length - 1];
            const origCpStart = points[cpStartIdx];
            const origCpEnd = points[cpEndIdx];
            const workCpStart = workContour.points[cpStartIdx];
            const workCpEnd = workContour.points[cpEndIdx];
            if (!origCpStart || !origCpEnd || !workCpStart || !workCpEnd) continue;

            const overrideStart = smoothHandleOverrides.get(cpStartIdx);
            const overrideEnd = smoothHandleOverrides.get(cpEndIdx);
            const baseStartDir =
              baseHandleDirections.get(cpStartIdx) ||
              normalizeVectorSafe({
                x: origCpStart.x - origStart.x,
                y: origCpStart.y - origStart.y,
              });
            const baseEndDir =
              baseHandleDirections.get(cpEndIdx) ||
              normalizeVectorSafe({
                x: origCpEnd.x - origEnd.x,
                y: origCpEnd.y - origEnd.y,
              });
            const fallbackStartDir =
              normalizeVectorSafe({
                x: newEnd.x - newStart.x,
                y: newEnd.y - newStart.y,
              }) || { x: 1, y: 0 };
            const fallbackEndDir =
              normalizeVectorSafe({
                x: newStart.x - newEnd.x,
                y: newStart.y - newEnd.y,
              }) || { x: -fallbackStartDir.x, y: -fallbackStartDir.y };
            const startDir = overrideStart?.dir || baseStartDir || fallbackStartDir;
            const endDir = overrideEnd?.dir || baseEndDir || fallbackEndDir;

            const tensionInfo = segmentTensions.get(segment.segmentIndex);
            const { startLen, endLen } = computeHandleLengthsFromTensions(
              newStart,
              startDir,
              newEnd,
              endDir,
              tensionInfo?.tensionStart ?? null,
              tensionInfo?.tensionEnd ?? null
            );

            const origStartLen =
              tensionInfo?.lenStart ??
              Math.hypot(origCpStart.x - origStart.x, origCpStart.y - origStart.y);
            const origEndLen =
              tensionInfo?.lenEnd ??
              Math.hypot(origCpEnd.x - origEnd.x, origCpEnd.y - origEnd.y);

            const finalStartLen =
              Number.isFinite(startLen) ? startLen : origStartLen * scale;
            const finalEndLen =
              Number.isFinite(endLen) ? endLen : origEndLen * scale;

            workCpStart.x = roundFunc(newStart.x + startDir.x * finalStartLen);
            workCpStart.y = roundFunc(newStart.y + startDir.y * finalStartLen);
            workCpEnd.x = roundFunc(newEnd.x + endDir.x * finalEndLen);
            workCpEnd.y = roundFunc(newEnd.y + endDir.y * finalEndLen);
            continue;
          }

          for (const cpIdx of segment.controlIndices) {
            const origCp = points[cpIdx];
            const workCp = workContour.points[cpIdx];
            if (!origCp || !workCp) continue;

            const override = smoothHandleOverrides.get(cpIdx);
            const anchorIdx =
              override?.anchorIdx ??
              handleAnchorByIndex.get(cpIdx) ??
              startIdx;
            const origAnchor = points[anchorIdx];
            const newAnchor = workContour.points[anchorIdx];
            if (!origAnchor || !newAnchor) continue;

            const origVec = {
              x: origCp.x - origAnchor.x,
              y: origCp.y - origAnchor.y,
            };
            const origLen = Math.hypot(origVec.x, origVec.y);
            if (!(origLen > 1e-6)) {
              workCp.x = roundFunc(newAnchor.x);
              workCp.y = roundFunc(newAnchor.y);
              continue;
            }
            const dir =
              override?.dir ||
              baseHandleDirections.get(cpIdx) ||
              { x: origVec.x / origLen, y: origVec.y / origLen };
            const newLen = origLen * scale;
            workCp.x = roundFunc(newAnchor.x + dir.x * newLen);
            workCp.y = roundFunc(newAnchor.y + dir.y * newLen);
          }
        }
      } else {
        // Legacy behavior: move off-curve points by averaged on-curve deltas.
        for (let pi = 0; pi < points.length; pi++) {
          const origPoint = points[pi];
          const workPoint = workContour.points[pi];
          if (!origPoint || !workPoint || !origPoint.type) continue;

          const prevOn = findPrevOnCurveIndex(points, pi, isClosed);
          const nextOn = findNextOnCurveIndex(points, pi, isClosed);
          const hasPrevHandle =
            prevOn !== null &&
            (pi === prevOn + 1 ||
              (isClosed && prevOn === points.length - 1 && pi === 0));
          const hasNextHandle =
            nextOn !== null &&
            (pi === nextOn - 1 ||
              (isClosed && nextOn === 0 && pi === points.length - 1));
          const prevDelta = hasPrevHandle ? onCurveDeltas.get(prevOn) : null;
          const nextDelta = hasNextHandle ? onCurveDeltas.get(nextOn) : null;
          let delta = null;
          if (prevDelta && nextDelta) {
            delta = {
              dx: (prevDelta.dx + nextDelta.dx) / 2,
              dy: (prevDelta.dy + nextDelta.dy) / 2,
            };
          } else {
            delta = prevDelta || nextDelta;
          }

          if (delta && (delta.dx || delta.dy)) {
            workPoint.x = roundFunc(origPoint.x + delta.dx);
            workPoint.y = roundFunc(origPoint.y + delta.dy);
          }
        }
      }

      if (!scaleControlPoints) {
        // Preserve smooth collinearity after moving points (legacy mode).
        enforceSmoothColinearityForSkeleton(workContour.points, isClosed, roundFunc);
      }
    }
  }

  return true;
}

export class PointerTools {
  identifier = "pointer-tools";
  subTools = [PointerTool, PointerToolScale];
}

export class PointerTool extends BaseTool {
  iconPath = "/images/pointer.svg";
  identifier = "pointer-tool";

  // Measure mode (Q-key) properties
  measureMode = false;
  _boundKeyUp = null;
  _boundMeasureAltKeyDown = null;
  _boundMeasureAltKeyUp = null;

  // Equalize handles mode (X-key) properties
    equalizeMode = false;
    _boundEqualizeKeyUp = null;

    // Rib tangent drag mode (Z-key) properties
    tangentRibMode = false;
    _boundTangentRibKeyUp = null;

    // Fixed rib drag mode (F-key) properties
    fixedRibMode = false;
    _boundFixedRibKeyUp = null;

    // Fixed rib compress mode (S-key) properties
    fixedRibCompressMode = false;
    _boundFixedRibCompressKeyUp = null;

    handleKeyDown(event) {
      if (
        eventMatchesActionShortCut(REALTIME_MEASURE_ACTION, event) ||
        eventMatchesActionShortCut(REALTIME_MEASURE_DIRECT_ACTION, event)
      ) {
        if (!this.measureMode) {
          this.measureMode = true;
          this.sceneModel.measureMode = true;
          this.sceneModel.measureShowDirect =
            eventMatchesActionShortCut(REALTIME_MEASURE_DIRECT_ACTION, event) || event.altKey;
          this._boundKeyUp = (e) => this._handleMeasureKeyUp(e);
          window.addEventListener("keyup", this._boundKeyUp);
          if (!this._boundMeasureAltKeyDown) {
            this._boundMeasureAltKeyDown = (e) => this._handleMeasureAltKeyDown(e);
            window.addEventListener("keydown", this._boundMeasureAltKeyDown);
          }
          if (!this._boundMeasureAltKeyUp) {
            this._boundMeasureAltKeyUp = (e) => this._handleMeasureAltKeyUp(e);
            window.addEventListener("keyup", this._boundMeasureAltKeyUp);
          }
          this.canvasController.requestUpdate();
        }
        return;
      }
      if (eventMatchesActionShortCut(REALTIME_EQUALIZE_ACTION, event)) {
        if (!this.equalizeMode) {
          this.equalizeMode = true;
          this._boundEqualizeKeyUp = (e) => this._handleEqualizeKeyUp(e);
          window.addEventListener("keyup", this._boundEqualizeKeyUp);
        }
        return;
      }
      if (eventMatchesActionShortCut(REALTIME_RIB_TANGENT_ACTION, event)) {
        if (!this.tangentRibMode) {
          this.tangentRibMode = true;
          this._boundTangentRibKeyUp = (e) => this._handleTangentRibKeyUp(e);
          window.addEventListener("keyup", this._boundTangentRibKeyUp);
        }
        return;
      }
      if (eventMatchesActionShortCut(REALTIME_FIXED_RIB_ACTION, event)) {
        if (!this.fixedRibMode) {
          this.fixedRibMode = true;
          this._boundFixedRibKeyUp = (e) => this._handleFixedRibKeyUp(e);
          window.addEventListener("keyup", this._boundFixedRibKeyUp);
        }
        return;
      }
      if (eventMatchesActionShortCut(REALTIME_FIXED_RIB_COMPRESS_ACTION, event)) {
        if (!this.fixedRibCompressMode) {
          this.fixedRibCompressMode = true;
          this._boundFixedRibCompressKeyUp = (e) => this._handleFixedRibCompressKeyUp(e);
          window.addEventListener("keyup", this._boundFixedRibCompressKeyUp);
        }
        return;
      }
    }

    _handleMeasureKeyUp(event) {
      if (
        eventMatchesActionBaseKey(REALTIME_MEASURE_ACTION, event) ||
        eventMatchesActionBaseKey(REALTIME_MEASURE_DIRECT_ACTION, event)
      ) {
        this.measureMode = false;
        this.sceneModel.measureMode = false;
        this.sceneModel.measureHoverSegment = null;
        this.sceneModel.measureHoverRibPoint = null;
        this.sceneModel.measureHoverPoints = null;
      this.sceneModel.measureHoverHandle = null;
      if (this._boundKeyUp) {
        window.removeEventListener("keyup", this._boundKeyUp);
        this._boundKeyUp = null;
      }
      if (this._boundMeasureAltKeyDown) {
        window.removeEventListener("keydown", this._boundMeasureAltKeyDown);
        this._boundMeasureAltKeyDown = null;
      }
      if (this._boundMeasureAltKeyUp) {
        window.removeEventListener("keyup", this._boundMeasureAltKeyUp);
        this._boundMeasureAltKeyUp = null;
      }
      this.canvasController.requestUpdate();
    }
    }

    _handleMeasureAltKeyDown(event) {
      if (!this.measureMode) return;
      if (event.key === "Alt" || event.altKey) {
        this.sceneModel.measureShowDirect = true;
        this.canvasController.requestUpdate();
      }
    }

    _handleMeasureAltKeyUp(event) {
      if (!this.measureMode) return;
      if (event.key === "Alt" || !event.altKey) {
        this.sceneModel.measureShowDirect = false;
        this.canvasController.requestUpdate();
      }
    }

    _handleEqualizeKeyUp(event) {
      if (eventMatchesActionBaseKey(REALTIME_EQUALIZE_ACTION, event)) {
        this.equalizeMode = false;
        if (this._boundEqualizeKeyUp) {
          window.removeEventListener("keyup", this._boundEqualizeKeyUp);
          this._boundEqualizeKeyUp = null;
        }
      }
    }

    _handleTangentRibKeyUp(event) {
      if (eventMatchesActionBaseKey(REALTIME_RIB_TANGENT_ACTION, event)) {
        this.tangentRibMode = false;
        if (this._boundTangentRibKeyUp) {
          window.removeEventListener("keyup", this._boundTangentRibKeyUp);
          this._boundTangentRibKeyUp = null;
        }
      }
    }

    _handleFixedRibKeyUp(event) {
      if (eventMatchesActionBaseKey(REALTIME_FIXED_RIB_ACTION, event)) {
        this.fixedRibMode = false;
        if (this._boundFixedRibKeyUp) {
          window.removeEventListener("keyup", this._boundFixedRibKeyUp);
          this._boundFixedRibKeyUp = null;
        }
      }
    }

    _handleFixedRibCompressKeyUp(event) {
      if (eventMatchesActionBaseKey(REALTIME_FIXED_RIB_COMPRESS_ACTION, event)) {
        this.fixedRibCompressMode = false;
        if (this._boundFixedRibCompressKeyUp) {
          window.removeEventListener("keyup", this._boundFixedRibCompressKeyUp);
          this._boundFixedRibCompressKeyUp = null;
        }
      }
    }

  handleHover(event) {
    const sceneController = this.sceneController;
    const point = sceneController.localPoint(event);
    const size = sceneController.mouseClickMargin;

    // Q-mode: find rib point or segment under cursor for measurement
    if (this.measureMode) {
      this.sceneModel.measureShowDirect = event.altKey;

      // Check for rib point first (has priority over segments)
      const ribPointHit = this._findRibPointForMeasure(point, size);
      if (ribPointHit) {
        if (!this._ribPointsEqual(ribPointHit, this.sceneModel.measureHoverRibPoint)) {
          this.sceneModel.measureHoverRibPoint = ribPointHit;
          this.sceneModel.measureHoverSegment = null;
          this.sceneModel.measureHoverPoints = null;
          this.sceneModel.measureHoverHandle = null;
          this.canvasController.requestUpdate();
        }
        return;
      }

      // No rib point - check for control point (off-curve)
      this.sceneModel.measureHoverRibPoint = null;
      const handleHit = this._findControlPointForMeasure(point, size);
      if (!this._measurePointsEqual(handleHit, this.sceneModel.measureHoverHandle)) {
        this.sceneModel.measureHoverHandle = handleHit;
        if (handleHit) {
          this.sceneModel.measureHoverSegment = null;
          this.sceneModel.measureHoverPoints = null;
          this.canvasController.requestUpdate();
          return;
        }
      } else if (handleHit) {
        return;
      }

      // No rib point - check for segment
      this.sceneModel.measureHoverRibPoint = null;
      const segmentHit = this._findSegmentForMeasure(point, size);
      if (
        !this._segmentsEqual(segmentHit, this.sceneModel.measureHoverSegment)
      ) {
        this.sceneModel.measureHoverSegment = segmentHit;
        this.sceneModel.measureHoverPoints = null;
        this.sceneModel.measureHoverHandle = null;
        this.canvasController.requestUpdate();
      }
      if (segmentHit) {
        return;
      }

      // No segment under cursor - use selection (two points) if available
      const selectionPoints = this._getMeasurePointsFromSelection();
      if (!this._measurePointsEqual(selectionPoints, this.sceneModel.measureHoverPoints)) {
        this.sceneModel.measureHoverPoints = selectionPoints;
        this.sceneModel.measureHoverHandle = null;
        this.canvasController.requestUpdate();
      }
      return; // Don't do normal hover in measure mode
    }

    const selRect = centeredRect(point.x, point.y, size);
    const { selection, pathHit } = this.sceneModel.selectionAtPoint(
      point,
      size,
      sceneController.selection,
      sceneController.hoverSelection,
      event.altKey
    );

    // Check for rib point hover (before setting hoverSelection)
    const ribHit = this._hitTestRibPoints(event);
    let finalSelection = selection;
    if (ribHit) {
      // Add rib point to hover selection
      const ribSelKey = `skeletonRibPoint/${ribHit.contourIndex}/${ribHit.pointIndex}/${ribHit.side}`;
      finalSelection = new Set(selection);
      finalSelection.add(ribSelKey);
    }

    sceneController.hoverSelection = finalSelection;
    sceneController.hoverPathHit = pathHit;

    if (!sceneController.hoverSelection.size && !sceneController.hoverPathHit) {
      sceneController.hoveredGlyph = this.sceneModel.glyphAtPoint(point);
    } else {
      sceneController.hoveredGlyph = undefined;
    }

    this.sceneController.sceneModel.showTransformSelection = true;

    // Check if any Tunni visualization layer is active and if we're hovering over a Tunni point
    const isTunniCombinedLayerActive = this.editor.visualizationLayersSettings.model["fontra.tunni.combined"];
    const isTunniActualLayerActive = this.editor.visualizationLayersSettings.model["fontra.tunni.actual.points"];
    let isHoveringTunniPoint = false;
    let isHoveringTrueTunniPoint = false;  // New flag for true Tunni point
    
    if (isTunniCombinedLayerActive || isTunniActualLayerActive) {
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph) {
        // Convert from scene coordinates to glyph coordinates for hit testing
        const glyphPoint = {
          x: point.x - positionedGlyph.x,
          y: point.y - positionedGlyph.y,
        };
        const tunniHit = tunniLayerHitTest(glyphPoint, size, positionedGlyph, {
          editLayerName: this.sceneModel.sceneSettings?.editLayerName,
        });
        if (tunniHit) {
          // Only register the hit if the corresponding layer is active
          if (tunniHit.hitType === "tunni-point" && isTunniCombinedLayerActive) {
            isHoveringTunniPoint = true;
          } else if (tunniHit.hitType === "true-tunni-point" && isTunniActualLayerActive) {
            isHoveringTrueTunniPoint = true;
          } else if (tunniHit.hitType === "tunni-point" && !isTunniCombinedLayerActive) {
            // Visual tunni point hit but layer is not active, so ignore
            isHoveringTunniPoint = false;
          } else if (tunniHit.hitType === "true-tunni-point" && !isTunniActualLayerActive) {
            // Actual tunni point hit but layer is not active, so ignore
            isHoveringTrueTunniPoint = false;
          }
        }
      }
    }

    const resizeHandle = this.getResizeHandle(event, sceneController.selection);
    const rotationHandle = !resizeHandle
      ? this.getRotationHandle(event, sceneController.selection)
      : undefined;
    if (this.sceneController.sceneModel.hoverResizeHandle != resizeHandle) {
      this.sceneController.sceneModel.hoverResizeHandle = resizeHandle;
      this.canvasController.requestUpdate();
    }
    // Check for skeleton Tunni point hover
    let isHoveringSkeletonTunni = false;
    let skeletonTunniType = null;
    const isSkeletonTunniLayerActive =
      this.editor?.visualizationLayersSettings?.model?.["fontra.skeleton.tunni"];
    if (isSkeletonTunniLayerActive) {
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph) {
        const glyphPoint = {
          x: point.x - positionedGlyph.x,
          y: point.y - positionedGlyph.y,
        };
        const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, this.sceneModel);
        if (skeletonData) {
          const tunniHit = skeletonTunniHitTest(glyphPoint, size, skeletonData);
          if (tunniHit) {
            isHoveringSkeletonTunni = true;
            skeletonTunniType = tunniHit.type;
          }
        }
      }
    }

    if (rotationHandle) {
      this.setCursorForRotationHandle(rotationHandle);
    } else if (resizeHandle) {
      this.setCursorForResizeHandle(resizeHandle);
    } else if (isHoveringTunniPoint || isHoveringTrueTunniPoint) {
      // If hovering over a Tunni point, use pointer cursor
      // If it's a true Tunni point, we could use a different cursor
      // Only show cursor if the corresponding layer is active
      const isTunniCombinedLayerActive = this.editor.visualizationLayersSettings.model["fontra.tunni.combined"];
      const isTunniActualLayerActive = this.editor.visualizationLayersSettings.model["fontra.tunni.actual.points"];

      if (isHoveringTrueTunniPoint && isTunniActualLayerActive) {
        this.canvasController.canvas.style.cursor = "crosshair";  // Different cursor for true Tunni point
      } else if (isHoveringTunniPoint && isTunniCombinedLayerActive) {
        this.canvasController.canvas.style.cursor = "pointer";  // Current handle
      } else {
        // If the corresponding layer isn't active, don't show Tunni cursor
        this.setCursor();
      }
    } else if (isHoveringSkeletonTunni) {
      // Use different cursors for different Tunni point types
      this.canvasController.canvas.style.cursor =
        skeletonTunniType === "true-tunni" ? "crosshair" : "pointer";
    } else {
      this.setCursor();
    }
  }

  /**
   * Handle arrow key movement for skeleton points.
   * Falls back to default handler for regular path points.
   */
  async handleArrowKeys(event) {
    const sceneController = this.sceneController;

    // Check if we have skeleton points, rib points, and/or regular points selected
    const { skeletonPoint: skeletonPointSelection, skeletonRibPoint: ribPointSelection, point: regularPointSelection } =
      parseSelection(sceneController.selection);

    const hasSkeletonPoints = skeletonPointSelection?.size > 0;
    const hasRibPoints = ribPointSelection?.size > 0;
    const hasRegularPoints = regularPointSelection?.length > 0;

    // Handle skeleton point nudging (highest priority)
    if (hasSkeletonPoints) {
      // Handle skeleton point nudging (combined with regular points in one editGlyph)
      let [dx, dy] = arrowKeyDeltas[event.key];
      if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
        dx *= 100;
        dy *= 100;
      } else if (event.shiftKey) {
        dx *= 10;
        dy *= 10;
      }
      const delta = { x: dx, y: dy };

      // X+arrows equalize routing comes from central plan.
      const skeletonEqualizePlan = resolveHandleEqualizePlan("skeleton", "nudge", {
        x: this.equalizeMode,
      });
      if (skeletonEqualizePlan.supported) {
        const handled = await this._handleArrowKeysForEqualizeSkeletonHandles(
          delta,
          skeletonPointSelection
        );
        if (handled) {
          return;
        }
      }

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const editLayerName = sceneController.editingLayerNames?.[0];
      if (!editLayerName || !glyph.layers[editLayerName]) {
        return;
      }

      const layer = glyph.layers[editLayerName];
      let skeletonData = getSkeletonData(layer);
      if (!skeletonData) return;

      // Deep clone for manipulation
      const originalSkeletonData = JSON.parse(JSON.stringify(skeletonData));
      const workingSkeletonData = JSON.parse(JSON.stringify(skeletonData));

      const roundFunc = (value) => makeRoundFunc(event)(value, true);
      const useFixedRib = this.fixedRibMode || this.fixedRibCompressMode;
      let appliedFixedRib = false;

      if (useFixedRib) {
        let clickedSkeletonPoint = this.sceneController.sceneModel.initialClickedSkeletonPoint;
        if (!clickedSkeletonPoint && skeletonPointSelection?.size) {
          const firstKey = skeletonPointSelection.values().next().value;
          if (firstKey) {
            const [contourIdx, pointIdx] = firstKey.split("/").map(Number);
            if (Number.isInteger(contourIdx) && Number.isInteger(pointIdx)) {
              clickedSkeletonPoint = { contourIdx, pointIdx };
            }
          }
        }

        if (clickedSkeletonPoint) {
          appliedFixedRib = applyFixedRibDragToSkeletonData(
            originalSkeletonData,
            workingSkeletonData,
            skeletonPointSelection,
            clickedSkeletonPoint,
            delta,
            roundFunc,
            {
              anchorToDragSide: this.fixedRibCompressMode,
              scaleControlPoints: FIXED_RIB_SCALE_CONTROL_POINTS,
            }
          );
        }
      }

      if (!appliedFixedRib) {
        // Create behaviors and apply delta
        const behaviorName = getBehaviorPresetNameFromEvent("skeleton", "nudge", event);
        const behaviors = createSkeletonEditBehavior(
          originalSkeletonData,
          skeletonPointSelection,
          behaviorName
        );

        for (const behavior of behaviors) {
          const changes = behavior.applyDelta(delta);
          const contour = workingSkeletonData.contours[behavior.contourIndex];
          for (const { pointIndex, x, y } of changes) {
            contour.points[pointIndex].x = x;
            contour.points[pointIndex].y = y;
          }
        }
      }

      const allChanges = [];
      const regularRollbackParts = [];

      // 1. Regular point nudging (if any regular points selected)
      if (hasRegularPoints) {
        const layerInfo = Object.entries(
          sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
        ).map(([layerName, layerGlyph]) => {
          const behaviorFactory = new EditBehaviorFactory(
            layerGlyph,
            sceneController.selection,
            this.scalingEditBehavior
          );
          return {
            layerName,
            layerGlyph,
            changePath: ["layers", layerName, "glyph"],
            editBehavior: behaviorFactory.getBehavior(
              getBehaviorPresetNameFromEvent("regular", "nudge", event)
            ),
          };
        });

        for (const { layerGlyph, changePath, editBehavior } of layerInfo) {
          const editChange = editBehavior.makeChangeForDelta(delta);
          applyChange(layerGlyph, editChange);
          allChanges.push(consolidateChanges(editChange, changePath));
          regularRollbackParts.push(
            consolidateChanges(editBehavior.rollbackChange, changePath)
          );
        }
      }

      // 2. Update skeleton outline contours (in-place to preserve path structure)
      const staticGlyph = layer.glyph;
      const pathChange = recordChanges(staticGlyph, (sg) => {
        regenerateSkeletonContours(sg, workingSkeletonData, { preferInPlace: true });
      });
      allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]).change);

      // 3. Save skeletonData to customData
      const customDataChange = recordChanges(layer, (l) => {
        setSkeletonData(l, workingSkeletonData);
      });
      allChanges.push(customDataChange.prefixed(["layers", editLayerName]).change);

      const editChange = consolidateChanges(allChanges);
      await sendIncrementalChange(editChange);

      const rollbackParts = [
        ...regularRollbackParts,
        pathChange.prefixed(["layers", editLayerName, "glyph"]).rollbackChange,
        customDataChange.prefixed(["layers", editLayerName]).rollbackChange,
      ];

      return {
        changes: ChangeCollector.fromChanges(editChange, consolidateChanges(rollbackParts)),
        undoLabel: translate("action.nudge-selection"),
        broadcast: true,
      };
    });
    return;
  }

  // Handle rib points (when no skeleton points selected)
  if (hasRibPoints) {
    await this._handleArrowKeysForRibPoints(event, ribPointSelection);
    return;
  }

  // Check if any selected points are editable handles (from skeleton contours)
  // These need special handling: movement constrained to skeleton handle direction
  if (hasRegularPoints) {
    const editableHandles = this._getEditableGeneratedHandlesFromSelection(regularPointSelection);
    if (editableHandles.length > 0) {
      await this._handleArrowKeysForEditableHandles(event, editableHandles);
      return;
    }
  }

  const regularEqualizeNudgePlan = resolveHandleEqualizePlan("regular", "nudge", {
    x: this.equalizeMode,
  });
  if (hasRegularPoints && regularEqualizeNudgePlan.supported) {
    let [dx, dy] = arrowKeyDeltas[event.key];
    if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
      dx *= 100;
      dy *= 100;
    } else if (event.shiftKey) {
      dx *= 10;
      dy *= 10;
    }
    const delta = { x: dx, y: dy };
    const handled = await this._handleArrowKeysForEqualizePathHandles(
      delta,
      regularPointSelection
    );
    if (handled) {
      return;
    }
  }

  // No skeleton points, rib points, or editable handles - use default handler
  return sceneController.handleArrowKeys(event);
}

  setCursorForRotationHandle(handleName) {
    this.setCursor(`url('/images/cursor-rotate-${handleName}.svg') 16 16, auto`);
  }

  setCursorForResizeHandle(handleName) {
    if (handleName === "bottom-left" || handleName === "top-right") {
      this.setCursor("nesw-resize");
    } else if (handleName === "bottom-right" || handleName === "top-left") {
      this.setCursor("nwse-resize");
    } else if (handleName === "bottom-center" || handleName === "top-center") {
      this.setCursor("ns-resize");
    } else if (handleName === "middle-left" || handleName === "middle-right") {
      this.setCursor("ew-resize");
    } else {
      this.setCursor();
    }
  }

  setCursor(cursor = undefined) {
    if (cursor) {
      this.canvasController.canvas.style.cursor = cursor;
    } else {
      // Check if Tunni visualization layer is active and if we're hovering over a Tunni point
      // This check is only relevant when called from hover event, so we don't check it here
      // since this method is also called from other contexts
      const hoverSelection = this.sceneController.hoverSelection;
      if (
        hoverSelection?.size &&
        [...hoverSelection].some((selectionKey) =>
          selectionKey.startsWith("skeletonRibPoint/")
        )
      ) {
        this.canvasController.canvas.style.cursor = "pointer";
        return;
      }

      if (
      hoverSelection?.size ||
      this.sceneController.hoverPathHit
    ) {
      this.canvasController.canvas.style.cursor = "pointer";
    } else {
      this.canvasController.canvas.style.cursor = "default";
    }
  }
  }

  async handleDrag(eventStream, initialEvent) {
    // In measure mode, don't handle clicks - only hover over segments
    if (this.measureMode) {
      return;
    }

    const sceneController = this.sceneController;
    const initialSelection = sceneController.selection;

    // Check if any Tunni visualization layer is active and if we clicked on a Tunni point
    const isTunniCombinedLayerActive = this.editor.visualizationLayersSettings.model["fontra.tunni.combined"];
    const isTunniActualLayerActive = this.editor.visualizationLayersSettings.model["fontra.tunni.actual.points"];
    let tunniInitialState = null;
    let isTrueTunniPoint = false; // Flag to distinguish between current handle and true Tunni point

    if (isTunniCombinedLayerActive || isTunniActualLayerActive) {
      // First try to handle true Tunni point (intersection) - but only if that layer is active
      if (isTunniActualLayerActive) {
        tunniInitialState = handleTrueTunniPointMouseDown(
          initialEvent,
          sceneController,
          this.editor.visualizationLayersSettings
        );

        if (tunniInitialState) {
          isTrueTunniPoint = true;
        }
      }

      // If true Tunni point wasn't hit (or layer wasn't active), try visual Tunni point - but only if that layer is active
      if (!tunniInitialState && isTunniCombinedLayerActive) {
        // Fall back to current handle
        tunniInitialState = handleTunniPointMouseDown(
          initialEvent,
          sceneController,
          this.editor.visualizationLayersSettings
        );
      }
    }

    // If we clicked on a Tunni point, handle the drag operation to provide visual feedback during drag
    // while maintaining a single undo record
    if (tunniInitialState) {
      // Ctrl+Shift+click on midpoint Tunni:
      // equalize control point distances first, then quantize handles to grid.
      // Only for midpoint Tunni, not for true Tunni point (intersection).
      if (!isTrueTunniPoint && initialEvent.ctrlKey && initialEvent.shiftKey) {
        await equalizeThenQuantizeSegmentControlPoints(
          tunniInitialState.tunniPointHit.segment,
          tunniInitialState.originalSegmentPoints,
          sceneController
        );
        return;
      }

      // Process the drag events for Tunni point manipulation with visual feedback
      await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
        let finalChanges = null;

        // Set up the initial layer info for the editing operation
        const layerInfo = Object.entries(
          sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
        ).map(([layerName, layerGlyph]) => {
          return {
            layerName,
            layerGlyph,
            changePath: ["layers", layerName, "glyph"],
          };
        });

        assert(layerInfo.length >= 1, "no layer to edit");

        // Get the original point positions for rollback
        let originalOnPoint1, originalOnPoint2;
        if (isTrueTunniPoint) {
          // For true Tunni point, we need to get on-curve point positions
          originalOnPoint1 = { ...layerInfo[0].layerGlyph.path.getPoint(tunniInitialState.selectedSegment.parentPointIndices[0]) };
          originalOnPoint2 = { ...layerInfo[0].layerGlyph.path.getPoint(tunniInitialState.selectedSegment.parentPointIndices[3]) };
        } else {
          // For current handle, get control point positions
          originalOnPoint1 = { ...layerInfo[0].layerGlyph.path.getPoint(tunniInitialState.originalControlPoints.controlPoint1Index) };
          originalOnPoint2 = { ...layerInfo[0].layerGlyph.path.getPoint(tunniInitialState.originalControlPoints.controlPoint2Index) };
        }

        for await (const event of eventStream) {
          if (event.type === "mouseup") {
            // Handle mouse up event for Tunni point - finalize the changes
            break;
          } else if (event.type === "mousemove") {
            // Calculate the changes for this mouse move event
            let dragChanges;
            if (isTrueTunniPoint) {
              dragChanges = handleTrueTunniPointMouseDrag(event, tunniInitialState, sceneController, sceneController.sceneSettings?.gridSnapEnabled);
            } else {
              dragChanges = handleTunniPointMouseDrag(event, tunniInitialState, sceneController, sceneController.sceneSettings?.gridSnapEnabled);
            }

            if (dragChanges) {
              finalChanges = dragChanges;

              // Apply temporary visual changes for each mouse move event
              const deepEditChanges = [];
              for (const layer of layerInfo) {
                let tempChanges = [];

                if (isTrueTunniPoint) {
                  // For true Tunni point, change on-curve points while keeping off-curve points unchanged
                  tempChanges = [
                    { f: "=xy", a: [dragChanges.onPoint1Index, dragChanges.newOnPoint1.x, dragChanges.newOnPoint1.y] },
                    { f: "=xy", a: [dragChanges.onPoint2Index, dragChanges.newOnPoint2.x, dragChanges.newOnPoint2.y] },
                    // Keep control points unchanged
                    { f: "=xy", a: [dragChanges.controlPoint1Index, dragChanges.newControlPoint1.x, dragChanges.newControlPoint1.y] },
                    { f: "=xy", a: [dragChanges.controlPoint2Index, dragChanges.newControlPoint2.x, dragChanges.newControlPoint2.y] }
                  ];
                } else {
                  // For current handle, change control points
                  tempChanges = [
                    { f: "=xy", a: [dragChanges.controlPoint1Index, dragChanges.newControlPoint1.x, dragChanges.newControlPoint1.y] },
                    { f: "=xy", a: [dragChanges.controlPoint2Index, dragChanges.newControlPoint2.x, dragChanges.newControlPoint2.y] }
                  ];
                }

                // Apply the changes to the layer glyph path for visual feedback
                for (const tempChange of tempChanges) {
                  applyChange(layer.layerGlyph.path, tempChange);
                }

                // Consolidate the temporary changes for this layer
                deepEditChanges.push(consolidateChanges(tempChanges, [...layer.changePath, "path"]));
              }

              const editChange = consolidateChanges(deepEditChanges);
              await sendIncrementalChange(editChange, true); // true: "may drop" - for visual feedback only
            }
          }
        }

        // Prepare the final atomic changes for the undo record
        if (finalChanges) {
          // Create the final change that will be recorded for undo
          const finalLayerChanges = [];
          const rollbackChanges = [];

          for (const layer of layerInfo) {
            let finalChangesForLayer = [];
            let rollbackChangesForLayer = [];

            if (isTrueTunniPoint) {
              // For true Tunni point, change on-curve points while keeping off-curve points unchanged
              finalChangesForLayer = [
                { f: "=xy", a: [finalChanges.onPoint1Index, finalChanges.newOnPoint1.x, finalChanges.newOnPoint1.y] },
                { f: "=xy", a: [finalChanges.onPoint2Index, finalChanges.newOnPoint2.x, finalChanges.newOnPoint2.y] },
                // Keep control points unchanged
                { f: "=xy", a: [finalChanges.controlPoint1Index, finalChanges.newControlPoint1.x, finalChanges.newControlPoint1.y] },
                { f: "=xy", a: [finalChanges.controlPoint2Index, finalChanges.newControlPoint2.x, finalChanges.newControlPoint2.y] }
              ];

              // Rollback to original on-curve positions
              rollbackChangesForLayer = [
                { f: "=xy", a: [finalChanges.onPoint1Index, originalOnPoint1.x, originalOnPoint1.y] },
                { f: "=xy", a: [finalChanges.onPoint2Index, originalOnPoint2.x, originalOnPoint2.y] },
                // Control points remain unchanged
                { f: "=xy", a: [finalChanges.controlPoint1Index, tunniInitialState.originalControlPoints.originalControlPoint1.x, tunniInitialState.originalControlPoints.originalControlPoint1.y] },
                { f: "=xy", a: [finalChanges.controlPoint2Index, tunniInitialState.originalControlPoints.originalControlPoint2.x, tunniInitialState.originalControlPoints.originalControlPoint2.y] }
              ];
            } else {
              // For current handle, change control points
              finalChangesForLayer = [
                { f: "=xy", a: [finalChanges.controlPoint1Index, finalChanges.newControlPoint1.x, finalChanges.newControlPoint1.y] },
                { f: "=xy", a: [finalChanges.controlPoint2Index, finalChanges.newControlPoint2.x, finalChanges.newControlPoint2.y] }
              ];

              // Rollback to original control point positions
              rollbackChangesForLayer = [
                { f: "=xy", a: [tunniInitialState.originalControlPoints.controlPoint1Index, tunniInitialState.originalControlPoints.originalControlPoint1.x, tunniInitialState.originalControlPoints.originalControlPoint1.y] },
                { f: "=xy", a: [tunniInitialState.originalControlPoints.controlPoint2Index, tunniInitialState.originalControlPoints.originalControlPoint2.x, tunniInitialState.originalControlPoints.originalControlPoint2.y] }
              ];
            }

            finalLayerChanges.push(consolidateChanges(finalChangesForLayer, [...layer.changePath, "path"]));
            rollbackChanges.push(consolidateChanges(rollbackChangesForLayer, [...layer.changePath, "path"]));
          }

          return {
            changes: ChangeCollector.fromChanges(
              consolidateChanges(finalLayerChanges),
              consolidateChanges(rollbackChanges)
            ),
            undoLabel: isTrueTunniPoint ? "Move On-Curve Points via Tunni" : "Move Tunni Points",
            broadcast: true,
          };
        }
      });
      return;
    }

    const resizeHandle = this.getResizeHandle(initialEvent, initialSelection);
    const rotationHandle = this.getRotationHandle(initialEvent, initialSelection);
    if (resizeHandle || rotationHandle) {
      sceneController.sceneModel.clickedTransformSelectionHandle =
        resizeHandle || rotationHandle;
      await this.handleBoundsTransformSelection(
        initialSelection,
        eventStream,
        initialEvent,
        !!rotationHandle
      );
      delete sceneController.sceneModel.clickedTransformSelectionHandle;
      initialEvent.preventDefault();
      return;
    }

    const point = sceneController.localPoint(initialEvent);
    const size = sceneController.mouseClickMargin;
    let { selection, pathHit } = this.sceneModel.selectionAtPoint(
      point,
      size,
      sceneController.selection,
      sceneController.hoverSelection,
      initialEvent.altKey
    );

    // Convert skeleton segment selection to on-curve point selection immediately
    // (consistent with regular path segments selecting their on-curve points)
    // But preserve original selection for double-click handling
    const originalSelection = selection;
    const { skeletonSegment: clickedSegment } = parseSelection(selection);
    if (clickedSegment?.size) {
      const onCurvePoints = this._getSegmentOnCurvePoints(clickedSegment);
      // Replace skeletonSegment with skeletonPoint in selection
      selection = new Set(
        [...selection].filter((s) => !s.startsWith("skeletonSegment/"))
      );
      for (const pt of onCurvePoints) {
        selection.add(`skeletonPoint/${pt}`);
      }
    }

    // Check for rib point hit - but only if no skeleton point is under cursor
    // (skeleton points have priority over rib points when they overlap)
    const { skeletonPoint: clickedSkeletonPoint } = parseSelection(selection);
    const hasSkeletonPointUnderCursor = clickedSkeletonPoint?.size > 0;

    const ribHit = this._hitTestRibPoints(initialEvent);
    let preferRibOverSkeleton = false;
    if (ribHit && hasSkeletonPointUnderCursor) {
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      const skeletonData = positionedGlyph
        ? getSkeletonDataFromGlyph(positionedGlyph, this.sceneModel)
        : null;
      const glyphPoint = positionedGlyph
        ? {
            x: point.x - positionedGlyph.x,
            y: point.y - positionedGlyph.y,
          }
        : null;

      const firstKey = clickedSkeletonPoint.values().next().value;
      if (glyphPoint && skeletonData && firstKey) {
        const [contourIdx, pointIdx] = firstKey.split("/").map(Number);
        const skeletonPoint = skeletonData.contours?.[contourIdx]?.points?.[pointIdx];
        if (skeletonPoint) {
          const ribDist = vector.distance(glyphPoint, ribHit.point);
          const skeletonDist = vector.distance(glyphPoint, skeletonPoint);
          preferRibOverSkeleton = ribDist < skeletonDist;
        }
      }
    }

    if (ribHit && (!hasSkeletonPointUnderCursor || preferRibOverSkeleton)) {
      const { skeletonPoint: preSelectedSkeletonPoints } =
        parseSelection(sceneController.selection);
      const clickedRibShortKey = `${ribHit.contourIndex}/${ribHit.pointIndex}/${ribHit.side}`;
      const clickedRibFullKey = `skeletonRibPoint/${clickedRibShortKey}`;
      let targetRibSelection;

      if (preSelectedSkeletonPoints?.size) {
        if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
          sceneController.selection = new Set([clickedRibFullKey]);
          initialEvent.preventDefault();
          return;
        }
        targetRibSelection = new Set([clickedRibShortKey]);
        sceneController.selection = new Set([clickedRibFullKey]);
      } else if (initialEvent.shiftKey) {
        const currentRibSelection =
          parseSelection(sceneController.selection).skeletonRibPoint || new Set();
        const clickedWasSelected = currentRibSelection.has(clickedRibShortKey);

        if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
          const modeFunc = getSelectModeFunction(initialEvent);
          sceneController.selection = modeFunc(
            sceneController.selection,
            new Set([clickedRibFullKey])
          );
          initialEvent.preventDefault();
          return;
        }

        let updatedRibSelection = currentRibSelection;
        if (!clickedWasSelected) {
          updatedRibSelection = new Set(currentRibSelection);
          updatedRibSelection.add(clickedRibShortKey);
          sceneController.selection = new Set(
            [...updatedRibSelection].map((key) => `skeletonRibPoint/${key}`)
          );
        }

        if (!updatedRibSelection.size || !updatedRibSelection.has(clickedRibShortKey)) {
          initialEvent.preventDefault();
          return;
        }
        targetRibSelection = updatedRibSelection;
      } else {
        const currentRibSelection =
          parseSelection(sceneController.selection).skeletonRibPoint || new Set();
        const clickedWasSelected = currentRibSelection.has(clickedRibShortKey);
        targetRibSelection =
          clickedWasSelected && currentRibSelection.size
            ? new Set(currentRibSelection)
            : new Set([clickedRibShortKey]);

        sceneController.selection = new Set(
          [...targetRibSelection].map((key) => `skeletonRibPoint/${key}`)
        );

        if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
          initialEvent.preventDefault();
          return;
        }
      }

      this.sceneController.sceneModel.initialClickedSkeletonRibPoint = {
        contourIdx: ribHit.contourIndex,
        pointIdx: ribHit.pointIndex,
        side: ribHit.side,
      };
      try {
        await this._handleDragRibPoint(
          eventStream,
          initialEvent,
          ribHit,
          targetRibSelection,
          preSelectedSkeletonPoints
        );
      } finally {
        delete this.sceneController.sceneModel.initialClickedSkeletonRibPoint;
      }
      initialEvent.preventDefault();
      return;
    }

    // X+drag equalize routing comes from central plan.
    const regularEqualizeDragPlan = resolveHandleEqualizePlan("regular", "drag", {
      x: this.equalizeMode,
    });
    if (regularEqualizeDragPlan.supported && !hasSkeletonPointUnderCursor) {
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      const handleInfo = this._findEqualizeHandleForPath(point, size);
      if (handleInfo && positionedGlyph) {
        const editableHandleInfo = this.sceneModel._getEditableHandleForGeneratedPoint(
          positionedGlyph,
          handleInfo.pointIndex
        );

        if (editableHandleInfo) {
          // X+drag for editable generated handles uses the same runtime path as default drag.
          // Equalize semantics are resolved inside that shared executor path.
          await this._handleDragEditableGeneratedHandles(
            eventStream,
            initialEvent,
            [editableHandleInfo]
          );
        } else {
          await this._handleEqualizeHandlesDragForPath(
            eventStream,
            initialEvent,
            handleInfo,
            positionedGlyph
          );
        }
        initialEvent.preventDefault();
        return;
      }
    }

    // Check for skeleton Tunni point hit
    const isSkeletonTunniLayerActive =
      this.editor?.visualizationLayersSettings?.model?.["fontra.skeleton.tunni"];

    // Ctrl+Shift+click: equalize tensions (works even without Tunni layer visible)
    // Only for midpoint Tunni, not for true Tunni (intersection)
    if (initialEvent.ctrlKey && initialEvent.shiftKey) {
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph) {
        const glyphPoint = {
          x: point.x - positionedGlyph.x,
          y: point.y - positionedGlyph.y,
        };
        const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, this.sceneModel);
        if (skeletonData) {
          // Use larger hit margin and search only midpoint Tunni for equalize
          const tunniHit = skeletonTunniHitTest(glyphPoint, size * 2, skeletonData, {
            midpointOnly: true,
          });
          if (tunniHit) {
            await this._equalizeSkeletonTunniTensions(tunniHit);
            initialEvent.preventDefault();
            eventStream.done();
            return;
          }
        }
      }
    }

    // X+drag for skeleton handles is routed via central equalize plan.
    const skeletonEqualizeDragPlan = resolveHandleEqualizePlan("skeleton", "drag", {
      x: this.equalizeMode,
    });
    if (skeletonEqualizeDragPlan.supported && hasSkeletonPointUnderCursor) {
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph) {
        const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, this.sceneModel);
        if (skeletonData) {
          // Get clicked skeleton point
          const firstKey = clickedSkeletonPoint.values().next().value;
          const [contourIdx, pointIdx] = firstKey.split("/").map(Number);
          const contour = skeletonData.contours[contourIdx];
          const clickedPt = contour?.points[pointIdx];

          // Only works on off-curve points (type === "cubic")
          if (clickedPt?.type === "cubic") {
            await this._handleEqualizeHandlesDrag(
              eventStream,
              initialEvent,
              contourIdx,
              pointIdx,
              skeletonData,
              positionedGlyph
            );
            initialEvent.preventDefault();
            return;
          }
        }
      }
    }

    // Regular Tunni point drag (requires layer to be visible)
    if (isSkeletonTunniLayerActive && !hasSkeletonPointUnderCursor) {
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph) {
        const glyphPoint = {
          x: point.x - positionedGlyph.x,
          y: point.y - positionedGlyph.y,
        };
        const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, this.sceneModel);
        if (skeletonData) {
          const tunniHit = skeletonTunniHitTest(glyphPoint, size, skeletonData);
          if (tunniHit) {
            await this._handleSkeletonTunniDrag(eventStream, initialEvent, tunniHit);
            initialEvent.preventDefault();
            return;
          }
        }
      }
    }

    let initialClickedPointIndex;
    let initialClickedSkeletonPoint;
    if (!pathHit) {
      const { point: pointIndices, skeletonPoint: skeletonPoints } = parseSelection(selection);
      if (pointIndices?.length) {
        initialClickedPointIndex = pointIndices[0];
      }
      if (skeletonPoints?.size) {
        // Get first skeleton point coordinates
        const firstKey = skeletonPoints.values().next().value;
        const [contourIdx, pointIdx] = firstKey.split("/").map(Number);
        initialClickedSkeletonPoint = { contourIdx, pointIdx };
      }
    }
    if (initialEvent.detail == 2 || initialEvent.myTapCount == 2) {
      initialEvent.preventDefault(); // don't let our dbl click propagate to other elements
      eventStream.done();
      // Use originalSelection to preserve skeletonSegment for double-click handling
      await this.handleDoubleClick(originalSelection, point, initialEvent);
      return;
    }

    if (!this.sceneSettings.selectedGlyph?.isEditing) {
      this.sceneSettings.selectedGlyph = this.sceneModel.glyphAtPoint(point);
      eventStream.done();
      return;
    }

    let initiateDrag = false;
    let initiateRectSelect = false;

      const modeFunc = getSelectModeFunction(initialEvent);
      const isSegmentSelection = !!pathHit || clickedSegment?.size > 0;
      const avoidSegmentToggleRemoval =
        isSegmentSelection && initialEvent.shiftKey && !initialEvent[commandKeyProperty];
      const newSelection = avoidSegmentToggleRemoval
        ? union(sceneController.selection, selection)
        : modeFunc(sceneController.selection, selection);
    const cleanSel = selection;

    // Check if clicking on skeleton segment (for immediate drag support)
    const { skeletonSegment: clickedSkeletonSegment } = parseSelection(cleanSel);
    const clickingOnSkeletonSegment = clickedSkeletonSegment?.size > 0;

    if (
      !selection.size ||
      initialEvent.shiftKey ||
      initialEvent.altKey ||
      !isSuperset(sceneController.selection, cleanSel) ||
      clickingOnSkeletonSegment // Always update selection when clicking on skeleton segment
    ) {
      this._selectionBeforeSingleClick = sceneController.selection;
      sceneController.selection = newSelection;
    }

    if (isSuperset(sceneController.selection, cleanSel)) {
      initiateDrag = true;
    }
    if (!selection.size) {
      initiateRectSelect = true;
    }

    if (initiateRectSelect || initiateDrag) {
      if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
        initiateRectSelect = false;
        initiateDrag = false;
        if (!selection.size) {
          const selectedGlyph = this.sceneModel.glyphAtPoint(point);
          if (
            selectedGlyph &&
            !equalGlyphSelection(selectedGlyph, this.sceneSettings.selectedGlyph)
          ) {
            this.sceneSettings.selectedGlyph = selectedGlyph;
            eventStream.done();
            return;
          }
        }
      }
    }

    sceneController.hoveredGlyph = undefined;
    if (initiateRectSelect) {
      return await this.handleRectSelect(eventStream, initialEvent, initialSelection);
    } else if (initiateDrag) {
      this.sceneController.sceneModel.initialClickedPointIndex =
        initialClickedPointIndex;
      this.sceneController.sceneModel.initialClickedSkeletonPoint =
        initialClickedSkeletonPoint;
      const result = await this.handleDragSelection(eventStream, initialEvent);
      delete this.sceneController.sceneModel.initialClickedPointIndex;
      delete this.sceneController.sceneModel.initialClickedSkeletonPoint;
      return result;
    }
  }

  async handleDoubleClick(selection, point, event) {
    const sceneController = this.sceneController;
    if (!sceneController.hoverPathHit && (!selection || !selection.size)) {
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph?.isUndefined) {
        sceneController._dispatchEvent("doubleClickedUndefinedGlyph");
      } else {
        const selectedGlyph = this.sceneModel.glyphAtPoint(point);
        this.sceneSettings.selectedGlyph = selectedGlyph
          ? { ...selectedGlyph, isEditing: true }
          : undefined;
      }
    } else {
      const instance = this.sceneModel.getSelectedPositionedGlyph().glyph.instance;

      // Parse the CLICKED selection (what was clicked, not current selection)
      const { skeletonSegment: clickedSkeletonSegment } = parseSelection(selection);

      // Handle skeleton segment double-click FIRST - select entire contour
      // This takes priority over toggling smooth on already-selected points
      if (clickedSkeletonSegment?.size) {
        await this._handleSkeletonSegmentDoubleClick(event, clickedSkeletonSegment);
        return;
      }

      const {
        point: pointIndices,
        component: componentIndices,
        anchor: anchorIndices,
        guideline: guidelineIndices,
        skeletonPoint: skeletonPointSelection,
        // TODO: Font Guidelines
        // fontGuideline: fontGuidelineIndices,
      } = parseSelection(sceneController.selection);

      // Handle skeleton point double-click (toggle smooth/sharp)
      if (skeletonPointSelection?.size) {
        await this._handleSkeletonPointsDoubleClick(skeletonPointSelection);
        return;
      }

      if (componentIndices?.length && !pointIndices?.length && !anchorIndices?.length) {
        componentIndices.sort();
        sceneController.doubleClickedComponentIndices = componentIndices;
        sceneController._dispatchEvent("doubleClickedComponents");
      } else if (
        anchorIndices?.length &&
        !pointIndices?.length &&
        !componentIndices?.length
      ) {
        anchorIndices.sort();
        sceneController.doubleClickedAnchorIndices = anchorIndices;
        sceneController._dispatchEvent("doubleClickedAnchors");
      } else if (
        guidelineIndices?.length &&
        !pointIndices?.length &&
        !componentIndices?.length
      ) {
        guidelineIndices.sort();
        sceneController.doubleClickedGuidelineIndices = guidelineIndices;
        sceneController._dispatchEvent("doubleClickedGuidelines");
      } else if (pointIndices?.length && !sceneController.hoverPathHit) {
        await this.handlePointsDoubleClick(pointIndices);
      } else if (sceneController.hoverPathHit) {
        const contourIndex = sceneController.hoverPathHit.contourIndex;
        const startPoint = instance.path.getAbsolutePointIndex(contourIndex, 0);
        const endPoint = instance.path.contourInfo[contourIndex].endPoint;
        const newSelection = new Set();
        for (const i of range(startPoint, endPoint + 1)) {
          const pointType = instance.path.pointTypes[i] & VarPackedPath.POINT_TYPE_MASK;
          if (pointType === VarPackedPath.ON_CURVE) {
            newSelection.add(`point/${i}`);
          }
        }
        const selection = this._selectionBeforeSingleClick || sceneController.selection;
        this._selectionBeforeSingleClick = undefined;
        const modeFunc = getSelectModeFunction(event);
        sceneController.selection = modeFunc(selection, newSelection);
      }
    }
  }

  async handlePointsDoubleClick(pointIndices) {
    let newPointType;
    await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      for (const layerGlyph of Object.values(layerGlyphs)) {
        newPointType = toggleSmooth(layerGlyph.path, pointIndices, newPointType);
      }
      return translate("edit-tools-pointer.undo.toggle-smooth");
    });
  }

  /**
   * Toggle smooth/sharp on skeleton points (double-click handler)
   */
  async _handleSkeletonPointsDoubleClick(skeletonPointSelection) {
    const sceneController = this.sceneController;

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      // Setup data for ALL editable layers (multi-source editing support)
      const layersData = {};
      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!getSkeletonData(layer)) continue;

        layersData[editLayerName] = {
          layer,
          skeletonData: JSON.parse(JSON.stringify(getSkeletonData(layer))),
        };
      }

      if (Object.keys(layersData).length === 0) return;

      // Determine new smooth value from first layer (all layers should have same structure)
      const firstLayerData = Object.values(layersData)[0];
      let newSmooth = null;

      // Find newSmooth value from first layer
      for (const selKey of skeletonPointSelection) {
        const [contourIdx, pointIdx] = selKey.split("/").map(Number);
        const contour = firstLayerData.skeletonData.contours?.[contourIdx];
        if (!contour) continue;

        const point = contour.points?.[pointIdx];
        if (!point || point.type === "cubic" || point.type === "quad") continue;

        const points = contour.points;
        const numPoints = points.length;
        const isClosed = contour.isClosed;

        // Check if this is an endpoint of an open contour
        if (!isClosed) {
          let firstOnCurve = -1;
          let lastOnCurve = -1;
          for (let i = 0; i < numPoints; i++) {
            if (!points[i].type) {
              if (firstOnCurve === -1) firstOnCurve = i;
              lastOnCurve = i;
            }
          }
          if (pointIdx === firstOnCurve || pointIdx === lastOnCurve) continue;
        }

        const prevIdx = (pointIdx - 1 + numPoints) % numPoints;
        const nextIdx = (pointIdx + 1) % numPoints;
        const hasPrevHandle = points[prevIdx]?.type === "cubic" || points[prevIdx]?.type === "quad";
        const hasNextHandle = points[nextIdx]?.type === "cubic" || points[nextIdx]?.type === "quad";

        if (!hasPrevHandle && !hasNextHandle) continue;

        newSmooth = !point.smooth;
        break;
      }

      if (newSmooth === null) return; // No valid on-curve points selected

      // Helper to apply smooth toggle to skeleton data
      const applySmoothToggle = (skeletonData) => {
        for (const selKey of skeletonPointSelection) {
          const [contourIdx, pointIdx] = selKey.split("/").map(Number);
          const contour = skeletonData.contours?.[contourIdx];
          if (!contour) continue;

          const point = contour.points?.[pointIdx];
          if (!point || point.type === "cubic" || point.type === "quad") continue;

          const points = contour.points;
          const numPoints = points.length;
          const isClosed = contour.isClosed;

          if (!isClosed) {
            let firstOnCurve = -1;
            let lastOnCurve = -1;
            for (let i = 0; i < numPoints; i++) {
              if (!points[i].type) {
                if (firstOnCurve === -1) firstOnCurve = i;
                lastOnCurve = i;
              }
            }
            if (pointIdx === firstOnCurve || pointIdx === lastOnCurve) continue;
          }

          const prevIdx = (pointIdx - 1 + numPoints) % numPoints;
          const nextIdx = (pointIdx + 1) % numPoints;
          const hasPrevHandle = points[prevIdx]?.type === "cubic" || points[prevIdx]?.type === "quad";
          const hasNextHandle = points[nextIdx]?.type === "cubic" || points[nextIdx]?.type === "quad";

          if (!hasPrevHandle && !hasNextHandle) continue;

          // Keep point.cornerRoundness intact so toggling smooth on/off does not
          // destroy user-defined corner rounding values.
          point.smooth = newSmooth;

          // If switching to smooth, align handle(s) to be collinear
          if (newSmooth) {
            if (hasPrevHandle && hasNextHandle) {
              const prevPoint = points[prevIdx];
              const nextPoint = points[nextIdx];

              const prevDx = prevPoint.x - point.x;
              const prevDy = prevPoint.y - point.y;
              const nextDx = nextPoint.x - point.x;
              const nextDy = nextPoint.y - point.y;

              const prevDist = Math.sqrt(prevDx * prevDx + prevDy * prevDy);
              const nextDist = Math.sqrt(nextDx * nextDx + nextDy * nextDy);

              if (prevDist > 0 && nextDist > 0) {
                const avgDx = nextDx / nextDist - prevDx / prevDist;
                const avgDy = nextDy / nextDist - prevDy / prevDist;
                const avgLen = Math.sqrt(avgDx * avgDx + avgDy * avgDy);

                if (avgLen > 0) {
                  const dirX = avgDx / avgLen;
                  const dirY = avgDy / avgLen;

                  prevPoint.x = point.x - dirX * prevDist;
                  prevPoint.y = point.y - dirY * prevDist;
                  nextPoint.x = point.x + dirX * nextDist;
                  nextPoint.y = point.y + dirY * nextDist;
                }
              }
            } else if (hasPrevHandle || hasNextHandle) {
              const handleIdx = hasPrevHandle ? prevIdx : nextIdx;
              const handlePoint = points[handleIdx];

              const otherSideIdx = hasPrevHandle ? nextIdx : prevIdx;
              let lineEndIdx = otherSideIdx;

              while (points[lineEndIdx]?.type) {
                lineEndIdx = hasPrevHandle
                  ? (lineEndIdx + 1) % numPoints
                  : (lineEndIdx - 1 + numPoints) % numPoints;
                if (lineEndIdx === pointIdx) break;
              }

              const lineEnd = points[lineEndIdx];
              if (lineEnd && !lineEnd.type) {
                const lineDx = lineEnd.x - point.x;
                const lineDy = lineEnd.y - point.y;
                const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy);

                if (lineLen > 0) {
                  const lineDirX = lineDx / lineLen;
                  const lineDirY = lineDy / lineLen;

                  const handleDx = handlePoint.x - point.x;
                  const handleDy = handlePoint.y - point.y;
                  const handleDist = Math.sqrt(handleDx * handleDx + handleDy * handleDy);

                  if (handleDist > 0) {
                    handlePoint.x = point.x - lineDirX * handleDist;
                    handlePoint.y = point.y - lineDirY * handleDist;
                  }
                }
              }
            }
          }
        }
      };
      const regenerateOutline = (staticGlyph, skelData) => {
        regenerateSkeletonContours(staticGlyph, skelData);
      };

      const allChanges = [];

      // Apply changes to ALL editable layers
      for (const [editLayerName, data] of Object.entries(layersData)) {
        const { layer, skeletonData } = data;

        // Apply the smooth toggle to this layer's skeleton data
        applySmoothToggle(skeletonData);

        // Record changes for this layer
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          regenerateSkeletonContours(sg, skeletonData);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        const customDataChange = recordChanges(layer, (l) => {
          setSkeletonData(l, skeletonData);
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      const combinedChange = new ChangeCollector().concat(...allChanges);
      await sendIncrementalChange(combinedChange.change);

      return {
        changes: combinedChange,
        undoLabel: translate("edit-tools-pointer.undo.toggle-smooth"),
      };
    });
  }

  /**
   * Handle double-click on skeleton segment - select entire skeleton contour
   * @param {Event} event - The mouse event
   * @param {Set} clickedSkeletonSegment - The clicked skeleton segment selection
   */
  async _handleSkeletonSegmentDoubleClick(event, clickedSkeletonSegment) {
    const sceneController = this.sceneController;

    if (!clickedSkeletonSegment?.size) return;

    // Get the contour index from the clicked segment
    const segmentKey = [...clickedSkeletonSegment][0]; // e.g., "0/2"
    const [contourIdx] = segmentKey.split("/").map(Number);

    // Get skeleton data to find all on-curve points in this contour
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    const layer = positionedGlyph?.varGlyph?.glyph?.layers?.[
      sceneController.editingLayerNames?.[0]
    ];
    const skeletonData = getSkeletonData(layer);

    if (!skeletonData?.contours?.[contourIdx]) return;

    const contour = skeletonData.contours[contourIdx];
    const newSelection = new Set();

    // Add all on-curve points of this skeleton contour
    for (let pi = 0; pi < contour.points.length; pi++) {
      if (!contour.points[pi].type) {
        // on-curve point
        newSelection.add(`skeletonPoint/${contourIdx}/${pi}`);
      }
    }

    // Apply selection with modifier support (shift to add, etc.)
    const selection = this._selectionBeforeSingleClick || sceneController.selection;
    this._selectionBeforeSingleClick = undefined;
    const modeFunc = getSelectModeFunction(event);
    sceneController.selection = modeFunc(selection, newSelection);
  }

  async handleRectSelect(eventStream, initialEvent, initialSelection) {
    const sceneController = this.sceneController;
    const initialPoint = sceneController.localPoint(initialEvent);
    for await (const event of eventStream) {
      const modifierEvent = sceneController.applicationSettings
        .rectSelectLiveModifierKeys
        ? event
        : initialEvent;
      const currentPoint = sceneController.localPoint(event);
      const selRect = normalizeRect({
        xMin: initialPoint.x,
        yMin: initialPoint.y,
        xMax: currentPoint.x,
        yMax: currentPoint.y,
      });
      const selection = this.sceneModel.selectionAtRect(
        selRect,
        modifierEvent.altKey ? (point) => !!point.type : (point) => !point.type,
        currentPoint
      );
      const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
      sceneController.selectionRect = offsetRect(
        selRect,
        -positionedGlyph.x,
        -positionedGlyph.y
      );

      const modeFunc = getSelectModeFunction(modifierEvent);
      const nextSelection = modeFunc(initialSelection, selection);
      sceneController.selection = stripRibSelectionWhenPointSelectionExists(nextSelection);
    }
    sceneController.selectionRect = undefined;
    this._selectionBeforeSingleClick = undefined;
  }

  async handleDragSelection(eventStream, initialEvent) {
    this.sceneController.sceneModel.showTransformSelection = false;
    this._selectionBeforeSingleClick = undefined;
    const sceneController = this.sceneController;

    // Parse selection to check what types of objects are selected
    const {
      skeletonPoint: skeletonPointSelection,
      skeletonSegment: skeletonSegmentSelection,
      point: pointSelection,
      component: componentSelection,
      anchor: anchorSelection,
      guideline: guidelineSelection,
    } = parseSelection(sceneController.selection);

    // Convert skeleton segment selection to point selection
    let effectiveSkeletonPointSelection = skeletonPointSelection;
    if (skeletonSegmentSelection?.size) {
      effectiveSkeletonPointSelection = this._convertSegmentSelectionToPoints(
        skeletonSegmentSelection,
        skeletonPointSelection
      );
    }

    const hasSkeletonSelection = effectiveSkeletonPointSelection?.size > 0;
    const hasRegularSelection =
      pointSelection?.length > 0 ||
      componentSelection?.length > 0 ||
      anchorSelection?.length > 0 ||
      guidelineSelection?.length > 0;

    // Check if any selected points are editable generated points
    // If so, redirect to dedicated handler
    if (pointSelection?.length > 0) {
      const editableGenerated = this._getEditableGeneratedPointsFromSelection(pointSelection);
      if (editableGenerated.length > 0 && !hasSkeletonSelection) {
        await this._handleDragEditableGeneratedPoints(
          eventStream,
          initialEvent,
          editableGenerated
        );
        this.sceneController.sceneModel.showTransformSelection = true;
        return;
      }

      // Check if any selected points are editable generated handles
      const editableHandles = this._getEditableGeneratedHandlesFromSelection(pointSelection);
      if (editableHandles.length > 0 && !hasSkeletonSelection) {
        await this._handleDragEditableGeneratedHandles(
          eventStream,
          initialEvent,
          editableHandles
        );
        this.sceneController.sceneModel.showTransformSelection = true;
        return;
      }
    }

    // If only skeleton selection, use dedicated handler
    if (hasSkeletonSelection && !hasRegularSelection) {
      await this._handleDragSkeletonPoints(
        eventStream,
        initialEvent,
        effectiveSkeletonPointSelection
      );
      this.sceneController.sceneModel.showTransformSelection = true;
      return;
    }

    // Handle regular selection (with optional skeleton selection)
    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
        const initialPoint = sceneController.localPoint(initialEvent);
        const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
        let behaviorName = getBehaviorPresetNameFromEvent("regular", "drag", initialEvent);
        const initialClickedPointIndex =
          this.sceneController.sceneModel.initialClickedPointIndex;
        let equalizeHandleInfo = null;
        if (positionedGlyph && initialClickedPointIndex !== undefined) {
          const candidate = this._findEqualizeHandleForPath(
            initialPoint,
            sceneController.mouseClickMargin
          );
          if (candidate && candidate.pointIndex === initialClickedPointIndex) {
            equalizeHandleInfo = candidate;
          }
        }

      // Setup for regular point editing
      const layerInfo = Object.entries(
        sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      ).map(([layerName, layerGlyph]) => {
        const behaviorFactory = new EditBehaviorFactory(
          layerGlyph,
          sceneController.selection,
          this.scalingEditBehavior
        );
        return {
          layerName,
          layerGlyph,
          changePath: ["layers", layerName, "glyph"],
          pathPrefix: [],
          connectDetector: sceneController.getPathConnectDetector(layerGlyph.path),
          shouldConnect: false,
          behaviorFactory,
          editBehavior: behaviorFactory.getBehavior(behaviorName),
        };
      });

        assert(layerInfo.length >= 1, "no layer to edit");
        layerInfo[0].isPrimaryLayer = true;
        const equalizeRollbackByLayer = new Map();
        let equalizeUsed = false;
        if (equalizeHandleInfo) {
          for (const layer of layerInfo) {
            const oppositePoint = layer.layerGlyph.path.getPoint(
              equalizeHandleInfo.oppositeIndex
            );
            if (oppositePoint) {
              equalizeRollbackByLayer.set(layer.layerName, {
                x: oppositePoint.x,
                y: oppositePoint.y,
              });
            }
          }
        }

      // Setup for skeleton editing (if we have skeleton selection too)
      let skeletonEditState = null;
      if (hasSkeletonSelection) {
        const editLayerName = sceneController.editingLayerNames?.[0];
        const layer = editLayerName ? glyph.layers[editLayerName] : null;
        const skeletonData = getSkeletonData(layer);

        if (skeletonData) {
          skeletonEditState = {
            editLayerName,
            layer,
            originalSkeletonData: JSON.parse(JSON.stringify(skeletonData)),
            workingSkeletonData: JSON.parse(JSON.stringify(skeletonData)),
            behaviors: createSkeletonEditBehavior(
              JSON.parse(JSON.stringify(skeletonData)),
              effectiveSkeletonPointSelection,
              getBehaviorPresetNameFromEvent("skeleton", "drag", initialEvent)
            ),
            lastBehaviorName: getBehaviorPresetNameFromEvent("skeleton", "drag", initialEvent),
          };
        }
      }

      let editChange;

      for await (const event of eventStream) {
        const newEditBehaviorName = getBehaviorPresetNameFromEvent("regular", "drag", event);

        // Handle behavior change for regular points
        if (behaviorName !== newEditBehaviorName) {
          behaviorName = newEditBehaviorName;
          const rollbackChanges = [];
          for (const layer of layerInfo) {
            applyChange(layer.layerGlyph, layer.editBehavior.rollbackChange);
            rollbackChanges.push(
              consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
            );
            layer.editBehavior = layer.behaviorFactory.getBehavior(behaviorName);
          }
          await sendIncrementalChange(consolidateChanges(rollbackChanges));
        }

        // Handle behavior change for skeleton points
        if (skeletonEditState) {
          const newSkeletonBehaviorName = getBehaviorPresetNameFromEvent(
            "skeleton",
            "drag",
            event
          );
          if (newSkeletonBehaviorName !== skeletonEditState.lastBehaviorName) {
            skeletonEditState.lastBehaviorName = newSkeletonBehaviorName;
            skeletonEditState.behaviors = createSkeletonEditBehavior(
              skeletonEditState.originalSkeletonData,
              effectiveSkeletonPointSelection,
              newSkeletonBehaviorName
            );
          }
        }

        const currentPoint = sceneController.localPoint(event);
        const roundFunc = makeRoundFunc(event);
        const delta = {
          x: currentPoint.x - initialPoint.x,
          y: currentPoint.y - initialPoint.y,
        };

          const deepEditChanges = [];

          // Apply regular point changes
          for (const layer of layerInfo) {
            const layerEditChange = layer.editBehavior.makeChangeForDelta(delta);
            applyChange(layer.layerGlyph, layerEditChange);
            deepEditChanges.push(consolidateChanges(layerEditChange, layer.changePath));
            layer.shouldConnect = layer.connectDetector.shouldConnect(layer.isPrimaryLayer);
          }
          // X-equalize during drag for regular handles (mid-drag activation supported)
          if (this.equalizeMode && equalizeHandleInfo && positionedGlyph) {
            const { pointIndex, smoothIndex, oppositeIndex } = equalizeHandleInfo;
            const currentGlyphPoint = {
              x: currentPoint.x - positionedGlyph.x,
              y: currentPoint.y - positionedGlyph.y,
            };
            for (const layer of layerInfo) {
              const path = layer.layerGlyph.path;
              const smoothPt = path.getPoint(smoothIndex);
              if (!smoothPt) continue;
              let newDragVec = {
                x: currentGlyphPoint.x - smoothPt.x,
                y: currentGlyphPoint.y - smoothPt.y,
              };
              if (event.shiftKey) {
                newDragVec = constrainHorVerDiag(newDragVec);
              }
              const newDragLen = Math.hypot(newDragVec.x, newDragVec.y);
              if (newDragLen < 1) {
                continue;
              }
              const newDragPos = {
                x: Math.round(smoothPt.x + newDragVec.x),
                y: Math.round(smoothPt.y + newDragVec.y),
              };
              const newOppPos = {
                x: Math.round(smoothPt.x - newDragVec.x),
                y: Math.round(smoothPt.y - newDragVec.y),
              };
              const equalizeChanges = [
                { f: "=xy", a: [pointIndex, newDragPos.x, newDragPos.y] },
                { f: "=xy", a: [oppositeIndex, newOppPos.x, newOppPos.y] },
              ];
              for (const change of equalizeChanges) {
                applyChange(layer.layerGlyph.path, change);
              }
              deepEditChanges.push(
                consolidateChanges(equalizeChanges, layer.changePath)
              );
              equalizeUsed = true;
            }
          }

        // Apply skeleton changes
          if (skeletonEditState) {
            const { originalSkeletonData, workingSkeletonData, behaviors, layer, editLayerName } =
              skeletonEditState;

          // Reset working data to original
          for (let ci = 0; ci < originalSkeletonData.contours.length; ci++) {
            const origContour = originalSkeletonData.contours[ci];
            const workContour = workingSkeletonData.contours[ci];
            for (let pi = 0; pi < origContour.points.length; pi++) {
              workContour.points[pi].x = origContour.points[pi].x;
              workContour.points[pi].y = origContour.points[pi].y;
            }
          }

            const appliedFixedRib = this.fixedRibMode || this.fixedRibCompressMode
              ? applyFixedRibDragToSkeletonData(
                  originalSkeletonData,
                  workingSkeletonData,
                  effectiveSkeletonPointSelection,
                  this.sceneController.sceneModel.initialClickedSkeletonPoint,
                  delta,
                  roundFunc,
                  {
                    anchorToDragSide: this.fixedRibCompressMode,
                    scaleControlPoints: FIXED_RIB_SCALE_CONTROL_POINTS,
                  }
                )
              : false;

            if (!appliedFixedRib) {
              // Apply behavior changes
              for (const behavior of behaviors) {
                const changes = behavior.applyDelta(delta, roundFunc);
                const contour = workingSkeletonData.contours[behavior.contourIndex];
                for (const { pointIndex, x, y } of changes) {
                  contour.points[pointIndex].x = x;
                  contour.points[pointIndex].y = y;
                }
              }
            }

          // Regenerate outline and update customData
          const staticGlyph = layer.glyph;
          const skeletonChanges = recordChanges(staticGlyph, (sg) => {
            // Preserve generated contour structure when possible.
            regenerateSkeletonContours(sg, workingSkeletonData, { preferInPlace: true });
          });
          const prefixedSkeletonChanges = skeletonChanges.prefixed(["layers", editLayerName, "glyph"]);
          deepEditChanges.push(prefixedSkeletonChanges.change);

          // Update customData
          const customDataChange = recordChanges(layer, (l) => {
            setSkeletonData(l, JSON.parse(JSON.stringify(workingSkeletonData)));
          });
          const prefixedCustomDataChange = customDataChange.prefixed(["layers", editLayerName]);
          deepEditChanges.push(prefixedCustomDataChange.change);

          // Save first frame's rollback for proper undo (it restores original state)
          if (!skeletonEditState.firstFrameRollback) {
            skeletonEditState.firstFrameRollback = [
              prefixedSkeletonChanges.rollbackChange,
              prefixedCustomDataChange.rollbackChange,
            ];
          }
        }

        editChange = consolidateChanges(deepEditChanges);
        await sendIncrementalChange(editChange, true);
      }

        const rollbackParts = layerInfo.map((layer) =>
          consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
        );
        if (skeletonEditState?.firstFrameRollback) {
          rollbackParts.push(...skeletonEditState.firstFrameRollback);
        }
        if (equalizeUsed && equalizeHandleInfo) {
          for (const layer of layerInfo) {
            const oppositePoint = equalizeRollbackByLayer.get(layer.layerName);
            if (!oppositePoint) continue;
            rollbackParts.push(
              consolidateChanges(
                [
                  {
                    f: "=xy",
                    a: [
                      equalizeHandleInfo.oppositeIndex,
                      oppositePoint.x,
                      oppositePoint.y,
                    ],
                  },
                ],
                layer.changePath
              )
            );
          }
        }
      let changes = ChangeCollector.fromChanges(
        editChange,
        consolidateChanges(rollbackParts)
      );

      let shouldConnect;
      for (const layer of layerInfo) {
        if (!layer.shouldConnect) {
          continue;
        }
        shouldConnect = true;
        if (layer.isPrimaryLayer) {
          layer.connectDetector.clearConnectIndicator();
        }

        const connectChanges = recordChanges(layer.layerGlyph, (layerGlyph) => {
          const selection = connectContours(
            layerGlyph.path,
            layer.connectDetector.connectSourcePointIndex,
            layer.connectDetector.connectTargetPointIndex
          );
          if (layer.isPrimaryLayer) {
            sceneController.selection = selection;
          }
        });
        if (connectChanges.hasChange) {
          changes = changes.concat(connectChanges.prefixed(layer.changePath));
        }
      }

      return {
        undoLabel: shouldConnect
          ? translate("edit-tools-pointer.undo.drag-selection-and-connect-contours")
          : translate("edit-tools-pointer.undo.drag-selection"),
        changes: changes,
        broadcast: true,
      };
    });
    this.sceneController.sceneModel.showTransformSelection = true;
  }

  /**
   * Get on-curve points for skeleton segment selection.
   * Returns a Set of point keys ("contourIdx/pointIdx") for on-curve points only.
   */
  _getSegmentOnCurvePoints(segmentSelection) {
    const result = new Set();

    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph?.varGlyph?.glyph?.layers) {
      return result;
    }

    const editLayerName =
      this.sceneController.sceneSettings?.editLayerName ||
      positionedGlyph.glyph?.layerName;
    if (!editLayerName) {
      return result;
    }

    const layer = positionedGlyph.varGlyph.glyph.layers[editLayerName];
    const skeletonData = getSkeletonData(layer);
    if (!skeletonData?.contours?.length) {
      return result;
    }

    for (const selKey of segmentSelection) {
      // selKey format is "contourIdx/segmentIdx" (already parsed by parseSelection)
      const parts = selKey.split("/");
      const contourIdx = parseInt(parts[0], 10);
      const segmentIdx = parseInt(parts[1], 10);
      const contour = skeletonData.contours[contourIdx];
      if (!contour) continue;

      // Find on-curve indices
      const onCurveIndices = [];
      for (let i = 0; i < contour.points.length; i++) {
        if (!contour.points[i].type) {
          onCurveIndices.push(i);
        }
      }

      if (segmentIdx >= onCurveIndices.length) continue;

      // Determine segment start and end on-curve indices
      const isClosingSegment =
        contour.isClosed && segmentIdx === onCurveIndices.length - 1;

      let startIdx, endIdx;
      if (isClosingSegment) {
        startIdx = onCurveIndices[onCurveIndices.length - 1];
        endIdx = onCurveIndices[0];
      } else {
        startIdx = onCurveIndices[segmentIdx];
        endIdx = onCurveIndices[segmentIdx + 1];
      }

      // Add only on-curve points
      result.add(`${contourIdx}/${startIdx}`);
      result.add(`${contourIdx}/${endIdx}`);
    }

    return result;
  }

  /**
   * Convert skeleton segment selection to point selection.
   * Returns a Set of point keys ("contourIdx/pointIdx") for all points in selected segments.
   */
  _convertSegmentSelectionToPoints(segmentSelection, existingPointSelection) {
    const result = new Set(existingPointSelection || []);

    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph?.varGlyph?.glyph?.layers) {
      return result;
    }

    const editLayerName =
      this.sceneController.sceneSettings?.editLayerName ||
      positionedGlyph.glyph?.layerName;
    if (!editLayerName) {
      return result;
    }

    const layer = positionedGlyph.varGlyph.glyph.layers[editLayerName];
    const skeletonData = getSkeletonData(layer);
    if (!skeletonData?.contours?.length) {
      return result;
    }

    for (const selKey of segmentSelection) {
      const [contourIdx, segmentIdx] = selKey.split("/").map(Number);
      const contour = skeletonData.contours[contourIdx];
      if (!contour) continue;

      // Find on-curve indices
      const onCurveIndices = [];
      for (let i = 0; i < contour.points.length; i++) {
        if (!contour.points[i].type) {
          onCurveIndices.push(i);
        }
      }

      if (segmentIdx >= onCurveIndices.length) continue;

      // Determine segment start and end indices
      let startIdx, endIdx;
      const isClosingSegment =
        contour.isClosed && segmentIdx === onCurveIndices.length - 1;

      if (isClosingSegment) {
        startIdx = onCurveIndices[onCurveIndices.length - 1];
        endIdx = onCurveIndices[0];
      } else {
        startIdx = onCurveIndices[segmentIdx];
        endIdx = onCurveIndices[segmentIdx + 1];
      }

      // Add start and end on-curve points
      result.add(`${contourIdx}/${startIdx}`);
      result.add(`${contourIdx}/${endIdx}`);

      // Add off-curve points between them
      if (isClosingSegment) {
        for (let j = startIdx + 1; j < contour.points.length; j++) {
          if (contour.points[j].type) {
            result.add(`${contourIdx}/${j}`);
          }
        }
        for (let j = 0; j < endIdx; j++) {
          if (contour.points[j].type) {
            result.add(`${contourIdx}/${j}`);
          }
        }
      } else {
        for (let j = startIdx + 1; j < endIdx; j++) {
          if (contour.points[j].type) {
            result.add(`${contourIdx}/${j}`);
          }
        }
      }
    }

    return result;
  }

  /**
   * Handle dragging skeleton points with the Pointer Tool.
   * Uses the rule-based SkeletonEditBehavior system.
   * @param {AsyncIterable} eventStream - Event stream for drag
   * @param {Event} initialEvent - Initial mouse event
   * @param {Set} [overrideSelection] - Optional selection to use instead of parsing from sceneController
   */
  async _handleDragSkeletonPoints(eventStream, initialEvent, overrideSelection) {
    const sceneController = this.sceneController;
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();

    if (!positionedGlyph) return;

    // Get initial point in glyph coordinates
    const localPoint = sceneController.localPoint(initialEvent);
    const startGlyphPoint = {
      x: localPoint.x - positionedGlyph.x,
      y: localPoint.y - positionedGlyph.y,
    };

    // Use override selection or parse from sceneController
    let selectedSkeletonPoints = overrideSelection;
    if (!selectedSkeletonPoints) {
      const parsed = parseSelection(sceneController.selection);
      selectedSkeletonPoints = parsed.skeletonPoint;
    }
    if (!selectedSkeletonPoints?.size) return;

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      // Setup data for ALL editable layers (multi-source editing support)
      const layersData = {};
      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!getSkeletonData(layer)) continue;

        const skeletonData = getSkeletonData(layer);
        layersData[editLayerName] = {
          layer,
          original: JSON.parse(JSON.stringify(skeletonData)),
          working: JSON.parse(JSON.stringify(skeletonData)),
          behaviors: null, // Will be created below
        };
      }

      if (Object.keys(layersData).length === 0) return;
      

      // Track last used behavior name (based on shift + alt modifiers)
      let lastBehaviorName = getBehaviorPresetNameFromEvent(
        "skeleton",
        "drag",
        initialEvent
      );

      // Create initial behaviors for each layer
      for (const data of Object.values(layersData)) {
        data.behaviors = createSkeletonEditBehavior(
          data.original,
          selectedSkeletonPoints,
          lastBehaviorName
        );
      }

      const initialClickedSkeletonPoint =
        this.sceneController.sceneModel.initialClickedSkeletonPoint;
      let equalizeSkeletonInfo = null;
      if (initialClickedSkeletonPoint) {
        const { contourIdx, pointIdx } = initialClickedSkeletonPoint;
        const firstLayerData = Object.values(layersData)[0];
        const contour = firstLayerData?.original?.contours?.[contourIdx];
        const clickedPoint = contour?.points?.[pointIdx];
        if (contour && clickedPoint?.type === "cubic") {
          const numPoints = contour.points.length;
          const prevIndex = (pointIdx - 1 + numPoints) % numPoints;
          const nextIndex = (pointIdx + 1) % numPoints;
          const prevPoint = contour.points[prevIndex];
          const nextPoint = contour.points[nextIndex];
          let smoothIndex = null;
          let oppositeIndex = null;
          if (!prevPoint?.type && prevPoint?.smooth) {
            const prevPrevIndex = (prevIndex - 1 + numPoints) % numPoints;
            const prevPrevPoint = contour.points[prevPrevIndex];
            if (prevPrevPoint?.type === "cubic") {
              smoothIndex = prevIndex;
              oppositeIndex = prevPrevIndex;
            }
          }
          if (smoothIndex === null && !nextPoint?.type && nextPoint?.smooth) {
            const nextNextIndex = (nextIndex + 1) % numPoints;
            const nextNextPoint = contour.points[nextNextIndex];
            if (nextNextPoint?.type === "cubic") {
              smoothIndex = nextIndex;
              oppositeIndex = nextNextIndex;
            }
          }
          if (smoothIndex !== null && oppositeIndex !== null) {
            equalizeSkeletonInfo = {
              contourIndex: contourIdx,
              pointIndex: pointIdx,
              smoothIndex,
              oppositeIndex,
            };
          }
        }
      }

      // Accumulate changes (following Pen Tool pattern)
      let accumulatedChanges = new ChangeCollector();

      // Drag loop
      for await (const event of eventStream) {
        const roundFunc = makeRoundFunc(event);
        const currentLocalPoint = sceneController.localPoint(event);
        const currentGlyphPoint = {
          x: currentLocalPoint.x - positionedGlyph.x,
          y: currentLocalPoint.y - positionedGlyph.y,
        };

        const delta = vector.subVectors(currentGlyphPoint, startGlyphPoint);
        const behaviorName = getBehaviorPresetNameFromEvent("skeleton", "drag", event);

        // Recreate behaviors if behavior changed (shift or alt state changed)
        if (behaviorName !== lastBehaviorName) {
          lastBehaviorName = behaviorName;
          for (const data of Object.values(layersData)) {
            data.behaviors = createSkeletonEditBehavior(
              data.original,
              selectedSkeletonPoints,
              behaviorName
            );
          }
        }

          const allChanges = [];

          // Apply changes to ALL editable layers
          for (const [editLayerName, data] of Object.entries(layersData)) {
            const { layer, original, working, behaviors } = data;

          // Reset working data to original before applying changes
          for (let ci = 0; ci < original.contours.length; ci++) {
            const origContour = original.contours[ci];
            const workContour = working.contours[ci];
            for (let pi = 0; pi < origContour.points.length; pi++) {
              workContour.points[pi].x = origContour.points[pi].x;
              workContour.points[pi].y = origContour.points[pi].y;
            }
          }

            const appliedFixedRib = this.fixedRibMode || this.fixedRibCompressMode
              ? applyFixedRibDragToSkeletonData(
                  original,
                  working,
                  selectedSkeletonPoints,
                  initialClickedSkeletonPoint,
                  delta,
                  roundFunc,
                  {
                    anchorToDragSide: this.fixedRibCompressMode,
                    scaleControlPoints: FIXED_RIB_SCALE_CONTROL_POINTS,
                  }
                )
              : false;

            if (!appliedFixedRib) {
              // Apply behavior changes
              for (const behavior of behaviors) {
                const changes = behavior.applyDelta(delta, roundFunc);
                const contour = working.contours[behavior.contourIndex];
                for (const { pointIndex, x, y } of changes) {
                  contour.points[pointIndex].x = x;
                  contour.points[pointIndex].y = y;
                }
              }
            }

          const skeletonEqualizeDragPlan = resolveHandleEqualizePlan("skeleton", "drag", {
            x: this.equalizeMode,
          });
          if (skeletonEqualizeDragPlan.supported && equalizeSkeletonInfo) {
            const { contourIndex, pointIndex, smoothIndex, oppositeIndex } =
              equalizeSkeletonInfo;
            const workContour = working.contours[contourIndex];
            const smoothPt = workContour?.points?.[smoothIndex];
            if (smoothPt) {
              let newDragVec = {
                x: currentGlyphPoint.x - smoothPt.x,
                y: currentGlyphPoint.y - smoothPt.y,
              };
              if (event.shiftKey) {
                newDragVec = constrainHorVerDiag(newDragVec);
              }
              const newDragLen = Math.hypot(newDragVec.x, newDragVec.y);
              if (newDragLen >= 1) {
                workContour.points[pointIndex].x = roundFunc(
                  smoothPt.x + newDragVec.x
                );
                workContour.points[pointIndex].y = roundFunc(
                  smoothPt.y + newDragVec.y
                );
                workContour.points[oppositeIndex].x = roundFunc(
                  smoothPt.x - newDragVec.x
                );
                workContour.points[oppositeIndex].y = roundFunc(
                  smoothPt.y - newDragVec.y
                );
              }
            }
          }

          // Record changes for this layer
          // 1. FIRST: Generate outline contours
          const staticGlyph = layer.glyph;
          const pathChange = recordChanges(staticGlyph, (sg) => {
            regenerateSkeletonContours(sg, working);
          });
          allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

          // 2. THEN: Save skeletonData to customData
          const customDataChange = recordChanges(layer, (l) => {
            setSkeletonData(l, JSON.parse(JSON.stringify(working)));
          });
          allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
        }

        const combinedChange = new ChangeCollector().concat(...allChanges);
        // Accumulate changes for proper undo/redo
        accumulatedChanges = accumulatedChanges.concat(combinedChange);
        await sendIncrementalChange(combinedChange.change, true);
      }

      // Final send without "may drop" flag (required for proper undo)
      await sendIncrementalChange(accumulatedChanges.change);

      // Return accumulated changes
      return {
        changes: accumulatedChanges,
        undoLabel: translate("edit-tools-pointer.undo.move-skeleton-points"),
        broadcast: true,
      };
    });
  }

  /**
   * Handle dragging a rib point (width control point).
   * Constrains movement to the normal direction and updates point width.
   */
  async _handleDragRibPoint(
    eventStream,
    initialEvent,
    ribHit,
    selectedRibSides,
    selectedSkeletonPoints
  ) {
    const sceneController = this.sceneController;
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();

    if (!positionedGlyph) return;

    // Keep drag behavior stable: interpolation mode is chosen on drag start.
    const ribDragStartPlan = resolveModifierPlan("rib", "drag", {
      alt: initialEvent.altKey,
      z: this.tangentRibMode,
      x: this.equalizeMode,
    });
    if (!ribDragStartPlan.supported) {
      return;
    }
    const ribDragIntent = ribDragStartPlan.intent;

    // Get initial point in glyph coordinates
    const localPoint = sceneController.localPoint(initialEvent);
    const startGlyphPoint = {
      x: localPoint.x - positionedGlyph.x,
      y: localPoint.y - positionedGlyph.y,
    };

    // Use first layer for structural checks
    const editLayerNameForCheck = sceneController.editingLayerNames?.[0];
    const layerForCheck = positionedGlyph?.varGlyph?.glyph?.layers?.[editLayerNameForCheck];
    const skeletonDataForCheck = getSkeletonData(layerForCheck);
    if (!skeletonDataForCheck?.contours?.length) return;

    const defaultRibKey = `${ribHit.contourIndex}/${ribHit.pointIndex}/${ribHit.side}`;
    const selectedRibKeys =
      selectedRibSides?.size > 0 ? new Set(selectedRibSides) : new Set([defaultRibKey]);

    // Build set of target rib points from explicit rib-side selection.
    const targetPointsMap = new Map(); // key "ci/pi/side" -> target info
    const addTargetRibPoint = (ci, pi, side) => {
      const key = `${ci}/${pi}/${side}`;
      if (targetPointsMap.has(key)) return;
      const contour = skeletonDataForCheck.contours?.[ci];
      const pt = contour?.points?.[pi];
      if (!pt || pt.type) return; // skip off-curve points

        const isLinked = isWidthLinked(pt);
        const isSingleSided = contour.singleSided ?? false;
        const editableKey = side === "left" ? "leftEditable" : "rightEditable";

        targetPointsMap.set(key, {
          ribKey: key,
          contourIndex: ci,
          pointIndex: pi,
          side,
          isLinked,
          isSingleSided,
          isEditable: pt[editableKey] === true,
        });
    };

    for (const key of selectedRibKeys) {
      const [ci, pi, side] = key.split("/");
      const contourIndex = Number(ci);
      const pointIndex = Number(pi);
      if (!Number.isInteger(contourIndex) || !Number.isInteger(pointIndex)) {
        continue;
      }
      if (side !== "left" && side !== "right") {
        continue;
      }
      addTargetRibPoint(contourIndex, pointIndex, side);
    }

    // If skeleton points are selected, include their ribs in the drag set.
    if (selectedSkeletonPoints?.size) {
      for (const key of selectedSkeletonPoints) {
        const [ci, pi] = key.split("/").map(Number);
        if (!Number.isInteger(ci) || !Number.isInteger(pi)) continue;
        const contour = skeletonDataForCheck.contours?.[ci];
        const pt = contour?.points?.[pi];
        if (!pt || pt.type) continue;
        const isSingleSided = contour.singleSided ?? false;
        const side = isSingleSided
          ? contour.singleSidedDirection ?? "left"
          : ribHit.side;
        addTargetRibPoint(ci, pi, side);
      }
    }

    const targetPoints = [...targetPointsMap.values()];
    if (!targetPoints.length) return;
    const preferredLinkedWidthSideByPoint = new Map([
      [`${ribHit.contourIndex}/${ribHit.pointIndex}`, ribHit.side],
    ]);
    const linkedWidthDriverByPoint = this._buildLinkedWidthDriverByPoint(
      targetPoints,
      preferredLinkedWidthSideByPoint
    );
    const hasMirroredLinkedTargets = linkedWidthDriverByPoint.size > 0;

    // Keep the rib-side selection explicit during drag unless we're
    // using a skeleton-point selection to drive rib movement.
    const hasSkeletonSelection = selectedSkeletonPoints?.size > 0;
    if (!hasSkeletonSelection) {
      sceneController.selection = new Set(
        targetPoints.map((tp) => `skeletonRibPoint/${tp.ribKey}`)
      );
    }

    const allTargetsEditable = targetPoints.every((tp) => tp.isEditable);
    const belongsToSingleSegment = this._selectedRibTargetsBelongToSingleSegment(
      targetPoints,
      skeletonDataForCheck
    );
    const movementAllowed =
      hasSkeletonSelection ||
      allTargetsEditable ||
      belongsToSingleSegment ||
      hasMirroredLinkedTargets;
    if (!movementAllowed) {
      return;
    }

    const previousCursor = this.canvasController.canvas.style.cursor;
    this.canvasController.canvas.style.cursor = "pointer";

    try {
      await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      // Setup data for ALL editable layers (multi-source editing support)
      const layersData = {};
      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!getSkeletonData(layer)) continue;

        const skeletonData = getSkeletonData(layer);
        layersData[editLayerName] = {
          layer,
          original: JSON.parse(JSON.stringify(skeletonData)),
          working: JSON.parse(JSON.stringify(skeletonData)),
          ribBehaviors: [], // One per target point
        };
      }

      if (Object.keys(layersData).length === 0) return;

      // Create rib edit behaviors for each target point in each layer
      for (const data of Object.values(layersData)) {
        for (const tp of targetPoints) {
          const contour = data.original.contours[tp.contourIndex];
          const skeletonPoint = contour?.points[tp.pointIndex];
          if (!skeletonPoint) continue;
          const normal = calculateNormalAtSkeletonPoint(contour, tp.pointIndex);

          const ribHitForPoint = {
            contourIndex: tp.contourIndex,
            pointIndex: tp.pointIndex,
            side: tp.side,
            normal,
            onCurvePoint: { x: skeletonPoint.x, y: skeletonPoint.y },
          };

          // Check if this side is editable
          const sideIsEditable = tp.isEditable;
          const interpolationAxis =
            sideIsEditable && ribDragStartPlan.useInterpolationBehavior
              ? this._findHandlesForRibPointFromSkeleton(
                  data.layer.glyph.path,
                  skeletonPoint,
                  normal,
                  contour,
                  tp.side
                )
              : null;
          const { behavior } = createRibBehaviorExecutor(ribDragStartPlan, {
            skeletonData: data.original,
            ribHit: ribHitForPoint,
            isEditable: sideIsEditable,
            interpolationAxis,
          });
          if (!behavior) {
            continue;
          }

          if (tp.isSingleSided) {
            // Single-sided tracks total width in the same half-width channel.
            const defaultWidth = contour.defaultWidth ?? DEFAULT_SKELETON_WIDTH;
            const leftHW = getPointHalfWidth(skeletonPoint, defaultWidth, "left");
            const rightHW = getPointHalfWidth(skeletonPoint, defaultWidth, "right");
            const totalWidth = leftHW + rightHW;
            if (behavior.setOriginalHalfWidth) {
              behavior.setOriginalHalfWidth(totalWidth);
            } else {
              behavior.originalHalfWidth = totalWidth;
            }
            behavior.minHalfWidth = 2;
          }
          data.ribBehaviors.push({ behavior, target: tp });
        }
      }
      

      let accumulatedChanges = new ChangeCollector();

      // Drag loop
      for await (const event of eventStream) {
        this.canvasController.canvas.style.cursor = "pointer";
        const roundFunc = makeRoundFunc(event);
        const currentLocalPoint = sceneController.localPoint(event);
        const currentGlyphPoint = {
          x: currentLocalPoint.x - positionedGlyph.x,
          y: currentLocalPoint.y - positionedGlyph.y,
        };

        const delta = vector.subVectors(currentGlyphPoint, startGlyphPoint);

        const hasSkeletonSelection = selectedSkeletonPoints?.size > 0;
        const ribDragPlan = resolveModifierPlan("rib", "drag", ribDragIntent, {
          zActive: this.tangentRibMode,
          hasSkeletonSelection,
        });
        if (!ribDragPlan.supported) {
          continue;
        }
        const constrainMode = ribDragPlan.constrainMode;
        const useNormalDelta = ribDragPlan.shouldProjectToBaseNormal;
        const baseNormalDelta = useNormalDelta
          ? (ribHit.side === "left" ? 1 : -1) *
            (delta.x * ribHit.normal.x + delta.y * ribHit.normal.y)
          : 0;

        const allChanges = [];

        // Apply changes to ALL editable layers
        for (const [editLayerName, data] of Object.entries(layersData)) {
          const { layer, working, ribBehaviors } = data;

          // Apply each behavior to update all target points
          for (const { behavior, target } of ribBehaviors) {
            let deltaForBehavior = delta;
            if (useNormalDelta && behavior?.normal) {
              const sign = (behavior.side || target.side) === "left" ? 1 : -1;
              const normal = behavior.normal;
              const normalLenSq = normal.x * normal.x + normal.y * normal.y;
              const scalar =
                normalLenSq > 0 ? baseNormalDelta / (sign * normalLenSq) : 0;
              deltaForBehavior = { x: normal.x * scalar, y: normal.y * scalar };
            }
            const change = behavior.applyDelta(deltaForBehavior, constrainMode, roundFunc);

            const contour = working.contours[target.contourIndex];
            const point = contour.points[target.pointIndex];
            const side = target.side;
            const pointKey = `${target.contourIndex}/${target.pointIndex}`;
            const linkedWidthDriverSide = linkedWidthDriverByPoint.get(pointKey);
            const shouldApplyLinkedWidth =
              !target.isLinked || !linkedWidthDriverSide || linkedWidthDriverSide === side;

            // Check if this side is editable
            const sideIsEditable = target.isEditable;

            if (target.isSingleSided) {
              // Single-sided: halfWidth from behavior is the new totalWidth
              // Store as symmetric width (generator handles single-sided projection)
              point.width = change.halfWidth;
              delete point.leftWidth;
              delete point.rightWidth;
              // Also apply nudge if editable
              if (sideIsEditable && change.nudge !== undefined) {
                setRibNudgeValue(point, side, change.nudge);
              }
              // Apply 2D handle offset compensation for interpolation or editable drag (single-sided)
              if (sideIsEditable && (change.isInterpolation || change.hasHandleOffsets)) {
                applyRibHandleOffsetCompensation(point, side, change);
              }
            } else if (sideIsEditable) {
              const baseContour = data.original.contours[target.contourIndex];
              const basePoint = baseContour?.points[target.pointIndex];
              if (basePoint && shouldApplyLinkedWidth) {
                const defaultWidth = baseContour.defaultWidth ?? DEFAULT_SKELETON_WIDTH;
                const delta = change.halfWidth - behavior.originalHalfWidth;
                applyLinkedWidthDelta(
                  point,
                  basePoint,
                  defaultWidth,
                  side,
                  delta,
                  target.isLinked,
                  roundFunc
                );
              }

              setRibNudgeValue(point, side, change.nudge);

              // Apply 2D handle offset compensation for interpolation or editable drag
              if (change.isInterpolation || change.hasHandleOffsets) {
                applyRibHandleOffsetCompensation(point, side, change);
              }
            } else {
              const baseContour = data.original.contours[target.contourIndex];
              const basePoint = baseContour?.points[target.pointIndex];
              if (basePoint && shouldApplyLinkedWidth) {
                const defaultWidth = baseContour.defaultWidth ?? DEFAULT_SKELETON_WIDTH;
                const delta = change.halfWidth - behavior.originalHalfWidth;
                applyLinkedWidthDelta(
                  point,
                  basePoint,
                  defaultWidth,
                  side,
                  delta,
                  target.isLinked,
                  roundFunc
                );
              }
            }
          }

          // Record changes for this layer
          const staticGlyph = layer.glyph;
          const pathChange = recordChanges(staticGlyph, (sg) => {
            regenerateSkeletonContours(sg, working);
          });
          allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

          const customDataChange = recordChanges(layer, (l) => {
            setSkeletonData(l, JSON.parse(JSON.stringify(working)));
          });
          allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
        }

        const combinedChange = new ChangeCollector().concat(...allChanges);
        accumulatedChanges = accumulatedChanges.concat(combinedChange);
        await sendIncrementalChange(combinedChange.change, true);
      }

      // Final send without "may drop" flag
      await sendIncrementalChange(accumulatedChanges.change);

      return {
        changes: accumulatedChanges,
        undoLabel: translate("edit-tools-pointer.undo.change-skeleton-width"),
        broadcast: true,
      };
      });
    } finally {
      this.canvasController.canvas.style.cursor = previousCursor || "default";
    }
  }

  /**
   * Check if selected points are editable generated points (from skeleton).
   * @param {Array} pointSelection - Array of point indices
   * @returns {Array} Array of {pointIndex, skeletonContourIndex, skeletonPointIndex, side}
   */
  _getEditableGeneratedPointsFromSelection(pointSelection) {
    const result = [];
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) {
      return result;
    }

    for (const pointIndex of pointSelection) {
      const ribInfo = this.sceneModel._getEditableRibPointForGeneratedPoint(
        positionedGlyph,
        pointIndex
      );
      if (ribInfo) {
        result.push({
          pointIndex,
          ...ribInfo,
        });
      }
    }
    return result;
  }

  /**
   * Build interpolation axis data for a rib point in generated path coordinates.
   * Supports:
   * - two handles: axis is handle-to-handle
   * - one handle: axis is segment-anchor-to-handle
   * @param {Object} path - The generated path
   * @param {number} ribPointIndex - Index of the rib point in the generated path
   * @returns {Object|null} Axis data for InterpolatingRibBehavior
   */
  _buildRibInterpolationAxis(path, ribPointIndex) {
    const numPoints = path?.numPoints ?? 0;
    if (ribPointIndex < 0 || ribPointIndex >= numPoints) {
      return null;
    }

    const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(ribPointIndex);
    const numContourPoints = path.getNumPointsOfContour(contourIndex);
    const contourStart = ribPointIndex - contourPointIndex;

    const wrapIndex = (idx) => {
      const relative = idx - contourStart;
      const wrapped = ((relative % numContourPoints) + numContourPoints) % numContourPoints;
      return contourStart + wrapped;
    };

    const prevIdx = wrapIndex(ribPointIndex - 1);
    const nextIdx = wrapIndex(ribPointIndex + 1);

    const prevType = path.pointTypes[prevIdx] & VarPackedPath.POINT_TYPE_MASK;
    const nextType = path.pointTypes[nextIdx] & VarPackedPath.POINT_TYPE_MASK;
    const prevIsOnCurve = prevType === VarPackedPath.ON_CURVE;
    const nextIsOnCurve = nextType === VarPackedPath.ON_CURVE;

    const prevHandle = !prevIsOnCurve ? path.getPoint(prevIdx) : null;
    const nextHandle = !nextIsOnCurve ? path.getPoint(nextIdx) : null;
    const ribPoint = path.getPoint(ribPointIndex);

    let segmentAnchor = null;
    if (prevHandle && !nextHandle) {
      segmentAnchor = nextIsOnCurve ? path.getPoint(nextIdx) : null;
    } else if (nextHandle && !prevHandle) {
      segmentAnchor = prevIsOnCurve ? path.getPoint(prevIdx) : null;
    }

    let lineStart = null;
    let lineEnd = null;

    if (prevHandle && nextHandle) {
      lineStart = prevHandle;
      lineEnd = nextHandle;
    } else if (prevHandle || nextHandle) {
      lineStart = segmentAnchor || ribPoint;
      lineEnd = prevHandle || nextHandle;
    } else {
      return null;
    }

    const axisDx = lineEnd.x - lineStart.x;
    const axisDy = lineEnd.y - lineStart.y;
    if (Math.hypot(axisDx, axisDy) < 0.001) {
      return null;
    }

    return {
      prevHandle,
      nextHandle,
      segmentAnchor,
      lineStart,
      lineEnd,
      hasPrevHandle: !!prevHandle,
      hasNextHandle: !!nextHandle,
    };
  }

  /**
   * Find interpolation axis for a rib point by computing its expected generated position
   * and inspecting adjacent points in the generated contour.
   * @param {Object} path - The generated glyph path
   * @param {Object} skeletonPoint - The skeleton point {x, y, ...}
   * @param {Object} normal - The normal vector at this point
   * @param {Object} contour - The skeleton contour
   * @param {string} side - "left" or "right"
   * @returns {Object|null} Axis data for InterpolatingRibBehavior
   */
  _findHandlesForRibPointFromSkeleton(path, skeletonPoint, normal, contour, side) {
    if (!path || !contour?.points?.length || !skeletonPoint) {
      return null;
    }

    const defaultWidth = contour.defaultWidth ?? DEFAULT_SKELETON_WIDTH;
    let halfWidth = getPointHalfWidth(skeletonPoint, defaultWidth, side);
    if (contour.singleSided) {
      const leftHW = getPointHalfWidth(skeletonPoint, defaultWidth, "left");
      const rightHW = getPointHalfWidth(skeletonPoint, defaultWidth, "right");
      halfWidth = leftHW + rightHW;
    }
    const nudge = getRibNudgeValue(skeletonPoint, side);

    const expectedRibPoint = projectRibPoint(
      skeletonPoint,
      normal,
      halfWidth,
      side,
      nudge
    );

    const ribPointIndex = path.pointIndexNearPoint(expectedRibPoint, 3);
    if (ribPointIndex !== undefined) {
      const axisFromPath = this._buildRibInterpolationAxis(path, ribPointIndex);
      if (axisFromPath) {
        return axisFromPath;
      }
    }

    // Fallback: derive axis from skeleton topology.
    const points = contour.points;
    const pointIndex = points.findIndex(
      (p) => p === skeletonPoint || (p.x === skeletonPoint.x && p.y === skeletonPoint.y)
    );
    if (pointIndex < 0) {
      return null;
    }

    let prevHandle = null;
    let nextHandle = null;
    let segmentAnchor = null;
    const isClosed = !!contour.isClosed;

    const prevIdx = isClosed || pointIndex > 0 ? (pointIndex - 1 + points.length) % points.length : null;
    if (prevIdx !== null && points[prevIdx]?.type) {
      prevHandle = this._offsetSkeletonHandle(
        points[prevIdx],
        skeletonPoint,
        normal,
        contour,
        side
      );
    }

    const nextIdx = isClosed || pointIndex < points.length - 1 ? (pointIndex + 1) % points.length : null;
    if (nextIdx !== null && points[nextIdx]?.type) {
      nextHandle = this._offsetSkeletonHandle(
        points[nextIdx],
        skeletonPoint,
        normal,
        contour,
        side
      );
    }

    if (prevHandle && !nextHandle && nextIdx !== null && !points[nextIdx]?.type) {
      segmentAnchor = this._offsetSkeletonOnCurve(
        points[nextIdx],
        contour,
        nextIdx,
        side
      );
    } else if (nextHandle && !prevHandle && prevIdx !== null && !points[prevIdx]?.type) {
      segmentAnchor = this._offsetSkeletonOnCurve(
        points[prevIdx],
        contour,
        prevIdx,
        side
      );
    }

    if (!prevHandle && !nextHandle) {
      return null;
    }

    let lineStart = null;
    let lineEnd = null;
    if (prevHandle && nextHandle) {
      lineStart = prevHandle;
      lineEnd = nextHandle;
    } else {
      lineStart = segmentAnchor || expectedRibPoint;
      lineEnd = prevHandle || nextHandle;
    }

    const axisDx = lineEnd.x - lineStart.x;
    const axisDy = lineEnd.y - lineStart.y;
    if (Math.hypot(axisDx, axisDy) < 0.001) {
      return null;
    }

    return {
      prevHandle,
      nextHandle,
      segmentAnchor,
      lineStart,
      lineEnd,
      hasPrevHandle: !!prevHandle,
      hasNextHandle: !!nextHandle,
    };
  }

  _offsetSkeletonHandle(skelHandle, skelOnCurve, normal, contour, side) {
    const defaultWidth = contour.defaultWidth ?? DEFAULT_SKELETON_WIDTH;
    const halfWidth = side === "left"
      ? (skelOnCurve.leftWidth ?? (skelOnCurve.width !== undefined ? skelOnCurve.width / 2 : defaultWidth / 2))
      : (skelOnCurve.rightWidth ?? (skelOnCurve.width !== undefined ? skelOnCurve.width / 2 : defaultWidth / 2));
    const sign = side === "left" ? 1 : -1;

    return {
      x: skelHandle.x + sign * normal.x * halfWidth,
      y: skelHandle.y + sign * normal.y * halfWidth,
    };
  }

  _offsetSkeletonOnCurve(skeletonOnCurve, contour, pointIndex, side) {
    const normal = calculateNormalAtSkeletonPoint(contour, pointIndex);
    const defaultWidth = contour.defaultWidth ?? DEFAULT_SKELETON_WIDTH;
    let halfWidth = getPointHalfWidth(skeletonOnCurve, defaultWidth, side);
    if (contour.singleSided) {
      const leftHW = getPointHalfWidth(skeletonOnCurve, defaultWidth, "left");
      const rightHW = getPointHalfWidth(skeletonOnCurve, defaultWidth, "right");
      halfWidth = leftHW + rightHW;
    }
    const nudge = getRibNudgeValue(skeletonOnCurve, side);
    return projectRibPoint(skeletonOnCurve, normal, halfWidth, side, nudge);
  }

  /**
   * Check if selected points are editable generated handles (from skeleton).
   * @param {Array} pointSelection - Array of point indices
   * @returns {Array} Array of {pointIndex, skeletonContourIndex, skeletonPointIndex, side, handleType}
   */
  _getEditableGeneratedHandlesFromSelection(pointSelection) {
    const result = [];
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return result;

    for (const pointIndex of pointSelection) {
      const handleInfo = this.sceneModel._getEditableHandleForGeneratedPoint(
        positionedGlyph,
        pointIndex
      );
      if (handleInfo) {
        result.push({
          pointIndex,
          ...handleInfo,
        });
      }
    }

    return result;
  }

  /**
   * Find interpolation axis for a rib point in the generated path.
   * @param {Object} path - The generated path
   * @param {number} ribPointIndex - Index of the rib point in the path
   * @returns {Object|null} Axis data for InterpolatingRibBehavior
   */
  _findAdjacentHandlesForRibPoint(path, ribPointIndex) {
    return this._buildRibInterpolationAxis(path, ribPointIndex);
  }

  /**
   * Handle dragging editable generated points (from skeleton contours).
   * Updates skeleton data (nudge, width) based on point movement.
   * When Alt is held, the rib point slides along interpolation axis:
   * handle-handle, or segment-handle for single-handle smooth cases.
   */
  async _handleDragEditableGeneratedPoints(eventStream, initialEvent, editablePoints) {
    const sceneController = this.sceneController;
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();

    if (!positionedGlyph || editablePoints.length === 0) return;

    // Keep drag behavior stable: interpolation mode is chosen on drag start.
    const ribDragStartPlan = resolveModifierPlan("rib", "drag", {
      alt: initialEvent.altKey,
      z: this.tangentRibMode,
      x: this.equalizeMode,
    });
    if (!ribDragStartPlan.supported) {
      return;
    }
    const ribDragIntent = ribDragStartPlan.intent;
    const useInterpolation = ribDragStartPlan.useInterpolationBehavior;

    const localPoint = sceneController.localPoint(initialEvent);
    const startGlyphPoint = {
      x: localPoint.x - positionedGlyph.x,
      y: localPoint.y - positionedGlyph.y,
    };

    // If using interpolation, build axis data for each editable rib point
    const generatedPath = positionedGlyph.glyph.path;

    const editablePointsWithInterpolation = useInterpolation
      ? editablePoints.map((ep) => {
          // ep.pointIndex is the index in the generated path
          const interpolationAxis = this._findAdjacentHandlesForRibPoint(
            generatedPath,
            ep.pointIndex
          );
          return { ...ep, interpolationAxis };
        })
      : editablePoints.map((ep) => ({ ...ep, interpolationAxis: null }));

    const previousCursor = this.canvasController.canvas.style.cursor;
    this.canvasController.canvas.style.cursor = "pointer";

    try {
      await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const layersData = {};

      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!getSkeletonData(layer)) continue;

        const skeletonData = getSkeletonData(layer);
        layersData[editLayerName] = {
          layer,
          original: JSON.parse(JSON.stringify(skeletonData)),
          working: JSON.parse(JSON.stringify(skeletonData)),
          behaviors: [],
        };
      }

      if (Object.keys(layersData).length === 0) return;

      // Create behaviors for each editable point in each layer
      for (const data of Object.values(layersData)) {
        for (const ep of editablePointsWithInterpolation) {
          const contour = data.original.contours[ep.skeletonContourIndex];
          const skeletonPoint = contour?.points[ep.skeletonPointIndex];
          if (!skeletonPoint) continue;

          const normal = calculateNormalAtSkeletonPoint(contour, ep.skeletonPointIndex);
          const ribHit = {
            contourIndex: ep.skeletonContourIndex,
            pointIndex: ep.skeletonPointIndex,
            side: ep.side,
            normal,
            onCurvePoint: { x: skeletonPoint.x, y: skeletonPoint.y },
          };

          const { behavior } = createRibBehaviorExecutor(ribDragStartPlan, {
            skeletonData: data.original,
            ribHit,
            isEditable: true,
            interpolationAxis: ep.interpolationAxis,
          });
          if (!behavior) {
            continue;
          }

          data.behaviors.push({
            behavior,
            editablePoint: ep,
          });
        }
      }
      

      let accumulatedChanges = new ChangeCollector();

      // Drag loop
      for await (const event of eventStream) {
        this.canvasController.canvas.style.cursor = "pointer";
        const roundFunc = makeRoundFunc(event);
        const currentLocalPoint = sceneController.localPoint(event);
        const currentGlyphPoint = {
          x: currentLocalPoint.x - positionedGlyph.x,
          y: currentLocalPoint.y - positionedGlyph.y,
        };

        const delta = vector.subVectors(currentGlyphPoint, startGlyphPoint);

        const ribDragPlan = resolveModifierPlan("rib", "drag", ribDragIntent, {
          zActive: this.tangentRibMode,
        });
        if (!ribDragPlan.supported) {
          continue;
        }
        const constrainMode = ribDragPlan.constrainMode;

        const allChanges = [];

        for (const [editLayerName, data] of Object.entries(layersData)) {
          const { layer, working, behaviors } = data;

          for (const { behavior, editablePoint } of behaviors) {
            const change = behavior.applyDelta(delta, constrainMode, roundFunc);
            const contour = working.contours[editablePoint.skeletonContourIndex];
            const point = contour.points[editablePoint.skeletonPointIndex];
            const side = editablePoint.side;

            const baseContour = data.original.contours[editablePoint.skeletonContourIndex];
            const basePoint = baseContour?.points[editablePoint.skeletonPointIndex];
            if (basePoint) {
              const defaultWidth = baseContour.defaultWidth ?? DEFAULT_SKELETON_WIDTH;
              const delta = change.halfWidth - behavior.originalHalfWidth;
              const linked = isWidthLinked(basePoint);
              applyLinkedWidthDelta(
                point,
                basePoint,
                defaultWidth,
                side,
                delta,
                linked,
                roundFunc
              );
            }

            setRibNudgeValue(point, side, change.nudge);

            // Apply 2D handle offset compensation for interpolation or editable drag
            if (change.isInterpolation || change.hasHandleOffsets) {
              applyRibHandleOffsetCompensation(point, side, change);
            }
          }

          const staticGlyph = layer.glyph;
          const pathChange = recordChanges(staticGlyph, (sg) => {
            regenerateSkeletonContours(sg, working);
          });
          allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

          const customDataChange = recordChanges(layer, (l) => {
            setSkeletonData(l, JSON.parse(JSON.stringify(working)));
          });
          allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
        }

        const combinedChange = new ChangeCollector().concat(...allChanges);
        accumulatedChanges = accumulatedChanges.concat(combinedChange);
        await sendIncrementalChange(combinedChange.change, true);
      }

      await sendIncrementalChange(accumulatedChanges.change);

      return {
        changes: accumulatedChanges,
        undoLabel: "Edit generated point",
        broadcast: true,
      };
      });
    } finally {
      this.canvasController.canvas.style.cursor = previousCursor || "default";
    }
  }

  _buildEditableHandleEqualizeState(layerPath, contour, editableHandle, skeletonHandleDir) {
    if (!layerPath) {
      return null;
    }
    const equalizeInfo = this._getEqualizeHandleInfoForPointIndex(layerPath, editableHandle.pointIndex);
    if (!equalizeInfo) {
      return null;
    }

    const anchorPos = layerPath.getPoint(equalizeInfo.smoothIndex);
    const draggedPos = layerPath.getPoint(equalizeInfo.pointIndex);
    const oppositePos = layerPath.getPoint(equalizeInfo.oppositeIndex);
    const oppositeHandleType = editableHandle.handleType === "in" ? "out" : "in";
    const oppositeHandleDir = this._getSkeletonHandleDirForPoint(
      contour,
      editableHandle.skeletonPointIndex,
      oppositeHandleType
    );
    if (!anchorPos || !draggedPos || !oppositePos || !oppositeHandleDir) {
      return null;
    }

    const point = contour.points[editableHandle.skeletonPointIndex];
    const detachedKey = getHandleDetachedKey(editableHandle.side);
    const detachedMode = !!point[detachedKey];
    const draggedState = this._readEditableHandleEqualizeState(
      point,
      editableHandle.side,
      editableHandle.handleType,
      anchorPos,
      draggedPos,
      skeletonHandleDir,
      detachedMode
    );
    const oppositeState = this._readEditableHandleEqualizeState(
      point,
      editableHandle.side,
      oppositeHandleType,
      anchorPos,
      oppositePos,
      oppositeHandleDir,
      detachedMode
    );
    return {
      anchorPos,
      draggedState,
      oppositeState,
    };
  }

  _buildEditableHandleLayersData(glyph, editableHandles) {
    const layersData = {};
    for (const editLayerName of this.sceneController.editingLayerNames) {
      const layer = glyph.layers[editLayerName];
      if (!getSkeletonData(layer)) {
        continue;
      }
      const skeletonData = getSkeletonData(layer);
      layersData[editLayerName] = {
        layer,
        original: JSON.parse(JSON.stringify(skeletonData)),
        working: JSON.parse(JSON.stringify(skeletonData)),
        behaviors: [],
      };
    }
    if (Object.keys(layersData).length === 0) {
      return layersData;
    }

    for (const data of Object.values(layersData)) {
      const layerPath = data.layer?.glyph?.path;
      for (const editableHandle of editableHandles) {
        const contour = data.original.contours[editableHandle.skeletonContourIndex];
        if (!contour) {
          continue;
        }
        const skeletonHandleDir = this._getSkeletonHandleDirForPoint(
          contour,
          editableHandle.skeletonPointIndex,
          editableHandle.handleType
        );
        if (!skeletonHandleDir) {
          continue;
        }

        const equalizeState = this._buildEditableHandleEqualizeState(
          layerPath,
          contour,
          editableHandle,
          skeletonHandleDir
        );

        data.behaviors.push({
          behavior: createEditableHandleBehavior(data.original, editableHandle, skeletonHandleDir),
          editableHandle,
          skeletonHandleDir,
          equalizeState,
        });
      }
    }
    return layersData;
  }

  _applyEditableHandleBehaviorEntry(
    layerData,
    behaviorEntry,
    delta,
    roundFunc,
    useOriginalForDetached,
    equalizeEnabled
  ) {
    const { behavior, editableHandle, skeletonHandleDir, equalizeState } = behaviorEntry;
    const point =
      layerData.working.contours[editableHandle.skeletonContourIndex].points[
        editableHandle.skeletonPointIndex
      ];

    if (equalizeEnabled && equalizeState) {
      const projectedDelta =
        delta.x * equalizeState.draggedState.direction.x +
        delta.y * equalizeState.draggedState.direction.y;
      const targetLength = Math.max(
        0,
        equalizeState.draggedState.originalLength + projectedDelta
      );
      this._applyEditableHandleEqualizedLength(
        point,
        equalizeState.draggedState,
        targetLength,
        equalizeState.anchorPos,
        roundFunc
      );
      this._applyEditableHandleEqualizedLength(
        point,
        equalizeState.oppositeState,
        targetLength,
        equalizeState.anchorPos,
        roundFunc
      );
      return;
    }

    const change = behavior.applyDelta(delta, roundFunc);
    const editableHandleKeys = getEditableHandleKeys(
      editableHandle.side,
      editableHandle.handleType
    );
    const isDetached = point[editableHandleKeys.detachedKey];
    if (isDetached) {
      const basePoint = useOriginalForDetached
        ? layerData.original.contours[editableHandle.skeletonContourIndex].points[
            editableHandle.skeletonPointIndex
          ]
        : point;
      const projectedDelta = delta.x * skeletonHandleDir.x + delta.y * skeletonHandleDir.y;
      point[editableHandleKeys.offsetXKey] =
        (basePoint[editableHandleKeys.offsetXKey] || 0) +
        roundFunc(skeletonHandleDir.x * projectedDelta);
      point[editableHandleKeys.offsetYKey] =
        (basePoint[editableHandleKeys.offsetYKey] || 0) +
        roundFunc(skeletonHandleDir.y * projectedDelta);
      return;
    }

    delete point[editableHandleKeys.offsetXKey];
    delete point[editableHandleKeys.offsetYKey];
    point[editableHandleKeys.offset1DKey] = change.offset;
  }

  _collectEditableHandleLayerChanges(editLayerName, layerData, allChanges, cloneWorkingForCustomData) {
    const { layer, working } = layerData;
    const pathChange = recordChanges(layer.glyph, (sg) => {
      regenerateSkeletonContours(sg, working);
    });
    allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

    const customDataChange = recordChanges(layer, (l) => {
      setSkeletonData(
        l,
        cloneWorkingForCustomData ? JSON.parse(JSON.stringify(working)) : working
      );
    });
    allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
  }

  /**
   * Handle dragging editable generated handles (from skeleton contours).
   * Updates skeleton data (handle offsets) based on handle movement.
   */
  async _handleDragEditableGeneratedHandles(eventStream, initialEvent, editableHandles) {
    const sceneController = this.sceneController;
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();

    if (!positionedGlyph || editableHandles.length === 0) return;

    const localPoint = sceneController.localPoint(initialEvent);
    const startGlyphPoint = {
      x: localPoint.x - positionedGlyph.x,
      y: localPoint.y - positionedGlyph.y,
    };

    const previousCursor = this.canvasController.canvas.style.cursor;
    this.canvasController.canvas.style.cursor = "pointer";

    try {
      await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const layersData = this._buildEditableHandleLayersData(glyph, editableHandles);

      if (Object.keys(layersData).length === 0) return;
      

      let accumulatedChanges = new ChangeCollector();

      // Drag loop
      for await (const event of eventStream) {
        const roundFunc = makeRoundFunc(event);
        const currentLocalPoint = sceneController.localPoint(event);
        const currentGlyphPoint = {
          x: currentLocalPoint.x - positionedGlyph.x,
          y: currentLocalPoint.y - positionedGlyph.y,
        };

        const delta = vector.subVectors(currentGlyphPoint, startGlyphPoint);
        const editableHandlePlan = resolveEditableGeneratedHandlePlan("drag", {
          x: this.equalizeMode,
        });
        const equalizeEnabled =
          editableHandlePlan.executorFamily ===
          HANDLE_EXECUTOR_FAMILIES.EDITABLE_GENERATED_EQUALIZE;

        const allChanges = [];

        for (const [editLayerName, data] of Object.entries(layersData)) {
          for (const behaviorEntry of data.behaviors) {
            this._applyEditableHandleBehaviorEntry(
              data,
              behaviorEntry,
              delta,
              roundFunc,
              true,
              equalizeEnabled
            );
          }
          this._collectEditableHandleLayerChanges(editLayerName, data, allChanges, true);
        }

        const combinedChange = new ChangeCollector().concat(...allChanges);
        accumulatedChanges = accumulatedChanges.concat(combinedChange);
        await sendIncrementalChange(combinedChange.change, true);
      }

      await sendIncrementalChange(accumulatedChanges.change);

      return {
        changes: accumulatedChanges,
        undoLabel: "Edit generated handle",
        broadcast: true,
      };
      });
    } finally {
      this.canvasController.canvas.style.cursor = previousCursor || "default";
    }
  }

  /**
   * Handle arrow key movement for editable generated handles.
   * Movement is constrained to the skeleton handle direction (tangent).
   */
  async _handleArrowKeysForEditableHandles(event, editableHandles) {
    const sceneController = this.sceneController;
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();

    if (!positionedGlyph || editableHandles.length === 0) return;

    // Calculate arrow key delta
    let [dx, dy] = arrowKeyDeltas[event.key];
    if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
      dx *= 100;
      dy *= 100;
    } else if (event.shiftKey) {
      dx *= 10;
      dy *= 10;
    }
    const delta = { x: dx, y: dy };
    const editableHandlePlan = resolveEditableGeneratedHandlePlan("nudge", {
      x: this.equalizeMode,
    });
    if (!editableHandlePlan.supported) {
      return;
    }
    const equalizeEnabled =
      editableHandlePlan.executorFamily ===
      HANDLE_EXECUTOR_FAMILIES.EDITABLE_GENERATED_EQUALIZE;

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const layersData = this._buildEditableHandleLayersData(glyph, editableHandles);

      if (Object.keys(layersData).length === 0) return;

      const allChanges = [];
      const roundFunc = Math.round;

      for (const [editLayerName, data] of Object.entries(layersData)) {
        for (const behaviorEntry of data.behaviors) {
          this._applyEditableHandleBehaviorEntry(
            data,
            behaviorEntry,
            delta,
            roundFunc,
            false,
            equalizeEnabled
          );
        }
        this._collectEditableHandleLayerChanges(editLayerName, data, allChanges, false);
      }

      if (allChanges.length === 0) return;

      const combined = new ChangeCollector().concat(...allChanges);
      await sendIncrementalChange(combined.change);

      return {
        changes: combined,
        undoLabel: "Nudge generated handle",
        broadcast: true,
      };
    });
  }

  /**
   * Get information about selected rib points for arrow key processing.
   * @param {Set} ribPointSelection - Set of "contourIdx/pointIdx/side" strings
   * @returns {Array} Array of rib point info objects
   */
  _getSelectedRibPointInfo(ribPointSelection) {
    const result = [];
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return result;

    const editLayerName = this.sceneController.editingLayerNames?.[0];
    if (!editLayerName) return result;

    const varGlyph = positionedGlyph.varGlyph;
    if (!varGlyph?.glyph?.layers?.[editLayerName]) return result;

    const layer = varGlyph.glyph.layers[editLayerName];
    const skeletonData = getSkeletonData(layer);
    if (!skeletonData?.contours?.length) return result;

    for (const key of ribPointSelection) {
      const parts = key.split("/");
      if (parts.length !== 3) continue;

      const contourIndex = parseInt(parts[0]);
      const pointIndex = parseInt(parts[1]);
      const side = parts[2]; // "left" or "right"

      const contour = skeletonData.contours[contourIndex];
      if (!contour || pointIndex >= contour.points.length) continue;

      const point = contour.points[pointIndex];
      if (point.type) continue; // Skip off-curve points

      const defaultWidth = contour.defaultWidth ?? DEFAULT_SKELETON_WIDTH;
      const editableKey = side === "left" ? "leftEditable" : "rightEditable";
      const isEditable = point[editableKey] === true;
      const isSingleSided = contour.singleSided ?? false;
      const isLinked = isWidthLinked(point);

      // Calculate normal at this point
      const normal = calculateNormalAtSkeletonPoint(contour, pointIndex);

      result.push({
        contourIndex,
        pointIndex,
        side,
        point,
        normal,
        isEditable,
        isSingleSided,
        isLinked,
        defaultWidth,
      });
    }

    return result;
  }

  _selectedRibTargetsBelongToSingleSegment(targets, skeletonData) {
    if (!targets?.length) {
      return false;
    }
    if (targets.length === 1) {
      return true;
    }
    if (targets.length !== 2) {
      return false;
    }

    const [a, b] = targets;
    if (
      a.contourIndex !== b.contourIndex ||
      a.side !== b.side ||
      a.pointIndex === b.pointIndex
    ) {
      return false;
    }

    const contour = skeletonData?.contours?.[a.contourIndex];
    if (!contour?.points?.length) {
      return false;
    }

    const segments = buildSegmentsFromSkeletonPoints(contour.points, !!contour.isClosed);
    for (const segment of segments) {
      const sameDirection =
        segment.startIndex === a.pointIndex && segment.endIndex === b.pointIndex;
      const oppositeDirection =
        segment.startIndex === b.pointIndex && segment.endIndex === a.pointIndex;
      if (sameDirection || oppositeDirection) {
        return true;
      }
    }
    return false;
  }

  _buildLinkedWidthDriverByPoint(targets, preferredSideByPoint = null) {
    // Linked width is shared by both rib sides of the same skeleton point.
    // If both sides are selected, width must be written once per point
    // to avoid last-write-wins conflicts.
    const grouped = new Map();
    for (const target of targets || []) {
      if (!target?.isLinked || target?.isSingleSided) {
        continue;
      }
      const pointKey = `${target.contourIndex}/${target.pointIndex}`;
      if (!grouped.has(pointKey)) {
        grouped.set(pointKey, new Set());
      }
      grouped.get(pointKey).add(target.side);
    }

    const driverByPoint = new Map();
    for (const [pointKey, sides] of grouped.entries()) {
      if (!(sides.has("left") && sides.has("right"))) {
        continue;
      }
      const preferredSide = preferredSideByPoint?.get(pointKey);
      driverByPoint.set(pointKey, preferredSide || "left");
    }
    return driverByPoint;
  }

  async _handleArrowKeysForEqualizeRibHandles(delta, ribPointsInfo) {
    const sceneController = this.sceneController;
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph || !ribPointsInfo?.length) {
      return false;
    }

    let handled = false;

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!getSkeletonData(layer)) continue;

        const originalSkeletonData = getSkeletonData(layer);
        const workingSkeletonData = JSON.parse(JSON.stringify(originalSkeletonData));
        let changed = false;

        for (const ribInfo of ribPointsInfo) {
          const { contourIndex, pointIndex, side, isEditable } = ribInfo;
          if (!isEditable) {
            continue;
          }

          const baseContour = originalSkeletonData.contours?.[contourIndex];
          const basePoint = baseContour?.points?.[pointIndex];
          const workPoint = workingSkeletonData.contours?.[contourIndex]?.points?.[pointIndex];
          if (!baseContour || !basePoint || !workPoint || basePoint.type) {
            continue;
          }

          const normal = calculateNormalAtSkeletonPoint(baseContour, pointIndex);
          const anchorPos = this._offsetSkeletonOnCurve(basePoint, baseContour, pointIndex, side);
          const interpolationAxis = this._findHandlesForRibPointFromSkeleton(
            layer.glyph.path,
            basePoint,
            normal,
            baseContour,
            side
          );
          if (!interpolationAxis) {
            continue;
          }

          const detachedMode = !!basePoint[getHandleDetachedKey(side)];
          const incomingDir = this._getSkeletonHandleDirForPoint(baseContour, pointIndex, "in");
          const outgoingDir = this._getSkeletonHandleDirForPoint(baseContour, pointIndex, "out");

          const inState =
            interpolationAxis.prevHandle && incomingDir
              ? this._readEditableHandleEqualizeState(
                  basePoint,
                  side,
                  "in",
                  anchorPos,
                  interpolationAxis.prevHandle,
                  incomingDir,
                  detachedMode
                )
              : null;

          const outState =
            interpolationAxis.nextHandle && outgoingDir
              ? this._readEditableHandleEqualizeState(
                  basePoint,
                  side,
                  "out",
                  anchorPos,
                  interpolationAxis.nextHandle,
                  outgoingDir,
                  detachedMode
                )
              : null;

          const primaryState = outState || inState;
          if (!primaryState) {
            continue;
          }

          const projectedDelta =
            delta.x * primaryState.direction.x + delta.y * primaryState.direction.y;
          const baseLength =
            inState && outState
              ? (inState.originalLength + outState.originalLength) / 2
              : primaryState.originalLength;
          const targetLength = Math.max(0, baseLength + projectedDelta);

          // X-equalize for rib points changes only distances to rib control points.
          // It does not modify width or rib-point nudge.
          if (inState) {
            this._applyEditableHandleEqualizedLength(
              workPoint,
              inState,
              targetLength,
              anchorPos,
              Math.round
            );
          }
          if (outState) {
            this._applyEditableHandleEqualizedLength(
              workPoint,
              outState,
              targetLength,
              anchorPos,
              Math.round
            );
          }
          changed = true;
        }

        if (!changed) {
          continue;
        }

        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          regenerateSkeletonContours(sg, workingSkeletonData);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        const customDataChange = recordChanges(layer, (l) => {
          setSkeletonData(l, workingSkeletonData);
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      if (allChanges.length === 0) {
        return false;
      }

      handled = true;
      const combined = new ChangeCollector().concat(...allChanges);
      await sendIncrementalChange(combined.change);
      return {
        changes: combined,
        undoLabel: "Nudge rib handles (equalize)",
        broadcast: true,
      };
    });

    return handled;
  }

  /**
   * Handle arrow key movement for rib points.
   * For non-editable ribs: changes width only.
   * For editable ribs: changes nudge and width (per linked state).
   */
  async _handleArrowKeysForRibPoints(event, ribPointSelection) {
    const sceneController = this.sceneController;

    // Get rib point info
    const ribPointsInfo = this._getSelectedRibPointInfo(ribPointSelection);
    if (ribPointsInfo.length === 0) return;

    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    const editLayerName = sceneController.editingLayerNames?.[0];
    const layerForRibs = positionedGlyph?.varGlyph?.glyph?.layers?.[editLayerName];
    const skeletonData = getSkeletonData(layerForRibs);
    if (!skeletonData?.contours?.length) return;

    // Calculate arrow key delta
    let [dx, dy] = arrowKeyDeltas[event.key];
    if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
      dx *= 100;
      dy *= 100;
    } else if (event.shiftKey) {
      dx *= 10;
      dy *= 10;
    }
    const delta = { x: dx, y: dy };
    const ribArrowPlan = resolveModifierPlan("rib", "nudge", {
      alt: event.altKey,
      z: this.tangentRibMode,
      x: this.equalizeMode,
    });
    if (!ribArrowPlan.supported) {
      return;
    }

    if (ribArrowPlan.intent === "equalize") {
      await this._handleArrowKeysForEqualizeRibHandles(delta, ribPointsInfo);
      // Equalize intent never falls back to width/nudge semantics.
      // If no equalizable rib handles are found, this is a deliberate no-op.
      return;
    }

    const allTargetsEditable = ribPointsInfo.every((ribInfo) => ribInfo.isEditable);
    const linkedWidthDriverByPoint = this._buildLinkedWidthDriverByPoint(ribPointsInfo);
    const hasMirroredLinkedTargets = linkedWidthDriverByPoint.size > 0;
    const belongsToSingleSegment = this._selectedRibTargetsBelongToSingleSegment(
      ribPointsInfo,
      skeletonData
    );
    if (!allTargetsEditable && !belongsToSingleSegment && !hasMirroredLinkedTargets) {
      return;
    }

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      // Process each editing layer
      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!getSkeletonData(layer)) continue;

        const originalSkeletonData = getSkeletonData(layer);
        const workingSkeletonData = JSON.parse(JSON.stringify(originalSkeletonData));

        // Apply changes to each selected rib point
        for (const ribInfo of ribPointsInfo) {
          const {
            contourIndex,
            pointIndex,
            side,
            normal,
            isEditable,
            isSingleSided,
            isLinked,
            defaultWidth,
          } = ribInfo;

          const contour = workingSkeletonData.contours[contourIndex];
          if (!contour || pointIndex >= contour.points.length) continue;

          const point = contour.points[pointIndex];
          if (point.type) continue;

          const ribHit = {
            contourIndex,
            pointIndex,
            side,
            normal,
            onCurvePoint: point,
          };
          const baseContour = originalSkeletonData.contours[contourIndex];
          const basePoint = baseContour?.points[pointIndex];
          const interpolationAxis =
            isEditable && ribArrowPlan.useInterpolationBehavior && baseContour && basePoint
              ? this._findHandlesForRibPointFromSkeleton(
                  layer.glyph.path,
                  basePoint,
                  normal,
                  baseContour,
                  side
                )
              : null;

          const { behavior, resolvedFamily } = createRibBehaviorExecutor(ribArrowPlan, {
            skeletonData: originalSkeletonData,
            ribHit,
            isEditable,
            interpolationAxis,
          });
          if (!behavior) {
            continue;
          }

          if (isSingleSided && baseContour && basePoint) {
            const leftHW = getPointHalfWidth(basePoint, defaultWidth, "left");
            const rightHW = getPointHalfWidth(basePoint, defaultWidth, "right");
            const totalWidth = leftHW + rightHW;
            if (behavior.setOriginalHalfWidth) {
              behavior.setOriginalHalfWidth(totalWidth);
            } else {
              behavior.originalHalfWidth = totalWidth;
            }
            behavior.minHalfWidth = 2;
          }

          const hasInterpolationBehavior =
            resolvedFamily === RIB_EXECUTOR_FAMILIES.POINT_INTERPOLATING;
          const ribNudgeApplyPlan = resolveModifierPlan("rib", "nudge", ribArrowPlan.intent, {
            zActive: this.tangentRibMode,
            hasInterpolationBehavior,
          });
          if (!ribNudgeApplyPlan.supported) {
            continue;
          }
          const constrainMode = ribNudgeApplyPlan.constrainMode;
          const change = behavior.applyDelta(delta, constrainMode);
          const pointKey = `${contourIndex}/${pointIndex}`;
          const linkedWidthDriverSide = linkedWidthDriverByPoint.get(pointKey);
          const shouldApplyLinkedWidth =
            !isLinked || !linkedWidthDriverSide || linkedWidthDriverSide === side;

          if (isSingleSided) {
            point.width = change.halfWidth;
            delete point.leftWidth;
            delete point.rightWidth;
          } else if (
            basePoint &&
            (!isEditable || constrainMode !== "tangent") &&
            !change.isInterpolation &&
            shouldApplyLinkedWidth
          ) {
            const linked = isWidthLinked(basePoint);
            const deltaWidth = change.halfWidth - behavior.originalHalfWidth;
            applyLinkedWidthDelta(
              point,
              basePoint,
              defaultWidth,
              side,
              deltaWidth,
              linked,
              Math.round
            );
          }

          if (change.nudge !== undefined) {
            setRibNudgeValue(point, side, change.nudge);
          }

          // Interpolation/editable executors may provide 2D compensation payloads.
          if (change.isInterpolation || change.hasHandleOffsets) {
            applyRibHandleOffsetCompensation(point, side, change);
          }
        }

        // CRITICAL: Regenerate contours INSIDE recordChanges so changes are tracked for undo
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          regenerateSkeletonContours(sg, workingSkeletonData);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        // Record skeleton data changes (after path, so indices are correct)
        const customDataChange = recordChanges(layer, (l) => {
          setSkeletonData(l, workingSkeletonData);
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      if (allChanges.length === 0) return;

      const combined = new ChangeCollector().concat(...allChanges);
      await sendIncrementalChange(combined.change);

      return {
        changes: combined,
        undoLabel: translate("action.nudge-selection"),
        broadcast: true,
      };
    });
  }

  /**
   * Get skeleton handle direction for a given skeleton point.
   * @param {Object} contour - The skeleton contour
   * @param {number} pointIndex - Index of the on-curve skeleton point
   * @param {string} handleType - "in" or "out"
   * @returns {Object|null} Normalized direction vector {x, y}
   */
  _getSkeletonHandleDirForPoint(contour, pointIndex, handleType) {
    const points = contour.points;
    const numPoints = points.length;
    const isClosed = contour.isClosed;

    const skeletonPoint = points[pointIndex];
    if (!skeletonPoint || skeletonPoint.type) return null;

    // Find adjacent control points
    // For "out" handle: look at the next point
    // For "in" handle: look at the previous point
    let controlPoint = null;

    if (handleType === "out") {
      // Look for next point (could be off-curve)
      const nextIdx = (pointIndex + 1) % numPoints;
      if (isClosed || pointIndex < numPoints - 1) {
        const nextPt = points[nextIdx];
        if (nextPt?.type === "cubic") {
          controlPoint = nextPt;
        }
      }
    } else {
      // "in" handle: look at previous point
      const prevIdx = (pointIndex - 1 + numPoints) % numPoints;
      if (isClosed || pointIndex > 0) {
        const prevPt = points[prevIdx];
        if (prevPt?.type === "cubic") {
          controlPoint = prevPt;
        }
      }
    }

    if (!controlPoint) {
      return null;
    }

    const dir = {
      x: controlPoint.x - skeletonPoint.x,
      y: controlPoint.y - skeletonPoint.y,
    };
    const length = Math.hypot(dir.x, dir.y);

    if (length < 0.001) return null;

    const normalized = { x: dir.x / length, y: dir.y / length };
    return normalized;
  }

  _getEditableHandleOffsetKeys(side, handleType) {
    return getEditableHandleKeys(side, handleType);
  }

  _normalizeDirection(vectorValue, fallbackDirection) {
    const len = Math.hypot(vectorValue?.x || 0, vectorValue?.y || 0);
    if (len > 1e-9) {
      return { x: vectorValue.x / len, y: vectorValue.y / len };
    }
    const fallbackLen = Math.hypot(fallbackDirection?.x || 0, fallbackDirection?.y || 0);
    if (fallbackLen > 1e-9) {
      return { x: fallbackDirection.x / fallbackLen, y: fallbackDirection.y / fallbackLen };
    }
    return { x: 1, y: 0 };
  }

  _readEditableHandleEqualizeState(
    point,
    side,
    handleType,
    anchorPos,
    currentHandlePos,
    skeletonHandleDir,
    detachedMode
  ) {
    const keys = this._getEditableHandleOffsetKeys(side, handleType);
    const has2D =
      point[keys.offsetXKey] !== undefined || point[keys.offsetYKey] !== undefined;
    const offsetX = point[keys.offsetXKey] || 0;
    const offsetY = point[keys.offsetYKey] || 0;
    const offset1D = point[keys.offset1DKey] || 0;

    const currentVec = {
      x: currentHandlePos.x - anchorPos.x,
      y: currentHandlePos.y - anchorPos.y,
    };
    const originalLength = Math.hypot(currentVec.x, currentVec.y);
    const direction = this._normalizeDirection(currentVec, skeletonHandleDir);
    const normalizedSkeletonDir = this._normalizeDirection(skeletonHandleDir, direction);

    let baseControlPos = null;
    if (!detachedMode) {
      if (has2D) {
        baseControlPos = {
          x: currentHandlePos.x - offsetX,
          y: currentHandlePos.y - offsetY,
        };
      } else {
        baseControlPos = {
          x: currentHandlePos.x - normalizedSkeletonDir.x * offset1D,
          y: currentHandlePos.y - normalizedSkeletonDir.y * offset1D,
        };
      }
    }

    return {
      keys,
      direction,
      skeletonDir: normalizedSkeletonDir,
      originalLength,
      baseControlPos,
      detachedMode,
    };
  }

  _applyEditableHandleEqualizedLength(point, state, targetLength, anchorPos, roundFunc = Math.round) {
    const desiredPos = {
      x: anchorPos.x + state.direction.x * targetLength,
      y: anchorPos.y + state.direction.y * targetLength,
    };

    if (state.detachedMode) {
      // Detached mode stores absolute handle positions in rib-point space.
      point[state.keys.offsetXKey] = roundFunc(desiredPos.x - anchorPos.x);
      point[state.keys.offsetYKey] = roundFunc(desiredPos.y - anchorPos.y);
      return;
    }

    // Non-detached mode: store 2D offsets in control-point space.
    // This preserves angle and avoids jumps from switching semantics.
    const baseControlPos = state.baseControlPos || desiredPos;
    const relX = desiredPos.x - baseControlPos.x;
    const relY = desiredPos.y - baseControlPos.y;
    point[state.keys.offsetXKey] = roundFunc(relX);
    point[state.keys.offsetYKey] = roundFunc(relY);
    point[state.keys.offset1DKey] = roundFunc(relX * state.skeletonDir.x + relY * state.skeletonDir.y);
  }

  /**
   * Handle dragging a skeleton Tunni point.
   * - Tunni Point (midpoint): changes curve tension by moving control points
   * - True Tunni Point (intersection): moves on-curve points along projection lines
   */
  async _handleSkeletonTunniDrag(eventStream, initialEvent, tunniHit) {
    const sceneController = this.sceneController;
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();

    if (!positionedGlyph) return;

    // Get initial point in glyph coordinates
    const localPoint = sceneController.localPoint(initialEvent);
    const startGlyphPoint = {
      x: localPoint.x - positionedGlyph.x,
      y: localPoint.y - positionedGlyph.y,
    };

    const { type, contourIndex, segment } = tunniHit;
    const isTrueTunni = type === "true-tunni";

    // Store original segment data for calculations
    const originalSegment = {
      startPoint: { ...segment.startPoint },
      endPoint: { ...segment.endPoint },
      controlPoints: segment.controlPoints.map((p) => ({ ...p })),
      startIndex: segment.startIndex,
      endIndex: segment.endIndex,
      controlIndices: segment.controlIndices,
    };

    // Calculate original Tunni point position
    const origTunniPoint = isTrueTunni
      ? calculateSkeletonTrueTunniPoint(originalSegment)
      : calculateSkeletonTunniPoint(originalSegment);

    if (!origTunniPoint) return;

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      // Setup data for ALL editable layers (multi-source editing support)
      const layersData = {};
      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!getSkeletonData(layer)) continue;

        const skeletonData = getSkeletonData(layer);
        layersData[editLayerName] = {
          layer,
          original: JSON.parse(JSON.stringify(skeletonData)),
          working: JSON.parse(JSON.stringify(skeletonData)),
        };
      }

      if (Object.keys(layersData).length === 0) return;
      

      let accumulatedChanges = new ChangeCollector();

      // Drag loop
      for await (const event of eventStream) {
        const roundFunc = makeRoundFunc(event);
        const currentLocalPoint = sceneController.localPoint(event);
        const currentGlyphPoint = {
          x: currentLocalPoint.x - positionedGlyph.x,
          y: currentLocalPoint.y - positionedGlyph.y,
        };

        // Calculate new Tunni point position
        const delta = vector.subVectors(currentGlyphPoint, startGlyphPoint);
        const newTunniPoint = {
          x: origTunniPoint.x + delta.x,
          y: origTunniPoint.y + delta.y,
        };

        // Alt key disables equalized distances
        const equalizeDistances = !event.altKey;

        const allChanges = [];

        // Apply changes to ALL editable layers
        for (const [editLayerName, data] of Object.entries(layersData)) {
          const { layer, original, working } = data;

          // Reset working data to original
          const origContour = original.contours[contourIndex];
          const workContour = working.contours[contourIndex];
          for (let pi = 0; pi < origContour.points.length; pi++) {
            workContour.points[pi].x = origContour.points[pi].x;
            workContour.points[pi].y = origContour.points[pi].y;
          }

          // Build segment from original data (for this layer)
          const layerOriginalSegment = {
            startPoint: { ...origContour.points[segment.startIndex] },
            endPoint: { ...origContour.points[segment.endIndex] },
            controlPoints: segment.controlIndices.map((i) => ({
              ...origContour.points[i],
            })),
            startIndex: segment.startIndex,
            endIndex: segment.endIndex,
            controlIndices: segment.controlIndices,
          };

          if (isTrueTunni) {
            // True Tunni: move on-curve points
            const result = calculateSkeletonOnCurveFromTunni(
              newTunniPoint,
              layerOriginalSegment,
              equalizeDistances
            );

            if (result) {
              workContour.points[segment.startIndex].x = roundFunc(
                result.newStartPoint.x
              );
              workContour.points[segment.startIndex].y = roundFunc(
                result.newStartPoint.y
              );
              workContour.points[segment.endIndex].x = roundFunc(
                result.newEndPoint.x
              );
              workContour.points[segment.endIndex].y = roundFunc(
                result.newEndPoint.y
              );
            }
          } else {
            // Midpoint Tunni: move control points
            const newCps = calculateSkeletonControlPointsFromTunniDelta(
              delta,
              layerOriginalSegment,
              equalizeDistances
            );

            if (newCps) {
              const [cp1Idx, cp2Idx] = segment.controlIndices;
              workContour.points[cp1Idx].x = roundFunc(newCps[0].x);
              workContour.points[cp1Idx].y = roundFunc(newCps[0].y);
              workContour.points[cp2Idx].x = roundFunc(newCps[1].x);
              workContour.points[cp2Idx].y = roundFunc(newCps[1].y);
            }
          }

          // Record changes for this layer
          // 1. FIRST: Generate outline contours
          const staticGlyph = layer.glyph;
          const pathChange = recordChanges(staticGlyph, (sg) => {
            regenerateSkeletonContours(sg, working);
          });
          allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

          // 2. THEN: Save skeletonData to customData
          const customDataChange = recordChanges(layer, (l) => {
            setSkeletonData(l, JSON.parse(JSON.stringify(working)));
          });
          allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
        }

        const combinedChange = new ChangeCollector().concat(...allChanges);
        accumulatedChanges = accumulatedChanges.concat(combinedChange);
        await sendIncrementalChange(combinedChange.change, true);
      }

      // Final send without "may drop" flag
      await sendIncrementalChange(accumulatedChanges.change);

      return {
        changes: accumulatedChanges,
        undoLabel: isTrueTunni
          ? "Move Skeleton On-Curve Points (Tunni)"
          : "Move Skeleton Control Points (Tunni)",
        broadcast: true,
      };
    });
  }

  /**
   * Equalize tensions on a skeleton Tunni point (Ctrl+Shift+click).
   * Makes both control points have the same tension relative to the true Tunni point.
   */
  async _equalizeSkeletonTunniTensions(tunniHit) {
    const sceneController = this.sceneController;
    const { contourIndex, segment } = tunniHit;

    // Check if already equalized
    if (areSkeletonTensionsEqualized(segment)) {
      return; // Already equalized, nothing to do
    }

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      // Apply changes to ALL editable layers
      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!getSkeletonData(layer)) continue;

        const skeletonData = getSkeletonData(layer);
        const working = JSON.parse(JSON.stringify(skeletonData));
        const contour = working.contours[contourIndex];

        // Build segment from this layer's data
        const layerSegment = {
          startPoint: { ...contour.points[segment.startIndex] },
          endPoint: { ...contour.points[segment.endIndex] },
          controlPoints: segment.controlIndices.map((i) => ({
            ...contour.points[i],
          })),
          startIndex: segment.startIndex,
          endIndex: segment.endIndex,
          controlIndices: segment.controlIndices,
        };

        // Calculate equalized control points
        const newCps = calculateSkeletonEqualizedControlPoints(layerSegment);
        if (newCps) {
          const [cp1Idx, cp2Idx] = segment.controlIndices;
          contour.points[cp1Idx].x = Math.round(newCps[0].x);
          contour.points[cp1Idx].y = Math.round(newCps[0].y);
          contour.points[cp2Idx].x = Math.round(newCps[1].x);
          contour.points[cp2Idx].y = Math.round(newCps[1].y);
        }

        // Regenerate outline
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          regenerateSkeletonContours(sg, working);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        // Update customData
        const customDataChange = recordChanges(layer, (l) => {
          setSkeletonData(l, working);
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      const combinedChange = new ChangeCollector().concat(...allChanges);
      await sendIncrementalChange(combinedChange.change);

      return {
        changes: combinedChange,
        undoLabel: "Equalize Skeleton Tunni Tensions",
        broadcast: true,
      };
    });
  }

  /**
   * Equalize skeleton handles (X+click).
   * Makes the opposite off-curve handle the same length as the clicked one.
   * @param {number} contourIndex - Index of the contour
   * @param {number} pointIndex - Index of the clicked off-curve point
   * @param {Object} skeletonData - The skeleton data
   */
  async _equalizeSkeletonHandles(contourIndex, pointIndex, skeletonData) {
    const sceneController = this.sceneController;
    const contour = skeletonData.contours[contourIndex];
    const numPoints = contour.points.length;

    const equalizeInfo = this._getSkeletonHandleEqualizeInfo(contour, pointIndex);
    if (!equalizeInfo) {
      return; // No valid smooth point with opposite off-curve found
    }
    const { smoothIndex, oppositeIndex } = equalizeInfo;

    // Calculate the length of the clicked handle
    const clickedPoint = contour.points[pointIndex];
    const smoothPoint = contour.points[smoothIndex];
    const clickedLength = Math.hypot(
      clickedPoint.x - smoothPoint.x,
      clickedPoint.y - smoothPoint.y
    );

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      // Apply changes to ALL editable layers
      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!getSkeletonData(layer)) continue;

        const layerSkeletonData = getSkeletonData(layer);
        const working = JSON.parse(JSON.stringify(layerSkeletonData));
        const workingContour = working.contours[contourIndex];

        // Get this layer's points
        const layerClickedPt = workingContour.points[pointIndex];
        const layerSmoothPt = workingContour.points[smoothIndex];
        const layerOppositePt = workingContour.points[oppositeIndex];

        // Calculate this layer's clicked handle length
        const layerClickedLength = Math.hypot(
          layerClickedPt.x - layerSmoothPt.x,
          layerClickedPt.y - layerSmoothPt.y
        );

        // Calculate opposite handle direction
        const oppDirX = layerOppositePt.x - layerSmoothPt.x;
        const oppDirY = layerOppositePt.y - layerSmoothPt.y;
        const oppLength = Math.hypot(oppDirX, oppDirY);

        if (oppLength > 0.001) {
          // Normalize and scale to clicked length, round to UPM grid
          const scale = layerClickedLength / oppLength;
          workingContour.points[oppositeIndex].x = Math.round(layerSmoothPt.x + oppDirX * scale);
          workingContour.points[oppositeIndex].y = Math.round(layerSmoothPt.y + oppDirY * scale);
        }

        // Regenerate outline
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          regenerateSkeletonContours(sg, working);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        // Update customData
        const customDataChange = recordChanges(layer, (l) => {
          setSkeletonData(l, working);
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      const combinedChange = new ChangeCollector().concat(...allChanges);
      await sendIncrementalChange(combinedChange.change);

      return {
        changes: combinedChange,
        undoLabel: "Equalize Skeleton Handles",
        broadcast: true,
      };
    });
  }

  _getSkeletonHandleEqualizeInfo(contour, pointIndex) {
    if (!contour?.points?.length) {
      return null;
    }
    const numPoints = contour.points.length;

    // Find adjacent smooth point and opposite off-curve
    // Off-curve can be before or after a smooth point
    let smoothIndex = null;
    let oppositeIndex = null;

    const prevIndex = (pointIndex - 1 + numPoints) % numPoints;
    const nextIndex = (pointIndex + 1) % numPoints;
    const prevPoint = contour.points[prevIndex];
    const nextPoint = contour.points[nextIndex];

    // Check if prev is smooth (on-curve with smooth flag)
    if (!prevPoint?.type && prevPoint?.smooth) {
      // prevPoint is smooth on-curve, check if it has off-curve on the other side
      const prevPrevIndex = (prevIndex - 1 + numPoints) % numPoints;
      const prevPrevPoint = contour.points[prevPrevIndex];
      if (prevPrevPoint?.type === "cubic") {
        smoothIndex = prevIndex;
        oppositeIndex = prevPrevIndex;
      }
    }

    // Check if next is smooth (on-curve with smooth flag)
    if (smoothIndex === null && !nextPoint?.type && nextPoint?.smooth) {
      const nextNextIndex = (nextIndex + 1) % numPoints;
      const nextNextPoint = contour.points[nextNextIndex];
      if (nextNextPoint?.type === "cubic") {
        smoothIndex = nextIndex;
        oppositeIndex = nextNextIndex;
      }
    }

    if (smoothIndex === null || oppositeIndex === null) {
      return null;
    }

    return { smoothIndex, oppositeIndex };
  }

  async _handleArrowKeysForEqualizeSkeletonHandles(delta, skeletonPointSelection) {
    const sceneController = this.sceneController;
    const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return false;

    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, this.sceneModel);
    if (!skeletonData) return false;

    const offCurvePoints = [];
    for (const key of skeletonPointSelection) {
      const [contourIdx, pointIdx] = key.split("/").map(Number);
      const contour = skeletonData.contours[contourIdx];
      const point = contour?.points[pointIdx];
      if (point?.type === "cubic") {
        offCurvePoints.push({ contourIdx, pointIdx });
      }
    }

    if (offCurvePoints.length === 0) {
      return false;
    }

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!getSkeletonData(layer)) continue;

        const layerSkeletonData = getSkeletonData(layer);
        const working = JSON.parse(JSON.stringify(layerSkeletonData));
        let changed = false;

        for (const { contourIdx, pointIdx } of offCurvePoints) {
          const contour = working.contours[contourIdx];
          if (!contour) continue;
          const point = contour.points[pointIdx];
          if (!point || point.type !== "cubic") continue;

          point.x = Math.round(point.x + delta.x);
          point.y = Math.round(point.y + delta.y);

          const equalizeInfo = this._getSkeletonHandleEqualizeInfo(contour, pointIdx);
          if (!equalizeInfo) continue;
          const { smoothIndex, oppositeIndex } = equalizeInfo;

          const smoothPoint = contour.points[smoothIndex];
          const clickedPoint = contour.points[pointIdx];
          const oppPoint = contour.points[oppositeIndex];
          if (!smoothPoint || !clickedPoint || !oppPoint) continue;

          const clickedLength = Math.hypot(
            clickedPoint.x - smoothPoint.x,
            clickedPoint.y - smoothPoint.y
          );
          const oppDirX = oppPoint.x - smoothPoint.x;
          const oppDirY = oppPoint.y - smoothPoint.y;
          const oppLength = Math.hypot(oppDirX, oppDirY);

          if (oppLength > 0.001) {
            const scale = clickedLength / oppLength;
            oppPoint.x = Math.round(smoothPoint.x + oppDirX * scale);
            oppPoint.y = Math.round(smoothPoint.y + oppDirY * scale);
          }

          changed = true;
        }

        if (!changed) {
          continue;
        }

        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          regenerateSkeletonContours(sg, working, { preferInPlace: true });
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        const customDataChange = recordChanges(layer, (l) => {
          setSkeletonData(l, working);
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      if (allChanges.length === 0) return;

      const combined = new ChangeCollector().concat(...allChanges);
      await sendIncrementalChange(combined.change);

      return {
        changes: combined,
        undoLabel: "Nudge skeleton handles (equalize)",
        broadcast: true,
      };
    });

    return true;
  }

  async _handleArrowKeysForEqualizePathHandles(delta, pointSelection) {
    const sceneController = this.sceneController;
    const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph?.glyph?.path) return false;

    const basePath = positionedGlyph.glyph.path;
    const equalizeTargets = [];
    for (const pointIndex of pointSelection) {
      const info = this._getEqualizeHandleInfoForPointIndex(basePath, pointIndex);
      if (info) {
        equalizeTargets.push(info);
      }
    }

    if (equalizeTargets.length === 0) {
      return false;
    }

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.glyph?.path) continue;
        const path = layer.glyph.path;
        let changed = false;

        const pathChange = recordChanges(layer.glyph, (lg) => {
          for (const { pointIndex, smoothIndex, oppositeIndex } of equalizeTargets) {
            if (
              pointIndex >= path.numPoints ||
              smoothIndex >= path.numPoints ||
              oppositeIndex >= path.numPoints
            ) {
              continue;
            }

            const smoothPt = path.getPoint(smoothIndex);
            const draggedPt = path.getPoint(pointIndex);
            const oppositePt = path.getPoint(oppositeIndex);
            if (!smoothPt || !draggedPt || !oppositePt) {
              continue;
            }

            const newDragPos = {
              x: Math.round(draggedPt.x + delta.x),
              y: Math.round(draggedPt.y + delta.y),
            };
            const newDragVec = {
              x: newDragPos.x - smoothPt.x,
              y: newDragPos.y - smoothPt.y,
            };
            const newOppPos = {
              x: Math.round(smoothPt.x - newDragVec.x),
              y: Math.round(smoothPt.y - newDragVec.y),
            };

            lg.path.setPointPosition(pointIndex, newDragPos.x, newDragPos.y);
            lg.path.setPointPosition(oppositeIndex, newOppPos.x, newOppPos.y);
            changed = true;
          }
        });

        if (changed) {
          allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));
        }
      }

      if (allChanges.length === 0) return;

      const combined = new ChangeCollector().concat(...allChanges);
      await sendIncrementalChange(combined.change);

      return {
        changes: combined,
        undoLabel: "Nudge handles (equalize)",
        broadcast: true,
      };
    });

    return true;
  }

  /**
   * Handle X+drag for equalizing skeleton handles in real-time.
   * The opposite handle mirrors the dragged handle's length while maintaining its direction.
   */
  async _handleEqualizeHandlesDrag(
    eventStream,
    initialEvent,
    contourIndex,
    pointIndex,
    skeletonData,
    positionedGlyph
  ) {
    const sceneController = this.sceneController;
    const contour = skeletonData.contours[contourIndex];
    const numPoints = contour.points.length;

    // Find adjacent smooth point and opposite off-curve
    let smoothIndex = null;
    let oppositeIndex = null;

    const prevIndex = (pointIndex - 1 + numPoints) % numPoints;
    const nextIndex = (pointIndex + 1) % numPoints;
    const prevPoint = contour.points[prevIndex];
    const nextPoint = contour.points[nextIndex];

    // Check if prev is smooth (on-curve with smooth flag)
    if (!prevPoint?.type && prevPoint?.smooth) {
      const prevPrevIndex = (prevIndex - 1 + numPoints) % numPoints;
      const prevPrevPoint = contour.points[prevPrevIndex];
      if (prevPrevPoint?.type === "cubic") {
        smoothIndex = prevIndex;
        oppositeIndex = prevPrevIndex;
      }
    }

    // Check if next is smooth (on-curve with smooth flag)
    if (smoothIndex === null && !nextPoint?.type && nextPoint?.smooth) {
      const nextNextIndex = (nextIndex + 1) % numPoints;
      const nextNextPoint = contour.points[nextNextIndex];
      if (nextNextPoint?.type === "cubic") {
        smoothIndex = nextIndex;
        oppositeIndex = nextNextIndex;
      }
    }

    if (smoothIndex === null || oppositeIndex === null) {
      return; // No valid smooth point with opposite off-curve found
    }

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      // Setup data for ALL editable layers
      const layersData = {};
      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!getSkeletonData(layer)) continue;

        const layerSkeletonData = getSkeletonData(layer);
        layersData[editLayerName] = {
          layer,
          original: JSON.parse(JSON.stringify(layerSkeletonData)),
          working: JSON.parse(JSON.stringify(layerSkeletonData)),
        };
      }

      if (Object.keys(layersData).length === 0) return;
      

      let accumulatedChanges = new ChangeCollector();

      // Drag loop
      for await (const event of eventStream) {
        const roundFunc = makeRoundFunc(event);
        const currentLocalPoint = sceneController.localPoint(event);
        const currentGlyphPoint = {
          x: currentLocalPoint.x - positionedGlyph.x,
          y: currentLocalPoint.y - positionedGlyph.y,
        };

        const allChanges = [];

        // Apply changes to ALL editable layers
        for (const [editLayerName, data] of Object.entries(layersData)) {
          const { layer, original, working } = data;

          // Reset working data to original
          const origContour = original.contours[contourIndex];
          const workContour = working.contours[contourIndex];
          for (let pi = 0; pi < origContour.points.length; pi++) {
            workContour.points[pi].x = origContour.points[pi].x;
            workContour.points[pi].y = origContour.points[pi].y;
          }

          // Get smooth point position (stays fixed)
          const smoothPt = workContour.points[smoothIndex];

          // The dragged handle follows the cursor freely
          let newDragVec = {
            x: currentGlyphPoint.x - smoothPt.x,
            y: currentGlyphPoint.y - smoothPt.y,
          };

          // Shift constrains to horizontal/vertical/45-degree
          if (event.shiftKey) {
            newDragVec = constrainHorVerDiag(newDragVec);
          }

          const newDragLen = Math.hypot(newDragVec.x, newDragVec.y);

          // Minimum length of 1
          if (newDragLen < 1) {
            continue;
          }

          // Update dragged point, round to UPM grid
          workContour.points[pointIndex].x = roundFunc(smoothPt.x + newDragVec.x);
          workContour.points[pointIndex].y = roundFunc(smoothPt.y + newDragVec.y);

          // Update opposite point: same length, opposite direction, round to UPM grid
          workContour.points[oppositeIndex].x = roundFunc(smoothPt.x - newDragVec.x);
          workContour.points[oppositeIndex].y = roundFunc(smoothPt.y - newDragVec.y);

          // Record changes for this layer
          const staticGlyph = layer.glyph;
          const pathChange = recordChanges(staticGlyph, (sg) => {
            regenerateSkeletonContours(sg, working);
          });
          allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

          const customDataChange = recordChanges(layer, (l) => {
            setSkeletonData(l, JSON.parse(JSON.stringify(working)));
          });
          allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
        }

        const combinedChange = new ChangeCollector().concat(...allChanges);
        accumulatedChanges = accumulatedChanges.concat(combinedChange);
        await sendIncrementalChange(combinedChange.change, true);
      }

      // Final send without "may drop" flag
      await sendIncrementalChange(accumulatedChanges.change);

      return {
        changes: accumulatedChanges,
        undoLabel: "Equalize Skeleton Handles",
        broadcast: true,
      };
    });
  }

  /**
   * Handle X+drag for equalizing regular (non-skeleton) handles.
   * The opposite handle mirrors the dragged handle's length while maintaining direction.
   */
  async _handleEqualizeHandlesDragForPath(
    eventStream,
    initialEvent,
    handleInfo,
    positionedGlyph
  ) {
    const sceneController = this.sceneController;
    const { pointIndex, smoothIndex, oppositeIndex } = handleInfo;

    if (!positionedGlyph) return;

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const layersData = {};
      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.glyph?.path) continue;
        layersData[editLayerName] = { layer };
      }

      if (Object.keys(layersData).length === 0) return;

      let accumulatedChanges = new ChangeCollector();

      for await (const event of eventStream) {
        const currentLocalPoint = sceneController.localPoint(event);
        const currentGlyphPoint = {
          x: currentLocalPoint.x - positionedGlyph.x,
          y: currentLocalPoint.y - positionedGlyph.y,
        };

        const allChanges = [];

        for (const [editLayerName, data] of Object.entries(layersData)) {
          const { layer } = data;
          const path = layer.glyph.path;
          const smoothPt = path.getPoint(smoothIndex);
          if (!smoothPt) continue;

          let newDragVec = {
            x: currentGlyphPoint.x - smoothPt.x,
            y: currentGlyphPoint.y - smoothPt.y,
          };

          if (event.shiftKey) {
            newDragVec = constrainHorVerDiag(newDragVec);
          }

          const newDragLen = Math.hypot(newDragVec.x, newDragVec.y);
          if (newDragLen < 1) {
            continue;
          }

          const newDragPos = {
            x: Math.round(smoothPt.x + newDragVec.x),
            y: Math.round(smoothPt.y + newDragVec.y),
          };
          const newOppPos = {
            x: Math.round(smoothPt.x - newDragVec.x),
            y: Math.round(smoothPt.y - newDragVec.y),
          };

          const pathChange = recordChanges(layer.glyph, (lg) => {
            lg.path.setPointPosition(pointIndex, newDragPos.x, newDragPos.y);
            lg.path.setPointPosition(oppositeIndex, newOppPos.x, newOppPos.y);
          });
          allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));
        }

        if (allChanges.length === 0) continue;

        const combinedChange = new ChangeCollector().concat(...allChanges);
        accumulatedChanges = accumulatedChanges.concat(combinedChange);
        await sendIncrementalChange(combinedChange.change, true);
      }

      await sendIncrementalChange(accumulatedChanges.change);

      return {
        changes: accumulatedChanges,
        undoLabel: "Equalize Handles",
        broadcast: true,
      };
    });
  }

  /**
   * Find equalizable handle under cursor in regular path.
   * Returns { pointIndex, smoothIndex, oppositeIndex } or null.
   */
  _findEqualizeHandleForPath(point, size) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph?.glyph?.path) {
      return null;
    }

    const glyphPoint = {
      x: point.x - positionedGlyph.x,
      y: point.y - positionedGlyph.y,
    };

    const path = positionedGlyph.glyph.path;
    const pointIndex = path.pointIndexNearPoint(glyphPoint, size);
    if (pointIndex === undefined) return null;

    return this._getEqualizeHandleInfoForPointIndex(path, pointIndex);
  }

  _getEqualizeHandleInfoForPointIndex(path, pointIndex) {
    if (!path || pointIndex === undefined || pointIndex < 0) {
      return null;
    }

    const pointType = path.pointTypes[pointIndex];
    const pointTypeBase = pointType & VarPackedPath.POINT_TYPE_MASK;
    const isOnCurve = pointTypeBase === VarPackedPath.ON_CURVE;
    if (isOnCurve || pointTypeBase !== VarPackedPath.OFF_CURVE_CUBIC) {
      return null;
    }

    const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(pointIndex);
    const numContourPoints = path.getNumPointsOfContour(contourIndex);
    const contourStart = pointIndex - contourPointIndex;
    const contourEnd = contourStart + numContourPoints; // exclusive

    const getPrevIdx = (idx) => (idx > contourStart ? idx - 1 : contourEnd - 1);
    const getNextIdx = (idx) => (idx < contourEnd - 1 ? idx + 1 : contourStart);

    const prevIdx = getPrevIdx(pointIndex);
    const nextIdx = getNextIdx(pointIndex);

    const prevType = path.pointTypes[prevIdx] & VarPackedPath.POINT_TYPE_MASK;
    const nextType = path.pointTypes[nextIdx] & VarPackedPath.POINT_TYPE_MASK;
    const prevIsOnCurve = prevType === VarPackedPath.ON_CURVE;
    const nextIsOnCurve = nextType === VarPackedPath.ON_CURVE;

    let smoothIndex = null;
    let oppositeIndex = null;

    if (prevIsOnCurve) {
      const prevIsSmooth = (path.pointTypes[prevIdx] & VarPackedPath.SMOOTH_FLAG) !== 0;
      const oppositeIdx = getPrevIdx(prevIdx);
      const oppositeType = path.pointTypes[oppositeIdx] & VarPackedPath.POINT_TYPE_MASK;
      if (prevIsSmooth && oppositeType === VarPackedPath.OFF_CURVE_CUBIC) {
        smoothIndex = prevIdx;
        oppositeIndex = oppositeIdx;
      }
    }

    if (smoothIndex === null && nextIsOnCurve) {
      const nextIsSmooth = (path.pointTypes[nextIdx] & VarPackedPath.SMOOTH_FLAG) !== 0;
      const oppositeIdx = getNextIdx(nextIdx);
      const oppositeType = path.pointTypes[oppositeIdx] & VarPackedPath.POINT_TYPE_MASK;
      if (nextIsSmooth && oppositeType === VarPackedPath.OFF_CURVE_CUBIC) {
        smoothIndex = nextIdx;
        oppositeIndex = oppositeIdx;
      }
    }

    if (smoothIndex === null || oppositeIndex === null) {
      return null;
    }

    return { pointIndex, smoothIndex, oppositeIndex };
  }

  /**
   * Equalize skeleton handles for all selected off-curve points (X+arrows).
   * @param {Set} skeletonPointSelection - Set of selected skeleton point keys
   */
  async _equalizeSelectedSkeletonHandles(skeletonPointSelection) {
    const sceneController = this.sceneController;
    const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return;

    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, this.sceneModel);
    if (!skeletonData) return;

    // Collect all off-curve points from selection
    const offCurvePoints = [];
    for (const key of skeletonPointSelection) {
      const [contourIdx, pointIdx] = key.split("/").map(Number);
      const contour = skeletonData.contours[contourIdx];
      const point = contour?.points[pointIdx];
      if (point?.type === "cubic") {
        offCurvePoints.push({ contourIdx, pointIdx });
      }
    }

    if (offCurvePoints.length === 0) return;

    // Process each off-curve point
    for (const { contourIdx, pointIdx } of offCurvePoints) {
      await this._equalizeSkeletonHandles(contourIdx, pointIdx, skeletonData);
      // Re-fetch skeleton data after each change (it gets updated)
      const newPositionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (newPositionedGlyph) {
        const newSkeletonData = getSkeletonDataFromGlyph(newPositionedGlyph, this.sceneModel);
        if (newSkeletonData) {
          Object.assign(skeletonData, newSkeletonData);
        }
      }
    }
  }

  /**
   * Handle bounding box transforms (scale/rotate) for skeleton points only.
   */
  async _handleSkeletonBoundsTransform(selection, eventStream, initialEvent, rotation) {
    const sceneController = this.sceneController;
    const { skeletonPoint: skeletonPointSelection } = parseSelection(selection);

    if (!skeletonPointSelection?.size) return;

    const clickedHandle = sceneController.sceneModel.clickedTransformSelectionHandle;

    // Calculate origin (opposite corner from clicked handle)
    const [handlePositionY, handlePositionX] = clickedHandle.split("-");
    const origin = { x: handlePositionX, y: handlePositionY };
    if (handlePositionX === "left") origin.x = "right";
    else if (handlePositionX === "right") origin.x = "left";
    if (handlePositionY === "top") origin.y = "bottom";
    else if (handlePositionY === "bottom") origin.y = "top";

    const fixDragLeftValue = clickedHandle.includes("left") ? -1 : 1;
    const fixDragBottomValue = clickedHandle.includes("bottom") ? -1 : 1;

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const editLayerName = sceneController.editingLayerNames?.[0];
      if (!editLayerName || !glyph.layers[editLayerName]) return;

      const layer = glyph.layers[editLayerName];
      const originalSkeletonData = getSkeletonData(layer);
      if (!originalSkeletonData) return;

      const layerGlyph = layer.glyph;

      // Calculate bounds and pin point
      const bounds = getSkeletonSelectionBounds(selection, originalSkeletonData);
      if (!bounds) return;

      const pinPoint = getPinPoint(bounds, origin.x, origin.y);
      const selectionWidth = bounds.xMax - bounds.xMin;
      const selectionHeight = bounds.yMax - bounds.yMin;

      const initialPoint = sceneController.selectedGlyphPoint(initialEvent);

      // For rotation, we need a consistent pin point
      const rotationPinPoint = getPinPoint(bounds, origin.x, origin.y);
      const altRotationPinPoint = getPinPoint(bounds, undefined, undefined);

      let accumulatedChanges = new ChangeCollector();

      for await (const event of eventStream) {
        const currentPoint = sceneController.selectedGlyphPoint(event);

        // Calculate transformation
        let transformation;
        if (rotation) {
          sceneController.sceneModel.showTransformSelection = false;
          const usePinPoint = event.altKey ? altRotationPinPoint : rotationPinPoint;
          const angle = Math.atan2(
            usePinPoint.y - currentPoint.y,
            usePinPoint.x - currentPoint.x
          );
          const angleInitial = Math.atan2(
            usePinPoint.y - initialPoint.y,
            usePinPoint.x - initialPoint.x
          );
          const rotationAngle = !event.shiftKey
            ? angle - angleInitial
            : Math.round((angle - angleInitial) / (Math.PI / 4)) * (Math.PI / 4);
          transformation = new Transform().rotate(rotationAngle);
        } else {
          // Scale
          const delta = {
            x: (currentPoint.x - initialPoint.x) * fixDragLeftValue,
            y: (currentPoint.y - initialPoint.y) * fixDragBottomValue,
          };

          let scaleX = selectionWidth > 0 ? (selectionWidth + delta.x) / selectionWidth : 1;
          let scaleY = selectionHeight > 0 ? (selectionHeight + delta.y) / selectionHeight : 1;

          if (clickedHandle.includes("middle")) {
            scaleY = event.shiftKey ? scaleX : 1;
          } else if (clickedHandle.includes("center")) {
            scaleX = event.shiftKey ? scaleY : 1;
          } else if (event.shiftKey) {
            scaleX = scaleY = Math.max(scaleX, scaleY);
          }
          transformation = new Transform().scale(scaleX, scaleY);
        }

        const usePinPoint = event.altKey
          ? getPinPoint(bounds, undefined, undefined)
          : pinPoint;

        const pinnedTransformation = new Transform()
          .translate(usePinPoint.x, usePinPoint.y)
          .transform(transformation)
          .translate(-usePinPoint.x, -usePinPoint.y);

        // Deep clone original skeleton data and apply transform
        const workingSkeletonData = JSON.parse(JSON.stringify(originalSkeletonData));
        transformSkeletonPoints(workingSkeletonData, skeletonPointSelection, pinnedTransformation);

        // Regenerate outline
        const regenerateOutline = (staticGlyph, skelData) => {
          regenerateSkeletonContours(staticGlyph, skelData);
        };

        // Record changes
        const changes = [];

        const pathChange = recordChanges(layerGlyph, (sg) => {
          regenerateSkeletonContours(sg, workingSkeletonData);
        });
        changes.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        const customDataChange = recordChanges(layer, (l) => {
          setSkeletonData(l, workingSkeletonData);
        });
        changes.push(customDataChange.prefixed(["layers", editLayerName]));

        const combinedChange = new ChangeCollector().concat(...changes);
        accumulatedChanges = accumulatedChanges.concat(combinedChange);
        await sendIncrementalChange(combinedChange.change, true);
      }

      // Final send without "may drop" flag
      await sendIncrementalChange(accumulatedChanges.change);

      return {
        changes: accumulatedChanges,
        undoLabel: rotation
          ? translate("edit-tools-pointer.undo.rotate-skeleton")
          : translate("edit-tools-pointer.undo.scale-skeleton"),
        broadcast: true,
      };
    });
  }

  async handleBoundsTransformSelection(
    selection,
    eventStream,
    initialEvent,
    rotation = false
  ) {
    const sceneController = this.sceneController;

    // Check selection type - skeleton transforms are handled separately
    const selectionType = getSelectionType(selection);
    if (selectionType === "mixed") {
      // Should not happen (no bounding box for mixed), but safety check
      return;
    }
    if (selectionType === "skeleton") {
      await this._handleSkeletonBoundsTransform(
        selection,
        eventStream,
        initialEvent,
        rotation
      );
      return;
    }

    const clickedHandle = sceneController.sceneModel.clickedTransformSelectionHandle;

    // The following may seem wrong, but it's correct, because we say
    // for example bottom-left and not left-bottom. Y-X order.
    const [handlePositionY, handlePositionX] = clickedHandle.split("-");

    const origin = { x: handlePositionX, y: handlePositionY };
    // origin must be the opposite side of where we have our mouse
    if (handlePositionX === "left") {
      origin.x = "right";
    } else if (handlePositionX === "right") {
      origin.x = "left";
    }
    if (handlePositionY === "top") {
      origin.y = "bottom";
    } else if (handlePositionY === "bottom") {
      origin.y = "top";
    }
    // no else because could be middle or center

    // must be set to the opposite side of the mouse if left or bottom
    const fixDragLeftValue = clickedHandle.includes("left") ? -1 : 1;
    const fixDragBottomValue = clickedHandle.includes("bottom") ? -1 : 1;

    const glyphController =
      await sceneController.sceneModel.getSelectedStaticGlyphController();

    // The following is only needed in case of rotation, because we want to have
    // the roation angle for all layers the same and not different.
    let regularPinPointSelectedLayer, altPinPointSelectedLayer;
    if (rotation) {
      const selectedLayerBounds = glyphController.getSelectionBounds(
        selection,
        this.editor.fontController.getBackgroundImageBoundsFunc
      );
      regularPinPointSelectedLayer = getPinPoint(
        selectedLayerBounds,
        origin.x,
        origin.y
      );
      altPinPointSelectedLayer = getPinPoint(selectedLayerBounds, undefined, undefined);
    }

    const staticGlyphControllers = await sceneController.getStaticGlyphControllers();

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const initialPoint = sceneController.selectedGlyphPoint(initialEvent);

      const layerInfo = Object.entries(
        sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      ).map(([layerName, layerGlyph]) => {
        const behaviorFactory = new EditBehaviorFactory(
          layerGlyph,
          sceneController.selection,
          this.scalingEditBehavior
        );
        const layerBounds = (
          staticGlyphControllers[layerName] || glyphController
        ).getSelectionBounds(
          selection,
          this.editor.fontController.getBackgroundImageBoundsFunc
        );

        return {
          layerName,
          changePath: ["layers", layerName, "glyph"],
          layerGlyph: layerGlyph,
          editBehavior: behaviorFactory.getTransformBehavior("default"),
          regularPinPoint: getPinPoint(layerBounds, origin.x, origin.y),
          altPinPoint: getPinPoint(layerBounds, undefined, undefined),
          regularPinPointSelectedLayer: regularPinPointSelectedLayer,
          altPinPointSelectedLayer: altPinPointSelectedLayer,
          selectionWidth: layerBounds.xMax - layerBounds.xMin,
          selectionHeight: layerBounds.yMax - layerBounds.yMin,
        };
      });

      let editChange;
      for await (const event of eventStream) {
        const currentPoint = sceneController.selectedGlyphPoint(event);

        const deepEditChanges = [];
        for (const layer of layerInfo) {
          const layerGlyph = layer.layerGlyph;
          const pinPoint = event.altKey ? layer.altPinPoint : layer.regularPinPoint;
          let transformation;
          if (rotation) {
            // Rotate (based on pinPoint of selected layer)
            this.sceneController.sceneModel.showTransformSelection = false;
            const pinPointSelectedLayer = event.altKey
              ? layer.altPinPointSelectedLayer
              : layer.regularPinPointSelectedLayer;
            const angle = Math.atan2(
              pinPointSelectedLayer.y - currentPoint.y,
              pinPointSelectedLayer.x - currentPoint.x
            );
            const angleInitial = Math.atan2(
              pinPointSelectedLayer.y - initialPoint.y,
              pinPointSelectedLayer.x - initialPoint.x
            );
            // Snap to 45 degrees by rounding to the nearest 45 degree angle if shift is pressed
            const rotationAngle = !event.shiftKey
              ? angle - angleInitial
              : Math.round((angle - angleInitial) / (Math.PI / 4)) * (Math.PI / 4);
            transformation = new Transform().rotate(rotationAngle);
          } else {
            // Scale (based on pinPoint)
            const delta = {
              x: (currentPoint.x - initialPoint.x) * fixDragLeftValue,
              y: (currentPoint.y - initialPoint.y) * fixDragBottomValue,
            };

            let scaleX = (layer.selectionWidth + delta.x) / layer.selectionWidth;
            let scaleY = (layer.selectionHeight + delta.y) / layer.selectionHeight;

            if (clickedHandle.includes("middle")) {
              scaleY = event.shiftKey ? scaleX : 1;
            } else if (clickedHandle.includes("center")) {
              scaleX = event.shiftKey ? scaleY : 1;
            } else if (event.shiftKey) {
              scaleX = scaleY = Math.max(scaleX, scaleY);
            }
            transformation = new Transform().scale(scaleX, scaleY);
          }

          const pinnedTransformation = new Transform()
            .translate(pinPoint.x, pinPoint.y)
            .transform(transformation)
            .translate(-pinPoint.x, -pinPoint.y);

          const editChange =
            layer.editBehavior.makeChangeForTransformation(pinnedTransformation);

          applyChange(layerGlyph, editChange);
          deepEditChanges.push(consolidateChanges(editChange, layer.changePath));
        }

        editChange = consolidateChanges(deepEditChanges);
        await sendIncrementalChange(editChange, true); // true: "may drop"
      }

      let changes = ChangeCollector.fromChanges(
        editChange,
        consolidateChanges(
          layerInfo.map((layer) =>
            consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
          )
        )
      );

      return {
        undoLabel: rotation
          ? translate("edit-tools-pointer.undo.rotate-selection")
          : translate("edit-tools-pointer.undo.resize-selection"),
        changes: changes,
        broadcast: true,
      };
    });
  }

  getRotationHandle(event, selection) {
    return this.getTransformSelectionHandle(event, selection, true);
  }

  getResizeHandle(event, selection) {
    return this.getTransformSelectionHandle(event, selection);
  }

  getTransformSelectionHandle(event, selection, rotation = false) {
    if (!this.editor.visualizationLayersSettings.model["fontra.transform.selection"]) {
      return undefined;
    }
    if (!selection.size) {
      return undefined;
    }
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    const glyph = positionedGlyph?.glyph;
    if (!glyph) {
      return undefined;
    }

    // Get skeleton data for bounds calculation
    const layer = positionedGlyph?.varGlyph?.glyph?.layers?.[
      this.sceneController.editingLayerNames?.[0]
    ];
    const skeletonData = getSkeletonData(layer);

    const bounds = getTransformSelectionBounds(
      glyph,
      selection,
      this.editor.fontController.getBackgroundImageBoundsFunc,
      skeletonData
    );
    // bounds can be undefined if for example only one point is selected or mixed selection
    if (!bounds) {
      return undefined;
    }

    const handleSize =
      transformHandleSize * this.editor.visualizationLayers.scaleFactor;
    const handleMargin =
      transformHandleMargin * this.editor.visualizationLayers.scaleFactor;

    const point = this.sceneController.selectedGlyphPoint(event);
    const resizeHandles = getTransformHandles(bounds, handleMargin + handleSize / 2);
    const rotationHandles = rotation
      ? getTransformHandles(
          bounds,
          handleMargin + (handleSize * rotationHandleSizeFactor) / 2 + handleSize / 2
        )
      : {};
    for (const [handleName, handle] of Object.entries(resizeHandles)) {
      const inCircle = pointInCircleHandle(point, handle, handleSize);
      if (rotation) {
        const inSquare = pointInSquareHandle(
          point,
          rotationHandles[handleName],
          handleSize * rotationHandleSizeFactor
        );
        if (inSquare && !inCircle) {
          return handleName;
        }
      } else {
        if (inCircle) {
          return handleName;
        }
      }
    }
    return undefined;
  }

  /**
   * Hit test skeleton rib points (width control points).
   * Returns { contourIndex, pointIndex, side, point, normal, onCurvePoint } if hit, null otherwise.
   */
  _hitTestRibPoints(event) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph?.glyph?.canEdit) {
      return null;
    }

    const varGlyph = positionedGlyph.varGlyph;
    if (!varGlyph?.glyph?.layers) {
      return null;
    }

    const editLayerName = this.sceneController.editingLayerNames?.[0];
    if (!editLayerName) {
      return null;
    }

    const layer = varGlyph.glyph.layers[editLayerName];
    if (!layer) {
      return null;
    }

    const skeletonData = getSkeletonData(layer);
    if (!skeletonData?.contours?.length) {
      return null;
    }

    const localPoint = this.sceneController.localPoint(event);
    const glyphPoint = {
      x: localPoint.x - positionedGlyph.x,
      y: localPoint.y - positionedGlyph.y,
    };

    const margin = this.sceneController.mouseClickMargin;

    for (let contourIndex = 0; contourIndex < skeletonData.contours.length; contourIndex++) {
      const contour = skeletonData.contours[contourIndex];
      const defaultWidth = contour.defaultWidth ?? DEFAULT_SKELETON_WIDTH;

      for (let pointIndex = 0; pointIndex < contour.points.length; pointIndex++) {
        const skeletonPoint = contour.points[pointIndex];

        // Only test on-curve points
        if (skeletonPoint.type) continue;

        const normal = calculateNormalAtSkeletonPoint(contour, pointIndex);
        const leftHW = getPointHalfWidth(skeletonPoint, defaultWidth, "left");
        const rightHW = getPointHalfWidth(skeletonPoint, defaultWidth, "right");

        // Per-side editable flags
        const isLeftEditable = skeletonPoint.leftEditable === true;
        const isRightEditable = skeletonPoint.rightEditable === true;

        // Calculate nudge offsets (only if editable, to match generator behavior)
        const leftNudgeKey = getRibNudgeKey("left");
        const rightNudgeKey = getRibNudgeKey("right");
        const leftNudge = (isLeftEditable && leftHW >= 0.5) ? (skeletonPoint[leftNudgeKey] || 0) : 0;
        const rightNudge = (isRightEditable && rightHW >= 0.5) ? (skeletonPoint[rightNudgeKey] || 0) : 0;

        const singleSided = contour.singleSided ?? false;
        const singleSidedDirection = contour.singleSidedDirection ?? "left";

        if (singleSided) {
          // Single-sided: one rib point at total width on the chosen side
          const totalWidth = leftHW + rightHW;
          const side = singleSidedDirection;
          const sign = side === "left" ? 1 : -1;
          const canNudge = totalWidth >= 0.5;
          const nudgeKey = getRibNudgeKey(side);
          const canApplyNudge = side === "left" ? isLeftEditable : isRightEditable;
          const nudge = (canApplyNudge && canNudge) ? (skeletonPoint[nudgeKey] || 0) : 0;
          const ribPoint = projectRibPoint(
            skeletonPoint,
            normal,
            totalWidth,
            side,
            nudge
          );
          const dist = vector.distance(glyphPoint, ribPoint);
          if (dist <= margin) {
            return {
              contourIndex,
              pointIndex,
              side,
              point: ribPoint,
              normal,
              onCurvePoint: skeletonPoint,
            };
          }
        } else {
          // Normal mode: two rib points (including nudge offset if editable)
          const leftRibPoint = projectRibPoint(
            skeletonPoint,
            normal,
            leftHW,
            "left",
            leftNudge
          );
          const rightRibPoint = projectRibPoint(
            skeletonPoint,
            normal,
            rightHW,
            "right",
            rightNudge
          );

          const leftDist = vector.distance(glyphPoint, leftRibPoint);
          if (leftDist <= margin) {
            return {
              contourIndex,
              pointIndex,
              side: "left",
              point: leftRibPoint,
              normal,
              onCurvePoint: skeletonPoint,
            };
          }

          const rightDist = vector.distance(glyphPoint, rightRibPoint);
          if (rightDist <= margin) {
            return {
              contourIndex,
              pointIndex,
              side: "right",
              point: rightRibPoint,
              normal,
              onCurvePoint: skeletonPoint,
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Find rib endpoint under cursor for measure mode.
   * Returns { x, y, width, leftWidth, rightWidth } or null.
   */
  _findRibPointForMeasure(point, size) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph?.varGlyph?.glyph?.layers) return null;

    const glyphPoint = {
      x: point.x - positionedGlyph.x,
      y: point.y - positionedGlyph.y,
    };

    const editLayerName = this.sceneController.editingLayerNames?.[0];
    if (!editLayerName) return null;

    const layer = positionedGlyph.varGlyph.glyph.layers[editLayerName];
    const skeletonData = getSkeletonData(layer);
    if (!skeletonData?.contours?.length) return null;

    const defaultWidth = skeletonData.defaultWidth ?? 100;

    for (const contour of skeletonData.contours) {
      const contourDefaultWidth = contour.defaultWidth ?? defaultWidth;
      const singleSided = contour.singleSided ?? false;
      const singleSidedDirection = contour.singleSidedDirection ?? "left";

      for (let pointIndex = 0; pointIndex < contour.points.length; pointIndex++) {
        const skeletonPoint = contour.points[pointIndex];
        if (skeletonPoint.type) continue; // Skip control points

        const normal = calculateNormalAtSkeletonPoint(contour, pointIndex);
        let leftHW = getPointHalfWidth(skeletonPoint, contourDefaultWidth, "left");
        let rightHW = getPointHalfWidth(skeletonPoint, contourDefaultWidth, "right");

        // Handle single-sided mode
        if (singleSided) {
          const totalWidth = leftHW + rightHW;
          if (singleSidedDirection === "left") {
            leftHW = totalWidth;
            rightHW = 0;
          } else {
            leftHW = 0;
            rightHW = totalWidth;
          }
        }

        // Apply nudge offset for editable points
        const isLeftEditable = skeletonPoint.leftEditable === true;
        const isRightEditable = skeletonPoint.rightEditable === true;
        const leftNudgeKey = getRibNudgeKey("left");
        const rightNudgeKey = getRibNudgeKey("right");
        const leftNudge = (isLeftEditable && leftHW >= 0.5) ? (skeletonPoint[leftNudgeKey] || 0) : 0;
        const rightNudge = (isRightEditable && rightHW >= 0.5) ? (skeletonPoint[rightNudgeKey] || 0) : 0;

        // Calculate rib endpoint positions (including nudge)
        const leftRibPoint = projectRibPoint(
          skeletonPoint,
          normal,
          leftHW,
          "left",
          leftNudge
        );
        const rightRibPoint = projectRibPoint(
          skeletonPoint,
          normal,
          rightHW,
          "right",
          rightNudge
        );

        // Check left rib point
        if (leftHW > 0.5) {
          const dist = Math.hypot(leftRibPoint.x - glyphPoint.x, leftRibPoint.y - glyphPoint.y);
          if (dist <= size) {
            return {
              x: leftRibPoint.x,
              y: leftRibPoint.y,
              width: leftHW + rightHW,
              leftWidth: leftHW,
              rightWidth: rightHW,
            };
          }
        }

        // Check right rib point
        if (rightHW > 0.5) {
          const dist = Math.hypot(rightRibPoint.x - glyphPoint.x, rightRibPoint.y - glyphPoint.y);
          if (dist <= size) {
            return {
              x: rightRibPoint.x,
              y: rightRibPoint.y,
              width: leftHW + rightHW,
              leftWidth: leftHW,
              rightWidth: rightHW,
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Compare two rib point objects for equality.
   */
  _ribPointsEqual(rp1, rp2) {
    if (rp1 === rp2) return true;
    if (!rp1 || !rp2) return false;
    return rp1.x === rp2.x && rp1.y === rp2.y;
  }

  /**
   * Compare two measure points objects for equality.
   */
  _measurePointsEqual(mp1, mp2) {
    if (mp1 === mp2) return true;
    if (!mp1 || !mp2) return false;
    const tension1 = mp1.tensionContext;
    const tension2 = mp2.tensionContext;
    const sameTensionContext =
      (!tension1 && !tension2) ||
      (tension1 &&
        tension2 &&
        tension1.hoveredHandleSide === tension2.hoveredHandleSide &&
        JSON.stringify(tension1.segmentPoints) === JSON.stringify(tension2.segmentPoints));
    return (
      mp1.type === mp2.type &&
      mp1.p1?.x === mp2.p1?.x &&
      mp1.p1?.y === mp2.p1?.y &&
      mp1.p2?.x === mp2.p2?.x &&
      mp1.p2?.y === mp2.p2?.y &&
      sameTensionContext
    );
  }

  /**
   * Find control point (off-curve) under cursor for measure mode.
   * Returns { p1, p2, type, tensionContext? } where:
   * - p1 is control point
   * - p2 is its on-curve anchor
   * - tensionContext stores canonical cubic segment data for stable tension
   *   calculation: { segmentPoints: [p1,p2,p3,p4], hoveredHandleSide }.
   */
  _findControlPointForMeasure(point, size) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph?.glyph?.path) {
      return null;
    }

    const glyphPoint = {
      x: point.x - positionedGlyph.x,
      y: point.y - positionedGlyph.y,
    };

    // Check skeleton control points first
    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, this.sceneModel);
    if (skeletonData?.contours?.length) {
      for (let contourIdx = 0; contourIdx < skeletonData.contours.length; contourIdx++) {
        const contour = skeletonData.contours[contourIdx];
        const points = contour.points || [];
        const numPoints = points.length;
        const getPointAt = (idx) => {
          if (contour.isClosed) {
            return points[(idx + numPoints) % numPoints];
          }
          return idx >= 0 && idx < numPoints ? points[idx] : null;
        };
        for (let pointIdx = 0; pointIdx < points.length; pointIdx++) {
          const sp = points[pointIdx];
          if (!sp?.type) continue; // only off-curve
          const dist = vector.distance(glyphPoint, sp);
          if (dist > size) continue;

          const prevPoint = getPointAt(pointIdx - 1);
          const nextPoint = getPointAt(pointIdx + 1);
          const anchor = !prevPoint?.type ? prevPoint : (!nextPoint?.type ? nextPoint : null);
          if (!anchor) continue;

          return {
            p1: { x: sp.x, y: sp.y },
            p2: { x: anchor.x, y: anchor.y },
            tensionContext: this._buildSkeletonTensionContext(contour, pointIdx),
            type: "skeleton",
          };
        }
      }
    }

    // Check regular path control points (including generated handles)
    const path = positionedGlyph.glyph.path;
    const pointIndex = path.pointIndexNearPoint(glyphPoint, size);
    if (pointIndex === undefined) return null;

    const pointType = path.pointTypes[pointIndex];
    const isOnCurve = (pointType & 0x03) === 0;
    if (isOnCurve) return null;

    const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(pointIndex);
    const contourInfo = path.contourInfo[contourIndex];
    const numContourPoints = path.getNumPointsOfContour(contourIndex);
    const contourStart = pointIndex - contourPointIndex;
    const contourEnd = contourStart + numContourPoints; // exclusive

    const getPrevIdx = (idx) => {
      if (idx > contourStart) {
        return idx - 1;
      }
      return contourInfo.isClosed ? contourEnd - 1 : null;
    };
    const getNextIdx = (idx) => {
      if (idx < contourEnd - 1) {
        return idx + 1;
      }
      return contourInfo.isClosed ? contourStart : null;
    };

    const prevIdx = getPrevIdx(pointIndex);
    const nextIdx = getNextIdx(pointIndex);
    const prevType = prevIdx == null ? null : path.pointTypes[prevIdx];
    const nextType = nextIdx == null ? null : path.pointTypes[nextIdx];
    const prevIsOnCurve = prevType != null && (prevType & 0x03) === 0;
    const nextIsOnCurve = nextType != null && (nextType & 0x03) === 0;

    let anchorIdx;
    if (prevIsOnCurve) {
      anchorIdx = prevIdx;
    } else if (nextIsOnCurve) {
      anchorIdx = nextIdx;
    }
    if (anchorIdx === undefined) return null;

    const handlePos = path.getPoint(pointIndex);
    const anchorPos = path.getPoint(anchorIdx);
    if (!handlePos || !anchorPos) return null;

    return {
      p1: { x: handlePos.x, y: handlePos.y },
      p2: { x: anchorPos.x, y: anchorPos.y },
      tensionContext: this._buildPathTensionContext(path, contourIndex, pointIndex),
      type: "path",
    };
  }

  _buildPathTensionContext(path, contourIndex, hoveredPointIndex) {
    for (const segment of path.iterContourDecomposedSegments(contourIndex)) {
      if (!segment?.points || segment.points.length !== 4) {
        continue;
      }
      const parentIndices = segment.parentPointIndices || [];
      if (parentIndices.length !== 4) {
        continue;
      }
      const off1IsCubic = (path.pointTypes[parentIndices[1]] & 0x03) === 0x02;
      const off2IsCubic = (path.pointTypes[parentIndices[2]] & 0x03) === 0x02;
      if (!off1IsCubic || !off2IsCubic) {
        continue;
      }
      let hoveredHandleSide = null;
      if (parentIndices[1] === hoveredPointIndex) {
        hoveredHandleSide = "start";
      } else if (parentIndices[2] === hoveredPointIndex) {
        hoveredHandleSide = "end";
      }
      if (!hoveredHandleSide) {
        continue;
      }
      return {
        segmentPoints: segment.points.map((pt) => ({ x: pt.x, y: pt.y })),
        hoveredHandleSide,
      };
    }
    return null;
  }

  _buildSkeletonTensionContext(contour, hoveredPointIndex) {
    const points = contour?.points || [];
    if (!points.length) return null;

    const segments = buildSegmentsFromSkeletonPoints(points, !!contour?.isClosed);
    for (const segment of segments) {
      const controlIndices = segment.controlIndices || [];
      if (controlIndices.length !== 2 || segment.controlPoints?.length !== 2) {
        continue;
      }

      let hoveredHandleSide = null;
      if (controlIndices[0] === hoveredPointIndex) {
        hoveredHandleSide = "start";
      } else if (controlIndices[1] === hoveredPointIndex) {
        hoveredHandleSide = "end";
      }
      if (!hoveredHandleSide) {
        continue;
      }

      const segmentPoints = [
        segment.startPoint,
        segment.controlPoints[0],
        segment.controlPoints[1],
        segment.endPoint,
      ];
      if (segmentPoints.some((pt) => !pt)) {
        continue;
      }

      return {
        segmentPoints: segmentPoints.map((pt) => ({ x: pt.x, y: pt.y })),
        hoveredHandleSide,
      };
    }
    return null;
  }

  /**
   * Get measurement points from current selection (two points).
   * Supports skeleton points or regular path points.
   */
  _getMeasurePointsFromSelection() {
    const { skeletonPoint, skeletonRibPoint, point: pointSelection } =
      parseSelection(this.sceneController.selection);

    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return null;

    const points = [];
    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, this.sceneModel);
    const path = positionedGlyph.glyph?.path;

    if (skeletonPoint?.size && skeletonData) {
      for (const key of skeletonPoint) {
        const [c, p] = key.split("/").map(Number);
        const pt = skeletonData.contours?.[c]?.points?.[p];
        if (!pt) continue;
        points.push({
          kind: "skeleton",
          p: { x: pt.x, y: pt.y },
        });
      }
    }

    if (skeletonRibPoint?.size && skeletonData) {
      for (const key of skeletonRibPoint) {
        const [c, p, side] = key.split("/");
        const contourIdx = Number(c);
        const pointIdx = Number(p);
        if (!Number.isInteger(contourIdx) || !Number.isInteger(pointIdx)) continue;
        if (side !== "left" && side !== "right") continue;
        const contour = skeletonData.contours?.[contourIdx];
        const ribPoint = this._getRibPointPositionForSelection(
          contour,
          pointIdx,
          side,
          skeletonData.defaultWidth ?? DEFAULT_SKELETON_WIDTH
        );
        if (!ribPoint) continue;
        points.push({
          kind: "skeleton",
          p: ribPoint,
        });
      }
    }

    if (pointSelection?.length && path) {
      for (const idx of pointSelection) {
        const pt = path.getPoint(idx);
        if (!pt) continue;
        points.push({
          kind: "path",
          p: { x: pt.x, y: pt.y },
        });
      }
    }

    if (points.length !== 2) {
      return null;
    }

    const type = points.every((pt) => pt.kind === "path") ? "path" : "skeleton";
    return {
      p1: points[0].p,
      p2: points[1].p,
      type,
    };
  }

  _getRibPointPositionForSelection(contour, pointIndex, side, defaultWidth) {
    if (!contour?.points?.length) return null;
    const skeletonPoint = contour.points[pointIndex];
    if (!skeletonPoint || skeletonPoint.type) return null;

    const contourDefaultWidth = contour.defaultWidth ?? defaultWidth;
    const normal = calculateNormalAtSkeletonPoint(contour, pointIndex);
    let leftHW = getPointHalfWidth(skeletonPoint, contourDefaultWidth, "left");
    let rightHW = getPointHalfWidth(skeletonPoint, contourDefaultWidth, "right");

    const singleSided = contour.singleSided ?? false;
    const singleSidedDirection = contour.singleSidedDirection ?? "left";

    if (singleSided) {
      const totalWidth = leftHW + rightHW;
      if (side !== singleSidedDirection) {
        return null;
      }
      const canNudge = totalWidth >= 0.5;
      const nudgeKey = getRibNudgeKey(side);
      const canApplyNudge = side === "left" ? skeletonPoint.leftEditable : skeletonPoint.rightEditable;
      const nudge = (canApplyNudge && canNudge) ? (skeletonPoint[nudgeKey] || 0) : 0;
      return projectRibPoint(skeletonPoint, normal, totalWidth, side, nudge);
    }

    const isLeftEditable = skeletonPoint.leftEditable === true;
    const isRightEditable = skeletonPoint.rightEditable === true;
    const leftNudgeKey = getRibNudgeKey("left");
    const rightNudgeKey = getRibNudgeKey("right");
    const leftNudge = (isLeftEditable && leftHW >= 0.5) ? (skeletonPoint[leftNudgeKey] || 0) : 0;
    const rightNudge = (isRightEditable && rightHW >= 0.5) ? (skeletonPoint[rightNudgeKey] || 0) : 0;
    const halfWidth = side === "left" ? leftHW : rightHW;
    const nudge = side === "left" ? leftNudge : rightNudge;
    return projectRibPoint(skeletonPoint, normal, halfWidth, side, nudge);
  }

  /**
   * Find segment under cursor for measure mode.
   * Returns { p1, p2, type } where p1 and p2 are on-curve endpoints.
   */
  _findSegmentForMeasure(point, size) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph?.glyph?.path) {
      return null;
    }

    const glyphPoint = {
      x: point.x - positionedGlyph.x,
      y: point.y - positionedGlyph.y,
    };

    const path = positionedGlyph.glyph.path;
    const margin = size * 1.5;

    // Check skeleton segments FIRST (they should have priority over generated contours)
    const skeletonSegmentHit = this._findSkeletonSegmentNear(
      positionedGlyph,
      glyphPoint,
      margin
    );
    if (skeletonSegmentHit) {
      return skeletonSegmentHit;
    }

    // Check path segments
    const segmentHit = this._findPathSegmentNear(path, glyphPoint, margin);
    if (segmentHit) {
      return segmentHit;
    }

    return null;
  }

  /**
   * Find path segment near point.
   */
  _findPathSegmentNear(path, point, margin) {
    const contourInfo = path.contourInfo;
    if (!contourInfo?.length) return null;

    for (let contourIdx = 0; contourIdx < contourInfo.length; contourIdx++) {
      const info = contourInfo[contourIdx];
      const startPoint = contourIdx === 0 ? 0 : contourInfo[contourIdx - 1].endPoint + 1;
      const endPoint = info.endPoint;

      // Find on-curve points in this contour
      const onCurveIndices = [];
      for (let i = startPoint; i <= endPoint; i++) {
        const pt = path.getPoint(i);
        if (!pt.type) {
          onCurveIndices.push(i);
        }
      }

      // Check each segment
      for (let i = 0; i < onCurveIndices.length; i++) {
        const idx1 = onCurveIndices[i];
        const idx2 = onCurveIndices[(i + 1) % onCurveIndices.length];

        // Skip closing segment if contour is open
        if (!info.isClosed && i === onCurveIndices.length - 1) continue;

        const p1 = path.getPoint(idx1);
        const p2 = path.getPoint(idx2);

        // Collect control points between on-curve points
        const controlPoints = [];
        let j = idx1 + 1;
        const limit = idx2 > idx1 ? idx2 : endPoint + 1 + idx2 - startPoint;
        while (j < limit) {
          const actualIdx = j <= endPoint ? j : startPoint + (j - endPoint - 1);
          const cp = path.getPoint(actualIdx);
          if (cp.type) {
            controlPoints.push(cp);
          }
          j++;
        }

        // Check distance to curve (sampled if has control points)
        const dist = this._distanceToCurve(point, p1, p2, controlPoints);
        if (dist <= margin) {
          return { p1: { x: p1.x, y: p1.y }, p2: { x: p2.x, y: p2.y }, type: "path" };
        }
      }
    }

    return null;
  }

  /**
   * Find skeleton segment near point.
   */
  _findSkeletonSegmentNear(positionedGlyph, point, margin) {
    const varGlyph = positionedGlyph.varGlyph;
    if (!varGlyph?.glyph?.layers) return null;

    const editLayerName = this.sceneController.editingLayerNames?.[0];
    if (!editLayerName) return null;

    const layer = varGlyph.glyph.layers[editLayerName];
    const skeletonData = getSkeletonData(layer);
    if (!skeletonData?.contours?.length) return null;

    for (const contour of skeletonData.contours) {
      const points = contour.points;

      // Find on-curve point indices
      const onCurveIndices = [];
      for (let i = 0; i < points.length; i++) {
        if (!points[i].type) {
          onCurveIndices.push(i);
        }
      }

      // Check each segment
      for (let i = 0; i < onCurveIndices.length - 1; i++) {
        const idx1 = onCurveIndices[i];
        const idx2 = onCurveIndices[i + 1];
        const p1 = points[idx1];
        const p2 = points[idx2];

        // Collect control points between on-curve points
        const controlPoints = [];
        for (let j = idx1 + 1; j < idx2; j++) {
          if (points[j].type) {
            controlPoints.push(points[j]);
          }
        }

        const dist = this._distanceToCurve(point, p1, p2, controlPoints);
        if (dist <= margin) {
          return { p1: { x: p1.x, y: p1.y }, p2: { x: p2.x, y: p2.y }, type: "skeleton" };
        }
      }

      // Check closing segment if closed
      if (contour.isClosed && onCurveIndices.length >= 2) {
        const idx1 = onCurveIndices[onCurveIndices.length - 1];
        const idx2 = onCurveIndices[0];
        const p1 = points[idx1];
        const p2 = points[idx2];

        // Control points wrap around
        const controlPoints = [];
        for (let j = idx1 + 1; j < points.length; j++) {
          if (points[j].type) controlPoints.push(points[j]);
        }
        for (let j = 0; j < idx2; j++) {
          if (points[j].type) controlPoints.push(points[j]);
        }

        const dist = this._distanceToCurve(point, p1, p2, controlPoints);
        if (dist <= margin) {
          return { p1: { x: p1.x, y: p1.y }, p2: { x: p2.x, y: p2.y }, type: "skeleton" };
        }
      }
    }

    return null;
  }

  /**
   * Calculate distance from point to a curve (bezier or line).
   * Samples the curve if control points are present.
   */
  _distanceToCurve(point, p1, p2, controlPoints) {
    if (!controlPoints || controlPoints.length === 0) {
      // Straight line
      return this._distanceToSegment(point, p1, p2);
    }

    // Sample the bezier curve and find minimum distance
    const samples = 16;
    let minDist = Infinity;

    for (let i = 0; i < samples; i++) {
      const t1 = i / samples;
      const t2 = (i + 1) / samples;
      const pt1 = this._evaluateBezier(t1, p1, p2, controlPoints);
      const pt2 = this._evaluateBezier(t2, p1, p2, controlPoints);
      const dist = this._distanceToSegment(point, pt1, pt2);
      if (dist < minDist) {
        minDist = dist;
      }
    }

    return minDist;
  }

  /**
   * Evaluate a bezier curve at parameter t.
   */
  _evaluateBezier(t, p1, p2, controlPoints) {
    if (controlPoints.length === 2) {
      // Cubic bezier
      const cp1 = controlPoints[0];
      const cp2 = controlPoints[1];
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;
      const t2 = t * t;
      const t3 = t2 * t;
      return {
        x: mt3 * p1.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t3 * p2.x,
        y: mt3 * p1.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t3 * p2.y,
      };
    } else if (controlPoints.length === 1) {
      // Quadratic bezier
      const cp = controlPoints[0];
      const mt = 1 - t;
      const mt2 = mt * mt;
      const t2 = t * t;
      return {
        x: mt2 * p1.x + 2 * mt * t * cp.x + t2 * p2.x,
        y: mt2 * p1.y + 2 * mt * t * cp.y + t2 * p2.y,
      };
    }
    // Fallback: straight line
    return {
      x: p1.x + t * (p2.x - p1.x),
      y: p1.y + t * (p2.y - p1.y),
    };
  }

  /**
   * Calculate distance from point to line segment.
   */
  _distanceToSegment(point, p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      return Math.hypot(point.x - p1.x, point.y - p1.y);
    }

    let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const projX = p1.x + t * dx;
    const projY = p1.y + t * dy;

    return Math.hypot(point.x - projX, point.y - projY);
  }

  /**
   * Compare two segment objects for equality.
   */
  _segmentsEqual(seg1, seg2) {
    if (seg1 === seg2) return true;
    if (!seg1 || !seg2) return false;
    return (
      seg1.p1?.x === seg2.p1?.x &&
      seg1.p1?.y === seg2.p1?.y &&
      seg1.p2?.x === seg2.p2?.x &&
      seg1.p2?.y === seg2.p2?.y
    );
  }

  get scalingEditBehavior() {
    return false;
  }

  activate() {
    super.activate();
    this.sceneController.sceneModel.showTransformSelection = true;
    this.canvasController.requestUpdate();
  }

  deactivate() {
    super.deactivate();
    this.sceneController.sceneModel.showTransformSelection = false;
    // Clean up measure mode if active
    if (this.measureMode) {
      this.measureMode = false;
      this.sceneModel.measureMode = false;
      this.sceneModel.measureHoverSegment = null;
      this.sceneModel.measureHoverRibPoint = null;
      this.sceneModel.measureHoverPoints = null;
      this.sceneModel.measureHoverHandle = null;
      if (this._boundKeyUp) {
        window.removeEventListener("keyup", this._boundKeyUp);
        this._boundKeyUp = null;
      }
      if (this._boundMeasureAltKeyDown) {
        window.removeEventListener("keydown", this._boundMeasureAltKeyDown);
        this._boundMeasureAltKeyDown = null;
      }
      if (this._boundMeasureAltKeyUp) {
        window.removeEventListener("keyup", this._boundMeasureAltKeyUp);
        this._boundMeasureAltKeyUp = null;
      }
    }
    this.canvasController.requestUpdate();
  }
}

function pointInSquareHandle(point, handle, handleSize) {
  const selRect = centeredRect(handle.x, handle.y, handleSize);
  return pointInRect(point.x, point.y, selRect);
}

function pointInCircleHandle(point, handle, handleSize) {
  return vector.distance(handle, point) <= handleSize / 2;
}

function getBehaviorPresetNameFromEvent(objectKind, modality, event) {
  const plan = resolveModifierPlan(objectKind, modality, {
    shift: event.shiftKey,
    alt: event.altKey,
  });
  // Pointer stays transport-only: unsupported combinations are resolved centrally.
  // Call-sites use the default preset as a safe routing fallback.
  return plan.supported && plan.presetName ? plan.presetName : "default";
}

function replace(setA, setB) {
  return setB;
}

function getSelectModeFunction(event) {
  return event.shiftKey
    ? event[commandKeyProperty]
      ? difference
      : symmetricDifference
    : event[commandKeyProperty]
    ? union
    : replace;
}

registerVisualizationLayerDefinition({
  identifier: "fontra.transform.selection",
  name: "edit-tools-pointer.transform.selection",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 400,
  screenParameters: {
    strokeWidth: 1,
    lineDash: [2, 4],
    handleSize: transformHandleSize,
    hoverStrokeOffset: 4,
    margin: transformHandleMargin,
  },

  colors: { handleColor: "#BBB", strokeColor: "#DDD" },
  colorsDarkMode: { handleColor: "#777", strokeColor: "#555" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    if (!model.showTransformSelection) {
      return;
    }
    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, model);
    const transformBounds = getTransformSelectionBounds(
      positionedGlyph.glyph,
      model.selection,
      model.fontController.getBackgroundImageBoundsFunc,
      skeletonData
    );
    if (!transformBounds) {
      return;
    }

    context.strokeStyle = parameters.handleColor;
    context.lineWidth = parameters.strokeWidth;

    // The following code is helpful for designing/adjusting the invisible rotation handle areas
    // draw rotation handles
    // const rotationHandles = getTransformHandles(transformBounds, parameters.margin + parameters.handleSize * rotationHandleSizeFactor / 2 + parameters.handleSize / 2);
    // for (const [handleName, handle] of Object.entries(rotationHandles)) {
    //   strokeSquareNode(context, handle, parameters.handleSize * rotationHandleSizeFactor);
    // }

    // draw resize handles
    const handles = getTransformHandles(
      transformBounds,
      parameters.margin + parameters.handleSize / 2
    );
    for (const [handleName, handle] of Object.entries(handles)) {
      strokeRoundNode(context, handle, parameters.handleSize);
    }

    // draw resize handles hover
    if (!model.clickedTransformSelectionHandle && handles[model.hoverResizeHandle]) {
      strokeRoundNode(
        context,
        handles[model.hoverResizeHandle],
        parameters.handleSize + parameters.hoverStrokeOffset
      );
    }

    // because of the dashed line draw resize bounding box last
    context.strokeStyle = parameters.strokeColor;
    context.setLineDash(parameters.lineDash);
    context.strokeRect(
      transformBounds.xMin,
      transformBounds.yMin,
      transformBounds.xMax - transformBounds.xMin,
      transformBounds.yMax - transformBounds.yMin
    );
  },
});

export class PointerToolScale extends PointerTool {
  iconPath = "/images/pointerscale.svg";
  identifier = "pointer-tool-scale";

  get scalingEditBehavior() {
    return true;
  }
}

function getTransformHandles(transformBounds, margin) {
  const { width, height } = rectSize(transformBounds);

  const [x, y, w, h] = [
    transformBounds.xMin - margin,
    transformBounds.yMin - margin,
    transformBounds.xMax - transformBounds.xMin + margin * 2,
    transformBounds.yMax - transformBounds.yMin + margin * 2,
  ];

  const handles = {
    "bottom-left": { x: x, y: y },
    "bottom-center": { x: x + w / 2, y: y },
    "bottom-right": { x: x + w, y: y },
    "top-left": { x: x, y: y + h },
    "top-center": { x: x + w / 2, y: y + h },
    "top-right": { x: x + w, y: y + h },
    "middle-left": { x: x, y: y + h / 2 },
    "middle-right": { x: x + w, y: y + h / 2 },
  };

  if (width != 0 && height != 0) {
    return handles;
  }

  for (const handleName of Object.keys(handles)) {
    if (width == 0 && handleName != "top-center" && handleName != "bottom-center") {
      delete handles[handleName];
    }
    if (height == 0 && handleName != "middle-left" && handleName != "middle-right") {
      delete handles[handleName];
    }
  }

  return handles;
}

function stripRibSelectionWhenPointSelectionExists(selection) {
  if (!selection?.size) {
    return selection;
  }

  const { point, skeletonPoint, skeletonRibPoint } = parseSelection(selection);
  const hasRegularOrSkeletonPoints = !!point?.length || !!skeletonPoint?.size;

  if (!hasRegularOrSkeletonPoints || !skeletonRibPoint?.size) {
    return selection;
  }

  return new Set(
    [...selection].filter((selectionKey) => !selectionKey.startsWith("skeletonRibPoint/"))
  );
}

/**
 * Determine the type of selection for bounding box purposes.
 * @returns "regular" | "skeleton" | "mixed" | "none"
 */
function getSelectionType(selection) {
  const {
    point,
    component,
    anchor,
    backgroundImage,
    guideline,
    skeletonPoint,
  } = parseSelection(selection);

  const hasRegular =
    point?.length > 0 ||
    component?.length > 0 ||
    anchor?.length > 0 ||
    backgroundImage?.length > 0 ||
    guideline?.length > 0;
  const hasSkeleton = skeletonPoint?.size > 0;

  if (hasRegular && hasSkeleton) return "mixed"; // NO bounding box
  if (hasSkeleton) return "skeleton";
  if (hasRegular) return "regular";
  return "none";
}

/**
 * Transform selected skeleton points (and their handles) by applying a transformation matrix.
 */
function transformSkeletonPoints(skeletonData, skeletonPointSelection, transform) {
  // Collect all points to transform (on-curves + their handles)
  const pointsToTransform = new Set();

  for (const selKey of skeletonPointSelection) {
    const [contourIdx, pointIdx] = selKey.split("/").map(Number);
    const contour = skeletonData.contours[contourIdx];
    if (!contour) continue;

    const numPoints = contour.points.length;

    // Add the on-curve point
    pointsToTransform.add(`${contourIdx}/${pointIdx}`);

    // Add adjacent handles
    const prevIdx = (pointIdx - 1 + numPoints) % numPoints;
    const nextIdx = (pointIdx + 1) % numPoints;

    if (contour.points[prevIdx]?.type === "cubic") {
      pointsToTransform.add(`${contourIdx}/${prevIdx}`);
    }
    if (contour.points[nextIdx]?.type === "cubic") {
      pointsToTransform.add(`${contourIdx}/${nextIdx}`);
    }
  }

  // Transform all collected points
  for (const key of pointsToTransform) {
    const [contourIdx, pointIdx] = key.split("/").map(Number);
    const point = skeletonData.contours[contourIdx]?.points[pointIdx];
    if (point) {
      const [newX, newY] = transform.transformPoint(point.x, point.y);
      point.x = newX;
      point.y = newY;
    }
  }
}

/**
 * Calculate bounds for selected skeleton points only.
 */
function getSkeletonSelectionBounds(selection, skeletonData) {
  const { skeletonPoint: skeletonPointSelection } = parseSelection(selection);
  if (!skeletonPointSelection?.size || !skeletonData?.contours) {
    return null;
  }

  let xMin = Infinity,
    yMin = Infinity,
    xMax = -Infinity,
    yMax = -Infinity;

  for (const selKey of skeletonPointSelection) {
    const [contourIdx, pointIdx] = selKey.split("/").map(Number);
    const point = skeletonData.contours[contourIdx]?.points[pointIdx];
    if (point) {
      xMin = Math.min(xMin, point.x);
      yMin = Math.min(yMin, point.y);
      xMax = Math.max(xMax, point.x);
      yMax = Math.max(yMax, point.y);
    }
  }

  if (xMin === Infinity) return null;
  return { xMin, yMin, xMax, yMax };
}

function getTransformSelectionBounds(
  glyph,
  selection,
  getBackgroundImageBoundsFunc,
  skeletonData
) {
  const selectionType = getSelectionType(selection);

  // No bounding box for mixed selection
  if (selectionType === "mixed") {
    return undefined;
  }

  // Skeleton-only selection
  if (selectionType === "skeleton") {
    const skeletonBounds = getSkeletonSelectionBounds(selection, skeletonData);
    if (!skeletonBounds) return undefined;
    const { xMin, yMin, xMax, yMax } = skeletonBounds;
    const width = xMax - xMin;
    const height = yMax - yMin;
    if (width == 0 && height == 0) return undefined;
    return skeletonBounds;
  }

  // Regular selection - existing logic
  if (selection.size == 1 && parseSelection(selection).point?.length == 1) {
    // Return if only a single point is selected, as in that case the "selection bounds"
    // is not really useful for the user, and is distracting instead.
    return undefined;
  }
  const selectionBounds = glyph.getSelectionBounds(
    selection,
    getBackgroundImageBoundsFunc
  );
  if (!selectionBounds) {
    return undefined;
  }
  const { width, height } = rectSize(selectionBounds);
  if (width == 0 && height == 0) {
    // return undefined if for example only one point is selected
    return undefined;
  }

  return selectionBounds;
}
