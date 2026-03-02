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

async function runSkeletonDragLegacy({
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

async function runRibDragLegacy({
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

async function runEditableGeneratedPointsDragLegacy({
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

async function runEditableGeneratedHandlesDragLegacy({
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
  return pointerTool.handleArrowKeys(event);
}

export const legacyDragAdapters = {
  regularPoint: async (context) => runRegularDragLegacy(context),
  anchor: async (context) => runRegularDragLegacy(context),
  guideline: async (context) => runRegularDragLegacy(context),
  component: async (context) => runRegularDragLegacy(context),
  componentOrigin: async (context) => runRegularDragLegacy(context),
  componentTCenter: async (context) => runRegularDragLegacy(context),
  skeletonPoint: async (context) => runSkeletonDragLegacy(context),
  skeletonHandle: async ({ pointerTool, eventStream, initialEvent, equalizeSkeletonInfo }) => {
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
  },
  skeletonRibPoint: async (context) => runRibDragLegacy(context),
  editableGeneratedPoint: async (context) =>
    runEditableGeneratedPointsDragLegacy(context),
  editableGeneratedHandle: async (context) =>
    runEditableGeneratedHandlesDragLegacy(context),
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
  regularPoint: async (context) => runNudgeLegacy(context),
  anchor: async (context) => runNudgeLegacy(context),
  guideline: async (context) => runNudgeLegacy(context),
  skeletonPoint: async (context) => runNudgeLegacy(context),
  skeletonHandle: async (context) => runNudgeLegacy(context),
  skeletonRibPoint: async (context) => runNudgeLegacy(context),
  editableGeneratedPoint: async (context) => runNudgeLegacy(context),
};
