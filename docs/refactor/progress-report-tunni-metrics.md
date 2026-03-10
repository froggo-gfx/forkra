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

- Problem: Regular Tunni interaction/session helpers were still in core or in a disallowed sidecar module, which violates the established editor ownership boundary.
- Code analysis:
  - Moved regular Tunni session/drag logic into `src-js/views-editor/src/edit-behavior-adapters.js`.
  - Kept Tunni hit testing and routing in `src-js/views-editor/src/edit-tools-pointer.js`.
  - Deleted the sidecar file `src-js/views-editor/src/tunni-regular-interaction.js`.
  - Removed pointer-owned regular Tunni execution (`_handleTunniPointDrag`) and kept pointer as transport only.
  - Updated Tunni helper imports so the adapter owns execution, and pointer only consumes helper exports.
  - Verification:
    - `node --check src-js/views-editor/src/edit-behavior-adapters.js`
    - `node --check src-js/views-editor/src/edit-tools-pointer.js`
    - `rg -n "_handleTunniPointDrag|tunni-regular-interaction" src-js/views-editor/src -S`
- Comparison: Yes. Editor interaction ownership moved out of core without creating new files, and the execution now lives in the adapter layer, consistent with the target architecture.
- Manual test results: NOT RUN in this terminal session (regular midpoint/true-Tunni drag parity still required).
- Undo/redo verification: NOT RUN in this terminal session.

## Phase 2 - Step 2.2: Make the specialized Tunni adapter own regular-Tunni execution

- Problem: The specialized Tunni adapter path existed but still delegated into pointer private methods, which is an architectural bounce-back.
- Code analysis:
  - Adapter-owned regular Tunni execution now runs inside `src-js/views-editor/src/edit-behavior-adapters.js`.
  - Removed adapter bounce-back to pointer for regular Tunni execution.
  - Verification:
    - `rg -n "runFallbackTunniDrag\(|_handleTunniPointDrag" src-js/views-editor/src/edit-behavior-adapters.js src-js/views-editor/src/edit-tools-pointer.js -S`
- Comparison: Yes. Regular Tunni now runs in the specialized adapter without calling pointer private execution.
- Manual test results: NOT RUN in this terminal session.
- Undo/redo verification: NOT RUN in this terminal session.

## Phase 3 - Step 3.1: Remove skeleton Tunni execution ownership from pointer private methods

- Problem: Skeleton Tunni still executed inside pointer private methods and adapters were delegating back into pointer.
- Code analysis:
  - Moved skeleton Tunni execution session into `src-js/views-editor/src/edit-behavior-adapters.js`.
  - Moved skeleton Tunni equalize action into `src-js/views-editor/src/edit-behavior-adapters.js` and exported it for pointer use.
  - Removed pointer-owned `_handleSkeletonTunniDrag` and `_equalizeSkeletonTunniTensions`.
  - Removed adapter bounce-back into pointer for skeleton Tunni execution.
  - Verification:
    - `node --check src-js/views-editor/src/edit-behavior-adapters.js`
    - `node --check src-js/views-editor/src/edit-tools-pointer.js`
    - `rg -n "_handleSkeletonTunniDrag|_equalizeSkeletonTunniTensions|runFallbackSkeletonTunniDrag" src-js/views-editor/src -S`
- Comparison: Yes. Skeleton Tunni execution ownership is now adapter-owned and pointer is transport-only.
- Manual test results: NOT RUN in this terminal session (skeleton midpoint/true-Tunni drag parity still required).
- Undo/redo verification: NOT RUN in this terminal session.

## Phase 3 - Step 3.2: Reuse shared skeleton-backed persistence helpers

- Problem: Skeleton Tunni persistence was open-coded and duplicated the same regenerate/save lifecycle that already exists in adapter helpers.
- Code analysis:
  - Updated skeleton Tunni execution and equalize paths to use `collectSkeletonLayerPersistenceChanges(...)` and `cloneSkeletonData(...)` from `src-js/views-editor/src/edit-behavior-adapters.js`.
  - Removed repeated regenerate/save boilerplate from the pointer-owned code (now deleted).
  - Verification:
    - `rg -n "collectSkeletonLayerPersistenceChanges\(|cloneSkeletonData\(" src-js/views-editor/src/edit-behavior-adapters.js -S`
- Comparison: Yes. Skeleton Tunni persistence now reuses shared adapter helpers instead of open-coded duplication.
- Manual test results: NOT RUN in this terminal session.
- Undo/redo verification: NOT RUN in this terminal session.

## Phase 4 - Step 4.2: Replace scattered measure field writes with one SceneModel-owned API

- Problem: Pointer was directly mutating multiple `sceneModel.measure*` fields, which made state ownership unclear and reset behavior easy to break.
- Code analysis:
  - Added a measure-state API in `src-js/views-editor/src/scene-model.js`:
    - `setMeasureActive(...)`
    - `setMeasureShowDirect(...)`
    - `setMeasureHoverTarget(...)`
    - `getMeasureHoverTarget(...)`
    - `resetMeasureState()`
  - Replaced direct field writes in `src-js/views-editor/src/edit-tools-pointer.js` with the SceneModel API.
  - Verification:
    - `node --check src-js/views-editor/src/scene-model.js`
    - `node --check src-js/views-editor/src/edit-tools-pointer.js`
    - `rg -n "sceneModel\.measureMode|sceneModel\.measureShowDirect|sceneModel\.measureHover" src-js/views-editor/src/edit-tools-pointer.js -S`
- Comparison: Yes. Measure state is now owned by SceneModel with a single explicit API, and pointer only drives lifecycle/hover transport.
- Manual test results: NOT RUN in this terminal session (Q hover/Alt/Q lifecycle still required).
- Undo/redo verification: NOT RUN (hover/state workflow).

## Phase 5 - Step 5.2: Extract one measure hover resolver helper and make pointer use it

- Problem: Pointer interleaved hover target resolution with state writes, making priority rules harder to verify.
- Code analysis:
  - Inlined a dedicated `resolveMeasureHoverTarget(...)` helper in `src-js/views-editor/src/edit-tools-pointer.js` (no new files).
  - Added `_measureHoverTargetsEqual(...)` to compare hover targets by kind and payload.
  - Pointer now resolves the hover target via the helper and then pushes it into the SceneModel measure API.
  - Verification:
    - `node --check src-js/views-editor/src/edit-tools-pointer.js`
    - `rg -n "resolveMeasureHoverTarget|_measureHoverTargetsEqual|setMeasureHoverTarget\(" src-js/views-editor/src/edit-tools-pointer.js -S`
- Comparison: Yes. The helper is in place and used, and Step 5.1 hover-priority documentation is now recorded.
- Manual test results: NOT RUN in this terminal session.
- Undo/redo verification: NOT RUN (hover/state workflow).


## Phase 6 - Step 6.2: Move Tunni label drawing out of distance-angle.js and leave that file measure-focused

- Problem: `src-js/fontra-core/src/distance-angle.js` still owned Tunni label drawing and generated-contour filtering, which are editor visualization responsibilities.
- Code analysis:
  - Moved `drawTunniLabels(...)` into `src-js/views-editor/src/visualization-layer-definitions.js`.
  - Removed `drawTunniLabels(...)` and `getSkeletonGeneratedContourIndexSet(...)` from `src-js/fontra-core/src/distance-angle.js`.
  - Removed Tunni-only imports from `src-js/fontra-core/src/distance-angle.js` and kept it measure-focused.
  - Updated `src-js/views-editor/src/visualization-layer-definitions.js` imports so Tunni geometry helpers come from `@fontra/core/tunni-calculations.js`.
  - Verification:
    - `node --check src-js/views-editor/src/visualization-layer-definitions.js`
    - `node --check src-js/fontra-core/src/distance-angle.js`
    - `rg -n "drawTunniLabels|getSkeletonGeneratedContourIndexSet" src-js/fontra-core/src/distance-angle.js -S`
- Comparison: Yes. Tunni label drawing now lives in the editor visualization file and core no longer owns Tunni label rendering.
- Manual test results: NOT RUN in this terminal session (Tunni label overlay parity still required).
- Undo/redo verification: NOT RUN in this terminal session.

## Phase 7 - Step 7.1: Introduce one editor-side helper for generated-contour exclusion

- Problem: Generated-contour exclusion logic was duplicated in multiple editor files, risking drift between draw and hit-test behavior.
- Code analysis:
  - Added a shared helper in `src-js/views-editor/src/scene-model.js`:
    - `getGeneratedContourIndexSet(positionedGlyph, editLayerName)`
  - Replaced local generated-contour helpers in:
    - `src-js/views-editor/src/edit-behavior-adapters.js`
    - `src-js/views-editor/src/visualization-layer-definitions.js`
  - Both Tunni hit test and Tunni/measure drawing now use the same helper.
  - Verification:
    - `rg -n "getGeneratedContourIndexSet" src-js/views-editor/src/edit-behavior-adapters.js src-js/views-editor/src/visualization-layer-definitions.js src-js/views-editor/src/scene-model.js -S`
- Comparison: Yes. Generated-contour exclusion now uses one shared helper across the Tunni and measure surfaces.
- Manual test results: NOT RUN in this terminal session.
- Undo/redo verification: NOT RUN in this terminal session.

## Phase 6 - Step 6.2 Follow-up: Optimize local Tunni label rendering implementation

- Problem: After moving Tunni label rendering into editor visualization, the block was still a pasted transitional copy with duplicate logic, per-off-curve rescans, and stale core duplication.
- Code analysis:
  - Refactored `drawTunniLabels(...)` in `src-js/views-editor/src/visualization-layer-definitions.js` into local helpers for cubic-handle collection, text formatting, multiline drawing, and cubic-segment label rendering.
  - Precomputed cubic control-point membership once per draw call and removed the per-off-curve contour rescan.
  - Replaced duplicated label text assembly with one formatter path and removed the mojibake angle label.
  - Removed the stale core-side `drawTunniLabels(...)` copy from `src-js/fontra-core/src/tunni-calculations.js`.
  - Verification:
    - `node --check src-js/views-editor/src/visualization-layer-definitions.js`
    - `node --check src-js/fontra-core/src/tunni-calculations.js`
    - `rg -n "function drawTunniLabels" src-js -S`
- Comparison: Yes. The function stays in the right file, but is now smaller, single-owned, and avoids repeated full rescans.
- Manual test results: NOT RUN in this terminal session.
- Undo/redo verification: NOT RUN in this terminal session.

## Phase 6 - Step 6.1: Finish visualization ownership split cleanup in `visualization-layer-definitions.js`

- Problem: Domain registrations in `src-js/views-editor/src/visualization-layer-definitions.js` were still visually mixed, so ownership boundaries were harder to audit and easy to regress.
- Code analysis:
  - Updated `src-js/views-editor/src/visualization-layer-definitions.js` in place (no new files).
  - Added explicit section markers:
    - `// Tunni visualization domain helpers (labels + points/lines drawing).`
    - `// Tunni visualization domain registrations`
    - `// Measure visualization domain registrations`
  - Kept all Tunni registrations grouped together at the tail (`fontra.tunni.combined`, `fontra.tunni.actual.points`, `fontra.tunni.labels`).
  - Kept measure registrations grouped after Tunni (`fontra.distance-angle`, `fontra.manhattan-distance`).
  - Kept generated-contour exclusion calls wired through `getGeneratedContourIndexSet(...)` with `model?.sceneSettings?.editLayerName` in Tunni draw paths.
  - Verification:
    - `node --check src-js/views-editor/src/visualization-layer-definitions.js`
- Comparison: Yes. Ownership organization is now explicit by domain inside the existing file and matches the no-new-files rule.
- Manual test results: NOT RUN in this terminal session (visual toggle/z-order parity still required).
- Undo/redo verification: NOT RUN in this terminal session (visualization-only organization step).

## Phase 4 - Step 4.1: Define/record the Q-measure ownership + reset policy explicitly (doc gate)

- Problem: The plan required an explicit ownership/reset policy for measure mode, but it had not yet been recorded as a closed gate with code alignment checks.
- Code analysis:
  - Confirmed and recorded the ownership contract:
    - `SceneModel` is the measure state owner.
    - Pointer mutates measure state only through SceneModel API (`setMeasureActive`, `setMeasureShowDirect`, `setMeasureHoverTarget`, `resetMeasureState`).
  - Confirmed and aligned reset-path behavior in `src-js/views-editor/src/edit-tools-pointer.js`:
    - unified teardown via `_endMeasureMode()`
    - `Q` key-up -> `_endMeasureMode()`
    - tool deactivate -> `_endMeasureMode()`
    - window blur hard-exit -> `_endMeasureMode()`
    - Alt key-up in measure mode clears direct flag and transient hover target
  - Verification:
    - `node --check src-js/views-editor/src/edit-tools-pointer.js`
- Comparison: Yes. The policy is now explicit and the code path uses one coherent teardown owner flow.
- Manual test results: NOT RUN in this terminal session (Q/Alt/blur/tool-switch lifecycle pass still required).
- Undo/redo verification: NOT RUN (hover/mode-state workflow).

## Phase 5 - Step 5.1: Document the exact hover-priority contract before/with resolver closure

- Problem: Step 5.2 helper extraction existed, but closure required explicit documentation of priority and target shape in the chapter reporting gate.
- Code analysis:
  - Recorded the hover-priority contract in chapter artifacts and aligned it with resolver behavior in `src-js/views-editor/src/edit-tools-pointer.js`:
    1. rib point
    2. off-curve handle
    3. segment
    4. selected-point pair
  - Confirmed pointer uses one resolver (`resolveMeasureHoverTarget(...)`) and one target state sink (`sceneModel.setMeasureHoverTarget(...)`).
  - Verification:
    - `node --check src-js/views-editor/src/edit-tools-pointer.js`
    - `rg -n "resolveMeasureHoverTarget|_measureHoverTargetsEqual|setMeasureHoverTarget\(" src-js/views-editor/src/edit-tools-pointer.js -S`
- Comparison: Yes. The hover-priority contract is now explicitly documented and matches live resolver behavior.
- Manual test results: NOT RUN in this terminal session (hover-priority overlap scenarios still required).
- Undo/redo verification: NOT RUN (hover/state workflow).


## Phase 8 - Step 8.1: Replace brittle Tunni checkbox binding in `panel-transformation.js`

- Problem: Tunni checkbox wiring used a deferred `setTimeout(...)` + positional lookup (`allCheckboxes[0..2]`), which was brittle and could desync if form structure changed.
- Code analysis:
  - Updated `src-js/views-editor/src/panel-transformation.js` in place.
  - Removed the index-based binding block (`setTimeout`, `querySelectorAll`, positional checkbox assumptions).
  - Bound Tunni checkbox listeners directly to deterministic checkbox elements created for each field:
    - `distanceCheckbox` -> `showTunniDistance`
    - `tensionCheckbox` -> `showTunniTension`
    - `angleCheckbox` -> `showTunniAngle`
  - Kept scene settings updates and redraw trigger behavior unchanged.
  - Verification:
    - `node --check src-js/views-editor/src/panel-transformation.js`
    - `rg -n "setTimeout\(|allCheckboxes\[" src-js/views-editor/src/panel-transformation.js`
- Comparison: Yes. Binding is now key-bound and deterministic; no index-order coupling remains.
- Manual test results: NOT RUN in this terminal session (checkbox toggle/reopen pass still required).
- Undo/redo verification: NOT RUN in this terminal session (UI toggle settings path).

## Phase 8 - Step 8.2: Replace broad MouseTracker Ctrl workaround with explicit allow-policy

- Problem: `MouseTracker` had a broad relaxed Ctrl handling (commented-out guard removal) that affected all tools instead of only the intended Tunni Ctrl+Shift case.
- Code analysis:
  - Updated `src-js/fontra-core/src/mouse-tracker.js`:
    - added `allowCtrlModifiedMouseDown` option hook
    - restored default-safe behavior: ctrl-modified mousedown is blocked unless explicitly allowed
  - Updated `src-js/views-editor/src/scene-controller.js`:
    - wired `MouseTracker` allow hook to selected tool capability:
      - `allowCtrlModifiedMouseDown: (event) => this.selectedTool?.allowCtrlModifiedMouseDown?.(event) === true`
  - Updated `src-js/views-editor/src/edit-tools-pointer.js`:
    - added `allowCtrlModifiedMouseDown(event)` policy method
    - allows only Ctrl+Shift mousedown on midpoint Tunni targets:
      - regular midpoint hit (`tunniLayerHitTest(...).hitType === "tunni-point"`)
      - skeleton midpoint hit (`skeletonTunniHitTest(..., { midpointOnly: true }).type === "tunni"`)
    - all other ctrl-modified mousedown stays blocked by default
  - Verification:
    - `node --check src-js/fontra-core/src/mouse-tracker.js`
    - `node --check src-js/views-editor/src/scene-controller.js`
    - `node --check src-js/views-editor/src/edit-tools-pointer.js`
- Comparison: Yes. Ctrl policy is now explicit and narrowly scoped; unrelated ctrl-modified mousedown paths are no longer globally relaxed.
- Manual test results: NOT RUN in this terminal session (Ctrl+Shift Tunni + unrelated Ctrl mouse-down pass still required).
- Undo/redo verification: NOT RUN in this terminal session.
