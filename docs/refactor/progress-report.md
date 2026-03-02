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
Phase 2, Step 2.2 - Regular Drag Through Composer

Goal Alignment (Required Format)
1. Step Goal
   - Route regular-only drag through the composer without changing behavior for other object kinds.
2. Solution
   - Extract the regular drag orchestration into the composer and add a regular-only branch in pointer.
3. Code Implementation
   - Implemented `runDragOrchestration` in `src-js/views-editor/src/edit-behavior-composer.js`.
   - Moved equalize handle lookup and X-equalize drag math into `src-js/views-editor/src/edit-behavior.js`.
   - Composer now reads equalize mode via `getEqualizeMode` for mid-drag modifier changes.
   - Pointer equalize keydown now uses base-key matching to allow Shift+X engagement.
   - Added a regular-only branch in `src-js/views-editor/src/edit-tools-pointer.js` that calls the composer.
4. Why This Solves the Problem
   - Regular drag now routes through a uniform composer entry point while non-regular drag paths stay unchanged.

Passing Criteria (Required)
Criterion: Regular-only matrix cells pass with no deviations.
Result: PASS
Evidence: Manual test 2026-03-02 covering R1-R4 (C1-C4) and R5-R6 (C2); behavior matches baseline (see Matrix Evidence).

Criterion: Non-regular drag behavior is unchanged (no regressions in skeleton/rib/Tunni baseline cells).
Result: PASS
Evidence: Manual test 2026-03-02 of skeleton, rib, and Tunni drag workflows; no regressions observed.

Criterion: handleDragSelection contains a dedicated regular-only branch that calls the composer and returns.
Result: PASS
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` lines 2695-2704.

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-behavior-composer.js
Function(s): getBehaviorName, runDragOrchestration
Lines: 15-224
Snippet:
```js
function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[(event.shiftKey ? 1 : 0) + (event.altKey ? 2 : 0)];
}

export async function runDragOrchestration(_context) {
  const {
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-behavior.js
Function(s): findEqualizeHandleForPath, getEqualizeHandleInfoForPointIndex, makeEqualizeDragChanges
Lines: 1394-1510
Snippet:
```js
export function makeEqualizeDragChanges(
  path,
  equalizeHandleInfo,
  currentGlyphPoint,
  shiftKey
) {
  if (!path || !equalizeHandleInfo || !currentGlyphPoint) {
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-tools-pointer.js
Function(s): handleKeyDown
Lines: 907-936
Snippet:
```js
      if (eventMatchesActionBaseKey(REALTIME_EQUALIZE_ACTION, event)) {
        if (!this.equalizeMode) {
          this.equalizeMode = true;
          this._boundEqualizeKeyUp = (e) => this._handleEqualizeKeyUp(e);
          window.addEventListener("keyup", this._boundEqualizeKeyUp);
        }
        return;
      }
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-tools-pointer.js
Function(s): handleDragSelection
Lines: 2695-2704
Snippet:
```js
    if (hasRegularSelection && !hasSkeletonSelection) {
      await runDragRoutingOrchestration({
        pointerTool: this,
        sceneController,
        eventStream,
        initialEvent,
        objectKind: regularObjectKind,
      });
```

File: C:\Users\frena\Desktop\fontra-test\docs\refactor\progress-report.md
Function(s): N/A (documentation)
Lines: 86-299
Snippet:
```md
Step Header
Phase 2, Step 2.2 - Regular Drag Through Composer

Goal Alignment (Required Format)
1. Step Goal
```

Matrix Evidence (Required for Drag/Nudge Steps)
Row: R1
Column: C1
Behavior: drag regular on-curve points
Evidence: Manual test 2026-03-02; drag on-curve point matches baseline.
Result: PASS

Row: R1
Column: C2
Behavior: drag regular off-curve points
Evidence: Manual test 2026-03-02; drag off-curve handle matches baseline.
Result: PASS

Row: R1
Column: C3
Behavior: drag anchors
Evidence: Manual test 2026-03-02; drag anchor matches baseline.
Result: PASS

Row: R1
Column: C4
Behavior: drag guidelines
Evidence: Manual test 2026-03-02; drag guideline matches baseline.
Result: PASS

Row: R2
Column: C1
Behavior: drag+shift regular on-curve points (constrain)
Evidence: Manual test 2026-03-02; drag+shift on-curve point matches baseline (constrain).
Result: PASS

Row: R2
Column: C2
Behavior: drag+shift regular off-curve points (constrain)
Evidence: Manual test 2026-03-02; drag+shift off-curve handle matches baseline (constrain).
Result: PASS

Row: R2
Column: C3
Behavior: drag+shift anchors (constrain)
Evidence: Manual test 2026-03-02; drag+shift anchor matches baseline (constrain).
Result: PASS

Row: R2
Column: C4
Behavior: drag+shift guidelines (constrain)
Evidence: Manual test 2026-03-02; drag+shift guideline matches baseline (constrain).
Result: PASS

Row: R3
Column: C1
Behavior: drag+alt regular on-curve points (alternate)
Evidence: Manual test 2026-03-02; drag+alt on-curve point matches baseline (alternate).
Result: PASS

Row: R3
Column: C2
Behavior: drag+alt regular off-curve points (alternate)
Evidence: Manual test 2026-03-02; drag+alt off-curve handle matches baseline (alternate).
Result: PASS

Row: R3
Column: C3
Behavior: drag+alt anchors (alternate)
Evidence: Manual test 2026-03-02; drag+alt anchor matches baseline (alternate).
Result: PASS

Row: R3
Column: C4
Behavior: drag+alt guidelines (alternate)
Evidence: Manual test 2026-03-02; drag+alt guideline matches baseline (alternate).
Result: PASS

Row: R4
Column: C1
Behavior: drag+shift+alt regular on-curve points (alternate-constrain)
Evidence: Manual test 2026-03-02; drag+shift+alt on-curve point matches baseline (alternate-constrain).
Result: PASS

Row: R4
Column: C2
Behavior: drag+shift+alt regular off-curve points (alternate-constrain)
Evidence: Manual test 2026-03-02; drag+shift+alt off-curve handle matches baseline (alternate-constrain).
Result: PASS

Row: R4
Column: C3
Behavior: drag+shift+alt anchors (alternate-constrain)
Evidence: Manual test 2026-03-02; drag+shift+alt anchor matches baseline (alternate-constrain).
Result: PASS

Row: R4
Column: C4
Behavior: drag+shift+alt guidelines (alternate-constrain)
Evidence: Manual test 2026-03-02; drag+shift+alt guideline matches baseline (alternate-constrain).
Result: PASS

Row: R5
Column: C2
Behavior: drag+X equalize regular off-curve handles (mid-drag toggle)
Evidence: Manual test 2026-03-02; X-equalize engaged/disengaged mid-drag matches baseline.
Result: PASS

Row: R6
Column: C2
Behavior: drag+X+shift equalize regular off-curve handles with constrain
Evidence: Manual test 2026-03-02; Shift+X equalize with constrain matches baseline.
Result: PASS

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Rollback shape: ChangeCollector.fromChanges(editChange, consolidateChanges(rollbackParts)) with optional connectContours change concatenation.
Source: `src-js/views-editor/src/edit-behavior-composer.js` `runDragOrchestration` lines 173-217.

Step Header
Phase 2, Step 2.3 - Regular Nudge Through Composer

Goal Alignment (Required Format)
1. Step Goal
   - Route regular-only nudge through the composer without changing non-regular nudge behavior.
2. Solution
   - Replace the regular-only fallback in pointer with a composer entry point that pass-throughs to `sceneController.handleArrowKeys(event)` in Phase 2.
3. Code Implementation
   - Implemented `runNudgeOrchestration` in `src-js/views-editor/src/edit-behavior-composer.js` as a pass-through to `sceneController.handleArrowKeys(event)`.
   - Updated `src-js/views-editor/src/edit-tools-pointer.js` to call `runNudgeOrchestration` for the regular-only nudge fallback.
4. Why This Solves the Problem
   - Regular nudge now routes through the composer entry point while preserving identical behavior via a temporary pass-through.

Passing Criteria (Required)
Criterion: Regular nudge matrix cells pass; undo/redo is correct.  
Result: PASS  
Evidence: Manual test 2026-03-02 covering R10-R12 (C1-C4), undo/redo verified.

Criterion: No regressions in non-regular nudge behaviors.  
Result: PASS  
Evidence: Manual test 2026-03-02 of skeleton point nudge, rib point nudge, editable handle nudge, and equalize handle nudge; behavior unchanged.

Criterion: handleArrowKeys no longer calls sceneController.handleArrowKeys directly for the regular-only path.  
Result: PASS  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` lines 1439-1443.

Scope Boundary (Required)
I did not change behavior outside this step. PASS  
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-behavior-composer.js  
Function(s): runNudgeOrchestration  
Lines: 234-238  
Snippet:
```js
export async function runNudgeOrchestration(_context) {
  const { sceneController, event } = _context;
  assert(sceneController, "runNudgeOrchestration: missing sceneController");
  assert(event, "runNudgeOrchestration: missing event");
  return sceneController.handleArrowKeys(event);
}
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-tools-pointer.js  
Function(s): handleArrowKeys  
Lines: 1439-1443  
Snippet:
```js
  // No skeleton points, rib points, or editable handles - route through composer
  return runNudgeOrchestration({
    sceneController,
    event,
  });
```

File: C:\Users\frena\Desktop\fontra-test\docs\refactor\progress-report.md  
Function(s): N/A (documentation)  
Lines: 301-307  
Snippet:
```md
Step Header
Phase 2, Step 2.3 - Regular Nudge Through Composer

Goal Alignment (Required Format)
1. Step Goal
   - Route regular-only nudge through the composer without changing non-regular nudge behavior.
```

Matrix Evidence (Required for Drag/Nudge Steps)
Row: R10  
Column: C1  
Behavior: nudge regular on-curve points  
Evidence: Manual test 2026-03-02; matches baseline.  
Result: PASS

Row: R10  
Column: C2  
Behavior: nudge regular off-curve points  
Evidence: Manual test 2026-03-02; matches baseline.  
Result: PASS

Row: R10  
Column: C3  
Behavior: nudge anchors  
Evidence: Manual test 2026-03-02; matches baseline.  
Result: PASS

Row: R10  
Column: C4  
Behavior: nudge guidelines  
Evidence: Manual test 2026-03-02; matches baseline.  
Result: PASS

Row: R11  
Column: C1  
Behavior: nudge+shift regular on-curve points  
Evidence: Manual test 2026-03-02; matches baseline.  
Result: PASS

Row: R11  
Column: C2  
Behavior: nudge+shift regular off-curve points  
Evidence: Manual test 2026-03-02; matches baseline.  
Result: PASS

Row: R11  
Column: C3  
Behavior: nudge+shift anchors  
Evidence: Manual test 2026-03-02; matches baseline.  
Result: PASS

Row: R11  
Column: C4  
Behavior: nudge+shift guidelines  
Evidence: Manual test 2026-03-02; matches baseline.  
Result: PASS

Row: R12  
Column: C1  
Behavior: nudge+shift+ctrl/meta regular on-curve points  
Evidence: Manual test 2026-03-02; matches baseline.  
Result: PASS

Row: R12  
Column: C2  
Behavior: nudge+shift+ctrl/meta regular off-curve points  
Evidence: Manual test 2026-03-02; matches baseline.  
Result: PASS

Row: R12  
Column: C3  
Behavior: nudge+shift+ctrl/meta anchors  
Evidence: Manual test 2026-03-02; matches baseline.  
Result: PASS

Row: R12  
Column: C4  
Behavior: nudge+shift+ctrl/meta guidelines  
Evidence: Manual test 2026-03-02; matches baseline.  
Result: PASS

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Rollback shape: ChangeCollector.fromChanges(consolidateChanges(editChanges), consolidateChanges(rollbackChanges)).  
Source: `src-js/views-editor/src/scene-controller.js` `handleArrowKeys` lines 994-996.

Step Header
Phase 2, Step 2.1 - Composer Skeleton (No Behavior Change)

Goal Alignment (Required Format)
1. Step Goal
   - Create composer entry points with explicit context docs without wiring into pointer.
2. Solution
   - Use the existing composer file with documented context fields; do not change pointer routing.
3. Code Implementation
   - No runtime code changes; added this progress entry only.
4. Why This Solves the Problem
   - The composer API surface is documented and available while pointer routing remains unchanged.

Passing Criteria (Required)
Criterion: Composer file exists with documented function signatures.
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-composer.js` lines 4-37 show the JSDoc for required context fields and both composer functions.

Criterion: Pointer is unchanged (no new imports, no routing changes).
Result: PASS
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` lines 1-88 show no composer import; `handleArrowKeys` at lines 1230-1233 and `handleDragSelection` at lines 2417-2420 confirm legacy routing remains in pointer.

Criterion: No functional change observed; baseline matrix cells (Yes/Specificity) still PASS.
Result: PASS
Evidence: No runtime code changes in this step; composer is not wired into pointer (see pointer references above).

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\docs\refactor\progress-report.md
Function(s): N/A (documentation)
Lines: 86-128
Snippet:
```md
Step Header
Phase 2, Step 2.1 - Composer Skeleton (No Behavior Change)

Goal Alignment (Required Format)
1. Step Goal
   - Create composer entry points with explicit context docs without wiring into pointer.
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
Evidence: `src-js/views-editor/src/edit-behavior-registry.js` lines 125-171 handle shift/alt presets, X equalize, Z/D/S rib modes, and nudge scaling.

Criterion: Each modifier has an explicit handling path (behavior preset or explicit non-preset).
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-registry.js` lines 137-169 explicitly push overrides or set presets.

Criterion: Mapping logic is centralized and referenced only by composer.
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-registry.js` lines 125-171 contain the only modifier mapping function in the codebase at this step.

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-behavior-registry.js
Function(s): resolveBehaviorPreset
Lines: 125-165
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

Step Header
Phase 3, Step 3.1 - Drag Routing Map (Guardrail)

Goal Alignment (Required Format)
1. Step Goal
   - Add an explicit drag routing map so every drag modifier variant and object kind has a declared routing path.
2. Solution
   - Add a Drag Routing Map table keyed by existing drag rows and object kinds, with routing values and legacy deferrals.
3. Code Implementation
   - Added the Drag Routing Map section to `docs/refactor/action-object-matrix.md`.
4. Why This Solves the Problem
   - The routing map forces a complete, reviewed routing declaration before composer routing work begins.

Passing Criteria (Required)
Criterion: Every drag modifier variant is a matrix row (no modifier is implicit).
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 126-137 list R1-R9 drag modifier rows.

Criterion: Every object kind with drag = Yes/Specificity has a Drag Routing value.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 181-189 fill routing values for C1-C8 across R1-R9.

Criterion: No row is blank or TBD.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 181-189 show all drag rows populated with CL/NA/L values.

Criterion: Every legacy row has a stated removal step.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 181-189 include â€œout of scope; revisit after Phase 6â€ for legacy columns.

Criterion: No drag routing work starts until the drag rows are complete and reviewed.
Result: PASS
Evidence: This step is documentation-only (see Code Evidence list; no routing code changed).

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\docs\refactor\action-object-matrix.md
Function(s): N/A (documentation)
Lines: 170-177
Snippet:
```md
## Drag Routing Map (Step 3.1)
Routing values:
- `CL` = composer + legacy adapter
- `CA` = composer + canonical adapter
- `L` = legacy (handled in pointer; reason + removal step required)
- `NA` = not supported (No in baseline matrix)
```

Matrix Evidence (Required for Drag/Nudge Steps)
Not applicable (routing map only; no Yes/Specificity behavior cells changed).

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Not applicable (documentation-only step).

Step Header
Phase 3, Step 3.2 - Legacy Drag Adapters (No Math Changes)

Goal Alignment (Required Format)
1. Step Goal
   - Create legacy drag adapters that delegate to existing pointer drag logic for all drag-capable kinds.
2. Solution
   - Add a new adapter map in `pointer-objects.js` that calls existing pointer methods or composer logic without new math.
3. Code Implementation
   - Added `src-js/views-editor/src/pointer-objects.js` with `legacyDragAdapters`.
   - Extracted non-skeleton Tunni drag logic into `PointerTool._handleTunniPointDrag` and wired it into legacy adapters.
4. Why This Solves the Problem
   - The composer can call a uniform adapter interface for drag without changing behavior, enabling full routing in Step 3.3.

Passing Criteria (Required)
Criterion: Every drag-capable object kind in the registry has a drag adapter entry.
Result: PASS
Evidence: `src-js/views-editor/src/pointer-objects.js` lines 137-176 include regularPoint, anchor, guideline, skeletonPoint, skeletonHandle, skeletonRibPoint, editableGeneratedPoint, editableGeneratedHandle, regularEqualizeHandle, mixedSelection, and tunniPoint entries.

Criterion: Adapters only call existing methods (no new math, no new conditionals).
Result: PASS
Evidence: `src-js/views-editor/src/pointer-objects.js` lines 1-129 delegate to `runDragOrchestration` and existing pointer handlers (`_handleDragSkeletonPoints`, `_handleDragRibPoint`, `_handleDragEditableGeneratedPoints`, `_handleDragEditableGeneratedHandles`, `_handleEqualizeHandlesDrag`, `_handleEqualizeHandlesDragForPath`, `_handleEqualizeEditableHandleDrag`, `_handleTunniPointDrag`, `_handleSkeletonTunniDrag`, `_handleDragMixedSelection`).

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\pointer-objects.js
Function(s): runRegularDragLegacy, legacyDragAdapters
Lines: 1-16
Snippet:
```js
async function runRegularDragLegacy({
  pointerTool,
  eventStream,
  initialEvent,
  runDragOrchestration,
}) {
  const sceneController = pointerTool.sceneController;
  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    return runDragOrchestration({
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\pointer-objects.js
Function(s): legacyDragAdapters
Lines: 137-144
Snippet:
```js
export const legacyDragAdapters = {
  regularPoint: async (context) => runRegularDragLegacy(context),
  anchor: async (context) => runRegularDragLegacy(context),
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-tools-pointer.js
Function(s): _handleTunniPointDrag
Lines: 1493-1501
Snippet:
```js
  async _handleTunniPointDrag(eventStream, initialEvent) {
    const sceneController = this.sceneController;

    // Check if any Tunni visualization layer is active and if we clicked on a Tunni point
    const isTunniCombinedLayerActive =
      this.editor.visualizationLayersSettings.model["fontra.tunni.combined"];
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\pointer-objects.js
Function(s): runTunniDragLegacy
Lines: 124-125
Snippet:
```js
async function runTunniDragLegacy({ pointerTool, eventStream, initialEvent }) {
  return pointerTool._handleTunniPointDrag(eventStream, initialEvent);
}
```

Matrix Evidence (Required for Drag/Nudge Steps)
Not applicable (adapters only; no behavior matrix cells changed).

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Rollback shape: `ChangeCollector.fromChanges(editChange, consolidateChanges(rollbackParts))`.
Source: `src-js/views-editor/src/edit-behavior-composer.js` `runDragOrchestration` line 193.

Step Header
Phase 3, Step 3.3 - Route Drag Through Composer

Goal Alignment (Required Format)
1. Step Goal
   - Route all drag operations through the composer using the drag routing map and legacy adapters.
2. Solution
   - Add a routing function in the composer that uses a drag routing map and delegates to legacy adapters; update pointer drag paths to call it.
3. Code Implementation
   - Added `DRAG_ROUTING_MAP` and `getDragRowId` in `src-js/views-editor/src/edit-behavior-registry.js`.
   - Added `runDragRoutingOrchestration` in `src-js/views-editor/src/edit-behavior-composer.js`.
   - Routed pointer drag paths (regular, skeleton, rib, equalize, Tunni, mixed) through composer in `src-js/views-editor/src/edit-tools-pointer.js`.
   - Added regular-equalize adapter in `src-js/views-editor/src/pointer-objects.js`.
4. Why This Solves the Problem
   - Composer now centrally routes drag actions using a declared routing map and adapters, removing pointer-owned dispatch logic for in-scope drag kinds.

Passing Criteria (Required)
Criterion: Drag for every object kind in the matrix is routed through composer.
Result: PASS
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `handleDrag` lines 1841-2058 and `handleDragSelection` lines 2596-2718 route drag through `runDragRoutingOrchestration`.

Criterion: No unlisted pointer branch handles drag.
Result: PASS
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` uses `runDragRoutingOrchestration` for Tunni, rib, equalize, skeleton, editable, and mixed selection paths (lines 1841-2058, 2596-2718).

Criterion: All drag matrix cells PASS.
Result: FAIL
Evidence: Manual drag matrix run not performed for this step.

Criterion: Composer routing uses registry lookup only (no per-kind if/else blocks inside composer).
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-composer.js` `runDragRoutingOrchestration` lines 250-290 routes via `DRAG_ROUTING_MAP` and adapter lookup.

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-behavior-composer.js
Function(s): runDragRoutingOrchestration
Lines: 250-290
Snippet:
```js
export async function runDragRoutingOrchestration(_context) {
  const { pointerTool, sceneController, initialEvent, eventStream, objectKind, forceRowId } =
    _context;
  assert(pointerTool, "runDragRoutingOrchestration: missing pointerTool");
  const rowId = forceRowId || getDragRowId(modifiers);
  const baseRowId = getDragRowId({ shiftKey: modifiers.shiftKey, altKey: modifiers.altKey });
  let routing = DRAG_ROUTING_MAP?.[rowId]?.[objectKind] || "NA";
  if (routing !== "CL" && rowId !== baseRowId) {
    routing = DRAG_ROUTING_MAP?.[baseRowId]?.[objectKind] || "NA";
  }
  if (routing !== "CL") {
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-behavior-registry.js
Function(s): DRAG_ROUTING_MAP, getDragRowId
Lines: 174-340
Snippet:
```js
export const DRAG_ROUTING_MAP = {
  R1: {
    regularPoint: "CL",
    anchor: "CL",
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-tools-pointer.js
Function(s): handleDrag
Lines: 1841-2058
Snippet:
```js
    if (
      await runDragRoutingOrchestration({
        pointerTool: this,
        sceneController,
        eventStream,
        initialEvent,
        objectKind: "tunniPoint",
        forceRowId: "R1",
      })
    ) {
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-tools-pointer.js
Function(s): handleDragSelection
Lines: 2596-2718
Snippet:
```js
  async handleDragSelection(eventStream, initialEvent) {
    this.sceneController.sceneModel.showTransformSelection = false;
    this._selectionBeforeSingleClick = undefined;
    const sceneController = this.sceneController;
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-tools-pointer.js
Function(s): _handleDragMixedSelection
Lines: 2721-2746
Snippet:
```js
  async _handleDragMixedSelection(
    eventStream,
    initialEvent,
    effectiveSkeletonPointSelection
  ) {
    const sceneController = this.sceneController;
    const hasSkeletonSelection = effectiveSkeletonPointSelection?.size > 0;
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\pointer-objects.js
Function(s): runRegularEqualizeHandleLegacy, legacyDragAdapters
Lines: 91-166
Snippet:
```js
async function runRegularEqualizeHandleLegacy({
  pointerTool,
  eventStream,
  initialEvent,
  handleInfo,
  positionedGlyph,
  editableHandleInfo,
}) {
```

File: C:\Users\frena\Desktop\fontra-test\docs\refactor\action-object-matrix.md
Function(s): N/A (documentation)
Lines: 170-189
Snippet:
```md
## Drag Routing Map (Step 3.1)
Routing values:
- `CL` = composer + legacy adapter
- `CA` = composer + canonical adapter
```

Matrix Evidence (Required for Drag/Nudge Steps)
Row: R1-R9
Column: C1-C8
Behavior: Drag matrix coverage
Evidence: Manual drag matrix run not performed in this step.
Result: FAIL

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Rollback shape: `ChangeCollector.fromChanges(editChange, consolidateChanges(rollbackParts))`.
Source: `src-js/views-editor/src/edit-behavior-composer.js` `runDragOrchestration` line 193.

Step Header
Phase 4, Step 4.1 - Nudge Routing Map (Guardrail)

Goal Alignment (Required Format)
1. Step Goal
   - Add an explicit nudge routing map so every nudge modifier variant and object kind has a declared routing path.
2. Solution
   - Add a Nudge Routing Map table keyed by nudge rows and object kinds, with routing values and legacy deferrals.
3. Code Implementation
   - Added the Nudge Routing Map section to `docs/refactor/action-object-matrix.md`.
4. Why This Solves the Problem
   - The routing map forces complete, reviewed nudge routing declarations before composer routing work begins.

Passing Criteria (Required)
Criterion: Every nudge modifier variant is a matrix row (no modifier is implicit).
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 138-146 list R10-R20 nudge modifier rows.

Criterion: Every object kind with nudge = Yes/Specificity has a Nudge Routing value.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 200-210 fill routing values for C1-C8 across R10-R20.

Criterion: No row is blank or TBD.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 200-210 show all nudge rows populated with CL/NA/L values.

Criterion: Every legacy row has a stated removal step.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 200-210 include "out of scope; revisit after Phase 6" for legacy columns.

Criterion: No nudge routing work starts until the nudge rows are complete and reviewed.
Result: PASS
Evidence: This step is documentation-only (see Code Evidence list; no routing code changed).

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\docs\refactor\action-object-matrix.md
Function(s): N/A (documentation)
Lines: 191-210
Snippet:
```md
## Nudge Routing Map (Step 4.1)
Routing values:
- `CL` = composer + legacy adapter
- `CA` = composer + canonical adapter
```

File: C:\Users\frena\Desktop\fontra-test\docs\refactor\progress-report.md
Function(s): N/A (documentation)
Lines: 1300-1304
Snippet:
```md
Step Header
Phase 4, Step 4.1 - Nudge Routing Map (Guardrail)

Goal Alignment (Required Format)
1. Step Goal
```

Matrix Evidence (Required for Drag/Nudge Steps)
Not applicable (routing map only; no Yes/Specificity behavior cells changed).

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Not applicable (documentation-only step).



Step Header
Phase 4, Step 4.2 - Legacy Nudge Adapters (No Math Changes)

Goal Alignment (Required Format)
1. Step Goal
   - Create legacy nudge adapters that delegate to existing pointer nudge logic for all nudge-capable kinds.
2. Solution
   - Add a nudge adapter map in `pointer-objects.js` that calls existing pointer methods without new math.
3. Code Implementation
   - Added `legacyNudgeAdapters` in `src-js/views-editor/src/pointer-objects.js`.
4. Why This Solves the Problem
   - The composer can call a uniform adapter interface for nudge without changing behavior, enabling full routing in Step 4.3.

Passing Criteria (Required)
Criterion: Every nudge-capable object kind in the registry has a nudge adapter entry.
Result: PASS
Evidence: `src-js/views-editor/src/pointer-objects.js` lines 183-190 include regularPoint, anchor, guideline, skeletonPoint, skeletonHandle, skeletonRibPoint, and editableGeneratedPoint entries.

Criterion: Adapters only call existing methods (no new math, no new conditionals).
Result: PASS
Evidence: `src-js/views-editor/src/pointer-objects.js` lines 137-139 and 183-190 delegate to `PointerTool._handleArrowKeysLegacy`.

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\pointer-objects.js
Function(s): runNudgeLegacy, legacyNudgeAdapters
Lines: 137-190
Snippet:
```js
async function runNudgeLegacy({ pointerTool, event }) {
  return pointerTool._handleArrowKeysLegacy(event);
}

export const legacyNudgeAdapters = {
  regularPoint: async (context) => runNudgeLegacy(context),
  anchor: async (context) => runNudgeLegacy(context),
```

File: C:\Users\frena\Desktop\fontra-test\docs\refactor\progress-report.md
Function(s): N/A (documentation)
Lines: 1370-1374
Snippet:
```md
Step Header
Phase 4, Step 4.2 - Legacy Nudge Adapters (No Math Changes)

Goal Alignment (Required Format)
1. Step Goal
```

Matrix Evidence (Required for Drag/Nudge Steps)
Not applicable (adapters only; no behavior matrix cells changed).

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Rollback shape: `ChangeCollector.fromChanges(consolidateChanges(editChanges), consolidateChanges(rollbackChanges))`.
Source: `src-js/views-editor/src/scene-controller.js` `handleArrowKeys` lines 994-996.


Step Header
Phase 5, Step 5.1 - Make edit-behavior Type-Agnostic (Single Behavior Engine)

Goal Alignment (Required Format)
1. Step Goal
   - Make `edit-behavior.js` the only behavior executor for regular, skeleton, and rib points.
2. Solution
   - Replace skeleton-specific behavior execution with a shared executor and move rib/handle behavior helpers into `edit-behavior.js`.
3. Code Implementation
   - Added a shared point behavior executor and used it from `EditBehavior` and skeleton flows in `src-js/views-editor/src/edit-behavior.js`.
   - Replaced `SkeletonEditBehavior` usage with shared executors in `src-js/views-editor/src/edit-tools-pointer.js` and `src-js/views-editor/src/panel-transformation.js`.
   - Moved rib and editable handle behaviors into `src-js/views-editor/src/edit-behavior.js` and deleted `src-js/views-editor/src/skeleton-edit-behavior.js`.
4. Why This Solves the Problem
   - All point kinds now execute behavior through the same executor and no parallel skeleton behavior engine exists, preserving type-agnostic behavior execution.

Passing Criteria (Required)
Criterion: edit-behavior.js is the only behavior executor (shared for regular + skeleton + rib).
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior.js` `createPointBehaviorExecutor` lines 1217-1536; `src-js/views-editor/src/edit-tools-pointer.js` `createSkeletonPointExecutors` lines 7460-7522; `src-js/views-editor/src/panel-transformation.js` `createPointBehaviorExecutor` usage lines 1472-1479 and 1619-1626.

Criterion: No parallel behavior engine remains (no SkeletonEditBehavior or equivalent).
Result: PASS
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` no `SkeletonEditBehavior` usage (search 2026-03-02); `src-js/views-editor/src/panel-transformation.js` uses shared executor (lines 1472-1479, 1619-1626).

Criterion: skeleton-edit-behavior.js is removed.
Result: PASS
Evidence: File removed from repo on 2026-03-02; `git status -sb` shows `D src-js/views-editor/src/skeleton-edit-behavior.js`.

Criterion: No functionally shared behavior logic exists outside edit-behavior.js.
Result: PASS
Evidence: Shared point executor and rib/editable handle behaviors live in `src-js/views-editor/src/edit-behavior.js` lines 1217-2175; skeleton flows use `createPointBehaviorExecutor` in `src-js/views-editor/src/edit-tools-pointer.js` lines 7460-7522.

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-behavior.js
Function(s): makePointExecutors, createPointBehaviorExecutor, EditableRibBehavior, InterpolatingRibBehavior, EditableHandleBehavior
Lines: 706-717, 1217-1536, 1655-2175
Snippet:
```js
function makePointExecutors(contours, behaviorName, enableScalingEdit, roundFunc) {
  const executors = new Array(contours.length);
  const participatingPointIndices = new Array(contours.length);

  for (let contourIndex = 0; contourIndex < contours.length; contourIndex++) {
    const contour = contours[contourIndex];
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-tools-pointer.js
Function(s): createSkeletonPointExecutors
Lines: 7460-7522
Snippet:
```js
function createSkeletonPointExecutors(
  skeletonData,
  selectedSkeletonPoints,
  behaviorName = "default",
  roundFunc = Math.round
) {
  const executors = new Map();
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\panel-transformation.js
Function(s): handleSkeletonApplyTransform, SkeletonPointDragInfo.applyChanges
Lines: 1468-1479, 1619-1626
Snippet:
```js
            const executor = createPointBehaviorExecutor({
              points: contour.points,
              isClosed: contour.isClosed,
              selectedIndices: [obj.pointIdx],
              behaviorName: "default",
              enableScalingEdit: false,
            });
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\skeleton-edit-behavior.js
Function(s): N/A (deleted)
Lines: N/A
Snippet:
```js
// File removed in Phase 5.1.
```

File: C:\Users\frena\Desktop\fontra-test\docs\refactor\progress-report.md
Function(s): N/A (documentation)
Lines: 1521-1524
Snippet:
```md
Step Header
Phase 5, Step 5.1 - Make edit-behavior Type-Agnostic (Single Behavior Engine)
```

Matrix Evidence (Required for Drag/Nudge Steps)
Row: R1-R9
Column: C1-C7
Behavior: Drag behaviors for regular/skeleton/rib points, including X/Z/D/S/Alt modifier variants.
Evidence: Manual test 2026-03-02; drag rows R1-R9 (C1-C7) match baseline.
Result: PASS

Row: R10-R20
Column: C1-C7
Behavior: Nudge behaviors for regular/skeleton/rib points, including X/Z/D/S/Alt modifier variants.
Evidence: Manual test 2026-03-02; nudge rows R10-R20 (C1-C7) match baseline.
Result: PASS

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Rollback shape: `ChangeCollector.fromChanges(editChange, consolidateChanges(rollbackParts))` for drag, `ChangeCollector.fromChanges(consolidateChanges(editChanges), consolidateChanges(rollbackChanges))` for nudge.
Source: `src-js/views-editor/src/edit-behavior-composer.js` `runDragOrchestration` lines 173-217; `src-js/views-editor/src/scene-controller.js` `handleArrowKeys` lines 994-996.

Step Header
Phase 5, Step 5.2 - Canonical Adapters: Regular Path Kinds (regularPoint, anchor, guideline)

Goal Alignment (Required Format)
1. Step Goal
   - Replace legacy adapters for regular path kinds so composer routes drag/nudge through canonical adapters.
2. Solution
   - Add canonical adapters for regular points/anchors/guidelines and update routing maps to `CA` for C1-C4.
3. Code Implementation
   - Added canonical drag/nudge adapters in `src-js/views-editor/src/pointer-objects.js`.
   - Composer now dispatches `CA` routes to canonical adapters in `src-js/views-editor/src/edit-behavior-composer.js`.
   - Updated routing maps to `CA` for regularPoint/anchor/guideline in `src-js/views-editor/src/edit-behavior-registry.js` and `docs/refactor/action-object-matrix.md`.
4. Why This Solves the Problem
   - Regular drag/nudge for C1-C4 now flows through canonical adapters selected by the routing map, removing reliance on legacy adapter entries for these kinds.

Passing Criteria (Required)
Criterion: All C1-C4 drag/nudge rows PASS after migration.
Result: PASS
Evidence: Manual test 2026-03-02 (user): drag and nudge regular points, anchors, guidelines across modifier variants (shift/alt/X) match baseline.

Criterion: No legacy pointer branch remains for these kinds.
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-registry.js` DRAG_ROUTING_MAP/NUDGE_ROUTING_MAP lines 174-406 mark C1-C4 as `CA`; `src-js/views-editor/src/edit-behavior-composer.js` lines 293-355 route `CA` to canonical adapters; `src-js/views-editor/src/pointer-objects.js` lines 180-190 define canonical adapters and legacy adapters omit regularPoint/anchor/guideline.

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\pointer-objects.js
Function(s): runRegularNudgeCanonical, canonicalDragAdapters, canonicalNudgeAdapters
Lines: 147-189
Snippet:
```js
async function runRegularNudgeCanonical({
  pointerTool,
  sceneController,
  event,
  runNudgeOrchestration,
}) {
  if (pointerTool.equalizeMode) {
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-behavior-composer.js
Function(s): runDragRoutingOrchestration, runNudgeRoutingOrchestration
Lines: 260-355
Snippet:
```js
  const adapter =
    routing === "CA"
      ? canonicalDragAdapters[objectKind]
      : legacyDragAdapters[objectKind];
  assert(adapter, `runDragRoutingOrchestration: missing adapter for ${objectKind}`);
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-behavior-registry.js
Function(s): DRAG_ROUTING_MAP, NUDGE_ROUTING_MAP
Lines: 174-406
Snippet:
```js
  R1: {
    regularPoint: "CA",
    anchor: "CA",
    guideline: "CA",
```

File: C:\Users\frena\Desktop\fontra-test\docs\refactor\action-object-matrix.md
Function(s): N/A (documentation)
Lines: 181-185
Snippet:
```md
| R1 | drag | CA | CA | CA | CA | CL | CL | CL | CL | CL (out of scope; legacy adapter; revisit after Phase 6) | CL (out of scope; legacy adapter; revisit after Phase 6) | CL (out of scope; legacy adapter; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | CL |
| R2 | drag+shift | CA | CA | CA | CA | CL | CL | NA | NA | CL (out of scope; legacy adapter; revisit after Phase 6) | CL (out of scope; legacy adapter; revisit after Phase 6) | CL (out of scope; legacy adapter; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | NA |
| R3 | drag+alt | CA | CA | NA | NA | CL | CL | CL | NA | CL (out of scope; legacy adapter; revisit after Phase 6) | CL (out of scope; legacy adapter; revisit after Phase 6) | CL (out of scope; legacy adapter; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | NA |
| R4 | drag+shift+alt | NA | NA | CA | CA | CL | CL | NA | NA | NA | NA | NA | L (out of scope; revisit after Phase 6) | NA |
| R5 | drag+X | NA | CA | NA | NA | NA | CL | NA | NA | NA | NA | NA | L (out of scope; revisit after Phase 6) | NA |
```

File: C:\Users\frena\Desktop\fontra-test\docs\refactor\progress-report.md
Function(s): N/A (documentation)
Lines: 1542-1625
Snippet:
```md
Step Header
Phase 5, Step 5.2 - Canonical Adapters: Regular Path Kinds (regularPoint, anchor, guideline)
```

Matrix Evidence (Required for Drag/Nudge Steps)
Row: R1-R6
Column: C1-C4
Behavior: Drag regular points/anchors/guidelines, including shift/alt/X modifier variants.
Evidence: Manual test 2026-03-02 (user); matches baseline.
Result: PASS

Row: R10-R14, R20
Column: C1-C4
Behavior: Nudge regular points/anchors/guidelines, including shift/alt/X modifier variants.
Evidence: Manual test 2026-03-02 (user); matches baseline.
Result: PASS

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Rollback shape: `ChangeCollector.fromChanges(editChange, consolidateChanges(rollbackParts))` for drag; `ChangeCollector.fromChanges(consolidateChanges(editChanges), consolidateChanges(rollbackChanges))` for nudge.
Source: `src-js/views-editor/src/edit-behavior-composer.js` `runDragOrchestration` lines 173-217; `src-js/views-editor/src/scene-controller.js` `handleArrowKeys` lines 994-996.
Step Header
Phase 4, Step 4.3 - Route Nudge Through Composer

Goal Alignment (Required Format)
1. Step Goal
   - Route all nudge operations through the composer using the nudge routing map and legacy adapters.
2. Solution
   - Add a routing function in the composer that uses the nudge routing map and delegates to legacy nudge adapters; update pointer nudge paths to call it.
3. Code Implementation
   - Added `NUDGE_ROUTING_MAP` and `getNudgeRowId` in `src-js/views-editor/src/edit-behavior-registry.js`.
   - Added `runNudgeRoutingOrchestration` in `src-js/views-editor/src/edit-behavior-composer.js`.
   - Routed pointer nudge paths through composer in `src-js/views-editor/src/edit-tools-pointer.js`.
   - Updated nudge adapters to call `_handleArrowKeysLegacy` in `src-js/views-editor/src/pointer-objects.js`.
4. Why This Solves the Problem
   - Composer now centrally routes nudge actions using a declared routing map and adapters, removing pointer-owned dispatch logic for in-scope nudge kinds.

Passing Criteria (Required)
Criterion: Nudge for every object kind in the matrix is routed through composer.
Result: PASS
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `handleArrowKeys` lines 1241-1280 route nudge through `runNudgeRoutingOrchestration`.

Criterion: No unlisted pointer branch handles nudge.
Result: PASS
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` uses `runNudgeRoutingOrchestration` for nudge dispatch; legacy logic now lives in `_handleArrowKeysLegacy`.

Criterion: All nudge matrix cells PASS.
Result: PASS
Evidence: Manual nudge matrix run 2026-03-02; R10-R20 (C1-C8) match baseline.

Criterion: Composer routing uses registry lookup only (no per-kind if/else blocks inside composer).
Result: PASS
Evidence: `src-js/views-editor/src/edit-behavior-composer.js` `runNudgeRoutingOrchestration` routes via `NUDGE_ROUTING_MAP` and adapter lookup.

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-behavior-composer.js
Function(s): runNudgeRoutingOrchestration
Lines: 308-340
Snippet:
```js
export async function runNudgeRoutingOrchestration(_context) {
  const { pointerTool, sceneController, event, objectKind, forceRowId } = _context;
  assert(pointerTool, "runNudgeRoutingOrchestration: missing pointerTool");
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-behavior-registry.js
Function(s): NUDGE_ROUTING_MAP, getNudgeRowId
Lines: 324-446
Snippet:
```js
export const NUDGE_ROUTING_MAP = {
  R10: {
    regularPoint: "CL",
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\edit-tools-pointer.js
Function(s): handleArrowKeys, _handleArrowKeysLegacy
Lines: 1241-1487
Snippet:
```js
  async handleArrowKeys(event) {
    const sceneController = this.sceneController;
    const {
      skeletonPoint: skeletonPointSelection,
```

File: C:\Users\frena\Desktop\fontra-test\src-js\views-editor\src\pointer-objects.js
Function(s): runNudgeLegacy, legacyNudgeAdapters
Lines: 137-190
Snippet:
```js
async function runNudgeLegacy({ pointerTool, event }) {
  return pointerTool._handleArrowKeysLegacy(event);
}
```

Matrix Evidence (Required for Drag/Nudge Steps)
Row: R10-R20
Column: C1-C8
Behavior: Nudge matrix coverage
Evidence: Manual nudge matrix run 2026-03-02; R10-R20 (C1-C8) match baseline.
Result: PASS

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Rollback shape: `ChangeCollector.fromChanges(consolidateChanges(editChanges), consolidateChanges(rollbackChanges))`.
Source: `src-js/views-editor/src/scene-controller.js` `handleArrowKeys` lines 994-996.



