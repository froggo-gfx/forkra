# Cleanup and Optimization Progress Report

Date: 2026-03-06
Status: Phase 0 completed; later phases not started
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
