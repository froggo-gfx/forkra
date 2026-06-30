# WS-4 — Tunni Refactor (keystone) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Tunni into pure math (`tunni-calculations.js`) + interaction (`tunni-interactions.js`) + render (viz), establish a single tension source, de-duplicate the geometry copies in `distance-angle.js`, apply the D2–D4/D7/D8 naming cascade, and strip ~259 lines of Tunni from the pointer — all behind tests, with equalize behavior preserved exactly.

**Architecture:** `tunni-calculations.js` (core) becomes math-only and the canonical home for every Tunni geometry/tension function. `tunni-interactions.js` (views-editor, NEW) holds the hit-test + drag/equalize orchestration that the pointer delegates to. The viz file keeps only thin render fns + layer registrations consuming core math. `distance-angle.js` keeps its measure/label code but imports all Tunni math from core (no local copies).

**Tech Stack:** ES modules (`"type": "module"`), import alias `@fontra/core/...` → `src-js/fontra-core/src/...`. Tests: mocha + chai in `src-js/fontra-core/tests/`. Manual verification for views-editor (no test runner).

## Global Constraints

- **Branch:** `refactor-simple/ws4-tunni-refactor`, cut from the `refactor-simple/` base. Frequent commits; **never push** unless the user asks.
- **Skeleton donor is read-only.** Never modify anything under `./skeleton/`. Skeleton's `tunni-interactions.js` is **rib/skeleton-coupled** (`calculateSkeleton*`, `buildSegmentsFromSkeletonPoints`, `getSkeletonData`) — it is a **structural reference only**, NOT a code donor. Forkra's interaction donor is forkra's own existing code in `tunni-calculations.js`.
- **Skeleton coupling is OUT:** never introduce `skeleton-contour-generator.js`, rib hotkeys, `getSkeletonData`, `SKELETON*`.
- **Formatting:** `npx prettier --write <files>` (prettier 3.8.3) before every commit. Working tree is **CRLF**; use `git diff`/`git show` for comparisons.
- **Syntax check:** `node --check <file>` for every modified views-editor file (no test harness there).
- **Behavior preservation:** Q-measure tension values, the geometry draws, and the *true*-Tunni-point drag must be numerically unchanged. Every math **move** is byte-faithful — carry helper bodies verbatim rather than "improving" them. **Two deliberate exceptions (Task 9, user-approved):** (A) equalized control points are now **rounded** to integers; (B) the proportional control-handle drag adopts skeleton's tension-preserving formula (forkra's original kept commented). These are the only intended behavior changes.

### Canonical names (locked — §5/§8 of master plan; use these EXACT spellings everywhere downstream)

| Concept | OLD name(s) | NEW canonical name |
|---|---|---|
| Mid-handle point (midpoint of the two controls) | `calculateTunniPoint` (tunni-calc) / `calculateTunniPointz` (distance-angle) | **`calculateControlHandlePoint`** (D2) |
| Real tangent-ray intersection point | `calculateTrueTunniPoint` | **`calculateTunniPoint`** (D3) |
| Single tension source | `calculateTension` (distance-angle) | **`calculateSegmentTension`** (D5, in tunni-calculations.js) |
| Mid-handle layer id | `fontra.tunni.combined` | **`fontra.tunni.handle`** (D4) |
| Real-point layer id | `fontra.tunni.actual.points` | **`fontra.tunni.point`** (D4) |
| Label settings keys | `showTunniDistance/Tension/Angle` | **`showLabelsDistance/Tension/Angle`** (D7) |
| Label feature text | "Tunni Labels" | **"Point labels"** (D8) |

> ⚠️ The point-labels **layer** rename (`fontra.tunni.labels`→`fontra.point.labels`) and `drawTunniLabels`'s **tension** repoint are **WS-4.5**, NOT this plan. WS-4 only repoints `drawTunniLabels`'s **geometry** calls (so the module stays loadable after the dupes are deleted) and renames the **settings keys** it reads.

---

## File Structure

```
src-js/fontra-core/src/
  tunni-calculations.js     [MODIFY] add calculateSegmentTension (+private lineIntersection);
                                     add areTensionsEqualized (Task 9 / option C);
                                     rename calculateTunniPoint→calculateControlHandlePoint,
                                     calculateTrueTunniPoint→calculateTunniPoint;
                                     DELETE the commented-out drawTunniLabels block (314-593);
                                     MOVE all interaction fns out to tunni-interactions.js
  distance-angle.js         [MODIFY] import calculateSegmentTension; rewrite calculateHandleMeasure;
                                     DELETE calculateTension (+console.log test fn) and the duplicate
                                     geometry: calculateTrueTunniPoint, calculateEqualizedControlPoints,
                                     calculateControlHandleDistance, areDistancesEqualized, calculateTunniPointz;
                                     repoint drawTunniLabels geometry calls + settings-key reads

src-js/fontra-core/tests/
  test-tunni-calculations.js [CREATE]  calculateSegmentTension + geometry rename guards
  test-distance-angle.js     [MODIFY]  calculateHandleMeasure regression (tension === 0.5 fixture)

src-js/views-editor/src/
  tunni-interactions.js          [CREATE] hit-test + mouse state/drag/up + equalize orchestration
                                          (moved from tunni-calculations.js + pointer);
                                          Task 9: round equalized CPs (A), tension-preserving
                                          proportional drag (B), tension-based equalize guard (C)
  edit-tools-pointer.js          [MODIFY] delete ~259 Tunni lines; import from ./tunni-interactions.js;
                                          thin dispatch in handleHover/handleDrag
  visualization-layer-definitions.js [MODIFY] rename layer ids (D4) + name strings; repoint imports;
                                          drawTunniCombined/drawActualTunniPoints stay render-only
  panel-transformation.js        [MODIFY] "Tunni Labels"→"Point labels"; showTunni*→showLabels* keys
  scene-controller.js            [MODIFY] showTunni*→showLabels* scene-setting keys
```

No lang/*.js changes: all Tunni strings are **literals** (`name:` fields + panel label) — `grep -ri tunni src-js/fontra-core/assets/lang` returns nothing. Confirmed.

---

## Task 1: `calculateSegmentTension` in tunni-calculations.js (TDD, core)

Add the single canonical tension function. Math is moved verbatim from `distance-angle.js:calculateTension` (the τ = 2ac/(ad+bc) formula) minus its debug logging, carrying its private `lineIntersection` helper so output is byte-identical.

**Files:**
- Modify: `src-js/fontra-core/src/tunni-calculations.js`
- Test: `src-js/fontra-core/tests/test-tunni-calculations.js` (create)

**Interfaces:**
- Produces: `calculateSegmentTension(offCurvePointA, onCurvePointA, offCurvePointB, onCurvePointB) -> number` — returns the Tunni tension τ for the handle (offCurvePointA attached to onCurvePointA), with the opposite handle/anchor as B/D. Returns `0` on degenerate/parallel cases. Same arg order and semantics as the old `distance-angle.js:calculateTension` (minus the `isSelectedOffCurve` debug flag).

- [ ] **Step 1: Write the failing test**

Create `src-js/fontra-core/tests/test-tunni-calculations.js`:

```javascript
import { calculateSegmentTension } from "@fontra/core/tunni-calculations.js";
import { expect } from "chai";

describe("tunni-calculations: calculateSegmentTension", () => {
  it("returns 1.0 when both handles point at the corner (a=b=c=d)", () => {
    // A=(0,0) C=(10,0); B=(10,10) D=(10,0). Lines AC (y=0) ∩ BD (x=10) = T=(10,0).
    // a=AC=10, b=AT=10, c=BD=10, d=BT=10 → τ = 2(100)/(100+100) = 1.0
    const t = calculateSegmentTension(
      { x: 10, y: 0 }, // C (offCurvePointA)
      { x: 0, y: 0 }, // A (onCurvePointA)
      { x: 10, y: 0 }, // D (offCurvePointB)
      { x: 10, y: 10 } // B (onCurvePointB)
    );
    expect(t).to.be.closeTo(1.0, 1e-9);
  });

  it("returns 2/3 for an asymmetric handle (a=5,b=10,c=10,d=10)", () => {
    // A=(0,0) C=(5,0); B=(10,10) D=(10,0). T=(10,0). a=5,b=10,c=10,d=10 → 2(50)/(50+100)=2/3
    const t = calculateSegmentTension(
      { x: 5, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 }
    );
    expect(t).to.be.closeTo(2 / 3, 1e-9);
  });

  it("returns 0 for a degenerate (zero-length) handle", () => {
    const t = calculateSegmentTension(
      { x: 0, y: 0 }, // C == A → a = 0
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 }
    );
    expect(t).to.equal(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-js/fontra-core && npx mocha tests/test-tunni-calculations.js --reporter spec`
Expected: FAIL — `calculateSegmentTension is not a function` (or import error).

- [ ] **Step 3: Add `calculateSegmentTension` + private `lineIntersection` to tunni-calculations.js**

Append to `src-js/fontra-core/src/tunni-calculations.js` (after the existing imports, anywhere at module scope — e.g. directly below `snapToGrid`). The body is `distance-angle.js:calculateTension` with all `console.log`/`isSelectedOffCurve` removed, plus a private copy of `distance-angle.js:lineIntersection`:

```javascript
// Private: infinite-line intersection (carried verbatim from distance-angle.js so
// calculateSegmentTension is numerically identical to the former calculateTension).
function lineIntersection(p1, p2, p3, p4) {
  const dx1 = p2.x - p1.x;
  const dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x;
  const dy2 = p4.y - p3.y;
  const det = dx1 * dy2 - dy1 * dx2;
  const epsilon = 1e-10;
  if (Math.abs(det) < epsilon) {
    return null;
  }
  const dx3 = p1.x - p3.x;
  const dy3 = p1.y - p3.y;
  const t = (dy3 * dx2 - dx3 * dy2) / det;
  const intersection = { x: p1.x + t * dx1, y: p1.y + t * dy1 };
  intersection.t1 = t;
  intersection.t2 = (dx1 * dy3 - dy1 * dx3) / -det;
  return intersection;
}

// Single canonical Tunni tension source (D5). τ = 2(a*c) / (a*d + b*c)
// a=AC, b=AT, c=BD, d=BT, T = intersection of lines AC and BD.
export function calculateSegmentTension(
  offCurvePointA,
  onCurvePointA,
  offCurvePointB,
  onCurvePointB
) {
  const epsilon = 1e-10;
  const a = Math.hypot(
    offCurvePointA.x - onCurvePointA.x,
    offCurvePointA.y - onCurvePointA.y
  );
  if (Math.abs(a) < epsilon) {
    return 0;
  }
  const pointT = lineIntersection(
    onCurvePointA,
    offCurvePointA,
    onCurvePointB,
    offCurvePointB
  );
  if (!pointT) {
    return 0;
  }
  const b = Math.hypot(pointT.x - onCurvePointA.x, pointT.y - onCurvePointA.y);
  const c = Math.hypot(
    offCurvePointB.x - onCurvePointB.x,
    offCurvePointB.y - onCurvePointB.y
  );
  if (Math.abs(c) < epsilon) {
    return 0;
  }
  const d = Math.hypot(pointT.x - onCurvePointB.x, pointT.y - onCurvePointB.y);
  const numerator = 2 * (a * c);
  const denominator = a * d + b * c;
  if (Math.abs(denominator) < epsilon) {
    return 0;
  }
  return numerator / denominator;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-js/fontra-core && npx mocha tests/test-tunni-calculations.js --reporter spec`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add src-js/fontra-core/src/tunni-calculations.js src-js/fontra-core/tests/test-tunni-calculations.js
git commit -m "feat(tunni): add canonical calculateSegmentTension (D5)"
```

---

## Task 2: Repoint Q-measure tension + delete `calculateTension` (TDD, core)

`distance-angle.js:calculateHandleMeasure` must consume `calculateSegmentTension`; the local `calculateTension` (and its standalone console.log "test" function) are deleted.

**Files:**
- Modify: `src-js/fontra-core/src/distance-angle.js`
- Test: `src-js/fontra-core/tests/test-distance-angle.js`

**Interfaces:**
- Consumes: `calculateSegmentTension` (Task 1).
- `calculateHandleMeasure(segmentPoints, hoveredHandleSide)` signature/return unchanged (`{distance, angle, tension}`).

- [ ] **Step 1: Add the regression assertion to test-distance-angle.js**

In `src-js/fontra-core/tests/test-distance-angle.js`, add to the imports and a new `it`:

```javascript
// add to the existing distance-angle import block:
//   calculateHandleMeasure  (already imported)
// add a new import line:
import { calculateSegmentTension } from "@fontra/core/tunni-calculations.js";
```

```javascript
it("calculateHandleMeasure tension equals calculateSegmentTension and is 0.5 for the canonical fixture", () => {
  const seg = [
    { x: 0, y: 0 }, // onStart A
    { x: 0, y: 100 }, // offStart C
    { x: 100, y: 200 }, // offEnd D
    { x: 200, y: 200 }, // onEnd B
  ];
  const m = calculateHandleMeasure(seg, "start");
  // start: handle=C, anchor=A, oppositeHandle=D, oppositeAnchor=B
  const expected = calculateSegmentTension(seg[1], seg[0], seg[2], seg[3]);
  expect(m.tension).to.be.closeTo(expected, 1e-9);
  expect(m.tension).to.be.closeTo(0.5, 1e-9); // analytic: a=100,b=200,c=100,d=200
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd src-js/fontra-core && npx mocha tests/test-distance-angle.js --reporter spec`
Expected: FAIL — `calculateSegmentTension` is imported but `calculateHandleMeasure` still uses local `calculateTension`; the `0.5` assert may pass but the import-driven test run errors only if not wired. (If it passes incidentally, proceed — Step 3 makes the wiring real and the dual assert locks it.)

- [ ] **Step 3: Rewrite `calculateHandleMeasure` and delete `calculateTension`**

In `src-js/fontra-core/src/distance-angle.js`:

1. Add to the top-of-file import from `./vector.js` block — leave it; instead add a NEW import after the vector import:

```javascript
import { calculateSegmentTension } from "./tunni-calculations.js";
```

2. Delete the entire `calculateTension` function (the `export function calculateTension(... ) { ... }` block, including its leading comment `// Calculate Tunni tension for a curve segment` and all `console.log` debug lines — currently ≈ lines 167–296).

3. In `calculateHandleMeasure`, replace the `calculateTension(...)` call:

```javascript
  // OLD:
  // const tension = calculateTension(
  //   handlePoint,
  //   anchorPoint,
  //   oppositeHandle,
  //   oppositeAnchor
  // );
  const tension = calculateSegmentTension(
    handlePoint,
    anchorPoint,
    oppositeHandle,
    oppositeAnchor
  );
```

4. Delete the standalone console.log "test line intersection" function (the block beginning `console.log("Testing line intersection fix...")` ≈ lines 1206–1230; delete the whole function that wraps it). Verify it is not exported/imported anywhere first:

Run: `git grep -n "Testing line intersection" src-js`
Expected: only the definition in distance-angle.js (no callers) → safe to delete.

- [ ] **Step 4: Verify the module loads + tests pass**

Run: `node --check src-js/fontra-core/src/distance-angle.js`
Expected: no output (valid).

Run: `git grep -n "calculateTension\b" src-js`
Expected: **no matches** (the name is fully gone; only `calculateSegmentTension` remains).

Run: `cd src-js/fontra-core && npx mocha tests/test-distance-angle.js tests/test-tunni-calculations.js --reporter spec`
Expected: PASS (all green).

- [ ] **Step 5: Commit**

```bash
git add src-js/fontra-core/src/distance-angle.js src-js/fontra-core/tests/test-distance-angle.js
git commit -m "refactor(tunni): route Q-measure through calculateSegmentTension; drop calculateTension + debug logs (D5)"
```

---

## Task 3: De-duplicate Tunni geometry out of distance-angle.js (TDD-guarded, core)

`distance-angle.js` carries full copies of geometry that belong in `tunni-calculations.js`. Delete them; repoint `drawTunniLabels`'s internal geometry calls to canonical imports. (Names used here are still the **pre-rename** canonical names — `calculateTunniPoint`=midpoint, `calculateTrueTunniPoint`=intersection — Task 4 renames them.)

**Files:**
- Modify: `src-js/fontra-core/src/distance-angle.js`, `src-js/views-editor/src/visualization-layer-definitions.js`

**Interfaces:**
- `tunni-calculations.js` already exports `calculateTunniPoint` (midpoint), `calculateTrueTunniPoint` (intersection), `calculateControlHandleDistance`, `areDistancesEqualized`, `calculateEqualizedControlPoints` — these become the sole copies.

- [ ] **Step 1: Confirm the distance-angle copies have no external importers other than viz**

Run: `git grep -n "calculateTrueTunniPoint\|calculateTunniPointz\|calculateEqualizedControlPoints\|areDistancesEqualized\|calculateControlHandleDistance" src-js`
Expected map (verify before editing):
- Pointer imports `areDistancesEqualized`, `calculateEqualizedControlPoints` from **tunni-calculations.js** (keep).
- Viz imports `calculateControlHandleDistance`, `calculateTunniPointz` from **distance-angle.js** (lines 5,12) and `calculateTrueTunniPoint`, `calculateTunniPoint` from **tunni-calculations.js** (lines 39-40).
- distance-angle's own copies are used only internally by its `calculateEqualizedControlPoints`, `drawTunniLabels`.

- [ ] **Step 2: Delete the duplicate geometry from distance-angle.js**

Delete these whole functions from `src-js/fontra-core/src/distance-angle.js` (anchor by signature, not line number):
- `export function calculateTrueTunniPoint(segmentPoints) { ... }`
- `export function calculateEqualizedControlPoints(segmentPoints) { ... }`
- `export function calculateControlHandleDistance(segmentPoints) { ... }`
- `export function areDistancesEqualized(segmentPoints) { ... }`
- `export function calculateTunniPointz(segmentPoints) { ... }`

(Leave `drawTunniLabels`, `calculateHandleMeasure`, and all non-Tunni measure/label code in place.)

- [ ] **Step 3: Repoint `drawTunniLabels` geometry calls to canonical imports**

In `distance-angle.js`, extend the new tunni-calculations import (added in Task 2) to bring in the geometry:

```javascript
import {
  calculateSegmentTension,
  calculateTunniPoint, // midpoint (pre-rename); becomes calculateControlHandlePoint in Task 4
  calculateTrueTunniPoint, // intersection (pre-rename); becomes calculateTunniPoint in Task 4
} from "./tunni-calculations.js";
```

In `drawTunniLabels`, replace the two internal calls:
- `const visualPt = calculateTunniPointz(segment.points);` → `const visualPt = calculateTunniPoint(segment.points);`
- `const truePt = calculateTrueTunniPoint(segment.points);` → unchanged in spelling, but now resolves to the import (the local def is deleted).

- [ ] **Step 4: Repoint the viz imports that pulled geometry from distance-angle.js**

In `src-js/views-editor/src/visualization-layer-definitions.js`:
- Remove `calculateControlHandleDistance` and `calculateTunniPointz` from the `@fontra/core/distance-angle.js` import block (lines 5 and 12).
- Confirm whether either is actually used in viz: `git grep -n "calculateControlHandleDistance\|calculateTunniPointz" src-js/views-editor/src/visualization-layer-definitions.js`
  - If `calculateTunniPointz` has use-sites, add `calculateTunniPoint` to the existing `@fontra/core/tunni-calculations.js` import (line 38-41) and replace the call(s).
  - If `calculateControlHandleDistance` has use-sites, add it to the tunni-calculations import. If neither is used, just drop the imports.

- [ ] **Step 5: Verify**

Run:
```bash
node --check src-js/fontra-core/src/distance-angle.js
node --check src-js/views-editor/src/visualization-layer-definitions.js
git grep -n "calculateTunniPointz" src-js
```
Expected: no syntax errors; `calculateTunniPointz` returns **no matches** (fully removed).

Run: `cd src-js/fontra-core && npm test`
Expected: full core suite PASS (the dedupe is behavior-neutral; existing tests green).

- [ ] **Step 6: Commit**

```bash
git add src-js/fontra-core/src/distance-angle.js src-js/views-editor/src/visualization-layer-definitions.js
git commit -m "refactor(tunni): single home for tunni geometry; drop distance-angle dupes (D5)"
```

---

## Task 4: D2/D3 naming cascade (TDD-guarded, core + viz + distance-angle)

Rename the two geometry functions and every reference, in **two ordered phases** to avoid the name collision (old intersection name becomes the old midpoint's vacated identifier).

**Files:**
- Modify: `tunni-calculations.js`, `distance-angle.js`, `visualization-layer-definitions.js`, `tests/test-tunni-calculations.js`

**Interfaces:**
- Produces: `calculateControlHandlePoint(segmentPoints)` (midpoint), `calculateTunniPoint(segmentPoints)` (intersection). `calculateTrueTunniPoint` ceases to exist.

- [ ] **Step 1: Add rename guards to the test**

Append to `tests/test-tunni-calculations.js`:

```javascript
import {
  calculateControlHandlePoint,
  calculateTunniPoint,
} from "@fontra/core/tunni-calculations.js";

describe("tunni-calculations: geometry naming (D2/D3)", () => {
  const seg = [
    { x: 0, y: 0 },
    { x: 0, y: 100 },
    { x: 100, y: 200 },
    { x: 200, y: 200 },
  ];
  it("calculateControlHandlePoint is the midpoint of the two controls", () => {
    expect(calculateControlHandlePoint(seg)).deep.equals({ x: 50, y: 150 });
  });
  it("calculateTunniPoint is the tangent-ray intersection", () => {
    // lines (0,0)->(0,100) [x=0] and (200,200)->(100,200) [y=200] meet at (0,200)
    const p = calculateTunniPoint(seg);
    expect(p.x).to.be.closeTo(0, 1e-9);
    expect(p.y).to.be.closeTo(200, 1e-9);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd src-js/fontra-core && npx mocha tests/test-tunni-calculations.js --reporter spec`
Expected: FAIL — `calculateControlHandlePoint is not a function`.

- [ ] **Step 3: Phase A — rename midpoint `calculateTunniPoint` → `calculateControlHandlePoint`**

In `src-js/fontra-core/src/tunni-calculations.js`: rename the `export function calculateTunniPoint` (the **midpoint** one — body computes `(p2.x+p3.x)/2`) to `calculateControlHandlePoint`. Update its internal references. Then update consumers:
- `visualization-layer-definitions.js`: import line 40 `calculateTunniPoint` → `calculateControlHandlePoint`; use-site in `drawTunniCombined` (`const tunniPoint = calculateTunniPoint(segment.points);` → `calculateControlHandlePoint`).
- `distance-angle.js`: the import added in Task 3 (`calculateTunniPoint` midpoint) → `calculateControlHandlePoint`; `drawTunniLabels` use-site `const visualPt = calculateTunniPoint(...)` → `calculateControlHandlePoint`.

Verify no stray midpoint refs: `git grep -n "calculateTunniPoint\b" src-js` — every remaining hit must be the **intersection** function (renamed in Phase B), none the midpoint.

- [ ] **Step 4: Phase B — rename intersection `calculateTrueTunniPoint` → `calculateTunniPoint`**

In `tunni-calculations.js`: rename `export function calculateTrueTunniPoint` → `calculateTunniPoint`; update its internal callers (`calculateEqualizedControlPoints`, `balanceSegment`, and the interaction fns that reference it — all within the file).
Update consumers:
- `visualization-layer-definitions.js`: import line 39 `calculateTrueTunniPoint` → `calculateTunniPoint`; use-site in `drawActualTunniPoints` (`calculateTrueTunniPoint(segment.points)` → `calculateTunniPoint`).
- `distance-angle.js`: import `calculateTrueTunniPoint` → `calculateTunniPoint`; `drawTunniLabels` use-site `const truePt = calculateTrueTunniPoint(...)` → `calculateTunniPoint`.

- [ ] **Step 5: Verify the cascade is complete**

Run:
```bash
git grep -n "calculateTrueTunniPoint" src-js
node --check src-js/fontra-core/src/tunni-calculations.js
node --check src-js/fontra-core/src/distance-angle.js
node --check src-js/views-editor/src/visualization-layer-definitions.js
```
Expected: `calculateTrueTunniPoint` → **no matches**; all `node --check` clean.

Run: `cd src-js/fontra-core && npm test`
Expected: full core suite PASS.

- [ ] **Step 6: Commit**

```bash
git add src-js/fontra-core/src/tunni-calculations.js src-js/fontra-core/src/distance-angle.js src-js/views-editor/src/visualization-layer-definitions.js src-js/fontra-core/tests/test-tunni-calculations.js
git commit -m "refactor(tunni): canonical geometry names — controlHandlePoint + tunniPoint (D2/D3)"
```

---

## Task 5: Extract interaction into `tunni-interactions.js`; purify the core module

Move every interaction function (mouse state, drag-change math, hit-test, equalize orchestration) out of `tunni-calculations.js` into a new views-editor module. Pure math (geometry, tension, `calculateOnCurvePointsFromTunni`, `calculateControlPointsFromTunni`, `balanceSegment`, `snapToGrid`, `calculateControlHandleDistance`, `areDistancesEqualized`, `calculateEqualizedControlPoints`) stays in core. Also delete the dead commented-out `drawTunniLabels` block.

**Files:**
- Create: `src-js/views-editor/src/tunni-interactions.js`
- Modify: `src-js/fontra-core/src/tunni-calculations.js`, `src-js/views-editor/src/edit-tools-pointer.js`

**Interfaces:**
- Produces (in `tunni-interactions.js`, re-exported for the pointer): `tunniLayerHitTest`, `findTunniPointHit`, `handleTunniPointMouseDown`, `handleTunniPointMouseDrag`, `handleTunniPointMouseUp`, `calculateTunniPointDragChanges`, `handleTrueTunniPointMouseDown`, `handleTrueTunniPointMouseDrag`, `handleTrueTunniPointMouseUp`, `calculateTrueTunniPointDragChanges`, `equalizeSegmentDistances`, `handleEqualizeDistances`. Each imports pure math from `@fontra/core/tunni-calculations.js`.

> No mocha here — these are interaction fns (sceneController/events). Verification is `node --check` + Task 9 manual checks.

- [ ] **Step 1: Create `tunni-interactions.js` and move the interaction functions**

Create `src-js/views-editor/src/tunni-interactions.js` with a header import pulling the pure math it needs:

```javascript
import { distance, normalizeVector, subVectors } from "@fontra/core/vector.js";
import {
  areDistancesEqualized,
  calculateControlHandlePoint,
  calculateEqualizedControlPoints,
  calculateTunniPoint,
  snapToGrid,
} from "@fontra/core/tunni-calculations.js";
```

Then **move** (cut from `tunni-calculations.js`, paste here) these functions verbatim, updating any internal call from the old names to the canonical ones (`calculateTunniPoint`=intersection, `calculateControlHandlePoint`=midpoint — note the hit-tests call BOTH):
- `findTunniPointHit`
- `handleEqualizeDistances`
- `equalizeSegmentDistances`
- `handleTunniPointMouseDown`
- `calculateTunniPointDragChanges`
- `handleTunniPointMouseDrag`
- `handleTunniPointMouseUp`
- `tunniLayerHitTest`
- `handleTrueTunniPointMouseDown`
- `calculateTrueTunniPointDragChanges`
- `handleTrueTunniPointMouseDrag`
- `handleTrueTunniPointMouseUp`

> Inside these, the local calls `calculateTrueTunniPoint(...)` become `calculateTunniPoint(...)` and `calculateTunniPoint(...)` (midpoint) become `calculateControlHandlePoint(...)` per Task 4. The layer-id strings `"fontra.tunni.combined"` / `"fontra.tunni.actual.points"` stay as-is for now (renamed in Task 7).

- [ ] **Step 2: Delete the dead commented `drawTunniLabels` block from core**

In `tunni-calculations.js`, delete the large `/* export function drawTunniLabels ... */` comment block (≈ lines 314–593) and the now-unused helper stubs at the top that only served drawing (`strokeLine`, `drawRoundRect`) **if** `git grep` shows no remaining callers in core:

Run: `git grep -n "strokeLine\|drawRoundRect" src-js/fontra-core/src/tunni-calculations.js`
Expected after the move: no live callers → delete those two helpers too. (If any remain, leave them.)

- [ ] **Step 3: Point the pointer at the new module**

In `src-js/views-editor/src/edit-tools-pointer.js`, change the import source for the interaction functions from `@fontra/core/tunni-calculations.js` to `./tunni-interactions.js`. Pure-math names the pointer also imports (`areDistancesEqualized`, `calculateEqualizedControlPoints`) may be re-exported from `tunni-interactions.js` OR kept importing from core — keep them importing from `@fontra/core/tunni-calculations.js` (they're pure math). Only the interaction fns move to the `./tunni-interactions.js` import.

- [ ] **Step 4: Verify all three files parse and names resolve**

Run:
```bash
node --check src-js/fontra-core/src/tunni-calculations.js
node --check src-js/views-editor/src/tunni-interactions.js
node --check src-js/views-editor/src/edit-tools-pointer.js
git grep -n "from \"@fontra/core/tunni-calculations.js\"" src-js/views-editor/src
```
Expected: clean parses; pointer imports interaction fns from `./tunni-interactions.js`, pure math (if any) from core.

Run: `cd src-js/fontra-core && npm test`
Expected: full core suite PASS (core is now math-only; nothing it exports changed semantically).

- [ ] **Step 5: Commit**

```bash
git add src-js/fontra-core/src/tunni-calculations.js src-js/views-editor/src/tunni-interactions.js src-js/views-editor/src/edit-tools-pointer.js
git commit -m "refactor(tunni): extract interaction to tunni-interactions.js; purify core to math-only (D6)"
```

---

## Task 6: Thin the pointer — move drag orchestration into tunni-interactions.js

`edit-tools-pointer.js` holds ~259 lines of Tunni: the hover/cursor block (≈129–230) and a ~190-line inline drag/undo loop (≈254–600) that calls the interaction helpers and runs `editLayersAndRecordChanges`. Move the orchestration into a single `handleTunniDrag(...)` entry point in `tunni-interactions.js` (skeleton's `handleSkeletonTunniDrag` is the structural model — but operate on the regular path, NOT skeletonData) and reduce the pointer to a dispatch hook.

**Files:**
- Modify: `src-js/views-editor/src/tunni-interactions.js`, `src-js/views-editor/src/edit-tools-pointer.js`

**Interfaces:**
- Produces: `handleTunniDrag({ sceneController, eventStream, initialEvent, isTrueTunniPoint, tunniInitialState })` — runs the drag/equalize/undo loop, returns when the drag ends. `tunniHoverResult(glyphPoint, size, positionedGlyph, visualizationLayersSettings) -> { cursor } | null` — encapsulates the hover hit-test + cursor decision.

> Manual verification only.

- [ ] **Step 1: Add `handleTunniDrag` + `tunniHoverResult` to tunni-interactions.js**

Move the body of the pointer's inline Tunni drag loop (the block that builds `tunniInitialState`, branches on `isTrueTunniPoint`, calls `handleTrueTunniPointMouseDrag`/`handleTunniPointMouseDrag`, and commits via `sceneController.editLayersAndRecordChanges`) into an exported `async function handleTunniDrag(...)` in `tunni-interactions.js`. Move the hover hit-test + cursor-selection logic (the `isHoveringTunniPoint`/`isHoveringTrueTunniPoint` computation) into `tunniHoverResult(...)`. Preserve the exact `undoLabel` strings (`"Move On-Curve Points via Tunni"`, `"Move Tunni Points"`) and the Ctrl+Shift equalize branch.

- [ ] **Step 2: Replace the pointer's inline blocks with dispatch calls**

In `edit-tools-pointer.js`:
- `handleHover`: replace the inline Tunni hover block with `const tunni = tunniHoverResult(glyphPoint, size, positionedGlyph, this.editor.visualizationLayersSettings); if (tunni) { this.canvasController.canvas.style.cursor = tunni.cursor; return; }` (preserving the existing early-return structure).
- `handleDrag` (or `handleDragBegin`, matching the current method): after detecting a Tunni hit, `return await handleTunniDrag({ sceneController: this.sceneController, eventStream, initialEvent, isTrueTunniPoint, tunniInitialState });`.
- Delete the now-moved inline lines. Keep the import list pointing at `./tunni-interactions.js`, adding `handleTunniDrag`, `tunniHoverResult`.

- [ ] **Step 3: Verify parse + line reduction**

Run:
```bash
node --check src-js/views-editor/src/tunni-interactions.js
node --check src-js/views-editor/src/edit-tools-pointer.js
git grep -c "[Tt]unni" src-js/views-editor/src/edit-tools-pointer.js
```
Expected: clean parses; the Tunni reference count in the pointer drops sharply (target: only the import + the two dispatch hooks remain — roughly <20 lines vs ~259 before).

- [ ] **Step 4: Build**

Run: `npm run bundle`
Expected: webpack completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add src-js/views-editor/src/tunni-interactions.js src-js/views-editor/src/edit-tools-pointer.js
git commit -m "refactor(tunni): move drag orchestration to tunni-interactions; thin the pointer"
```

---

## Task 7: Geometry-draw layer-id rename (D4) + render-only confirm (viz)

Hard-rename the two Tunni geometry layers and their `name:` strings; update every id reference. `drawTunniCombined`/`drawActualTunniPoints` are already thin render fns consuming core math — confirm, don't rewrite.

**Files:**
- Modify: `visualization-layer-definitions.js`, `tunni-interactions.js`, `edit-tools-pointer.js`

- [ ] **Step 1: Rename the layer identifiers + display names in viz**

In `visualization-layer-definitions.js`:
- `identifier: "fontra.tunni.combined"` → `identifier: "fontra.tunni.handle"`; `name: "TUNNI Lines and Points"` → `name: "Tunni handles"`.
- `identifier: "fontra.tunni.actual.points"` → `identifier: "fontra.tunni.point"`; `name: "Actual TUNNI Points"` → `name: "Tunni point"`.

- [ ] **Step 2: Update every id reference across views-editor**

Run: `git grep -n "fontra.tunni.combined\|fontra.tunni.actual.points" src-js`
Update each hit (NOT under `skeleton/`):
- `tunni-interactions.js`: the `visualizationLayerSettings.model["fontra.tunni.combined"]` / `["fontra.tunni.actual.points"]` checks in the moved `handle*MouseDown` and hover fns → `["fontra.tunni.handle"]` / `["fontra.tunni.point"]`.
- `edit-tools-pointer.js`: the `visualizationLayersSettings.model["fontra.tunni.combined"]` / `["fontra.tunni.actual.points"]` checks → renamed ids.

- [ ] **Step 3: Verify**

Run:
```bash
git grep -n "fontra.tunni.combined\|fontra.tunni.actual.points" src-js/views-editor src/fontra-core 2>/dev/null
node --check src-js/views-editor/src/visualization-layer-definitions.js
node --check src-js/views-editor/src/tunni-interactions.js
node --check src-js/views-editor/src/edit-tools-pointer.js
```
Expected: no matches for the old ids outside `skeleton/`; clean parses.

- [ ] **Step 4: Commit**

```bash
git add src-js/views-editor/src/visualization-layer-definitions.js src-js/views-editor/src/tunni-interactions.js src-js/views-editor/src/edit-tools-pointer.js
git commit -m "refactor(tunni): hard-rename geometry layer ids → fontra.tunni.handle/.point (D4)"
```

---

## Task 8: Panel + scene-setting key renames (D7/D8)

Rename the user-facing label ("Tunni Labels"→"Point labels") and the three settings keys (`showTunni*`→`showLabels*`), including the `drawTunniLabels` reader so labels keep rendering. (The `fontra.tunni.labels` **layer** rename + tension repoint are WS-4.5.)

**Files:**
- Modify: `panel-transformation.js`, `scene-controller.js`, `distance-angle.js`

- [ ] **Step 1: Rename keys + label in panel-transformation.js**

In `src-js/views-editor/src/panel-transformation.js`:
- `label: "Tunni Labels"` → `label: "Point labels"`.
- Every `showTunniDistance` → `showLabelsDistance`, `showTunniTension` → `showLabelsTension`, `showTunniAngle` → `showLabelsAngle` (the `transformParameters.*`, the `key:` fields, the `.includes([...])` array, the `setItem(...)` calls, and the checkbox sync block).

- [ ] **Step 2: Rename keys in scene-controller.js**

In `src-js/views-editor/src/scene-controller.js` (≈ lines 150–152), rename the three default scene settings `showTunniDistance/Tension/Angle` → `showLabelsDistance/Tension/Angle`.

- [ ] **Step 3: Rename the reader keys in drawTunniLabels**

In `src-js/fontra-core/src/distance-angle.js`, `drawTunniLabels` reads `model.sceneSettings?.showTunniDistance` / `showTunniTension` / `showTunniAngle` — rename to `showLabelsDistance` / `showLabelsTension` / `showLabelsAngle`.

- [ ] **Step 4: Verify the rename is total**

Run: `git grep -n "showTunni" src-js`
Expected: **no matches** outside `skeleton/`.

Run:
```bash
node --check src-js/fontra-core/src/distance-angle.js
node --check src-js/views-editor/src/panel-transformation.js
node --check src-js/views-editor/src/scene-controller.js
cd src-js/fontra-core && npm test
```
Expected: clean parses; core suite PASS.

- [ ] **Step 5: Commit**

```bash
git add src-js/views-editor/src/panel-transformation.js src-js/views-editor/src/scene-controller.js src-js/fontra-core/src/distance-angle.js
git commit -m "refactor(tunni): rename showTunni*→showLabels* keys + 'Point labels' (D7/D8)"
```

---

## Task 9: Equalize/drag math improvements — A (round) + C (tension guard) + B (tension-preserving drag)

User-approved behavior changes ported from skeleton. Runs after the interaction code has moved into `tunni-interactions.js` (Tasks 5–6) and the rename is done (Task 4). The pure new function (C) is TDD'd in core; the apply-side tweaks (A, B) are in `tunni-interactions.js` (manual verify).

**Files:**
- Modify: `src-js/fontra-core/src/tunni-calculations.js`, `src-js/fontra-core/tests/test-tunni-calculations.js`, `src-js/views-editor/src/tunni-interactions.js`

**Interfaces:**
- Produces: `areTensionsEqualized(segmentPoints, tolerance = 0.01) -> boolean` (core) — true when the two handle tensions match within tolerance. Uses `calculateTunniPoint` (intersection).
- Consumes: `snapToGrid`, `calculateTunniPoint`, `distance` (already imported in `tunni-interactions.js` per Task 5).

### Part C — tension-based equalize guard (TDD, core)

- [ ] **Step 1: Write the failing test**

Append to `src-js/fontra-core/tests/test-tunni-calculations.js`:

```javascript
import { areTensionsEqualized } from "@fontra/core/tunni-calculations.js";

describe("tunni-calculations: areTensionsEqualized (option C)", () => {
  it("true when both handle tensions match", () => {
    // seg → trueTunni=(0,200); tension1=100/200=0.5, tension2=100/200=0.5
    expect(
      areTensionsEqualized([
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 100, y: 200 },
        { x: 200, y: 200 },
      ])
    ).to.equal(true);
  });
  it("false when handle tensions differ", () => {
    // shorter start handle → tension1=50/200=0.25 vs tension2=0.5
    expect(
      areTensionsEqualized([
        { x: 0, y: 0 },
        { x: 0, y: 50 },
        { x: 100, y: 200 },
        { x: 200, y: 200 },
      ])
    ).to.equal(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd src-js/fontra-core && npx mocha tests/test-tunni-calculations.js --reporter spec`
Expected: FAIL — `areTensionsEqualized is not a function`.

- [ ] **Step 3: Add `areTensionsEqualized` to tunni-calculations.js**

Add (must be after the `calculateTunniPoint` intersection function from Task 4, since it calls it):

```javascript
/**
 * True when the two handle tensions of a cubic segment are equal within tolerance.
 * Tension = dist(onCurve, control) / dist(onCurve, tunniPoint). Ported from skeleton's
 * areSkeletonTensionsEqualized — semantically correct for "already equalized", unlike the
 * raw-handle-length compare in areDistancesEqualized.
 */
export function areTensionsEqualized(segmentPoints, tolerance = 0.01) {
  const [p1, p2, p3, p4] = segmentPoints;
  const trueTunni = calculateTunniPoint(segmentPoints); // intersection point
  if (!trueTunni) {
    return true;
  }
  const distStartToTunni = distance(p1, trueTunni);
  const distEndToTunni = distance(p4, trueTunni);
  if (distStartToTunni <= 0 || distEndToTunni <= 0) {
    return true;
  }
  const tension1 = distance(p1, p2) / distStartToTunni;
  const tension2 = distance(p4, p3) / distEndToTunni;
  return Math.abs(tension1 - tension2) < tolerance;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd src-js/fontra-core && npx mocha tests/test-tunni-calculations.js --reporter spec`
Expected: PASS.

### Part A — round equalized control points + Part C wiring (tunni-interactions.js)

- [ ] **Step 5: Import the new guard + ensure snapToGrid is imported**

In `src-js/views-editor/src/tunni-interactions.js`, extend the `@fontra/core/tunni-calculations.js` import to include `areTensionsEqualized` (and confirm `snapToGrid`, `calculateTunniPoint`, `distance` are present from Task 5).

- [ ] **Step 6: Round + switch guard in `equalizeSegmentDistances`**

In `equalizeSegmentDistances`, change the skip-guard and round the applied points:

```javascript
  // OLD guard: if (areDistancesEqualized(segmentPoints)) { ... return; }
  if (areTensionsEqualized(segmentPoints)) {
    return;
  }

  const newControlPoints = calculateEqualizedControlPoints(segmentPoints);

  // ... inside editLayersAndRecordChanges, where the points are written:
  // OLD:
  // path.setPointPosition(controlPoint1Index, newControlPoints[0].x, newControlPoints[0].y);
  // path.setPointPosition(controlPoint2Index, newControlPoints[1].x, newControlPoints[1].y);
  const rounded1 = snapToGrid(newControlPoints[0]); // { x: Math.round, y: Math.round }
  const rounded2 = snapToGrid(newControlPoints[1]);
  path.setPointPosition(controlPoint1Index, rounded1.x, rounded1.y);
  path.setPointPosition(controlPoint2Index, rounded2.x, rounded2.y);
```

### Part B — tension-preserving proportional drag (forkra original kept commented)

- [ ] **Step 7: Replace the proportional branch in `calculateTunniPointDragChanges`**

In `tunni-interactions.js`, in `calculateTunniPointDragChanges`, replace the body of the `if (equalizeDistances) { ... }` branch with skeleton's tension-preserving move, keeping forkra's original commented out per the user's request:

```javascript
  if (equalizeDistances) {
    // Project the mouse movement onto the averaged (45°) handle direction.
    const projection =
      mouseDelta.x * initialState.fortyFiveVector.x +
      mouseDelta.y * initialState.fortyFiveVector.y;

    // --- forkra original: move BOTH handles by the same projection (equalizes movement,
    //     not tension). Kept for reference / easy revert. ---
    // newControlPoint1 = {
    //   x: initialState.initialOffPoint1.x + initialState.unitVector1.x * projection,
    //   y: initialState.initialOffPoint1.y + initialState.unitVector1.y * projection,
    // };
    // newControlPoint2 = {
    //   x: initialState.initialOffPoint2.x + initialState.unitVector2.x * projection,
    //   y: initialState.initialOffPoint2.y + initialState.unitVector2.y * projection,
    // };

    // --- skeleton tension-preserving: move each handle ∝ its distance to the true Tunni
    //     point, so an unequal tension ratio is preserved during the drag (option B). ---
    const trueTunni = calculateTunniPoint(initialState.originalSegmentPoints);
    const distToTunni1 = trueTunni
      ? distance(initialState.initialOnPoint1, trueTunni)
      : 0;
    const distToTunni2 = trueTunni
      ? distance(initialState.initialOnPoint2, trueTunni)
      : 0;
    if (trueTunni && distToTunni1 > 0 && distToTunni2 > 0) {
      const totalDist = distToTunni1 + distToTunni2;
      const k = (2 * projection) / totalDist;
      const move1 = k * distToTunni1;
      const move2 = k * distToTunni2;
      newControlPoint1 = {
        x: initialState.initialOffPoint1.x + initialState.unitVector1.x * move1,
        y: initialState.initialOffPoint1.y + initialState.unitVector1.y * move1,
      };
      newControlPoint2 = {
        x: initialState.initialOffPoint2.x + initialState.unitVector2.x * move2,
        y: initialState.initialOffPoint2.y + initialState.unitVector2.y * move2,
      };
    } else {
      // Fallback (parallel handles / degenerate): equal projection along each handle.
      newControlPoint1 = {
        x: initialState.initialOffPoint1.x + initialState.unitVector1.x * projection,
        y: initialState.initialOffPoint1.y + initialState.unitVector1.y * projection,
      };
      newControlPoint2 = {
        x: initialState.initialOffPoint2.x + initialState.unitVector2.x * projection,
        y: initialState.initialOffPoint2.y + initialState.unitVector2.y * projection,
      };
    }
  } else {
    // (non-proportional branch unchanged)
  }
```

> `initialOnPoint1`/`initialOnPoint2` are the segment's start/end on-curve points; `unitVector1`/`unitVector2` are the normalized handle directions — both already populated in `initialState` by `handleTunniPointMouseDown`. No new state needed.

- [ ] **Step 8: Verify parse + core tests**

Run:
```bash
node --check src-js/views-editor/src/tunni-interactions.js
node --check src-js/fontra-core/src/tunni-calculations.js
git grep -n "areDistancesEqualized" src-js
cd src-js/fontra-core && npx mocha tests/test-tunni-calculations.js --reporter spec
```
Expected: clean parses; `areTensionsEqualized` now guards equalize (note whether `areDistancesEqualized` still has any caller — if none, it may be left as an exported util or removed in a follow-up); core tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src-js/fontra-core/src/tunni-calculations.js src-js/fontra-core/tests/test-tunni-calculations.js src-js/views-editor/src/tunni-interactions.js
git commit -m "feat(tunni): round equalized handles + tension-preserving drag + tension-based equalize guard (A/B/C)"
```

---

## Task 10: Format, build, and manual verification

**Files:** all modified files.

- [ ] **Step 1: Format**

Run: `npx prettier --write src-js/fontra-core/src/tunni-calculations.js src-js/fontra-core/src/distance-angle.js src-js/fontra-core/tests/test-tunni-calculations.js src-js/fontra-core/tests/test-distance-angle.js src-js/views-editor/src/tunni-interactions.js src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/visualization-layer-definitions.js src-js/views-editor/src/panel-transformation.js src-js/views-editor/src/scene-controller.js`

- [ ] **Step 2: Full core suite + build**

Run: `cd src-js/fontra-core && npm test` → Expected: all PASS.
Run: `npm run bundle` → Expected: webpack success, no errors.

- [ ] **Step 3: Manual verification (run the server, open a glyph with cubic curves)**

Confirm each — observe, do not assume:
- [ ] Enable the **Tunni handles** layer (was "TUNNI Lines and Points") — handle lines + midpoint dots render.
- [ ] Enable the **Tunni point** layer (was "Actual TUNNI Points") — intersection squares render.
- [ ] Hover a Tunni midpoint → pointer cursor; drag it → controls move **tension-preserving** (option B): with unequal handles the tension ratio holds during the drag (no longer snaps to equal movement).
- [ ] **Equalize (Ctrl+Shift on a handle):** tensions equalize; resulting control points land on **integer** coordinates (option A — verify in the coordinates panel). Skip-when-already-equal now uses the tension check (option C).
- [ ] Drag the real Tunni point → on-curve points move along fixed handle directions (**unchanged**).
- [ ] **Alt during drag** still disables proportional/equalized behavior (per-handle independent move) as before.
- [ ] **Point labels** (Transformation panel checkboxes, renamed from "Tunni Labels") toggle distance/tension/angle text; values match pre-refactor.
- [ ] Undo (`Cmd/Ctrl+Z`) reverts each Tunni drag in one step with the expected undo label.

- [ ] **Step 4: Commit the formatting pass (if prettier changed anything)**

```bash
git add -A
git commit -m "style(tunni): prettier pass for WS-4"
```

---

## Self-Review

**Spec coverage (master §6 WS-4 task outline → tasks here):**
- (1) add `calculateSegmentTension` → **Task 1**.
- (2) repoint distance-angle, delete `calculateTension` + console.logs → **Task 2**.
- (2b) de-dupe tunni-point geometry in distance-angle → **Task 3**.
- (3) rename within tunni-calculations.js (D2/D3) → **Task 4**.
- (4) create `tunni-interactions.js` → **Task 5**.
- (5) strip Tunni from pointer → **Tasks 5–6** (import repoint, then drag-orchestration move).
- (6) geometry draws render-only + layer-id hard-rename (D4) → **Task 7**.
- (7) panel/scene key + label renames (D7/D8) → **Task 8**.
- (8) prettier + commit per step → throughout + **Task 10**.
- (9) manual verify incl. equalize regression-watch → **Task 10**.

**Skeleton logic additions (user-approved, from skeleton analysis) → Task 9:**
- (A) round equalized control points to integers — `snapToGrid` in `equalizeSegmentDistances`.
- (B) tension-preserving proportional drag (`k = 2·projection/totalDist`) — forkra's original kept commented for easy revert.
- (C) tension-based "already equalized" guard — new pure `areTensionsEqualized` (TDD), replaces the raw-handle-length `areDistancesEqualized` in the equalize path. (Option D — drag-time modifier rounding — was declined.)

**Decisions:** D2/D3 (Task 4), D4 (Task 7; labels-id deferred to WS-4.5 by design), D5 (Tasks 1–3), D6 (Task 5 purify), D7/D8 (Task 8; labels-layer/tension deferred to WS-4.5).

**Deferred to WS-4.5 (intentional, not gaps):** `fontra.tunni.labels`→`fontra.point.labels` layer rename; `drawTunniLabels` tension repoint to `calculateSegmentTension`; moving the WS-2 measure-overlay draw into distance-angle. WS-4 leaves `drawTunniLabels` loadable (geometry repointed, keys renamed) but does not touch its tension math or layer id.

**Placeholder scan:** none — every code step shows the code or an exact edit + grep/`node --check` with expected output.

**Type/name consistency:** `calculateControlHandlePoint` (midpoint), `calculateTunniPoint` (intersection), `calculateSegmentTension` (4 point args), `fontra.tunni.handle`/`fontra.tunni.point` ids, `showLabelsDistance/Tension/Angle` keys — used identically in every task. Phase-ordered rename (A before B) avoids the `calculateTunniPoint` identifier collision.

**Risk notes:** Task 6 (pointer drag-orchestration move) is the only step with no automated test — the ~190-line undo loop must preserve atomic-edit + undo-label behavior; Task 10 manual checks gate it. The `lineIntersection` body is carried verbatim (not swapped for vector.js `intersect`) so tension output is bit-for-bit identical. Task 9 introduces the **only** intended behavior changes (A round / B tension-preserving drag / C tension guard); B keeps forkra's original commented for one-line revert, and the *true*-Tunni-point drag is untouched.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-06-30-ws4-tunni-refactor.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks. Sub-skill: `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute in-session with checkpoints. Sub-skill: `superpowers:executing-plans`.
