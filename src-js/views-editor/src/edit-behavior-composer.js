import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector, applyChange, consolidateChanges } from "@fontra/core/changes.js";
import { translate } from "@fontra/core/localization.js";
import { connectContours } from "@fontra/core/path-functions.js";
import { assert } from "@fontra/core/utils.js";
import {
  EditBehaviorFactory,
  findEqualizeHandleForPath,
  makeEqualizeDragChanges,
} from "./edit-behavior.js";
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

// Composer entry points (uniform orchestration).
// Phase 2: regular drag is routed here; other object kinds remain on legacy paths.

function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[(event.shiftKey ? 1 : 0) + (event.altKey ? 2 : 0)];
}

/**
 * Orchestrate drag edits through the behavior pipeline.
 * Required context fields:
 * - sceneController
 * - selection
 * - initialEvent
 * - eventStream
 * - glyph
 * - sendIncrementalChange
 * - scalingEditBehavior
 * - equalizeMode
 * - getEqualizeMode (optional; use for live modifier state)
 * - positionedGlyph
 * - initialClickedPointIndex
 * @returns {Promise<{ undoLabel, changes, broadcast }>}
 */
export async function runDragOrchestration(_context) {
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

  assert(sceneController, "runDragOrchestration: missing sceneController");

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

  // Setup for regular point editing
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

    // Handle behavior change for regular points
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

    // Apply regular point changes
    for (const layer of layerInfo) {
      const layerEditChange = layer.editBehavior.makeChangeForDelta(delta);
      applyChange(layer.layerGlyph, layerEditChange);
      deepEditChanges.push(consolidateChanges(layerEditChange, layer.changePath));
      layer.shouldConnect = layer.connectDetector.shouldConnect(layer.isPrimaryLayer);
    }

    // X-equalize during drag for regular handles (mid-drag activation supported)
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

/**
 * Route drag edits through the registry routing map and legacy adapters.
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
    runDragOrchestration,
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
