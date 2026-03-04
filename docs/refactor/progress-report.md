# Refactor Progress Report

Date: 2026-03-04
Status: In Progress

## Phase 0 - Step 0.1: Align the action/object matrix with the SoT

- Problem: The matrix terminology could drift from the SoT by treating skeleton off-curve edits as a separate "skeleton handle" object kind.
- Code analysis:
  - Updated `docs/refactor/action-object-matrix.md`.
  - Updated the date to `2026-03-04`.
  - In the Objects section, replaced the `skeletonHandle` object entry with `skeleton off-curve point` terminology and kept the parseable `skeletonHandle/...` key as a legacy selection alias.
  - Added a note that unified behavior tracks skeleton edits as `skeletonPoint` on-curve/off-curve.
- Comparison: Yes. The matrix object language now matches the SoT scope and terminology (skeleton on-curve/off-curve points instead of a separate skeleton-handle kind).
- Manual test results: PASS (N/A - documentation-only step).
- Undo/redo verification: PASS (N/A - documentation-only step).

## Phase 0 - Step 0.2: Align target-architecture.md with the SoT

- Problem: The target architecture doc still used `skeletonHandle` object wording, which conflicts with the SoT terminology and can imply a parallel behavior lane.
- Code analysis:
  - Updated `docs/refactor/target-architecture.md`.
  - Updated the date to `2026-03-04`.
  - Changed canonical adapter listing from `skeletonHandle (off-curve)` to `skeletonPoint (off-curve)`.
  - Added an explicit adapter responsibility line that skeleton off-curve edits are not a separate skeleton-handle object kind.
  - Updated the data-flow summary table row from `skeletonOffCurve (skeletonHandle)` to `skeletonPoint (off-curve)`.
- Comparison: Yes. The document now states shared-behavior intent with adapter-owned persistence and treats skeleton off-curve edits as off-curve points.
- Manual test results: PASS (N/A - documentation-only step).
- Undo/redo verification: PASS (N/A - documentation-only step).

## Phase 1 - Step 1.1: Registry completeness

- Problem: `OBJECT_KINDS` needed an explicit completeness pass so in-scope kinds and selection-key semantics stay aligned with `parseSelection` and SoT terminology.
- Code analysis:
  - Updated `src-js/views-editor/src/edit-behavior-registry.js`.
  - Clarified the registry contract comment to require parseSelection key-name alignment for selection-based kinds and to identify non-selection kinds.
  - Marked all in-scope kinds with `inScope: true`: `regularPoint`, `anchor`, `guideline`, `skeletonPoint`, `skeletonHandle`, `skeletonRibPoint`, `editableGeneratedPoint`, `editableGeneratedHandle`.
  - Kept parseable selection keys unchanged (`point`, `anchor`, `guideline`, `skeletonPoint`, `skeletonHandle`, `skeletonRibPoint`, `editableGeneratedPoint`), and kept `selectionKey: null` for non-selection kinds.
  - Aligned capabilities metadata for in-scope kinds by setting `persistent: true` for `skeletonRibPoint`, `editableGeneratedPoint`, and `editableGeneratedHandle`, and setting `editableGeneratedHandle.supports` to `["drag", "nudge"]`.
  - Updated `docs/refactor/object-kind-inventory.md` terminology to "skeleton off-curve point" with `skeletonHandle/...` retained as a legacy selection-key alias.
- Comparison: Yes. The registry now explicitly covers all in-scope object kinds and keeps selection-key names aligned with existing `parseSelection` formats, with no new selection format introduced.
- Manual test results: PASS (N/A - definition step).
- Undo/redo verification: PASS (N/A - definition step).

## Phase 1 - Step 1.2: Routing maps are complete for drag and nudge

- Problem: The nudge routing map did not explicitly include the in-scope rib off-curve object kind (`editableGeneratedHandle`) for each matrix nudge row, leaving C8 coverage implicit instead of declared.
- Code analysis:
  - Updated `src-js/views-editor/src/edit-behavior-registry.js`.
  - Added `editableGeneratedHandle` routing entries for every nudge row (`R10`, `R11`, `R13`, `R14`, `R16`, `R17`, `R18`, `R19`, `R20`) with values aligned to the matrix:
    - `CA` for `R10`, `R11`, `R20`
    - `NA` for `R13`, `R14`, `R16`, `R17`, `R18`, `R19`
  - Updated `src-js/views-editor/src/pointer-objects.js` to add `canonicalNudgeAdapters.editableGeneratedHandle`, mapped to the existing editable-generated nudge adapter path.
- Comparison: Yes. Both drag and nudge routing maps now declare explicit routing for all in-scope object kinds across all matrix-listed modifier rows, and every Yes/Specificity matrix cell has an explicit routing value.
- Manual test results: PASS (N/A - definition step).
- Undo/redo verification: PASS (N/A - definition step).

## Phase 2 - Step 2.1: Adapter contract is explicit

- Problem: Adapter behavior was inconsistent: wrappers returned booleans or `undefined`, and contract wording lived in the registry with a shape that did not match actual adapter entry points.
- Code analysis:
  - Updated `src-js/views-editor/src/pointer-objects.js`.
  - Added explicit `ADAPTER_CONTRACT` and `makeAdapterResult()` in the adapter module.
  - Standardized adapter return semantics:
    - handled routes return `{ forward, rollback }` (currently `null` placeholders for transitional wrappers),
    - unhandled routes return `false`.
  - Updated `src-js/views-editor/src/edit-behavior-composer.js`.
  - Added routing-time assertions in `runDragRoutingOrchestration` and `runNudgeRoutingOrchestration` that adapters must return `{ forward, rollback }` or `false`.
  - Updated `src-js/views-editor/src/edit-behavior-registry.js`.
  - Removed the stale contract object from registry and replaced it with a reference to the pointer-objects contract so registry remains declarative.
- Comparison: Yes. The adapter API is now explicit in the adapter module and enforced at the composer boundary; this closes the contract drift identified in Step 2.1. Adapter persistence ownership migration remains tracked in later phase steps.
- Manual test results: PASS (N/A - contract step).
- Undo/redo verification: PASS (N/A - contract step).

## Phase 2 - Step 2.2: Composer is orchestration-only

- Problem: `edit-behavior-composer.js` still contained regular drag persistence (`applyChange`, `recordChanges`, connect logic), which violated the SoT boundary that composer should only orchestrate routing.
- Code analysis:
  - Updated `src-js/views-editor/src/pointer-objects.js`.
  - Moved regular drag orchestration/persistence implementation into adapter-side code (`runRegularDragOrchestration`), including behavior selection, incremental updates, equalize updates, rollback aggregation, and connect-contour persistence.
  - `runRegularDragLegacy` now calls adapter-local orchestration instead of receiving a composer callback.
  - Updated `src-js/views-editor/src/edit-behavior-composer.js`.
  - Removed drag persistence implementation and reduced composer to routing-only entry points (`runDragRoutingOrchestration`, `runNudgeRoutingOrchestration`, `runNudgeOrchestration`).
  - Drag routing now invokes adapters directly (`adapter(_context)`), instead of passing a persistence-capable `runDragOrchestration` helper from composer.
  - Verified syntax with `node --check` for both edited files.
- Comparison: Yes. Composer no longer performs drag/nudge persistence work and only orchestrates routing decisions; persistence logic is now adapter-owned for the regular drag path and remains adapter-owned/wrapped for other in-scope paths.
- Manual test results: PASS.
  - Drag regular point: PASS
  - Drag skeleton on-curve point: PASS
- Undo/redo verification: PASS.
  - Regular point drag undo/redo: PASS
  - Skeleton on-curve drag undo/redo: PASS

## Phase 2 - Step 2.3: Canonical adapter wrappers are consolidated

- Problem: Canonical adapters had repeated per-kind wrapper functions that only forwarded arguments to pointer handlers, which increased routing duplication without adding adapter behavior.
- Code analysis:
  - Updated `src-js/views-editor/src/pointer-objects.js`.
  - Replaced duplicated per-kind canonical drag/nudge wrapper functions with shared invocation helpers:
    - `runPointerMethodAdapter()`
    - `buildCanonicalDragPointerInvocation()` / `runCanonicalDragPointerAdapter()`
    - `buildCanonicalNudgePointerInvocation()` / `runCanonicalNudgePointerAdapter()`
  - Kept regular drag and regular nudge orchestration adapters unchanged; only non-regular canonical routes were consolidated into invocation maps.
  - Preserved adapter contract behavior: handled routes return `{ forward, rollback }`, and unhandled routes return `false`.
  - Added assertion guards for required drag context (`equalizeSkeletonInfo`, `ribHit`, `editablePoints`, `editableHandles`) in canonical drag invocation setup.
  - Updated `docs/refactor/plan-domain-separation.md` to explicitly define Step 2.3 and its verification criteria.
- Comparison: Yes. Canonical routing now uses shared invocation helpers instead of per-kind forwarding wrapper functions, while preserving existing behavior paths and adapter contract semantics.
- Manual test results: PASS (user verified).
  - Drag skeleton on-curve point: PASS
  - Drag rib point: PASS
  - Nudge skeleton point: PASS
- Undo/redo verification: PASS (user verified).

## Phase 3 - Step 3.1: Remove per-kind behavior classes from edit-behavior.js

- Problem: `edit-behavior.js` still contained per-kind behavior classes (`RibEditBehavior`, `EditableRibBehavior`, `InterpolatingRibBehavior`, `EditableHandleBehavior`), which violated the unified-behavior target of removing parallel per-kind behavior engines.
- Code analysis:
  - Updated `src-js/views-editor/src/edit-behavior.js`.
  - Removed exports of the four per-kind classes and replaced them with function-based behavior objects returned by existing factory APIs:
    - `createRibEditBehavior(...)`
    - `createEditableRibBehavior(...)`
    - `createInterpolatingRibBehavior(...)`
    - `createEditableHandleBehavior(...)`
  - Preserved behavior object shape used by callers (`applyDelta`, `getRollback`, mutable fields like `originalHalfWidth`, `minHalfWidth`, and `setOriginalHalfWidth` where needed) to avoid routing changes in this step.
  - Updated `src-js/views-editor/src/edit-tools-pointer.js`:
    - Removed class imports no longer exported by `edit-behavior.js`.
    - Replaced direct `new RibEditBehavior(...)` usage with `createRibEditBehavior(...)` factory usage.
  - Verified syntax with:
    - `node --check src-js/views-editor/src/edit-behavior.js`
    - `node --check src-js/views-editor/src/edit-tools-pointer.js`
- Comparison: Yes (code-level). The targeted per-kind class exports were removed from `edit-behavior.js`, and drag/nudge callers now consume factory-returned behavior objects without class constructors. Runtime parity remains subject to manual UI verification.
- Manual test results:
  - Drag regular points and anchors (default/shift/alt): PASS (user verified).
  - Drag editable generated points (left/right): PASS (user verified).
- Undo/redo verification: PASS (user verified).

## Phase 4 - Step 4.1: Regular points/anchors/guidelines (drag)

- Problem: Canonical regular drag routing was functionally working, but adapter boundaries were still implicit because canonical regular drag and legacy component drag shared the same adapter entrypoint.
- Code analysis:
  - Updated `src-js/views-editor/src/pointer-objects.js`.
  - Added `filterSelectionByPrefixes(selection, prefixes)` utility and applied it to canonical regular drag routing.
  - Updated `runRegularDragAdapter(...)` to accept an explicit `selection` override and pass that to `runRegularDragOrchestration(...)`.
  - Updated `runRegularDragCanonical(...)` to:
    - assert required context (`sceneController`, `objectKind`),
    - scope canonical regular drag to `point/`, `anchor/`, and `guideline/` selections only,
    - call `runRegularDragAdapter(...)` with this filtered selection.
  - Added `runLegacyComponentDragAdapter(...)` and routed `legacyDragAdapters.component/componentOrigin/componentTCenter` through it so component legacy routes remain explicit and separate from canonical regular routes.
  - Verified syntax with `node --check src-js/views-editor/src/pointer-objects.js`.
- Comparison: Yes (code-level). Canonical regular drag now explicitly uses shared behavior + adapter persistence over regular point/anchor/guideline selection only, while legacy component drag remains on separate legacy adapter entries.
- Manual test results:
  - Drag regular on-curve/off-curve points: NOT RUN in this terminal session (requires UI verification).
  - Drag anchors: NOT RUN in this terminal session (requires UI verification).
  - Drag guidelines: NOT RUN in this terminal session (requires UI verification).
  - Repeat with shift and alt modifiers: NOT RUN in this terminal session (requires UI verification).
- Undo/redo verification: NOT RUN in this terminal session (requires UI verification).

## Phase 4 - Step 4.2: Regular points/anchors/guidelines (nudge)

- Problem: Regular nudge canonical routing still delegated to generic `sceneController.handleArrowKeys(...)` over full selection state, so regular canonical adapter boundaries were implicit and could include non-regular selection keys.
- Code analysis:
  - Updated `src-js/views-editor/src/pointer-objects.js`.
  - Added adapter-owned `runRegularNudgeOrchestration(...)` using shared `EditBehaviorFactory` behavior output and adapter-side persistence via `sceneController.editGlyph(...)`.
  - In `runRegularNudgeCanonical(...)`:
    - Added explicit context assertions (`sceneController`, `objectKind`).
    - Scoped selection to canonical regular kinds only (`point/`, `anchor/`, `guideline/`) using `filterSelectionByPrefixes(...)`.
    - Kept equalize-path nudge fallback for regular points in equalize mode.
    - Replaced generic nudge orchestration call with explicit `runRegularNudgeOrchestration(...)`.
  - Verified syntax with `node --check src-js/views-editor/src/pointer-objects.js`.
- Comparison: Yes (code-level). Regular canonical nudge now executes an explicit adapter-owned shared-behavior + persistence path over regular-only selection scope, matching the Phase 4.2 migration intent.
- Manual test results:
  - Nudge regular points with arrow keys: NOT RUN in this terminal session (requires UI verification).
  - Nudge anchors with arrow keys: NOT RUN in this terminal session (requires UI verification).
  - Nudge guidelines with arrow keys: NOT RUN in this terminal session (requires UI verification).
  - Repeat with shift and shift+ctrl/meta modifiers: NOT RUN in this terminal session (requires UI verification).
- Undo/redo verification: NOT RUN in this terminal session (requires UI verification).

## Phase 4 - Step 4.3: Skeleton on-curve/off-curve (drag)

- Problem: Skeleton point drag canonical routing still delegated directly to pointer-owned `_handleDragSkeletonPoints`, so skeleton drag math/persistence remained pointer-owned.
- Code analysis:
  - Updated `src-js/views-editor/src/pointer-objects.js`.
  - Added adapter-local skeleton point executor helper `createSkeletonPointExecutors(...)` using shared behavior primitives (`createPointBehaviorExecutor` + `getSkeletonBehaviorName`).
  - Added adapter-owned skeleton drag flow:
    - `runSkeletonPointDragOrchestration(...)` for per-layer skeleton behavior application, contour regeneration, and skeleton customData persistence.
    - `runSkeletonPointDragCanonical(...)` as canonical adapter entrypoint.
  - Updated `canonicalDragAdapters.skeletonPoint` to use `runSkeletonPointDragCanonical(...)` instead of pointer-method invocation map.
  - Transitional fallback retained for fixed-rib drag modes (`D` / `S`) to pointer handler path to preserve behavior while broader fixed-rib migration remains pending.
  - Verified syntax with `node --check src-js/views-editor/src/pointer-objects.js`.
- Comparison: Yes (code-level). Default/shift/alt skeleton drag now runs through adapter-owned shared-behavior + skeleton persistence flow in canonical adapter space instead of direct pointer handler routing.
- Manual test results:
  - Drag skeleton on-curve points: NOT RUN in this terminal session (requires UI verification).
  - Drag skeleton off-curve points: NOT RUN in this terminal session (requires UI verification).
  - Repeat with shift and alt modifiers: NOT RUN in this terminal session (requires UI verification).
- Undo/redo verification: NOT RUN in this terminal session (requires UI verification).

## Phase 4 - Step 4.4: Skeleton on-curve/off-curve (nudge)

- Problem: Skeleton point nudge canonical routing still delegated to pointer-owned `_handleArrowKeysLegacy`, so skeleton nudge math/persistence remained pointer-owned.
- Code analysis:
  - Updated `src-js/views-editor/src/pointer-objects.js`.
  - Added adapter-owned skeleton nudge flow:
    - `runSkeletonPointNudgeOrchestration(...)` for skeleton delta application, outline regeneration (`preferInPlace`), and skeleton customData persistence.
    - `runSkeletonPointNudgeCanonical(...)` as canonical adapter entrypoint.
  - Updated `canonicalNudgeAdapters.skeletonPoint` to use `runSkeletonPointNudgeCanonical(...)` instead of pointer-method invocation map.
  - Transitional fallback retained to pointer legacy nudge path for mixed regular+skeleton selections and fixed-rib nudge modes (`D` / `S`) to preserve current behavior while those paths are migrated in later steps.
  - Verified syntax with `node --check src-js/views-editor/src/pointer-objects.js`.
- Comparison: Yes (code-level). Default/shift/alt skeleton nudge now runs through canonical adapter-owned behavior + persistence flow; pointer legacy path is still used for transitional fixed-rib/mixed cases.
- Manual test results:
  - Nudge skeleton on-curve points: NOT RUN in this terminal session (requires UI verification).
  - Nudge skeleton off-curve points: NOT RUN in this terminal session (requires UI verification).
  - Repeat with shift and alt modifiers: NOT RUN in this terminal session (requires UI verification).
- Undo/redo verification: NOT RUN in this terminal session (requires UI verification).

## Phase 4 - Step 4.5: Skeleton equalize (drag + nudge)

- Problem: Skeleton equalize paths (`X` drag and `X` nudge for off-curve points) still routed through pointer-owned handlers, so canonical adapters were not actually owning this object-kind specificity.
- Code analysis:
  - Updated `src-js/views-editor/src/pointer-objects.js`.
  - Added adapter-local skeleton equalize helpers:
    - `getSkeletonHandleEqualizeInfo(...)`
    - `runSkeletonHandleEqualizeDragOrchestration(...)`
    - `runSkeletonHandleEqualizeNudgeOrchestration(...)`
    - plus canonical entrypoints `runSkeletonHandleEqualizeDragCanonical(...)` and `runSkeletonHandleEqualizeNudgeCanonical(...)`.
  - Updated canonical adapter maps:
    - `canonicalDragAdapters.skeletonHandle` now routes to adapter-owned equalize drag canonical implementation.
    - `canonicalNudgeAdapters.skeletonHandle` now routes to adapter-owned equalize nudge canonical implementation.
  - Removed pointer-method forwarding for skeleton-handle canonical drag by deleting `skeletonHandle` from `buildCanonicalDragPointerInvocation(...)`.
  - Removed pointer-legacy forwarding for skeleton/equalize from `buildCanonicalNudgePointerInvocation(...)` for this route.
  - Preserved fallback semantics for nudge when equalize is not applicable:
    - if no off-curve skeleton points are selected, canonical skeleton-handle nudge delegates to `runSkeletonPointNudgeCanonical(...)` (which retains existing mixed/fixed-rib fallback behavior).
  - Verified syntax with `node --check src-js/views-editor/src/pointer-objects.js`.
- Comparison: Yes (code-level). Skeleton equalize drag+nudge now run through canonical adapter-owned translation/persistence paths instead of pointer-owned `_handleEqualizeHandlesDrag(...)`/`_handleArrowKeysLegacy(...)` forwarding for `skeletonHandle`.
- Manual test results:
  - Drag skeleton off-curve points with X: NOT RUN in this terminal session (requires UI verification).
  - Drag skeleton off-curve points with X+shift: NOT RUN in this terminal session (requires UI verification).
  - Nudge skeleton off-curve points with X: NOT RUN in this terminal session (requires UI verification).
  - Nudge skeleton off-curve points with X+shift: NOT RUN in this terminal session (requires UI verification).
- Undo/redo verification: NOT RUN in this terminal session (requires UI verification).

## Phase 4 - Cross-Cut: Move drag kernel to composer

- Problem: Shared drag-loop orchestration still lived in `pointer-objects.js`, leaving composer as mostly routing boilerplate and keeping cross-kind drag control flow in adapters.
- Code analysis:
  - Updated `src-js/views-editor/src/edit-behavior-composer.js`.
  - Added composer-owned `runPointLikeDragKernel(...)` to centralize shared drag-session logic:
    - modifier/behavior switching,
    - per-event point sampling,
    - delta computation relative to initial point,
    - callback dispatch for behavior-change and event application.
  - Updated `runDragRoutingOrchestration(...)` to inject `runPointLikeDragKernel` into adapter context.
  - Updated `src-js/views-editor/src/pointer-objects.js` to consume composer-provided kernel for:
    - regular drag orchestration,
    - skeleton point drag orchestration,
    - skeleton equalize drag orchestration.
  - Removed adapter-owned `runUnifiedDragEventStream(...)` and direct `vector.subVectors(...)` drag delta use in favor of kernel-provided deltas.
  - Verified syntax with:
    - `node --check src-js/views-editor/src/edit-behavior-composer.js`
    - `node --check src-js/views-editor/src/pointer-objects.js`
- Comparison: Partially. Shared drag-loop policy is now composer-owned (better boundary), but pointer adapters still contain substantial persistence-specific drag logic and remain large; additional consolidation is needed for major file-size reduction.
- Manual test results:
  - NOT RUN in this terminal session (requires UI verification).
- Undo/redo verification: NOT RUN in this terminal session (requires UI verification).

## Phase 4 - Cross-Cut: Move nudge kernel to composer

- Problem: Nudge delta computation and skeleton nudge session orchestration were duplicated across canonical adapters (`regular`, `skeletonPoint`, and `skeletonHandle` equalize), leaving composer as routing-only and adapters with repeated flow logic.
- Code analysis:
  - Updated `src-js/views-editor/src/edit-behavior-composer.js`.
  - Added `runPointLikeNudgeKernel(...)` and shared `getNudgeDeltaForEvent(...)`.
  - Updated `runNudgeRoutingOrchestration(...)` to pass `runPointLikeNudgeKernel` into adapter context.
  - Updated `src-js/views-editor/src/pointer-objects.js`.
  - Added shared `runSkeletonNudgeSession(...)` for one-shot skeleton nudge persistence flow.
  - Updated canonical nudge adapters to use kernel-provided delta instead of per-function delta math:
    - `runRegularNudgeCanonical(...)`
    - `runSkeletonPointNudgeCanonical(...)`
    - `runSkeletonHandleEqualizeNudgeCanonical(...)`
  - Updated underlying orchestration functions to accept `delta` from kernel and removed local arrow-key delta code.
  - Kept existing fallback behavior:
    - mixed regular+skeleton/fixed-rib nudge still routes to legacy pointer path via `runSkeletonPointNudgeCanonical(...)`.
    - skeleton-handle equalize nudge still falls back to skeleton-point canonical nudge when no off-curve targets are selected.
  - Verified syntax with:
    - `node --check src-js/views-editor/src/edit-behavior-composer.js`
    - `node --check src-js/views-editor/src/pointer-objects.js`
- Comparison: Yes (architecture-level). Nudge session delta policy is now composer-owned and shared, and skeleton nudge session orchestration is consolidated into one helper. Adapter code remains large, but duplicate nudge control-flow blocks were reduced.
- Manual test results:
  - NOT RUN in this terminal session (requires UI verification).
- Undo/redo verification: NOT RUN in this terminal session (requires UI verification).

## Phase 4 - Cross-Cut: Debloat basic drag+nudge orchestration

- Problem: Basic regular/skeleton drag+nudge orchestration was still split across near-duplicate functions, so adapter routing looked unified but code structure remained bloated.
- Code analysis:
  - Updated `src-js/views-editor/src/edit-behavior-composer.js`.
  - Replaced separate composer kernels (`runPointLikeDragKernel`, `runPointLikeNudgeKernel`) with one mode-based kernel: `runPointLikeInputKernel({ mode: \"drag\" | \"nudge\", ... })`.
  - Updated composer routing injection so canonical adapters receive the single input kernel in both drag and nudge paths.
  - Updated `src-js/views-editor/src/pointer-objects.js`.
  - Merged regular drag+nudge orchestration into:
    - `runRegularPointLikeOrchestration(...)`
    - `runRegularPointLikeAdapter(...)`
    - `runRegularPointLikeCanonical(context, mode)`
  - Merged skeleton drag+nudge/equalize orchestration into:
    - `runSkeletonPointLikeSession(...)`
    - `runSkeletonPointLikeOrchestration({ mode, variant })`
    - `runSkeletonPointLikeCanonical(context, mode)`
    - `runSkeletonHandlePointLikeCanonical(context, mode)`
  - Kept legacy/special-case routes (rib/editable/tunni/mixed/fixed-rib fallback) intact; only aligned signatures and canonical mapping to the new mode-based entrypoints.
  - Preserved regular equalize nudge short-circuit via `_handleArrowKeysForEqualizePathHandles(...)` before regular nudge persistence path.
  - Updated canonical adapter maps to route through unified mode handlers for basic kinds.
  - Verified build with `npm run bundle` (success, only existing webpack size warnings).
  - Net file-size reduction:
    - `pointer-objects.js`: 1426 -> 1259 lines.
    - `edit-behavior-composer.js`: 227 -> 236 lines (small increase from kernel unification API).
- Comparison: Yes (code-level). Basic regular/skeleton drag+nudge now use shared mode-based orchestration kernels instead of parallel per-mode orchestration functions, with legacy/special-case behavior kept out of scope for this step.
- Manual test results:
  - NOT RUN in this terminal session (requires UI verification).
- Undo/redo verification: NOT RUN in this terminal session (requires UI verification).

## Phase 4 - Cross-Cut: Equalize kernel unification and regular equalize canonical routing

- Problem: Equalize math and pair-resolution were duplicated across pointer/adapters, and regular `X` nudge still depended on pointer fallback (`_handleArrowKeysForEqualizePathHandles(...)`) instead of canonical adapter ownership.
- Code analysis:
  - Updated `src-js/views-editor/src/edit-behavior.js`.
  - Added shared equalize helpers:
    - `resolveEqualizePairForContourPoint(...)`
    - `computeEqualizedHandlePositions(...)`
    - `makeRegularEqualizeNudgeChanges(...)`
  - Refactored existing `makeEqualizeDragChanges(...)` to use shared equalize position computation.
  - Updated `src-js/views-editor/src/pointer-objects.js`.
  - Removed adapter-local duplicate skeleton equalize pair helper and switched skeleton/regular equalize paths to shared behavior helpers.
  - Added canonical regular equalize nudge adapter flow (`runRegularEqualizeNudgeCanonical(...)`) and removed regular canonical dependency on pointer fallback equalize nudge handling.
  - Added regular equalize drag context passthrough (`selectionOverride` + `equalizeHandleInfo`) to canonical regular point route.
  - Added explicit equalize rollback coverage for both dragged and opposite points to keep undo/redo correct when equalize drag runs with empty regular selection.
  - Preserved skeleton equalize nudge parity by keeping opposite handle unchanged when opposite vector length is near zero (preserve-direction mode).
  - Updated `src-js/views-editor/src/edit-behavior-registry.js` and `src-js/views-editor/src/edit-tools-pointer.js`:
    - removed `regularEqualizeHandle` object kind routing,
    - routed regular X+drag via canonical `regularPoint` adapter context.
  - Verification:
    - `node --check src-js/views-editor/src/edit-behavior.js`
    - `node --check src-js/views-editor/src/pointer-objects.js`
    - `node --check src-js/views-editor/src/edit-behavior-registry.js`
    - `node --check src-js/views-editor/src/edit-tools-pointer.js`
    - `npm run bundle` (success, only existing webpack size warnings).
- Comparison: Yes (code-level). Equalize math now has a shared behavior-level kernel used by both regular and skeleton adapter flows, and regular equalize nudge canonical routing no longer requires pointer fallback on the canonical path.
- Manual test results:
  - NOT RUN in this terminal session (requires UI verification).
- Undo/redo verification: NOT RUN in this terminal session (requires UI verification).

## Phase 4 - Cross-Cut: Collapse basic regular+skeleton session lifecycle into composer

- Problem: Basic regular and skeleton canonical paths still duplicated session lifecycle (`editGlyph` session wrapping, input-loop hookup, session start/end handling), so only input-delta policy was unified while orchestration lifecycle remained split.
- Code analysis:
  - Updated `src-js/views-editor/src/edit-behavior-composer.js`.
  - Added shared orchestration-only `runPointLikeSessionKernel(...)`:
    - wraps adapter-provided edit session via `withEditSession(...)`,
    - runs `runPointLikeInputKernel(...)`,
    - dispatches strategy callbacks (`onSessionStart`, `onBehaviorChanged`, `onInput`, `onSessionEnd`),
    - keeps composer persistence-free (no `applyChange`/`recordChanges`/skeleton regeneration calls).
  - Updated drag/nudge routing injection to pass `runPointLikeSessionKernel` into canonical adapters.
  - Updated `src-js/views-editor/src/pointer-objects.js`.
  - Refactored regular basic orchestration to use composer session kernel:
    - `runRegularPointLikeOrchestration(...)` now delegates lifecycle/session wrapping to `runPointLikeSessionKernel(...)` and keeps regular-specific persistence logic in adapter callbacks.
    - `runRegularPointLikeAdapter(...)` no longer owns direct `sceneController.editGlyph(...)` wrapping.
  - Refactored skeleton basic orchestration to use composer session kernel:
    - removed adapter-local `runSkeletonPointLikeSession(...)`.
    - `runSkeletonPointLikeOrchestration(...)` now uses shared `runSkeletonSession(...)` wrapper over `runPointLikeSessionKernel(...)` for normal/equalize drag+nudge variants.
  - Updated canonical skeleton entrypoints to require/pass `runPointLikeSessionKernel`:
    - `runSkeletonPointLikeCanonical(...)`
    - `runSkeletonHandlePointLikeCanonical(...)`
  - Kept all legacy/special-case fallbacks unchanged (mixed/fixed-rib/tunni/rib/editable paths out of scope).
  - Verification:
    - `node --check src-js/views-editor/src/edit-behavior-composer.js`
    - `node --check src-js/views-editor/src/pointer-objects.js`
    - `npm run bundle` (success, only existing webpack size warnings).
- Comparison: Yes (architecture-level). Basic regular+skeleton drag/nudge now share one composer-owned session lifecycle kernel while preserving SoT composer purity and adapter-owned persistence math/translation.
- Manual test results:
  - NOT RUN in this terminal session (requires UI verification).
- Undo/redo verification: NOT RUN in this terminal session (requires UI verification).

## Phase 4 - Step 4.7: Rib points (nudge)

- Problem: Rib-point nudge canonical routing still called pointer-owned `_handleArrowKeysForRibPoints(...)`, so rib nudge persistence was not adapter-owned.
- Code analysis:
  - Updated `src-js/views-editor/src/pointer-objects.js`.
  - Replaced `runSkeletonRibPointNudgeCanonical(...)` pointer-method forwarding with a canonical adapter-owned edit flow:
    - Parses rib selection and validates target eligibility.
    - Keeps baseline rib guard: if selection is mixed non-editable and not on a single segment, treat as handled no-op.
    - Uses `runPointLikeInputKernel({ mode: "nudge" })` for nudge delta input.
    - Applies rib changes per editing layer via adapter-owned persistence (`regenerateSkeletonContours` + `setSkeletonData` + incremental change send).
  - Added adapter-local rib helpers (moved out of pointer ownership for this path):
    - `collectSelectedRibPointTargets(...)`
    - `selectedRibTargetsBelongToSingleSegment(...)`
    - width-link helpers (`isWidthLinked`, `applyLinkedWidthDelta`, etc.).
  - Preserved modifier behavior for this step:
    - `Z` tangent nudge constraint through `constrainMode`.
    - `Alt` interpolation path for editable ribs via `createInterpolatingRibBehavior(...)` (with fallback to editable rib behavior when no interpolation axis is available).
    - shift scaling remains sourced from shared nudge input kernel.
  - Added/updated imports in `pointer-objects.js` for skeleton/rib helpers required by adapter-owned nudge persistence.
  - Verification:
    - `node --check src-js/views-editor/src/pointer-objects.js`
    - `npm run -s bundle` (success; only existing webpack size warnings).
- Comparison: Yes (code-level). Rib nudge canonical path is now adapter-owned (no pointer nudge handler invocation for `skeletonRibPoint` canonical routing), with persistence and translation performed in `pointer-objects.js`.
- Manual test results:
  - Nudge rib points with arrow keys: NOT RUN in this terminal session (requires UI verification).
  - Repeat with shift and alt modifiers: NOT RUN in this terminal session (requires UI verification).
- Undo/redo verification: NOT RUN in this terminal session (requires UI verification).
