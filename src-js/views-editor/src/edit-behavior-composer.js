import { assert } from "@fontra/core/utils.js";
import {
  DRAG_ROUTING_MAP,
  getDragRowId,
  NUDGE_ROUTING_MAP,
  getNudgeRowId,
} from "./edit-behavior-registry.js";
import {
  canonicalDragAdapters,
  canonicalNudgeAdapters,
  specializedDragAdapters,
  mixedSelectionDragAdapters,
  mixedSelectionNudgeAdapters,
} from "./edit-behavior-adapters.js";

function supportsRouting(value) {
  return value === "CL" || value === "CA";
}

function getDragAdapterForRouting(routing, objectKind) {
  if (routing === "CA") {
    return canonicalDragAdapters[objectKind];
  }
  if (objectKind === "mixedSelection") {
    return mixedSelectionDragAdapters[objectKind];
  }
  return specializedDragAdapters[objectKind];
}

function getNudgeAdapterForRouting(routing, objectKind) {
  if (routing === "CA") {
    return canonicalNudgeAdapters[objectKind];
  }
  if (objectKind === "mixedSelection") {
    return mixedSelectionNudgeAdapters[objectKind];
  }
  return undefined;
}

/**
 * Route drag edits through the registry routing map and adapters.
 * Composer owns routing/orchestration only; adapter-side execution helpers live
 * in `edit-behavior-adapters.js`.
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
  if (!supportsRouting(routing) && rowId !== baseRowId) {
    routing = DRAG_ROUTING_MAP?.[baseRowId]?.[objectKind] || "NA";
  }
  if (!supportsRouting(routing)) {
    return false;
  }

  const adapter = getDragAdapterForRouting(routing, objectKind);
  assert(adapter, `runDragRoutingOrchestration: missing adapter for ${objectKind}`);

  const handled = await adapter(_context);

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
 * Composer owns routing/orchestration only; adapter-side execution helpers live
 * in `edit-behavior-adapters.js`.
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
  if (!supportsRouting(routing) && rowId !== baseRowId) {
    routing = NUDGE_ROUTING_MAP?.[baseRowId]?.[objectKind] || "NA";
  }
  if (!supportsRouting(routing)) {
    return false;
  }

  const adapter = getNudgeAdapterForRouting(routing, objectKind);
  assert(adapter, `runNudgeRoutingOrchestration: missing adapter for ${objectKind}`);

  const handled = await adapter({
    ..._context,
    runNudgeOrchestration,
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

