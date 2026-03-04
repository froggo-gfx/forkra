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
import * as vector from "@fontra/core/vector.js";
import {
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

async function runUnifiedDragEventStream({
  eventStream,
  initialEvent,
  getBehaviorNameForEvent,
  onBehaviorChanged,
  onEvent,
}) {
  let behaviorName = getBehaviorNameForEvent(initialEvent);
  for await (const event of eventStream) {
    const nextBehaviorName = getBehaviorNameForEvent(event);
    if (nextBehaviorName !== behaviorName) {
      behaviorName = nextBehaviorName;
      if (onBehaviorChanged) {
        await onBehaviorChanged(behaviorName, event);
      }
    }
    await onEvent(event, behaviorName);
  }
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
  } = _context;
  const readEqualizeMode = getEqualizeMode || (() => equalizeMode);

  assert(sceneController, "runRegularDragOrchestration: missing sceneController");

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

  await runUnifiedDragEventStream({
    eventStream,
    initialEvent,
    getBehaviorNameForEvent: getBehaviorName,
    onBehaviorChanged: async (newBehaviorName) => {
      const rollbackChanges = [];
      for (const layer of layerInfo) {
        applyChange(layer.layerGlyph, layer.editBehavior.rollbackChange);
        rollbackChanges.push(
          consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
        );
        layer.editBehavior = layer.behaviorFactory.getBehavior(newBehaviorName);
      }
      await sendIncrementalChange(consolidateChanges(rollbackChanges));
    },
    onEvent: async (event) => {
      const currentPoint = sceneController.localPoint(event);
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

async function runSkeletonPointDragOrchestration({
  sceneController,
  pointerTool,
  selectedSkeletonPoints,
  eventStream,
  initialEvent,
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

  const localPoint = sceneController.localPoint(initialEvent);
  const startGlyphPoint = {
    x: localPoint.x - positionedGlyph.x,
    y: localPoint.y - positionedGlyph.y,
  };

  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    const layersData = {};
    for (const editLayerName of sceneController.editingLayerNames) {
      const layer = glyph.layers[editLayerName];
      const skeletonData = layer ? getSkeletonData(layer) : null;
      if (!skeletonData) {
        continue;
      }
      layersData[editLayerName] = {
        layer,
        original: JSON.parse(JSON.stringify(skeletonData)),
        working: JSON.parse(JSON.stringify(skeletonData)),
        behaviors: null,
      };
    }

    if (!Object.keys(layersData).length) {
      return;
    }

    const applySkeletonBehaviorsByName = (behaviorName) => {
      for (const data of Object.values(layersData)) {
        data.behaviors = createSkeletonPointExecutors(
          data.original,
          selectedSkeletonPoints,
          behaviorName
        );
      }
    };

    const initialBehaviorName = getSkeletonBehaviorName(
      initialEvent.shiftKey,
      initialEvent.altKey
    );
    applySkeletonBehaviorsByName(initialBehaviorName);

    let accumulatedChanges = new ChangeCollector();

    await runUnifiedDragEventStream({
      eventStream,
      initialEvent,
      getBehaviorNameForEvent: (event) =>
        getSkeletonBehaviorName(event.shiftKey, event.altKey),
      onBehaviorChanged: async (behaviorName) => {
        applySkeletonBehaviorsByName(behaviorName);
      },
      onEvent: async (event) => {
        const roundFunc = makeRoundFunc(event);
        const currentLocalPoint = sceneController.localPoint(event);
        const currentGlyphPoint = {
          x: currentLocalPoint.x - positionedGlyph.x,
          y: currentLocalPoint.y - positionedGlyph.y,
        };
        const delta = vector.subVectors(currentGlyphPoint, startGlyphPoint);

        const allChanges = [];
        for (const [editLayerName, data] of Object.entries(layersData)) {
          const { layer, original, working, behaviors } = data;

          for (let ci = 0; ci < original.contours.length; ci++) {
            const origContour = original.contours[ci];
            const workContour = working.contours[ci];
            for (let pi = 0; pi < origContour.points.length; pi++) {
              workContour.points[pi].x = origContour.points[pi].x;
              workContour.points[pi].y = origContour.points[pi].y;
            }
          }

          for (const { contourIndex, executor } of behaviors) {
            const changes = executor.applyDelta(delta, roundFunc);
            const contour = working.contours[contourIndex];
            for (const { pointIndex, x, y } of changes) {
              contour.points[pointIndex].x = x;
              contour.points[pointIndex].y = y;
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
      },
    });

    await sendIncrementalChange(accumulatedChanges.change);
    return {
      changes: accumulatedChanges,
      undoLabel: translate("edit-tools-pointer.undo.move-skeleton-points"),
      broadcast: true,
    };
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
  });
  return makeAdapterResult();
}

async function runLegacyComponentDragAdapter(context) {
  return runRegularDragAdapter(context);
}

function buildCanonicalDragPointerInvocation({
  objectKind,
  pointerTool,
  eventStream,
  initialEvent,
  overrideSelection,
  ribHit,
  editablePoints,
  editableHandles,
  equalizeSkeletonInfo,
  targetRibSelection,
  preSelectedSkeletonPoints,
}) {
  switch (objectKind) {
    case "skeletonPoint":
      return {
        pointerTool,
        methodName: "_handleDragSkeletonPoints",
        args: [eventStream, initialEvent, overrideSelection],
      };
    case "skeletonHandle": {
      assert(
        equalizeSkeletonInfo,
        "buildCanonicalDragPointerInvocation: missing equalizeSkeletonInfo for skeletonHandle"
      );
      const { contourIdx, pointIdx, skeletonData, positionedGlyph } =
        equalizeSkeletonInfo || {};
      return {
        pointerTool,
        methodName: "_handleEqualizeHandlesDrag",
        args: [
          eventStream,
          initialEvent,
          contourIdx,
          pointIdx,
          skeletonData,
          positionedGlyph,
        ],
      };
    }
    case "skeletonRibPoint":
      assert(
        ribHit,
        "buildCanonicalDragPointerInvocation: missing ribHit for skeletonRibPoint"
      );
      return {
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
      };
    case "editableGeneratedPoint":
      assert(
        editablePoints,
        "buildCanonicalDragPointerInvocation: missing editablePoints for editableGeneratedPoint"
      );
      return {
        pointerTool,
        methodName: "_handleDragEditableGeneratedPoints",
        args: [eventStream, initialEvent, editablePoints],
      };
    case "editableGeneratedHandle":
      assert(
        editableHandles,
        "buildCanonicalDragPointerInvocation: missing editableHandles for editableGeneratedHandle"
      );
      return {
        pointerTool,
        methodName: "_handleDragEditableGeneratedHandles",
        args: [eventStream, initialEvent, editableHandles],
      };
    default:
      return null;
  }
}

async function runCanonicalDragPointerAdapter(context) {
  const invocation = buildCanonicalDragPointerInvocation(context);
  return runPointerMethodAdapter(invocation);
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

      const staticGlyph = layer.glyph;
      const pathChange = recordChanges(staticGlyph, (sg) => {
        regenerateSkeletonContours(sg, workingSkeletonData, { preferInPlace: true });
      });
      const prefixedPath = pathChange.prefixed(["layers", editLayerName, "glyph"]);
      allChanges.push(prefixedPath.change);
      rollbackParts.push(prefixedPath.rollbackChange);

      const customDataChange = recordChanges(layer, (l) => {
        setSkeletonData(l, workingSkeletonData);
      });
      const prefixedCustomData = customDataChange.prefixed(["layers", editLayerName]);
      allChanges.push(prefixedCustomData.change);
      rollbackParts.push(prefixedCustomData.rollbackChange);
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

function buildCanonicalNudgePointerInvocation({
  pointerTool,
  sceneController,
  event,
  objectKind,
}) {
  switch (objectKind) {
    case "skeletonPoint":
    case "skeletonHandle":
    case "editableGeneratedPoint":
    case "editableGeneratedHandle":
      return {
        pointerTool,
        methodName: "_handleArrowKeysLegacy",
        args: [event],
        allowFalse: true,
      };
    case "skeletonRibPoint": {
      const { skeletonRibPoint: ribPointSelection } = parseSelection(
        sceneController.selection
      );
      if (!ribPointSelection?.size) {
        return null;
      }
      return {
        pointerTool,
        methodName: "_handleArrowKeysForRibPoints",
        args: [event, ribPointSelection],
      };
    }
    default:
      return null;
  }
}

async function runCanonicalNudgePointerAdapter(context) {
  const invocation = buildCanonicalNudgePointerInvocation(context);
  return runPointerMethodAdapter(invocation);
}

export const canonicalDragAdapters = {
  regularPoint: async (context) => runRegularDragCanonical(context),
  anchor: async (context) => runRegularDragCanonical(context),
  guideline: async (context) => runRegularDragCanonical(context),
  skeletonPoint: async (context) => runSkeletonPointDragCanonical(context),
  skeletonHandle: async (context) => runCanonicalDragPointerAdapter(context),
  skeletonRibPoint: async (context) => runCanonicalDragPointerAdapter(context),
  editableGeneratedPoint: async (context) => runCanonicalDragPointerAdapter(context),
  editableGeneratedHandle: async (context) => runCanonicalDragPointerAdapter(context),
};

export const canonicalNudgeAdapters = {
  regularPoint: async (context) => runRegularNudgeCanonical(context),
  anchor: async (context) => runRegularNudgeCanonical(context),
  guideline: async (context) => runRegularNudgeCanonical(context),
  skeletonPoint: async (context) => runSkeletonPointNudgeCanonical(context),
  skeletonHandle: async (context) => runCanonicalNudgePointerAdapter(context),
  skeletonRibPoint: async (context) => runCanonicalNudgePointerAdapter(context),
  editableGeneratedPoint: async (context) => runCanonicalNudgePointerAdapter(context),
  editableGeneratedHandle: async (context) => runCanonicalNudgePointerAdapter(context),
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
