import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector, applyChange, consolidateChanges } from "@fontra/core/changes.js";
import { translate } from "@fontra/core/localization.js";
import { connectContours } from "@fontra/core/path-functions.js";
import {
  getSkeletonData,
  regenerateSkeletonContours,
  setSkeletonData,
  calculateNormalAtSkeletonPoint,
  getPointHalfWidth,
} from "@fontra/core/skeleton-contour-generator.js";
import { assert, parseSelection } from "@fontra/core/utils.js";
import {
  computeEqualizedHandlePositions,
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
import { buildSegmentsFromSkeletonPoints } from "./skeleton-tunni-calculations.js";

// Adapter contract for drag/nudge routing:
// - When handled, adapters return `{ forward, rollback }`.
// - During migration, wrappers may return `{ forward: null, rollback: null }`.
// - Unhandled routes return `false` so composer can continue fallback logic.
export const ADAPTER_CONTRACT = Object.freeze({
  handledResultShape: "{ forward, rollback }",
  unhandledResult: "false",
  persistenceOwner: "adapter",
});

const DEFAULT_SKELETON_WIDTH = 80;

function makeAdapterResult(forward = null, rollback = null) {
  return { forward, rollback };
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
  return makeAdapterResult();
}

async function runPointerMethodAdapter(invocation) {
  if (!invocation) {
    return false;
  }
  const { pointerTool, methodName, args = [], allowFalse = false, before, after } =
    invocation;
  assert(pointerTool, "runPointerMethodAdapter: missing pointerTool");
  const method = pointerTool?.[methodName];
  assert(
    typeof method === "function",
    `runPointerMethodAdapter: missing pointer method ${methodName}`
  );
  if (before) {
    before();
  }
  try {
    const handled = await method.call(pointerTool, ...args);
    if (allowFalse && handled === false) {
      return false;
    }
    return makeAdapterResult();
  } finally {
    if (after) {
      after();
    }
  }
}

async function runTunniDragLegacy({ pointerTool, eventStream, initialEvent }) {
  const handled = await pointerTool._handleTunniPointDrag(eventStream, initialEvent);
  if (handled === false) {
    return false;
  }
  return makeAdapterResult();
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
  return makeAdapterResult();
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
      return makeAdapterResult();
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

  if (mode === "drag" && (pointerTool.fixedRibMode || pointerTool.fixedRibCompressMode)) {
    return runPointerMethodAdapter({
      pointerTool,
      methodName: "_handleDragSkeletonPoints",
      args: [context.eventStream, context.initialEvent, selectedSkeletonPoints],
      allowFalse: true,
    });
  }

  if (mode === "nudge") {
    const parsedSelection = parseSelection(sceneController.selection);
    const hasRegularSelection =
      (parsedSelection.point?.length || 0) > 0 ||
      (parsedSelection.anchor?.length || 0) > 0 ||
      (parsedSelection.guideline?.length || 0) > 0;

    if (
      hasRegularSelection ||
      pointerTool.fixedRibMode ||
      pointerTool.fixedRibCompressMode
    ) {
      return runPointerMethodAdapter({
        pointerTool,
        methodName: "_handleArrowKeysLegacy",
        args: [context.event],
        allowFalse: true,
      });
    }
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
  return makeAdapterResult();
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
      return makeAdapterResult();
    }
    const equalizeInfo = resolveEqualizePairForContourPoint(contour, pointIdx);
    if (!equalizeInfo) {
      return makeAdapterResult();
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
    return makeAdapterResult();
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
  return makeAdapterResult();
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
    eventStream,
    initialEvent,
    ribHit,
    targetRibSelection,
    preSelectedSkeletonPoints,
  } = context;
  assert(pointerTool, "runSkeletonRibPointDragCanonical: missing pointerTool");
  assert(ribHit, "runSkeletonRibPointDragCanonical: missing ribHit");
  return runPointerMethodAdapter({
    pointerTool,
    methodName: "_handleDragRibPoint",
    args: [
      eventStream,
      initialEvent,
      ribHit,
      targetRibSelection,
      preSelectedSkeletonPoints,
    ],
    before: () => {
      pointerTool.sceneController.sceneModel.initialClickedSkeletonRibPoint = {
        contourIdx: ribHit.contourIndex,
        pointIdx: ribHit.pointIndex,
        side: ribHit.side,
      };
    },
    after: () => {
      delete pointerTool.sceneController.sceneModel.initialClickedSkeletonRibPoint;
    },
  });
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
    return makeAdapterResult();
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
  return makeAdapterResult();
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
    return makeAdapterResult();
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
  return makeAdapterResult();
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
    return makeAdapterResult();
  }

  const ribTargets = collectSelectedRibPointTargets(
    referenceSkeletonData,
    ribPointSelection
  );
  if (!ribTargets.length) {
    return makeAdapterResult();
  }

  const allTargetsEditable = ribTargets.every((target) => target.isEditable);
  const belongsToSingleSegment = selectedRibTargetsBelongToSingleSegment(
    ribTargets,
    referenceSkeletonData
  );
  if (!allTargetsEditable && !belongsToSingleSegment) {
    return makeAdapterResult();
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
  return makeAdapterResult();
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
  mixedSelection: async ({
    pointerTool,
    eventStream,
    initialEvent,
    effectiveSkeletonPointSelection,
  }) => {
    const handled = await pointerTool._handleDragMixedSelection(
      eventStream,
      initialEvent,
      effectiveSkeletonPointSelection
    );
    if (handled === false) {
      return false;
    }
    return makeAdapterResult();
  },
  tunniPoint: async (context) => runTunniDragLegacy(context),
  skeletonTunniPoint: async (context) => runSkeletonTunniDragLegacy(context),
};

export const legacyNudgeAdapters = {
};
