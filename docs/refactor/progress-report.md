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














