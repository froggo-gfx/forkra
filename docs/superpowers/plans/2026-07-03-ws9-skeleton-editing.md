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
- **Cross-layer addressing:** skeleton ids are allocated per layer, so ids are **not** guaranteed to match across editable layers. Selection ids are canonical only in the edit layer; every multi-layer operation resolves them in other layers by structural ordinal (contour position, point position) through `resolveSkeletonAddressAcrossLayers()` (Task 1), skipping layers whose structure does not match. Never assume "the same id exists in every layer".
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

## Task 0: Extend `parseSelection` for Compound Selection Keys

**Files:**
- Modify: `src-js/fontra-core/src/utils.ts`
- Modify: `src-js/fontra-core/tests/test-utils.js`

**Why this is a prerequisite:** the current `parseSelection`
(`src-js/fontra-core/src/utils.ts:286`) does `item.split("/")` and keeps only
the **first** segment after the kind, parsed as an integer. A key like
`skeletonPoint/3/5` would parse to `{ skeletonPoint: [3] }` — the point id is
silently discarded — and the same happens to every WS-11/12 compound key. All
skeleton selection routing in WS-9…16 depends on this fix.

**Interfaces:**
- Single-segment kinds (`point/12`, `component/0`, …) keep today's exact
  behavior: integer values, numeric sort.
- Kinds whose remainder contains another `/` store the remainder **string**
  (`"3/5"`, `"3/5/left"`), sorted lexically.
- Consumers note: values arrays for skeleton kinds hold strings, and
  `parseSelection` returns **arrays** (use `.length`, never `.size`).

- [ ] **Step 1: Write the failing test**

Append to the `parseSelection` coverage in `src-js/fontra-core/tests/test-utils.js`
(follow the file's existing assertion style):

```javascript
it("keeps compound selection keys intact", () => {
  const parsed = parseSelection([
    "point/12",
    "point/3",
    "skeletonPoint/3/5",
    "skeletonPoint/3/4",
    "skeletonRib/3/5/left",
  ]);
  expect(parsed.point).to.deep.equal([3, 12]);
  expect(parsed.skeletonPoint).to.deep.equal(["3/4", "3/5"]);
  expect(parsed.skeletonRib).to.deep.equal(["3/5/left"]);
});
```

- [ ] **Step 2: Run and verify failure**

```bash
cd src-js/fontra-core
npx mocha tests/test-utils.js --reporter spec
```

Expected: FAIL — `parsed.skeletonPoint` is `[3, 3]` with the current parser.

- [ ] **Step 3: Implement**

Replace `parseSelection` in `src-js/fontra-core/src/utils.ts` with:

```typescript
export function parseSelection(selection: string[]) {
  const result: Record<string, (number | string)[]> = {};
  for (const item of selection) {
    const sep = item.indexOf("/");
    const tp = sep < 0 ? item : item.slice(0, sep);
    const rest = sep < 0 ? "" : item.slice(sep + 1);
    if (result[tp] === undefined) {
      result[tp] = [];
    }
    // Single-segment kinds stay numeric (upstream behavior);
    // compound kinds (skeletonPoint/…, skeletonRib/…) keep the raw remainder.
    result[tp].push(rest.includes("/") ? rest : parseInt(rest, 10));
  }
  for (const values of Object.values(result)) {
    // Ensure values are sorted; numeric kinds keep numeric order
    values.sort((a, b) =>
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b))
    );
  }
  return result;
}
```

- [ ] **Step 4: Run the full core suite and verify no regression**

```bash
cd src-js/fontra-core
npm test
```

Expected: PASS — existing single-segment callers see identical output.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src-js/fontra-core/src/utils.ts src-js/fontra-core/tests/test-utils.js
git add src-js/fontra-core/src/utils.ts src-js/fontra-core/tests/test-utils.js
git commit -m "feat(core): parse compound selection keys"
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
  - `parseSkeletonPointKey(key) -> { contourId, pointId }` — accepts both the
    full key (`"skeletonPoint/3/5"`) and the `parseSelection` remainder (`"3/5"`)
  - `makeSkeletonPointKey(contourId, pointId) -> string`
  - `getSkeletonPointAddress(skeletonData, contourId, pointId) -> { contour, contourIndex, point, pointIndex } | null`
  - `resolveSkeletonAddressAcrossLayers(referenceSkeletonData, targetSkeletonData, contourId, pointId) -> address | null`
    — cross-layer ordinal resolution (see Global Constraints)

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
  // Accepts "skeletonPoint/3/5" (full key) and "3/5" (parseSelection remainder)
  const parts = `${key}`.split("/");
  if (parts[0] === "skeletonPoint") {
    parts.shift();
  }
  const [contourId, pointId] = parts.map(Number);
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

// Cross-layer addressing (see Global Constraints): selection ids are canonical
// in the edit layer only. Other editable layers resolve the same point by
// structural ordinal (contour position, point position). Returns null when the
// target layer's structure is incompatible; callers skip that layer.
export function resolveSkeletonAddressAcrossLayers(
  referenceSkeletonData,
  targetSkeletonData,
  contourId,
  pointId
) {
  const reference = getSkeletonPointAddress(referenceSkeletonData, contourId, pointId);
  if (!reference) {
    return null;
  }
  if (referenceSkeletonData === targetSkeletonData) {
    return reference;
  }
  const contour = targetSkeletonData?.contours?.[reference.contourIndex];
  const point = contour?.points?.[reference.pointIndex];
  if (!contour || !point || !point.type !== !reference.point.type) {
    return null;
  }
  return {
    contour,
    contourIndex: reference.contourIndex,
    point,
    pointIndex: reference.pointIndex,
  };
}
```

Round-trip note: `parseSkeletonPointKey(makeSkeletonPointKey(3, 5))` must equal
`{ contourId: 3, pointId: 5 }`; add that assertion wherever this module first
gets test coverage.

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
  const previous = (skeletonData.generated || []).filter(
    (entry) =>
      Number.isInteger(entry.pathContourIndex) &&
      entry.pathContourIndex >= 0 &&
      entry.pathContourIndex < layerGlyph.path.numContours
  );

  if (canUpdateGeneratedContoursInPlace(layerGlyph.path, previous, generated)) {
    // Steady state (every width/nudge/coordinate drag): write point coordinates
    // in place. pathContourIndex stays stable, per-frame change objects contain
    // only "=xy" point updates, and contour order stays identical across
    // designspace sources (interpolation compatibility).
    skeletonData.generated = previous.map((entry, i) => {
      const pathContourIndex = entry.pathContourIndex;
      const contour = generated.contours[i];
      for (const [j, point] of contour.points.entries()) {
        const pointIndex = layerGlyph.path.getAbsolutePointIndex(pathContourIndex, j);
        layerGlyph.path.setPointPosition(pointIndex, point.x, point.y);
      }
      return {
        skeletonContourId: generated.provenance[i].skeletonContourId,
        pathContourIndex,
        pointMap: generated.provenance[i].pointMap,
      };
    });
    return;
  }

  // Topology changed: structural replace at stable positions. Delete the old
  // generated contours (descending), then insert the new ones contiguously at
  // the position the first old one occupied (append when none existed).
  // Generated contours must never migrate to the end of the path: change
  // objects are built against the drag-start state, and positional
  // deleteContour/insertContour ops only stay valid across frames when the
  // generated block keeps its position.
  const previousIndices = previous
    .map((entry) => entry.pathContourIndex)
    .sort((a, b) => b - a);
  for (const pathContourIndex of previousIndices) {
    layerGlyph.path.deleteContour(pathContourIndex);
  }
  const insertBase = previousIndices.length
    ? Math.min(...previousIndices)
    : layerGlyph.path.numContours;
  skeletonData.generated = generated.contours.map((contour, i) => {
    const pathContourIndex = insertBase + i;
    layerGlyph.path.insertContour(pathContourIndex, outlineContourToPackedPath(contour));
    return {
      skeletonContourId: generated.provenance[i].skeletonContourId,
      pathContourIndex,
      pointMap: generated.provenance[i].pointMap,
    };
  });
}

function canUpdateGeneratedContoursInPlace(path, previousEntries, generated) {
  if (previousEntries.length !== generated.contours.length) {
    return false;
  }
  return previousEntries.every((entry, i) => {
    const contour = generated.contours[i];
    if (path.getNumPointsOfContour(entry.pathContourIndex) !== contour.points.length) {
      return false;
    }
    const existing = path.getUnpackedContour(entry.pathContourIndex);
    if (existing.isClosed !== (contour.isClosed === true)) {
      return false;
    }
    return contour.points.every(
      (point, j) =>
        (existing.points[j].type || null) === (point.type || null) &&
        (existing.points[j].smooth === true) === (point.smooth === true)
    );
  });
}
```

`editSkeleton()` mutates its `layerGlyph` argument immediately through `recordChanges()`. `makeEditSkeletonChange()` mutates only a clone and returns the resulting `ChangeCollector`; use it from `EditBehaviorFactory` target entries where pointer/scene-controller code later calls `applyChange(layerGlyph, editChange)`. Because generated contours keep their path positions in both branches above, a per-frame change built against the drag-start clone stays valid when applied to the live (already-mutated) layer glyph.

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
- A target entry has `{ rollbackChange, makeChangeForDelta(delta), makeChangeForTransformation(transformation) }`.
  Entries are invoked from the **public** `EditBehavior.makeChangeForDelta()` /
  `makeChangeForTransformation()` methods — not from
  `_makeChangeForTransformFunc()` — so each entry receives the same top-level
  argument the caller passed and can drive its own inner behavior with it.
  `rollbackChange` is read dynamically after each call (verified: the current
  pointer reads `editBehavior.rollbackChange` only lazily, at behavior switch
  `edit-tools-pointer.js:492` and at drag end `:524`, so it is always read
  after at least one change call).
- `makeChangeForDelta()` and `makeChangeForTransformation()` consolidate target-entry changes without checking whether they are skeleton entries.
- `skeleton-editing.js` exports `makeSkeletonPointTargetEntry(layer, selection, behaviorName, referenceSkeletonData = null)`.

- [ ] **Step 1: Extend constructor plumbing without skeleton names**

In `edit-behavior.js`, update `EditBehaviorFactory` and `EditBehavior` constructors so callers can pass `targetEntries`. Store them as `this.targetEntries`.

- [ ] **Step 2: Extend the public change methods generically**

In `EditBehavior.makeChangeForDelta(delta)` and
`EditBehavior.makeChangeForTransformation(transformation)`, consolidate
target-entry changes with the existing path change:

```javascript
makeChangeForDelta(delta) {
  const pathChange = /* existing body, unchanged */;
  const entryChanges = (this.targetEntries || [])
    .map((entry) => entry.makeChangeForDelta(delta))
    .filter((change) => change);
  return entryChanges.length
    ? consolidateChanges([pathChange, ...entryChanges])
    : pathChange;
}
```

(Same shape for `makeChangeForTransformation`, calling
`entry.makeChangeForTransformation(transformation)`.)

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

- [ ] **Step 3: Implement skeleton point target entries (rules reused verbatim)**

This is how C1 is realized concretely: skeleton points get Shift/Alt semantics
by running the **existing** behavior rules on a synthetic `VarPackedPath` built
from the skeleton points, then copying the resulting coordinates back to the
skeleton working copy. No rules table is forked and `edit-behavior.js` gains no
skeleton knowledge (the factory is imported here; there is no import cycle
because `edit-behavior.js` never imports `skeleton-editing.js`).

Add imports to `skeleton-editing.js`:

```javascript
import { applyChange } from "@fontra/core/changes.js";
import { parseSelection } from "@fontra/core/utils.ts";
import { VarPackedPath } from "@fontra/core/var-path.js";
import { EditBehaviorFactory } from "./edit-behavior.js";
```

Then export:

```javascript
export function makeSkeletonPointTargetEntry(
  layer,
  selection,
  behaviorName,
  referenceSkeletonData = null
) {
  const skeletonData = getSkeletonData(layer);
  if (!skeletonData) return null;
  // Cross-layer addressing: selection ids are canonical in the edit layer;
  // resolve them into this layer by structural ordinal (Global Constraints).
  const reference = referenceSkeletonData || skeletonData;
  const selected = collectSkeletonPointSelection(selection, reference, skeletonData);
  if (!selected.length) return null;

  const originalLayerGlyph = cloneLayerGlyphForSkeletonEdit(layer);
  const synthetic = makeSyntheticSkeletonPathInstance(skeletonData, selected);
  const behaviorFactory = new EditBehaviorFactory(
    synthetic.instance,
    synthetic.selection
  );
  const syntheticBehavior = behaviorFactory.getBehavior(behaviorName);

  let rollbackChange = null;
  const makeChange = (method, argument) => {
    // 1. Run the regular point-behavior rules on the synthetic path. The
    //    behavior computes absolute coordinates from the captured originals,
    //    so applying its change to the synthetic instance per frame yields
    //    current-frame positions.
    applyChange(synthetic.instance, syntheticBehavior[method](argument));
    // 2. Copy EVERY mapped point position back onto the skeleton working copy
    //    (not only selected points — the rules move unselected neighbors too).
    const changes = makeEditSkeletonChange(originalLayerGlyph, (working) => {
      for (const [pointIndex, address] of synthetic.pointAddresses) {
        const target = resolveSkeletonAddressAcrossLayers(
          skeletonData,
          working,
          address.contourId,
          address.pointId
        );
        if (!target) continue;
        const [x, y] = synthetic.instance.path.getPointPosition(pointIndex);
        target.point.x = x;
        target.point.y = y;
      }
    });
    rollbackChange = changes.rollbackChange;
    return changes.change;
  };

  return {
    get rollbackChange() {
      return rollbackChange;
    },
    makeChangeForDelta(delta) {
      return makeChange("makeChangeForDelta", delta);
    },
    makeChangeForTransformation(transformation) {
      return makeChange("makeChangeForTransformation", transformation);
    },
  };
}

function collectSkeletonPointSelection(
  selection,
  referenceSkeletonData,
  targetSkeletonData
) {
  const { skeletonPoint } = parseSelection([...selection]);
  const selected = [];
  for (const item of skeletonPoint || []) {
    const { contourId, pointId } = parseSkeletonPointKey(item);
    const address = resolveSkeletonAddressAcrossLayers(
      referenceSkeletonData,
      targetSkeletonData,
      contourId,
      pointId
    );
    if (address) {
      selected.push({ contourId: address.contour.id, pointId: address.point.id });
    }
  }
  return selected;
}

function makeSyntheticSkeletonPathInstance(skeletonData, selected) {
  const path = new VarPackedPath();
  const pointAddresses = new Map(); // absolute path point index -> { contourId, pointId }
  const selection = new Set();
  const selectedKeys = new Set(
    selected.map((item) => `${item.contourId}/${item.pointId}`)
  );
  let pointIndex = 0;
  for (const contour of skeletonData.contours) {
    path.appendUnpackedContour({
      points: contour.points.map((point) => ({
        x: point.x,
        y: point.y,
        ...(point.type ? { type: point.type } : {}),
        ...(point.smooth ? { smooth: true } : {}),
      })),
      isClosed: contour.closed,
    });
    for (const point of contour.points) {
      pointAddresses.set(pointIndex, { contourId: contour.id, pointId: point.id });
      if (selectedKeys.has(`${contour.id}/${point.id}`)) {
        selection.add(`point/${pointIndex}`);
      }
      pointIndex++;
    }
  }
  return {
    instance: { path, components: [], anchors: [], guidelines: [] },
    selection,
    pointAddresses,
  };
}
```

Notes:

- `behaviorName` is fixed at entry construction (`getBehavior(behaviorName)`);
  when the pointer's behavior name changes mid-drag, entries are rebuilt from
  the same original layer state (Task 4 Step 3).
- Changes are relative to `originalLayerGlyph`, never the currently mutated
  layer glyph, so modifier switches and live drag frames stay rollback-safe.

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
  return !!parseSelection([...selection]).skeletonPoint?.length;
}
```

Use the existing `parseSelection` import from `@fontra/core/utils.ts`. Note:
`parseSelection` returns **arrays** (Task 0), so the check is `.length`, never
`.size`.

- [ ] **Step 2: Pass skeleton target entries from pointer drag setup**

In `edit-tools-pointer.js`, when constructing each `EditBehaviorFactory` inside `handleDragSelection()`, create a skeleton target entry for that layer and pass it through the generic target-entry option. Read the **edit layer's** skeleton data once before the loop and pass it as `referenceSkeletonData` to every layer's `makeSkeletonPointTargetEntry()`, so cross-layer ordinal resolution has a single reference (Global Constraints). Do not add a separate `_handleDragSkeletonPoints()` branch.

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
- `shiftGeneratedContourIndices(skeletonData, startIndex, delta)`.
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
