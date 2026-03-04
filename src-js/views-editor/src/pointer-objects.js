import { arrowKeyDeltas, parseSelection } from "@fontra/core/utils.js";

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

async function runRegularDragLegacy({
  pointerTool,
  eventStream,
  initialEvent,
  runDragOrchestration,
}) {
  const sceneController = pointerTool.sceneController;
  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    return runDragOrchestration({
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

async function runSkeletonDragCanonical({
  pointerTool,
  eventStream,
  initialEvent,
  overrideSelection,
}) {
  await pointerTool._handleDragSkeletonPoints(
    eventStream,
    initialEvent,
    overrideSelection
  );
  return makeAdapterResult();
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

async function runNudgeLegacy({ pointerTool, event }) {
  const handled = await pointerTool._handleArrowKeysLegacy(event);
  if (handled === false) {
    return false;
  }
  return makeAdapterResult();
}

async function runRegularDragCanonical(context) {
  return runRegularDragLegacy(context);
}

async function runSkeletonHandleDragCanonical({
  pointerTool,
  eventStream,
  initialEvent,
  equalizeSkeletonInfo,
}) {
  const { contourIdx, pointIdx, skeletonData, positionedGlyph } = equalizeSkeletonInfo;
  await pointerTool._handleEqualizeHandlesDrag(
    eventStream,
    initialEvent,
    contourIdx,
    pointIdx,
    skeletonData,
    positionedGlyph
  );
  return makeAdapterResult();
}

async function runRibDragCanonical({
  pointerTool,
  eventStream,
  initialEvent,
  ribHit,
  targetRibSelection,
  preSelectedSkeletonPoints,
}) {
  pointerTool.sceneController.sceneModel.initialClickedSkeletonRibPoint = {
    contourIdx: ribHit.contourIndex,
    pointIdx: ribHit.pointIndex,
    side: ribHit.side,
  };
  try {
    await pointerTool._handleDragRibPoint(
      eventStream,
      initialEvent,
      ribHit,
      targetRibSelection,
      preSelectedSkeletonPoints
    );
  } finally {
    delete pointerTool.sceneController.sceneModel.initialClickedSkeletonRibPoint;
  }
  return makeAdapterResult();
}

async function runEditableGeneratedPointsDragCanonical({
  pointerTool,
  eventStream,
  initialEvent,
  editablePoints,
}) {
  await pointerTool._handleDragEditableGeneratedPoints(
    eventStream,
    initialEvent,
    editablePoints
  );
  return makeAdapterResult();
}

async function runEditableGeneratedHandlesDragCanonical({
  pointerTool,
  eventStream,
  initialEvent,
  editableHandles,
}) {
  await pointerTool._handleDragEditableGeneratedHandles(
    eventStream,
    initialEvent,
    editableHandles
  );
  return makeAdapterResult();
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

async function runSkeletonNudgeCanonical({ pointerTool, event }) {
  return runNudgeLegacy({ pointerTool, event });
}

async function runRibNudgeCanonical({ pointerTool, sceneController, event }) {
  const { skeletonRibPoint: ribPointSelection } = parseSelection(
    sceneController.selection
  );
  if (!ribPointSelection?.size) {
    return false;
  }
  await pointerTool._handleArrowKeysForRibPoints(event, ribPointSelection);
  return makeAdapterResult();
}

async function runEditableGeneratedNudgeCanonical({ pointerTool, event }) {
  return runNudgeLegacy({ pointerTool, event });
}

export const canonicalDragAdapters = {
  regularPoint: async (context) => runRegularDragCanonical(context),
  anchor: async (context) => runRegularDragCanonical(context),
  guideline: async (context) => runRegularDragCanonical(context),
  skeletonPoint: async (context) => runSkeletonDragCanonical(context),
  skeletonHandle: async (context) => runSkeletonHandleDragCanonical(context),
  skeletonRibPoint: async (context) => runRibDragCanonical(context),
  editableGeneratedPoint: async (context) => runEditableGeneratedPointsDragCanonical(context),
  editableGeneratedHandle: async (context) =>
    runEditableGeneratedHandlesDragCanonical(context),
};

export const canonicalNudgeAdapters = {
  regularPoint: async (context) => runRegularNudgeCanonical(context),
  anchor: async (context) => runRegularNudgeCanonical(context),
  guideline: async (context) => runRegularNudgeCanonical(context),
  skeletonPoint: async (context) => runSkeletonNudgeCanonical(context),
  skeletonHandle: async (context) => runSkeletonNudgeCanonical(context),
  skeletonRibPoint: async (context) => runRibNudgeCanonical(context),
  editableGeneratedPoint: async (context) => runEditableGeneratedNudgeCanonical(context),
  editableGeneratedHandle: async (context) =>
    runEditableGeneratedNudgeCanonical(context),
};

export const legacyDragAdapters = {
  component: async (context) => runRegularDragLegacy(context),
  componentOrigin: async (context) => runRegularDragLegacy(context),
  componentTCenter: async (context) => runRegularDragLegacy(context),
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
