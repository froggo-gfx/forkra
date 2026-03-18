# Skeleton Round Cap Redesign

## Summary

Redesign open skeleton `round` cap generation so it starts from the same flat-cap outline geometry and then rounds locally, instead of projecting a separate outer cap scaffold. The new round-cap path should preserve the generated side-segment shape up to the split point, insert one additional on-curve point on each terminal side, and perform rounding between those inserted points and the flat-cap endpoints.

## Context

Current round-cap generation in [src-js/fontra-core/src/skeleton-contour-generator.js](/C:/Users/frena/Desktop/fontra-test/src-js/fontra-core/src/skeleton-contour-generator.js) builds a cap by:

- projecting additional points outward from the terminal rib endpoints
- constructing corner cubics toward those projected points
- optionally merging the cap tip at maximum radius

This works, but switching between `flat` and `round` can change the overall outline geometry in a way that is hard to predict. The requested behavior is to keep the flat-cap-derived outline as the base geometry and only change the terminal corner construction.

## Goals

- Make `round` cap geometry derive from the same flat-cap outline as `butt`/`flat`.
- Preserve the shape of the generated terminal side segments before the rounded corner begins.
- Always emit exactly one new on-curve point into each terminal side of an open contour when generating a round cap, including degenerate or near-zero-radius cases.
- Reuse the existing cap trim behavior driven by `capRadiusRatio`.
- Keep the change local to the generator and avoid schema or UI changes.

## Non-Goals

- No changes to closed skeleton contours.
- No changes to `square` or `butt` cap behavior.
- No changes to skeleton custom-data schema, serialization, or parameter UI.
- No attempt to redesign manual rib editing rules at round endpoints.
- No automated tests in this task. Validation is manual by user request.

## Chosen Approach

Use the existing flat-cap outline as the starting geometry for open `round` caps, then replace the current projected-point cap scaffold with a split-and-round workflow:

1. Generate left and right outline sides exactly as usual.
2. Keep the flat-cap terminal on-curve endpoints already produced by the side generation.
3. Insert one new on-curve point into each terminal side segment by splitting the existing generated segment.
4. Use the same trim distance currently computed in the round-cap branch as `projectedTangentShift`.
5. Build the rounded cap corner between the inserted point and the cap endpoint on each side.
6. Join the adjusted cap endpoints across the tip without reintroducing projected outer side points.

This preserves base outline predictability while still allowing round-cap radius and tension controls to affect the terminal corner.

## Geometry Design

### Base Geometry

For open contours, the generator should continue to:

- generate `roundedLeftSide` and `roundedRightSide`
- derive the open outline from left side, end cap, reversed right side, and start cap

For `round` caps only, the cap branch should first treat the terminal side geometry as if the cap were flat. That means the flat-cap endpoints are the initial cap endpoints and remain the reference anchors for the round-cap transformation.

Terminology used below:

- `reference endpoint`: the flat-cap endpoint produced before round-cap adjustments
- `final endpoint`: the point actually used in the round cap after inward adjustment

### Inserted Points

Each open `round` cap inserts two on-curve points total as a hard invariant:

- one point on the terminal left-side segment
- one point on the terminal right-side segment

These points are inserted into the existing generated outline segments, not into the skeleton centerline.

Requirements:

- If the terminal side segment is cubic, split the generated cubic and rebuild the segment with the new on-curve while preserving the original segment shape.
- If the terminal side segment is linear, place the new on-curve by interpolation.
- The insertion distance is measured inward from the reference endpoint along the terminal side segment.
- The insertion distance uses the current round-cap tangent-slide amount:
  - `clampedCapRadiusRatio = min(max(capRadiusRatio, 0), MAX_CAP_RADIUS_RATIO)`
  - `radiusFactor = clampedCapRadiusRatio / MAX_CAP_RADIUS_RATIO`
  - `maxProjectionShift = max(capWidth / 2 - capWidth / 128, 0)`
  - `trimDistance = maxProjectionShift * (1 - radiusFactor)`
- This is the same value currently used in the round-cap branch as `projectedTangentShift`.
- No new parameter is introduced.

For cubic terminal segments, the split location is defined by arc length, not by raw Bezier parameter:

- measure distance from the reference endpoint backward along the terminal cubic
- solve `t` by binary search using BezierJS length evaluation on the relevant sub-curve
- target absolute distance error of at most `0.5` font units or stop when successive `t` updates are below `1e-4`
- once `t` is found, use `Bezier.split(t)` to materialize the rewritten cubic halves

For linear terminal segments:

- use direct interpolation by ratio `trimDistance / segmentLength`
- clamp the ratio to `[0, 1]`

Degenerate trim handling:

- compute `effectiveTrimDistance = clamp(trimDistance, 0, terminalSegmentLength)`
- if `terminalSegmentLength >= 2` and `effectiveTrimDistance < 1`, use `1` unit instead so the split survives coordinate rounding
- if the solved split location would collapse onto the reference endpoint after rounding, back the inserted point off along `fallbackEndpointTangent` by at least `1` font unit before rounding
- if `terminalSegmentLength < 2` or the terminal tangent cannot be normalized stably, still emit a new inserted point object on that side using synthesized geometry:
  - place the inserted point one font unit inward from the reference endpoint along `fallbackEndpointTangent`
  - if `fallbackEndpointTangent` is also unstable, fall back to the terminal segment chord direction; if that is unavailable, fall back to the contour's cap tangent direction
- the inserted point must always be emitted as a distinct on-curve in round-cap mode, even if the resulting geometry is extremely small

### Endpoint Adjustment

After the inserted points exist, the cap endpoints may be shifted inward toward the centerline using the same radius-factor behavior already driven by:

- `capRadiusRatio`
- `MAX_CAP_RADIUS_RATIO`
- cap width

The redesign removes the old requirement to generate four new outer cap scaffold points. Instead:

- the reference endpoints come from the flat-cap geometry
- the final endpoints are derived from those reference endpoints by moving them inward toward the centerline
- the inserted side points remain on the original side curves produced by the flat-cap geometry

The inward shift should preserve the current radius-based centerline movement:

- `normalShift = (capWidth / 2) * radiusFactor`
- define `capNormal` as the normalized vector from the right reference endpoint to the left reference endpoint before inward adjustment
- move the right reference endpoint by `+capNormal * normalShift`
- move the left reference endpoint by `-capNormal * normalShift`
- if that vector cannot be normalized stably, derive `fallbackCapNormal = rotate90CW(capTangent)`
- if `capWidth <= 0`, use the canonical zero-width topology: keep both inserted side points and emit one `tipPoint` at the midpoint of the two reference endpoints instead of two final endpoints
- otherwise, use `fallbackCapNormal` in place of `capNormal` for endpoint derivation

No forward tangent projection is applied to the final endpoints in the redesigned round cap.

Endpoint derivation decision table:

- normal case:
  - derive `capNormal` from reference endpoints
  - emit `finalRightEndpoint` and `finalLeftEndpoint`
- merged-tip case:
  - derive separate final endpoints first
  - if `radiusFactor >= 1 - 1e-6` or the final endpoints become coincident within `0.5` units, collapse them to one emitted `tipPoint`
- fragile/unstable-normal case:
  - if `capNormal` is unstable and `capWidth > 0`, derive endpoints with `fallbackCapNormal = rotate90CW(capTangent)`
  - if that still fails or `capWidth <= 0`, emit one `tipPoint` instead of two final endpoints while preserving both inserted side points

### Rounded Corner Construction

The rounded cap becomes a local corner-rounding problem on each side:

- right inserted point -> final right endpoint
- final left endpoint -> left inserted point

The curve construction should preserve the existing role of `capTension`. Use the existing `computeTunniHandleLengths(...)` helper in [src-js/fontra-core/src/skeleton-contour-generator.js](/C:/Users/frena/Desktop/fontra-test/src-js/fontra-core/src/skeleton-contour-generator.js) for the replacement corner cubics.

Required tangent contract:

- at each inserted point, the corner cubic must be tangent to the original side geometry, using `tangentToEndpoint` from the split helper
- at each final endpoint, the corner cubic must be tangent to the cap tip line connecting the two final endpoints
- define `capTangent` explicitly as:
  - start cap: `capTangent = -startTangent`
  - end cap: `capTangent = endTangent`
- for the start cap, the cap-local landmark order is `insertedRight -> finalRight -> finalLeft -> insertedLeft`
- for the end cap, the cap-local landmark order is `insertedLeft -> finalLeft -> finalRight -> insertedRight`
- in the merged-tip case, replace `finalRight/finalLeft` with one `tipPoint` and use `tipTangent` instead of a tip-line tangent
- call `computeTunniHandleLengths(...)` with those geometric tangents as inputs on both sides

### Point Metadata Rules

Metadata must be explicit so post-processing does not reshape the new cap unexpectedly.

Inserted split points:

- set `smooth: true`
- do not set `skipColinear`
- preserve the split cubic handles created by `Bezier.split(t)` as ordinary cubic off-curves

Final cap endpoints:

- create fresh point objects derived from the reference endpoints
- set `smooth: true`
- set `skipColinear: true`
- do not carry corner-rounding metadata onto these cap points unless the current round-cap branch already does so explicitly

Reference endpoints inside the rewritten side arrays:

- remain part of side generation only as source geometry
- are not reused as the final cap endpoint objects after inward adjustment

### Tip Connection

The tip connection between the left and right final endpoints should no longer rely on projected outer side points.

Required behavior:

- In the normal case, connect `finalRightEndpoint` to `finalLeftEndpoint` with a direct line segment, matching the current outline topology where the two inward tip points are consecutive on-curves.
- At maximum radius (`radiusFactor >= 1 - 1e-6`), collapse the two final endpoints to their midpoint, preserving the current merged-tip behavior.
- No additional projected outer side points are introduced.
- The side geometry remains inherited from the flat-cap outline.

Merged-tip rule:

- when the two final endpoints collapse to a single midpoint, do not use a tip-line tangent
- instead, treat the cap as two corner cubics meeting at one `tipPoint`
- derive `tipTangent` using this fallback chain:
  - pre-collapse left-to-right cap direction when available
  - otherwise `fallbackCapNormal = rotate90CW(capTangent)`
  - otherwise the normalized vector from right inserted point to left inserted point
- use `tipTangent` as the tangent input at the shared `tipPoint` for both corner cubics
- emit only one on-curve `tipPoint` in this case; do not emit duplicate coincident final endpoints

### Outline Assembly Contract

Round-cap reconstruction replaces the terminal portion of each side. The original terminal reference endpoints are source geometry only and must not be emitted as final outline on-curves once the round cap is assembled.

Assembly phases:

1. Generate full side arrays.
2. Split terminal side segments for round caps and obtain inserted points plus reference endpoints.
3. Build emitted side views by dropping the consumed terminal reference endpoints on the capped side(s).
4. Build cap geometry from inserted points and final endpoints.
5. Assemble the final outline from emitted side views plus cap geometry.

Emission rules:

- For a start round cap:
  - drop the first reference endpoint from `roundedLeftSide`
  - drop the first reference endpoint from `roundedRightSide`
  - the start-cap geometry replaces the span from `insertedRightStart` across the tip to `insertedLeftStart`
- For an end round cap:
  - drop the last reference endpoint from `roundedLeftSide`
  - drop the last reference endpoint from `roundedRightSide`
  - the end-cap geometry replaces the span from `insertedLeftEnd` across the tip to `insertedRightEnd`
- A consumed reference endpoint must appear either in the side array or as source data for cap reconstruction, never both in the emitted outline.
- This rule still applies when only one side uses synthesized inserted-point geometry:
  - that side's reference endpoint is still consumed and dropped from the emitted side array
  - the synthesized inserted point becomes the emitted side-side anchor for cap reconstruction
  - the opposite side follows the normal split-based path

Emitted on-curve templates:

- normal start cap: `insertedRightStart -> finalRightStart -> finalLeftStart -> insertedLeftStart`
- normal end cap: `insertedLeftEnd -> finalLeftEnd -> finalRightEnd -> insertedRightEnd`
- merged-tip start cap: `insertedRightStart -> tipPoint -> insertedLeftStart`
- merged-tip end cap: `insertedLeftEnd -> tipPoint -> insertedRightEnd`
- one-side fragile start cap: `insertedRightStart -> finalRightStart -> finalLeftStart -> insertedLeftStart`, where either inserted point may be synthesized rather than split-derived
- one-side fragile end cap: `insertedLeftEnd -> finalLeftEnd -> finalRightEnd -> insertedRightEnd`, where either inserted point may be synthesized rather than split-derived

Private phases/helpers should be separated conceptually as:

- terminal side split
- emitted side trimming
- round-cap reconstruction
- final outline assembly

Suggested private interfaces:

- `trimSideForRoundCapEmission(sidePoints, sidePosition, referenceEndpointIndex)`
  - input: rewritten side array, cap position, consumed reference endpoint index
  - output: emitted side array with the consumed reference endpoint removed
- `buildRoundCapGeometry({ position, insertedLeft, insertedRight, referenceLeft, referenceRight, capTangent, capTension, radiusFactor, capWidth })`
  - input: cap-local geometry and parameters after side splitting
  - output:
    - `capPoints`: unpacked point array for that cap section only
    - `finalEndpoints`: `{ left, right }` when two endpoints survive
    - `tipPoint`: single on-curve when the cap is merged or collapsed
    - `isMergedTip`: boolean
- `assembleOpenOutlineWithRoundCaps({ leftSide, endCap, rightSide, startCap })`
  - input: already-trimmed side arrays plus cap point arrays
  - output: final open-outline point sequence before metadata stripping

### Degenerate Whole-Cap Behavior

If the cap as a whole becomes numerically fragile, preserve the round-cap topology instead of falling back to flat-cap topology.

Treat the whole cap as fragile when any of these holds:

- `capWidth <= 0`
- both final endpoints are coincident before a valid corner can be formed
- both terminal tangents are numerically unstable

Whole-cap fragile fallback:

- keep the two inserted side points and the cap-local topology for round mode
- do not restore unsplit side arrays for final emission
- synthesize the simplest stable round-cap geometry using the available points:
  - the two inserted side points
  - the two final endpoints, or one merged `tipPoint` at max radius or zero width
- if corner cubic handle directions cannot be solved stably, degrade those corner segments to straight segments while preserving the added on-curve points
- if the two final endpoints become coincident or numerically indistinguishable, collapse them to one emitted `tipPoint`
- emitted point order in fragile fallback must still follow the corresponding template from the outline-assembly section
- preserve round-cap topology rather than falling back to flat-cap topology

## Code Boundaries

All production changes should stay in [src-js/fontra-core/src/skeleton-contour-generator.js](/C:/Users/frena/Desktop/fontra-test/src-js/fontra-core/src/skeleton-contour-generator.js).

### New Helper

Add one focused helper for terminal side splitting. Its responsibilities:

- identify the terminal generated segment on a side array for `start` or `end`
- accept a trim distance measured inward from the reference endpoint
- compute the split position on that terminal segment
- split the segment without changing its pre-split shape
- return:
  - rewritten side points
  - inserted on-curve point
  - inserted on-curve index within the rewritten side array
  - tangent direction at the inserted point oriented toward the reference endpoint
  - the unmodified reference endpoint point object or index

Suggested helper shape:

`splitTerminalSideForRoundCap(sidePoints, sidePosition, trimDistance, fallbackDirections)`

Required interface:

- input:
  - `sidePoints`: original side point array
  - `sidePosition`: `"start"` or `"end"`
  - `trimDistance`: inward distance from the reference endpoint
  - `fallbackDirections`:
    - `endpointTangent`: normalized terminal tangent from the originating side segment
    - `chordDirection`: normalized terminal segment chord direction
    - `capTangent`: cap tangent for this endpoint
- mutation:
  - must not mutate `sidePoints`
  - must return a rewritten side array
- output:
  - `sidePoints`: rewritten side array
  - `insertedPointIndex`: numeric index in the rewritten side array
  - `insertedPoint`: the new on-curve point object
  - `referenceEndpointIndex`: numeric index of the unchanged reference endpoint in the rewritten side array
  - `referenceEndpoint`: the unchanged reference endpoint point object from the rewritten side array
  - `tangentToEndpoint`: normalized tangent direction at the inserted point pointing toward the reference endpoint, using the fallback chain `endpointTangent -> chordDirection -> capTangent` when necessary

Execution order:

- run this helper before any final outline-level metadata stripping
- keep side arrays in their rich point form until cap assembly is complete

The helper should be reusable by both start-cap and end-cap logic so the two branches do not diverge.

### Start And End Round Cap Branches

Refactor the duplicated `startIsRound` and `endIsRound` branches so they both follow the same sequence:

1. Read cap parameters from endpoint or contour defaults.
2. Compute radius factor and trim amount.
3. Split left and right terminal side segments.
4. Derive final endpoints by moving the reference endpoints inward by `normalShift`.
5. Build replacement corner cubics using inserted points and final endpoints.
6. Assemble the cap point list without projected outer scaffold points.

### Unchanged Areas

The following should remain behaviorally unchanged:

- closed-contour outline generation
- side generation before cap construction
- corner rounding away from open endpoints
- cap parameter normalization and persistence
- editor-side parameter panels

## Implementation Constraints

- Preserve existing point ordering expectations in the final open outline.
- Preserve compatibility with existing smooth-point and colinearity enforcement.
- Do not add new public API unless a private helper is insufficient.
- Introduce the split logic locally in the generator; do not assume an existing generator helper already covers this behavior.
- Use BezierJS primitives directly for the cubic case, specifically arc-length evaluation plus `Bezier.split(t)`.

## Manual Verification

Per user instruction, verification is manual.

Minimum manual checks:

- toggle the same open skeleton endpoint between `flat` and `round` and confirm side geometry stays stable until the rounded corner begins
- inspect both start and end caps
- inspect a terminal line segment and a terminal cubic segment
- inspect multiple `capRadiusRatio` values including maximum radius
- inspect different `capTension` values
- inspect asymmetric left/right widths
- inspect a very short terminal segment where the inserted point must be synthesized
- inspect a near-zero-width or zero-width cap case
- inspect a case where the fallback tangent/normal path is exercised
- confirm exported outline remains closed and sensible in the editor
- confirm untouched `butt` and `square` caps still behave as before

## Risks

- Mapping trim distance to a cubic split position may be inaccurate if implemented purely in parameter space rather than curve distance.
- Start and end cap behavior can drift if the refactor leaves duplicated geometry code.
- Existing smoothing or colinearity post-processing may alter the intended cap shape if metadata on inserted or adjusted points is inconsistent.
- Manual-only verification increases regression risk for future generator work.

## Open Decisions Resolved

- The inserted points belong to the generated outline, not the skeleton centerline.
- The insertion distance uses the same trim rule already implied by the current round-cap logic.
- No extra visual companion or external mockup workflow is needed for this task.
