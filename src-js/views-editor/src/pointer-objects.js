import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector, applyChange, consolidateChanges } from "@fontra/core/changes.js";
import { translate } from "@fontra/core/localization.js";
import { connectContours } from "@fontra/core/path-functions.js";
import { arrowKeyDeltas, assert, parseSelection } from "@fontra/core/utils.js";
import {
  EditBehaviorFactory,
  findEqualizeHandleForPath,
  makeEqualizeDragChanges,
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
  let behaviorName = getBehaviorName(initialEvent);
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

  let editChange;

  for await (const event of eventStream) {
    const newEditBehaviorName = getBehaviorName(event);

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
  }

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
  eventStream,
  initialEvent,
}) {
  const sceneController = pointerTool.sceneController;
  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    return runRegularDragOrchestration({
      sceneController,
      selection: sceneController.selection,
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

async function runRegularNudgeCanonical({
  pointerTool,
  sceneController,
  event,
  runNudgeOrchestration,
}) {
  if (pointerTool.equalizeMode) {
    const { point: regularPointSelection } = parseSelection(sceneController.selection);
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
  const handled = await runNudgeOrchestration({
    sceneController,
    event,
  });
  if (handled === false) {
    return false;
  }
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
  skeletonPoint: async (context) => runCanonicalDragPointerAdapter(context),
  skeletonHandle: async (context) => runCanonicalDragPointerAdapter(context),
  skeletonRibPoint: async (context) => runCanonicalDragPointerAdapter(context),
  editableGeneratedPoint: async (context) => runCanonicalDragPointerAdapter(context),
  editableGeneratedHandle: async (context) => runCanonicalDragPointerAdapter(context),
};

export const canonicalNudgeAdapters = {
  regularPoint: async (context) => runRegularNudgeCanonical(context),
  anchor: async (context) => runRegularNudgeCanonical(context),
  guideline: async (context) => runRegularNudgeCanonical(context),
  skeletonPoint: async (context) => runCanonicalNudgePointerAdapter(context),
  skeletonHandle: async (context) => runCanonicalNudgePointerAdapter(context),
  skeletonRibPoint: async (context) => runCanonicalNudgePointerAdapter(context),
  editableGeneratedPoint: async (context) => runCanonicalNudgePointerAdapter(context),
  editableGeneratedHandle: async (context) => runCanonicalNudgePointerAdapter(context),
};

export const legacyDragAdapters = {
  component: async (context) => runRegularDragAdapter(context),
  componentOrigin: async (context) => runRegularDragAdapter(context),
  componentTCenter: async (context) => runRegularDragAdapter(context),
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
