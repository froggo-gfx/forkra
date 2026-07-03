# WS-14 - Skeleton Tunni Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add skeleton-curve Tunni parity: visible midpoint/true Tunni controls, hit-testing, drag behavior through `editSkeleton`, and donor-supported midpoint tension equalize.

**Architecture:** Treat Tunni as "segment geometry + edit sink". Regular path Tunni keeps the existing path sink; skeleton Tunni uses the same Tunni math shape but resolves skeleton segments and persists through the WS-9 `editSkeleton` path. Pointer remains a dispatcher only: it asks Tunni interaction helpers whether they handled the event and never writes skeleton data or regenerates outlines directly.

**Tech Stack:** `src-js/fontra-core/src/tunni-calculations.js`, `src-js/fontra-core/src/skeleton-model.js`, WS-6/9 skeleton persistence helpers, `src-js/views-editor/src/tunni-interactions.js`, `scene-model.js`, `visualization-layer-definitions.js`, `edit-tools-pointer.js`, mocha/chai for pure helpers, `node --check`, `npx prettier --write`, `npm run bundle`, and manual parity checks against donor `fd76d3abe`.

---

## Global Constraints

- **Branch:** implement on `refactor-simple/ws14-skeleton-tunni`, cut after WS-13 is merged.
- **Donor is read-only:** `./skeleton/` stays detached at `fd76d3abe66f5ea64ebde8fc245ef596b9270f5b`. Read donor `skeleton-tunni-calculations.js`, pointer methods `_handleSkeletonTunniDrag()` / `_equalizeSkeletonTunniTensions()`, and cleanup reference `origin/ref/cleanup:src-js/views-editor/src/tunni-interactions.js`.
- **One skeleton write path:** all skeleton changes must call `editSkeleton(layerGlyph, mutate)` or the WS-9 persistence helper built around it. Do not call `setSkeletonData()`, `regenerateSkeletonContours()`, or generator helpers from pointer/Tunni interaction code.
- **Non-selection gizmo:** skeleton Tunni points are direct pointer gizmos. Do not add `skeletonTunni/...` selection keys, selection toggles, or arrow-key behavior.
- **Stable identity:** hit results may keep segment indices for the active pointer gesture, but persistence must resolve points through WS-6 stable ids whenever the landed schema provides ids. If WS-6 segment ids exist, use them; otherwise store `{ contourId, startPointId, endPointId, controlPointIds }`.
- **Canonical schema only:** use WS-6 `contour.closed`, point `type`, width/handle fields, and helper APIs. Do not introduce donor `isClosed`, `leftWidth`, `rightWidth`, `leftHandleInOffsetX`, `rightHandleDetached`, or index-based selection keys.
- **Scope:** WS-14 includes skeleton Tunni midpoint drag, true-Tunni drag, visualization/hit-testing, and Ctrl+Shift midpoint tension equalize. It does not include the parameters panel, source defaults, interpolation audit, copy/paste/export, or generic WS-13 D/S/X modifier work.

---

## Verified Current Context

- Donor checkout verified at `fd76d3abe66f5ea64ebde8fc245ef596b9270f5b`.
- Roadmap WS-14 requires WS-4 Tunni interactions parameterized by edit sink; skeleton segment drags must flow through `editSkeleton`.
- Current forkra has regular path Tunni in `src-js/views-editor/src/tunni-interactions.js`:
  - `tunniHoverResult()`
  - `handleTunniPointMouseDown()`
  - `handleTrueTunniPointMouseDown()`
  - `handleTunniDrag()`
  - `tunniLayerHitTest()`
- Current regular Tunni layers are `fontra.tunni.handle` and `fontra.tunni.point`.
- Donor pinned branch adds a separate skeleton Tunni visualization layer `fontra.skeleton.tunni`, a midpoint Tunni point, and a true-Tunni point.
- Donor midpoint drag moves the two skeleton off-curve controls along their original directions. By default it preserves tension proportionally; Alt disables the coupled/proportional behavior.
- Donor true-Tunni drag moves the two skeleton on-curve endpoints along their fixed handle directions. By default the endpoint projections are averaged; Alt disables averaging.
- Donor Ctrl+Shift+click on a skeleton midpoint Tunni equalizes control-point tensions and works even when the skeleton Tunni layer is hidden.
- Cleanup reference consolidates skeleton Tunni into `tunni-interactions.js` and uses `collectSkeletonLayerPersistenceChanges()`, `cloneSkeletonData()`, and `resetWorkingContoursFromOriginal()` instead of pointer-side direct persistence. Prefer that shape over the pinned donor's inline pointer methods.

---

## File Structure

```
src-js/fontra-core/src/
  skeleton-tunni.js                      [CREATE] pure skeleton segment adapters and Tunni geometry helpers

src-js/fontra-core/tests/
  test-skeleton-tunni.js                 [CREATE] pure skeleton Tunni geometry tests

src-js/views-editor/src/
  tunni-interactions.js                  [MODIFY] add skeleton edit sink and exported skeleton drag/equalize handlers
  scene-model.js                         [MODIFY] add skeleton Tunni hit helpers if existing scene hit APIs live here
  visualization-layer-definitions.js     [MODIFY] register/draw skeleton Tunni layer or delegate to WS-8 skeleton layer module
  edit-tools-pointer.js                  [MODIFY] dispatch skeleton Tunni hover, drag, and Ctrl+Shift equalize
  edit-behavior.js                       [MODIFY] only if WS-9 persistence helpers live here after merge
  skeleton-editing.js                    [MODIFY] only if the implementation needs a tiny exported persistence helper
```

If WS-8 created `src-js/views-editor/src/visualization-layer-skeleton.js` or `skeleton-visualization-layers.js`, place the skeleton Tunni layer there instead of growing `visualization-layer-definitions.js`. Keep this as a visualization decision only; interaction code stays in `tunni-interactions.js`.

---

## Task 1: Add Pure Skeleton Tunni Segment Helpers

**Files:**
- Create: `src-js/fontra-core/src/skeleton-tunni.js`
- Create: `src-js/fontra-core/tests/test-skeleton-tunni.js`

**Interfaces:**

```javascript
export function buildSkeletonTunniSegments(contour);
export function segmentToTunniPoints(segment);
export function calculateSkeletonTunniPoint(segment);
export function calculateSkeletonTrueTunniPoint(segment);
export function calculateSkeletonControlPointsFromTunniDelta(delta, segment, preserveTensions = true);
export function calculateSkeletonOnCurveFromTunni(nextTrueTunniPoint, segment, equalizeDistances = true);
export function calculateSkeletonEqualizedControlPoints(segment);
export function areSkeletonTensionsEqualized(segment, tolerance = 0.01);
```

- [ ] **Step 1: Write failing tests for segment construction**

Create fixtures with canonical WS-6 skeleton contours:

```javascript
const openContour = {
  id: "contour-a",
  closed: false,
  points: [
    { id: "p0", x: 0, y: 0 },
    { id: "h1", type: "cubic", x: 50, y: 0 },
    { id: "h2", type: "cubic", x: 50, y: 100 },
    { id: "p1", x: 100, y: 100 },
  ],
};
```

Expected:

```text
buildSkeletonTunniSegments(openContour) returns one cubic segment
segment has start/end/control point objects
segment has startPointId/endPointId/controlPointIds
segment preserves startIndex/endIndex/controlIndices for in-gesture lookup only
open contours do not wrap the final on-curve to the first on-curve
closed contours do wrap
non-cubic segments are returned but later Tunni helpers return null
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-tunni.js --reporter spec
```

Expected: fail because `skeleton-tunni.js` does not exist.

- [ ] **Step 3: Implement segment adapters**

Port donor `buildSegmentsFromSkeletonPoints()` semantics, translated to canonical schema:

```text
donor contour.isClosed -> contour.closed
on-curve point -> no point.type
off-curve cubic point -> point.type === "cubic"
segment identity -> stable ids plus temporary indices
```

Do not derive segments from generated outlines.

- [ ] **Step 4: Implement pure Tunni math via existing core functions**

Use `@fontra/core/tunni-calculations.js` for canonical four-point math wherever possible:

```javascript
function segmentToTunniPoints(segment) {
  if (!segment?.controlPoints || segment.controlPoints.length !== 2) {
    return null;
  }
  return [
    segment.startPoint,
    segment.controlPoints[0],
    segment.controlPoints[1],
    segment.endPoint,
  ];
}
```

Map:

```text
calculateSkeletonTunniPoint -> calculateControlHandlePoint(segmentPoints)
calculateSkeletonTrueTunniPoint -> calculateTunniPoint(segmentPoints)
calculateSkeletonEqualizedControlPoints -> calculateEqualizedControlPoints(segmentPoints)
areSkeletonTensionsEqualized -> areTensionsEqualized(segmentPoints)
```

Keep donor midpoint/true drag formulas local because they operate on deltas and skeleton point roles.

- [ ] **Step 5: Add geometry tests**

Cover:

```text
midpoint Tunni is midpoint between the two skeleton control points
true Tunni is the intersection of start->cp1 and end->cp2
midpoint drag with preserveTensions true uses donor proportional movement
midpoint drag with preserveTensions false moves each handle by its own projection
true-Tunni drag with equalizeDistances true averages the two endpoint projections
true-Tunni drag with equalizeDistances false uses independent projections
equalize returns average tension control positions
already-equalized guard returns true
parallel handle rays are guarded and do not throw
```

- [ ] **Step 6: Run tests and commit**

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-tunni.js --reporter spec
cd ../..
npx prettier --write src-js/fontra-core/src/skeleton-tunni.js src-js/fontra-core/tests/test-skeleton-tunni.js
git add .
git commit -m "feat(skeleton): add skeleton Tunni geometry"
```

---

## Task 2: Add Skeleton Tunni Hit Testing

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-tunni.js`
- Modify: `src-js/fontra-core/tests/test-skeleton-tunni.js`
- Modify: `src-js/views-editor/src/scene-model.js`
- Modify: `src-js/views-editor/src/tunni-interactions.js`

**Interfaces:**

```javascript
export function skeletonTunniHitTest(point, size, skeletonData, options = {});
```

Options:

```javascript
{
  midpointOnly = false,
  includeTrueTunni = true
}
```

Hit shape:

```javascript
{
  type: "tunni" | "true-tunni",
  contourId,
  contourIndex,
  segmentIndex,
  segment,
  tunniPoint
}
```

- [ ] **Step 1: Write failing hit-test tests**

Use the Task 1 fixture and test:

```text
true Tunni hit wins when both are in range and midpointOnly is false
midpoint hit is returned for midpoint layer
midpointOnly ignores true Tunni
miss returns null
missing skeletonData.contours returns null
hit includes stable contourId and segment point ids
```

- [ ] **Step 2: Implement pure hit test**

Port donor `skeletonTunniHitTest()` into `skeleton-tunni.js`, but call `buildSkeletonTunniSegments(contour)` and use `contour.closed`.

- [ ] **Step 3: Add scene-model helper if consistent with current hit APIs**

If `scene-model.js` already owns `*AtPoint()` helpers after WS-9/12, add:

```javascript
skeletonTunniAtPoint(point, size, positionedGlyph, options = {})
```

The helper should:

```text
resolve selected/editing positioned glyph
read skeleton data through WS-6/9 helper
convert scene point to glyph point if scene-model convention requires it
return the pure hit-test result
```

If WS-9 kept skeleton hit testing entirely in interaction helpers, skip this file and document the reason in the commit message.

- [ ] **Step 4: Wire `tunniHoverResult()` to ask skeleton first**

In `tunni-interactions.js`, extend hover handling:

```text
if fontra.skeleton.tunni is on:
  hit skeleton Tunni with size and selected positioned glyph
  true-tunni -> cursor "crosshair"
  midpoint -> cursor "pointer"
then fall through to regular path Tunni
```

Do not block regular path Tunni when no skeleton data exists.

- [ ] **Step 5: Run tests and commit**

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-tunni.js --reporter spec
cd ../..
node --check src-js/views-editor/src/tunni-interactions.js
node --check src-js/views-editor/src/scene-model.js
npx prettier --write src-js/fontra-core/src/skeleton-tunni.js src-js/fontra-core/tests/test-skeleton-tunni.js src-js/views-editor/src/tunni-interactions.js src-js/views-editor/src/scene-model.js
git add .
git commit -m "feat(skeleton): add Tunni hit testing"
```

---

## Task 3: Add Skeleton Tunni Visualization

**Files:**
- Modify: `src-js/views-editor/src/visualization-layer-definitions.js`
- Or modify: `src-js/views-editor/src/visualization-layer-skeleton.js` / `skeleton-visualization-layers.js` if WS-8 created one
- Modify: `src-js/views-editor/src/tunni-interactions.js` only if layer ids are exported there

**Layer:**

```text
identifier: "fontra.skeleton.tunni"
name: "Skeleton Tunni"
selectionFunc: glyphSelector("editing")
userSwitchable: true
defaultOn: false
zIndex: between skeleton handles and nodes
```

- [ ] **Step 1: Add the visualization layer**

Draw the donor geometry:

```text
dashed start->cp1 line
dashed end->cp2 line
dashed cp1->cp2 line
midpoint Tunni as blue/cyan round point
true Tunni as orange diamond/square point
```

Use existing node drawing utilities if available. Avoid copying donor color comments if the current layer file has a different theme convention.

- [ ] **Step 2: Use canonical data access**

Read skeleton data through the WS-6/8 helper already used by skeleton rendering. Do not inspect generated path contours to recover skeleton segments.

- [ ] **Step 3: Verify visual layer settings integration**

Confirm `panel-transformation.js` or the visualization layer panel auto-discovers user-switchable layers. If not, add the minimal registration so `fontra.skeleton.tunni` is togglable.

- [ ] **Step 4: Run checks and commit**

```bash
node --check src-js/views-editor/src/visualization-layer-definitions.js
node --check src-js/views-editor/src/tunni-interactions.js
npx prettier --write src-js/views-editor/src/visualization-layer-definitions.js src-js/views-editor/src/tunni-interactions.js
git add .
git commit -m "feat(skeleton): draw skeleton Tunni layer"
```

---

## Task 4: Implement Skeleton Tunni Drag Sink

**Files:**
- Modify: `src-js/views-editor/src/tunni-interactions.js`
- Modify: `src-js/views-editor/src/edit-tools-pointer.js`
- Modify: `src-js/views-editor/src/skeleton-editing.js` only if a helper must be exported

**Interfaces:**

```javascript
export async function handleSkeletonTunniDrag({
  sceneController,
  eventStream,
  initialEvent,
  tunniHit,
  tunniAction = "drag",
});
```

- [ ] **Step 1: Add drag-state construction**

On mouse down, store:

```javascript
{
  type,
  contourId,
  contourIndex,
  segmentIdentity,
  originalTunniPoint,
  originalSegment
}
```

`originalSegment` is copied from the hit layer for calculations. `segmentIdentity` uses stable ids and may keep donor-style indices only as a fallback for the current unmerged schema.

- [ ] **Step 2: Implement multi-layer edit loop**

Use the cleanup reference structure:

```text
sceneController.editGlyph(async (sendIncrementalChange, glyph) => ...)
collect all editable layers with skeleton data
clone original skeleton data per layer
on each mousemove, reset working contour from original
resolve the same segment in that layer
mutate working skeleton points
persist through editSkeleton / WS-9 skeleton persistence helper
send accumulated incremental changes with mayDrop=true
return one undo record at mouseup
```

The pointer must not call persistence helpers directly.

- [ ] **Step 3: Implement midpoint drag**

For `type === "tunni"`:

```text
delta = currentGlyphPoint - startGlyphPoint
preserveTensions = !event.altKey
new controls = calculateSkeletonControlPointsFromTunniDelta(delta, layerOriginalSegment, preserveTensions)
write cp1/cp2 to working contour
round using WS-9/11 makeRoundFunc(event) or grid snap convention
undoLabel = "Move Skeleton Control Points (Tunni)"
```

- [ ] **Step 4: Implement true-Tunni drag**

For `type === "true-tunni"`:

```text
nextTrueTunniPoint = originalTunniPoint + delta
equalizeDistances = !event.altKey
new endpoints = calculateSkeletonOnCurveFromTunni(nextTrueTunniPoint, layerOriginalSegment, equalizeDistances)
write start/end on-curve points to working contour
round using WS-9/11 convention
undoLabel = "Move Skeleton On-Curve Points (Tunni)"
```

- [ ] **Step 5: Route pointer drag**

In `edit-tools-pointer.js`, before regular skeleton point drag and after higher-priority resize/selection guards:

```text
if fontra.skeleton.tunni is active and no skeleton point is under cursor:
  hit skeleton Tunni
  if hit -> await handleSkeletonTunniDrag(...)
```

Regular path Tunni remains in its existing location. Skeleton point/handle/rib hits win over skeleton Tunni to avoid dragging a hidden/nearby gizmo instead of the selected point.

- [ ] **Step 6: Run checks and commit**

```bash
node --check src-js/views-editor/src/tunni-interactions.js
node --check src-js/views-editor/src/edit-tools-pointer.js
node --check src-js/views-editor/src/skeleton-editing.js
npx prettier --write src-js/views-editor/src/tunni-interactions.js src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/skeleton-editing.js
git add .
git commit -m "feat(skeleton): drag skeleton Tunni controls"
```

---

## Task 5: Implement Ctrl+Shift Skeleton Tunni Equalize

**Files:**
- Modify: `src-js/views-editor/src/tunni-interactions.js`
- Modify: `src-js/views-editor/src/edit-tools-pointer.js`
- Modify: `src-js/fontra-core/tests/test-skeleton-tunni.js`

**Interfaces:**

```javascript
export async function equalizeSkeletonTunniTensions({ sceneController, tunniHit });
```

- [ ] **Step 1: Add tests for equalized control points**

Extend pure tests:

```text
unequal handle tensions become equal after calculateSkeletonEqualizedControlPoints()
parallel true-Tunni rays return original controls and no throw
areSkeletonTensionsEqualized() is true after equalize
```

- [ ] **Step 2: Implement equalize handler**

Port cleanup reference `equalizeSkeletonTunniTensions()`:

```text
guard already-equalized hit and return true
edit all editable layers with matching skeleton data
resolve same contour/segment in each layer
write equalized cp1/cp2 positions
persist through editSkeleton / WS-9 helper
undoLabel = "Equalize Skeleton Tunni Tensions"
```

Use Math.round or the current rounding helper to match donor equalize behavior.

- [ ] **Step 3: Wire Ctrl+Shift midpoint dispatch**

In `edit-tools-pointer.js`:

```text
if initialEvent.ctrlKey && initialEvent.shiftKey:
  hit skeleton Tunni with midpointOnly: true and size * 2
  if hit -> equalizeSkeletonTunniTensions(...)
```

This dispatch works even when `fontra.skeleton.tunni` is hidden, matching donor. It should run before regular path Tunni equalize only when the skeleton midpoint hit succeeds.

- [ ] **Step 4: Keep true-Tunni equalize excluded**

Ensure Ctrl+Shift only uses `midpointOnly: true`; true Tunni intersection points are drag-only.

- [ ] **Step 5: Run checks and commit**

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-tunni.js --reporter spec
cd ../..
node --check src-js/views-editor/src/tunni-interactions.js
node --check src-js/views-editor/src/edit-tools-pointer.js
npx prettier --write src-js/fontra-core/tests/test-skeleton-tunni.js src-js/views-editor/src/tunni-interactions.js src-js/views-editor/src/edit-tools-pointer.js
git add .
git commit -m "feat(skeleton): equalize skeleton Tunni tensions"
```

---

## Task 6: Preserve Regular Tunni Behavior

**Files:**
- Modify: `src-js/views-editor/src/tunni-interactions.js`
- Modify: `src-js/views-editor/src/edit-tools-pointer.js`
- Modify: existing regular Tunni tests if available

- [ ] **Step 1: Add regression coverage for regular path Tunni**

If a views-editor test harness exists by WS-14, cover:

```text
regular midpoint Tunni drag still updates path control points
regular true-Tunni drag still updates path on-curve points
regular Ctrl+Shift midpoint equalize still works when no skeleton Tunni hit exists
generated skeleton contours are ignored by regular path Tunni hit testing if WS-12 marks generated contours
```

If no views-editor harness exists, add this to the manual matrix in Task 8.

- [ ] **Step 2: Keep layer-id semantics separate**

Regular Tunni remains controlled by:

```text
fontra.tunni.handle
fontra.tunni.point
```

Skeleton Tunni remains controlled by:

```text
fontra.skeleton.tunni
```

Do not rename existing WS-4 layer ids in WS-14.

- [ ] **Step 3: Run checks and commit**

```bash
node --check src-js/views-editor/src/tunni-interactions.js
node --check src-js/views-editor/src/edit-tools-pointer.js
npx prettier --write src-js/views-editor/src/tunni-interactions.js src-js/views-editor/src/edit-tools-pointer.js
git add .
git commit -m "fix(tunni): preserve regular Tunni routing"
```

---

## Task 7: Rail Checks

**Files:**
- Verify all WS-14 files.

- [ ] **Step 1: Run automated checks**

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-tunni.js --reporter spec
cd ../..
node --check src-js/fontra-core/src/skeleton-tunni.js
node --check src-js/views-editor/src/tunni-interactions.js
node --check src-js/views-editor/src/edit-tools-pointer.js
node --check src-js/views-editor/src/scene-model.js
node --check src-js/views-editor/src/visualization-layer-definitions.js
npm run bundle
```

- [ ] **Step 2: Run forbidden-path greps**

```bash
rg -n "setSkeletonData\\(|regenerateSkeletonContours\\(|generateFromSkeleton|skeletonContourGenerator" src-js/views-editor/src/tunni-interactions.js src-js/views-editor/src/edit-tools-pointer.js
rg -n "leftWidth|rightWidth|leftHandle(In|Out)Offset|rightHandle(In|Out)Offset|leftHandleDetached|rightHandleDetached|singleSidedDirection|isClosed" src-js/fontra-core/src src-js/views-editor/src
rg -n "skeletonTunni/|selection.*tunni|tunni.*selection" src-js/views-editor/src src-js/fontra-core/src
rg -n "_handleSkeletonTunniDrag|_equalizeSkeletonTunniTensions" src-js/views-editor/src/edit-tools-pointer.js
rg -n "fontra\\.skeleton\\.tunni|handleSkeletonTunniDrag|equalizeSkeletonTunniTensions" src-js/views-editor/src
```

Expected:

```text
no direct skeleton persistence/generator calls in pointer or Tunni interaction code
no donor flat schema fields
no skeleton Tunni selection keys
no donor-style pointer methods remain in edit-tools-pointer.js
skeleton Tunni layer and handlers are registered exactly where expected
```

- [ ] **Step 3: Commit final fixes if needed**

```bash
git status --short
git add .
git commit -m "fix(skeleton): complete Tunni parity checks"
```

---

## Task 8: Manual Parity Matrix

**Files:**
- Manual verification against forkra and donor `fd76d3abe`.

- [ ] **Step 1: Prepare fixtures**

Use:

```text
a WS-10-created open skeleton contour with one cubic segment
a closed skeleton contour with one wraparound cubic segment
a multi-layer glyph where both editable layers have matching skeleton ids
a layer mismatch case where one editable layer lacks the target segment
a glyph with both regular path cubic contours and skeleton-generated contours
```

- [ ] **Step 2: Visualization checks**

```text
fontra.skeleton.tunni off -> no skeleton Tunni visuals
fontra.skeleton.tunni on -> dashed handle lines, midpoint point, and true-Tunni point render
regular fontra.tunni.handle/point layers still render regular path Tunni only
closed contour wrap segment draws its Tunni controls
non-cubic skeleton segments do not draw Tunni controls
zoomed hit targets remain usable
```

- [ ] **Step 3: Hover and priority checks**

```text
hover midpoint -> pointer cursor
hover true Tunni -> crosshair cursor
hover near skeleton point and Tunni -> skeleton point cursor/action wins
hover regular path Tunni when no skeleton hit exists -> existing regular cursor behavior
hidden skeleton Tunni layer does not enable drag hover
```

- [ ] **Step 4: Midpoint drag checks**

```text
drag skeleton midpoint Tunni -> off-curve controls move along original handle directions
Alt+drag midpoint -> uncoupled projection behavior matches donor
drag updates generated outline live
single undo reverts the whole drag
redo reapplies it
multi-layer edit applies to matching layers and skips missing segment layers without blocking
```

- [ ] **Step 5: True-Tunni drag checks**

```text
drag true Tunni -> on-curve endpoints move along fixed handle directions
Alt+drag true Tunni -> uncoupled endpoint projections match donor
off-curve controls remain unchanged except as required by skeleton schema constraints
single undo/redo works
parallel handle rays do not crash and do not create invalid point values
```

- [ ] **Step 6: Equalize checks**

```text
Ctrl+Shift+click skeleton midpoint -> tensions equalize
Ctrl+Shift+click works when fontra.skeleton.tunni is hidden
Ctrl+Shift+click true Tunni point does not equalize
already equalized segment produces no visible change and no crash
regular path Ctrl+Shift midpoint equalize still works when no skeleton midpoint is hit
```

- [ ] **Step 7: State and persistence checks**

```text
skeleton custom data and generated path both persist after save/reload
undo stack labels are understandable:
  Move Skeleton Control Points (Tunni)
  Move Skeleton On-Curve Points (Tunni)
  Equalize Skeleton Tunni Tensions
no generated path contour is used to reconstruct skeleton Tunni after reload
```

---

## Deviations

- The pinned donor's pointer-local `_handleSkeletonTunniDrag()` and `_equalizeSkeletonTunniTensions()` are not ported as pointer methods. WS-14 follows the cleanup reference and keeps interaction/persistence in `tunni-interactions.js`.
- Donor `fontra.skeleton.tunni` layer id is kept because it avoids changing existing WS-4 regular Tunni layer ids.
- Donor direct `setSkeletonData()` and `regenerateSkeletonContours()` calls are replaced by WS-9 `editSkeleton` persistence helpers.
- Donor index segment references are used only as temporary gesture fallbacks if the current schema lacks segment ids; stable point ids remain the canonical identity.

---

## Acceptance Criteria

- `fontra.skeleton.tunni` renders midpoint and true-Tunni controls for skeleton cubic segments.
- Skeleton Tunni hover cursors and hit priority match donor behavior.
- Midpoint skeleton Tunni drag moves skeleton off-curve controls through `editSkeleton`.
- True skeleton Tunni drag moves skeleton on-curve endpoints through `editSkeleton`.
- Alt modifies midpoint and true-Tunni drag coupling as donor does.
- Ctrl+Shift+click on midpoint skeleton Tunni equalizes tension, including when the layer is hidden.
- Regular path Tunni behavior from WS-4 remains intact.
- Multi-layer editing updates matching skeleton layers and skips missing segments safely.
- No pointer-side direct skeleton persistence, donor flat schema fields, geometric recovery, or skeleton Tunni selection keys are introduced.
- `npx mocha tests/test-skeleton-tunni.js`, `node --check` on touched JS files, and `npm run bundle` pass.

---

## Self-Review

- **Spec coverage:** WS-14 roadmap requirements are covered: Tunni points on skeleton curves, pointer hit testing, drag through `editSkeleton`, and donor-supported equalize.
- **Architecture rails:** Tunni is expressed as segment math plus an edit sink. Regular path and skeleton Tunni share concepts without forcing skeleton data through generated outlines.
- **Donor discipline:** pinned donor provides behavior; cleanup reference provides the better post-refactor placement. Donor pointer plumbing and direct persistence are intentionally rejected.
- **Scope check:** parameters panel, source defaults, interpolation audit, copy/export, and broader D/S/X modifier work remain outside WS-14.
