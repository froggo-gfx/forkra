# Cleanup and Optimization Progress Report

Date: 2026-03-06
Status: Phase 1 completed; Phase 1.5 completed; later phases not started
Source of truth: `docs/refactor/plan-post-refactor-cleanup-optimization.md`

## How To Use This File

This file is for the fine-grained cleanup and optimization plan only.

Do not put broad refactor history here.

That older broad history lives in:

- `docs/refactor/progress-report-broad.md`

Every completed step from the cleanup/optimization plan must add one entry here.

## Required Entry Format

Use this exact structure for every step:

### Phase X - Step Y: Step name

- Problem:
- Code analysis:
- Comparison:
- Manual test results:
- Undo/redo verification:

## Entries

### Phase 0 - Step P0.1: Define the naming rules for the refactor code before renaming anything

- Problem: The refactor code still used transitional names that described where code came from instead of what role it now has. The main lie was `pointer-objects.js`, which had become the adapter layer but still read like a pointer helper file.
- Code analysis: The live codebase showed only one adapter file import site in `src-js/views-editor/src/edit-behavior-composer.js`, one registry comment reference in `src-js/views-editor/src/edit-behavior-registry.js`, and no remaining code-level references after the rename sweep. The naming decision applied in code was: keep `behavior` for the rule engine, keep `composer` for orchestration, keep `registry` for declarative routing, and rename `pointer-objects.js` to `edit-behavior-adapters.js` because the file is the adapter layer.
- Comparison: Yes. `src-js/views-editor/src/pointer-objects.js` was renamed to `src-js/views-editor/src/edit-behavior-adapters.js`, and the code imports/comments were updated to match the final role name.
- Manual test results: Not run in UI during this code pass. Automated verification for the rename/import update passed via `node --check` on the touched files and `npm run -s bundle`.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 0 - Step P0.2: Run a code-only beautify sweep on the refactor implementation files without changing behavior

- Problem: The refactor files still had small readability scars that made later cleanup work harder, including stale wording like "During migration" and mis-indented helper code at the top of `edit-behavior.js`.
- Code analysis: The sweep stayed intentionally small and code-only. In `src-js/views-editor/src/edit-behavior.js`, the magnetic snap helper indentation was normalized and the old matcher spillover was pulled back into the file so the rule-engine internals sit together. In `src-js/views-editor/src/edit-behavior-adapters.js`, the contract comment was updated to describe the current state truthfully instead of framing the file as a temporary migration wrapper.
- Comparison: Yes. This was a presentation/locality cleanup only. No routing ownership, adapter contract semantics, or kernel ownership were changed in this step.
- Manual test results: Not run in UI during this code pass. Automated verification passed via `node --check src-js/views-editor/src/edit-behavior.js`, `node --check src-js/views-editor/src/edit-behavior-composer.js`, `node --check src-js/views-editor/src/edit-behavior-registry.js`, `node --check src-js/views-editor/src/edit-behavior-adapters.js`, and `npm run -s bundle`.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 0 - Step P0.3: Merge `edit-behavior-support.js` into `edit-behavior.js` before deeper cleanup starts

- Problem: `src-js/views-editor/src/edit-behavior-support.js` was a false boundary. Its contents were internal matcher constants and helper functions used by `edit-behavior.js`, but the extra file made that implementation detail look like a separate subsystem.
- Code analysis: The matcher constants (`ANY`, `NIL`, `OFF`, `SEL`, `SHA`, `SMO`, `UNS`) and point-match helpers (`buildPointMatchTree`, `findPointMatch`, and their private helpers) were moved into `src-js/views-editor/src/edit-behavior.js`. The import from `./edit-behavior-support.js` was removed, and `src-js/views-editor/src/edit-behavior-support.js` was deleted. The merged code keeps the matcher logic next to the rule tables and their consumers.
- Comparison: Yes. The false support split is gone. `edit-behavior.js` now owns its own rule-engine internals directly, and `edit-behavior-support.js` no longer exists.
- Manual test results: Not run in UI during this code pass. Automated verification passed via `node --check src-js/views-editor/src/edit-behavior.js` and `npm run -s bundle`.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 1 - Step 1.1: Write down the exact mismatch between the promised contract and the real contract

- Problem: The adapter contract looked stricter than it really was. The code said handled adapters return `{ forward, rollback }`, but many handled routes still return placeholder null payloads, composer only used the return value as handled/unhandled signaling, and the payload channel itself was not real.
- Code analysis: I rewrote the truth note so it points to the new cleanup direction instead of the old wrapper-preserving one. In `src-js/views-editor/src/edit-behavior-adapters.js`, the top-level adapter/composer contract note says the payload is not real data and that the cleanup target is boolean handled/unhandled. In `src-js/views-editor/src/edit-behavior-composer.js`, both drag and nudge routing paths now say explicitly that `false` means unhandled, `{ forward, rollback }` currently only means handled, and composer does not consume payload data.
- Comparison: Yes. This step changed wording only. It did not change routing, adapter behavior, persistence, or return shapes.
- Manual test results: Not run in UI during this code pass. Automated verification passed via `node --check src-js/views-editor/src/edit-behavior-adapters.js` and `node --check src-js/views-editor/src/edit-behavior-composer.js`.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 1 - Step 1.2: Remove the fake payload contract and reduce adapter returns to boolean handled/unhandled

- Problem: The adapter layer was still exchanging a fake object shape even though composer did not consume payload data at all. That made the contract look richer than it really was and encouraged placeholder returns.
- Code analysis: I removed the fake payload helper and the formal object contract from `src-js/views-editor/src/edit-behavior-adapters.js`. Adapter-facing routes and the internal regular-point helper now return plain booleans instead of `makeAdapterResult()`. Successful route completions now return `true`, while missing prerequisites and route-specific rejections now return `false`.
- Comparison: Yes. This changed the adapter/composer contract from fake object payloads to real boolean handled/unhandled signaling. Undo/redo payload construction inside adapter-owned edit sessions was left intact.
- Manual test results: Not run in UI during this code pass. Automated verification passed via `node --check src-js/views-editor/src/edit-behavior-adapters.js` and `npm run -s bundle`.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 1 - Step 1.3: Simplify composer so it accepts only boolean adapter results

- Problem: Composer still treated adapter returns as a shape-checking formality. Even if adapters were cleaned up, composer would still be validating fake payload fields that no longer mattered.
- Code analysis: In `src-js/views-editor/src/edit-behavior-composer.js`, drag and nudge orchestration now await a boolean `handled` value, assert that it is boolean, and return it directly. The old `"forward" in adapterResult` / `"rollback" in adapterResult` checks are gone.
- Comparison: Yes. Composer now relies only on the one thing it truly needs from adapters: handled or unhandled.
- Manual test results: Not run in UI during this code pass. Automated verification passed via `node --check src-js/views-editor/src/edit-behavior-composer.js` and `npm run -s bundle`.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 1 - Step 1.4: Remove the last placeholder adapter returns and make every adapter choose true or false on purpose

- Problem: After collapsing the contract, the remaining risk was lazy adapter code that still behaved like a default-success wrapper instead of making explicit route decisions.
- Code analysis: I did a route pass in `src-js/views-editor/src/edit-behavior-adapters.js` and converted the remaining placeholder return sites. Success-path completions such as regular drag/nudge, skeleton drag/nudge, rib drag/nudge, editable-generated point/handle routes, mixed-selection routes, and Tunni routes now return `true`. Missing targets, missing skeleton reference data, empty editable target sets, and route-specific eligibility failures now return `false`.
- Comparison: Yes. The adapter layer now chooses `true` or `false` deliberately instead of reporting fake handled objects.
- Manual test results: Not run in UI during this code pass. Automated verification passed via `node --check src-js/views-editor/src/edit-behavior-adapters.js`, `node --check src-js/views-editor/src/edit-behavior-composer.js`, `node --check src-js/views-editor/src/edit-behavior-registry.js`, and `npm run -s bundle`.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 1 - Step 1.5: Add a simple verification checklist for the new boolean-only contract

- Problem: Without a cheap verification pass, later cleanup work could silently reintroduce fake payload wrappers or shape-checking assertions.
- Code analysis: The plan already carried the new checklist, and I ran the code-level checks against the implementation. `Select-String` found no remaining `makeAdapterResult(`, no `handledResultShape`, and no composer assertions for `forward` / `rollback` payload fields in `src-js/views-editor/src/*.js`. Composer now asserts `boolean handled/unhandled`, and the bundle build still succeeds.
- Comparison: Yes. The verification checklist now matches the boolean-only contract and the current code passes it.
- Manual test results: Not run in UI during this code pass. Automated verification passed via `Select-String` cleanup checks, `node --check` on the touched JS files, and `npm run -s bundle` with the same existing webpack size warnings.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 1.5 - Step 1.5.1: Inventory the current mixed-selection routing and write down the exact gaps

- Problem: Mixed point-like selection was assumed to be broadly unified, but manual testing exposed that editable-generated combinations do not move together with regular or skeleton selections. Before changing routing, the real gap had to be written down exactly.
- Code analysis: The drag path in `src-js/views-editor/src/edit-tools-pointer.js` still short-circuits to `editableGeneratedPoint` and `editableGeneratedHandle` before `mixedSelection` is considered when there is no skeleton selection. The nudge path in the same file only treats `regular + skeleton` as mixed and otherwise falls through to pure editable-generated routes. On the adapter side, `src-js/views-editor/src/edit-behavior-adapters.js` routes `mixedSelection` to `runMixedSelectionDragCanonical(...)` and `runMixedSelectionNudgeLegacy(...)`, but those functions currently implement regular-path plus skeleton behavior only and do not natively include editable-generated points or editable-generated handles.
- Comparison: Yes. The inventory shows one structural gap instead of three unrelated bugs. `regular + skeleton` has a real mixed route today, while any combination involving editable-generated content is either intercepted too early or sent to a mixed adapter that does not know how to move that content.
- Manual test results: Reproduced from UI testing: editable-generated off-curve plus regular point moved only the editable-generated point; editable-generated off-curve plus skeleton on-curve moved only the skeleton point; editable-generated off-curve plus regular off-curve again moved only the editable-generated point. This step was documentation only; no code behavior changed yet.
- Undo/redo verification: Not run for this inventory step because no code changed.

### Phase 1.5 - Step 1.5.2: Create one explicit mixed point-like classifier in pointer for drag and nudge

- Problem: Pointer had separate hand-written routing branches for drag and nudge, and both encoded mixed selection too narrowly. That made editable-generated content a side case instead of a first-class input family.
- Code analysis: In `src-js/views-editor/src/edit-tools-pointer.js`, I added `_classifyPointLikeSelection(...)` so drag and nudge both derive `objectKind`, editable-generated point/handle subsets, and mixed/skeleton/rib flags from one shared classifier. `handleArrowKeys()` and `handleDragSelection()` now both use that helper. Component routing was intentionally left on its previous branch so this step only changed point-like selection routing.
- Comparison: Yes. Pointer no longer decides mixed point-like routing through two separate piles of special cases. The shared classifier now owns that decision, and the same editable-generated subsets are forwarded into routing for both drag and nudge.
- Manual test results: Not run in UI during this code pass. Automated verification passed via `node --check src-js/views-editor/src/edit-tools-pointer.js` and `npm run -s bundle`.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 1.5 - Step 1.5.3: Expand mixed drag handling so editable-generated content participates natively

- Problem: Even with pointer-side mixed classification fixed, drag would still be wrong if the mixed adapter only knew about regular and skeleton content. Editable-generated points and handles had to join the same drag session without being flattened into regular behavior.
- Code analysis: In `src-js/views-editor/src/edit-behavior-adapters.js`, I added shared mixed-edit helpers to build one skeleton-backed working state for skeleton points, editable-generated points, and editable-generated handles together. `runMixedSelectionDragCanonical(...)` now filters generated point indices out of the regular selection before constructing `EditBehaviorFactory`, skips regular equalize handling for generated points, and applies regular edits plus skeleton-backed generated edits in the same drag loop. The mixed drag route now receives `editablePoints` and `editableHandles` from pointer and uses them natively instead of dropping them.
- Comparison: Yes. Mixed drag is no longer limited to regular plus skeleton. Editable-generated content now has an explicit path inside the mixed drag adapter, and plain-regular edits no longer steal generated points by treating them as normal path points.
- Manual test results: Not run in UI during this code pass. Automated verification passed via `node --check src-js/views-editor/src/edit-behavior-adapters.js`, `node --check src-js/views-editor/src/edit-tools-pointer.js`, and `npm run -s bundle`.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 1.5 - Step 1.5.4: Expand mixed nudge handling with the same native-mix rule

- Problem: Drag and nudge could not keep different meanings for mixed selection. If only drag was fixed, editable-generated mixed selections would still be routed inconsistently and remain unreliable for keyboard editing.
- Code analysis: `runMixedSelectionNudgeLegacy(...)` in `src-js/views-editor/src/edit-behavior-adapters.js` now mirrors the drag-side structure. It resolves editable-generated points and handles, filters them out of the plain regular selection, applies regular nudge behavior only to the remaining plain-regular selection, and applies skeleton-backed generated/skeleton changes through the same shared mixed-edit helper. The pointer-side temporary safety gates were then removed from `src-js/views-editor/src/edit-tools-pointer.js`, so mixed editable-generated selections now route into `mixedSelection` instead of being forced back into pure handlers.
- Comparison: Yes. Drag and nudge now share the same mixed point-like selection model, and editable-generated content is no longer routed as an exception once mixed selection is detected.
- Manual test results: Not run in UI during this code pass. Automated verification passed via `node --check src-js/views-editor/src/edit-behavior-adapters.js`, `node --check src-js/views-editor/src/edit-tools-pointer.js`, `node --check src-js/views-editor/src/edit-behavior-composer.js`, and `npm run -s bundle` with the same existing webpack size warnings.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 1.5 - Step 1.5.5: Run the full mixed-selection matrix and record Phase 1.5 before moving to Phase 2

- Problem: The mixed-selection refactor was not trustworthy until the editable-generated combinations were checked in the UI instead of only compiling and bundling cleanly.
- Code analysis: The code side for Phase 1.5 was already in place across `src-js/views-editor/src/edit-tools-pointer.js` and `src-js/views-editor/src/edit-behavior-adapters.js`. This closing step was about confirming that the widened mixed-selection classifier and the new mixed adapter execution paths behave correctly in the editor.
- Comparison: Yes. The reported broken combinations now behave as intended, and the mixed-selection pipeline is aligned with the `native mix` decision from the plan.
- Manual test results: Passed. The mixed-selection matrix was checked in the editor and everything passes, including the originally broken editable-generated combinations with regular points, regular off-curves, and skeleton on-curves.
- Undo/redo verification: Passed. Undo and redo also pass for the mixed-selection behavior after the Phase 1.5 changes.
