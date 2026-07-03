# WS-16 — Cross-Feature Integration and Parity Audit Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire skeleton into every remaining forkra feature surface — the transformation panel, the letterspacer, copy/cut/paste, decompose/delete, and cross-source interpolation — and run the final donor parity audit, so the skeleton feature reaches full `fd76d3abe` parity and the donor checkout can be deleted.

**Architecture:** WS-6…15 built the skeleton core, generator, rendering, editing pipeline (`editSkeleton`), drawing tool, ribs, editable-generated geometry, modifier behaviors, Tunni, and parameters panel. WS-16 adds **no new skeleton semantics**; it connects existing forkra features to the seams those workstreams produced. Every skeleton mutation in this workstream flows through WS-9 `editSkeleton` (C2). Transformation reuses the WS-9 `EditBehaviorFactory` skeleton target entry (C1/C2) — extended with a transform variant inside the factory, never a branch in `makeChangeForDelta`. Bounds and align/distribute resolve skeleton selection **ids** to coordinates through `skeleton-model.js` and WS-7 forward provenance (C3) — no geometric recovery. Clipboard carries skeleton data keyed by stable ids; paste re-allocates ids and regenerates through `editSkeleton`.

**Tech Stack:** `src-js/fontra-core/src/glyph-controller.js`, `src-js/fontra-core/src/skeleton-model.js` (WS-6), `src-js/views-editor/src/skeleton-editing.js` (WS-9), `skeleton-ribs.js` (WS-11), `skeleton-generated.js` (WS-12), `src-js/views-editor/src/edit-behavior.js` (`EditBehaviorFactory`), `panel-transformation.js`, `panel-letterspacer.js`, `panel-selection-info.js`, `editor.js`, `scene-controller.js`, `scene-model.js`; mocha/chai for core; `node --check`, `npx prettier --write`, `npm run bundle`; manual parity checks against donor `fd76d3abe`.

---

## Global Constraints

- **Branch:** implement on `refactor-simple/ws16-cross-feature-audit`, cut after WS-15 is merged. Frequent commits; never push unless asked.
- **Donor is read-only:** `./skeleton/` stays detached at `fd76d3abe66f5ea64ebde8fc245ef596b9270f5b`. Read the donor's cross-feature handlers (`panel-transformation.js`, `panel-letterspacer.js`, `editor.js` clipboard, `scene-controller.js` decompose) for **semantics only**. Never port their `getSkeletonData`/`setSkeletonData`/`regenerateSkeletonContours`/`moveSkeletonData` plumbing, their `SkeletonMovableObject`/`SkeletonEditBehavior` structure, or their index-keyed selection (`skeletonPoint/<contourIndex>/<pointIndex>`).
- **One skeleton write path (C2):** every skeleton data change goes through WS-9 `editSkeleton`. This workstream adds **zero** new call sites of the generator or `setSkeletonData`. Verify at each task and in the final rail greps.
- **No kind-branching in emit code (rail #7):** transformation of skeleton points happens through the WS-9 `EditBehaviorFactory` skeleton target entry, extended with a `makeChangeForTransformation` variant. No `if (skeleton…)` appears in `makeChangeForDelta` or below.
- **No geometric recovery (C3, rail #8):** bounds, align/distribute, and paste resolve skeleton geometry through `skeleton-model.js` accessors and WS-7 provenance keyed by stable **ids**. No tolerance-based inverse projection, no `_findHandlePositionsForRibPoint`-style coordinate matching.
- **Stable identity:** all skeleton selection keys are the WS-9/11/12 id-based kinds (`skeletonPoint/<contourId>/<pointId>`, `skeletonRib/<contourId>/<pointId>/<side>`, WS-12 editable-generated keys). Never construct index-based skeleton keys.
- **Parity target (§8):** every interaction matches the `fd76d3abe` state. Deviations only where they fix a donor bug or a rail forbids the donor's approach; each is written under **Deviations**.
- **Scope:** WS-16 owns transformation-on-skeleton, letterspacer↔skeleton coupling, copy/cut/paste/decompose/delete of skeleton, selection-info skeleton touchpoints, cross-source interpolation compatibility, and the final parity audit. It does **not** own drawing-tool contour actions (break/join/close/reverse/realize-projection — WS-10), rib/handle editing semantics (WS-11/12), modifier behaviors (WS-13), or panel numeric editing (WS-15); it only verifies those in the audit.

---

## Verified Current Context (forkra, this tree)

Grounded by grep/read on 2026-07-03. Line numbers are anchors, re-verify at implementation time (roadmap rule #1).

- **Skeleton is not yet landed.** No `src-js/**/*skeleton*` files exist in forkra today; WS-6…15 are plans. This plan targets the tree **after** WS-6…15 land and therefore references their produced interfaces. Every task begins with a **Step 0** that greps the landed symbol names and fails loudly if they differ (roadmap rules #1/#2). Do not trust the names below over the code the day you implement.
- **Transformation panel** — `src-js/views-editor/src/panel-transformation.js`:
  - `transformSelection(transformationForLayer, undoLabel)` (line ~940) parses `point/component/anchor/backgroundImage`, builds `new EditBehaviorFactory(layerGlyph, selection, …)` per layer, calls `behaviorFactory.getTransformBehavior("default")` and `editBehavior.makeChangeForTransformation(pinnedTransformation)`.
  - `moveObjects(moveDescriptor)` (line ~1144) → `_collectMovableObjects` (~1102) → `_splitSelection` (~1040) → `MovableObject` (~1234) whose `makeChangesForDelta` builds a factory and calls `getBehavior("default").makeChangeForDelta(delta)`.
  - `updateDimensions()` (~816) and the dimensions button (~375) use `glyph.getSelectionBounds(selection, getBackgroundImageBoundsFunc)`.
  - No skeleton awareness anywhere. Donor added `SkeletonMovableObject`/`SkeletonRibHandleMovableObject` classes and a `hasSkeletonPoints` branch — **not ported; superseded by the factory seam.**
- **`getSelectionBounds`** — `src-js/fontra-core/src/glyph-controller.js:754`. Parses `point/component/anchor/backgroundImage`; has no skeleton case. This is where skeleton-point/rib bounds resolution is added.
- **Letterspacer** — `src-js/views-editor/src/panel-letterspacer.js`: `applySpacing()` (~491) → `editGlyphAndRecordChanges` (~516); the `applyLSB` branch (~564) calls `this.shiftPath(layerGlyph.path, deltaLSB)` and **the skeleton-move branch was stripped by WS-5** (donor `fd76d3abe:panel-letterspacer.js:729-734` did `getSkeletonData → moveSkeletonData → setSkeletonData`). WS-16 restores the coupling through `editSkeleton`.
- **Copy/cut/paste** — `src-js/views-editor/src/editor.js`: `doCopy` (~1616), `doCut` path via `_prepareCopyOrCutLayers` (~1734), `_prepareCopyOrCut` (~1798), `_writeLayersToClipboard` (~1646), `doPaste` (~1904), `_pasteLayerGlyphs` (~2151), `doDelete` (~2259). Donor threaded `skeletonDataByLayer` through `_prepareCopyOrCut*` and `_writeLayersToClipboard` (`fd76d3abe:editor.js:1579-1700`), storing it in the clipboard JSON as `data.skeletonDataByLayer`.
- **Decompose** — `src-js/views-editor/src/scene-controller.js`: `doDecomposeSelectedComponents()` (~1785) uses `decomposeComponents` from `@fontra/core/glyph-controller.js`.
- **Selection-info** — `src-js/views-editor/src/panel-selection-info.js` hosts the sidebearings block and the embedded `LetterspacerPanel` (WS-5). Donor added a skeleton width-defaults summary here (`fd76d3abe:panel-selection-info.js`). WS-15 already owns the skeleton parameters panel; selection-info only needs skeleton-aware copy/dimension text where donor shows it.
- **Cleanup reference** (`origin/ref/cleanup`) parity docs live at `docs/refactor/PLAN-*.md` and `docs/refactor/REVIEW-phase-*.md` (read via `git -C skeleton show origin/ref/cleanup:docs/refactor/<file>`). There is no standalone matrix file; the interaction-by-interaction matrices are embedded inside those PLAN/REVIEW docs.

---

## Assumed WS-6…15 interfaces (verify in each Step 0)

These are the seams this plan builds on. Exact names are confirmed by Step 0 greps before use.

```javascript
// WS-9 skeleton-editing.js
editSkeleton(layerGlyph, mutate)            // in-place: mutates layerGlyph customData+path, regenerates, updates provenance
                                            //   (confirm whether it mutates in place inside an existing edit context,
                                            //    or returns a ChangeCollector; adapt call form in Step 0)
// WS-9 edit-behavior.js EditBehaviorFactory
factory.getBehavior(kind)                   // delta behavior, already skeleton-aware (target entry)
factory.getTransformBehavior(kind)          // transform behavior — WS-16 extends target entry to cover skeleton
// WS-6 skeleton-model.js
getSkeletonData(layerGlyph)                 // read canonical skeleton object (may be null)
translateSkeletonData(skeletonData, dx, dy) // pure translate of all skeleton point coords (add if absent)
transformSkeletonData(skeletonData, affine) // pure affine of all skeleton point coords (add if absent)
allocateSkeletonIds(skeletonData, nextIdRef)// re-key contour/point ids on paste (add if absent)
skeletonPointById(skeletonData, contourId, pointId)
// WS-7 provenance (emitted by generator; read-only lookups)
resolveGeneratedPoint(skeletonData, contourId, pointId, side, role) // provenance map lookup → path point index
// WS-11 skeleton-ribs.js / WS-12 skeleton-generated.js
parseSkeletonRibKey(key), parseEditableGeneratedKey(key)            // id-based selection parsers
```

If a needed pure helper (`translateSkeletonData`, `transformSkeletonData`, `allocateSkeletonIds`) does not exist after WS-6, **add it to `skeleton-model.js` with mocha tests** (Task 1) rather than inlining coordinate math in the editor.

---

## File Structure

```
src-js/fontra-core/src/
  skeleton-model.js                  [MODIFY] add translate/transform/allocateIds pure helpers if absent
  glyph-controller.js                [MODIFY] getSelectionBounds resolves skeleton selection ids
src-js/fontra-core/tests/
  test-skeleton-model.js             [MODIFY] tests for translate/transform/allocateIds

src-js/views-editor/src/
  edit-behavior.js                   [MODIFY] skeleton target entry gains transform variant (inside factory)
  panel-transformation.js            [MODIFY] skeleton movable objects; bounds via getSelectionBounds
  panel-letterspacer.js              [MODIFY] restore LSB→skeleton translate via editSkeleton
  editor.js                          [MODIFY] copy/cut/paste/delete carry skeleton by stable ids
  scene-controller.js                [MODIFY] decompose keeps skeleton consistent
  panel-selection-info.js            [MODIFY] skeleton-aware selection text where donor shows it (small)
```

---

## Task 1: Pure skeleton transform/translate/id-allocation helpers (TDD)

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-model.js`
- Modify: `src-js/fontra-core/tests/test-skeleton-model.js`

**Interfaces:**

```javascript
export function translateSkeletonData(skeletonData, dx, dy);      // returns new data; all point x/y + handle offsets shifted (offsets are translation-invariant → unchanged)
export function transformSkeletonData(skeletonData, affine);      // returns new data; point coords through affine; handle offsets through the affine's linear part
export function allocateSkeletonIds(skeletonData, nextId);        // returns { data, nextId }; re-keys every contour.id/point.id, remaps provenance references
```

- [ ] **Step 0: Verify WS-6 landed model**

```bash
cd src-js/fontra-core
rg -n "export function (get|set|translate|transform|allocate)Skeleton" src/skeleton-model.js
```

If `translateSkeletonData`/`transformSkeletonData`/`allocateSkeletonIds` already exist, skip to using them (export aliases if names differ) and only add missing tests. Confirm the canonical field names (`points[].x/y`, `handleOffsets`, `contour.id`, `point.id`, `nextId`) against the actual schema — adapt below to the landed names.

- [ ] **Step 1: Write failing tests**

Cover:

```text
translate shifts every point x/y by (dx, dy)
translate leaves widths/nudges/handleOffsets unchanged (offsets are relative → invariant)
transform applies affine to point coords (scale, rotate, skew, flip)
transform applies only the linear part (a,b,c,d) to handleOffsets, not the translation (e,f)
transform of a flip (scale -1,1) negates x offsets correctly
allocateSkeletonIds gives every contour and point a fresh id from nextId upward
allocateSkeletonIds returns the advanced nextId
allocateSkeletonIds rewrites provenance skeletonContourId/skeletonPointId to the new ids
allocateSkeletonIds preserves geometry and closed/singleSided/defaultWidth
```

Use the WS-6 schema constructors from the existing test file. Reuse `Transform` from `@fontra/core/transform.js` for affine fixtures.

- [ ] **Step 2: Run — verify failure**

```bash
cd src-js/fontra-core
npm test -- test-skeleton-model.js
```

- [ ] **Step 3: Implement the helpers**

- `translateSkeletonData`: deep-copy, add `dx/dy` to each `point.x/point.y`. Leave `handleOffsets`, `width`, `nudge` untouched (they are relative to the point).
- `transformSkeletonData`: deep-copy; for each point compute `[x, y] = affine.transformPoint(x, y)`; for each handle offset apply only the linear part — build `linear = new Transform(a, b, c, d, 0, 0)` from `affine` and `transformPoint` the offset vector.
- `allocateSkeletonIds`: deep-copy; walk contours/points assigning `id = nextId++`; build an `oldId→newId` map; rewrite the `generated[]` provenance entries' `skeletonContourId` and each `pointMap` entry's `skeletonPointId`; set `data.nextId = nextId`; return `{ data, nextId }`.

Compose from existing WS-6 accessors; do not duplicate coordinate helpers that already exist.

- [ ] **Step 4: Run and commit**

```bash
cd src-js/fontra-core
npm test -- test-skeleton-model.js
cd ../..
npx prettier --write src-js/fontra-core/src/skeleton-model.js src-js/fontra-core/tests/test-skeleton-model.js
git add .
git commit -m "feat(skeleton): pure translate/transform/id-allocation helpers"
```

---

## Task 2: `getSelectionBounds` resolves skeleton selection ids

**Files:**
- Modify: `src-js/fontra-core/src/glyph-controller.js`
- Modify: `src-js/fontra-core/tests/test-skeleton-model.js` (or a bounds test file if one exists)

**Interfaces:**
- Consumes: `getSkeletonData(this.instance)`, WS-11 `parseSkeletonRibKey`, WS-12 `parseEditableGeneratedKey`, WS-7 provenance lookups.
- Produces: `getSelectionBounds` returns a rect that includes selected `skeletonPoint`, `skeletonRib`, and editable-generated addresses.

- [ ] **Step 0: Verify selection kinds + provenance readers**

```bash
rg -n "skeletonPoint/|skeletonRib/|editableGenerated" src-js/views-editor/src/skeleton-editing.js src-js/views-editor/src/skeleton-ribs.js src-js/views-editor/src/skeleton-generated.js
rg -n "export function (parseSkeletonRibKey|parseEditableGeneratedKey|resolveGeneratedPoint|skeletonPointById)" src-js/fontra-core/src src-js/views-editor/src
```

Confirm the exact key grammar and where the parsers live (core vs views-editor). If parsers live in `views-editor`, add a tiny pure resolver to `skeleton-model.js` (core) instead, since `glyph-controller.js` is core and must not import from `views-editor`.

- [ ] **Step 1: Write failing bounds test**

Given a fixture skeleton with known point coordinates, assert:

```text
selection {skeletonPoint/<cId>/<pId>} → bounds is the point's coordinate rect
selection of two skeleton points → union rect
selection {skeletonRib/<cId>/<pId>/left} → rib endpoint coordinate rect (from generated provenance, not projection)
mixed {point/0, skeletonPoint/<cId>/<pId>} → union of path point and skeleton point
```

Build the controller the way the existing WS-6/8 fixtures do (a static glyph controller with skeleton customData + generated contours).

- [ ] **Step 2: Run — verify failure**

- [ ] **Step 3: Implement skeleton branches in `getSelectionBounds`**

Extend the `parseSelection` destructure with `skeletonPoint`, `skeletonRib`, and the WS-12 editable-generated kinds. For each:

```text
skeletonPoint/<cId>/<pId> -> skeletonPointById() -> centeredRect(x, y, 0)
skeletonRib/<cId>/<pId>/<side> -> resolve the rib endpoint via WS-7 provenance
                                  (map skeleton point id+side+role "onCurve" to a generated path point index,
                                   read that path point's coord) -> centeredRect(x, y, 0)
editableGenerated... -> resolve via WS-12 provenance helper to a generated path point coord
```

Resolution is **always** a provenance-map/model lookup (C3). Never re-derive the rib endpoint by projecting the skeleton point. If `getSkeletonData(this.instance)` is null, the skeleton keys contribute nothing (defensive, matches empty selection behavior).

- [ ] **Step 4: Run and commit**

```bash
cd src-js/fontra-core
npm test
cd ../..
npx prettier --write src-js/fontra-core/src/glyph-controller.js src-js/fontra-core/tests/test-skeleton-model.js
node --check src-js/fontra-core/src/glyph-controller.js
git add .
git commit -m "feat(skeleton): selection bounds resolve skeleton ids via provenance"
```

---

## Task 3: Transform behavior for the skeleton factory target entry

**Files:**
- Modify: `src-js/views-editor/src/edit-behavior.js`

**Interfaces:**
- Consumes: WS-9 skeleton target entry in `EditBehaviorFactory`, WS-6 `transformSkeletonData` (Task 1), WS-9 `editSkeleton`.
- Produces: `factory.getTransformBehavior(kind)` returns a behavior whose `makeChangeForTransformation(transform)` covers skeleton selections and yields one combined change with rollback.

- [ ] **Step 0: Verify WS-9 factory shape**

```bash
rg -n "getTransformBehavior|getBehavior|makeChangeForTransformation|skeleton" src-js/views-editor/src/edit-behavior.js
rg -n "editSkeleton|targetEntr|working copy|recompute" src-js/views-editor/src/skeleton-editing.js
```

Establish exactly how WS-9 registered the skeleton target entry (the "working-copy + recompute hook" from C2) and whether `getTransformBehavior` already iterates the same target entries as `getBehavior`. If it does, the transform variant may already fall out for free — verify by reading, and if so this task shrinks to a test/assertion.

- [ ] **Step 1: Extend the skeleton target entry with a transform path**

Inside the factory's skeleton target-entry construction (WS-9 code), add a `makeChangeForTransformation(transform)` implementation that:

```text
reads the working-copy skeleton data
applies transformSkeletonData(workingCopy, transform) to the selected skeleton points only
  (respect the same selection→point-id resolution WS-9 uses for delta)
runs the WS-9 recompute hook (regenerate generated contours)
returns the same combined {customData + path} change + rollback that the delta path returns
```

The kind decision (skeleton vs path) stays at target-entry construction (rail #7). Do **not** add `if (skeleton…)` to `makeChangeForDelta`/`makeChangeForTransformation` in the shared/path emit code — the skeleton entry is a peer target that owns its own `makeChangeForTransformation`.

Transform of a **partial** selection: only selected skeleton on-curve points move; per parity, a selected on-curve point carries its own handles/rib the same way a path point carries its handles under transform (match the WS-9 delta rule for what a skeleton point drag moves).

- [ ] **Step 2: Verify parse + no forbidden branches**

```bash
node --check src-js/views-editor/src/edit-behavior.js
rg -n "getSkeletonData|setSkeletonData|regenerateSkeletonContours|generateContoursFromSkeleton" src-js/views-editor/src/edit-behavior.js
```

Expected: the factory calls only `editSkeleton`/the WS-9 recompute hook; no direct generator or `setSkeletonData` calls; no skeleton branch in `makeChangeForDelta` body.

- [ ] **Step 3: Commit**

```bash
npx prettier --write src-js/views-editor/src/edit-behavior.js
git add .
git commit -m "feat(skeleton): transform variant on factory skeleton target entry"
```

---

## Task 4: Transformation panel operates on skeleton selections

**Files:**
- Modify: `src-js/views-editor/src/panel-transformation.js`

**Interfaces:**
- Consumes: Task 2 `getSelectionBounds` (skeleton-aware), Task 3 `getTransformBehavior`, WS-9 `getBehavior`, id-based skeleton selection kinds.
- Produces: scale/rotate/skew/flip/move/dimensions and align/distribute work when the selection contains skeleton points.

- [ ] **Step 0: Verify skeleton selection grammar**

```bash
rg -n "skeletonPoint/|skeletonRib/" src-js/views-editor/src/scene-model.js src-js/views-editor/src/skeleton-editing.js
```

- [ ] **Step 1: `transformSelection` — include skeleton in the guard and bounds**

The transform loop already builds `new EditBehaviorFactory(layerGlyph, selection, …)` and calls `getTransformBehavior`/`makeChangeForTransformation`. With Task 3 the factory handles skeleton entries, and with Task 2 `getSelectionBounds` returns skeleton-inclusive bounds, so `transformSelection` needs only:

```text
add skeletonPoint (and skeletonRib if the panel transforms ribs) to the early-return guard so a
  skeleton-only selection is not treated as empty
```

Do not add per-object skeleton branches; the factory owns dispatch.

- [ ] **Step 2: `moveObjects`/`_splitSelection`/`_collectMovableObjects` — skeleton movable objects**

Align/distribute treat each object as an independent selection whose bounds and delta are computed separately. Construct skeleton movable objects **at collection time** (rail #7):

```text
_splitSelection: also parse skeletonPoint keys; group skeleton points by contour the same way
  path points are grouped, OR treat each selected skeleton point as its own movable object,
  matching the donor's per-point behavior (verify donor grouping semantics in fd76d3abe first).
_collectMovableObjects: push a MovableObject whose selection Set holds the id-based skeleton key(s).
MovableObject.computeBounds: already delegates to getSelectionBounds → skeleton-aware via Task 2.
MovableObject.makeChangesForDelta: builds EditBehaviorFactory + getBehavior("default").makeChangeForDelta
  → skeleton-aware via WS-9. No skeleton branch needed inside MovableObject.
```

If `MovableObject.makeChangesForDelta` cannot express the combined skeleton change through the existing factory `getBehavior` (e.g. it needs the recompute hook), route skeleton movable objects through the same WS-9 behavior the drag path uses — do not reintroduce `SkeletonMovableObject`+`setSkeletonData` from the donor.

- [ ] **Step 3: `updateDimensions` + dimensions button**

These already call `getSelectionBounds`; with Task 2 they include skeleton points automatically. Confirm the dimension **scale** applies through `transformSelection` (Task 1/3) so resizing a skeleton-only selection regenerates outlines.

- [ ] **Step 4: Verify**

```bash
node --check src-js/views-editor/src/panel-transformation.js
rg -n "getSkeletonData|setSkeletonData|regenerateSkeletonContours|SkeletonMovableObject|skeletonPoint/\\$\\{.*Index" src-js/views-editor/src/panel-transformation.js
```

Expected: no direct skeleton persistence, no donor movable-object classes, no index-keyed skeleton selection.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src-js/views-editor/src/panel-transformation.js
git add .
git commit -m "feat(skeleton): transformation panel operates on skeleton selections"
```

---

## Task 5: Restore letterspacer ↔ skeleton coupling

**Files:**
- Modify: `src-js/views-editor/src/panel-letterspacer.js`

**Interfaces:**
- Consumes: WS-9 `editSkeleton`, WS-6 `translateSkeletonData` (Task 1), WS-6 `getSkeletonData`.
- Produces: applying LSB shifts skeleton data by the same delta, in one undo step.

- [ ] **Step 0: Verify editSkeleton call form**

```bash
rg -n "export function editSkeleton|editSkeleton\\(" src-js/views-editor/src/skeleton-editing.js
```

Determine whether `editSkeleton(layerGlyph, mutate)` mutates in place (usable inside the existing `editGlyphAndRecordChanges` callback at line ~517) or returns a `ChangeCollector` (needs merging). Adapt Step 1 accordingly.

- [ ] **Step 1: Re-add the skeleton branch (redesigned)**

The donor did, inside its edit callback (`fd76d3abe:panel-letterspacer.js:728-734`):

```javascript
const skeletonData = getSkeletonData(layer);
if (skeletonData && deltaLSB) {
  const newSkeletonData = JSON.parse(JSON.stringify(skeletonData));
  moveSkeletonData(newSkeletonData, deltaLSB, 0);
  setSkeletonData(layer, newSkeletonData);
}
```

WS-16 replaces this with an `editSkeleton`-routed translate, at `panel-letterspacer.js` ~566 right after `this.shiftPath(layerGlyph.path, deltaLSB)`:

```javascript
if (this.params.applyLSB) {
  const deltaLSB = roundedLSB - currentLSB;
  this.shiftPath(layerGlyph.path, deltaLSB);
  if (deltaLSB && getSkeletonData(layerGlyph)) {
    // in-place form (confirm in Step 0): mutate skeleton customData + regenerate through the one write path
    editSkeleton(layerGlyph, (skeletonData) => translateSkeletonData(skeletonData, deltaLSB, 0));
  }
}
```

Because `shiftPath` already moved the **generated** path contours, `editSkeleton`'s regenerate must be consistent with that shift (translating the skeleton by the same delta reproduces the same generated geometry). Confirm in the manual matrix that generated outlines are not double-shifted; if `editSkeleton`'s regenerate overwrites the generated contours from scratch, drop the `shiftPath` effect on generated contours by letting the regenerate own them (verify which contours `shiftPath` touches vs which the generator owns, and document the resolution under Deviations if it differs from donor).

Add the imports at the top: `editSkeleton` from `./skeleton-editing.js`, `getSkeletonData`/`translateSkeletonData` from `@fontra/core/skeleton-model.js`. This re-introduces skeleton references that WS-5 stripped — that is the intended WS-16 change.

- [ ] **Step 2: Verify**

```bash
node --check src-js/views-editor/src/panel-letterspacer.js
rg -n "moveSkeletonData|setSkeletonData|skeleton-contour-generator" src-js/views-editor/src/panel-letterspacer.js
```

Expected: coupling present through `editSkeleton`/`translateSkeletonData`; **no** donor `moveSkeletonData`/`setSkeletonData`/`skeleton-contour-generator` import.

- [ ] **Step 3: Commit**

```bash
npx prettier --write src-js/views-editor/src/panel-letterspacer.js
git add .
git commit -m "feat(skeleton): letterspacer LSB shift moves skeleton via editSkeleton"
```

---

## Task 6: Copy / cut / paste / delete of skeleton data

**Files:**
- Modify: `src-js/views-editor/src/editor.js`

**Interfaces:**
- Consumes: WS-6 `getSkeletonData`, `allocateSkeletonIds` (Task 1); WS-9 `editSkeleton`.
- Produces: clipboard round-trips skeleton data keyed by stable ids; paste re-allocates ids and regenerates; cut/delete stay consistent.

- [ ] **Step 0: Verify clipboard + editSkeleton shape**

```bash
rg -n "_prepareCopyOrCut\\b|_prepareCopyOrCutLayers|_writeLayersToClipboard|_pasteLayerGlyphs|skeletonDataByLayer" src-js/views-editor/src/editor.js
rg -n "getSkeletonData|editSkeleton" src-js/views-editor/src/skeleton-editing.js src-js/fontra-core/src/skeleton-model.js
```

- [ ] **Step 1: Carry skeleton through copy/cut**

Mirror the donor's data path (`fd76d3abe:editor.js`) but with canonical data and ids:

```text
_prepareCopyOrCut / _prepareCopyOrCutLayers: also collect getSkeletonData(layerGlyph) per layer into
  skeletonDataByLayer (deep-copied, canonical schema with ids).
_writeLayersToClipboard: when skeletonDataByLayer is non-empty, set jsonObject.data.skeletonDataByLayer.
```

Only the `fontra-json` / `web fontra/json-clipboard` clipboard format carries skeleton (glif/plain-text cannot). This matches the donor.

- [ ] **Step 2: Paste skeleton with fresh ids through `editSkeleton`**

In `_pasteLayerGlyphs` (and the paste flow that reads `data.skeletonDataByLayer`):

```text
for each pasted layer that has skeleton data:
  allocateSkeletonIds(pastedSkeleton, targetGlyph.nextId) so pasted ids never collide with existing ones
  apply through editSkeleton(layerGlyph, (skeletonData) => mergePastedContours(skeletonData, reIdedContours))
    so contours + provenance + generated outlines are produced by the one write path.
```

If paste replaces the whole glyph (empty target), the merge is "set contours"; if paste adds to an existing skeleton, append the re-id'd contours. Never write skeleton customData or call the generator directly — `editSkeleton` owns both.

- [ ] **Step 3: Cut / delete consistency**

```text
Cut = copy + delete: the delete side already removes selected path points; ensure a skeleton point in
  the selection is removed through the WS-9/WS-10 skeleton deletion path (confirm WS-10 exposed a
  deleteSkeletonPoints-equivalent that routes through editSkeleton), not by touching customData here.
doDelete: a selection of skeleton points deletes those skeleton points (via the WS-9/10 helper) and lets
  editSkeleton regenerate. A whole-contour delete removes the skeleton contour + its generated contour
  atomically through editSkeleton.
```

If WS-9/WS-10 did not expose a skeleton-delete entry point, this task adds only the **wiring** from `doDelete` to that entry point; it does not implement deletion semantics (those are WS-9/10). If neither exists, record it as a roadmap gap (Task 8) rather than inventing a second write path here.

- [ ] **Step 4: Verify**

```bash
node --check src-js/views-editor/src/editor.js
rg -n "setSkeletonData|regenerateSkeletonContours|generateContoursFromSkeleton" src-js/views-editor/src/editor.js
```

Expected: skeleton paste/delete go through `editSkeleton`; no direct generator/`setSkeletonData`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src-js/views-editor/src/editor.js
git add .
git commit -m "feat(skeleton): copy/cut/paste/delete carry skeleton by stable ids"
```

---

## Task 7: Decompose + selection-info touchpoints

**Files:**
- Modify: `src-js/views-editor/src/scene-controller.js`
- Modify: `src-js/views-editor/src/panel-selection-info.js`

**Interfaces:**
- Consumes: WS-6 `getSkeletonData`, WS-9 `editSkeleton`.
- Produces: decompose leaves skeleton data coherent; selection-info shows skeleton-aware text where donor does.

- [ ] **Step 0: Verify decompose + selection-info shape**

```bash
rg -n "doDecomposeSelectedComponents|decomposeComponents" src-js/views-editor/src/scene-controller.js
git -C skeleton show fd76d3abe:src-js/views-editor/src/scene-controller.js | rg -n -i "decompose.*skeleton|skeleton.*decompose"
git -C skeleton show fd76d3abe:src-js/views-editor/src/panel-selection-info.js | rg -n -i "skeleton"
```

- [ ] **Step 1: Decompose semantics (parity)**

Determine from the donor what decompose does to skeleton data:

```text
- A decomposed component contributes only its baked outline to the parent path.
- If the donor drops/keeps skeleton data on decompose, match it. Most likely: decompose of a component
  does not import the component's skeleton (skeleton is per-glyph customData, not baked into components),
  so the parent glyph's own skeleton must survive decompose unchanged.
```

Ensure `doDecomposeSelectedComponents` does not clobber the parent's `fontra.internal.skeleton` customData when it rewrites the path. If decompose currently rebuilds the layer path in a way that would strand generated contours, route the path rebuild so the skeleton's generated contours are preserved/regenerated through `editSkeleton` (or explicitly excluded and documented). Verify against donor behavior; if the donor simply leaves skeleton untouched, the only requirement is "do not lose the customData."

- [ ] **Step 2: Selection-info text**

Where the donor `panel-selection-info.js` shows skeleton-aware selection/dimension text, mirror only the **display** (WS-15 owns the skeleton parameters panel; do not duplicate numeric editing here). Keep this minimal: skeleton points in the selection should not break the existing selection count / dimensions readout.

- [ ] **Step 3: Verify**

```bash
node --check src-js/views-editor/src/scene-controller.js
node --check src-js/views-editor/src/panel-selection-info.js
rg -n "setSkeletonData|regenerateSkeletonContours" src-js/views-editor/src/scene-controller.js src-js/views-editor/src/panel-selection-info.js
```

- [ ] **Step 4: Commit**

```bash
npx prettier --write src-js/views-editor/src/scene-controller.js src-js/views-editor/src/panel-selection-info.js
git add .
git commit -m "feat(skeleton): keep skeleton coherent on decompose + selection-info"
```

---

## Task 8: Multi-source / interpolation compatibility

**Files:**
- Modify: `src-js/fontra-core/tests/test-skeleton-model.js` (or a new `test-skeleton-interpolation.js`)
- Modify: source files only if the audit finds a concrete incompatibility.

**Interfaces:**
- Consumes: WS-7 `generateFromSkeleton`, WS-6 schema.
- Produces: a test asserting generated contours stay interpolation-compatible (equal point counts + order + on/off pattern) across sources whose skeletons are structurally compatible.

- [ ] **Step 0: Understand donor interpolation behavior**

```bash
git -C skeleton show origin/ref/cleanup:docs/refactor/PLAN-unified-factory-rerefactor.md | rg -n -i "interpolat|compatib|point count"
rg -n "interpolat|compatib" src-js/fontra-core/src/skeleton-generator.js
```

The roadmap (§10) flags interpolation as under-specified in the donor. Decide: **match donor** (whatever it does) or **specify better** (guarantee compatible output for compatible skeletons). Default to specifying: two sources with the same skeleton contour/point structure must generate contours with identical point counts and on/off-curve order so Fontra interpolation works.

- [ ] **Step 1: Golden test for cross-source compatibility**

```text
Build two skeletons that are structurally identical (same contour/point ids and types) but with
  different coordinates (a "designspace" pair).
generateFromSkeleton each; assert:
  - same number of generated contours
  - matching contour closed flags
  - per generated contour: identical point counts and identical on/off-curve type sequence
Add a second case where widths differ but structure matches → still compatible.
Add a negative case where structures differ (extra point) → documents the incompatibility explicitly.
```

- [ ] **Step 2: Fix generator only if a compatibility gap is found**

If the generator emits variable point counts for structurally identical skeletons (e.g. caps/joins that add points conditionally on coordinates), that is an interpolation bug. Fix minimally in `skeleton-generator.js`, or, if the fix is large, record it as an explicit exclusion in the audit (Task 9) and file it as a roadmap follow-up — do not pull a redesign into WS-16.

- [ ] **Step 3: Run and commit**

```bash
cd src-js/fontra-core
npm test
cd ../..
npx prettier --write src-js/fontra-core/tests/test-skeleton-model.js
git add .
git commit -m "test(skeleton): cross-source generated-contour interpolation compatibility"
```

---

## Task 9: Final parity audit, rail greps, and manual matrix

**Files:**
- Create: `docs/superpowers/notes/ws16-parity-audit.md` (audit record — gaps filed as fixes or explicit exclusions)
- Verify all WS-6…16 surfaces.

- [ ] **Step 1: Automated checks**

```bash
cd src-js/fontra-core
npm test
cd ../..
node --check src-js/fontra-core/src/glyph-controller.js
node --check src-js/views-editor/src/edit-behavior.js
node --check src-js/views-editor/src/panel-transformation.js
node --check src-js/views-editor/src/panel-letterspacer.js
node --check src-js/views-editor/src/editor.js
node --check src-js/views-editor/src/scene-controller.js
node --check src-js/views-editor/src/panel-selection-info.js
npm run bundle
```

- [ ] **Step 2: Rail greps (must all pass)**

```bash
# (a) Exactly one generator write path — no generator/setSkeletonData call sites outside skeleton-editing.js
rg -n "regenerateSkeletonContours|generateContoursFromSkeleton|setSkeletonData" src-js/views-editor/src src-js/fontra-core/src | rg -v "skeleton-editing.js|skeleton-generator.js"
# (b) No donor cross-feature plumbing
rg -n "moveSkeletonData|SkeletonMovableObject|SkeletonRibHandleMovableObject|_findHandlePositionsForRibPoint|skeleton-contour-generator" src-js/views-editor/src src-js/fontra-core/src
# (c) No index-based skeleton selection keys anywhere
rg -n "skeletonPoint/\\$\\{.*Index|skeletonRib/\\$\\{.*Index|editableGenerated(Point|Handle)/\\$\\{.*Index" src-js/views-editor/src
# (d) No skeleton branch inside shared emit code
rg -n "skeleton" src-js/views-editor/src/edit-behavior.js | rg -i "makeChangeForDelta"
```

Expected: (a) empty, (b) empty, (c) empty, (d) no skeleton reference inside `makeChangeForDelta` body (skeleton lives only in the target-entry construction).

- [ ] **Step 3: Walk the donor parity matrices**

For each cross-feature interaction documented in the donor, verify forkra matches `fd76d3abe`. Read the matrices from:

```bash
git -C skeleton show origin/ref/cleanup:docs/refactor/PLAN-unified-factory-rerefactor.md
git -C skeleton show origin/ref/cleanup:docs/refactor/PLAN-pointer-cleanup-and-hittest-relocation.md
git -C skeleton show origin/ref/cleanup:docs/refactor/REVIEW-phase-6-mixed-selection-plan.md
git -C skeleton show origin/ref/cleanup:docs/refactor/REVIEW-phase-7-tunni-consolidation.md
```

Record every checked interaction in `docs/superpowers/notes/ws16-parity-audit.md` with pass / deviation / exclusion. Any gap becomes either a fix in this workstream or an explicit, justified exclusion in that file.

- [ ] **Step 4: Manual editor matrix (forkra vs donor `fd76d3abe` side by side)**

Use a WS-10-created multi-source skeleton glyph.

```text
transformation — skeleton selection:
  select skeleton points only; scale from center/left/right → skeleton points scale, generated outline follows, one undo
  rotate skeleton selection → points rotate, handles rotate consistently, generated follows
  skew / flip vertically / flip horizontally → parity with donor
  move by X/Y numeric → parity
  set dimensions (width/height) on skeleton-only selection → scales, generated follows
  mixed selection (path points + skeleton points) → both transform together, one undo
  align left/center/right, top/middle/bottom on skeleton points → parity
  distribute horizontally/vertically on skeleton points (with and without custom spacing) → parity
  transform partial selection (some skeleton points) → only selected move; others fixed

letterspacer ↔ skeleton:
  glyph with skeleton; Apply LSB with a positive delta → path AND skeleton shift by the same delta; generated outline stays aligned; one undo
  Apply LSB with negative delta → symmetric
  Apply RSB only → xAdvance changes, skeleton unchanged (RSB does not move geometry)
  Apply LSB+RSB together → skeleton shifts by LSB delta only; RSB adjusts advance
  undo restores both path and skeleton; save/reload persists shifted skeleton

copy / cut / paste:
  copy a glyph with skeleton, paste into an empty glyph → skeleton appears with fresh ids; generated outline regenerates; editable
  paste into a glyph that already has skeleton → contours append with non-colliding ids; both selectable
  cut (copy+delete) a skeleton contour → removed from source; pasteable
  paste via plain-text/glif clipboard format → no skeleton (expected; only json format carries it)
  undo paste removes pasted skeleton contours cleanly

delete:
  delete selected skeleton points → points removed, generated outline regenerates, one undo
  delete a whole skeleton contour → skeleton contour + generated contour removed atomically

decompose:
  decompose a component in a glyph that has its own skeleton → parent skeleton survives unchanged; generated outline intact
  (match whatever donor does; record the observed donor behavior in the audit note)

interpolation:
  two sources with structurally identical skeletons, different coordinates → interpolate the glyph across the axis;
    generated outlines interpolate without "incompatible" errors
  edit width in one source → still interpolates (structure unchanged)

regression (no skeleton present):
  transformation, letterspacer, copy/paste, decompose on a plain glyph behave exactly as before WS-16
```

- [ ] **Step 5: Commit audit + any fixes**

```bash
git add docs/superpowers/notes/ws16-parity-audit.md
git commit -m "docs(skeleton): WS-16 cross-feature parity audit"
# plus focused commits for any parity fixes the audit produced
```

---

## Deviations

- **Transformation of skeleton points** is implemented through the WS-9 `EditBehaviorFactory` skeleton target entry (extended with a transform variant), not the donor's `SkeletonMovableObject`/`SkeletonEditBehavior`/`regenerateSkeletonContours`/`setSkeletonData` classes. Visible behavior matches `fd76d3abe`; the plumbing is the forkra factory seam (C1/C2).
- **Bounds and align/distribute** resolve skeleton geometry through `skeleton-model.js` + WS-7 provenance keyed by ids, replacing the donor's `getSkeletonData` coordinate reads and any inverse projection (C3).
- **Letterspacer LSB→skeleton** uses `editSkeleton(layerGlyph, translateSkeletonData(...))` instead of the donor's `moveSkeletonData`+`setSkeletonData` (C2). If the interaction of `shiftPath` (path) and `editSkeleton`'s regenerate double-moves generated contours, the regenerate owns the generated contours and the resolution is documented here at implementation time.
- **Paste** re-allocates skeleton ids (`allocateSkeletonIds`) so pasted ids never collide — the donor kept raw indices and had no id facility; ids are the WS-6 load-bearing change (§5).
- **Decompose** matches the donor's observed treatment of skeleton (recorded in the audit note); the only hard requirement is that the parent glyph's skeleton customData is never silently lost.
- **Interpolation** is *specified* (structurally identical skeletons produce compatible generated contours) rather than merely matched, per roadmap §10's option to "specify better." Any generator gap too large to fix in WS-16 is filed as an explicit exclusion in the audit note.
- **Drawing-tool contour actions** (break/join/close/reverse/realize-projection) and **skeleton handle label checkboxes** in the transformation panel are **not** in WS-16 scope: the former are WS-10, the latter are WS-14/15 surfaces. They are only verified in the audit.

---

## Acceptance Criteria

- The transformation panel scales/rotates/skews/flips/moves and aligns/distributes skeleton selections, with parity to donor `fd76d3abe`, through the WS-9 factory seam — no new generator call sites.
- `getSelectionBounds` returns skeleton-inclusive bounds resolved from stable ids + provenance, with tests.
- Applying LSB in the letterspacer shifts skeleton data by the same delta through `editSkeleton`, in one undo step, persisting across save/reload.
- Copy/cut/paste round-trips skeleton data by stable ids through the json clipboard; paste re-allocates ids and regenerates via `editSkeleton`; delete/decompose keep skeleton coherent.
- Cross-source generated contours are interpolation-compatible for structurally identical skeletons (tested).
- The parity audit note exists and records every cross-feature interaction as pass / deviation / exclusion.
- Rail greps pass: (a) no generator/`setSkeletonData` call sites outside `skeleton-editing.js`/`skeleton-generator.js`; (b) no donor cross-feature plumbing (`moveSkeletonData`, `SkeletonMovableObject`, `_findHandlePositionsForRibPoint`, `skeleton-contour-generator` import); (c) no index-keyed skeleton selection; (d) no skeleton branch inside `makeChangeForDelta`.
- Non-skeleton transformation/letterspacer/copy-paste/decompose behavior is unchanged.
- `npm test` and `npm run bundle` pass.

---

## Self-Review

- **Spec coverage:** all five WS-16 roadmap bullets are covered — transformation (Tasks 2–4), letterspacer coupling (Task 5), selection-info/copy/paste/decompose/delete (Tasks 6–7), multi-source/interpolation (Task 8), final parity audit (Task 9).
- **Architecture rails:** every skeleton mutation routes through `editSkeleton` (C2); transformation reuses the factory target entry with kind decided at construction (rail #7); bounds/align/paste use ids + provenance, no geometric recovery (C3, rail #8); pure geometry (`translate/transform/allocateIds`) lives in `fontra-core` and is mocha-tested (rail #9).
- **Donor discipline:** donor cross-feature handlers are read for semantics; their `setSkeletonData`/`moveSkeletonData`/movable-object plumbing and index selection are explicitly rejected and grep-guarded.
- **Scope check:** drawing-tool contour actions (WS-10), rib/handle/modifier/Tunni/panel semantics (WS-11–15) are verified in the audit, not reimplemented. Interpolation is specified with a defined fallback (exclusion note) so it can't balloon.
- **Grounding:** written against WS-6…15's produced interfaces; every task opens with a Step 0 grep that fails loudly if the landed symbol names differ from this plan (roadmap rules #1/#2), because the skeleton modules do not exist in the tree yet.
```