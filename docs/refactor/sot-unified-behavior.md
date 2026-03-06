# Single Source of Truth: Post-Refactor Cleanup and Optimization

Date: 2026-03-06
Status: Cleanup chapter complete; Phase 6 optional

## Intro (Context for New Sessions)

The broad unified-behavior refactor is done.

That work is no longer the active problem.

We already achieved the big architectural goal:

- one behavior pipeline for in-scope point-like drag/nudge edits
- pointer is transport-only for in-scope drag/nudge
- composer is orchestration-only for routing
- adapters own translation and persistence

That broad work is recorded in:

- `docs/refactor/progress-report-broad.md`

What we are doing now is different.

We are not trying to re-decide the architecture.
We are cleaning it up so the code is easier to trust, easier to change, and easier to optimize without breaking behavior.

This SoT exists to prevent a new kind of scope drift:

- do not reopen the finished broad refactor unless a real bug forces it
- do not confuse cleanup with behavior redesign
- do not optimize by making boundaries less clear

## Files To Read At The Start Of Any Session

- `docs/refactor/sot-unified-behavior.md`
- `docs/refactor/plan-post-refactor-cleanup-optimization.md`
- `docs/refactor/progress-report-broad.md`
- `docs/refactor/progress-report.md`
- `docs/refactor/target-architecture.md`

Optional support docs when needed:

- `docs/refactor/action-object-matrix.md`
- `docs/refactor/object-kind-inventory.md`

## 1. Current Intent (Primary Goal)

The primary goal is now:

Improve the code quality of the finished unified-behavior pipeline without changing its intended behavior.

In plain language:

- keep the broad architecture
- make the fine details honest
- reduce duplication
- improve module boundaries
- move pure math to the right place when safe
- prepare the codebase for real optimization work

## 2. What Is Already Considered Finished

These broad statements are considered true unless a bug proves otherwise:

- in-scope point-like drag/nudge behavior is unified under one routing pipeline
- pointer is no longer the owner of in-scope drag/nudge persistence
- composer is no longer the owner of drag/nudge persistence
- adapters are the owner of translation and persistence for in-scope drag/nudge
- parity for the broad refactor was accepted and recorded

This means:

- do not write a new plan that repeats the old broad migration
- do not put new fine-grained cleanup work into `progress-report-broad.md`

## 3. Non-Negotiables For The Current Cleanup Phase

These rules stay in force:

- Do not reintroduce pointer-owned drag/nudge persistence for in-scope object kinds.
- Do not reintroduce parallel behavior engines for in-scope point-like edits.
- Do not move object-kind routing logic back into pointer by accident.
- Do not optimize by hiding responsibilities.
- Do not move editor-only orchestration into core code.
- Do move pure math or pure skeleton computation out of UI-heavy files when that move is safe and improves boundaries.
- Every cleanup step must preserve user-visible behavior unless the step is explicitly a bug fix.
- Every cleanup step must be manually testable.

## 4. Current Problem Areas

The broad architecture is in place, but the micro-architecture still has 7 active problems:

1. The adapter contract is weak.
   - The code says adapters return meaningful `{ forward, rollback }` data.
   - In practice, many routes still return placeholder shapes.
   - Composer mainly uses the result as a handled/unhandled signal.
   - The real undo/redo data already lives inside adapter-owned edit sessions.

2. Mixed point-like selection routing is incomplete.
   - `mixedSelection` is currently trustworthy mainly for `regular + skeleton`.
   - Editable-generated content can still be routed too early into pure handlers.
   - Mixed drag/nudge must treat editable-generated content as a first-class participant, not a side case.

3. Shared drag/nudge kernels live in the wrong module.
   - Composer currently owns shared input/session helpers that adapters depend on.
   - That dependency direction is backwards.
   - The current kernel API also carries extra generality and composer-injection ceremony that should be removed while moving ownership.

4. The adapters module is too large.
   - `src-js/views-editor/src/edit-behavior-adapters.js` mixes too many responsibilities.
   - This makes cleanup and optimization harder than necessary.

5. Canonical vs legacy boundaries are not named honestly enough.
   - Some code is still labeled `legacy` even when it now runs canonical behavior.
   - That makes the code harder to read and reason about.

6. Too much point-like orchestration and math is duplicated.
   - Similar setup/persist flows appear across object kinds.
   - Some pure skeleton math may belong in core/shared code instead of editor files.

7. Optional follow-up: the registry representation is still too indirect.
   - Routing is encoded through row ids and short codes instead of readable preset names.
   - The registry stays worth keeping, but the current representation is too expensive for humans.

## 5. Allowed Kinds Of Change

These are the kinds of changes this SoT allows:

- clarify contracts
- move shared helpers to a better module
- reorganize oversized files in place when possible
- rename modules/functions/maps so names match reality
- extract duplicated orchestration helpers
- extract pure math into core/shared code when appropriate
- optionally rework registry representation while keeping routing separate from behavior and adapters
- fix mixed point-like selection classification/execution gaps without redesigning the pipeline
- add better verification/reporting for small cleanup steps

These are not the kinds of changes this SoT is asking for:

- new user-facing editing behaviors
- new object kinds
- new workflow design for Tunni or other deferred tools
- silent parity changes justified as optimization

## 6. Boundary Rules By File

### `src-js/views-editor/src/edit-tools-pointer.js`

Pointer is still the transport/routing layer for in-scope drag/nudge.

Allowed work here:

- hit testing
- selection analysis
- routing context construction
- hover/cursor state
- out-of-scope tool workflows

Disallowed regression:

- reintroducing in-scope drag/nudge persistence or behavior math

### `src-js/views-editor/src/edit-behavior-composer.js`

Composer is still orchestration-only.

Allowed work here:

- routing
- adapter dispatch
- shared orchestration that truly belongs above adapters

Disallowed regression:

- persistence ownership
- object-kind-specific behavior implementation

### `src-js/views-editor/src/edit-behavior-adapters.js`

This is still the adapter layer today, and current cleanup should stay inside this file unless a future step proves a new file is truly necessary.

Allowed work here:

- translation from shared behavior output to object-specific canonical data
- persistence for adapter-owned routes
- boolean handled/unhandled returns for composer
- reordering, regrouping, and relabeling internal sections so ownership is clearer
- small local helper cleanup when it removes obvious repetition or fixes obviously wrong helper placement inside the same file

Expected future direction:

- one cleaner in-file layout with explicit sections for shared infrastructure, regular routes, skeleton-owned routes, editable-generated routes, mixed/legacy routes, and public adapter maps

Disallowed drift here:

- creating new adapter files just because the code would look tidier on paper
- broad orchestration deduplication that belongs in Phase 5
- math extraction to core/shared code during Phase 3

### `src-js/views-editor/src/edit-behavior.js`

This remains the shared behavior/math area for editor-side point-like behavior.

Allowed work here:

- shared behavior helpers
- shared geometry helpers used by multiple adapter families
- merging the contents of `edit-behavior-support.js` back in so the rule-engine internals live in one file

### `src-js/views-editor/src/edit-behavior-support.js`

This is currently a temporary spillover file, not a separate subsystem.

Decisive direction:

- move its contents into `src-js/views-editor/src/edit-behavior.js`
- remove this file after the merge

Allowed work here:

- move matcher constants and helper functions into `edit-behavior.js`
- delete the file once imports are updated

Disallowed regression:

- preserving it as a vague long-term `support` bucket

### `src-js/fontra-core/src/skeleton-contour-generator.js`

This is a core candidate for pure skeleton computation.

When reviewing code, ask:

- Is this pure skeleton math?
- Does it avoid editor UI state?
- Does it operate on canonical skeleton data cleanly?

If yes, it may belong here or in a nearby core/shared module instead of inside editor adapter code.

If no, keep it out of core.

## 7. Plan And Reporting Rules

The active plan is:

- `docs/refactor/plan-post-refactor-cleanup-optimization.md`

Progress is split into two files on purpose:

- `docs/refactor/progress-report-broad.md`
  - completed broad architectural milestones
- `docs/refactor/progress-report.md`
  - fine-grained cleanup/optimization work from the new plan

Hard rule:

- a cleanup step from the new plan is not complete until it is written to `docs/refactor/progress-report.md`

## 8. Acceptance Criteria For The Current Stage

This cleanup/optimization stage is complete only when all of these are true:

- adapter/composer routing contract is reduced to truthful boolean handled/unhandled
- mixed point-like selections, including editable-generated combinations, route and undo correctly
- shared drag/nudge kernels live in the adapter layer, not in composer, and the kernel API is simplified to the useful adapter-owned surface
- the adapter layer has a clearer in-file ownership layout without unnecessary new files
- naming reflects reality for canonical vs legacy paths
- duplicated session-entry scaffolding is reduced
- duplicated skeleton-backed layer lifecycle is reduced
- pure math is moved to existing better homes only where appropriate, and only where appropriate
- no broad behavior regressions are introduced
- each fine-grained step has manual test coverage recorded in `docs/refactor/progress-report.md`

Registry readability remains a valid optional follow-up, but it is no longer required to close this cleanup chapter.

## 9. Working Rule For Future Sessions

When in doubt:

1. Prefer smaller cleanup steps over large rewrites.
2. Preserve behavior first.
3. Improve naming and boundaries before attempting low-level optimization.
4. Extract pure math only when the boundary is truly clean, and prefer existing homes before inventing new ones.
5. Record each finished step in the fine-grained progress report.
