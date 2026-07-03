# WS-13 - Skeleton Modifier Parity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full donor parity for the skeleton D, S, and X realtime modifier behaviors: fixed-rib, fixed-rib-compress, and equalize.

**Architecture:** Implement D/S/X as behavior names and executor variants inside the WS-9/11/12 skeleton editing pipeline. Pointer and scene-controller only expose realtime modifier state and pass it into behavior-name resolution; all geometry changes happen inside tested modifier helpers and target-entry executors that still write through `editSkeleton`.

**Tech Stack:** `src-js/fontra-core/src/skeleton-model.js`, new pure modifier helpers, WS-9 `skeleton-editing.js`, WS-11 `skeleton-ribs.js`, WS-12 `skeleton-generated.js`, `src-js/views-editor/src/edit-behavior.js`, `edit-tools-pointer.js`, `scene-controller.js`, `editor.js`, localization in `src-js/fontra-core/assets/lang/en.js`, mocha/chai for pure helpers, `node --check`, `npx prettier --write`, `npm run bundle`, and manual parity checks against donor `fd76d3abe`.

---

## Global Constraints

- **Branch:** implement on `refactor-simple/ws13-skeleton-modifier-parity`, cut after WS-12 is merged.
- **Donor is read-only:** `./skeleton/` stays detached at `fd76d3abe`. Read donor modifier handlers for behavior; do not port pointer routing, direct persistence, donor flat fields, or index selection.
- **One write path:** all skeleton changes still call `editSkeleton(layerGlyph, mutate)`. No generator or customData writes outside WS-9 `skeleton-editing.js`.
- **Behavior model:** D/S/X are behavior names and executor options. Do not add bypass flags that directly mutate skeleton data from `edit-tools-pointer.js` or `scene-controller.js`.
- **No shared emit branches:** `makeChangeForDelta()` and lower shared change-emission loops must stay object-kind agnostic. They may pass an `options` object such as `{ equalize: true }` into target entries, but must not branch on `skeletonPoint`, `skeletonRib`, or `editableGenerated`.
- **Canonical schema only:** use stable ids and WS-6 fields. Do not introduce donor `leftWidth`, `rightWidth`, `leftHandleInOffsetX`, `leftHandleDetached`, `isClosed`, or index-based selection keys.
- **Scope:** D fixed-rib, S fixed-rib-compress, and X equalize for skeleton points/handles, ribs, editable generated points, and editable generated handles. Skeleton Tunni equalize belongs to WS-14.

---

## Verified Current Context

- Donor checkout verified at `fd76d3abe66f5ea64ebde8fc245ef596b9270f5b`.
- Roadmap WS-13 requires fixed-rib (D), fixed-rib-compress (S), and equalize (X) for skeleton and editable-generated handles, expressed inside the behavior model.
- Current forkra `edit-behavior.js` already has regular-path equalize action factories and `alternate` / `alternate-constrain` behavior names.
- Current forkra `edit-tools-pointer.js` does not yet register or track D/S/X realtime modifier state. WS-11 adds Z tangent state; WS-13 should follow that shape.
- Donor constants and state:
  - `REALTIME_EQUALIZE_ACTION = "action.realtime.equalize"`
  - `REALTIME_FIXED_RIB_ACTION = "action.realtime.fixed-rib"`
  - `REALTIME_FIXED_RIB_COMPRESS_ACTION = "action.realtime.fixed-rib-compress"`
  - default keys: X, D, S respectively.
- Donor fixed-rib geometry is in `skeleton/src-js/views-editor/src/edit-tools-pointer.js`:
  - `FIXED_RIB_SCALE_CONTROL_POINTS = true`
  - `applyFixedRibDragToSkeletonData()` starts near line 392.
  - call sites use `{ anchorToDragSide: fixedRibCompressMode, scaleControlPoints: true }`.
- Donor X equalize surfaces:
  - X + skeleton off-curve drag mirrors the opposite handle around the smooth on-curve.
  - X + skeleton off-curve arrow nudge moves the dragged handle and equalizes the opposite handle.
  - X + editable generated handle drag/nudge equalizes same-side generated in/out handle lengths while preserving each handle's direction.
  - X + editable generated point resolves to alternate rib nudge behavior; Shift+X uses `alternate-constrain`.
- Post-refactor reference `origin/ref/cleanup:src-js/fontra-core/tests/test-edit-behavior-factory.js` contains useful semantic fixtures for fixed-rib and equalize, but it uses donor/post-refactor index keys and flat schema. Port the scenarios, not the literals.
- Post-refactor reviews show X-equalize regressed repeatedly when it lived outside the live behavior path. WS-13 must test the actual target-entry path, not dead helper functions.

---

## File Structure

```
src-js/fontra-core/src/
  skeleton-modifiers.js                  [CREATE] pure fixed-rib and equalize geometry helpers

src-js/fontra-core/tests/
  test-skeleton-modifiers.js             [CREATE] pure helper tests

src-js/views-editor/src/
  skeleton-modifiers.js                  [CREATE] editor target-entry glue around core helpers
  skeleton-editing.js                    [MODIFY] expose modifier-aware target-entry hook if WS-9 needs it
  skeleton-ribs.js                       [MODIFY] add X behavior for editable generated points / rib nudge
  skeleton-generated.js                  [MODIFY] add editable-generated handle equalize executor
  edit-behavior.js                       [MODIFY] behavior names/options only; no kind branches
  edit-tools-pointer.js                  [MODIFY] realtime D/S/X state and drag dispatch options
  scene-controller.js                    [MODIFY] arrow-key D/S/X dispatch options
  editor.js                              [MODIFY] register realtime actions

src-js/fontra-core/assets/lang/
  en.js                                  [MODIFY] realtime action labels
```

If WS-9 through WS-12 land the target-entry glue under different filenames, keep the task boundaries and adapt only the import paths at the start of each task.

---

## Task 1: Add Realtime Action Registration and Pointer Modifier State

**Files:**
- Modify: `src-js/views-editor/src/editor.js`
- Modify: `src-js/fontra-core/assets/lang/en.js`
- Modify: `src-js/views-editor/src/edit-tools-pointer.js`

**Interfaces:**
- Realtime actions:
  - `action.realtime.equalize`, default shortcut `x`
  - `action.realtime.fixed-rib`, default shortcut `d`
  - `action.realtime.fixed-rib-compress`, default shortcut `s`
- Pointer properties:
  - `equalizeMode`
  - `fixedRibMode`
  - `fixedRibCompressMode`

- [ ] **Step 1: Register action info**

In `editor.js`, near the realtime measure and WS-11 rib tangent actions, add:

```javascript
registerActionInfo("action.realtime.equalize", {
  topic,
  titleKey: "shortcuts.realtime.equalize",
  defaultShortCuts: [{ baseKey: "x" }],
});
registerActionInfo("action.realtime.fixed-rib", {
  topic,
  titleKey: "shortcuts.realtime.fixed-rib",
  defaultShortCuts: [{ baseKey: "d" }],
});
registerActionInfo("action.realtime.fixed-rib-compress", {
  topic,
  titleKey: "shortcuts.realtime.fixed-rib-compress",
  defaultShortCuts: [{ baseKey: "s" }],
});
```

- [ ] **Step 2: Add English labels**

In `en.js`, near existing `shortcuts.realtime.*` keys:

```javascript
"shortcuts.realtime.equalize": "Equalize handles (hold)",
"shortcuts.realtime.fixed-rib": "Fixed rib (hold)",
"shortcuts.realtime.fixed-rib-compress": "Fixed rib compress (hold)",
```

- [ ] **Step 3: Track keydown/keyup in the pointer**

Follow WS-11's Z tangent implementation. Add pointer state initialized to `false`, set true on matching keydown, set false on matching keyup or window blur, request canvas update, and prevent repeat setup from stacking listeners.

Do not mutate selection or skeleton data in these handlers.

- [ ] **Step 4: Run checks and commit**

```bash
node --check src-js/views-editor/src/editor.js
node --check src-js/views-editor/src/edit-tools-pointer.js
node --check src-js/fontra-core/assets/lang/en.js
npx prettier --write src-js/views-editor/src/editor.js src-js/views-editor/src/edit-tools-pointer.js src-js/fontra-core/assets/lang/en.js
git add .
git commit -m "feat(skeleton): register modifier realtime actions"
```

---

## Task 2: Port Pure Fixed-Rib Geometry

**Files:**
- Create: `src-js/fontra-core/src/skeleton-modifiers.js`
- Create: `src-js/fontra-core/tests/test-skeleton-modifiers.js`

**Interfaces:**
- Produces:
  - `applyFixedRibDelta(originalSkeletonData, workingSkeletonData, selectedPointKeys, clickedPointKey, delta, options)`
- Options:

```javascript
{
  compress = false,
  scaleControlPoints = true,
  round = Math.round
}
```

- [ ] **Step 1: Write failing fixed-rib tests**

Port the post-refactor semantic fixture cases to canonical schema and stable keys:

```text
fixed-rib:
  selected skeletonPoint/<contourId>/<pointId>, clicked same on-curve, delta { x: 10, y: 0 }
  on-curve point moves along donor projection
  width expands on the side opposite the drag-side anchor
  generated schema remains { width: { left, right, linked } }

fixed-rib-compress:
  same fixture and delta
  on-curve point moves along donor projection
  width compresses on the drag-side anchor

off-curve scaling:
  selected segment with adjacent cubic handles
  scaleControlPoints true preserves donor handle-length behavior

guards:
  no clicked point -> returns false
  clicked off-curve -> returns false
  missing contour/point id in one layer -> skips without throwing
```

- [ ] **Step 2: Port donor math into core helper**

Use donor `applyFixedRibDragToSkeletonData()` as the semantic source. Translate:

```text
donor contour.isClosed -> contour.closed
donor singleSided + singleSidedDirection -> contour.singleSided
donor width/leftWidth/rightWidth -> width.left/right/linked
donor index keys -> stable id keys resolved once per call
```

Keep the helper pure: it mutates only the supplied `workingSkeletonData` and returns `true` when it applied at least one change.

- [ ] **Step 3: Keep helper geometry centralized**

Import normal and width helpers from `skeleton-model.js`; do not redeclare `DEFAULT_SKELETON_WIDTH`, normal calculation, or rib projection.

- [ ] **Step 4: Run tests and commit**

```bash
cd src-js/fontra-core
npm test -- test-skeleton-modifiers.js
cd ../..
npx prettier --write src-js/fontra-core/src/skeleton-modifiers.js src-js/fontra-core/tests/test-skeleton-modifiers.js
git add .
git commit -m "feat(skeleton): add fixed rib modifier math"
```

---

## Task 3: Add Pure Equalize Helpers

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-modifiers.js`
- Modify: `src-js/fontra-core/tests/test-skeleton-modifiers.js`

**Interfaces:**
- Produces:
  - `getSkeletonHandleEqualizeInfo(contour, pointIdOrIndex) -> { smoothPointId, oppositePointId, smoothIndex, oppositeIndex } | null`
  - `equalizeSkeletonHandleFromDelta(contour, pointId, delta, { constrain = false, round = Math.round } = {})`
  - `equalizeSkeletonHandleToPoint(contour, pointId, currentPoint, { constrain = false, round = Math.round } = {})`
  - `equalizeEditableGeneratedHandleOffsets(point, side, role, delta, geometry, { round = Math.round } = {})`

- [ ] **Step 1: Write failing equalize tests**

Cover:

```text
skeleton handle X drag:
  dragged off-curve follows cursor vector from smooth point
  opposite off-curve mirrors same length opposite direction

skeleton handle X + Shift:
  dragged vector is constrained to horizontal/vertical/45 degrees
  opposite handle mirrors constrained vector

skeleton handle X arrow:
  dragged off-curve moves by arrow delta
  opposite handle length is scaled to match dragged length while preserving its direction

editable generated handle X:
  same-side in/out handle offsets become equal length
  each side preserves its own direction
  detached offsets stay detached
```

- [ ] **Step 2: Implement topology lookup**

`getSkeletonHandleEqualizeInfo()` finds a cubic off-curve adjacent to a smooth on-curve and another cubic off-curve on the other side of that smooth point. Use contour topology, stable point ids, and `contour.closed`; do not inspect generated path coordinates.

- [ ] **Step 3: Implement skeleton handle equalize**

Port donor `_getSkeletonHandleEqualizeInfo()`, `_handleEqualizeHandlesDrag()`, and `_handleArrowKeysForEqualizeSkeletonHandles()` semantics into pure functions. Keep cursor-driven drag and arrow-delta nudge separate because donor behavior differs:

```text
drag:
  current pointer position defines dragged vector from smooth point
  opposite = smooth - dragged vector

arrow:
  dragged point first moves by delta
  opposite keeps its original direction but scales to dragged length
```

- [ ] **Step 4: Implement editable generated handle equalize**

Use canonical `handleOffsets` helpers from WS-12. The helper receives geometry prepared by `skeleton-generated.js`:

```javascript
{
  anchorPos,
  draggedDirection,
  oppositeDirection,
  detached,
  originalDraggedLength,
  originalOppositeLength
}
```

It must update both role offsets for the same side, not just the dragged role.

- [ ] **Step 5: Run tests and commit**

```bash
cd src-js/fontra-core
npm test -- test-skeleton-modifiers.js
cd ../..
npx prettier --write src-js/fontra-core/src/skeleton-modifiers.js src-js/fontra-core/tests/test-skeleton-modifiers.js
git add .
git commit -m "feat(skeleton): add skeleton equalize math"
```

---

## Task 4: Add Modifier Behavior Names to Target Construction

**Files:**
- Modify: `src-js/views-editor/src/edit-behavior.js`
- Modify: `src-js/views-editor/src/skeleton-modifiers.js`
- Modify: `src-js/views-editor/src/skeleton-editing.js`
- Modify: `src-js/views-editor/src/skeleton-ribs.js`
- Modify: `src-js/views-editor/src/skeleton-generated.js`

**Interfaces:**
- Produces behavior names:
  - `fixed-rib`
  - `fixed-rib-compress`
  - `equalize`
  - `equalize-constrain`
- Produces modifier resolver:

```javascript
getSkeletonModifierBehaviorName(event, modifiers, targetKinds)
```

- [ ] **Step 1: Add behavior-name resolver**

Centralize behavior resolution where WS-11/12 target-entry construction already resolves rib behavior names:

```javascript
if (modifiers.fixedRibCompressMode && targetKinds.has("skeletonPoint")) {
  return "fixed-rib-compress";
}
if (modifiers.fixedRibMode && targetKinds.has("skeletonPoint")) {
  return "fixed-rib";
}
if (modifiers.equalizeMode) {
  return event?.shiftKey ? "equalize-constrain" : "equalize";
}
```

For editable generated points, X maps to WS-11's alternate rib behavior:

```javascript
if (modifiers.equalizeMode && targetKinds.has("editableGeneratedPoint")) {
  return event?.shiftKey ? "alternate-constrain" : "alternate";
}
```

- [ ] **Step 2: Thread options through target entries**

Allow target entries to receive:

```javascript
{
  behaviorName,
  equalize: behaviorName.startsWith("equalize"),
  fixedRib: behaviorName === "fixed-rib",
  fixedRibCompress: behaviorName === "fixed-rib-compress"
}
```

This is construction-time routing. The shared transform loop can pass the options object through, but it must not inspect the target kind.

- [ ] **Step 3: Add fixed-rib skeleton point executor**

For selected skeleton points, create a target entry that calls `applyFixedRibDelta()` inside the `editSkeleton` mutation. The clicked point comes from the pointer/scene-model initial hit state and must be a stable `skeletonPoint/<contourId>/<pointId>` key.

- [ ] **Step 4: Add equalize skeleton handle executor**

For selected skeleton off-curve handles, create an executor that calls the pure equalize helper. It should no-op for on-curve selections and for off-curves without a smooth-paired opposite handle.

- [ ] **Step 5: Add editable generated handle equalize executor**

For `editableGeneratedHandle` selections from WS-12, build geometry once at drag start from provenance and current generated path point positions, then call `equalizeEditableGeneratedHandleOffsets()` on each frame.

- [ ] **Step 6: Run checks and commit**

```bash
node --check src-js/views-editor/src/edit-behavior.js
node --check src-js/views-editor/src/skeleton-modifiers.js
node --check src-js/views-editor/src/skeleton-editing.js
node --check src-js/views-editor/src/skeleton-ribs.js
node --check src-js/views-editor/src/skeleton-generated.js
npx prettier --write src-js/views-editor/src/edit-behavior.js src-js/views-editor/src/skeleton-modifiers.js src-js/views-editor/src/skeleton-editing.js src-js/views-editor/src/skeleton-ribs.js src-js/views-editor/src/skeleton-generated.js
git add .
git commit -m "feat(skeleton): add modifier target executors"
```

---

## Task 5: Wire Pointer Drag for D/S/X

**Files:**
- Modify: `src-js/views-editor/src/edit-tools-pointer.js`
- Modify: `src-js/views-editor/src/skeleton-modifiers.js`

**Interfaces:**
- Pointer passes modifier state to target-entry construction:

```javascript
{
  equalizeMode: this.equalizeMode,
  fixedRibMode: this.fixedRibMode,
  fixedRibCompressMode: this.fixedRibCompressMode,
  tangentRibMode: this.tangentRibMode
}
```

- [ ] **Step 1: Record stable clicked skeleton point key**

When initial hit is a skeleton point, store the full `skeletonPoint/<contourId>/<pointId>` key for the drag session. Do not store contour/point indices.

- [ ] **Step 2: Route skeleton point D/S drags**

When D or S is active and skeleton point selection exists, use the normal WS-9 drag path with behavior name `fixed-rib` or `fixed-rib-compress`. Do not call `applyFixedRibDelta()` from pointer.

- [ ] **Step 3: Route skeleton handle X drags**

When X is active and the initial hit is a skeleton off-curve handle, use the same target-entry drag flow with `equalize` or `equalize-constrain`. The pointer must not run a separate `_handleEqualizeHandlesDrag()` session.

- [ ] **Step 4: Route editable generated handle X drags**

When X is active and selection contains `editableGeneratedHandle`, pass `equalize` into WS-12's target-entry flow. If equalize geometry cannot be resolved, fall back to normal editable generated handle drag, matching donor fallback.

- [ ] **Step 5: Route editable generated point X drags**

When X is active and selection contains `editableGeneratedPoint`, behavior name resolves to `alternate` / `alternate-constrain` so the rib nudge semantics match the donor.

- [ ] **Step 6: Run checks and commit**

```bash
node --check src-js/views-editor/src/edit-tools-pointer.js
node --check src-js/views-editor/src/skeleton-modifiers.js
npx prettier --write src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/skeleton-modifiers.js
git add .
git commit -m "feat(skeleton): route modifier drags"
```

---

## Task 6: Wire Arrow-Key Nudge for D/S/X

**Files:**
- Modify: `src-js/views-editor/src/scene-controller.js`
- Modify: `src-js/views-editor/src/skeleton-modifiers.js`
- Modify: `src-js/views-editor/src/edit-tools-pointer.js` if scene-controller reads modifier state from selected tool

**Interfaces:**
- Scene-controller passes selected tool modifier state into target-entry behavior-name resolution.

- [ ] **Step 1: Extend arrow-key modifier options**

In `handleArrowKeys()`, when constructing behavior factories or skeleton target entries, pass:

```javascript
const modifiers = {
  equalizeMode: this.selectedTool?.equalizeMode === true,
  fixedRibMode: this.selectedTool?.fixedRibMode === true,
  fixedRibCompressMode: this.selectedTool?.fixedRibCompressMode === true,
  tangentRibMode: this.selectedTool?.tangentRibMode === true,
};
```

- [ ] **Step 2: D/S nudge skeleton points**

For skeleton point selection and D/S active, use `fixed-rib` / `fixed-rib-compress` target entries with arrow delta. Use the first selected skeleton on-curve as clicked point when the arrow key did not originate from a mouse hit; document this matches donor fallback.

- [ ] **Step 3: X nudge skeleton handles**

For selected skeleton off-curves and X active, call the equalize target entry. This must move the selected off-curve by arrow delta and scale the opposite handle to the new length while preserving opposite direction.

- [ ] **Step 4: X nudge editable generated handles**

For selected `editableGeneratedHandle` and X active, call the editable generated handle equalize executor. Shift+X behavior follows the donor parity matrix; if donor treats Shift+X nudge as no-op for this surface, enforce that guard here and in the manual matrix.

- [ ] **Step 5: Run checks and commit**

```bash
node --check src-js/views-editor/src/scene-controller.js
node --check src-js/views-editor/src/skeleton-modifiers.js
node --check src-js/views-editor/src/edit-tools-pointer.js
npx prettier --write src-js/views-editor/src/scene-controller.js src-js/views-editor/src/skeleton-modifiers.js src-js/views-editor/src/edit-tools-pointer.js
git add .
git commit -m "feat(skeleton): route modifier nudges"
```

---

## Task 7: Port Semantic Tests from the Cleanup Reference

**Files:**
- Modify: `src-js/fontra-core/tests/test-skeleton-modifiers.js`
- Create only if the repo has a views-editor test harness by WS-13: `src-js/views-editor/tests/test-skeleton-modifier-targets.js`

**Interfaces:**
- Consumes post-refactor semantic fixtures from:
  - `git -C skeleton show origin/ref/cleanup:src-js/fontra-core/tests/test-edit-behavior-factory.js`

- [ ] **Step 1: Port fixed-rib fixture expectations**

Re-express these scenarios with canonical schema:

```text
applies fixed-rib skeleton point movement through factory persistence
applies fixed-rib-compress skeleton point movement through factory persistence
ignores fixed-rib skeleton point selections on layers without skeleton data
```

Do not copy donor flat field assertions like `width: 96`; compute expected canonical `width.left/right/linked`.

- [ ] **Step 2: Port equalize fixture expectations**

Re-express:

```text
constrains regular X-eq handles like skeleton X-eq handles
routes editable generated point X-eq through alternate nudge behavior
nudges editable generated points continuously in X-eq mode
equalizes editable generated handles through the live target-entry path
equalizes editable generated handles from generated contour positions
```

Tests must drive the live helper/target-entry path, not detached helper functions that production does not call.

- [ ] **Step 3: Run tests and commit**

```bash
cd src-js/fontra-core
npm test -- test-skeleton-modifiers.js
cd ../..
git add .
git commit -m "test(skeleton): cover modifier parity fixtures"
```

---

## Task 8: Bundle, Rail Checks, and Manual Matrix

**Files:**
- Verify all WS-13 files.

- [ ] **Step 1: Run automated checks**

```bash
cd src-js/fontra-core
npm test -- test-skeleton-modifiers.js
cd ../..
node --check src-js/views-editor/src/skeleton-modifiers.js
node --check src-js/views-editor/src/skeleton-editing.js
node --check src-js/views-editor/src/skeleton-ribs.js
node --check src-js/views-editor/src/skeleton-generated.js
node --check src-js/views-editor/src/edit-behavior.js
node --check src-js/views-editor/src/edit-tools-pointer.js
node --check src-js/views-editor/src/scene-controller.js
node --check src-js/views-editor/src/editor.js
node --check src-js/fontra-core/assets/lang/en.js
npm run bundle
```

- [ ] **Step 2: Run rail greps**

```bash
rg -n "applyFixedRib|equalizeSkeleton|Equalize Skeleton|Equalize editable|setSkeletonData\\(|regenerateSkeletonContours\\(" src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/scene-controller.js
rg -n "leftWidth|rightWidth|leftNudge|rightNudge|leftHandle(In|Out)Offset|rightHandle(In|Out)Offset|leftHandleDetached|rightHandleDetached|singleSidedDirection|isClosed" src-js/fontra-core/src src-js/views-editor/src
rg -n "skeletonPoint/\\$\\{.*Index|skeletonRib/\\$\\{.*Index|editableGenerated(Point|Handle)/\\$\\{.*skeletonContourIndex" src-js/views-editor/src
rg -n "if \\(.*(skeleton|editableGenerated|fixedRib|equalize).*makeChangeForDelta|makeChangeForDelta[\\s\\S]*(skeleton|editableGenerated|fixedRib)" src-js/views-editor/src/edit-behavior.js
rg -n "action.realtime.(equalize|fixed-rib|fixed-rib-compress)" src-js/views-editor/src/editor.js src-js/views-editor/src/edit-tools-pointer.js src-js/fontra-core/assets/lang/en.js
```

Expected:

```text
pointer and scene-controller do not directly mutate skeleton data or call generator
no donor flat schema fields in runtime source
no index-based skeleton/editable-generated selection construction
no skeleton-specific branch in shared makeChangeForDelta path
D/S/X actions are registered and handled
```

- [ ] **Step 3: Manual editor matrix**

Run forkra and donor `fd76d3abe` side by side with a WS-8 fixture and a WS-10-created skeleton.

```text
realtime state:
  hold X -> equalize mode active until keyup/blur
  hold D -> fixed-rib mode active until keyup/blur
  hold S -> fixed-rib-compress mode active until keyup/blur
  key repeat does not stack keyup listeners

D fixed-rib:
  drag selected skeleton on-curve -> donor-parity point movement and width expansion
  drag selected segment with handles -> donor-parity handle scaling
  Arrow nudge selected skeleton on-curve with D held -> donor-parity fixed-rib result
  undo/redo restores skeleton data and generated path

S fixed-rib-compress:
  same cases as D, with donor-parity compression side
  single-sided contour behavior matches donor

X skeleton handles:
  X+drag skeleton off-curve beside smooth point -> opposite handle equalizes
  X+Shift+drag -> constrained equalize
  X+Arrow selected skeleton off-curve -> equalized nudge
  on-curve skeleton point with X but no equalizable handle -> normal fallback/no-op per donor

X editable generated points:
  X+drag editable generated on-curve -> alternate rib nudge behavior
  X+Shift+drag -> alternate-constrain behavior
  linked/unlinked widths remain canonical

X editable generated handles:
  X+drag generated handle -> paired same-side generated handle equalizes
  detached generated handle -> detached offsets remain detached
  X+Arrow generated handle -> donor-parity nudge or documented donor no-op for Shift+X

mixed selections:
  regular path point + skeleton point with D/S/X -> no crash, donor-parity participating targets
  skeleton point + rib + editable generated point -> behavior name chosen by target-entry construction, not pointer branches

state:
  generated contours update live
  multi-layer editing applies modifier behavior to every editable layer with matching stable ids
  missing ids in one layer are skipped without blocking other layers
```

- [ ] **Step 4: Final formatting and commit if needed**

```bash
npx prettier --write src-js/fontra-core/src/skeleton-modifiers.js src-js/fontra-core/tests/test-skeleton-modifiers.js src-js/views-editor/src/skeleton-modifiers.js src-js/views-editor/src/skeleton-editing.js src-js/views-editor/src/skeleton-ribs.js src-js/views-editor/src/skeleton-generated.js src-js/views-editor/src/edit-behavior.js src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/scene-controller.js src-js/views-editor/src/editor.js src-js/fontra-core/assets/lang/en.js
git status --short
```

If formatting or fixes changed files:

```bash
git add .
git commit -m "fix(skeleton): complete modifier parity checks"
```

---

## Deviations

- Donor pointer-side D/S/X mutation sessions are not ported. Forkra expresses them as behavior names and target-entry executor variants.
- Donor flat schema and index keys are not ported.
- Skeleton Tunni equalize is not included in WS-13 even though donor X/Ctrl+Shift code references Tunni helpers. WS-14 owns skeleton Tunni.
- If equalize cannot be expressed in the shared target-entry model for one narrow editable-generated handle case, the implementation may add an isolated executor variant, but it must still live inside the behavior model and be covered by a targeted test.

---

## Acceptance Criteria

- Holding D, S, or X activates the corresponding realtime modifier and deactivates on keyup/blur.
- Fixed-rib and fixed-rib-compress work for skeleton point drag and arrow nudge.
- X equalize works for skeleton off-curve drag and arrow nudge.
- X equalize works for editable generated handles through the live WS-12 target-entry path.
- X editable generated points resolve to alternate rib behavior with donor parity.
- All modifier writes go through `editSkeleton`.
- No donor flat fields, index-based selection keys, geometric recovery, or pointer-side skeleton mutation paths are introduced.
- `npm test -- test-skeleton-modifiers.js`, `node --check` on touched JS files, and `npm run bundle` pass.

---

## Self-Review

- **Spec coverage:** WS-13 roadmap requirements are covered: D fixed-rib, S fixed-rib-compress, and X equalize for skeleton and editable-generated surfaces.
- **Scope check:** skeleton Tunni, source defaults, and panel work remain deferred.
- **Architecture rails:** modifiers are behavior names/executor variants; shared change emission remains kind-agnostic; all persistence routes through `editSkeleton`.
- **Donor discipline:** donor math and behavioral fixtures are the reference, but donor pointer plumbing, flat schema, and post-refactor adapter/composer machinery are rejected.
