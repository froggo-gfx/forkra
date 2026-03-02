# Domain Separation Refactor Plan

Date: 2026-02-27
Status: Draft

## Summary
We will refactor the editing pipeline to enforce domain separation while preserving existing behavior. The pipeline will be explicit and uniform across object kinds (regular points, guidelines, skeleton points, rib points, Tunni points). Pointer becomes transport only. Behavior rules live in a single system. Object-specific persistence is handled by adapters. Orchestration lives in a composer. This plan is incremental and uses strict, user-visible parity checks at every step.

## Principles (Non-Negotiable)
- Pointer is transport only.
- Composer is uniform and does not branch on object kind.
- Adapters own persistence and translate edits into canonical changes.
- Behaviors are rule definitions only; they do not know storage or layers.
- The behavior table is `src-js/views-editor/src/edit-behavior.js` for all point behaviors.
  - Regular points and skeleton points must share this table for their core behaviors.
  - Singular/edge cases (rib, Tunni-specific constraints) are handled in the same file, as separate rules/tables if needed.
  - No parallel behavior system in a separate file.
  - **"Unique/specific" means functional uniqueness, not naming.** If a behavior is the same action as regular points (e.g. X-equalize), it must use the shared behavior function rather than a skeleton/rib-specific duplicate.
- All edits emit standard change objects with rollback.

## Definitions
- Persistent object: canonical data exists and is edited directly (guidelines, skeleton points).
- Virtual object: position is derived; adapter edits canonical data instead (rib points, Tunni points).
- Baseline matrix: action x object table with Yes/No/Specificity; this is the parity contract for manual testing.

## Desired Pipeline (Reference)
This is the target runtime flow for all edit actions.

1. Selection parsing (existing)
   - `parseSelection()` is the only selection parser.
   - It returns selection kinds and indices (point, guideline, skeletonPoint, skeletonRibPoint, etc).
2. Registry lookup (new)
   - Registry provides capabilities for the selection kind:
     - supported actions (drag, nudge, etc)
     - modifier mapping support
     - persistent vs virtual
     - adapter to use
3. Behavior preset resolution (new)
   - Composer calls `resolveBehaviorPreset()` using the registry + modifiers.
   - Presets are derived from existing modifier behavior (shift/alt, Z/D/S, X, Q).
4. Behavior execution (existing rules, centralized)
   - Behavior rules compute delta or change instructions.
   - Behaviors do not know storage or layers.
   - Shared behavior rules live in `edit-behavior.js` and are used by both regular and skeleton points.
   - Singular behaviors (rib, Tunni-specific constraints) live in the same file and are documented in the registry and matrix.
5. Adapter apply (new)
   - Adapter translates behavior output into canonical changes:
     - Persistent kinds: edit their canonical storage directly.
     - Virtual kinds: translate to canonical edits (skeleton data or path geometry).
6. Change recording (existing)
   - Adapter returns `{ forward, rollback }` change objects.
   - Undo/redo consumes these change objects as-is.

Non-negotiable invariants:
- Pointer only routes into this pipeline and applies changes.
- Composer does not branch on object kind (registry handles routing).
- Only adapters touch persistence.

## Target File Structure (Decisions)
- Add `src-js/views-editor/src/edit-behavior-composer.js` (uniform orchestration).
- Add `src-js/views-editor/src/pointer-objects.js` (adapters + persistence).
- Add `src-js/views-editor/src/edit-behavior-registry.js` (object registry + modifier mapping).
- Delete `src-js/views-editor/src/skeleton-edit-behavior.js` (no parallel behavior system).
- Keep `src-js/fontra-core/src/skeleton-contour-generator.js` as the only skeleton-specific core math/persistence file.

Agreement (2026-02-27): All implementers agree to the target file structure above.

---

## Phase 0 - Baseline and Inventory

### Step 0.1 - Action Catalog
**Problem Description**
We do not have a single list of user actions. That invites ad-hoc combinations and hidden rules.

**Solution (Plain Language)**
List all user actions without tying them to object kinds. This keeps the refactor from devolving into per-combo logic.

**Code Snippets / Suggestions**
- Create `docs/refactor/action-object-matrix.md` with an Actions section.
- Actions list should include (example, not exhaustive):
  - drag, nudge, select, copy/paste, delete
  - equalize handles (X)
  - measure (Q / Alt+Q)
  - rib modifier modes (Z/D/S) as action modifiers
- Keep this list action-only. Do not list object kinds here.

**Manual Testing Criteria**
- N/A (documentation step).

**Strictest Possible Passing Criteria**
- Every user-facing action that exists in pointer/editor bindings is listed.
- No object kinds appear in the Actions section.

---

### Step 0.2 - Object-Kind Catalog
**Problem Description**
We do not have a single list of object kinds in scope. This causes drift and accidental exclusions.

**Solution (Plain Language)**
List all object kinds without tying them to actions.

**Code Snippets / Suggestions**
- In `docs/refactor/action-object-matrix.md`, add an Objects section that lists:
  - point, handle, guideline
  - skeletonPoint, skeletonHandle, skeletonRibPoint
  - editableGeneratedPoint
  - skeletonSegment (selection-only)
- Mark selection-only kinds explicitly.
- Note that Tunni points are non-selection drag targets and must be tracked explicitly in the drag routing map.

**Manual Testing Criteria**
- N/A (documentation step).

**Strictest Possible Passing Criteria**
- Every selection key in `parseSelection()` is represented.
- Selection-only kinds are clearly labeled.

---

### Step 0.3 - Action x Object Matrix (Yes/No/Specificity)
**Problem Description**
We keep listing ad-hoc combinations. There is no explicit Yes/No/Specificity contract.

**Solution (Plain Language)**
Create a matrix that intersects actions with object kinds and marks each cell as:
- Yes (full support)
- No (not supported)
- Specificity (supported but with rules/constraints that must be listed)

**Code Snippets / Suggestions**
- In `docs/refactor/action-object-matrix.md`, add a matrix section.
- Number the rows and columns (e.g., R1, R2... and C1, C2...) to make references unambiguous.
- Each Specificity cell must list the rule. Example:
  - `skeletonRibPoint` + drag: Specificity
    - moves along rib only (width axis)
    - Z enables tangent drag
    - D fixed rib, S compress
- Under the matrix, list all Yes/Specificity intersections by row/column id.
  - Each entry must include:
    - plain language description of behavior
    - code snippet (short)
    - file references with exact functions and line numbers
- Keep the matrix compact: Yes/No/Specificity plus listed rules only.

**Manual Testing Criteria**
- For every Yes/Specificity cell, perform the action in the UI and record PASS/FAIL in the matrix.

**Strictest Possible Passing Criteria**
- Every matrix cell has a Yes/No/Specificity value.
- Every Specificity cell has concrete rules listed (no TBDs).
- Every Yes/Specificity cell has a PASS/FAIL result and notes.

---

### Step 0.3b - Target Matrix (Intended State)
**Problem Description**
We only have a baseline matrix. Without an explicit target matrix, implementers will drift or treat baseline behavior as the goal.

**Solution (Plain Language)**
Add a target matrix that states the intended end-state behavior, using the same rows/columns as the baseline. This is the contract we will implement toward, and it must explicitly call out differences from baseline (e.g., skeleton drag/nudge should be Yes in the intended state for R1-R4 and R10-R12).

**Code Snippets / Suggestions**
- In `docs/refactor/action-object-matrix.md`, add a **Target Matrix (Intended State)** section directly after the baseline matrix.
- Use the exact same row/column IDs as the baseline matrix.
- Add a short **Delta vs Baseline** list below the target matrix, enumerating every cell that changes and why.

**Manual Testing Criteria**
- N/A (documentation step).

**Strictest Possible Passing Criteria**
- Target matrix exists and uses the same row/column IDs as the baseline.
- Every intended change vs baseline is listed in the Delta section.
- Skeleton drag/nudge intended behavior (R1-R4 and R10-R12) is explicitly marked Yes for skeleton on-curve and off-curve.

---


### Step 0.4 - Object-Kind Inventory
**Problem Description**
Current behavior and persistence are scattered. There is no inventory of where logic lives.

**Solution (Plain Language)**
Document where math, persistence, and routing live for each object kind.

**Code Snippets / Suggestions**
- Create `docs/refactor/object-kind-inventory.md` with a table:
  - Object kind
  - Selection key format
  - Current math locations
  - Current persistence locations
  - Current routing locations
  - Parity-defining or selection-only note

**Manual Testing Criteria**
- N/A (documentation step). Confirm that each object kind in scope is listed.

**Strictest Possible Passing Criteria**
- Every in-scope object kind is documented with math, persistence, and routing locations.

---

### Step 0.5 - Lock Target File Structure
**Problem Description**
Without a locked structure, implementation will drift and reintroduce parallel systems.

**Solution (Plain Language)**
Document the target file structure and the removal of `skeleton-edit-behavior.js`.

**Code Snippets / Suggestions**
- Update `docs/refactor/plan-domain-separation.md` (this file) with the target structure section.

**Manual Testing Criteria**
- N/A (documentation step).

**Strictest Possible Passing Criteria**
- All implementers agree to the target file structure before coding.

---

**Phase 0 Passing Criteria (Overall)**
- Action catalog exists and is complete.
- Object-kind catalog exists and is complete.
- Action x object matrix exists with Yes/No/Specificity and rules.
- Object-kind inventory is complete.
- Target file structure is documented and agreed.

---

## Phase 1 - Contracts and Registry

### Step 1.1 - Adapter Contract
**Problem Description**
Adapters are not defined. Today each object kind mutates data and records rollback differently. Without a single contract, the composer cannot call adapters safely and we will reintroduce per-kind branching.

**Solution (Plain Language)**
Define a single adapter contract used by the composer for all object kinds. This contract must be explicit about inputs, outputs, and invariants, and it must match the change object shapes already used by `recordChanges`.

**Code Snippets / Suggestions**
- Use `docs/refactor/object-kind-inventory.md` to identify current persistence paths and rollback patterns per object kind.
- In `edit-behavior-registry.js`, document the contract and export type notes. The contract must state:
  - `applyDelta(delta, context)` does not touch persistence.
  - `applyToLayer(layer, layerName)` is the only method that writes canonical data.
  - `applyToLayer()` returns `{ forward, rollback }` change objects.
  - `rollback` must be in the same shape as current undo/redo expects.
```js
// Contract (conceptual)
// adapter.applyDelta(delta, context)
// adapter.applyToLayer(layer, layerName) -> { forward, rollback }
// adapter.getRollback() -> rollback changes
```

**Manual Testing Criteria**
- N/A (definition step).

**Strictest Possible Passing Criteria**
- Contract is written down in `edit-behavior-registry.js`.
- Contract explicitly states persistence ownership (only `applyToLayer` writes).
- Contract explicitly states the shape and meaning of `{ forward, rollback }`.

---

### Step 1.2 - Object Registry
**Problem Description**
No single source of truth for object kinds, selection keys, and capabilities.

**Solution (Plain Language)**
Create a registry that lists object kinds and their capabilities. The registry is declarative only. It does not parse selection strings; `parseSelection()` remains the only parser. `selectionKey` values are documentation and must match existing formats exactly.

**Code Snippets / Suggestions**
- Use `docs/refactor/action-object-matrix.md` and `docs/refactor/object-kind-inventory.md` to populate object kinds and capabilities.
- Add `edit-behavior-registry.js` with:
```js
export const OBJECT_KINDS = {
  regularPoint: { selectionKey: "point", supports: ["drag","nudge"], persistent: true },
  guideline: { selectionKey: "guideline", supports: ["drag","nudge"], persistent: true },
  skeletonPoint: { selectionKey: "skeletonPoint", supports: ["drag","nudge"], persistent: true },
  ribPoint: { selectionKey: "skeletonRibPoint", supports: ["drag","nudge"], persistent: false },
  // Tunni points are non-selection drag targets; track them in the drag routing map.
};
```
- Selection key formats must match what `parseSelection()` accepts. Do not introduce new formats in this step.

**Manual Testing Criteria**
- N/A (definition step).

**Strictest Possible Passing Criteria**
- Registry includes all object kinds listed in the Phase 0 Object-Kind Catalog.
- Each `selectionKey` value matches an existing `parseSelection()` format.
- Each `selectionKey` format is verified against `parseSelection()` comments (same string structure).
- Registry does not add new selection formats.
- Registry contains no parsing logic (no string splitting, no regex).

---

### Step 1.3 - Modifier -> Behavior Mapping
**Problem Description**
Modifier logic is spread across pointer and skeleton logic.

**Solution (Plain Language)**
Define behavior preset resolution centrally based on current behavior. This function must be the single place that maps modifiers to behavior presets. If a modifier is an action override (not a behavior preset), that must be stated explicitly in the mapping.
Behavior presets must refer to entries in the shared behavior table in `edit-behavior.js`. Singular behaviors may use separate rule sets in the same file, but the mapping must still be explicit and centralized here.

**Code Snippets / Suggestions**
- Use `docs/refactor/action-object-matrix.md` to list all modifiers that require mapping.
- Derive mappings directly from current logic (`getBehaviorName()`, `getSkeletonBehaviorName()`, rib Z/D/S handling).
- Add to `edit-behavior-registry.js`:
```js
export function resolveBehaviorPreset(objectKind, modifiers) {
  // default/constrain/alternate/alternate-constrain
  // rib: tangent (Z), fixed (D), compress (S)
}
```

**Manual Testing Criteria**
- N/A (definition step).

**Strictest Possible Passing Criteria**
- Modifier mapping covers every modifier in the Phase 0 Action Catalog.
- Each modifier has an explicit handling path (behavior preset or explicit non-preset).
- Mapping logic is centralized and referenced only by composer.

---

### Step 1.4 - Composer API Surface
**Problem Description**
Composer entry points are undefined, risking drift and ad-hoc integration.

**Solution (Plain Language)**
Define composer entry points for drag and nudge orchestration. Document inputs and outputs precisely so pointer can call them without guesswork. Keep existing transform flows unchanged in this phase.

**Code Snippets / Suggestions**
- Define in `edit-behavior-composer.js`:
```js
export async function runDragOrchestration(...) {}
export async function runNudgeOrchestration(...) {}
```

**Manual Testing Criteria**
- N/A (definition step).

**Strictest Possible Passing Criteria**
- Composer functions exist with documented inputs and outputs.
- Composer does not perform persistence or per-kind branching.
- No transform-related code is moved in this step.

---

**Phase 1 Passing Criteria (Overall)**
- Adapter contract is documented.
- Object registry exists.
- Modifier mapping exists.
- Composer API surface is defined.
- No functional behavior changes are introduced in Phase 1.
- No wiring changes are introduced in Phase 1 (pointer and transform flows are untouched).

---

## Phase 2 - Uniform Composer Orchestration

### Step 2.1 - Composer Skeleton (No Behavior Change)
**Problem Description**
Composer does not exist. Pointer directly constructs edit behaviors and applies changes, so there is no single orchestration entry point to route through.

**Solution (Plain Language)**
Create the composer file with explicit, documented entry points, but do not wire it into pointer yet. This is scaffolding only.

**Code Snippets / Suggestions**
- Add `edit-behavior-composer.js` with stub functions that accept the same inputs pointer currently uses for drag/nudge.
- Use a single `context` argument and document required fields in comments:
  - `sceneController`, `selection`, `initialEvent`, `eventStream`
  - `glyph`, `sendIncrementalChange` (from `sceneController.editGlyph`)
  - `scalingEditBehavior`, `equalizeMode`
  - `positionedGlyph`, `initialClickedPointIndex` (for equalize handling)
- Do not import the composer from pointer in this step.
- If logging is added, guard it behind an explicit dev flag so it cannot affect production.

**Manual Testing Criteria**
- Launch app. Perform regular drag and nudge on points and guidelines. No behavior change is observed because pointer is not yet wired to the composer.

**Strictest Possible Passing Criteria**
- Composer file exists with documented function signatures.
- Pointer is unchanged (no new imports, no routing changes).
- No functional change observed; baseline matrix cells (Yes/Specificity) still PASS.

---

### Step 2.2 - Regular Drag Through Composer
**Problem Description**
Pointer directly handles regular drag orchestration.

**Solution (Plain Language)**
Route only regular drag through the composer while leaving all non-regular kinds on the legacy path. Regular drag must use the same edit-behavior logic and the same change recording shape as today.

**Code Snippets / Suggestions**
- In `PointerTool.handleDragSelection`, keep these branches unchanged:
  - editable generated points
  - editable generated handles
  - skeleton-only selection (`_handleDragSkeletonPoints`)
- Add a new branch for **regular-only** selection:
  - Condition: `hasRegularSelection && !hasSkeletonSelection`
  - Action: call `runDragOrchestration(context)` and `return`.
- Keep the existing **mixed** selection block (regular + skeleton) unchanged in Phase 2.
- Implement `runDragOrchestration` by extracting the current regular-drag block from `handleDragSelection`:
  - The block that starts at `// Handle regular selection (with optional skeleton selection)` and ends at the `return { undoLabel, changes, broadcast }` object.
  - Remove skeleton-edit state logic from this extracted block for Phase 2.
- The composer implementation must preserve these behaviors exactly:
  - `getBehaviorName()` updates when modifier keys change mid-drag.
  - X-equalize mid-drag (`equalizeMode`) with the same rollback behavior.
  - `connectContours` and selection updates.
  - `sendIncrementalChange` usage for incremental updates.
- Composer returns the same `{ undoLabel, changes, broadcast }` structure produced today.

**Manual Testing Criteria**
- Drag regular points, handles, anchors, and guidelines. Verify behavior matches the baseline matrix.
- Confirm skeleton, rib, and Tunni drag behavior is unchanged (still on legacy path).

**Strictest Possible Passing Criteria**
- Regular-only matrix cells pass with no deviations.
- Non-regular drag behavior is unchanged (no regressions in skeleton/rib/Tunni baseline cells).
- `handleDragSelection` contains a dedicated regular-only branch that calls the composer and returns.

---

### Step 2.3 - Regular Nudge Through Composer
**Problem Description**
Pointer directly handles nudge for regular points.

**Solution (Plain Language)**
Route only regular nudge through the composer while leaving skeleton/rib/tunni nudges on the legacy path. Regular nudge must use the same change recording shape as today.

**Code Snippets / Suggestions**
- In `PointerTool.handleArrowKeys`, keep these branches unchanged:
  - skeleton point nudge path (including mixed skeleton + regular handling)
  - rib point nudge path
  - editable generated handle nudge path
  - X-equalize path handle nudge path
- Replace the final fallback `return sceneController.handleArrowKeys(event);` with:
  - `return runNudgeOrchestration(context);`
- For Phase 2, `runNudgeOrchestration` must delegate to `sceneController.handleArrowKeys(event)` to preserve identical behavior. This is an explicit temporary pass-through.

**Manual Testing Criteria**
- Arrow keys move regular points and guidelines. Undo/redo works.
- Skeleton/rib/tunni nudge behavior remains unchanged.

**Strictest Possible Passing Criteria**
- Regular nudge matrix cells pass; undo/redo is correct.
- No regressions in non-regular nudge behaviors.
- `handleArrowKeys` no longer calls `sceneController.handleArrowKeys` directly for the regular-only path.

---

**Phase 2 Passing Criteria (Overall)**
- Regular drag and regular nudge go through composer.
- Pointer contains no regular-only orchestration logic.
- Skeleton/rib/tunni paths remain on legacy orchestration in Phase 2.
- Regular-only matrix cells pass.
- No regressions in non-regular baseline matrix cells.

---

## Phase 3 - Drag Routing Through Composer (Matrix-Driven)
Scope: This phase only covers drag actions and their modifier variants. All non-drag actions remain on legacy routing.

### Step 3.1 - Drag Routing Map (Guardrail)
**Problem Description**
When we move drag logic to the composer, it is easy to forget an object kind or leave a branch behind. Missing a kind is a silent regression.

**Solution (Plain Language)**
Add an explicit drag routing map to the action-object matrix. Every drag modifier variant must be a row (for example, `drag`, `drag+X`, `drag+Z`, `drag+D`, `drag+S`, `drag+shift`, `drag+alt`). Do not start routing work until all drag modifier rows are present and reviewed. Every object kind with drag = Yes or Specificity must be marked with one of:
- legacy (handled in pointer)
- composer + legacy adapter (delegates to existing math)
- composer + canonical adapter (new adapter)

_Footnote: This explicit map is a safety guardrail, not a scalable end state. After Phase 3 parity is proven, consider generating the routing map from defaults + overrides (or capability groups) with a completeness check._

**Code Snippets / Suggestions**
- Update `docs/refactor/action-object-matrix.md` with a "Drag Routing" column.
- If any row is "legacy," it must include a short reason and a removal step.
- For this refactor, mark `component`, `componentOrigin`, `componentTCenter`, and `backgroundImage` as **legacy** in the drag routing map with reason "out of scope" and a deferral step.

**Manual Testing Criteria**
- N/A (documentation step).

**Strictest Possible Passing Criteria**
- Every drag modifier variant is a matrix row (no modifier is implicit).
- Every object kind with drag = Yes/Specificity has a Drag Routing value.
- No row is blank or TBD.
- Every legacy row has a stated removal step.
- No drag routing work starts until the drag rows are complete and reviewed.

---

### Step 3.2 - Legacy Drag Adapters (No Math Changes)
**Problem Description**
Composer cannot call drag logic without adapters. Today drag logic lives inside pointer methods.

**Solution (Plain Language)**
Create legacy drag adapters that call existing pointer logic without changing behavior. This is a wrapper step only and applies to drag actions only.

**Code Snippets / Suggestions**
- In `pointer-objects.js`, define one drag adapter per object kind that currently supports drag.
- Each adapter delegates to the existing pointer method for that kind:
  - regular drag (current edit-behavior path)
  - skeleton drag (`_handleDragSkeletonPoints`)
  - rib drag (`_handleDragRibPoint`)
  - editable generated points (`_handleDragEditableGeneratedPoints`)
  - editable generated handles (`_handleDragEditableGeneratedHandles`)
  - Tunni drag (`_handleSkeletonTunniDrag` and non-skeleton Tunni handlers)
- Pass `pointerTool` or a `legacyHandlers` map through composer context so adapters can call these methods without importing pointer into composer.
- Do not change any math or modifier behavior in this step.

**Manual Testing Criteria**
- N/A (adapter wiring step).

**Strictest Possible Passing Criteria**
- Every drag-capable object kind in the registry has a drag adapter entry.
- Adapters only call existing methods (no new math, no new conditionals).

---

### Step 3.3 - Route Drag Through Composer
**Problem Description**
Pointer still owns drag routing, so composer is not actually in control.

**Solution (Plain Language)**
Route all drag operations through the composer, using the drag routing map to select the adapter. Pointer may still do early exits for non-editing modes (measure mode) but must not dispatch drag behavior itself. No non-drag actions are routed in this phase.

**Code Snippets / Suggestions**
- In `PointerTool.handleDragSelection`, after early exit checks, call `runDragOrchestration(context)`.
- Composer selects the adapter based on `parseSelection()` + registry + drag routing map.
- Any exception (still on legacy pointer routing) must be explicitly listed in the drag routing map.

**Manual Testing Criteria**
- For every object kind with drag = Yes/Specificity, perform the drag and confirm parity with the matrix.

**Strictest Possible Passing Criteria**
- Drag for every object kind in the matrix is routed through composer.
- No unlisted pointer branch handles drag.
- All drag matrix cells PASS.
- Composer routing uses registry lookup only (no per-kind if/else blocks inside composer).

---

**Phase 3 Passing Criteria (Overall)**
- Drag routing map exists and is complete.
- All drag operations route through composer.
- No new math changes in drag behavior.
- Drag matrix cells PASS.
- Non-drag actions remain on legacy routing.

---

## Phase 4 - Nudge Routing Through Composer (Matrix-Driven)
Scope: This phase only covers nudge actions and their modifier variants. All non-nudge actions remain on legacy routing.

### Step 4.1 - Nudge Routing Map (Guardrail)
**Problem Description**
Nudge has multiple special cases (skeleton, ribs, equalize). Missing one breaks parity.

**Solution (Plain Language)**
Add an explicit nudge routing map to the action-object matrix with the same status values as drag. Every nudge modifier variant must be a row (for example, `nudge`, `nudge+X`, `nudge+shift`, `nudge+ctrl/alt`). Do not start routing work until all nudge modifier rows are present and reviewed.

**Code Snippets / Suggestions**
- Update `docs/refactor/action-object-matrix.md` with a "Nudge Routing" column.
- If any row is "legacy," it must include a short reason and a removal step.
- For this refactor, mark `component`, `componentOrigin`, `componentTCenter`, and `backgroundImage` as **legacy** in the nudge routing map with reason "out of scope" and a deferral step.

**Manual Testing Criteria**
- N/A (documentation step).

**Strictest Possible Passing Criteria**
- Every nudge modifier variant is a matrix row (no modifier is implicit).
- Every object kind with nudge = Yes/Specificity has a Nudge Routing value.
- No row is blank or TBD.
- Every legacy row has a stated removal step.
- No nudge routing work starts until the nudge rows are complete and reviewed.

---

### Step 4.2 - Legacy Nudge Adapters (No Math Changes)
**Problem Description**
Composer cannot call nudge logic without adapters. Today nudge logic lives inside pointer and scene-controller methods.

**Solution (Plain Language)**
Create legacy nudge adapters that call existing nudge logic without changing behavior. This is a wrapper step only and applies to nudge actions only.

**Code Snippets / Suggestions**
- In `pointer-objects.js`, define one nudge adapter per object kind that supports nudge.
- Each adapter delegates to existing methods:
  - regular nudge (`sceneController.handleArrowKeys`)
  - skeleton nudge path inside `PointerTool.handleArrowKeys`
  - rib nudge (`_handleArrowKeysForRibPoints`)
  - editable generated handle nudge (`_handleArrowKeysForEditableHandles`)
  - equalize handle nudge paths
- Pass `pointerTool` or a `legacyHandlers` map through composer context.
- Do not change any math or modifier behavior in this step.

**Manual Testing Criteria**
- N/A (adapter wiring step).

**Strictest Possible Passing Criteria**
- Every nudge-capable object kind in the registry has a nudge adapter entry.
- Adapters only call existing methods (no new math, no new conditionals).

---

### Step 4.3 - Route Nudge Through Composer
**Problem Description**
Pointer still owns nudge routing, so composer is not actually in control.

**Solution (Plain Language)**
Route all nudge operations through the composer, using the nudge routing map to select the adapter. No non-nudge actions are routed in this phase.

**Code Snippets / Suggestions**
- In `PointerTool.handleArrowKeys`, after early exit checks, call `runNudgeOrchestration(context)`.
- Composer selects the adapter based on `parseSelection()` + registry + nudge routing map.
- Any exception (still on legacy pointer routing) must be explicitly listed in the nudge routing map.

**Manual Testing Criteria**
- For every object kind with nudge = Yes/Specificity, perform the nudge and confirm parity with the matrix.

**Strictest Possible Passing Criteria**
- Nudge for every object kind in the matrix is routed through composer.
- No unlisted pointer branch handles nudge.
- All nudge matrix cells PASS.
- Composer routing uses registry lookup only (no per-kind if/else blocks inside composer).

---

**Phase 4 Passing Criteria (Overall)**
- Nudge routing map exists and is complete.
- All nudge operations route through composer.
- No new math changes in nudge behavior.
- Nudge matrix cells PASS.
- Non-nudge actions remain on legacy routing.

---

## Phase 5 - Replace Legacy Adapters With Canonical Adapters (Drag + Nudge Only, Matrix-Driven)

### Step 5.1 - Unify Skeleton + Rib Behaviors (Shared Execution)
**Problem Description**
Skeleton behavior execution still lives in a separate system, so behavior execution is not unified. This violates the core intent: a single, object-agnostic behavior engine with object-specific constraints only in adapters/orchestration.

**Solution (Plain Language)**
Make `edit-behavior.js` the single source of truth for **behavior execution**, not just rules. Remove any parallel behavior engine. Anything that is not functionally unique must use the shared behavior executor. Rib/handle-specific math stays as helpers called by adapters, not as a separate behavior system.

**Implementation (Incremental Substeps)**
**Step 5.1a - Shared Behavior Executor (edit-behavior.js)**
- Extract the generic behavior executor currently embedded in `SkeletonEditBehavior` into `edit-behavior.js`.
- Provide a stable API (example signature):
  - `createPointBehaviorExecutor({ points, isClosed, selectedIndices, behaviorName, enableScalingEdit, roundFunc })`
  - returns `{ changes, rollback }` where `changes` is `[{ pointIndex, x, y }]`.
- Executor must include:
  - selection flagging
  - point matching
  - segment iteration
  - floating off-curve edits
  - scaling segment edits
  - delta application (applyDelta logic)

**Step 5.1b - Move Rib/Handle Helpers to edit-behavior.js**
- Move rib/handle helper behaviors into `edit-behavior.js`:
  - `RibEditBehavior`, `EditableRibBehavior`, `InterpolatingRibBehavior`, `EditableHandleBehavior`
  - `createRibEditBehavior`, `createEditableRibBehavior`, `createInterpolatingRibBehavior`, `createEditableHandleBehavior`
- Any helper that is functionally identical to regular behavior must be removed in favor of the shared executor.

**Step 5.1c - Pointer Skeleton Uses Shared Executor**
- Replace `createSkeletonEditBehavior` / `SkeletonEditBehavior` usage in `edit-tools-pointer.js` with the shared executor API.
- Keep skeleton-specific constraints (width/nudge/rib modes) in adapters/orchestration only.

**Step 5.1d - Panel Transformation Uses Shared Executor**
- Replace `SkeletonEditBehavior` usage in `panel-transformation.js` with the shared executor.
- Maintain existing transform panel flow (batching/regeneration/rollback), only swap behavior execution.

**Step 5.1e - Remove skeleton-edit-behavior.js**
- After all call sites are migrated, delete `skeleton-edit-behavior.js`.
- Verify no imports remain.

**Manual Testing Criteria**
- Skeleton drag/nudge (R1/R10 C5-C6) using shared executor.
- Rib drag/nudge (R1/R10 C7), including modifier variants (Z/D/S/Alt).
- Transform panel: move/align/distribute skeleton selections and editable handles; undo/redo.

**Strictest Possible Passing Criteria**
- `edit-behavior.js` is the only behavior executor (shared for regular + skeleton).
- No references to `SkeletonEditBehavior` or `createSkeletonEditBehavior` remain.
- `skeleton-edit-behavior.js` is removed.
- No functionally shared behavior logic exists outside `edit-behavior.js` (naming differences do not count as uniqueness).

---

### Step 5.2 - Canonical Adapters: Regular Path Kinds (regularPoint, anchor, guideline)
**Problem Description**
Legacy adapters still call pointer logic for regular path kinds, so composer is not truly canonical.

**Solution (Plain Language)**
Replace legacy adapters for `regularPoint`, `anchor`, and `guideline` with canonical adapters that edit the standard path/anchor/guideline data directly for both drag and nudge.

**Code Snippets / Suggestions**
- Use `object-kind-inventory.md` to confirm current math + persistence locations.
- Implement canonical adapters for drag + nudge for the three kinds.
- Update drag/nudge routing maps from `CL` to `CA` for these kinds.
- Remove any now-dead pointer branches that only served these kinds.

**Manual Testing Criteria**
- Run all drag and nudge Yes/Specificity rows for C1-C4.

**Strictest Possible Passing Criteria**
- All C1-C4 drag/nudge rows PASS after migration.
- No legacy pointer branch remains for these kinds.

---

### Step 5.3 - Canonical Adapters: Skeleton Core (skeletonPoint, skeletonHandle)
**Problem Description**
Skeleton core drag/nudge still relies on pointer-owned logic.

**Solution (Plain Language)**
Replace legacy adapters for `skeletonPoint` and `skeletonHandle` with canonical adapters that edit skeleton data directly and regenerate contours.

**Code Snippets / Suggestions**
- Implement canonical adapters for drag + nudge for the two kinds.
- Update drag/nudge routing maps from `CL` to `CA` for these kinds.
- Remove any now-dead pointer branches that only served these kinds.

**Manual Testing Criteria**
- Run all drag and nudge Yes/Specificity rows for C5-C6, including equalize, fixed rib, and alt variants.

**Strictest Possible Passing Criteria**
- All C5-C6 drag/nudge rows PASS after migration.
- No legacy pointer branch remains for these kinds.

---

### Step 5.4 - Canonical Adapters: Ribs (skeletonRibPoint)
**Problem Description**
Rib drag/nudge remains coupled to pointer-specific logic and modifiers.

**Solution (Plain Language)**
Replace legacy adapters for `skeletonRibPoint` with canonical adapters that edit skeleton data while preserving tangent/fixed constraints.

**Code Snippets / Suggestions**
- Implement canonical adapters for drag + nudge for rib points.
- Update drag/nudge routing maps from `CL` to `CA` for C7.
- Remove pointer-only rib branches after parity is confirmed.

**Manual Testing Criteria**
- Run all drag and nudge Yes/Specificity rows for C7, including Z/D/S and Alt variants.

**Strictest Possible Passing Criteria**
- All C7 drag/nudge rows PASS after migration.
- No legacy pointer branch remains for ribs.

---

### Step 5.5 - Canonical Adapters: Editable Generated (editableGeneratedPoint)
**Problem Description**
Editable generated points/handles are still tied to pointer logic.

**Solution (Plain Language)**
Replace legacy adapters for `editableGeneratedPoint` with canonical adapters that translate virtual handle edits into skeleton data.

**Code Snippets / Suggestions**
- Implement canonical adapters for drag + nudge for editable generated points.
- Update drag/nudge routing maps from `CL` to `CA` for C8.
- Remove pointer-only editable-handle branches after parity is confirmed.

**Manual Testing Criteria**
- Run all drag and nudge Yes/Specificity rows for C8 (including equalize and alt cases).

**Strictest Possible Passing Criteria**
- All C8 drag/nudge rows PASS after migration.
- No legacy pointer branch remains for editable generated handles.

---

### Step 5.6 - Final Cleanup: Remove Remaining Legacy Drag/Nudge Branches
**Problem Description**
After canonical adapters are in place, old pointer branches can linger and cause drift.

**Solution (Plain Language)**
Delete any remaining drag/nudge branches in pointer that are now covered by canonical adapters, and ensure routing maps show `CA` for all migrated kinds.

**Manual Testing Criteria**
- Full baseline matrix run.

**Strictest Possible Passing Criteria**
- No pointer branches remain for drag/nudge on kinds marked `CA`.
- Drag and nudge matrix cells PASS.

---

**Phase 5 Passing Criteria (Overall)**
- All adapters for in-scope object kinds are canonical for drag and nudge (or explicitly deferred).
- Pointer contains no legacy drag/nudge routing for canonical kinds.
- Non-drag/nudge actions remain on legacy routing.

---

## Phase 6 - Final Parity Sweep

### Step 6.1 - Full Baseline Matrix
**Problem Description**
Final confirmation of parity is required.

**Solution (Plain Language)**
Run the full baseline matrix and record results.

**Manual Testing Criteria**
- Execute all baseline matrix cells (Yes/Specificity).

**Strictest Possible Passing Criteria**
- All baseline matrix cells PASS.
- No console errors.

---

**Phase 6 Passing Criteria (Overall)**
- Baseline matrix is fully PASS.
- Mainline parity for regular-only workflows is confirmed.

---

## Assumptions
- Skeleton-pen tool and transform selection are out of scope for this refactor.
- We are not changing file formats beyond canonical skeleton storage rules already in core.

## Notes
This plan is intentionally strict and incremental. Each step can be implemented independently and verified before moving on.

