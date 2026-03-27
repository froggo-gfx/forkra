# Single-Sided Max-Roundness Cap Topology Detailed Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the existing two-endpoint round-cap construction for single-sided caps at slider position `20`, so exact max roundness only makes the two cap endpoints coincide and does not trigger a separate merged-tip algorithm.

**Architecture:** The change stays entirely inside `src-js/fontra-core/src/skeleton-contour-generator.js`. `buildRoundCapGeometry(...)` already has two internal modes: normal two-endpoint mode and merged-tip mode. This plan adds a narrow single-sided-only override so the exact-max case stays in the normal mode, with coincident endpoints, while leaving the broader merged-tip behavior in place for double-sided and other collapse cases. No editor-side changes, schema changes, or trim-math changes are included in this pass.

**Tech Stack:** JavaScript, Fontra core skeleton generator, existing webpack bundle, manual editor verification.

---

**Background References:**
- `docs/superpowers/plans/2026-03-27-single-sided-max-roundness-cap-topology.md`
- `docs/superpowers/specs/2026-03-18-skeleton-round-cap-redesign-design.md`
- `src-js/views-editor/src/panel-skeleton-parameters.js`
- `src-js/fontra-core/src/skeleton-contour-generator.js`

**Execution Rules For This Plan:**
- Do not add automated tests in this pass. The user explicitly wants manual testing only.
- Do not change `trimDistance` mapping in `getRoundCapFrame(...)`.
- Do not change double-sided max-radius behavior.
- Do not change non-max-radius behavior.
- Do not refactor unrelated round-cap code while implementing this.

## File Structure

| File | Responsibility |
|------|----------------|
| `src-js/fontra-core/src/skeleton-contour-generator.js` | Contains the single-sided max-radius topology fix. |
| `docs/superpowers/plans/2026-03-27-single-sided-max-roundness-cap-topology.md` | High-level scope summary for this fix. |
| `src-js/views-editor/src/panel-skeleton-parameters.js` | Reference-only source showing slider-to-radius mapping. |

## Chunk 1: Confirm The Current Boundary And Failure Shape

### Task 1: Verify Why Slider `20` Is Special

**Files:**
- Reference: `src-js/views-editor/src/panel-skeleton-parameters.js:64-66`
- Reference: `src-js/views-editor/src/panel-skeleton-parameters.js:3735-3740`
- Reference: `src-js/fontra-core/src/skeleton-contour-generator.js:3026-3041`

- [ ] **Step 1: Read the slider constants**

Confirm:

```javascript
const CAP_RADIUS_MIN = 1 / 128;
const CAP_RADIUS_MAX = 1 / 4;
const CAP_RADIUS_POSITIONS = 20;
```

Expected understanding:
- the last slider position maps to the exact maximum legal radius

- [ ] **Step 2: Read `_capRadiusRatioFromIndex(index)`**

Confirm:

```javascript
const clampedIndex = Math.min(Math.max(index, 0), CAP_RADIUS_POSITIONS - 1);
const t = clampedIndex / (CAP_RADIUS_POSITIONS - 1);
return Math.pow(2, minLog + (maxLog - minLog) * t);
```

Expected understanding:
- slider `20` maps to exact `0.25`
- slider `19` maps to a lower non-boundary value

- [ ] **Step 3: Read `getRoundCapFrame(...)`**

Confirm:

```javascript
const radiusFactor =
  MAX_CAP_RADIUS_RATIO > 0 ? clampedCapRadiusRatio / MAX_CAP_RADIUS_RATIO : 0;
```

Expected understanding:
- at slider `20`, `radiusFactor` becomes exactly `1`

### Task 2: Locate The Topology Switch

**Files:**
- Modify later: `src-js/fontra-core/src/skeleton-contour-generator.js:3390-3577`

- [ ] **Step 1: Read the current merged-tip entry condition**

Locate the block equivalent to:

```javascript
if (
  radiusFactor >= 1 - 1e-6 ||
  vector.distance(preCollapseRight, preCollapseLeft) <= 0.5
) {
  isMergedTip = true;
  tipPoint = buildRoundCapTipPoint(...);
}
```

Expected understanding:
- the current code changes both geometry and topology at max radius

- [ ] **Step 2: Read both output paths in `buildRoundCapGeometry(...)`**

Identify:
- merged-tip path: one `tipPoint`
- normal path: two `finalEndpoints`

Expected understanding:
- this is not merely “two points same coordinates”
- it is a different assembly mode

## Chunk 2: Implement The Narrow Single-Sided Override

### Task 3: Extend `buildRoundCapGeometry(...)` Without Broad Refactoring

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-contour-generator.js:3390-3455`

- [ ] **Step 1: Add one optional function parameter**

Update the function signature to include:

```javascript
preserveCoincidentMaxRadiusEndpoints = false,
```

Purpose:
- keep default behavior unchanged
- let call sites opt into single-sided exact-max preservation

- [ ] **Step 2: Compute the pre-collapse coincidence state once**

Add:

```javascript
const coincidentPreCollapseEndpoints =
  vector.distance(preCollapseRight, preCollapseLeft) <= 0.5;
```

Reason:
- avoids duplicating the same distance check
- makes the override branch explicit

- [ ] **Step 3: Add the exact-max preservation guard**

Add:

```javascript
const shouldKeepCoincidentEndpoints =
  preserveCoincidentMaxRadiusEndpoints && radiusFactor >= 1 - 1e-6;
```

Meaning:
- only the exact-max-radius case is overridden
- coincidence from other fragile cases still uses the existing merged-tip behavior

- [ ] **Step 4: Gate the existing merge condition**

Rewrite the current condition to:

```javascript
if (
  !shouldKeepCoincidentEndpoints &&
  (radiusFactor >= 1 - 1e-6 || coincidentPreCollapseEndpoints)
) {
  isMergedTip = true;
  tipPoint = buildRoundCapTipPoint(...);
} else {
  finalEndpoints = {
    left: preCollapseLeft,
    right: preCollapseRight,
  };
}
```

Required outcome:
- single-sided max radius keeps `finalEndpoints`
- other collapse cases continue to merge as before

### Task 4: Wire The Override Into The Existing Start/End Round-Cap Call Sites

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-contour-generator.js:1364-1376`
- Modify: `src-js/fontra-core/src/skeleton-contour-generator.js:1504-1516`

- [ ] **Step 1: Update the start-cap call**

At the `startCap = buildRoundCapGeometry({ ... })` call, add:

```javascript
preserveCoincidentMaxRadiusEndpoints: singleSided,
```

Constraint:
- do not change any other arguments

- [ ] **Step 2: Update the end-cap call**

At the `endCap = buildRoundCapGeometry({ ... })` call, add:

```javascript
preserveCoincidentMaxRadiusEndpoints: singleSided,
```

Constraint:
- do not change any other arguments

- [ ] **Step 3: Keep this single-sided-only**

Do not add:
- width-based inference
- cap-style-based inference
- new geometry heuristics

The only gate for this pass is:

```javascript
singleSided
```

## Chunk 3: Preserve Existing Point Semantics

### Task 5: Confirm The Exact-Max Case Still Uses The Normal Endpoint Path

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-contour-generator.js:3323-3333`
- Verify: `src-js/fontra-core/src/skeleton-contour-generator.js:3521-3577`

- [ ] **Step 1: Ensure preserved endpoints are still created by `buildRoundCapEndpoint(...)`**

Expected result:
- `smooth: true`
- `skipColinear: true`

- [ ] **Step 2: Ensure the override does not route through `buildRoundCapTipPoint(...)`**

Expected result:
- no single emitted tip point in the single-sided exact-max case

- [ ] **Step 3: Ensure the normal two-endpoint assembly path remains active**

Expected sequence:
- start cap: `insertedRight -> finalRight -> finalLeft -> insertedLeft`
- end cap: `insertedLeft -> finalLeft -> finalRight -> insertedRight`

Important:
- the coordinates of `finalLeft` and `finalRight` may be identical
- the topology must still be two-endpoint

## Chunk 4: Non-Goals And Guardrails

### Task 6: Do Not Fold In The Separate Roundness-Progression Bug

**Files:**
- Reference only: `src-js/fontra-core/src/skeleton-contour-generator.js:3032-3037`

- [ ] **Step 1: Leave `trimDistance` unchanged in this pass**

Do not modify:

```javascript
const trimDistance = maxProjectionShift * radiusFactor;
```

Reason:
- this plan is only about the topology switch at exact max radius
- the trim formula issue is a separate behavior change

- [ ] **Step 2: Leave double-sided exact-max behavior unchanged**

Do not add the preservation override for non-single-sided caps.

- [ ] **Step 3: Leave editor code unchanged**

Do not modify:
- `panel-skeleton-parameters.js`
- hit testing
- generated-point matching
- visualization layers

## Chunk 5: Verification

### Task 7: Syntax And Bundle Verification

**Files:**
- Verify: `src-js/fontra-core/src/skeleton-contour-generator.js`

- [ ] **Step 1: Run syntax check**

Run:

```bash
node --check src-js/fontra-core/src/skeleton-contour-generator.js
```

Expected:
- success
- no output

- [ ] **Step 2: Run bundle check**

Run:

```bash
npm run -s bundle
```

Expected:
- build succeeds
- existing webpack size warnings may remain
- no new syntax/runtime bundling errors

### Task 8: Manual Editor Verification

**Files:**
- Verify in editor using the existing single-sided repro glyph/setup

- [ ] **Step 1: Use the known failing single-sided round-cap case**

Keep all variables fixed except slider position and endpoint placement.

- [ ] **Step 2: Check slider `19`**

Expected:
- normal two-endpoint cap behavior
- no topology surprise

- [ ] **Step 3: Check slider `20`**

Expected:
- still two final cap endpoints
- the two endpoints may sit on the same coordinates
- no switch to one-tip topology

- [ ] **Step 4: Move the skeleton endpoint while staying at `20`**

Expected:
- no abrupt topological change
- no sudden angle flips caused by switching construction modes

- [ ] **Step 5: Confirm scope stayed narrow**

Expected:
- only the single-sided exact-max case changed
- double-sided exact-max still behaves as before
- any remaining “roundness itself is wrong” issue is still present and tracked separately

## Handoff Notes

After implementation, report these points explicitly:
- whether the single-sided exact-max case still emits two endpoints
- whether those endpoints become coincident as intended
- whether the hard mode switch at slider `20` is gone
- whether any remaining defect appears to be the separate trim/progression issue
