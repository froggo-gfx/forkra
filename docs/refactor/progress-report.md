# Cleanup and Optimization Progress Report

Date: 2026-03-06
Status: Phase 1 completed; Phase 1.5 not started; later phases not started
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
