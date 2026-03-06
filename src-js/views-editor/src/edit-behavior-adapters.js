import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector, applyChange, consolidateChanges } from "@fontra/core/changes.js";
import { translate } from "@fontra/core/localization.js";
import { connectContours } from "@fontra/core/path-functions.js";
import * as vector from "@fontra/core/vector.js";
import {
  getSkeletonData,
  regenerateSkeletonContours,
  setSkeletonData,
  calculateNormalAtSkeletonPoint,
  getPointHalfWidth,
} from "@fontra/core/skeleton-contour-generator.js";
import { arrowKeyDeltas, assert, parseSelection } from "@fontra/core/utils.js";
import {
  computeEqualizedHandlePositions,
  constrainHorVerDiag,
  EditBehaviorFactory,
  applyLinkedWidthDelta,
  buildRibInterpolationAxisFromPath,
  createEditableHandleBehavior,
  createRibEditBehavior,
  createEditableRibBehavior,
  createInterpolatingRibBehavior,
  createPointBehaviorExecutor,
  findEqualizeHandleForPath,
  getEqualizeHandleInfoForPointIndex,
  findRibInterpolationAxisFromSkeletonPath,
  getSkeletonBehaviorName,
  isWidthLinked,
  makeRegularEqualizeNudgeChanges,
  makeEqualizeDragChanges,
  makeRoundFunc,
  resolveEqualizePairForContourPoint,
} from "./edit-behavior.js";
import {
  buildSegmentsFromSkeletonPoints,
  calculateSkeletonTrueTunniPoint,
} from "./skeleton-tunni-calculations.js";

// Adapter/composer contract:
// - adapters return `true` when they handled the route
// - adapters return `false` when the route is not applicable or cannot run
// - real undo/redo data stays inside adapter-owned edit sessions

const DEFAULT_SKELETON_WIDTH = 80;
const FIXED_RIB_SCALE_CONTROL_POINTS = true;

function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[(event.shiftKey ? 1 : 0) + (event.altKey ? 2 : 0)];
}

function filterSelectionByPrefixes(selection, prefixes) {
  if (!selection?.size || !prefixes?.length) {
    return selection;
  }
  const filtered = new Set();
  for (const key of selection) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      filtered.add(key);
    }
  }
  return filtered;
}

function getEditableHandleOffsetKeys(side, handleType) {
  const offset1DKey =
    side === "left"
      ? handleType === "in"
        ? "leftHandleInOffset"
        : "leftHandleOutOffset"
      : handleType === "in"
        ? "rightHandleInOffset"
        : "rightHandleOutOffset";
  const offsetXKey =
    side === "left"
      ? handleType === "in"
        ? "leftHandleInOffsetX"
        : "leftHandleOutOffsetX"
      : handleType === "in"
        ? "rightHandleInOffsetX"
        : "rightHandleOutOffsetX";
  const offsetYKey =
    side === "left"
      ? handleType === "in"
        ? "leftHandleInOffsetY"
        : "leftHandleOutOffsetY"
      : handleType === "in"
        ? "rightHandleInOffsetY"
        : "rightHandleOutOffsetY";
  return { offset1DKey, offsetXKey, offsetYKey };
}

function getSkeletonHandleDirectionForPoint(contour, pointIndex, handleType) {
  const points = contour?.points;
  const numPoints = points?.length || 0;
  const isClosed = !!contour?.isClosed;
  if (!numPoints) {
    return null;
  }
  const skeletonPoint = points[pointIndex];
  if (!skeletonPoint || skeletonPoint.type) {
    return null;
  }

  let controlPoint = null;
  if (handleType === "out") {
    const nextIdx = (pointIndex + 1) % numPoints;
    if (isClosed || pointIndex < numPoints - 1) {
      const nextPt = points[nextIdx];
      if (nextPt?.type === "cubic") {
        controlPoint = nextPt;
      }
    }
  } else {
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
  if (length < 0.001) {
    return null;
  }
  return { x: dir.x / length, y: dir.y / length };
}

function normalizeDirection(vectorValue, fallbackDirection) {
  const len = Math.hypot(vectorValue?.x || 0, vectorValue?.y || 0);
  if (len > 1e-9) {
    return { x: vectorValue.x / len, y: vectorValue.y / len };
  }
  const fallbackLen = Math.hypot(fallbackDirection?.x || 0, fallbackDirection?.y || 0);
  if (fallbackLen > 1e-9) {
    return {
      x: fallbackDirection.x / fallbackLen,
      y: fallbackDirection.y / fallbackLen,
    };
  }
  return { x: 1, y: 0 };
}

function readEditableHandleEqualizeState({
  point,
  side,
  handleType,
  anchorPos,
  currentHandlePos,
  skeletonHandleDir,
  detachedMode,
}) {
  const keys = getEditableHandleOffsetKeys(side, handleType);
  const has2D = point[keys.offsetXKey] !== undefined || point[keys.offsetYKey] !== undefined;
  const offsetX = point[keys.offsetXKey] || 0;
  const offsetY = point[keys.offsetYKey] || 0;
  const offset1D = point[keys.offset1DKey] || 0;

  const currentVec = {
    x: currentHandlePos.x - anchorPos.x,
    y: currentHandlePos.y - anchorPos.y,
  };
  const originalLength = Math.hypot(currentVec.x, currentVec.y);
  const direction = normalizeDirection(currentVec, skeletonHandleDir);
  const normalizedSkeletonDir = normalizeDirection(skeletonHandleDir, direction);

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

function applyEditableHandleEqualizedLength({
  point,
  state,
  targetLength,
  anchorPos,
  roundFunc = Math.round,
}) {
  const desiredPos = {
    x: anchorPos.x + state.direction.x * targetLength,
    y: anchorPos.y + state.direction.y * targetLength,
  };

  if (state.detachedMode) {
    point[state.keys.offsetXKey] = roundFunc(desiredPos.x - anchorPos.x);
    point[state.keys.offsetYKey] = roundFunc(desiredPos.y - anchorPos.y);
    return;
  }

  const baseControlPos = state.baseControlPos || desiredPos;
  const relX = desiredPos.x - baseControlPos.x;
  const relY = desiredPos.y - baseControlPos.y;
  point[state.keys.offsetXKey] = roundFunc(relX);
  point[state.keys.offsetYKey] = roundFunc(relY);
  point[state.keys.offset1DKey] = roundFunc(relX * state.skeletonDir.x + relY * state.skeletonDir.y);
}

function collectEditableGeneratedPointsFromPointSelection({
  sceneController,
  pointerTool,
  pointSelection,
}) {
  if (!pointSelection?.length) {
    return [];
  }
  const positionedGlyph = pointerTool.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return [];
  }
  const result = [];
  for (const pointIndex of pointSelection) {
    const ribInfo = sceneController.sceneModel._getEditableRibPointForGeneratedPoint(
      positionedGlyph,
      pointIndex
    );
    if (!ribInfo) {
      continue;
    }
    result.push({ pointIndex, ...ribInfo });
  }
  return result;
}

function collectEditableGeneratedHandlesFromPointSelection({
  sceneController,
  pointerTool,
  pointSelection,
}) {
  if (!pointSelection?.length) {
    return [];
  }
  const positionedGlyph = pointerTool.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return [];
  }
  const result = [];
  for (const pointIndex of pointSelection) {
    const handleInfo = sceneController.sceneModel._getEditableHandleForGeneratedPoint(
      positionedGlyph,
      pointIndex
    );
    if (!handleInfo) {
      continue;
    }
    result.push({ pointIndex, ...handleInfo });
  }
  return result;
}

function collectSelectedRibPointTargets(skeletonData, ribPointSelection) {
  const result = [];
  if (!skeletonData?.contours?.length || !ribPointSelection?.size) {
    return result;
  }
  for (const key of ribPointSelection) {
    const parts = key.split("/");
    if (parts.length !== 3) {
      continue;
    }
    const contourIndex = parseInt(parts[0]);
    const pointIndex = parseInt(parts[1]);
    const side = parts[2];
    if (
      !Number.isInteger(contourIndex) ||
      !Number.isInteger(pointIndex) ||
      (side !== "left" && side !== "right")
    ) {
      continue;
    }
    const contour = skeletonData.contours[contourIndex];
    const point = contour?.points?.[pointIndex];
    if (!point || point.type) {
      continue;
    }
    const editableKey = side === "left" ? "leftEditable" : "rightEditable";
    result.push({
      contourIndex,
      pointIndex,
      side,
      isEditable: point[editableKey] === true,
    });
  }
  return result;
}

function selectedRibTargetsBelongToSingleSegment(targets, skeletonData) {
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

function createSkeletonPointExecutors(
  skeletonData,
  selectedSkeletonPoints,
  behaviorName = "default",
  roundFunc = Math.round
) {
  if (!selectedSkeletonPoints?.size) {
    return [];
  }
  const byContour = new Map();
  for (const selKey of selectedSkeletonPoints) {
    const [contourIdx, pointIdx] = selKey.split("/").map(Number);
    if (!byContour.has(contourIdx)) {
      byContour.set(contourIdx, []);
    }
    byContour.get(contourIdx).push(pointIdx);
  }

  const behaviors = [];
  for (const [contourIdx, pointIndices] of byContour) {
    const contour = skeletonData?.contours?.[contourIdx];
    if (!contour) {
      continue;
    }
    const executor = createPointBehaviorExecutor({
      points: contour.points,
      isClosed: contour.isClosed,
      selectedIndices: pointIndices,
      behaviorName,
      roundFunc,
    });
    behaviors.push({ contourIndex: contourIdx, executor });
  }
  return behaviors;
}

function findPrevOnCurveIndex(points, startIndex, isClosed) {
  for (let i = startIndex - 1; i >= 0; i--) {
    if (points[i] && !points[i].type) {
      return i;
    }
  }
  if (!isClosed) {
    return null;
  }
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
  if (!isClosed) {
    return null;
  }
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
}

function enforceSmoothColinearityForSkeleton(points, isClosed, roundFunc = Math.round) {
  if (!points || points.length < 2) {
    return;
  }
  const numPoints = points.length;

  for (let i = 0; i < numPoints; i++) {
    const point = points[i];
    if (!point || point.type || !point.smooth || point.skipColinear) {
      continue;
    }
    if (!isClosed && (i === 0 || i === numPoints - 1)) {
      continue;
    }

    const prevIdx = (i - 1 + numPoints) % numPoints;
    const nextIdx = (i + 1) % numPoints;
    const prevPoint = points[prevIdx];
    const nextPoint = points[nextIdx];
    if (!prevPoint || !nextPoint) {
      continue;
    }

    const prevIsOnCurve = !prevPoint.type;
    const nextIsOnCurve = !nextPoint.type;

    if (!prevIsOnCurve && !nextIsOnCurve) {
      const vecIn = { x: prevPoint.x - point.x, y: prevPoint.y - point.y };
      const vecOut = { x: nextPoint.x - point.x, y: nextPoint.y - point.y };
      const lenIn = Math.hypot(vecIn.x, vecIn.y);
      const lenOut = Math.hypot(vecOut.x, vecOut.y);
      if (lenIn < 1e-3 || lenOut < 1e-3) {
        continue;
      }

      const dirIn = { x: vecIn.x / lenIn, y: vecIn.y / lenIn };
      const dirOut = { x: vecOut.x / lenOut, y: vecOut.y / lenOut };
      const weighted = {
        x: dirOut.x * lenOut - dirIn.x * lenIn,
        y: dirOut.y * lenOut - dirIn.y * lenIn,
      };
      const weightedLen = Math.hypot(weighted.x, weighted.y);
      if (weightedLen < 1e-6) {
        continue;
      }
      const tangent = { x: weighted.x / weightedLen, y: weighted.y / weightedLen };
      prevPoint.x = roundFunc(point.x - tangent.x * lenIn);
      prevPoint.y = roundFunc(point.y - tangent.y * lenIn);
      nextPoint.x = roundFunc(point.x + tangent.x * lenOut);
      nextPoint.y = roundFunc(point.y + tangent.y * lenOut);
      continue;
    }

    if (prevIsOnCurve && !nextIsOnCurve) {
      const vec = { x: point.x - prevPoint.x, y: point.y - prevPoint.y };
      const len = Math.hypot(vec.x, vec.y);
      const handleLen = Math.hypot(nextPoint.x - point.x, nextPoint.y - point.y);
      if (len < 1e-3 || handleLen < 1e-3) {
        continue;
      }
      const dir = { x: vec.x / len, y: vec.y / len };
      nextPoint.x = roundFunc(point.x + dir.x * handleLen);
      nextPoint.y = roundFunc(point.y + dir.y * handleLen);
      continue;
    }

    if (!prevIsOnCurve && nextIsOnCurve) {
      const vec = { x: nextPoint.x - point.x, y: nextPoint.y - point.y };
      const len = Math.hypot(vec.x, vec.y);
      const handleLen = Math.hypot(prevPoint.x - point.x, prevPoint.y - point.y);
      if (len < 1e-3 || handleLen < 1e-3) {
        continue;
      }
      const dir = { x: vec.x / len, y: vec.y / len };
      prevPoint.x = roundFunc(point.x - dir.x * handleLen);
      prevPoint.y = roundFunc(point.y - dir.y * handleLen);
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
  const endLen = Number.isFinite(tensionEnd) ? tensionEnd * distEndToTunni : null;
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
    if (!origContour || !workContour) {
      continue;
    }

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
      if (!origPoint || !workPoint) {
        continue;
      }
      resetWidthStateFromOriginal(origPoint, workPoint);
    }

    const onCurveDeltas = new Map();
    if (hasMovement) {
      for (const pi of pointSet) {
        const origPoint = points[pi];
        if (!origPoint || origPoint.type) {
          continue;
        }

        const normal = calculateNormalAtSkeletonPoint(origContour, pi);
        const len = Math.hypot(normal.x, normal.y);
        if (!(len > 1e-6)) {
          continue;
        }

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
      for (let pi = 0; pi < points.length; pi++) {
        const origPoint = points[pi];
        const workPoint = workContour.points[pi];
        if (!origPoint || !workPoint || origPoint.type) {
          continue;
        }
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
          if (!segment?.controlIndices?.length) {
            continue;
          }
          const startIdx = segment.startIndex;
          const endIdx = segment.endIndex;
          const origStart = points[startIdx];
          const origEnd = points[endIdx];
          const newStart = workContour.points[startIdx];
          const newEnd = workContour.points[endIdx];
          if (!origStart || !origEnd || !newStart || !newEnd) {
            continue;
          }

          const origVec = { x: origEnd.x - origStart.x, y: origEnd.y - origStart.y };
          const newVec = { x: newEnd.x - newStart.x, y: newEnd.y - newStart.y };
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

          segmentTransforms.set(segment.segmentIndex, { cos, sin, scale, useTransform });

          if (segment.controlIndices.length === 2) {
            const tensionInfo = calculateHandleTensionsForSegment(segment);
            if (tensionInfo) {
              segmentTensions.set(segment.segmentIndex, tensionInfo);
            }
          }

          for (const cpIdx of segment.controlIndices) {
            const origCp = points[cpIdx];
            if (!origCp) {
              continue;
            }
            const isFirst = cpIdx === segment.controlIndices[0];
            const isLast = cpIdx === segment.controlIndices[segment.controlIndices.length - 1];
            const anchorIdx = isFirst ? startIdx : isLast ? endIdx : null;
            const anchorPoint = anchorIdx !== null ? points[anchorIdx] : origStart;
            if (anchorIdx !== null) {
              handleAnchorByIndex.set(cpIdx, anchorIdx);
            }
            const rel = { x: origCp.x - anchorPoint.x, y: origCp.y - anchorPoint.y };
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
          if (!point || point.type || !point.smooth || point.skipColinear) {
            continue;
          }
          if (!isClosed && (i === 0 || i === numPoints - 1)) {
            continue;
          }

          const prevIdx = (i - 1 + numPoints) % numPoints;
          const nextIdx = (i + 1) % numPoints;
          const prevPoint = points[prevIdx];
          const nextPoint = points[nextIdx];
          if (!prevPoint || !nextPoint) {
            continue;
          }

          const prevIsOnCurve = !prevPoint.type;
          const nextIsOnCurve = !nextPoint.type;
          if (prevIsOnCurve || nextIsOnCurve) {
            continue;
          }

          const vecIn = { x: prevPoint.x - point.x, y: prevPoint.y - point.y };
          const vecOut = { x: nextPoint.x - point.x, y: nextPoint.y - point.y };
          const lenIn = Math.hypot(vecIn.x, vecIn.y);
          const lenOut = Math.hypot(vecOut.x, vecOut.y);
          if (!(lenIn > 1e-6) || !(lenOut > 1e-6)) {
            continue;
          }
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
          if (!point || point.type || !point.smooth || point.skipColinear) {
            continue;
          }
          if (!isClosed && (i === 0 || i === numPoints - 1)) {
            continue;
          }

          const prevIdx = (i - 1 + numPoints) % numPoints;
          const nextIdx = (i + 1) % numPoints;
          const prevPoint = points[prevIdx];
          const nextPoint = points[nextIdx];
          if (!prevPoint || !nextPoint) {
            continue;
          }

          const prevIsOnCurve = !prevPoint.type;
          const nextIsOnCurve = !nextPoint.type;
          const workPoint = workContour.points[i];
          const workPrev = workContour.points[prevIdx];
          const workNext = workContour.points[nextIdx];

          if (!prevIsOnCurve && !nextIsOnCurve) {
            let tangent = baseSmoothTangents.get(i) || null;
            const dirIn =
              baseHandleDirections.get(prevIdx) ||
              normalizeVectorSafe({ x: prevPoint.x - point.x, y: prevPoint.y - point.y });
            const dirOut =
              baseHandleDirections.get(nextIdx) ||
              normalizeVectorSafe({ x: nextPoint.x - point.x, y: nextPoint.y - point.y });
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
                tangent =
                  normalizeVectorSafe(weighted) || dirOut || { x: -dirIn.x, y: -dirIn.y };
              } else if (dirOut) {
                tangent = dirOut;
              } else if (dirIn) {
                tangent = { x: -dirIn.x, y: -dirIn.y };
              }
            }
            if (!tangent) {
              continue;
            }
            smoothHandleOverrides.set(nextIdx, { dir: tangent, anchorIdx: i });
            smoothHandleOverrides.set(prevIdx, {
              dir: { x: -tangent.x, y: -tangent.y },
              anchorIdx: i,
            });
            continue;
          }

          if (prevIsOnCurve && !nextIsOnCurve) {
            if (!workPoint || !workPrev) {
              continue;
            }
            const linearVec = { x: workPoint.x - workPrev.x, y: workPoint.y - workPrev.y };
            const dir = normalizeVectorSafe(linearVec);
            if (!dir) {
              continue;
            }
            smoothHandleOverrides.set(nextIdx, { dir, anchorIdx: i });
            continue;
          }

          if (!prevIsOnCurve && nextIsOnCurve) {
            if (!workPoint || !workNext) {
              continue;
            }
            const linearVec = { x: workNext.x - workPoint.x, y: workNext.y - workPoint.y };
            const dir = normalizeVectorSafe(linearVec);
            if (!dir) {
              continue;
            }
            smoothHandleOverrides.set(prevIdx, {
              dir: { x: -dir.x, y: -dir.y },
              anchorIdx: i,
            });
          }
        }

        for (const segment of segments) {
          if (!segment?.controlIndices?.length) {
            continue;
          }
          const startIdx = segment.startIndex;
          const endIdx = segment.endIndex;
          const origStart = points[startIdx];
          const origEnd = points[endIdx];
          const newStart = workContour.points[startIdx];
          const newEnd = workContour.points[endIdx];
          if (!origStart || !origEnd || !newStart || !newEnd) {
            continue;
          }
          const transform = segmentTransforms.get(segment.segmentIndex);
          const scale = transform?.scale ?? 1;

          if (segment.controlIndices.length === 2) {
            const cpStartIdx = segment.controlIndices[0];
            const cpEndIdx = segment.controlIndices[segment.controlIndices.length - 1];
            const origCpStart = points[cpStartIdx];
            const origCpEnd = points[cpEndIdx];
            const workCpStart = workContour.points[cpStartIdx];
            const workCpEnd = workContour.points[cpEndIdx];
            if (!origCpStart || !origCpEnd || !workCpStart || !workCpEnd) {
              continue;
            }

            const overrideStart = smoothHandleOverrides.get(cpStartIdx);
            const overrideEnd = smoothHandleOverrides.get(cpEndIdx);
            const baseStartDir =
              baseHandleDirections.get(cpStartIdx) ||
              normalizeVectorSafe({ x: origCpStart.x - origStart.x, y: origCpStart.y - origStart.y });
            const baseEndDir =
              baseHandleDirections.get(cpEndIdx) ||
              normalizeVectorSafe({ x: origCpEnd.x - origEnd.x, y: origCpEnd.y - origEnd.y });
            const fallbackStartDir =
              normalizeVectorSafe({ x: newEnd.x - newStart.x, y: newEnd.y - newStart.y }) ||
              { x: 1, y: 0 };
            const fallbackEndDir =
              normalizeVectorSafe({ x: newStart.x - newEnd.x, y: newStart.y - newEnd.y }) || {
                x: -fallbackStartDir.x,
                y: -fallbackStartDir.y,
              };
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

            const finalStartLen = Number.isFinite(startLen) ? startLen : origStartLen * scale;
            const finalEndLen = Number.isFinite(endLen) ? endLen : origEndLen * scale;

            workCpStart.x = roundFunc(newStart.x + startDir.x * finalStartLen);
            workCpStart.y = roundFunc(newStart.y + startDir.y * finalStartLen);
            workCpEnd.x = roundFunc(newEnd.x + endDir.x * finalEndLen);
            workCpEnd.y = roundFunc(newEnd.y + endDir.y * finalEndLen);
            continue;
          }

          for (const cpIdx of segment.controlIndices) {
            const origCp = points[cpIdx];
            const workCp = workContour.points[cpIdx];
            if (!origCp || !workCp) {
              continue;
            }

            const override = smoothHandleOverrides.get(cpIdx);
            const anchorIdx = override?.anchorIdx ?? handleAnchorByIndex.get(cpIdx) ?? startIdx;
            const origAnchor = points[anchorIdx];
            const newAnchor = workContour.points[anchorIdx];
            if (!origAnchor || !newAnchor) {
              continue;
            }

            const origVec = { x: origCp.x - origAnchor.x, y: origCp.y - origAnchor.y };
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
        for (let pi = 0; pi < points.length; pi++) {
          const origPoint = points[pi];
          const workPoint = workContour.points[pi];
          if (!origPoint || !workPoint || !origPoint.type) {
            continue;
          }

          const prevOn = findPrevOnCurveIndex(points, pi, isClosed);
          const nextOn = findNextOnCurveIndex(points, pi, isClosed);
          const hasPrevHandle =
            prevOn !== null &&
            (pi === prevOn + 1 || (isClosed && prevOn === points.length - 1 && pi === 0));
          const hasNextHandle =
            nextOn !== null &&
            (pi === nextOn - 1 || (isClosed && nextOn === 0 && pi === points.length - 1));
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
        enforceSmoothColinearityForSkeleton(workContour.points, isClosed, roundFunc);
      }
    }
  }

  return true;
}

function createSkeletonLayersData({
  glyph,
  editingLayerNames,
  requireContourIndex = null,
}) {
  const layersData = {};
  for (const editLayerName of editingLayerNames) {
    const layer = glyph.layers[editLayerName];
    const skeletonData = layer ? getSkeletonData(layer) : null;
    if (!skeletonData) {
      continue;
    }
    if (
      requireContourIndex !== null &&
      !skeletonData?.contours?.[requireContourIndex]
    ) {
      continue;
    }
    layersData[editLayerName] = {
      layer,
      original: JSON.parse(JSON.stringify(skeletonData)),
      working: JSON.parse(JSON.stringify(skeletonData)),
    };
  }
  return layersData;
}

function resetWorkingContoursFromOriginal(original, working, contourIndex = null) {
  const resetContour = (index) => {
    const origContour = original.contours[index];
    const workContour = working.contours[index];
    if (!origContour || !workContour) {
      return;
    }
    for (let pi = 0; pi < origContour.points.length; pi++) {
      workContour.points[pi].x = origContour.points[pi].x;
      workContour.points[pi].y = origContour.points[pi].y;
    }
  };
  if (contourIndex !== null) {
    resetContour(contourIndex);
    return;
  }
  for (let ci = 0; ci < original.contours.length; ci++) {
    resetContour(ci);
  }
}

function makeSkeletonLayerPersistenceChanges({
  layer,
  working,
  editLayerName,
  regenerateOptions,
  cloneOnPersist = false,
}) {
  const pathChange = recordChanges(layer.glyph, (sg) => {
    regenerateSkeletonContours(sg, working, regenerateOptions);
  });
  const prefixedPath = pathChange.prefixed(["layers", editLayerName, "glyph"]);

  const customDataChange = recordChanges(layer, (l) => {
    setSkeletonData(
      l,
      cloneOnPersist ? JSON.parse(JSON.stringify(working)) : working
    );
  });
  const prefixedCustomData = customDataChange.prefixed(["layers", editLayerName]);

  return { prefixedPath, prefixedCustomData };
}

async function runRegularPointLikeOrchestration({
  mode,
  sceneController,
  selection,
  pointerTool,
  eventStream,
  initialEvent,
  event,
  runPointLikeInputKernel,
  runPointLikeSessionKernel,
  equalizeHandleInfo: equalizeHandleInfoOverride,
}) {
  assert(sceneController, "runRegularPointLikeOrchestration: missing sceneController");
  assert(pointerTool, "runRegularPointLikeOrchestration: missing pointerTool");
  assert(
    typeof runPointLikeInputKernel === "function",
    "runRegularPointLikeOrchestration: missing runPointLikeInputKernel"
  );
  assert(
    typeof runPointLikeSessionKernel === "function",
    "runRegularPointLikeOrchestration: missing runPointLikeSessionKernel"
  );

  const isDrag = mode === "drag";
  assert(isDrag || mode === "nudge", "runRegularPointLikeOrchestration: invalid mode");
  assert(
    isDrag ? initialEvent : event,
    "runRegularPointLikeOrchestration: missing input event"
  );
  assert(
    selection?.size || (isDrag && pointerTool.equalizeMode),
    "runRegularPointLikeOrchestration: missing regular selection"
  );

  const primaryEvent = isDrag ? initialEvent : event;
  const initialBehaviorName = isDrag
    ? getBehaviorName(primaryEvent)
    : primaryEvent.altKey
      ? "alternate"
      : "default";
  const positionedGlyph = isDrag
    ? pointerTool.sceneModel.getSelectedPositionedGlyph()
    : undefined;
  const initialClickedPointIndex = isDrag
    ? pointerTool.sceneController.sceneModel.initialClickedPointIndex
    : undefined;

  return runPointLikeSessionKernel({
    mode,
    runPointLikeInputKernel,
    withEditSession: (sessionFn) => sceneController.editGlyph(sessionFn),
    eventStream,
    initialEvent,
    event,
    getBehaviorNameForEvent: isDrag ? getBehaviorName : undefined,
    getPointForEvent: isDrag ? (nextEvent) => sceneController.localPoint(nextEvent) : undefined,
    onSessionStart: ({ glyph }) => {
      let equalizeHandleInfo = equalizeHandleInfoOverride || null;
      if (
        !equalizeHandleInfo &&
        isDrag &&
        positionedGlyph &&
        initialClickedPointIndex !== undefined
      ) {
        const initialPoint = sceneController.localPoint(initialEvent);
        const candidate = findEqualizeHandleForPath(
          positionedGlyph,
          initialPoint,
          sceneController.mouseClickMargin
        );
        if (candidate && candidate.pointIndex === initialClickedPointIndex) {
          equalizeHandleInfo = candidate;
        }
      }

      const layerInfo = Object.entries(
        sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      ).map(([layerName, layerGlyph]) => {
        const behaviorFactory = new EditBehaviorFactory(
          layerGlyph,
          selection,
          pointerTool.scalingEditBehavior
        );
        return {
          layerName,
          layerGlyph,
          changePath: ["layers", layerName, "glyph"],
          connectDetector: sceneController.getPathConnectDetector(layerGlyph.path),
          shouldConnect: false,
          behaviorFactory,
          editBehavior: behaviorFactory.getBehavior(initialBehaviorName),
        };
      });
      assert(layerInfo.length >= 1, "no layer to edit");
      layerInfo[0].isPrimaryLayer = true;

      const equalizeRollbackByLayer = new Map();
      if (equalizeHandleInfo) {
        for (const layer of layerInfo) {
          const draggedPoint = layer.layerGlyph.path.getPoint(equalizeHandleInfo.pointIndex);
          const oppositePoint = layer.layerGlyph.path.getPoint(equalizeHandleInfo.oppositeIndex);
          if (draggedPoint || oppositePoint) {
            equalizeRollbackByLayer.set(layer.layerName, {
              draggedPoint: draggedPoint
                ? {
                    x: draggedPoint.x,
                    y: draggedPoint.y,
                  }
                : null,
              oppositePoint: oppositePoint
                ? {
                    x: oppositePoint.x,
                    y: oppositePoint.y,
                  }
                : null,
            });
          }
        }
      }

      return {
        layerInfo,
        equalizeHandleInfo,
        equalizeRollbackByLayer,
        equalizeUsed: false,
        editChange: null,
      };
    },
    onBehaviorChanged: isDrag
      ? async ({ behaviorName, sessionState, sendIncrementalChange }) => {
          const { layerInfo } = sessionState;
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
      : undefined,
    onInput: async ({
      event: inputEvent,
      currentPoint,
      delta,
      sessionState,
      sendIncrementalChange,
    }) => {
      const { layerInfo, equalizeHandleInfo } = sessionState;
      const deepEditChanges = [];
      for (const layer of layerInfo) {
        const layerEditChange = layer.editBehavior.makeChangeForDelta(delta);
        applyChange(layer.layerGlyph, layerEditChange);
        deepEditChanges.push(consolidateChanges(layerEditChange, layer.changePath));
        layer.shouldConnect = isDrag
          ? layer.connectDetector.shouldConnect(layer.isPrimaryLayer)
          : layer.connectDetector.shouldConnect();
      }

      if (isDrag && pointerTool.equalizeMode && equalizeHandleInfo && positionedGlyph) {
        const currentGlyphPoint = {
          x: currentPoint.x - positionedGlyph.x,
          y: currentPoint.y - positionedGlyph.y,
        };
        for (const layer of layerInfo) {
          const equalizeChanges = makeEqualizeDragChanges(
            layer.layerGlyph.path,
            equalizeHandleInfo,
            currentGlyphPoint,
            inputEvent.shiftKey
          );
          if (!equalizeChanges) {
            continue;
          }
          for (const change of equalizeChanges) {
            applyChange(layer.layerGlyph.path, change);
          }
          deepEditChanges.push(consolidateChanges(equalizeChanges, layer.changePath));
          sessionState.equalizeUsed = true;
        }
      }

      sessionState.editChange = consolidateChanges(deepEditChanges);
      await sendIncrementalChange(sessionState.editChange, isDrag);
    },
    onSessionEnd: ({ sessionState }) => {
      const {
        layerInfo,
        equalizeHandleInfo,
        equalizeRollbackByLayer,
        equalizeUsed,
        editChange,
      } = sessionState;

      if (!editChange) {
        return;
      }

      const rollbackParts = layerInfo.map((layer) =>
        consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
      );
      if (equalizeUsed && equalizeHandleInfo) {
        for (const layer of layerInfo) {
          const rollbackPoints = equalizeRollbackByLayer.get(layer.layerName);
          if (!rollbackPoints) {
            continue;
          }
          const equalizeRollbackChanges = [];
          if (rollbackPoints.draggedPoint) {
            equalizeRollbackChanges.push({
              f: "=xy",
              a: [
                equalizeHandleInfo.pointIndex,
                rollbackPoints.draggedPoint.x,
                rollbackPoints.draggedPoint.y,
              ],
            });
          }
          if (rollbackPoints.oppositePoint) {
            equalizeRollbackChanges.push({
              f: "=xy",
              a: [
                equalizeHandleInfo.oppositeIndex,
                rollbackPoints.oppositePoint.x,
                rollbackPoints.oppositePoint.y,
              ],
            });
          }
          if (!equalizeRollbackChanges.length) {
            continue;
          }
          rollbackParts.push(consolidateChanges(equalizeRollbackChanges, layer.changePath));
        }
      }

      let changes = ChangeCollector.fromChanges(editChange, consolidateChanges(rollbackParts));
      let shouldConnect = false;
      for (const layer of layerInfo) {
        if (!layer.shouldConnect) {
          continue;
        }
        shouldConnect = true;
        if (isDrag && layer.isPrimaryLayer) {
          layer.connectDetector.clearConnectIndicator();
        }
        const connectChanges = recordChanges(layer.layerGlyph, (workingLayerGlyph) => {
          const selectionUpdate = connectContours(
            workingLayerGlyph.path,
            layer.connectDetector.connectSourcePointIndex,
            layer.connectDetector.connectTargetPointIndex
          );
          if (layer.isPrimaryLayer) {
            sceneController.selection = selectionUpdate;
          }
        });
        if (connectChanges.hasChange) {
          changes = changes.concat(connectChanges.prefixed(layer.changePath));
        }
      }

      return {
        undoLabel: isDrag
          ? shouldConnect
            ? translate("edit-tools-pointer.undo.drag-selection-and-connect-contours")
            : translate("edit-tools-pointer.undo.drag-selection")
          : translate("action.nudge-selection"),
        changes,
        broadcast: true,
      };
    },
  });
}

async function runRegularPointLikeAdapter({
  mode,
  pointerTool,
  selection,
  equalizeHandleInfo,
  eventStream,
  initialEvent,
  event,
  runPointLikeInputKernel,
  runPointLikeSessionKernel,
}) {
  const sceneController = pointerTool.sceneController;
  const effectiveSelection = selection || sceneController.selection;
  await runRegularPointLikeOrchestration({
    mode,
    sceneController,
    selection: effectiveSelection,
    pointerTool,
    eventStream,
    initialEvent,
    event,
    runPointLikeInputKernel,
    runPointLikeSessionKernel,
    equalizeHandleInfo,
  });
  return true;
}

async function runTunniDragLegacy({ pointerTool, eventStream, initialEvent }) {
  const handled = await pointerTool._handleTunniPointDrag(eventStream, initialEvent);
  if (handled === false) {
    return false;
  }
  return true;
}

async function runSkeletonTunniDragLegacy({
  pointerTool,
  eventStream,
  initialEvent,
  tunniHit,
}) {
  const handled = await pointerTool._handleSkeletonTunniDrag(
    eventStream,
    initialEvent,
    tunniHit
  );
  if (handled === false) {
    return false;
  }
  return true;
}

function getRegularPointLikeSelection(sceneController) {
  return filterSelectionByPrefixes(sceneController.selection, [
    "point/",
    "anchor/",
    "guideline/",
  ]);
}

async function runRegularEqualizeNudgeCanonical({
  sceneController,
  event,
  regularSelection,
  runPointLikeInputKernel,
}) {
  assert(sceneController, "runRegularEqualizeNudgeCanonical: missing sceneController");
  assert(event, "runRegularEqualizeNudgeCanonical: missing event");
  assert(
    typeof runPointLikeInputKernel === "function",
    "runRegularEqualizeNudgeCanonical: missing runPointLikeInputKernel"
  );

  const { point: regularPointSelection } = parseSelection(regularSelection);
  if (!regularPointSelection?.length) {
    return false;
  }

  let handled = false;
  await runPointLikeInputKernel({
    mode: "nudge",
    event,
    onInput: async ({ delta }) => {
      await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
        const allChanges = [];
        for (const editLayerName of sceneController.editingLayerNames) {
          const layer = glyph.layers[editLayerName];
          const path = layer?.glyph?.path;
          if (!path) {
            continue;
          }
          const equalizeChanges = makeRegularEqualizeNudgeChanges(
            path,
            regularPointSelection,
            delta
          );
          if (!equalizeChanges.length) {
            continue;
          }
          const pathChange = recordChanges(layer.glyph, (layerGlyph) => {
            for (const change of equalizeChanges) {
              applyChange(layerGlyph.path, change);
            }
          });
          if (pathChange.hasChange) {
            allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));
          }
        }

        if (!allChanges.length) {
          return;
        }
        handled = true;
        const combined = new ChangeCollector().concat(...allChanges);
        await sendIncrementalChange(combined.change);
        return {
          changes: combined,
          undoLabel: "Nudge handles (equalize)",
          broadcast: true,
        };
      });
    },
  });
  return handled;
}

async function runRegularPointLikeCanonical(context, mode) {
  const {
    sceneController,
    pointerTool,
    objectKind,
    event,
    runPointLikeInputKernel,
    selectionOverride,
    equalizeHandleInfo,
  } = context;
  assert(sceneController, "runRegularPointLikeCanonical: missing sceneController");
  assert(pointerTool, "runRegularPointLikeCanonical: missing pointerTool");
  assert(objectKind, "runRegularPointLikeCanonical: missing objectKind");

  const regularSelection = selectionOverride || getRegularPointLikeSelection(sceneController);
  assert(
    regularSelection?.size || (mode === "drag" && pointerTool.equalizeMode),
    `runRegularPointLikeCanonical: no regular point/anchor/guideline selection for ${objectKind}`
  );

  if (mode === "nudge" && pointerTool.equalizeMode) {
    const handled = await runRegularEqualizeNudgeCanonical({
      sceneController,
      event,
      regularSelection,
      runPointLikeInputKernel,
    });
    if (handled) {
      return true;
    }
  }

  return runRegularPointLikeAdapter({
    ...context,
    mode,
    selection: regularSelection,
    equalizeHandleInfo,
  });
}

function applySkeletonEqualizeToContour({
  mode,
  contour,
  pointIndex,
  smoothIndex,
  oppositeIndex,
  event,
  currentPoint,
  delta,
  roundFunc,
}) {
  const smoothPoint = contour?.points?.[smoothIndex];
  const draggedPoint = contour?.points?.[pointIndex];
  const oppositePoint = contour?.points?.[oppositeIndex];
  if (!smoothPoint || !draggedPoint || !oppositePoint) {
    return false;
  }

  const nextPositions = computeEqualizedHandlePositions({
    mode,
    smoothPoint,
    draggedPoint,
    oppositePoint,
    currentPoint,
    delta,
    shiftKey: event?.shiftKey,
    roundFunc,
    nudgeOppositePolicy: "preserve-direction",
  });
  if (!nextPositions) {
    return false;
  }
  draggedPoint.x = nextPositions.draggedX;
  draggedPoint.y = nextPositions.draggedY;
  oppositePoint.x = nextPositions.oppositeX;
  oppositePoint.y = nextPositions.oppositeY;
  return true;
}

async function runSkeletonPointLikeOrchestration({
  mode,
  variant,
  sceneController,
  pointerTool,
  selectedSkeletonPoints,
  eventStream,
  initialEvent,
  event,
  runPointLikeInputKernel,
  runPointLikeSessionKernel,
  contourIndex,
  pointIndex,
  smoothIndex,
  oppositeIndex,
  offCurvePoints,
}) {
  assert(sceneController, "runSkeletonPointLikeOrchestration: missing sceneController");
  assert(pointerTool, "runSkeletonPointLikeOrchestration: missing pointerTool");
  assert(
    typeof runPointLikeInputKernel === "function",
    "runSkeletonPointLikeOrchestration: missing runPointLikeInputKernel"
  );
  assert(
    typeof runPointLikeSessionKernel === "function",
    "runSkeletonPointLikeOrchestration: missing runPointLikeSessionKernel"
  );
  const isDrag = mode === "drag";
  const isNudge = mode === "nudge";
  assert(isDrag || isNudge, "runSkeletonPointLikeOrchestration: invalid mode");
  assert(
    variant === "normal" || variant === "equalize",
    "runSkeletonPointLikeOrchestration: invalid variant"
  );

  const positionedGlyph = isDrag
    ? pointerTool.sceneModel.getSelectedPositionedGlyph()
    : undefined;
  if (isDrag && !positionedGlyph) {
    return;
  }

  const runSkeletonSession = async ({
    getBehaviorNameForEvent,
    createLayersData,
    onBehaviorChanged,
    applyLayerInput,
    undoLabel = translate("action.nudge-selection"),
    regenerateOptions,
    cloneOnPersist = false,
  }) => {
    await runPointLikeSessionKernel({
      mode,
      runPointLikeInputKernel,
      withEditSession: (sessionFn) => sceneController.editGlyph(sessionFn),
      eventStream,
      initialEvent,
      event,
      getBehaviorNameForEvent: isDrag ? getBehaviorNameForEvent : undefined,
      getPointForEvent: isDrag
        ? (nextEvent) => {
            const localPoint = sceneController.localPoint(nextEvent);
            return {
              x: localPoint.x - positionedGlyph.x,
              y: localPoint.y - positionedGlyph.y,
            };
          }
        : undefined,
      onSessionStart: ({ glyph }) => {
        const layersData = createLayersData(glyph);
        return {
          layersData,
          skip: !Object.keys(layersData).length,
          accumulatedChanges: new ChangeCollector(),
          finalChanges: null,
        };
      },
      onBehaviorChanged: onBehaviorChanged
        ? async ({ behaviorName, sessionState }) => {
            if (sessionState.skip) {
              return;
            }
            onBehaviorChanged({ behaviorName, layersData: sessionState.layersData });
          }
        : undefined,
      onInput: async ({
        event: inputEvent,
        delta,
        currentPoint,
        behaviorName,
        sessionState,
        sendIncrementalChange,
      }) => {
        if (sessionState.skip) {
          return;
        }
        const allChanges = [];
        for (const [editLayerName, data] of Object.entries(sessionState.layersData)) {
          const changed = applyLayerInput({
            editLayerName,
            data,
            event: inputEvent,
            delta,
            currentPoint,
            behaviorName,
          });
          if (!changed) {
            continue;
          }
          const { prefixedPath, prefixedCustomData } = makeSkeletonLayerPersistenceChanges({
            layer: data.layer,
            working: data.working,
            editLayerName,
            regenerateOptions,
            cloneOnPersist,
          });
          allChanges.push(prefixedPath, prefixedCustomData);
        }
        if (!allChanges.length) {
          return;
        }
        const combinedChange = new ChangeCollector().concat(...allChanges);
        if (isDrag) {
          sessionState.accumulatedChanges =
            sessionState.accumulatedChanges.concat(combinedChange);
          await sendIncrementalChange(combinedChange.change, true);
          return;
        }
        sessionState.finalChanges = combinedChange;
      },
      onSessionEnd: async ({ sessionState, sendIncrementalChange }) => {
        if (sessionState.skip) {
          return;
        }
        if (isDrag) {
          await sendIncrementalChange(sessionState.accumulatedChanges.change);
          return {
            changes: sessionState.accumulatedChanges,
            undoLabel,
            broadcast: true,
          };
        }
        if (!sessionState.finalChanges) {
          return;
        }
        await sendIncrementalChange(sessionState.finalChanges.change);
        return {
          changes: sessionState.finalChanges,
          undoLabel,
          broadcast: true,
        };
      },
    });
  };

  if (variant === "normal") {
    assert(
      selectedSkeletonPoints?.size,
      "runSkeletonPointLikeOrchestration(normal): missing skeleton selection"
    );
    if (isDrag) {
      await runSkeletonSession({
        createLayersData: (glyph) => {
          const layersData = createSkeletonLayersData({
            glyph,
            editingLayerNames: sceneController.editingLayerNames,
          });
          const initialBehaviorName = getSkeletonBehaviorName(
            initialEvent.shiftKey,
            initialEvent.altKey
          );
          for (const data of Object.values(layersData)) {
            data.behaviors = createSkeletonPointExecutors(
              data.original,
              selectedSkeletonPoints,
              initialBehaviorName
            );
          }
          return layersData;
        },
        getBehaviorNameForEvent: (nextEvent) =>
          getSkeletonBehaviorName(nextEvent.shiftKey, nextEvent.altKey),
        onBehaviorChanged: ({ behaviorName, layersData }) => {
          for (const data of Object.values(layersData)) {
            data.behaviors = createSkeletonPointExecutors(
              data.original,
              selectedSkeletonPoints,
              behaviorName
            );
          }
        },
        applyLayerInput: ({ data, event: inputEvent, delta }) => {
          const roundFunc = makeRoundFunc(inputEvent);
          const { original, working, behaviors } = data;
          resetWorkingContoursFromOriginal(original, working);
          for (const { contourIndex: ci, executor } of behaviors) {
            const changes = executor.applyDelta(delta, roundFunc);
            const contour = working.contours[ci];
            for (const { pointIndex: pi, x, y } of changes) {
              contour.points[pi].x = x;
              contour.points[pi].y = y;
            }
          }
          return true;
        },
        undoLabel: translate("edit-tools-pointer.undo.move-skeleton-points"),
        cloneOnPersist: true,
      });
      return;
    }

    const roundFunc = (value) => makeRoundFunc(event)(value, true);
    const behaviorName = getSkeletonBehaviorName(false, event.altKey);
    await runSkeletonSession({
      createLayersData: (glyph) => {
        const layersData = createSkeletonLayersData({
          glyph,
          editingLayerNames: sceneController.editingLayerNames,
        });
        for (const data of Object.values(layersData)) {
          data.behaviors = createSkeletonPointExecutors(
            data.original,
            selectedSkeletonPoints,
            behaviorName,
            roundFunc
          );
        }
        return layersData;
      },
      applyLayerInput: ({ data, delta }) => {
        let changed = false;
        for (const { contourIndex: ci, executor } of data.behaviors) {
          const changes = executor.applyDelta(delta);
          if (!changes?.length) {
            continue;
          }
          changed = true;
          const contour = data.working.contours[ci];
          for (const { pointIndex: pi, x, y } of changes) {
            contour.points[pi].x = x;
            contour.points[pi].y = y;
          }
        }
        return changed;
      },
      regenerateOptions: { preferInPlace: true },
    });
    return;
  }

  if (isDrag) {
    await runSkeletonSession({
      createLayersData: (glyph) =>
        createSkeletonLayersData({
          glyph,
          editingLayerNames: sceneController.editingLayerNames,
          requireContourIndex: contourIndex,
        }),
      getBehaviorNameForEvent: () => "equalize",
      applyLayerInput: ({ data, event: inputEvent, currentPoint }) => {
        const { original, working } = data;
        resetWorkingContoursFromOriginal(original, working, contourIndex);
        const contour = working.contours[contourIndex];
        if (!contour) {
          return false;
        }
        return applySkeletonEqualizeToContour({
          mode,
          contour,
          pointIndex,
          smoothIndex,
          oppositeIndex,
          event: inputEvent,
          currentPoint,
          roundFunc: makeRoundFunc(inputEvent),
        });
      },
      undoLabel: "Equalize Skeleton Handles",
      cloneOnPersist: true,
    });
    return;
  }

  assert(
    offCurvePoints?.length,
    "runSkeletonPointLikeOrchestration(equalize/nudge): missing off-curve selection"
  );
  await runSkeletonSession({
    createLayersData: (glyph) =>
      createSkeletonLayersData({
        glyph,
        editingLayerNames: sceneController.editingLayerNames,
      }),
    applyLayerInput: ({ data, delta }) => {
      let changed = false;
      const { working } = data;
      for (const { contourIdx, pointIdx } of offCurvePoints) {
        const contour = working.contours[contourIdx];
        const point = contour?.points?.[pointIdx];
        if (!contour || point?.type !== "cubic") {
          continue;
        }
        const equalizeInfo = resolveEqualizePairForContourPoint(contour, pointIdx);
        if (!equalizeInfo) {
          continue;
        }
        changed =
          applySkeletonEqualizeToContour({
            mode,
            contour,
            pointIndex: pointIdx,
            smoothIndex: equalizeInfo.smoothIndex,
            oppositeIndex: equalizeInfo.oppositeIndex,
            delta,
          }) || changed;
      }
      return changed;
    },
    undoLabel: "Nudge skeleton handles (equalize)",
    regenerateOptions: { preferInPlace: true },
  });
}

async function runSkeletonPointLikeCanonical(context, mode) {
  const {
    pointerTool,
    sceneController,
    objectKind,
    overrideSelection,
    runPointLikeInputKernel,
    runPointLikeSessionKernel,
  } = context;
  assert(pointerTool, "runSkeletonPointLikeCanonical: missing pointerTool");
  assert(sceneController, "runSkeletonPointLikeCanonical: missing sceneController");
  assert(objectKind, "runSkeletonPointLikeCanonical: missing objectKind");
  assert(
    typeof runPointLikeInputKernel === "function",
    "runSkeletonPointLikeCanonical: missing runPointLikeInputKernel"
  );
  assert(
    typeof runPointLikeSessionKernel === "function",
    "runSkeletonPointLikeCanonical: missing runPointLikeSessionKernel"
  );

  const selectedSkeletonPoints =
    overrideSelection || parseSelection(sceneController.selection).skeletonPoint;
  if (!selectedSkeletonPoints?.size) {
    return false;
  }

  if (pointerTool.fixedRibMode || pointerTool.fixedRibCompressMode) {
    return runFixedRibSkeletonPointLikeCanonical({
      ...context,
      mode,
      selectedSkeletonPoints,
    });
  }

  await runSkeletonPointLikeOrchestration({
    mode,
    variant: "normal",
    sceneController,
    pointerTool,
    selectedSkeletonPoints,
    eventStream: context.eventStream,
    initialEvent: context.initialEvent,
    event: context.event,
    runPointLikeInputKernel,
    runPointLikeSessionKernel,
  });
  return true;
}

function resolveClickedSkeletonPoint(pointerTool, selectedSkeletonPoints) {
  let clickedSkeletonPoint = pointerTool.sceneController.sceneModel.initialClickedSkeletonPoint;
  if (!clickedSkeletonPoint && selectedSkeletonPoints?.size) {
    const firstKey = selectedSkeletonPoints.values().next().value;
    if (firstKey) {
      const [contourIdx, pointIdx] = firstKey.split("/").map(Number);
      if (Number.isInteger(contourIdx) && Number.isInteger(pointIdx)) {
        clickedSkeletonPoint = { contourIdx, pointIdx };
      }
    }
  }
  return clickedSkeletonPoint;
}

async function runFixedRibSkeletonPointLikeCanonical({
  mode,
  pointerTool,
  sceneController,
  selectedSkeletonPoints,
  eventStream,
  initialEvent,
  event,
  runPointLikeInputKernel,
  runPointLikeSessionKernel,
}) {
  const clickedSkeletonPoint = resolveClickedSkeletonPoint(
    pointerTool,
    selectedSkeletonPoints
  );
  if (!clickedSkeletonPoint) {
    return false;
  }

  await runPointLikeSessionKernel({
    mode,
    runPointLikeInputKernel,
    withEditSession: (sessionFn) => sceneController.editGlyph(sessionFn),
    eventStream,
    initialEvent,
    event,
    getBehaviorNameForEvent: mode === "drag" ? () => "default" : undefined,
    getPointForEvent:
      mode === "drag"
        ? (nextEvent) => {
            const positionedGlyph = pointerTool.sceneModel.getSelectedPositionedGlyph();
            const localPoint = sceneController.localPoint(nextEvent);
            return {
              x: localPoint.x - positionedGlyph.x,
              y: localPoint.y - positionedGlyph.y,
            };
          }
        : undefined,
    onSessionStart: ({ glyph }) => {
      const layersData = createSkeletonLayersData({
        glyph,
        editingLayerNames: sceneController.editingLayerNames,
      });
      return {
        clickedSkeletonPoint,
        layersData,
        accumulatedChanges: new ChangeCollector(),
        skip: !Object.keys(layersData).length,
      };
    },
    onInput: async ({ event: inputEvent, delta, sessionState, sendIncrementalChange }) => {
      if (sessionState.skip) {
        return;
      }
      const roundFunc = mode === "drag" ? makeRoundFunc(inputEvent) : Math.round;
      const allChanges = [];
      for (const [editLayerName, data] of Object.entries(sessionState.layersData)) {
        const appliedFixedRib = applyFixedRibDragToSkeletonData(
          data.original,
          data.working,
          selectedSkeletonPoints,
          sessionState.clickedSkeletonPoint,
          delta,
          roundFunc,
          {
            anchorToDragSide: pointerTool.fixedRibCompressMode,
            scaleControlPoints: FIXED_RIB_SCALE_CONTROL_POINTS,
          }
        );
        if (!appliedFixedRib) {
          continue;
        }

        const pathChange = recordChanges(data.layer.glyph, (sg) => {
          regenerateSkeletonContours(sg, data.working, { preferInPlace: true });
        });
        const customDataChange = recordChanges(data.layer, (layer) => {
          setSkeletonData(layer, JSON.parse(JSON.stringify(data.working)));
        });
        if (pathChange.hasChange) {
          allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));
        }
        if (customDataChange.hasChange) {
          allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
        }
      }

      if (!allChanges.length) {
        return;
      }

      const combined = new ChangeCollector().concat(...allChanges);
      sessionState.accumulatedChanges = sessionState.accumulatedChanges.concat(combined);
      await sendIncrementalChange(combined.change, mode === "drag");
    },
    onSessionEnd: async ({ sessionState, sendIncrementalChange }) => {
      if (sessionState.skip) {
        return;
      }
      if (mode === "drag") {
        await sendIncrementalChange(sessionState.accumulatedChanges.change);
      }
      return {
        changes: sessionState.accumulatedChanges,
        undoLabel: translate("action.nudge-selection"),
        broadcast: true,
      };
    },
  });
  return true;
}

function getSelectedOffCurveSkeletonPoints({
  pointerTool,
  selectedSkeletonPoints,
}) {
  const positionedGlyph = pointerTool.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph?.varGlyph?.glyph?.layers) {
    return [];
  }
  const editLayerName =
    pointerTool.sceneModel?.sceneSettings?.editLayerName || positionedGlyph.glyph?.layerName;
  if (!editLayerName) {
    return [];
  }
  const layer = positionedGlyph.varGlyph.glyph.layers[editLayerName];
  const skeletonData = layer ? getSkeletonData(layer) : null;
  if (!skeletonData) {
    return [];
  }

  const offCurvePoints = [];
  for (const key of selectedSkeletonPoints) {
    const [contourIdx, pointIdx] = key.split("/").map(Number);
    const contour = skeletonData.contours[contourIdx];
    const point = contour?.points?.[pointIdx];
    if (point?.type === "cubic") {
      offCurvePoints.push({ contourIdx, pointIdx });
    }
  }
  return offCurvePoints;
}

async function runSkeletonHandlePointLikeCanonical(context, mode) {
  const {
    sceneController,
    pointerTool,
    objectKind,
    runPointLikeInputKernel,
    runPointLikeSessionKernel,
  } = context;
  assert(sceneController, "runSkeletonHandlePointLikeCanonical: missing sceneController");
  assert(pointerTool, "runSkeletonHandlePointLikeCanonical: missing pointerTool");
  assert(objectKind, "runSkeletonHandlePointLikeCanonical: missing objectKind");
  assert(
    typeof runPointLikeInputKernel === "function",
    "runSkeletonHandlePointLikeCanonical: missing runPointLikeInputKernel"
  );
  assert(
    typeof runPointLikeSessionKernel === "function",
    "runSkeletonHandlePointLikeCanonical: missing runPointLikeSessionKernel"
  );

  if (mode === "drag") {
    assert(
      context.equalizeSkeletonInfo,
      "runSkeletonHandlePointLikeCanonical: missing equalizeSkeletonInfo"
    );
    const { contourIdx, pointIdx, skeletonData } = context.equalizeSkeletonInfo;
    const contour = skeletonData?.contours?.[contourIdx];
    const clickedPoint = contour?.points?.[pointIdx];
    if (!contour || clickedPoint?.type !== "cubic") {
      return false;
    }
    const equalizeInfo = resolveEqualizePairForContourPoint(contour, pointIdx);
    if (!equalizeInfo) {
      return false;
    }

    await runSkeletonPointLikeOrchestration({
      mode,
      variant: "equalize",
      sceneController,
      pointerTool,
      eventStream: context.eventStream,
      initialEvent: context.initialEvent,
      runPointLikeInputKernel,
      runPointLikeSessionKernel,
      contourIndex: contourIdx,
      pointIndex: pointIdx,
      smoothIndex: equalizeInfo.smoothIndex,
      oppositeIndex: equalizeInfo.oppositeIndex,
    });
    return true;
  }

  const selectedSkeletonPoints = parseSelection(sceneController.selection).skeletonPoint;
  if (!selectedSkeletonPoints?.size) {
    return false;
  }
  const offCurvePoints = getSelectedOffCurveSkeletonPoints({
    pointerTool,
    selectedSkeletonPoints,
  });
  if (!offCurvePoints.length) {
    return runSkeletonPointLikeCanonical(context, mode);
  }

  await runSkeletonPointLikeOrchestration({
    mode,
    variant: "equalize",
    sceneController,
    pointerTool,
    event: context.event,
    runPointLikeInputKernel,
    runPointLikeSessionKernel,
    offCurvePoints,
  });
  return true;
}

async function runLegacyComponentDragAdapter(context) {
  return runRegularPointLikeAdapter({
    ...context,
    mode: "drag",
  });
}

async function runSkeletonRibPointDragCanonical(context) {
  const {
    pointerTool,
    sceneController,
    eventStream,
    initialEvent,
    ribHit,
    targetRibSelection,
    preSelectedSkeletonPoints,
  } = context;
  assert(pointerTool, "runSkeletonRibPointDragCanonical: missing pointerTool");
  assert(sceneController, "runSkeletonRibPointDragCanonical: missing sceneController");
  assert(ribHit, "runSkeletonRibPointDragCanonical: missing ribHit");
  const positionedGlyph = pointerTool.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return false;
  }

  const localPoint = sceneController.localPoint(initialEvent);
  const startGlyphPoint = {
    x: localPoint.x - positionedGlyph.x,
    y: localPoint.y - positionedGlyph.y,
  };
  const useInterpolation = initialEvent.altKey;
  const referenceLayerName = sceneController.editingLayerNames?.[0];
  const referenceLayer = referenceLayerName
    ? positionedGlyph?.varGlyph?.glyph?.layers?.[referenceLayerName]
    : null;
  const referenceSkeletonData = getSkeletonData(referenceLayer);
  if (!referenceSkeletonData?.contours?.length) {
    return false;
  }

  const defaultRibKey = `${ribHit.contourIndex}/${ribHit.pointIndex}/${ribHit.side}`;
  const selectedRibKeys =
    targetRibSelection?.size > 0 ? new Set(targetRibSelection) : new Set([defaultRibKey]);
  const targetPointsMap = new Map();
  const addTargetRibPoint = (contourIndex, pointIndex, side) => {
    const key = `${contourIndex}/${pointIndex}/${side}`;
    if (targetPointsMap.has(key)) {
      return;
    }
    const contour = referenceSkeletonData.contours?.[contourIndex];
    const point = contour?.points?.[pointIndex];
    if (!point || point.type) {
      return;
    }
    const isSingleSided = contour.singleSided ?? false;
    const editableKey = side === "left" ? "leftEditable" : "rightEditable";
    targetPointsMap.set(key, {
      ribKey: key,
      contourIndex,
      pointIndex,
      side,
      isLinked: isWidthLinked(point),
      isSingleSided,
      isEditable: point[editableKey] === true,
    });
  };

  for (const key of selectedRibKeys) {
    const [ci, pi, side] = key.split("/");
    const contourIndex = Number(ci);
    const pointIndex = Number(pi);
    if (
      Number.isInteger(contourIndex) &&
      Number.isInteger(pointIndex) &&
      (side === "left" || side === "right")
    ) {
      addTargetRibPoint(contourIndex, pointIndex, side);
    }
  }

  if (preSelectedSkeletonPoints?.size) {
    for (const key of preSelectedSkeletonPoints) {
      const [ci, pi] = key.split("/").map(Number);
      if (!Number.isInteger(ci) || !Number.isInteger(pi)) {
        continue;
      }
      const contour = referenceSkeletonData.contours?.[ci];
      const point = contour?.points?.[pi];
      if (!point || point.type) {
        continue;
      }
      const side = contour.singleSided
        ? contour.singleSidedDirection ?? "left"
        : ribHit.side;
      addTargetRibPoint(ci, pi, side);
    }
  }

  const targetPoints = [...targetPointsMap.values()];
  if (!targetPoints.length) {
    return false;
  }

  const hasSkeletonSelection = preSelectedSkeletonPoints?.size > 0;
  if (!hasSkeletonSelection) {
    sceneController.selection = new Set(
      targetPoints.map((target) => `skeletonRibPoint/${target.ribKey}`)
    );
  }

  const allTargetsEditable = targetPoints.every((target) => target.isEditable);
  const belongsToSingleSegment = selectedRibTargetsBelongToSingleSegment(
    targetPoints,
    referenceSkeletonData
  );
  if (!hasSkeletonSelection && !allTargetsEditable && !belongsToSingleSegment) {
    return false;
  }

  const previousCursor = pointerTool.canvasController.canvas.style.cursor;
  pointerTool.canvasController.canvas.style.cursor = "pointer";

  try {
    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const layersData = {};
      for (const editLayerName of sceneController.editingLayerNames || []) {
        const layer = glyph.layers[editLayerName];
        const skeletonData = getSkeletonData(layer);
        if (!skeletonData) {
          continue;
        }
        layersData[editLayerName] = {
          layer,
          original: JSON.parse(JSON.stringify(skeletonData)),
          working: JSON.parse(JSON.stringify(skeletonData)),
          ribBehaviors: [],
        };
      }
      if (!Object.keys(layersData).length) {
        return;
      }

      for (const data of Object.values(layersData)) {
        for (const target of targetPoints) {
          const contour = data.original.contours?.[target.contourIndex];
          const skeletonPoint = contour?.points?.[target.pointIndex];
          if (!contour || !skeletonPoint) {
            continue;
          }
          const normal = calculateNormalAtSkeletonPoint(contour, target.pointIndex);
          if (!normal) {
            continue;
          }
          const ribHitForPoint = {
            contourIndex: target.contourIndex,
            pointIndex: target.pointIndex,
            side: target.side,
            normal,
            onCurvePoint: { x: skeletonPoint.x, y: skeletonPoint.y },
          };

          let behavior;
          if (target.isSingleSided) {
            const defaultWidth = contour.defaultWidth ?? DEFAULT_SKELETON_WIDTH;
            const leftHW = getPointHalfWidth(skeletonPoint, defaultWidth, "left");
            const rightHW = getPointHalfWidth(skeletonPoint, defaultWidth, "right");
            const totalWidth = leftHW + rightHW;

            if (target.isEditable) {
              if (useInterpolation) {
                const interpolationAxis = findRibInterpolationAxisFromSkeletonPath(
                  data.layer.glyph.path,
                  skeletonPoint,
                  normal,
                  contour,
                  target.side
                );
                behavior = interpolationAxis
                  ? createInterpolatingRibBehavior(data.original, ribHitForPoint, interpolationAxis)
                  : createEditableRibBehavior(data.original, ribHitForPoint);
              } else {
                behavior = createEditableRibBehavior(data.original, ribHitForPoint);
              }
              if (behavior.setOriginalHalfWidth) {
                behavior.setOriginalHalfWidth(totalWidth);
              } else {
                behavior.originalHalfWidth = totalWidth;
              }
              behavior.minHalfWidth = 2;
            } else {
              behavior = createRibEditBehavior(data.original, ribHitForPoint);
              behavior.originalHalfWidth = totalWidth;
              behavior.minHalfWidth = 2;
            }
          } else if (target.isEditable) {
            if (useInterpolation) {
              const interpolationAxis = findRibInterpolationAxisFromSkeletonPath(
                data.layer.glyph.path,
                skeletonPoint,
                normal,
                contour,
                target.side
              );
              behavior = interpolationAxis
                ? createInterpolatingRibBehavior(data.original, ribHitForPoint, interpolationAxis)
                : createEditableRibBehavior(data.original, ribHitForPoint);
            } else {
              behavior = createEditableRibBehavior(data.original, ribHitForPoint);
            }
          } else {
            behavior = createRibEditBehavior(data.original, ribHitForPoint);
          }

          data.ribBehaviors.push({ behavior, target });
        }
      }

      let accumulatedChanges = new ChangeCollector();

      for await (const inputEvent of eventStream) {
        pointerTool.canvasController.canvas.style.cursor = "pointer";
        const roundFunc = makeRoundFunc(inputEvent);
        const currentLocalPoint = sceneController.localPoint(inputEvent);
        const currentGlyphPoint = {
          x: currentLocalPoint.x - positionedGlyph.x,
          y: currentLocalPoint.y - positionedGlyph.y,
        };
        const delta = vector.subVectors(currentGlyphPoint, startGlyphPoint);
        const constrainMode = pointerTool.tangentRibMode ? "tangent" : null;
        const baseNormalDelta =
          hasSkeletonSelection && !useInterpolation && constrainMode !== "tangent"
            ? (ribHit.side === "left" ? 1 : -1) *
              (delta.x * ribHit.normal.x + delta.y * ribHit.normal.y)
            : null;
        const allChanges = [];

        for (const [editLayerName, data] of Object.entries(layersData)) {
          const { layer, working, ribBehaviors } = data;
          for (const { behavior, target } of ribBehaviors) {
            const contour = working.contours?.[target.contourIndex];
            const point = contour?.points?.[target.pointIndex];
            const baseContour = data.original.contours?.[target.contourIndex];
            const basePoint = baseContour?.points?.[target.pointIndex];
            if (!contour || !point || !baseContour || !basePoint || point.type || basePoint.type) {
              continue;
            }

            const contourDefaultWidth =
              baseContour.defaultWidth ?? contour.defaultWidth ?? DEFAULT_SKELETON_WIDTH;
            const linked = isWidthLinked(basePoint);
            const change =
              baseNormalDelta !== null
                ? {
                    halfWidth: Math.round(behavior.originalHalfWidth + baseNormalDelta),
                    nudge: behavior.originalNudge,
                    handleInOffsetX: behavior.originalHandleInOffsetX,
                    handleInOffsetY: behavior.originalHandleInOffsetY,
                    handleOutOffsetX: behavior.originalHandleOutOffsetX,
                    handleOutOffsetY: behavior.originalHandleOutOffsetY,
                  }
                : behavior.applyDelta(delta, constrainMode, roundFunc);
            const deltaWidth = change.halfWidth - behavior.originalHalfWidth;
            applyLinkedWidthDelta(
              point,
              basePoint,
              contourDefaultWidth,
              target.side,
              deltaWidth,
              linked,
              roundFunc
            );
            if (change.nudge !== undefined) {
              point[target.side === "left" ? "leftNudge" : "rightNudge"] = change.nudge;
            }
            if (change.isInterpolation || change.hasHandleOffsets) {
              if (target.side === "left") {
                point.leftHandleInOffsetX = change.handleInOffsetX;
                point.leftHandleInOffsetY = change.handleInOffsetY;
                point.leftHandleOutOffsetX = change.handleOutOffsetX;
                point.leftHandleOutOffsetY = change.handleOutOffsetY;
                delete point.leftHandleInOffset;
                delete point.leftHandleOutOffset;
              } else {
                point.rightHandleInOffsetX = change.handleInOffsetX;
                point.rightHandleInOffsetY = change.handleInOffsetY;
                point.rightHandleOutOffsetX = change.handleOutOffsetX;
                point.rightHandleOutOffsetY = change.handleOutOffsetY;
                delete point.rightHandleInOffset;
                delete point.rightHandleOutOffset;
              }
            }
          }

          const pathChange = recordChanges(layer.glyph, (sg) => {
            regenerateSkeletonContours(sg, working);
          });
          const customDataChange = recordChanges(layer, (layerRecord) => {
            setSkeletonData(layerRecord, JSON.parse(JSON.stringify(working)));
          });
          if (pathChange.hasChange) {
            allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));
          }
          if (customDataChange.hasChange) {
            allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
          }
        }

        const combined = new ChangeCollector().concat(...allChanges);
        accumulatedChanges = accumulatedChanges.concat(combined);
        await sendIncrementalChange(combined.change, true);
      }

      await sendIncrementalChange(accumulatedChanges.change);
      return {
        changes: accumulatedChanges,
        undoLabel: translate("action.nudge-selection"),
        broadcast: true,
      };
    });
  } finally {
    pointerTool.canvasController.canvas.style.cursor = previousCursor || "default";
    delete sceneController.sceneModel.initialClickedSkeletonRibPoint;
  }
  return true;
}

async function runEditableGeneratedPointLikeCanonical(context, mode) {
  const isDrag = mode === "drag";
  const {
    pointerTool,
    sceneController,
    eventStream,
    initialEvent,
    event,
    editablePoints,
    runPointLikeInputKernel,
    runPointLikeSessionKernel,
  } = context;
  assert(pointerTool, "runEditableGeneratedPointLikeCanonical: missing pointerTool");
  assert(sceneController, "runEditableGeneratedPointLikeCanonical: missing sceneController");
  assert(
    typeof runPointLikeInputKernel === "function",
    "runEditableGeneratedPointLikeCanonical: missing runPointLikeInputKernel"
  );
  assert(
    typeof runPointLikeSessionKernel === "function",
    "runEditableGeneratedPointLikeCanonical: missing runPointLikeSessionKernel"
  );
  if (isDrag) {
    assert(eventStream, "runEditableGeneratedPointLikeCanonical: missing eventStream");
    assert(initialEvent, "runEditableGeneratedPointLikeCanonical: missing initialEvent");
  } else {
    assert(event, "runEditableGeneratedPointLikeCanonical: missing event");
  }

  const positionedGlyph = pointerTool.sceneModel.getSelectedPositionedGlyph();
  const resolvedEditablePoints =
    editablePoints ||
    collectEditableGeneratedPointsFromPointSelection({
      sceneController,
      pointerTool,
      pointSelection: parseSelection(sceneController.selection).point,
    });
  if (!positionedGlyph || !resolvedEditablePoints?.length) {
    return false;
  }

  const useInterpolation = isDrag ? initialEvent.altKey : event.altKey;
  const generatedPath = positionedGlyph.glyph.path;
  const editablePointsWithInterpolation = useInterpolation
    ? resolvedEditablePoints.map((editablePoint) => {
        const interpolationAxis = buildRibInterpolationAxisFromPath(
          generatedPath,
          editablePoint.pointIndex
        );
        return { ...editablePoint, interpolationAxis };
      })
    : resolvedEditablePoints.map((editablePoint) => ({
        ...editablePoint,
        interpolationAxis: null,
      }));

  const previousCursor = pointerTool.canvasController.canvas.style.cursor;
  if (isDrag) {
    pointerTool.canvasController.canvas.style.cursor = "pointer";
  }

  try {
    await runPointLikeSessionKernel({
      mode,
      runPointLikeInputKernel,
      withEditSession: (sessionFn) => sceneController.editGlyph(sessionFn),
      eventStream,
      initialEvent,
      event,
      getBehaviorNameForEvent: isDrag ? () => "editable-generated-point" : undefined,
      getPointForEvent: isDrag
        ? (nextEvent) => {
            const localPoint = sceneController.localPoint(nextEvent);
            return {
              x: localPoint.x - positionedGlyph.x,
              y: localPoint.y - positionedGlyph.y,
            };
          }
        : undefined,
      onSessionStart: ({ glyph }) => {
        const layersData = {};
        for (const editLayerName of sceneController.editingLayerNames || []) {
          const layer = glyph.layers[editLayerName];
          const skeletonData = getSkeletonData(layer);
          if (!skeletonData) {
            continue;
          }
          layersData[editLayerName] = {
            layer,
            original: JSON.parse(JSON.stringify(skeletonData)),
            working: JSON.parse(JSON.stringify(skeletonData)),
            behaviors: [],
          };
        }

        for (const data of Object.values(layersData)) {
          for (const editablePoint of editablePointsWithInterpolation) {
            const contour = data.original.contours?.[editablePoint.skeletonContourIndex];
            const skeletonPoint = contour?.points?.[editablePoint.skeletonPointIndex];
            if (!contour || !skeletonPoint || skeletonPoint.type) {
              continue;
            }
            const normal = calculateNormalAtSkeletonPoint(
              contour,
              editablePoint.skeletonPointIndex
            );
            if (!normal) {
              continue;
            }
            const ribHit = {
              contourIndex: editablePoint.skeletonContourIndex,
              pointIndex: editablePoint.skeletonPointIndex,
              side: editablePoint.side,
              normal,
              onCurvePoint: { x: skeletonPoint.x, y: skeletonPoint.y },
            };

            let behavior;
            if (useInterpolation && editablePoint.interpolationAxis) {
              behavior = createInterpolatingRibBehavior(
                data.original,
                ribHit,
                editablePoint.interpolationAxis
              );
            } else {
              behavior = createEditableRibBehavior(data.original, ribHit);
            }
            data.behaviors.push({ behavior, editablePoint });
          }
        }

        return {
          layersData,
          accumulatedChanges: new ChangeCollector(),
          skip: !Object.keys(layersData).length,
        };
      },
      onInput: async ({ event: inputEvent, delta, sessionState, sendIncrementalChange }) => {
        if (sessionState.skip) {
          return;
        }
        const roundFunc = isDrag ? makeRoundFunc(inputEvent) : Math.round;
        const constrainMode = isDrag && pointerTool.tangentRibMode ? "tangent" : null;
        const allChanges = [];

        for (const [editLayerName, data] of Object.entries(sessionState.layersData)) {
          const { layer, original, working, behaviors } = data;
          for (const { behavior, editablePoint } of behaviors) {
            const change = behavior.applyDelta(delta, constrainMode, roundFunc);
            const contour = working.contours?.[editablePoint.skeletonContourIndex];
            const point = contour?.points?.[editablePoint.skeletonPointIndex];
            const baseContour = original.contours?.[editablePoint.skeletonContourIndex];
            const basePoint = baseContour?.points?.[editablePoint.skeletonPointIndex];
            if (!contour || !point || !baseContour || !basePoint || point.type || basePoint.type) {
              continue;
            }

            const defaultWidth = baseContour.defaultWidth ?? DEFAULT_SKELETON_WIDTH;
            const deltaWidth = change.halfWidth - behavior.originalHalfWidth;
            const linked = isWidthLinked(basePoint);
            applyLinkedWidthDelta(
              point,
              basePoint,
              defaultWidth,
              editablePoint.side,
              deltaWidth,
              linked,
              roundFunc
            );

            if (editablePoint.side === "left") {
              point.leftNudge = change.nudge;
            } else {
              point.rightNudge = change.nudge;
            }

            if (change.isInterpolation || change.hasHandleOffsets) {
              if (editablePoint.side === "left") {
                point.leftHandleInOffsetX = change.handleInOffsetX;
                point.leftHandleInOffsetY = change.handleInOffsetY;
                point.leftHandleOutOffsetX = change.handleOutOffsetX;
                point.leftHandleOutOffsetY = change.handleOutOffsetY;
                delete point.leftHandleInOffset;
                delete point.leftHandleOutOffset;
              } else {
                point.rightHandleInOffsetX = change.handleInOffsetX;
                point.rightHandleInOffsetY = change.handleInOffsetY;
                point.rightHandleOutOffsetX = change.handleOutOffsetX;
                point.rightHandleOutOffsetY = change.handleOutOffsetY;
                delete point.rightHandleInOffset;
                delete point.rightHandleOutOffset;
              }
            }
          }

          const pathChange = recordChanges(layer.glyph, (sg) => {
            regenerateSkeletonContours(sg, working);
          });
          const customDataChange = recordChanges(layer, (l) => {
            setSkeletonData(l, JSON.parse(JSON.stringify(working)));
          });
          if (pathChange.hasChange) {
            allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));
          }
          if (customDataChange.hasChange) {
            allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
          }
        }

        if (!allChanges.length) {
          return;
        }
        const combined = new ChangeCollector().concat(...allChanges);
        sessionState.accumulatedChanges = sessionState.accumulatedChanges.concat(combined);
        await sendIncrementalChange(combined.change, isDrag);
      },
      onSessionEnd: async ({ sessionState, sendIncrementalChange }) => {
        if (sessionState.skip) {
          return;
        }
        if (isDrag) {
          await sendIncrementalChange(sessionState.accumulatedChanges.change);
        }
        return {
          changes: sessionState.accumulatedChanges,
          undoLabel: isDrag ? "Edit generated point" : "Nudge generated point",
          broadcast: true,
        };
      },
    });
  } finally {
    if (isDrag) {
      pointerTool.canvasController.canvas.style.cursor = previousCursor || "default";
    }
  }
  return true;
}

async function runEditableGeneratedHandleLikeCanonical(context, mode) {
  const isDrag = mode === "drag";
  const {
    pointerTool,
    sceneController,
    eventStream,
    initialEvent,
    event,
    editableHandles,
    runPointLikeInputKernel,
    runPointLikeSessionKernel,
  } = context;
  assert(pointerTool, "runEditableGeneratedHandleLikeCanonical: missing pointerTool");
  assert(sceneController, "runEditableGeneratedHandleLikeCanonical: missing sceneController");
  assert(
    typeof runPointLikeInputKernel === "function",
    "runEditableGeneratedHandleLikeCanonical: missing runPointLikeInputKernel"
  );
  assert(
    typeof runPointLikeSessionKernel === "function",
    "runEditableGeneratedHandleLikeCanonical: missing runPointLikeSessionKernel"
  );
  if (isDrag) {
    assert(eventStream, "runEditableGeneratedHandleLikeCanonical: missing eventStream");
    assert(initialEvent, "runEditableGeneratedHandleLikeCanonical: missing initialEvent");
  } else {
    assert(event, "runEditableGeneratedHandleLikeCanonical: missing event");
  }

  const positionedGlyph = pointerTool.sceneModel.getSelectedPositionedGlyph();
  const resolvedEditableHandles =
    editableHandles ||
    collectEditableGeneratedHandlesFromPointSelection({
      sceneController,
      pointerTool,
      pointSelection: parseSelection(sceneController.selection).point,
    });
  if (!positionedGlyph || !resolvedEditableHandles?.length) {
    return false;
  }

  const previousCursor = pointerTool.canvasController.canvas.style.cursor;
  if (isDrag) {
    pointerTool.canvasController.canvas.style.cursor = "pointer";
  }

  try {
    await runPointLikeSessionKernel({
      mode,
      runPointLikeInputKernel,
      withEditSession: (sessionFn) => sceneController.editGlyph(sessionFn),
      eventStream,
      initialEvent,
      event,
      getBehaviorNameForEvent: isDrag ? () => "editable-generated-handle" : undefined,
      getPointForEvent: isDrag
        ? (nextEvent) => {
            const localPoint = sceneController.localPoint(nextEvent);
            return {
              x: localPoint.x - positionedGlyph.x,
              y: localPoint.y - positionedGlyph.y,
            };
          }
        : undefined,
      onSessionStart: ({ glyph }) => {
        const layersData = {};
        for (const editLayerName of sceneController.editingLayerNames || []) {
          const layer = glyph.layers[editLayerName];
          const skeletonData = getSkeletonData(layer);
          if (!skeletonData) {
            continue;
          }
          layersData[editLayerName] = {
            layer,
            original: JSON.parse(JSON.stringify(skeletonData)),
            working: JSON.parse(JSON.stringify(skeletonData)),
            behaviors: [],
          };
        }

        for (const data of Object.values(layersData)) {
          const layerPath = data.layer?.glyph?.path;
          for (const editableHandle of resolvedEditableHandles) {
            const contour = data.original.contours?.[editableHandle.skeletonContourIndex];
            if (!contour) {
              continue;
            }
            const skeletonHandleDir = getSkeletonHandleDirectionForPoint(
              contour,
              editableHandle.skeletonPointIndex,
              editableHandle.handleType
            );
            if (!skeletonHandleDir) {
              continue;
            }
            let equalizeState = null;
            if (layerPath) {
              const equalizeInfo = getEqualizeHandleInfoForPointIndex(
                layerPath,
                editableHandle.pointIndex
              );
              if (equalizeInfo) {
                const anchorPos = layerPath.getPoint(equalizeInfo.smoothIndex);
                const draggedPos = layerPath.getPoint(equalizeInfo.pointIndex);
                const oppositePos = layerPath.getPoint(equalizeInfo.oppositeIndex);
                const oppositeHandleType =
                  editableHandle.handleType === "in" ? "out" : "in";
                const oppositeHandleDir = getSkeletonHandleDirectionForPoint(
                  contour,
                  editableHandle.skeletonPointIndex,
                  oppositeHandleType
                );
                if (anchorPos && draggedPos && oppositePos && oppositeHandleDir) {
                  const point = contour.points?.[editableHandle.skeletonPointIndex];
                  if (!point) {
                    continue;
                  }
                  const detachedKey =
                    editableHandle.side === "left"
                      ? "leftHandleDetached"
                      : "rightHandleDetached";
                  const detachedMode = !!point?.[detachedKey];
                  const draggedState = readEditableHandleEqualizeState({
                    point,
                    side: editableHandle.side,
                    handleType: editableHandle.handleType,
                    anchorPos,
                    currentHandlePos: draggedPos,
                    skeletonHandleDir,
                    detachedMode,
                  });
                  const oppositeState = readEditableHandleEqualizeState({
                    point,
                    side: editableHandle.side,
                    handleType: oppositeHandleType,
                    anchorPos,
                    currentHandlePos: oppositePos,
                    skeletonHandleDir: oppositeHandleDir,
                    detachedMode,
                  });
                  equalizeState = { anchorPos, draggedState, oppositeState };
                }
              }
            }
            data.behaviors.push({
              behavior: createEditableHandleBehavior(
                data.original,
                editableHandle,
                skeletonHandleDir
              ),
              editableHandle,
              skeletonHandleDir,
              equalizeState,
            });
          }
        }

        return {
          layersData,
          accumulatedChanges: new ChangeCollector(),
          equalizeUsed: false,
          skip: !Object.keys(layersData).length,
        };
      },
      onInput: async ({ event: inputEvent, delta, sessionState, sendIncrementalChange }) => {
        if (sessionState.skip) {
          return;
        }
        const roundFunc = isDrag ? makeRoundFunc(inputEvent) : Math.round;
        const allChanges = [];

        for (const [editLayerName, data] of Object.entries(sessionState.layersData)) {
          const { layer, original, working, behaviors } = data;

          for (const { behavior, editableHandle, skeletonHandleDir, equalizeState } of behaviors) {
            const contour = working.contours?.[editableHandle.skeletonContourIndex];
            const point = contour?.points?.[editableHandle.skeletonPointIndex];
            const baseContour = original.contours?.[editableHandle.skeletonContourIndex];
            const basePoint = baseContour?.points?.[editableHandle.skeletonPointIndex];
            if (!point || !basePoint) {
              continue;
            }

            if (pointerTool.equalizeMode && equalizeState) {
              const projectedDelta =
                delta.x * equalizeState.draggedState.direction.x +
                delta.y * equalizeState.draggedState.direction.y;
              const targetLength = Math.max(
                0,
                equalizeState.draggedState.originalLength + projectedDelta
              );
              applyEditableHandleEqualizedLength({
                point,
                state: equalizeState.draggedState,
                targetLength,
                anchorPos: equalizeState.anchorPos,
                roundFunc,
              });
              applyEditableHandleEqualizedLength({
                point,
                state: equalizeState.oppositeState,
                targetLength,
                anchorPos: equalizeState.anchorPos,
                roundFunc,
              });
              sessionState.equalizeUsed = true;
              continue;
            }

            const change = behavior.applyDelta(delta, roundFunc);
            const detachedKey =
              editableHandle.side === "left" ? "leftHandleDetached" : "rightHandleDetached";
            const { offset1DKey, offsetXKey, offsetYKey } = getEditableHandleOffsetKeys(
              editableHandle.side,
              editableHandle.handleType
            );

            if (point[detachedKey]) {
              const projectedDelta = delta.x * skeletonHandleDir.x + delta.y * skeletonHandleDir.y;
              const baseOffsetX = isDrag ? basePoint[offsetXKey] || 0 : point[offsetXKey] || 0;
              const baseOffsetY = isDrag ? basePoint[offsetYKey] || 0 : point[offsetYKey] || 0;
              point[offsetXKey] = baseOffsetX + roundFunc(skeletonHandleDir.x * projectedDelta);
              point[offsetYKey] = baseOffsetY + roundFunc(skeletonHandleDir.y * projectedDelta);
            } else {
              delete point[offsetXKey];
              delete point[offsetYKey];
              point[offset1DKey] = change.offset;
            }
          }

          const pathChange = recordChanges(layer.glyph, (sg) => {
            regenerateSkeletonContours(sg, working);
          });
          const customDataChange = recordChanges(layer, (l) => {
            setSkeletonData(l, JSON.parse(JSON.stringify(working)));
          });
          if (pathChange.hasChange) {
            allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));
          }
          if (customDataChange.hasChange) {
            allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
          }
        }

        if (!allChanges.length) {
          return;
        }
        const combined = new ChangeCollector().concat(...allChanges);
        sessionState.accumulatedChanges = sessionState.accumulatedChanges.concat(combined);
        await sendIncrementalChange(combined.change, isDrag);
      },
      onSessionEnd: async ({ sessionState, sendIncrementalChange }) => {
        if (sessionState.skip) {
          return;
        }
        if (isDrag) {
          await sendIncrementalChange(sessionState.accumulatedChanges.change);
        }
        return {
          changes: sessionState.accumulatedChanges,
          undoLabel: isDrag
            ? sessionState.equalizeUsed
              ? "Equalize editable rib handles"
              : "Edit generated handle"
            : sessionState.equalizeUsed
              ? "Nudge handles (equalize)"
              : "Nudge generated handle",
          broadcast: true,
        };
      },
    });
  } finally {
    if (isDrag) {
      pointerTool.canvasController.canvas.style.cursor = previousCursor || "default";
    }
  }
  return true;
}

async function runEditableGeneratedPointDragCanonical(context) {
  return runEditableGeneratedPointLikeCanonical(context, "drag");
}

async function runEditableGeneratedHandleDragCanonical(context) {
  return runEditableGeneratedHandleLikeCanonical(context, "drag");
}

async function runEditableGeneratedNudgeCanonical(context) {
  const { sceneController, pointerTool, editablePoints, editableHandles } = context;
  assert(sceneController, "runEditableGeneratedNudgeCanonical: missing sceneController");
  assert(pointerTool, "runEditableGeneratedNudgeCanonical: missing pointerTool");

  const pointSelection = parseSelection(sceneController.selection).point;
  const resolvedEditableHandles =
    editableHandles ||
    collectEditableGeneratedHandlesFromPointSelection({
      sceneController,
      pointerTool,
      pointSelection,
    });
  if (resolvedEditableHandles.length) {
    return runEditableGeneratedHandleLikeCanonical(
      {
        ...context,
        editableHandles: resolvedEditableHandles,
      },
      "nudge"
    );
  }

  const resolvedEditablePoints =
    editablePoints ||
    collectEditableGeneratedPointsFromPointSelection({
      sceneController,
      pointerTool,
      pointSelection,
    });
  if (resolvedEditablePoints.length) {
    return runEditableGeneratedPointLikeCanonical(
      {
        ...context,
        editablePoints: resolvedEditablePoints,
      },
      "nudge"
    );
  }
  return false;
}

async function runSkeletonRibPointNudgeCanonical(context) {
  const { pointerTool, sceneController, event, runPointLikeInputKernel } = context;
  assert(pointerTool, "runSkeletonRibPointNudgeCanonical: missing pointerTool");
  assert(sceneController, "runSkeletonRibPointNudgeCanonical: missing sceneController");
  assert(event, "runSkeletonRibPointNudgeCanonical: missing event");
  assert(
    typeof runPointLikeInputKernel === "function",
    "runSkeletonRibPointNudgeCanonical: missing runPointLikeInputKernel"
  );

  const { skeletonRibPoint: ribPointSelection } = parseSelection(
    sceneController.selection
  );
  if (!ribPointSelection?.size) {
    return false;
  }

  const positionedGlyph = pointerTool.sceneModel.getSelectedPositionedGlyph();
  const referenceLayerName = sceneController.editingLayerNames?.[0];
  const referenceLayer = referenceLayerName
    ? positionedGlyph?.varGlyph?.glyph?.layers?.[referenceLayerName]
    : null;
  const referenceSkeletonData = getSkeletonData(referenceLayer);
  if (!referenceSkeletonData?.contours?.length) {
    return false;
  }

  const ribTargets = collectSelectedRibPointTargets(
    referenceSkeletonData,
    ribPointSelection
  );
  if (!ribTargets.length) {
    return false;
  }

  const allTargetsEditable = ribTargets.every((target) => target.isEditable);
  const belongsToSingleSegment = selectedRibTargetsBelongToSingleSegment(
    ribTargets,
    referenceSkeletonData
  );
  if (!allTargetsEditable && !belongsToSingleSegment) {
    return false;
  }

  const constrainMode = pointerTool.tangentRibMode ? "tangent" : null;
  const useInterpolation = event.altKey;

  await runPointLikeInputKernel({
    mode: "nudge",
    event,
    onInput: async ({ delta }) => {
      await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
        const allChanges = [];

        for (const editLayerName of sceneController.editingLayerNames || []) {
          const layer = glyph.layers[editLayerName];
          const originalSkeletonData = getSkeletonData(layer);
          if (!originalSkeletonData?.contours?.length) {
            continue;
          }

          const workingSkeletonData = JSON.parse(JSON.stringify(originalSkeletonData));

          for (const target of ribTargets) {
            const { contourIndex, pointIndex, side } = target;
            const contour = workingSkeletonData.contours?.[contourIndex];
            const point = contour?.points?.[pointIndex];
            const baseContour = originalSkeletonData.contours?.[contourIndex];
            const basePoint = baseContour?.points?.[pointIndex];
            if (!contour || !baseContour || !point || !basePoint || point.type || basePoint.type) {
              continue;
            }

            const normal = calculateNormalAtSkeletonPoint(baseContour, pointIndex);
            if (!normal) {
              continue;
            }
            const contourDefaultWidth =
              baseContour.defaultWidth ?? contour.defaultWidth ?? DEFAULT_SKELETON_WIDTH;
            const editableKey = side === "left" ? "leftEditable" : "rightEditable";
            const isEditable = basePoint[editableKey] === true;
            const ribHit = {
              contourIndex,
              pointIndex,
              side,
              normal,
              onCurvePoint: point,
            };

            if (isEditable) {
              let behavior;
              if (useInterpolation) {
                const interpolationAxis = findRibInterpolationAxisFromSkeletonPath(
                  layer.glyph.path,
                  basePoint,
                  normal,
                  baseContour,
                  side
                );
                if (interpolationAxis) {
                  behavior = createInterpolatingRibBehavior(
                    originalSkeletonData,
                    ribHit,
                    interpolationAxis
                  );
                } else {
                  behavior = createEditableRibBehavior(originalSkeletonData, ribHit);
                }
                if (baseContour.singleSided) {
                  const leftHW = getPointHalfWidth(basePoint, contourDefaultWidth, "left");
                  const rightHW = getPointHalfWidth(basePoint, contourDefaultWidth, "right");
                  const totalWidth = leftHW + rightHW;
                  if (behavior.setOriginalHalfWidth) {
                    behavior.setOriginalHalfWidth(totalWidth);
                  } else {
                    behavior.originalHalfWidth = totalWidth;
                  }
                  behavior.minHalfWidth = 2;
                }
              } else {
                behavior = createEditableRibBehavior(originalSkeletonData, ribHit);
              }

              const change = behavior.applyDelta(delta, constrainMode);
              const linked = isWidthLinked(basePoint);
              const deltaWidth = change.halfWidth - behavior.originalHalfWidth;
              applyLinkedWidthDelta(
                point,
                basePoint,
                contourDefaultWidth,
                side,
                deltaWidth,
                linked,
                Math.round
              );
              if (change.nudge !== undefined) {
                point[side === "left" ? "leftNudge" : "rightNudge"] = change.nudge;
              }
              if (change.handleInOffsetX !== undefined) {
                point[side === "left" ? "leftHandleInOffsetX" : "rightHandleInOffsetX"] =
                  change.handleInOffsetX;
              }
              if (change.handleInOffsetY !== undefined) {
                point[side === "left" ? "leftHandleInOffsetY" : "rightHandleInOffsetY"] =
                  change.handleInOffsetY;
              }
              if (change.handleOutOffsetX !== undefined) {
                point[side === "left" ? "leftHandleOutOffsetX" : "rightHandleOutOffsetX"] =
                  change.handleOutOffsetX;
              }
              if (change.handleOutOffsetY !== undefined) {
                point[side === "left" ? "leftHandleOutOffsetY" : "rightHandleOutOffsetY"] =
                  change.handleOutOffsetY;
              }
              continue;
            }

            const behavior = createRibEditBehavior(originalSkeletonData, ribHit);
            const change = behavior.applyDelta(delta, constrainMode);
            const linked = isWidthLinked(basePoint);
            const deltaWidth = change.halfWidth - behavior.originalHalfWidth;
            applyLinkedWidthDelta(
              point,
              basePoint,
              contourDefaultWidth,
              side,
              deltaWidth,
              linked,
              Math.round
            );
          }

          const pathChange = recordChanges(layer.glyph, (sg) => {
            regenerateSkeletonContours(sg, workingSkeletonData);
          });
          const customDataChange = recordChanges(layer, (l) => {
            setSkeletonData(l, workingSkeletonData);
          });
          if (pathChange.hasChange) {
            allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));
          }
          if (customDataChange.hasChange) {
            allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
          }
        }

        if (!allChanges.length) {
          return;
        }

        const combined = new ChangeCollector().concat(...allChanges);
        await sendIncrementalChange(combined.change);

        return {
          changes: combined,
          undoLabel: translate("action.nudge-selection"),
          broadcast: true,
        };
      });
    },
  });
  return true;
}

async function runMixedSelectionNudgeLegacy({
  pointerTool,
  sceneController,
  event,
}) {
  const {
    skeletonPoint: skeletonPointSelection,
    point: regularPointSelection,
    anchor: anchorSelection,
    guideline: guidelineSelection,
  } = parseSelection(sceneController.selection);

  if (!skeletonPointSelection?.size) {
    return false;
  }

  const hasRegularSelection =
    (regularPointSelection?.length || 0) > 0 ||
    (anchorSelection?.length || 0) > 0 ||
    (guidelineSelection?.length || 0) > 0;
  if (!hasRegularSelection) {
    return false;
  }

  let [dx, dy] = arrowKeyDeltas[event.key];
  if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
    dx *= 100;
    dy *= 100;
  } else if (event.shiftKey) {
    dx *= 10;
    dy *= 10;
  }
  const delta = { x: dx, y: dy };

  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    const editLayerName = sceneController.editingLayerNames?.[0];
    if (!editLayerName || !glyph.layers[editLayerName]) {
      return;
    }

    const layer = glyph.layers[editLayerName];
    const skeletonData = getSkeletonData(layer);
    if (!skeletonData) {
      return;
    }

    const originalSkeletonData = JSON.parse(JSON.stringify(skeletonData));
    const workingSkeletonData = JSON.parse(JSON.stringify(skeletonData));
    const behaviorName = getSkeletonBehaviorName(false, event.altKey);
    const behaviors = createSkeletonPointExecutors(
      originalSkeletonData,
      skeletonPointSelection,
      behaviorName
    );

    for (const { contourIndex, executor } of behaviors) {
      const changes = executor.applyDelta(delta);
      const contour = workingSkeletonData.contours[contourIndex];
      for (const { pointIndex, x, y } of changes) {
        contour.points[pointIndex].x = x;
        contour.points[pointIndex].y = y;
      }
    }

    const allChanges = [];
    const regularRollbackParts = [];
    const layerInfo = Object.entries(
      sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
    ).map(([layerName, layerGlyph]) => {
      const behaviorFactory = new EditBehaviorFactory(
        layerGlyph,
        sceneController.selection,
        pointerTool.scalingEditBehavior
      );
      return {
        layerGlyph,
        changePath: ["layers", layerName, "glyph"],
        editBehavior: behaviorFactory.getBehavior(
          event.altKey ? "alternate" : "default"
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

    const staticGlyph = layer.glyph;
    const pathChange = recordChanges(staticGlyph, (sg) => {
      regenerateSkeletonContours(sg, workingSkeletonData, { preferInPlace: true });
    });
    allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]).change);

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
      changes: ChangeCollector.fromChanges(
        editChange,
        consolidateChanges(rollbackParts)
      ),
      undoLabel: translate("action.nudge-selection"),
      broadcast: true,
    };
  });

  return true;
}

async function runMixedSelectionDragCanonical({
  pointerTool,
  sceneController,
  eventStream,
  initialEvent,
  effectiveSkeletonPointSelection,
}) {
  const hasSkeletonSelection = effectiveSkeletonPointSelection?.size > 0;

  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    const initialPoint = sceneController.localPoint(initialEvent);
    const positionedGlyph = pointerTool.sceneModel.getSelectedPositionedGlyph();
    let behaviorName = getBehaviorName(initialEvent);
    const initialClickedPointIndex = sceneController.sceneModel.initialClickedPointIndex;
    let equalizeHandleInfo = null;
    if (positionedGlyph && initialClickedPointIndex !== undefined) {
      const candidate = findEqualizeHandleForPath(
        positionedGlyph,
        initialPoint,
        sceneController.mouseClickMargin
      );
      if (candidate && candidate.pointIndex === initialClickedPointIndex) {
        equalizeHandleInfo = candidate;
      }
    }

    const layerInfo = Object.entries(
      sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
    ).map(([layerName, layerGlyph]) => {
      const behaviorFactory = new EditBehaviorFactory(
        layerGlyph,
        sceneController.selection,
        pointerTool.scalingEditBehavior
      );
      return {
        layerName,
        layerGlyph,
        changePath: ["layers", layerName, "glyph"],
        connectDetector: sceneController.getPathConnectDetector(layerGlyph.path),
        shouldConnect: false,
        behaviorFactory,
        editBehavior: behaviorFactory.getBehavior(behaviorName),
      };
    });

    assert(layerInfo.length >= 1, "runMixedSelectionDragCanonical: no layer to edit");
    layerInfo[0].isPrimaryLayer = true;
    let equalizeUsed = false;
    const equalizeRollbackByLayer = new Map();
    if (equalizeHandleInfo) {
      for (const layer of layerInfo) {
        const draggedPoint = layer.layerGlyph.path.getPoint(equalizeHandleInfo.pointIndex);
        const oppositePoint = layer.layerGlyph.path.getPoint(equalizeHandleInfo.oppositeIndex);
        if (draggedPoint || oppositePoint) {
          equalizeRollbackByLayer.set(layer.layerName, {
            draggedPoint: draggedPoint
              ? {
                  x: draggedPoint.x,
                  y: draggedPoint.y,
                }
              : null,
            oppositePoint: oppositePoint
              ? {
                  x: oppositePoint.x,
                  y: oppositePoint.y,
                }
              : null,
          });
        }
      }
    }

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
          behaviors: createSkeletonPointExecutors(
            JSON.parse(JSON.stringify(skeletonData)),
            effectiveSkeletonPointSelection,
            getSkeletonBehaviorName(initialEvent.shiftKey, initialEvent.altKey)
          ),
          lastBehaviorName: getSkeletonBehaviorName(initialEvent.shiftKey, initialEvent.altKey),
        };
      }
    }

    let editChange;
    for await (const inputEvent of eventStream) {
      const newEditBehaviorName = getBehaviorName(inputEvent);
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

      if (skeletonEditState) {
        const newSkeletonBehaviorName = getSkeletonBehaviorName(
          inputEvent.shiftKey,
          inputEvent.altKey
        );
        if (newSkeletonBehaviorName !== skeletonEditState.lastBehaviorName) {
          skeletonEditState.lastBehaviorName = newSkeletonBehaviorName;
          skeletonEditState.behaviors = createSkeletonPointExecutors(
            skeletonEditState.originalSkeletonData,
            effectiveSkeletonPointSelection,
            newSkeletonBehaviorName
          );
        }
      }

      const currentPoint = sceneController.localPoint(inputEvent);
      const roundFunc = makeRoundFunc(inputEvent);
      const delta = {
        x: currentPoint.x - initialPoint.x,
        y: currentPoint.y - initialPoint.y,
      };
      const deepEditChanges = [];

      for (const layer of layerInfo) {
        const layerEditChange = layer.editBehavior.makeChangeForDelta(delta);
        applyChange(layer.layerGlyph, layerEditChange);
        deepEditChanges.push(consolidateChanges(layerEditChange, layer.changePath));
        layer.shouldConnect = layer.connectDetector.shouldConnect(layer.isPrimaryLayer);
      }

      if (pointerTool.equalizeMode && equalizeHandleInfo && positionedGlyph) {
        const { pointIndex, smoothIndex, oppositeIndex } = equalizeHandleInfo;
        const currentGlyphPoint = {
          x: currentPoint.x - positionedGlyph.x,
          y: currentPoint.y - positionedGlyph.y,
        };
        for (const layer of layerInfo) {
          const path = layer.layerGlyph.path;
          const smoothPt = path.getPoint(smoothIndex);
          if (!smoothPt) {
            continue;
          }
          let newDragVec = {
            x: currentGlyphPoint.x - smoothPt.x,
            y: currentGlyphPoint.y - smoothPt.y,
          };
          if (inputEvent.shiftKey) {
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
          deepEditChanges.push(consolidateChanges(equalizeChanges, layer.changePath));
          equalizeUsed = true;
        }
      }

      if (skeletonEditState) {
        const {
          originalSkeletonData,
          workingSkeletonData,
          behaviors,
          layer,
          editLayerName,
        } = skeletonEditState;

        for (let ci = 0; ci < originalSkeletonData.contours.length; ci++) {
          const origContour = originalSkeletonData.contours[ci];
          const workContour = workingSkeletonData.contours[ci];
          for (let pi = 0; pi < origContour.points.length; pi++) {
            workContour.points[pi].x = origContour.points[pi].x;
            workContour.points[pi].y = origContour.points[pi].y;
          }
        }

        const appliedFixedRib =
          pointerTool.fixedRibMode || pointerTool.fixedRibCompressMode
            ? applyFixedRibDragToSkeletonData(
                originalSkeletonData,
                workingSkeletonData,
                effectiveSkeletonPointSelection,
                resolveClickedSkeletonPoint(pointerTool, effectiveSkeletonPointSelection),
                delta,
                roundFunc,
                {
                  anchorToDragSide: pointerTool.fixedRibCompressMode,
                  scaleControlPoints: FIXED_RIB_SCALE_CONTROL_POINTS,
                }
              )
            : false;

        if (!appliedFixedRib) {
          for (const { contourIndex, executor } of behaviors) {
            const changes = executor.applyDelta(delta, roundFunc);
            const contour = workingSkeletonData.contours[contourIndex];
            for (const { pointIndex, x, y } of changes) {
              contour.points[pointIndex].x = x;
              contour.points[pointIndex].y = y;
            }
          }
        }

        const skeletonChanges = recordChanges(layer.glyph, (sg) => {
          regenerateSkeletonContours(sg, workingSkeletonData, { preferInPlace: true });
        });
        const skeletonDataChanges = recordChanges(layer, (layerRecord) => {
          setSkeletonData(layerRecord, JSON.parse(JSON.stringify(workingSkeletonData)));
        });
        if (skeletonChanges.hasChange) {
          deepEditChanges.push(
            skeletonChanges.prefixed(["layers", editLayerName, "glyph"]).change
          );
        }
        if (skeletonDataChanges.hasChange) {
          deepEditChanges.push(skeletonDataChanges.prefixed(["layers", editLayerName]).change);
        }
      }

      editChange = consolidateChanges(deepEditChanges);
      await sendIncrementalChange(editChange, true);
    }

    const rollbackChanges = [];
    const connectChanges = [];
    for (const layer of layerInfo) {
      rollbackChanges.push(
        consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
      );
      if (equalizeUsed && equalizeHandleInfo) {
        const { pointIndex, oppositeIndex } = equalizeHandleInfo;
        const rollbackPoints = equalizeRollbackByLayer.get(layer.layerName);
        if (rollbackPoints?.draggedPoint) {
          rollbackChanges.push(
            consolidateChanges(
              [{ f: "=xy", a: [pointIndex, rollbackPoints.draggedPoint.x, rollbackPoints.draggedPoint.y] }],
              layer.changePath
            )
          );
        }
        if (rollbackPoints?.oppositePoint) {
          rollbackChanges.push(
            consolidateChanges(
              [{ f: "=xy", a: [oppositeIndex, rollbackPoints.oppositePoint.x, rollbackPoints.oppositePoint.y] }],
              layer.changePath
            )
          );
        }
      }

      if (layer.shouldConnect) {
        const connectChange = recordChanges(layer.layerGlyph, (layerGlyph) => {
          connectContours(
            layerGlyph.path,
            sceneController.selection,
            sceneController.getPathConnectDetector(layer.layerGlyph.path)
          );
        });
        if (connectChange.hasChange) {
          editChange = consolidateChanges(editChange, connectChange.prefixed(layer.changePath).change);
          rollbackChanges.push(connectChange.prefixed(layer.changePath).rollbackChange);
          connectChanges.push(connectChange.prefixed(layer.changePath));
        }
      }
    }

    if (connectChanges.length) {
      await sendIncrementalChange(consolidateChanges(connectChanges.map((change) => change.change)));
    }

    return {
      undoLabel:
        connectChanges.length > 0
          ? translate("edit-tools-pointer.undo.drag-selection-and-connect-contours")
          : translate("edit-tools-pointer.undo.drag-selection"),
      changes: ChangeCollector.fromChanges(editChange, consolidateChanges(rollbackChanges)),
      broadcast: true,
    };
  });

  return true;
}

export const canonicalDragAdapters = {
  regularPoint: async (context) => runRegularPointLikeCanonical(context, "drag"),
  anchor: async (context) => runRegularPointLikeCanonical(context, "drag"),
  guideline: async (context) => runRegularPointLikeCanonical(context, "drag"),
  skeletonPoint: async (context) => runSkeletonPointLikeCanonical(context, "drag"),
  skeletonHandle: async (context) => runSkeletonHandlePointLikeCanonical(context, "drag"),
  skeletonRibPoint: async (context) => runSkeletonRibPointDragCanonical(context),
  editableGeneratedPoint: async (context) =>
    runEditableGeneratedPointDragCanonical(context),
  editableGeneratedHandle: async (context) =>
    runEditableGeneratedHandleDragCanonical(context),
};

export const canonicalNudgeAdapters = {
  regularPoint: async (context) => runRegularPointLikeCanonical(context, "nudge"),
  anchor: async (context) => runRegularPointLikeCanonical(context, "nudge"),
  guideline: async (context) => runRegularPointLikeCanonical(context, "nudge"),
  skeletonPoint: async (context) => runSkeletonPointLikeCanonical(context, "nudge"),
  skeletonHandle: async (context) => runSkeletonHandlePointLikeCanonical(context, "nudge"),
  skeletonRibPoint: async (context) => runSkeletonRibPointNudgeCanonical(context),
  editableGeneratedPoint: async (context) => runEditableGeneratedNudgeCanonical(context),
  editableGeneratedHandle: async (context) =>
    runEditableGeneratedNudgeCanonical(context),
};

export const legacyDragAdapters = {
  component: async (context) => runLegacyComponentDragAdapter(context),
  componentOrigin: async (context) => runLegacyComponentDragAdapter(context),
  componentTCenter: async (context) => runLegacyComponentDragAdapter(context),
  mixedSelection: async (context) => runMixedSelectionDragCanonical(context),
  tunniPoint: async (context) => runTunniDragLegacy(context),
  skeletonTunniPoint: async (context) => runSkeletonTunniDragLegacy(context),
};

export const legacyNudgeAdapters = {
  mixedSelection: async (context) => runMixedSelectionNudgeLegacy(context),
};
