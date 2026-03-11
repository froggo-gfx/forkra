# Skeleton Generator Stabilization Plan

## Context

We are investigating instability in generated skeleton outline handles inside
`src-js/fontra-core/src/skeleton-contour-generator.js`.

The near-zero handle-direction fix improved one class of bug, but there is still
broader instability where generated cubic handles can reconfigure in jumps while
dragging skeleton points.

Current working assumption:
- the main remaining source of instability is the `Bezier.offset()` ->
  `simplifyOffsetCurves()` -> `fitCubic()` path
- the issue is most visible on smooth-point scenarios
- the problem is not that the minimum non-zero handle step can be diagonal
- the problem is that generated cubic structure is recomputed too eagerly and
  can jump between locally valid approximations

## Goal

Explore two stabilization strategies in separate branches:

- `codex/skeleton-fit-hysteresis`
- `codex/skeleton-handle-ratio`

Both branches should start from the same committed base and should target the
same file first:

- `src-js/fontra-core/src/skeleton-contour-generator.js`

## Shared Groundwork

Both strategies likely need access to previous generated contour geometry during
regeneration.

Primary entry point:
- `regenerateSkeletonContours(...)`
  in `src-js/fontra-core/src/skeleton-contour-generator.js`

Likely shared tasks:
1. Extract previous generated contour geometry from `staticGlyph.path` using
   `skeletonData.generatedContourIndices`
2. Map previous generated cubic data to current skeleton segment / side
3. Pass previous generated data into the contour generation pipeline without
   persisting new user-facing data into skeleton custom data

Key generator touchpoints:
- `generateContoursFromSkeleton(...)`
- `generateOffsetPointsForSegment(...)`
- `simplifyOffsetCurves(...)`

## Branch A: Fit Hysteresis

Branch:
- `codex/skeleton-fit-hysteresis`

### Intent

Keep the current fit-based generation model, but stop the generator from
switching immediately to a newly fitted cubic when the previous generated cubic
is still acceptable.

### Proposed Strategy

1. Recover previous generated cubic geometry for the current segment side
2. Compute a fresh fitted cubic as today
3. Compare:
   - previous cubic error against current sampled offset geometry
   - fresh fitted cubic error against current sampled offset geometry
4. Use hysteresis thresholds:
   - keep threshold
   - replace threshold
5. Only switch to the new fit when the previous cubic is clearly worse beyond
   the hysteresis window

### Main Touchpoints

- `simplifyOffsetCurves(...)`
- `generateOffsetPointsForSegment(...)`
- `regenerateSkeletonContours(...)`

### Expected Benefit

- less frame-to-frame handle jumping
- fewer abrupt topology/configuration changes from tiny drag deltas
- minimal change to the current generation model

### Main Risks

- matching previous generated cubic to the correct current segment / side
- choosing hysteresis thresholds that reduce jumping without making the shape
  lag too much

## Branch B: Handle Ratio Carry-Forward

Branch:
- `codex/skeleton-handle-ratio`

### Intent

Use previous generated cubic handle structure as the primary continuity source,
instead of refitting from scratch every frame.

### Proposed Strategy

1. Recover the previous generated cubic for the current segment side
2. Derive normalized handle parameters from it, such as:
   - start handle length / chord length
   - end handle length / chord length
   - handle direction relation to segment tangents
3. Recompute endpoints and tangents from the current skeleton geometry
4. Rebuild the generated handles from the preserved normalized parameters
5. Use fresh fit only when:
   - there is no previous generated cubic
   - the previous parameterization becomes invalid
   - recovery is needed after a topology break

### Main Touchpoints

- `generateOffsetPointsForSegment(...)`
- `generateContoursFromSkeleton(...)`
- `regenerateSkeletonContours(...)`

### Expected Benefit

- stronger visual continuity during drag
- generated handles evolve from prior state instead of reappearing as a new fit
- likely better long-term behavior than pure hysteresis

### Main Risks

- choosing the right normalized parameters
- preserving continuity without locking the shape into a stale configuration
- handling larger geometry changes where the old ratio is no longer a good model

## Recommended Order

1. Implement `codex/skeleton-fit-hysteresis` first
2. Validate whether it materially reduces jumping
3. Implement `codex/skeleton-handle-ratio` second
4. Compare both branches on the same manual drag cases

Rationale:
- hysteresis is lower-risk and faster to validate
- ratio carry-forward is more invasive, but may be the better long-term model

## Manual Comparison Checks

For both branches, compare against current behavior on the same glyph/segment
set:

1. Drag a smooth skeleton point through the problematic corner case slowly
2. Drag back and forth across the previously jumpy region
3. Watch whether generated cubic handles:
   - change octant abruptly
   - change configuration abruptly
   - preserve continuity under tiny motion deltas
4. Check both narrow-width and regular-width cases
5. Check both sides when asymmetry or single-sided-like behavior is nearby

## Non-Goals

- Do not redesign single-sided / collapsed-side behavior in this pass
- Do not redesign corner-rounding behavior in this pass
- Do not change user-facing skeleton data schema for this exploration
