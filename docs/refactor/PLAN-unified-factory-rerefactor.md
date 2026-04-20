# Unified Factory Re-Refactor Plan

Date: 2026-04-19
Status: Draft
Supersedes: The adapter/registry/composer architecture from the broad unified-behavior refactor

---

## Problem Statement

The broad unified-behavior refactor introduced a 3-layer pipeline for point-like drag/nudge:

```
Pointer → Registry (routing map) → Composer (dispatch) → Adapters (execution)
```

This pipeline spans 6,074 lines across 3 files:
- `edit-behavior-registry.js` (456 LOC) — routing matrix
- `edit-behavior-composer.js` (181 LOC) — dispatch glue
- `edit-behavior-adapters.js` (5,437 LOC) — handler functions

The problem: this architecture was supposed to make skeleton objects "work like native ones."
Instead, it made native objects work through 3 extra layers of indirection.

Regular points already had a clean, direct mechanism: `EditBehaviorFactory`. The factory takes
a selection, creates behaviors, and behaviors produce changes via `makeChangeForDelta(delta)`.
That pattern handles points, anchors, guidelines, and components — all with different persistence
targets — through one uniform interface.

The adapter/registry/composer layers are unnecessary. Skeleton objects have a different persistence
target (skeleton data + contour regeneration), but `EditBehaviorFactory` already handles multiple
persistence targets. The 6,000+ lines of machinery can be replaced by extending the factory.

---

## Target Architecture

### Before (current)

```
Pointer
  → classifies selection → objectKind
  → calls runDragRoutingOrchestration({ objectKind, ... })
    → Composer looks up DRAG_ROUTING_MAP[row][objectKind]
    → Composer finds adapter in canonicalDragAdapters[objectKind]
    → Adapter runs handler function
      → Handler creates behaviors, manages session, persists
```

8+ separate adapter functions. Each objectKind has its own handler.
Shared "session kernels" and "input kernels" add abstraction without unifying behavior.

### After (target)

```
Pointer
  → creates EditBehaviorFactory(layerGlyph, selection)
  → behavior = factory.getBehavior(behaviorName)
  → drag loop: change = behavior.makeChangeForDelta(delta)
  → applyChange(layerGlyph, change)
  → sendIncrementalChange(change)
```

Same ~30 lines for ALL object types. The factory internally handles:

| Selection type | What the factory does internally |
|---------------|----------------------------------|
| `point/` | Mutates path points (existing behavior, unchanged) |
| `anchor/` | Mutates anchors (existing behavior, unchanged) |
| `guideline/` | Mutates guidelines (existing behavior, unchanged) |
| `component/` | Mutates component transforms (existing behavior, unchanged) |
| `skeletonPoint/` | Mutates skeleton data, regenerates contours |
| `skeletonHandle/` | Mutates skeleton handle data, regenerates contours |
| `skeletonRibPoint/` | Applies rib-normal constraint, mutates skeleton data, regenerates |
| `editableGeneratedPoint/` | Applies editable constraints, mutates skeleton data, regenerates |
| `editableGeneratedHandle/` | Applies handle-direction constraint, mutates skeleton data, regenerates |

The consumer (pointer) never knows which kind it's dealing with.

### Tunni Exception

Tunni points are non-selection drag targets with a fundamentally different drag model
(they move control points, not themselves; they project delta onto handle directions).
Tunni does NOT go through the factory.

Instead:
- **Tunni handler file** (`edit-tools-tunni.js` or similar) — consolidated from scattered
  adapter code. Contains both regular and skeleton Tunni drag/equalize execution.
- **Tunni math file** (`tunni-calculations.js`) — stays as-is. Pure shared geometry.
  Used by the handler and by visualization code.
- **Pointer** calls the Tunni handler directly from `handleDrag`. No registry, no composer.

### Fat Behavior Contract

The `EditBehavior` object returned by the factory encapsulates the full lifecycle:

```js
// Consumer interface (unchanged from today):
const change = behavior.makeChangeForDelta(delta);
// `change` is a complete change object.
// For regular points: contains path mutations.
// For skeleton points: contains skeleton data mutations AND regenerated contour changes.
// Consumer doesn't know or care which.

const rollback = behavior.rollbackChange;
// Undoes all accumulated changes. Works the same for all types.
```

For skeleton types, the behavior object internally:
1. Holds cloned skeleton data as state
2. Applies delta to working skeleton copy
3. Regenerates contours from modified skeleton
4. Records changes (skeleton data + path) via `recordChanges`
5. Returns the combined change

This is NOT a new abstraction. It's extending the existing `EditBehavior` pattern that
already handles path/anchor/guideline/component differences internally.

### Pointer Drag Loop (Target State)

```js
async handleDragSelection(eventStream, initialEvent) {
  const sceneController = this.sceneController;

  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    const initialPoint = sceneController.selectedGlyphPoint(initialEvent);
    let behaviorName = getBehaviorName(initialEvent);

    const layerInfo = Object.entries(
      sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
    ).map(([layerName, layerGlyph]) => {
      const factory = new EditBehaviorFactory(
        layerGlyph,
        sceneController.selection,
        this.scalingEditBehavior
      );
      return {
        layerName,
        layerGlyph,
        changePath: ["layers", layerName, "glyph"],
        factory,
        editBehavior: factory.getBehavior(behaviorName),
      };
    });

    for await (const event of eventStream) {
      const newBehaviorName = getBehaviorName(event);
      if (behaviorName !== newBehaviorName) {
        behaviorName = newBehaviorName;
        for (const layer of layerInfo) {
          applyChange(layer.layerGlyph, layer.editBehavior.rollbackChange);
          layer.editBehavior = layer.factory.getBehavior(behaviorName);
        }
      }

      const currentPoint = sceneController.selectedGlyphPoint(event);
      const delta = {
        x: currentPoint.x - initialPoint.x,
        y: currentPoint.y - initialPoint.y,
      };

      for (const layer of layerInfo) {
        const change = layer.editBehavior.makeChangeForDelta(delta);
        applyChange(layer.layerGlyph, change);
        // ... send incremental
      }
    }
  });
}
```

This is essentially the existing regular-point code. It doesn't change.
What changes is what the factory returns when the selection includes skeleton types.

### What Dies

- `DRAG_ROUTING_MAP` / `NUDGE_ROUTING_MAP` — routing matrices
- `runDragRoutingOrchestration` / `runNudgeRoutingOrchestration` — composer dispatch
- `canonicalDragAdapters` / `canonicalNudgeAdapters` — adapter maps
- `runPointLikeSessionKernel` / `runPointLikeInputKernel` — session/input abstractions
- `runSkeletonPointLikeCanonical` / `runSkeletonPointLikeOrchestration` — skeleton adapters
- `runSkeletonRibPointDragCanonical` / `runSkeletonRibPointNudgeCanonical` — rib adapters
- `runEditableGeneratedPointDragCanonical` / `runEditableGeneratedNudgeCanonical` — editable adapters
- `runRegularPointLikeCanonical` / `runRegularPointLikeAdapter` — regular adapters
- `runMixedSelectionDrag` / `runMixedSelectionNudge` — mixed selection handlers
- All `_classifyPointLikeSelection` branching in pointer that routes to different orchestration calls

### What Survives (assessed at cleanup)

- `OBJECT_KINDS` — may still be useful for selection classification, hover, hit-testing
- `resolveBehaviorPreset` — modifier mapping, used somewhere
- Skeleton geometry helpers in adapters (`buildSegmentsFromSkeletonPoints`, etc.)
- Component drag handler — out of scope, stays as-is for now
- File fate decided in cleanup phase based on what's actually left

---

## Migration Strategy

### Principle: Parallel Introduction

Each object kind migrates independently. The old adapter path stays live until the new
factory path is verified. No big-bang replacement.

### Migration Order

| Phase | What | Why this order |
|-------|------|----------------|
| 0 | Infrastructure: make factory skeleton-aware | Foundation for all skeleton types |
| 1 | `skeletonPoint` on-curve drag + nudge | Simplest skeleton type |
| 2 | `skeletonHandle` off-curve drag + nudge | Same model, tests off-curve rules |
| 3 | `skeletonRibPoint` drag + nudge | Adds rib-normal constraint |
| 4 | `editableGeneratedPoint` drag + nudge | Similar to rib + editable gating |
| 5 | `editableGeneratedHandle` drag + nudge | Handle-direction constraint |
| 6 | `mixedSelection` drag + nudge | Must work after all individual types |
| 7 | Tunni consolidation | Extract to own file |
| 8 | Cleanup | Assess and clean surviving code |

### Testing Strategy

**Each migration step has two layers:**

Unit tests (TDD — write before implementation):
- Factory correctly parses the new selection type
- `makeChangeForDelta(delta)` produces correct change shape
- All applicable behavior presets produce correct constraints
- Rollback changes correctly undo
- For skeleton: change includes skeleton data mutation AND regeneration

Manual tests (after implementation):
- Every applicable modifier row from the action-object matrix
- This includes: no modifier, Shift, Alt, Shift+Alt, X (equalize), X+Shift,
  Z (rib tangent), D (fixed rib), S (fixed rib compress) — as applicable per object kind
- Nudge with arrow keys, nudge with Shift (10x)
- Undo/redo after drag and nudge
- Multi-layer editing
- Mixed selection where applicable

**Parity rule:** No user-visible behavior changes at any point. Every manual test compares
against current behavior.

---

## Constraints

1. No new user-facing behaviors. This is pure architecture.
2. No behavior changes justified as "improvements." Identical output only.
3. Each phase is self-contained. After each, the app works exactly as before.
4. Old adapter code stays until the new path is verified and manually tested.
5. File fate (registry, composer, adapters) decided based on what's left, not planned in advance.
6. Tunni handler consolidation uses one file for execution, separate from shared math.
7. Factory receives `layerGlyph` + `selection`, extracts what it needs internally.
8. `makeChangeForDelta` returns complete changes including skeleton regeneration.

---

## Plan

Detailed implementation steps follow below. Each step is small (under 500 lines changed),
TDD-adherent, and manually tested where applicable.

---

### Phase 0: Infrastructure — Make Factory Skeleton-Aware

Goal: Extend `EditBehaviorFactory` so it can parse skeleton selection types
and produce skeleton-aware `EditBehavior` objects. No pointer changes yet —
the factory gains the capability, adapters still run, nothing breaks.

#### Step 0.1: Add skeleton data unpacking to EditBehaviorFactory

Problem: `EditBehaviorFactory` currently ignores `skeletonPoint/` keys in selection.
It only parses `point/`, `anchor/`, `guideline/`, `component/`, `backgroundImage/`.

What to do:
1. Write tests first (TDD):
   - Test: factory constructed with a selection containing `skeletonPoint/0/1`
     correctly stores skeleton point data internally
   - Test: factory constructed with empty skeleton selection stores no skeleton data
   - Test: factory constructed with regular + skeleton selection stores both
   - Test file: `src-js/fontra-core/tests/test-edit-behavior-factory.js`
   - Use the existing Mocha+Chai setup
   - Tests need mock `layerGlyph` with `customData` containing skeleton data
     (use `getSkeletonData` pattern from `skeleton-contour-generator.js`)

2. Implementation:
   - In `EditBehaviorFactory` constructor, parse `skeletonPoint` from selection
   - Read skeleton data from `instance` using `getSkeletonData(instance)`
     (import from `skeleton-contour-generator.js`)
   - Store parsed skeleton points as `this.skeletonPoints` (array of
     `{ contourIndex, pointIndex }`)
   - Store skeleton data as `this.skeletonData` (cloned via `JSON.parse(JSON.stringify(...))`)
   - If no skeleton selection exists, `this.skeletonPoints` is empty array,
     `this.skeletonData` is null
   - Do NOT change `getBehavior` or `EditBehavior` yet

3. Run tests: `npm test` from `src-js/fontra-core`

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js` (new — test file)
- `src-js/views-editor/src/edit-behavior.js` (constructor change only)

Manual test: Not needed — no behavior change, factory is not used for skeleton yet.

Estimated change: ~80 lines tests, ~20 lines implementation.

---

#### Step 0.2: Add skeleton handle unpacking to EditBehaviorFactory

Problem: Skeleton handles use `skeletonHandle/contourIndex/pointIndex/in|out`
selection keys. The factory needs to parse these too.

What to do:
1. Write tests first:
   - Test: factory with `skeletonHandle/0/1/in` stores handle data correctly
   - Test: factory with `skeletonHandle/0/1/out` stores handle data correctly
   - Test: factory with mixed skeleton point + handle selection stores both
   - Add to existing test file `test-edit-behavior-factory.js`

2. Implementation:
   - In constructor, parse `skeletonHandle` from selection
   - Store as `this.skeletonHandles` (array of `{ contourIndex, pointIndex, direction }`)
   - Still no behavior changes

3. Run tests.

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js`
- `src-js/views-editor/src/edit-behavior.js`

Manual test: Not needed.

Estimated change: ~40 lines tests, ~10 lines implementation.

---

#### Step 0.3: Add rib point unpacking to EditBehaviorFactory

Problem: Rib points use `skeletonRibPoint/contourIndex/pointIndex/left|right`.
The factory needs to parse these.

What to do:
1. Write tests first:
   - Test: factory with `skeletonRibPoint/0/1/left` stores rib data correctly
   - Test: factory with `skeletonRibPoint/0/1/right` stores rib data correctly
   - Add to existing test file

Note: Rib-point selections do not mix with other selection types. The factory
should store rib-point data as a single, homogeneous selection — no tests for
rib + skeleton-point, rib + regular-point, or rib + handle combinations.

2. Implementation:
   - In constructor, parse `skeletonRibPoint` from selection
   - Store as `this.skeletonRibPoints` (array of `{ contourIndex, pointIndex, side }`)
   - Calculate and store the rib normal for each (using `calculateNormalAtSkeletonPoint`)
   - Still no behavior changes

3. Run tests.

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js`
- `src-js/views-editor/src/edit-behavior.js`

Manual test: Not needed.

Estimated change: ~50 lines tests, ~20 lines implementation.

---

#### Step 0.4: Add skeleton persistence to EditBehavior.makeChangeForDelta

Problem: `EditBehavior.makeChangeForDelta` currently only produces path/anchor/guideline/
component changes. For skeleton types, it needs to also produce skeleton data mutation
+ contour regeneration changes.

This is the critical step — it makes the behavior "fat."

What to do:
1. Write tests first:
   - Test: behavior with skeleton points, `makeChangeForDelta({x:10, y:0})` returns
     a change that, when applied, moves the skeleton point and regenerates contours
   - Test: behavior with skeleton points, `rollbackChange` correctly undoes
   - Test: behavior with only regular points still works exactly as before
     (regression test)
   - Test: behavior with mixed regular + skeleton produces combined changes
   - These tests need a realistic mock `layerGlyph` with both path and skeleton data.
     Build a helper that creates a minimal skeleton glyph.

2. Implementation:
   - In `EditBehavior` constructor, if factory has `skeletonData`:
     - Clone skeleton data as `this.originalSkeletonData`
     - Create working copy as `this.workingSkeletonData`
     - Create skeleton point executors (reuse `createPointBehaviorExecutor`
       for skeleton contour points — they have the same point structure)
   - In `makeChangeForDelta`:
     - Apply delta to skeleton points in working copy (using skeleton executors)
     - Call `regenerateSkeletonContours` on the working copy
     - Record changes using `recordChanges` for both skeleton data and path
     - Return combined change (path changes + skeleton data changes)
   - In `rollbackChange`:
     - Include skeleton data rollback

3. Run tests.

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js`
- `src-js/views-editor/src/edit-behavior.js`

Manual test: Not needed yet — factory is still not wired into pointer.

Estimated change: ~150 lines tests, ~100 lines implementation.

Gate: After this step, the factory CAN produce correct skeleton changes.
But pointer still uses adapters. Nothing visible changes.

**Auxiliary modifier flags (D / S).** The `fixedRibMode` (D) and
`fixedRibCompressMode` (S) modifiers are not encoded in `behaviorName` — they
are separate tool-state flags on `pointerTool` consumed by the existing
rib/handle executor constructors (see adapter lines 1491-1503 and 3745-3841).
The factory must accept these as construction-time options:
```js
new EditBehaviorFactory(layerGlyph, selection, scalingEditBehavior, {
  fixedRibMode, fixedRibCompressMode,
})
```
and forward them into the per-target executors for skeleton on-curve, skeleton
handle, rib, and editable-generated behaviors (same fields already consumed by
the adapters). `behaviorName` continues to carry only the
Shift/Alt/X/Z-derived name. This keeps the factory API small while preserving
D/S parity across all skeleton types.

The full behaviorName set the factory must recognize for skeleton types:
- on-curve / handle: `default`, `constrain`, `alternate`, `alternate-constrain`
  (plus the X-equalize variants already handled by `makePointExecutors`)
- rib / editable-generated: `rib-default`, `rib-tangent`, `rib-interpolate`,
  `rib-tangent-interpolate` (see Step 0.6 / 3.1)

---

#### Step 0.5: Add skeleton handle behavior to EditBehavior

Problem: Skeleton handles (off-curve) have specific behavior rules — they follow the
handle direction constraints. The existing `createPointBehaviorExecutor` already handles
off-curve behavior for regular paths. For skeleton handles, the same rule-matching
system applies because skeleton contour points have the same `type` field.

What to do:
1. Write tests first:
   - Test: behavior with skeleton handle selection, `makeChangeForDelta` moves
     the handle and regenerates contours
   - Test: constrain preset constrains handle movement
   - Test: alternate preset uses alternate behavior for handles
   - Test: rollback correctly undoes handle changes

2. Implementation:
   - In `EditBehavior` constructor, skeleton on-curve points and skeleton
     handles share a single per-contour point executor (one
     `createPointBehaviorExecutor` per skeleton contour, not one per selection
     key). Build the executor once from the full contour's points; the merged
     set of selected indices for that contour includes both
     `this.skeletonPoints` and `this.skeletonHandles`.
   - Map each `{ contourIndex, pointIndex, direction }` to the actual point
     index in the skeleton contour (handle `in` / `out` resolve to the
     adjacent off-curve point on that contour).
   - The executor's rule matching handles off-curve vs on-curve naturally
     because skeleton contour points already have `type` fields — no branching
     needed here; on-curve and handle behaviors fall out of the same rules
     used for regular paths.
   - Persistence goes through the same skeleton clone → regenerate → record path

3. Run tests.

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js`
- `src-js/views-editor/src/edit-behavior.js`

Manual test: Not needed yet.

Estimated change: ~80 lines tests, ~40 lines implementation.

---

#### Step 0.6: Add rib point behavior to EditBehavior

Problem: Rib points are another selection type the factory must produce changes for,
through the same pipeline established in Step 0.4. Per-target behavior uses the
existing `createRibEditBehavior` / `createEditableRibBehavior` /
`createInterpolatingRibBehavior` (already exported from `edit-behavior.js`) —
same pattern as point executors for on-curve and handle types.

What to do:
1. Write tests first:
   - Test: rib point drag projects delta onto normal, changes halfWidth correctly
   - Test: rib point with linked widths updates both sides
   - Test: rib point with unlinked widths updates only the dragged side
   - Test: rib point rollback restores original width
   - Test: rib point change includes contour regeneration

2. Implementation:
   - In `EditBehavior` constructor, when factory has `skeletonRibPoints`:
     - For each target, read `contour.singleSided`, `point.leftEditable`/
       `rightEditable`, and the behaviorName's interpolation flag to pick one of
       `createRibEditBehavior` / `createEditableRibBehavior` /
       `createInterpolatingRibBehavior` — replicating the decision tree currently
       in `runSkeletonRibPointDragCanonical` lines ~4141-4190
     - When `contour.singleSided`, set the executor's `originalHalfWidth` to
       `leftHalfWidth + rightHalfWidth` (total width) per adapter line 4145;
       otherwise use the side's halfWidth
     - When the interpolation variant is selected, compute the interpolation axis
       via `findRibInterpolationAxisFromSkeletonPath` using `instance.path` at
       construction time; fall back to `createEditableRibBehavior` if no axis
     - Gate: if no target is editable AND the selection does not belong to a single
       segment (`selectedRibTargetsBelongToSingleSegment`), the per-target executor
       is the inert variant (no-op apply, empty rollback). Expose this upward as
       `factory.isInert(behaviorName)` returning `true` when every produced
       per-target executor is inert — pointer probes this before opening the
       edit session (see Step 3.1), matching the current adapter's
       `return false` gate
     - Store alongside skeleton point/handle executors as another per-target
       entry in the skeleton executor collection
   - In `makeChangeForDelta`:
     - For each rib-target executor, call `applyDelta(delta, constrainMode, roundFunc)`
       where `constrainMode` is "tangent" when the behaviorName indicates the Z
       modifier, otherwise null
     - Write the result into `this.workingSkeletonData` via the same field-writing
       block used by the adapter: `applyLinkedWidthDelta` for halfWidth, plus
       `leftNudge`/`rightNudge` and `leftHandleInOffsetX/Y` / `leftHandleOutOffsetX/Y`
       (or their `right*` counterparts) when the executor returns `isInterpolation`
       or `hasHandleOffsets`
     - Feed through the same clone + regenerate + record path from Step 0.4
   - In `rollbackChange`:
     - Covered by the Step 0.4 skeleton-data rollback — no rib-specific rollback

   Out of scope: the adapter's `hasSkeletonSelection`/`baseNormalDelta` branch
   (adapter lines 4209-4212) is not migrated. Rib-point selection does not mix
   with other selection types, so scalar-projected delta math is not needed.

3. Run tests.

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js`
- `src-js/views-editor/src/edit-behavior.js`

Manual test: Not needed yet.

Estimated change: ~100 lines tests, ~80 lines implementation.

Gate: After Phase 0, the factory can handle all selection types and produce
correct changes. But nothing in pointer or adapters has changed. The app
works exactly as before.

---

### Phase 1: Migrate skeletonPoint (on-curve) Drag + Nudge

Goal: Make pointer use the factory for skeleton on-curve point drag and nudge
instead of routing through composer → adapter. The adapter code stays alive
but stops being called for this object kind.

#### Step 1.1: Wire pointer drag to use factory for skeletonPoint

Problem: Pointer's `handleDragSelection` currently routes `skeletonPoint` through
`runDragRoutingOrchestration`. It should use the factory instead.

What to do:
1. Write tests first:
   - Test: factory with `skeletonPoint/0/0` selection, behavior "default",
     `makeChangeForDelta({x:10, y:0})` moves skeleton point (0,0) by +10x
   - Test: behavior "constrain" constrains to horizontal/vertical/diagonal
   - Test: behavior "alternate" uses alternate skeleton behavior
   - Test: change applied to layerGlyph produces correct skeleton data AND
     regenerated path in the glyph
   - These verify the factory path produces identical results to the adapter.

2. Implementation:
   - In `handleDragSelection`, find the branch where `objectKind === "skeletonPoint"`
     calls `runDragRoutingOrchestration`
   - Replace it with the standard factory drag loop:
     ```
     factory = new EditBehaviorFactory(layerGlyph, selection)
     behavior = factory.getBehavior(behaviorName)
     // ... standard drag loop
     ```
   - The factory already knows how to handle skeleton points (from Phase 0)
   - Keep the existing adapter code alive — just stop calling it from pointer

3. Run tests.

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js`
- `src-js/views-editor/src/edit-tools-pointer.js`

Manual tests (REQUIRED):
- Drag a skeleton on-curve point — moves correctly
- Drag + Shift — constrains to H/V/diagonal
- Drag + Alt — alternate behavior
- Drag + Shift+Alt — alternate-constrain
- Drag + D — fixed rib mode
- Drag + S — fixed rib compress mode
- Undo after drag
- Redo after undo
- Multi-layer editing: drag skeleton point, verify all editable layers update

Estimated change: ~60 lines tests, ~30 lines pointer changes.

---

#### Step 1.2: Wire pointer nudge to use factory for skeletonPoint

Problem: Pointer's `handleArrowKeys` currently routes `skeletonPoint` through
`runNudgeRoutingOrchestration`. It should use the factory.

What to do:
1. Write tests first:
   - Test: factory nudge with delta {x:1, y:0} moves skeleton point correctly
   - Test: nudge with "alternate" behavior works correctly
   - Test: nudge produces change that includes skeleton regeneration

2. Implementation:
   - In `handleArrowKeys`, replace the `runNudgeRoutingOrchestration` call
     for skeleton points with the factory-based nudge pattern
   - The nudge pattern is simpler than drag — no event stream, just a single delta
   - Create delta from arrow key, create factory, get behavior, apply delta once

3. Run tests.

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js`
- `src-js/views-editor/src/edit-tools-pointer.js`

Manual tests (REQUIRED):
- Arrow key nudge a skeleton on-curve point
- Nudge + Shift (10x)
- Nudge + Alt (alternate behavior)
- Nudge + D (fixed rib)
- Nudge + S (fixed rib compress)
- Undo after nudge
- Redo after undo

Estimated change: ~40 lines tests, ~20 lines pointer changes.

---

#### Step 1.3: Remove skeletonPoint adapter code

Problem: The old adapter path for `skeletonPoint` is now dead code.

What to do:
1. Verify old path is not called:
   - Add a temporary `console.warn("DEAD CODE: skeletonPoint adapter called")`
     at the top of `runSkeletonPointLikeCanonical`
   - Run the full manual test matrix for skeleton on-curve
   - If the warning fires, the wiring is wrong — fix Step 1.1/1.2 first
   - Remove the warning after verification

2. Remove dead code:
   - Remove `skeletonPoint` entry from `canonicalDragAdapters`
   - Remove `skeletonPoint` entry from `canonicalNudgeAdapters`
   - Do NOT remove shared helpers that other adapters still use
     (`runSkeletonPointLikeOrchestration`, etc. — other skeleton types may still need them)
   - Remove `skeletonPoint` from `DRAG_ROUTING_MAP` rows (set all to "NA")
   - Remove `skeletonPoint` from `NUDGE_ROUTING_MAP` rows (set all to "NA")

3. Run tests: `npm test`

Files to touch:
- `src-js/views-editor/src/edit-behavior-adapters.js`
- `src-js/views-editor/src/edit-behavior-registry.js`

Manual tests (REQUIRED — full regression):
- Repeat all manual tests from Steps 1.1 and 1.2
- Also test: regular point drag still works (regression)
- Also test: anchor drag still works (regression)
- Also test: guideline drag still works (regression)

Estimated change: ~20 lines removed from adapters, ~10 lines removed from registry.

Gate: After Phase 1, skeleton on-curve drag/nudge goes through the factory.
All other object kinds still use adapters. No behavior change.

---

### Phase 2: Migrate skeletonHandle (off-curve) Drag + Nudge

Goal: Same as Phase 1 but for skeleton off-curve handles.

#### Step 2.1: Wire pointer drag to use factory for skeletonHandle

Problem: Skeleton handle drag currently goes through the adapter.
The factory already has handle support from Step 0.5.

What to do:
1. Write tests first:
   - Test: factory with `skeletonHandle/0/1/in` selection, default behavior,
     drag delta moves the handle correctly
   - Test: constrain behavior constrains handle movement
   - Test: X modifier (equalize) produces equalized handle positions

2. Implementation:
   - In `handleDragSelection`, the handle case goes through the same factory path
   - The factory already parses `skeletonHandle/` and includes handles in skeleton
     point executors. The rule matching handles off-curve behavior naturally.

3. Run tests.

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js`
- `src-js/views-editor/src/edit-tools-pointer.js`

Manual tests (REQUIRED):
- Drag skeleton off-curve handle — moves correctly
- Drag + Shift — constrains
- Drag + X — equalize handles
- Drag + X + Shift — equalize + constrain
- Undo/redo
- Multi-layer editing

Estimated change: ~60 lines tests, ~20 lines pointer changes.

---

#### Step 2.2: Wire pointer nudge to use factory for skeletonHandle

What to do:
1. Write tests: nudge with X (equalize) and X+Shift produce correct changes
2. Implementation: route nudge for skeleton handle through factory
3. Run tests.

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js`
- `src-js/views-editor/src/edit-tools-pointer.js`

Manual tests (REQUIRED):
- Nudge skeleton handle with arrow keys
- Nudge + Shift (10x)
- Nudge + X (equalize)
- Nudge + X + Shift (equalize + constrain)
- Undo/redo

Estimated change: ~40 lines tests, ~15 lines pointer changes.

---

#### Step 2.3: Remove skeletonHandle adapter code

Same pattern as Step 1.3:
1. Verify with temporary `console.warn("DEAD CODE: skeletonHandle adapter called")`
   at the handle branch of `runSkeletonPointLikeCanonical` (or whichever adapter
   entry now owns handle drag after Phase 1). Run full skeleton-handle manual
   test matrix; warning must not fire. Remove after verification.
2. Remove dead code:
   - Remove `skeletonHandle` entry from `canonicalDragAdapters`
   - Remove `skeletonHandle` entry from `canonicalNudgeAdapters`
   - Set all `skeletonHandle` rows in `DRAG_ROUTING_MAP` to `"NA"`
   - Set all `skeletonHandle` rows in `NUDGE_ROUTING_MAP` to `"NA"`
   - Do NOT remove shared `runSkeletonPointLikeOrchestration` helpers if other
     skeleton types (rib, editable-generated) still use them — defer to Phase 8.
3. Run tests: `npm test`

Files to touch:
- `src-js/views-editor/src/edit-behavior-adapters.js`
- `src-js/views-editor/src/edit-behavior-registry.js`

Manual tests: Full regression — skeleton handle + regular point + anchor + guideline.

Estimated change: ~20 lines removed.

Gate: After Phase 2, skeleton on-curve and off-curve both go through the factory.

---

### Phase 3: Migrate skeletonRibPoint Drag + Nudge

Goal: Rib points use the factory. The rib-normal constraint behavior
(delta projected onto the normal direction, producing width changes)
is handled by the behavior object returned by the factory.

#### Step 3.1: Wire pointer drag to use factory for skeletonRibPoint

Problem: Rib point drag is currently handled by the adapter, which creates
a `createRibEditBehavior` or `createEditableRibBehavior` and runs a
specialized drag session. The factory should do this instead.

What to do:
1. Write tests first:
   - Test: factory with `skeletonRibPoint/0/1/left` selection, drag delta {x:10, y:0}
     with a known normal, produces correct halfWidth change
   - Test: linked width mode updates both sides
   - Test: unlinked width mode updates only dragged side
   - Test: drag + Z (tangent constraint) constrains to tangent direction
   - Test: drag + Alt uses interpolation behavior if available
   - Test: change includes skeleton regeneration

2. Implementation:
   - In `handleDragSelection`, the rib point classification already exists
     (`objectKind === "skeletonRibPoint"`)
   - Before entering the factory drag loop, keep the pointer-side click-to-select
     behavior from the adapter (lines 4083-4087): if the clicked rib is not already
     in `sceneController.selection` and no rib selection exists, replace the
     selection with the clicked rib. This stays on pointer because it's a
     selection-state side-effect, not a behavior concern.
   - Inertness probe: after click-to-select and BEFORE `sceneController.editGlyph`,
     construct a throwaway factory for the first editing layer and call
     `factory.isInert(behaviorName)` (new public method on `EditBehaviorFactory`,
     returning `true` when every produced per-target executor is the Step 0.6
     inert variant). If inert, skip the edit session entirely — no `editGlyph`
     opened, no incremental sends, matching the current adapter's `return false`
     gate. This keeps the "drag unhandled" semantics intact without polluting
     the drag loop with inertness checks mid-session.
   - Define the modifier → behaviorName mapping used by the factory call:
     - no modifier → `rib-default`
     - Z (tangent-rib mode) → `rib-tangent`
     - Alt (interpolation) → `rib-interpolate`
     - Z + Alt → `rib-tangent-interpolate`
     The factory's Step 0.6 executor consults `behaviorName` to pick variant +
     `constrainMode`. Shift (10x) applies to nudge only (Step 3.2), not drag.
   - Replace the `runDragRoutingOrchestration` call with the factory drag loop
     used by every other selection type. Drop the `objectKind`-keyed branching.
   - Remove the adapter's `hasSkeletonSelection` pre-check — no mixed selection
     for ribs.

3. Run tests.

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js`
- `src-js/views-editor/src/edit-tools-pointer.js`

Manual tests (REQUIRED):
- Drag rib point (left side) — width increases/decreases correctly
- Drag rib point (right side)
- Drag with linked widths — both sides move
- Drag with unlinked widths — only dragged side moves
- Drag + Z — tangent constraint
- Drag + Alt — interpolation behavior
- Drag on non-editable, non-single-segment rib — no-op (drag unhandled)
- Click unselected rib — selection replaced with clicked rib, drag proceeds
- Undo/redo
- Multi-select rib points, drag — each follows its own normal

Estimated change: ~80 lines tests, ~25 lines pointer changes.

---

#### Step 3.2: Wire pointer nudge to use factory for skeletonRibPoint

What to do:
1. Write tests:
   - Nudge rib point with arrow keys, produces correct width change
   - Nudge + Shift (10x nudge step)
   - Nudge + Z (tangent) constrains correctly
   - Nudge + Z + Shift (10x tangent)
   - Nudge + Alt (interpolation)
2. Implementation:
   - Reuse the Step 3.1 modifier → behaviorName mapping
     (`rib-default` / `rib-tangent` / `rib-interpolate` /
     `rib-tangent-interpolate`). Shift multiplies the nudge delta by 10 before
     the factory call, consistent with nudge handling for all other types.
   - Replace `runNudgeRoutingOrchestration` with the factory nudge call used
     by every other selection type.
3. Run tests.

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js`
- `src-js/views-editor/src/edit-tools-pointer.js`

Manual tests (REQUIRED):
- Nudge rib point with arrow keys
- Nudge + Shift (10x)
- Nudge + Z (tangent)
- Nudge + Z + Shift (tangent 10x)
- Nudge + Alt (interpolation)
- Undo/redo

Estimated change: ~50 lines tests, ~15 lines pointer changes.

---

#### Step 3.3: Remove skeletonRibPoint adapter code

Same pattern:
1. Verify with temporary `console.warn("DEAD CODE: skeletonRibPoint adapter called")`
   at the top of `runSkeletonRibPointDragCanonical` AND
   `runSkeletonRibPointNudgeCanonical`. Run full rib manual test matrix
   (including non-editable / single-segment cases); warning must not fire.
   Remove after verification.
2. Remove dead code:
   - Remove `skeletonRibPoint` entry from `canonicalDragAdapters` and
     `canonicalNudgeAdapters`
   - Set all `skeletonRibPoint` rows in `DRAG_ROUTING_MAP` and
     `NUDGE_ROUTING_MAP` to `"NA"`
   - Remove `runSkeletonRibPointDragCanonical` and
     `runSkeletonRibPointNudgeCanonical` function bodies
   - Remove rib-only adapter helpers that are now unreferenced
     (`selectedRibTargetsBelongToSingleSegment` stays if still used by factory
     via re-export; delete only if fully dead)
3. Full regression test (rib + skeleton on/off-curve + regular).

Files to touch:
- `src-js/views-editor/src/edit-behavior-adapters.js`
- `src-js/views-editor/src/edit-behavior-registry.js`

Estimated change: ~30 lines removed (plus ~400 if rib helpers are fully dead —
confirm in Phase 8).

Gate: After Phase 3, rib points go through the factory.

---

### Phase 4: Migrate editableGeneratedPoint Drag + Nudge

Goal: Editable generated points (the on-curve points on the generated contour
that can be dragged when marked editable) use the factory.

#### Step 4.1: Add editable generated point unpacking to factory

Problem: Editable generated points use `editableGeneratedPoint/` selection keys
with format: `editableGeneratedPoint/pathPointIndex/skeletonContourIndex/
skeletonPointIndex/side`. Same factory pattern: parse selection → instantiate
per-target behavior → feed through the shared skeleton pipeline.

What to do:
1. Write tests first:
   - Test: factory parses `editableGeneratedPoint/42/0/1/left` correctly
   - Test: factory creates editable rib behavior for the parsed point
   - Test: drag delta produces correct width + nudge changes
   - Test: non-editable points are ignored (no change produced)

2. Implementation:
   - In constructor, parse `editableGeneratedPoint` from selection
   - For each, look up the skeleton contour/point, check editable flag
   - Instantiate `createEditableRibBehavior` / `createInterpolatingRibBehavior`
   - Store alongside other skeleton executors; same pipeline as Step 0.6

3. Run tests.

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js`
- `src-js/views-editor/src/edit-behavior.js`

Manual test: Not needed yet — not wired into pointer.

Estimated change: ~60 lines tests, ~30 lines implementation.

---

#### Step 4.2: Wire pointer drag + nudge for editableGeneratedPoint

What to do:
1. Write tests:
   - Drag editable generated point produces correct skeleton changes
   - Drag + Z (tangent constraint) works
2. Implementation:
   - Replace `runDragRoutingOrchestration` for editable generated points
   - Replace `runNudgeRoutingOrchestration` for editable generated points
3. Run tests.

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js`
- `src-js/views-editor/src/edit-tools-pointer.js`

Manual tests (REQUIRED):
- Drag editable generated on-curve point — width changes correctly
- Drag + Z (tangent)
- Nudge editable generated on-curve point
- Nudge + Z (tangent)
- Nudge + Z + Shift (tangent 10x)
- Non-editable points don't move
- Undo/redo

Estimated change: ~40 lines tests, ~25 lines pointer changes.

---

#### Step 4.3: Remove editableGeneratedPoint adapter code

Same pattern:
1. Verify with temporary `console.warn("DEAD CODE: editableGeneratedPoint adapter called")`
   at the top of `runEditableGeneratedPointDragCanonical` and
   `runEditableGeneratedNudgeCanonical` (point branch). Run the full editable-
   generated-point manual matrix; warning must not fire.
2. Remove dead code:
   - Remove `editableGeneratedPoint` entry from `canonicalDragAdapters` and
     `canonicalNudgeAdapters`
   - Set `editableGeneratedPoint` rows in `DRAG_ROUTING_MAP` and
     `NUDGE_ROUTING_MAP` to `"NA"`
   - Remove the point-only code paths inside
     `runEditableGeneratedPointDragCanonical` — keep the function shell only if
     `editableGeneratedHandle` still shares it (deleted in Step 5.3 otherwise)
3. Regression test.

Files to touch:
- `src-js/views-editor/src/edit-behavior-adapters.js`
- `src-js/views-editor/src/edit-behavior-registry.js`

Estimated change: ~30 lines removed.

Gate: After Phase 4, editable generated on-curve points go through the factory.

---

### Phase 5: Migrate editableGeneratedHandle Drag + Nudge

Goal: Editable generated handles (off-curve points on generated contour)
use the factory. These have handle-direction constraints — movement is
projected onto the skeleton handle direction.

#### Step 5.1: Add editable generated handle support to factory

Problem: Editable generated handles are identified via editable-generated-point
parsing + handle detection (currently in pointer's
`_getEditableGeneratedHandlesFromSelection`). Same factory pattern: parse
selection → instantiate per-target behavior → feed through the shared
skeleton pipeline.

What to do:
1. Write tests first:
   - Test: factory identifies editable handles from selection
   - Test: drag delta projected onto skeleton handle direction produces
     correct offset change
   - Test: equalize (X modifier) produces equalized handle positions
   - Test: change includes skeleton regeneration

2. Implementation:
   - Move the handle-detection logic from pointer's
     `_getEditableGeneratedHandlesFromSelection` into the factory constructor
   - Instantiate `createEditableHandleBehavior` for each detected handle
   - Store alongside other skeleton executors; same pipeline as Step 0.6

3. Run tests.

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js`
- `src-js/views-editor/src/edit-behavior.js`

Manual test: Not needed yet.

Estimated change: ~80 lines tests, ~50 lines implementation.

---

#### Step 5.2: Wire pointer drag + nudge for editableGeneratedHandle

What to do:
1. Write tests: drag + nudge produce correct handle offset changes
2. Implementation: replace routing orchestration calls with factory
3. Run tests.

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js`
- `src-js/views-editor/src/edit-tools-pointer.js`

Manual tests (REQUIRED):
- Drag editable generated handle — moves along handle direction
- Drag + X (equalize handles)
- Nudge editable generated handle
- Nudge + X (equalize)
- Undo/redo

Estimated change: ~40 lines tests, ~25 lines pointer changes.

---

#### Step 5.3: Remove editableGeneratedHandle adapter code

Same pattern:
1. Verify with temporary `console.warn("DEAD CODE: editableGeneratedHandle adapter called")`
   at the handle branch of the editable-generated adapter(s). Run the full
   editable-generated-handle manual matrix; warning must not fire.
2. Remove dead code:
   - Remove `editableGeneratedHandle` entry from `canonicalDragAdapters` and
     `canonicalNudgeAdapters`
   - Set `editableGeneratedHandle` rows in `DRAG_ROUTING_MAP` and
     `NUDGE_ROUTING_MAP` to `"NA"`
   - Remove remaining handle-specific code in
     `runEditableGeneratedPointDragCanonical` and
     `runEditableGeneratedNudgeCanonical`. If these functions are now empty,
     delete them and remove the pointer-side helper
     `_getEditableGeneratedHandlesFromSelection` (moved to factory in Step 5.1).
3. Regression test.

Files to touch:
- `src-js/views-editor/src/edit-behavior-adapters.js`
- `src-js/views-editor/src/edit-behavior-registry.js`
- `src-js/views-editor/src/edit-tools-pointer.js` (remove migrated helper)

Estimated change: ~30 lines removed from adapters, ~50 from pointer.

Gate: After Phase 5, all individual point-like types go through the factory.
Only `mixedSelection` and specialized routes (Tunni, component) remain on adapters.

---

### Phase 6: Migrate mixedSelection Drag + Nudge

Goal: Mixed selection (regular + skeleton points selected together) goes through
the factory. This is the natural result of the factory understanding all types —
a selection containing both `point/3` and `skeletonPoint/0/1` should just work.

#### Step 6.1: Verify factory handles mixed regular + skeleton selection

Problem: The factory already parses both regular and skeleton selections.
The behavior already produces combined changes. But mixed selection has
specific edge cases: the regular EditBehavior's path changes and the
skeleton persistence changes must compose correctly.

What to do:
1. Write tests first:
   - Test: factory with `point/3` + `skeletonPoint/0/1`, `makeChangeForDelta`
     produces changes for BOTH regular path points AND skeleton data
   - Test: rollback undoes both
   - Test: behavior preset changes (shift mid-drag) update both correctly

Note: "mixed selection" here means regular points + skeleton on-curve / handle
points. Rib points and editable generated points do not participate in mixed
selection — they are homogeneous selection types handled in Phases 3-5.

2. Verify — these tests may already pass because the factory handles each
   type independently. If they pass, no implementation needed for this step.
   If they fail, fix the composition logic.

3. Run tests.

Files to touch:
- `src-js/fontra-core/tests/test-edit-behavior-factory.js`
- `src-js/views-editor/src/edit-behavior.js` (only if composition fails)

Manual test: Not needed yet.

Estimated change: ~60 lines tests, 0-40 lines implementation.

---

#### Step 6.2: Remove mixedSelection classification from pointer

Problem: Pointer currently has `_classifyPointLikeSelection` which determines
whether we have regular-only, skeleton-only, or mixed selection, then routes
to different orchestration calls. With the factory handling everything, this
classification is unnecessary — just pass the full selection to the factory.

What to do:
1. Implementation:
   - In `handleDragSelection`, remove the branching between
     `hasRegularSelection && !hasSkeletonSelection`,
     `!hasRegularSelection && hasSkeletonSelection`, and
     `hasRegularSelection && hasSkeletonSelection`
   - Replace all three branches with one factory drag loop
   - The factory handles whatever's in the selection
   - Remove `_classifyPointLikeSelection` calls from drag path
     (keep the function if it's used elsewhere — nudge, hover, etc.)

2. In `handleArrowKeys`, same simplification:
   - Remove object-kind classification for nudge
   - One factory nudge call handles everything

3. Run tests.

Files to touch:
- `src-js/views-editor/src/edit-tools-pointer.js`

Manual tests (REQUIRED — comprehensive):
- Drag regular point only — works
- Drag skeleton point only — works
- Drag with regular + skeleton mixed selection — both move correctly
- Nudge with mixed selection — both move
- Drag + Shift (constrain) with mixed selection
- Drag + Alt (alternate) with mixed selection
- Undo/redo with mixed selection
- Multi-layer editing with mixed selection

Estimated change: ~80 lines removed from pointer, ~10 lines added.

---

#### Step 6.3: Remove mixedSelection adapter code

What to do:
1. Verify with console.warn
2. Remove `mixedSelection` from adapters, routing maps
3. Remove `runMixedSelectionDrag` and `runMixedSelectionNudge`
4. Regression test

Files to touch:
- `src-js/views-editor/src/edit-behavior-adapters.js`
- `src-js/views-editor/src/edit-behavior-registry.js`

Manual tests: Full regression.

Estimated change: ~100 lines removed.

Gate: After Phase 6, ALL point-like drag/nudge goes through the factory.
The only adapter code still alive is: Tunni and component.

---

### Phase 7: Tunni Consolidation

Goal: Extract Tunni drag execution into its own handler file.
Remove Tunni from the adapter/registry/composer pipeline.
Pointer calls the Tunni handler directly.

#### Step 7.1: Create the Tunni handler file

Problem: Tunni drag execution is currently split between:
- `edit-behavior-adapters.js` — `runFallbackTunniDrag`, `runSpecializedSkeletonTunniDrag`
- `edit-tools-pointer.js` — Tunni hit-testing branches in `handleDrag`
- Various helper functions scattered in adapters

All Tunni execution (not math, not hit-testing) should live in one file.

What to do:
1. Create `src-js/views-editor/src/edit-tools-tunni.js`
2. Move into it:
   - Regular Tunni drag execution (from `runFallbackTunniDrag` and its helpers)
   - Skeleton Tunni drag execution (from `runSpecializedSkeletonTunniDrag` and its helpers)
   - Tunni equalize execution (Ctrl+Shift click)
   - Skeleton Tunni equalize execution
   - Any adapter-local helpers that only Tunni uses
     (`calculateSkeletonControlPointsFromTunniDelta`, `calculateSkeletonOnCurveFromTunni`,
     `calculateSkeletonTunniPoint`, `calculateSkeletonTrueTunniPoint`, etc.)
3. Do NOT move:
   - Tunni hit-testing (stays in pointer — it's part of pointer's hit-test responsibility)
   - Shared Tunni math (stays in `tunni-calculations.js` — used by other code)
   - Tunni visualization (stays in visualization layers)
4. The new file exports a small public API:
   ```js
   export async function handleTunniDrag(context) { ... }
   export async function handleSkeletonTunniDrag(context) { ... }
   ```

Files to touch:
- `src-js/views-editor/src/edit-tools-tunni.js` (new)
- `src-js/views-editor/src/edit-behavior-adapters.js` (code moves out)

Manual test: Not needed yet — not wired.

Estimated change: ~300 lines moved (not new code, just relocation).

---

#### Step 7.2: Wire pointer to call Tunni handler directly

Problem: Pointer currently routes Tunni through `runDragRoutingOrchestration`
which goes to composer which goes to `specializedDragAdapters["tunniPoint"]`.
Replace with a direct call.

What to do:
1. Implementation:
   - In `handleDrag`, the existing Tunni hit-test branch calls
     `runDragRoutingOrchestration({ objectKind: "tunniPoint", ... })`
   - Replace with direct call: `handleTunniDrag({ ... })`
   - Same for `skeletonTunniPoint`: `handleSkeletonTunniDrag({ ... })`
   - Import from the new `edit-tools-tunni.js`

2. Run tests.

Files to touch:
- `src-js/views-editor/src/edit-tools-pointer.js`

Manual tests (REQUIRED):
- Drag regular midpoint Tunni point
- Drag regular true Tunni point
- Ctrl+Shift click regular Tunni (equalize)
- Drag skeleton midpoint Tunni point
- Drag skeleton true Tunni point
- Ctrl+Shift click skeleton Tunni (equalize)
- Undo/redo for both regular and skeleton Tunni
- Verify Tunni hit-testing still works (hover shows correct cursor)

Estimated change: ~15 lines pointer changes.

---

#### Step 7.3: Remove Tunni from adapters/registry/composer

What to do:
1. Remove `tunniPoint` and `skeletonTunniPoint` from:
   - `specializedDragAdapters`
   - `DRAG_ROUTING_MAP`
2. Remove `runFallbackTunniDrag` and `runSpecializedSkeletonTunniDrag` from adapters
   (they should already be in the new file from Step 7.1)
3. Regression test

Files to touch:
- `src-js/views-editor/src/edit-behavior-adapters.js`
- `src-js/views-editor/src/edit-behavior-registry.js`

Manual tests: Full Tunni regression from Step 7.2.

Estimated change: ~50 lines removed.

Gate: After Phase 7, Tunni has its own clean handler file.
The only adapter code still alive is component drag.

---

### Phase 8: Cleanup

Goal: Assess what's left in registry, composer, and adapters.
Remove what's dead. Decide fate of survivors.

#### Step 8.1: Audit surviving code

Problem: After Phases 1-7, most of the adapter/registry/composer code is dead.
But some pieces may still be used by non-drag/nudge paths (bounds transform,
double-click, smooth toggle, etc.).

What to do:
1. Run grep for every export from each file:
   ```
   grep -n "export " edit-behavior-adapters.js
   grep -n "export " edit-behavior-registry.js
   grep -n "export " edit-behavior-composer.js
   ```
2. For each export, check if it's imported anywhere:
   ```
   grep -rn "functionName" src-js/views-editor/src/
   ```
3. Categorize:
   - Dead (no imports) — delete
   - Used by non-drag/nudge paths — keep, move if appropriate
   - Used by Tunni handler — already moved
4. Document findings before making changes.

Files to touch: None yet — this is analysis only.

Manual test: Not needed.

---

#### Step 8.2: Remove dead code

What to do:
1. Delete all exports identified as dead in Step 8.1
2. Delete all private functions only used by dead exports
3. If a file becomes empty or near-empty (< 50 lines), delete it
4. If a file has surviving code, rename if the current name is misleading
5. Run `npm run bundle` to verify no broken imports

Files to touch:
- `src-js/views-editor/src/edit-behavior-adapters.js`
- `src-js/views-editor/src/edit-behavior-registry.js`
- `src-js/views-editor/src/edit-behavior-composer.js`

Manual test: Not needed — only dead code removal.

Estimated change: Hundreds of lines removed.

---

#### Step 8.3: Clean up pointer's selection classification

Problem: After Phase 6, pointer no longer needs to classify selection into
object kinds for drag/nudge routing. But `_classifyPointLikeSelection` may
still be used for other purposes (hover, hit-testing).

What to do:
1. Check all uses of `_classifyPointLikeSelection`
2. If only used for drag/nudge routing (now eliminated) — delete
3. If used elsewhere — keep, but simplify if possible
4. Remove any dead branching in `handleDragSelection` and `handleArrowKeys`

Files to touch:
- `src-js/views-editor/src/edit-tools-pointer.js`

Manual tests (REQUIRED — final regression):
- Full manual test matrix from action-object-matrix.md
- All drag modifier combinations for all object kinds
- All nudge modifier combinations for all object kinds
- Regular Tunni drag + skeleton Tunni drag
- Mixed selection drag + nudge
- Undo/redo for every category
- Multi-layer editing

Estimated change: ~50-100 lines removed from pointer.

---

#### Step 8.4: Final line count and architecture verification

What to do:
1. Count lines in all touched files
2. Compare against pre-refactor counts:
   - `edit-behavior-registry.js`: was 456
   - `edit-behavior-composer.js`: was 181
   - `edit-behavior-adapters.js`: was 5,437
   - `edit-behavior.js`: was 2,764
   - `edit-tools-pointer.js`: was 3,890
3. Verify the architecture matches the target:
   - Pointer uses factory for all point-like drag/nudge
   - Factory handles all selection types through one interface
   - Tunni has its own handler file
   - No routing matrices, no dispatch glue, no adapter maps
4. Document results.

Files to touch:
- `docs/refactor/PLAN-unified-factory-rerefactor.md` (add results)

Manual test: Not needed.

Gate: Re-refactor complete.

---

## Acceptance Criteria

This re-refactor is complete when ALL of these are true:

- `EditBehaviorFactory` handles all point-like selection types
  (regular, skeleton, rib, editable generated)
- `makeChangeForDelta` produces complete changes including skeleton regeneration
- Pointer's `handleDragSelection` uses one code path for all object kinds
- Pointer's `handleArrowKeys` uses one code path for all object kinds
- Tunni execution lives in its own handler file, called directly from pointer
- Shared Tunni math stays in `tunni-calculations.js`
- No routing matrices exist for point-like drag/nudge
- No composer dispatch exists for point-like drag/nudge
- No canonical adapter maps exist for point-like drag/nudge
- All modifier combinations produce identical behavior to pre-refactor
- All undo/redo operations work correctly
- Multi-layer editing works correctly for all types
- Unit tests exist for factory behavior with each selection type
- No user-visible behavior has changed

