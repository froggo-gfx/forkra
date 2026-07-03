# WS-11 - Skeleton Widths and Ribs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make skeleton rib endpoints fully interactive: hit-test, select, drag, nudge, measure, and update canonical per-point width/nudge data through the WS-9 `editSkeleton` write path.

**Architecture:** Treat ribs as C4 gizmos over WS-6 skeleton geometry. A rib target is addressed by stable ids as `skeletonRib/<contourId>/<pointId>/<side>`, rendered and hit-tested from canonical skeleton data, and edited through executor objects constructed before change emission. Pure width/nudge math lives in `@fontra/core/skeleton-model.js`; editor code creates target entries that call WS-9 `editSkeleton`. Pointer and scene-controller code only dispatch to the rib helpers.

**Tech Stack:** `src-js/fontra-core/src/skeleton-model.js`, WS-9 `src-js/views-editor/src/skeleton-editing.js`, `src-js/views-editor/src/scene-model.js`, `edit-tools-pointer.js`, `scene-controller.js`, `measure-interactions.js`, `visualization-layer-skeleton.js` from WS-8, mocha/chai in `src-js/fontra-core`, `node --check`, `npx prettier --write`, `npm run bundle`, and manual parity checks against donor `fd76d3abe`.

---

## Global Constraints

- **Branch:** implement on `refactor-simple/ws11-skeleton-ribs`, cut after WS-10 is merged.
- **Donor is read-only:** `./skeleton/` stays detached at `fd76d3abe`. Read donor rib handlers for semantics only; never port donor routing, direct persistence, or index selection.
- **Selection keys:** forkra keys are `skeletonRib/<contourId>/<pointId>/<side>`. Do not create donor `skeletonRibPoint/<contourIndex>/<pointIndex>/<side>` keys.
- **One write path:** every rib mutation calls WS-9 `editSkeleton(layerGlyph, mutate)`. No direct generator, `setSkeletonData()`, or customData writes outside `skeleton-editing.js`.
- **No shared emit branches:** `EditBehaviorFactory.makeChangeForDelta()` and lower change-emission code stay generic. Rib-specific decisions happen when target entries/executors are constructed.
- **No geometric recovery:** generated-outline lookups use WS-7 provenance. Do not port donor inverse projection or tolerance-based generated-point matching.
- **Scope:** WS-11 includes rib width/nudge editing, linked/unlinked widths, single-sided contours, contour default width support, Alt rib interpolation if donor behavior requires it, and Z tangent constraint. D fixed-rib, S fixed-rib-compress, X equalize, editable-generated point/handle selection, Tunni, and the parameters panel remain later workstreams.

---

## Verified Current Context

- Donor checkout verified at `fd76d3abe66f5ea64ebde8fc245ef596b9270f5b`.
- Roadmap WS-11 requires `skeletonRib/contourId/pointId/side`, scene-model hit-testing, width/nudge executors, linked/unlinked widths, single-sided contours, contour default width, measure readouts, and Z tangent constraint.
- WS-6 plan defines the canonical schema:
  - contour: `id`, `closed`, `defaultWidth`, `singleSided: null | "left" | "right"`.
  - point: `id`, `width: { left, right, linked }`, `nudge: { left, right }`, `editable: { left, right }`.
  - exports include `DEFAULT_SKELETON_WIDTH`, `getSkeletonPointHalfWidth`, `getSkeletonPointNudge`, `calculateNormalAtSkeletonPoint`, and `projectSkeletonRibPoint`.
- WS-8 plan renders ribs using those core helpers and expects no duplicate default-width constants in `views-editor`.
- WS-9 plan owns `editSkeleton`, stable `skeletonPoint` selection, `makeEditSkeletonChange`, and the generic factory target-entry mechanism. Rib work must extend that mechanism, not branch inside the generic emit path.
- Donor rib code in `skeleton/src-js/views-editor/src/edit-tools-pointer.js` is inline:
  - `REALTIME_RIB_TANGENT_ACTION = "action.realtime.rib-tangent"`.
  - `_handleDragRibPoint()` starts at line 3191 and mixes target collection, behavior creation, linked-width writes, generator calls, and incremental change emission.
  - `_handleArrowKeysForRibPoints()` starts at line 4536.
  - rib hit-testing and measure hit-testing are near lines 6382 and 6473.
  - donor schema uses `leftWidth`, `rightWidth`, `leftNudge`, `rightNudge`, `leftEditable`, `rightEditable`, `singleSidedDirection`; these are not forkra schema fields.
- Post-refactor reference `origin/ref/cleanup:src-js/views-editor/src/edit-behavior.js` documents behavior names `rib-default`, `rib-tangent`, `rib-interpolate`, and `rib-tangent-interpolate`, plus `createSkeletonRibExecutors()` and `applySkeletonRibExecutorTransform()`. Treat this as a behavioral index, not plumbing to port.
- Current `measure-interactions.js` owns realtime measure mode and hover target dispatch. It currently measures regular path handles, path segments, and selected regular path points only.

---

## File Structure

```
src-js/fontra-core/src/
  skeleton-model.js                      [MODIFY] add canonical rib mutation helpers if WS-6 did not

src-js/fontra-core/tests/
  test-skeleton-model.js                 [MODIFY] width/nudge/link/single-sided tests

src-js/views-editor/src/
  skeleton-ribs.js                       [CREATE] rib key parsing, target construction, executors
  skeleton-editing.js                    [MODIFY] expose rib target-entry construction hook
  scene-model.js                         [MODIFY] add skeletonRibAtPoint()
  edit-tools-pointer.js                  [MODIFY] dispatch rib hover/drag and Z realtime action
  scene-controller.js                    [MODIFY] dispatch arrow-key rib nudges
  measure-interactions.js                [MODIFY] include rib measure hover targets
  visualization-layer-skeleton.js        [MODIFY] selected/hovered rib endpoint styling if not already present
  editor.js                              [MODIFY] register Z realtime action if action info lives there

src-js/fontra-core/assets/lang/
  en.js                                  [MODIFY] Z realtime action label if required
```

---

## Task 1: Lock Down Canonical Rib Width and Nudge Helpers

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-model.js`
- Modify: `src-js/fontra-core/tests/test-skeleton-model.js`

**Interfaces:**
- Consumes existing WS-6 helpers:
  - `normalizeSkeletonData(data)`
  - `getSkeletonPointHalfWidth(point, defaultWidth, side)`
  - `getSkeletonPointNudge(point, side, defaultWidth = DEFAULT_SKELETON_WIDTH)`
- Produces if missing:
  - `setSkeletonPointSideWidth(point, defaultWidth, side, halfWidth, { linked = point.width?.linked !== false, round = Math.round } = {})`
  - `setSkeletonPointSideNudge(point, side, nudge, { round = Math.round } = {})`
  - `setSkeletonContourDefaultWidth(contour, defaultWidth, { round = Math.round } = {})`
  - `getSkeletonRibSidesForPoint(contour, point)` returning `["left", "right"]` or the single-sided contour side.

- [ ] **Step 1: Write failing core tests**

Add tests covering:

```text
linked symmetric point:
  setting left from 40 -> 55 also sets right to 55 and keeps linked true

unlinked asymmetric point:
  setting left changes left only and keeps linked false

missing point width:
  setting right initializes canonical width object from contour.defaultWidth / 2

single-sided contour:
  getSkeletonRibSidesForPoint(contour, point) returns only contour.singleSided

nudge:
  setSkeletonPointSideNudge writes point.nudge.left/right in canonical schema

contour default:
  setSkeletonContourDefaultWidth clamps to non-negative rounded number
```

Do not add donor flat-field expectations.

- [ ] **Step 2: Implement helpers in `skeleton-model.js`**

Use existing `normalizeWidth()` and numeric coercion helpers from WS-6. Preserve the current `linked` value unless the caller explicitly passes `linked`.

Implementation shape:

```javascript
export function setSkeletonPointSideWidth(
  point,
  defaultWidth,
  side,
  halfWidth,
  { linked = point?.width?.linked !== false, round = Math.round } = {}
) {
  const width = normalizeWidth(point?.width);
  const value = Math.max(0, round(halfWidth));
  if (side === "left") {
    width.left = value;
    if (linked) width.right = value;
  } else if (side === "right") {
    width.right = value;
    if (linked) width.left = value;
  } else {
    throw new Error(`invalid skeleton rib side: ${side}`);
  }
  width.linked = linked;
  point.width = width;
}
```

Use `defaultWidth` as the fallback basis if existing normalization does not already do so; the resulting object must remain `{ left, right, linked }`.

- [ ] **Step 3: Run core tests**

```bash
cd src-js/fontra-core
npm test -- test-skeleton-model.js
```

Expected: all skeleton-model tests pass.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write src-js/fontra-core/src/skeleton-model.js src-js/fontra-core/tests/test-skeleton-model.js
git add .
git commit -m "feat(skeleton): add rib width helpers"
```

---

## Task 2: Add Rib Selection Keys and Gizmo Geometry

**Files:**
- Create: `src-js/views-editor/src/skeleton-ribs.js`

**Interfaces:**
- Produces:
  - `makeSkeletonRibKey(contourId, pointId, side)`
  - `parseSkeletonRibKey(key)`
  - `getSkeletonRibAddress(skeletonData, contourId, pointId, side)`
  - `getSkeletonRibPosition(contour, point, side)`
  - `iterSkeletonRibTargets(skeletonData)`
- Consumes from core:
  - `calculateNormalAtSkeletonPoint`
  - `getSkeletonPointHalfWidth`
  - `getSkeletonPointNudge`
  - `getSkeletonRibSidesForPoint`
  - `projectSkeletonRibPoint`

- [ ] **Step 1: Create key helpers**

Implement strict parsing:

```javascript
export function makeSkeletonRibKey(contourId, pointId, side) {
  if (side !== "left" && side !== "right") {
    throw new Error(`invalid skeleton rib side: ${side}`);
  }
  return `skeletonRib/${contourId}/${pointId}/${side}`;
}
```

`parseSkeletonRibKey()` accepts full keys only and returns `{ contourId, pointId, side }`. It must reject donor `skeletonRibPoint` keys and index-looking partial keys.

- [ ] **Step 2: Add id-based address lookup**

`getSkeletonRibAddress()` returns:

```javascript
{
  contour,
  contourIndex,
  point,
  pointIndex,
  side,
  defaultWidth,
  normal
}
```

It resolves by stable `contour.id` and `point.id`, skips off-curves, and rejects the non-active side of a single-sided contour.

- [ ] **Step 3: Add position calculation**

`getSkeletonRibPosition(contour, point, side)` uses only core helpers. For single-sided contours, the active side projects at the sum of left and right half-widths. For normal contours, each side uses its own half-width. Nudge is included only through `getSkeletonPointNudge()`.

- [ ] **Step 4: Run checks and commit**

```bash
node --check src-js/views-editor/src/skeleton-ribs.js
npx prettier --write src-js/views-editor/src/skeleton-ribs.js
git add .
git commit -m "feat(skeleton): add rib gizmo helpers"
```

---

## Task 3: Add Scene-Model Rib Hit Testing

**Files:**
- Modify: `src-js/views-editor/src/scene-model.js`
- Modify: `src-js/views-editor/src/skeleton-ribs.js` if small helper extraction is needed

**Interfaces:**
- Produces `sceneModel.skeletonRibAtPoint(point, size, positionedGlyph = this.getSelectedPositionedGlyph())`.
- Returns:

```javascript
{
  selectionKey,
  contourId,
  pointId,
  side,
  point,
  normal,
  layerName
}
```

- [ ] **Step 1: Add the hit-test method**

Follow existing `*AtPoint` methods in `scene-model.js`: convert canvas/local point to glyph coordinates using `positionedGlyph.x/y`, inspect the first editing layer for skeleton data, and test every on-curve rib endpoint within `size`.

Use `iterSkeletonRibTargets()` and `getSkeletonRibPosition()` rather than duplicating projection math.

- [ ] **Step 2: Integrate with selection hit flow**

Update `selectionAtPoint()` / `_selectionAtPoint()` so rib hits participate near the existing point and skeleton-point hits. Preserve priority:

```text
regular point / skeleton point handles
skeleton rib endpoint
other editable items
```

The returned selection key must be `skeletonRib/<contourId>/<pointId>/<side>`.

- [ ] **Step 3: Run checks and commit**

```bash
node --check src-js/views-editor/src/scene-model.js
node --check src-js/views-editor/src/skeleton-ribs.js
npx prettier --write src-js/views-editor/src/scene-model.js src-js/views-editor/src/skeleton-ribs.js
git add .
git commit -m "feat(skeleton): hit test rib endpoints"
```

---

## Task 4: Add Rib Executors and `editSkeleton` Target Entries

**Files:**
- Modify: `src-js/views-editor/src/skeleton-ribs.js`
- Modify: `src-js/views-editor/src/skeleton-editing.js`
- Modify: `src-js/views-editor/src/edit-behavior.js` only if WS-9 target-entry registration requires a behavior-type name table update

**Interfaces:**
- Produces:
  - `createSkeletonRibTargetEntries(layerGlyph, selection, behaviorName, options)`
  - `getSkeletonRibBehaviorName(event, modifiers)`
  - executor methods:
    - `applyDelta(delta, { constrainMode, round })`
    - returns `{ halfWidth, nudge, side }`
- Behavior names:
  - `rib-default`
  - `rib-tangent`
  - `rib-interpolate`
  - `rib-tangent-interpolate`

- [ ] **Step 1: Port donor rib math as executor semantics**

Read donor functions:

```bash
rg -n "function projectRibPoint|createRibEditBehavior|createEditableRibBehavior|createInterpolatingRibBehavior|applyLinkedWidthDelta" skeleton/src-js/views-editor/src/edit-tools-pointer.js
```

Then implement forkra executors in `skeleton-ribs.js` against canonical fields:

```text
non-editable side:
  normal delta changes half-width only

editable side:
  normal delta changes half-width
  tangent delta changes nudge
  Z tangent mode changes nudge only

linked point:
  width delta applies symmetrically to both sides

unlinked point:
  width delta applies only to selected side

single-sided contour:
  active side changes total width (left + right)
```

Do not copy donor object shapes that mention `leftWidth`, `rightWidth`, `leftNudge`, or `singleSidedDirection`.

- [ ] **Step 2: Add behavior-name selection**

`getSkeletonRibBehaviorName(event, modifiers)` returns:

```javascript
if (modifiers.tangentRibMode && event?.altKey) return "rib-tangent-interpolate";
if (modifiers.tangentRibMode) return "rib-tangent";
if (event?.altKey) return "rib-interpolate";
return "rib-default";
```

This keeps Z and Alt as behavior names / executor variants, not pointer side channels.

- [ ] **Step 3: Implement target-entry creation**

Use WS-9's generic skeleton target-entry shape. Construction resolves selected rib keys once, clones skeleton data once per layer, applies executor mutations inside the `mutate` callback, and lets `editSkeleton` regenerate.

The shared `makeChangeForDelta()` path must see a normal target entry with a dynamic rollback getter; it must not gain `if (skeletonRib...)`.

- [ ] **Step 4: Add provenance-backed interpolation**

For `rib-interpolate` and `rib-tangent-interpolate`, resolve adjacent generated handles from WS-7 provenance for the selected skeleton point/side. If no provenance axis exists, fall back to `rib-default` / `rib-tangent` for that executor, matching donor fallback behavior.

Do not port donor `_findHandlesForRibPointFromSkeleton()` geometric lookup.

- [ ] **Step 5: Run checks and commit**

```bash
node --check src-js/views-editor/src/skeleton-ribs.js
node --check src-js/views-editor/src/skeleton-editing.js
node --check src-js/views-editor/src/edit-behavior.js
npx prettier --write src-js/views-editor/src/skeleton-ribs.js src-js/views-editor/src/skeleton-editing.js src-js/views-editor/src/edit-behavior.js
git add .
git commit -m "feat(skeleton): add rib edit executors"
```

---

## Task 5: Wire Pointer Selection, Dragging, and Z Realtime Mode

**Files:**
- Modify: `src-js/views-editor/src/edit-tools-pointer.js`
- Modify: `src-js/views-editor/src/editor.js`
- Modify: `src-js/fontra-core/assets/lang/en.js` if action registration requires labels

**Interfaces:**
- Produces realtime action `action.realtime.rib-tangent` with default base key `z`.
- Pointer dispatch consumes:
  - `sceneModel.skeletonRibAtPoint()`
  - `createSkeletonRibTargetEntries()`
  - `getSkeletonRibBehaviorName()`

- [ ] **Step 1: Register the Z realtime action**

Follow the existing realtime measure action pattern. Add an action info entry for `action.realtime.rib-tangent` with default shortcut `z` and a concise label if labels are required.

- [ ] **Step 2: Track tangent mode in the pointer tool**

Add pointer state:

```javascript
this.tangentRibMode = false;
```

On keydown matching `action.realtime.rib-tangent`, set it true and request update. On keyup matching the same base key or window blur, set it false. Keep this state local to rib interactions.

- [ ] **Step 3: Dispatch rib selection and drag**

When `handleDrag()` receives a rib hit:

```text
plain click/drag rib endpoint:
  selection becomes that rib unless already selected

Shift selection behavior:
  extend/toggle consistent with existing point selection behavior

selected skeleton points + rib drag:
  include the corresponding side for selected skeleton on-curves, matching donor behavior
```

Then create rib target entries and use the WS-9 edit behavior flow. Do not inline width math in `edit-tools-pointer.js`.

- [ ] **Step 4: Preserve movement-allowed semantics**

Implement donor's guard as a helper in `skeleton-ribs.js`:

```text
drag allowed when:
  explicit skeleton-point selection is driving the ribs, or
  all selected rib sides are editable, or
  selected rib sides belong to one continuous skeleton segment
```

The helper uses stable ids and canonical schema.

- [ ] **Step 5: Run checks and commit**

```bash
node --check src-js/views-editor/src/edit-tools-pointer.js
node --check src-js/views-editor/src/editor.js
node --check src-js/views-editor/src/skeleton-ribs.js
node --check src-js/fontra-core/assets/lang/en.js
npx prettier --write src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/editor.js src-js/views-editor/src/skeleton-ribs.js src-js/fontra-core/assets/lang/en.js
git add .
git commit -m "feat(skeleton): drag rib endpoints"
```

---

## Task 6: Wire Arrow-Key Rib Nudging

**Files:**
- Modify: `src-js/views-editor/src/scene-controller.js`
- Modify: `src-js/views-editor/src/skeleton-ribs.js`

**Interfaces:**
- Produces `nudgeSkeletonRibSelection(sceneController, event)` or equivalent helper.
- Consumes existing arrow key delta convention:
  - arrow = 1 unit
  - Shift + arrow = 10 units
  - Shift + command/control + arrow = 100 units

- [ ] **Step 1: Route rib selection in `handleArrowKeys()`**

Parse selection and detect `skeletonRib` keys before regular point nudge fallback. If rib selection exists, call the rib nudge helper and return after handling.

- [ ] **Step 2: Apply nudge through `editSkeleton()`**

For every editing layer with skeleton data, resolve selected rib addresses by stable ids and apply the same executor semantics as drag with `behaviorName = "rib-default"` unless the realtime Z state is exposed to scene-controller at the time of key handling.

Do not duplicate the executor math from Task 4.

- [ ] **Step 3: Run checks and commit**

```bash
node --check src-js/views-editor/src/scene-controller.js
node --check src-js/views-editor/src/skeleton-ribs.js
npx prettier --write src-js/views-editor/src/scene-controller.js src-js/views-editor/src/skeleton-ribs.js
git add .
git commit -m "feat(skeleton): nudge rib endpoints"
```

---

## Task 7: Add Measure-Mode Rib Readouts

**Files:**
- Modify: `src-js/views-editor/src/measure-interactions.js`
- Modify: `src-js/views-editor/src/visualization-layer-definitions.js` if a new measure payload draw path is needed
- Modify: `src-js/views-editor/src/skeleton-ribs.js` if readout helpers are needed

**Interfaces:**
- Produces measure hover target kind `"skeletonRib"`.
- Payload:

```javascript
{
  p1: { x, y },          // center skeleton point
  p2: { x, y },          // rib endpoint
  width,
  leftWidth,
  rightWidth,
  side,
  type: "skeletonRib"
}
```

- [ ] **Step 1: Add rib lookup to measure hover**

In `MeasureInteraction.handleHover()`, after regular handle lookup and before generic segment lookup, call a helper that uses `sceneModel.skeletonRibAtPoint(point, size)`.

- [ ] **Step 2: Build readout payload**

Resolve the rib address from skeleton data and compute:

```text
width = left + right for normal contours
width = total projected width for single-sided contours
leftWidth / rightWidth = canonical per-side half-widths
p1 = skeleton point
p2 = rib endpoint
```

Do not add donor `leftWidth` fields to skeleton data; these names exist only in the measure payload.

- [ ] **Step 3: Draw using existing measure overlay where possible**

If the existing overlay handles `p1/p2/type` payloads generically, only set `type: "skeletonRib"`. If it branches by type, add the smallest branch needed for width labels.

- [ ] **Step 4: Run checks and commit**

```bash
node --check src-js/views-editor/src/measure-interactions.js
node --check src-js/views-editor/src/visualization-layer-definitions.js
node --check src-js/views-editor/src/skeleton-ribs.js
npx prettier --write src-js/views-editor/src/measure-interactions.js src-js/views-editor/src/visualization-layer-definitions.js src-js/views-editor/src/skeleton-ribs.js
git add .
git commit -m "feat(skeleton): measure rib endpoints"
```

---

## Task 8: Highlight Selected and Hovered Ribs

**Files:**
- Modify: `src-js/views-editor/src/visualization-layer-skeleton.js`

**Interfaces:**
- Consumes `parseSelection(model.selection)` and `parseSelection(model.hoverSelection)` with `skeletonRib` sets.

- [ ] **Step 1: Add rib selection styling**

Where WS-8 draws rib endpoints, check for `skeletonRib/<contourId>/<pointId>/<side>` in selected/hovered sets and use selected/hover colors that match existing point-selection styling.

- [ ] **Step 2: Avoid layout or geometry duplication**

Use `getSkeletonRibPosition()` for endpoint coordinates. Do not add another projection helper in the visualization file.

- [ ] **Step 3: Run checks and commit**

```bash
node --check src-js/views-editor/src/visualization-layer-skeleton.js
npx prettier --write src-js/views-editor/src/visualization-layer-skeleton.js
git add .
git commit -m "feat(skeleton): show selected ribs"
```

---

## Task 9: Bundle, Rail Checks, and Manual Matrix

**Files:**
- Verify all WS-11 files.

- [ ] **Step 1: Run automated checks**

```bash
cd src-js/fontra-core
npm test -- test-skeleton-model.js
cd ../..
node --check src-js/views-editor/src/skeleton-ribs.js
node --check src-js/views-editor/src/skeleton-editing.js
node --check src-js/views-editor/src/scene-model.js
node --check src-js/views-editor/src/edit-tools-pointer.js
node --check src-js/views-editor/src/scene-controller.js
node --check src-js/views-editor/src/measure-interactions.js
node --check src-js/views-editor/src/visualization-layer-skeleton.js
node --check src-js/views-editor/src/editor.js
npm run bundle
```

- [ ] **Step 2: Run rail greps**

```bash
rg -n "skeletonRibPoint|leftWidth|rightWidth|leftNudge|rightNudge|leftEditable|rightEditable|singleSidedDirection" src-js/views-editor/src src-js/fontra-core/src
rg -n "generateFromSkeleton|generateContoursFromSkeleton|outlineContourToPackedPath|setSkeletonData\\(" src-js/views-editor/src
rg -n "if \\(.*skeletonRib|skeletonRib.*makeChangeForDelta|makeChangeForDelta[\\s\\S]*skeletonRib" src-js/views-editor/src/edit-behavior.js
rg -n "projectSkeletonRibPoint|DEFAULT_SKELETON_WIDTH" src-js/views-editor/src
rg -n "skeletonRib/\\$\\{.*Index|contourIndex\\}/\\$\\{pointIndex" src-js/views-editor/src
```

Expected:

```text
no donor flat schema fields or donor selection kind in runtime source
generator calls remain inside WS-9 skeleton-editing write path only
no skeletonRib branch in makeChangeForDelta or lower shared emit code
views-editor imports shared projectSkeletonRibPoint/default width; it does not redeclare them
no index-based skeletonRib keys
```

- [ ] **Step 3: Manual editor matrix**

Run forkra and donor `fd76d3abe` side by side with the WS-8 fixture and a newly drawn skeleton from WS-10.

```text
hit testing:
  hover left rib endpoint -> hover highlight appears
  hover right rib endpoint -> hover highlight appears
  single-sided contour -> only active-side endpoint is hit-testable
  off-curve skeleton point -> no rib hit

selection:
  click rib -> selection is skeletonRib/<contourId>/<pointId>/<side>
  Shift-click second rib -> selection extends/toggles consistently with point selection
  click selected rib and drag -> selection is preserved
  selected skeleton points + rib drag -> corresponding selected on-curve ribs move

drag, normal contour:
  non-editable left rib normal drag -> left half-width changes
  non-editable right rib normal drag -> right half-width changes
  linked width point -> opposite side changes symmetrically
  unlinked width point -> opposite side stays fixed
  editable side free drag -> normal component changes width and tangent component changes nudge
  hold Z during editable drag -> nudge changes, width stays fixed
  Alt drag -> rib interpolation behavior matches donor or falls back when no provenance axis exists
  Alt+Z drag -> tangent interpolation behavior matches donor or falls back when no provenance axis exists

drag, single-sided contour:
  active rib drag changes total projected width
  inactive side cannot be selected
  editable active side drag can change nudge
  linked/unlinked point data remains canonical after drag

keyboard:
  selected rib + Arrow -> 1 unit rib edit
  Shift+Arrow -> 10 unit rib edit
  Shift+Cmd/Ctrl+Arrow -> 100 unit rib edit
  editable selected rib + Arrow -> width/nudge parity with donor
  non-editable selected rib + Arrow -> width-only parity with donor

measure:
  realtime measure over rib endpoint -> rib readout appears
  single-sided rib readout reports total width
  normal contour readout reports total and side widths

state:
  generated contours update live during drag
  undo/redo restores skeleton customData and generated path
  multi-layer editing applies equivalent rib edits to every editable layer
  bundle remains green
```

- [ ] **Step 4: Commit final fixes if needed**

```bash
npx prettier --write src-js/fontra-core/src/skeleton-model.js src-js/fontra-core/tests/test-skeleton-model.js src-js/views-editor/src/skeleton-ribs.js src-js/views-editor/src/skeleton-editing.js src-js/views-editor/src/scene-model.js src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/scene-controller.js src-js/views-editor/src/measure-interactions.js src-js/views-editor/src/visualization-layer-skeleton.js src-js/views-editor/src/editor.js src-js/fontra-core/assets/lang/en.js
git status --short
```

If formatting or fixes changed files:

```bash
git add .
git commit -m "fix(skeleton): complete rib parity checks"
```

---

## Deviations

- Donor selection kind `skeletonRibPoint/<contourIndex>/<pointIndex>/<side>` is replaced by `skeletonRib/<contourId>/<pointId>/<side>` to satisfy the roadmap's stable-id architecture.
- Donor flat fields (`leftWidth`, `rightWidth`, `leftNudge`, `rightNudge`, `leftEditable`, `rightEditable`, `singleSidedDirection`) are not ported. Forkra writes only canonical schema fields from WS-6.
- Donor generated-handle lookup by geometric search is not ported. Rib interpolation uses WS-7 provenance and falls back to non-interpolating rib behavior when provenance cannot provide the axis.
- D, S, and X modifier behaviors are explicitly deferred to WS-13 even though donor rib code references related behavior machinery.

---

## Acceptance Criteria

- Rib endpoints are selectable as `skeletonRib/<contourId>/<pointId>/<side>`.
- Scene-model owns rib hit-testing through `skeletonRibAtPoint()`.
- Pointer dragging and arrow-key nudging update rib widths/nudges through `editSkeleton`.
- Linked and unlinked widths behave like donor semantics while writing canonical `width.left/right/linked`.
- Single-sided contours expose only the active side and edit total projected width.
- Z realtime tangent constraint works for rib drag and does not introduce pointer-side width math.
- Alt rib interpolation is implemented as behavior/executor variants where provenance supports it.
- Measure mode shows rib readouts for normal and single-sided contours.
- Selected and hovered rib endpoints render distinctly.
- `npm test -- test-skeleton-model.js`, `node --check` on touched JS files, and `npm run bundle` pass.
- Rail greps show no donor flat fields, no donor rib selection kind, no generator writes outside `editSkeleton`, and no skeleton-specific branch inside shared change emission.

---

## Self-Review

- **Spec coverage:** WS-11 roadmap requirements are covered: rib gizmos, id-based selection kind, scene-model hit-testing, width/nudge executors, linked/unlinked widths, single-sided contours, contour default width support, measure readouts, and Z tangent constraint.
- **Scope check:** D/S/X, editable-generated selection, Tunni, source defaults, and the parameters panel are left to later workstreams.
- **Architecture rails:** all mutation routes through `editSkeleton`; projection/default-width math comes from core; pointer and scene-controller remain dispatchers.
- **Donor discipline:** donor rib behavior and projection math are the semantic source; donor persistence, flat schema, index selection, and geometric recovery are explicitly rejected.
