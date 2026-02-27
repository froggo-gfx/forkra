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














