# WS-3 — SpeedPunk Panel + Parameterization + Viz Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give SpeedPunk a sidebar accordion (peak-height / sharpness / opacity) backed by app-level settings, and in the same pass move all curvature sampling/geometry math out of `visualization-layer-definitions.js` into `curvature.js`, leaving the `fontra.curvature` layer render-only.

**Architecture:** Two coupled changes done together (per master plan E.4 — touch sampling once). (1) **Extraction:** the four sampling helpers and a new pure `computeSpeedPunkSamples(path, params)` move into `fontra-core/src/curvature.js` (TDD); the viz layer becomes a thin loop that fills the quads the pure function returns. (2) **Parameterization:** the layer reads `peakHeightUpm` / `sharpness` / `opacity` live from `model.sceneSettings`; a new SpeedPunk accordion writes those, persisting to **app-level** `applicationSettingsController` (localStorage) and bridging to scene settings for live redraw — mirroring the WS-1 coarse-grid pattern exactly.

**Tech Stack:** ES modules; `@fontra/core/*` import alias → `src-js/fontra-core/src/`; mocha + chai (`cd src-js/fontra-core && npx mocha …`); `VarPackedPath` from `@fontra/core/var-path.js`; ObservableController app/scene settings; prettier 3.8.3; CRLF line endings.

## Global Constraints

- **D9 (locked):** SpeedPunk panel settings are **app-level / global** via `applicationSettingsController` + localStorage — **nothing written to project files**. Do **NOT** port skeleton's per-font persistence (`_persistSpeedPunkSettings`, `_getFontSpeedPunkSettingsFromEntity`, `_setEditorViewSettingsOnEntity` — those do a `performEdit` on the font). Use the app-settings pattern WS-1 established.
- **Part E (locked directive):** `visualization-layer-definitions.js` holds **only rendering + layer registration**. All sampling/geometry math moves to `curvature.js`. After this WS the `fontra.curvature` layer is a thin fill loop.
- **Adopt skeleton's parameterized height math, drop forkra's magic constants.** forkra currently scales comb height by hard-coded `* -180000` (cubic) / `* -48000` (quad) plus zoom dampening. Replace with skeleton's settings-driven formula: per-segment normalize `absK / segmentPeakAbsCurvature`, gamma-shape by `sharpness`, scale by `peakHeightUpm` (font-relative). The cubic/quad height asymmetry disappears — this is intended.
- **Leave `curvature.js`'s existing exports unchanged** (`solveCubicBezier`, `solveQuadraticBezier`, `calculateCurvatureForSegment`, `calculateCurvatureForQuadraticSegment`, `curvatureToColor`, the two `*Curvature` solvers). Only **add** to the file.
- Testing split (§4): math in `curvature.js` → real mocha TDD; panel/render → manual verification (views-editor has no test runner).
- Commit per task. Run `npx prettier --write` on every touched file before its commit. Syntax-check browser files with `node --check`.

---

## File Structure

- **MODIFY** `src-js/fontra-core/src/curvature.js` — add `import { VarPackedPath }`; add `calculateSegmentBudget`, `estimateCurveLength`, `adjustStepsForCurve`, `countCurveSegments` (moved from viz), and new `computeSpeedPunkSamples`. One responsibility: SpeedPunk/curvature math.
- **CREATE** `src-js/fontra-core/tests/test-curvature-sampling.js` — mocha tests for the helpers + `computeSpeedPunkSamples`.
- **MODIFY** `src-js/views-editor/src/visualization-layer-definitions.js` — delete the inline helpers (≈1710–1805) and the fat `fontra.curvature` draw (≈1808–2253); import `computeSpeedPunkSamples` from curvature.js; register a render-only `fontra.curvature` layer.
- **MODIFY** `src-js/fontra-core/src/application-settings.js` — add 3 app-level speedpunk keys.
- **MODIFY** `src-js/views-editor/src/scene-controller.js` — seed 3 speedpunk scene-setting defaults (live bridge), next to the `coarseGridSpacing` default (≈line 110).
- **MODIFY** `src-js/views-editor/src/panel-designspace-navigation.js` — speedpunk accordion already has markup (verify) + add getters + app-level wiring (mirror WS-1 coarse-grid methods).
- **MODIFY** `src-js/fontra-core/assets/lang/en.js` — speedpunk panel lang keys.

---

## Task 1: Move the four sampling helpers into `curvature.js`

**Files:**
- Modify: `src-js/fontra-core/src/curvature.js` (add import + 4 exported functions)
- Modify: `src-js/views-editor/src/visualization-layer-definitions.js` (delete local defs ≈1710–1805; import the 4 from curvature.js)
- Test: `src-js/fontra-core/tests/test-curvature-sampling.js`

**Interfaces:**
- Produces (all in `curvature.js`):
  - `calculateSegmentBudget(numCurves, zoomFactor, baseSegments=400, minSegmentsPerCurve=5) -> number`
  - `estimateCurveLength(p1, p2, p3, p4=null) -> number` (points are `[x,y]` arrays)
  - `adjustStepsForCurve(baseSteps, curveLength, averageLength, maxAdjustment=2.0) -> number`
  - `countCurveSegments(path: VarPackedPath) -> number`

- [ ] **Step 1: Write the failing test**

Create `src-js/fontra-core/tests/test-curvature-sampling.js`:

```javascript
import { expect } from "chai";
import { VarPackedPath } from "@fontra/core/var-path.js";
import {
  adjustStepsForCurve,
  calculateSegmentBudget,
  countCurveSegments,
  estimateCurveLength,
} from "@fontra/core/curvature.js";

describe("curvature sampling helpers", () => {
  it("calculateSegmentBudget divides budget across curves, respecting the minimum", () => {
    expect(calculateSegmentBudget(4, 1, 400, 5)).to.equal(100);
    expect(calculateSegmentBudget(1000, 1, 400, 5)).to.equal(5); // floor(0.4)=0 -> min 5
  });

  it("estimateCurveLength sums the control polygon (cubic and quadratic)", () => {
    expect(estimateCurveLength([0, 0], [0, 10], [10, 10], [10, 0])).to.equal(30);
    expect(estimateCurveLength([0, 0], [5, 10], [10, 0])).to.be.closeTo(22.3607, 1e-3);
  });

  it("adjustStepsForCurve scales by length ratio, clamped to maxAdjustment", () => {
    expect(adjustStepsForCurve(100, 30, 30)).to.equal(100); // ratio 1
    expect(adjustStepsForCurve(100, 60, 30, 2)).to.equal(200); // ratio 2 -> x2
    expect(adjustStepsForCurve(100, 10, 30, 2)).to.equal(50); // ratio .33 -> x0.5
    expect(adjustStepsForCurve(100, 30, 0)).to.equal(100); // averageLength 0 -> passthrough
  });

  it("countCurveSegments counts cubic and quadratic on/off-curve runs", () => {
    const empty = new VarPackedPath();
    expect(countCurveSegments(empty)).to.equal(0);

    const oneCubic = VarPackedPath.fromUnpackedContours([
      {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 30, type: "cubic" },
          { x: 20, y: 30, type: "cubic" },
          { x: 30, y: 0 },
        ],
        isClosed: true,
      },
    ]);
    expect(countCurveSegments(oneCubic)).to.equal(1);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd src-js/fontra-core && npx mocha tests/test-curvature-sampling.js --reporter spec`
Expected: FAIL — `calculateSegmentBudget`/etc. are not exported from `curvature.js` (import error or "is not a function").

- [ ] **Step 3: Add the import + four functions to `curvature.js`**

At the top of `src-js/fontra-core/src/curvature.js`, under the header comment, add:

```javascript
import { VarPackedPath } from "./var-path.js";
```

At the end of the file, append the four helpers (copied verbatim from the viz file ≈1712–1805, only adding `export`):

```javascript
// --- SpeedPunk sampling helpers (moved out of visualization-layer-definitions.js) ---

export function calculateSegmentBudget(
  numCurves,
  zoomFactor,
  baseSegments = 400,
  minSegmentsPerCurve = 5
) {
  // Apply zoom-based scaling: increase budget at higher zoom for smoother ribbons
  const zoomAdjustedBudget = Math.ceil(baseSegments * Math.sqrt(zoomFactor));

  // Divide budget among curves, respecting minimum
  const stepsPerSegment = Math.max(
    Math.floor(zoomAdjustedBudget / Math.max(numCurves, 1)),
    minSegmentsPerCurve
  );

  return stepsPerSegment;
}

export function estimateCurveLength(p1, p2, p3, p4 = null) {
  // Simple linear approximation for quick estimate
  if (p4) {
    // Cubic: sum of control polygon
    return (
      Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) +
      Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) +
      Math.hypot(p4[0] - p3[0], p4[1] - p3[1])
    );
  } else {
    // Quadratic
    return (
      Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) +
      Math.hypot(p3[0] - p2[0], p3[1] - p2[1])
    );
  }
}

export function adjustStepsForCurve(
  baseSteps,
  curveLength,
  averageLength,
  maxAdjustment = 2.0
) {
  if (averageLength === 0) return baseSteps;

  // Increase steps for longer curves, decrease for shorter
  const ratio = curveLength / averageLength;
  const adjustment = Math.min(Math.max(ratio, 1.0 / maxAdjustment), maxAdjustment);

  return Math.max(Math.floor(baseSteps * adjustment), 3);
}

export function countCurveSegments(path) {
  let count = 0;

  for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
    const contour = path.getContour(contourIndex);
    const startPoint = path.getAbsolutePointIndex(contourIndex, 0);
    const numPoints = contour.pointTypes.length;

    for (let i = 0; i < numPoints; i++) {
      const pointIndex = startPoint + i;
      const pointType = path.pointTypes[pointIndex];

      if ((pointType & VarPackedPath.POINT_TYPE_MASK) !== VarPackedPath.ON_CURVE) {
        continue;
      }

      const next1 = path.getAbsolutePointIndex(contourIndex, (i + 1) % numPoints);
      const next2 = path.getAbsolutePointIndex(contourIndex, (i + 2) % numPoints);
      const next3 = path.getAbsolutePointIndex(contourIndex, (i + 3) % numPoints);

      const t1 = path.pointTypes[next1];
      const t2 = path.pointTypes[next2];
      const t3 = path.pointTypes[next3];

      const isCubic =
        (t1 & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.OFF_CURVE_CUBIC &&
        (t2 & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.OFF_CURVE_CUBIC &&
        (t3 & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.ON_CURVE;

      const isQuadratic =
        (t1 & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.OFF_CURVE_QUAD &&
        (t2 & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.ON_CURVE;

      if (isCubic || isQuadratic) {
        count++;
      }
    }
  }

  return count;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd src-js/fontra-core && npx mocha tests/test-curvature-sampling.js --reporter spec`
Expected: PASS (4 passing).

- [ ] **Step 5: Update the viz file to import the helpers instead of defining them**

In `src-js/views-editor/src/visualization-layer-definitions.js`:
1. Delete the inline block ≈1710–1805 (the `//// speedpunk` comment line through the end of `countCurveSegments`). **Leave the `registerVisualizationLayerDefinition({ identifier: "fontra.curvature" … })` block (≈1807–2253) untouched in this task** — it now references the imported helpers.
2. Add the four names to the existing `import { … } from "@fontra/core/curvature.js";` statement (the one already importing `solveCubicBezier`, `calculateCurvatureForSegment`, `curvatureToColor`, etc.):

```javascript
import {
  // ...existing curvature imports (solveCubicBezier, solveQuadraticBezier,
  //    calculateCurvatureForSegment, calculateCurvatureForQuadraticSegment,
  //    curvatureToColor)...
  adjustStepsForCurve,
  calculateSegmentBudget,
  countCurveSegments,
  estimateCurveLength,
} from "@fontra/core/curvature.js";
```

- [ ] **Step 6: Syntax-check the viz file**

Run: `node --check src-js/views-editor/src/visualization-layer-definitions.js`
Expected: no output (exit 0). The SpeedPunk layer still draws via imported helpers — behavior unchanged this task.

- [ ] **Step 7: Format + commit**

```bash
npx prettier --write src-js/fontra-core/src/curvature.js src-js/fontra-core/tests/test-curvature-sampling.js src-js/views-editor/src/visualization-layer-definitions.js
git add src-js/fontra-core/src/curvature.js src-js/fontra-core/tests/test-curvature-sampling.js src-js/views-editor/src/visualization-layer-definitions.js
git commit -m "refactor(speedpunk): move curvature sampling helpers into curvature.js"
```

---

## Task 2: Add pure `computeSpeedPunkSamples` to `curvature.js`

This encapsulates the entire SpeedPunk traversal (count → budget → optional adaptive average → optional global normalization → per-segment quad geometry + color) and returns drawable quads, so the layer becomes a fill loop. Adopts the parameterized height math (`peakHeightUpm` / `sharpness`), dropping forkra's magic `-180000` / `-48000`.

**Files:**
- Modify: `src-js/fontra-core/src/curvature.js` (add `computeSpeedPunkSamples`)
- Test: `src-js/fontra-core/tests/test-curvature-sampling.js` (extend)

**Interfaces:**
- Consumes (already in `curvature.js`): `countCurveSegments`, `calculateSegmentBudget`, `estimateCurveLength`, `adjustStepsForCurve`, `solveCubicBezier`, `solveQuadraticBezier`, `calculateCurvatureForSegment`, `calculateCurvatureForQuadraticSegment`, `curvatureToColor`.
- Produces:
  - `computeSpeedPunkSamples(path, params) -> Array<{ points: [[x,y],[x,y],[x,y],[x,y]], color: string }>`
  - `params`: `{ peakHeightGlyphUnits=24, sharpness=1, illustrationPosition="outsideOfCurve", useGlobalNormalization=false, colorStops=["#8b939c","#f29400","#e3004f"], baseSegmentBudget=400, minSegmentsPerCurve=5, zoomFactor=1, adaptStepsToCurveLength=false }`
  - Returns one entry per filled quad polygon (4 points each), color already resolved. Returns `[]` for a path with no cubic/quadratic segments.

- [ ] **Step 1: Write the failing test**

Append to `src-js/fontra-core/tests/test-curvature-sampling.js`:

```javascript
import { computeSpeedPunkSamples } from "@fontra/core/curvature.js";

describe("computeSpeedPunkSamples", () => {
  const cubicPath = VarPackedPath.fromUnpackedContours([
    {
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 100, type: "cubic" },
        { x: 100, y: 100, type: "cubic" },
        { x: 100, y: 0 },
      ],
      isClosed: true,
    },
  ]);

  it("returns drawable quads for a curved segment", () => {
    const quads = computeSpeedPunkSamples(cubicPath, {
      peakHeightGlyphUnits: 24,
      sharpness: 1,
      baseSegmentBudget: 40,
      minSegmentsPerCurve: 5,
      zoomFactor: 1,
    });
    expect(quads.length).to.be.greaterThan(0);
    for (const quad of quads) {
      expect(quad.points).to.have.lengthOf(4);
      for (const [x, y] of quad.points) {
        expect(Number.isFinite(x)).to.equal(true);
        expect(Number.isFinite(y)).to.equal(true);
      }
      expect(quad.color).to.match(/^rgba?\(/);
    }
  });

  it("scales comb height with peakHeightGlyphUnits", () => {
    const small = computeSpeedPunkSamples(cubicPath, {
      peakHeightGlyphUnits: 10,
      baseSegmentBudget: 40,
      zoomFactor: 1,
    });
    const big = computeSpeedPunkSamples(cubicPath, {
      peakHeightGlyphUnits: 100,
      baseSegmentBudget: 40,
      zoomFactor: 1,
    });
    // Greatest distance of any quad vertex from the glyph box grows with peak height.
    const spread = (quads) =>
      Math.max(...quads.flatMap((q) => q.points.map(([, y]) => Math.abs(y))));
    expect(spread(big)).to.be.greaterThan(spread(small));
  });

  it("returns an empty array for a path with no curves", () => {
    const lineOnly = VarPackedPath.fromUnpackedContours([
      { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], isClosed: true },
    ]);
    expect(computeSpeedPunkSamples(lineOnly, {})).to.deep.equal([]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd src-js/fontra-core && npx mocha tests/test-curvature-sampling.js --reporter spec`
Expected: FAIL — `computeSpeedPunkSamples` is not exported.

- [ ] **Step 3: Implement `computeSpeedPunkSamples`**

Append to `src-js/fontra-core/src/curvature.js`. This is the viz draw loop transformed to **return quads instead of stroking** (no `context`), with the parameterized height math:

```javascript
// --- SpeedPunk geometry: pure quad/color generation (consumed by the viz layer) ---

function _isOnCurve(t) {
  return (t & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.ON_CURVE;
}

function _segmentKind(t1, t2, t3) {
  const isCubic =
    (t1 & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.OFF_CURVE_CUBIC &&
    (t2 & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.OFF_CURVE_CUBIC &&
    (t3 & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.ON_CURVE;
  const isQuadratic =
    (t1 & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.OFF_CURVE_QUAD &&
    (t2 & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.ON_CURVE;
  return { isCubic, isQuadratic };
}

export function computeSpeedPunkSamples(path, params = {}) {
  const peakHeightGlyphUnits = params.peakHeightGlyphUnits ?? 24;
  const sharpness = Math.max(0.1, params.sharpness ?? 1);
  const illustrationPosition = params.illustrationPosition ?? "outsideOfCurve";
  const useGlobalNormalization = params.useGlobalNormalization ?? false;
  const colorStops = params.colorStops ?? ["#8b939c", "#f29400", "#e3004f"];
  const baseSegmentBudget = params.baseSegmentBudget ?? 400;
  const minSegmentsPerCurve = params.minSegmentsPerCurve ?? 5;
  const zoomFactor = params.zoomFactor ?? 1;
  const adaptToCurveLength = params.adaptStepsToCurveLength ?? false;

  if (!path || !path.numContours) {
    return [];
  }

  const totalCurveCount = countCurveSegments(path);
  if (totalCurveCount === 0) {
    return [];
  }

  const stepsPerSegment = calculateSegmentBudget(
    totalCurveCount,
    zoomFactor,
    baseSegmentBudget,
    minSegmentsPerCurve
  );

  // Optional: average curve length (for adaptive step counts).
  let averageCurveLength = 0;
  if (adaptToCurveLength) {
    let totalLength = 0;
    let curveCount = 0;
    forEachCurveSegment(path, (kind, pts) => {
      totalLength += estimateCurveLength(...pts);
      curveCount++;
    });
    averageCurveLength = curveCount > 0 ? totalLength / curveCount : 0;
  }

  // Optional first pass: global curvature range.
  let globalMinAbs = Infinity;
  let globalMaxAbs = -Infinity;
  if (useGlobalNormalization) {
    forEachCurveSegment(path, (kind, pts) => {
      const steps = adaptToCurveLength
        ? adjustStepsForCurve(stepsPerSegment, estimateCurveLength(...pts), averageCurveLength)
        : stepsPerSegment;
      const samples =
        kind === "cubic"
          ? calculateCurvatureForSegment(...pts, steps)
          : calculateCurvatureForQuadraticSegment(...pts, steps);
      for (const sample of samples) {
        const absK = Math.abs(sample.curvature);
        globalMinAbs = Math.min(globalMinAbs, absK);
        globalMaxAbs = Math.max(globalMaxAbs, absK);
      }
    });
    if (globalMinAbs === Infinity) {
      globalMinAbs = 0;
      globalMaxAbs = 1;
    }
  }

  // Main pass: build quads.
  const quads = [];
  forEachCurveSegment(path, (kind, pts) => {
    const steps = adaptToCurveLength
      ? adjustStepsForCurve(stepsPerSegment, estimateCurveLength(...pts), averageCurveLength)
      : stepsPerSegment;
    const samples =
      kind === "cubic"
        ? calculateCurvatureForSegment(...pts, steps)
        : calculateCurvatureForQuadraticSegment(...pts, steps);

    const absVals = samples.map((s) => Math.abs(s.curvature));
    const minAbsSegment = Math.min(...absVals);
    const maxAbsSegment = Math.max(...absVals);
    const segmentPeakAbsCurvature = maxAbsSegment > 1e-12 ? maxAbsSegment : 1;
    const minAbs = useGlobalNormalization ? globalMinAbs : minAbsSegment;
    const maxAbs = useGlobalNormalization ? globalMaxAbs : maxAbsSegment;

    const onCurve = [];
    const offCurve = [];
    for (let s = 0; s < samples.length; s++) {
      const t = samples[s].t;
      const { r, r1 } =
        kind === "cubic"
          ? solveCubicBezier(...pts, t)
          : solveQuadraticBezier(...pts, t);
      const [x, y] = r;
      onCurve.push({ x, y, k: samples[s].curvature });

      let nx = illustrationPosition === "outsideOfCurve" ? -r1[1] : r1[1];
      let ny = illustrationPosition === "outsideOfCurve" ? r1[0] : -r1[0];
      const mag = Math.hypot(nx, ny) || 1;
      nx /= mag;
      ny /= mag;

      const rawNormalizedHeight = Math.abs(samples[s].curvature) / segmentPeakAbsCurvature;
      const normalizedHeight = Math.pow(
        Math.max(0, Math.min(1, rawNormalizedHeight)),
        sharpness
      );
      const h = -normalizedHeight * peakHeightGlyphUnits;
      offCurve.push({ x: x + nx * h, y: y + ny * h });
    }

    for (let s = 0; s < onCurve.length - 1; s++) {
      const a = onCurve[s];
      const b = onCurve[s + 1];
      quads.push({
        points: [
          [a.x, a.y],
          [b.x, b.y],
          [offCurve[s + 1].x, offCurve[s + 1].y],
          [offCurve[s].x, offCurve[s].y],
        ],
        color: curvatureToColor(Math.abs(a.k), minAbs, maxAbs, colorStops),
      });
    }
  });

  return quads;
}

// Iterate cubic/quadratic segments, invoking cb(kind, points) where points are
// [x,y] arrays: 4 for cubic, 3 for quadratic.
function forEachCurveSegment(path, cb) {
  for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
    const contour = path.getContour(contourIndex);
    const startPoint = path.getAbsolutePointIndex(contourIndex, 0);
    const numPoints = contour.pointTypes.length;

    for (let i = 0; i < numPoints; i++) {
      const pointIndex = startPoint + i;
      if (!_isOnCurve(path.pointTypes[pointIndex])) {
        continue;
      }
      const next1 = path.getAbsolutePointIndex(contourIndex, (i + 1) % numPoints);
      const next2 = path.getAbsolutePointIndex(contourIndex, (i + 2) % numPoints);
      const next3 = path.getAbsolutePointIndex(contourIndex, (i + 3) % numPoints);
      const { isCubic, isQuadratic } = _segmentKind(
        path.pointTypes[next1],
        path.pointTypes[next2],
        path.pointTypes[next3]
      );
      if (isCubic) {
        const p1 = path.getPoint(pointIndex);
        const p2 = path.getPoint(next1);
        const p3 = path.getPoint(next2);
        const p4 = path.getPoint(next3);
        cb("cubic", [
          [p1.x, p1.y],
          [p2.x, p2.y],
          [p3.x, p3.y],
          [p4.x, p4.y],
        ]);
      } else if (isQuadratic) {
        const p1 = path.getPoint(pointIndex);
        const p2 = path.getPoint(next1);
        const p3 = path.getPoint(next2);
        cb("quadratic", [
          [p1.x, p1.y],
          [p2.x, p2.y],
          [p3.x, p3.y],
        ]);
      }
    }
  }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd src-js/fontra-core && npx mocha tests/test-curvature-sampling.js --reporter spec`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Format + commit**

```bash
npx prettier --write src-js/fontra-core/src/curvature.js src-js/fontra-core/tests/test-curvature-sampling.js
git add src-js/fontra-core/src/curvature.js src-js/fontra-core/tests/test-curvature-sampling.js
git commit -m "feat(speedpunk): add pure computeSpeedPunkSamples to curvature.js"
```

---

## Task 3: Make the `fontra.curvature` layer render-only

**Files:**
- Modify: `src-js/views-editor/src/visualization-layer-definitions.js` (replace the fat draw ≈1808–2253)

**Interfaces:**
- Consumes: `computeSpeedPunkSamples` from `@fontra/core/curvature.js`; live `model.sceneSettings.speedPunk{PeakHeightUpm,Sharpness,Opacity}` (seeded in Task 4 — reads here use `??` fallbacks, so this task is safe before Task 4 lands).

- [ ] **Step 1: Swap the imports**

In the `@fontra/core/curvature.js` import added in Task 1, replace the four helper names (and any now-unused solver/curvature imports that only the inline draw used) with `computeSpeedPunkSamples`. Keep any curvature imports still referenced elsewhere in the file. Net: the viz file imports `computeSpeedPunkSamples` and no longer needs `solveCubicBezier`/`solveQuadraticBezier`/`calculateCurvatureForSegment`/`calculateCurvatureForQuadraticSegment`/`curvatureToColor`/`calculateSegmentBudget`/`estimateCurveLength`/`adjustStepsForCurve`/`countCurveSegments` for SpeedPunk.

```javascript
import { computeSpeedPunkSamples } from "@fontra/core/curvature.js";
```

- [ ] **Step 2: Replace the whole `fontra.curvature` registration (≈1808–2253) with the render-only version**

```javascript
// --- SpeedPunk / curvature visualization (render-only; math in curvature.js) ---
registerVisualizationLayerDefinition({
  identifier: "fontra.curvature",
  name: "SpeedPunk",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: false,
  zIndex: 490,
  screenParameters: {
    colorStops: ["#8b939c", "#f29400", "#e3004f"],
    illustrationPosition: "outsideOfCurve",
    baseSegmentBudget: 400,
    minSegmentsPerCurve: 5,
    globalColorNormalization: false,
    adaptStepsToCurveLength: false,
  },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const path = positionedGlyph.glyph?.path;
    if (!path) return;

    const peakHeightGlyphUnits = model.sceneSettings?.speedPunkPeakHeightUpm ?? 24;
    const sharpness = Math.max(0.1, model.sceneSettings?.speedPunkSharpness ?? 1);
    const opacity = Math.max(0, Math.min(1, model.sceneSettings?.speedPunkOpacity ?? 0.5));

    const quads = computeSpeedPunkSamples(path, {
      peakHeightGlyphUnits,
      sharpness,
      illustrationPosition: parameters.illustrationPosition,
      useGlobalNormalization: parameters.globalColorNormalization,
      colorStops: parameters.colorStops,
      baseSegmentBudget: parameters.baseSegmentBudget,
      minSegmentsPerCurve: parameters.minSegmentsPerCurve,
      zoomFactor: controller.magnification || 1.0,
      adaptStepsToCurveLength: parameters.adaptStepsToCurveLength,
    });
    if (!quads.length) return;

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.globalAlpha = opacity;
    for (const quad of quads) {
      const p = new Path2D();
      p.moveTo(quad.points[0][0], quad.points[0][1]);
      for (let i = 1; i < quad.points.length; i++) {
        p.lineTo(quad.points[i][0], quad.points[i][1]);
      }
      p.closePath();
      context.fillStyle = quad.color;
      context.fill(p);
    }
    context.restore();
  },
});
```

- [ ] **Step 3: Syntax-check**

Run: `node --check src-js/views-editor/src/visualization-layer-definitions.js`
Expected: no output (exit 0).

- [ ] **Step 4: Confirm no leftover inline SpeedPunk math**

Run: `grep -n "countCurveSegments\|calculateSegmentBudget\|solveCubicBezier\|heightMultiplier\|-180000\|-48000" src-js/views-editor/src/visualization-layer-definitions.js`
Expected: no matches (all SpeedPunk math now lives in curvature.js).

- [ ] **Step 5: Format + commit**

```bash
npx prettier --write src-js/views-editor/src/visualization-layer-definitions.js
git add src-js/views-editor/src/visualization-layer-definitions.js
git commit -m "refactor(speedpunk): make fontra.curvature layer render-only"
```

---

## Task 4: App-level settings keys + scene-setting defaults + lang

**Files:**
- Modify: `src-js/fontra-core/src/application-settings.js`
- Modify: `src-js/views-editor/src/scene-controller.js` (≈line 110, by the `coarseGridSpacing` default)
- Modify: `src-js/fontra-core/assets/lang/en.js`

**Interfaces:**
- Produces app keys: `speedPunkPeakHeightUpm`, `speedPunkSharpness`, `speedPunkOpacity` (in `applicationSettingsController`).
- Produces scene-setting defaults (same names) seeded in `SceneController`.

- [ ] **Step 1: Add the app-level keys**

In `src-js/fontra-core/src/application-settings.js`, extend the controller object (after the coarse-grid block):

```javascript
  // fork: speedpunk panel settings (app-level, per D9 — not written to project files)
  speedPunkPeakHeightUpm: 24,
  speedPunkSharpness: 1,
  speedPunkOpacity: 0.5,
```

- [ ] **Step 2: Seed the scene-setting defaults (live redraw bridge)**

In `src-js/views-editor/src/scene-controller.js`, next to the existing `this.sceneSettingsController.setItem("coarseGridSpacing", 10);` (≈line 110), add:

```javascript
    this.sceneSettingsController.setItem("speedPunkPeakHeightUpm", 24);
    this.sceneSettingsController.setItem("speedPunkSharpness", 1);
    this.sceneSettingsController.setItem("speedPunkOpacity", 0.5);
```

- [ ] **Step 3: Add lang keys**

In `src-js/fontra-core/assets/lang/en.js`, add (next to the existing `sidebar.designspace-navigation.coarse-grid*` and any existing `speedpunk` keys):

```javascript
  "sidebar.designspace-navigation.speedpunk": "SpeedPunk",
  "sidebar.designspace-navigation.speedpunk.display": "Display",
  "sidebar.designspace-navigation.speedpunk.peak-height": "Peak height",
  "sidebar.designspace-navigation.speedpunk.sharpness": "Sharpness",
  "sidebar.designspace-navigation.speedpunk.opacity": "Opacity",
```

(If `sidebar.designspace-navigation.speedpunk` already exists from prior scaffolding, keep one copy — no duplicate keys.)

- [ ] **Step 4: Syntax-check the browser-side files**

Run: `node --check src-js/fontra-core/src/application-settings.js && node --check src-js/views-editor/src/scene-controller.js && node --check src-js/fontra-core/assets/lang/en.js`
Expected: no output (exit 0).

- [ ] **Step 5: Format + commit**

```bash
npx prettier --write src-js/fontra-core/src/application-settings.js src-js/views-editor/src/scene-controller.js src-js/fontra-core/assets/lang/en.js
git add src-js/fontra-core/src/application-settings.js src-js/views-editor/src/scene-controller.js src-js/fontra-core/assets/lang/en.js
git commit -m "feat(speedpunk): add app-level settings + scene defaults + lang keys"
```

---

## Task 5: SpeedPunk accordion + app-level wiring (mirror WS-1)

**Files:**
- Modify: `src-js/views-editor/src/panel-designspace-navigation.js`

**Interfaces:**
- Consumes: `applicationSettingsController` (already imported by WS-1), the speedpunk app keys (Task 4), the speedpunk scene settings (Task 4), and `this.editorController.visualizationLayersSettings.model["fontra.curvature"]` for the Display toggle.
- Constants (define near the top of the panel module, alongside any WS-1 constants):
  - `SPEEDPUNK_PEAK_HEIGHT_DEFAULT_UPM=24`, `MIN_UPM=1`, `MAX_UPM=1000`
  - `SPEEDPUNK_SHARPNESS_DEFAULT=1`, `MIN=0.1`, `MAX=4`
  - `SPEEDPUNK_OPACITY_DEFAULT=0.5`, `MIN=0`, `MAX=1`

- [ ] **Step 1: Confirm/repair the accordion markup**

The speedpunk accordion item already exists in this panel (`#speedpunk-accordion-item` with `#speedpunk-display-toggle`, `#speedpunk-peak-height-input`, `#speedpunk-sharpness-input`, `#speedpunk-opacity-input`). Verify it is present and the inputs carry `min`/`max`/`step` matching the constants; if any input id is missing, add it following the coarse-grid markup pattern. No commit yet.

Run: `grep -n "speedpunk-peak-height-input\|speedpunk-sharpness-input\|speedpunk-opacity-input\|speedpunk-display-toggle" src-js/views-editor/src/panel-designspace-navigation.js`
Expected: all four ids present.

- [ ] **Step 2: Add the constants + getters**

Near the WS-1 constants, add the six min/max + three defaults listed under Interfaces. Then add getters alongside the coarse-grid getters:

```javascript
  get speedPunkDisplayToggle() {
    return this.accordion.querySelector("#speedpunk-display-toggle");
  }
  get speedPunkPeakHeightInput() {
    return this.accordion.querySelector("#speedpunk-peak-height-input");
  }
  get speedPunkSharpnessInput() {
    return this.accordion.querySelector("#speedpunk-sharpness-input");
  }
  get speedPunkOpacityInput() {
    return this.accordion.querySelector("#speedpunk-opacity-input");
  }
```

- [ ] **Step 3: Add normalization + app read/persist helpers**

```javascript
  _normalizeSpeedPunkPeakHeightUpm(value) {
    if (!Number.isFinite(value)) return SPEEDPUNK_PEAK_HEIGHT_DEFAULT_UPM;
    return Math.max(
      SPEEDPUNK_PEAK_HEIGHT_MIN_UPM,
      Math.min(SPEEDPUNK_PEAK_HEIGHT_MAX_UPM, Math.round(value))
    );
  }
  _normalizeSpeedPunkSharpness(value) {
    if (!Number.isFinite(value)) return SPEEDPUNK_SHARPNESS_DEFAULT;
    return Math.max(SPEEDPUNK_SHARPNESS_MIN, Math.min(SPEEDPUNK_SHARPNESS_MAX, value));
  }
  _normalizeSpeedPunkOpacity(value) {
    if (!Number.isFinite(value)) return SPEEDPUNK_OPACITY_DEFAULT;
    return Math.max(SPEEDPUNK_OPACITY_MIN, Math.min(SPEEDPUNK_OPACITY_MAX, value));
  }

  _readSpeedPunkSettingsFromApp() {
    const model = applicationSettingsController.model;
    return {
      peakHeightUpm: this._normalizeSpeedPunkPeakHeightUpm(model.speedPunkPeakHeightUpm),
      sharpness: this._normalizeSpeedPunkSharpness(model.speedPunkSharpness),
      opacity: this._normalizeSpeedPunkOpacity(model.speedPunkOpacity),
    };
  }

  _persistSpeedPunkSettings(settings) {
    const model = applicationSettingsController.model;
    model.speedPunkPeakHeightUpm = settings.peakHeightUpm;
    model.speedPunkSharpness = settings.sharpness;
    model.speedPunkOpacity = settings.opacity;
  }
```

- [ ] **Step 4: Add the control sync + setup wiring (app-level — NO font writes)**

```javascript
  _updateSpeedPunkControlsEnabled() {
    const enabled =
      !!this.editorController.visualizationLayersSettings.model["fontra.curvature"];
    for (const input of [
      this.speedPunkPeakHeightInput,
      this.speedPunkSharpnessInput,
      this.speedPunkOpacityInput,
    ]) {
      if (input) input.disabled = !enabled;
    }
  }

  _syncSpeedPunkControls(settings) {
    if (this.speedPunkPeakHeightInput) {
      this.speedPunkPeakHeightInput.value = String(settings.peakHeightUpm);
    }
    if (this.speedPunkSharpnessInput) {
      this.speedPunkSharpnessInput.value = String(settings.sharpness);
    }
    if (this.speedPunkOpacityInput) {
      this.speedPunkOpacityInput.value = String(settings.opacity);
    }
    this._updateSpeedPunkControlsEnabled();
    this.sceneSettingsController.setItem("speedPunkPeakHeightUpm", settings.peakHeightUpm);
    this.sceneSettingsController.setItem("speedPunkSharpness", settings.sharpness);
    this.sceneSettingsController.setItem("speedPunkOpacity", settings.opacity);
  }

  _setupSpeedPunkControls() {
    this._speedPunkSettings = this._readSpeedPunkSettingsFromApp();
    this._syncSpeedPunkControls(this._speedPunkSettings);
    this._persistSpeedPunkSettings(this._speedPunkSettings);

    const bind = (input, normalize, key) => {
      if (!input) return;
      input.addEventListener("change", () => {
        const value = normalize(Number(input.value));
        this._speedPunkSettings = { ...this._speedPunkSettings, [key]: value };
        this.sceneSettingsController.setItem(`speedPunk${capitalize(key)}`, value);
        this._persistSpeedPunkSettings(this._speedPunkSettings);
        input.value = String(value);
      });
    };
    bind(
      this.speedPunkPeakHeightInput,
      (v) => this._normalizeSpeedPunkPeakHeightUpm(v),
      "PeakHeightUpm"
    );
    bind(this.speedPunkSharpnessInput, (v) => this._normalizeSpeedPunkSharpness(v), "Sharpness");
    bind(this.speedPunkOpacityInput, (v) => this._normalizeSpeedPunkOpacity(v), "Opacity");

    const displayToggle = this.speedPunkDisplayToggle;
    if (displayToggle) {
      const layers = this.editorController.visualizationLayersSettings;
      displayToggle.checked = !!layers.model["fontra.curvature"];
      displayToggle.addEventListener("change", () => {
        layers.model["fontra.curvature"] = displayToggle.checked;
        this._updateSpeedPunkControlsEnabled();
      });
      layers.addKeyListener("fontra.curvature", (event) => {
        displayToggle.checked = !!event.newValue;
        this._updateSpeedPunkControlsEnabled();
      });
    }
  }
```

> **Note on the `_speedPunkSettings` key names:** the `bind` helper composes scene keys as `speedPunk${capitalize(key)}` — pass `"PeakHeightUpm"`/`"Sharpness"`/`"Opacity"` (already capitalized) and define a tiny `capitalize` that leaves an already-capitalized string unchanged, OR inline the three exact scene keys. If `capitalize` is not already present in the module, inline the keys instead:
> ```javascript
> // peak height:
> this.sceneSettingsController.setItem("speedPunkPeakHeightUpm", value);
> // sharpness:
> this.sceneSettingsController.setItem("speedPunkSharpness", value);
> // opacity:
> this.sceneSettingsController.setItem("speedPunkOpacity", value);
> ```
> Prefer inlining the three keys (no helper) to avoid an undefined `capitalize`. Update `bind` to take the literal scene key as its third arg and the `_speedPunkSettings` property as a fourth, or write three explicit listeners mirroring WS-1's coarse-grid `addEventListener("change", …)` blocks.

- [ ] **Step 5: Call `_setupSpeedPunkControls()` where coarse-grid is set up**

Find where `_setupCoarseGridControls()` is invoked (panel init / accordion setup) and add `this._setupSpeedPunkControls();` immediately after it.

Run: `grep -n "_setupCoarseGridControls()" src-js/views-editor/src/panel-designspace-navigation.js`
Expected: shows the call site; add the speedpunk call adjacent.

- [ ] **Step 6: Syntax-check**

Run: `node --check src-js/views-editor/src/panel-designspace-navigation.js`
Expected: no output (exit 0).

- [ ] **Step 7: Format + commit**

```bash
npx prettier --write src-js/views-editor/src/panel-designspace-navigation.js
git add src-js/views-editor/src/panel-designspace-navigation.js
git commit -m "feat(speedpunk): wire SpeedPunk accordion to app-level settings"
```

---

## Task 6: Manual verification

**Files:** none (verification only). views-editor has no test runner — verify in the running bundle (user-side `bundle watch`).

- [ ] **Step 1: Re-run the core test suite**

Run: `cd src-js/fontra-core && npm test`
Expected: full suite passes, including `test-curvature-sampling.js`.

- [ ] **Step 2: Manual checks in the editor (hand to the user / run app)**

1. Open a glyph with curves; open the Designspace Navigation sidebar → **SpeedPunk** accordion.
2. Toggle **Display** on → curvature combs render. Toggle off → they disappear. The three numeric inputs enable/disable with the toggle.
3. Change **Peak height** → comb height scales (font-relative). Change **Sharpness** → comb profile sharpens/softens. Change **Opacity** → comb transparency changes. All update live without reload.
4. Reload the editor → values persist (localStorage), and combs render with the saved settings. Confirm **no font-modified/dirty state** results from changing SpeedPunk settings (D9 — app-level only, no project writes).
5. Sanity: a glyph with only straight segments shows no combs (no errors).

- [ ] **Step 3: Final commit (if any prettier-only changes remain)**

```bash
git status   # expect clean; if prettier touched anything, add + commit "style(speedpunk): formatting"
```

---

## Self-Review

**1. Spec coverage (master WS-3 outline + Part E.4 + §2.1 + D9):**
- Move 4 sampling helpers to `curvature.js` + re-import → **Task 1.** ✅
- Extract `computeSpeedPunkSamples(path, params)` → **Task 2.** ✅
- Rewrite `fontra.curvature` draw → render-only consuming core → **Task 3.** ✅
- App-level speedpunk keys (D9) + lang → **Task 4.** ✅
- Accordion (peak-height / sharpness / opacity), bind to app settings, feed params into the layer → **Task 5.** ✅
- Manual verify combs render + sliders live → **Task 6.** ✅
- Part E "viz = render only": Task 3 step 4 greps to prove no SpeedPunk math remains in the viz file. ✅

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to". Real code in every code step; real mocha/`node --check`/`grep` commands with expected output. Task 5 Step 4 flags the one judgment call (`capitalize` helper) and gives the concrete inline fallback — not a placeholder, a documented choice. ✅

**3. Type/name consistency:** `computeSpeedPunkSamples(path, params) -> [{points, color}]` is produced in Task 2 and consumed identically in Task 3. The four helper signatures in Task 1 match their uses inside `computeSpeedPunkSamples` (Task 2). Scene keys `speedPunkPeakHeightUpm` / `speedPunkSharpness` / `speedPunkOpacity` are identical across Task 3 (read), Task 4 (seed), Task 5 (write). App keys match scene keys by name. ✅

**4. Known intended behavior change (flag for sign-off):** adopting the parameterized height math removes forkra's hard-coded `-180000`/`-48000` magic and the cubic/quad asymmetry. With default `peakHeightUpm=24` the combs will look different (and more uniform between cubic/quad) than the current build. This is the point of the parameterization (§2.1 "more advanced maths") — confirm the default visual is acceptable during Task 6, adjust the default if desired.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-30-ws3-speedpunk-panel.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
