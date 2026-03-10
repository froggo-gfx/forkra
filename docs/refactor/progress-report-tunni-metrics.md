# Tunni + Metrics/Q Refactor Progress Report

Date: 2026-03-10
Status: In Progress

## Phase 0 - Step 0.1: Write down the exact difference between the old branch assumptions and the current branch reality

- Problem: The old Tunni/metrics plan was written for a branch shape where pointer still owned more behavior. Starting this chapter without restating current branch reality would risk reopening the finished broad migration and pushing Q-measure or Tunni into the wrong architecture.
- Code analysis:
  - Updated `docs/refactor/PLAN-tunni-metrics-refactor.md`.
  - Added an explicit scope-lock statement under Step 0.1 that distinguishes current branch reality from the rejected old-plan assumptions.
  - Locked the branch facts this chapter must respect:
    - broad unified behavior is already complete and recorded in `docs/refactor/progress-report-broad.md`
    - beautify/cleanup work is already complete and recorded in `docs/refactor/progress-report-beautify.md`
    - `registry -> composer -> adapters` is already the accepted routing shape
    - `tunniPoint` and `skeletonTunniPoint` already exist as supported fallback drag object kinds
    - Q-measure remains a pointer/scene-model hover+mode workflow, not part of the unified point-like drag/nudge pipeline
  - Created `docs/refactor/progress-report-tunni-metrics.md` as the dedicated report target for this chapter, following the plan's required reporting rule.
- Comparison: Yes. The plan now states the branch-specific architectural reality explicitly, instead of assuming the old branch model. This narrows the chapter to ownership cleanup, shared math extraction, and state honesty.
- Manual test results: PASS (documentation-only step; no runtime code changed).
- Undo/redo verification: PASS (documentation-only step; no runtime code changed).

## Phase 0 - Step 0.2: Record the chapter hard requirements explicitly so no step can bypass them

- Problem: The chapter summary already named the desired shared-math outcomes, but Step 0.2 still needed to lock them as non-negotiable constraints. Without that stronger wording, later cleanup could improve ownership while still leaving duplicate Tunni or measure math alive.
- Code analysis:
  - Updated `docs/refactor/PLAN-tunni-metrics-refactor.md`.
  - Added a `Hard Requirements Locked For All Later Steps` block under Step 0.2.
  - Locked five explicit chapter-wide constraints:
    - one shared geometry implementation file for regular + skeleton Tunni
    - one shared implementation file for Q-measure + distance-angle
    - wrapper separation is allowed only for interaction/display differences
    - wrapper separation must not preserve duplicated formulas
    - a later step is incomplete if duplicate math implementations remain alive
  - Added a practical reading rule so later phases have a simple acceptance test: ownership cleanup without math convergence is not enough.
  - Rechecked the concrete duplicate-pressure files named by the plan:
    - `src-js/fontra-core/src/tunni-calculations.js`
    - `src-js/views-editor/src/skeleton-tunni-calculations.js`
    - `src-js/fontra-core/src/distance-angle.js`
- Comparison: Yes. The plan now treats shared Tunni math and shared measure math as chapter gates, not just goals. That prevents later steps from claiming success with file shuffling alone.
- Manual test results: PASS (documentation-only step; no runtime code changed).
- Undo/redo verification: PASS (documentation-only step; no runtime code changed).

## Phase 1 - Step 1.1: Define the single-file targets for shared math before moving any interaction code

- Problem: The plan already required one shared Tunni math home and one shared measure math home, but without locking the exact file targets first, later cleanup could drift into partial moves, compatibility shims with no real end state, or duplicated math hidden behind wrappers.
- Code analysis:
  - Updated `docs/refactor/PLAN-tunni-metrics-refactor.md`.
  - Added a `Locked Single-File Targets` block under Step 1.1.
  - Fixed the chapter targets to:
    - `src-js/fontra-core/src/tunni-calculations.js` for shared regular + skeleton Tunni geometry
    - `src-js/fontra-core/src/distance-angle.js` for shared Q-measure + distance-angle math
  - Recorded why those homes are chosen now:
    - they give both domains one existing shared owner before ownership work starts
    - they reduce file split instead of adding another delegation layer
    - they avoid claiming editor interaction or visualization ownership
  - Added a migration rule allowing temporary re-exports/delegation from old files only as a compatibility phase.
  - Rechecked the current surface to confirm these targets do not already exist and that the duplicate-pressure files are still:
    - `src-js/fontra-core/src/tunni-calculations.js`
    - `src-js/views-editor/src/skeleton-tunni-calculations.js`
    - `src-js/fontra-core/src/distance-angle.js`
- Comparison: Yes. The chapter now has explicit destination files for both shared-math domains, so later steps can be judged against a fixed end state instead of a vague "share it later" goal.
- Manual test results: PASS (documentation-only step; no runtime code changed).
- Undo/redo verification: PASS (documentation-only step; no runtime code changed).

## Phase 1 - Step 1.2: Converge shared regular+skeleton Tunni math into the existing core owner

- Problem: Shared Tunni geometry still lived in three places: the core Tunni file, the editor-side skeleton Tunni file, and a leftover duplicate block in `distance-angle.js`. That kept the domain split even though regular and skeleton workflows were already using the same underlying formulas.
- Code analysis:
  - Updated `src-js/fontra-core/src/distance-angle.js`.
  - Removed the duplicate Tunni geometry block from `distance-angle.js` and imported the shared functions from `src-js/fontra-core/src/tunni-calculations.js` instead.
  - Stopped using the stray midpoint name `calculateTunniPointz(...)`; Tunni label drawing now uses the shared `calculateTunniPoint(...)` owner directly.
  - Updated `src-js/views-editor/src/skeleton-tunni-calculations.js`.
  - Added one local segment-to-array adapter helper and routed these skeleton geometry wrappers through the core shared owner:
    - `calculateSkeletonTunniPoint(...)`
    - `calculateSkeletonTrueTunniPoint(...)`
    - `calculateSkeletonEqualizedControlPoints(...)`
  - Kept skeleton-specific interaction/session helpers local where they still operate on skeleton segment objects and drag semantics:
    - `calculateSkeletonControlPointsFromTunniDelta(...)`
    - `calculateSkeletonOnCurveFromTunni(...)`
    - `skeletonTunniHitTest(...)`
  - Updated `src-js/views-editor/src/visualization-layer-definitions.js` to drop the old `calculateTunniPointz` import from `distance-angle.js`.
  - Updated `docs/refactor/PLAN-tunni-metrics-refactor.md` to reflect the corrected no-new-file direction:
    - shared Tunni math owner is the existing `src-js/fontra-core/src/tunni-calculations.js`
    - shared measure math owner is the existing `src-js/fontra-core/src/distance-angle.js`
  - Verification:
    - `node --check src-js/fontra-core/src/distance-angle.js`
    - `node --check src-js/views-editor/src/skeleton-tunni-calculations.js`
    - `node --check src-js/views-editor/src/visualization-layer-definitions.js`
    - `rg -n "calculateTunniPointz|tunni-geometry|measure-geometry" src-js docs -S`
- Comparison: Yes. Shared Tunni geometry now converges into an existing core owner instead of adding another delegation layer, and the duplicate Tunni implementation block is gone from `distance-angle.js`.
- Manual test results: NOT RUN in this terminal session (UI verification still required for regular midpoint drag, true-Tunni drag, skeleton midpoint drag, and Ctrl+Shift equalize parity).
- Undo/redo verification: NOT RUN in this terminal session (UI verification still required).

## Phase 1 - Step 1.3: Converge shared measure math into one existing owner and route both Q-measure and distance-angle through it

- Problem: Q-measure overlay code in `src-js/views-editor/src/visualization-layer-definitions.js` still open-coded its own numeric measurement work for handle measurement, direct distance/angle, and projected dx/dy values. That left measure math split between the editor overlay and `src-js/fontra-core/src/distance-angle.js`.
- Code analysis:
  - Updated `src-js/fontra-core/src/distance-angle.js`.
  - Added shared measure helpers in the existing core owner:
    - `calculateProjectedDistanceComponents(point1, point2)`
    - `calculateHandleMeasure(segmentPoints, hoveredHandleSide)`
  - Reused existing `calculateDistanceAndAngle(...)` and `calculateTension(...)` inside `calculateHandleMeasure(...)` so handle measurement now shares the same distance/angle/tension math home as the rest of the measure domain.
  - Updated `src-js/views-editor/src/visualization-layer-definitions.js`.
  - Replaced editor-local Q overlay math with shared core calls:
    - handle hover now uses `calculateHandleMeasure(...)`
    - Alt+Q direct mode now uses `calculateDistanceAndAngle(...)`
    - Q projected mode now uses `calculateProjectedDistanceComponents(...)`
  - Removed the old editor-local `calculateHandleMeasureTension(...)` helper entirely.
  - Verification:
    - `node --check src-js/fontra-core/src/distance-angle.js`
    - `node --check src-js/views-editor/src/visualization-layer-definitions.js`
    - `rg -n "calculateHandleMeasureTension|calculateProjectedDistanceComponents|calculateHandleMeasure\\(" src-js -S`
- Comparison: Yes. The Q overlay no longer owns its own measure formulas for these cases; it now uses the existing `distance-angle.js` owner for shared measure math.
- Manual test results: NOT RUN in this terminal session (UI verification still required for Q projected mode, Alt+Q direct mode, and handle hover tension display).
- Undo/redo verification: NOT RUN in this terminal session (measure overlay is hover/state driven; no explicit UI verification was run here).

## Phase 2 - Step 2.1: Move regular-Tunni interaction helpers out of core and into editor code

- Problem: `src-js/fontra-core/src/tunni-calculations.js` still owned editor-coupled regular-Tunni helpers (hit testing, drag session state, and edit transaction wrappers). That violated the boundary goal for this phase: core should keep pure geometry, while editor-side code should own interaction/session behavior.
- Code analysis:
  - The first implementation of this step moved regular-Tunni interaction/session helpers into a new file, `src-js/views-editor/src/tunni-regular-interaction.js`.
  - That move removed editor session code from core, but it does not match the established architecture for this branch.
  - The current target architecture is now locked explicitly in `docs/refactor/target-architecture.md`:
    - shared Tunni geometry stays in `src-js/fontra-core/src/tunni-calculations.js`
    - pointer owns Tunni hit testing, cursor state, and route selection only
    - fallback Tunni execution must live in `src-js/views-editor/src/edit-behavior-adapters.js`
    - `src-js/views-editor/src/tunni-regular-interaction.js` is not part of the target state
  - This means Phase 2 - Step 2.1 is only partially complete:
    - boundary cleanup out of core: yes
    - compliance with existing adapter-layer architecture: no, not yet
- Comparison: Partial only. The core/editor boundary improved, but the resulting file boundary is not accepted as the target architecture because it introduced a new regular-Tunni sidecar module instead of keeping Tunni fallback execution inside the existing adapter layer.
- Manual test results: NOT RUN in this terminal session.
- Undo/redo verification: NOT RUN in this terminal session.

