# WS-7 — Skeleton Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the donor skeleton contour generator into `fontra-core` and redesign its output contract so generation returns outline contours plus forward provenance maps.

**Architecture:** `skeleton-generator.js` is a pure core module that consumes the WS-6 canonical skeleton schema, converts it to the donor generator's internal shape, runs the ported geometry pipeline, and emits `{ contours, provenance }`. Donor geometry/math is ported, but donor persistence, generated-contour index recovery, and path mutation helpers are not. Golden-master tests compare generated contours against donor output from fixed fixtures; separate tests verify provenance is emitted from source ids rather than reconstructed from geometry.

**Tech Stack:** ES modules under `src-js/fontra-core/src`, `bezier-js`, existing `VarPackedPath`/`packContour`, Mocha + Chai tests under `src-js/fontra-core/tests`, JSON fixtures under `src-js/fontra-core/tests/data/skeleton-generator`.

---

## Global Constraints

- **Branch:** implement on `refactor-simple/ws7-skeleton-generator`, cut after WS-6 is merged. WS-7 assumes WS-6 provides `src-js/fontra-core/src/skeleton-model.js`.
- **Donor is read-only:** `./skeleton/` stays pinned at `fd76d3abe`. Read/copy from it only. Never run `git -C skeleton checkout` or `git -C skeleton switch`.
- **Pure core only:** do not touch `views-editor`, scene-model, pointer tools, visualization layers, drawing tools, or panel files in WS-7.
- **No runtime donor import:** donor paths may be imported only by the fixture-generation script under `tests/scripts/`. `src/skeleton-generator.js` must not import from `./skeleton/`.
- **No geometric recovery:** do not port `_recoverGeneratedIndices`, `_packedContoursEqual`, `_recoverGeneratedIndicesForMapping`, or any generated-index recovery logic. Provenance is emitted forward while building output points.
- **No editing path mutation:** do not port `regenerateSkeletonContours`, `_canUpdateGeneratedContoursInPlace`, `setSkeletonData`, `clearSkeletonData`, `moveSkeletonData`, `createSkeletonContour`, or persistence helpers from the donor generator.
- **Cherry-picked semantics:** apply only the generator-relevant semantics of `c2cd2ce51` (near-zero handles) directly in the port. The two generated-contour-index fixes (`9ddfc746a`, `d0b4ec217`) are represented as explicit non-port notes and rail checks because WS-7 does not mutate paths or store path contour indices.
- **Formatting:** each task ends with `npm test` in `src-js/fontra-core` and `npx prettier --write` on touched files.

---

## Verified Current Context

- `src-js/fontra-core/package.json` test script is `mocha tests --extension js --extension ts --reporter spec`.
- `src-js/fontra-core/src/var-path.js` exports `VarPackedPath` and `packContour(unpackedContour)`.
- `src-js/fontra-core/tests/test-support.js` exports `readRepoPathAsJSON(path)` and `parametrize`.
- Donor generator is `skeleton/src-js/fontra-core/src/skeleton-contour-generator.js`.
- Donor generator exports verified by grep:
  - `getPointWidth` at donor line 48
  - `getPointHalfWidth` at donor line 68
  - `generateContoursFromSkeleton` at donor line 1080
  - `generateOutlineFromSkeletonContour` at donor line 1118
  - `getEffectiveNormal` at donor line 2267
  - `calculateNormalAtSkeletonPoint` at donor line 3355
  - `outlineContourToPackedPath` at donor line 3459
- Donor functions to exclude are in the tail of that file:
  - `getSkeletonData`, `setSkeletonData`, `clearSkeletonData`
  - `stripDerivedSkeletonFields`, `normalizeSkeletonData`, `moveSkeletonData`
  - `_recoverGeneratedIndices`, `_recoverGeneratedIndicesForMapping`
  - `regenerateSkeletonContours`
- `ref/cleanup` generator history was inspected with:
  - `git -c safe.directory=C:/Users/marty/Desktop/fontraz/forkra/skeleton -C skeleton log ref/cleanup --oneline -- src-js/fontra-core/src/skeleton-contour-generator.js`
  - `git -c safe.directory=C:/Users/marty/Desktop/fontraz/forkra/skeleton -C skeleton show c2cd2ce51 -- src-js/fontra-core/src/skeleton-contour-generator.js`

---

## File Structure

```
src-js/fontra-core/src/
  skeleton-generator.js                         [CREATE] pure generator API, donor geometry port, provenance emission
src-js/fontra-core/tests/
  test-skeleton-generator.js                    [CREATE] golden-master and provenance tests
  scripts/make-skeleton-generator-fixtures.js   [CREATE] donor-output fixture generator, test-only
  data/skeleton-generator/fixtures.json         [CREATE] canonical fixture inputs + donor expected contours
```

---

## Task 1: Create Golden-Master Fixture Generator

**Files:**
- Create: `src-js/fontra-core/tests/scripts/make-skeleton-generator-fixtures.js`
- Create: `src-js/fontra-core/tests/data/skeleton-generator/fixtures.json`

**Interfaces:**
- Produces `fixtures.json` entries shaped as `{ name, canonical, donorInput, expectedContours }`.
- Test-only script imports donor `generateContoursFromSkeleton()` and writes expected donor output.

- [ ] **Step 1: Create the fixture generator script**

Create `src-js/fontra-core/tests/scripts/make-skeleton-generator-fixtures.js`:

```javascript
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Four levels up from tests/scripts/ reaches the repo root; the donor checkout
// lives at <repo>/skeleton.
import { generateContoursFromSkeleton as generateDonorContours } from "../../../../skeleton/src-js/fontra-core/src/skeleton-contour-generator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.join(__dirname, "..", "data", "skeleton-generator", "fixtures.json");

const fixtures = [
  {
    name: "open-line-butt-cap",
    canonical: {
      version: 1,
      nextId: 4,
      contours: [
        {
          id: 1,
          closed: false,
          defaultWidth: 80,
          singleSided: null,
          points: [
            point(2, 0, 0),
            point(3, 100, 0),
          ],
        },
      ],
      generated: [],
    },
  },
  {
    name: "closed-triangle",
    canonical: {
      version: 1,
      nextId: 5,
      contours: [
        {
          id: 1,
          closed: true,
          defaultWidth: 60,
          singleSided: null,
          points: [
            point(2, 0, 0),
            point(3, 100, 0),
            point(4, 50, 80),
          ],
        },
      ],
      generated: [],
    },
  },
  {
    name: "open-cubic-round-cap",
    canonical: {
      version: 1,
      nextId: 6,
      contours: [
        {
          id: 1,
          closed: false,
          defaultWidth: 70,
          singleSided: null,
          points: [
            point(2, 0, 0, { capStyle: "round" }),
            offCurve(3, 40, 120),
            offCurve(4, 120, 120),
            point(5, 160, 0, { capStyle: "round" }),
          ],
        },
      ],
      generated: [],
    },
  },
  {
    name: "single-sided-left",
    canonical: {
      version: 1,
      nextId: 4,
      contours: [
        {
          id: 1,
          closed: false,
          defaultWidth: 80,
          singleSided: "left",
          points: [
            point(2, 0, 0),
            point(3, 120, 0),
          ],
        },
      ],
      generated: [],
    },
  },
  {
    name: "asymmetric-editable-nudge",
    canonical: {
      version: 1,
      nextId: 4,
      contours: [
        {
          id: 1,
          closed: false,
          defaultWidth: 80,
          singleSided: null,
          points: [
            point(2, 0, 0, {
              width: { left: 20, right: 45, linked: false },
              editable: { left: true, right: true },
              nudge: { left: 8, right: -6 },
            }),
            point(3, 140, 0, {
              width: { left: 35, right: 10, linked: false },
              editable: { left: true, right: true },
              nudge: { left: -4, right: 5 },
            }),
          ],
        },
      ],
      generated: [],
    },
  },
  {
    name: "detached-handle-offsets",
    canonical: {
      version: 1,
      nextId: 6,
      contours: [
        {
          id: 1,
          closed: false,
          defaultWidth: 80,
          singleSided: null,
          points: [
            point(2, 0, 0, {
              editable: { left: true, right: true },
              handleOffsets: {
                leftOut: { x: -12, y: 20, detached: true },
                rightOut: { x: 12, y: -16, detached: true },
              },
            }),
            offCurve(3, 40, 90),
            offCurve(4, 100, 90),
            point(5, 140, 0, {
              editable: { left: true, right: true },
              handleOffsets: {
                leftIn: { x: 10, y: 22, detached: true },
                rightIn: { x: -10, y: -18, detached: true },
              },
            }),
          ],
        },
      ],
      generated: [],
    },
  },
];

for (const fixture of fixtures) {
  fixture.donorInput = canonicalToDonor(fixture.canonical);
  fixture.expectedContours = generateDonorContours(fixture.donorInput);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(fixtures, null, 2)}\n`);

function point(id, x, y, extra = {}) {
  return {
    id,
    x,
    y,
    type: null,
    smooth: false,
    width: { left: 40, right: 40, linked: true },
    nudge: { left: 0, right: 0 },
    editable: { left: false, right: false },
    handleOffsets: {},
    ...extra,
  };
}

function offCurve(id, x, y) {
  return { id, x, y, type: "cubic", smooth: false };
}

const CAP_CORNER_POINT_FIELDS = [
  "capStyle",
  "capRadiusRatio",
  "capTension",
  "capAngle",
  "capDistance",
  "roundnessStrength",
  "cornerAsymmetry",
];

function canonicalToDonor(skeletonData) {
  return {
    contours: skeletonData.contours.map((contour) => ({
      isClosed: contour.closed,
      defaultWidth: contour.defaultWidth,
      singleSided: contour.singleSided !== null,
      singleSidedDirection: contour.singleSided || "left",
      capStyle: contour.capStyle || "butt",
      reversed: contour.reversed === true,
      cornerTrimRatio: contour.cornerTrimRatio,
      cornerRadiusBoost: contour.cornerRadiusBoost,
      points: contour.points.map(canonicalPointToDonor),
    })),
  };
}

function canonicalPointToDonor(point) {
  const donorPoint = {
    x: point.x,
    y: point.y,
    smooth: point.smooth === true,
  };
  if (point.type) {
    donorPoint.type = point.type;
    return donorPoint;
  }

  donorPoint.leftWidth = point.width?.left ?? 40;
  donorPoint.rightWidth = point.width?.right ?? 40;
  donorPoint.leftNudge = point.nudge?.left ?? 0;
  donorPoint.rightNudge = point.nudge?.right ?? 0;
  donorPoint.leftEditable = point.editable?.left === true;
  donorPoint.rightEditable = point.editable?.right === true;
  for (const field of CAP_CORNER_POINT_FIELDS) {
    if (point[field] !== null && point[field] !== undefined) {
      donorPoint[field] = point[field];
    }
  }

  copyHandleOffsetsToDonor(donorPoint, "left", point.handleOffsets?.leftIn, "In");
  copyHandleOffsetsToDonor(donorPoint, "left", point.handleOffsets?.leftOut, "Out");
  copyHandleOffsetsToDonor(donorPoint, "right", point.handleOffsets?.rightIn, "In");
  copyHandleOffsetsToDonor(donorPoint, "right", point.handleOffsets?.rightOut, "Out");
  return donorPoint;
}

function copyHandleOffsetsToDonor(donorPoint, side, offset, inOut) {
  if (!offset) {
    return;
  }
  const prefix = `${side}Handle${inOut}`;
  donorPoint[`${prefix}OffsetX`] = offset.x ?? 0;
  donorPoint[`${prefix}OffsetY`] = offset.y ?? 0;
  donorPoint[`${prefix}Detached`] = offset.detached === true;
}
```

- [ ] **Step 2: Run the fixture script**

Run:

```bash
node src-js/fontra-core/tests/scripts/make-skeleton-generator-fixtures.js
```

Expected: `src-js/fontra-core/tests/data/skeleton-generator/fixtures.json` is created with six fixtures and non-empty `expectedContours` arrays.

- [ ] **Step 3: Commit fixtures**

```bash
git add src-js/fontra-core/tests/scripts/make-skeleton-generator-fixtures.js src-js/fontra-core/tests/data/skeleton-generator/fixtures.json
git commit -m "test(skeleton): add generator golden fixtures"
```

---

## Task 2: Add Failing Generator Contract Tests

**Files:**
- Create: `src-js/fontra-core/tests/test-skeleton-generator.js`

**Interfaces:**
- Consumes: `generateFromSkeleton(skeletonData)` and `outlineContourToPackedPath(outlineContour)` from `@fontra/core/skeleton-generator.js`.
- Produces assertions for golden-master parity and the provenance contract.

- [ ] **Step 1: Write the failing tests**

Create `src-js/fontra-core/tests/test-skeleton-generator.js`:

```javascript
import {
  generateFromSkeleton,
  outlineContourToPackedPath,
} from "@fontra/core/skeleton-generator.js";
import { packContour } from "@fontra/core/var-path.js";
import { expect } from "chai";

import { readRepoPathAsJSON } from "./test-support.js";

const fixtures = readRepoPathAsJSON("tests/data/skeleton-generator/fixtures.json");

describe("skeleton-generator golden master", () => {
  for (const fixture of fixtures) {
    it(`matches donor output for ${fixture.name}`, () => {
      const result = generateFromSkeleton(fixture.canonical);
      expect(roundContours(result.contours)).to.deep.equal(
        roundContours(fixture.expectedContours)
      );
    });
  }

  it("outlineContourToPackedPath matches packContour", () => {
    const contour = fixtures[0].expectedContours[0];
    expect(outlineContourToPackedPath(contour)).to.deep.equal(packContour(contour));
  });
});

function roundContours(contours) {
  return contours.map((contour) => ({
    isClosed: contour.isClosed === true,
    points: contour.points.map((point) => {
      const rounded = {
        x: round(point.x),
        y: round(point.y),
      };
      if (point.type) rounded.type = point.type;
      if (point.smooth) rounded.smooth = true;
      return rounded;
    }),
  }));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-generator.js --reporter spec
```

Expected: FAIL because `@fontra/core/skeleton-generator.js` does not exist.

- [ ] **Step 3: Leave the failing test uncommitted**

Do not commit after this step. Commit the test together with the minimal generator implementation in Task 3 so the branch never records a failing test-only state.

---

## Task 3: Port Donor Geometry Into `skeleton-generator.js`

**Files:**
- Create: `src-js/fontra-core/src/skeleton-generator.js`
- Modify: `src-js/fontra-core/tests/test-skeleton-generator.js` only if a fixture exposes a mechanical assertion mismatch.

**Interfaces:**
- Produces:
  - `generateFromSkeleton(skeletonData) -> { contours, provenance }`
  - `generateContoursFromSkeleton(skeletonData) -> contours`
  - `generateOutlineFromSkeletonContour(skeletonContour, options = {}) -> contours`
  - `outlineContourToPackedPath(outlineContour) -> packedContour`

- [ ] **Step 1: Copy the donor generator as the starting point**

Copy `skeleton/src-js/fontra-core/src/skeleton-contour-generator.js` to `src-js/fontra-core/src/skeleton-generator.js`.

Do not commit this raw copy yet.

- [ ] **Step 2: Remove donor persistence/path-mutation tail**

In `src-js/fontra-core/src/skeleton-generator.js`, delete everything from the donor comment `/** Get skeleton data from layer customData. */` through the end of `regenerateSkeletonContours(...)`, and delete these exports/functions if they remain:

```text
getSkeletonData
setSkeletonData
clearSkeletonData
stripDerivedSkeletonFields
normalizeSkeletonData
moveSkeletonData
createEmptySkeletonData
_sanitizeGeneratedIndices
_packedContoursEqual
_recoverGeneratedIndices
_recoverGeneratedIndicesForMapping
_canUpdateGeneratedContoursInPlace
regenerateSkeletonContours
createSkeletonContour
generateSampledOffsetPoints
```

Keep `outlineContourToPackedPath(outlineContour)`.

- [ ] **Step 3: Fix imports**

At the top of `src-js/fontra-core/src/skeleton-generator.js`, keep these imports:

```javascript
import { Bezier } from "bezier-js";
import * as vector from "./vector.js";
import { packContour } from "./var-path.js";
import { fitCubic } from "./fit-cubic.js";
import {
  DEFAULT_SKELETON_WIDTH,
  normalizeSkeletonData,
} from "./skeleton-model.js";
```

Delete imports from `fontra-internal-data.js`, `fontra-internal-schema.js`, and `VarPackedPath` unless `outlineContourToPackedPath()` still uses them. If `outlineContourToPackedPath()` constructs a `VarPackedPath`, replace it with:

```javascript
export function outlineContourToPackedPath(outlineContour) {
  return packContour(outlineContour);
}
```

- [ ] **Step 4: Add canonical-schema adapter and public API**

Add this public API near the top of the file, after constants:

```javascript
export function generateFromSkeleton(skeletonData) {
  const normalized = normalizeSkeletonData(skeletonData);
  const generatorInput = canonicalToGeneratorInput(normalized);
  const generated = generateContoursFromGeneratorInput(generatorInput);
  return {
    contours: generated.contours,
    provenance: generated.provenance,
  };
}

export function generateContoursFromSkeleton(skeletonData) {
  return generateFromSkeleton(skeletonData).contours;
}

function generateContoursFromGeneratorInput(generatorInput) {
  if (!generatorInput?.contours?.length) {
    return { contours: [], provenance: [] };
  }
  const contours = [];
  const provenance = [];
  for (let contourIndex = 0; contourIndex < generatorInput.contours.length; contourIndex++) {
    const skeletonContour = generatorInput.contours[contourIndex];
    if (skeletonContour.points.length < 2) {
      continue;
    }
    const generatedContours = generateOutlineFromSkeletonContour(skeletonContour, {
      contourIndex,
      skeletonContourId: skeletonContour.id,
    });
    for (const generatedContour of generatedContours) {
      const generatedContourIndex = contours.length;
      contours.push(generatedContour);
      provenance.push({
        skeletonContourId: skeletonContour.id,
        generatedContourIndex,
        pointMap: generatedContour.points.map((point) => point._provenance || null),
      });
      stripPointProvenance(generatedContour);
    }
  }
  return { contours, provenance };
}

function stripPointProvenance(contour) {
  for (const point of contour.points) {
    delete point._provenance;
  }
}
```

Then rename the donor `export function generateContoursFromSkeleton(skeletonData)` body to `function generateContoursFromGeneratorInputOld(...)` temporarily only while wiring. When `generateContoursFromGeneratorInput()` above calls `generateOutlineFromSkeletonContour()` directly and tests pass, delete the donor `generateContoursFromSkeleton` wrapper to avoid duplicate exports.

- [ ] **Step 5: Add canonical-to-generator conversion**

Add:

```javascript
const CAP_CORNER_POINT_FIELDS = [
  "capStyle",
  "capRadiusRatio",
  "capTension",
  "capAngle",
  "capDistance",
  "roundnessStrength",
  "cornerAsymmetry",
];

function canonicalToGeneratorInput(skeletonData) {
  return {
    contours: skeletonData.contours.map((contour) => ({
      id: contour.id,
      isClosed: contour.closed,
      defaultWidth: contour.defaultWidth ?? DEFAULT_SKELETON_WIDTH,
      singleSided: contour.singleSided !== null,
      singleSidedDirection: contour.singleSided || "left",
      capStyle: contour.capStyle || "butt",
      reversed: contour.reversed === true,
      // undefined falls back to the generator's destructuring defaults
      cornerTrimRatio: contour.cornerTrimRatio,
      cornerRadiusBoost: contour.cornerRadiusBoost,
      points: contour.points.map(canonicalPointToGeneratorPoint),
    })),
  };
}

function canonicalPointToGeneratorPoint(point) {
  const generatorPoint = {
    id: point.id,
    x: point.x,
    y: point.y,
    smooth: point.smooth === true,
    _sourcePointId: point.id,
  };
  if (point.type) {
    generatorPoint.type = point.type;
    return generatorPoint;
  }
  generatorPoint.leftWidth = point.width?.left ?? DEFAULT_SKELETON_WIDTH / 2;
  generatorPoint.rightWidth = point.width?.right ?? DEFAULT_SKELETON_WIDTH / 2;
  generatorPoint.leftNudge = point.nudge?.left ?? 0;
  generatorPoint.rightNudge = point.nudge?.right ?? 0;
  generatorPoint.leftEditable = point.editable?.left === true;
  generatorPoint.rightEditable = point.editable?.right === true;
  for (const field of CAP_CORNER_POINT_FIELDS) {
    if (point[field] !== null && point[field] !== undefined) {
      generatorPoint[field] = point[field];
    }
  }
  copyHandleOffsetsToGenerator(generatorPoint, "left", point.handleOffsets?.leftIn, "In");
  copyHandleOffsetsToGenerator(generatorPoint, "left", point.handleOffsets?.leftOut, "Out");
  copyHandleOffsetsToGenerator(generatorPoint, "right", point.handleOffsets?.rightIn, "In");
  copyHandleOffsetsToGenerator(generatorPoint, "right", point.handleOffsets?.rightOut, "Out");
  return generatorPoint;
}

function copyHandleOffsetsToGenerator(generatorPoint, side, offset, inOut) {
  if (!offset) return;
  const prefix = `${side}Handle${inOut}`;
  generatorPoint[`${prefix}OffsetX`] = offset.x ?? 0;
  generatorPoint[`${prefix}OffsetY`] = offset.y ?? 0;
  generatorPoint[`${prefix}Detached`] = offset.detached === true;
}
```

- [ ] **Step 6: Run and fix syntax/import errors only**

Run:

```bash
cd src-js/fontra-core
node --check src/skeleton-generator.js
npx mocha tests/test-skeleton-generator.js --reporter spec
```

Expected: `node --check` passes and all golden-master contour assertions pass.

- [ ] **Step 7: Commit the pure donor geometry port**

Commit only after golden-master contour assertions pass:

```bash
git add src-js/fontra-core/src/skeleton-generator.js src-js/fontra-core/tests/test-skeleton-generator.js
git commit -m "feat(skeleton): port pure skeleton contour generator"
```

---

## Task 4: Emit Forward Provenance During Generation

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-generator.js`
- Modify: `src-js/fontra-core/tests/test-skeleton-generator.js`

**Interfaces:**
- Produces provenance point entries shaped as:
  - `{ skeletonPointId, side, role }`
  - `side: "left" | "right" | null`
  - `role: "onCurve" | "in" | "out"`

- [ ] **Step 1: Add precise provenance expectations**

Append these tests to `src-js/fontra-core/tests/test-skeleton-generator.js` before `function roundContours(contours)`:

```javascript
describe("skeleton-generator provenance", () => {
  it("emits contour-level provenance keyed by skeleton contour id", () => {
    const fixture = fixtures.find((item) => item.name === "open-line-butt-cap");
    const result = generateFromSkeleton(fixture.canonical);
    expect(result.provenance).to.have.length(result.contours.length);
    expect(result.provenance[0]).to.include({
      skeletonContourId: 1,
      generatedContourIndex: 0,
    });
    expect(result.provenance[0].pointMap).to.have.length(result.contours[0].points.length);
  });

  it("maps generated points to stable skeleton point ids and roles", () => {
    const fixture = fixtures.find((item) => item.name === "open-cubic-round-cap");
    const result = generateFromSkeleton(fixture.canonical);
    const pointMaps = result.provenance.flatMap((entry) => entry.pointMap);
    expect(pointMaps.some((entry) => entry?.skeletonPointId === 2)).to.equal(true);
    expect(pointMaps.some((entry) => entry?.skeletonPointId === 5)).to.equal(true);
    expect(pointMaps.some((entry) => entry?.role === "onCurve")).to.equal(true);
    expect(pointMaps.some((entry) => entry?.role === "in")).to.equal(true);
    expect(pointMaps.some((entry) => entry?.role === "out")).to.equal(true);
  });

  it("does not persist private provenance on output contour points", () => {
    const fixture = fixtures.find((item) => item.name === "open-line-butt-cap");
    const result = generateFromSkeleton(fixture.canonical);
    expect(
      result.contours.some((contour) =>
        contour.points.some((point) => Object.hasOwn(point, "_provenance"))
      )
    ).to.equal(false);
  });
});
```

- [ ] **Step 2: Mark generated points at creation sites**

Add these helpers to `src-js/fontra-core/src/skeleton-generator.js`:

```javascript
function withProvenance(point, sourcePoint, side, role) {
  if (!sourcePoint?._sourcePointId) {
    return point;
  }
  return {
    ...point,
    _provenance: {
      skeletonPointId: sourcePoint._sourcePointId,
      side,
      role,
    },
  };
}

function generatedOnCurve(basePoint, sourcePoint, side) {
  return withProvenance(basePoint, sourcePoint, side, "onCurve");
}

function generatedHandle(basePoint, sourcePoint, side, role) {
  return withProvenance(basePoint, sourcePoint, side, role);
}
```

Then update the donor port's generated point creation sites:

- Any generated on-curve based on a segment start point gets `generatedOnCurve(point, segment.startPoint, side)`.
- Any generated on-curve based on a segment end point gets `generatedOnCurve(point, segment.endPoint, side)`.
- Any generated control point leaving a start point gets `generatedHandle(point, segment.startPoint, side, "out")`.
- Any generated control point entering an end point gets `generatedHandle(point, segment.endPoint, side, "in")`.
- Cap points without a clear source endpoint use the nearest endpoint as `skeletonPointId`, `side: null`, and role `"onCurve"` for tip/on-curve points or `"in"`/`"out"` for cap handles.

Do this mechanically in the functions that push into `leftSide`, `rightSide`, `startCap`, and `endCap`; do not add any geometric lookup pass after generation.

- [ ] **Step 3: Run provenance tests**

Run:

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-generator.js --reporter spec
```

Expected: all golden-master and provenance tests pass.

- [ ] **Step 4: Commit provenance emission**

```bash
git add src-js/fontra-core/src/skeleton-generator.js src-js/fontra-core/tests/test-skeleton-generator.js
git commit -m "feat(skeleton): emit generator provenance maps"
```

---

## Task 5: Apply Near-Zero Handle Semantics From `c2cd2ce51`

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-generator.js`
- Modify: `src-js/fontra-core/tests/test-skeleton-generator.js`

**Interfaces:**
- Preserves the donor post-refactor bug fix for near-zero handles without importing post-refactor plumbing.

- [ ] **Step 1: Add regression test for near-zero handle direction**

Append:

```javascript
describe("skeleton-generator near-zero handle stabilization", () => {
  it("does not flip near-zero handles across the anchor", () => {
    const skeleton = {
      version: 1,
      nextId: 5,
      contours: [
        {
          id: 1,
          closed: false,
          defaultWidth: 80,
          singleSided: null,
          points: [
            {
              id: 2,
              x: 0,
              y: 0,
              type: null,
              smooth: false,
              width: { left: 40, right: 40, linked: true },
              nudge: { left: 0, right: 0 },
              editable: { left: false, right: false },
              handleOffsets: {},
            },
            { id: 3, x: 0.00001, y: 0, type: "cubic", smooth: false },
            { id: 4, x: 120, y: 40, type: "cubic", smooth: false },
            {
              id: 5,
              x: 160,
              y: 0,
              type: null,
              smooth: false,
              width: { left: 40, right: 40, linked: true },
              nudge: { left: 0, right: 0 },
              editable: { left: false, right: false },
              handleOffsets: {},
            },
          ],
        },
      ],
      generated: [],
    };

    const result = generateFromSkeleton(skeleton);
    const allPoints = result.contours.flatMap((contour) => contour.points);
    for (const point of allPoints) {
      expect(Number.isFinite(point.x)).to.equal(true);
      expect(Number.isFinite(point.y)).to.equal(true);
    }
  });
});
```

- [ ] **Step 2: Verify the test passes or exposes the old bug**

Run:

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-generator.js --reporter spec
```

Expected: PASS if the copied donor is already at `fd76d3abe` with equivalent guard coverage, or FAIL with unstable/NaN/flipped handles.

- [ ] **Step 3: Apply `c2cd2ce51` semantics if the copied donor lacks them**

In `lockNearZeroHandleDirection(...)`, use the `c2cd2ce51` hunk semantics:

```javascript
const vec = {
  x: handlePoint.x - anchor.x,
  y: handlePoint.y - anchor.y,
};
const length = Math.hypot(vec.x, vec.y);
const candidateDir = length > 1e-9 ? { x: vec.x / length, y: vec.y / length } : ref;
const directionDot = candidateDir.x * ref.x + candidateDir.y * ref.y;
const preventedFlip = directionDot < 0;
const lockedDirection = preventedFlip ? ref : candidateDir;
const minimalGridStep = getMinimumGridStepFromDirection(lockedDirection);
const minimalGridLength = minimalGridStep.length;
const projectedLength = Math.abs(vec.x * lockedDirection.x + vec.y * lockedDirection.y);
```

and when forcing a point:

```javascript
point = {
  x: anchor.x + lockedDirection.x * finalLength,
  y: anchor.y + lockedDirection.y * finalLength,
};
```

Also set debug `referenceDot` to `directionDot`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-generator.js --reporter spec
```

Expected: PASS.

- [ ] **Step 5: Commit near-zero semantics**

```bash
git add src-js/fontra-core/src/skeleton-generator.js src-js/fontra-core/tests/test-skeleton-generator.js
git commit -m "fix(skeleton): preserve near zero handle direction"
```

---

## Task 6: Final WS-7 Rail Checks

**Files:**
- Verify only; no planned code edits.

- [ ] **Step 1: Run full core tests**

```bash
cd src-js/fontra-core
npm test
```

Expected: PASS.

- [ ] **Step 2: Format touched files**

```bash
cd src-js/fontra-core
npx prettier --write src/skeleton-generator.js tests/test-skeleton-generator.js tests/scripts/make-skeleton-generator-fixtures.js tests/data/skeleton-generator/fixtures.json
```

Expected: prettier reports all touched files.

- [ ] **Step 3: Verify no donor runtime imports**

```bash
rg -n "skeleton/src-js|\\.\\./\\.\\./\\.\\./\\.\\./skeleton" src-js/fontra-core/src src-js/fontra-core/tests/test-skeleton-generator.js
```

Expected: no matches. The fixture script may still import donor paths.

- [ ] **Step 4: Verify no geometric recovery or path regeneration plumbing was ported**

```bash
rg -n "_recoverGeneratedIndices|_packedContoursEqual|regenerateSkeletonContours|generatedContourIndices|preferInPlace|setSkeletonData|clearSkeletonData|moveSkeletonData" src-js/fontra-core/src/skeleton-generator.js
```

Expected: no matches.

- [ ] **Step 5: Verify provenance is emitted forward**

```bash
rg -n "_provenance|withProvenance|pointMap|skeletonPointId" src-js/fontra-core/src/skeleton-generator.js src-js/fontra-core/tests/test-skeleton-generator.js
```

Expected: matches in `skeleton-generator.js` and tests.

- [ ] **Step 6: Commit final formatting if needed**

If Step 2 changed files:

```bash
git add src-js/fontra-core/src/skeleton-generator.js src-js/fontra-core/tests/test-skeleton-generator.js src-js/fontra-core/tests/scripts/make-skeleton-generator-fixtures.js src-js/fontra-core/tests/data/skeleton-generator/fixtures.json
git commit -m "style(skeleton): format generator files"
```

If Step 2 made no changes, do not create an empty commit.

---

## Manual Test Matrix

No `views-editor` files are touched in WS-7, so there is no editor manual test matrix for this workstream. Manual visual verification starts in WS-8 read-only rendering.

---

## Deviations

- The donor's generated-contour-index recovery fixes from `9ddfc746a` and `d0b4ec217` are not ported as code in WS-7 because this workstream does not mutate glyph paths or maintain path contour indices. Their semantics become WS-9 `editSkeleton` invariants: preserve purge sets when generated contour counts shrink, and update generated path indices transactionally.
- The donor's `generateContoursFromSkeleton(skeletonData)` returned only contours. Forkra's primary API is `generateFromSkeleton(skeletonData) -> { contours, provenance }`; a compatibility wrapper returns contours for tests and future callers that only need geometry.

---

## Acceptance Criteria

- `src-js/fontra-core/src/skeleton-generator.js` exports `generateFromSkeleton`, `generateContoursFromSkeleton`, `generateOutlineFromSkeletonContour`, and `outlineContourToPackedPath`.
- `generateFromSkeleton(skeletonData)` returns `{ contours, provenance }`, with `provenance.length === contours.length`.
- Each provenance entry has `{ skeletonContourId, generatedContourIndex, pointMap }`; each point-map entry is either `null` or `{ skeletonPointId, side, role }`.
- Golden-master tests compare forkra output to donor output for open, closed, cubic, single-sided, asymmetric/nudged, and detached-handle fixtures.
- No donor runtime import exists in production source.
- No geometric recovery, inverse projection, generated-contour index recovery, or path mutation helper is ported.
- `cd src-js/fontra-core && npm test` passes.
- Rail greps from Task 6 produce the expected results.

---

## Self-Review

- **Spec coverage:** WS-7 roadmap items are covered: generator port in Task 3, forward provenance in Task 4, cherry-picked near-zero handle semantics in Task 5, golden masters in Tasks 1-2, and no UI changes throughout.
- **Cherry-pick handling:** `c2cd2ce51` is applied directly; `9ddfc746a` and `d0b4ec217` are documented as non-code WS-7 deviations because their code concerns path-index recovery, which WS-7 explicitly excludes.
- **Placeholder scan:** no placeholder markers, deferred implementation notes, or unnamed tests remain.
- **Type/name consistency:** exported names used in tests are introduced in Task 3; provenance shape is consistent across tests, implementation steps, and acceptance criteria.
