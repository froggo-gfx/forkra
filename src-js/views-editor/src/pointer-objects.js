import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector, applyChange, consolidateChanges } from "@fontra/core/changes.js";
import { translate } from "@fontra/core/localization.js";
import { connectContours } from "@fontra/core/path-functions.js";
import {
  getSkeletonData,
  regenerateSkeletonContours,
  setSkeletonData,
} from "@fontra/core/skeleton-contour-generator.js";
import { arrowKeyDeltas, assert, parseSelection } from "@fontra/core/utils.js";
import {
  constrainHorVerDiag,
  EditBehaviorFactory,
  createPointBehaviorExecutor,
  findEqualizeHandleForPath,
  getSkeletonBehaviorName,
  makeEqualizeDragChanges,
  makeRoundFunc,
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

function getSkeletonHandleEqualizeInfo(contour, pointIndex) {
  if (!contour?.points?.length) {
    return null;
  }
  const numPoints = contour.points.length;

  let smoothIndex = null;
  let oppositeIndex = null;

  const prevIndex = (pointIndex - 1 + numPoints) % numPoints;
  const nextIndex = (pointIndex + 1) % numPoints;
  const prevPoint = contour.points[prevIndex];
  const nextPoint = contour.points[nextIndex];

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

  if (smoothIndex === null || oppositeIndex === null) {
    return null;
  }
  return { smoothIndex, oppositeIndex };
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

async function runRegularDragOrchestration(_context) {
  const {
    sceneController,
    selection,
    initialEvent,
    eventStream,
    glyph,
    sendIncrementalChange,
    scalingEditBehavior,
    equalizeMode,
    getEqualizeMode,
    positionedGlyph,
    initialClickedPointIndex,
    runPointLikeDragKernel,
  } = _context;
  const readEqualizeMode = getEqualizeMode || (() => equalizeMode);

  assert(sceneController, "runRegularDragOrchestration: missing sceneController");
  assert(
    typeof runPointLikeDragKernel === "function",
    "runRegularDragOrchestration: missing runPointLikeDragKernel"
  );

  const initialPoint = sceneController.localPoint(initialEvent);
  const initialBehaviorName = getBehaviorName(initialEvent);
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
      selection,
      scalingEditBehavior
    );
    return {
      layerName,
      layerGlyph,
      changePath: ["layers", layerName, "glyph"],
      pathPrefix: [],
      connectDetector: sceneController.getPathConnectDetector(layerGlyph.path),
      shouldConnect: false,
      behaviorFactory,
      editBehavior: behaviorFactory.getBehavior(initialBehaviorName),
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

  let editChange;

  await runPointLikeDragKernel({
    eventStream,
    initialEvent,
    getBehaviorNameForEvent: getBehaviorName,
    getPointForEvent: (event) => sceneController.localPoint(event),
    onBehaviorChanged: async ({ behaviorName }) => {
      const rollbackChanges = [];
      for (const layer of layerInfo) {
        applyChange(layer.layerGlyph, layer.editBehavior.rollbackChange);
        rollbackChanges.push(
          consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
        );
        layer.editBehavior = layer.behaviorFactory.getBehavior(behaviorName);
      }
      await sendIncrementalChange(consolidateChanges(rollbackChanges));
    },
    onEvent: async ({ event, currentPoint, delta }) => {
      const deepEditChanges = [];

      for (const layer of layerInfo) {
        const layerEditChange = layer.editBehavior.makeChangeForDelta(delta);
        applyChange(layer.layerGlyph, layerEditChange);
        deepEditChanges.push(consolidateChanges(layerEditChange, layer.changePath));
        layer.shouldConnect = layer.connectDetector.shouldConnect(layer.isPrimaryLayer);
      }

      if (readEqualizeMode() && equalizeHandleInfo && positionedGlyph) {
        const currentGlyphPoint = {
          x: currentPoint.x - positionedGlyph.x,
          y: currentPoint.y - positionedGlyph.y,
        };
        for (const layer of layerInfo) {
          const path = layer.layerGlyph.path;
          const equalizeChanges = makeEqualizeDragChanges(
            path,
            equalizeHandleInfo,
            currentGlyphPoint,
            event.shiftKey
          );
          if (!equalizeChanges) {
            continue;
          }
          for (const change of equalizeChanges) {
            applyChange(layer.layerGlyph.path, change);
          }
          deepEditChanges.push(consolidateChanges(equalizeChanges, layer.changePath));
          equalizeUsed = true;
        }
      }

      editChange = consolidateChanges(deepEditChanges);
      await sendIncrementalChange(editChange, true);
    },
  });

  const rollbackParts = layerInfo.map((layer) =>
    consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
  );
  if (equalizeUsed && equalizeHandleInfo) {
    for (const layer of layerInfo) {
      const oppositePoint = equalizeRollbackByLayer.get(layer.layerName);
      if (!oppositePoint) continue;
      rollbackParts.push(
        consolidateChanges(
          [
            {
              f: "=xy",
              a: [equalizeHandleInfo.oppositeIndex, oppositePoint.x, oppositePoint.y],
            },
          ],
          layer.changePath
        )
      );
    }
  }
  let changes = ChangeCollector.fromChanges(editChange, consolidateChanges(rollbackParts));

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
      const selectionUpdate = connectContours(
        layerGlyph.path,
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
    undoLabel: shouldConnect
      ? translate("edit-tools-pointer.undo.drag-selection-and-connect-contours")
      : translate("edit-tools-pointer.undo.drag-selection"),
    changes: changes,
    broadcast: true,
  };
}

async function runRegularDragAdapter({
  pointerTool,
  selection,
  eventStream,
  initialEvent,
  runPointLikeDragKernel,
}) {
  const sceneController = pointerTool.sceneController;
  const effectiveSelection = selection || sceneController.selection;
  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    return runRegularDragOrchestration({
      sceneController,
      selection: effectiveSelection,
      initialEvent,
      eventStream,
      glyph,
      sendIncrementalChange,
      scalingEditBehavior: pointerTool.scalingEditBehavior,
      equalizeMode: pointerTool.equalizeMode,
      getEqualizeMode: () => pointerTool.equalizeMode,
      positionedGlyph: pointerTool.sceneModel.getSelectedPositionedGlyph(),
      initialClickedPointIndex:
        pointerTool.sceneController.sceneModel.initialClickedPointIndex,
      runPointLikeDragKernel,
    });
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

async function runRegularEqualizeHandleLegacy({
  pointerTool,
  eventStream,
  initialEvent,
  handleInfo,
  positionedGlyph,
  editableHandleInfo,
}) {
  if (editableHandleInfo) {
    const handled = await pointerTool._handleEqualizeEditableHandleDrag(
      eventStream,
      initialEvent,
      editableHandleInfo,
      handleInfo,
      positionedGlyph
    );
    if (!handled) {
      await pointerTool._handleDragEditableGeneratedHandles(
        eventStream,
        initialEvent,
        [editableHandleInfo]
      );
    }
    return makeAdapterResult();
  }
  await pointerTool._handleEqualizeHandlesDragForPath(
    eventStream,
    initialEvent,
    handleInfo,
    positionedGlyph
  );
  return makeAdapterResult();
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

async function runRegularDragCanonical(context) {
  const { sceneController, objectKind } = context;
  assert(sceneController, "runRegularDragCanonical: missing sceneController");
  assert(objectKind, "runRegularDragCanonical: missing objectKind");

  const regularSelection = filterSelectionByPrefixes(sceneController.selection, [
    "point/",
    "anchor/",
    "guideline/",
  ]);

  assert(
    regularSelection?.size,
    `runRegularDragCanonical: no regular point/anchor/guideline selection for ${objectKind}`
  );

  return runRegularDragAdapter({
    ...context,
    selection: regularSelection,
  });
}

async function runSkeletonDragSession({
  sceneController,
  eventStream,
  initialEvent,
  positionedGlyph,
  runPointLikeDragKernel,
  createLayersData,
  getBehaviorNameForEvent,
  onBehaviorChanged,
  applyLayerDelta,
  undoLabel,
}) {
  assert(sceneController, "runSkeletonDragSession: missing sceneController");
  assert(eventStream, "runSkeletonDragSession: missing eventStream");
  assert(initialEvent, "runSkeletonDragSession: missing initialEvent");
  assert(positionedGlyph, "runSkeletonDragSession: missing positionedGlyph");
  assert(
    typeof runPointLikeDragKernel === "function",
    "runSkeletonDragSession: missing runPointLikeDragKernel"
  );
  assert(
    typeof createLayersData === "function",
    "runSkeletonDragSession: missing createLayersData"
  );
  assert(
    typeof getBehaviorNameForEvent === "function",
    "runSkeletonDragSession: missing getBehaviorNameForEvent"
  );
  assert(
    typeof applyLayerDelta === "function",
    "runSkeletonDragSession: missing applyLayerDelta"
  );

  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    const layersData = createLayersData(glyph);
    if (!Object.keys(layersData).length) {
      return;
    }

    let accumulatedChanges = new ChangeCollector();
    await runPointLikeDragKernel({
      eventStream,
      initialEvent,
      getBehaviorNameForEvent,
      getPointForEvent: (event) => {
        const localPoint = sceneController.localPoint(event);
        return {
          x: localPoint.x - positionedGlyph.x,
          y: localPoint.y - positionedGlyph.y,
        };
      },
      onBehaviorChanged: onBehaviorChanged
        ? async ({ behaviorName }) => onBehaviorChanged({ behaviorName, layersData })
        : undefined,
      onEvent: async ({ event, delta, currentPoint, behaviorName }) => {
        const allChanges = [];
        for (const [editLayerName, data] of Object.entries(layersData)) {
          const changed = applyLayerDelta({
            editLayerName,
            data,
            event,
            delta,
            currentPoint,
            behaviorName,
          });
          if (!changed) {
            continue;
          }
          const { prefixedPath, prefixedCustomData } =
            makeSkeletonLayerPersistenceChanges({
              layer: data.layer,
              working: data.working,
              editLayerName,
              cloneOnPersist: true,
            });
          allChanges.push(prefixedPath, prefixedCustomData);
        }
        if (!allChanges.length) {
          return;
        }
        const combinedChange = new ChangeCollector().concat(...allChanges);
        accumulatedChanges = accumulatedChanges.concat(combinedChange);
        await sendIncrementalChange(combinedChange.change, true);
      },
    });

    await sendIncrementalChange(accumulatedChanges.change);
    return {
      changes: accumulatedChanges,
      undoLabel,
      broadcast: true,
    };
  });
}

async function runSkeletonPointDragOrchestration({
  sceneController,
  pointerTool,
  selectedSkeletonPoints,
  eventStream,
  initialEvent,
  runPointLikeDragKernel,
}) {
  assert(sceneController, "runSkeletonPointDragOrchestration: missing sceneController");
  assert(pointerTool, "runSkeletonPointDragOrchestration: missing pointerTool");
  assert(
    selectedSkeletonPoints?.size,
    "runSkeletonPointDragOrchestration: missing skeleton selection"
  );

  const positionedGlyph = pointerTool.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return;
  }

  await runSkeletonDragSession({
    sceneController,
    eventStream,
    initialEvent,
    positionedGlyph,
    runPointLikeDragKernel,
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
    getBehaviorNameForEvent: (event) =>
      getSkeletonBehaviorName(event.shiftKey, event.altKey),
    onBehaviorChanged: ({ behaviorName, layersData }) => {
      for (const data of Object.values(layersData)) {
        data.behaviors = createSkeletonPointExecutors(
          data.original,
          selectedSkeletonPoints,
          behaviorName
        );
      }
    },
    applyLayerDelta: ({ data, event, delta }) => {
      const roundFunc = makeRoundFunc(event);
      const { original, working, behaviors } = data;
      resetWorkingContoursFromOriginal(original, working);
      for (const { contourIndex, executor } of behaviors) {
        const changes = executor.applyDelta(delta, roundFunc);
        const contour = working.contours[contourIndex];
        for (const { pointIndex, x, y } of changes) {
          contour.points[pointIndex].x = x;
          contour.points[pointIndex].y = y;
        }
      }
      return true;
    },
    undoLabel: translate("edit-tools-pointer.undo.move-skeleton-points"),
  });
}

async function runSkeletonPointDragCanonical(context) {
  const {
    pointerTool,
    sceneController,
    eventStream,
    initialEvent,
    overrideSelection,
    objectKind,
    runPointLikeDragKernel,
  } = context;
  assert(pointerTool, "runSkeletonPointDragCanonical: missing pointerTool");
  assert(sceneController, "runSkeletonPointDragCanonical: missing sceneController");
  assert(objectKind, "runSkeletonPointDragCanonical: missing objectKind");

  const selectedSkeletonPoints =
    overrideSelection || parseSelection(sceneController.selection).skeletonPoint;
  if (!selectedSkeletonPoints?.size) {
    return false;
  }

  if (pointerTool.fixedRibMode || pointerTool.fixedRibCompressMode) {
    return runPointerMethodAdapter({
      pointerTool,
      methodName: "_handleDragSkeletonPoints",
      args: [eventStream, initialEvent, selectedSkeletonPoints],
      allowFalse: true,
    });
  }

  await runSkeletonPointDragOrchestration({
    sceneController,
    pointerTool,
    selectedSkeletonPoints,
    eventStream,
    initialEvent,
    runPointLikeDragKernel,
  });
  return makeAdapterResult();
}

async function runSkeletonHandleEqualizeDragOrchestration({
  sceneController,
  eventStream,
  initialEvent,
  contourIndex,
  pointIndex,
  smoothIndex,
  oppositeIndex,
  positionedGlyph,
  runPointLikeDragKernel,
}) {
  assert(
    sceneController,
    "runSkeletonHandleEqualizeDragOrchestration: missing sceneController"
  );
  assert(
    typeof runPointLikeDragKernel === "function",
    "runSkeletonHandleEqualizeDragOrchestration: missing runPointLikeDragKernel"
  );
  assert(eventStream, "runSkeletonHandleEqualizeDragOrchestration: missing eventStream");
  assert(initialEvent, "runSkeletonHandleEqualizeDragOrchestration: missing initialEvent");
  assert(
    positionedGlyph,
    "runSkeletonHandleEqualizeDragOrchestration: missing positionedGlyph"
  );

  await runSkeletonDragSession({
    sceneController,
    eventStream,
    initialEvent,
    positionedGlyph,
    runPointLikeDragKernel,
    createLayersData: (glyph) =>
      createSkeletonLayersData({
        glyph,
        editingLayerNames: sceneController.editingLayerNames,
        requireContourIndex: contourIndex,
      }),
    getBehaviorNameForEvent: () => "equalize",
    applyLayerDelta: ({ event, currentPoint, data }) => {
      const roundFunc = makeRoundFunc(event);
      const { original, working } = data;
      resetWorkingContoursFromOriginal(original, working, contourIndex);
      const workContour = working.contours[contourIndex];
      if (!workContour) {
        return false;
      }

      const smoothPoint = workContour.points[smoothIndex];
      if (!smoothPoint) {
        return false;
      }
      let newDragVec = {
        x: currentPoint.x - smoothPoint.x,
        y: currentPoint.y - smoothPoint.y,
      };
      if (event.shiftKey) {
        newDragVec = constrainHorVerDiag(newDragVec);
      }
      if (Math.hypot(newDragVec.x, newDragVec.y) < 1) {
        return false;
      }

      workContour.points[pointIndex].x = roundFunc(smoothPoint.x + newDragVec.x);
      workContour.points[pointIndex].y = roundFunc(smoothPoint.y + newDragVec.y);
      workContour.points[oppositeIndex].x = roundFunc(smoothPoint.x - newDragVec.x);
      workContour.points[oppositeIndex].y = roundFunc(smoothPoint.y - newDragVec.y);
      return true;
    },
    undoLabel: "Equalize Skeleton Handles",
  });
}

async function runSkeletonHandleEqualizeDragCanonical(context) {
  const {
    sceneController,
    eventStream,
    initialEvent,
    equalizeSkeletonInfo,
    objectKind,
    runPointLikeDragKernel,
  } = context;
  assert(
    sceneController,
    "runSkeletonHandleEqualizeDragCanonical: missing sceneController"
  );
  assert(objectKind, "runSkeletonHandleEqualizeDragCanonical: missing objectKind");
  assert(
    equalizeSkeletonInfo,
    "runSkeletonHandleEqualizeDragCanonical: missing equalizeSkeletonInfo"
  );

  const { contourIdx, pointIdx, skeletonData, positionedGlyph } = equalizeSkeletonInfo;
  if (!skeletonData || !positionedGlyph) {
    return makeAdapterResult();
  }
  const contour = skeletonData?.contours?.[contourIdx];
  const clickedPoint = contour?.points?.[pointIdx];
  if (!contour || clickedPoint?.type !== "cubic") {
    return makeAdapterResult();
  }
  const equalizeInfo = getSkeletonHandleEqualizeInfo(contour, pointIdx);
  if (!equalizeInfo) {
    return makeAdapterResult();
  }

  await runSkeletonHandleEqualizeDragOrchestration({
    sceneController,
    eventStream,
    initialEvent,
    contourIndex: contourIdx,
    pointIndex: pointIdx,
    smoothIndex: equalizeInfo.smoothIndex,
    oppositeIndex: equalizeInfo.oppositeIndex,
    positionedGlyph,
    runPointLikeDragKernel,
  });
  return makeAdapterResult();
}

async function runLegacyComponentDragAdapter(context) {
  return runRegularDragAdapter(context);
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

async function runRegularNudgeOrchestration({
  sceneController,
  selection,
  event,
  scalingEditBehavior,
}) {
  assert(sceneController, "runRegularNudgeOrchestration: missing sceneController");
  assert(selection?.size, "runRegularNudgeOrchestration: missing regular selection");
  assert(event, "runRegularNudgeOrchestration: missing event");

  let [dx, dy] = arrowKeyDeltas[event.key] || [0, 0];
  if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
    dx *= 100;
    dy *= 100;
  } else if (event.shiftKey) {
    dx *= 10;
    dy *= 10;
  }
  const delta = { x: dx, y: dy };

  await sceneController.editGlyph((sendIncrementalChange, glyph) => {
    const layerInfo = Object.entries(
      sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
    ).map(([layerName, layerGlyph]) => {
      const behaviorFactory = new EditBehaviorFactory(
        layerGlyph,
        selection,
        scalingEditBehavior
      );
      return {
        layerName,
        layerGlyph,
        changePath: ["layers", layerName, "glyph"],
        editBehavior: behaviorFactory.getBehavior(
          event.altKey ? "alternate" : "default"
        ),
      };
    });

    const editChanges = [];
    const rollbackChanges = [];
    for (const { layerGlyph, changePath, editBehavior } of layerInfo) {
      const editChange = editBehavior.makeChangeForDelta(delta);
      applyChange(layerGlyph, editChange);
      editChanges.push(consolidateChanges(editChange, changePath));
      rollbackChanges.push(
        consolidateChanges(editBehavior.rollbackChange, changePath)
      );
    }

    let changes = ChangeCollector.fromChanges(
      consolidateChanges(editChanges),
      consolidateChanges(rollbackChanges)
    );

    let newSelection;
    for (const { layerGlyph, changePath } of layerInfo) {
      const connectDetector = sceneController.getPathConnectDetector(layerGlyph.path);
      if (!connectDetector.shouldConnect()) {
        continue;
      }
      const connectChanges = recordChanges(layerGlyph, (workingLayerGlyph) => {
        const thisSelection = connectContours(
          workingLayerGlyph.path,
          connectDetector.connectSourcePointIndex,
          connectDetector.connectTargetPointIndex
        );
        if (newSelection === undefined) {
          newSelection = thisSelection;
        }
      });
      if (connectChanges.hasChange) {
        changes = changes.concat(connectChanges.prefixed(changePath));
      }
    }
    if (newSelection) {
      sceneController.selection = newSelection;
    }

    return {
      changes,
      undoLabel: translate("action.nudge-selection"),
      broadcast: true,
    };
  });
}

async function runSkeletonPointNudgeOrchestration({
  sceneController,
  selectedSkeletonPoints,
  event,
}) {
  assert(sceneController, "runSkeletonPointNudgeOrchestration: missing sceneController");
  assert(
    selectedSkeletonPoints?.size,
    "runSkeletonPointNudgeOrchestration: missing skeleton selection"
  );
  assert(event, "runSkeletonPointNudgeOrchestration: missing event");

  let [dx, dy] = arrowKeyDeltas[event.key] || [0, 0];
  if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
    dx *= 100;
    dy *= 100;
  } else if (event.shiftKey) {
    dx *= 10;
    dy *= 10;
  }
  const delta = { x: dx, y: dy };
  const roundFunc = (value) => makeRoundFunc(event)(value, true);
  const behaviorName = getSkeletonBehaviorName(false, event.altKey);

  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    const allChanges = [];
    const rollbackParts = [];

    for (const editLayerName of sceneController.editingLayerNames) {
      const layer = glyph.layers[editLayerName];
      const skeletonData = layer ? getSkeletonData(layer) : null;
      if (!skeletonData) {
        continue;
      }

      const originalSkeletonData = JSON.parse(JSON.stringify(skeletonData));
      const workingSkeletonData = JSON.parse(JSON.stringify(skeletonData));
      const behaviors = createSkeletonPointExecutors(
        originalSkeletonData,
        selectedSkeletonPoints,
        behaviorName,
        roundFunc
      );

      for (const { contourIndex, executor } of behaviors) {
        const changes = executor.applyDelta(delta);
        const contour = workingSkeletonData.contours[contourIndex];
        for (const { pointIndex, x, y } of changes) {
          contour.points[pointIndex].x = x;
          contour.points[pointIndex].y = y;
        }
      }

      const { prefixedPath, prefixedCustomData } = makeSkeletonLayerPersistenceChanges({
        layer,
        working: workingSkeletonData,
        editLayerName,
        regenerateOptions: { preferInPlace: true },
      });
      allChanges.push(prefixedPath.change, prefixedCustomData.change);
      rollbackParts.push(prefixedPath.rollbackChange, prefixedCustomData.rollbackChange);
    }

    if (!allChanges.length) {
      return;
    }
    const editChange = consolidateChanges(allChanges);
    await sendIncrementalChange(editChange);
    return {
      changes: ChangeCollector.fromChanges(editChange, consolidateChanges(rollbackParts)),
      undoLabel: translate("action.nudge-selection"),
      broadcast: true,
    };
  });
}

async function runSkeletonPointNudgeCanonical(context) {
  const { pointerTool, sceneController, event, objectKind } = context;
  assert(pointerTool, "runSkeletonPointNudgeCanonical: missing pointerTool");
  assert(sceneController, "runSkeletonPointNudgeCanonical: missing sceneController");
  assert(objectKind, "runSkeletonPointNudgeCanonical: missing objectKind");

  const parsedSelection = parseSelection(sceneController.selection);
  const selectedSkeletonPoints = parsedSelection.skeletonPoint;
  const hasRegularSelection =
    (parsedSelection.point?.length || 0) > 0 ||
    (parsedSelection.anchor?.length || 0) > 0 ||
    (parsedSelection.guideline?.length || 0) > 0;

  if (!selectedSkeletonPoints?.size) {
    return false;
  }

  if (
    hasRegularSelection ||
    pointerTool.fixedRibMode ||
    pointerTool.fixedRibCompressMode
  ) {
    return runPointerMethodAdapter({
      pointerTool,
      methodName: "_handleArrowKeysLegacy",
      args: [event],
      allowFalse: true,
    });
  }

  await runSkeletonPointNudgeOrchestration({
    sceneController,
    selectedSkeletonPoints,
    event,
  });
  return makeAdapterResult();
}

async function runRegularNudgeCanonical({
  pointerTool,
  sceneController,
  event,
  objectKind,
}) {
  assert(sceneController, "runRegularNudgeCanonical: missing sceneController");
  assert(objectKind, "runRegularNudgeCanonical: missing objectKind");

  const regularSelection = filterSelectionByPrefixes(sceneController.selection, [
    "point/",
    "anchor/",
    "guideline/",
  ]);
  assert(
    regularSelection?.size,
    `runRegularNudgeCanonical: no regular point/anchor/guideline selection for ${objectKind}`
  );

  if (pointerTool.equalizeMode) {
    const { point: regularPointSelection } = parseSelection(regularSelection);
    if (regularPointSelection?.length) {
      let [dx, dy] = arrowKeyDeltas[event.key] || [0, 0];
      if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
        dx *= 100;
        dy *= 100;
      } else if (event.shiftKey) {
        dx *= 10;
        dy *= 10;
      }
      const delta = { x: dx, y: dy };
      const handled = await pointerTool._handleArrowKeysForEqualizePathHandles(
        delta,
        regularPointSelection
      );
      if (handled) {
        return makeAdapterResult();
      }
    }
  }

  await runRegularNudgeOrchestration({
    sceneController,
    selection: regularSelection,
    event,
    scalingEditBehavior: pointerTool.scalingEditBehavior,
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

async function runSkeletonHandleEqualizeNudgeOrchestration({
  sceneController,
  offCurvePoints,
  event,
}) {
  assert(
    sceneController,
    "runSkeletonHandleEqualizeNudgeOrchestration: missing sceneController"
  );
  assert(
    offCurvePoints?.length,
    "runSkeletonHandleEqualizeNudgeOrchestration: missing off-curve selection"
  );
  assert(event, "runSkeletonHandleEqualizeNudgeOrchestration: missing event");

  let [dx, dy] = arrowKeyDeltas[event.key] || [0, 0];
  if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
    dx *= 100;
    dy *= 100;
  } else if (event.shiftKey) {
    dx *= 10;
    dy *= 10;
  }
  const delta = { x: dx, y: dy };

  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    const allChanges = [];
    for (const editLayerName of sceneController.editingLayerNames) {
      const layer = glyph.layers[editLayerName];
      const layerSkeletonData = layer ? getSkeletonData(layer) : null;
      if (!layerSkeletonData) {
        continue;
      }

      const working = JSON.parse(JSON.stringify(layerSkeletonData));
      let changed = false;

      for (const { contourIdx, pointIdx } of offCurvePoints) {
        const contour = working.contours[contourIdx];
        if (!contour) {
          continue;
        }
        const point = contour.points[pointIdx];
        if (!point || point.type !== "cubic") {
          continue;
        }

        point.x = Math.round(point.x + delta.x);
        point.y = Math.round(point.y + delta.y);

        const equalizeInfo = getSkeletonHandleEqualizeInfo(contour, pointIdx);
        if (!equalizeInfo) {
          continue;
        }
        const smoothPoint = contour.points[equalizeInfo.smoothIndex];
        const draggedPoint = contour.points[pointIdx];
        const oppositePoint = contour.points[equalizeInfo.oppositeIndex];
        if (!smoothPoint || !draggedPoint || !oppositePoint) {
          continue;
        }

        const draggedLength = Math.hypot(
          draggedPoint.x - smoothPoint.x,
          draggedPoint.y - smoothPoint.y
        );
        const oppositeDirX = oppositePoint.x - smoothPoint.x;
        const oppositeDirY = oppositePoint.y - smoothPoint.y;
        const oppositeLength = Math.hypot(oppositeDirX, oppositeDirY);
        if (oppositeLength > 0.001) {
          const scale = draggedLength / oppositeLength;
          oppositePoint.x = Math.round(smoothPoint.x + oppositeDirX * scale);
          oppositePoint.y = Math.round(smoothPoint.y + oppositeDirY * scale);
        }
        changed = true;
      }

      if (!changed) {
        continue;
      }

      const { prefixedPath, prefixedCustomData } = makeSkeletonLayerPersistenceChanges({
        layer,
        working,
        editLayerName,
        regenerateOptions: { preferInPlace: true },
      });
      allChanges.push(prefixedPath, prefixedCustomData);
    }

    if (!allChanges.length) {
      return;
    }
    const combined = new ChangeCollector().concat(...allChanges);
    await sendIncrementalChange(combined.change);
    return {
      changes: combined,
      undoLabel: "Nudge skeleton handles (equalize)",
      broadcast: true,
    };
  });
}

async function runSkeletonHandleEqualizeNudgeCanonical(context) {
  const { sceneController, pointerTool, event, objectKind } = context;
  assert(
    sceneController,
    "runSkeletonHandleEqualizeNudgeCanonical: missing sceneController"
  );
  assert(pointerTool, "runSkeletonHandleEqualizeNudgeCanonical: missing pointerTool");
  assert(objectKind, "runSkeletonHandleEqualizeNudgeCanonical: missing objectKind");

  const selectedSkeletonPoints = parseSelection(sceneController.selection).skeletonPoint;
  if (!selectedSkeletonPoints?.size) {
    return false;
  }

  const offCurvePoints = getSelectedOffCurveSkeletonPoints({
    pointerTool,
    selectedSkeletonPoints,
  });
  if (!offCurvePoints.length) {
    return runSkeletonPointNudgeCanonical(context);
  }

  await runSkeletonHandleEqualizeNudgeOrchestration({
    sceneController,
    offCurvePoints,
    event,
  });
  return makeAdapterResult();
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
  regularPoint: async (context) => runRegularDragCanonical(context),
  anchor: async (context) => runRegularDragCanonical(context),
  guideline: async (context) => runRegularDragCanonical(context),
  skeletonPoint: async (context) => runSkeletonPointDragCanonical(context),
  skeletonHandle: async (context) => runSkeletonHandleEqualizeDragCanonical(context),
  skeletonRibPoint: async (context) => runSkeletonRibPointDragCanonical(context),
  editableGeneratedPoint: async (context) =>
    runEditableGeneratedPointDragCanonical(context),
  editableGeneratedHandle: async (context) =>
    runEditableGeneratedHandleDragCanonical(context),
};

export const canonicalNudgeAdapters = {
  regularPoint: async (context) => runRegularNudgeCanonical(context),
  anchor: async (context) => runRegularNudgeCanonical(context),
  guideline: async (context) => runRegularNudgeCanonical(context),
  skeletonPoint: async (context) => runSkeletonPointNudgeCanonical(context),
  skeletonHandle: async (context) => runSkeletonHandleEqualizeNudgeCanonical(context),
  skeletonRibPoint: async (context) => runSkeletonRibPointNudgeCanonical(context),
  editableGeneratedPoint: async (context) => runEditableGeneratedNudgeCanonical(context),
  editableGeneratedHandle: async (context) =>
    runEditableGeneratedNudgeCanonical(context),
};

export const legacyDragAdapters = {
  component: async (context) => runLegacyComponentDragAdapter(context),
  componentOrigin: async (context) => runLegacyComponentDragAdapter(context),
  componentTCenter: async (context) => runLegacyComponentDragAdapter(context),
  regularEqualizeHandle: async (context) => runRegularEqualizeHandleLegacy(context),
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
