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
