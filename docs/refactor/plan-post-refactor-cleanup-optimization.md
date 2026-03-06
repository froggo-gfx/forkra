# Post-Refactor Cleanup and Optimization Plan

Date: 2026-03-06
Status: Draft in progress
Source of truth: `docs/refactor/sot-unified-behavior.md`

## Temporary Reminder: Requirements For This Plan

This section is temporary. Keep it at the top while the plan is being written. Delete it only after the whole plan is finished.

This plan must follow these rules:

1. It must have exactly 5 phases.
2. The 5 phases must match the 5 broad code-quality / micro-architecture problems already identified:
   - fake or weak adapter contract
   - wrong dependency direction for shared drag/nudge kernels
   - adapters file is too large and mixed
   - canonical vs legacy boundaries are muddy
   - too much duplicated object-kind orchestration and pure math is not extracted enough
3. Each phase must explain the broader problem in plain language.
4. Each phase must be split into the smallest reasonable steps.
5. Each step must explain:
   - which small part of the broader problem it fixes
   - the proposed solution in plain language
   - the proposed solution with code evidence, code snippets, and file references
   - exactly what must be tested manually
6. Every step must be manually testable.
7. The writing must assume the reader is not clever:
   - short sentences
   - concrete wording
   - no hidden assumptions
   - explain why each step exists
8. Do not mix multiple changes into one step unless they are impossible to separate safely.
9. If a step touches skeleton math, explicitly check whether that code belongs in:
   - `src-js/views-editor/src/*`
   - or `src-js/fontra-core/src/skeleton-contour-generator.js`
   - or a new small shared math/helper module
10. The plan must prefer moving pure math out of editor UI files when that math can live in core/shared code safely.
11. The plan must keep manual parity as a hard requirement. Cleanup is not allowed to silently change behavior.
12. This plan must use a new fine-grained progress log:
   - broad historical progress stays in `docs/refactor/progress-report-broad.md`
   - every step in this plan must add an entry to `docs/refactor/progress-report.md`
13. A step is not complete until its matching fine-grained entry is added to `docs/refactor/progress-report.md`.

## Summary

The broad unified-behavior architecture is already in place.

This new plan is not about big architectural direction anymore.

This plan is about making the code easier to trust, easier to change, and easier to optimize without breaking behavior.

The work is split into 5 phases:

1. Make the adapter contract real and useful.
2. Move shared drag/nudge session kernels out of composer.
3. Split the adapters file into smaller modules with clear ownership.
4. Clean up canonical vs legacy naming and routing boundaries.
5. Remove duplicated point-like orchestration and move pure math to core/shared code where appropriate.

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

If we skip this, later steps will drift because one person will think the problem is “null values”, another person will think the problem is “shape checks”, and another person will think the problem is “composer not using results”.

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

### Step 1.2: Replace the fake “shape-only” adapter result with a truthful handled result type

#### Problem Aspect

The code currently allows this:

```js
return { forward: null, rollback: null };
```

That is the core lie in the current contract.

It says “this adapter has meaningful change payloads”, but the payloads are empty.

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

This step removes the last “default success” behavior.

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
Shared drag/nudge kernels should live in a neutral shared module.

Phase 2 will fix that dependency direction.

The goal of this phase is simple:

- composer should stop owning reusable drag/nudge kernel code
- adapters should import shared kernels directly from a neutral place
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

### Step 2.2: Create a neutral shared kernel module and move the kernel code there without changing behavior

#### Problem Aspect

The main technical problem is module ownership.

Right now the kernels are physically defined in composer, so even if their logic is generic, their location says they belong to composer.

That is the wrong message and the wrong dependency shape.

This step fixes only that ownership problem.

#### Proposed Solution (Plain Language)

Create a new small shared module for the reusable drag/nudge kernels.

Move only these generic helpers into it:

- `runPointLikeInputKernel`
- `runPointLikeSessionKernel`

Do not rewrite the logic yet.
Do not simplify arguments yet.
Do not change adapter behavior yet.

This step should be a pure relocation.

#### Proposed Solution (Code Sketch)

New file example:

```js
// src-js/views-editor/src/edit-behavior-session-kernel.js
export async function runPointLikeInputKernel(...) { ... }
export async function runPointLikeSessionKernel(...) { ... }
```

Then composer should import them:

```js
import {
  runPointLikeInputKernel,
  runPointLikeSessionKernel,
} from "./edit-behavior-session-kernel.js";
```

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-session-kernel.js` (new file)
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

### Step 2.4: Update adapters to import the kernels directly from the new shared module

#### Problem Aspect

Once composer stops injecting the kernels, adapters must stop reading them from `context`.

Right now many adapter functions still do this:

- destructure the kernels from `context`
- assert that composer passed them in

That is now dead coupling.

This step removes that coupling.

#### Proposed Solution (Plain Language)

In adapter code:

- import the kernels directly from the new shared module
- remove `context` destructuring for those kernel functions
- remove “missing kernel” assertions that only existed because of composer injection

Keep all object-kind-specific logic unchanged.

This step is about dependency cleanup, not behavior rewrite.

#### Proposed Solution (Code Sketch)

In `src-js/views-editor/src/pointer-objects.js`:

```js
import {
  runPointLikeInputKernel,
  runPointLikeSessionKernel,
} from "./edit-behavior-session-kernel.js";
```

Then remove patterns like:

```js
const { runPointLikeInputKernel, runPointLikeSessionKernel } = context;
```

And remove assertions like:

```js
assert(typeof runPointLikeInputKernel === "function");
```

#### Files To Touch

- `src-js/views-editor/src/pointer-objects.js`
- `src-js/views-editor/src/edit-behavior-session-kernel.js`
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

### Step 2.5: Make the new kernel module obviously neutral and independent of composer routing

#### Problem Aspect

After extraction, the code can still be confusing if the new module looks half-owned by composer.

We need the final module boundary to be obvious to the next person who reads it.

This step fixes the last ambiguity in this phase.

#### Proposed Solution (Plain Language)

Do one cleanup pass after the extraction:

- make sure the new kernel module imports only what generic kernel logic actually needs
- make sure composer only imports the kernels, not defines them
- make sure adapters import the kernels directly
- add a short module comment explaining that this is shared drag/nudge session infrastructure, not composer logic

Also add a verification checklist to the fine-grained progress entry:

- composer no longer exports the kernels
- adapters no longer receive kernel functions through context
- the shared kernel module does not import routing maps or adapter maps

#### Code Evidence

Verification commands for the end of Phase 2:

```bash
rg -n "export async function runPointLikeInputKernel|export async function runPointLikeSessionKernel" src-js/views-editor/src
rg -n "runPointLikeInputKernel,|runPointLikeSessionKernel," src-js/views-editor/src/edit-behavior-composer.js
rg -n "const \\{[^}]*runPointLikeInputKernel|const \\{[^}]*runPointLikeSessionKernel" src-js/views-editor/src/pointer-objects.js
```

Expected direction after cleanup:

- the export definitions live in the new shared module only
- composer no longer injects kernels into adapter context
- adapters no longer pull kernels out of `context`

#### Files To Touch

- `src-js/views-editor/src/edit-behavior-session-kernel.js`
- `src-js/views-editor/src/edit-behavior-composer.js`
- `src-js/views-editor/src/pointer-objects.js`
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

`src-js/views-editor/src/pointer-objects.js` is too large and mixes too many jobs.

That makes cleanup risky and optimization harder than it needs to be.

Phase 3 will split the file into smaller modules without changing behavior.

Steps: to be written later.

---

## Phase 4: Clean Up Canonical Vs Legacy Naming And Routing Boundaries

### Broad Problem

Some code is called “legacy” even when it now runs canonical logic.

That makes the code harder to read because names no longer describe reality.

Phase 4 will make routing names and module boundaries honest.

Steps: to be written later.

---

## Phase 5: Remove Duplicated Point-Like Orchestration And Move Pure Math To Core Or Shared Code

### Broad Problem

The adapters layer still contains too much repeated setup/persist/orchestration logic.

Also, some skeleton-related math may belong in core or a shared helper module instead of editor UI code.

This is especially important for anything that is pure math and does not depend on pointer UI state.

Candidate places to review during this phase:

- `src-js/views-editor/src/pointer-objects.js`
- `src-js/views-editor/src/edit-behavior.js`
- `src-js/fontra-core/src/skeleton-contour-generator.js`

Rule for this phase:

- if code is pure skeleton math, check whether it belongs in core
- if code is editor-only orchestration, keep it out of core

Phase 5 will separate those two things carefully.

Steps: to be written later.
