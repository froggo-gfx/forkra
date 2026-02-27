# Progress Report

Date: 2026-02-27
Status: Draft

Step Header
Phase 0, Step 0.1 - Action Catalog

Goal Alignment (Required Format)
1. Step Goal
   - Create a complete, action-only list of user actions to prevent ad-hoc combinations.
2. Solution
   - Document all pointer/editor actions in a single Actions section, tagged in-scope/out-of-scope, with inline evidence.
3. Code Implementation
   - Added Actions section in `docs/refactor/action-object-matrix.md` with pointer gestures and editor-registered actions.
4. Why This Solves the Problem
   - A single, evidenced list is the required baseline for the matrix and prevents missing or implicit actions later.

Passing Criteria (Required)
Criterion: Every user-facing action that exists in pointer/editor bindings is listed.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 9-61 list all pointer gestures and editor-registered actions; verified against `src-js/views-editor/src/editor.js` lines 312-713 and `src-js/views-editor/src/edit-tools-pointer.js` lines 1041, 1230, 1480, 2045, 2382, 2417.

Criterion: No object kinds appear in the Actions section.
Result: PASS
Evidence: `docs/refactor/action-object-matrix.md` lines 6-61 contain only actions and tags; no object-kind names are present.

Scope Boundary (Required)
I did not change behavior outside this step. PASS
I did not add new math unless the step explicitly allows it. PASS

Code Evidence (Required)
File: C:\Users\frena\Desktop\fontra-test\docs\refactor\action-object-matrix.md
Function(s): N/A (documentation)
Lines: 6-16
Snippet:
```md
## Actions (Step 0.1)
Tag meaning: [in-scope] = current refactor scope (drag/nudge pipeline and their modifiers). [out-of-scope] = documented only; no refactor work planned.

**Pointer Gestures (non `action.*`)**
- [in-scope] Drag selection (mouse drag on selection). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDrag` line 1480; `PointerTool.handleDragSelection` line 2417.
- [in-scope] Nudge selection (arrow keys). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` line 1230.
- [out-of-scope] Hover selection (mouse move). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleHover` line 1041.
- [out-of-scope] Single-click selection update (click/shift/alt add/subtract). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDrag` lines 1981-2003.
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
Phase 0, Step 0.1 - Action Catalog
```

Matrix Evidence (Required for Drag/Nudge Steps)
Not applicable.

Undo/Redo Evidence (Required for Drag/Nudge Steps)
Not applicable.
