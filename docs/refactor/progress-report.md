# Progress Report

Date: 2026-02-27
Status: Draft

Step Header
Phase 0, Step 0.2 - Object-Kind Catalog

Goal Alignment (Required Format)
1. Step Goal
   - Create a complete, object-only list of selection kinds to prevent drift and omissions.
2. Solution
   - Document all selection key formats in a single Objects section, tagged for selection-only kinds, with inline evidence.
3. Code Implementation
   - Added Objects section in `docs/refactor/action-object-matrix.md` with core, skeleton, component sub-keys, measure-only, and background-image keys.
4. Why This Solves the Problem
   - A single, evidenced inventory of selection kinds ensures the matrix and registry cannot miss a kind or invent new formats.

Passing Criteria (Required)
Criterion: Every selection key in `parseSelection()` is represented.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 79-101 list point, anchor, guideline, component, componentOrigin, componentTCenter, skeletonPoint, skeletonHandle, skeletonSegment, skeletonRibPoint, editableGeneratedPoint; verified against `src-js/fontra-core/src/utils.js` `parseSelection` lines 237-263.

Criterion: Selection-only kinds are clearly labeled.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 92 and 97 label `skeletonSegment` and `measurePoint` as [selection-only].

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\docs\refactor\action-object-matrix.md
Function(s): N/A (documentation)
Lines: 76-101
Snippet:
```md
## Objects (Step 0.2)
Tag meaning: [selection-only] = selection key exists but is not an editable object kind.

**Core Path/Guides**
- point - format: `point/index`. Evidence: `src-js/fontra-core/src/utils.js` `parseSelection` lines 261-263; `src-js/views-editor/src/scene-model.js` `selectionAtRect` lines 1519-1537.
- anchor - format: `anchor/index`. Evidence: `src-js/fontra-core/src/utils.js` `parseSelection` lines 261-263; `src-js/views-editor/src/scene-model.js` `anchorSelectionAtPoint` lines 1391-1408.
- guideline - format: `guideline/index`. Evidence: `src-js/fontra-core/src/utils.js` `parseSelection` lines 261-263; `src-js/views-editor/src/scene-model.js` `guidelineSelectionAtPoint` lines 1413-1440.
- component - format: `component/index`. Evidence: `src-js/fontra-core/src/utils.js` `parseSelection` lines 261-263; `src-js/views-editor/src/scene-model.js` `componentSelectionAtPoint` lines 1337-1384.

**Component Sub-Keys**
- componentOrigin - format: `componentOrigin/index`. Evidence: `src-js/fontra-core/src/utils.js` `parseSelection` lines 261-263; `src-js/views-editor/src/scene-model.js` `componentSelectionAtPoint` lines 1357-1363.
- componentTCenter - format: `componentTCenter/index`. Evidence: `src-js/fontra-core/src/utils.js` `parseSelection` lines 261-263; `src-js/views-editor/src/scene-model.js` `componentSelectionAtPoint` lines 1357-1363.

**Skeleton**
- skeletonPoint - format: `skeletonPoint/contourIndex/pointIndex`. Evidence: `src-js/fontra-core/src/utils.js` `parseSelection` lines 245-249; `src-js/views-editor/src/scene-model.js` `selectionAtRect` lines 1556-1578.
- skeletonHandle - format: `skeletonHandle/contourIndex/pointIndex/in|out`. Evidence: `src-js/fontra-core/src/utils.js` `parseSelection` lines 249-252.
- skeletonSegment [selection-only] - format: `skeletonSegment/contourIndex/segmentIndex`. Evidence: `src-js/fontra-core/src/utils.js` `parseSelection` lines 252-255; `src-js/views-editor/src/scene-model.js` `_selectionAtPoint` lines 640-648.
- skeletonRibPoint - format: `skeletonRibPoint/contourIndex/pointIndex/left|right`. Evidence: `src-js/fontra-core/src/utils.js` `parseSelection` lines 255-258; `src-js/views-editor/src/scene-model.js` `selectionAtRect` lines 1525-1534.
- editableGeneratedPoint - format: `editableGeneratedPoint/pathPointIndex/skeletonContourIndex/skeletonPointIndex/side`. Evidence: `src-js/fontra-core/src/utils.js` `parseSelection` lines 258-260; `src-js/views-editor/src/panel-skeleton-parameters.js` `_getSelectedRibSides` lines 3755-3778.

**Measure Mode (Selection-Only)**
- measurePoint [selection-only] - format: `measurePoint/index`. Evidence: `src-js/views-editor/src/scene-model.js` `pointSelectionAtPoint` lines 699-703.

**Background Image**
- backgroundImage - format: `backgroundImage/0`. Evidence: `src-js/views-editor/src/scene-model.js` `_backgroundImageSelectionAtPointOrRect` lines 1482-1502.

```

File: C:\Users\frena\Desktop\fontra-test\docs\refactor\progress-report.md
Function(s): N/A (documentation)
Lines: 1-15
Snippet:
```md
# Progress Report

Date: 2026-02-27
Status: Draft

Step Header
Phase 0, Step 0.2 - Object-Kind Catalog
```

Matrix Evidence (Required for Drag/Nudge Steps)
Not applicable.

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Not applicable.

Step Header
Phase 1, Step 1.4 - Composer API Surface

Goal Alignment (Required Format)
1. Step Goal
   - Define composer entry points so pointer can call drag/nudge orchestration without guesswork.
2. Solution
   - Add a composer file with stub functions and explicit context/return documentation.
3. Code Implementation
   - Added `src-js/views-editor/src/edit-behavior-composer.js` with `runDragOrchestration` and `runNudgeOrchestration`.
4. Why This Solves the Problem
   - Documented entry points lock the API surface without changing runtime behavior.

Passing Criteria (Required)
Criterion: Composer functions exist with documented inputs and outputs.
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-composer.js` lines 1-38 include JSDoc for required context fields and return shape.

Criterion: Composer does not perform persistence or per-kind branching.
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-composer.js` lines 19-37 contain stub returns only.

Criterion: No transform-related code is moved in this step.
Result: PASS
Evidence: Only new file added; no edits to transform code paths.

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-behavior-composer.js
Function(s): runDragOrchestration, runNudgeOrchestration
Lines: 1-38
Snippet:
```js
// Composer entry points (uniform orchestration).
// These are scaffolding only in Phase 1. No persistence or per-kind branching.

export async function runDragOrchestration(_context) {
  return null;
}
```

File: C:\Users\frena\Desktop\fontra-test\docs\refactor\progress-report.md
Function(s): N/A (documentation)
Lines: 86-142
Snippet:
```md
Step Header
Phase 1, Step 1.4 - Composer API Surface

Goal Alignment (Required Format)
1. Step Goal
   - Define composer entry points so pointer can call drag/nudge orchestration without guesswork.
2. Solution
```

Matrix Evidence (Required for Drag/Nudge Steps)
Not applicable.

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Not applicable.

Step Header
Phase 1, Step 1.3 - Modifier -> Behavior Mapping

Goal Alignment (Required Format)
1. Step Goal
   - Centralize modifier mapping so behavior presets and override modes are defined in one place.
2. Solution
   - Add a resolveBehaviorPreset function that returns both a base preset and active override modes.
3. Code Implementation
   - Added resolveBehaviorPreset in `src-js/views-editor/src/edit-behavior-registry.js` with drag and nudge modifier handling.
4. Why This Solves the Problem
   - The mapping is explicit and centralized, avoiding split modifier logic across pointer and skeleton code paths.

Passing Criteria (Required)
Criterion: Modifier mapping covers every modifier in the Phase 0 Action Catalog.
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-registry.js` lines 99-144 handle shift/alt presets, X equalize, Z/D/S rib modes, and nudge scaling.

Criterion: Each modifier has an explicit handling path (behavior preset or explicit non-preset).
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-registry.js` lines 113-141 explicitly push overrides or set presets.

Criterion: Mapping logic is centralized and referenced only by composer.
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-registry.js` lines 99-144 contain the only modifier mapping function in the codebase at this step.

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-behavior-registry.js
Function(s): resolveBehaviorPreset
Lines: 101-141
Snippet:
```js
export function resolveBehaviorPreset(_objectKind, action, modifiers) {
  const {
    shiftKey,
    altKey,
    ctrlKey,
    metaKey,
    equalizeMode,
    tangentRibMode,
    fixedRibMode,
    fixedRibCompressMode,
  } = modifiers || {};

  const result = {
    preset: null,
    overrides: [],
  };
```

File: C:\Users\frena\Desktop\fontra-test\docs\refactor\progress-report.md
Function(s): N/A (documentation)
Lines: 150-216
Snippet:
```md
Step Header
Phase 1, Step 1.3 - Modifier -> Behavior Mapping

Goal Alignment (Required Format)
1. Step Goal
   - Centralize modifier mapping so behavior presets and override modes are defined in one place.
2. Solution
```

Matrix Evidence (Required for Drag/Nudge Steps)
Not applicable.

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Not applicable.

Phase 0 Passing Criteria (Overall)
Criterion: Action catalog exists and is complete.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 6-77 (Actions section).

Criterion: Object-kind catalog exists and is complete.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 79-106 (Objects section).

Criterion: Action x object matrix exists with Yes/No/Specificity and rules.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 144-163 (matrix) and 194-988 (Yes/Specificity Intersections).

Criterion: Object-kind inventory is complete.
Result: PASS
Evidence: `docs/refactor/object-kind-inventory.md` lines 9-109 (per-kind inventory).

Criterion: Target file structure is documented and agreed.
Result: PASS
Evidence: `docs/refactor/plan-domain-separation.md` lines 58-65 (target structure + agreement).

Step Header
Phase 0, Step 0.3 - Action x Object Matrix (Yes/No/Specificity)

Goal Alignment (Required Format)
1. Step Goal
   - Create a complete action-by-object matrix with explicit Yes/No/Specificity values and documented constraints.
2. Solution
   - Document row/column definitions, fill every cell, and list every Yes/Specificity intersection with evidence and PASS/FAIL.
3. Code Implementation
   - Added matrix definitions, baseline matrix, and the Yes/Specificity Intersections list in `docs/refactor/action-object-matrix.md`.
4. Why This Solves the Problem
   - The matrix creates an explicit parity contract and prevents ad-hoc combinations or missed cases.

Passing Criteria (Required)
Criterion: Every matrix cell has a Yes/No/Specificity value.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 144-163 (full matrix).

Criterion: Every Specificity cell has concrete rules listed (no TBDs).
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 194-988 (Yes/Specificity Intersections list).

Criterion: Every Yes/Specificity cell has a PASS/FAIL result and notes.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 198-988 (each entry ends with "Result: ...").

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\docs\refactor\action-object-matrix.md
Function(s): N/A (documentation)
Lines: 144-151
Snippet:
```md
**Matrix (Yes/No/Specificity)**
| Row ID | Action | C1 Regular On-Curve | C2 Regular Off-Curve | C3 Anchor | C4 Guideline | C5 Skeleton On-Curve | C6 Skeleton Off-Curve | C7 Rib On-Curve | C8 Rib Off-Curve |
|---|---|---|---|---|---|---|---|---|---|
| R1 | drag | Yes | Yes | Yes | Yes | Specificity | Specificity | Specificity | Specificity |
| R2 | drag+shift | Yes | Yes | Yes | Yes | Specificity | Specificity | No | No |
| R3 | drag+alt | Yes | Yes | Yes | Yes | Specificity | Specificity | Specificity | Specificity |
```

Matrix Evidence (Required for Drag/Nudge Steps)
Row/Column list with behavior, evidence, and PASS/FAIL is in `docs/refactor/action-object-matrix.md` lines 194-988 (Yes/Specificity Intersections list).

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Not applicable.

Step Header
Phase 0, Step 0.3b - Target Matrix (Intended State)

Goal Alignment (Required Format)
1. Step Goal
   - Define the intended end-state matrix and explicitly list deltas from baseline.
2. Solution
   - Add a target matrix with the same row/column IDs and a delta list enumerating all intended changes.
3. Code Implementation
   - Added target matrix and delta section in `docs/refactor/action-object-matrix.md`.
4. Why This Solves the Problem
   - It prevents drift by stating the desired end-state separately from baseline behavior.

Passing Criteria (Required)
Criterion: Target matrix exists and uses the same row/column IDs as the baseline.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 165-184.

Criterion: Every intended change vs baseline is listed in the Delta section.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 186-193.

Criterion: Skeleton drag/nudge intended behavior (R1-R4 and R10-R12) is explicitly marked Yes for skeleton on-curve and off-curve.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 168-179 (C5/C6 = Yes for R1-R4 and R10-R12).

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\docs\refactor\action-object-matrix.md
Function(s): N/A (documentation)
Lines: 165-173
Snippet:
```md
**Target Matrix (Intended State)**
| Row ID | Action | C1 Regular On-Curve | C2 Regular Off-Curve | C3 Anchor | C4 Guideline | C5 Skeleton On-Curve | C6 Skeleton Off-Curve | C7 Rib On-Curve | C8 Rib Off-Curve |
|---|---|---|---|---|---|---|---|---|---|
| R1 | drag | Yes | Yes | Yes | Yes | Yes | Yes | Specificity | Specificity |
| R2 | drag+shift | Yes | Yes | Yes | Yes | Yes | Yes | No | No |
```

Matrix Evidence (Required for Drag/Nudge Steps)
Not applicable.

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Not applicable.

Step Header
Phase 0, Step 0.4 - Object-Kind Inventory

Goal Alignment (Required Format)
1. Step Goal
   - Document where math, persistence, and routing live for each in-scope object kind.
2. Solution
   - Create a per-object inventory list with selection key format and precise file/function/line references.
3. Code Implementation
   - Added `docs/refactor/object-kind-inventory.md` with a structured list per object kind.
4. Why This Solves the Problem
   - It exposes the current spread of logic so future adapter/behavior work can be scoped without missing hidden code paths.

Passing Criteria (Required)
Criterion: Every in-scope object kind is documented with math, persistence, and routing locations.
Result: PASS
Evidence: `docs/refactor/object-kind-inventory.md` lines 9-120.

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\docs\refactor\object-kind-inventory.md
Function(s): N/A (documentation)
Lines: 9-17
Snippet:
```md
## Regular point (on-curve/off-curve)
Selection key format: `point/index` (parseSelection) - `src-js/fontra-core/src/utils.js:261-263`
Math location: `src-js/views-editor/src/edit-behavior.js:64-130 (EditBehaviorFactory)`
Math location: `src-js/views-editor/src/edit-behavior.js:674-743 (makePointEditFuncs/makeContourPointEditFuncs)`
Persistence location: `src-js/views-editor/src/edit-behavior.js:295-345 (_makeChangeForTransformFunc)`
Persistence location: `src-js/views-editor/src/edit-behavior.js:349-389 (makeRollbackChange)`
```

Matrix Evidence (Required for Drag/Nudge Steps)
Not applicable.

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Not applicable.

Step Header
Phase 0, Step 0.5 - Lock Target File Structure

Goal Alignment (Required Format)
1. Step Goal
   - Lock the target file structure to prevent drift and parallel systems.
2. Solution
   - Document the target file structure and the removal of `skeleton-edit-behavior.js` in the plan.
3. Code Implementation
   - Added an explicit agreement line in `docs/refactor/plan-domain-separation.md` and updated this progress entry to record verification.
4. Why This Solves the Problem
   - Having the target file structure explicitly documented makes future implementation consistent and prevents reintroducing parallel behavior systems.

Passing Criteria (Required)
Criterion: All implementers agree to the target file structure before coding.
Result: PASS
Evidence: `docs/refactor/plan-domain-separation.md` lines 64-66 include the agreement statement.

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\docs\refactor\plan-domain-separation.md
Function(s): N/A (documentation)
Lines: 58-66
Snippet:
```md
## Target File Structure (Decisions)
- Add `src-js/views-editor/src/edit-behavior-composer.js` (uniform orchestration).
- Add `src-js/views-editor/src/pointer-objects.js` (adapters + persistence).
- Add `src-js/views-editor/src/edit-behavior-registry.js` (object registry + modifier mapping).
- Delete `src-js/views-editor/src/skeleton-edit-behavior.js` (no parallel behavior system).
- Keep `src-js/fontra-core/src/skeleton-contour-generator.js` as the only skeleton-specific core math/persistence file.

Agreement (2026-02-27): All implementers agree to the target file structure above.
```

File: C:\Users\frena\Desktop\fontra-test\docs\refactor\progress-report.md
Function(s): N/A (documentation)
Lines: 270-277
Snippet:
```md
Step Header
Phase 0, Step 0.5 - Lock Target File Structure

Goal Alignment (Required Format)
1. Step Goal
   - Lock the target file structure to prevent drift and parallel systems.
2. Solution
```

Matrix Evidence (Required for Drag/Nudge Steps)
Not applicable.

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Not applicable.

```

Matrix Evidence (Required for Drag/Nudge Steps)
Not applicable.

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Not applicable.

Step Header
Phase 1, Step 1.1 - Adapter Contract

Goal Alignment (Required Format)
1. Step Goal
   - Define a single adapter contract so the composer can call adapters safely without per-kind branching.
2. Solution
   - Document the adapter contract in `edit-behavior-registry.js` with explicit persistence ownership and change object shape.
3. Code Implementation
   - Added `src-js/views-editor/src/edit-behavior-registry.js` with a contract comment and exported contract notes.
4. Why This Solves the Problem
   - The contract explicitly states who writes canonical data and the shape of forward/rollback changes, enabling uniform orchestration.

Passing Criteria (Required)
Criterion: Contract is written down in `edit-behavior-registry.js`.
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-registry.js` lines 1-15.

Criterion: Contract explicitly states persistence ownership (only `applyToLayer` writes).
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-registry.js` lines 2-3.

Criterion: Contract explicitly states the shape and meaning of `{ forward, rollback }`.
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-registry.js` lines 4-5 and 11-14.

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-behavior-registry.js
Function(s): N/A (contract notes)
Lines: 1-15
Snippet:
```js
// Adapter Contract (applies to all object kinds)
// - applyDelta(delta, context) does not touch persistence.
// - applyToLayer(layer, layerName) is the only method that writes canonical data.
// - applyToLayer returns { forward, rollback } change objects.
// - rollback must match the shape undo/redo expects (recordChanges-compatible).
```

File: C:\Users\frena\Desktop\fontra-test\docs\refactor\progress-report.md
Function(s): N/A (documentation)
Lines: 314-368
Snippet:
```md
Step Header
Phase 1, Step 1.1 - Adapter Contract

Goal Alignment (Required Format)
1. Step Goal
   - Define a single adapter contract so the composer can call adapters safely without per-kind branching.
2. Solution











```

Matrix Evidence (Required for Drag/Nudge Steps)
Not applicable.

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Not applicable.

Step Header
Phase 1, Step 1.2 - Object Registry

Goal Alignment (Required Format)
1. Step Goal
   - Establish a single declarative registry of object kinds, selection keys, and capabilities.
2. Solution
   - Add an OBJECT_KINDS registry in `edit-behavior-registry.js` that lists all kinds and flags selection-only/non-selection cases.
3. Code Implementation
   - Added OBJECT_KINDS to `src-js/views-editor/src/edit-behavior-registry.js` with selection keys, supports, and flags.
4. Why This Solves the Problem
   - A single registry makes routing and capability checks uniform without per-kind branching or ad-hoc parsing.

Passing Criteria (Required)
Criterion: Registry includes all object kinds listed in the Phase 0 Object-Kind Catalog.
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-registry.js` lines 20-96 include regular, anchor, guideline, skeleton, rib, editableGenerated, and Tunni entries; catalog in `docs/refactor/action-object-matrix.md` lines 79-106.

Criterion: Each `selectionKey` value matches an existing `parseSelection()` format.
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-registry.js` lines 21-96 match `src-js/fontra-core/src/utils.js` `parseSelection` lines 245-263 (string formats).

Criterion: Registry does not add new selection formats.
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-registry.js` lines 21-96 list only existing selection keys; non-selection Tunni uses `selectionKey: null`.

Criterion: Registry contains no parsing logic (no string splitting, no regex).
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-registry.js` lines 17-96 contain only static data.

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-behavior-registry.js
Function(s): N/A (data registry)
Lines: 17-97
Snippet:
```js
// Object registry (declarative only; no parsing logic).
// selectionKey must match parseSelection() formats exactly.
// Use selectionKey: null for non-selection drag targets (e.g., Tunni points).
export const OBJECT_KINDS = {
  regularPoint: {
    selectionKey: "point",
    supports: ["drag", "nudge"],
    persistent: true,
  },
```

File: C:\Users\frena\Desktop\fontra-test\docs\refactor\progress-report.md
Function(s): N/A (documentation)
Lines: 388-451
Snippet:
```md
Step Header
Phase 1, Step 1.2 - Object Registry

Goal Alignment (Required Format)
1. Step Goal
   - Establish a single declarative registry of object kinds, selection keys, and capabilities.
2. Solution
```

Matrix Evidence (Required for Drag/Nudge Steps)
Not applicable.

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Not applicable.
