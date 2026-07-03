# WS-9 - Skeleton Editing Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the single skeleton editing pipeline (`editSkeleton`) and make skeleton centerline points/handles selectable, draggable, nudgable, transformable, smooth-toggleable, and undoable.

**Architecture:** `editSkeleton` is the only editor-side caller that mutates skeleton data, regenerates generated path contours, and writes `fontra.internal.skeleton`. Skeleton points reuse the existing point-behavior rules through a generic target-entry extension to `EditBehaviorFactory`; the shared change-emission path remains object-kind agnostic. Hit testing lives in `scene-model.js`, pointer and arrow-key code only route to the new pipeline, and path-contour index bookkeeping is explicit at the few structural path-edit sites.

**Tech Stack:** ES modules under `src-js/views-editor/src`, WS-6 `@fontra/core/skeleton-model.js`, WS-7 `@fontra/core/skeleton-generator.js`, existing `EditBehaviorFactory`, `ChangeCollector`, `recordChanges`, `VarPackedPath`/`packContour`, `node --check`, `npm run bundle`, and manual editor parity checks against donor `fd76d3abe`.

---

## Global Constraints

- **Branch:** implement on `refactor-simple/ws9-skeleton-editing`, cut after WS-6, WS-7, and WS-8 are merged. Do not implement from the planning branch.
- **Donor is read-only:** `./skeleton/` must stay detached at `fd76d3abe`. Read donor `skeleton/src-js/views-editor/src/edit-tools-pointer.js` for semantics only; do not copy its routing or persistence structure.
- **Secondary reference:** this checkout has the post-refactor state as `origin/ref/cleanup`, not local `ref/cleanup`. Read it with `git -c safe.directory=C:/Users/frena/Desktop/forkra/skeleton -C skeleton show origin/ref/cleanup:<path>` without moving `./skeleton` HEAD.
- **Scope:** skeleton point/handle editing only. Do not implement ribs, editable generated points/handles, D fixed-rib, S fixed-rib-compress, X equalize, Tunni-on-skeleton, the skeleton drawing tool, or the parameters panel.
- **One write path:** every skeleton edit goes through `editSkeleton`. No pointer, scene-controller, transform-panel, or panel code may call the generator or write skeleton customData directly.
- **No geometric recovery:** generated path points are not reverse-mapped by tolerance or coordinate matching. WS-9 only updates generated path contours from generator provenance and prepares the bookkeeping hooks later workstreams consume.
- **Selection key shape:** use stable ids: `skeletonPoint/<contourId>/<pointId>`. Do not use donor index keys (`skeletonPoint/<contourIndex>/<pointIndex>`) in forkra.
- **Behavior model:** Shift/Alt point semantics must come from the existing behavior rules. WS-9 does not add D/S/X/Z behavior names.

---

## Verified Current Context

- `src-js/views-editor/src/scene-model.js` currently routes point hits through `selectionAtPoint() -> _selectionAtPoint() -> pointSelectionAtPoint()` and marquee through `selectionAtRect()`.
- `src-js/views-editor/src/edit-tools-pointer.js` currently routes drag-selection through `handleDragSelection()`, builds one `EditBehaviorFactory` per editable layer, calls `makeChangeForDelta(delta)`, applies the returned change to the layer glyph, sends incremental changes, and records rollback.
- `src-js/views-editor/src/scene-controller.js` currently handles arrow-key nudges in `handleArrowKeys()` with the same `EditBehaviorFactory` pattern.
- `src-js/views-editor/src/panel-transformation.js` currently transforms selected point/component/anchor/background-image objects with `EditBehaviorFactory.getTransformBehavior("default")`.
- `src-js/views-editor/src/edit-behavior.js` currently parses selection types with `parseSelection(selection)`, unpacks regular path contours from `instance.path`, builds point edit funcs, and consolidates path/component/anchor/guideline/background-image changes in `_makeChangeForTransformFunc()`.
- `src-js/fontra-core/src/change-recorder.js` records rollback for object property sets, array splices, and `VarPackedPath` contour/point methods.
- Donor `fd76d3abe` has skeleton point nudge/drag/smooth/transform semantics inline in `edit-tools-pointer.js`; its persistence pattern repeatedly calls `regenerateSkeletonContours()` and `setSkeletonData()` directly and must not be copied.
- The post-refactor `origin/ref/cleanup:src-js/views-editor/src/edit-behavior.js` is useful as a semantic index for target-entry ideas, but its adapter/factory plumbing is not the implementation template.

---

## File Structure

```
src-js/views-editor/src/
  skeleton-editing.js              [CREATE] editSkeleton, change-builder wrapper, generated contour replacement, id-based selection helpers, skeleton behavior target entry
  edit-behavior.js                 [MODIFY] generic target-entry support; no skeleton-specific branches in change emission
  scene-model.js                   [MODIFY] skeletonPointAtPoint and skeleton points in marquee selection
  edit-tools-pointer.js            [MODIFY] route skeleton drags/double-clicks to skeleton-editing helpers
  scene-controller.js              [MODIFY] route arrow-key nudges to skeleton-editing helper
  panel-transformation.js          [MODIFY] include skeleton selections in transform operations
```

---

## Task 1: Add `editSkeleton` and Generated Contour Persistence

**Files:**
- Create: `src-js/views-editor/src/skeleton-editing.js`

**Interfaces:**
- Consumes `getSkeletonData()`, `setSkeletonData()`, `normalizeSkeletonData()` from `@fontra/core/skeleton-model.js`.
- Consumes `generateFromSkeleton()` from `@fontra/core/skeleton-generator.js`.
- Produces `editSkeleton(layerGlyph, mutate, options = {}) -> ChangeCollector`, for immediate editor writes.
- Produces `makeEditSkeletonChange(layerGlyph, mutate, options = {}) -> ChangeCollector`, for `EditBehaviorFactory` target entries that must return a change to be applied later.
- Produces `replaceGeneratedSkeletonContours(layerGlyph, skeletonData, generated)`.
- Produces id-address helpers:
  - `parseSkeletonPointKey(key) -> { contourId, pointId }`
  - `makeSkeletonPointKey(contourId, pointId) -> string`
  - `getSkeletonPointAddress(skeletonData, contourId, pointId) -> { contour, contourIndex, point, pointIndex } | null`

- [ ] **Step 1: Create the module skeleton**

Create `src-js/views-editor/src/skeleton-editing.js`:

```javascript
import { recordChanges } from "@fontra/core/change-recorder.js";
import { generateFromSkeleton, outlineContourToPackedPath } from "@fontra/core/skeleton-generator.js";
import {
  getSkeletonData,
  normalizeSkeletonData,
  setSkeletonData,
} from "@fontra/core/skeleton-model.js";

export function makeSkeletonPointKey(contourId, pointId) {
  return `skeletonPoint/${contourId}/${pointId}`;
}

export function parseSkeletonPointKey(key) {
  const [contourId, pointId] = `${key}`.split("/").map(Number);
  return { contourId, pointId };
}

export function getSkeletonPointAddress(skeletonData, contourId, pointId) {
  for (let contourIndex = 0; contourIndex < (skeletonData?.contours || []).length; contourIndex++) {
    const contour = skeletonData.contours[contourIndex];
    if (contour.id !== contourId) continue;
    const pointIndex = contour.points.findIndex((point) => point.id === pointId);
    if (pointIndex < 0) return null;
    return { contour, contourIndex, point: contour.points[pointIndex], pointIndex };
  }
  return null;
}
```

- [ ] **Step 2: Add the single write path**

Append:

```javascript
export function editSkeleton(layerGlyph, mutate, options = {}) {
  return recordChanges(layerGlyph, (layerGlyphProxy) => {
    applySkeletonMutation(layerGlyphProxy, mutate, options);
  });
}

export function makeEditSkeletonChange(layerGlyph, mutate, options = {}) {
  const scratch = cloneLayerGlyphForSkeletonEdit(layerGlyph);
  return editSkeleton(scratch, mutate, options);
}

function applySkeletonMutation(layerGlyph, mutate, options = {}) {
  const original = getSkeletonData(layerGlyph);
  if (!original) {
    return;
  }

  const working = normalizeSkeletonData(structuredClone(original));
  mutate(working);
  const generated = generateFromSkeleton(working);
  replaceGeneratedSkeletonContours(layerGlyph, working, generated);
  setSkeletonData(layerGlyph, working);
}

export function cloneLayerGlyphForSkeletonEdit(layerGlyph) {
  return {
    ...layerGlyph,
    path: layerGlyph.path.copy(),
    customData: structuredClone(layerGlyph.customData || {}),
  };
}

export function replaceGeneratedSkeletonContours(layerGlyph, skeletonData, generated) {
  removePreviousGeneratedContours(layerGlyph, skeletonData);
  skeletonData.generated = [];
  for (const [i, contour] of generated.contours.entries()) {
    const pathContourIndex = layerGlyph.path.numContours;
    layerGlyph.path.insertContour(pathContourIndex, outlineContourToPackedPath(contour));
    const provenance = generated.provenance[i];
    skeletonData.generated.push({
      skeletonContourId: provenance.skeletonContourId,
      pathContourIndex,
      pointMap: provenance.pointMap,
    });
  }
}

function removePreviousGeneratedContours(layerGlyph, skeletonData) {
  const entries = [...(skeletonData.generated || [])]
    .filter((entry) => Number.isInteger(entry.pathContourIndex))
    .sort((a, b) => b.pathContourIndex - a.pathContourIndex);
  for (const entry of entries) {
    if (entry.pathContourIndex >= 0 && entry.pathContourIndex < layerGlyph.path.numContours) {
      layerGlyph.path.deleteContour(entry.pathContourIndex);
    }
  }
}
```

`editSkeleton()` mutates its `layerGlyph` argument immediately through `recordChanges()`. `makeEditSkeletonChange()` mutates only a clone and returns the resulting `ChangeCollector`; use it from `EditBehaviorFactory` target entries where pointer/scene-controller code later calls `applyChange(layerGlyph, editChange)`.

- [ ] **Step 3: Syntax-check and format**

Run:

```bash
node --check src-js/views-editor/src/skeleton-editing.js
npx prettier --write src-js/views-editor/src/skeleton-editing.js
```

Expected: `node --check` exits 0; prettier reports the file.

- [ ] **Step 4: Commit**

```bash
git add src-js/views-editor/src/skeleton-editing.js
git commit -m "feat(skeleton): add edit skeleton write path"
```

---

## Task 2: Add a Generic EditBehavior Target Entry

**Files:**
- Modify: `src-js/views-editor/src/edit-behavior.js`
- Modify: `src-js/views-editor/src/skeleton-editing.js`

**Interfaces:**
- `EditBehaviorFactory` accepts an optional fourth argument: `{ targetEntries = [] }`.
- A target entry has `{ rollbackChange, makeChangeForTransform(transform, roundFunc) }`; `rollbackChange` is read dynamically after each `makeChangeForTransform()` call.
- `makeChangeForDelta()` and `makeChangeForTransformation()` consolidate target-entry changes without checking whether they are skeleton entries.
- `skeleton-editing.js` exports `makeSkeletonPointTargetEntry(layer, selection, behaviorName)`.

- [ ] **Step 1: Extend constructor plumbing without skeleton names**

In `edit-behavior.js`, update `EditBehaviorFactory` and `EditBehavior` constructors so callers can pass `targetEntries`. Store them as `this.targetEntries`.

- [ ] **Step 2: Extend `_makeChangeForTransformFunc()` generically**

After background-image changes are collected, add:

```javascript
const targetEntryChanges = this.targetEntries?.map((entry) =>
  entry.makeChangeForTransform(transform, this.roundFunc)
);
```

Then append them to `changes` only when present:

```javascript
if (targetEntryChanges && targetEntryChanges.length) {
  changes.push(...targetEntryChanges.filter((change) => change));
}
```

Replace the fixed `this.rollbackChange = ...` assignment with a getter that consolidates ordinary rollback plus current target-entry rollback:

```javascript
this.baseRollbackChange = makeRollbackChange(...);
```

and:

```javascript
get rollbackChange() {
  const targetRollbackChanges = this.targetEntries
    ?.map((entry) => entry.rollbackChange)
    .filter((change) => change);
  return consolidateChanges([
    this.baseRollbackChange,
    ...(targetRollbackChanges || []),
  ]);
}
```

This is generic; do not import or mention skeleton in `edit-behavior.js`.

- [ ] **Step 3: Implement skeleton point target entries**

In `skeleton-editing.js`, export:

```javascript
export function makeSkeletonPointTargetEntry(layer, selection, behaviorName) {
  const skeletonData = getSkeletonData(layer);
  const selected = collectSkeletonPointSelection(selection, skeletonData);
  if (!skeletonData || !selected.length) return null;

  const originalLayerGlyph = cloneLayerGlyphForSkeletonEdit(layer);
  let rollbackChange = null;
  return {
    get rollbackChange() {
      return rollbackChange;
    },
    makeChangeForTransform(transform, roundFunc) {
      const changes = makeEditSkeletonChange(originalLayerGlyph, (working) => {
        for (const item of selected) {
          const address = getSkeletonPointAddress(working, item.contourId, item.pointId);
          if (!address) continue;
          const point = address.point;
          const next = transform.constrained(point);
          point.x = roundFunc(next.x);
          point.y = roundFunc(next.y);
        }
      });
      rollbackChange = changes.rollbackChange;
      return changes.change;
    },
  };
}
```

Before committing, replace this minimal direct transform body with the existing point-behavior rule executor so Shift/Alt semantics match regular point editing. The target entry may construct a temporary contour with selected flags and reuse the same point action factories; it must not fork the behavior-rule table. `makeChangeForTransform()` must be relative to `originalLayerGlyph`, not the currently mutated layer glyph, so modifier changes and live drag frames stay rollback-safe.

- [ ] **Step 4: Verify no skeleton branch entered the shared emitter**

Run:

```bash
rg -n "skeleton|Skeleton" src-js/views-editor/src/edit-behavior.js
node --check src-js/views-editor/src/edit-behavior.js
node --check src-js/views-editor/src/skeleton-editing.js
```

Expected: the grep has no matches in `edit-behavior.js`; both syntax checks pass.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src-js/views-editor/src/edit-behavior.js src-js/views-editor/src/skeleton-editing.js
git add src-js/views-editor/src/edit-behavior.js src-js/views-editor/src/skeleton-editing.js
git commit -m "feat(skeleton): add generic edit behavior targets"
```

---

## Task 3: Add Scene-Model Hit Testing and Marquee Selection

**Files:**
- Modify: `src-js/views-editor/src/scene-model.js`
- Modify: `src-js/views-editor/src/skeleton-editing.js`

**Interfaces:**
- `sceneModel.skeletonPointAtPoint(point, size, parsedCurrentSelection) -> Set`.
- Selection keys are `skeletonPoint/<contourId>/<pointId>`.
- Hit testing uses current editing layer skeleton data and point coordinates only.

- [ ] **Step 1: Add point hit helper**

In `scene-model.js`, import `getSkeletonData` and `makeSkeletonPointKey`. Add `skeletonPointAtPoint()` beside `pointSelectionAtPoint()`. It should:

```text
1. get selected positioned glyph
2. resolve the current edit layer glyph/layer
3. read skeleton data from that layer
4. search selected skeleton points first when parsedCurrentSelection has skeletonPoint
5. otherwise search all skeleton points in reverse contour/point order
6. return a Set with one id-based key
```

- [ ] **Step 2: Route skeleton hits through `_selectionAtPoint()`**

Call `skeletonPointAtPoint()` after anchors and before regular path points. This makes visible skeleton points easier to hit than generated outlines.

- [ ] **Step 3: Add marquee selection**

In `selectionAtRect()`, add skeleton points whose `(x, y)` are inside the glyph-local selection rectangle. Do not add ribs or editable-generated selections.

- [ ] **Step 4: Syntax-check and format**

```bash
node --check src-js/views-editor/src/scene-model.js
npx prettier --write src-js/views-editor/src/scene-model.js
```

- [ ] **Step 5: Commit**

```bash
git add src-js/views-editor/src/scene-model.js
git commit -m "feat(skeleton): hit test skeleton points"
```

---

## Task 4: Route Pointer Drags Through Skeleton Target Entries

**Files:**
- Modify: `src-js/views-editor/src/edit-tools-pointer.js`
- Modify: `src-js/views-editor/src/skeleton-editing.js`

**Interfaces:**
- `hasSkeletonPointSelection(selection) -> boolean`.
- `makeSkeletonPointTargetEntry()` participates in each layer's `EditBehaviorFactory`.
- Existing regular point/component/anchor/background-image drag behavior remains unchanged for mixed selections.

- [ ] **Step 1: Add routing helpers**

In `skeleton-editing.js`, export:

```javascript
export function hasSkeletonPointSelection(selection) {
  return !!parseSelection(selection).skeletonPoint?.size;
}
```

Use the existing `parseSelection` import from `@fontra/core/utils.ts`.

- [ ] **Step 2: Pass skeleton target entries from pointer drag setup**

In `edit-tools-pointer.js`, when constructing each `EditBehaviorFactory` inside `handleDragSelection()`, create a skeleton target entry for that layer and pass it through the generic target-entry option. Do not add a separate `_handleDragSkeletonPoints()` branch.

- [ ] **Step 3: Preserve modifier switching**

When `behaviorName` changes during drag, rebuild skeleton target entries from the same original layer state. The rollback step should undo the current generic target changes along with regular point changes.

- [ ] **Step 4: Run checks**

```bash
node --check src-js/views-editor/src/edit-tools-pointer.js
node --check src-js/views-editor/src/skeleton-editing.js
npx prettier --write src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/skeleton-editing.js
```

- [ ] **Step 5: Commit**

```bash
git add src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/skeleton-editing.js
git commit -m "feat(skeleton): drag skeleton points through edit behavior"
```

---

## Task 5: Route Arrow-Key Nudges and Smooth Toggle

**Files:**
- Modify: `src-js/views-editor/src/scene-controller.js`
- Modify: `src-js/views-editor/src/edit-tools-pointer.js`
- Modify: `src-js/views-editor/src/skeleton-editing.js`

**Interfaces:**
- `makeSkeletonPointTargetEntry()` works for delta transforms from arrow keys.
- Double-click smooth toggle for selected skeleton on-curve points writes through `editSkeleton`.

- [ ] **Step 1: Add arrow-key target entries**

In `scene-controller.js`, pass skeleton target entries to `EditBehaviorFactory` in `handleArrowKeys()` exactly as pointer drag does. Keep regular point and connect-contour behavior intact.

- [ ] **Step 2: Add smooth toggle helper**

In `skeleton-editing.js`, export `toggleSkeletonSmooth(layer, selection, forceValue = null)`. It should call `editSkeleton()` and toggle only selected on-curve skeleton points.

- [ ] **Step 3: Route double-click**

In `edit-tools-pointer.js`, update `handleDoubleClick()` so a skeleton-point selection toggles smooth before regular point double-click logic. Use the same multi-layer edit loop as drag/nudge.

- [ ] **Step 4: Run checks**

```bash
node --check src-js/views-editor/src/scene-controller.js
node --check src-js/views-editor/src/edit-tools-pointer.js
node --check src-js/views-editor/src/skeleton-editing.js
npx prettier --write src-js/views-editor/src/scene-controller.js src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/skeleton-editing.js
```

- [ ] **Step 5: Commit**

```bash
git add src-js/views-editor/src/scene-controller.js src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/skeleton-editing.js
git commit -m "feat(skeleton): nudge and smooth toggle skeleton points"
```

---

## Task 6: Include Skeleton Points in Transform Panel Operations

**Files:**
- Modify: `src-js/views-editor/src/panel-transformation.js`
- Modify: `src-js/views-editor/src/skeleton-editing.js`

**Interfaces:**
- Transform panel operations include skeleton selections through generic target entries.
- Selection bounds include skeleton points.

- [ ] **Step 1: Add skeleton selection bounds helper**

In `skeleton-editing.js`, export `getSkeletonSelectionBounds(layer, selection)`. It returns `{ xMin, yMin, xMax, yMax }` for selected skeleton points or `undefined`.

- [ ] **Step 2: Merge bounds in transformation panel**

In `panel-transformation.js`, when `selectionBounds` is computed, union the existing glyph-controller bounds with `getSkeletonSelectionBounds(layer, selection)`.

- [ ] **Step 3: Pass transform target entries**

When constructing the transform `EditBehaviorFactory`, pass the same skeleton target entry option and use `getTransformBehavior("default")`.

- [ ] **Step 4: Run checks and commit**

```bash
node --check src-js/views-editor/src/panel-transformation.js
node --check src-js/views-editor/src/skeleton-editing.js
npx prettier --write src-js/views-editor/src/panel-transformation.js src-js/views-editor/src/skeleton-editing.js
git add src-js/views-editor/src/panel-transformation.js src-js/views-editor/src/skeleton-editing.js
git commit -m "feat(skeleton): transform selected skeleton points"
```

---

## Task 7: Path-Contour Index Bookkeeping Hooks

**Files:**
- Modify: `src-js/views-editor/src/skeleton-editing.js`
- Modify: `src-js/views-editor/src/edit-tools-pen.js`
- Modify: `src-js/views-editor/src/edit-tools-shape.js`
- Modify: `src-js/views-editor/src/scene-controller.js`
- Modify: `src-js/views-editor/src/editor.js`

**Interfaces:**
- `shiftGeneratedContourIndices(layerGlyph, skeletonData, startIndex, delta)`.
- Any non-skeleton path contour insert/delete before generated contours updates `skeleton.generated[*].pathContourIndex`.

- [ ] **Step 1: Add the index-shift helper**

In `skeleton-editing.js`, export:

```javascript
export function shiftGeneratedContourIndices(skeletonData, startIndex, delta) {
  for (const entry of skeletonData?.generated || []) {
    if (entry.pathContourIndex >= startIndex) {
      entry.pathContourIndex += delta;
    }
  }
}
```

- [ ] **Step 2: Enumerate structural edit sites**

Run:

```bash
rg -n "insertContour|insertUnpackedContour|appendPath|deleteContour|deleteNTrailingContours" src-js/views-editor/src
```

For each site that can affect the edited layer path outside `editSkeleton`, either add an index-shift call in the same recorded change or document why the site cannot affect skeleton-generated contours.

- [ ] **Step 3: Add conservative hooks**

At minimum cover:

```text
edit-tools-pen.js: inserts/deletes/merges/splits contours while drawing
edit-tools-shape.js: appends and replaces contours for shape tools
scene-controller.js: delete/reverse/join selected contours
editor.js: paste appends paths
```

Do not attempt geometric recovery if bookkeeping cannot be updated. If an operation deletes a generated contour directly, clear the matching `generated` entry and keep skeleton data intact.

- [ ] **Step 4: Run rail grep**

```bash
rg -n "insertContour|insertUnpackedContour|appendPath|deleteContour|deleteNTrailingContours" src-js/views-editor/src
rg -n "shiftGeneratedContourIndices" src-js/views-editor/src
```

Expected: every contour-structural site is either adjacent to a helper call or explicitly commented as not affecting edited glyph paths.

- [ ] **Step 5: Commit**

```bash
git add src-js/views-editor/src/skeleton-editing.js src-js/views-editor/src/edit-tools-pen.js src-js/views-editor/src/edit-tools-shape.js src-js/views-editor/src/scene-controller.js src-js/views-editor/src/editor.js
git commit -m "feat(skeleton): maintain generated contour indices"
```

---

## Task 8: Bundle, Rail Checks, and Manual Matrix

**Files:**
- Verify all WS-9 files.

- [ ] **Step 1: Syntax-check touched files**

```bash
node --check src-js/views-editor/src/skeleton-editing.js
node --check src-js/views-editor/src/edit-behavior.js
node --check src-js/views-editor/src/scene-model.js
node --check src-js/views-editor/src/edit-tools-pointer.js
node --check src-js/views-editor/src/scene-controller.js
node --check src-js/views-editor/src/panel-transformation.js
```

- [ ] **Step 2: Run bundle**

```bash
npm run bundle
```

Expected: webpack exits 0.

- [ ] **Step 3: Run rail greps**

```bash
rg -n "generateFromSkeleton|generateContoursFromSkeleton|outlineContourToPackedPath" src-js/views-editor/src
rg -n "setSkeletonData\\(" src-js/views-editor/src
rg -n "skeletonPoint/\\$\\{.*Index|skeletonPoint/.*/.*Index|skeletonPoint/\\$\\{contourIndex" src-js/views-editor/src
rg -n "recover|inverse|tolerance|pointIndexNear.*skeleton|editableGenerated" src-js/views-editor/src/skeleton-editing.js src-js/views-editor/src/scene-model.js
rg -n "skeleton|Skeleton" src-js/views-editor/src/edit-behavior.js
```

Expected:

```text
generator calls appear only in skeleton-editing.js
setSkeletonData calls for WS-9 editing appear only in skeleton-editing.js
no skeletonPoint selection keys are index-based
no recovery/inverse/tolerance lookup exists for skeleton selection
edit-behavior.js has no skeleton-specific branch names
```

- [ ] **Step 4: Manual parity matrix**

Open the WS-8 fixture font and a donor `fd76d3abe` editor side-by-side. Verify:

```text
click skeleton on-curve point -> selects skeletonPoint/<contourId>/<pointId>
click skeleton off-curve handle -> selects the same skeletonPoint key shape
Shift-click skeleton points -> extends selection
Alt-click / platform toggle-click -> follows existing selection mode behavior
marquee on-curve skeleton points -> selects skeleton points
marquee with Alt -> applies the existing off-curve/handle filter where regular path marquee does
drag one on-curve point, no modifiers -> same visible centerline behavior as donor
drag one off-curve handle, no modifiers -> same handle movement as donor
drag mixed skeleton + regular path points -> both move, one undo item
drag with Shift -> same constrained behavior as regular path behavior rules
drag with Alt -> same alternate behavior as regular path behavior rules
drag with Shift+Alt -> same alternate-constrain behavior as regular path behavior rules
arrow nudge selected skeleton point -> moves by 1 unit
Shift+arrow -> moves by 10 units
Ctrl/Cmd+Shift+arrow -> moves by 100 units
double-click smooth skeleton on-curve point -> toggles smooth and generated outline follows
transform panel scale/rotate selected skeleton points -> generated outline follows
undo/redo after drag/nudge/smooth/transform -> skeleton customData and generated path both restore
multi-layer editing -> all editable layers with skeleton data update consistently
external structural path edit before generated contours -> generated pathContourIndex shifts correctly
```

- [ ] **Step 5: Final formatting and commit if needed**

```bash
npx prettier --write src-js/views-editor/src/skeleton-editing.js src-js/views-editor/src/edit-behavior.js src-js/views-editor/src/scene-model.js src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/scene-controller.js src-js/views-editor/src/panel-transformation.js
git status --short
```

If formatting changed files:

```bash
git add src-js/views-editor/src/skeleton-editing.js src-js/views-editor/src/edit-behavior.js src-js/views-editor/src/scene-model.js src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/scene-controller.js src-js/views-editor/src/panel-transformation.js
git commit -m "style(skeleton): format editing pipeline files"
```

---

## Manual Test Matrix

Use the WS-8 fixture plus at least one hand-made cubic skeleton with two smooth on-curves and handles.

```text
selection:
  click on-curve, click off-curve, Shift-click multi-select, marquee select
drag:
  none, Shift, Alt, Shift+Alt
keyboard:
  arrow, Shift+arrow, Ctrl/Cmd+Shift+arrow, Alt+arrow
mixed selection:
  skeleton only, regular path only, skeleton + regular path
state:
  undo, redo, live drag incremental updates, multi-layer edit, hidden visualization layers
excluded in WS-9:
  rib endpoint drag, editable generated point drag, editable generated handle drag, D/S/X/Z modes
```

---

## Deviations

- WS-9 deliberately does not port donor `skeletonRibPoint`, `editableGeneratedPoint`, or `editableGeneratedHandle` selection kinds. Those belong to WS-11 and WS-12 and will use provenance rather than donor geometric matching.
- WS-9 does not implement donor D/S/X/Z modifier modes. The only modifiers in scope are existing Shift/Alt point-behavior rules.
- If a path structural operation cannot safely update `generated.pathContourIndex`, it must clear the affected generated entry and document the limitation in the implementation notes rather than attempting geometric recovery.

---

## Acceptance Criteria

- `editSkeleton()` is the only views-editor function that calls `generateFromSkeleton()` or `setSkeletonData()` for editing.
- Generated path contours and skeleton customData update in one `ChangeCollector` with rollback.
- Skeleton point selection keys use stable ids: `skeletonPoint/<contourId>/<pointId>`.
- `scene-model.js` owns skeleton point hit testing and marquee selection.
- Pointer drag, arrow nudge, smooth toggle, and transform panel operations work for skeleton point selections.
- Existing regular point/component/anchor/background-image editing still works for non-skeleton selections.
- `edit-behavior.js` has generic target-entry support and no skeleton-specific branches.
- No geometric recovery, inverse projection, or tolerance-based generated-to-skeleton lookup is introduced.
- `npm run bundle` passes.
- Manual matrix passes against donor `fd76d3abe` for base Shift/Alt skeleton point behavior.

---

## Self-Review

- **Spec coverage:** WS-9 roadmap requirements are covered: `editSkeleton`, id-based `skeletonPoint` selection, hit testing, pointer drag, arrow nudge, smooth toggle, transform integration, undo/redo, incremental sync, multi-layer editing, and generated contour index bookkeeping.
- **Scope check:** ribs, editable generated geometry, D/S/X/Z, Tunni, drawing tool, and panel work are excluded and named as later workstreams.
- **Architecture rails:** the plan keeps generator/customData writes in `skeleton-editing.js`, keeps pointer thin, puts hit testing in `scene-model.js`, and keeps `edit-behavior.js` generic.
- **Donor discipline:** donor code is read for semantics only; donor persistence/routing/geometric recovery patterns are explicitly excluded.
