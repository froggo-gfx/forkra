# WS-10 - Skeleton Drawing Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated Skeleton Pen tool so users can create, append, close, and edit the centerline structure of skeleton contours from scratch.

**Architecture:** Implement a focused `edit-tools-skeleton.js` tool in `views-editor` that mirrors forkra's current Pen Tool event flow but writes only through WS-9 `editSkeleton`. The tool uses WS-6 stable ids for contour/point addressing and WS-9 scene-model skeleton hit tests where possible; donor `edit-tools-skeleton.js` is read for behavior semantics only. Generated outlines are updated by `editSkeleton`, not by direct generator or customData calls in the tool.

**Tech Stack:** ES modules under `src-js/views-editor/src`, `@fontra/core/skeleton-model.js`, WS-9 `src-js/views-editor/src/skeleton-editing.js`, existing editor tool registration in `editor.js`, localization in `src-js/fontra-core/assets/lang/*.js`, SVG tool icon under `src-js/fontra-core/assets/images`, `node --check`, `npm run bundle`, and manual editor parity checks against donor `fd76d3abe`.

---

## Global Constraints

- **Branch:** implement on `refactor-simple/ws10-skeleton-drawing-tool`, cut after WS-9 is merged.
- **Donor is read-only:** `./skeleton/` stays detached at `fd76d3abe`. Read `skeleton/src-js/views-editor/src/edit-tools-skeleton.js`; do not port its direct persistence or index-based selection plumbing.
- **Scope:** drawing tool only. Do not implement rib dragging, editable generated point/handle dragging, D/S/X/Z modifiers, Tunni, skeleton parameters panel, source defaults UI, or measure readouts.
- **One write path:** all skeleton data mutations must call WS-9 `editSkeleton(layerGlyph, mutate)`. The new tool must not import `generateFromSkeleton()`, `outlineContourToPackedPath()`, or `setSkeletonData()`.
- **Stable id selection:** selection keys are `skeletonPoint/<contourId>/<pointId>`. Do not create donor-style index selection keys.
- **Schema:** use WS-6 constructors and mutators (`makeEmptySkeletonData`, `appendSkeletonContour`, `appendSkeletonPoint`, `makeSkeletonPoint`, etc.) rather than donor flat fields.
- **Defaults:** WS-10 may use `DEFAULT_SKELETON_WIDTH` and simple cap defaults from `skeleton-model.js`. Donor source-default logic belongs to WS-15 and must not be ported here.

---

## Verified Current Context

- `src-js/views-editor/src/editor.js` imports tool classes near the top and registers top-level tools in `initTools()` via `editToolClasses`.
- Tool order determines default number shortcuts in `initActions()`; adding one top-level tool gives it the next numeric shortcut unless order is changed.
- Existing tool buttons load icons from `/images/<name>.svg`; those assets live under `src-js/fontra-core/assets/images`.
- `src-js/views-editor/src/edit-tools-pen.js` is the current drawing-tool pattern: `BaseTool`, `handleHover`, `handleDrag`, `sceneController.editGlyph`, incremental changes, and undo labels via localization.
- `src-js/views-editor/src/edit-tools-pointer.js` already delegates to the selected tool and falls back to pointer behavior when not editing.
- `src-js/fontra-core/assets/lang/en.js` contains tool labels and undo labels; other language files carry parallel keys.
- Donor `skeleton/src-js/views-editor/src/edit-tools-skeleton.js` uses `SkeletonPenTool`, direct `setSkeletonData()`, direct `regenerateSkeletonContours()`, index-based `skeletonPoint/<contourIndex>/<pointIndex>`, and source default helpers. WS-10 must re-express only behavior.

---

## File Structure

```
src-js/views-editor/src/
  edit-tools-skeleton.js                 [CREATE] SkeletonPenTool implementation
  skeleton-editing.js                    [MODIFY] allow editSkeleton to initialize missing skeleton data
  editor.js                              [MODIFY] import and register SkeletonPenTool

src-js/fontra-core/assets/images/
  skeleton-pen.svg                       [CREATE] toolbar icon, copied or simplified from donor asset

src-js/fontra-core/assets/lang/
  en.js                                  [MODIFY] English tool and undo labels
  de.js fr.js ja.js nl.js tl.js zh-CN.js zh-TW.js [MODIFY] fallback labels only if required by localization checks
```

---

## Task 1: Add the Skeleton Tool Shell and Registration

**Files:**
- Create: `src-js/views-editor/src/edit-tools-skeleton.js`
- Modify: `src-js/views-editor/src/editor.js`
- Create: `src-js/fontra-core/assets/images/skeleton-pen.svg`
- Modify: `src-js/fontra-core/assets/lang/en.js`

**Interfaces:**
- Produces `export class SkeletonPenTool extends BaseTool`.
- Tool identifier: `skeleton-pen-tool`.
- Icon path: `/images/skeleton-pen.svg`.

- [ ] **Step 1: Create the tool shell**

Create `src-js/views-editor/src/edit-tools-skeleton.js`:

```javascript
import { translate } from "@fontra/core/localization.js";
import { BaseTool } from "./edit-tools-base.js";

export class SkeletonPenTool extends BaseTool {
  iconPath = "/images/skeleton-pen.svg";
  identifier = "skeleton-pen-tool";

  handleHover(event) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      this.editor.tools["pointer-tool"].handleHover(event);
      return;
    }
    this.setCursor();
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      await this.editor.tools["pointer-tool"].handleDrag(eventStream, initialEvent);
      return;
    }
    eventStream.done();
  }

  deactivate() {
    super.deactivate();
    delete this.sceneModel.skeletonInsertHandles;
    this.sceneController.hoverSelection = new Set();
    this.canvasController.requestUpdate();
  }

  setCursor() {
    this.canvasController.canvas.style.cursor = this.sceneModel.selectedGlyph?.isEditing
      ? "crosshair"
      : "default";
  }
}
```

Remove the `translate` import if no undo labels are added in this task.

- [ ] **Step 2: Register the tool in `editor.js`**

Add:

```javascript
import { SkeletonPenTool } from "./edit-tools-skeleton.js";
```

Then insert `SkeletonPenTool` in `editToolClasses` after `PenTool`:

```javascript
const editToolClasses = [
  PointerTools,
  PenTool,
  SkeletonPenTool,
  KnifeTool,
  ShapeTool,
  MetricsTool,
  PowerRulerTool,
  HandTool,
];
```

- [ ] **Step 3: Add the icon**

Copy donor `skeleton/src-js/fontra-core/assets/images/skeleton-pen.svg` to `src-js/fontra-core/assets/images/skeleton-pen.svg`. If the donor icon is missing or unsuitable, create a simple SVG that follows existing icon style and contains no embedded raster data.

- [ ] **Step 4: Add English localization**

In `src-js/fontra-core/assets/lang/en.js`, add:

```javascript
"editor.skeleton-pen-tool": "Skeleton Pen Tool",
"edit-tools-skeleton.undo.add-point": "Add skeleton point",
"edit-tools-skeleton.undo.close-contour": "Close skeleton contour",
"edit-tools-skeleton.undo.insert-point": "Insert skeleton point",
"edit-tools-skeleton.undo.insert-handles": "Insert skeleton handles",
"edit-tools-skeleton.undo.delete-point": "Delete skeleton point",
```

Keep key order near existing `edit-tools-pen` and `editor.*tool` keys.

- [ ] **Step 5: Run syntax checks**

```bash
node --check src-js/views-editor/src/edit-tools-skeleton.js
node --check src-js/views-editor/src/editor.js
node --check src-js/fontra-core/assets/lang/en.js
```

Expected: all exit 0.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write src-js/views-editor/src/edit-tools-skeleton.js src-js/views-editor/src/editor.js src-js/fontra-core/assets/lang/en.js
git add src-js/views-editor/src/edit-tools-skeleton.js src-js/views-editor/src/editor.js src-js/fontra-core/assets/images/skeleton-pen.svg src-js/fontra-core/assets/lang/en.js
git commit -m "feat(skeleton): register skeleton drawing tool"
```

---

## Task 2: Allow `editSkeleton` to Create Missing Skeleton Data

**Files:**
- Modify: `src-js/views-editor/src/skeleton-editing.js`

**Interfaces:**
- `editSkeleton(layerGlyph, mutate, { createIfMissing = false } = {})`
- `makeEditSkeletonChange(layerGlyph, mutate, { createIfMissing = false } = {})`

- [ ] **Step 1: Add the missing-data option**

In `applySkeletonMutation()` from WS-9, replace the early return for absent skeleton data with:

```javascript
const original = getSkeletonData(layerGlyph);
if (!original && !options.createIfMissing) {
  return;
}

const working = normalizeSkeletonData(
  structuredClone(original || makeEmptySkeletonData())
);
```

Import `makeEmptySkeletonData` from `@fontra/core/skeleton-model.js`.

- [ ] **Step 2: Verify existing WS-9 behavior stays unchanged**

Search call sites:

```bash
rg -n "editSkeleton\\(|makeEditSkeletonChange\\(" src-js/views-editor/src
```

Expected: existing WS-9 editing call sites do not pass `createIfMissing`, so they keep the existing no-op behavior when no skeleton data exists. WS-10 drawing calls will pass `{ createIfMissing: true }`.

- [ ] **Step 3: Run checks and commit**

```bash
node --check src-js/views-editor/src/skeleton-editing.js
npx prettier --write src-js/views-editor/src/skeleton-editing.js
git add src-js/views-editor/src/skeleton-editing.js
git commit -m "feat(skeleton): allow creating skeleton data"
```

---

## Task 3: Add Skeleton Data Access and Id-Based Hit Helpers

**Files:**
- Modify: `src-js/views-editor/src/edit-tools-skeleton.js`

**Interfaces:**
- Consumes WS-6:
  - `getSkeletonData(layerGlyph)`
  - `makeEmptySkeletonData()`
  - `appendSkeletonContour(skeletonData, contourData)`
  - `appendSkeletonPoint(skeletonData, contourId, pointData)`
  - `makeSkeletonPoint(pointData, skeletonData)`
  - `DEFAULT_SKELETON_WIDTH`
- Consumes WS-9:
  - `editSkeleton(layerGlyph, mutate)`
  - `makeSkeletonPointKey(contourId, pointId)`
  - `parseSkeletonPointKey(key)`
  - `getSkeletonPointAddress(skeletonData, contourId, pointId)`

- [ ] **Step 1: Add imports**

Add:

```javascript
import {
  DEFAULT_SKELETON_WIDTH,
  appendSkeletonContour,
  appendSkeletonPoint,
  getSkeletonData,
  makeSkeletonPoint,
} from "@fontra/core/skeleton-model.js";
import { parseSelection } from "@fontra/core/utils.ts";
import * as vector from "@fontra/core/vector.js";
import {
  editSkeleton,
  getSkeletonPointAddress,
  makeSkeletonPointKey,
  parseSkeletonPointKey,
} from "./skeleton-editing.js";
```

- [ ] **Step 2: Add current layer helpers**

Add methods:

```javascript
_getGlyphPoint(event) {
  const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) return null;
  const point = this.sceneController.localPoint(event);
  return {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };
}
```

Use `sceneController.getEditingLayerFromGlyphLayers(glyph.layers)` inside edit operations; it returns `{ [layerName]: layerGlyph }`, which is the object passed to `editSkeleton()`.

- [ ] **Step 3: Add id-based hit test wrapper**

Use `sceneModel.selectionAtPoint()` first. If it returns a `skeletonPoint` selection, parse the key and resolve it by id. Do not duplicate index-based donor hit testing.

- [ ] **Step 4: Run checks and commit**

```bash
node --check src-js/views-editor/src/edit-tools-skeleton.js
npx prettier --write src-js/views-editor/src/edit-tools-skeleton.js
git add src-js/views-editor/src/edit-tools-skeleton.js
git commit -m "feat(skeleton): add drawing tool data helpers"
```

---

## Task 4: Create New Skeleton Contours and Append Points

**Files:**
- Modify: `src-js/views-editor/src/edit-tools-skeleton.js`

**Interfaces:**
- Click empty canvas with no active open endpoint selected: create a new open contour and first on-curve point.
- Click empty canvas with an endpoint selected: append/prepend a new on-curve point to that open contour.
- Multi-layer editing: every editable layer gets the same structural skeleton edit; if a layer lacks skeleton data, initialize from empty data.

- [ ] **Step 1: Add endpoint detection**

Add:

```javascript
_getSelectedOpenEndpoint(skeletonData) {
  const { skeletonPoint } = parseSelection(this.sceneController.selection);
  if (!skeletonPoint || skeletonPoint.size !== 1) return null;
  const { contourId, pointId } = parseSkeletonPointKey([...skeletonPoint][0]);
  const address = getSkeletonPointAddress(skeletonData, contourId, pointId);
  if (!address || address.contour.closed || address.point.type) return null;
  const onCurves = address.contour.points.filter((point) => !point.type);
  if (onCurves.length < 1) return null;
  if (onCurves[0].id === pointId) return { ...address, appendMode: "prepend" };
  if (onCurves.at(-1).id === pointId) return { ...address, appendMode: "append" };
  return null;
}
```

- [ ] **Step 2: Implement `_handleAddSkeletonPoint()`**

Inside `sceneController.editGlyph()`, loop over `sceneController.getEditingLayerFromGlyphLayers(glyph.layers)`. For each `layerGlyph`:

```javascript
const changes = editSkeleton(layerGlyph, (skeletonData) => {
  const endpoint = this._getSelectedOpenEndpoint(skeletonData);
  const pointData = { x: Math.round(glyphPoint.x), y: Math.round(glyphPoint.y), type: null, smooth: false };
  if (endpoint) {
    const point = makeSkeletonPoint(pointData, skeletonData);
    if (endpoint.appendMode === "append") endpoint.contour.points.push(point);
    else endpoint.contour.points.unshift(point);
    primarySelectionKey ??= makeSkeletonPointKey(endpoint.contour.id, point.id);
  } else {
    const contour = appendSkeletonContour(skeletonData, {
      closed: false,
      defaultWidth: DEFAULT_SKELETON_WIDTH,
      points: [],
    });
    const point = appendSkeletonPoint(skeletonData, contour.id, pointData);
    primarySelectionKey ??= makeSkeletonPointKey(contour.id, point.id);
  }
}, { createIfMissing: true });
```

Prefix each returned `changes` with `["layers", layerName, "glyph"]`, combine them with `new ChangeCollector().concat(...)`, send the combined forward change incrementally, and return the combined `ChangeCollector` with undo label `translate("edit-tools-skeleton.undo.add-point")`. Do not write customData directly here; the missing-data behavior belongs to Task 2's `createIfMissing` option.

- [ ] **Step 3: Wire `handleDrag()`**

When there is no skeleton hit and no centerline hit, call `_handleAddSkeletonPoint()`. Consume drag events without creating handles; drag-to-curve remains out of scope unless donor parity clearly requires it for simple point creation.

- [ ] **Step 4: Verify**

```bash
node --check src-js/views-editor/src/edit-tools-skeleton.js
npx prettier --write src-js/views-editor/src/edit-tools-skeleton.js
```

- [ ] **Step 5: Commit**

```bash
git add src-js/views-editor/src/edit-tools-skeleton.js
git commit -m "feat(skeleton): draw skeleton contours"
```

---

## Task 5: Close Open Skeleton Contours

**Files:**
- Modify: `src-js/views-editor/src/edit-tools-skeleton.js`

**Interfaces:**
- Clicking the opposite endpoint of the same open contour closes it.
- Selection after close is the clicked/closed endpoint by stable id.

- [ ] **Step 1: Add close detection**

When `handleDrag()` receives a skeleton point hit and there is exactly one selected skeleton endpoint, check:

```text
selected contour id === clicked contour id
selected point is first endpoint and clicked point is last endpoint, or vice versa
contour has at least two on-curve points
contour.closed === false
```

- [ ] **Step 2: Implement `_handleCloseSkeletonContour(hit)`**

Call `editSkeleton()` for every editable layer and set `contour.closed = true` for the matching contour id. Use stable id resolution per layer.

- [ ] **Step 3: Set selection and undo label**

After the edit, set:

```javascript
this.sceneController.selection = new Set([makeSkeletonPointKey(contourId, clickedPointId)]);
```

Return undo label `translate("edit-tools-skeleton.undo.close-contour")`.

- [ ] **Step 4: Run checks and commit**

```bash
node --check src-js/views-editor/src/edit-tools-skeleton.js
npx prettier --write src-js/views-editor/src/edit-tools-skeleton.js
git add src-js/views-editor/src/edit-tools-skeleton.js
git commit -m "feat(skeleton): close skeleton contours"
```

---

## Task 6: Insert Points and Handles on Existing Skeleton Segments

**Files:**
- Modify: `src-js/views-editor/src/edit-tools-skeleton.js`

**Interfaces:**
- Normal click on a skeleton centerline segment inserts an on-curve point.
- Alt-click on a line segment inserts two cubic off-curve handles at one-third and two-thirds positions.
- Existing cubic segment split uses `bezier-js` and preserves curve shape.

- [ ] **Step 1: Add imports for segment math**

Add:

```javascript
import { Bezier } from "bezier-js";
```

- [ ] **Step 2: Add centerline hit testing**

Implement `_skeletonCenterlineHitAtEvent(event)` using skeleton data only:

```text
for each contour
  walk on-curve-to-on-curve segments, including closed wrap
  build line or cubic Bezier from intervening off-curves
  project glyph point to segment
  accept if distance <= mouseClickMargin
  return { contourId, startPointId, endPointId, insertIndex, t, point, isLineSegment }
```

Use `Bezier.project()` for cubic segments and vector projection for line segments.

- [ ] **Step 3: Add hover preview for Alt line handles**

On hover with Alt over a line segment, set `sceneModel.skeletonInsertHandles = { points: [handle1, handle2] }` and request canvas update. WS-8 rendering may need a tiny follow-up layer to draw this preview; if no preview layer exists, add it to `visualization-layer-skeleton.js` as a read-only preview layer.

- [ ] **Step 4: Implement line point insertion**

For line segments, splice a new on-curve skeleton point at `insertIndex`:

```javascript
const point = makeSkeletonPoint({
  x: Math.round(hit.point.x),
  y: Math.round(hit.point.y),
  type: null,
  smooth: false,
}, skeletonData);
contour.points.splice(hit.insertIndex, 0, point);
```

- [ ] **Step 5: Implement cubic split insertion**

For cubic segments, split the curve at `hit.t`, replace the old off-curve span with:

```text
left handles
new smooth on-curve point
right handles
```

Use `makeSkeletonPoint(..., skeletonData)` for each new point so stable ids are allocated. Do not preserve donor index assumptions.

- [ ] **Step 6: Implement Alt handle insertion**

For line segments, splice two cubic points between the endpoints:

```javascript
makeSkeletonPoint({ x: h1.x, y: h1.y, type: "cubic" }, skeletonData)
makeSkeletonPoint({ x: h2.x, y: h2.y, type: "cubic" }, skeletonData)
```

Then set the start/end on-curves `smooth = true` only if donor behavior does so at `fd76d3abe`; verify by reading donor `_handleInsertSkeletonHandles`.

- [ ] **Step 7: Run checks and commit**

```bash
node --check src-js/views-editor/src/edit-tools-skeleton.js
npx prettier --write src-js/views-editor/src/edit-tools-skeleton.js
git add src-js/views-editor/src/edit-tools-skeleton.js
git commit -m "feat(skeleton): insert skeleton segment points"
```

---

## Task 7: Delete Skeleton Points from the Skeleton Tool

**Files:**
- Modify: `src-js/views-editor/src/edit-tools-skeleton.js`

**Interfaces:**
- Press Backspace/Delete with skeleton point selection while Skeleton Pen is active deletes selected skeleton points.
- Empty contours are removed.
- If too few on-curve points remain in a closed contour, it opens or is removed according to donor `fd76d3abe` behavior.

- [ ] **Step 1: Add `handleKeyDown(event)`**

Handle only `Backspace` and `Delete`. For all other keys, return without side effects.

- [ ] **Step 2: Implement deletion through `editSkeleton()`**

For each editable layer:

```text
group selected skeletonPoint ids by contour id
delete matching point ids from contour.points
remove contour if no on-curve points remain
if closed contour has fewer than 2 on-curve points, set closed = false or remove per donor behavior
```

Update selection to the nearest surviving point id in the primary layer, or empty selection.

- [ ] **Step 3: Run checks and commit**

```bash
node --check src-js/views-editor/src/edit-tools-skeleton.js
npx prettier --write src-js/views-editor/src/edit-tools-skeleton.js
git add src-js/views-editor/src/edit-tools-skeleton.js
git commit -m "feat(skeleton): delete skeleton points from drawing tool"
```

---

## Task 8: Bundle, Rail Checks, and Manual Matrix

**Files:**
- Verify all WS-10 files.

- [ ] **Step 1: Syntax-check touched files**

```bash
node --check src-js/views-editor/src/edit-tools-skeleton.js
node --check src-js/views-editor/src/skeleton-editing.js
node --check src-js/views-editor/src/editor.js
node --check src-js/fontra-core/assets/lang/en.js
```

- [ ] **Step 2: Run bundle**

```bash
npm run bundle
```

Expected: webpack exits 0 and resolves `edit-tools-skeleton.js`.

- [ ] **Step 3: Run rail greps**

```bash
rg -n "generateFromSkeleton|generateContoursFromSkeleton|outlineContourToPackedPath|setSkeletonData\\(" src-js/views-editor/src/edit-tools-skeleton.js
rg -n "skeletonPoint/\\$\\{.*Index|skeletonPoint/.*/.*Index|contourIndex\\}/\\$\\{pointIndex" src-js/views-editor/src/edit-tools-skeleton.js
rg -n "skeleton-source-defaults|SKELETON_SOURCE_DEFAULT|leftWidth|rightWidth|isClosed" src-js/views-editor/src/edit-tools-skeleton.js
rg -n "editSkeleton\\(" src-js/views-editor/src/edit-tools-skeleton.js
```

Expected:

```text
no generator or setSkeletonData calls in the tool
no index-based skeletonPoint keys
no donor source-default or flat-width schema fields
all skeleton mutations are visibly routed through editSkeleton()
```

- [ ] **Step 4: Manual editor matrix**

Use the WS-8 fixture and a blank glyph. Verify:

```text
tool registration:
  Skeleton Pen Tool appears in the toolbar with icon and tooltip
  numeric shortcut selects it according to tool order
  when not editing a glyph, it delegates hover/drag to pointer behavior

create:
  click blank glyph -> creates skeleton data and first open contour point
  second click with endpoint selected -> appends point to same contour
  selecting first endpoint and clicking before it -> prepends point

close:
  selected last endpoint + click first endpoint -> closes contour
  selected first endpoint + click last endpoint -> closes contour
  clicking points on another contour while drawing does not close current contour

insert:
  click line centerline -> inserts on-curve point
  Alt-click line centerline -> inserts cubic handles
  click cubic centerline -> splits cubic and preserves visible curve shape

delete:
  Delete selected skeleton point -> removes point and regenerates outline
  Delete last point in contour -> removes empty contour

state:
  generated contours update after every operation
  undo/redo restores skeleton customData and generated path
  multi-layer editing applies the same structural edit to all editable layers
  selection uses skeletonPoint/<contourId>/<pointId>
```

- [ ] **Step 5: Final formatting and commit if needed**

```bash
npx prettier --write src-js/views-editor/src/edit-tools-skeleton.js src-js/views-editor/src/skeleton-editing.js src-js/views-editor/src/editor.js src-js/fontra-core/assets/lang/en.js
git status --short
```

If formatting changed files:

```bash
git add src-js/views-editor/src/edit-tools-skeleton.js src-js/views-editor/src/skeleton-editing.js src-js/views-editor/src/editor.js src-js/fontra-core/assets/lang/en.js
git commit -m "style(skeleton): format drawing tool files"
```

---

## Manual Test Matrix

```text
contour state:
  no skeleton data, existing open contour, existing closed contour, multiple contours
actions:
  create first point, append, prepend, close, insert point, insert handles, split cubic, delete
modifiers:
  none, Alt for insert handles
selection:
  selected endpoint, selected non-endpoint, selected point on other contour, no selection
editing scope:
  one source, multiple editable sources, layer without existing skeleton data
undo:
  undo/redo every action individually
```

---

## Deviations

- Donor source-default logic is not ported in WS-10; new contours use `DEFAULT_SKELETON_WIDTH`. Source defaults are WS-15.
- Drag-to-curve creation is not included unless implementation confirms donor `fd76d3abe` requires it for basic Skeleton Pen parity. If added, it must still allocate stable ids and call `editSkeleton`.
- Rib endpoints, editable generated points/handles, and modifier modes are later workstreams and must not be added here.

---

## Acceptance Criteria

- The editor registers a `skeleton-pen-tool` toolbar item with icon and English label.
- The tool creates skeleton data from an empty glyph.
- Users can append/prepend points to open skeleton contours and close contours by endpoint click.
- Users can insert on-curve points and cubic handles on existing skeleton centerline segments.
- Users can delete skeleton points while the tool is active.
- All skeleton changes go through `editSkeleton`; the tool has no generator or direct customData write calls.
- Selection keys use stable contour/point ids, not indices.
- Generated contours update after every tool action and undo/redo restores both path and skeleton data.
- `npm run bundle` passes.

---

## Self-Review

- **Spec coverage:** WS-10 roadmap items are covered: create contours, append points, close contours, delete points, smooth-compatible point insertion, toolbar registration, and shortcuts.
- **Scope check:** the plan excludes ribs, editable generated geometry, source defaults UI, panel work, Tunni, and D/S/X/Z.
- **Architecture rails:** the tool is thin UI/event routing over WS-9 `editSkeleton`, with stable ids and no donor direct persistence.
- **Donor discipline:** donor behavior is referenced for semantics; donor index selection, source defaults, and persistence calls are explicitly excluded.
