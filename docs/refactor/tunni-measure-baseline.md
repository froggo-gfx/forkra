# Tunni + Q-Measure Baseline

Date: 2026-02-25
Purpose: lock down real behavior before refactor so each step can be validated against code, not assumptions.

## Source of truth used for this baseline
- `src-js/views-editor/src/edit-tools-pointer.js`
- `src-js/views-editor/src/skeleton-edit-behavior.js`
- `src-js/fontra-core/src/tunni-core.js`
- `src-js/fontra-core/src/tunni-calculations.js`
- `src-js/views-editor/src/visualization-layer-definitions.js`
- `src-js/fontra-core/src/distance-angle.js`
- `src-js/views-editor/src/editor.js`

## How to run
- Run all scenarios before and after each refactor step.
- If behavior changed and this step did not explicitly target it, mark as regression.
- Always watch browser console for runtime errors.

## Behavior matrix (code-derived)

### Measure mode (`Q`, `Alt+Q`)
- Entry: `action.realtime.measure`, `action.realtime.measure-direct` in `src-js/views-editor/src/editor.js`.
- Runtime flags/state: `measureMode`, `measureShowDirect`, `measureHover*` in `src-js/views-editor/src/edit-tools-pointer.js`.
- Hover priority in measure mode:
1. Rib endpoint
2. Off-curve handle
3. Segment
4. Two-point selection fallback
- Mixed selection behavior: if exactly two selected points are mixed kinds (path + skeleton/rib), resulting type is treated as `"skeleton"` for visualization color logic (`src-js/views-editor/src/edit-tools-pointer.js`, `_getMeasurePointsFromSelection`).

### Tunni (regular vs skeleton)
- Regular Tunni uses `tunniLayerHitTest` from `src-js/fontra-core/src/tunni-calculations.js`.
- Skeleton Tunni uses `skeletonTunniHitTest` from `src-js/fontra-core/src/tunni-core.js`.
- Common interaction semantics:
1. midpoint drag edits control-point tension behavior
2. true-point drag edits on-curve behavior
3. `Alt` disables equalized-distance behavior during drag
- Important asymmetry:
1. regular `Ctrl+Shift+click` midpoint path uses equalize+quantize flow
2. skeleton `Ctrl+Shift+click` path uses skeleton tension equalization flow and can trigger even when skeleton Tunni layer is hidden (hit-test branch is separate in pointer logic)

### Skeleton points vs rib points
- Skeleton points:
1. free point editing via behavior preset from `shift/alt` (`getSkeletonBehaviorName`)
2. `X` mode drives equalize flows for off-curve handles (drag and arrows)
3. fixed-rib modifiers (`D`, `S`) are applied in skeleton-point drag path
- Rib points:
1. non-editable rib: width-only behavior (normal projection)
2. editable rib: width plus nudge semantics depending on mode
3. `Alt+drag` (editable rib) switches to interpolation behavior (`InterpolatingRibBehavior`)
4. `Z+drag` constrains to tangent mode (nudge-only path)
5. `Z+Shift+drag` must still keep tangent constraint semantics; shift must not silently switch mode
6. `detached` rib-handle mode is per side (`leftHandleDetached`/`rightHandleDetached`): handle 2D offsets are interpreted in rib-point space, so handle placement is independent from skeleton-handle length changes.
7. non-detached mode stores offsets relative to generated control positions, so handle placement follows skeleton-handle geometry changes.
8. movement gating exists: allowed only for all-editable targets OR same-segment pairing OR skeleton-driven drag context

### Generated contours
- Regular Tunni hit-test excludes generated contour indices (`src-js/fontra-core/src/tunni-calculations.js`).
- Tunni label drawing excludes generated contours (`src-js/fontra-core/src/distance-angle.js`).
- Measure segment hit-test in pointer does not globally exclude generated path contours; skeleton segment check is only prioritized first (`src-js/views-editor/src/edit-tools-pointer.js`).

---

## Scenario 1: Measure mode across all object kinds (including mixed)
- Setup:
1. glyph with regular contour
2. glyph with skeleton contour + rib endpoints
3. mixed glyph containing both
- Action:
1. hold `Q`, hover rib endpoint, then off-curve handle, then segment
2. hold `Alt+Q`, repeat the same hover sequence
3. create mixed two-point selection (one regular + one skeleton or rib endpoint), then hold `Q` and `Alt+Q`
- Expected:
1. hover priority remains rib > handle > segment > selection
2. direct/projected mode toggles correctly with `Alt`
3. mixed two-point selection renders and updates without fallback errors
4. releasing keys resets measure state fully

## Scenario 2: Tunni parity and controlled asymmetry
- Setup:
1. one regular cubic segment with visible regular Tunni controls
2. one skeleton segment with visible skeleton Tunni controls
- Action:
1. midpoint drag in regular and skeleton
2. true-point drag in regular and skeleton
3. repeat midpoint/true-point drags with `Alt` held
4. run `Ctrl+Shift+click` on midpoint in regular and skeleton
- Expected:
1. midpoint/true-point semantics are equivalent at UX level between regular and skeleton
2. `Alt` disables equalized-distance mode in both paths
3. `Ctrl+Shift+click` executes type-specific equalization flow (regular: equalize+quantize; skeleton: skeleton tension equalize)

## Scenario 3: Skeleton-point behavior matrix
- Setup: skeleton contour with on-curve and off-curve points, including smooth contexts for equalize checks.
- Action:
1. drag skeleton points in default mode
2. drag with `Shift`
3. drag with `Alt`
4. drag with `X` (off-curve equalize path)
5. nudge with arrows
6. nudge with `X+arrows`
7. drag with `D` and with `S` (fixed-rib modes)
- Expected:
1. baseline preset switching via `shift/alt` stays stable
2. `X` equalize behavior applies only where off-curve + valid smooth/opposite structure exists
3. fixed-rib modes apply only in skeleton drag path and do not corrupt non-target points
4. no interpolation-status warnings in mixed-source editing

## Scenario 4: Rib-point behavior matrix (editable/non-editable, flags, modifiers)
- Setup:
1. rib points with `leftEditable/rightEditable` variants
2. linked and unlinked width points
3. single-sided and normal contours
- Action:
1. drag non-editable rib point
2. drag editable rib point
3. drag editable rib point with `Alt` (interpolation)
4. drag editable rib point with `Z`
5. drag editable rib point with `Z+Shift`
6. select multi-rib targets that are not same-segment and not all editable, attempt drag
7. nudge selected rib points with arrows and modifier variants
8. toggle detached ON for one side (via Skeleton Parameters), then change width/nudge and move adjacent skeleton handles
9. toggle detached OFF, repeat width/nudge/handle moves
- Expected:
1. non-editable path stays width-only
2. editable path follows editable rib semantics
3. `Alt+drag` enters interpolation path, preserving interpolation-specific handle offset behavior
4. `Z` and `Z+Shift` keep tangent-constrained semantics (no silent mode switch)
5. movement gating blocks disallowed multi-target drags
6. arrow nudge respects rib restrictions and does not behave like unrestricted skeleton drag
7. detached ON: handle positions stay anchored in rib-point space (not re-scaled by skeleton-handle distance changes)
8. detached OFF: offsets are back in control-point space, so handles follow skeleton-handle geometry again
9. detached ON/OFF toggle preserves visual continuity (no jump on mode switch)

## Scenario 5: Editable generated handles (from rib side)
- Setup: contour with editable generated handles available on both sides.
- Action:
1. drag editable generated handle
2. drag with `X` where equalize pair exists
3. nudge editable generated handle with arrows
4. repeat 1-3 with detached OFF and detached ON
- Expected:
1. movement constrained along corresponding skeleton-handle direction
2. `X` equalize works only with valid in/out pairing
3. detached OFF: drag/arrows update 1D offset (2D cleared unless equalize path writes 2D)
4. detached ON: drag/arrows update 2D offsets and keep detached semantics
5. offset representation remains stable (no random switch corruption between 1D/2D semantics)

## Scenario 6: Generated contour interactions in measure/tunni
- Setup: mixed glyph containing regular contours and skeleton-generated contours.
- Action:
1. test regular Tunni hit/drag near generated contours
2. test Q-measure hover near generated contours and near underlying skeleton segments
- Expected:
1. regular Tunni does not target generated contours
2. measure behavior follows current implementation: skeleton segment priority first, then path segment search (including generated where applicable)
3. no accidental cross-targeting between generated and source skeleton points

## Scenario 7: Main parity mini-check (regular-only)
- Setup: glyph with only regular points/handles (no skeleton/rib artifacts).
- Action:
1. hover/select/drag point
2. hover/select/drag handle
3. arrow nudge
4. undo/redo
5. Q/Alt+Q
- Expected:
1. regular pointer UX is aligned with `main` baseline
2. no fork-only side effects leak into regular-only flow

---

## Record template
Use one block per run:

```md
Run date:
Commit:
Tester:

[ ] Scenario 1
[ ] Scenario 2
[ ] Scenario 3
[ ] Scenario 4
[ ] Scenario 5
[ ] Scenario 6
[ ] Scenario 7

Notes:
- ...
```
