import { arrowKeyDeltas, parseSelection } from "@fontra/core/utils.js";

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
    return;
  }
  await pointerTool._handleEqualizeHandlesDragForPath(
    eventStream,
    initialEvent,
    handleInfo,
    positionedGlyph
  );
}

async function runTunniDragLegacy({ pointerTool, eventStream, initialEvent }) {
  return pointerTool._handleTunniPointDrag(eventStream, initialEvent);
}

async function runSkeletonTunniDragLegacy({
  pointerTool,
  eventStream,
  initialEvent,
  tunniHit,
}) {
  await pointerTool._handleSkeletonTunniDrag(eventStream, initialEvent, tunniHit);
}

async function runNudgeLegacy({ pointerTool, event }) {
  return pointerTool._handleArrowKeysLegacy(event);
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
  return true;
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
        return handled;
      }
    }
  }
  return runNudgeOrchestration({
    sceneController,
    event,
  });
}

async function runSkeletonNudgeCanonical({ pointerTool, event }) {
  return pointerTool._handleArrowKeysLegacy(event);
}

async function runRibNudgeCanonical({ pointerTool, sceneController, event }) {
  const { skeletonRibPoint: ribPointSelection } = parseSelection(
    sceneController.selection
  );
  if (!ribPointSelection?.size) {
    return false;
  }
  await pointerTool._handleArrowKeysForRibPoints(event, ribPointSelection);
  return true;
}

async function runEditableGeneratedNudgeCanonical({ pointerTool, event }) {
  return pointerTool._handleArrowKeysLegacy(event);
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
    return pointerTool._handleDragMixedSelection(
      eventStream,
      initialEvent,
      effectiveSkeletonPointSelection
    );
  },
  tunniPoint: async (context) => runTunniDragLegacy(context),
  skeletonTunniPoint: async (context) => runSkeletonTunniDragLegacy(context),
};

export const legacyNudgeAdapters = {
};
