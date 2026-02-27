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
- [in-scope] Drag + Z (rib tangent constraint). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragEditableGeneratedPoints` lines 4005-4007.
- [in-scope] Drag + D (fixed rib). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDragSelection` lines 2679-2689.
- [in-scope] Drag + S (fixed rib compress). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDragSelection` lines 2679-2689.
- [in-scope] Nudge + Shift (10x delta). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1245-1251.
- [in-scope] Nudge + Shift+Ctrl/Meta (100x delta). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1245-1249.
- [in-scope] Nudge + X (equalize handles mode). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1254-1261; lines 1410-1424.
- [in-scope] Nudge + X + Shift (equalize + constrain). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1410-1417; lines 1254-1261.
- [in-scope] Nudge + X + Shift+Ctrl/Meta (equalize + 100x). Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1410-1414; lines 1254-1261.
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
Tag meaning: Yes = supported; No = not supported; Specificity = supported with constraints listed below.

**Columns (in-scope objects only)**
- C1: point
- C2: anchor
- C3: guideline
- C4: skeletonPoint
- C5: skeletonRibPoint

**Rows (in-scope actions only)**
- R1: drag
- R2: drag+shift (constrain)
- R3: drag+alt (alternate)
- R4: drag+shift+alt (alternate-constrain)
- R5: drag+X (equalize)
- R6: drag+X+shift (equalize + constrain)
- R7: drag+Z (rib tangent constraint)
- R8: drag+D (fixed rib)
- R9: drag+S (fixed rib compress)
- R10: nudge
- R11: nudge+shift (10x)
- R12: nudge+shift+ctrl/meta (100x)
- R13: nudge+X (equalize)
- R14: nudge+X+shift (equalize + constrain)
- R15: nudge+X+shift+ctrl/meta (equalize + 100x)
- R16: nudge+D (fixed rib)
- R17: nudge+S (fixed rib compress)

**Matrix (Yes/No/Specificity)**
| Row \ Col | C1 point | C2 anchor | C3 guideline | C4 skeletonPoint | C5 skeletonRibPoint |
|---|---|---|---|---|---|
| R1 drag | Specificity | Yes | Yes | Yes | Specificity |
| R2 drag+shift | Specificity | Yes | Yes | Yes | Specificity |
| R3 drag+alt | Specificity | Yes | Yes | Yes | Specificity |
| R4 drag+shift+alt | Specificity | Yes | Yes | Yes | Specificity |
| R5 drag+X | Specificity | No | No | Specificity | No |
| R6 drag+X+shift | Specificity | No | No | Specificity | No |
| R7 drag+Z | Specificity | No | No | No | No |
| R8 drag+D | No | No | No | Specificity | No |
| R9 drag+S | No | No | No | Specificity | No |
| R10 nudge | Specificity | Yes | Yes | Yes | Specificity |
| R11 nudge+shift | Specificity | Yes | Yes | Yes | Specificity |
| R12 nudge+shift+ctrl/meta | Specificity | Yes | Yes | Yes | Specificity |
| R13 nudge+X | Specificity | No | No | Specificity | No |
| R14 nudge+X+shift | Specificity | No | No | Specificity | No |
| R15 nudge+X+shift+ctrl/meta | Specificity | No | No | Specificity | No |
| R16 nudge+D | No | No | No | Specificity | No |
| R17 nudge+S | No | No | No | Specificity | No |

**Yes/Specificity Intersections (list all entries below the matrix)**
Each entry must include: Row ID, Column ID, plain language description, code snippet (5-10 lines), file/function + exact line numbers, and PASS/FAIL.

R1/C1 (point, drag) - Specificity  
Behavior: Regular points use EditBehavior; if selection resolves to editable generated points or handles, route to dedicated rib handlers.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleDragSelection` lines 2448-2470; lines 2504-2522.  
Snippet:
```js
if (pointSelection?.length > 0) {
  const editableGenerated = this._getEditableGeneratedPointsFromSelection(pointSelection);
  if (editableGenerated.length > 0 && !hasSkeletonSelection) {
    await this._handleDragEditableGeneratedPoints(
      eventStream,
      initialEvent,
      editableGenerated
    );
```
Result: FAIL (not tested)


R1/C2 (anchor, drag) - Yes  
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
Result: FAIL (not tested)

R1/C3 (guideline, drag) - Yes  
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
Result: FAIL (not tested)

R1/C4 (skeletonPoint, drag) - Yes  
Behavior: Drag uses skeleton edit behaviors created from modifier-driven preset.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragSkeletonPoints` lines 2995-3007.  
Snippet:
```js
let lastBehaviorName = getSkeletonBehaviorName(
  initialEvent.shiftKey,
  initialEvent.altKey
);

// Create initial behaviors for each layer
for (const data of Object.values(layersData)) {
  data.behaviors = createSkeletonEditBehavior(
    data.original,
    selectedSkeletonPoints,
    lastBehaviorName
  );
```
Result: FAIL (not tested)

R1/C5 (skeletonRibPoint, drag) - Specificity  
Behavior: Drag is allowed only when ribs are editable or belong to a single segment.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragRibPoint` lines 3287-3295.  
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
Result: FAIL (not tested)

R2/C1 (point, drag+shift) - Specificity  
Behavior: Shift selects constrain behavior for regular points; editable generated points/handles still route to special handlers.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` lines 7200-7202; `PointerTool.handleDragSelection` lines 2448-2466.  
Snippet:
```js
function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}

function replace(setA, setB) {
```
Result: FAIL (not tested)

R2/C2 (anchor, drag+shift) - Yes  
Behavior: Shift selects constrain behavior via getBehaviorName; anchors are included via EditBehaviorFactory.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` lines 7200-7202; `src-js/views-editor/src/edit-behavior.js` `EditBehaviorFactory` lines 74-87.  
Snippet:
```js
function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}

function replace(setA, setB) {
```
Result: FAIL (not tested)

R2/C3 (guideline, drag+shift) - Yes  
Behavior: Shift selects constrain behavior via getBehaviorName; guidelines are included via EditBehaviorFactory.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` lines 7200-7202; `src-js/views-editor/src/edit-behavior.js` `EditBehaviorFactory` lines 74-87.  
Snippet:
```js
function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}

function replace(setA, setB) {
```
Result: FAIL (not tested)

R2/C4 (skeletonPoint, drag+shift) - Yes  
Behavior: Shift modifies skeleton behavior preset via getSkeletonBehaviorName.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragSkeletonPoints` lines 3066-3074.  
Snippet:
```js
const behaviorName = getSkeletonBehaviorName(event.shiftKey, event.altKey);

// Recreate behaviors if behavior changed (shift or alt state changed)
if (behaviorName !== lastBehaviorName) {
  lastBehaviorName = behaviorName;
  for (const data of Object.values(layersData)) {
    data.behaviors = createSkeletonEditBehavior(
      data.original,
      selectedSkeletonPoints,
      behaviorName
    );
```
Result: FAIL (not tested)

R2/C5 (skeletonRibPoint, drag+shift) - Specificity  
Behavior: Shift has no special effect; rib drag still uses rib handler with movement constraints.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragRibPoint` lines 3287-3295.  
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
Result: FAIL (not tested)

R3/C1 (point, drag+alt) - Specificity  
Behavior: Alt selects alternate behavior for regular points; editable generated points use interpolating rib behavior when possible.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` lines 7200-7202; `_handleDragEditableGeneratedPoints` lines 3971-3979.  
Snippet:
```js
let behavior;
if (useInterpolation && ep.interpolationAxis) {
  behavior = createInterpolatingRibBehavior(
    data.original,
    ribHit,
    ep.interpolationAxis
  );
} else {
  behavior = createEditableRibBehavior(data.original, ribHit);
}
```
Result: FAIL (not tested)

R3/C2 (anchor, drag+alt) - Yes  
Behavior: Alt selects alternate behavior via getBehaviorName; anchors are included via EditBehaviorFactory.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` lines 7200-7202; `src-js/views-editor/src/edit-behavior.js` `EditBehaviorFactory` lines 74-87.  
Snippet:
```js
function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}

function replace(setA, setB) {
```
Result: FAIL (not tested)

R3/C3 (guideline, drag+alt) - Yes  
Behavior: Alt selects alternate behavior via getBehaviorName; guidelines are included via EditBehaviorFactory.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` lines 7200-7202; `src-js/views-editor/src/edit-behavior.js` `EditBehaviorFactory` lines 74-87.  
Snippet:
```js
function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}

function replace(setA, setB) {
```
Result: FAIL (not tested)

R3/C4 (skeletonPoint, drag+alt) - Yes  
Behavior: Alt modifies skeleton behavior preset via getSkeletonBehaviorName.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragSkeletonPoints` lines 3066-3074.  
Snippet:
```js
const behaviorName = getSkeletonBehaviorName(event.shiftKey, event.altKey);

// Recreate behaviors if behavior changed (shift or alt state changed)
if (behaviorName !== lastBehaviorName) {
  lastBehaviorName = behaviorName;
  for (const data of Object.values(layersData)) {
    data.behaviors = createSkeletonEditBehavior(
      data.original,
      selectedSkeletonPoints,
      behaviorName
    );
```
Result: FAIL (not tested)

R3/C5 (skeletonRibPoint, drag+alt) - Specificity  
Behavior: Alt enables interpolation in rib drag.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragRibPoint` lines 3201-3205.  
Snippet:
```js
if (!positionedGlyph) return;

const useInterpolation = initialEvent.altKey;

// Get initial point in glyph coordinates
const localPoint = sceneController.localPoint(initialEvent);
```
Result: FAIL (not tested)

R4/C1 (point, drag+shift+alt) - Specificity  
Behavior: Shift+Alt selects alternate-constrain for regular points; editable generated points still use alt interpolation (shift ignored).  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` lines 7200-7202; `_handleDragEditableGeneratedPoints` lines 3911-3912.  
Snippet:
```js
function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}

function replace(setA, setB) {
```
Result: FAIL (not tested)

R4/C2 (anchor, drag+shift+alt) - Yes  
Behavior: Shift+Alt selects alternate-constrain via getBehaviorName; anchors are included via EditBehaviorFactory.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` lines 7200-7202; `src-js/views-editor/src/edit-behavior.js` `EditBehaviorFactory` lines 74-87.  
Snippet:
```js
function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}

function replace(setA, setB) {
```
Result: FAIL (not tested)

R4/C3 (guideline, drag+shift+alt) - Yes  
Behavior: Shift+Alt selects alternate-constrain via getBehaviorName; guidelines are included via EditBehaviorFactory.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `getBehaviorName` lines 7200-7202; `src-js/views-editor/src/edit-behavior.js` `EditBehaviorFactory` lines 74-87.  
Snippet:
```js
function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}

function replace(setA, setB) {
```
Result: FAIL (not tested)

R4/C4 (skeletonPoint, drag+shift+alt) - Yes  
Behavior: Shift+Alt modifies skeleton behavior preset via getSkeletonBehaviorName.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragSkeletonPoints` lines 3066-3074.  
Snippet:
```js
const behaviorName = getSkeletonBehaviorName(event.shiftKey, event.altKey);

// Recreate behaviors if behavior changed (shift or alt state changed)
if (behaviorName !== lastBehaviorName) {
  lastBehaviorName = behaviorName;
  for (const data of Object.values(layersData)) {
    data.behaviors = createSkeletonEditBehavior(
      data.original,
      selectedSkeletonPoints,
      behaviorName
    );
```
Result: FAIL (not tested)

R4/C5 (skeletonRibPoint, drag+shift+alt) - Specificity  
Behavior: Alt enables interpolation in rib drag; shift has no special effect.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragRibPoint` lines 3201-3205.  
Snippet:
```js
if (!positionedGlyph) return;

const useInterpolation = initialEvent.altKey;

// Get initial point in glyph coordinates
const localPoint = sceneController.localPoint(initialEvent);
```
Result: FAIL (not tested)

R5/C1 (point, drag+X) - Specificity  
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
  for (const layer of layerInfo) {
    const path = layer.layerGlyph.path;
```
Result: FAIL (not tested)

R5/C4 (skeletonPoint, drag+X) - Specificity  
Behavior: Equalize skeleton handles for off-curve points; shift can constrain drag.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleEqualizeHandlesDrag` lines 5679-5687.  
Snippet:
```js
let newDragVec = {
  x: currentGlyphPoint.x - smoothPt.x,
  y: currentGlyphPoint.y - smoothPt.y,
};

// Shift constrains to horizontal/vertical/45-degree
if (event.shiftKey) {
  newDragVec = constrainHorVerDiag(newDragVec);
}
```
Result: FAIL (not tested)

R6/C1 (point, drag+X+shift) - Specificity  
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
Result: FAIL (not tested)

R6/C4 (skeletonPoint, drag+X+shift) - Specificity  
Behavior: Equalize skeleton handles with shift-constrained vector.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleEqualizeHandlesDrag` lines 5680-5687.  
Snippet:
```js
let newDragVec = {
  x: currentGlyphPoint.x - smoothPt.x,
  y: currentGlyphPoint.y - smoothPt.y,
};

// Shift constrains to horizontal/vertical/45-degree
if (event.shiftKey) {
  newDragVec = constrainHorVerDiag(newDragVec);
}
```
Result: FAIL (not tested)

R7/C1 (point, drag+Z) - Specificity  
Behavior: Z constrains editable generated points to tangent (nudge-only change).  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleDragEditableGeneratedPoints` lines 4003-4007.  
Snippet:
```js
const delta = vector.subVectors(currentGlyphPoint, startGlyphPoint);

// Determine constraint mode based on Z hold
// Z: constrain to tangent direction (only nudge changes)
const constrainMode = this.tangentRibMode ? "tangent" : null;
```
Result: FAIL (not tested)

R8/C4 (skeletonPoint, drag+D) - Specificity  
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
Result: FAIL (not tested)

R9/C4 (skeletonPoint, drag+S) - Specificity  
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
Result: FAIL (not tested)

R10/C1 (point, nudge) - Specificity  
Behavior: If editable generated handles are selected, use dedicated nudge handler; otherwise equalize path handles may intercept before fallback.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1400-1423; lines 1429-1430.  
Snippet:
```js
// Check if any selected points are editable handles (from skeleton contours)
// These need special handling: movement constrained to skeleton handle direction
if (hasRegularPoints) {
  const editableHandles = this._getEditableGeneratedHandlesFromSelection(regularPointSelection);
  if (editableHandles.length > 0) {
    await this._handleArrowKeysForEditableHandles(event, editableHandles);
    return;
  }
}
```
Result: FAIL (not tested)

R10/C2 (anchor, nudge) - Yes  
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
Result: FAIL (not tested)

R10/C3 (guideline, nudge) - Yes  
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
Result: FAIL (not tested)

R10/C4 (skeletonPoint, nudge) - Yes  
Behavior: Skeleton point nudge is handled by pointer with skeleton data edits.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1241-1252.  
Snippet:
```js
// Handle skeleton point nudging (highest priority)
if (hasSkeletonPoints) {
  // Handle skeleton point nudging (combined with regular points in one editGlyph)
  let [dx, dy] = arrowKeyDeltas[event.key];
  if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
    dx *= 100;
    dy *= 100;
  } else if (event.shiftKey) {
    dx *= 10;
    dy *= 10;
  }
```
Result: FAIL (not tested)

R10/C5 (skeletonRibPoint, nudge) - Specificity  
Behavior: Rib nudge requires editable ribs or single-segment selection.  
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
Result: FAIL (not tested)

R11/C1 (point, nudge+shift) - Specificity  
Behavior: Shift scales nudge delta; editable handles/equalize can still intercept.  
Evidence: `src-js/views-editor/src/scene-controller.js` `SceneController.handleArrowKeys` lines 952-958; `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1400-1407.  
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
Result: FAIL (not tested)

R11/C2 (anchor, nudge+shift) - Yes  
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
Result: FAIL (not tested)

R11/C3 (guideline, nudge+shift) - Yes  
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
Result: FAIL (not tested)

R11/C4 (skeletonPoint, nudge+shift) - Yes  
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
Result: FAIL (not tested)

R11/C5 (skeletonRibPoint, nudge+shift) - Specificity  
Behavior: Shift scales rib nudge delta.  
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
Result: FAIL (not tested)

R12/C1 (point, nudge+shift+ctrl/meta) - Specificity  
Behavior: Shift+Ctrl/Meta scales nudge delta 100x; editable handles/equalize can still intercept.  
Evidence: `src-js/views-editor/src/scene-controller.js` `SceneController.handleArrowKeys` lines 952-955; `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1400-1407.  
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
Result: FAIL (not tested)

R12/C2 (anchor, nudge+shift+ctrl/meta) - Yes  
Behavior: Shift+Ctrl/Meta scales nudge delta 100x in SceneController.handleArrowKeys.  
Evidence: `src-js/views-editor/src/scene-controller.js` `SceneController.handleArrowKeys` lines 952-955.  
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
Result: FAIL (not tested)

R12/C3 (guideline, nudge+shift+ctrl/meta) - Yes  
Behavior: Shift+Ctrl/Meta scales nudge delta 100x in SceneController.handleArrowKeys.  
Evidence: `src-js/views-editor/src/scene-controller.js` `SceneController.handleArrowKeys` lines 952-955.  
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
Result: FAIL (not tested)

R12/C4 (skeletonPoint, nudge+shift+ctrl/meta) - Yes  
Behavior: Shift+Ctrl/Meta scales delta 100x for skeleton nudge.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1245-1247.  
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
Result: FAIL (not tested)

R12/C5 (skeletonRibPoint, nudge+shift+ctrl/meta) - Specificity  
Behavior: Shift+Ctrl/Meta scales rib nudge delta 100x.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool._handleArrowKeysForRibPoints` lines 4560-4563.  
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
Result: FAIL (not tested)

R13/C1 (point, nudge+X) - Specificity  
Behavior: Equalize path handles on arrow keys when equalizeMode is active.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1410-1422; `_handleArrowKeysForEqualizePathHandles` lines 5501-5507.  
Snippet:
```js
async _handleArrowKeysForEqualizePathHandles(delta, pointSelection) {
  const sceneController = this.sceneController;
  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph?.glyph?.path) return false;

  const basePath = positionedGlyph.glyph.path;
  const equalizeTargets = [];
```
Result: FAIL (not tested)

R13/C4 (skeletonPoint, nudge+X) - Specificity  
Behavior: Equalize skeleton handles on arrow keys when equalizeMode is active.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1254-1258; `_handleArrowKeysForEqualizeSkeletonHandles` lines 5402-5417.  
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
Result: FAIL (not tested)

R14/C1 (point, nudge+X+shift) - Specificity  
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
  const delta = { x: dx, y: dy };
```
Result: FAIL (not tested)

R14/C4 (skeletonPoint, nudge+X+shift) - Specificity  
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

// X+arrows: nudge selected off-curve skeleton handles and equalize
if (this.equalizeMode) {
```
Result: FAIL (not tested)

R15/C1 (point, nudge+X+shift+ctrl/meta) - Specificity  
Behavior: Equalize path handles with 100x delta.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1410-1414.  
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
Result: FAIL (not tested)

R15/C4 (skeletonPoint, nudge+X+shift+ctrl/meta) - Specificity  
Behavior: Equalize skeleton handles with 100x delta.  
Evidence: `src-js/views-editor/src/edit-tools-pointer.js` `PointerTool.handleArrowKeys` lines 1245-1258.  
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

// X+arrows: nudge selected off-curve skeleton handles and equalize
if (this.equalizeMode) {
```
Result: FAIL (not tested)

R16/C4 (skeletonPoint, nudge+D) - Specificity  
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
Result: FAIL (not tested)

R17/C4 (skeletonPoint, nudge+S) - Specificity  
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
Result: FAIL (not tested)







