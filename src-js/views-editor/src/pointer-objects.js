import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector, applyChange, consolidateChanges } from "@fontra/core/changes.js";
import { translate } from "@fontra/core/localization.js";
import { connectContours } from "@fontra/core/path-functions.js";
import {
  getSkeletonData,
  regenerateSkeletonContours,
  setSkeletonData,
} from "@fontra/core/skeleton-contour-generator.js";
import { assert, parseSelection } from "@fontra/core/utils.js";
import {
  computeEqualizedHandlePositions,
  EditBehaviorFactory,
  createPointBehaviorExecutor,
  findEqualizeHandleForPath,
  getSkeletonBehaviorName,
  makeRegularEqualizeNudgeChanges,
  makeEqualizeDragChanges,
  makeRoundFunc,
  resolveEqualizePairForContourPoint,
} from "./edit-behavior.js";

// Adapter contract for drag/nudge routing:
// - When handled, adapters return `{ forward, rollback }`.
// - During migration, wrappers may return `{ forward: null, rollback: null }`.
// - Unhandled routes return `false` so composer can continue fallback logic.
export const ADAPTER_CONTRACT = Object.freeze({
  handledResultShape: "{ forward, rollback }",
  unhandledResult: "false",
  persistenceOwner: "adapter",
});

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

async function runEditableGeneratedPointDragCanonical(context) {
  const { pointerTool, eventStream, initialEvent, editablePoints } = context;
  assert(
    editablePoints,
    "runEditableGeneratedPointDragCanonical: missing editablePoints"
  );
  return runPointerMethodAdapter({
    pointerTool,
    methodName: "_handleDragEditableGeneratedPoints",
    args: [eventStream, initialEvent, editablePoints],
  });
}

async function runEditableGeneratedHandleDragCanonical(context) {
  const { pointerTool, eventStream, initialEvent, editableHandles } = context;
  assert(
    editableHandles,
    "runEditableGeneratedHandleDragCanonical: missing editableHandles"
  );
  return runPointerMethodAdapter({
    pointerTool,
    methodName: "_handleDragEditableGeneratedHandles",
    args: [eventStream, initialEvent, editableHandles],
  });
}
async function runEditableGeneratedNudgeCanonical(context) {
  const { pointerTool, event } = context;
  return runPointerMethodAdapter({
    pointerTool,
    methodName: "_handleArrowKeysLegacy",
    args: [event],
    allowFalse: true,
  });
}

async function runSkeletonRibPointNudgeCanonical(context) {
  const { pointerTool, sceneController, event } = context;
  const { skeletonRibPoint: ribPointSelection } = parseSelection(
    sceneController.selection
  );
  if (!ribPointSelection?.size) {
    return false;
  }
  return runPointerMethodAdapter({
    pointerTool,
    methodName: "_handleArrowKeysForRibPoints",
    args: [event, ribPointSelection],
  });
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
