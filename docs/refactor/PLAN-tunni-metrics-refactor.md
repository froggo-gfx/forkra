# Tunni + Metrics/Q Refactor Plan

Date: 2026-03-10
Status: Draft
Source of truth: `docs/refactor/sot-unified-behavior.md`

## Summary

This plan is for the next chapter after the broad unified-behavior refactor and the beautify/cleanup chapter.

This plan is not:

- a second broad point-like drag/nudge migration
- a reason to reopen the finished adapter/composer/pointer boundary work
- a reason to force Q-measure into the unified point-like pipeline

This plan is for the two active lanes that were explicitly left for later:

1. Tunni
2. Q-measure / distance-angle

Hard requirements for this chapter:

1. Shared regular + skeleton Tunni geometry must converge to one implementation file.
   Selection objects can differ; math implementation must not fork.
2. Q-measure and distance-angle must use one shared measure-math implementation file.
   Display/interaction wrappers can differ; math implementation must not fork.

The old `PLAN-tunni-metrics-refactor.md` found real problems.

The problem was the architecture it assumed.

That old plan was written for another branch where pointer still owned much more behavior.

This branch is different:

- registry/composer/adapters are already the accepted routing shape
- Tunni already exists in the routing surface as specialized routed drag kinds
- equalize drag/nudge for in-scope point-like routes is already migrated
- Q-measure is still an out-of-scope hover/mode workflow, not part of the unified point-like drag/nudge pipeline

So this rewritten plan keeps the valid findings, but adapts them to the architecture that actually exists now.

The work in this plan is split into these phases:

0. Lock the scope, reporting rules, and baseline scenarios.
1. Separate pure regular-Tunni geometry from mixed interaction code.
2. Remove regular Tunni execution ownership from core and pointer private handlers.
3. Remove skeleton Tunni execution ownership from pointer private handlers.
4. Make Q-measure state ownership honest and centralized.
5. Extract Q-measure hover target resolution into one explicit helper.
6. Split visualization-layer ownership by domain and clean up `distance-angle.js`.
7. Share generated-contour exclusion logic across Tunni and measure code.
8. Close the remaining supporting tech debt and run the chapter closeout sweep.

## Reporting Rule For This Plan

This plan should not write progress into the old broad or beautify reports.

Use:

- `docs/refactor/progress-report-broad.md`
  - only for already-completed broad architecture milestones
- `docs/refactor/progress-report-beautify.md`
  - only for the completed cleanup/optimization chapter that already happened
- `docs/refactor/progress-report-tunni-metrics.md`
  - use this plan's step-by-step work here

Rule:

- every finished step in this plan must end with a new entry in `docs/refactor/progress-report-tunni-metrics.md`
- do not write new Tunni/Q entries into `progress-report-broad.md`
- do not write new Tunni/Q entries into `progress-report-beautify.md`

Required entry format for `docs/refactor/progress-report-tunni-metrics.md`:

- Step header (`Phase X - Step Y`)
- Problem
- Code analysis
- Comparison
- Manual test results
- Undo/redo verification

---

## Phase 0: Lock Scope, Reporting, And Baseline Before Touching Ownership

### Broad Problem

The old Tunni/metrics plan was written for a different branch.

That means two kinds of mistakes are likely if this chapter starts coding immediately:

- it can ask for real fixes using the wrong architecture
- it can accidentally reopen the finished broad refactor just because the old plan still talks that way

Before touching code, this chapter needs one explicit scope lock:

- what is still wrong now
- what is already considered finished
- what manual scenarios define parity for this chapter

### Step 0.1: Write down the exact difference between the old branch assumptions and the current branch reality

#### Problem Aspect

If this chapter starts from the old plan's assumptions, it will drift immediately.

The biggest risks are:

- treating Tunni like it still needs a fresh routing architecture
- treating pointer decomposition as the primary goal instead of honest ownership
- treating Q-measure like it belongs inside composer/adapters just because the branch now has those modules

#### Proposed Solution (Plain Language)

Write down one explicit statement of current reality before any code move:

- the broad unified-behavior refactor is already done
- Tunni is currently routed as specialized routed drag kinds
- Q-measure is still an out-of-scope hover/mode workflow
- this chapter is about ownership cleanup, pure-math separation, and state honesty
  - not about inventing a new point-like pipeline

This step is documentation only.

#### Explicit Scope Lock Statement

Current branch reality for this chapter:

- the broad unified-behavior refactor is already complete and recorded in `docs/refactor/progress-report-broad.md`
- the cleanup/optimization chapter is already complete and recorded in `docs/refactor/progress-report-beautify.md`
- registry -> composer -> adapters is already the accepted routing shape for this branch
- regular and skeleton Tunni already exist on that routing surface as supported specialized routed drag kinds
- Tunni still has honest remaining problems, but those problems are about execution ownership, geometry duplication, and editor/core boundaries
- Q-measure still belongs to the pointer/scene-model hover+mode surface, not to the unified point-like drag/nudge pipeline
- this chapter must not reopen the finished broad migration or invent a new canonical point-like route family for Q-measure

Old-plan assumptions that are explicitly rejected for this branch:

- "Tunni still needs fresh routing architecture"
- "pointer decomposition is the main unfinished goal"
- "Q-measure should be pulled into composer/adapters just because those modules now exist"
- "this chapter should continue the broad drag/nudge migration"

#### Code Evidence

Current branch evidence to cite:

- `docs/refactor/sot-unified-behavior.md`
- `docs/refactor/progress-report-broad.md`
- `docs/refactor/progress-report-beautify.md`
- `src-js/views-editor/src/edit-behavior-registry.js`
- `src-js/views-editor/src/edit-behavior-composer.js`
- `src-js/views-editor/src/edit-behavior-adapters.js`

Important current-shape evidence:

```js
// registry: Tunni exists as specialized routed drag kinds
tunniPoint: { selectionKey: null, supports: ["drag"] }
skeletonTunniPoint: { selectionKey: null, supports: ["drag"] }
```

```js
// composer: Tunni uses the existing routing shape
const adapter = getDragAdapterForRouting(routing, objectKind);
```

```js
// current code still names these fallback routes, but architecturally
// they are specialized routed Tunni paths and should not bounce back into pointer
tunniPoint: async (context) => runFallbackTunniDrag(context)
skeletonTunniPoint: async (context) => runFallbackSkeletonTunniDrag(context)
```

#### Files To Touch

- `docs/refactor/PLAN-tunni-metrics-refactor.md`
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

This is a scope-lock step.

Do a quick sanity pass only:

1. Drag a regular Tunni point.
2. Drag a skeleton Tunni point.
3. Hold Q and hover a segment.
4. Release Q and confirm cleanup.

Expected result:

- no behavior change

---

### Step 0.2: Record the chapter hard requirements explicitly so no step can bypass them

#### Problem Aspect

Without explicit hard requirements in the plan text, later steps can silently "clean up" around duplicates without actually eliminating the duplicate math implementations.

#### Proposed Solution (Plain Language)

Write these as non-negotiable constraints for the whole chapter:

- one shared Tunni geometry implementation for regular + skeleton
- one shared measure geometry implementation for Q-measure + distance-angle

Allow wrappers and translation layers to differ, but do not allow duplicated core math implementations.

#### Hard Requirements Locked For All Later Steps

The following constraints are mandatory for the rest of this chapter:

1. Regular Tunni math and skeleton Tunni math must converge to one shared geometry implementation file.
2. Q-measure math and distance-angle math must converge to one shared implementation file.
3. `src-js/views-editor/src/skeleton-tunni-calculations.js` must not remain as a second Tunni owner in the target state.
4. Skeleton-specific Tunni execution glue belongs in existing pointer-related files, not in a separate Tunni file.
5. Wrapper separation is not allowed to preserve duplicated formulas or duplicated geometry ownership.
6. No later step is complete if it only moves code around while leaving the duplicate math implementations alive.

Practical reading rule for all later phases:

- if a step improves ownership but leaves two live math implementations for the same domain, that step is incomplete
- if a step changes wrappers but keeps one domain-level math source of truth, that is acceptable

#### Code Evidence

Current split that must be collapsed:

- Tunni math split across:
  - `src-js/fontra-core/src/tunni-calculations.js`
  - `src-js/views-editor/src/skeleton-tunni-calculations.js`
  - Tunni leftovers in `src-js/fontra-core/src/distance-angle.js`
- Measure-related math split across:
  - Q-measure usage in editor-side code
  - distance-angle math in `src-js/fontra-core/src/distance-angle.js`

#### Files To Touch

- `docs/refactor/PLAN-tunni-metrics-refactor.md`
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

This is a plan-constraint step.

Do a quick sanity pass only:

1. Confirm no behavior changed in the editor.

Expected result:

- no behavior change

---

## Phase 1: Consolidate Shared Geometry Implementations First

### Broad Problem

Right now the same math domains are implemented in multiple places:

- Tunni geometry has separate regular and skeleton implementations
- measure math and distance-angle math are partially duplicated by use-case

As long as the math is duplicated, ownership cleanup alone will not remove drift risk.

### Step 1.1: Define the single-file targets for shared math before moving any interaction code

#### Problem Aspect

If the target files are not fixed first, code cleanup can move helpers around while preserving duplicate implementations.

#### Proposed Solution (Plain Language)

Pick one file target per shared-math domain and lock it:

- Tunni shared geometry target: one file used by both regular and skeleton workflows.
- Measure shared geometry target: one file used by both Q-measure and distance-angle workflows.

Wrappers can stay in separate editor/core modules, but math implementation must be unique per domain.

#### Locked Single-File Targets

For this chapter, the single-file targets are:

- Tunni shared geometry target: `src-js/fontra-core/src/tunni-calculations.js`
- Measure shared geometry target: `src-js/fontra-core/src/distance-angle.js`

Locked Tunni file rule:

- there is one shared Tunni file
- `src-js/views-editor/src/skeleton-tunni-calculations.js` is not an allowed target-state owner for Tunni logic
- skeleton-specific execution glue must be absorbed into existing pointer-related files

Why these targets are locked now:

- both domains need one honest existing owner before interaction ownership starts moving
- both targets reduce file split instead of adding another delegation layer
- neither target claims editor interaction ownership, scene access, or visualization ownership

Compatibility rule during migration:

- wrapper files may temporarily delegate into these existing targets while call sites are being moved
- the temporary compatibility phase ends when the old duplicate implementations are removed

#### Code Evidence

Current split to collapse:

- regular Tunni math: `src-js/fontra-core/src/tunni-calculations.js`
- skeleton Tunni math: `src-js/views-editor/src/skeleton-tunni-calculations.js`
- distance-angle-related math: `src-js/fontra-core/src/distance-angle.js`

#### Files To Touch

- `docs/refactor/PLAN-tunni-metrics-refactor.md`
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

This is a target-definition step.

Do a quick sanity pass only:

1. Drag regular Tunni midpoint.
2. Drag skeleton Tunni midpoint.
3. Hold Q and hover a segment.

Expected result:

- no behavior change

---

### Step 1.2: Converge all shared Tunni code into one file and remove the second Tunni owner

#### Problem Aspect

The current code has multiple Tunni sources:

- `tunni-calculations.js` (regular)
- `skeleton-tunni-calculations.js` (skeleton)
- `distance-angle.js` (leftovers)

That makes every later cleanup step harder because no existing file is the honest source of truth.

#### Proposed Solution (Plain Language)

Use the existing core Tunni owner, `src-js/fontra-core/src/tunni-calculations.js`, as the single shared Tunni home.

Move all shareable regular+skeleton Tunni code into that file.

Do not preserve `src-js/views-editor/src/skeleton-tunni-calculations.js` as a second Tunni owner.

If skeleton-specific execution glue is still needed after consolidation, move it into existing pointer-related files:

- `src-js/views-editor/src/edit-tools-pointer.js`
- `src-js/views-editor/src/edit-behavior-adapters.js`

Do not move:

- hit testing
- scene access
- visualization-layer knowledge
- editor transactions
- canvas drawing

Keep only a short compatibility phase while imports are being moved.

This step is not complete until `src-js/views-editor/src/skeleton-tunni-calculations.js` stops being a Tunni owner.

#### Code Evidence

Target direction:

```js
// src-js/fontra-core/src/tunni-calculations.js (single shared Tunni owner)
export function calculateMidpointTunni(segmentPoints) {}
export function calculateTrueTunniPoint(segmentPoints) {}
export function calculateControlPointsFromTunni(...) {}
export function calculateOnCurvePointsFromTunni(...) {}
export function calculateEqualizedControlPoints(...) {}
export function calculateControlHandleDistance(...) {}
export function areControlHandleDistancesEqualized(...) {}
```

#### Files To Touch

- `src-js/fontra-core/src/tunni-calculations.js`
- `src-js/fontra-core/src/distance-angle.js`
- touched pointer/adapters files that absorb the remaining skeleton-specific glue
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

Run a regular-Tunni parity pass:

1. Drag a midpoint Tunni point.
2. Drag a true Tunni point.
3. Ctrl+Shift-click midpoint Tunni.
4. Repeat with grid snap enabled if available.
5. Undo and redo one regular Tunni action.

Expected result:

- no UI behavior drift
- one shared Tunni implementation now exists for both regular and skeleton workflows
- there is no second Tunni owner file left in the target state

---

### Step 1.3: Converge shared measure math into one existing owner and route both Q-measure and distance-angle through it

#### Problem Aspect

Even if Tunni is unified, measure math can still drift if Q-measure and distance-angle keep separate implementations.

#### Proposed Solution (Plain Language)

Use one existing shared owner for measure math and route both Q-measure and distance-angle math through it.

Do not leave multiple measure-math implementations alive after this phase.

#### Code Evidence

Current duplicate pressure in measure domain:

```js
// same measurement math expressed in different places for different overlays/modes
```

#### Files To Touch

- `src-js/fontra-core/src/distance-angle.js`
- Q-measure math call sites in editor-side code
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

Run a visualization-focused parity pass:

1. Hold Q and confirm projected values match baseline.
2. Hold Alt+Q and confirm direct distance/angle values match baseline.
3. Show distance/manhattan overlays and confirm values match baseline.
4. Confirm the same numeric cases produce consistent values across Q and distance-angle views.

Expected result:

- one shared measure math implementation now exists for Q-measure + distance-angle
- visual output stays the same

---

## Phase 2: Remove Regular Tunni Execution Ownership From Core And Pointer Private Methods

### Broad Problem

Regular Tunni now already uses the branch's routing shape on paper:

- pointer routes drag through composer
- registry exposes `tunniPoint`
- adapters expose a specialized routed Tunni path

But the actual execution boundary is still dishonest:

- `runFallbackTunniDrag(...)` still calls `pointerTool._handleTunniPointDrag(...)`
- core still owns regular-Tunni hit testing and interaction helpers

This phase fixes that without inventing a second routing architecture.

### Step 2.1: Move regular-Tunni interaction helpers out of core and into editor code

#### Problem Aspect

Core code currently knows too much about editor-facing interaction setup.

That is the wrong boundary even if the behavior still works.

#### Proposed Solution (Plain Language)

Move editor-coupled regular-Tunni helpers out of `src-js/fontra-core/src/tunni-calculations.js` into editor code.

Keep only pure geometry in core.

Editor-side owners must stay inside the existing editor architecture:

- adapter-local helper blocks inside `src-js/views-editor/src/edit-behavior-adapters.js`
- pointer-owned hit-test and route-selection helpers inside `src-js/views-editor/src/edit-tools-pointer.js`

Do not create a standalone regular-Tunni interaction module.

What is not acceptable is leaving editor session/hit-test code in core just because it already exists there.

#### Code Evidence

Likely editor-coupled regular-Tunni helpers:

```js
tunniLayerHitTest(...)
handleTunniPointMouseDown(...)
handleTunniPointMouseDrag(...)
handleTunniPointMouseUp(...)
handleTrueTunniPointMouseDown(...)
handleTrueTunniPointMouseDrag(...)
handleTrueTunniPointMouseUp(...)
equalizeThenQuantizeSegmentControlPoints(...)
```

#### Files To Touch

- `src-js/fontra-core/src/tunni-calculations.js`
- `src-js/views-editor/src/edit-behavior-adapters.js` (adapter-local helper block)
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

Run a regular-Tunni interaction pass:

1. Hover a regular Tunni point and confirm cursor behavior.
2. Drag a midpoint Tunni point.
3. Drag a true Tunni point.
4. Ctrl+Shift-click midpoint Tunni.
5. Undo and redo one action.

Expected result:

- behavior is unchanged
- core no longer owns editor interaction/session helpers

---

### Step 2.2: Make the specialized Tunni adapter own regular-Tunni execution instead of bouncing back into pointer private methods

#### Problem Aspect

Right now the specialized Tunni adapter path exists, but it is not honest.

It still delegates to pointer private methods.

That defeats the point of having the routing/adapters surface in the first place.

#### Proposed Solution (Plain Language)

Keep the current route shape:

- pointer hit-tests and routes
- composer resolves the specialized Tunni route
- specialized adapter executes the route

Change only the execution ownership.

The specialized Tunni adapter should call adapter-local regular-Tunni helpers that live in `src-js/views-editor/src/edit-behavior-adapters.js` or existing pointer-owned hit-test helpers in `src-js/views-editor/src/edit-tools-pointer.js`.

It should not call:

```js
pointerTool._handleTunniPointDrag(...)
```

#### Code Evidence

Current dishonest shape in the current code:

```js
async function runFallbackTunniDrag({ pointerTool, eventStream, initialEvent }) {
  const handled = await pointerTool._handleTunniPointDrag(eventStream, initialEvent);
  ...
}
```

Target direction:

```js
async function runFallbackTunniDrag(context) {
  return runRegularTunniSpecializedSession(context);
}
```

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
- adapter-local regular-Tunni helper blocks inside `src-js/views-editor/src/edit-behavior-adapters.js` if needed
- `src-js/views-editor/src/edit-tools-pointer.js`
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

Run a specialized-route parity pass:

1. Drag a midpoint regular Tunni point.
2. Drag a true Tunni point.
3. Ctrl+Shift-click midpoint Tunni.
4. Cancel a drag mid-stream if that is supported.
5. Undo and redo.

Expected result:

- same behavior
- the specialized Tunni adapter now owns the execution boundary honestly

---

## Phase 3: Remove Skeleton Tunni Execution Ownership From Pointer Private Methods

### Broad Problem

After Phase 1, skeleton Tunni should no longer have its own Tunni file.

But the live execution boundary is still pointer-owned:

- `_handleSkeletonTunniDrag(...)`
- `_equalizeSkeletonTunniTensions(...)`

And the current specialized Tunni adapter path for `skeletonTunniPoint` still delegates back into those pointer private methods.

### Step 3.1: Separate skeleton-Tunni execution ownership from pointer without redesigning the workflow

#### Problem Aspect

This phase must be careful not to turn into a workflow redesign.

The goal is not "invent a new skeleton Tunni UX".

The goal is:

- preserve behavior
- move execution ownership out of pointer private methods
- keep the existing specialized routed shape

#### Proposed Solution (Plain Language)

Move skeleton-Tunni execution into adapter-owned helpers inside `src-js/views-editor/src/edit-behavior-adapters.js`.

Keep:

- pointer-owned hit testing and routing
- existing `skeletonTunniPoint` specialized routed entry

Remove:

- pointer private ownership of the live execution session

#### Code Evidence

Current pointer-owned execution:

```js
async _handleSkeletonTunniDrag(eventStream, initialEvent, tunniHit) { ... }
async _equalizeSkeletonTunniTensions(tunniHit) { ... }
```

Current dishonest adapter path in the current code:

```js
async function runFallbackSkeletonTunniDrag({ pointerTool, ... }) {
  return pointerTool._handleSkeletonTunniDrag(...);
}
```

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
- `src-js/views-editor/src/edit-tools-pointer.js`
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

Run a skeleton-focused parity pass:

1. Drag a skeleton midpoint Tunni point.
2. Drag a skeleton true-Tunni point.
3. Ctrl+Shift equalize on skeleton Tunni.
4. Repeat with Alt behavior.
5. Undo and redo one skeleton Tunni action.

Expected result:

- same behavior
- pointer no longer owns the skeleton-Tunni execution session directly

---

### Step 3.2: Reuse shared skeleton-backed persistence helpers where the skeleton-Tunni path is currently open-coded

#### Problem Aspect

Skeleton-Tunni execution currently repeats the same kinds of work that other skeleton-backed editor paths already had to clean up:

- clone skeleton data
- mutate working data
- regenerate contours
- save skeleton data

If this chapter leaves that open-coded duplication untouched, the ownership move will still leave avoidable risk behind.

#### Proposed Solution (Plain Language)

After moving skeleton-Tunni execution out of pointer private methods, reuse existing skeleton-backed persistence helpers where practical.

Do not create a fake universal helper if the route needs route-specific behavior.

Do remove the obvious regenerate/save duplication when the lifecycle is materially the same.

#### Code Evidence

Current open-coded skeleton-Tunni persistence shapes:

```js
regenerateSkeletonContours(...)
setSkeletonData(...)
JSON.parse(JSON.stringify(...))
```

Compare against existing adapter-side skeleton-backed helpers in:

- `src-js/views-editor/src/edit-behavior-adapters.js`

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
- the new skeleton-Tunni execution owner if one is added
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

Run a multi-layer/skeleton-focused parity pass:

1. Drag a skeleton midpoint Tunni point across editable layers.
2. Drag a true-Tunni point across editable layers.
3. Ctrl+Shift equalize.
4. Undo and redo.
5. Confirm no skeleton/generated contour mismatch appears.

Expected result:

- same behavior
- less duplicated skeleton-backed persistence code

---

## Phase 4: Make Q-Measure State Ownership Honest And Centralized

### Broad Problem

Q-measure currently has scattered state ownership:

- pointer has measure-mode lifecycle state
- SceneModel stores measure-related fields
- pointer writes those fields directly in several places

That makes cleanup behavior easy to break.

### Step 4.1: Define one truthful measure state owner and one explicit reset policy

#### Problem Aspect

Before changing code, this chapter needs one plain-language rule for measure state:

- who owns it
- who is allowed to mutate it
- when it must reset

Without that, the extraction work will stay inconsistent.

#### Proposed Solution (Plain Language)

State rule for this chapter:

- SceneModel owns measure state
- pointer drives the mode lifecycle and hover transport
- pointer does not directly scatter raw writes across many `sceneModel.measure*` fields after this phase
- one reset path must cover:
  - Q key-up
  - Alt key-up while Q is still active
  - tool switch
  - blur / drag teardown / other hard exits as applicable

#### Code Evidence

Current split-state evidence:

- `src-js/views-editor/src/scene-model.js`
- `src-js/views-editor/src/edit-tools-pointer.js`

Current raw field pattern:

```js
this.sceneModel.measureMode = true;
this.sceneModel.measureShowDirect = event.altKey;
this.sceneModel.measureHoverSegment = null;
this.sceneModel.measureHoverRibPoint = null;
this.sceneModel.measureHoverPoints = null;
this.sceneModel.measureHoverHandle = null;
```

#### Files To Touch

- `docs/refactor/PLAN-tunni-metrics-refactor.md`
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

This is a state-rule step.

Do a quick sanity pass only:

1. Hold Q and move the cursor.
2. Press and release Alt while Q is held.
3. Release Q.

Expected result:

- no behavior change

---

### Step 4.2: Replace scattered measure field writes with one SceneModel-owned API

#### Problem Aspect

Even if the ownership rule is documented, the cleanup is incomplete until the code stops writing scattered fields directly.

#### Proposed Solution (Plain Language)

Add a small measure-state API to `SceneModel`.

Possible shape:

```js
setMeasureActive(...)
setMeasureShowDirect(...)
setMeasureHoverTarget(...)
resetMeasureState()
```

The exact API can differ.

What matters is:

- one owner
- one reset path
- pointer stops doing direct multi-field mutation everywhere

#### Code Evidence

Current state fields in `src-js/views-editor/src/scene-model.js`:

```js
this.measureMode = false;
this.measureShowDirect = false;
this.measureHoverSegment = null;
this.measureHoverRibPoint = null;
this.measureHoverPoints = null;
this.measureHoverHandle = null;
```

#### Files To Touch

- `src-js/views-editor/src/scene-model.js`
- `src-js/views-editor/src/edit-tools-pointer.js`
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

Run a measure lifecycle pass:

1. Hold Q and hover a segment.
2. Move from segment to handle to rib point.
3. Press and release Alt while holding Q.
4. Release Q.
5. Switch tools while Q/measure state is active if that path exists.

Expected result:

- same visible behavior
- one clear state owner now exists

---

## Phase 5: Extract Q-Measure Hover Target Resolution Into One Explicit Helper

### Broad Problem

Q hover targeting is still encoded inside pointer through several private helpers and direct state updates.

That makes priority bugs and cleanup bugs hard to reason about.

### Step 5.1: Write down the exact hover priority and target shape before extraction

#### Problem Aspect

If the extraction starts before the priority order is written down explicitly, the helper can easily preserve the wrong behavior or change priority by accident.

#### Proposed Solution (Plain Language)

Document the hover priority in the plan and then mirror it in code:

1. rib point
2. off-curve handle
3. segment
4. selected-point pair

Also define one explicit target shape returned by the helper.

#### Code Evidence

Current pointer-owned resolution path lives in:

- `src-js/views-editor/src/edit-tools-pointer.js`

Current priority is visible in the order of:

```js
_findRibPointForMeasure(...)
_findControlPointForMeasure(...)
_findSegmentForMeasure(...)
_getMeasurePointsFromSelection(...)
```

#### Files To Touch

- `docs/refactor/PLAN-tunni-metrics-refactor.md`
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

This is a documentation step.

Do a quick sanity pass:

1. Hover where rib/handle/segment candidates are close.
2. Confirm current target order before extraction.

Expected result:

- no behavior change

---

### Step 5.2: Extract one measure hover resolver helper and make pointer use it

#### Problem Aspect

Right now pointer owns both:

- deciding what the hover target is
- applying that result into state

That mixes target resolution with mode-state mutation.

#### Proposed Solution (Plain Language)

Create one editor-local helper that resolves the hover target for measure mode.

The helper should:

- receive the inputs it needs
- return one typed result
- not mutate SceneModel directly

Pointer should then:

- call the helper
- push the result into the SceneModel measure API

#### Code Evidence

Target direction:

```js
export function resolveMeasureHoverTarget(...) {
  return { kind: "ribPoint" | "handle" | "segment" | "selectedPoints" | null, payload };
}
```

#### Files To Touch

- one new editor-side measure helper module
- `src-js/views-editor/src/edit-tools-pointer.js`
- `src-js/views-editor/src/scene-model.js`
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

Run a hover-priority pass:

1. Hover a rib point.
2. Hover an off-curve handle.
3. Hover a segment.
4. Hover with exactly two relevant selected points.
5. Repeat at low and high zoom if practical.

Expected result:

- same hover priority as baseline
- pointer code is simpler and less state-coupled

---

## Phase 6: Split Visualization-Layer Ownership By Domain And Clean Up `distance-angle.js`

### Broad Problem

`src-js/views-editor/src/visualization-layer-definitions.js` has become a large mixed bucket for:

- registry functions
- base layers
- Q overlay
- Tunni combined/actual-point layers
- distance/manhattan layers
- Tunni label layer

At the same time, `src-js/fontra-core/src/distance-angle.js` still owns Tunni label drawing and related helpers that clearly do not belong in core.

### Step 6.1: Split Tunni and measure visualization registration out of the giant mixed file

#### Problem Aspect

The problem is not that there is a shared layer registry file.

The problem is that domain-specific registration and draw logic are still living inside one giant mixed module.

#### Proposed Solution (Plain Language)

Keep the common registry helpers where they are.

Move domain-specific registrations into clearer files if that improves ownership:

- Tunni registration/draw helpers together
- measure/Q overlay registration/draw helpers together

Do not split the file just because "smaller files are nicer".

Split only when the new file boundary is honest.

#### Code Evidence

Current mixed-domain registration evidence:

- `src-js/views-editor/src/visualization-layer-definitions.js`

Relevant current sections:

```js
identifier: "fontra.measure.overlay"
identifier: "fontra.tunni.combined"
identifier: "fontra.tunni.actual.points"
identifier: "fontra.distance-angle"
identifier: "fontra.manhattan-distance"
identifier: "fontra.tunni.labels"
```

#### Files To Touch

- `src-js/views-editor/src/visualization-layer-definitions.js`
- one or more new visualization-layer domain files if needed
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

Run a visualization-toggle pass:

1. Toggle Q overlay behavior via Q hold.
2. Toggle Tunni combined points.
3. Toggle actual Tunni points.
4. Toggle distance-angle.
5. Toggle manhattan distance.
6. Toggle Tunni labels.
7. Confirm z-order and visibility still match baseline.

Expected result:

- same visuals
- clearer domain ownership in code

---

### Step 6.2: Move Tunni label drawing out of `distance-angle.js` and leave that file measure-focused

#### Problem Aspect

`distance-angle.js` is currently lying about its role.

It still contains:

- duplicated Tunni geometry
- Tunni label drawing
- generated-contour filtering for Tunni labels

That is not a measure-focused file.

#### Proposed Solution (Plain Language)

After Phase 1 removes duplicated geometry, move the remaining Tunni label drawing out of core and into views-editor.

Keep in core only what still clearly belongs there:

- measure geometry
- measure formatting
- measure drawing helpers if they remain general enough to justify staying there

Do not leave any Tunni-specific canvas drawing in core.

#### Code Evidence

Current Tunni-specific core evidence:

```js
export function drawTunniLabels(...)
function getSkeletonGeneratedContourIndexSet(...)
```

in:

- `src-js/fontra-core/src/distance-angle.js`

#### Files To Touch

- `src-js/fontra-core/src/distance-angle.js`
- one editor-side Tunni visualization file
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

Run a label-focused parity pass:

1. Show Tunni labels on a regular cubic contour.
2. Confirm distance/tension/angle visibility settings still work.
3. Confirm generated contours are still excluded.
4. Undo/redo a Tunni edit and confirm labels update correctly.

Expected result:

- same Tunni label behavior
- no Tunni-specific canvas drawing remains in core

---

## Phase 7: Share Generated-Contour Exclusion Logic Across Tunni And Measure Code

### Broad Problem

Generated-contour exclusion is still duplicated in multiple places.

That creates a slow-drift risk:

- draw code can ignore generated contours
- while hit-test code accidentally starts seeing them

or the reverse.

### Step 7.1: Introduce one editor-side helper for generated-contour exclusion

#### Problem Aspect

Right now similar exclusion logic appears in more than one file.

That is exactly the kind of small duplication that later becomes a parity bug.

#### Proposed Solution (Plain Language)

Add one editor-side helper that resolves generated contour indices for the active layer and positioned glyph.

Then reuse it anywhere this chapter touches Tunni/measure code.

#### Code Evidence

Current duplicate-style helper evidence appears in places like:

- `src-js/fontra-core/src/tunni-calculations.js`
- `src-js/fontra-core/src/distance-angle.js`
- `src-js/views-editor/src/visualization-layer-definitions.js`

Target direction:

```js
export function getGeneratedContourIndexSet(positionedGlyph, sceneSettings) { ... }
```

#### Files To Touch

- one new editor-side generated-contour helper module
- touched Tunni/measure modules that currently open-code this logic
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

Run a generated-contour exclusion pass:

1. Regular Tunni should ignore generated contours.
2. Tunni labels should ignore generated contours.
3. Measure/Q should ignore generated contours where intended.
4. Normal non-generated contours should still work.

Expected result:

- one exclusion rule
- no draw/hit-test drift

---

## Phase 8: Close The Remaining Supporting Tech Debt And Run The Chapter Closeout Sweep

### Broad Problem

Even after the main ownership cleanup, three small but real problems remain:

- brittle Tunni checkbox binding
- global Ctrl-modified MouseTracker workaround
- leftover temporary naming in the touched files

These are not the main architecture, but they are part of the same messy surface and should be closed in the same chapter.

### Step 8.1: Replace the brittle Tunni checkbox binding in `panel-transformation.js`

#### Problem Aspect

The current binding uses:

- `setTimeout(...)`
- checkbox index order
- DOM lookup by position

That is fragile and unrelated to the actual meaning of the fields.

#### Proposed Solution (Plain Language)

Bind the Tunni checkbox behavior by field key at creation time.

Do not rely on:

- `allCheckboxes[0]`
- `allCheckboxes[1]`
- `allCheckboxes[2]`

Remove the deferred DOM patch-up block entirely.

#### Code Evidence

Current brittle pattern:

```js
setTimeout(() => {
  const allCheckboxes = ...
  const distanceCheckbox = allCheckboxes[0];
  ...
}, 0);
```

#### Files To Touch

- `src-js/views-editor/src/panel-transformation.js`
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

Run a UI-binding pass:

1. Toggle `showTunniDistance`.
2. Toggle `showTunniTension`.
3. Toggle `showTunniAngle`.
4. Reopen the panel.
5. Rebuild the form if that path is easy to trigger.

Expected result:

- same visible behavior
- no index-based binding remains

---

### Step 8.2: Replace the broad MouseTracker Ctrl workaround with an explicit allow-policy

#### Problem Aspect

The current code solved the Tunni need by broadly removing the `ctrlKey` guard in `MouseTracker`.

That is too indirect and can affect unrelated tools or interactions.

#### Proposed Solution (Plain Language)

Add one explicit allow-policy for ctrl-modified mouse down.

Default behavior should stay safe.

Only the precise Tunni case that needs Ctrl+Shift should opt in.

#### Code Evidence

Current broad workaround:

```js
if (event.button === 2 /* || event.ctrlKey */) {
  return;
}
```

#### Files To Touch

- `src-js/fontra-core/src/mouse-tracker.js`
- the owner that constructs `MouseTracker`
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

Run an input-policy pass:

1. Ctrl+Shift-click Tunni midpoint.
2. Confirm the intended Tunni action still works.
3. Try ordinary Ctrl-modified mouse down in unrelated pointer cases.
4. Try another tool if practical.

Expected result:

- Tunni still works
- unrelated Ctrl-modified behavior does not regress

---

### Step 8.3: Remove the last temporary names and run the full chapter closeout sweep

#### Problem Aspect

After all ownership moves, temporary names and stale aliases can still leave the code harder to trust than it should be.

One closeout check is that temporary or misleading names introduced in this touch zone are gone.

#### Proposed Solution (Plain Language)

Run one final naming and closeout sweep over the touched Tunni/Q files.

Remove any touched temporary compatibility names that no longer have a reason to exist.

Then run the full chapter manual matrix.

#### Code Evidence

Useful closeout checks:

```bash
rg -n "_handleTunniPointDrag|_handleSkeletonTunniDrag|_equalizeSkeletonTunniTensions" src-js/views-editor/src
rg -n "setTimeout\\(|allCheckboxes\\[0\\]|allCheckboxes\\[1\\]|allCheckboxes\\[2\\]" src-js/views-editor/src/panel-transformation.js
```

The exact grep list may improve as names improve during the chapter.

#### Files To Touch

- touched Tunni/Q implementation files
- `docs/refactor/progress-report-tunni-metrics.md`

#### Manual Tests

Run the full closeout matrix:

1. Regular midpoint Tunni drag.
2. Regular true-Tunni drag.
3. Regular Ctrl+Shift midpoint equalize + quantize.
4. Skeleton midpoint Tunni drag.
5. Skeleton true-Tunni drag.
6. Skeleton Ctrl+Shift equalize.
7. Q projected mode.
8. Alt+Q direct mode.
9. Q hover priority rib > handle > segment > selected points.
10. Generated-contour exclusion for regular Tunni/measure.
11. Tunni label visibility toggles.
12. Ctrl+Shift input-policy check.
13. Undo and redo for one regular Tunni action and one skeleton Tunni action.

Expected result:

- no behavior drift from baseline
- ownership and file boundaries are easier to trust

---

## Acceptance Criteria

This chapter is complete only when all of these are true:

- regular Tunni geometry has one source of truth
- `tunni-calculations.js` no longer mixes pure geometry with editor interaction ownership
- shared Tunni geometry exists as one implementation for regular + skeleton
- shared measure geometry exists as one implementation for Q-measure + distance-angle
- `distance-angle.js` no longer duplicates Tunni geometry
- `distance-angle.js` no longer draws Tunni labels
- regular Tunni specialized routed execution no longer goes through pointer private methods
- skeleton Tunni specialized routed execution no longer goes through pointer private methods
- skeleton-Tunni persistence no longer open-codes obviously shared skeleton-backed lifecycle work
- SceneModel owns one coherent measure state API
- Q hover target resolution is one explicit helper with stable priority
- visualization-layer registration is clearer by domain
- generated-contour exclusion is shared
- Tunni panel checkbox binding is deterministic
- MouseTracker Ctrl-modified behavior is explicit instead of globally relaxed
- no broad unified-behavior regressions are introduced

## Working Rule For This Plan

When two approaches are possible, choose the one that follows these rules:

1. Prefer ownership fixes over file shuffling.
2. Prefer pure-math extraction over moving editor interaction code into core.
3. Prefer adapter-owned specialized execution over pointer private execution.
4. Prefer one explicit state API over scattered mutable fields.
5. Prefer small verified steps over a single large rewrite.

