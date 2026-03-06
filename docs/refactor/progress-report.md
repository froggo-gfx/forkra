# Cleanup and Optimization Progress Report

Date: 2026-03-06
Status: Phase 1 completed; Phase 1.5 completed; Phase 2 completed; Phase 3 completed; later phases not started
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

### Phase 2 - Step 2.1: Write down the real current kernel shape and the real consumer categories

- Problem: The old Phase 2 framing treated the kernels as a single clean shared execution model that only needed to be moved out of composer. The actual codebase is messier than that: there are two helpers with different responsibilities, some routes use both, some use only one, and some do not fit the kernel at all.
- Code analysis: `src-js/views-editor/src/edit-behavior-composer.js` currently defines `runPointLikeInputKernel(...)` and `runPointLikeSessionKernel(...)`. The input kernel normalizes drag or nudge input, while the session kernel wraps `sceneController.editGlyph(...)` and threads `sessionState`, `glyph`, and `sendIncrementalChange` through callbacks. In `src-js/views-editor/src/edit-behavior-adapters.js`, the full pair is used by regular point-like orchestration, skeleton point orchestration, skeleton handle orchestration, editable-generated point orchestration, and editable-generated handle orchestration. Input-only use remains in regular equalize nudge and skeleton rib nudge. Mixed routes and legacy/Tunni routes do not use the kernel pair as their main execution model.
- Comparison: Yes. The plan now describes the real split: `input normalization` and `session lifecycle` are separate concerns, `input-only` consumers are valid, and Phase 2 needs move-plus-simplification instead of pure relocation.
- Manual test results: Not run in UI during this documentation step. No runtime code changed.
- Undo/redo verification: Not run during this documentation step because no runtime code changed.

### Phase 2 - Step 2.2: Move the two kernel helpers into the adapters layer without creating a new file

- Problem: The kernels were still physically defined in `src-js/views-editor/src/edit-behavior-composer.js`, which kept the dependency direction backwards even though the real consumers live on the adapter side.
- Code analysis: I moved `runPointLikeInputKernel(...)` and `runPointLikeSessionKernel(...)` into `src-js/views-editor/src/edit-behavior-adapters.js` with their behavior intact. `src-js/views-editor/src/edit-behavior-composer.js` now imports those helpers from the adapters layer instead of defining them locally. This step did not simplify the kernel API yet and did not remove composer injection yet; it only changed ownership.
- Comparison: Yes. The helper bodies are now adapter-owned, but their runtime behavior is intentionally unchanged at this stage. Composer still routes exactly the same way after importing the moved helpers.
- Manual test results: Not run in UI during this code pass. Automated verification passed via `node --check src-js/views-editor/src/edit-behavior-adapters.js`, `node --check src-js/views-editor/src/edit-behavior-composer.js`, and `npm run -s bundle` with the same existing webpack size warnings.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 2 - Step 2.3: Simplify the input kernel while moving it, but keep the two-helper model

- Problem: Even after the ownership move, `runPointLikeInputKernel(...)` still read as one large mode-switched function that mixed drag-stream processing and one-shot nudge processing into the same readable surface.
- Code analysis: In `src-js/views-editor/src/edit-behavior-adapters.js`, I split the helper into two private paths: `runPointLikeDragInput(...)` and `runPointLikeNudgeInput(...)`. The public `runPointLikeInputKernel(...)` now acts as a thin dispatcher that validates the shared contract and forwards to the mode-specific helper. The public helper name and call sites were kept unchanged.
- Comparison: Yes. The input kernel now has a simpler readable structure without changing how drag deltas, behavior-name changes, or nudge delta scaling work.
- Manual test results: Not run in UI during this code pass. Automated verification passed via `node --check src-js/views-editor/src/edit-behavior-adapters.js`, `node --check src-js/views-editor/src/edit-behavior-composer.js`, and `npm run -s bundle` with the same existing webpack size warnings.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 2 - Step 2.4: Simplify the session kernel and remove composer-to-adapter kernel injection

- Problem: After Steps 2.2 and 2.3, composer still injected kernel helpers into adapter context, and adapter routes still destructured and asserted those helpers as if they were external dependencies. That kept unnecessary ceremony in the call chain even though the kernels were already adapter-owned.
- Code analysis: In `src-js/views-editor/src/edit-behavior-composer.js`, drag and nudge routing now call adapters without passing `runPointLikeInputKernel(...)` or `runPointLikeSessionKernel(...)` through context. In `src-js/views-editor/src/edit-behavior-adapters.js`, `runPointLikeSessionKernel(...)` no longer accepts an injected input-kernel override and calls the local adapter-owned `runPointLikeInputKernel(...)` directly. Regular point-like, skeleton point/handle, fixed-rib skeleton point, editable-generated point/handle, regular equalize nudge, and skeleton rib nudge routes were updated to stop destructuring or asserting kernel helpers from context. Input-only consumers still call the local input kernel directly, while full-session consumers still use the session kernel.
- Comparison: Yes. Kernel ownership is now reflected in the call graph instead of only in file placement. Composer routes and calls adapters; adapters own the kernel utilities and use them locally.
- Manual test results: Not run in UI during this code pass. Automated verification passed via `node --check src-js/views-editor/src/edit-behavior-adapters.js`, `node --check src-js/views-editor/src/edit-behavior-composer.js`, `rg -n "runPointLikeInputKernel|runPointLikeSessionKernel" src-js/views-editor/src`, and `npm run -s bundle` with the same existing webpack size warnings.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 2 - Step 2.5: Finalize the kernel boundary and make the remaining exceptions explicit

- Problem: Even after the ownership and simplification work, the code could still be misleading if the boundary was only implicit. The final step needed to make it obvious that composer is routing-only, that the kernels are adapter-owned shared infrastructure, and that `input-only` consumers are allowed exceptions instead of unfinished refactor leftovers.
- Code analysis: I added short ownership notes in `src-js/views-editor/src/edit-behavior-adapters.js` and `src-js/views-editor/src/edit-behavior-composer.js` so the file roles are explicit where the kernels and routing entrypoints are defined. I also ran the Phase 2 verification sweep from the plan: the kernel exports exist only in the adapters layer, composer no longer defines or injects them, adapters no longer destructure kernel helpers from `context`, and the two intentional `input-only` consumers remain explicit (`runRegularEqualizeNudgeCanonical(...)` and `runSkeletonRibPointNudgeCanonical(...)`).
- Comparison: Yes. Phase 2 now ends with a readable boundary, not just moved code. Composer is routing/orchestration-only again, the adapters layer owns the shared point-like kernels, and the code no longer pretends every route uses the same execution model.
- Manual test results: Not rerun manually during this boundary/documentation pass. Automated verification passed via `node --check src-js/views-editor/src/edit-behavior-adapters.js`, `node --check src-js/views-editor/src/edit-behavior-composer.js`, `rg -n "export async function runPointLikeInputKernel|export async function runPointLikeSessionKernel" src-js/views-editor/src`, `rg -n "runPointLikeInputKernel,|runPointLikeSessionKernel," src-js/views-editor/src/edit-behavior-composer.js`, `rg -n "const \\{[^}]*runPointLikeInputKernel|const \\{[^}]*runPointLikeSessionKernel" src-js/views-editor/src/edit-behavior-adapters.js`, and `npm run -s bundle` with the same existing webpack size warnings.
- Undo/redo verification: Not rerun manually during this boundary/documentation pass.

### Phase 3 - Step 3.1: Map the current adapters file into real ownership blocks before moving code

- Problem: `src-js/views-editor/src/edit-behavior-adapters.js` is now the largest remaining refactor file, but its internal ownership is still blurry. Without a real inventory first, later cleanup would risk becoming a cosmetic reshuffle or another fake abstraction pass.
- Code analysis: The current file contains about 63 function/constant/export blocks and still mixes several kinds of code in one stream. At the top, the real shared infrastructure is present: the adapter/composer contract note, the point-like kernels, `getBehaviorName(...)`, and generic selection filters. But family-specific helpers are parked there too, especially editable-generated helpers like `readEditableHandleEqualizeState(...)`, `applyEditableHandleEqualizedLength(...)`, `collectEditableGeneratedPointsFromPointSelection(...)`, and `collectEditableGeneratedHandlesFromPointSelection(...)`. In the middle, skeleton-owned helpers and mixed skeleton-backed helpers are interleaved: `createSkeletonBackedMixedEditState(...)`, `updateSkeletonBackedMixedBehaviors(...)`, `applySkeletonBackedMixedDelta(...)`, `createSkeletonPointExecutors(...)`, `applyFixedRibDragToSkeletonData(...)`, `createSkeletonLayersData(...)`, and `makeSkeletonLayerPersistenceChanges(...)`. Later sections contain the regular routes, then skeleton routes, then editable-generated routes, then mixed/legacy routes, with the public adapter maps correctly staying at the bottom. The inventory also identified Phase 3 pure-code cleanup that belongs here: wrong helper placement, repeated cursor save/set/restore blocks, repeated `sceneController.editGlyph(...)` wrapper boilerplate, and a few repeated local layer-building patterns. The inventory also explicitly rejected the old direction of creating new adapter files.
- Comparison: Yes. The current ownership map is now explicit enough to guide in-file cleanup, and the phase direction is sharper: keep one file, fix locality, and allow only small local helper cleanup that removes obvious repetition.
- Manual test results: Not run in UI during this inventory/documentation step. No runtime code changed.
- Undo/redo verification: Not run during this inventory/documentation step because no runtime code changed.

### Phase 3 - Step 3.2: Pull truly shared adapter infrastructure into one explicit in-file section

- Problem: The top of `src-js/views-editor/src/edit-behavior-adapters.js` still mixed real shared infrastructure with family-specific code, and several exact boilerplate patterns were repeated in ways that made the file harder to read without improving behavior.
- Code analysis: I made the shared section explicit with in-file ownership markers and added two tiny local helpers that stay clearly adapter-local: `runGlyphEditSession(...)` for the repeated `sceneController.editGlyph(...)` wrapper and `withPointerCursor(...)` for the repeated pointer-cursor save/set/restore pattern. I then reused those helpers in the regular, skeleton, and editable-generated session paths instead of open-coding the same wrappers. I also pushed more skeleton clone/persist code onto the existing `cloneSkeletonData(...)` helper so several `JSON.parse(JSON.stringify(...))` copies disappeared from the same file. Finally, I added explicit section markers so the file now distinguishes shared infrastructure, editable-generated helper block, mixed skeleton-backed helper block, regular routes, skeleton-owned routes, editable-generated routes, and mixed/legacy routes instead of presenting one undifferentiated stream.
- Comparison: Yes. This was a real shared/locality cleanup inside the existing file: less exact boilerplate, clearer internal section ownership, and no new files or broader abstractions.
- Manual test results: Not run in UI during this code pass. Automated verification passed via `node --check src-js/views-editor/src/edit-behavior-adapters.js` and `npm run -s bundle` with the same existing webpack size warnings.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 3 - Step 3.3: Group skeleton-owned adapter code more clearly inside the existing file

- Problem: Skeleton-owned code was already one of the biggest families in `src-js/views-editor/src/edit-behavior-adapters.js`, but the file still did a poor job of presenting that boundary cleanly. Helper-heavy skeleton code and routing-heavy skeleton code were easy to confuse with neighboring sections, and one skeleton persistence path still open-coded its deep clone.
- Code analysis: I made the skeleton family boundary more explicit by splitting it into two labeled in-file sections: `Skeleton-owned helper block` and `Skeleton-owned routes`. That gives the large skeleton helper cluster and the later routing cluster clear ownership labels without creating new files or pretending the code is more generic than it is. I also replaced the remaining open-coded `JSON.parse(JSON.stringify(data.working))` inside the fixed-rib skeleton persistence path with `cloneSkeletonData(data.working)` so the skeleton family uses the same local clone helper consistently.
- Comparison: Yes. This was a conservative but real Phase 3 step: clearer skeleton ownership in the file and one less skeleton-only boilerplate scar, without drifting into Phase 5 math/orchestration work.
- Manual test results: Not run in UI during this code pass. Automated verification passed via `node --check src-js/views-editor/src/edit-behavior-adapters.js`, `rg -n "Skeleton-owned helper block|Skeleton-owned routes|JSON.parse\\(JSON.stringify\\(data\\.working\\)\\)" src-js/views-editor/src/edit-behavior-adapters.js`, and `npm run -s bundle` with the same existing webpack size warnings.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 3 - Step 3.4: Group editable-generated adapter code more clearly inside the existing file

- Problem: Editable-generated code already had a labeled area, but its helper block still mixed two different concerns, and the point/handle routes still duplicated the same layer bootstrap shape. That hurt locality even though the family boundary itself was already real.
- Code analysis: I tightened the editable-generated area in `src-js/views-editor/src/edit-behavior-adapters.js` with more specific in-file labels: the existing helper block now distinguishes `Handle/equalize helpers` from `Selection/working-state helpers`. I also added one small local helper, `createEditableGeneratedLayersData(...)`, which centralizes the repeated layer bootstrap used by both `runEditableGeneratedPointLikeCanonical(...)` and `runEditableGeneratedHandleLikeCanonical(...)`. Both routes now use that local helper instead of duplicating the same `layersData` construction logic.
- Comparison: Yes. This is a real editable-generated ownership/locality cleanup inside the same file: the helper area is more specific, and the repeated route-local bootstrap code now has one obvious family-local home.
- Manual test results: Not run in UI during this code pass. Automated verification passed via `node --check src-js/views-editor/src/edit-behavior-adapters.js`, `rg -n "Handle/equalize helpers|Selection/working-state helpers|function createEditableGeneratedLayersData|createEditableGeneratedLayersData\\(" src-js/views-editor/src/edit-behavior-adapters.js`, and `npm run -s bundle` with the same existing webpack size warnings.
- Undo/redo verification: Not run manually in UI during this code pass.

### Phase 3 - Step 3.5: Finalize the in-file layout and verify the new ownership map

- Problem: After the shared, skeleton, and editable-generated cleanup passes, the file still needed one final closeout step so the public surface and the internal section order were explicit instead of implied.
- Code analysis: I added the last missing in-file ownership marker, `Public adapter maps`, immediately above the exported adapter tables in `src-js/views-editor/src/edit-behavior-adapters.js`. I then ran a final layout verification sweep to confirm the file now has explicit markers for all intended areas: `Shared adapter infrastructure`, `Editable-generated helper block`, `Mixed skeleton-backed helper block`, `Skeleton-owned helper block`, `Regular point-like routes`, `Skeleton-owned routes`, `Editable-generated routes`, `Mixed-selection and legacy routes`, and `Public adapter maps`. The canonical and legacy adapter exports still remain at the bottom, so composer still imports one stable adapter entrypoint and no new files were created.
- Comparison: Yes. Phase 3 now ends with one readable adapters file whose internal ownership is explicit in the file itself, rather than a giant undifferentiated implementation dump.
- Manual test results: Not rerun manually during this final layout pass. Automated verification passed via `node --check src-js/views-editor/src/edit-behavior-adapters.js`, `rg -n "Shared adapter infrastructure|Editable-generated helper block|Mixed skeleton-backed helper block|Regular point-like routes|Skeleton-owned helper block|Skeleton-owned routes|Editable-generated routes|Mixed-selection and legacy routes|Public adapter maps|export const canonicalDragAdapters|export const canonicalNudgeAdapters|export const legacyDragAdapters|export const legacyNudgeAdapters" src-js/views-editor/src/edit-behavior-adapters.js`, and `npm run -s bundle` with the same existing webpack size warnings.
- Undo/redo verification: Not rerun manually during this final layout pass.
