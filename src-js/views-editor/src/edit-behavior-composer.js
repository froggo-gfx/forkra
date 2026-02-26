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
import {
  getSkeletonData,
  setSkeletonData,
  regenerateSkeletonContours,
} from "@fontra/core/skeleton-contour-generator.js";

/**
 * Resolve behavior plan from object kind, modality, and modifiers.
 * 
 * @param {string} objectKind - The type of object: "regularPoint", "skeletonPoint", "ribPoint", etc.
 * @param {string} modality - The interaction mode: "drag" or "nudge"
 * @param {Object} modifiers - Modifier state: { shiftKey, altKey, ctrlKey, metaKey, zKey, xKey, qKey }
 * @returns {Object} Plan object: { objectKind, behaviorType, modality, supported, reason? }
 */
export function resolveBehaviorPlan(objectKind, modality, modifiers = {}) {
  // Normalize modifiers to flags object
  const flags = {
    shift: !!modifiers.shiftKey,
    alt: !!modifiers.altKey,
    ctrl: !!modifiers.ctrlKey || !!modifiers.metaKey,
    z: !!modifiers.zKey,
    x: !!modifiers.xKey,
    q: !!modifiers.qKey,
  };

  // Resolve intent from modifiers
  const intent = resolveModifierIntent(objectKind, flags);
  
  // Map intent to behavior type
  const behaviorType = mapIntentToBehaviorType(intent, modality);
  
  // Check if this combination is supported
  const supported = isBehaviorSupported(objectKind, behaviorType, modality);
  
  const plan = {
    objectKind,
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
 */
function mapIntentToBehaviorType(intent, modality) {
  // For now, use the existing behavior naming from edit-behavior.js
  // This can be refined as the refactor progresses
  
  if (intent.equalize) {
    return "equalize";
  }
  if (intent.interpolate) {
    return "interpolate";
  }
  if (intent.alternate && intent.constrain) {
    return "alternate-constrain";
  }
  if (intent.alternate) {
    return "alternate";
  }
  if (intent.constrain) {
    return "constrain";
  }
  if (intent.quantize) {
    return "quantize";
  }
  
  return "default";
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
  
  const { objectKind, behaviorType, modality } = plan;
  
  // Get behavior definition from Layer 1
  const behaviorDef = getBehaviorPreset(objectKind, behaviorType);
  
  if (!behaviorDef) {
    return { executor: null, plan: { ...plan, supported: false, reason: "No behavior definition found" } };
  }
  
  // Create adapter based on object kind
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
 * This will be replaced by pointer-objects.js (Layer 2) after Step 09.
 * For now, this is a temporary implementation to support Step 08.
 */
function createDataAdapter(objectKind, context) {
  const { data, selection, glyph, skeletonData, ribHit, handleInfo } = context;
  
  switch (objectKind) {
    case "regularPoint": {
      return new RegularPointDataAdapter(glyph || data, selection);
    }
    case "skeletonPoint": {
      const skelData = skeletonData || getSkeletonData(glyph || data);
      return new SkeletonPointDataAdapter(skelData, selection);
    }
    case "ribPoint": {
      const skelData = skeletonData || getSkeletonData(glyph || data);
      if (ribHit?.isEditable) {
        return new EditableRibDataAdapter(skelData, ribHit);
      }
      return new RibDataAdapter(skelData, ribHit);
    }
    case "skeletonHandle": {
      const skelData = skeletonData || getSkeletonData(glyph || data);
      return new SkeletonHandleDataAdapter(skelData, selection);
    }
    default:
      return null;
  }
}

/**
 * Temporary data adapter for regular points.
 * Will be replaced by pointer-objects.js after Step 09.
 */
class RegularPointDataAdapter {
  constructor(glyph, selection) {
    this.glyph = glyph;
    this.selection = selection;
    this.factory = new EditBehaviorFactory(glyph, selection);
  }
  
  applyBehavior(behaviorDef, delta, context) {
    const { roundFunc, event } = context;
    const behaviorName = behaviorDef.presetName || "default";
    const behavior = this.factory.getBehavior(behaviorName);
    
    // Apply rounding if provided
    if (roundFunc) {
      const roundedDelta = {
        x: roundFunc(delta.x),
        y: roundFunc(delta.y),
      };
      return behavior.makeChangeForDelta(roundedDelta);
    }
    
    return behavior.makeChangeForDelta(delta);
  }
  
  getRollback() {
    // Return rollback changes from the factory's current behavior
    const behavior = this.factory.getBehavior("default");
    return behavior.rollbackChange || [];
  }
}

/**
 * Temporary data adapter for skeleton points.
 * Will be replaced by pointer-objects.js after Step 09.
 */
class SkeletonPointDataAdapter {
  constructor(skeletonData, selection) {
    this.skeletonData = skeletonData;
    this.selection = selection;
  }
  
  applyBehavior(behaviorDef, delta, context) {
    const { roundFunc, event, contourIndex = 0 } = context;
    const behaviorName = behaviorDef.presetName || "default";
    
    const behavior = new SkeletonEditBehavior(
      this.skeletonData,
      contourIndex,
      Array.from(this.selection || []),
      behaviorName,
      false,
      roundFunc || Math.round
    );
    
    return behavior.applyDelta(delta);
  }
  
  getRollback() {
    return [];
  }
}

/**
 * Temporary data adapter for rib points.
 * Will be replaced by pointer-objects.js after Step 09.
 */
class RibDataAdapter {
  constructor(skeletonData, ribHit) {
    this.skeletonData = skeletonData;
    this.ribHit = ribHit;
  }
  
  applyBehavior(behaviorDef, delta, context) {
    const { roundFunc } = context;
    const behaviorName = behaviorDef.presetName || "default";
    
    const behavior = new RibEditBehavior(
      this.skeletonData,
      this.ribHit,
      behaviorName
    );
    
    return behavior.applyDelta(delta, roundFunc);
  }
  
  getRollback() {
    return [];
  }
}

/**
 * Temporary data adapter for editable rib points.
 * Will be replaced by pointer-objects.js after Step 09.
 */
class EditableRibDataAdapter {
  constructor(skeletonData, ribHit) {
    this.skeletonData = skeletonData;
    this.ribHit = ribHit;
  }
  
  applyBehavior(behaviorDef, delta, context) {
    const { roundFunc } = context;
    const behaviorName = behaviorDef.presetName || "default";
    
    const behavior = new EditableRibBehavior(
      this.skeletonData,
      this.ribHit,
      behaviorName
    );
    
    return behavior.applyDelta(delta, roundFunc);
  }
  
  getRollback() {
    return [];
  }
}

/**
 * Temporary data adapter for skeleton handles.
 * Will be replaced by pointer-objects.js after Step 09.
 */
class SkeletonHandleDataAdapter {
  constructor(skeletonData, selection) {
    this.skeletonData = skeletonData;
    this.selection = selection;
  }
  
  applyBehavior(behaviorDef, delta, context) {
    // Handle-specific behavior (equalize, etc.)
    // This is a simplified implementation for Step 08
    return { changes: [], rollback: [] };
  }
  
  getRollback() {
    return [];
  }
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
 * @param {Object} executor - Executor from createBehaviorExecutor() with applyDelta() method
 * @param {AsyncIterable} eventStream - Stream of drag events
 * @param {Object} context - Context with sceneController, computeDelta, undoLabel, etc.
 */
export async function runDragOrchestration(executor, eventStream, context) {
  const { sceneController, computeDelta, undoLabel = "Drag" } = context;
  
  if (!executor) {
    console.warn("runDragOrchestration: no executor provided");
    return;
  }
  
  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    const accumulatedChanges = new ChangeCollector();
    
    for await (const event of eventStream) {
      const delta = computeDelta ? computeDelta(event) : context.delta;
      const roundFunc = makeRoundFunc(event);
      
      // Apply delta through executor
      const result = executor.applyDelta(delta, { roundFunc, event });
      
      // Apply result to glyph layers
      const changes = applyDragResultToGlyph(glyph, result, context);
      
      // Accumulate changes
      accumulatedChanges.concat(changes);
      
      // Send incremental change
      await sendIncrementalChange(changes.change, true);
    }
    
    // Final commit
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
 * This is a simplified implementation for Step 08.
 */
function applyDragResultToGlyph(glyph, result, context) {
  const { sceneController } = context;
  const allChanges = [];
  
  // Apply to all editing layers
  for (const editLayerName of sceneController.editingLayerNames || []) {
    const layer = glyph.layers[editLayerName];
    if (!layer) continue;
    
    // Apply changes based on result type
    if (result.pathChange) {
      // For skeleton/rib changes
      applyChange(layer, result.pathChange);
      allChanges.push(
        consolidateChanges(result.pathChange, ["layers", editLayerName, "glyph"])
      );
    }
    
    if (result.editChange) {
      // For regular point changes
      applyChange(layer, result.editChange);
      allChanges.push(
        consolidateChanges(result.editChange, ["layers", editLayerName, "glyph"])
      );
    }
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
