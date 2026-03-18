# Skeleton Round Cap Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace projected-point round-cap scaffolding with split-outline round-cap reconstruction while preserving the existing cap controls and overall generator behavior.

**Architecture:** Keep all production work inside `src-js/fontra-core/src/skeleton-contour-generator.js`. The implementation adds private helpers for cap-frame derivation, terminal-side splitting, emitted-side trimming, round-cap reconstruction, and final open-outline assembly, then rewires the existing open-contour `round` branches to use those helpers instead of creating projected outer scaffold points.

**Tech Stack:** JavaScript, BezierJS (`bezier-js`), Fontra core skeleton generator, webpack bundle, manual editor verification.

---

**Spec Reference:** `docs/superpowers/specs/2026-03-18-skeleton-round-cap-redesign-design.md`

**Execution Notes:**
- Work on the current isolated branch `test/cap-rounding-rewamp`.
- Per approved design, do **not** add automated tests for this task. Verification is manual plus syntax/build checks.
- Keep `butt`, `square`, closed contours, and non-cap side generation unchanged.

**File Structure**

| File | Responsibility |
|------|----------------|
| `src-js/fontra-core/src/skeleton-contour-generator.js` | Add private helper primitives for split-based round caps and replace the open-contour `round` start/end branches plus final outline assembly. |
| `docs/superpowers/specs/2026-03-18-skeleton-round-cap-redesign-design.md` | Reference only; do not edit during implementation unless a spec bug is discovered and approved separately. |

## Chunk 1: Generator Refactor

### Task 1: Add Round-Cap Frame And Split Helpers

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-contour-generator.js:3188-3350`
- Test: Manual verification only; use syntax/build checks in later tasks

**Context:** The current round-cap branch computes `projectedTangentShift`, `normalShift`, `capDir`, and cap handle lengths inline inside `generateOutlineFromSkeletonContour(...)`. Move the geometry decisions that do not depend on emitted-cap assembly into private helpers first so the later refactor is mechanical.

- [ ] **Step 1: Add a cap-frame helper near `computeTunniHandleLengths(...)`**

Add a private helper block after `computeTunniHandleLengths(...)` with the formulas already approved in the spec:

```javascript
function getRoundCapFrame({
  endpointTangent,
  capRadiusRatio,
  capWidth,
  position,
}) {
  const clampedCapRadiusRatio = Math.min(Math.max(capRadiusRatio, 0), MAX_CAP_RADIUS_RATIO);
  const radiusFactor =
    MAX_CAP_RADIUS_RATIO > 0 ? clampedCapRadiusRatio / MAX_CAP_RADIUS_RATIO : 0;
  const maxProjectionShift = Math.max(capWidth / 2 - capWidth / 128, 0);
  const trimDistance = maxProjectionShift * (1 - radiusFactor);
  const capTangent =
    position === "start"
      ? { x: -endpointTangent.x, y: -endpointTangent.y }
      : endpointTangent;
  return { radiusFactor, maxProjectionShift, trimDistance, capTangent };
}
```

Keep this helper private to the file. It should not try to derive `capNormal`; that happens later from the split results' reference endpoints.

- [ ] **Step 2: Add the cubic-distance solve and split helper**

Add:

```javascript
function solveTerminalSplitForDistance(bezier, fromEnd, trimDistance) {
  // binary search on arc length, 0.5 unit error target, 1e-4 t threshold
}

function splitTerminalSideForRoundCap(
  sidePoints,
  sidePosition,
  trimDistance,
  fallbackDirections
) {
  // no mutation
  // return rewritten side points, inserted point/index, reference endpoint/index, tangentToEndpoint
}
```

Implementation requirements:
- support both cubic and line terminal segments
- honor the fallback chain `endpointTangent -> chordDirection -> capTangent`
- always emit a distinct inserted on-curve in round mode, even for fragile cases
- keep the helper output shape exactly as the spec defines
- implement the spec's degenerate split invariants explicitly:
  - `effectiveTrimDistance = clamp(trimDistance, 0, terminalSegmentLength)`
  - if `terminalSegmentLength >= 2` and `effectiveTrimDistance < 1`, force a `1` unit minimum inward split
  - if rounding would collapse the inserted point onto the reference endpoint, back the inserted point off by at least `1` unit along the resolved fallback direction

- [ ] **Step 3: Run syntax verification on the generator file**

Run:

```bash
node --check src-js/fontra-core/src/skeleton-contour-generator.js
```

Expected: command exits successfully with no output.

- [ ] **Step 4: Commit the helper-only refactor**

```bash
git add src-js/fontra-core/src/skeleton-contour-generator.js
git commit -m "refactor: add split-based round cap helper primitives"
```

Expected: commit succeeds and only the generator file is included.

### Task 2: Add Emission Trimming, Reconstruction, And Assembly Helpers

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-contour-generator.js:3188-3450`
- Test: Manual verification only; use syntax/build checks in later tasks

**Context:** The start/end branches should not hand-assemble point arrays inline. Add the private helpers that own endpoint derivation, merged-tip logic, cap-local point order, and final side trimming.

- [ ] **Step 1: Add the emitted-side trimming helper**

Add:

```javascript
function trimSideForRoundCapEmission(sidePoints, sidePosition, referenceEndpointIndex) {
  const emitted = [...sidePoints];
  emitted.splice(referenceEndpointIndex, 1);
  return emitted;
}
```

This helper must remove the consumed reference endpoint from the emitted side array without mutating the caller's original array.

- [ ] **Step 2: Add the round-cap reconstruction helper**

Add:

```javascript
function buildRoundCapGeometry({
  position,
  insertedLeft,
  insertedRight,
  leftTangentToEndpoint,
  rightTangentToEndpoint,
  referenceLeft,
  referenceRight,
  capTangent,
  capTension,
  radiusFactor,
  capWidth,
}) {
  // derive capNormal from reference endpoints, then fallback to rotate90CW(capTangent)
  // derive final endpoints or a single tipPoint
  // use computeTunniHandleLengths(...) for corner cubics
  // preserve point-order templates from the spec
  return { capPoints, finalEndpoints, tipPoint, isMergedTip };
}
```

Inside this helper:
- derive `capNormal` from the two reference endpoints after side splitting, then fallback to `rotate90CW(capTangent)`
- use `normalShift = (capWidth / 2) * radiusFactor`
- move right endpoint by `+capNormal * normalShift`
- move left endpoint by `-capNormal * normalShift`
- use the canonical zero-width topology: keep both inserted side points and emit one `tipPoint`
- for merged tips, derive `tipTangent` from `pre-collapse cap direction -> fallbackCapNormal -> inserted-point span`
- feed the split-helper tangents into `computeTunniHandleLengths(...)` so each corner remains tangent to the original side geometry
- if handle directions become unstable, degrade the affected corner segment(s) to straight segments but keep the added on-curves
- implement the full endpoint-collapse table from the spec:
  - collapse to one `tipPoint` at max radius
  - collapse to one `tipPoint` when final endpoints become coincident within `0.5` units
  - preserve round-cap topology during unstable-normal whole-cap fallback
  - when collapsing, emit a single tip on-curve rather than duplicate coincident endpoints

- [ ] **Step 3: Add the final open-outline assembler**

Add:

```javascript
function assembleOpenOutlineWithRoundCaps({ leftSide, endCap, rightSide, startCap }) {
  const outlinePoints = [];
  outlinePoints.push(...leftSide);
  outlinePoints.push(...endCap);
  outlinePoints.push(...[...rightSide].reverse());
  outlinePoints.push(...startCap);
  return outlinePoints;
}
```

This preserves the current open-outline order while avoiding in-place reversal of the working right-side array.

- [ ] **Step 4: Run syntax verification again**

Run:

```bash
node --check src-js/fontra-core/src/skeleton-contour-generator.js
```

Expected: command exits successfully with no output.

- [ ] **Step 5: Commit the assembly helpers**

```bash
git add src-js/fontra-core/src/skeleton-contour-generator.js
git commit -m "refactor: add round cap reconstruction and assembly helpers"
```

Expected: commit succeeds and only the generator file is included.

### Task 3: Replace The Start Round-Cap Branch

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-contour-generator.js:1292-1537`
- Test: Manual verification only; use syntax/build checks in later tasks

**Context:** Replace only the `startIsRound` branch first. Keep `startIsSquare` and `generateCap(...)` branches untouched so the delta is easy to inspect.

- [ ] **Step 1: Remove projected-point scaffold construction from the start branch**

Delete the start-round code that creates and uses:

```javascript
projectedRight
projectedLeft
newRight
newLeft
newRightHandleDir
newLeftHandleDir
```

Also remove the inline `mergeCap`/`projectedTangentShift` branch-specific cap assembly from this block.

- [ ] **Step 2: Rebuild the start branch around the new helpers**

Rewrite `if (startIsRound) { ... }` to follow this sequence:

```javascript
const frame = getRoundCapFrame({ endpointTangent: startTangent, capRadiusRatio, capWidth, position: "start" });
const rightChordDirection = vector.normalizeVector(
  vector.subVectors(rightStart, getNextOnCurvePoint(roundedRightSide, 0))
);
const leftChordDirection = vector.normalizeVector(
  vector.subVectors(leftStart, getNextOnCurvePoint(roundedLeftSide, 0))
);
const rightSplit = splitTerminalSideForRoundCap(roundedRightSide, "start", frame.trimDistance, {
  endpointTangent: tOut,
  chordDirection: rightChordDirection,
  capTangent: frame.capTangent,
});
const leftSplit = splitTerminalSideForRoundCap(roundedLeftSide, "start", frame.trimDistance, {
  endpointTangent: tOut,
  chordDirection: leftChordDirection,
  capTangent: frame.capTangent,
});
roundedRightSide = trimSideForRoundCapEmission(
  rightSplit.sidePoints,
  "start",
  rightSplit.referenceEndpointIndex
);
roundedLeftSide = trimSideForRoundCapEmission(
  leftSplit.sidePoints,
  "start",
  leftSplit.referenceEndpointIndex
);
startCap = buildRoundCapGeometry({
  position: "start",
  insertedLeft: leftSplit.insertedPoint,
  insertedRight: rightSplit.insertedPoint,
  leftTangentToEndpoint: leftSplit.tangentToEndpoint,
  rightTangentToEndpoint: rightSplit.tangentToEndpoint,
  referenceLeft: leftSplit.referenceEndpoint,
  referenceRight: rightSplit.referenceEndpoint,
  capTangent: frame.capTangent,
  capTension,
  radiusFactor: frame.radiusFactor,
  capWidth,
}).capPoints;
```

Preserve:
- existing cap parameter sourcing (`point -> contour -> defaults`)
- the spec's merged-tip rule at max radius: inserted side points plus one emitted `tipPoint`
- existing `smooth` / `skipColinear` expectations from the spec

- [ ] **Step 3: Verify the generator still parses and the workspace still bundles**

Run:

```bash
node --check src-js/fontra-core/src/skeleton-contour-generator.js
npm run -s bundle
```

Expected:
- `node --check` exits with no output
- `npm run -s bundle` completes successfully; existing webpack size warnings are acceptable, new build errors are not

- [ ] **Step 4: Commit the start-cap migration**

```bash
git add src-js/fontra-core/src/skeleton-contour-generator.js
git commit -m "feat: switch start round caps to split-outline geometry"
```

Expected: commit succeeds and only the generator file is included.

### Task 4: Replace The End Round-Cap Branch And Final Assembly

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-contour-generator.js:1540-1800`
- Test: Manual verification only; use syntax/build checks in later tasks

**Context:** Mirror the start-cap refactor for `endIsRound`, then swap the open-outline assembly to use the helper so the final path no longer depends on in-place side mutations.

- [ ] **Step 1: Remove projected-point scaffold construction from the end branch**

Delete the end-round code that creates and uses:

```javascript
projectedLeft
projectedRight
newLeft
newRight
newLeftHandleDir
newRightHandleDir
```

Keep `endIsSquare` and non-round `generateCap(...)` behavior unchanged.

- [ ] **Step 2: Rebuild the end branch around the new helpers**

Rewrite `if (endIsRound) { ... }` to mirror the start branch with `position: "end"` and the end-cap point-order template:

```javascript
const frame = getRoundCapFrame({ endpointTangent: endTangent, capRadiusRatio, capWidth, position: "end" });
const leftChordDirection = vector.normalizeVector(
  vector.subVectors(leftEnd, getPreviousOnCurvePoint(roundedLeftSide, roundedLeftSide.length - 1))
);
const rightChordDirection = vector.normalizeVector(
  vector.subVectors(rightEnd, getPreviousOnCurvePoint(roundedRightSide, roundedRightSide.length - 1))
);
const leftSplit = splitTerminalSideForRoundCap(roundedLeftSide, "end", frame.trimDistance, {
  endpointTangent: tOut,
  chordDirection: leftChordDirection,
  capTangent: frame.capTangent,
});
const rightSplit = splitTerminalSideForRoundCap(roundedRightSide, "end", frame.trimDistance, {
  endpointTangent: tOut,
  chordDirection: rightChordDirection,
  capTangent: frame.capTangent,
});
roundedLeftSide = trimSideForRoundCapEmission(
  leftSplit.sidePoints,
  "end",
  leftSplit.referenceEndpointIndex
);
roundedRightSide = trimSideForRoundCapEmission(
  rightSplit.sidePoints,
  "end",
  rightSplit.referenceEndpointIndex
);
endCap = buildRoundCapGeometry({
  position: "end",
  insertedLeft: leftSplit.insertedPoint,
  insertedRight: rightSplit.insertedPoint,
  leftTangentToEndpoint: leftSplit.tangentToEndpoint,
  rightTangentToEndpoint: rightSplit.tangentToEndpoint,
  referenceLeft: leftSplit.referenceEndpoint,
  referenceRight: rightSplit.referenceEndpoint,
  capTangent: frame.capTangent,
  capTension,
  radiusFactor: frame.radiusFactor,
  capWidth,
}).capPoints;
```

- [ ] **Step 3: Replace the inline `outlinePoints.push(...)` block with the helper assembler**

Change the open-outline assembly from:

```javascript
const outlinePoints = [];
outlinePoints.push(...roundedLeftSide);
outlinePoints.push(...endCap);
outlinePoints.push(...roundedRightSide.reverse());
outlinePoints.push(...startCap);
```

To:

```javascript
const outlinePoints = assembleOpenOutlineWithRoundCaps({
  leftSide: roundedLeftSide,
  endCap,
  rightSide: roundedRightSide,
  startCap,
});
```

Leave `stripCornerRoundMetadata(...)` and `enforceSmoothColinearity(...)` in place after assembly.

- [ ] **Step 4: Run final syntax and bundle verification for the code refactor**

Run:

```bash
node --check src-js/fontra-core/src/skeleton-contour-generator.js
npm run -s bundle
```

Expected:
- `node --check` exits with no output
- `npm run -s bundle` completes successfully; only existing webpack warnings are acceptable

- [ ] **Step 5: Commit the end-cap migration**

```bash
git add src-js/fontra-core/src/skeleton-contour-generator.js
git commit -m "feat: switch end round caps to split-outline geometry"
```

Expected: commit succeeds and only the generator file is included.

---

## Chunk 2: Manual Verification And Handoff

### Task 5: Verify In The Editor

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-contour-generator.js` (already changed in Chunk 1)
- Test: Manual verification only by approved requirement

**Prerequisites:** Use the existing visual-editor workflow, but do not edit tracked font data inside the repo. Run manual checks against a temp copy of the sample font instead.

- [ ] **Step 1: Create an isolated temp copy of the sample font**

Run:

```bash
if (Test-Path C:\Users\frena\AppData\Local\Temp\fontra-round-cap-fonts) { Remove-Item -Recurse -Force C:\Users\frena\AppData\Local\Temp\fontra-round-cap-fonts }
New-Item -ItemType Directory -Force C:\Users\frena\AppData\Local\Temp\fontra-round-cap-fonts | Out-Null
Copy-Item -Recurse -Force C:\Users\frena\Desktop\fontra-test\test-common\fonts\* C:\Users\frena\AppData\Local\Temp\fontra-round-cap-fonts
```

Expected: `C:\Users\frena\AppData\Local\Temp\fontra-round-cap-fonts\MutatorSans.fontra` exists, so scratch-glyph edits stay outside the git worktree.

- [ ] **Step 2: Launch Fontra in development mode against the temp copy**

```bash
fontra --dev --launch filesystem C:\Users\frena\AppData\Local\Temp\fontra-round-cap-fonts
```

Expected: Fontra starts in dev mode and opens `http://localhost:8000/` in the browser with the temp font copy available.

- [ ] **Step 3: Create one reproducible scratch glyph for verification**

In `MutatorSans.fontra` from the temp copy, create or reuse a glyph named `roundcapcheck` and draw:
- one open skeleton line segment
- one open skeleton cubic segment

Use that same scratch glyph for the remaining manual checks so the scenarios stay reproducible.

Expected: the glyph contains both a straight open skeleton and a curved open skeleton endpoint that can be toggled between `flat`, `round`, and `square`.

- [ ] **Step 4: Verify flat/round parity on the scratch glyph**

Switch the same endpoint between `flat` and `round`.

Expected:
- the side geometry stays stable up to the inserted split points
- only the terminal cap region changes
- no projected outer scaffold geometry is visible anymore

- [ ] **Step 5: Verify one start/cubic case and one end/linear case**

Check:
- a start cap on the cubic terminal skeleton segment in `roundcapcheck`
- an end cap on the linear terminal skeleton segment in `roundcapcheck`

Expected:
- both start and end caps use the new split-outline topology
- each round endpoint emits one inserted side point per side

- [ ] **Step 6: Verify radius, tension, and asymmetric widths**

Check:
- minimum visible round settings
- mid-range `capRadiusRatio`
- maximum `capRadiusRatio`
- multiple `capTension` values
- at least one asymmetric left/right width combination

Expected:
- low values still keep the added round-cap points
- max radius collapses to a merged tip while preserving round-cap topology
- tension only changes corner shaping, not base side placement
- asymmetric widths still keep one inserted side point per side and do not flip the cap-frame orientation unexpectedly

- [ ] **Step 7: Verify fragile and fallback-direction cases with explicit setups**

Use these exact setups inside `roundcapcheck`:
- synthesized-point fallback: on the straight open skeleton, keep `round` enabled on the tested endpoint, set the endpoint width to `200`, set `capRadiusRatio` to `0`, then shorten that skeleton segment to about `40` units so the terminal segment is visibly shorter than half the width
- unstable-direction fallback: on the cubic open skeleton, keep `round` enabled on the tested endpoint and set that endpoint's left/right widths to `0` (or the single linked width control to `0` if the UI links them), while leaving the adjacent skeleton geometry in place

Observable pass conditions:
- round mode still emits distinct added side points
- fragile cases preserve round-cap topology instead of falling back to flat-cap topology
- if geometry becomes too small to support stable cubic handles, the cap can degrade to straight local segments without losing the new on-curves
- the fallback tangent/normal path still points the cap inward and does not invert left/right assembly

- [ ] **Step 8: Verify untouched cap styles**

Switch the same endpoint to `butt` and `square`.

Expected:
- `butt` and `square` behave exactly as before
- only `round` mode changed

- [ ] **Step 9: Confirm the emitted outline stays closed and exportable**

With the verified round-cap glyph still open in the editor:
- inspect the generated outline on canvas
- use the top-bar export action to export an `.otf` to `C:\Users\frena\AppData\Local\Temp\fontra-round-cap-check.otf`

Expected:
- the generated outline is still a single sensible closed contour in the editor
- the export action completes without a topology-related error dialog
- `C:\Users\frena\AppData\Local\Temp\fontra-round-cap-check.otf` exists on disk after export, and no new export artifact appears under the git worktree

### Task 6: Final Verification And Commit

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-contour-generator.js`
- Test: Manual verification only by approved requirement

- [ ] **Step 1: Run the final non-test verification commands**

```bash
node --check src-js/fontra-core/src/skeleton-contour-generator.js
npm run -s bundle
```

Expected:
- `node --check` exits with no output
- `npm run -s bundle` completes successfully; only pre-existing webpack warnings are acceptable

- [ ] **Step 2: Check git status before the final commit**

```bash
git status --short
```

Expected: only the intended generator file is modified, or the working tree is already clean if all chunk commits were made exactly as written.

- [ ] **Step 3: Create the final feature commit if needed**

```bash
git add src-js/fontra-core/src/skeleton-contour-generator.js
git commit -m "feat: redesign skeleton round cap generation"
```

Expected: commit succeeds, unless the prior chunk commits already left the tree clean.

- [ ] **Step 4: Record the final manual-verification summary**

Capture in the final assistant handoff message for the implementation session:
- confirm `roundcapcheck` was used inside the temp `MutatorSans.fontra` copy (or explicitly note if a different scratch glyph was required)
- which round-cap scenarios were checked
- whether asymmetric-width and fallback-direction cases were checked
- whether any fragile cases degraded to straight corner segments
- whether `butt`/`square` regression checks passed
- whether closed-outline and export checks passed
