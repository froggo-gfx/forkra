# Single-Sided Max-Roundness Cap Topology Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make single-sided round caps keep the normal two-endpoint topology at slider position `20`, so max roundness only collapses endpoint coordinates and does not switch cap construction mode.

**Architecture:** Keep the change local to `src-js/fontra-core/src/skeleton-contour-generator.js`. The implementation adds a single-sided-only guard in round-cap reconstruction so the exact-max case stays on the same two-endpoint assembly path used below max radius, while leaving double-sided behavior unchanged for now.

**Tech Stack:** JavaScript, Fontra core skeleton generator, existing manual editor verification workflow.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src-js/fontra-core/src/skeleton-contour-generator.js` | Round-cap reconstruction, start/end cap assembly, and the single-sided exact-max topology override. |
| `src-js/views-editor/src/panel-skeleton-parameters.js` | Reference only; confirms slider position `20` maps to exact max radius. |

## Chunk 1: Single-Sided Topology Fix

### Task 1: Isolate The Current Topology Switch

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-contour-generator.js`
- Reference: `src-js/views-editor/src/panel-skeleton-parameters.js`

- [ ] **Step 1: Confirm the max-radius boundary used by the UI**

Read:
- `CAP_RADIUS_MAX`
- `CAP_RADIUS_POSITIONS`
- `_capRadiusRatioFromIndex(index)`

Expected understanding:
- slider position `20` maps to exact `1/4`
- that value becomes `radiusFactor === 1` in the generator

- [ ] **Step 2: Confirm the exact branch that changes topology**

Read `buildRoundCapGeometry(...)` and identify the current merged-tip condition:

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
- the code currently does more than collapse coordinates
- it switches from two endpoints to one `tipPoint`

- [ ] **Step 3: Keep scope strict**

Do not change:
- `trimDistance`
- double-sided behavior
- editor code
- docs/specs outside this plan

### Task 2: Add A Single-Sided-Only Two-Endpoint Override

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-contour-generator.js`

- [ ] **Step 1: Extend `buildRoundCapGeometry(...)` with one narrow option**

Add one optional parameter:

```javascript
preserveCoincidentMaxRadiusEndpoints = false,
```

Purpose:
- only affects the single-sided exact-max case
- does not alter the default behavior for other caps

- [ ] **Step 2: Gate the merged-tip branch**

Replace the unconditional max-radius merge check with logic equivalent to:

```javascript
const coincidentPreCollapseEndpoints =
  vector.distance(preCollapseRight, preCollapseLeft) <= 0.5;
const shouldKeepCoincidentEndpoints =
  preserveCoincidentMaxRadiusEndpoints && radiusFactor >= 1 - 1e-6;

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

Required behavior:
- for single-sided exact max radius, keep `finalEndpoints.left/right`
- allow those two endpoints to share the same `x/y`
- stay on the normal two-endpoint assembly path

- [ ] **Step 3: Wire the option into start and end cap call sites**

At both round-cap call sites, pass:

```javascript
preserveCoincidentMaxRadiusEndpoints: singleSided,
```

Required scope:
- start round caps: single-sided only
- end round caps: single-sided only
- no double-sided behavior change in this pass

### Task 3: Preserve Normal Endpoint Metadata

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-contour-generator.js`

- [ ] **Step 1: Keep the preserved exact-max endpoints on the normal endpoint path**

Do not route the single-sided exact-max case through:

```javascript
buildRoundCapTipPoint(...)
```

- [ ] **Step 2: Preserve endpoint metadata**

The single-sided exact-max endpoints must still be created by:

```javascript
buildRoundCapEndpoint(...)
```

Expected metadata:
- `smooth: true`
- `skipColinear: true`

- [ ] **Step 3: Do not alter point order**

The emitted cap point sequence for the single-sided exact-max case must still use the normal two-endpoint order for that cap position:
- start cap: `insertedRight -> finalRight -> finalLeft -> insertedLeft`
- end cap: `insertedLeft -> finalLeft -> finalRight -> insertedRight`

## Chunk 2: Verification

### Task 4: Run Non-Test Verification

**Files:**
- Verify: `src-js/fontra-core/src/skeleton-contour-generator.js`

- [ ] **Step 1: Run syntax verification**

Run:

```bash
node --check src-js/fontra-core/src/skeleton-contour-generator.js
```

Expected:
- exits successfully with no output

- [ ] **Step 2: Run bundle verification**

Run:

```bash
npm run -s bundle
```

Expected:
- bundle completes successfully
- existing webpack size warnings are acceptable
- no new build errors are introduced

### Task 5: Manual Verification In The Editor

**Files:**
- Verify behavior through the existing editor workflow

- [ ] **Step 1: Reproduce the single-sided case on one glyph**

Use one open skeleton endpoint configured as:
- single-sided
- round cap
- same geometry for repeated checks

- [ ] **Step 2: Compare slider `19` and `20`**

Expected:
- slider `20` no longer switches to a different cap topology
- the cap still has two final endpoints
- those endpoints may occupy the same coordinates

- [ ] **Step 3: Move the skeleton endpoint while staying at `20`**

Expected:
- no sudden cap-angle flips
- no random normal changes caused by topology switching

- [ ] **Step 4: Confirm the intended limitation of this pass**

Expected:
- only single-sided exact-max behavior changes
- double-sided max-radius behavior remains unchanged for now
- any remaining roundness-shape issue outside this topology switch is tracked separately

## Follow-Up Work

If the topology fix removes the hard cutoff but roundness progression still feels wrong, open a separate task for the trim-distance mapping in `getRoundCapFrame(...)`.

That follow-up must remain separate from this plan because:
- it changes the geometry progression across all slider values
- it is not required to stop the topology switch at single-sided `20`
