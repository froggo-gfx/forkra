# Cap Logic Overview

This document is a working map of skeleton cap logic for future sessions. It is not a spec. Its job is to answer:

- where cap behavior is defined
- which functions matter
- how parameters flow from UI to generator
- which recent cap invariants are intentional
- where to start when cap behavior needs to change again

## Primary Files

### Core generator

- `src-js/fontra-core/src/skeleton-contour-generator.js`
  - Main source of truth for cap generation.
  - Handles open-contour cap style resolution, round-cap reconstruction, square-cap extras, fallback caps, single-sided width collapsing, normalization, and emitted outline assembly.

### Editor UI

- `src-js/views-editor/src/panel-skeleton-parameters.js`
  - Exposes cap controls in the editor.
  - Maps the round-cap radius slider index to `capRadiusRatio`.
  - Writes `capStyle`, `capRadiusRatio`, `capTension`, `capAngle`, and `capDistance` onto points or contour defaults.

- `src-js/views-editor/src/edit-tools-skeleton.js`
  - Carries skeleton defaults into new contours / editing flows.
  - Useful when the bug looks like a UI-default or source-default problem rather than a generator problem.

### Existing implementation plan

- `docs/superpowers/plans/2026-03-18-skeleton-round-cap-redesign.md`
  - Historical implementation plan for the split-outline round-cap redesign.
  - Useful for intent and helper naming, but the code is now ahead of the plan in some details.

## High-Level Flow

### 1. UI stores cap parameters

The editor stores cap-related data on points and/or contours:

- `capStyle`
- `capRadiusRatio`
- `capTension`
- `capAngle`
- `capDistance`

Relevant UI references:

- `panel-skeleton-parameters.js:61-66`
  - round-cap slider constants
  - `CAP_RADIUS_MIN = 1 / 128`
  - `CAP_RADIUS_MAX = 1 / 4`
  - `CAP_RADIUS_POSITIONS = 20`

- `panel-skeleton-parameters.js:1583-1603`
  - round-cap radius and tension sliders

- `panel-skeleton-parameters.js:3735-3748`
  - `_capRadiusRatioFromIndex(index)`
  - logarithmic mapping from slider index to ratio

Important consequence:

- slider position `20` maps exactly to `1 / 4`
- in generator terms, that is the exact maximum cap radius
- this is why max roundness has historically been a special boundary

### 2. Generator normalizes contour and point data

Relevant generator references:

- `skeleton-contour-generator.js:2890`
  - `normalizeCapStyle(style)`

- `skeleton-contour-generator.js:4078-4156`
  - contour / point normalization
  - `clampCapRadiusRatio(...)`
  - `capStyle`, `capRadiusRatio`, `capTension` normalization

Notes:

- UI still uses `"flat"` in places, but generator normalizes that to `"butt"`.
- Round-cap radius is clamped to `MAX_CAP_RADIUS_RATIO`, currently `1 / 4`.

### 3. Open contour generation resolves cap style per endpoint

Main entry point:

- `skeleton-contour-generator.js:1118`
  - `generateOutlineFromSkeletonContour(skeletonContour, options = {})`

Open-contour cap branching happens in the main open-outline block:

- `skeleton-contour-generator.js:1292-1524`

The important sequence there is:

1. Build raw offset sides for each segment.
2. Apply corner rounding to left and right sides.
3. Resolve endpoint cap styles from point override or contour default.
4. For `round`, rebuild the terminal geometry from split side outlines.
5. For `square`, add local extra points.
6. For fallback / non-round styles, call `generateCap(...)`.
7. Assemble one final closed outline from:
   - left side
   - end cap
   - reversed right side
   - start cap

## Important Generator Functions

### Main cap resolution

- `generateOutlineFromSkeletonContour(...)`
  - start/end cap style resolution
  - per-endpoint parameter sourcing
  - single-sided redistribution of half-widths
  - calls round-cap helpers

### Round-cap frame and trimming

- `skeleton-contour-generator.js:3039`
  - `getRoundCapFrame({...})`
  - derives:
    - `radiusFactor`
    - `trimDistance`
    - `capTangent`

Current behavior:

- `radiusFactor = capRadiusRatio / MAX_CAP_RADIUS_RATIO`
- `trimDistance = maxProjectionShift * radiusFactor`

This means higher roundness currently increases inward trimming. That is the current code behavior and may or may not match the earlier written design. If roundness progression feels wrong, this is one of the first places to inspect.

### Terminal-side splitting

- `skeleton-contour-generator.js:3176`
  - `splitTerminalSideForRoundCap(sidePoints, sidePosition, trimDistance, fallbackDirections)`

Responsibilities:

- locate the terminal segment on one side
- split a line or cubic inward from the endpoint
- insert exactly one new on-curve
- preserve enough of the side outline so cap reconstruction stays local
- return:
  - rewritten `sidePoints`
  - `insertedPoint`
  - `referenceEndpoint`
  - `tangentToEndpoint`
  - related indices

Supporting helpers nearby:

- `solveTerminalSplitForDistance(...)`
- `getRoundCapTerminalSegment(...)`
- `resolveRoundCapFallbackDirection(...)`

### Emitted-side trimming

- `skeleton-contour-generator.js:3412`
  - `trimSideForRoundCapEmission(...)`

Role:

- remove the consumed original endpoint from the emitted side
- strip hanging off-curves at the start/end after trimming

This helper matters because broken trimming can leave stray terminal off-curves in the emitted side arrays.

### Round-cap reconstruction

- `skeleton-contour-generator.js:3455`
  - `buildRoundCapGeometry({...})`

This is the key round-cap function now.

Inputs:

- inserted split points on left and right
- tangents from those inserted points toward the original endpoint
- original reference endpoints
- cap tangent
- cap tension
- radius factor
- cap width
- `preserveCoincidentMaxRadiusEndpoints`

Responsibilities:

- derive cap-frame normal from the two reference endpoints
- derive pre-collapse final endpoints from normal shift
- choose between:
  - merged-tip topology
  - two-endpoint topology
  - preserved coincident-endpoint topology at max roundness
- build the cap-local cubic segments with `computeTunniHandleLengths(...)`

### Round-cap local segments

- `buildRoundCapSegment(...)`

Role:

- construct one local cubic corner segment
- degrade to a straight terminal segment when directions or handle lengths are unusable

This helper is where "wacky normals" often become visible as extreme handle directions, but the root cause is usually earlier in axis selection or tangent derivation.

### Final open-outline assembly

- `skeleton-contour-generator.js:3745`
  - `assembleOpenOutlineWithRoundCaps({...})`

Role:

- combine:
  - `leftSide`
  - `endCap`
  - reversed `rightSide`
  - `startCap`

This helper is intentionally simple. If cap point counts or order look wrong, inspect the inputs first.

### Legacy / fallback cap generator

- `generateCap(...)`

Still used for:

- non-round fallback cap generation
- behavior outside the split-outline round-cap path

If a contour endpoint is not resolving to `round`, this is where the code ends up instead.

## Current Round-Cap Invariants

These are the important current rules as of the latest cap fixes on this branch.

### 1. Round caps are built from split side outlines

Round caps no longer use the older projected scaffold logic. The round-cap shape is rebuilt after splitting each side inward from the endpoint.

### 2. Max roundness can preserve two coincident endpoints

At exact maximum roundness, the code can preserve two cap endpoints that share the same coordinates instead of collapsing to one merged tip.

This behavior is currently enabled by passing:

- `preserveCoincidentMaxRadiusEndpoints: true`

at both round-cap call sites in `generateOutlineFromSkeletonContour(...)`.

### 3. This now applies to both single-sided and double-sided mode

Recent fixes extended the preserved-topology behavior from single-sided to double-sided caps as well.

### 4. Coincident endpoints need a stable axis

When `finalLeft` and `finalRight` are intentionally coincident, the endpoint span is zero. In that case, the cap must not derive its tip axis from tiny rounded coordinate residue.

Current fix:

- use a stable coincident-endpoint axis derived from the cap frame / inserted-point span
- do not rely on `preCollapseLeft - preCollapseRight` if that span only exists because of rounding noise

This was the cause of the earlier 1px-shift instability in single-sided max roundness.

### 5. `skipColinear` matters

Round-cap endpoints created through the two-endpoint path are marked with:

- `smooth: true`
- `skipColinear: true`

This protects them from later smooth-colinearity rewriting. If cap handles unexpectedly reorient after reconstruction, check whether the points were emitted through the intended endpoint helper and whether `skipColinear` survived.

## Single-Sided Notes

Single-sided mode is handled much earlier than cap reconstruction.

Relevant area:

- `skeleton-contour-generator.js:1165-1183`
- `skeleton-contour-generator.js:1275-1290`

What happens:

- left/right half-widths are redistributed so one side gets the full width and the other gets zero
- this affects both segment offset generation and cap width calculation

Implication:

- single-sided cap bugs often look like "cap logic" bugs, but they can start with width redistribution before the cap branch is reached

## Square And Butt Caps

Round-cap work should avoid destabilizing other cap styles.

In `generateOutlineFromSkeletonContour(...)`:

- `round` uses the split-outline reconstruction helpers
- `square` uses local extra point generation from cap angle / cap distance
- `butt` and fallback paths still go through `generateCap(...)`

When changing round-cap logic, explicitly check that:

- cap-style resolution still lands on the expected branch
- square caps still use cap angle / distance only
- butt caps remain unchanged

## Debugging Map

When debugging a cap issue, start in this order.

### 1. Confirm the endpoint actually resolves to the style you think it does

Check:

- contour default `capStyle`
- point-level `capStyle`
- normalization from `"flat"` to `"butt"`

Many earlier "wrong branch" debugging passes came from instrumenting the wrong endpoint or assuming `round` when the endpoint actually resolved to `butt`.

### 2. Confirm whether the bug is on the start or end cap

The start and end round-cap branches are mirrored, not identical. Point ordering and tangent orientation differ.

### 3. Inspect split results before inspecting handles

The highest-signal values are usually:

- `insertedLeft`
- `insertedRight`
- `referenceLeft`
- `referenceRight`
- `leftTangentToEndpoint`
- `rightTangentToEndpoint`
- `finalLeft`
- `finalRight`
- `tipLineDirection` or merged-tip axis

If these are wrong, handle logs are just downstream noise.

### 4. Treat max roundness as a boundary case

Because slider `20` maps to exact max radius, bugs that only happen at `20` often come from:

- topology switching
- coincident-endpoint handling
- zero-span axis fallback
- post-processing assumptions about nonzero endpoint span

## Recent Commits Worth Reading

- `32708753b`
  - `refactor: add round cap reconstruction and assembly helpers`

- `b478266b1`
  - `feat: switch start round caps to split-outline geometry`

- `9755e6253`
  - `feat: switch end round caps to split-outline geometry`

- `1b16dd62e`
  - `fix: stabilize single-sided max-round cap axis`

- `8959fcda3`
  - `fix: preserve double-sided max-round cap topology`

The two latest fixes are the important context for any future work around max roundness.

## Practical Starting Points For Future Changes

### If changing roundness progression

Start with:

- `getRoundCapFrame(...)`
- UI slider mapping in `panel-skeleton-parameters.js`

Questions:

- should trim distance increase or decrease with radius?
- should the visual roundness progression remain logarithmic in the UI?

### If changing max-roundness topology

Start with:

- `buildRoundCapGeometry(...)`

Questions:

- should max radius preserve two coincident endpoints or merge to one tip?
- should that behavior differ between single-sided and double-sided?

### If changing cap-local curve feel

Start with:

- `buildRoundCapSegment(...)`
- `computeTunniHandleLengths(...)`
- `capTension`

Question:

- is the problem actually handle shaping, or is the upstream tip axis already wrong?

### If debugging a "wrong cap" report

Start with:

- cap-style resolution in `generateOutlineFromSkeletonContour(...)`
- point-vs-contour parameter sourcing in the editor and normalized contour data

## Current Gaps / Cautions

- The historical design docs referenced by earlier plan files are not present in this workspace right now, so treat the code as the primary source of truth.
- The current `trimDistance` behavior may differ from the older design intent.
- Max roundness is still a mathematically fragile boundary because some geometric spans intentionally collapse to zero there.
- Any future logging should target resolved endpoint style and split geometry first, not just generic contour regeneration.
