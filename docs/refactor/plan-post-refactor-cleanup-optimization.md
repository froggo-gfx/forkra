# Post-Refactor Cleanup and Optimization Plan

Date: 2026-03-06
Status: Plan populated and ready for execution
Source of truth: `docs/refactor/sot-unified-behavior.md`

## Summary

The broad unified-behavior architecture is already in place.

This new plan is not about big architectural direction anymore.

This plan is about making the code easier to trust, easier to change, and easier to optimize without breaking behavior.

The work is split into these phases:

0. Code beautify and naming normalization sweep.
1. Make the adapter contract real and useful.
2. Move shared drag/nudge session kernels out of composer.
3. Split the adapters file into smaller modules with clear ownership.
4. Clean up canonical vs legacy naming and routing boundaries.
5. Remove duplicated point-like orchestration and move pure math to core/shared code where appropriate.
6. Rework the registry representation so routing is easier for humans to understand and maintain.

## Reporting Rule For This Plan

This plan uses two progress files for two different jobs.

- `docs/refactor/progress-report-broad.md`
  - use this only for broad architecture milestones that are already completed or already tracked at high level
- `docs/refactor/progress-report.md`
  - use this for the fine-grained step-by-step work in this plan

Rule:

- every step in this plan must end with a new entry in `docs/refactor/progress-report.md`
- do not write new fine-grained cleanup/optimization notes into `progress-report-broad.md`

Required entry format for `docs/refactor/progress-report.md`:

- Step header (`Phase X - Step Y`)
- Problem
- Code analysis
- Comparison
- Manual test results
- Undo/redo verification

---

## Phase 0: Code Beautify And Naming Normalization Sweep

### Broad Problem

Before deeper cleanup work starts, the refactor code itself still has naming drift and presentation drift.

This is not about behavior yet.

It is about making the refactor implementation readable enough that later steps do not waste time on avoidable confusion.

This pre-phase is for actual code only.

It is not a docs sweep.

Primary target files:

- `src-js/views-editor/src/edit-behavior.js`
- `src-js/views-editor/src/edit-behavior-support.js`
- `src-js/views-editor/src/edit-behavior-composer.js`
- `src-js/views-editor/src/edit-behavior-registry.js`
- `src-js/views-editor/src/pointer-objects.js`
- `src-js/views-editor/src/edit-tools-pointer.js`

Secondary target files only if needed for consistency:

- nearby refactor-touched editor files
- core/shared helper files touched by the refactor

Hard requirement for this phase:

- `src-js/views-editor/src/pointer-objects.js` must be renamed to a proper adapter name
- default target name: `src-js/views-editor/src/edit-behavior-adapters.js`
- if a different name is chosen, it must still explicitly say `adapter` or `adapters`

### Step P0.1: Define the naming rules for the refactor code before renaming anything

#### Problem Aspect

The code currently mixes multiple naming styles:

- `canonical` vs `legacy`
- `point-like` vs object-kind-specific wording
- old transitional names that still reflect the migration path, not the final intent
- helper names that say how the code used to be wired instead of what it does now

If we rename code without first defining the naming rules, the sweep will be inconsistent.

#### Proposed Solution (Plain Language)

Write down one naming scheme for the refactor implementation code.

The rules should answer:

- what `canonical` means
- what `legacy` means
- when to say `point-like`
- when to say `regular`, `skeleton`, `rib`, `editableGenerated`
- which words are transitional and should be removed

This step should only define the rules and identify bad names.

It should not perform the broad rename yet.

#### Code Evidence

Files to inspect for naming drift:

- `src-js/views-editor/src/pointer-objects.js`
- `src-js/views-editor/src/edit-behavior-support.js`
- `src-js/views-editor/src/edit-behavior-composer.js`
- `src-js/views-editor/src/edit-tools-pointer.js`

Example problem shapes:

```js
legacyDragAdapters
runMixedSelectionDragCanonical
runRegularPointLikeCanonical
```

The step must decide:

- which of these names are still accurate
- which names are only leftovers from the migration
- confirm that the adapters file will be renamed away from `pointer-objects.js`

#### Files To Touch

- `docs/refactor/plan-post-refactor-cleanup-optimization.md`
- `docs/refactor/progress-report.md`

#### Manual Tests

This is a naming-rules step. Do a quick sanity pass only:

1. Drag a regular point.
2. Drag a skeleton point.
3. Nudge an editable generated point.
4. Undo and redo one of the above.

Expected result:

- no behavior change

---

### Step P0.2: Run a code-only beautify sweep on the refactor implementation files without changing behavior

#### Problem Aspect

Even when names are accurate, the current code still has readability noise:

- uneven helper ordering
- stale transitional comments
- inconsistent local naming
- inconsistent formatting in recently moved code

That noise makes the later cleanup phases harder than they need to be.

#### Proposed Solution (Plain Language)

Do a small code-only cleanup pass on the refactor implementation files:

- normalize helper ordering where it obviously improves readability
- remove stale migration-only comments
- normalize obvious local naming inconsistencies
- keep the public behavior exactly the same

Do not mix this with architecture moves.

Do not move ownership between files in this step.

This is a preparation step only.

#### Code Evidence

Target files:

- `src-js/views-editor/src/edit-behavior.js`
- `src-js/views-editor/src/edit-behavior-support.js`
- `src-js/views-editor/src/edit-behavior-composer.js`
- `src-js/views-editor/src/edit-behavior-registry.js`
- `src-js/views-editor/src/pointer-objects.js`
- `src-js/views-editor/src/edit-tools-pointer.js`

Examples of allowed cleanup:

```js
// rename a local variable for clarity
const adapterResult = ...

// remove comment text that still talks like the migration is unfinished
```

Examples of not allowed cleanup in this step:

```js
// moving shared kernels between files
// changing routing ownership
// rewriting adapter contracts
```

#### Files To Touch

- refactor implementation files listed above
- `docs/refactor/progress-report.md`

#### Manual Tests

Run a representative parity sweep after the beautify pass:

1. Drag regular point.
2. Drag anchor.
3. Drag skeleton on-curve point.
4. Drag skeleton off-curve point.
5. Drag rib point.
6. Drag editable generated point.
7. Drag editable generated handle.
8. Nudge regular point.
9. Nudge skeleton point.
10. Nudge editable generated handle.
11. Undo and redo one drag and one nudge.

Expected result:

- no behavior change
- code is easier to read before Phase 1 starts

---

### Step P0.3: Merge `edit-behavior-support.js` into `edit-behavior.js` before deeper cleanup starts

#### Problem Aspect

`src-js/views-editor/src/edit-behavior-support.js` is a live helper file, but it is not a real boundary.

Right now it looks like an internal spillover module for `edit-behavior.js`, not a real subsystem.

That is a risk for the rest of the plan:

- later cleanup work may preserve an unnecessary file split
- later readers may think there is a separate “support” subsystem when there is not
- Phase 0 can accidentally beautify around the wrong boundary instead of fixing it first

This step fixes that false boundary before deeper optimization work starts.

#### Proposed Solution (Plain Language)

- merge it back into `edit-behavior.js`
- remove `edit-behavior-support.js` after the merge
- keep the matcher constants and helper functions close to the rule engine that uses them

This is a decisive cleanup step, not an open-ended review.

Why this is the chosen direction:

- `edit-behavior.js` is the only real consumer today
- the file contents are internal rule-engine support, not a reusable subsystem
- the `support` name is vague and actively misleading
- keeping the split does not buy us a useful architectural boundary

#### Code Evidence

Current codebase evidence:

- `src-js/views-editor/src/edit-behavior.js` imports:

```js
import {
  ANY,
  OFF,
  SEL,
  SMO,
  buildPointMatchTree,
  findPointMatch,
} from "./edit-behavior-support.js";
```

- `src-js/views-editor/src/edit-behavior-support.js` currently owns:

```js
export const ANY = ...
export function buildPointMatchTree(rules) { ... }
export function findPointMatch(...) { ... }
```

That is not shared infrastructure.

That is `edit-behavior.js` implementation detail living in the wrong file.

#### Files To Touch

- `src-js/views-editor/src/edit-behavior.js`
- `src-js/views-editor/src/edit-behavior-support.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

This step needs a focused behavior-engine parity pass:

1. Drag a regular point.
2. Drag a smooth on-curve point with handles.
3. Drag an off-curve point.
4. Use a constrain-style drag path if available.
5. Undo and redo one of the above.

Expected result:

- no behavior drift
- `edit-behavior.js` locality improves
- `edit-behavior-support.js` disappears because its contents now live in `edit-behavior.js`

---

## Phase 1: Make the Adapter Handling Contract Honest and Minimal

### Broad Problem

Right now the code says adapters return `{ forward, rollback }`, but in practice that return value does not carry real meaning yet.

The current situation is confusing:

- the composer checks that the adapter returned an object with `forward` and `rollback`
- many adapters return placeholder `{ forward: null, rollback: null }`
- the composer does not actually use those values for anything important
- the real undo/redo data already lives inside adapter-owned edit sessions, not in the adapter return value

This is dangerous for cleanup and optimization work because the code looks stricter than it really is.

We need to fix this first.

The goal of this phase is simple:

- remove the fake payload contract
- make composer rely only on handled/unhandled
- make every adapter return `true` or `false` on purpose

### Step 1.1: Write down the exact mismatch between the promised contract and the real contract

#### Problem Aspect

Before changing code, we need one simple source of truth that explains what is wrong today.

If we skip this, later steps will drift because one person will think the problem is â€œnull valuesâ€, another person will think the problem is â€œshape checksâ€, and another person will think the problem is â€œcomposer not using resultsâ€.

This step fixes that confusion first.

#### Proposed Solution (Plain Language)

Add a short contract note to this plan and mirror it in code comments:

- what adapters currently return
- what composer currently checks
- what the final truthful contract should be

Do not change behavior in this step.

Just make the mismatch explicit.

#### Code Evidence

Current evidence:

- `src-js/views-editor/src/edit-behavior-adapters.js`
- `src-js/views-editor/src/edit-behavior-composer.js`

Current code shape:

```js
export const ADAPTER_CONTRACT = Object.freeze({
  handledResultShape: "{ forward, rollback }",
  unhandledResult: "false",
  persistenceOwner: "adapter",
});

function makeAdapterResult(forward = null, rollback = null) {
  return { forward, rollback };
}
```

```js
const adapterResult = await adapter(...);
if (adapterResult === false) {
  return false;
}
assert(
  adapterResult && "forward" in adapterResult && "rollback" in adapterResult,
  "adapter must return { forward, rollback } or false"
);
return true;
```

What this step should add in comments / plan text:

```js
// Truthful current state:
// - handled adapters return a shape-checked object
// - many handled adapters still return placeholder null payloads
// - composer currently uses the result as a handled/unhandled signal only
// - the returned payload is not a real data channel today
```

#### Files To Touch

- `docs/refactor/plan-post-refactor-cleanup-optimization.md`
- `src-js/views-editor/src/edit-behavior-adapters.js`
- `src-js/views-editor/src/edit-behavior-composer.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

This is a documentation/comment-only step, but it still needs a quick manual sanity pass:

1. Drag a regular point.
2. Drag a skeleton on-curve point.
3. Drag a rib point.
4. Nudge an editable generated handle.
5. Undo and redo one of the actions above.

Expected result:

- behavior is unchanged
- no runtime errors

---

### Step 1.2: Remove the fake payload contract and reduce adapter returns to boolean handled/unhandled

#### Problem Aspect

The code currently allows this:

```js
return { forward: null, rollback: null };
```

That is the core lie in the current contract.

It says â€œthis adapter has meaningful change payloadsâ€, but the payloads are empty.

The deeper problem is bigger than empty payloads:

- composer does not consume the payload
- adapters already keep their real undo/redo data internally
- the returned object is just ceremony

This step removes that ceremony.

#### Proposed Solution (Plain Language)

Delete the fake payload contract.

The adapter return value should answer only one real question:

- did this adapter handle the route?

Target contract:

```js
return true;
return false;
```

Do not replace the current fake object with a new wrapper object.

Do not introduce `handled`, `changeSet`, or similar helper shapes unless a real consumer appears later.

Keep the contract minimal.

#### Proposed Solution (Code Sketch)

In `src-js/views-editor/src/edit-behavior-adapters.js`:

```js
// remove makeAdapterResult(...)
```

Replace this:

```js
return makeAdapterResult();
```

With one of these:

```js
return true;
return false;
```

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
- `src-js/views-editor/src/edit-behavior-composer.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

Run these by hand after the step:

1. Drag a regular point with no modifiers.
2. Drag a regular point with Shift.
3. Drag a skeleton off-curve point with Alt.
4. Drag a rib point in default mode.
5. Nudge a regular point.
6. Nudge a skeleton point.
7. Nudge an editable generated point.
8. Undo and redo at least one drag and one nudge.

Expected result:

- everything still behaves the same
- no adapter route crashes because of the simpler return contract

---

### Step 1.3: Simplify composer so it accepts only boolean adapter results

#### Problem Aspect

Even after Step 1.2, the cleanup is incomplete if composer still treats adapter results as a shape-checking formality.

Right now composer mostly does this:

- call adapter
- check result shape
- return `true`

That hides what composer really depends on.

This step fixes that exact ambiguity.

#### Proposed Solution (Plain Language)

Change composer so it accepts only boolean adapter returns.

Composer should stop checking for fake payload fields.

Composer should do this instead:

```js
const handled = await adapter(...);
if (!handled) return false;
return true;
```

If the project ever grows a real payload consumer later, that can be introduced later for a real reason.

The main contract must be:

- handled or not handled

#### Proposed Solution (Code Sketch)

In `src-js/views-editor/src/edit-behavior-composer.js`:

```js
const handled = await adapter(context);
assert(typeof handled === "boolean");
if (!handled) {
  return false;
}

return true;
```

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-composer.js`
- `src-js/views-editor/src/edit-behavior-adapters.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

Test at least one route from each category:

1. Regular drag.
2. Regular nudge.
3. Skeleton drag.
4. Skeleton equalize drag.
5. Rib drag.
6. Editable generated point drag.
7. Editable generated handle nudge.
8. Mixed selection drag.

Expected result:

- all routes still resolve correctly
- routes that should be unhandled still fall through correctly
- no fake shape checks remain in composer

---

### Step 1.4: Remove the last placeholder adapter returns and make every adapter choose true or false on purpose

#### Problem Aspect

After Step 1.3, the remaining risk is lazy adapter code that still returns a handled result without making an explicit decision.

We need every adapter entrypoint to make one honest choice:

- yes, I handled this route
- no, I did not handle this route

This step removes the last â€œdefault successâ€ behavior.

#### Proposed Solution (Plain Language)

Do a full pass over:

- `canonicalDragAdapters`
- `canonicalNudgeAdapters`
- `legacyDragAdapters`
- `legacyNudgeAdapters`

For every adapter function:

- replace passive default returns with explicit boolean returns
- make early exits truthful
- remove any helper that encourages fake success by default

#### Code Evidence

Adapter map locations:

- `src-js/views-editor/src/edit-behavior-adapters.js`

Example current pattern to remove:

```js
if (!selection?.size) {
  return makeAdapterResult();
}
```

Example target pattern:

```js
if (!selection?.size) {
  return false;
}
```

Or, if the adapter truly consumed the route intentionally:

```js
return true;
```

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

This step needs a wider parity pass because it changes many early-return paths:

1. Drag regular points.
2. Drag anchors.
3. Drag guidelines.
4. Drag skeleton on-curve points.
5. Drag skeleton off-curve points.
6. Drag rib points.
7. Drag editable generated points.
8. Drag editable generated handles.
9. Nudge regular points.
10. Nudge skeleton points.
11. Nudge rib points.
12. Nudge editable generated points.
13. Nudge editable generated handles.
14. Try a route that should not be handled and confirm no crash or weird state.
15. Undo and redo one drag and one nudge in the list above.

Expected result:

- every route still behaves the same
- handled routes are handled
- unsupported routes fail cleanly

---

### Step 1.5: Add a simple verification checklist for the new boolean-only contract

#### Problem Aspect

Once the contract becomes truthful, we need a cheap way to stop it from silently drifting again.

Without that, later optimization work can slowly reintroduce fake handled results.

#### Proposed Solution (Plain Language)

Add a lightweight verification checklist to the plan and progress report.

The checklist must be easy to run by hand:

- grep for old helper names
- grep for placeholder contract returns
- verify composer checks boolean handled/unhandled only

#### Code Evidence

Useful verification commands after this phase:

```bash
rg -n "makeAdapterResult\\(" src-js/views-editor/src
rg -n "forward:\\s*null|rollback:\\s*null" src-js/views-editor/src
rg -n "\"forward\" in adapterResult|\"rollback\" in adapterResult|\\{ forward, rollback \\} or false" src-js/views-editor/src
rg -n "return true;|return false;" src-js/views-editor/src/edit-behavior-adapters.js src-js/views-editor/src/edit-behavior-composer.js
```

#### Files To Touch

- `docs/refactor/plan-post-refactor-cleanup-optimization.md`
- `docs/refactor/progress-report.md`

#### Manual Tests

Final manual check for Phase 1:

1. Drag regular point.
2. Drag skeleton point.
3. Drag rib point.
4. Drag editable generated point.
5. Nudge editable generated handle.
6. Undo/redo one of the above.

Expected result:

- no behavior change
- no route crashes
- contract is easier to inspect in code

---

## Phase 1.5: Fix Mixed Point-Like Selection Routing Before Further Cleanup

### Broad Problem

The boolean-only adapter cleanup removed fake ceremony, but it also forced a closer look at what the routing actually does.

That exposed a separate correctness problem:

- mixed selection is only truly implemented for `regular + skeleton`
- editable-generated selections still get special-cased too early
- some mixed routes do not know how to move all selected families together

This is not a naming problem and not a registry redesign problem.

It is a correctness problem in the current drag/nudge pipeline.

The goal of this phase is simple:

- define mixed point-like selection in one clear way
- stop pure editable-generated routes from stealing mixed selections
- make mixed drag/nudge move all selected in-scope point-like families together
- verify undo/redo and fallthrough behavior for the full mixed-selection matrix

Chosen behavior for this phase:

- `native mix`
  - each selected family keeps its own real behavior semantics inside one mixed action
  - do not flatten everything into regular-point behavior
  - do not block mixed editing just because editable-generated content is present

### Step 1.5.1: Inventory the current mixed-selection routing and write down the exact gaps

#### Problem Aspect

Right now the bug is easy to describe from the UI, but the code path is split across pointer classification and adapter execution.

If we skip the inventory, we risk patching only one visible combination while leaving the deeper routing gap in place.

This step makes the current failure pattern explicit first.

#### Proposed Solution (Plain Language)

Document the current mixed-selection path for both drag and nudge.

Write down:

1. where pointer decides a selection is `mixedSelection`
2. where pointer still short-circuits into pure editable-generated routes
3. which mixed adapters currently know only about regular and skeleton content

Do not change behavior in this step.

The purpose is to leave one clear record of the real gap before the code moves.

#### Code Evidence

Current pointer routing evidence:

- `src-js/views-editor/src/edit-tools-pointer.js`

Current mixed adapter evidence:

- `src-js/views-editor/src/edit-behavior-adapters.js`

Current failure shape to document:

```js
if (hasEditableGeneratedHandles) {
  return "editableGeneratedHandle";
}

if (hasEditableGeneratedPoints) {
  return "editableGeneratedPoint";
}

if (hasRegularSelection && hasSkeletonSelection) {
  return "mixedSelection";
}
```

Current mixed adapter scope to document:

```js
async function runMixedSelectionDragCanonical(context) {
  // regular + skeleton logic exists here today
  // editable-generated content is not handled natively here yet
}
```

#### Files To Touch

- `docs/refactor/plan-post-refactor-cleanup-optimization.md`
- `docs/refactor/progress-report.md`

#### Manual Tests

This is a documentation-only step, but confirm the current gap is reproducible:

1. Drag editable-generated off-curve plus regular point.
2. Drag editable-generated off-curve plus skeleton on-curve.
3. Drag editable-generated off-curve plus regular off-curve.
4. Nudge one mixed selection that includes editable-generated content.

Expected result:

- the current failure pattern is confirmed and written down exactly
- no code changes yet

---

### Step 1.5.2: Create one explicit mixed point-like classifier in pointer for drag and nudge

#### Problem Aspect

Pointer currently decides mixed selection through hand-written special cases.

That is why editable-generated routes can steal mixed selections before `mixedSelection` is even considered.

This step fixes the classification layer first.

#### Proposed Solution (Plain Language)

Create one shared selection-classification step in `src-js/views-editor/src/edit-tools-pointer.js`.

That classifier should answer, in one place:

- does the selection contain regular path points, anchors, or guidelines
- does it contain skeleton points or skeleton handles
- does it contain rib points
- does it contain editable-generated points
- does it contain editable-generated handles

Then derive the route with one clear rule:

- one family only -> use the existing pure route
- two or more in-scope point-like families -> use `mixedSelection`

Use the same classifier for both drag and nudge.

Do not keep separate hand-written rules for the two actions.

#### Code Evidence

Target direction:

```js
const selectionKinds = classifyPointLikeSelection(...);

if (selectionKinds.isMixedPointLike) {
  return "mixedSelection";
}

if (selectionKinds.hasEditableGeneratedHandles) {
  return "editableGeneratedHandle";
}
```

File to change:

- `src-js/views-editor/src/edit-tools-pointer.js`

#### Files To Touch

- `src-js/views-editor/src/edit-tools-pointer.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

Run both drag and nudge checks:

1. Pure regular selection.
2. Pure skeleton selection.
3. Pure editable-generated point selection.
4. Pure editable-generated handle selection.
5. Regular + skeleton mixed selection.
6. Editable-generated + regular mixed selection.
7. Editable-generated + skeleton mixed selection.
8. Editable-generated point + editable-generated handle mixed selection.

Expected result:

- pure selections still route to pure handlers
- any real mixed point-like selection routes to `mixedSelection`
- editable-generated routes no longer steal mixed selections

---

### Step 1.5.3: Expand mixed drag handling so editable-generated content participates natively

#### Problem Aspect

Even if pointer classifies the selection correctly, mixed drag is still incomplete unless the adapter can move every selected family together.

Right now the mixed drag adapter is centered on regular and skeleton behavior only.

This step fixes the drag execution side.

#### Proposed Solution (Plain Language)

Extend the mixed drag adapter so it can include:

- regular path points, anchors, and guidelines
- skeleton points and skeleton handles
- editable-generated points
- editable-generated handles

Use each family's native behavior logic inside the mixed route.

Important rule:

- one user drag action should still produce one combined edit session and one combined undo step

Do not fake mixed support by moving only one family and ignoring the others.

If helper extraction is needed, keep it inside the adapters layer and make it obviously shared by pure and mixed editable-generated routes.

#### Code Evidence

Current target area:

- `src-js/views-editor/src/edit-behavior-adapters.js`

Current mixed drag entry point:

```js
async function runMixedSelectionDragCanonical(context) {
  // extend this so editable-generated points/handles can join the same drag
}
```

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

Run drag checks:

1. Editable-generated point + regular point.
2. Editable-generated handle + regular off-curve.
3. Editable-generated point + skeleton on-curve.
4. Editable-generated handle + skeleton on-curve.
5. Editable-generated point + regular point + skeleton point.
6. Existing regular + skeleton mixed drag.

Expected result:

- all selected families move together
- regular behavior stays regular
- skeleton behavior stays skeleton
- editable-generated behavior stays editable-generated
- one drag creates one undoable change

---

### Step 1.5.4: Expand mixed nudge handling with the same native-mix rule

#### Problem Aspect

Drag and nudge must not disagree about what mixed selection means.

If we fix only drag, the system stays conceptually broken and the next cleanup phase will build on inconsistent behavior.

This step fixes the nudge side to match the drag side.

#### Proposed Solution (Plain Language)

Extend mixed nudge handling so it follows the same rule as mixed drag:

- each selected family keeps its own native nudge semantics
- one arrow-key action applies all participating families together
- if no selected family can actually move, return `false` cleanly

Do not redesign the registry in this step.

Keep using the existing `mixedSelection` route kind.

#### Code Evidence

Current target area:

- `src-js/views-editor/src/edit-behavior-adapters.js`

Current mixed nudge entry point:

```js
async function runMixedSelectionNudgeLegacy(context) {
  // extend this so editable-generated points/handles can join the same nudge
}
```

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

Run nudge checks:

1. Editable-generated point + regular point.
2. Editable-generated handle + regular off-curve.
3. Editable-generated point + skeleton on-curve.
4. Editable-generated handle + skeleton on-curve.
5. Editable-generated point + editable-generated handle.
6. Existing regular + skeleton mixed nudge.

Expected result:

- all selected families nudge together
- unsupported selections fail cleanly
- no partial movement of only one family

---

### Step 1.5.5: Run the full mixed-selection matrix and record Phase 1.5 before moving to Phase 2

#### Problem Aspect

This phase is a correctness gate.

If we move on without a full mixed-selection matrix, later cleanup work will rest on behavior we do not actually trust.

This step closes the phase properly.

#### Proposed Solution (Plain Language)

Run the mixed-selection matrix by hand and record it in the fine-grained progress report.

The checklist must cover:

- pure selections still working
- mixed selections with editable-generated content
- drag and nudge parity
- undo/redo parity
- clean fallthrough when no family can actually move

Only after that should Phase 2 begin.

#### Code Evidence

Useful verification commands after this phase:

```bash
rg -n "mixedSelection" src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/edit-behavior-adapters.js
rg -n "editableGeneratedPoint|editableGeneratedHandle" src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/edit-behavior-adapters.js
```

#### Files To Touch

- `docs/refactor/progress-report.md`

#### Manual Tests

Run this full matrix:

1. Pure regular drag.
2. Pure regular nudge.
3. Pure skeleton drag.
4. Pure skeleton nudge.
5. Pure editable-generated point drag.
6. Pure editable-generated handle nudge.
7. Regular + skeleton drag.
8. Regular + skeleton nudge.
9. Editable-generated point + regular point drag.
10. Editable-generated point + regular point nudge.
11. Editable-generated handle + regular off-curve drag.
12. Editable-generated handle + regular off-curve nudge.
13. Editable-generated point + skeleton on-curve drag.
14. Editable-generated point + skeleton on-curve nudge.
15. Editable-generated handle + skeleton on-curve drag.
16. Editable-generated handle + skeleton on-curve nudge.
17. Editable-generated point + editable-generated handle drag.
18. Editable-generated point + editable-generated handle nudge.
19. Editable-generated point + regular point + skeleton point drag.
20. Undo and redo one drag and one nudge from the mixed cases above.

Expected result:

- mixed selections behave consistently across drag and nudge
- all selected families participate together
- one action creates one undo step
- undo and redo restore the whole mixed action

---

## Phase 2: Move Kernel Ownership To Adapters And Simplify It

### Broad Problem

The shared point-like kernels currently live in composer, but adapters depend on them.

That is backwards.

But the problem is not only ownership.

The current kernel API is also too generalized:

- one helper tries to cover both drag-stream input and one-shot nudge input
- the session helper forwards a large callback surface
- composer injects both kernels into adapter context as if they were runtime data
- some routes use both kernels, some use only the input kernel, and some do not fit the kernel at all

So Phase 2 must do more than relocate code.

The goal of this phase is simple:

- move kernel ownership into the adapters layer
- keep the two-helper model
- simplify both helpers while moving them
- remove composer-to-adapter kernel injection entirely
- make valid input-only consumers explicit instead of pretending every route uses the same execution model

Important constraint for this phase:

- do not create a new kernel file
- keep the helpers in `src-js/views-editor/src/edit-behavior-adapters.js` for now
- if Phase 3 later splits the adapters file, the helpers can move with that split

### Step 2.1: Write down the real current kernel shape and the real consumer categories

#### Problem Aspect

Before moving anything, we need to describe the kernel honestly.

Right now the code reads as if there is one clean shared execution model, but that is not what the adapters actually do.

If we skip this reframing, the implementation will preserve fake symmetry.

#### Proposed Solution (Plain Language)

Document the real situation in the plan and progress report:

1. `runPointLikeInputKernel(...)` is input normalization
2. `runPointLikeSessionKernel(...)` is edit-session lifecycle wrapping
3. some routes are full `session + input` consumers
4. some routes are valid `input-only` consumers
5. some routes should stay outside the kernel for now

Explicitly name `input-only` use as allowed, not as refactor failure.

That gives the implementation a truthful target.

#### Code Evidence

Current kernel definitions:

- `src-js/views-editor/src/edit-behavior-composer.js`

Current full-pair consumers:

- regular point-like orchestration
- skeleton point orchestration
- skeleton handle orchestration
- editable-generated point orchestration
- editable-generated handle orchestration

Current input-only consumers:

- regular equalize nudge
- skeleton rib nudge

#### Files To Touch

- `docs/refactor/plan-post-refactor-cleanup-optimization.md`
- `docs/refactor/progress-report.md`

#### Manual Tests

This is a documentation-only step, but still do a quick sanity pass:

1. Drag a regular point.
2. Drag a skeleton point.
3. Nudge a regular point.
4. Nudge a rib point.
5. Undo and redo one of the above.

Expected result:

- behavior is unchanged
- no new runtime errors

---

### Step 2.2: Move the two kernel helpers into the adapters layer without creating a new file

#### Problem Aspect

The first concrete problem is still ownership.

As long as the helpers are defined in composer, the code says they belong to orchestration even though the real consumers are adapter-side.

That keeps the dependency direction wrong.

#### Proposed Solution (Plain Language)

Move these helpers out of composer and into `src-js/views-editor/src/edit-behavior-adapters.js`:

- `runPointLikeInputKernel(...)`
- `runPointLikeSessionKernel(...)`

Keep the exported names the same in this step.

Do not redesign composer routing here.
Do not add a new kernel module.

This step is about changing ownership first.

#### Proposed Solution (Code Sketch)

After the move, composer should import the helpers from the adapters layer instead of defining them:

```js
import {
  runPointLikeInputKernel,
  runPointLikeSessionKernel,
} from "./edit-behavior-adapters.js";
```

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
- `src-js/views-editor/src/edit-behavior-composer.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

Test one drag and one nudge path that definitely use the kernels:

1. Drag a regular point.
2. Drag a skeleton on-curve point.
3. Drag an editable generated point.
4. Nudge a regular point.
5. Nudge a skeleton point.
6. Nudge an editable generated handle.
7. Undo and redo one drag and one nudge.

Expected result:

- behavior is unchanged
- the move is invisible to the user

---

### Step 2.3: Simplify the input kernel while moving it, but keep the two-helper model

#### Problem Aspect

The input kernel has a real job, but its readable surface is still too broad.

One function currently covers:

- drag stream processing
- drag behavior-name changes
- drag point mapping
- one-shot nudge delta calculation

That is more mode branching than the main helper should expose.

#### Proposed Solution (Plain Language)

Keep `runPointLikeInputKernel(...)` as the public adapter-owned helper, but simplify its internals during the move.

Target shape:

- drag logic lives in one private local path
- nudge logic lives in one private local path
- the exported helper is only a thin dispatcher

Do not rename every caller in this phase.
Do not collapse everything into one giant new helper.

This keeps the two-helper model while making the input helper easier to read.

#### Proposed Solution (Code Sketch)

Expected direction:

```js
function runPointLikeDragInput(...) { ... }
function runPointLikeNudgeInput(...) { ... }

export async function runPointLikeInputKernel(options) {
  return options.mode === "drag"
    ? runPointLikeDragInput(options)
    : runPointLikeNudgeInput(options);
}
```

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

Focus on behavior that proves the input helper still works:

1. Drag a regular point and change modifiers during drag.
2. Drag a skeleton point and change modifiers during drag.
3. Nudge a regular point with normal arrow keys.
4. Nudge a regular point with `Shift`.
5. Nudge a regular point with `Shift + Ctrl` or `Shift + Cmd`.
6. Nudge a rib point.
7. Undo and redo one drag and one nudge.

Expected result:

- drag behavior switching still works
- nudge delta scaling still works
- no user-visible behavior drift

---

### Step 2.4: Simplify the session kernel and remove composer-to-adapter kernel injection

#### Problem Aspect

The session kernel is useful, but right now it is carrying extra ceremony:

- composer passes both kernels through adapter context
- adapters assert they exist
- the session kernel accepts an injected input-kernel override even though the normal path is always the same local helper

That is complexity without real domain value.

#### Proposed Solution (Plain Language)

Do two things together:

1. remove kernel injection from composer
2. simplify `runPointLikeSessionKernel(...)` while it becomes adapter-owned

Concrete target:

- composer should call adapters with routing context only
- adapters should call the local kernel helpers directly
- `runPointLikeSessionKernel(...)` should stop accepting `runPointLikeInputKernel: inputKernel = ...`
- the session kernel should keep only the extension points that are actually useful:
  - `withEditSession`
  - `onSessionStart`
  - `onBehaviorChanged`
  - `onInput`
  - `onSessionEnd`

This keeps the helper thin instead of preserving it as a callback trampoline.

#### Proposed Solution (Code Sketch)

Current pattern to remove from composer:

```js
const handled = await adapter({
  ..._context,
  runPointLikeInputKernel,
  runPointLikeSessionKernel,
});
```

Target pattern:

```js
const handled = await adapter(_context);
```

Current session-kernel pattern to simplify:

```js
runPointLikeSessionKernel({
  runPointLikeInputKernel: inputKernel = runPointLikeInputKernel,
  ...
});
```

Target direction:

```js
runPointLikeSessionKernel({
  ...
});
```

with the session helper calling the local input helper directly.

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-composer.js`
- `src-js/views-editor/src/edit-behavior-adapters.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

Test routes from multiple consumer categories:

1. Drag regular point.
2. Drag skeleton off-curve point.
3. Drag editable generated handle.
4. Nudge regular point.
5. Nudge skeleton point.
6. Nudge rib point.
7. Nudge editable generated point.
8. Mixed selection drag.
9. Mixed selection nudge.
10. Undo and redo one drag and one nudge.

Expected result:

- no route fails because kernels are no longer passed in context
- full-session consumers still work
- input-only consumers still work

---

### Step 2.5: Finalize the kernel boundary and make the remaining exceptions explicit

#### Problem Aspect

After the move, the code can still lie in two ways:

1. it can still look like composer owns the helpers
2. it can still imply that every adapter route should use the kernels in the same way

We need the final boundary to be obvious.

#### Proposed Solution (Plain Language)

Do one cleanup pass after the implementation:

- make sure the kernel section in the adapters file imports only what generic kernel logic actually needs
- make sure composer no longer exports or injects the helpers
- make sure full-session consumers call the local helpers directly
- make sure input-only consumers are left readable and explicit
- add a short note that these helpers are adapter-owned shared point-like infrastructure, not composer logic

Also add a small verification checklist to the fine-grained progress entry:

- composer no longer defines the kernels
- composer no longer injects them into adapter context
- adapters no longer assert kernel presence from `context`
- input-only consumers remain explicit

#### Code Evidence

Verification commands for the end of Phase 2:

```bash
rg -n "export async function runPointLikeInputKernel|export async function runPointLikeSessionKernel" src-js/views-editor/src
rg -n "runPointLikeInputKernel,|runPointLikeSessionKernel," src-js/views-editor/src/edit-behavior-composer.js
rg -n "const \\{[^}]*runPointLikeInputKernel|const \\{[^}]*runPointLikeSessionKernel" src-js/views-editor/src/edit-behavior-adapters.js
rg -n "runRegularEqualizeNudgeCanonical|runSkeletonRibPointNudgeCanonical" src-js/views-editor/src/edit-behavior-adapters.js
```

Expected direction after cleanup:

- the kernel definitions live in the adapters layer only
- composer is routing-only again
- the code no longer pretends the kernels are the universal execution model for all routes

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-composer.js`
- `src-js/views-editor/src/edit-behavior-adapters.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

Final Phase 2 manual check:

1. Drag regular point.
2. Drag skeleton point.
3. Drag editable generated point.
4. Drag editable generated handle.
5. Nudge regular point.
6. Nudge skeleton point.
7. Nudge rib point.
8. Nudge editable generated handle.
9. Mixed selection drag.
10. Mixed selection nudge.
11. Undo and redo one drag and one nudge.

Expected result:

- no behavior drift
- dependency direction is cleaner in code
- composer is simpler and more obviously orchestration-only
- the remaining kernel exceptions are explicit instead of accidental

---

## Phase 3: Reorganize The Adapters File In Place Without Creating New Files

### Broad Problem

`src-js/views-editor/src/edit-behavior-adapters.js` is still too large and mixes too many jobs.

That makes cleanup risky and optimization harder than it needs to be.

It is hard to answer simple questions like these:

- where do shared adapter helpers stop and regular-point logic begin
- where does skeleton-owned code begin and end
- where does editable-generated code begin and end
- where do mixed-selection and legacy routes live
- which helpers are truly shared and which ones only look shared because the file grew without structure

That confusion is not just cosmetic.

It means one edit can accidentally touch unrelated object families because the file does not present clear internal ownership.

This phase fixes that without adding files.

Hard constraint for this phase:

- do not create new adapter files
- use the existing structure only
- improve ownership by reordering, regrouping, renaming, and tightening helper boundaries inside `src-js/views-editor/src/edit-behavior-adapters.js`
- allow small pure-code cleanup only when it removes obvious local repetition or fixes obviously wrong helper placement inside the same file
- do not use Phase 3 to perform broader orchestration deduplication or math extraction that belongs in Phase 5

Expected direction:

- Phase 0 already renamed `src-js/views-editor/src/pointer-objects.js` to `src-js/views-editor/src/edit-behavior-adapters.js`
- this phase keeps working inside that renamed file
- the goal is a clearer in-file layout, not a file split

### Step 3.1: Map the current adapters file into real ownership blocks before moving code

#### Problem Aspect

Right now the file still reads like one long stream of helpers and adapter entrypoints.

Before reorganizing it, we need one clear map of what is actually inside it today.

If we skip this, the cleanup will still be based on guesswork.

That leads to fake structure, such as:

- a “shared” section that still hides family-specific logic
- a “misc” section that proves nothing was actually understood
- a reordering pass that only moves code around without improving ownership

This step fixes that by identifying the real ownership blocks first.

#### Proposed Solution (Plain Language)

Read through `src-js/views-editor/src/edit-behavior-adapters.js` and label each function as one of these kinds:

- shared adapter infrastructure
- regular point-like adapter logic
- skeleton-specific adapter logic
- editable-generated adapter logic
- mixed-selection / legacy adapter logic
- adapter maps and public exports

Do not move code yet.

Do not invent new files.

The goal is only to produce a concrete ownership map so later in-file cleanup stays honest.

This step must also answer one practical question:

- which ownership blocks need clearer in-file separation
- which proposed file splits were only tidy-looking and should be rejected
- which small pure-code cleanups belong in Phase 3 because they improve locality without widening the abstraction surface

#### Code Evidence

Current evidence inside `src-js/views-editor/src/edit-behavior-adapters.js`:

- shared adapter infrastructure near the top
  - adapter/composer contract note
  - point-like kernels: `runPointLikeDragInput(...)`, `runPointLikeNudgeInput(...)`, `runPointLikeInputKernel(...)`, `runPointLikeSessionKernel(...)`
  - generic helpers like `getBehaviorName(...)`, `filterSelectionByPrefixes(...)`, `filterSelection(...)`
- editable-generated support helpers currently live high in the file even though they are family-specific
  - `readEditableHandleEqualizeState(...)`
  - `applyEditableHandleEqualizedLength(...)`
  - `collectEditableGeneratedPointsFromPointSelection(...)`
  - `collectEditableGeneratedHandlesFromPointSelection(...)`
- skeleton and mixed skeleton-backed helpers are interleaved in the middle
  - `createSkeletonBackedMixedEditState(...)`
  - `updateSkeletonBackedMixedBehaviors(...)`
  - `applySkeletonBackedMixedDelta(...)`
  - `createSkeletonPointExecutors(...)`
  - `applyFixedRibDragToSkeletonData(...)`
  - `createSkeletonLayersData(...)`
  - `makeSkeletonLayerPersistenceChanges(...)`
- regular point-like routes begin later
  - `runRegularPointLikeOrchestration(...)`
  - `runRegularPointLikeAdapter(...)`
  - `runRegularEqualizeNudgeCanonical(...)`
  - `runRegularPointLikeCanonical(...)`
- skeleton-specific routes follow
  - `runSkeletonPointLikeOrchestration(...)`
  - `runSkeletonPointLikeCanonical(...)`
  - `runFixedRibSkeletonPointLikeCanonical(...)`
  - `runSkeletonHandlePointLikeCanonical(...)`
  - `runSkeletonRibPointDragCanonical(...)`
  - `runSkeletonRibPointNudgeCanonical(...)`
- editable-generated routes are grouped later
  - `runEditableGeneratedPointLikeCanonical(...)`
  - `runEditableGeneratedHandleLikeCanonical(...)`
  - `runEditableGeneratedPointDragCanonical(...)`
  - `runEditableGeneratedHandleDragCanonical(...)`
  - `runEditableGeneratedNudgeCanonical(...)`
- mixed-selection / legacy routes live near the bottom
  - `runTunniDragLegacy(...)`
  - `runSkeletonTunniDragLegacy(...)`
  - `runMixedSelectionNudgeLegacy(...)`
  - `runMixedSelectionDragCanonical(...)`
- public adapter maps stay at the end:

```js
export const canonicalDragAdapters = { ... };
export const canonicalNudgeAdapters = { ... };
export const legacyDragAdapters = { ... };
export const legacyNudgeAdapters = { ... };
```

This step should turn that raw layout into one explicit ownership list and one explicit rejection:

- do not split this into new files

It should also record the code-level cleanup candidates that are in scope now:

- family-specific helpers that are currently parked in the wrong section
- tiny repeated boilerplate that can be replaced by one local helper inside the same file
- repeated cursor/session wrapper setup when the replacement stays local and obvious

It should explicitly reject the bigger Phase 5 work from this phase:

- broad orchestration deduplication across object families
- moving math into core/shared code
- redesigning route semantics while cleaning layout

#### Files To Touch

- `docs/refactor/plan-post-refactor-cleanup-optimization.md`
- `docs/refactor/progress-report.md`

#### Manual Tests

This is an inventory-only step, but still do a quick sanity pass:

1. Drag a regular point.
2. Drag a skeleton point.
3. Drag an editable generated handle.
4. Drag a mixed selection.
5. Nudge a regular point.
6. Undo and redo one of the above.

Expected result:

- no behavior change
- the ownership map is concrete enough to guide the in-file cleanup steps

---

### Step 3.2: Pull truly shared adapter infrastructure into one explicit in-file section

#### Problem Aspect

Some code in the adapters file is truly shared across families.

Some code only looks shared because it ended up near the top during the refactor.

If we do not separate those two cases, the file will keep lying about ownership.

It will also keep a few bad local code patterns alive, such as tiny repeated wrappers and helpers that are clearly parked in the wrong section.

#### Proposed Solution (Plain Language)

Create one explicit shared-infrastructure section near the top of `src-js/views-editor/src/edit-behavior-adapters.js`.

Only keep helpers there when all of these are true:

- the helper is used by more than one adapter family
- the helper is not really skeleton-only
- the helper is not really editable-generated-only
- the helper is not just a private detail of one route

Good candidates:

- point-like kernels from Phase 2
- behavior-name helpers
- generic selection filters
- tiny local wrappers that remove repeated `sceneController.editGlyph(...)` boilerplate if they stay obviously local
- tiny local wrappers that remove repeated cursor save/set/restore boilerplate if they stay obviously local

Bad candidates:

- fixed-rib logic
- editable-generated equalize helpers
- mixed-selection route logic
- broad “universal” helpers that only rename existing complexity

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

1. Drag a regular point.
2. Drag a skeleton point.
3. Drag an editable generated point.
4. Nudge a regular point.
5. Nudge a skeleton point.
6. Nudge an editable generated handle.
7. Undo and redo one drag and one nudge.

Expected result:

- behavior is unchanged
- the truly shared helpers now have one obvious in-file home
- tiny repeated boilerplate is reduced only where the improvement is obvious and local

---

### Step 3.3: Group skeleton-owned adapter code into one contiguous in-file block

#### Problem Aspect

Skeleton adapter code is one of the biggest and most distinct clusters in the file.

It has its own concepts:

- skeleton data layers
- on-curve vs off-curve skeleton editing
- fixed-rib behavior
- skeleton equalize behavior
- regeneration and persistence of skeleton contours

This is a real ownership boundary, but right now the file does not present it cleanly.

Some of the skeleton-adjacent pure code may also be worth tidying locally in this phase if it improves readability without becoming a new abstraction exercise.

#### Proposed Solution (Plain Language)

Create one skeleton-owned section inside `src-js/views-editor/src/edit-behavior-adapters.js` and move only skeleton-owned code into it.

That section may include:

- skeleton helper functions
- skeleton drag/nudge canonical entrypoints
- rib routes if they are tightly coupled to skeleton data editing

Before moving any helper, ask:

- is this helper really skeleton-specific
- or is it pure math that belongs in Phase 5 instead

If the helper is skeleton-specific editor orchestration, keep it in the skeleton section.

If it is pure skeleton math, note it for Phase 5 instead of hiding math-placement problems inside a reordering pass.

Allowed small code cleanup in this step:

- regrouping skeleton-owned helpers so read order matches execution flow
- introducing one tiny local helper if it removes exact repeated skeleton-specific boilerplate in this file

Disallowed drift in this step:

- extracting core math
- redesigning skeleton session flow
- building generic helpers that pretend skeleton and non-skeleton code are more alike than they are

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

1. Drag a skeleton on-curve point.
2. Drag a skeleton off-curve point.
3. Drag a skeleton equalize handle.
4. Drag a rib point.
5. Nudge a skeleton point.
6. Nudge a rib point.
7. Use a fixed-rib drag mode if available.
8. Undo and redo one skeleton drag and one skeleton nudge.

Expected result:

- no behavior drift in skeleton editing
- no broken skeleton regeneration or persistence
- skeleton-owned code now has one obvious in-file home

---

### Step 3.4: Group editable-generated adapter code into one contiguous in-file block

#### Problem Aspect

Editable-generated routes are also a distinct family.

They have their own concepts:

- generated points vs generated handles
- editable rib info lookup
- equalize state for generated handles
- generated-point persistence rules

This is not the same problem space as regular point-like editing.

Some editable-generated helpers are also currently parked far away from the routes that use them, which is a locality problem as well as an ownership problem.

#### Proposed Solution (Plain Language)

Create one editable-generated-owned section inside `src-js/views-editor/src/edit-behavior-adapters.js` and move only editable-generated-owned code into it.

That section may include:

- generated-point selection collectors
- generated-handle equalize helpers
- generated-point canonical routes
- generated-handle canonical routes

Do not move generic point-like kernels here.

Do not move skeleton-only logic here.

The goal is simple:

- all editable-generated route logic should be readable in one place inside the existing file

Allowed small code cleanup in this step:

- moving family-specific helpers closer to the routes that use them
- introducing one tiny local helper when it removes exact repeated editable-generated boilerplate without widening abstraction

Disallowed drift in this step:

- trying to fully deduplicate generated and skeleton orchestration here
- moving generated/skeleton math across module boundaries

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

1. Drag an editable generated point.
2. Drag an editable generated handle.
3. Nudge an editable generated point.
4. Nudge an editable generated handle.
5. Use equalize-related generated-handle behavior if available.
6. Undo and redo one generated drag and one generated nudge.

Expected result:

- no behavior drift in editable-generated editing
- generated handle equalize behavior still works
- editable-generated code now has one obvious in-file home

---

### Step 3.5: Finalize the in-file layout and verify the new ownership map

#### Problem Aspect

After regrouping shared, skeleton, and editable-generated code in place, there is still a risk that the file becomes messy in a different way:

- sections exist but are not clearly labeled
- mixed-selection / legacy routes are still scattered
- public adapter maps are harder to read
- the new order still does not help future cleanup

We need one final pass so the file ends with one readable internal layout instead of one giant undifferentiated dump.

#### Proposed Solution (Plain Language)

Turn `src-js/views-editor/src/edit-behavior-adapters.js` into one readable file with obvious internal sections.

Its final layout should make these groups easy to find:

- shared adapter infrastructure
- regular point-like routes
- skeleton-owned routes and helpers
- editable-generated routes and helpers
- mixed-selection / legacy routes
- public adapter maps

Mixed-selection / legacy routes should stay in the same file, in one clearly labeled section.

If one proposed section boundary does not help readability, collapse it instead of preserving fake structure.

This final pass should also answer one last code-quality question:

- did we remove the obvious local repetition and wrong helper placement that belonged to Phase 3
- or did we only reshuffle code without making the file easier to work in

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

Final manual check for Phase 3:

1. Drag a regular point.
2. Drag an anchor.
3. Drag a guideline.
4. Drag a skeleton on-curve point.
5. Drag a skeleton off-curve point.
6. Drag a rib point.
7. Drag an editable generated point.
8. Drag an editable generated handle.
9. Drag a mixed selection.
10. Nudge a regular point.
11. Nudge a skeleton point.
12. Nudge a rib point.
13. Nudge an editable generated point.
14. Nudge an editable generated handle.
15. Undo and redo one drag and one nudge.

Expected result:

- no behavior drift
- composer still imports one stable adapters entrypoint
- adapter ownership is easier to read in code
- no new files were created for Phase 3
- the file has better locality and less obvious local boilerplate, without stealing Phase 5 work

---

## Phase 4: Clean Up Canonical Vs Legacy Naming And Routing Boundaries

### Broad Problem

Some code is called `legacy` even when it now runs canonical logic.

That makes the code harder to read because names no longer describe reality.

This is a naming problem and a boundary problem.

Examples of the current confusion:

- `legacyDragAdapters.mixedSelection` calls `runMixedSelectionDragCanonical(...)`
- some routes are called `legacy` because of how they were discovered, not because of how they execute
- `skeletonHandle` still carries a `legacyAliasFor` note in the registry even though it is part of the active unified behavior set
- composer branches on canonical vs legacy tables, but the reader still has to ask what those words actually mean in each route

This phase is not for redesigning the registry representation.

That later problem belongs to Phase 6.

This phase is only for making route names, adapter names, and module boundaries tell the truth.

The goal of this phase is simple:

- if code is truly canonical, name it canonical
- if code is truly legacy fallback, keep it clearly marked as legacy
- if a route is transitional, say that directly instead of hiding it under the wrong label

### Step 4.1: Write down the exact places where the current legacy/canonical words are lying

#### Problem Aspect

Before renaming anything, we need one exact list of mismatches.

Otherwise this phase turns into vague cleanup and the result will be inconsistent.

This step fixes that by making the naming lies explicit.

#### Proposed Solution (Plain Language)

Do a focused inventory of all places where:

- a `legacy` route calls canonical logic
- a `canonical` name still carries transitional behavior
- an object-kind name still reflects old discovery/path wording instead of current behavior meaning
- comments still explain things in migration language instead of current architecture language

Do not rename anything yet.

Do not change routing yet.

The output of this step should be a simple mismatch list that later steps can remove one by one.

#### Code Evidence

Current concrete mismatches:

- `src-js/views-editor/src/pointer-objects.js`

```js
export const legacyDragAdapters = {
  mixedSelection: async (context) => runMixedSelectionDragCanonical(context),
  tunniPoint: async (context) => runTunniDragLegacy(context),
};
```

- `src-js/views-editor/src/edit-behavior-registry.js`

```js
skeletonHandle: {
  selectionKey: "skeletonHandle",
  supports: ["drag", "nudge"],
  persistent: true,
  inScope: true,
  legacyAliasFor: "skeleton off-curve point",
},
```

- `src-js/views-editor/src/edit-behavior-composer.js`

```js
const adapter =
  routeKind === "CA"
    ? canonicalDragAdapters[objectKind]
    : legacyDragAdapters[objectKind];
```

This step should explain, for each mismatch:

- what the name says
- what the code actually does
- why that difference confuses the reader

#### Files To Touch

- `docs/refactor/plan-post-refactor-cleanup-optimization.md`
- `docs/refactor/progress-report.md`

#### Manual Tests

This is an inventory-only step, but still do a quick sanity pass:

1. Drag a mixed selection.
2. Drag a component.
3. Drag a Tunni point.
4. Drag a skeleton off-curve point.
5. Nudge a mixed selection.
6. Undo and redo one of the above.

Expected result:

- no behavior change
- the naming mismatch list is concrete and complete enough to drive the rename work

---

### Step 4.2: Define truthful naming rules for canonical, legacy, fallback, and transitional routes

#### Problem Aspect

The words themselves are currently overloaded.

Different readers can mean different things by `legacy`:

- old UI discovery path
- old implementation path
- old persistence path
- out-of-scope fallback route
- unsupported route that still exists for compatibility

That ambiguity is the real reason the names drifted.

This step fixes the vocabulary first.

#### Proposed Solution (Plain Language)

Define a small naming rule set and apply it consistently:

- `canonical`
  - use this only when the route executes the current unified path on purpose
- `legacy`
  - use this only when the route intentionally keeps old behavior or old route ownership
- `fallback`
  - use this when a route is not preferred but still intentionally supported
- `transitional`
  - use this only for a temporary bridge that still needs later removal

Then decide which current names violate those rules.

This step may add short comments near adapter maps and registry notes, but it should not yet do the broad rename.

#### Proposed Solution (Code Sketch)

Example rule comment near the adapters entrypoint:

```js
// Naming rules:
// - canonical: current unified route
// - legacy: intentionally old behavior path
// - fallback: supported but not preferred route
// - transitional: temporary bridge to be removed later
```

Example of the kind of correction this phase should aim for later:

```js
// bad
legacyDragAdapters.mixedSelection = runMixedSelectionDragCanonical;

// better
fallbackDragAdapters.mixedSelection = runMixedSelectionCanonical;
```

The exact final names can differ.

The important part is that the words must describe reality.

#### Files To Touch

- `docs/refactor/plan-post-refactor-cleanup-optimization.md`
- `src-js/views-editor/src/edit-behavior-adapters.js`
  - or, before the Phase 0 rename lands, `src-js/views-editor/src/pointer-objects.js`
- `src-js/views-editor/src/edit-behavior-composer.js`
- `src-js/views-editor/src/edit-behavior-registry.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

This step is naming-rules and comments only, but still run a quick parity pass:

1. Drag a regular point.
2. Drag a mixed selection.
3. Drag a Tunni point.
4. Nudge a skeleton point.
5. Undo and redo one of the above.

Expected result:

- no behavior change
- route terminology is now defined before broad renaming starts

---

### Step 4.3: Rename adapter entrypoints and adapter maps so route names match actual behavior

#### Problem Aspect

Once the vocabulary is defined, the next problem is the adapter surface itself.

That surface is where most readers form their mental model.

If the map names lie, the whole layer still feels dishonest even if the underlying code works.

This step fixes the public adapter naming surface.

#### Proposed Solution (Plain Language)

Rename adapter entrypoints and adapter maps so that:

- canonical routes are grouped under canonical names
- true legacy routes stay grouped under legacy names
- routes that are really fallback or transitional stop pretending to be legacy if they are not

This step may involve:

- renaming functions like `runMixedSelectionDragCanonical(...)` if the route meaning needs clearer wording
- renaming map objects if `legacy*` is no longer the honest category
- updating composer imports and lookups to match

Keep the runtime behavior the same.

This is a naming and boundary cleanup step, not a routing redesign step.

#### Code Evidence

Current adapter map surface:

```js
export const canonicalDragAdapters = { ... };
export const canonicalNudgeAdapters = { ... };
export const legacyDragAdapters = { ... };
export const legacyNudgeAdapters = { ... };
```

Current mismatch inside that surface:

```js
mixedSelection: async (context) => runMixedSelectionDragCanonical(context),
```

Composer currently reflects the same split:

```js
const adapter =
  routeKind === "CA"
    ? canonicalDragAdapters[objectKind]
    : legacyDragAdapters[objectKind];
```

After this step, the names on both sides should tell the same story.

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
  - or, before the Phase 0 rename lands, `src-js/views-editor/src/pointer-objects.js`
- `src-js/views-editor/src/edit-behavior-composer.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

Test the routes most likely to be affected by naming/boundary cleanup:

1. Drag a mixed selection.
2. Nudge a mixed selection.
3. Drag a component.
4. Drag a component origin if supported in current UI.
5. Drag a Tunni point.
6. Drag a skeleton Tunni point.
7. Drag a regular point.
8. Nudge a regular point.
9. Undo and redo one drag and one nudge.

Expected result:

- all routes still dispatch correctly
- composer still selects the correct adapter for each route
- the adapter surface is easier to read

---

### Step 4.4: Clean up object-kind names and registry notes that still describe old terminology

#### Problem Aspect

Even if adapter maps are renamed, the code will still be confusing if object-kind labels and registry notes keep old terminology alive.

This is especially visible in places like:

- `legacyAliasFor`
- old comments about off-curve aliases
- transitional notes that make active object kinds sound second-class

This step fixes the object-kind naming layer without redesigning the registry structure itself.

#### Proposed Solution (Plain Language)

Review the object-kind metadata and rename or rewrite only the parts that are misleading.

Examples of the kinds of fixes this step should make:

- remove stale alias wording if the alias is no longer helpful
- rewrite comments so they explain current meaning, not historical migration context
- keep compatibility facts only where they still matter to the code

Do not change the registry representation here.

Do not change row maps here.

This is strictly about truthful names and notes.

#### Code Evidence

Current example in the registry:

```js
// In-scope unified-behavior kinds: regularPoint, anchor, guideline, skeletonPoint,
// skeletonHandle (legacy off-curve alias), skeletonRibPoint, editableGeneratedPoint,
// editableGeneratedHandle.
```

And:

```js
skeletonHandle: {
  ...
  legacyAliasFor: "skeleton off-curve point",
},
```

This step should decide whether that wording still helps the current codebase or only preserves history in a confusing way.

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-registry.js`
- related adapter family files if object-kind helper names also need alignment
- `docs/refactor/progress-report.md`

#### Manual Tests

Run a focused pass on routes tied to object-kind wording:

1. Drag a skeleton off-curve point.
2. Nudge a skeleton off-curve point if supported.
3. Drag a skeleton rib point.
4. Drag an editable generated handle.
5. Undo and redo one of the above.

Expected result:

- no behavior change
- object-kind terminology matches current editor behavior better

---

### Step 4.5: Verify that canonical, legacy, fallback, and transitional boundaries are now honest in code

#### Problem Aspect

After the renames, there is still a risk that the code tells mixed stories in different files.

For example:

- adapters may use one term
- composer may use another term
- registry comments may still imply a third term

This step is the final consistency pass for the phase.

#### Proposed Solution (Plain Language)

Run one final consistency sweep across:

- adapters entrypoint
- family-specific adapter modules if Phase 3 already split them
- composer
- registry comments and object-kind notes

Check these things explicitly:

- routes named `legacy` are truly legacy
- routes named `canonical` are truly canonical
- fallback or transitional wording is used only where it is actually needed
- no public surface still mixes contradictory terms

Add a simple grep-based verification checklist to the progress entry for this step.

#### Code Evidence

Useful verification commands after Phase 4:

```bash
rg -n "legacy.*Canonical|Canonical.*legacy" src-js/views-editor/src
rg -n "legacyAliasFor|transitional|fallback" src-js/views-editor/src
rg -n "canonicalDragAdapters|canonicalNudgeAdapters|legacyDragAdapters|legacyNudgeAdapters" src-js/views-editor/src
```

The exact grep targets may change if names improve during the phase.

The main idea is to catch contradictory naming after the cleanup.

#### Files To Touch

- `docs/refactor/plan-post-refactor-cleanup-optimization.md`
- `docs/refactor/progress-report.md`
- refactor implementation files touched by the earlier Phase 4 steps

#### Manual Tests

Final manual check for Phase 4:

1. Drag a regular point.
2. Drag a mixed selection.
3. Nudge a mixed selection.
4. Drag a component.
5. Drag a Tunni point.
6. Drag a skeleton Tunni point.
7. Drag a skeleton off-curve point.
8. Nudge a skeleton point.
9. Drag an editable generated point.
10. Undo and redo one drag and one nudge.

Expected result:

- no behavior drift
- route names and route boundaries are easier to trust
- the code no longer says `legacy` when it really means something else

---

## Phase 5: Reduce Duplicated Session Shells, Deduplicate Skeleton-Backed Layer Workflows, And Move Only Truly Pure Math

### Broad Problem

The adapters layer still contains too much repeated setup, skeleton-backed working-state lifecycle, persistence, and point-like orchestration logic.

Also, some skeleton-related math may belong in core or a small shared helper module instead of editor UI code.

This matters for two different reasons:

- repeated orchestration makes cleanup risky because the same fix has to be repeated in multiple route families
- pure math hidden inside editor files is harder to test, harder to reuse, and harder to optimize safely

These problems are related, but they are not the same.

This phase must keep them separate on purpose.

Rule for this phase:

- if code is editor-only orchestration, keep it in the editor layer
- if code is pure skeleton math, explicitly check whether it belongs in `src-js/fontra-core/src/skeleton-contour-generator.js`
- if code is pure math but not skeleton-contour-generator math, prefer existing homes first
  - especially `src-js/fontra-core/src/vector.js`
  - and `src-js/views-editor/src/skeleton-tunni-calculations.js`
- do not create a new shared math/helper module unless there is a proven reuse case and no existing home fits
- do not move UI state, event handling, or edit-session logic into core

Candidate places to review during this phase:

- `src-js/views-editor/src/edit-behavior-adapters.js`
  - or, before the Phase 0 rename lands, `src-js/views-editor/src/pointer-objects.js`
- `src-js/views-editor/src/edit-behavior.js`
- `src-js/fontra-core/src/skeleton-contour-generator.js`
- `src-js/views-editor/src/skeleton-tunni-calculations.js`

The goal of this phase is simple:

- remove repeated session-entry scaffolding where one shared editor-side path is enough
- remove repeated skeleton-backed layer lifecycle where one shared editor-side path is enough
- identify math that is truly pure and move it out of editor implementation code when that move is actually justified

### Step 5.1: Write down the repeated orchestration pattern before extracting anything

#### Problem Aspect

Right now the adapters layer repeats the same broad session shape in several places.

Examples:

- regular point-like routes set up edit sessions, build layer state, run point-like kernels, and persist changes
- skeleton routes do similar work with their own layer preparation and persistence steps
- editable-generated routes do similar work again with their own setup and teardown

If we skip the inventory and start extracting immediately, we risk merging code that only looks similar on the surface.

This step fixes that risk first.

#### Proposed Solution (Plain Language)

Create one concrete comparison list for the main route families and duplication buckets:

- regular point-like orchestration
- skeleton point-like orchestration
- editable-generated point-like orchestration
- editable-generated handle-like orchestration
- mixed skeleton-backed orchestration where it shares the same layer lifecycle

For each route family, classify duplication into three buckets:

- session-entry scaffolding
- skeleton-backed working-state / regenerate / persist lifecycle
- pure math or geometry helpers

For each family, list:

- what session setup it repeats
- what input/session kernel usage it repeats
- what skeleton-backed layer lifecycle it repeats
- what persistence pattern it repeats
- what parts are truly family-specific and must stay separate

Do not extract code yet.

Do not move math yet.

The goal is only to separate true duplication from necessary specialization.

Important constraint:

- do not assume that all point-like families should share one universal helper
- the inventory must prove which duplication bucket is real before extraction starts

#### Code Evidence

Current repeated orchestration anchors:

```js
async function runRegularPointLikeCanonical(...) { ... }
async function runSkeletonPointLikeOrchestration(...) { ... }
async function runEditableGeneratedPointLikeCanonical(...) { ... }
async function runEditableGeneratedHandleLikeCanonical(...) { ... }
```

Current duplication signals inside those flows:

- repeated `runPointLikeSessionKernel(...)` usage
- repeated event/assertion checks
- repeated layer iteration and incremental change sending
- repeated skeleton regeneration + persistence blocks

#### Files To Touch

- `docs/refactor/plan-post-refactor-cleanup-optimization.md`
- `docs/refactor/progress-report.md`

#### Manual Tests

This is an inventory-only step, but still do a quick sanity pass:

1. Drag a regular point.
2. Drag a skeleton point.
3. Drag an editable generated point.
4. Drag an editable generated handle.
5. Nudge a regular point.
6. Undo and redo one of the above.

Expected result:

- no behavior change
- the duplication map is concrete enough to justify later extraction steps

---

### Step 5.2: Extract the shared editor-side point-like orchestration that is truly common

#### Problem Aspect

After the inventory, some session-entry scaffolding will still be repeated for no good reason.

That repeated code is expensive:

- bug fixes must be copied into multiple flows
- optimization work becomes slower because there is no single place to improve
- later refactors are more likely to drift behavior between object families

This step fixes only the editor-side duplication that is genuinely shared at the session shell level.

#### Proposed Solution (Plain Language)

Extract one shared editor-side session-shell helper for the parts that are actually common across point-like routes.

That shared helper may own things like:

- common input validation for drag vs nudge entry
- common `runPointLikeSessionKernel(...)` setup
- common incremental change flow
- common rollback aggregation shape

Do not force family-specific behavior into the shared helper.

Keep family-specific logic as callbacks or small family-owned hooks.

Good shared target:

- a helper that reduces duplication while still reading clearly for regular, skeleton, and editable-generated routes
- a helper that does not try to own skeleton-backed regeneration/persist policy by itself

Bad shared target:

- one giant generic function with dozens of flags that hides family-specific behavior behind conditionals

#### Proposed Solution (Code Sketch)

Possible direction inside the adapters layer:

```js
async function runPointLikeEditorFlow({
  mode,
  input,
  buildSessionState,
  onInput,
  onSessionEnd,
}) {
  return runPointLikeSessionKernel({
    mode,
    ...input,
    onSessionStart: buildSessionState,
    onInput,
    onSessionEnd,
  });
}
```

Then family-specific routes stay thin:

```js
return runPointLikeEditorFlow({
  mode,
  input: ...,
  buildSessionState: ...,
  onInput: ...,
  onSessionEnd: ...,
});
```

The exact API can differ.

The important part is that the shared helper removes duplication without flattening real differences.

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

This step needs a broad parity pass because it changes orchestration shape:

1. Drag a regular point.
2. Drag an anchor.
3. Drag a guideline.
4. Drag a skeleton on-curve point.
5. Drag a skeleton off-curve point.
6. Drag an editable generated point.
7. Drag an editable generated handle.
8. Nudge a regular point.
9. Nudge a skeleton point.
10. Nudge an editable generated point.
11. Nudge an editable generated handle.
12. Undo and redo one drag and one nudge.

Expected result:

- no behavior drift
- less repeated orchestration in the adapter layer
- shared flow is still readable and not over-generalized

---

### Step 5.3: Extract repeated skeleton-backed layer lifecycle patterns without moving them to core

#### Problem Aspect

Skeleton-backed routes repeat a lot of working-state and persistence boilerplate:

- read skeleton data
- clone or reset working data
- regenerate contours
- persist path changes
- persist custom data changes

This repetition is not pure math.

It is editor-side skeleton-backed layer lifecycle.

That means it should be cleaned up, but it should not be pushed into core just because it is skeleton-related.

#### Proposed Solution (Plain Language)

Extract the repeated skeleton-backed layer lifecycle into shared editor-side helpers.

Good candidates:

- working contour reset helpers
- layer persistence helpers
- shared regeneration-and-persist blocks used by more than one skeleton-backed route family

This step must explicitly review these families together:

- skeleton point / handle routes
- fixed-rib skeleton routes
- editable-generated point / handle routes
- mixed-selection routes that mutate skeleton-backed working data

Keep these helpers in the editor/adapters layer because they depend on editor edit sessions and layer persistence structure.

Do not move this logic into `skeleton-contour-generator.js`.

That file should keep math and contour-generation logic, not editor transaction flow.

#### Code Evidence

Current repeated editor-side skeleton helpers already suggest this boundary:

```js
function resetWorkingContoursFromOriginal(...) { ... }
function makeSkeletonLayerPersistenceChanges(...) { ... }
```

Current repeated usage sites include multiple regeneration/persist blocks around:

- `runSkeletonPointLikeCanonical(...)`
- `runSkeletonHandlePointLikeCanonical(...)`
- `runFixedRibSkeletonPointLikeCanonical(...)`
- `runEditableGeneratedPointLikeCanonical(...)`
- `runEditableGeneratedHandleLikeCanonical(...)`
- `runSkeletonRibPointNudgeCanonical(...)`
- `runMixedSelectionDrag(...)`
- `runMixedSelectionNudge(...)`

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

This step needs a skeleton-focused parity pass:

1. Drag a skeleton on-curve point.
2. Drag a skeleton off-curve point.
3. Drag a skeleton rib point.
4. Nudge a skeleton point.
5. Nudge a skeleton rib point.
6. Drag an editable generated point that persists through skeleton regeneration.
7. Drag an editable generated handle that persists through skeleton regeneration.
8. Undo and redo one skeleton drag and one generated drag.

Expected result:

- no behavior drift
- skeleton-backed layer lifecycle is less duplicated
- core code does not gain editor transaction responsibilities

---

### Step 5.4: Identify the pure math helpers and move only the ones that truly belong in core or shared math

#### Problem Aspect

The adapters file currently contains a cluster of pure math and geometry helpers near the top.

Some of them may belong in core or an existing shared math home.

Some of them may only look pure, but are actually coupled to editor-side route assumptions.

If we move the wrong helpers, we will create a worse boundary instead of a better one.

This step separates those cases carefully.

#### Proposed Solution (Plain Language)

Review each math helper and classify it as one of these:

- pure skeleton math that belongs in `src-js/fontra-core/src/skeleton-contour-generator.js`
- pure math that belongs in an existing shared home such as `src-js/fontra-core/src/vector.js`
- pure geometry that may belong in `src-js/views-editor/src/skeleton-tunni-calculations.js` before it belongs in core
- adapter-local math that should stay in the adapters layer because it is tightly tied to route behavior

Candidate helpers to review first:

```js
function normalizeVectorSafe(vec, epsilon = 1e-6) { ... }
function rotateVector(vec, cos, sin) { ... }
function calculateHandleTensionsForSegment(segment) { ... }
function computeHandleLengthsFromTensions(...) { ... }
function applyFixedRibDragToSkeletonData(...) { ... }
```

Decision rules:

- `normalizeVectorSafe` and `rotateVector` are generic math candidates, but should only move if an existing home is clearly better than staying local
- `calculateHandleTensionsForSegment` and `computeHandleLengthsFromTensions` should be compared against existing Tunni/skeleton geometry first
  - especially `src-js/views-editor/src/skeleton-tunni-calculations.js`
  - and related tension logic in `src-js/fontra-core/src/skeleton-contour-generator.js`
- `computeHandleLengthsFromTensions` is the strongest move candidate
- `applyFixedRibDragToSkeletonData` sounds mathematical, but it also encodes edit intent and route behavior, so it should stay editor-side unless proved otherwise

If a helper is pure and belongs in core, move it with narrow scope.

If a helper is not clearly core-worthy, leave it in editor code and document why.

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
  - or, before the Phase 0 rename lands, `src-js/views-editor/src/pointer-objects.js`
- `src-js/fontra-core/src/skeleton-contour-generator.js`
  - only for helpers that clearly belong there
- one small shared math/helper module only if the reviewed helpers do not fit existing homes and there is a real reuse case
- `docs/refactor/progress-report.md`

#### Manual Tests

This step must test both behavior and placement correctness:

1. Drag a fixed-rib skeleton point if that mode is available.
2. Drag a skeleton point that changes handle geometry.
3. Drag a skeleton off-curve point.
4. Drag a skeleton Tunni-related point if available.
5. Nudge a skeleton point.
6. Undo and redo one skeleton geometry edit.
7. If any helper moved to core, re-test at least one non-skeleton route to confirm no accidental import/runtime break.

Expected result:

- behavior is unchanged
- only truly pure math moved out of editor code
- editor-specific intent logic did not leak into core

---

### Step 5.5: Verify that duplication went down and that math moved only where it belongs

#### Problem Aspect

After the extractions, there are two failure modes:

- duplication is still present because the extraction was too timid
- the cleanup moved too much into core or shared code, creating a fake abstraction

This step is the final check against both mistakes.

#### Proposed Solution (Plain Language)

Run one final review and verification pass.

Check these things explicitly:

- the main route families share editor-side session scaffolding where it is genuinely common
- skeleton-backed layer lifecycle helpers are shared inside the editor layer rather than copied across routes
- pure math moved only when its new home is clearly better
- `skeleton-contour-generator.js` did not become an editor behavior dumping ground
- any new shared helper file has a real reason to exist

Add grep-based checks to the progress entry for this step.

#### Code Evidence

Useful verification commands after Phase 5:

```bash
rg -n "runRegularPointLikeCanonical|runSkeletonPointLikeOrchestration|runEditableGeneratedPointLikeCanonical|runEditableGeneratedHandleLikeCanonical|runMixedSelectionDrag|runMixedSelectionNudge" src-js/views-editor/src
rg -n "regenerateSkeletonContours\(|setSkeletonData\(|makeSkeletonLayerPersistenceChanges|createSkeletonLayersData" src-js/views-editor/src
rg -n "normalizeVectorSafe|rotateVector|calculateHandleTensionsForSegment|computeHandleLengthsFromTensions|applyFixedRibDragToSkeletonData" src-js/views-editor/src src-js/fontra-core/src
```

The exact grep targets may change if helper names improve during the phase.

The main idea is to verify both reduced duplication and sensible code placement.

#### Files To Touch

- `docs/refactor/plan-post-refactor-cleanup-optimization.md`
- `docs/refactor/progress-report.md`
- refactor implementation files touched by the earlier Phase 5 steps

#### Manual Tests

Final manual check for Phase 5:

1. Drag a regular point.
2. Drag a skeleton on-curve point.
3. Drag a skeleton off-curve point.
4. Drag a skeleton rib point.
5. Drag an editable generated point.
6. Drag an editable generated handle.
7. Nudge a regular point.
8. Nudge a skeleton point.
9. Nudge an editable generated point.
10. Nudge an editable generated handle.
11. Use a fixed-rib or equalize-related skeleton edit if available.
12. Undo and redo one drag and one nudge.

Expected result:

- no behavior drift
- duplicated orchestration is reduced
- pure math placement is easier to justify and easier to test

---
## Phase 6: Rework The Registry Representation

### Broad Problem

The registry exists for a real reason, but the current representation is too indirect and too hard to read.

The problem is not that there is a routing file.

The problem is that the routing information is encoded in a way that is cheap for the machine and expensive for the human:

- row ids like `R1`, `R10`, `R17`
- route codes like `CA`, `CL`, `NA`
- multiple tables that have to be mentally joined
- routing intent spread across modifier decoding, row-id helpers, and row maps

This means the code is technically declarative, but still awkward to maintain.

This phase is for fixing that representation without collapsing routing back into composer or adapters.

The goal of this phase is simple:

- keep routing/config separate from behavior and adapters
- make routing definitions readable without spreadsheet-style cross-reference work
- reduce or remove row-id indirection where possible
- replace opaque route codes with names that describe actual meaning

### Step 6.1: Write down the current registry decode chain from user input to final adapter map lookup

#### Problem Aspect

Before changing the representation, we need one exact map of how routing works today.

Right now the logic is spread across several small parts:

- object-kind metadata
- row-id selection helpers
- an unused preset helper that does not currently drive routing
- drag and nudge routing maps
- composer lookup logic

If we skip this inventory, the rewrite will miss hidden dependencies and the new structure will only be partially correct.

This step fixes that risk first.

#### Proposed Solution (Plain Language)

Write down the current routing chain in plain language.

For drag and nudge separately, describe this sequence:

1. how object kind is identified
2. how modifiers are resolved
3. how a row id is chosen
4. how the row id maps to a route code
5. how composer turns that route code into an adapter table lookup

Do not change code yet.

Do not rename codes yet.

The goal is only to make the current decode chain explicit and complete.

#### Code Evidence

Current registry/composer chain:

- `src-js/views-editor/src/edit-behavior-registry.js`

```js
export function resolveBehaviorPreset(_objectKind, action, modifiers) { ... }
export function getDragRowId(modifiers) { ... }
export function getNudgeRowId(modifiers) { ... }
export const DRAG_ROUTING_MAP = { ... }
export const NUDGE_ROUTING_MAP = { ... }
```

- `src-js/views-editor/src/edit-behavior-composer.js`

```js
const rowId = getDragRowId(modifiers);
const routeKind = DRAG_ROUTING_MAP[rowId]?.[objectKind];
const adapter =
  routeKind === "CA"
    ? canonicalDragAdapters[objectKind]
    : legacyDragAdapters[objectKind];
```

This step should turn that indirect chain into a plain-language routing description.

It must also answer one extra question:

- should `resolveBehaviorPreset(...)` become the real preset resolver for Phase 6
- or should it be removed because it is currently dead scaffolding

#### Files To Touch

- `docs/refactor/plan-post-refactor-cleanup-optimization.md`
- `docs/refactor/progress-report.md`

#### Manual Tests

This is an inventory-only step, but still do a quick sanity pass:

1. Drag a regular point with no modifiers.
2. Drag a regular point with Shift.
3. Drag a skeleton handle in equalize mode.
4. Nudge a regular point with Shift.
5. Nudge a skeleton rib point.
6. Undo and redo one of the above.

Expected result:

- no behavior change
- the routing decode chain is explicit enough to guide the rewrite safely

---

### Step 6.2: Replace opaque route codes with explicit route names before changing structure

#### Problem Aspect

The route codes are one of the worst readability problems in the file.

`CA`, `CL`, and `NA` are fast to type, but they force the reader to keep a hidden legend in their head.

That makes every registry read slower than it should be.

This step fixes the route value vocabulary first.

#### Proposed Solution (Plain Language)

Replace short route codes with explicit route names.

Examples:

- `CA` -> a truthful canonical route value such as `canonical`
- `CL` -> a truthful fallback/legacy route value such as `legacy` or `fallback`
- `NA` -> `unhandled` or `notApplicable`

Use the naming rules established in Phase 4.

Do not redesign the whole table structure yet.

The goal is only to make the current values readable before deeper structural changes start.

#### Proposed Solution (Code Sketch)

Current style:

```js
R1: {
  regularPoint: "CA",
  mixedSelection: "CL",
  skeletonHandle: "NA",
}
```

Target direction:

```js
R1: {
  regularPoint: "canonical",
  mixedSelection: "fallback",
  skeletonHandle: "unhandled",
}
```

Or, if `legacy` is still the truthful word for that route family:

```js
mixedSelection: "legacy"
```

The important part is that the value tells the truth without a legend.

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-registry.js`
- `src-js/views-editor/src/edit-behavior-composer.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

This step needs a routing parity pass because composer lookup values will change:

1. Drag a regular point.
2. Drag a mixed selection.
3. Drag a component.
4. Drag a Tunni point.
5. Drag a skeleton point.
6. Nudge a regular point.
7. Nudge a mixed selection.
8. Nudge a skeleton rib point.
9. Undo and redo one drag and one nudge.

Expected result:

- no behavior drift
- route values are readable without remembering short codes

---

### Step 6.3: Replace row-id indirection with readable route presets where possible

#### Problem Aspect

Even with better route values, the registry is still awkward if it depends on row ids like `R1`, `R10`, and `R17`.

Those ids do not explain what they mean.

They force the reader to jump between:

- row-id selection helpers
- row maps
- modifier combinations

This is the main spreadsheet-like problem in the current representation.

#### Proposed Solution (Plain Language)

Replace row ids with readable route-preset names.

Good examples:

- `dragDefault`
- `dragConstrain`
- `dragAlternate`
- `dragEqualize`
- `nudgeDefault`
- `nudgeScale10`
- `nudgeScale100`
- `nudgeRibFixed`

The exact preset names should reflect actual behavior, not keyboard details alone.

Keep one place that resolves modifiers into a named preset.

Prefer reusing and reshaping the existing `resolveBehaviorPreset(...)` helper if it can become the real preset resolver cleanly.

Do not leave both systems alive at once:

- old row-id helpers
- and a second parallel preset resolver

Then map that preset directly to object-kind routes.

This keeps the logic declarative, but makes it much easier for a human to follow.

#### Proposed Solution (Code Sketch)

Current style:

```js
if (equalizeMode) return shiftKey ? "R14" : "R13";
if (altKey) return "R20";
if (shiftKey) return "R11";
return "R10";
```

Target direction:

```js
if (equalizeMode) return shiftKey ? "nudgeEqualizeScale" : "nudgeEqualize";
if (altKey) return "nudgeAlternate";
if (shiftKey && (ctrlKey || metaKey)) return "nudgeScale100";
if (shiftKey) return "nudgeScale10";
return "nudgeDefault";
```

Then the routing table reads like this:

```js
export const NUDGE_ROUTES = {
  nudgeDefault: {
    regularPoint: "canonical",
    mixedSelection: "fallback",
  },
};
```

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-registry.js`
- `src-js/views-editor/src/edit-behavior-composer.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

This step needs focused preset coverage:

1. Drag with no modifiers.
2. Drag with Shift.
3. Drag with Alt.
4. Drag in equalize mode.
5. Drag in fixed-rib mode if available.
6. Nudge with no modifiers.
7. Nudge with Alt.
8. Nudge with Shift.
9. Nudge with Shift+Ctrl or Shift+Meta if supported.
10. Undo and redo one drag and one nudge.

Expected result:

- no behavior drift
- preset names explain the route without needing row-id comments

---

### Step 6.4: Re-group the registry by action and readable preset, not by spreadsheet rows

#### Problem Aspect

After Steps 6.2 and 6.3, the next problem is layout.

If the file still keeps drag and nudge information in large anonymous matrices, it will remain awkward even with better values.

We need the registry to be organized the way a human asks routing questions.

That usually means:

- action first
- readable preset second
- object kind inside that preset

This step fixes the final human-readability problem in the registry layout.

#### Proposed Solution (Plain Language)

Re-group the registry so that drag and nudge each have readable preset maps.

A person should be able to answer questions like these by reading one small section:

- what happens for drag default on `regularPoint`
- what happens for nudge equalize on `skeletonHandle`
- what happens for fixed-rib drag on `skeletonPoint`

Do not move routing logic into composer.

Do not move adapter logic into registry.

Keep the registry declarative, but make the declarations match human questions.

#### Proposed Solution (Code Sketch)

Target direction:

```js
export const DRAG_ROUTES = {
  dragDefault: {
    regularPoint: "canonical",
    anchor: "canonical",
    mixedSelection: "fallback",
  },
  dragEqualize: {
    skeletonHandle: "canonical",
  },
};

export const NUDGE_ROUTES = {
  nudgeDefault: {
    regularPoint: "canonical",
    skeletonPoint: "canonical",
  },
};
```

Composer then asks for one named preset and one object kind.

That is still declarative, but much easier to scan.

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-registry.js`
- `src-js/views-editor/src/edit-behavior-composer.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

This step needs a broad route-dispatch parity pass:

1. Drag a regular point.
2. Drag an anchor.
3. Drag a guideline.
4. Drag a skeleton point.
5. Drag a skeleton handle in equalize mode.
6. Drag a rib point.
7. Drag an editable generated point.
8. Drag a mixed selection.
9. Nudge a regular point.
10. Nudge a skeleton point.
11. Nudge a skeleton rib point.
12. Nudge an editable generated handle.
13. Undo and redo one drag and one nudge.

Expected result:

- no behavior drift
- registry sections are readable by action and preset
- composer routing code gets simpler, not more complex

---

### Step 6.5: Verify that the registry is now readable, truthful, and still clearly separate from behavior and adapters

#### Problem Aspect

After the redesign, there are still two failure modes:

- the registry is still too indirect, just with different names
- the rewrite accidentally moves behavior knowledge into the registry or collapses routing back into composer

This step is the final check against both mistakes.

#### Proposed Solution (Plain Language)

Run one final consistency and readability pass.

Check these things explicitly:

- route values are readable without a legend
- presets are readable without row-id comments
- composer does simple lookup work instead of decoding a mini spreadsheet
- the registry still does not own adapter execution logic
- the registry still does not own behavior math or edit-session logic

Add a grep-based verification checklist to the progress entry for this step.

#### Code Evidence

Useful verification commands after Phase 6:

```bash
rg -n "R[0-9]+|\bCA\b|\bCL\b|\bNA\b" src-js/views-editor/src/edit-behavior-registry.js src-js/views-editor/src/edit-behavior-composer.js
rg -n "DRAG_ROUTES|NUDGE_ROUTES|drag[A-Z]|nudge[A-Z]" src-js/views-editor/src/edit-behavior-registry.js
rg -n "canonical|legacy|fallback|unhandled" src-js/views-editor/src/edit-behavior-registry.js src-js/views-editor/src/edit-behavior-composer.js
```

The exact grep targets may change if the final names improve.

The main idea is to verify that the opaque spreadsheet encoding is gone.

#### Files To Touch

- `docs/refactor/plan-post-refactor-cleanup-optimization.md`
- `docs/refactor/progress-report.md`
- `src-js/views-editor/src/edit-behavior-registry.js`
- `src-js/views-editor/src/edit-behavior-composer.js`

#### Manual Tests

Final manual check for Phase 6:

1. Drag a regular point with no modifiers.
2. Drag a regular point with Shift.
3. Drag a regular point with Alt.
4. Drag a skeleton point in fixed-rib mode if available.
5. Drag a skeleton handle in equalize mode.
6. Drag a mixed selection.
7. Drag a Tunni point.
8. Nudge a regular point with no modifiers.
9. Nudge a regular point with Alt.
10. Nudge a regular point with Shift.
11. Nudge a skeleton rib point.
12. Nudge an editable generated handle.
13. Undo and redo one drag and one nudge.

Expected result:

- no behavior drift
- registry routing is easier for humans to understand and maintain
- the registry remains a clean declarative routing layer


