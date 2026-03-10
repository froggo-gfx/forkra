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
import {
  snapToGrid,
  calculateTunniPoint,
  calculateTrueTunniPoint,
  calculateEqualizedControlPoints,
  areDistancesEqualized,
} from "@fontra/core/tunni-calculations.js";
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
// Adapter/composer contract:
// - adapters return `true` when they handled the route
// - adapters return `false` when the route is not applicable or cannot run
// - real undo/redo data stays inside adapter-owned edit sessions
//
// Shared point-like kernels live here because they are adapter-side infrastructure:
// - `runPointLikeInputKernel(...)` normalizes drag and nudge input
// - `runPointLikeSessionKernel(...)` wraps edit-session lifecycle
// Full session consumers use both helpers; valid input-only consumers call the
// input kernel directly without pretending every route shares one execution model.

// Shared adapter infrastructure

async function runPointLikeDragInput({
  mode,
  eventStream,
  initialEvent,
  getBehaviorNameForEvent,
  getPointForEvent,
  onBehaviorChanged,
  onInput,
}) {
  assert(mode === "drag", "runPointLikeDragInput: invalid mode");
  assert(eventStream, "runPointLikeDragInput: missing eventStream");
  assert(initialEvent, "runPointLikeDragInput: missing initialEvent");
  assert(
    typeof getBehaviorNameForEvent === "function",
    "runPointLikeDragInput: missing getBehaviorNameForEvent"
  );
  assert(
    typeof getPointForEvent === "function",
    "runPointLikeDragInput: missing getPointForEvent"
  );

  const initialPoint = getPointForEvent(initialEvent);
  let behaviorName = getBehaviorNameForEvent(initialEvent);

  for await (const dragEvent of eventStream) {
    const nextBehaviorName = getBehaviorNameForEvent(dragEvent);
    if (nextBehaviorName !== behaviorName) {
      behaviorName = nextBehaviorName;
      if (onBehaviorChanged) {
        await onBehaviorChanged({ behaviorName, event: dragEvent, initialPoint });
      }
    }
    const currentPoint = getPointForEvent(dragEvent);
    const delta = {
      x: currentPoint.x - initialPoint.x,
      y: currentPoint.y - initialPoint.y,
    };
    await onInput({
      mode,
      event: dragEvent,
      behaviorName,
      initialPoint,
      currentPoint,
      delta,
    });
  }
}

async function runPointLikeNudgeInput({ mode, event, getBehaviorNameForEvent, onInput }) {
  assert(mode === "nudge", "runPointLikeNudgeInput: invalid mode");
  assert(event, "runPointLikeNudgeInput: missing event");
  let [dx, dy] = arrowKeyDeltas[event.key] || [0, 0];
  if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
    dx *= 100;
    dy *= 100;
  } else if (event.shiftKey) {
    dx *= 10;
    dy *= 10;
  }
  const delta = { x: dx, y: dy };
  await onInput({
    mode,
    event,
    behaviorName:
      typeof getBehaviorNameForEvent === "function"
        ? getBehaviorNameForEvent(event)
        : undefined,
    delta,
  });
}

export async function runPointLikeInputKernel(options) {
  const { mode, onInput } = options;
  assert(mode === "drag" || mode === "nudge", "runPointLikeInputKernel: invalid mode");
  assert(typeof onInput === "function", "runPointLikeInputKernel: missing onInput");

  if (mode === "drag") {
    return runPointLikeDragInput(options);
  }
  return runPointLikeNudgeInput(options);
}

export async function runPointLikeSessionKernel({
  mode,
  withEditSession,
  eventStream,
  initialEvent,
  event,
  getBehaviorNameForEvent,
  getPointForEvent,
  onSessionStart,
  onBehaviorChanged,
  onInput,
  onSessionEnd,
}) {
  assert(mode === "drag" || mode === "nudge", "runPointLikeSessionKernel: invalid mode");
  assert(
    typeof withEditSession === "function",
    "runPointLikeSessionKernel: missing withEditSession"
  );
  assert(typeof onInput === "function", "runPointLikeSessionKernel: missing onInput");

  return withEditSession(async (sendIncrementalChange, glyph) => {
    const sessionState = onSessionStart
      ? (await onSessionStart({ mode, sendIncrementalChange, glyph })) || {}
      : {};

    await runPointLikeInputKernel({
      mode,
      eventStream,
      initialEvent,
      event,
      getBehaviorNameForEvent,
      getPointForEvent,
      onBehaviorChanged: onBehaviorChanged
        ? async (payload) => {
            await onBehaviorChanged({
              ...payload,
              mode,
              sessionState,
              sendIncrementalChange,
              glyph,
            });
          }
        : undefined,
      onInput: async (payload) => {
        await onInput({
          ...payload,
          mode,
          sessionState,
          sendIncrementalChange,
          glyph,
        });
      },
    });

    if (onSessionEnd) {
      return onSessionEnd({ mode, sessionState, sendIncrementalChange, glyph });
    }
  });
}

const DEFAULT_SKELETON_WIDTH = 80;
const FIXED_RIB_SCALE_CONTROL_POINTS = true;

function runGlyphEditSession(sceneController, sessionFn) {
  return sceneController.editGlyph(sessionFn);
}

function getPositionedGlyphPointForEvent(sceneController, positionedGlyph) {
  return (nextEvent) => {
    const localPoint = sceneController.localPoint(nextEvent);
    return {
      x: localPoint.x - positionedGlyph.x,
      y: localPoint.y - positionedGlyph.y,
    };
  };
}

async function withPointerCursor(pointerTool, activeCursor, callback) {
  const previousCursor = pointerTool.canvasController.canvas.style.cursor;
  pointerTool.canvasController.canvas.style.cursor = activeCursor;
  try {
    return await callback();
  } finally {
    pointerTool.canvasController.canvas.style.cursor = previousCursor || "default";
  }
}

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

function filterSelection(selection, predicate) {
  if (!selection?.size || typeof predicate !== "function") {
    return selection;
  }
  const filtered = new Set();
  for (const key of selection) {
    if (predicate(key)) {
      filtered.add(key);
    }
  }
  return filtered;
}

function segmentToSegmentPoints(segment) {
  if (!segment?.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }
  const { startPoint, endPoint, controlPoints } = segment;
  return [startPoint, controlPoints[0], controlPoints[1], endPoint];
}

function makeSegmentFromSegmentPoints(segmentPoints) {
  if (!segmentPoints || segmentPoints.length !== 4) {
    return null;
  }
  const [startPoint, controlPoint1, controlPoint2, endPoint] = segmentPoints;
  return {
    startPoint,
    endPoint,
    controlPoints: [controlPoint1, controlPoint2],
  };
}

export function buildSegmentsFromSkeletonPoints(points, isClosed) {
  const segments = [];
  const numPoints = points.length;
  if (numPoints < 2) {
    return segments;
  }

  const onCurveIndices = [];
  for (let i = 0; i < numPoints; i++) {
    if (!points[i].type) {
      onCurveIndices.push(i);
    }
  }
  if (onCurveIndices.length < 2) {
    return segments;
  }

  for (let i = 0; i < onCurveIndices.length; i++) {
    const startIdx = onCurveIndices[i];
    const isLast = i === onCurveIndices.length - 1;
    if (!isClosed && isLast) {
      continue;
    }
    const endIdx = isLast ? onCurveIndices[0] : onCurveIndices[i + 1];
    const startPoint = points[startIdx];
    const endPoint = points[endIdx];
    const controlPoints = [];
    const controlIndices = [];

    if (isLast) {
      for (let j = startIdx + 1; j < numPoints; j++) {
        if (points[j].type) {
          controlPoints.push(points[j]);
          controlIndices.push(j);
        }
      }
      for (let j = 0; j < endIdx; j++) {
        if (points[j].type) {
          controlPoints.push(points[j]);
          controlIndices.push(j);
        }
      }
    } else {
      for (let j = startIdx + 1; j < endIdx; j++) {
        if (points[j].type) {
          controlPoints.push(points[j]);
          controlIndices.push(j);
        }
      }
    }

    segments.push({
      startPoint,
      endPoint,
      controlPoints,
      startIndex: startIdx,
      endIndex: endIdx,
      controlIndices,
      segmentIndex: i,
    });
  }

  return segments;
}

export function calculateSkeletonTunniPoint(segment) {
  const segmentPoints = segmentToSegmentPoints(segment);
  return segmentPoints ? calculateTunniPoint(segmentPoints) : null;
}

export function calculateSkeletonTrueTunniPoint(segment) {
  const segmentPoints = segmentToSegmentPoints(segment);
  return segmentPoints ? calculateTrueTunniPoint(segmentPoints) : null;
}

export function calculateHandleTensionsForSegment(segment) {
  if (!segment?.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const { startPoint, endPoint, controlPoints } = segment;
  const [cp1, cp2] = controlPoints;
  const tensionPoint =
    calculateSkeletonTrueTunniPoint(segment) || calculateSkeletonTunniPoint(segment);
  if (!tensionPoint) {
    return null;
  }

  const distStart = vector.distance(startPoint, tensionPoint);
  const distEnd = vector.distance(endPoint, tensionPoint);
  const lenStart = vector.distance(startPoint, cp1);
  const lenEnd = vector.distance(endPoint, cp2);
  const tensionStart = distStart > 1e-6 ? lenStart / distStart : null;
  const tensionEnd = distEnd > 1e-6 ? lenEnd / distEnd : null;
  return { tensionStart, tensionEnd, lenStart, lenEnd };
}

export function computeHandleLengthsFromTensions(
  startPoint,
  startDir,
  endPoint,
  endDir,
  tensionStart,
  tensionEnd
) {
  const line1End = vector.addVectors(startPoint, vector.normalizeVector(startDir));
  const line2End = vector.addVectors(endPoint, vector.normalizeVector(endDir));
  const intersection = vector.intersect(startPoint, line1End, endPoint, line2End);

  let distStartToTunni;
  let distEndToTunni;
  if (intersection && Number.isFinite(intersection.t1) && Number.isFinite(intersection.t2)) {
    distStartToTunni = Math.abs(intersection.t1);
    distEndToTunni = Math.abs(intersection.t2);
  } else {
    const fallbackDistance = vector.distance(startPoint, endPoint) / 2;
    distStartToTunni = fallbackDistance;
    distEndToTunni = fallbackDistance;
  }

  return {
    startLen: Number.isFinite(tensionStart) ? tensionStart * distStartToTunni : null,
    endLen: Number.isFinite(tensionEnd) ? tensionEnd * distEndToTunni : null,
  };
}

export function calculateSkeletonControlPointsFromTunniDelta(
  delta,
  segment,
  preserveTensions = true
) {
  if (!segment.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const { startPoint, endPoint, controlPoints } = segment;
  const [cp1, cp2] = controlPoints;
  const dir1 = vector.normalizeVector(vector.subVectors(cp1, startPoint));
  const dir2 = vector.normalizeVector(vector.subVectors(cp2, endPoint));
  const fortyFiveVec = vector.normalizeVector(vector.addVectors(dir1, dir2));
  const projection = delta.x * fortyFiveVec.x + delta.y * fortyFiveVec.y;

  if (preserveTensions) {
    const trueTunni = calculateSkeletonTrueTunniPoint(segment);
    if (trueTunni) {
      const distToTunni1 = vector.distance(startPoint, trueTunni);
      const distToTunni2 = vector.distance(endPoint, trueTunni);
      if (distToTunni1 > 0 && distToTunni2 > 0) {
        const totalDist = distToTunni1 + distToTunni2;
        const k = (2 * projection) / totalDist;
        const move1 = k * distToTunni1;
        const move2 = k * distToTunni2;
        return [
          { x: cp1.x + dir1.x * move1, y: cp1.y + dir1.y * move1 },
          { x: cp2.x + dir2.x * move2, y: cp2.y + dir2.y * move2 },
        ];
      }
    }
    return [
      { x: cp1.x + dir1.x * projection, y: cp1.y + dir1.y * projection },
      { x: cp2.x + dir2.x * projection, y: cp2.y + dir2.y * projection },
    ];
  }

  const projection1 = delta.x * dir1.x + delta.y * dir1.y;
  const projection2 = delta.x * dir2.x + delta.y * dir2.y;
  return [
    { x: cp1.x + dir1.x * projection1, y: cp1.y + dir1.y * projection1 },
    { x: cp2.x + dir2.x * projection2, y: cp2.y + dir2.y * projection2 },
  ];
}

export function calculateSkeletonOnCurveFromTunni(
  newTrueTunniPoint,
  segment,
  equalizeDistances = true
) {
  if (!segment.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }

  const { startPoint, endPoint, controlPoints } = segment;
  const [cp1, cp2] = controlPoints;
  const origTrueTunni = vector.intersect(startPoint, cp1, endPoint, cp2);
  if (!origTrueTunni) {
    return null;
  }

  const dir1 = vector.normalizeVector(vector.subVectors(cp1, startPoint));
  const dir2 = vector.normalizeVector(vector.subVectors(cp2, endPoint));
  const delta = vector.subVectors(newTrueTunniPoint, origTrueTunni);
  const projection1 = delta.x * dir1.x + delta.y * dir1.y;
  const projection2 = delta.x * dir2.x + delta.y * dir2.y;
  const finalProjection1 = equalizeDistances ? (projection1 + projection2) / 2 : projection1;
  const finalProjection2 = equalizeDistances ? (projection1 + projection2) / 2 : projection2;

  return {
    newStartPoint: {
      x: startPoint.x + dir1.x * finalProjection1,
      y: startPoint.y + dir1.y * finalProjection1,
    },
    newEndPoint: {
      x: endPoint.x + dir2.x * finalProjection2,
      y: endPoint.y + dir2.y * finalProjection2,
    },
  };
}

export function skeletonTunniHitTest(point, size, skeletonData, options = {}) {
  if (!skeletonData?.contours) {
    return null;
  }

  const { midpointOnly = false } = options;
  for (let contourIndex = 0; contourIndex < skeletonData.contours.length; contourIndex++) {
    const contour = skeletonData.contours[contourIndex];
    const segments = buildSegmentsFromSkeletonPoints(contour.points, contour.isClosed);
    for (const segment of segments) {
      if (segment.controlPoints.length !== 2) {
        continue;
      }
      if (!midpointOnly) {
        const trueTunniPt = calculateSkeletonTrueTunniPoint(segment);
        if (trueTunniPt && vector.distance(point, trueTunniPt) <= size) {
          return {
            type: "true-tunni",
            contourIndex,
            segmentIndex: segment.segmentIndex,
            segment,
            tunniPoint: trueTunniPt,
          };
        }
      }
      const tunniPt = calculateSkeletonTunniPoint(segment);
      if (tunniPt && vector.distance(point, tunniPt) <= size) {
        return {
          type: "tunni",
          contourIndex,
          segmentIndex: segment.segmentIndex,
          segment,
          tunniPoint: tunniPt,
        };
      }
    }
  }

  return null;
}

export function calculateSkeletonEqualizedControlPoints(segment) {
  const segmentPoints = segmentToSegmentPoints(segment);
  return segmentPoints ? calculateEqualizedControlPoints(segmentPoints) : null;
}

export function areSkeletonTensionsEqualized(segment, tolerance = 0.01) {
  if (!segment.controlPoints || segment.controlPoints.length !== 2) {
    return true;
  }

  const { startPoint, endPoint, controlPoints } = segment;
  const [cp1, cp2] = controlPoints;
  const trueTunni = calculateSkeletonTrueTunniPoint(segment);
  if (!trueTunni) {
    return true;
  }

  const distStartToTunni = vector.distance(startPoint, trueTunni);
  const distEndToTunni = vector.distance(endPoint, trueTunni);
  if (distStartToTunni <= 0 || distEndToTunni <= 0) {
    return true;
  }

  const tension1 = vector.distance(startPoint, cp1) / distStartToTunni;
  const tension2 = vector.distance(endPoint, cp2) / distEndToTunni;
  return Math.abs(tension1 - tension2) < tolerance;
}

function getSkeletonGeneratedContourIndexSet(positionedGlyph, editLayerName) {
  const layerName = editLayerName || positionedGlyph?.glyph?.layerName;
  const layer = positionedGlyph?.varGlyph?.glyph?.layers?.[layerName];
  const indices = getSkeletonData(layer)?.generatedContourIndices || [];
  return new Set(indices);
}

export function tunniLayerHitTest(point, size, positionedGlyph, options = {}) {
  if (!positionedGlyph?.glyph?.path) {
    return null;
  }

  const path = positionedGlyph.glyph.path;
  const generatedContourIndices = getSkeletonGeneratedContourIndexSet(
    positionedGlyph,
    options.editLayerName
  );

  for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
    if (generatedContourIndices.has(contourIndex)) {
      continue;
    }
    for (const segment of path.iterContourDecomposedSegments(contourIndex)) {
      if (segment.points.length !== 4) {
        continue;
      }
      const pointTypes = segment.parentPointIndices.map((index) => path.pointTypes[index]);
      if (pointTypes[1] !== 2 || pointTypes[2] !== 2) {
        continue;
      }

      const trueTunniPoint = calculateTrueTunniPoint(segment.points);
      const visualTunniPoint = calculateTunniPoint(segment.points);

      if (trueTunniPoint && vector.distance(point, trueTunniPoint) <= size) {
        return {
          tunniPoint: trueTunniPoint,
          segment,
          segmentPoints: segment.points,
          contourIndex,
          hitType: "true-tunni-point",
        };
      }

      if (visualTunniPoint && vector.distance(point, visualTunniPoint) <= size) {
        return {
          tunniPoint: visualTunniPoint,
          segment,
          segmentPoints: segment.points,
          contourIndex,
          hitType: "tunni-point",
        };
      }
    }
  }

  return null;
}

async function equalizeThenQuantizeSegmentControlPoints(
  segment,
  segmentPoints,
  sceneController
) {
  const equalizedControlPoints = calculateEqualizedControlPoints(segmentPoints);
  const quantizedControlPoints = [
    snapToGrid(equalizedControlPoints[0]),
    snapToGrid(equalizedControlPoints[1]),
  ];

  await sceneController.editLayersAndRecordChanges((layerGlyphs) => {
    let changed = false;
    for (const layerGlyph of Object.values(layerGlyphs)) {
      const path = layerGlyph.path;
      if (!path || !segment?.parentPointIndices) {
        continue;
      }

      const controlPoint1Index = segment.parentPointIndices[1];
      const controlPoint2Index = segment.parentPointIndices[2];
      if (controlPoint1Index === undefined || controlPoint2Index === undefined) {
        continue;
      }

      const cp1 = path.getPoint(controlPoint1Index);
      const cp2 = path.getPoint(controlPoint2Index);
      if (!cp1 || !cp2) {
        continue;
      }

      const q1 = quantizedControlPoints[0];
      const q2 = quantizedControlPoints[1];

      if (cp1.x !== q1.x || cp1.y !== q1.y) {
        path.setPointPosition(controlPoint1Index, q1.x, q1.y);
        changed = true;
      }
      if (cp2.x !== q2.x || cp2.y !== q2.y) {
        path.setPointPosition(controlPoint2Index, q2.x, q2.y);
        changed = true;
      }
    }

    return changed ? "Equalize and Quantize Tunni Control Points" : undefined;
  });
}

function handleTunniPointMouseDown(initialEvent, sceneController, visualizationLayerSettings) {
  if (
    !visualizationLayerSettings.model["fontra.tunni.combined"] &&
    !visualizationLayerSettings.model["fontra.tunni.actual.points"]
  ) {
    return null;
  }

  const point = sceneController.localPoint(initialEvent);
  const size = sceneController.mouseClickMargin;
  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return null;
  }

  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };
  const hit = tunniLayerHitTest(glyphPoint, size, positionedGlyph, {
    editLayerName: sceneController.sceneModel?.sceneSettings?.editLayerName,
  });
  if (!hit) {
    return null;
  }

  const [initialOnPoint1, initialOffPoint1, initialOffPoint2, initialOnPoint2] = hit.segmentPoints.map(
    (segmentPoint) => ({ ...segmentPoint })
  );
  const initialVector1 = {
    x: initialOffPoint1.x - initialOnPoint1.x,
    y: initialOffPoint1.y - initialOnPoint1.y,
  };
  const initialVector2 = {
    x: initialOffPoint2.x - initialOnPoint2.x,
    y: initialOffPoint2.y - initialOnPoint2.y,
  };
  const length1 = Math.hypot(initialVector1.x, initialVector1.y);
  const length2 = Math.hypot(initialVector2.x, initialVector2.y);
  const unitVector1 =
    length1 > 0 ? { x: initialVector1.x / length1, y: initialVector1.y / length1 } : { x: 1, y: 0 };
  const unitVector2 =
    length2 > 0 ? { x: initialVector2.x / length2, y: initialVector2.y / length2 } : { x: 1, y: 0 };

  const fortyFiveVector = {
    x: (unitVector1.x + unitVector2.x) / 2,
    y: (unitVector1.y + unitVector2.y) / 2,
  };
  const fortyFiveLength = Math.hypot(fortyFiveVector.x, fortyFiveVector.y);
  if (fortyFiveLength > 0) {
    fortyFiveVector.x /= fortyFiveLength;
    fortyFiveVector.y /= fortyFiveLength;
  }

  const path = positionedGlyph.glyph.path;
  const controlPoint1Index = hit.segment.parentPointIndices[1];
  const controlPoint2Index = hit.segment.parentPointIndices[2];
  const originalControlPoints =
    controlPoint1Index !== undefined && controlPoint2Index !== undefined
      ? {
          controlPoint1Index,
          controlPoint2Index,
          originalControlPoint1: { ...path.getPoint(controlPoint1Index) },
          originalControlPoint2: { ...path.getPoint(controlPoint2Index) },
        }
      : null;

  return {
    initialMousePosition: glyphPoint,
    initialOnPoint1,
    initialOffPoint1,
    initialOffPoint2,
    initialOnPoint2,
    initialVector1,
    initialVector2,
    unitVector1,
    unitVector2,
    fortyFiveVector,
    selectedSegment: hit.segment,
    originalSegmentPoints: [...hit.segmentPoints],
    originalControlPoints,
    tunniPointHit: hit,
  };
}

function calculateTunniPointDragChanges(event, initialState, sceneController, gridSnapEnabled = false) {
  if (
    !initialState?.initialMousePosition ||
    !initialState?.initialOffPoint1 ||
    !initialState?.initialOffPoint2 ||
    !initialState?.selectedSegment ||
    !initialState?.originalSegmentPoints
  ) {
    return null;
  }

  const point = sceneController.localPoint(event);
  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return null;
  }
  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };
  const mouseDelta = {
    x: glyphPoint.x - initialState.initialMousePosition.x,
    y: glyphPoint.y - initialState.initialMousePosition.y,
  };

  const segment = makeSegmentFromSegmentPoints(initialState.originalSegmentPoints);
  const newControlPoints = calculateSkeletonControlPointsFromTunniDelta(
    mouseDelta,
    segment,
    !event.altKey
  );
  if (!newControlPoints) {
    return null;
  }

  let [newControlPoint1, newControlPoint2] = newControlPoints;

  if (gridSnapEnabled) {
    newControlPoint1 = snapToGrid(newControlPoint1);
    newControlPoint2 = snapToGrid(newControlPoint2);
  }

  return {
    controlPoint1Index: initialState.selectedSegment.parentPointIndices[1],
    controlPoint2Index: initialState.selectedSegment.parentPointIndices[2],
    newControlPoint1,
    newControlPoint2,
  };
}

function handleTrueTunniPointMouseDown(initialEvent, sceneController, visualizationLayerSettings) {
  const initialState = handleTunniPointMouseDown(
    initialEvent,
    sceneController,
    visualizationLayerSettings
  );
  if (!initialState?.tunniPointHit || initialState.tunniPointHit.hitType !== "true-tunni-point") {
    return null;
  }
  return {
    ...initialState,
    hitType: "true-tunni-point",
  };
}

function calculateTrueTunniPointDragChanges(
  event,
  initialState,
  sceneController,
  gridSnapEnabled = false
) {
  if (
    !initialState?.initialMousePosition ||
    !initialState?.initialOnPoint1 ||
    !initialState?.initialOnPoint2 ||
    !initialState?.selectedSegment ||
    !initialState?.originalSegmentPoints
  ) {
    return null;
  }

  const point = sceneController.localPoint(event);
  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return null;
  }
  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };
  const mouseDelta = {
    x: glyphPoint.x - initialState.initialMousePosition.x,
    y: glyphPoint.y - initialState.initialMousePosition.y,
  };

  const segment = makeSegmentFromSegmentPoints(initialState.originalSegmentPoints);
  const originalTrueTunniPoint = calculateTrueTunniPoint(initialState.originalSegmentPoints);
  if (!segment || !originalTrueTunniPoint) {
    return null;
  }
  const result = calculateSkeletonOnCurveFromTunni(
    {
      x: originalTrueTunniPoint.x + mouseDelta.x,
      y: originalTrueTunniPoint.y + mouseDelta.y,
    },
    segment,
    !event.altKey
  );
  if (!result) {
    return null;
  }

  let newOnPoint1 = result.newStartPoint;
  let newOnPoint2 = result.newEndPoint;
  if (gridSnapEnabled) {
    newOnPoint1 = snapToGrid(newOnPoint1);
    newOnPoint2 = snapToGrid(newOnPoint2);
  }

  return {
    onPoint1Index: initialState.selectedSegment.parentPointIndices[0],
    onPoint2Index: initialState.selectedSegment.parentPointIndices[3],
    newOnPoint1,
    newOnPoint2,
    controlPoint1Index: initialState.originalControlPoints.controlPoint1Index,
    controlPoint2Index: initialState.originalControlPoints.controlPoint2Index,
    newControlPoint1: initialState.initialOffPoint1,
    newControlPoint2: initialState.initialOffPoint2,
  };
}

// Editable-generated helper block
// Handle/equalize helpers

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

// Selection/working-state helpers

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

function collectEditableGeneratedPointIndices(editablePoints = [], editableHandles = []) {
  const pointIndices = new Set();
  for (const { pointIndex } of editablePoints) {
    pointIndices.add(pointIndex);
  }
  for (const { pointIndex } of editableHandles) {
    pointIndices.add(pointIndex);
  }
  return pointIndices;
}

function excludePointIndicesFromSelection(selection, excludedPointIndices) {
  if (!selection?.size || !excludedPointIndices?.size) {
    return selection;
  }
  return filterSelection(selection, (key) => {
    const [type, indexText] = key.split("/");
    if (type !== "point") {
      return true;
    }
    return !excludedPointIndices.has(parseInt(indexText, 10));
  });
}

function createEditableGeneratedLayersData(glyph, editingLayerNames) {
  const layersData = {};
  for (const editLayerName of editingLayerNames || []) {
    const layer = glyph.layers[editLayerName];
    const skeletonData = getSkeletonData(layer);
    if (!skeletonData) {
      continue;
    }
    layersData[editLayerName] = {
      layer,
      original: cloneSkeletonData(skeletonData),
      working: cloneSkeletonData(skeletonData),
      behaviors: [],
    };
  }
  return layersData;
}

function cloneSkeletonData(skeletonData) {
  return JSON.parse(JSON.stringify(skeletonData));
}

// Mixed skeleton-backed helper block

function createSkeletonBackedMixedEditState({
  glyph,
  sceneController,
  pointerTool,
  effectiveSkeletonPointSelection,
  editablePoints = [],
  editableHandles = [],
  skeletonBehaviorName,
  useInterpolation,
}) {
  const positionedGlyph = pointerTool.sceneModel.getSelectedPositionedGlyph();
  const generatedPath = positionedGlyph?.glyph?.path;
  const primaryEditLayerName = sceneController.editingLayerNames?.[0];
  const layersData = {};

  for (const editLayerName of sceneController.editingLayerNames || []) {
    const layer = glyph.layers[editLayerName];
    const skeletonData = getSkeletonData(layer);
    if (!skeletonData) {
      continue;
    }

    const original = cloneSkeletonData(skeletonData);
    const data = {
      editLayerName,
      layer,
      original,
      working: cloneSkeletonData(skeletonData),
      skeletonBehaviors:
        effectiveSkeletonPointSelection?.size && editLayerName === primaryEditLayerName
          ? createSkeletonPointExecutors(
              original,
              effectiveSkeletonPointSelection,
              skeletonBehaviorName
            )
          : [],
      pointBehaviors: [],
      handleBehaviors: [],
    };

    for (const editablePoint of editablePoints) {
      const contour = original.contours?.[editablePoint.skeletonContourIndex];
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
      if (useInterpolation && generatedPath) {
        const interpolationAxis = buildRibInterpolationAxisFromPath(
          generatedPath,
          editablePoint.pointIndex
        );
        behavior = interpolationAxis
          ? createInterpolatingRibBehavior(original, ribHit, interpolationAxis)
          : createEditableRibBehavior(original, ribHit);
      } else {
        behavior = createEditableRibBehavior(original, ribHit);
      }
      data.pointBehaviors.push({ behavior, editablePoint });
    }

    const layerPath = layer?.glyph?.path;
    for (const editableHandle of editableHandles) {
      const contour = original.contours?.[editableHandle.skeletonContourIndex];
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

      data.handleBehaviors.push({
        behavior: createEditableHandleBehavior(original, editableHandle, skeletonHandleDir),
        editableHandle,
        skeletonHandleDir,
        equalizeState,
      });
    }

    layersData[editLayerName] = data;
  }

  return {
    primaryEditLayerName,
    layersData,
    latestRollbackChanges: [],
    lastSkeletonBehaviorName: skeletonBehaviorName,
  };
}

function updateSkeletonBackedMixedBehaviors(
  editState,
  effectiveSkeletonPointSelection,
  skeletonBehaviorName
) {
  if (!effectiveSkeletonPointSelection?.size) {
    return;
  }
  const primaryLayerData = editState.layersData?.[editState.primaryEditLayerName];
  if (!primaryLayerData) {
    return;
  }
  primaryLayerData.skeletonBehaviors = createSkeletonPointExecutors(
    primaryLayerData.original,
    effectiveSkeletonPointSelection,
    skeletonBehaviorName
  );
  editState.lastSkeletonBehaviorName = skeletonBehaviorName;
}

function applySkeletonBackedMixedDelta({
  editState,
  pointerTool,
  effectiveSkeletonPointSelection,
  clickedSkeletonPoint,
  delta,
  roundFunc,
  preferInPlace,
  constrainMode = null,
}) {
  const allChanges = [];
  const rollbackChanges = [];
  let equalizeUsed = false;

  for (const data of Object.values(editState.layersData)) {
    const { editLayerName, layer, original, pointBehaviors, handleBehaviors } = data;
    const working = cloneSkeletonData(original);
    data.working = working;

    if (data.skeletonBehaviors?.length) {
      const appliedFixedRib =
        pointerTool.fixedRibMode || pointerTool.fixedRibCompressMode
          ? applyFixedRibDragToSkeletonData(
              original,
              working,
              effectiveSkeletonPointSelection,
              clickedSkeletonPoint,
              delta,
              roundFunc,
              {
                anchorToDragSide: pointerTool.fixedRibCompressMode,
                scaleControlPoints: FIXED_RIB_SCALE_CONTROL_POINTS,
              }
            )
          : false;

      if (!appliedFixedRib) {
        for (const { contourIndex, executor } of data.skeletonBehaviors) {
          const changes = executor.applyDelta(delta, roundFunc);
          const contour = working.contours?.[contourIndex];
          if (!contour) {
            continue;
          }
          for (const { pointIndex, x, y } of changes) {
            contour.points[pointIndex].x = x;
            contour.points[pointIndex].y = y;
          }
        }
      }
    }

    for (const { behavior, editablePoint } of pointBehaviors) {
      const contour = working.contours?.[editablePoint.skeletonContourIndex];
      const point = contour?.points?.[editablePoint.skeletonPointIndex];
      const baseContour = original.contours?.[editablePoint.skeletonContourIndex];
      const basePoint = baseContour?.points?.[editablePoint.skeletonPointIndex];
      if (!contour || !point || !baseContour || !basePoint || point.type || basePoint.type) {
        continue;
      }

      const change = behavior.applyDelta(delta, constrainMode, roundFunc);
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

    for (const { behavior, editableHandle, skeletonHandleDir, equalizeState } of handleBehaviors) {
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
        equalizeUsed = true;
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
        const baseOffsetX = basePoint[offsetXKey] || 0;
        const baseOffsetY = basePoint[offsetYKey] || 0;
        point[offsetXKey] = baseOffsetX + roundFunc(skeletonHandleDir.x * projectedDelta);
        point[offsetYKey] = baseOffsetY + roundFunc(skeletonHandleDir.y * projectedDelta);
      } else {
        delete point[offsetXKey];
        delete point[offsetYKey];
        point[offset1DKey] = change.offset;
      }
    }

    const persistenceChanges = collectSkeletonLayerPersistenceChanges({
      layer,
      working,
      editLayerName,
      regenerateOptions: preferInPlace ? { preferInPlace: true } : undefined,
      cloneOnPersist: true,
    });
    allChanges.push(...persistenceChanges);
    rollbackChanges.push(...persistenceChanges.map((change) => change.rollbackChange));
  }

  editState.latestRollbackChanges = rollbackChanges;
  return {
    combinedChanges: allChanges.length ? new ChangeCollector().concat(...allChanges) : null,
    equalizeUsed,
  };
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

// Skeleton-owned helper block

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
            const rotated = useTransform ? vector.rotateVector(rel, cos, sin) : rel;
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
      original: cloneSkeletonData(skeletonData),
      working: cloneSkeletonData(skeletonData),
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
      cloneOnPersist ? cloneSkeletonData(working) : working
    );
  });
  const prefixedCustomData = customDataChange.prefixed(["layers", editLayerName]);

  return { prefixedPath, prefixedCustomData };
}

function collectSkeletonLayerPersistenceChanges(options) {
  const { prefixedPath, prefixedCustomData } = makeSkeletonLayerPersistenceChanges(options);
  return [prefixedPath, prefixedCustomData].filter((change) => change.hasChange);
}

async function runRegularPointLikeOrchestration({
  mode,
  sceneController,
  selection,
  pointerTool,
  eventStream,
  initialEvent,
  event,
  equalizeHandleInfo: equalizeHandleInfoOverride,
}) {
  assert(sceneController, "runRegularPointLikeOrchestration: missing sceneController");
  assert(pointerTool, "runRegularPointLikeOrchestration: missing pointerTool");

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
    withEditSession: (sessionFn) => runGlyphEditSession(sceneController, sessionFn),
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

// Regular point-like routes

async function runRegularPointLikeAdapter({
  mode,
  pointerTool,
  selection,
  equalizeHandleInfo,
  eventStream,
  initialEvent,
  event,
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
    equalizeHandleInfo,
  });
  return true;
}

async function runFallbackTunniDrag({ pointerTool, eventStream, initialEvent }) {
  const sceneController = pointerTool.sceneController;
  const isTunniCombinedLayerActive =
    pointerTool.editor.visualizationLayersSettings.model["fontra.tunni.combined"];
  const isTunniActualLayerActive =
    pointerTool.editor.visualizationLayersSettings.model["fontra.tunni.actual.points"];
  let tunniInitialState = null;
  let isTrueTunniPoint = false;

  if (isTunniCombinedLayerActive || isTunniActualLayerActive) {
    if (isTunniActualLayerActive) {
      tunniInitialState = handleTrueTunniPointMouseDown(
        initialEvent,
        sceneController,
        pointerTool.editor.visualizationLayersSettings
      );
      if (tunniInitialState) {
        isTrueTunniPoint = true;
      }
    }
    if (!tunniInitialState && isTunniCombinedLayerActive) {
      tunniInitialState = handleTunniPointMouseDown(
        initialEvent,
        sceneController,
        pointerTool.editor.visualizationLayersSettings
      );
    }
  }

  if (!tunniInitialState) {
    return false;
  }

  if (!isTrueTunniPoint && initialEvent.ctrlKey && initialEvent.shiftKey) {
    await equalizeThenQuantizeSegmentControlPoints(
      tunniInitialState.tunniPointHit.segment,
      tunniInitialState.originalSegmentPoints,
      sceneController
    );
    return true;
  }

  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    let finalChanges = null;
    const layerInfo = Object.entries(
      sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
    ).map(([layerName, layerGlyph]) => ({
      layerName,
      layerGlyph,
      changePath: ["layers", layerName, "glyph"],
    }));

    assert(layerInfo.length >= 1, "no layer to edit");

    let originalOnPoint1;
    let originalOnPoint2;
    if (isTrueTunniPoint) {
      originalOnPoint1 = {
        ...layerInfo[0].layerGlyph.path.getPoint(
          tunniInitialState.selectedSegment.parentPointIndices[0]
        ),
      };
      originalOnPoint2 = {
        ...layerInfo[0].layerGlyph.path.getPoint(
          tunniInitialState.selectedSegment.parentPointIndices[3]
        ),
      };
    } else {
      originalOnPoint1 = {
        ...layerInfo[0].layerGlyph.path.getPoint(
          tunniInitialState.originalControlPoints.controlPoint1Index
        ),
      };
      originalOnPoint2 = {
        ...layerInfo[0].layerGlyph.path.getPoint(
          tunniInitialState.originalControlPoints.controlPoint2Index
        ),
      };
    }

    for await (const event of eventStream) {
      if (event.type === "mouseup") {
        break;
      }
      if (event.type !== "mousemove") {
        continue;
      }

      const dragChanges = isTrueTunniPoint
        ? calculateTrueTunniPointDragChanges(
            event,
            tunniInitialState,
            sceneController,
            sceneController.sceneSettings?.gridSnapEnabled
          )
        : calculateTunniPointDragChanges(
            event,
            tunniInitialState,
            sceneController,
            sceneController.sceneSettings?.gridSnapEnabled
          );

      if (!dragChanges) {
        continue;
      }

      finalChanges = dragChanges;
      const deepEditChanges = [];
      for (const layer of layerInfo) {
        const tempChanges = isTrueTunniPoint
          ? [
              { f: "=xy", a: [dragChanges.onPoint1Index, dragChanges.newOnPoint1.x, dragChanges.newOnPoint1.y] },
              { f: "=xy", a: [dragChanges.onPoint2Index, dragChanges.newOnPoint2.x, dragChanges.newOnPoint2.y] },
              { f: "=xy", a: [dragChanges.controlPoint1Index, dragChanges.newControlPoint1.x, dragChanges.newControlPoint1.y] },
              { f: "=xy", a: [dragChanges.controlPoint2Index, dragChanges.newControlPoint2.x, dragChanges.newControlPoint2.y] },
            ]
          : [
              { f: "=xy", a: [dragChanges.controlPoint1Index, dragChanges.newControlPoint1.x, dragChanges.newControlPoint1.y] },
              { f: "=xy", a: [dragChanges.controlPoint2Index, dragChanges.newControlPoint2.x, dragChanges.newControlPoint2.y] },
            ];

        for (const tempChange of tempChanges) {
          applyChange(layer.layerGlyph.path, tempChange);
        }
        deepEditChanges.push(consolidateChanges(tempChanges, [...layer.changePath, "path"]));
      }

      await sendIncrementalChange(consolidateChanges(deepEditChanges), true);
    }

    if (!finalChanges) {
      return;
    }

    const finalLayerChanges = [];
    const rollbackChanges = [];
    for (const layer of layerInfo) {
      let finalChangesForLayer;
      let rollbackChangesForLayer;
      if (isTrueTunniPoint) {
        finalChangesForLayer = [
          { f: "=xy", a: [finalChanges.onPoint1Index, finalChanges.newOnPoint1.x, finalChanges.newOnPoint1.y] },
          { f: "=xy", a: [finalChanges.onPoint2Index, finalChanges.newOnPoint2.x, finalChanges.newOnPoint2.y] },
          { f: "=xy", a: [finalChanges.controlPoint1Index, finalChanges.newControlPoint1.x, finalChanges.newControlPoint1.y] },
          { f: "=xy", a: [finalChanges.controlPoint2Index, finalChanges.newControlPoint2.x, finalChanges.newControlPoint2.y] },
        ];
        rollbackChangesForLayer = [
          { f: "=xy", a: [finalChanges.onPoint1Index, originalOnPoint1.x, originalOnPoint1.y] },
          { f: "=xy", a: [finalChanges.onPoint2Index, originalOnPoint2.x, originalOnPoint2.y] },
          {
            f: "=xy",
            a: [
              finalChanges.controlPoint1Index,
              tunniInitialState.originalControlPoints.originalControlPoint1.x,
              tunniInitialState.originalControlPoints.originalControlPoint1.y,
            ],
          },
          {
            f: "=xy",
            a: [
              finalChanges.controlPoint2Index,
              tunniInitialState.originalControlPoints.originalControlPoint2.x,
              tunniInitialState.originalControlPoints.originalControlPoint2.y,
            ],
          },
        ];
      } else {
        finalChangesForLayer = [
          { f: "=xy", a: [finalChanges.controlPoint1Index, finalChanges.newControlPoint1.x, finalChanges.newControlPoint1.y] },
          { f: "=xy", a: [finalChanges.controlPoint2Index, finalChanges.newControlPoint2.x, finalChanges.newControlPoint2.y] },
        ];
        rollbackChangesForLayer = [
          {
            f: "=xy",
            a: [
              tunniInitialState.originalControlPoints.controlPoint1Index,
              tunniInitialState.originalControlPoints.originalControlPoint1.x,
              tunniInitialState.originalControlPoints.originalControlPoint1.y,
            ],
          },
          {
            f: "=xy",
            a: [
              tunniInitialState.originalControlPoints.controlPoint2Index,
              tunniInitialState.originalControlPoints.originalControlPoint2.x,
              tunniInitialState.originalControlPoints.originalControlPoint2.y,
            ],
          },
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
  });

  return true;
}

async function runFallbackSkeletonTunniDrag({
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
}) {
  assert(sceneController, "runRegularEqualizeNudgeCanonical: missing sceneController");
  assert(event, "runRegularEqualizeNudgeCanonical: missing event");

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

// Skeleton-owned routes

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
  contourIndex,
  pointIndex,
  smoothIndex,
  oppositeIndex,
  offCurvePoints,
}) {
  assert(sceneController, "runSkeletonPointLikeOrchestration: missing sceneController");
  assert(pointerTool, "runSkeletonPointLikeOrchestration: missing pointerTool");
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
      withEditSession: (sessionFn) => runGlyphEditSession(sceneController, sessionFn),
      eventStream,
      initialEvent,
      event,
      getBehaviorNameForEvent: isDrag ? getBehaviorNameForEvent : undefined,
      getPointForEvent: isDrag
        ? getPositionedGlyphPointForEvent(sceneController, positionedGlyph)
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
          allChanges.push(
            ...collectSkeletonLayerPersistenceChanges({
              layer: data.layer,
              working: data.working,
              editLayerName,
              regenerateOptions,
              cloneOnPersist,
            })
          );
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
  } = context;
  assert(pointerTool, "runSkeletonPointLikeCanonical: missing pointerTool");
  assert(sceneController, "runSkeletonPointLikeCanonical: missing sceneController");
  assert(objectKind, "runSkeletonPointLikeCanonical: missing objectKind");

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
    withEditSession: (sessionFn) => runGlyphEditSession(sceneController, sessionFn),
    eventStream,
    initialEvent,
    event,
    getBehaviorNameForEvent: mode === "drag" ? () => "default" : undefined,
    getPointForEvent:
      mode === "drag"
        ? getPositionedGlyphPointForEvent(
            sceneController,
            pointerTool.sceneModel.getSelectedPositionedGlyph()
          )
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

        allChanges.push(
          ...collectSkeletonLayerPersistenceChanges({
            layer: data.layer,
            working: data.working,
            editLayerName,
            regenerateOptions: { preferInPlace: true },
            cloneOnPersist: true,
          })
        );
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
  } = context;
  assert(sceneController, "runSkeletonHandlePointLikeCanonical: missing sceneController");
  assert(pointerTool, "runSkeletonHandlePointLikeCanonical: missing pointerTool");
  assert(objectKind, "runSkeletonHandlePointLikeCanonical: missing objectKind");

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
    offCurvePoints,
  });
  return true;
}

async function runFallbackComponentDrag(context) {
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
          original: cloneSkeletonData(skeletonData),
          working: cloneSkeletonData(skeletonData),
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

          allChanges.push(
            ...collectSkeletonLayerPersistenceChanges({
              layer,
              working,
              editLayerName,
              cloneOnPersist: true,
            })
          );
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

// Editable-generated routes

async function runEditableGeneratedPointLikeCanonical(context, mode) {
  const isDrag = mode === "drag";
  const {
    pointerTool,
    sceneController,
    eventStream,
    initialEvent,
    event,
    editablePoints,
  } = context;
  assert(pointerTool, "runEditableGeneratedPointLikeCanonical: missing pointerTool");
  assert(sceneController, "runEditableGeneratedPointLikeCanonical: missing sceneController");
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

  const runGeneratedPointSession = () =>
    runPointLikeSessionKernel({
      mode,
      withEditSession: (sessionFn) => runGlyphEditSession(sceneController, sessionFn),
      eventStream,
      initialEvent,
      event,
      getBehaviorNameForEvent: isDrag ? () => "editable-generated-point" : undefined,
      getPointForEvent: isDrag
        ? getPositionedGlyphPointForEvent(sceneController, positionedGlyph)
        : undefined,
      onSessionStart: ({ glyph }) => {
        const layersData = createEditableGeneratedLayersData(
          glyph,
          sceneController.editingLayerNames
        );

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

          allChanges.push(
            ...collectSkeletonLayerPersistenceChanges({
              layer,
              working,
              editLayerName,
              cloneOnPersist: true,
            })
          );
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

  if (isDrag) {
    await withPointerCursor(pointerTool, "pointer", runGeneratedPointSession);
  } else {
    await runGeneratedPointSession();
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
  } = context;
  assert(pointerTool, "runEditableGeneratedHandleLikeCanonical: missing pointerTool");
  assert(sceneController, "runEditableGeneratedHandleLikeCanonical: missing sceneController");
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

  const runGeneratedHandleSession = () =>
    runPointLikeSessionKernel({
      mode,
      withEditSession: (sessionFn) => runGlyphEditSession(sceneController, sessionFn),
      eventStream,
      initialEvent,
      event,
      getBehaviorNameForEvent: isDrag ? () => "editable-generated-handle" : undefined,
      getPointForEvent: isDrag
        ? getPositionedGlyphPointForEvent(sceneController, positionedGlyph)
        : undefined,
      onSessionStart: ({ glyph }) => {
        const layersData = createEditableGeneratedLayersData(
          glyph,
          sceneController.editingLayerNames
        );

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

          allChanges.push(
            ...collectSkeletonLayerPersistenceChanges({
              layer,
              working,
              editLayerName,
              cloneOnPersist: true,
            })
          );
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

  if (isDrag) {
    await withPointerCursor(pointerTool, "pointer", runGeneratedHandleSession);
  } else {
    await runGeneratedHandleSession();
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
  const { pointerTool, sceneController, event } = context;
  assert(pointerTool, "runSkeletonRibPointNudgeCanonical: missing pointerTool");
  assert(sceneController, "runSkeletonRibPointNudgeCanonical: missing sceneController");
  assert(event, "runSkeletonRibPointNudgeCanonical: missing event");

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

          allChanges.push(
            ...collectSkeletonLayerPersistenceChanges({
              layer,
              working: workingSkeletonData,
              editLayerName,
            })
          );
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

// Mixed-selection routes

async function runMixedSelectionNudge({
  pointerTool,
  sceneController,
  event,
  editablePoints,
  editableHandles,
}) {
  const {
    skeletonPoint: skeletonPointSelection,
    point: pointSelection,
  } = parseSelection(sceneController.selection);

  const resolvedEditableHandles =
    editableHandles ||
    collectEditableGeneratedHandlesFromPointSelection({
      sceneController,
      pointerTool,
      pointSelection,
    });
  const resolvedEditablePoints =
    editablePoints ||
    collectEditableGeneratedPointsFromPointSelection({
      sceneController,
      pointerTool,
      pointSelection,
    });
  const editableGeneratedPointIndices = collectEditableGeneratedPointIndices(
    resolvedEditablePoints,
    resolvedEditableHandles
  );
  const regularSelection = excludePointIndicesFromSelection(
    getRegularPointLikeSelection(sceneController),
    editableGeneratedPointIndices
  );
  const {
    point: regularPointSelection,
    anchor: anchorSelection,
    guideline: guidelineSelection,
  } = parseSelection(regularSelection);

  const hasSkeletonSelection = skeletonPointSelection?.size > 0;
  const hasRegularSelection =
    (regularPointSelection?.length || 0) > 0 ||
    (anchorSelection?.length || 0) > 0 ||
    (guidelineSelection?.length || 0) > 0;
  const hasEditableGeneratedSelection =
    resolvedEditablePoints.length > 0 || resolvedEditableHandles.length > 0;
  if (!hasSkeletonSelection && !hasRegularSelection && !hasEditableGeneratedSelection) {
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
    const skeletonBackedState = createSkeletonBackedMixedEditState({
      glyph,
      sceneController,
      pointerTool,
      effectiveSkeletonPointSelection: skeletonPointSelection,
      editablePoints: resolvedEditablePoints,
      editableHandles: resolvedEditableHandles,
      skeletonBehaviorName: getSkeletonBehaviorName(false, event.altKey),
      useInterpolation: event.altKey,
    });
    const clickedSkeletonPoint = resolveClickedSkeletonPoint(
      pointerTool,
      skeletonPointSelection
    );

    const allChanges = [];
    const regularRollbackParts = [];
    if (hasRegularSelection) {
      const layerInfo = Object.entries(
        sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      ).map(([layerName, layerGlyph]) => {
        const behaviorFactory = new EditBehaviorFactory(
          layerGlyph,
          regularSelection,
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
    }

    const skeletonBackedChanges = applySkeletonBackedMixedDelta({
      editState: skeletonBackedState,
      pointerTool,
      effectiveSkeletonPointSelection: skeletonPointSelection,
      clickedSkeletonPoint,
      delta,
      roundFunc: Math.round,
      preferInPlace: hasSkeletonSelection,
    });
    if (skeletonBackedChanges.combinedChanges) {
      allChanges.push(skeletonBackedChanges.combinedChanges.change);
    }

    const editChange = consolidateChanges(allChanges);
    await sendIncrementalChange(editChange);

    const rollbackParts = [
      ...regularRollbackParts,
      ...(skeletonBackedState.latestRollbackChanges || []),
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

async function runMixedSelectionDrag({
  pointerTool,
  sceneController,
  eventStream,
  initialEvent,
  effectiveSkeletonPointSelection,
  editablePoints,
  editableHandles,
}) {
  const { point: pointSelection } = parseSelection(sceneController.selection);
  const resolvedEditableHandles =
    editableHandles ||
    collectEditableGeneratedHandlesFromPointSelection({
      sceneController,
      pointerTool,
      pointSelection,
    });
  const resolvedEditablePoints =
    editablePoints ||
    collectEditableGeneratedPointsFromPointSelection({
      sceneController,
      pointerTool,
      pointSelection,
    });
  const editableGeneratedPointIndices = collectEditableGeneratedPointIndices(
    resolvedEditablePoints,
    resolvedEditableHandles
  );
  const regularSelection = excludePointIndicesFromSelection(
    getRegularPointLikeSelection(sceneController),
    editableGeneratedPointIndices
  );
  const hasRegularSelection = regularSelection?.size > 0;
  const hasSkeletonSelection = effectiveSkeletonPointSelection?.size > 0;
  const hasEditableGeneratedSelection =
    resolvedEditablePoints.length > 0 || resolvedEditableHandles.length > 0;
  if (!hasRegularSelection && !hasSkeletonSelection && !hasEditableGeneratedSelection) {
    return false;
  }

  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    const initialPoint = sceneController.localPoint(initialEvent);
    const positionedGlyph = pointerTool.sceneModel.getSelectedPositionedGlyph();
    let behaviorName = getBehaviorName(initialEvent);
    const initialClickedPointIndex = sceneController.sceneModel.initialClickedPointIndex;
    const clickedSkeletonPoint = resolveClickedSkeletonPoint(
      pointerTool,
      effectiveSkeletonPointSelection
    );
    let equalizeHandleInfo = null;
    if (
      hasRegularSelection &&
      positionedGlyph &&
      initialClickedPointIndex !== undefined &&
      !editableGeneratedPointIndices.has(initialClickedPointIndex)
    ) {
      const candidate = findEqualizeHandleForPath(
        positionedGlyph,
        initialPoint,
        sceneController.mouseClickMargin
      );
      if (candidate && candidate.pointIndex === initialClickedPointIndex) {
        equalizeHandleInfo = candidate;
      }
    }

    const layerInfo = hasRegularSelection
      ? Object.entries(sceneController.getEditingLayerFromGlyphLayers(glyph.layers)).map(
          ([layerName, layerGlyph], index) => {
            const behaviorFactory = new EditBehaviorFactory(
              layerGlyph,
              regularSelection,
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
              isPrimaryLayer: index === 0,
            };
          }
        )
      : [];
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

    const skeletonBackedState = createSkeletonBackedMixedEditState({
      glyph,
      sceneController,
      pointerTool,
      effectiveSkeletonPointSelection,
      editablePoints: resolvedEditablePoints,
      editableHandles: resolvedEditableHandles,
      skeletonBehaviorName: getSkeletonBehaviorName(initialEvent.shiftKey, initialEvent.altKey),
      useInterpolation: initialEvent.altKey,
    });

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

      if (hasSkeletonSelection) {
        const newSkeletonBehaviorName = getSkeletonBehaviorName(
          inputEvent.shiftKey,
          inputEvent.altKey
        );
        if (newSkeletonBehaviorName !== skeletonBackedState.lastSkeletonBehaviorName) {
          updateSkeletonBackedMixedBehaviors(
            skeletonBackedState,
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

      const skeletonBackedChanges = applySkeletonBackedMixedDelta({
        editState: skeletonBackedState,
        pointerTool,
        effectiveSkeletonPointSelection,
        clickedSkeletonPoint,
        delta,
        roundFunc,
        preferInPlace: hasSkeletonSelection,
        constrainMode: pointerTool.tangentRibMode ? "tangent" : null,
      });
      if (skeletonBackedChanges.combinedChanges) {
        deepEditChanges.push(skeletonBackedChanges.combinedChanges.change);
      }
      if (skeletonBackedChanges.equalizeUsed) {
        equalizeUsed = true;
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
            regularSelection,
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
    rollbackChanges.push(...(skeletonBackedState.latestRollbackChanges || []));

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

// Public adapter maps

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

export const mixedSelectionDragAdapters = {
  mixedSelection: async (context) => runMixedSelectionDrag(context),
};

export const mixedSelectionNudgeAdapters = {
  mixedSelection: async (context) => runMixedSelectionNudge(context),
};

// Legacy fallback routes stay outside the unified canonical path on purpose.
export const fallbackDragAdapters = {
  component: async (context) => runFallbackComponentDrag(context),
  componentOrigin: async (context) => runFallbackComponentDrag(context),
  componentTCenter: async (context) => runFallbackComponentDrag(context),
  tunniPoint: async (context) => runFallbackTunniDrag(context),
  skeletonTunniPoint: async (context) => runFallbackSkeletonTunniDrag(context),
};
