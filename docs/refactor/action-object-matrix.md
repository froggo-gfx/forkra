# Action/Object Matrix

Date: 2026-02-27
Status: Draft

## Actions (Step 0.1)
Tag meaning: [in-scope] = current refactor scope (drag/nudge pipeline and their modifiers). [out-of-scope] = documented only; no refactor work planned.

**Pointer Gestures (non `action.*`)**
- [in-scope] Drag selection (mouse drag on selection). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDrag` line 1480; `PointerTool.handleDragSelection` line 2417.
- [in-scope] Nudge selection (arrow keys). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` line 1230.
- [out-of-scope] Hover selection (mouse move). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleHover` line 1041.
- [out-of-scope] Single-click selection update (click/shift/alt add/subtract). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDrag` lines 1981-2003.
- [out-of-scope] Rect select (drag on empty). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleRectSelect` line 2382.
- [out-of-scope] Double-click (selection behavior and point toggles). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDoubleClick` line 2045; `PointerTool.handlePointsDoubleClick` line 2127; `PointerTool._handleSkeletonPointsDoubleClick` line 2140; `PointerTool._handleSkeletonSegmentDoubleClick` line 2346.
- [out-of-scope] Transform selection via bounds handles (scale/rotate). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDrag` lines 1676-1687; `PointerTool.handleBoundsTransformSelection` line 6079.

**Modifier Variants (Drag/Nudge)**
- [in-scope] Drag + Shift (behavior preset: constrain). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` line 7200; `PointerTool.handleDragSelection` line 2490.
- [in-scope] Drag + Alt (behavior preset: alternate). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` line 7200; `PointerTool.handleDragSelection` line 2490.
- [in-scope] Drag + Shift+Alt (behavior preset: alternate-constrain). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` line 7200; `PointerTool.handleDragSelection` line 2490.
- [in-scope] Drag + X (equalize handles mode). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDrag` lines 1832-1844.
- [in-scope] Drag + Z (rib tangent constraint). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragEditableGeneratedPoints` lines 4005-4007.
- [in-scope] Drag + D (fixed rib). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDragSelection` lines 2679-2689.
- [in-scope] Drag + S (fixed rib compress). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDragSelection` lines 2679-2689.
- [in-scope] Nudge + Shift (10x delta). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1245-1251.
- [in-scope] Nudge + Shift+Ctrl/Meta (100x delta). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1245-1249.
- [in-scope] Nudge + X (equalize handles mode). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1254-1261; lines 1410-1424.
- [in-scope] Nudge + D/S (fixed rib / compress). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1280-1307.

**Registered Actions (editor.js)**
- [out-of-scope] `action.undo`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 312.
- [out-of-scope] `action.redo`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 319.
- [out-of-scope] `action.cut`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 326.
- [out-of-scope] `action.copy`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 332.
- [out-of-scope] `action.paste`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 338.
- [out-of-scope] `action.delete`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 344.
- [out-of-scope] `action.select-all`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 351.
- [out-of-scope] `action.select-none`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 357.
- [out-of-scope] `action.add-component`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 365.
- [out-of-scope] `action.add-anchor`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 372.
- [out-of-scope] `action.add-guideline`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 379.
- [out-of-scope] `action.add-guideline-between-points`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 386.
- [out-of-scope] `action.lock-guideline`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 404.

- [out-of-scope] `action.zoom-in`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 416.
- [out-of-scope] `action.zoom-out`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 418.
- [out-of-scope] `action.zoom-fit-selection`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 420.
- [out-of-scope] `action.select-previous-source`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 440.
- [out-of-scope] `action.select-next-source`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 450.
- [out-of-scope] `action.select-previous-source-layer`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 460.
- [out-of-scope] `action.select-next-source-layer`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 470.
- [out-of-scope] `action.select-previous-glyph`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 480.
- [out-of-scope] `action.select-next-glyph`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 490.
- [out-of-scope] `action.replace-selected-glyph-on-canvas`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 500.
- [out-of-scope] `action.remove-selected-glyph-from-canvas`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 514.
- [out-of-scope] `action.add-glyph-before-selected-glyph`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 523.
- [out-of-scope] `action.add-glyph-after-selected-glyph`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 537.

- [out-of-scope] `action.glyph.add-background-image`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 554.

- [out-of-scope] `action.sidebars.toggle.${panelIdentifier}` (generated per sidebar). Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 581.
- [out-of-scope] `actions.tools.${toolIdentifier}` (generated per tool). Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 604.

- [out-of-scope] `action.realtime.measure` (Q). Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 620; `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleKeyDown` line 900; `PointerTool.handleHover` line 1041.
- [out-of-scope] `action.realtime.measure-direct` (Alt+Q). Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 628; `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleKeyDown` line 900; `PointerTool._handleMeasureAltKeyDown` line 985.
- [in-scope] `action.realtime.equalize` (X). Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 636; `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleKeyDown` line 924.
- [in-scope] `action.realtime.rib-tangent` (Z). Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 644; `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleKeyDown` line 932.
- [in-scope] `action.realtime.fixed-rib` (D). Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 652; `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleKeyDown` line 940.
- [in-scope] `action.realtime.fixed-rib-compress` (S). Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 660; `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleKeyDown` line 948.

- [out-of-scope] `action.canvas.clean-view-and-hand-tool`. Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 670.
- [out-of-scope] `actions.glyph-editor-appearance.${layerDef.identifier}` (generated per visualization layer). Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActions` line 696.
- [out-of-scope] `action.find-glyphs-that-use` (conditional). Evidence: `src-js/views-editor/src/editor.js` `EditorController.initActionsAfterStart` line 713.
