/**
 * Layer 3: Composition Layer
 * 
 * This module orchestrates the composition of Behavior Types (Layer 1) 
 * and Data Adapters (Layer 2) to create unified executors for drag/nudge operations.
 * 
 * Architecture:
 * - resolveBehaviorPlan(): modifiers → Plan (objectKind, behaviorType, modality)
 * - createBehaviorExecutor(): Plan + context → Executor with applyDelta()
 * - runDragOrchestration(): shared drag event stream handling
 * - runNudgeOrchestration(): shared nudge single-delta application
 * 
 * Layer Boundaries:
 * - Imports ONLY from Layer 1 (edit-behavior.js) and core modules
 * - Does NOT import from Layer 4 (edit-tools-pointer.js)
 * - Does NOT directly call editGlyph() or sendIncrementalChange()
 */

import { ChangeCollector, consolidateChanges, applyChange } from "@fontra/core/changes.js";
import { recordChanges } from "@fontra/core/change-recorder.js";
import {
  getBehaviorPreset,
  resolveModifierIntent,
  resolveModifierIntentResult,
  BEHAVIOR_TABLES,
  EditBehaviorFactory,
  SkeletonEditBehavior,
  RibEditBehavior,
  EditableRibBehavior,
  InterpolatingRibBehavior,
  EditableHandleBehavior,
  makeRoundFunc,
} from "./edit-behavior.js";
import { getDataAdapterFactory } from "./pointer-objects.js";
import {
  getSkeletonData,
  setSkeletonData,
  regenerateSkeletonContours,
} from "@fontra/core/skeleton-contour-generator.js";

/**
 * Map objectKind from pointer-objects naming to behavior table naming.
 * Pointer objects uses descriptive names like "regularPoint", "skeletonPoint".
 * Behavior tables use base names like "regular", "skeleton", "rib".
 */
function normalizeObjectKind(objectKind) {
  const mapping = {
    regularPoint: "regular",
    skeletonPoint: "skeleton",
    ribPoint: "rib",
    regularHandle: "regular",
    skeletonHandle: "skeleton",
  };
  return mapping[objectKind] || objectKind;
}

/**
 * Resolve behavior plan from object kind, modality, and modifiers.
 *
 * @param {string} objectKind - The type of object: "regularPoint", "skeletonPoint", "ribPoint", etc.
 * @param {string} modality - The interaction mode: "drag" or "nudge"
 * @param {Object} modifiers - Modifier state: { shiftKey, altKey, ctrlKey, metaKey, zKey, xKey, qKey }
 * @returns {Object} Plan object: { objectKind, behaviorType, modality, supported, reason? }
 */
export function resolveBehaviorPlan(objectKind, modality, modifiers = {}) {
  // Normalize objectKind to behavior table naming
  const normalizedObjectKind = normalizeObjectKind(objectKind);

  // Normalize modifiers to flags object
  const flags = {
    shift: !!modifiers.shiftKey,
    alt: !!modifiers.altKey,
    ctrl: !!modifiers.ctrlKey || !!modifiers.metaKey,
    z: !!modifiers.zKey,
    x: !!modifiers.xKey,
    q: !!modifiers.qKey,
  };

  // Resolve intent from modifiers using normalized objectKind
  const intent = resolveModifierIntent(normalizedObjectKind, flags);

  // Map intent to behavior type
  const behaviorType = mapIntentToBehaviorType(intent, modality);

  // Check if this combination is supported using normalized objectKind
  const supported = isBehaviorSupported(normalizedObjectKind, behaviorType, modality);

  const plan = {
    objectKind,  // Keep original objectKind for adapter routing
    normalizedObjectKind,  // Add normalized for behavior lookup
    behaviorType,
    modality,
    supported,
  };

  if (!supported) {
    plan.reason = getUnsupportedReason(objectKind, behaviorType, modality);
  }

  return plan;
}

/**
 * Map modifier intent to behavior type name.
 * This is the central routing from modifiers to behavior semantics.
 * 
 * @param {string} intent - Intent string: "default", "constrain", "alternate", "equalize", etc.
 * @param {string} modality - "drag" or "nudge"
 * @returns {string} Behavior type name matching edit-behavior.js preset names
 */
function mapIntentToBehaviorType(intent, modality) {
  // resolveModifierIntent returns a string, not an object
  // Map intent strings to behavior type names
  switch (intent) {
    case "equalize":
      return "equalize";
    case "interpolate":
      return "interpolate";
    case "alternate-constrain":
      return "alternate-constrain";
    case "alternate":
      return "alternate";
    case "constrain":
      return "constrain";
    case "quantize":
      return "quantize";
    case "tangent":
      return "tangent";
    default:
      return "default";
  }
}

/**
 * Check if a behavior is supported for the given object kind and modality.
 */
function isBehaviorSupported(objectKind, behaviorType, modality) {
  const table = getBehaviorTable(objectKind);
  return !!table[behaviorType];
}

/**
 * Get the behavior table for an object kind.
 */
function getBehaviorTable(objectKind) {
  // Use imported BEHAVIOR_TABLES from edit-behavior.js
  return BEHAVIOR_TABLES[objectKind] || BEHAVIOR_TABLES.regular;
}

/**
 * Get reason why a behavior combination is not supported.
 */
function getUnsupportedReason(objectKind, behaviorType, modality) {
  return `Behavior "${behaviorType}" not supported for ${objectKind} in ${modality} mode`;
}

/**
 * Create an executor that combines behavior definition with data adapter.
 * 
 * @param {Object} plan - The behavior plan from resolveBehaviorPlan()
 * @param {Object} context - Context object with data, selection, sceneController, etc.
 * @returns {Object} { executor, plan } where executor has applyDelta(delta, options) method
 */
export function createBehaviorExecutor(plan, context) {
  if (!plan.supported) {
    return { executor: null, plan };
  }

  const { objectKind, normalizedObjectKind, behaviorType, modality } = plan;

  // Get behavior definition from Layer 1 using normalized objectKind
  const behaviorDef = getBehaviorPreset(normalizedObjectKind, behaviorType);

  if (!behaviorDef) {
    return { executor: null, plan: { ...plan, supported: false, reason: "No behavior definition found" } };
  }

  // Add presetName to behaviorDef for adapter compatibility
  behaviorDef.presetName = behaviorType;

  // Create adapter based on original objectKind (for adapter routing)
  const adapter = createDataAdapter(objectKind, context);

  if (!adapter) {
    return { executor: null, plan: { ...plan, supported: false, reason: "No adapter found for object kind" } };
  }

  // Create unified executor
  const executor = {
    applyDelta(delta, options = {}) {
      return adapter.applyBehavior(behaviorDef, delta, {
        ...context,
        ...options,
        modality,
      });
    },
    getRollback() {
      return adapter.getRollback();
    },
  };

  return { executor, plan };
}

/**
 * Factory function to create data adapters for different object kinds.
 * Uses POINTER_OBJECTS registry from Layer 2 (pointer-objects.js).
 */
function createDataAdapter(objectKind, context) {
  const getAdapter = getDataAdapterFactory(objectKind);
  if (!getAdapter) {
    return null;
  }
  return getAdapter(context);
}

/**
 * Shared orchestration for drag modality.
 *
 * Handles:
 * - Event stream iteration (for await (const event of eventStream))
 * - Layer iteration (applies changes to all editing layers)
 * - Change accumulation and incremental sending
 *
 * Does NOT contain behavior-specific math (delegates to executor).
 *
 * @param {Object} planOrExecutor - Either a plan from resolveBehaviorPlan() or an executor object
 * @param {AsyncIterable} eventStream - Stream of drag events
 * @param {Object} context - Context with sceneController, computeDelta, undoLabel, etc.
 */
export async function runDragOrchestration(planOrExecutor, eventStream, context) {
  const { sceneController, computeDelta, undoLabel = "Drag" } = context;

  // Check if we received a plan or an executor
  let executor = planOrExecutor;
  let plan = null;
  
  if (planOrExecutor?.objectKind) {
    // It's a plan, create executor inside editGlyph
    plan = planOrExecutor;
    executor = null;
  }

  if (!executor && !plan) {
    console.warn("runDragOrchestration: no executor or plan provided");
    return;
  }

  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    // Create executors inside editGlyph if we have a plan
    let executors = [];
    
    if (plan && !executor) {
      // Get all editing layers using the same method as legacy code
      const layerInfo = Object.entries(
        sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      ).map(([layerName, layerGlyph]) => ({
        layerName,
        layerGlyph,
        changePath: ["layers", layerName, "glyph"],
      }));
      
      if (!layerInfo.length) {
        console.warn("runDragOrchestration: no editing layers found");
        return;
      }
      
      // Create an executor for each layer
      for (const layer of layerInfo) {
        const adapterContext = {
          glyph: layer.layerGlyph,
          selection: context.selection,
          sceneController,
          scalingEditBehavior: context.scalingEditBehavior,
        };
        
        const result = createBehaviorExecutor(plan, adapterContext);
        if (result.executor) {
          result.executor._layerInfo = [layer];  // Store this layer for rollback
          executors.push(result.executor);
        }
      }
      
      if (!executors.length) {
        console.warn("runDragOrchestration: failed to create any executor");
        return;
      }
      
      // Use first executor for applyDelta (they all do the same thing)
      executor = executors[0];
    }

    if (!executor) {
      console.warn("runDragOrchestration: no executor available");
      return;
    }

    const accumulatedChanges = new ChangeCollector();
    const rollbackParts = [];
    let currentBehaviorType = plan.behaviorType;

    for await (const event of eventStream) {
      const delta = computeDelta ? computeDelta(event) : context.delta;
      const roundFunc = makeRoundFunc(event);

      // Get current equalizeMode (supports mid-drag X key toggle)
      const currentEqualizeMode = context.getEqualizeMode ? context.getEqualizeMode() : context.equalizeMode;

      // Check if behavior changed (e.g., Shift pressed mid-drag, X toggled mid-drag)
      const newPlan = resolveBehaviorPlan(plan.objectKind, "drag", {
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey || event.metaKey,
        xKey: currentEqualizeMode,
      });
      
      console.log("Mid-drag check:", {
        currentBehaviorType,
        newBehaviorType: newPlan.behaviorType,
        shiftKey: event.shiftKey,
        xKey: currentEqualizeMode,
        behaviorChanged: newPlan.supported && newPlan.behaviorType !== currentBehaviorType
      });
      
      if (newPlan.supported && newPlan.behaviorType !== currentBehaviorType) {
        // Behavior changed - apply rollback and create new executor
        currentBehaviorType = newPlan.behaviorType;
        
        const rollback = executor.getRollback();
        if (rollback && executors[0]._layerInfo) {
          for (const layer of executors[0]._layerInfo) {
            rollbackParts.push(consolidateChanges(rollback, layer.changePath));
          }
        }
        
        // Create new executor with new behavior type
        const firstLayer = executors[0]._layerInfo[0];
        const adapterContext = {
          glyph: firstLayer.layerGlyph,
          selection: context.selection,
          sceneController,
          scalingEditBehavior: context.scalingEditBehavior,
        };
        
        const result = createBehaviorExecutor(newPlan, adapterContext);
        if (result.executor) {
          result.executor._layerInfo = executors[0]._layerInfo;
          executors = [result.executor];
          executor = result.executor;
        }
      }

      // Apply delta through executor (applies to all layers via applyDragResultToGlyph)
      const result = executor.applyDelta(delta, { roundFunc, event });

      // Apply result to glyph layers
      const changes = applyDragResultToGlyph(glyph, result, context);

      // Accumulate changes - push the whole change structure with path
      if (changes) {
        accumulatedChanges._ensureForwardChanges();
        // Push the entire change object (which includes the path)
        accumulatedChanges._forwardChanges.push(changes);
      }

      // Send incremental change
      await sendIncrementalChange(changes, true);
    }

    // Get rollback from all executors and wrap with layer paths
    for (const exec of executors) {
      const rollback = exec.getRollback();
      if (rollback && exec._layerInfo) {
        for (const layer of exec._layerInfo) {
          const wrapped = consolidateChanges(rollback, layer.changePath);
          rollbackParts.push(wrapped);
        }
      }
    }

    // Final commit with rollback - use accumulatedChanges directly
    const finalRollback = consolidateChanges(rollbackParts);
    
    // Add rollback to the accumulated changes
    if (finalRollback && finalRollback.c) {
      accumulatedChanges._ensureRollbackChanges();
      // Push rollback changes with the path added
      if (Array.isArray(finalRollback.c)) {
        for (const rc of finalRollback.c) {
          // Add the path to each individual rollback change
          const rcWithPath = { ...rc, p: finalRollback.p };
          accumulatedChanges._rollbackChanges.push(rcWithPath);
        }
      } else {
        accumulatedChanges._rollbackChanges.push(finalRollback);
      }
    }
    
    await sendIncrementalChange(accumulatedChanges.change);

    return {
      changes: accumulatedChanges,
      undoLabel: undoLabel,
      broadcast: true,
    };
  });
}

/**
 * Helper to apply drag result to glyph layers.
 * Handles both direct changes and wrapped result objects.
 */
function applyDragResultToGlyph(glyph, result, context) {
  const { sceneController } = context;
  const allChanges = [];

  // Normalize result - adapter may return change directly or wrapped object
  const editChange = result?.editChange || result?.pathChange || result;

  if (!editChange) {
    return consolidateChanges(allChanges);
  }

  // Get editing layers using the same method as legacy code
  const layerInfo = Object.entries(
    sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
  ).map(([layerName, layerGlyph]) => ({
    layerName,
    layerGlyph,
    changePath: ["layers", layerName, "glyph"],
  }));
  
  // Apply to all editing layers (matching legacy code structure)
  for (const layer of layerInfo) {
    applyChange(layer.layerGlyph, editChange);
    allChanges.push(consolidateChanges(editChange, layer.changePath));
  }

  return consolidateChanges(allChanges);
}

/**
 * Shared orchestration for nudge modality.
 * 
 * Handles:
 * - Single delta application (not a stream)
 * - Layer iteration (applies to all editing layers)
 * - Change consolidation
 * 
 * Does NOT contain behavior-specific math (delegates to executor).
 * 
 * @param {Object} executor - Executor from createBehaviorExecutor() with applyDelta() method
 * @param {Object} delta - Delta object: { x, y }
 * @param {Object} context - Context with sceneController, undoLabel, etc.
 */
export async function runNudgeOrchestration(executor, delta, context) {
  const { sceneController, undoLabel = "Nudge" } = context;
  
  if (!executor) {
    console.warn("runNudgeOrchestration: no executor provided");
    return;
  }
  
  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    const allChanges = [];
    const rollbackParts = [];
    
    // Apply to all editing layers
    for (const editLayerName of sceneController.editingLayerNames || []) {
      const layer = glyph.layers[editLayerName];
      if (!layer) continue;
      
      const roundFunc = (value) => makeRoundFunc(null)(value, true);
      
      // Apply delta through executor
      const result = executor.applyDelta(delta, { roundFunc, layer, editLayerName });
      
      // Apply result to layer
      const changes = applyNudgeResultToLayer(layer, result, context);
      allChanges.push(changes);
      
      // Collect rollback
      const rollback = executor.getRollback();
      if (rollback) {
        rollbackParts.push(consolidateChanges(rollback, ["layers", editLayerName, "glyph"]));
      }
    }
    
    // Consolidate all changes
    const combined = new ChangeCollector().concat(...allChanges);
    await sendIncrementalChange(combined.change);
    
    return {
      changes: combined,
      undoLabel: undoLabel,
      broadcast: true,
    };
  });
}

/**
 * Helper to apply nudge result to a layer.
 * This is a simplified implementation for Step 08.
 */
function applyNudgeResultToLayer(layer, result, context) {
  const { editLayerName } = context;
  
  if (result.pathChange) {
    // For skeleton/rib changes
    applyChange(layer, result.pathChange);
    return consolidateChanges(result.pathChange, ["layers", editLayerName, "glyph"]);
  }
  
  if (result.editChange) {
    // For regular point changes
    applyChange(layer, result.editChange);
    return consolidateChanges(result.editChange, ["layers", editLayerName, "glyph"]);
  }
  
  return consolidateChanges([]);
}

/**
 * Helper function to resolve behavior preset name from event modifiers.
 * This is exported for backward compatibility during the migration.
 */
export function resolveBehaviorPresetNameFromEvent(objectKind, modality, event) {
  const modifiers = {
    shiftKey: event?.shiftKey,
    altKey: event?.altKey,
    ctrlKey: event?.ctrlKey,
    metaKey: event?.metaKey,
  };
  
  const plan = resolveBehaviorPlan(objectKind, modality, modifiers);
  return plan.behaviorType;
}
