# WS-12 - Skeleton Editable Generated Geometry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated outline points and handles editable when their source skeleton side is marked editable, using WS-7 provenance to resolve every generated path point back to its skeleton source.

**Architecture:** Editable generated geometry is a C4 gizmo surface over generated path points. Hit-testing starts on the visible generated path, resolves the path point through `skeletonData.generated[*].pointMap`, and stores stable skeleton-space selection keys. Generated on-curve drags reuse WS-11 rib executors. Generated handle drags update canonical `point.handleOffsets` through WS-9 `editSkeleton`. No donor geometric reverse matching is ported.

**Tech Stack:** WS-6 canonical skeleton schema, WS-7 provenance entries, WS-9 `editSkeleton` target entries, WS-11 rib executors, `src-js/views-editor/src/scene-model.js`, `edit-tools-pointer.js`, `scene-controller.js`, `visualization-layer-skeleton.js`, `edit-behavior.js`, `node --check`, `npx prettier --write`, `npm run bundle`, and manual parity checks against donor `fd76d3abe`.

---

## Global Constraints

- **Branch:** implement on `refactor-simple/ws12-skeleton-editable-generated`, cut after WS-11 is merged.
- **Donor is read-only:** `./skeleton/` stays detached at `fd76d3abe`. Read donor editable-generated handlers for semantics only; never port index routing, direct persistence, or geometric lookup helpers.
- **One write path:** all mutations call `editSkeleton(layerGlyph, mutate)`. Do not call the generator or write skeleton customData outside WS-9's editing helper.
- **Selection keys carry skeleton-space identity only (C3):**
  - `editableGeneratedPoint/<contourId>/<pointId>/<side>`
  - `editableGeneratedHandle/<contourId>/<pointId>/<side>/<role>`
  Path addresses (`pathContourIndex`/`pathPointIndex`) are **never** part of a
  selection key — they change on regeneration. The current path address is a
  lookup through `skeletonData.generated[*].pointMap` at use time (hit result,
  drag-start geometry), so selection stays valid across regeneration by
  construction.
- **No geometric recovery:** do not port donor `_getEditableRibPointForGeneratedPoint()`, `_getEditableHandleForGeneratedPoint()`, `_findHandlesForRibPointFromSkeleton()`, or any `pointIndexNearPoint()` source recovery.
- **Canonical schema only:** editable flags are `point.editable.left/right`; handle offsets are `point.handleOffsets.leftIn/leftOut/rightIn/rightOut = { x, y, detached }`. Do not write donor flat fields such as `leftHandleInOffsetX`.
- **Scope:** WS-12 includes editable generated on-curve points, generated handles, detached handle mode, arrow-key nudge for generated handles, and visual/selection integration. D fixed-rib, S fixed-rib-compress, X equalize, skeleton Tunni, source defaults, and the parameters panel remain later workstreams.

---

## Verified Current Context

- Donor checkout verified at `fd76d3abe66f5ea64ebde8fc245ef596b9270f5b`.
- Roadmap WS-12 requires editable flags, generated on-curve dragging via rib edit, generated-handle offsets, detached mode, and provenance-map lookups.
- WS-6 schema normalizes `editable: { left, right }` and `handleOffsets` on every skeleton point.
- WS-7 provenance shape is `{ skeletonContourId, generatedContourIndex, pointMap }`, where point-map entries are `null` or `{ skeletonPointId, side, role }`; roles are `"onCurve" | "in" | "out"`.
- WS-9 `replaceGeneratedSkeletonContours()` persists `skeletonData.generated[*].pathContourIndex` and `pointMap` after regeneration.
- WS-11 introduces `skeleton-ribs.js` with rib selection keys, id-based rib address lookup, rib position helpers, and rib executors. Editable generated on-curve points should reuse those rib semantics rather than adding a second width/nudge implementation.
- Donor editable-generated code lives inline in `skeleton/src-js/views-editor/src/edit-tools-pointer.js`:
  - `_getEditableGeneratedPointsFromSelection()` starts near line 3616 and reverse-maps regular path point indices to rib data.
  - `_getEditableGeneratedHandlesFromSelection()` starts near line 3868 and reverse-maps regular path point indices to handle data.
  - `_handleDragEditableGeneratedPoints()` starts near line 3905 and applies rib behavior to generated on-curve drags.
  - `_handleDragEditableGeneratedHandles()` starts near line 4099 and applies handle offsets.
  - `_handleArrowKeysForEditableHandles()` starts near line 4317.
  - donor helper names use flat fields: `leftHandleInOffset`, `leftHandleInOffsetX`, `leftHandleDetached`, etc. These are not forkra schema fields.
- Post-refactor reference `origin/ref/cleanup:src-js/views-editor/src/edit-behavior.js` has cleaner semantic indexes for `createEditableGeneratedPointExecutors()`, `createEditableGeneratedHandleExecutors()`, `createEditableHandleBehavior()`, and `applyEditableGeneratedHandleExecutorTransform()`. Use it to understand behavior, not as plumbing to port.

---

## File Structure

```
src-js/fontra-core/src/
  skeleton-model.js                      [MODIFY] canonical editable handle-offset helpers

src-js/fontra-core/tests/
  test-skeleton-model.js                 [MODIFY] handle-offset helper tests

src-js/views-editor/src/
  skeleton-generated.js                  [CREATE] provenance lookup, selection keys, target construction
  skeleton-ribs.js                       [MODIFY] expose reusable editable-rib executor hooks if needed
  skeleton-editing.js                    [MODIFY] expose target-entry hook only if WS-12 needs it
  scene-model.js                         [MODIFY] editable generated point/handle hit-testing
  edit-tools-pointer.js                  [MODIFY] dispatch editable generated drag/double-click
  scene-controller.js                    [MODIFY] editable generated handle arrow nudge
  visualization-layer-skeleton.js        [MODIFY] selected/hovered editable generated styling
  measure-interactions.js                [MODIFY] optional handle readout if current measure surface needs it
```

---

## Task 1: Add Canonical Handle-Offset Helpers

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-model.js`
- Modify: `src-js/fontra-core/tests/test-skeleton-model.js`

**Interfaces:**
- Produces:
  - `getSkeletonHandleOffset(point, side, role) -> { x, y, detached }`
  - `setSkeletonHandleOffset(point, side, role, offset, { round = Math.round } = {})`
  - `setSkeletonHandleDetached(point, side, detached)`
  - `getSkeletonHandleOffsetKey(side, role) -> "leftIn" | "leftOut" | "rightIn" | "rightOut"`

- [ ] **Step 1: Write failing tests**

Add tests for:

```text
default offset:
  missing handleOffsets returns { x: 0, y: 0, detached: false }

set 2D offset:
  setSkeletonHandleOffset(point, "left", "out", { x: 12.4, y: -3.7 }) stores leftOut rounded

detached flag:
  setSkeletonHandleDetached(point, "right", true) marks both rightIn/rightOut detached or the documented side-level representation

invalid side/role:
  helpers reject side other than left/right and role other than in/out
```

- [ ] **Step 2: Implement helpers**

Keep `handleOffsets` canonical:

```javascript
point.handleOffsets = {
  ...point.handleOffsets,
  [key]: {
    x: round(offset?.x || 0),
    y: round(offset?.y || 0),
    detached: offset?.detached === true || existing.detached === true,
  },
};
```

If WS-6 already picked a different detached representation, use that representation and update this task's tests accordingly before implementation.

- [ ] **Step 3: Run tests and commit**

```bash
cd src-js/fontra-core
npm test -- test-skeleton-model.js
cd ../..
npx prettier --write src-js/fontra-core/src/skeleton-model.js src-js/fontra-core/tests/test-skeleton-model.js
git add .
git commit -m "feat(skeleton): add editable handle offset helpers"
```

---

## Task 2: Add Provenance Lookup and Selection Key Helpers

**Files:**
- Create: `src-js/views-editor/src/skeleton-generated.js`

**Interfaces:**
- Produces:
  - `makeEditableGeneratedPointKey(contourId, pointId, side)`
  - `parseEditableGeneratedPointKey(key)`
  - `makeEditableGeneratedHandleKey(contourId, pointId, side, role)`
  - `parseEditableGeneratedHandleKey(key)`
  - `resolveGeneratedPointProvenance(skeletonData, path, pathPointIndex)`
  - `resolveEditableGeneratedTarget(skeletonData, path, pathPointIndex)`
  - `findGeneratedPathAddress(skeletonData, contourId, pointId, side, role) -> { pathContourIndex, pathPointIndex } | null`
    — the forward lookup (skeleton-space key → current path address) used by
    rendering, drag-start geometry, and bounds

- [ ] **Step 1: Implement strict key parsing**

Keys carry stable skeleton ids only (see Global Constraints). The current path
address is resolved from `generated[*].pointMap` when needed
(`findGeneratedPathAddress()`), never stored in the key. The parsers accept
both the full key and the `parseSelection` remainder, like WS-9's
`parseSkeletonPointKey`.

Reject:

```text
donor index keys
missing side/role
role not in onCurve/in/out
side not left/right
non-numeric ids
```

- [ ] **Step 2: Implement provenance resolver**

`resolveGeneratedPointProvenance()` converts the global `pathPointIndex` into a
`(pathContourIndex, contour-local offset)` pair using the supplied `path`, then
walks `skeletonData.generated` comparing `pathContourIndex` plus the
contour-local offset to find the matching `pointMap` entry. It returns:

```javascript
{
  generatedEntry,
  pathContourIndex,
  pathPointIndex,
  contourId,
  pointId,
  side,
  role,
  contour,
  point,
  pointIndex
}
```

It must not inspect coordinates.

- [ ] **Step 3: Filter editable targets**

`resolveEditableGeneratedTarget()` returns `null` unless:

```text
provenance exists
side is left/right
source point exists and is on-curve
point.editable[side] === true
role is onCurve, in, or out
```

For `role: "onCurve"`, return target kind `"editableGeneratedPoint"`. For `role: "in" | "out"`, return target kind `"editableGeneratedHandle"`.

- [ ] **Step 4: Run checks and commit**

```bash
node --check src-js/views-editor/src/skeleton-generated.js
npx prettier --write src-js/views-editor/src/skeleton-generated.js
git add .
git commit -m "feat(skeleton): resolve generated provenance targets"
```

---

## Task 3: Hit-Test Editable Generated Points and Handles

**Files:**
- Modify: `src-js/views-editor/src/scene-model.js`
- Modify: `src-js/views-editor/src/skeleton-generated.js`

**Interfaces:**
- Produces:
  - `sceneModel.editableGeneratedAtPoint(point, size, positionedGlyph = this.getSelectedPositionedGlyph())`
- Return shape:

```javascript
{
  selectionKey,
  kind: "editableGeneratedPoint" | "editableGeneratedHandle",
  contourId,
  pointId,
  side,
  role,
  pathContourIndex,
  pathPointIndex,
  point
}
```

- [ ] **Step 1: Add hit test over generated path points**

Use the selected positioned glyph's current path point hit-testing to find nearby generated path points. For each candidate path point, call `resolveEditableGeneratedTarget()`.

Do not search by expected skeleton coordinates. Do not call `pointIndexNearPoint()` with a projected rib point.

- [ ] **Step 2: Integrate with selection priority**

Add editable generated hit testing to `selectionAtPoint()` after explicit skeleton point/rib hits and before generic regular path point fallback. This keeps editable generated handles from being swallowed as ordinary path handles.

- [ ] **Step 3: Keep marquee out of scope**

Do not add editable generated points to `selectionAtRect()` unless existing regular path marquee selection already selects the visible generated path point. If marquee support is added, it must use the same provenance resolver and stable keys.

- [ ] **Step 4: Run checks and commit**

```bash
node --check src-js/views-editor/src/scene-model.js
node --check src-js/views-editor/src/skeleton-generated.js
npx prettier --write src-js/views-editor/src/scene-model.js src-js/views-editor/src/skeleton-generated.js
git add .
git commit -m "feat(skeleton): hit test editable generated geometry"
```

---

## Task 4: Route Editable Generated On-Curve Drags Through Rib Executors

**Files:**
- Modify: `src-js/views-editor/src/skeleton-generated.js`
- Modify: `src-js/views-editor/src/skeleton-ribs.js`
- Modify: `src-js/views-editor/src/edit-tools-pointer.js`

**Interfaces:**
- Produces `createEditableGeneratedPointTargetEntries(layerGlyph, selection, behaviorName, options)`.
- Reuses WS-11 rib executor behavior names:
  - `rib-default`
  - `rib-tangent`
  - `rib-interpolate`
  - `rib-tangent-interpolate`

- [ ] **Step 1: Convert editable-generated point keys to rib targets**

For each selected `editableGeneratedPoint` key:

```text
resolve contourId/pointId/side by stable id
verify point.editable[side] remains true
construct the same executor target WS-11 uses for skeletonRib
resolve the current path address via findGeneratedPathAddress() when the
  interpolation axis needs current generated geometry
```

- [ ] **Step 2: Preserve Alt and Z behavior**

Alt interpolation and Z tangent use the same behavior-name mechanism from WS-11. For interpolation, resolve the generated path address per frame with `findGeneratedPathAddress()` (keys carry no path address). If it cannot resolve for a frame, fall back to non-interpolating rib behavior for that frame.

- [ ] **Step 3: Pointer dispatch**

In `edit-tools-pointer.js`, when the initial hit or current selection contains `editableGeneratedPoint`, create the target entries and call the same edit behavior flow used by point/rib drags. Do not add inline width/nudge math.

- [ ] **Step 4: Run checks and commit**

```bash
node --check src-js/views-editor/src/skeleton-generated.js
node --check src-js/views-editor/src/skeleton-ribs.js
node --check src-js/views-editor/src/edit-tools-pointer.js
npx prettier --write src-js/views-editor/src/skeleton-generated.js src-js/views-editor/src/skeleton-ribs.js src-js/views-editor/src/edit-tools-pointer.js
git add .
git commit -m "feat(skeleton): drag editable generated points"
```

---

## Task 5: Add Editable Generated Handle Executors

**Files:**
- Modify: `src-js/views-editor/src/skeleton-generated.js`
- Modify: `src-js/views-editor/src/skeleton-editing.js` only if target-entry plumbing requires it
- Modify: `src-js/views-editor/src/edit-behavior.js` only if WS-9/11 did not already expose a generic skeleton target-entry hook

**Interfaces:**
- Produces:
  - `createEditableGeneratedHandleTargetEntries(layerGlyph, selection, behaviorName, options)`
  - `getSkeletonHandleDirectionForPoint(contour, pointIndex, role)`
  - handle executor `applyDelta(delta, round) -> { offset }`

- [ ] **Step 1: Implement skeleton handle direction**

For `role: "in"`, direction is from the source on-curve point to the incoming skeleton handle. For `role: "out"`, direction is from the source on-curve point to the outgoing skeleton handle. Use contour topology and stable source point index; do not infer from generated handle coordinates.

Return `null` when the skeleton segment has no corresponding handle; skip that target.

- [ ] **Step 2: Implement canonical handle-offset mutation**

For non-detached handles:

```text
project drag delta onto skeleton handle direction
store offset along that direction as canonical x/y in handleOffsets[side+role]
detached remains false
```

For detached handles:

```text
project drag delta onto current dragged-handle direction from generated path
store absolute canonical x/y offset in handleOffsets[side+role]
detached remains true
```

Use Task 1 helpers; do not write donor flat offset fields.

- [ ] **Step 3: Build target entries**

Like rib and skeleton point target entries, clone skeleton data once, mutate through `editSkeleton`, regenerate once, and return ordinary change objects. Shared `makeChangeForDelta()` must not branch on editable-generated kinds.

- [ ] **Step 4: Defer equalize**

Donor has X/equalize logic in editable-generated handle dragging. Do not implement it here. Keep behavior names and target entries compatible so WS-13 can add equalize as an executor variant.

- [ ] **Step 5: Run checks and commit**

```bash
node --check src-js/views-editor/src/skeleton-generated.js
node --check src-js/views-editor/src/skeleton-editing.js
node --check src-js/views-editor/src/edit-behavior.js
npx prettier --write src-js/views-editor/src/skeleton-generated.js src-js/views-editor/src/skeleton-editing.js src-js/views-editor/src/edit-behavior.js
git add .
git commit -m "feat(skeleton): add editable generated handle executors"
```

---

## Task 6: Wire Pointer Drag and Double-Click Detached Mode

**Files:**
- Modify: `src-js/views-editor/src/edit-tools-pointer.js`
- Modify: `src-js/views-editor/src/skeleton-generated.js`

**Interfaces:**
- Pointer consumes:
  - `editableGeneratedAtPoint()`
  - editable generated target-entry helpers
  - `toggleEditableGeneratedHandleDetached(selection, sceneController)`

- [ ] **Step 1: Dispatch handle drags**

When the hit or selection contains `editableGeneratedHandle`, route through the handle target entries from Task 5. Selection must remain the stable editable-generated handle key during drag.

- [ ] **Step 2: Toggle detached mode**

Double-clicking an editable generated handle toggles `handleOffsets[key].detached` for that side/role through `editSkeleton`.

After toggling:

```text
detached true -> subsequent drags store independent 2D offset
detached false -> subsequent drags collapse back to direction-constrained offset
```

Verify donor's exact gesture for detach by reading the relevant `fd76d3abe` handler before implementation. If donor uses a different gesture, update this step before coding.

- [ ] **Step 3: Run checks and commit**

```bash
node --check src-js/views-editor/src/edit-tools-pointer.js
node --check src-js/views-editor/src/skeleton-generated.js
npx prettier --write src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/skeleton-generated.js
git add .
git commit -m "feat(skeleton): drag editable generated handles"
```

---

## Task 7: Add Arrow-Key Nudge for Editable Generated Handles

**Files:**
- Modify: `src-js/views-editor/src/scene-controller.js`
- Modify: `src-js/views-editor/src/skeleton-generated.js`

**Interfaces:**
- Produces `nudgeEditableGeneratedHandles(sceneController, event)` or equivalent helper.

- [ ] **Step 1: Route editable generated handle selection**

In `scene-controller.handleArrowKeys()`, parse selection for `editableGeneratedHandle` keys before regular path point nudge fallback.

- [ ] **Step 2: Apply the same handle executor semantics**

Use existing arrow-key delta convention:

```text
Arrow -> 1 unit
Shift+Arrow -> 10 units
Shift+Cmd/Ctrl+Arrow -> 100 units
```

For non-detached handles, project onto skeleton handle direction. For detached handles, apply 2D offset along the current generated handle direction.

- [ ] **Step 3: Run checks and commit**

```bash
node --check src-js/views-editor/src/scene-controller.js
node --check src-js/views-editor/src/skeleton-generated.js
npx prettier --write src-js/views-editor/src/scene-controller.js src-js/views-editor/src/skeleton-generated.js
git add .
git commit -m "feat(skeleton): nudge editable generated handles"
```

---

## Task 8: Render Editable Generated Selection State

**Files:**
- Modify: `src-js/views-editor/src/visualization-layer-skeleton.js`

**Interfaces:**
- Consumes `editableGeneratedPoint` and `editableGeneratedHandle` sets from `parseSelection(model.selection)` and `parseSelection(model.hoverSelection)`.

- [ ] **Step 1: Highlight selected generated points and handles**

When drawing generated editable markers or overlay affordances, render selected/hovered editable-generated points and handles distinctly from ordinary generated path points.

- [ ] **Step 2: Show detached state**

If WS-8 already has editable marker glyphs, add a small visual variation for detached handles. Keep it subtle and consistent with existing skeleton marker styling.

- [ ] **Step 3: Run checks and commit**

```bash
node --check src-js/views-editor/src/visualization-layer-skeleton.js
npx prettier --write src-js/views-editor/src/visualization-layer-skeleton.js
git add .
git commit -m "feat(skeleton): show editable generated selections"
```

---

## Task 9: Bundle, Rail Checks, and Manual Matrix

**Files:**
- Verify all WS-12 files.

- [ ] **Step 1: Run automated checks**

```bash
cd src-js/fontra-core
npm test -- test-skeleton-model.js
cd ../..
node --check src-js/views-editor/src/skeleton-generated.js
node --check src-js/views-editor/src/skeleton-ribs.js
node --check src-js/views-editor/src/skeleton-editing.js
node --check src-js/views-editor/src/scene-model.js
node --check src-js/views-editor/src/edit-tools-pointer.js
node --check src-js/views-editor/src/scene-controller.js
node --check src-js/views-editor/src/visualization-layer-skeleton.js
npm run bundle
```

- [ ] **Step 2: Run rail greps**

```bash
rg -n "_getEditableRibPointForGeneratedPoint|_getEditableHandleForGeneratedPoint|_findHandlesForRibPointFromSkeleton|pointIndexNearPoint\\(|recover|inverse|tolerance" src-js/views-editor/src
rg -n "leftHandle(In|Out)Offset|rightHandle(In|Out)Offset|leftHandleDetached|rightHandleDetached|leftEditable|rightEditable" src-js/views-editor/src src-js/fontra-core/src
rg -n "generateFromSkeleton|generateContoursFromSkeleton|outlineContourToPackedPath|setSkeletonData\\(" src-js/views-editor/src
rg -n "editableGenerated(Point|Handle)/\\$\\{.*Index|skeletonContourIndex|skeletonPointIndex" src-js/views-editor/src
rg -n "if \\(.*editableGenerated|editableGenerated.*makeChangeForDelta|makeChangeForDelta[\\s\\S]*editableGenerated" src-js/views-editor/src/edit-behavior.js
```

Expected:

```text
no donor geometric source lookup helpers
no donor flat editable/handle-offset fields in runtime source
generator/customData writes remain inside editSkeleton
selection keys use stable contourId/pointId plus current path address, not donor skeleton indices
no editableGenerated branch in makeChangeForDelta or lower shared emit code
```

- [ ] **Step 3: Manual editor matrix**

Run forkra and donor `fd76d3abe` side by side with the WS-8 fixture and a WS-10-drawn skeleton with editable sides.

```text
hit testing:
  editable generated on-curve point -> selection key editableGeneratedPoint/<cId>/<pId>/<side>
  editable generated in handle -> selection key editableGeneratedHandle/<cId>/<pId>/<side>/in
  editable generated out handle -> selection key editableGeneratedHandle/<cId>/<pId>/<side>/out
  non-editable generated point -> falls through to ordinary path selection or no skeleton edit
  stale provenance entry -> no editable generated target, no crash

generated on-curve drag:
  normal drag changes width/nudge exactly like WS-11 editable rib drag
  Z drag changes nudge only
  Alt drag interpolates when adjacent generated handles are available
  linked/unlinked widths follow WS-11 behavior
  single-sided editable point edits the active side only

generated handle drag:
  non-detached handle drag changes canonical handle offset along skeleton handle direction
  detached handle drag changes independent 2D offset
  double-click handle toggles detached mode
  undo/redo restores detached flag and offsets

keyboard:
  selected editable generated handle + Arrow -> 1 unit offset change
  Shift+Arrow -> 10 unit offset change
  Shift+Cmd/Ctrl+Arrow -> 100 unit offset change

multi-layer:
  same editable-generated drag applies to every editable layer with matching stable skeleton ids
  missing target ids in one layer are skipped without blocking other layers

state:
  generated contours update live during drag
  selection remains stable across regeneration
  regular generated path point editing is not accidentally enabled for non-editable sources
  bundle remains green
```

- [ ] **Step 4: Commit final fixes if needed**

```bash
npx prettier --write src-js/fontra-core/src/skeleton-model.js src-js/fontra-core/tests/test-skeleton-model.js src-js/views-editor/src/skeleton-generated.js src-js/views-editor/src/skeleton-ribs.js src-js/views-editor/src/skeleton-editing.js src-js/views-editor/src/scene-model.js src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/scene-controller.js src-js/views-editor/src/visualization-layer-skeleton.js
git status --short
```

If formatting or fixes changed files:

```bash
git add .
git commit -m "fix(skeleton): complete editable generated parity checks"
```

---

## Deviations

- Donor regular-path point selection is replaced by explicit `editableGeneratedPoint` and `editableGeneratedHandle` selection keys. This prevents ordinary generated path indices from becoming skeleton source identity.
- Donor geometric reverse lookup is not ported. All source resolution flows through `skeletonData.generated[*].pointMap`.
- Donor flat handle-offset fields are not ported. Forkra writes canonical `handleOffsets` objects only.
- Donor X/equalize behavior for editable generated handles is deferred to WS-13 with D/S modifier parity.

---

## Acceptance Criteria

- Editable generated on-curve points and handles are hit-testable only when provenance maps them to an editable skeleton side.
- Selection keys use stable skeleton contour/point ids and never donor skeleton indices.
- Editable generated on-curve drags reuse WS-11 rib semantics and mutation path.
- Editable generated handle drags update canonical `handleOffsets` through `editSkeleton`.
- Detached handle mode can be toggled and affects subsequent drag/nudge behavior.
- Arrow-key nudge works for editable generated handles.
- Generated contours regenerate live and undo/redo restores both path and skeleton customData.
- No geometric recovery or donor flat handle fields are introduced.
- `npm test -- test-skeleton-model.js`, `node --check` on touched JS files, and `npm run bundle` pass.

---

## Self-Review

- **Spec coverage:** WS-12 roadmap requirements are covered: editable flags, generated on-curve drag as rib edit, generated-handle offsets, detached mode, and provenance-only source lookup.
- **Scope check:** D/S/X, Tunni, source defaults, and panel work are excluded and named as later workstreams.
- **Architecture rails:** all writes go through `editSkeleton`; path-point provenance is forward-emitted by WS-7; shared change emission stays object-kind agnostic.
- **Donor discipline:** donor behavior is the semantic reference; donor index selections, direct persistence, flat schema fields, and geometric matching are explicitly rejected.
