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
} from "./pointer-objects.js";

export async function runPointLikeDragKernel({
  eventStream,
  initialEvent,
  getBehaviorNameForEvent,
  getPointForEvent,
  onBehaviorChanged,
  onEvent,
}) {
  assert(eventStream, "runPointLikeDragKernel: missing eventStream");
  assert(initialEvent, "runPointLikeDragKernel: missing initialEvent");
  assert(
    typeof getBehaviorNameForEvent === "function",
    "runPointLikeDragKernel: missing getBehaviorNameForEvent"
  );
  assert(
    typeof getPointForEvent === "function",
    "runPointLikeDragKernel: missing getPointForEvent"
  );
  assert(typeof onEvent === "function", "runPointLikeDragKernel: missing onEvent");

  const initialPoint = getPointForEvent(initialEvent);
  let behaviorName = getBehaviorNameForEvent(initialEvent);

  for await (const event of eventStream) {
    const nextBehaviorName = getBehaviorNameForEvent(event);
    if (nextBehaviorName !== behaviorName) {
      behaviorName = nextBehaviorName;
      if (onBehaviorChanged) {
        await onBehaviorChanged({ behaviorName, event, initialPoint });
      }
    }
    const currentPoint = getPointForEvent(event);
    const delta = {
      x: currentPoint.x - initialPoint.x,
      y: currentPoint.y - initialPoint.y,
    };
    await onEvent({
      event,
      behaviorName,
      initialPoint,
      currentPoint,
      delta,
    });
  }
}

function getNudgeDeltaForEvent(event) {
  let [dx, dy] = arrowKeyDeltas[event.key] || [0, 0];
  if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
    dx *= 100;
    dy *= 100;
  } else if (event.shiftKey) {
    dx *= 10;
    dy *= 10;
  }
  return { x: dx, y: dy };
}

export async function runPointLikeNudgeKernel({ event, onNudge }) {
  assert(event, "runPointLikeNudgeKernel: missing event");
  assert(typeof onNudge === "function", "runPointLikeNudgeKernel: missing onNudge");
  const delta = getNudgeDeltaForEvent(event);
  await onNudge({ event, delta });
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

  const adapterResult = await adapter({
    ..._context,
    runPointLikeDragKernel,
  });

  if (adapterResult === false) {
    return false;
  }
  assert(
    adapterResult && "forward" in adapterResult && "rollback" in adapterResult,
    `runDragRoutingOrchestration: adapter ${objectKind} must return { forward, rollback } or false`
  );
  return true;
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

  const adapterResult = await adapter({
    ..._context,
    runNudgeOrchestration,
    runPointLikeNudgeKernel,
  });
  if (adapterResult === false) {
    return false;
  }
  assert(
    adapterResult && "forward" in adapterResult && "rollback" in adapterResult,
    `runNudgeRoutingOrchestration: adapter ${objectKind} must return { forward, rollback } or false`
  );
  return true;
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
