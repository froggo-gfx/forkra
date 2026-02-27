# Approach C: Adapter Interface Refactor Plan

## Executive Summary

**Current State:** The composer has skeleton-specific branching that violates the adapter pattern. Adding new object kinds requires modifying composer logic.

**Target State:** All adapters implement a uniform interface (`applyToLayer()`). Composer treats all object kinds identically. Adding new object kinds only requires implementing the adapter interface.

**Key Insight:** The adapter should encapsulate "how this object kind persists changes" - not the composer.

---

## Architecture Overview

### Current Architecture (Broken)

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Transport (edit-tools-pointer.js)                  │
│ - Hit-test, routing, transaction commit                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Composition (edit-behavior-composer.js)            │
│ - runNudgeOrchestration(), runDragOrchestration()           │
│ - PROBLEM: Has skeleton-specific branching!                 │
│   if (plan.objectKind === "skeletonPoint") { ... }          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Data Adapters (pointer-objects.js)                 │
│ - RegularPointAdapter, SkeletonPointAdapter                 │
│ - INCONSISTENT: Regular returns change objects,             │
│   Skeleton mutates directly                                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Behavior Types (edit-behavior.js)                  │
│ - EditBehavior (regular), SkeletonEditBehavior              │
│ - INCONSISTENT: Regular has makeChangeForDelta(),           │
│   Skeleton only has applyDelta()                            │
└─────────────────────────────────────────────────────────────┘
```

### Target Architecture (Fixed)

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Transport (edit-tools-pointer.js)                  │
│ - Hit-test, routing, transaction commit                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Composition (edit-behavior-composer.js)            │
│ - runNudgeOrchestration(), runDragOrchestration()           │
│ - UNIFORM: Calls executor.applyToLayer() for ALL kinds      │
│   No object-kind-specific branching                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Data Adapters (pointer-objects.js)                 │
│ - UNIFORM INTERFACE:                                        │
│   • applyNudge(delta, context) → void (mutates)             │
│   • applyToLayer(layer, layerName) → {forward, rollback}    │
│   • getRollback() → change[]                                │
│ - Each adapter encapsulates its own persistence logic       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Behavior Types (edit-behavior.js)                  │
│ - UNIFORM INTERFACE (where applicable):                     │
│   • applyDelta(delta) → mutation                            │
│   • makeChangeForDelta(delta) → change object (optional)    │
│   • getRollback() → raw data or change object               │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Implementation Plan

### Phase 1: Define the Adapter Interface

**File:** `src-js/views-editor/src/pointer-objects.js`

Add JSDoc interface definition at the top of the file:

```javascript
/**
 * Data Adapter Interface
 * 
 * All adapters must implement this interface for composer compatibility.
 * 
 * @interface DataAdapter
 * @property {string} objectKind - The kind of object this adapter handles
 * 
 * @method applyNudge
 * @param {Object} delta - The delta to apply: {x, y}
 * @param {Object} context - Context with behaviorName, roundFunc, etc.
 * @returns {void} - Mutates internal data, no return value
 * 
 * @method applyToLayer
 * @param {Object} layer - The layer object (has .glyph and .customData)
 * @param {string} layerName - The layer name for path construction
 * @returns {{forward: Object[], rollback: Object[]}} - Change objects
 * 
 * @method getRollback
 * @returns {Object[]} - Array of change objects for undo
 */
```

---

### Phase 2: Update SkeletonPointAdapter

**File:** `src-js/views-editor/src/pointer-objects.js`

**Current state:**
- `applyNudge()` mutates skeletonData, returns `true`
- No `applyToLayer()` method
- `getRollback()` returns changes with wrong paths

**Target state:**

```javascript
class SkeletonPointAdapter {
  constructor(skeletonData, selection) {
    this.skeletonData = skeletonData;
    this.selection = selection;
    this.currentBehaviorName = "default";
    this.lastBehavior = null;
  }

  _createBehavior(preset, roundFunc) {
    // Parse selection format: "contourIndex/pointIndex"
    const firstSelection = Array.from(this.selection)[0];
    if (!firstSelection) return null;
    const [contourIndexStr, pointIndexStr] = firstSelection.split("/");
    const contourIndex = parseInt(contourIndexStr, 10);
    const pointIndex = parseInt(pointIndexStr, 10);
    
    if (isNaN(contourIndex) || isNaN(pointIndex)) return null;
    
    // Extract all point indices for the same contour
    const selectedPointIndices = [];
    for (const sel of this.selection) {
      const [ci, pi] = sel.split("/");
      if (parseInt(ci, 10) === contourIndex) {
        selectedPointIndices.push(parseInt(pi, 10));
      }
    }
    
    return new SkeletonEditBehavior(
      this.skeletonData,
      contourIndex,
      selectedPointIndices,
      preset,
      false,
      roundFunc
    );
  }

  applyNudge(delta, context) {
    const behaviorName = context?.behaviorName || "default";
    this.currentBehaviorName = behaviorName;
    const behavior = this._createBehavior(behaviorName, context.roundFunc);
    if (!behavior) return;
    this.lastBehavior = behavior;
    
    // Apply delta - mutates skeletonData in place
    behavior.applyDelta(delta);
  }

  applyToLayer(layer, layerName) {
    // This adapter knows how to persist skeleton data changes
    const pathChange = recordChanges(layer.glyph, (glyph) => {
      regenerateSkeletonContours(glyph, this.skeletonData, { preferInPlace: true });
    });
    
    const customDataChange = recordChanges(layer, (l) => {
      setSkeletonData(l, this.skeletonData);
    });
    
    return {
      forward: [
        pathChange.prefixed(["layers", layerName, "glyph"]).change,
        customDataChange.prefixed(["layers", layerName]).change
      ],
      rollback: [
        pathChange.prefixed(["layers", layerName, "glyph"]).rollbackChange,
        customDataChange.prefixed(["layers", layerName]).rollbackChange
      ]
    };
  }

  getRollback() {
    if (!this.lastBehavior) return [];
    
    const rollback = this.lastBehavior.getRollback();
    const contourIndex = this.lastBehavior.contourIndex;
    
    // Convert to change objects with CORRECT paths for skeleton data
    return rollback.map(({ pointIndex, x, y }) => ({
      f: "=xy",
      a: [pointIndex, x, y],
      p: ["contours", contourIndex, "points", pointIndex]
    }));
  }
}
```

**Key changes:**
1. `_createBehavior()` correctly parses selection format
2. `applyNudge()` just mutates, no return value
3. `applyToLayer()` encapsulates skeleton-specific persistence logic
4. `getRollback()` returns changes with correct relative paths

---

### Phase 3: Update RegularPointAdapter

**File:** `src-js/views-editor/src/pointer-objects.js`

**Current state:**
- `applyNudge()` returns change object directly
- No `applyToLayer()` method

**Target state:**

```javascript
class RegularPointAdapter {
  constructor(glyph, selection) {
    this.glyph = glyph;
    this.selection = selection;
    this.factory = new EditBehaviorFactory(glyph, selection);
    this.currentBehaviorName = "default";
    this.lastDelta = null;  // Track last delta for applyToLayer
  }

  applyNudge(delta, context) {
    const behaviorName = context?.behaviorName || "default";
    this.currentBehaviorName = behaviorName;
    this.lastDelta = delta;  // Store for applyToLayer
    const behavior = this.factory.getBehavior(behaviorName);
    return behavior.makeChangeForDelta(delta);
  }

  applyToLayer(layer, layerName) {
    // For regular points, applyNudge already returns a change object
    // Just need to wrap with layer path
    const change = this.applyNudge(this.lastDelta, {
      behaviorName: this.currentBehaviorName
    });
    
    const rollback = this.getRollback();
    
    return {
      forward: [consolidateChanges(change, ["layers", layerName, "glyph"])],
      rollback: [consolidateChanges(rollback, ["layers", layerName, "glyph"])]
    };
  }

  getRollback() {
    const behavior = this.factory.getBehavior(this.currentBehaviorName);
    return behavior?.rollbackChange || [];
  }
}
```

**Key changes:**
1. Added `applyToLayer()` method (simple wrapper)
2. Track `lastDelta` so `applyToLayer()` can re-apply if needed
3. Uniform interface with SkeletonPointAdapter

---

### Phase 4: Update runNudgeOrchestration

**File:** `src-js/views-editor/src/edit-behavior-composer.js`

**Current state:**
```javascript
if (plan.objectKind === "skeletonPoint" && skeletonData) {
  // Skeleton-specific logic
  const pathChange = recordChanges(...);
  const customDataChange = recordChanges(...);
  // ...
} else {
  // Regular points
  const changes = applyNudgeResultToLayer(...);
  // ...
}
```

**Target state:**

```javascript
export async function runNudgeOrchestration(planOrExecutor, delta, context) {
  const { sceneController, undoLabel = "Nudge" } = context;

  let executor = planOrExecutor;
  let plan = null;

  if (planOrExecutor?.objectKind) {
    plan = planOrExecutor;
    executor = null;
  }

  if (!executor && !plan) {
    console.warn("runNudgeOrchestration: no executor or plan provided");
    return;
  }

  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    const allChanges = [];
    const rollbackParts = [];

    if (plan && !executor) {
      // Get all editing layers
      for (const editLayerName of sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer) continue;

        const adapterContext = {
          glyph: layer.glyph,
          skeletonData: getSkeletonData(layer.glyph),
          selection: context.selection,
          sceneController,
          scalingEditBehavior: context.scalingEditBehavior,
          behaviorName: plan.behaviorType,
        };

        const result = createBehaviorExecutor(plan, adapterContext);
        if (!result.executor) continue;

        // Apply delta - mutates data
        const roundFunc = (value) => makeRoundFunc(null)(value, true);
        result.executor.applyDelta(delta, { roundFunc });

        // Apply to layer - adapter handles persistence
        const layerResult = result.executor.applyToLayer(layer, editLayerName);
        allChanges.push(...layerResult.forward);
        rollbackParts.push(...layerResult.rollback);
      }
    }

    // Consolidate and send
    const combined = consolidateChanges(allChanges);
    await sendIncrementalChange(combined);

    // Build rollback
    const resultChangeCollector = new ChangeCollector();
    // ... (existing ChangeCollector building code)

    return {
      changes: resultChangeCollector,
      undoLabel,
      broadcast: true,
    };
  });
}
```

**Key changes:**
1. **Removed skeleton-specific branching**
2. Uniform call: `executor.applyToLayer(layer, editLayerName)`
3. Adapter handles its own persistence logic

---

### Phase 5: Update runDragOrchestration

**File:** `src-js/views-editor/src/edit-behavior-composer.js`

**Current state:**
```javascript
if (plan.objectKind === "skeletonPoint" || plan.objectKind === "skeletonHandle") {
  // Skeleton-specific logic with regenerateSkeletonContours
  // ...
} else {
  // Regular points
  const changes = applyDragResultToGlyph(...);
  // ...
}
```

**Target state:**

Similar to `runNudgeOrchestration` - uniform `applyToLayer()` call in the event loop:

```javascript
for await (const event of eventStream) {
  const delta = computeDelta ? computeDelta(event) : context.delta;
  const roundFunc = makeRoundFunc(event);

  // Apply delta - mutates data
  executor.applyDelta(delta, { roundFunc, event });

  // Apply to layer - adapter handles persistence
  for (const exec of executors) {
    const layer = exec._layerInfo?.[0];
    if (!layer) continue;
    
    const layerResult = exec.applyToLayer(layer.layerGlyph, layer.layerName);
    accumulatedChanges._ensureForwardChanges();
    accumulatedChanges._forwardChanges.push(...layerResult.forward);
    
    const incrementalChange = consolidateChanges(layerResult.forward);
    await sendIncrementalChange(incrementalChange, true);
  }
  
  // Track rollback for each frame
  // ...
}
```

---

### Phase 6: Update createBehaviorExecutor

**File:** `src-js/views-editor/src/edit-behavior-composer.js`

Add `applyToLayer()` wrapper to the executor:

```javascript
export function createBehaviorExecutor(plan, context) {
  if (!plan.supported) {
    return { executor: null, plan };
  }

  const { objectKind, normalizedObjectKind, behaviorType, modality } = plan;
  const behaviorDef = getBehaviorPreset(normalizedObjectKind, behaviorType);

  if (!behaviorDef) {
    return { executor: null, plan: { ...plan, supported: false } };
  }

  behaviorDef.presetName = behaviorType;
  const adapter = createDataAdapter(objectKind, context);

  if (!adapter) {
    return { executor: null, plan: { ...plan, supported: false } };
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
    
    // NEW: Uniform interface for persisting changes
    applyToLayer(layer, layerName) {
      return adapter.applyToLayer(layer, layerName);
    },
  };

  return { executor, plan };
}
```

---

## Completion Criteria

### Structural Criteria

| Criterion | Verification |
|-----------|--------------|
| All adapters implement `applyToLayer()` | `grep "applyToLayer" pointer-objects.js` → ≥2 matches (Regular, Skeleton) |
| Composer has no skeleton-specific branching | `grep "skeletonPoint" edit-behavior-composer.js` → only in plan resolution, not in orchestration |
| `runNudgeOrchestration()` uses uniform `applyToLayer()` call | No `if (plan.objectKind === "skeletonPoint")` in function body |
| `runDragOrchestration()` uses uniform `applyToLayer()` call | No `if (plan.objectKind === "skeletonPoint")` in function body |
| Syntax checks pass | `node --check` exits 0 for all modified files |

### Functional Criteria

| Criterion | Verification |
|-----------|--------------|
| Regular point nudge works | Manual test: select regular point, arrow keys move it |
| Regular point nudge undo/redo works | Manual test: Ctrl+Z/Ctrl+Y after nudge |
| Skeleton point nudge works | Manual test: select skeleton point, arrow keys move it |
| Skeleton point nudge undo/redo works | Manual test: Ctrl+Z/Ctrl+Y after nudge |
| Regular point drag works | Manual test: drag regular point |
| Regular point drag undo/redo works | Manual test: Ctrl+Z/Ctrl+Y after drag |
| Skeleton point drag works | Manual test: drag skeleton point |
| Skeleton point drag undo/redo works | Manual test: Ctrl+Z/Ctrl+Y after drag |
| No console errors | Browser console clean during testing |

### Architectural Criteria

| Criterion | Verification |
|-----------|--------------|
| Adding new object kind doesn't require composer changes | Code review: composer has no object-kind-specific logic |
| Adapter interface is documented | JSDoc interface definition at top of `pointer-objects.js` |
| Each adapter encapsulates its own persistence | Code review: `applyToLayer()` contains object-kind-specific logic |

---

## Files Modified

| File | Lines Changed | Description |
|------|---------------|-------------|
| `src-js/views-editor/src/pointer-objects.js` | ~100 lines | Add `applyToLayer()` to all adapters, fix `SkeletonPointAdapter` |
| `src-js/views-editor/src/edit-behavior-composer.js` | ~150 lines | Remove skeleton branching, use uniform `applyToLayer()` |
| `src-js/views-editor/src/edit-behavior.js` | ~0 lines | No changes needed (behavior interface unchanged) |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Regular point behavior regresses | Test regular-only scenarios first, compare to baseline |
| Undo/redo broken for skeleton points | Test each operation (nudge, drag) with undo/redo before moving to next |
| Path structure wrong for skeleton data | Verify change paths in browser devtools |
| Drag event loop performance | Profile drag performance, ensure no unnecessary allocations |

---

## Testing Sequence

1. **Syntax check** - `node --check` all modified files
2. **Regular point nudge** - Basic functionality
3. **Regular point nudge undo/redo** - Verify rollback
4. **Skeleton point nudge** - Basic functionality
5. **Skeleton point nudge undo/redo** - Verify rollback
6. **Regular point drag** - Basic functionality
7. **Regular point drag undo/redo** - Verify rollback
8. **Skeleton point drag** - Basic functionality
9. **Skeleton point drag undo/redo** - Verify rollback
10. **Mixed selection** - Regular + skeleton together
11. **Full baseline run** - All scenarios from baseline document

---

## Why This Achieves the Refactor Goals

1. **Eliminates duplication:** Single uniform path in composer, no repeated orchestration logic
2. **Makes new object kinds easy:** Implement adapter interface, no composer changes
3. **Clear separation:** Composer knows orchestration, adapter knows data persistence
4. **Reduces line count:** Removing skeleton branching from composer reduces complexity

This is a **true refactor** - not just moving code between files, but fundamentally changing the architecture to be more maintainable and extensible.
