import { arrowKeyDeltas, assert } from "@fontra/core/utils.js";
import {
  DRAG_ROUTING_MAP,
  getDragRowId,
  NUDGE_ROUTING_MAP,
  getNudgeRowId,
} from "./edit-behavior-registry.js";
import {
  canonicalDragAdapters,
  canonicalNudgeAdapters,
  legacyDragAdapters,
  legacyNudgeAdapters,
} from "./edit-behavior-adapters.js";

export async function runPointLikeInputKernel({
  mode,
  eventStream,
  initialEvent,
  event,
  getBehaviorNameForEvent,
  getPointForEvent,
  onBehaviorChanged,
  onInput,
}) {
  assert(mode === "drag" || mode === "nudge", "runPointLikeInputKernel: invalid mode");
  assert(typeof onInput === "function", "runPointLikeInputKernel: missing onInput");

  if (mode === "drag") {
    assert(eventStream, "runPointLikeInputKernel(drag): missing eventStream");
    assert(initialEvent, "runPointLikeInputKernel(drag): missing initialEvent");
    assert(
      typeof getBehaviorNameForEvent === "function",
      "runPointLikeInputKernel(drag): missing getBehaviorNameForEvent"
    );
    assert(
      typeof getPointForEvent === "function",
      "runPointLikeInputKernel(drag): missing getPointForEvent"
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
    return;
  }

  assert(event, "runPointLikeInputKernel(nudge): missing event");
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

export async function runPointLikeSessionKernel({
  mode,
  runPointLikeInputKernel: inputKernel = runPointLikeInputKernel,
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
  assert(
    typeof inputKernel === "function",
    "runPointLikeSessionKernel: missing runPointLikeInputKernel"
  );

  return withEditSession(async (sendIncrementalChange, glyph) => {
    const sessionState = onSessionStart
      ? (await onSessionStart({ mode, sendIncrementalChange, glyph })) || {}
      : {};

    await inputKernel({
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

/**
 * Route drag edits through the registry routing map and adapters.
 * Required context fields:
 * - pointerTool
 * - sceneController
 * - initialEvent
 * - eventStream
 * - objectKind
 * Optional fields:
 * - forceRowId
 * - overrideSelection
 * - effectiveSkeletonPointSelection
 * - ribHit
 * - targetRibSelection
 * - preSelectedSkeletonPoints
 * - editablePoints
 * - editableHandles
 * - equalizeSkeletonInfo
 * - tunniHit
 * @returns {Promise<boolean>} handled
 */
export async function runDragRoutingOrchestration(_context) {
  const { pointerTool, sceneController, initialEvent, eventStream, objectKind, forceRowId } =
    _context;

  assert(pointerTool, "runDragRoutingOrchestration: missing pointerTool");
  assert(sceneController, "runDragRoutingOrchestration: missing sceneController");
  assert(initialEvent, "runDragRoutingOrchestration: missing initialEvent");
  assert(eventStream, "runDragRoutingOrchestration: missing eventStream");
  assert(objectKind, "runDragRoutingOrchestration: missing objectKind");

  const modifiers = {
    shiftKey: initialEvent.shiftKey,
    altKey: initialEvent.altKey,
    equalizeMode: pointerTool.equalizeMode,
    tangentRibMode: pointerTool.tangentRibMode,
    fixedRibMode: pointerTool.fixedRibMode,
    fixedRibCompressMode: pointerTool.fixedRibCompressMode,
  };

  const rowId = forceRowId || getDragRowId(modifiers);
  const baseRowId = getDragRowId({
    shiftKey: modifiers.shiftKey,
    altKey: modifiers.altKey,
  });
  let routing = DRAG_ROUTING_MAP?.[rowId]?.[objectKind] || "NA";
  const supportsRouting = (value) => value === "CL" || value === "CA";
  if (!supportsRouting(routing) && rowId !== baseRowId) {
    routing = DRAG_ROUTING_MAP?.[baseRowId]?.[objectKind] || "NA";
  }
  if (!supportsRouting(routing)) {
    return false;
  }

  const adapter =
    routing === "CA"
      ? canonicalDragAdapters[objectKind]
      : legacyDragAdapters[objectKind];
  assert(adapter, `runDragRoutingOrchestration: missing adapter for ${objectKind}`);

  const handled = await adapter({
    ..._context,
    runPointLikeInputKernel,
    runPointLikeSessionKernel,
  });

  // Truthful current state:
  // - adapters return `true` when they handled the route
  // - adapters return `false` when the route is not applicable or cannot run
  assert(
    typeof handled === "boolean",
    `runDragRoutingOrchestration: adapter ${objectKind} must return boolean handled/unhandled`
  );
  return handled;
}

/**
 * Orchestrate nudge edits through routing map + adapters.
 * Required context fields:
 * - pointerTool
 * - sceneController
 * - event
 * - objectKind
 * @returns {Promise<boolean>} handled
 */
export async function runNudgeRoutingOrchestration(_context) {
  const { pointerTool, sceneController, event, objectKind, forceRowId } = _context;
  assert(pointerTool, "runNudgeRoutingOrchestration: missing pointerTool");
  assert(sceneController, "runNudgeRoutingOrchestration: missing sceneController");
  assert(event, "runNudgeRoutingOrchestration: missing event");
  assert(objectKind, "runNudgeRoutingOrchestration: missing objectKind");

  const modifiers = {
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    equalizeMode: pointerTool.equalizeMode,
    tangentRibMode: pointerTool.tangentRibMode,
    fixedRibMode: pointerTool.fixedRibMode,
    fixedRibCompressMode: pointerTool.fixedRibCompressMode,
  };

  const rowId = forceRowId || getNudgeRowId(modifiers);
  const baseRowId = getNudgeRowId({
    shiftKey: modifiers.shiftKey,
    altKey: modifiers.altKey,
  });
  let routing = NUDGE_ROUTING_MAP?.[rowId]?.[objectKind] || "NA";
  const supportsRouting = (value) => value === "CL" || value === "CA";
  if (!supportsRouting(routing) && rowId !== baseRowId) {
    routing = NUDGE_ROUTING_MAP?.[baseRowId]?.[objectKind] || "NA";
  }
  if (!supportsRouting(routing)) {
    return false;
  }

  const adapter =
    routing === "CA"
      ? canonicalNudgeAdapters[objectKind]
      : legacyNudgeAdapters[objectKind];
  assert(adapter, `runNudgeRoutingOrchestration: missing adapter for ${objectKind}`);

  const handled = await adapter({
    ..._context,
    runNudgeOrchestration,
    runPointLikeInputKernel,
    runPointLikeSessionKernel,
  });

  // Truthful current state:
  // - adapters return `true` when they handled the route
  // - adapters return `false` when the route is not applicable or cannot run
  assert(
    typeof handled === "boolean",
    `runNudgeRoutingOrchestration: adapter ${objectKind} must return boolean handled/unhandled`
  );
  return handled;
}

/**
 * Orchestrate nudge edits through the behavior pipeline.
 * Required context fields:
 * - sceneController
 * - event
 * @returns {Promise<{ undoLabel, changes, broadcast }>}
 */
export async function runNudgeOrchestration(_context) {
  const { sceneController, event } = _context;
  assert(sceneController, "runNudgeOrchestration: missing sceneController");
  assert(event, "runNudgeOrchestration: missing event");
  return sceneController.handleArrowKeys(event);
}
