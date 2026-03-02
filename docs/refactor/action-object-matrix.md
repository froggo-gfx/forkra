# Action/Object Matrix

Date: 2026-02-27
Status: Draft

## Actions (Step 0.1)
Tag meaning: [in-scope] = current refactor scope (drag/nudge pipeline and their modifiers). [out-of-scope] = documented only; no refactor work planned.

**Pointer Gestures (non `action.*`)**
- [in-scope] Drag selection (mouse drag on selection). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDrag` line 1480; `PointerTool.handleDragSelection` line 2417.
- [in-scope] Nudge selection (arrow keys). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` line 1230.
- [out-of-scope] Hover selection (mouse move). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleHover` lines 1041-1223.
- [out-of-scope] Single-click selection update (click/shift/alt add/subtract). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDrag` lines 1981-2003.
- [out-of-scope] Rect select (drag on empty). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleRectSelect` line 2382.
- [out-of-scope] Double-click (selection behavior and point toggles). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDoubleClick` line 2045; `PointerTool.handlePointsDoubleClick` line 2127; `PointerTool._handleSkeletonPointsDoubleClick` line 2140; `PointerTool._handleSkeletonSegmentDoubleClick` line 2346.
- [out-of-scope] Transform selection via bounds handles (scale/rotate). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDrag` lines 1676-1687; `PointerTool.handleBoundsTransformSelection` line 6079.

**Modifier Variants (Drag/Nudge)**
- [in-scope] Drag + Shift (behavior preset: constrain). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` line 7200; `PointerTool.handleDragSelection` line 2490.
- [in-scope] Drag + Alt (behavior preset: alternate). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` line 7200; `PointerTool.handleDragSelection` line 2490.
- [in-scope] Drag + Shift+Alt (behavior preset: alternate-constrain). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` line 7200; `PointerTool.handleDragSelection` line 2490.
- [in-scope] Drag + X (equalize handles mode). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDrag` lines 1832-1844.
- [in-scope] Drag + X + Shift (equalize + constrain). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDragSelection` lines 2620-2637; `PointerTool._handleEqualizeHandlesDragForPath` lines 5776-5783.
- [in-scope] Drag + Z (rib tangent constraint; requires editable flag). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragEditableGeneratedPoints` lines 4005-4007.
- [in-scope] Drag + D (fixed rib). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDragSelection` lines 2679-2689.
- [in-scope] Drag + S (fixed rib compress). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDragSelection` lines 2679-2689.
- [in-scope] Nudge + Shift (10x delta). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1245-1251.
- [out-of-scope] Nudge + Shift+Ctrl/Meta (100x delta). Excluded from matrix tracking (decision 2026-03-02). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1245-1249.
- [in-scope] Nudge + X (equalize handles mode). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1254-1261; lines 1410-1424.
- [in-scope] Nudge + X + Shift (equalize + constrain). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1410-1417; lines 1254-1261.
- [out-of-scope] Nudge + X + Shift+Ctrl/Meta (equalize + 100x). Excluded from matrix tracking (decision 2026-03-02). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1410-1414; lines 1254-1261.
- [in-scope] Nudge + Z (rib tangent constraint; requires editable flag). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleArrowKeysForRibPoints` lines 4593-4683.
- [in-scope] Nudge + Z + Shift (rib tangent 10x; requires editable flag). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleArrowKeysForRibPoints` lines 4593-4605.
- [in-scope] Nudge + Alt (alternate behavior / rib interpolation). Evidence: `src-js/views-editor/src/scene-controller.js` `SceneController.handleArrowKeys` lines 949-979; `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1321-1327; `PointerTool._handleArrowKeysForRibPoints` lines 4603-4660.
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
NOTE: This key is parseable but drag/nudge behavior is reached via point selection (derived editable rib state). Step 0.3 treats it as a specificity of `point`/`skeletonRibPoint`.

**Measure Mode (Selection-Only)**
- measurePoint [selection-only] - format: `measurePoint/index`. Evidence: `src-js/views-editor/src/scene-model.js` `pointSelectionAtPoint` lines 699-703.

**Background Image**
- backgroundImage - format: `backgroundImage/0`. Evidence: `src-js/views-editor/src/scene-model.js` `_backgroundImageSelectionAtPointOrRect` lines 1482-1502.

Note: Tunni points are non-selection drag targets and are not selection keys. They must be tracked in the drag routing map.

## Action x Object Matrix (Step 0.3)
Tag meaning: Yes = handled directly by the `edit-behavior.js` behavior table. No = modifier has no defined action for this object kind (falls back to base action or is ignored). Specificity = supported with conditions or special logic outside the behavior table.

**Column Definitions (in-scope objects only)**
| Column ID | Object Kind | Notes |
|---|---|---|
| C1 | Regular On-Curve | `point` selection; on-curve determined by `point.type` |
| C2 | Regular Off-Curve | `point` selection; off-curve determined by `point.type` |
| C3 | Anchor | |
| C4 | Guideline | |
| C5 | Skeleton On-Curve | `skeletonPoint` selection; on-curve determined by `point.type` |
| C6 | Skeleton Off-Curve | `skeletonPoint` selection; off-curve determined by `point.type` |
| C7 | Rib On-Curve | `skeletonRibPoint` and editable generated points (on-curve) |
| C8 | Rib Off-Curve | editable generated handles (off-curve) |

**Row Definitions (in-scope actions only)**
| Row ID | Action | Notes |
|---|---|---|
| R1 | drag | |
| R2 | drag+shift | constrain |
| R3 | drag+alt | alternate |
| R4 | drag+shift+alt | alternate-constrain |
| R5 | drag+X | equalize |
| R6 | drag+X+shift | equalize + constrain |
| R7 | drag+Z | rib tangent constraint; requires editable flag |
| R8 | drag+D | fixed rib |
| R9 | drag+S | fixed rib compress |
| R10 | nudge | |
| R11 | nudge+shift | 10x |
| R13 | nudge+X | equalize |
| R14 | nudge+X+shift | equalize + constrain |
| R16 | nudge+D | fixed rib |
| R17 | nudge+S | fixed rib compress |
| R18 | nudge+Z | rib tangent; requires editable flag |
| R19 | nudge+Z+shift | rib tangent + 10x; requires editable flag |
| R20 | nudge+alt | alternate / rib interpolation |

**Matrix (Yes/No/Specificity)**
| Row ID | Action | C1 Regular On-Curve | C2 Regular Off-Curve | C3 Anchor | C4 Guideline | C5 Skeleton On-Curve | C6 Skeleton Off-Curve | C7 Rib On-Curve | C8 Rib Off-Curve |
|---|---|---|---|---|---|---|---|---|---|
| R1 | drag | Yes | Yes | Yes | Yes | Specificity | Specificity | Specificity | Specificity |
| R2 | drag+shift | Yes | Yes | Yes | Yes | Specificity | Specificity | No | No |
| R3 | drag+alt | Yes | Yes | No | No | Specificity | Specificity | Specificity | No |
| R4 | drag+shift+alt | No | No | Yes | Yes | Specificity | Specificity | No | No |
| R5 | drag+X | No | Specificity | No | No | No | Specificity | No | No |
| R6 | drag+X+shift | No | Specificity | No | No | No | Specificity | No | No |
| R7 | drag+Z | No | No | No | No | No | No | Specificity | No |
| R8 | drag+D | No | No | No | No | Specificity | No | No | No |
| R9 | drag+S | No | No | No | No | Specificity | No | No | No |
| R10 | nudge | Yes | Yes | Yes | Yes | Specificity | Specificity | Specificity | Specificity |
| R11 | nudge+shift | Yes | Yes | Yes | Yes | Specificity | Specificity | Specificity | Specificity |
| R13 | nudge+X | No | Specificity | No | No | No | Specificity | No | No |
| R14 | nudge+X+shift | No | Specificity | No | No | No | Specificity | No | No |
| R16 | nudge+D | No | No | No | No | Specificity | No | No | No |
| R17 | nudge+S | No | No | No | No | Specificity | No | No | No |
| R18 | nudge+Z | No | No | No | No | No | No | Specificity | No |
| R19 | nudge+Z+shift | No | No | No | No | No | No | Specificity | No |
| R20 | nudge+alt | Yes | Yes | Yes | Yes | Specificity | Specificity | Specificity | Specificity |

## Drag Routing Map (Step 3.1)
Routing values:
- `CL` = composer + legacy adapter
- `CA` = composer + canonical adapter
- `L` = legacy (handled in pointer; reason + removal step required)
- `NA` = not supported (No in baseline matrix)

Out-of-scope drag targets remain on legacy adapters when marked `CL`; `L` indicates pointer-only legacy routing.

| Row ID | Action | C1 Regular On-Curve | C2 Regular Off-Curve | C3 Anchor | C4 Guideline | C5 Skeleton On-Curve | C6 Skeleton Off-Curve | C7 Rib On-Curve | C8 Rib Off-Curve | component | componentOrigin | componentTCenter | backgroundImage | Tunni (non-selection) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 | drag | CA | CA | CA | CA | CA | CA | CA | CA | CL (out of scope; legacy adapter; revisit after Phase 6) | CL (out of scope; legacy adapter; revisit after Phase 6) | CL (out of scope; legacy adapter; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | CL |
| R2 | drag+shift | CA | CA | CA | CA | CA | CA | NA | NA | CL (out of scope; legacy adapter; revisit after Phase 6) | CL (out of scope; legacy adapter; revisit after Phase 6) | CL (out of scope; legacy adapter; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | NA |
| R3 | drag+alt | CA | CA | NA | NA | CA | CA | CA | NA | CL (out of scope; legacy adapter; revisit after Phase 6) | CL (out of scope; legacy adapter; revisit after Phase 6) | CL (out of scope; legacy adapter; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | NA |
| R4 | drag+shift+alt | NA | NA | CA | CA | CA | CA | NA | NA | NA | NA | NA | L (out of scope; revisit after Phase 6) | NA |
| R5 | drag+X | NA | CA | NA | NA | NA | CA | NA | NA | NA | NA | NA | L (out of scope; revisit after Phase 6) | NA |
| R6 | drag+X+shift | NA | CA | NA | NA | NA | CA | NA | NA | NA | NA | NA | L (out of scope; revisit after Phase 6) | NA |
| R7 | drag+Z | NA | NA | NA | NA | NA | NA | CA | NA | NA | NA | NA | L (out of scope; revisit after Phase 6) | NA |
| R8 | drag+D | NA | NA | NA | NA | CA | NA | NA | NA | NA | NA | NA | L (out of scope; revisit after Phase 6) | NA |
| R9 | drag+S | NA | NA | NA | NA | CA | NA | NA | NA | NA | NA | NA | L (out of scope; revisit after Phase 6) | NA |

## Nudge Routing Map (Step 4.1)
Routing values:
- `CL` = composer + legacy adapter
- `CA` = composer + canonical adapter
- `L` = legacy (handled in pointer; reason + removal step required)
- `NA` = not supported (No in baseline matrix)

Out-of-scope nudge targets remain on legacy routing when marked `L`.

| Row ID | Action | C1 Regular On-Curve | C2 Regular Off-Curve | C3 Anchor | C4 Guideline | C5 Skeleton On-Curve | C6 Skeleton Off-Curve | C7 Rib On-Curve | C8 Rib Off-Curve | component | componentOrigin | componentTCenter | backgroundImage |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R10 | nudge | CA | CA | CA | CA | CA | CA | CA | CA | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) |
| R11 | nudge+shift | CA | CA | CA | CA | CA | CA | CA | CA | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) |
| R13 | nudge+X | NA | CA | NA | NA | NA | CA | NA | NA | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) |
| R14 | nudge+X+shift | NA | CA | NA | NA | NA | CA | NA | NA | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) |
| R16 | nudge+D | NA | NA | NA | NA | CA | NA | NA | NA | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) |
| R17 | nudge+S | NA | NA | NA | NA | CA | NA | NA | NA | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) |
| R18 | nudge+Z | NA | NA | NA | NA | NA | NA | CA | NA | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) |
| R19 | nudge+Z+shift | NA | NA | NA | NA | NA | NA | CA | NA | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) |
| R20 | nudge+alt | CA | CA | CA | CA | CA | CA | CA | CA | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) | L (out of scope; revisit after Phase 6) |

**Target Matrix (Intended State)**
| Row ID | Action | C1 Regular On-Curve | C2 Regular Off-Curve | C3 Anchor | C4 Guideline | C5 Skeleton On-Curve | C6 Skeleton Off-Curve | C7 Rib On-Curve | C8 Rib Off-Curve |
|---|---|---|---|---|---|---|---|---|---|
| R1 | drag | Yes | Yes | Yes | Yes | Yes | Yes | Specificity | Specificity |
| R2 | drag+shift | Yes | Yes | Yes | Yes | Yes | Yes | No | No |
| R3 | drag+alt | Yes | Yes | No | No | Yes | Yes | Specificity | No |
| R4 | drag+shift+alt | No | No | Yes | Yes | Yes | Yes | No | No |
| R5 | drag+X | No | Specificity | No | No | No | Specificity | No | No |
| R6 | drag+X+shift | No | Specificity | No | No | No | Specificity | No | No |
| R7 | drag+Z | No | No | No | No | No | No | Specificity | No |
| R8 | drag+D | No | No | No | No | Specificity | No | No | No |
| R9 | drag+S | No | No | No | No | Specificity | No | No | No |
| R10 | nudge | Yes | Yes | Yes | Yes | Yes | Yes | Specificity | Specificity |
| R11 | nudge+shift | Yes | Yes | Yes | Yes | Yes | Yes | Specificity | Specificity |
| R13 | nudge+X | No | Specificity | No | No | No | Specificity | No | No |
| R14 | nudge+X+shift | No | Specificity | No | No | No | Specificity | No | No |
| R16 | nudge+D | No | No | No | No | Specificity | No | No | No |
| R17 | nudge+S | No | No | No | No | Specificity | No | No | No |
| R18 | nudge+Z | No | No | No | No | No | No | Specificity | No |
| R19 | nudge+Z+shift | No | No | No | No | No | No | Specificity | No |
| R20 | nudge+alt | Yes | Yes | Yes | Yes | Yes | Yes | Specificity | Specificity |

**Delta vs Baseline**
- R1/C5-C6: Baseline = Specificity. Intended = Yes (skeleton drag should use the shared behavior table).
- R2/C5-C6: Baseline = Specificity. Intended = Yes (skeleton drag+shift should use the shared behavior table).
- R3/C5-C6: Baseline = Specificity. Intended = Yes (skeleton drag+alt should use the shared behavior table).
- R4/C5-C6: Baseline = Specificity. Intended = Yes (skeleton drag+shift+alt should use the shared behavior table).
- R10/C5-C6: Baseline = Specificity. Intended = Yes (skeleton nudge should use the shared behavior table).
- R11/C5-C6: Baseline = Specificity. Intended = Yes (skeleton nudge+shift should use the shared behavior table).
- R20/C5-C6: Baseline = Specificity. Intended = Yes (skeleton nudge+alt should use the shared behavior table).
**Yes/Specificity Intersections (list all entries below the matrix)**
Each entry must include: Row ID(s), Column ID(s), plain language description, code snippet (5-10 lines), file/function + exact line numbers, and PASS/FAIL.
If behavior is identical across multiple columns, list them together (e.g., C1-C2).

R1/C1-C2 (regular on-curve + regular off-curve, drag) - Yes  
Behavior: Regular points use EditBehaviorFactory; on/off distinction is handled by edit-behavior rules via point.type.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDragSelection` lines 2504-2522; `src-js/views-editor/src/edit-behavior.js` `EditBehaviorFactory` lines 74-87.  
Snippet:
```js
const relevantComponentIndices = unionIndexSets(
  componentSelection,
  componentOriginSelection,
  componentTCenterSelection
);
this.contours = unpackContours(instance.path, pointSelection || []);
this.components = unpackComponents(instance.components, relevantComponentIndices);
this.anchors = unpackAnchors(instance.anchors, anchorSelection || []);
this.guidelines = unpackGuidelines(instance.guidelines, guidelineSelection || []);
```
Result: PASS (manual test 2026-03-02)

R1/C3 (anchor, drag) - Yes  
Behavior: Drag uses EditBehaviorFactory; anchors are included via parseSelection in the factory.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDragSelection` lines 2504-2522; `src-js/views-editor/src/edit-behavior.js` `EditBehaviorFactory` lines 74-87.  
Snippet:
```js
const relevantComponentIndices = unionIndexSets(
  componentSelection,
  componentOriginSelection,
  componentTCenterSelection
);
this.contours = unpackContours(instance.path, pointSelection || []);
this.components = unpackComponents(instance.components, relevantComponentIndices);
this.anchors = unpackAnchors(instance.anchors, anchorSelection || []);
this.guidelines = unpackGuidelines(instance.guidelines, guidelineSelection || []);
```
Result: PASS (manual test 2026-03-02)

R1/C4 (guideline, drag) - Yes  
Behavior: Drag uses EditBehaviorFactory; guidelines are included via parseSelection in the factory.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDragSelection` lines 2504-2522; `src-js/views-editor/src/edit-behavior.js` `EditBehaviorFactory` lines 74-87.  
Snippet:
```js
const relevantComponentIndices = unionIndexSets(
  componentSelection,
  componentOriginSelection,
  componentTCenterSelection
);
this.contours = unpackContours(instance.path, pointSelection || []);
this.components = unpackComponents(instance.components, relevantComponentIndices);
this.anchors = unpackAnchors(instance.anchors, anchorSelection || []);
this.guidelines = unpackGuidelines(instance.guidelines, guidelineSelection || []);
```
Result: PASS (manual test 2026-03-02)

R1/C5-C6 (skeleton on-curve + skeleton off-curve, drag) - Specificity  
Behavior: Skeleton drag uses skeleton edit behavior system (separate from edit-behavior); selection includes on-curve and off-curve skeleton points.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragSkeletonPoints` lines 2995-3007; `src-js/views-editor/src/scene-model.js` `skeletonPointSelectionAtPoint` lines 1021-1055.  
Snippet:
```js
let lastBehaviorName = getSkeletonBehaviorName(
  initialEvent.shiftKey,
  initialEvent.altKey
);
for (const data of Object.values(layersData)) {
  data.behaviors = createSkeletonEditBehavior(
    data.original,
    selectedSkeletonPoints,
    lastBehaviorName
  );
}
```
Result: PASS (manual test 2026-03-02)

R1/C7 (rib on-curve, drag) - Specificity  
Behavior: Constraint along the rib (normal to skeleton contour; movement follows the rib direction). Multi-select applies per rib: each rib moves along its own normal (outward/inward relative to its side).
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDragSelection` lines 2448-2466; `PointerTool._handleDragRibPoint` lines 3287-3295.  
Snippet:
```js
const allTargetsEditable = targetPoints.every((tp) => tp.isEditable);
const belongsToSingleSegment = this._selectedRibTargetsBelongToSingleSegment(
  targetPoints,
  skeletonDataForCheck
);
const movementAllowed =
  hasSkeletonSelection || allTargetsEditable || belongsToSingleSegment;
if (!movementAllowed) {
  return;
}
```
Result: PASS (manual test 2026-03-02)

R1/C8 (rib off-curve, drag) - Specificity  
Behavior: Requires editable flag. Handle angle is fixed by the skeleton handle direction (basic rib-handle property). Detached mode uses absolute offsets; non-detached uses directional offsets.
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDragSelection` lines 2463-2466; `PointerTool._handleDragEditableGeneratedHandles` lines 4141-4158.  
Snippet:
```js
const skeletonHandleDir = this._getSkeletonHandleDirForPoint(
  contour, eh.skeletonPointIndex, eh.handleType
);
if (!skeletonHandleDir) {
  continue;
}
```
Result: PASS (manual test 2026-03-02)

R2/C1-C2 (regular on-curve + regular off-curve, drag+shift) - Yes  
Behavior: Shift selects constrain behavior via getBehaviorName.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` lines 7200-7202; `PointerTool.handleDragSelection` line 2490.  
Snippet:
```js
function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}
```
Result: PASS (manual test 2026-03-02)

R2/C3 (anchor, drag+shift) - Yes  
Behavior: Shift selects constrain behavior via getBehaviorName; anchors are included via EditBehaviorFactory.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` lines 7200-7202; `src-js/views-editor/src/edit-behavior.js` `EditBehaviorFactory` lines 74-87.  
Snippet:
```js
function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}
```
Result: PASS (manual test 2026-03-02)

R2/C4 (guideline, drag+shift) - Yes  
Behavior: Shift selects constrain behavior via getBehaviorName; guidelines are included via EditBehaviorFactory.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` lines 7200-7202; `src-js/views-editor/src/edit-behavior.js` `EditBehaviorFactory` lines 74-87.  
Snippet:
```js
function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}
```
Result: PASS (manual test 2026-03-02)

R2/C5-C6 (skeleton on-curve + skeleton off-curve, drag+shift) - Specificity  
Behavior: Shift modifies skeleton behavior preset via getSkeletonBehaviorName.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragSkeletonPoints` lines 3066-3074.  
Snippet:
```js
const behaviorName = getSkeletonBehaviorName(event.shiftKey, event.altKey);
if (behaviorName !== lastBehaviorName) {
  lastBehaviorName = behaviorName;
  for (const data of Object.values(layersData)) {
    data.behaviors = createSkeletonEditBehavior(
      data.original,
      selectedSkeletonPoints,
      behaviorName
    );
  }
}
```
Result: PASS (manual test 2026-03-02)

R3/C1-C2 (regular on-curve + regular off-curve, drag+alt) - Yes  
Behavior: Alt selects alternate behavior via getBehaviorName.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` lines 7200-7202; `PointerTool.handleDragSelection` line 2490.  
Snippet:
```js
function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}
```
Result: PASS (manual test 2026-03-02)

R3/C5-C6 (skeleton on-curve + skeleton off-curve, drag+alt) - Specificity  
Behavior: Alt modifies skeleton behavior preset via getSkeletonBehaviorName.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragSkeletonPoints` lines 3066-3074.  
Snippet:
```js
const behaviorName = getSkeletonBehaviorName(event.shiftKey, event.altKey);
if (behaviorName !== lastBehaviorName) {
  lastBehaviorName = behaviorName;
  for (const data of Object.values(layersData)) {
    data.behaviors = createSkeletonEditBehavior(
      data.original,
      selectedSkeletonPoints,
      behaviorName
    );
  }
}
```
Result: PASS (manual test 2026-03-02)

R3/C7 (rib on-curve, drag+alt) - Specificity  
Behavior: Requires Editable flag. Apart from that gating, behavior follows the shared behavior table (Alt selects the alternate preset; no extra rib-specific math).
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragRibPoint` lines 3201-3205.  
Snippet:
```js
if (!positionedGlyph) return;
const useInterpolation = initialEvent.altKey;
// Get initial point in glyph coordinates
const localPoint = sceneController.localPoint(initialEvent);
```
Result: PASS (manual test 2026-03-02)

R4/C3 (anchor, drag+shift+alt) - Yes  
Behavior: Alt does not change anchor behavior; same as drag+shift (constrain).  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` lines 7200-7202; `src-js/views-editor/src/edit-behavior.js` `EditBehaviorFactory` lines 74-87.  
Snippet:
```js
function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}
```
Result: PASS (manual test 2026-03-02)

R4/C4 (guideline, drag+shift+alt) - Yes  
Behavior: Alt does not change guideline behavior; same as drag+shift (constrain).  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` lines 7200-7202; `src-js/views-editor/src/edit-behavior.js` `EditBehaviorFactory` lines 74-87.  
Snippet:
```js
function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}
```
Result: PASS (manual test 2026-03-02)

R4/C5-C6 (skeleton on-curve + skeleton off-curve, drag+shift+alt) - Specificity  
Behavior: Shift+Alt modifies skeleton behavior preset via getSkeletonBehaviorName.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragSkeletonPoints` lines 3066-3074.  
Snippet:
```js
const behaviorName = getSkeletonBehaviorName(event.shiftKey, event.altKey);
if (behaviorName !== lastBehaviorName) {
  lastBehaviorName = behaviorName;
  for (const data of Object.values(layersData)) {
    data.behaviors = createSkeletonEditBehavior(
      data.original,
      selectedSkeletonPoints,
      behaviorName
    );
  }
}
```
Result: PASS (manual test 2026-03-02)

R5/C2 (regular off-curve, drag+X) - Specificity  
Behavior: Equalize handles during drag when equalizeMode is active and a valid handle pair is found.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDragSelection` lines 2620-2636.  
Snippet:
```js
if (this.equalizeMode && equalizeHandleInfo && positionedGlyph) {
  const { pointIndex, smoothIndex, oppositeIndex } = equalizeHandleInfo;
  const currentGlyphPoint = {
    x: currentPoint.x - positionedGlyph.x,
    y: currentPoint.y - positionedGlyph.y,
  };
```
Result: PASS (manual test 2026-03-02)

R5/C6 (skeleton off-curve, drag+X) - Specificity  
Behavior: Equalize skeleton handles for off-curve points; shift can constrain drag.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleEqualizeHandlesDrag` lines 5679-5687.  
Snippet:
```js
let newDragVec = {
  x: currentGlyphPoint.x - smoothPt.x,
  y: currentGlyphPoint.y - smoothPt.y,
};
if (event.shiftKey) {
  newDragVec = constrainHorVerDiag(newDragVec);
}
```
Result: PASS (manual test 2026-03-02)

R6/C2 (regular off-curve, drag+X+shift) - Specificity  
Behavior: Equalize handles with shift-constrained vector.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleEqualizeHandlesDragForPath` lines 5776-5783.  
Snippet:
```js
let newDragVec = {
  x: currentGlyphPoint.x - smoothPt.x,
  y: currentGlyphPoint.y - smoothPt.y,
};
if (event.shiftKey) {
  newDragVec = constrainHorVerDiag(newDragVec);
}
```
Result: PASS (manual test 2026-03-02)

R6/C6 (skeleton off-curve, drag+X+shift) - Specificity  
Behavior: Equalize skeleton handles with shift-constrained vector.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleEqualizeHandlesDrag` lines 5680-5687.  
Snippet:
```js
let newDragVec = {
  x: currentGlyphPoint.x - smoothPt.x,
  y: currentGlyphPoint.y - smoothPt.y,
};
if (event.shiftKey) {
  newDragVec = constrainHorVerDiag(newDragVec);
}
```
Result: PASS (manual test 2026-03-02)

R7/C7 (rib on-curve, drag+Z) - Specificity  
Behavior: Requires Editable flag; Z constrains rib drag to tangent.
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragEditableGeneratedPoints` lines 4003-4007.  
Snippet:
```js
const delta = vector.subVectors(currentGlyphPoint, startGlyphPoint);
// Determine constraint mode based on Z hold
// Z: constrain to tangent direction (only nudge changes)
const constrainMode = this.tangentRibMode ? "tangent" : null;
```
Result: PASS (manual test 2026-03-02)

R8/C5 (skeleton on-curve, drag+D) - Specificity  
Behavior: Fixed rib mode applies a constrained drag via applyFixedRibDragToSkeletonData.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragSkeletonPoints` lines 3096-3104.  
Snippet:
```js
const appliedFixedRib = this.fixedRibMode || this.fixedRibCompressMode
  ? applyFixedRibDragToSkeletonData(
      original,
      working,
      selectedSkeletonPoints,
      initialClickedSkeletonPoint,
      delta,
      roundFunc,
      {
        anchorToDragSide: this.fixedRibCompressMode,
```
Result: PASS (manual test 2026-03-02)

R9/C5 (skeleton on-curve, drag+S) - Specificity  
Behavior: Fixed rib compress mode applies constrained drag with anchorToDragSide enabled.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragSkeletonPoints` lines 3096-3104.  
Snippet:
```js
const appliedFixedRib = this.fixedRibMode || this.fixedRibCompressMode
  ? applyFixedRibDragToSkeletonData(
      original,
      working,
      selectedSkeletonPoints,
      initialClickedSkeletonPoint,
      delta,
      roundFunc,
      {
        anchorToDragSide: this.fixedRibCompressMode,
```
Result: PASS (manual test 2026-03-02)

R10/C1-C2 (regular on-curve + regular off-curve, nudge) - Yes  
Behavior: Nudge uses EditBehaviorFactory for current selection (regular points included).  
Evidence: `src-js/views-editor/src/scene-controller.js` `SceneController.handleArrowKeys` lines 962-970.  
Snippet:
```js
const layerInfo = Object.entries(
  this.getEditingLayerFromGlyphLayers(glyph.layers)
).map(([layerName, layerGlyph]) => {
  const behaviorFactory = new EditBehaviorFactory(
    layerGlyph,
    this.selection,
    this.selectedTool.scalingEditBehavior
  );
```
Result: PASS (manual test 2026-03-02)

R10/C3 (anchor, nudge) - Yes  
Behavior: Nudge uses EditBehaviorFactory for current selection (anchors included).  
Evidence: `src-js/views-editor/src/scene-controller.js` `SceneController.handleArrowKeys` lines 962-970.  
Snippet:
```js
const layerInfo = Object.entries(
  this.getEditingLayerFromGlyphLayers(glyph.layers)
).map(([layerName, layerGlyph]) => {
  const behaviorFactory = new EditBehaviorFactory(
    layerGlyph,
    this.selection,
    this.selectedTool.scalingEditBehavior
  );
```
Result: PASS (manual test 2026-03-02)

R10/C4 (guideline, nudge) - Yes  
Behavior: Nudge uses EditBehaviorFactory for current selection (guidelines included).  
Evidence: `src-js/views-editor/src/scene-controller.js` `SceneController.handleArrowKeys` lines 962-970.  
Snippet:
```js
const layerInfo = Object.entries(
  this.getEditingLayerFromGlyphLayers(glyph.layers)
).map(([layerName, layerGlyph]) => {
  const behaviorFactory = new EditBehaviorFactory(
    layerGlyph,
    this.selection,
    this.selectedTool.scalingEditBehavior
  );
```
Result: PASS (manual test 2026-03-02)

R10/C5-C6 (skeleton on-curve + skeleton off-curve, nudge) - Specificity  
Behavior: Skeleton point nudge is handled by pointer with skeleton data edits (separate from edit-behavior).  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1241-1252.  
Snippet:
```js
if (hasSkeletonPoints) {
  let [dx, dy] = arrowKeyDeltas[event.key];
  if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
    dx *= 100;
    dy *= 100;
  } else if (event.shiftKey) {
    dx *= 10;
    dy *= 10;
  }
```
Result: PASS (manual test 2026-03-02)

R10/C7 (rib on-curve, nudge) - Specificity  
Behavior: Constraint along the rib (normal to skeleton contour). Multi-select applies per rib: each rib moves along its own normal (outward/inward relative to its side).
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleArrowKeysForRibPoints` lines 4549-4556.  
Snippet:
```js
const allTargetsEditable = ribPointsInfo.every((ribInfo) => ribInfo.isEditable);
const belongsToSingleSegment = this._selectedRibTargetsBelongToSingleSegment(
  ribPointsInfo,
  skeletonData
);
if (!allTargetsEditable && !belongsToSingleSegment) {
  return;
}
```
Result: PASS (manual test 2026-03-02)

R10/C8 (rib off-curve, nudge) - Specificity  
Behavior: Requires editable flag. Handle angle is fixed by the skeleton handle direction (basic rib-handle property). Detached mode uses absolute offsets; non-detached uses directional offsets.
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleArrowKeysForEditableHandles` lines 4317-4339.  
Snippet:
```js
let [dx, dy] = arrowKeyDeltas[event.key];
if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
  dx *= 100;
  dy *= 100;
} else if (event.shiftKey) {
  dx *= 10;
  dy *= 10;
}
const delta = { x: dx, y: dy };
```
Result: PASS (manual test 2026-03-02)

R11/C1-C2 (regular on-curve + regular off-curve, nudge+shift) - Yes  
Behavior: Shift scales nudge delta in SceneController.handleArrowKeys.  
Evidence: `src-js/views-editor/src/scene-controller.js` `SceneController.handleArrowKeys` lines 952-958.  
Snippet:
```js
let [dx, dy] = arrowKeyDeltas[event.key];
if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
  dx *= 100;
  dy *= 100;
} else if (event.shiftKey) {
  dx *= 10;
  dy *= 10;
}
```
Result: PASS (manual test 2026-03-02)

R11/C3 (anchor, nudge+shift) - Yes  
Behavior: Shift scales nudge delta in SceneController.handleArrowKeys.  
Evidence: `src-js/views-editor/src/scene-controller.js` `SceneController.handleArrowKeys` lines 952-958.  
Snippet:
```js
let [dx, dy] = arrowKeyDeltas[event.key];
if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
  dx *= 100;
  dy *= 100;
} else if (event.shiftKey) {
  dx *= 10;
  dy *= 10;
}
```
Result: PASS (manual test 2026-03-02)

R11/C4 (guideline, nudge+shift) - Yes  
Behavior: Shift scales nudge delta in SceneController.handleArrowKeys.  
Evidence: `src-js/views-editor/src/scene-controller.js` `SceneController.handleArrowKeys` lines 952-958.  
Snippet:
```js
let [dx, dy] = arrowKeyDeltas[event.key];
if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
  dx *= 100;
  dy *= 100;
} else if (event.shiftKey) {
  dx *= 10;
  dy *= 10;
}
```
Result: PASS (manual test 2026-03-02)

R11/C5-C6 (skeleton on-curve + skeleton off-curve, nudge+shift) - Specificity  
Behavior: Shift scales delta for skeleton nudge.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1244-1250.  
Snippet:
```js
let [dx, dy] = arrowKeyDeltas[event.key];
if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
  dx *= 100;
  dy *= 100;
} else if (event.shiftKey) {
  dx *= 10;
  dy *= 10;
}
```
Result: PASS (manual test 2026-03-02)

R11/C7 (rib on-curve, nudge+shift) - Specificity  
Behavior: Shift scales rib nudge delta 10x; rib constraints still apply.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleArrowKeysForRibPoints` lines 4558-4565.  
Snippet:
```js
let [dx, dy] = arrowKeyDeltas[event.key];
if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
  dx *= 100;
  dy *= 100;
} else if (event.shiftKey) {
  dx *= 10;
  dy *= 10;
}
```
Result: PASS (manual test 2026-03-02)

R11/C8 (rib off-curve, nudge+shift) - Specificity  
Behavior: Requires editable flag. Shift scales editable handle nudge delta 10x; handle constraints still apply.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleArrowKeysForEditableHandles` lines 4317-4333.  
Snippet:
```js
let [dx, dy] = arrowKeyDeltas[event.key];
if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
  dx *= 100;
  dy *= 100;
} else if (event.shiftKey) {
  dx *= 10;
  dy *= 10;
}
const delta = { x: dx, y: dy };
```
Result: PASS (manual test 2026-03-02)

R13/C2 (regular off-curve, nudge+X) - Specificity  
Behavior: Equalize path handles on arrow keys when equalizeMode is active.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `_handleArrowKeysForEqualizePathHandles` lines 5501-5507.  
Snippet:
```js
async _handleArrowKeysForEqualizePathHandles(delta, pointSelection) {
  const sceneController = this.sceneController;
  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph?.glyph?.path) return false;
  const basePath = positionedGlyph.glyph.path;
```
Result: PASS (manual test 2026-03-02)

R13/C6 (skeleton off-curve, nudge+X) - Specificity  
Behavior: Equalize skeleton handles on arrow keys when equalizeMode is active.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleArrowKeysForEqualizeSkeletonHandles` lines 5402-5417.  
Snippet:
```js
if (this.equalizeMode) {
  const handled = await this._handleArrowKeysForEqualizeSkeletonHandles(
    delta,
    skeletonPointSelection
  );
  if (handled) {
    return;
  }
}
```
Result: PASS (manual test 2026-03-02)

R14/C2 (regular off-curve, nudge+X+shift) - Specificity  
Behavior: Equalize path handles with shift-scaled delta.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1410-1417.  
Snippet:
```js
if (hasRegularPoints && this.equalizeMode) {
  let [dx, dy] = arrowKeyDeltas[event.key];
  if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
    dx *= 100;
    dy *= 100;
  } else if (event.shiftKey) {
    dx *= 10;
    dy *= 10;
  }
```
Result: PASS (manual test 2026-03-02)

R14/C6 (skeleton off-curve, nudge+X+shift) - Specificity  
Behavior: Equalize skeleton handles with shift-scaled delta.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1244-1258.  
Snippet:
```js
let [dx, dy] = arrowKeyDeltas[event.key];
if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
  dx *= 100;
  dy *= 100;
} else if (event.shiftKey) {
  dx *= 10;
  dy *= 10;
}
const delta = { x: dx, y: dy };
```
Result: PASS (manual test 2026-03-02)

R16/C5 (skeleton on-curve, nudge+D) - Specificity  
Behavior: Fixed rib nudge uses applyFixedRibDragToSkeletonData when fixedRibMode is active.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1295-1304.  
Snippet:
```js
if (clickedSkeletonPoint) {
  appliedFixedRib = applyFixedRibDragToSkeletonData(
    originalSkeletonData,
    workingSkeletonData,
    skeletonPointSelection,
    clickedSkeletonPoint,
    delta,
    roundFunc,
    {
      anchorToDragSide: this.fixedRibCompressMode,
```
Result: PASS (manual test 2026-03-02)

R17/C5 (skeleton on-curve, nudge+S) - Specificity  
Behavior: Fixed rib compress nudge uses applyFixedRibDragToSkeletonData with anchorToDragSide enabled.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1295-1304.  
Snippet:
```js
if (clickedSkeletonPoint) {
  appliedFixedRib = applyFixedRibDragToSkeletonData(
    originalSkeletonData,
    workingSkeletonData,
    skeletonPointSelection,
    clickedSkeletonPoint,
    delta,
    roundFunc,
    {
      anchorToDragSide: this.fixedRibCompressMode,
```
Result: PASS (manual test 2026-03-02)

R18/C7 (rib on-curve, nudge+Z) - Specificity  
Behavior: Requires editable flag. Tangent rib mode constrains nudges to the tangent direction (nudge only).  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleArrowKeysForRibPoints` lines 4603-4683.  
Snippet:
```js
const useTangentConstraint = this.tangentRibMode;
const constrainMode = useTangentConstraint ? "tangent" : null;
...
const change = behavior.applyDelta(delta, constrainMode);
```
Result: PASS (manual test 2026-03-02)

R19/C7 (rib on-curve, nudge+Z+shift) - Specificity  
Behavior: Requires editable flag. Tangent rib nudge uses the 10x delta when Shift is held.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleArrowKeysForRibPoints` lines 4593-4605.  
Snippet:
```js
let [dx, dy] = arrowKeyDeltas[event.key];
if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
  dx *= 100;
  dy *= 100;
} else if (event.shiftKey) {
  dx *= 10;
  dy *= 10;
}
```
Result: PASS (manual test 2026-03-02)

R20/C1 (regular on-curve, nudge+alt) - Yes  
Behavior: Alt uses the alternate behavior preset for regular points during nudge.  
Evidence: `src-js/views-editor/src/scene-controller.js` `SceneController.handleArrowKeys` lines 949-979.  
Snippet:
```js
editBehavior: behaviorFactory.getBehavior(
  event.altKey ? "alternate" : "default"
),
```
Result: PASS (manual test 2026-03-02)

R20/C2 (regular off-curve, nudge+alt) - Yes  
Behavior: Alt uses the alternate behavior preset for regular off-curve points during nudge.  
Evidence: `src-js/views-editor/src/scene-controller.js` `SceneController.handleArrowKeys` lines 949-979.  
Snippet:
```js
editBehavior: behaviorFactory.getBehavior(
  event.altKey ? "alternate" : "default"
),
```
Result: PASS (manual test 2026-03-02)

R20/C3 (anchor, nudge+alt) - Yes  
Behavior: Alt uses the alternate behavior preset for anchors during nudge.  
Evidence: `src-js/views-editor/src/scene-controller.js` `SceneController.handleArrowKeys` lines 949-979.  
Snippet:
```js
editBehavior: behaviorFactory.getBehavior(
  event.altKey ? "alternate" : "default"
),
```
Result: PASS (manual test 2026-03-02)

R20/C4 (guideline, nudge+alt) - Yes  
Behavior: Alt uses the alternate behavior preset for guidelines during nudge.  
Evidence: `src-js/views-editor/src/scene-controller.js` `SceneController.handleArrowKeys` lines 949-979.  
Snippet:
```js
editBehavior: behaviorFactory.getBehavior(
  event.altKey ? "alternate" : "default"
),
```
Result: PASS (manual test 2026-03-02)

R20/C5 (skeleton on-curve, nudge+alt) - Specificity  
Behavior: Skeleton nudge uses alternate skeleton behavior when Alt is held.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1321-1327.  
Snippet:
```js
const behaviorName = getSkeletonBehaviorName(false, event.altKey);
const behaviors = createSkeletonEditBehavior(
  originalSkeletonData,
  skeletonPointSelection,
  behaviorName
);
```
Result: PASS (manual test 2026-03-02)

R20/C6 (skeleton off-curve, nudge+alt) - Specificity  
Behavior: Skeleton off-curve nudge uses alternate skeleton behavior when Alt is held.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1321-1327.  
Snippet:
```js
const behaviorName = getSkeletonBehaviorName(false, event.altKey);
const behaviors = createSkeletonEditBehavior(
  originalSkeletonData,
  skeletonPointSelection,
  behaviorName
);
```
Result: PASS (manual test 2026-03-02)

R20/C7 (rib on-curve, nudge+alt) - Specificity  
Behavior: Alt engages interpolation behavior for editable ribs (falls back to editable if no axis).  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleArrowKeysForRibPoints` lines 4603-4660.  
Snippet:
```js
const useInterpolation = event.altKey;
...
if (interpolationAxis) {
  behavior = createInterpolatingRibBehavior(
    originalSkeletonData,
    ribHit,
    interpolationAxis
  );
}
```
Result: PASS (manual test 2026-03-02)

R20/C8 (rib off-curve, nudge+alt) - Specificity  
Behavior: Editable generated handle nudge remains constrained to the skeleton handle direction (alt does not change behavior).  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleArrowKeysForEditableHandles` lines 4352-4410.  
Snippet:
```js
const change = behavior.applyDelta(delta);
...
point[offsetKey] = change.offset;
```
Result: PASS (manual test 2026-03-02)




