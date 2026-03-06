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

## Phase 1: Make the Adapter Contract Real and Useful

### Broad Problem

Right now the code says adapters return `{ forward, rollback }`, but in practice that return value does not carry real meaning yet.

The current situation is confusing:

- the composer checks that the adapter returned an object with `forward` and `rollback`
- many adapters return placeholder `{ forward: null, rollback: null }`
- the composer does not actually use those values for anything important

This is dangerous for cleanup and optimization work because the code looks stricter than it really is.

We need to fix this first.

The goal of this phase is simple:

- make the adapter result shape honest
- make the composer rely on it in a real way
- remove placeholder return values that only exist to satisfy a shape check

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

- `src-js/views-editor/src/pointer-objects.js`
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
```

#### Files To Touch

- `docs/refactor/plan-post-refactor-cleanup-optimization.md`
- `src-js/views-editor/src/pointer-objects.js`
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

### Step 1.2: Replace the fake â€œshape-onlyâ€ adapter result with a truthful handled result type

#### Problem Aspect

The code currently allows this:

```js
return { forward: null, rollback: null };
```

That is the core lie in the current contract.

It says â€œthis adapter has meaningful change payloadsâ€, but the payloads are empty.

This step fixes that single issue.

#### Proposed Solution (Plain Language)

Introduce a small explicit adapter result helper API.

The API must say what happened in plain terms:

- handled
- unhandled
- optional change payload

Do not use `null` placeholders just to satisfy a shape check.

Example target shape:

```js
return { handled: true, changes: null };
return { handled: true, changes: { forward, rollback } };
return { handled: false };
```

If we want to preserve the existing `{ forward, rollback }` wording, that is okay, but then it must be nested under a truthful top-level result:

```js
return {
  handled: true,
  changeSet: { forward, rollback },
};
```

The important part is this:

- `handled` must become the real contract
- `forward` / `rollback` must stop pretending to be always meaningful

#### Proposed Solution (Code Sketch)

In `src-js/views-editor/src/pointer-objects.js`:

```js
function makeHandledAdapterResult(changeSet = null) {
  return { handled: true, changeSet };
}

function makeUnhandledAdapterResult() {
  return { handled: false };
}
```

Replace this:

```js
return makeAdapterResult();
```

With one of these:

```js
return makeHandledAdapterResult();
return makeHandledAdapterResult({ forward, rollback });
return makeUnhandledAdapterResult();
```

#### Files To Touch

- `src-js/views-editor/src/pointer-objects.js`
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
- no adapter route crashes because of the new result shape

---

### Step 1.3: Make composer consume the adapter result in a real, explicit way

#### Problem Aspect

Even after Step 1.2, the cleanup is incomplete if composer still treats adapter results as a shape-checking formality.

Right now composer mostly does this:

- call adapter
- check result shape
- return `true`

That hides what composer really depends on.

This step fixes that exact ambiguity.

#### Proposed Solution (Plain Language)

Change composer so it reads the explicit `handled` field and acts on it directly.

Composer should stop inferring meaning from object shape.

Composer should do this instead:

```js
if (!adapterResult.handled) return false;
return true;
```

If change payloads are present, composer may validate them, log them, or forward them later, but that must be secondary.

The main contract must be:

- handled or not handled

#### Proposed Solution (Code Sketch)

In `src-js/views-editor/src/edit-behavior-composer.js`:

```js
const adapterResult = await adapter(context);
assert(adapterResult && typeof adapterResult.handled === "boolean");

if (!adapterResult.handled) {
  return false;
}

return true;
```

Optional strict validation:

```js
if (adapterResult.changeSet) {
  assert("forward" in adapterResult.changeSet);
  assert("rollback" in adapterResult.changeSet);
}
```

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-composer.js`
- `src-js/views-editor/src/pointer-objects.js`
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
- no false positives from shape-only checks

---

### Step 1.4: Remove the last placeholder adapter returns and make every adapter choose handled or unhandled on purpose

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

- replace passive default returns with explicit handled/unhandled returns
- make early exits truthful
- remove any helper that encourages fake success by default

#### Code Evidence

Adapter map locations:

- `src-js/views-editor/src/pointer-objects.js`

Example current pattern to remove:

```js
if (!selection?.size) {
  return makeAdapterResult();
}
```

Example target pattern:

```js
if (!selection?.size) {
  return makeUnhandledAdapterResult();
}
```

Or, if the adapter truly consumed the route intentionally:

```js
return makeHandledAdapterResult();
```

#### Files To Touch

- `src-js/views-editor/src/pointer-objects.js`
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

### Step 1.5: Add a simple verification checklist for the now-real contract

#### Problem Aspect

Once the contract becomes truthful, we need a cheap way to stop it from silently drifting again.

Without that, later optimization work can slowly reintroduce fake handled results.

#### Proposed Solution (Plain Language)

Add a lightweight verification checklist to the plan and progress report.

The checklist must be easy to run by hand:

- grep for old helper names
- grep for placeholder null contract returns
- verify composer checks `handled`

#### Code Evidence

Useful verification commands after this phase:

```bash
rg -n "makeAdapterResult\\(" src-js/views-editor/src
rg -n "forward:\\s*null|rollback:\\s*null" src-js/views-editor/src
rg -n "handled" src-js/views-editor/src/pointer-objects.js src-js/views-editor/src/edit-behavior-composer.js
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

## Phase 2: Move Shared Drag/Nudge Session Kernels Out Of Composer

### Broad Problem

The shared input/session kernels currently live in composer, but adapters depend on them.

That is backwards.

Composer should orchestrate routing.
Shared drag/nudge kernels should live in the adapter layer we already have, not inside composer.

Phase 2 will fix that dependency direction.

The goal of this phase is simple:

- composer should stop owning reusable drag/nudge kernel code
- the adapter layer should own the shared point-like kernels directly
- routing context should stop carrying kernel functions around as baggage

### Step 2.1: Write down the exact current dependency direction and every place it appears

#### Problem Aspect

Before moving code, we need one exact list of:

- where the kernels live now
- where composer passes them into adapters
- where adapters expect them in `context`

If we skip this inventory, the extraction can look finished while hidden call sites still depend on the old injection path.

This step fixes that risk first.

#### Proposed Solution (Plain Language)

Document the current dependency direction in the plan and in the fine-grained progress report.

Make the current pattern explicit:

1. composer defines the kernels
2. composer passes the kernels into adapter context
3. adapters assert the kernels exist in that context

Do not change behavior in this step.

Just make the problem concrete and complete.

#### Code Evidence

Current kernel ownership:

- `src-js/views-editor/src/edit-behavior-composer.js`

Current exported kernels:

```js
export async function runPointLikeInputKernel(...) { ... }
export async function runPointLikeSessionKernel(...) { ... }
```

Current composer injection pattern:

```js
const adapterResult = await adapter({
  ..._context,
  runPointLikeInputKernel,
  runPointLikeSessionKernel,
});
```

Current adapter dependency pattern:

```js
const {
  runPointLikeInputKernel,
  runPointLikeSessionKernel,
} = context;

assert(
  typeof runPointLikeInputKernel === "function",
  "missing runPointLikeInputKernel"
);
```

#### Files To Touch

- `docs/refactor/plan-post-refactor-cleanup-optimization.md`
- `docs/refactor/progress-report.md`

#### Manual Tests

This is a documentation-only step, but still do a quick sanity pass:

1. Drag a regular point.
2. Drag a skeleton point.
3. Nudge a regular point.
4. Nudge an editable generated handle.
5. Undo and redo one of the above.

Expected result:

- behavior is unchanged
- no new runtime errors

---

### Step 2.2: Move the shared kernels into the adapters file without changing behavior

#### Problem Aspect

The main technical problem is ownership.

Right now the kernels are physically defined in composer, so even if their logic is generic, their location says they belong to composer.

That is the wrong message and the wrong dependency shape.

In our current structure, the cleanest place to move them is the adapter layer we already have.

This step fixes only that ownership problem.

#### Proposed Solution (Plain Language)

Move these reusable helpers out of composer and into the adapters file:

- `runPointLikeInputKernel`
- `runPointLikeSessionKernel`

Do not rewrite the logic yet.
Do not simplify arguments yet.
Do not change adapter behavior yet.

This step should be a pure relocation.

#### Proposed Solution (Code Sketch)

Composer should import the kernels from the adapters file:

```js
import {
  runPointLikeInputKernel,
  runPointLikeSessionKernel,
} from "./edit-behavior-adapters.js";
```

If Phase 0 has not renamed the file yet, the temporary path is:

```js
} from "./pointer-objects.js";
```

#### Files To Touch

- `src-js/views-editor/src/pointer-objects.js`
  - or, if Phase 0 is already complete, `src-js/views-editor/src/edit-behavior-adapters.js`
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

### Step 2.3: Stop passing kernel functions through composer context

#### Problem Aspect

Even after Step 2.2, the dependency is still backwards if composer keeps injecting the kernels into adapter context.

That would mean the code moved files, but the runtime relationship stayed awkward.

This step fixes that exact leftover dependency.

#### Proposed Solution (Plain Language)

Remove kernel injection from composer routing calls.

Composer should call adapters with routing context only.

That means:

- keep object-kind routing and modifier resolution in composer
- stop passing `runPointLikeInputKernel` through `_context`
- stop passing `runPointLikeSessionKernel` through `_context`

After this step, adapters must stop expecting these functions from composer.

#### Proposed Solution (Code Sketch)

Current pattern to remove:

```js
const adapterResult = await adapter({
  ..._context,
  runPointLikeInputKernel,
  runPointLikeSessionKernel,
});
```

Target pattern:

```js
const adapterResult = await adapter(_context);
```

Do the same for nudge routing.

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-composer.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

Test routes from multiple adapter families:

1. Drag regular point.
2. Drag skeleton off-curve point.
3. Drag rib point.
4. Drag editable generated handle.
5. Nudge regular point.
6. Nudge skeleton point.
7. Nudge rib point.
8. Nudge editable generated point.
9. Undo and redo one drag and one nudge.

Expected result:

- no route fails because kernels are no longer passed in context
- behavior remains the same

---

### Step 2.4: Update adapter code to use the locally owned kernels directly

#### Problem Aspect

Once composer stops injecting the kernels, adapter code must stop reading them from `context`.

Right now many adapter functions still do this:

- destructure the kernels from `context`
- assert that composer passed them in

That is now dead coupling.

This step removes that coupling.

#### Proposed Solution (Plain Language)

In adapter code:

- use the kernels directly from the same adapter module
- remove `context` destructuring for those kernel functions
- remove â€œmissing kernelâ€ assertions that only existed because of composer injection

Keep all object-kind-specific logic unchanged.

This step is about dependency cleanup, not behavior rewrite.

#### Proposed Solution (Code Sketch)

Remove patterns like:

```js
const { runPointLikeInputKernel, runPointLikeSessionKernel } = context;
```

And remove assertions like:

```js
assert(typeof runPointLikeInputKernel === "function");
```

#### Files To Touch

- `src-js/views-editor/src/pointer-objects.js`
  - or, if Phase 0 is already complete, `src-js/views-editor/src/edit-behavior-adapters.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

This step needs a wide pass because many adapter families touch the kernels:

1. Drag regular point.
2. Drag anchor.
3. Drag guideline.
4. Drag skeleton point.
5. Drag skeleton equalize handle.
6. Drag editable generated point.
7. Drag editable generated handle.
8. Nudge regular point.
9. Nudge skeleton point.
10. Nudge editable generated point.
11. Nudge editable generated handle.
12. Undo and redo one drag and one nudge.

Expected result:

- all adapter families still work
- no adapter crashes because of missing kernel functions in context

---

### Step 2.5: Make the adapter-owned kernel section obviously separate from composer routing

#### Problem Aspect

After extraction, the code can still be confusing if the moved kernel code still looks half-owned by composer.

We need the final module boundary to be obvious to the next person who reads it.

This step fixes the last ambiguity in this phase.

#### Proposed Solution (Plain Language)

Do one cleanup pass after the extraction:

- make sure the adapter-owned kernel section imports only what generic kernel logic actually needs
- make sure composer imports the kernels instead of defining them
- make sure adapter functions call the kernels locally instead of receiving them from context
- add a short comment explaining that this kernel section is shared point-like session infrastructure owned by the adapter layer, not composer logic

Also add a verification checklist to the fine-grained progress entry:

- composer no longer exports the kernels
- adapters no longer receive kernel functions through context
- the moved kernel section does not depend on routing maps or adapter maps

#### Code Evidence

Verification commands for the end of Phase 2:

```bash
rg -n "export async function runPointLikeInputKernel|export async function runPointLikeSessionKernel" src-js/views-editor/src
rg -n "runPointLikeInputKernel,|runPointLikeSessionKernel," src-js/views-editor/src/edit-behavior-composer.js
rg -n "const \\{[^}]*runPointLikeInputKernel|const \\{[^}]*runPointLikeSessionKernel" src-js/views-editor/src/pointer-objects.js
```

Expected direction after cleanup:

- the export definitions live in the adapter file only
- composer no longer injects kernels into adapter context
- adapters no longer pull kernels out of `context`

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-composer.js`
- `src-js/views-editor/src/pointer-objects.js`
  - or, if Phase 0 is already complete, `src-js/views-editor/src/edit-behavior-adapters.js`
- `docs/refactor/progress-report.md`

#### Manual Tests

Final Phase 2 manual check:

1. Drag regular point.
2. Drag skeleton point.
3. Drag rib point.
4. Drag editable generated point.
5. Drag editable generated handle.
6. Nudge regular point.
7. Nudge skeleton point.
8. Nudge editable generated handle.
9. Mixed selection drag.
10. Undo and redo one drag and one nudge.

Expected result:

- no behavior drift
- dependency direction is cleaner in code
- composer is simpler and more obviously orchestration-only

---

## Phase 3: Split The Adapters File Into Smaller Modules With Clear Ownership

### Broad Problem

The adapters file is too large and mixes too many jobs.

That makes cleanup risky and optimization harder than it needs to be.

It is hard to answer simple questions like these:

- where do regular point adapters live
- where do skeleton-only helpers live
- where do editable-generated helpers live
- where do legacy-only routes live
- which helpers are shared adapter infrastructure and which helpers belong to one object family

That confusion is not just cosmetic.

It means one file change can accidentally affect unrelated object kinds.

This phase will split the adapters layer into smaller pieces with clearer ownership.

Important constraint for this phase:

- do not create files just because the architecture diagram looks cleaner
- create the smallest number of files that gives each major adapter family a clear home
- keep one obvious public entry file for composer imports and routing maps

Expected direction:

- Phase 0 should first rename `src-js/views-editor/src/pointer-objects.js` to `src-js/views-editor/src/edit-behavior-adapters.js`
- this phase should then split that renamed adapters file carefully
- if one proposed split does not create a real ownership boundary, do not create that file

### Step 3.1: Map the current adapters file into real ownership blocks before moving code

#### Problem Aspect

Right now the file looks like one long stream of helpers and adapter entrypoints.

Before splitting it, we need one clear map of what is actually inside it.

If we skip this, the split will be based on guesswork.

That creates bad files like:

- one file for â€œmiscâ€
- one file for â€œshared stuffâ€
- one file that is still too big but with a new name

This step fixes that by identifying the real module boundaries first.

#### Proposed Solution (Plain Language)

Read through the adapters file and label each function as one of these kinds:

- shared adapter infrastructure
- regular point-like adapter logic
- skeleton-specific adapter logic
- editable-generated adapter logic
- mixed-selection / legacy adapter logic
- adapter maps and public exports

Do not move code yet.

Do not invent new files yet.

The goal is only to produce a concrete ownership map so later extraction steps stay honest.

This step must also answer one practical question:

- which file splits are necessary
- which file splits are only tidy-looking but not useful

#### Code Evidence

Current evidence inside the adapters file:

- `src-js/views-editor/src/pointer-objects.js`
  - adapter contract and generic helpers near the top
  - regular point-like orchestration around `runRegularPointLikeOrchestration(...)`
  - skeleton-specific orchestration and fixed-rib logic around `createSkeletonPointExecutors(...)`, `applyFixedRibDragToSkeletonData(...)`, `runSkeletonPointLikeCanonical(...)`, `runSkeletonHandlePointLikeCanonical(...)`
  - editable-generated logic around `runEditableGeneratedPointLikeCanonical(...)` and `runEditableGeneratedHandleLikeCanonical(...)`
  - mixed / legacy routes around `runMixedSelectionNudgeLegacy(...)`, `runMixedSelectionDragCanonical(...)`, `runTunniDragLegacy(...)`
  - adapter maps at the end:

```js
export const canonicalDragAdapters = { ... };
export const canonicalNudgeAdapters = { ... };
export const legacyDragAdapters = { ... };
export const legacyNudgeAdapters = { ... };
```

This step should turn that raw layout into an explicit ownership list.

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
- the ownership map is concrete enough to guide the extraction steps

---

### Step 3.2: Split out shared adapter infrastructure that is reused by multiple adapter families

#### Problem Aspect

Some code in the adapters file does not belong to one object family.

It is shared adapter infrastructure.

Examples:

- adapter result helpers
- behavior-name helpers
- selection filters
- shared point-like kernels moved in Phase 2
- generic persistence / orchestration helpers used by more than one family

If we do not split this shared layer first, later family-specific files will either:

- duplicate the same helpers
- or import each other in awkward circles

This step isolates the genuinely shared part first.

#### Proposed Solution (Plain Language)

Create one small shared adapter helper module for code that is reused across multiple adapter families.

Keep this module narrow.

It must not become a new junk drawer.

Only move code into it when all of these are true:

- the helper is used by more than one adapter family
- the helper is not really skeleton-only
- the helper is not really editable-generated-only
- the helper is not just a private detail of one route

Good candidates:

- result helpers
- behavior-name helpers
- selection filtering helpers
- point-like kernel helpers from Phase 2

Bad candidates:

- fixed-rib logic
- editable handle equalize math that only editable-generated routes use
- mixed-selection route logic

#### Proposed Solution (Code Sketch)

Possible target file:

```js
// src-js/views-editor/src/edit-behavior-adapter-shared.js
export function makeHandledAdapterResult(...) { ... }
export function makeUnhandledAdapterResult(...) { ... }
export function getBehaviorName(event) { ... }
export function filterSelectionByPrefixes(selection, prefixes) { ... }
export async function runPointLikeInputKernel(...) { ... }
export async function runPointLikeSessionKernel(...) { ... }
```

Then the public adapters file keeps ownership of the routing maps:

```js
import {
  runPointLikeInputKernel,
  runPointLikeSessionKernel,
} from "./edit-behavior-adapter-shared.js";
```

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
  - or, before the Phase 0 rename lands, `src-js/views-editor/src/pointer-objects.js`
- one new small shared adapter helper file if the inventory from Step 3.1 proves it is necessary
- `docs/refactor/progress-report.md`

#### Manual Tests

Test routes that rely on shared adapter infrastructure:

1. Drag a regular point.
2. Drag a skeleton point.
3. Drag an editable generated point.
4. Nudge a regular point.
5. Nudge a skeleton point.
6. Nudge an editable generated handle.
7. Undo and redo one drag and one nudge.

Expected result:

- behavior is unchanged
- no circular import problems
- shared helpers now have one obvious home

---

### Step 3.3: Split out the skeleton-specific adapter code into its own module

#### Problem Aspect

Skeleton adapter code is one of the biggest and most distinct clusters in the file.

It has its own concepts:

- skeleton data layers
- on-curve vs off-curve skeleton editing
- fixed rib behavior
- skeleton equalize behavior
- regeneration and persistence of skeleton contours

This is a real ownership boundary.

Keeping all of that inside the same file as regular-point and editable-generated routes makes the file harder to reason about.

This step isolates the skeleton-specific part.

#### Proposed Solution (Plain Language)

Create one skeleton adapter module and move only skeleton-owned code into it.

That module may include:

- skeleton helper functions
- skeleton drag/nudge canonical entrypoints
- skeleton rib routes if they are tightly coupled to skeleton data editing

Before moving any helper, ask:

- is this helper really skeleton-specific
- or is it pure math that belongs in core later under Phase 5

If the helper is skeleton-specific editor orchestration, keep it in the skeleton adapter module.

If it is pure skeleton math, note it for Phase 5 instead of baking more math into the editor split.

#### Code Evidence

Strong skeleton-owned candidates in the current adapters file:

```js
function createSkeletonPointExecutors(...) { ... }
function applyFixedRibDragToSkeletonData(...) { ... }
function createSkeletonLayersData(...) { ... }
function makeSkeletonLayerPersistenceChanges(...) { ... }
async function runSkeletonPointLikeCanonical(...) { ... }
async function runFixedRibSkeletonPointLikeCanonical(...) { ... }
async function runSkeletonHandlePointLikeCanonical(...) { ... }
async function runSkeletonRibPointDragCanonical(...) { ... }
async function runSkeletonRibPointNudgeCanonical(...) { ... }
```

Related imports already show the skeleton boundary clearly:

```js
import {
  getSkeletonData,
  regenerateSkeletonContours,
  setSkeletonData,
  calculateNormalAtSkeletonPoint,
  getPointHalfWidth,
} from "@fontra/core/skeleton-contour-generator.js";
```

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
  - or, before the Phase 0 rename lands, `src-js/views-editor/src/pointer-objects.js`
- one new skeleton adapter module
- `docs/refactor/progress-report.md`

#### Manual Tests

This step needs a skeleton-heavy parity pass:

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
- skeleton-only code now has one obvious home

---

### Step 3.4: Split out editable-generated adapter code into its own module

#### Problem Aspect

Editable-generated routes are also a distinct family.

They have their own concepts:

- generated points vs generated handles
- editable rib info lookup
- equalize state for generated handles
- generated-point persistence rules

This is not the same problem space as regular point-like editing.

This step isolates that family so it stops sharing a giant file with unrelated adapter logic.

#### Proposed Solution (Plain Language)

Create one editable-generated adapter module and move only editable-generated-owned code into it.

That module may include:

- generated-point selection collectors
- generated-handle equalize helpers
- generated-point canonical routes
- generated-handle canonical routes

Do not move generic point-like kernels here.

Do not move skeleton-only logic here.

The goal is simple:

- all editable-generated route logic should be readable in one place

#### Code Evidence

Strong editable-generated-owned candidates in the current adapters file:

```js
function readEditableHandleEqualizeState(...) { ... }
function applyEditableHandleEqualizedLength(...) { ... }
function collectEditableGeneratedPointsFromPointSelection(...) { ... }
function collectEditableGeneratedHandlesFromPointSelection(...) { ... }
async function runEditableGeneratedPointLikeCanonical(...) { ... }
async function runEditableGeneratedHandleLikeCanonical(...) { ... }
async function runEditableGeneratedPointDragCanonical(...) { ... }
async function runEditableGeneratedHandleDragCanonical(...) { ... }
async function runEditableGeneratedNudgeCanonical(...) { ... }
```

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
  - or, before the Phase 0 rename lands, `src-js/views-editor/src/pointer-objects.js`
- one new editable-generated adapter module
- `docs/refactor/progress-report.md`

#### Manual Tests

This step needs a generated-editing parity pass:

1. Drag an editable generated point.
2. Drag an editable generated handle.
3. Nudge an editable generated point.
4. Nudge an editable generated handle.
5. Use equalize-related generated-handle behavior if available.
6. Undo and redo one generated drag and one generated nudge.

Expected result:

- no behavior drift in editable-generated editing
- generated handle equalize behavior still works
- editable-generated code now has one obvious home

---

### Step 3.5: Leave the public adapters file as a small entry module and verify the final split

#### Problem Aspect

After splitting shared, skeleton, and editable-generated code, there is still a risk that the public adapters file becomes messy in a different way:

- too many exports
- unclear imports
- adapter maps mixed with private logic again
- legacy and mixed-selection routes scattered without a clear home

We need one final pass so the adapters layer ends with one obvious public entry file instead of several half-public files.

#### Proposed Solution (Plain Language)

Turn the public adapters file into a small entry module.

Its job should be narrow:

- import family-specific adapter entrypoints
- expose the canonical and legacy adapter maps
- keep only the smallest amount of glue code needed to assemble those maps

At the end of this step:

- composer should import one public adapters file
- the public adapters file should read like a routing surface, not like a 3,000-line implementation dump
- mixed-selection / legacy routes should either stay in the public file because they are small, or move to one clearly named legacy/mixed module if that is actually simpler

This step is also where we decide whether any proposed file is still unnecessary.

If one extracted file ended up tiny and not clearly owned, merge it back instead of keeping a bad split.

#### Proposed Solution (Code Sketch)

Target shape:

```js
// src-js/views-editor/src/edit-behavior-adapters.js
import { runRegularPointLikeCanonical, ... } from "./edit-behavior-adapters-regular.js";
import { runSkeletonPointLikeCanonical, ... } from "./edit-behavior-adapters-skeleton.js";
import { runEditableGeneratedPointDragCanonical, ... } from "./edit-behavior-adapters-generated.js";
import { runMixedSelectionDragCanonical, ... } from "./edit-behavior-adapters-legacy.js";

export const canonicalDragAdapters = { ... };
export const canonicalNudgeAdapters = { ... };
export const legacyDragAdapters = { ... };
export const legacyNudgeAdapters = { ... };
```

The important result is not the exact filenames.

The important result is:

- one public entry file
- family-owned implementation files
- no giant mixed dump file

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
  - or, before the Phase 0 rename lands, `src-js/views-editor/src/pointer-objects.js`
- extracted adapter family modules created earlier in this phase
- `src-js/views-editor/src/edit-behavior-composer.js`
  - only if import paths change because of the rename/split
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
- the number of new files is justified by real boundaries, not aesthetics

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

## Phase 5: Remove Duplicated Point-Like Orchestration And Move Pure Math To Core Or Shared Code

### Broad Problem

The adapters layer still contains too much repeated setup, persistence, and point-like orchestration logic.

Also, some skeleton-related math may belong in core or a small shared helper module instead of editor UI code.

This matters for two different reasons:

- repeated orchestration makes cleanup risky because the same fix has to be repeated in multiple route families
- pure math hidden inside editor files is harder to test, harder to reuse, and harder to optimize safely

These two problems are related, but they are not the same.

This phase must keep them separate on purpose.

Rule for this phase:

- if code is editor-only orchestration, keep it in the editor layer
- if code is pure skeleton math, explicitly check whether it belongs in `src-js/fontra-core/src/skeleton-contour-generator.js`
- if code is pure math but not skeleton-contour-generator math, consider one small shared math/helper module only if there is a real reuse case
- do not move UI state, event handling, or edit-session logic into core

Candidate places to review during this phase:

- `src-js/views-editor/src/edit-behavior-adapters.js`
  - or, before the Phase 0 rename lands, `src-js/views-editor/src/pointer-objects.js`
- `src-js/views-editor/src/edit-behavior.js`
- `src-js/fontra-core/src/skeleton-contour-generator.js`
- `src-js/views-editor/src/skeleton-tunni-calculations.js`

The goal of this phase is simple:

- remove repeated point-like orchestration where one shared editor-side path is enough
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

Create one concrete comparison list for the main point-like route families:

- regular point-like orchestration
- skeleton point-like orchestration
- editable-generated point-like orchestration
- editable-generated handle-like orchestration

For each family, list:

- what session setup it repeats
- what input/session kernel usage it repeats
- what persistence pattern it repeats
- what parts are truly family-specific and must stay separate

Do not extract code yet.

Do not move math yet.

The goal is only to separate true duplication from necessary specialization.

#### Code Evidence

Current repeated orchestration anchors:

```js
async function runRegularPointLikeOrchestration(...) { ... }
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

After the inventory, some orchestration will still be repeated for no good reason.

That repeated code is expensive:

- bug fixes must be copied into multiple flows
- optimization work becomes slower because there is no single place to improve
- later refactors are more likely to drift behavior between object families

This step fixes only the editor-side duplication that is genuinely shared.

#### Proposed Solution (Plain Language)

Extract one shared editor-side orchestration helper for the parts that are actually common across point-like routes.

That shared helper may own things like:

- common input validation for drag vs nudge entry
- common `runPointLikeSessionKernel(...)` setup
- common incremental change flow
- common rollback aggregation shape

Do not force family-specific behavior into the shared helper.

Keep family-specific logic as callbacks or small family-owned hooks.

Good shared target:

- a helper that reduces duplication while still reading clearly for regular, skeleton, and editable-generated routes

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
  - or, before the Phase 0 rename lands, `src-js/views-editor/src/pointer-objects.js`
- extracted adapter helper files if Phase 3 already split the adapters layer
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

### Step 5.3: Extract repeated skeleton persistence and regeneration patterns without moving them to core

#### Problem Aspect

Skeleton routes repeat a lot of persistence boilerplate:

- read skeleton data
- clone or reset working data
- regenerate contours
- persist path changes
- persist custom data changes

This repetition is not pure math.

It is editor-side persistence and orchestration.

That means it should be cleaned up, but it should not be pushed into core just because it is skeleton-related.

#### Proposed Solution (Plain Language)

Extract the repeated skeleton persistence pattern into shared editor-side helpers.

Good candidates:

- working contour reset helpers
- layer persistence helpers
- shared regeneration-and-persist blocks used by more than one skeleton route family

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
- `runEditableGeneratedPointLikeCanonical(...)`
- `runEditableGeneratedHandleLikeCanonical(...)`
- `runSkeletonRibPointNudgeCanonical(...)`
- `runMixedSelectionDragCanonical(...)`

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-adapters.js`
  - or, before the Phase 0 rename lands, `src-js/views-editor/src/pointer-objects.js`
- extracted skeleton-owned adapter/helper modules if Phase 3 already split them
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
- skeleton persistence logic is less duplicated
- core code does not gain editor transaction responsibilities

---

### Step 5.4: Identify the pure math helpers and move only the ones that truly belong in core or shared math

#### Problem Aspect

The adapters file currently contains a cluster of pure math and geometry helpers near the top.

Some of them may belong in core or a shared math helper.

Some of them may only look pure, but are actually coupled to editor-side route assumptions.

If we move the wrong helpers, we will create a worse boundary instead of a better one.

This step separates those cases carefully.

#### Proposed Solution (Plain Language)

Review each math helper and classify it as one of these:

- pure skeleton math that belongs in `src-js/fontra-core/src/skeleton-contour-generator.js`
- pure math that is reusable but not specifically skeleton-contour-generator logic
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

- `normalizeVectorSafe` and `rotateVector` are generic math candidates, but only move them if an existing shared math home is sensible
- `calculateHandleTensionsForSegment` and `computeHandleLengthsFromTensions` look like skeleton-geometry helpers and may belong with other skeleton contour math if they are not editor-route-specific
- `applyFixedRibDragToSkeletonData` sounds mathematical, but it also encodes edit intent and route behavior, so it may still belong in editor-side skeleton adapter code

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

- the main point-like route families share editor-side orchestration where it is genuinely common
- skeleton persistence helpers are shared inside the editor layer rather than copied across routes
- pure math moved only when its new home is clearly better
- `skeleton-contour-generator.js` did not become an editor behavior dumping ground
- any new shared helper file has a real reason to exist

Add grep-based checks to the progress entry for this step.

#### Code Evidence

Useful verification commands after Phase 5:

```bash
rg -n "runRegularPointLikeOrchestration|runSkeletonPointLikeOrchestration|runEditableGeneratedPointLikeCanonical|runEditableGeneratedHandleLikeCanonical" src-js/views-editor/src
rg -n "regenerateSkeletonContours\(|setSkeletonData\(" src-js/views-editor/src
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


