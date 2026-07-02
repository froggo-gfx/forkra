# WS-6 — Skeleton Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the pure skeleton schema/data model and shared geometry helpers to `fontra-core`, with no editor UI changes.

**Architecture:** Skeleton data lives in `customData["fontra.internal"].skeleton` and is normalized through a new pure core module, `skeleton-model.js`. The model uses stable contour/point ids and exposes small accessor/mutator helpers that later workstreams can call from `editSkeleton`; geometry helpers are centralized in the same module for WS-7/9/11 reuse. No generator, hit-testing, pointer routing, or `views-editor` plumbing is added in WS-6.

**Tech Stack:** ES modules under `src-js/fontra-core/src`, `@fontra/core/...` imports, Mocha + Chai tests under `src-js/fontra-core/tests`, existing `fontra-internal-{schema,data}.js` helpers.

---

## Global Constraints

- **Branch:** implement on `refactor-simple/ws6-skeleton-core`, cut from the current `refactor-simple` head. The current planning branch is `refactor-skeleton/plan`; do not implement from the planning branch unless the user explicitly asks.
- **Donor is read-only:** `./skeleton/` stays pinned at `fd76d3abe`. Read from it only. Do not run `git -C skeleton checkout` or `git -C skeleton switch`.
- **Scope:** WS-6 creates pure core data/model/geometry only. Do not create `skeleton-generator.js`, `skeleton-editing.js`, visualization layers, scene-model hit tests, drawing tools, or panel UI.
- **Schema redesign:** forkra does not need donor-file compatibility. Do not preserve donor flat fields such as `leftWidth`, `rightWidth`, `leftNudge`, `isClosed`, or generated-contour index recovery as the canonical schema.
- **Stable ids:** all contours and points get monotonic integer ids from `nextId`; ids are never reused inside a skeleton data object.
- **One geometry source:** the only skeleton default-width constant after WS-6 is `DEFAULT_SKELETON_WIDTH` exported from `skeleton-model.js`.
- **Formatting:** run `npm test` in `src-js/fontra-core`, then `npx prettier --write` on touched files before each commit.

---

## Verified Current Context

- `src-js/fontra-core/src/fontra-internal-schema.js` currently exports `FONTRA_INTERNAL_SECTIONS` with only `LETTERSPACER: "letterspacer"`.
- `src-js/fontra-core/src/fontra-internal-data.js` already provides `getFontraInternalSection`, `setFontraInternalSection`, and `deleteFontraInternalSection`; it imports `deepCopyObject` from `./utils.ts`.
- `src-js/fontra-core/package.json` defines `npm test` as `mocha tests --extension js --extension ts --reporter spec`.
- Donor reference points:
  - `skeleton/src-js/fontra-core/src/skeleton-contour-generator.js:12` has `const DEFAULT_WIDTH = 80`.
  - `skeleton/src-js/fontra-core/src/skeleton-contour-generator.js:42` exports `getPointWidth`.
  - `skeleton/src-js/fontra-core/src/skeleton-contour-generator.js:62` exports `getPointHalfWidth`.
  - `skeleton/src-js/fontra-core/src/skeleton-contour-generator.js:1826` has `buildSegmentsFromPoints`.
  - `skeleton/src-js/fontra-core/src/skeleton-contour-generator.js:3355` exports `calculateNormalAtSkeletonPoint`.
  - `skeleton/src-js/views-editor/src/edit-tools-pointer.js:100` has donor `projectRibPoint`.

---

## File Structure

```
src-js/fontra-core/src/
  fontra-internal-schema.js  [MODIFY] add FONTRA_INTERNAL_SECTIONS.SKELETON
  skeleton-model.js          [CREATE] schema constructors, normalization, id allocation,
                                      accessors/mutators, width/nudge helpers,
                                      segment/normal/rib geometry
src-js/fontra-core/tests/
  test-fontra-internal-data.js [MODIFY] verify skeleton section round-trips through existing helpers
  test-skeleton-model.js       [CREATE] pure schema/model/geometry coverage
```

---

## Task 1: Add the Skeleton `fontra.internal` Section

**Files:**
- Modify: `src-js/fontra-core/src/fontra-internal-schema.js`
- Modify: `src-js/fontra-core/tests/test-fontra-internal-data.js`

**Interfaces:**
- Consumes: `setFontraInternalSection(entity, section, value)`, `getFontraInternalSection(entity, section)` from `@fontra/core/fontra-internal-data.js`.
- Produces: `FONTRA_INTERNAL_SECTIONS.SKELETON === "skeleton"`.

- [ ] **Step 1: Write the failing test**

Append this test to `src-js/fontra-core/tests/test-fontra-internal-data.js` inside the existing `describe("fontra-internal-data", () => { ... })` block:

```javascript
  it("round-trips the skeleton section name", () => {
    const e = {};
    const skeleton = {
      version: 1,
      nextId: 1,
      contours: [],
      generated: [],
    };
    setFontraInternalSection(e, FONTRA_INTERNAL_SECTIONS.SKELETON, skeleton);
    expect(getFontraInternalSection(e, FONTRA_INTERNAL_SECTIONS.SKELETON)).to.deep.equal(
      skeleton
    );
  });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
cd src-js/fontra-core
npx mocha tests/test-fontra-internal-data.js --reporter spec
```

Expected: FAIL because `FONTRA_INTERNAL_SECTIONS.SKELETON` is undefined.

- [ ] **Step 3: Add the schema section**

Replace `src-js/fontra-core/src/fontra-internal-schema.js` with:

```javascript
export const FONTRA_INTERNAL_KEY = "fontra.internal";
export const FONTRA_INTERNAL_SCHEMA_VERSION = 1;

export const FONTRA_INTERNAL_SECTIONS = Object.freeze({
  LETTERSPACER: "letterspacer",
  SKELETON: "skeleton",
});
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
cd src-js/fontra-core
npx mocha tests/test-fontra-internal-data.js --reporter spec
```

Expected: PASS, including the new skeleton section test.

- [ ] **Step 5: Format and run core tests**

Run:

```bash
cd src-js/fontra-core
npx prettier --write src/fontra-internal-schema.js tests/test-fontra-internal-data.js
npm test
```

Expected: prettier reports the two files; `npm test` passes.

- [ ] **Step 6: Commit**

```bash
git add src-js/fontra-core/src/fontra-internal-schema.js src-js/fontra-core/tests/test-fontra-internal-data.js
git commit -m "feat(skeleton): add fontra internal skeleton section"
```

---

## Task 2: Create Skeleton Constructors and Normalization

**Files:**
- Create: `src-js/fontra-core/src/skeleton-model.js`
- Create: `src-js/fontra-core/tests/test-skeleton-model.js`

**Interfaces:**
- Produces constants:
  - `SKELETON_SCHEMA_VERSION = 1`
  - `DEFAULT_SKELETON_WIDTH = 80`
- Produces constructors:
  - `makeEmptySkeletonData()`
  - `makeSkeletonContour(data = {}, skeletonData = null)`
  - `makeSkeletonPoint(data = {}, skeletonData = null)`
- Produces normalization:
  - `normalizeSkeletonData(data)`
  - `normalizeSkeletonContour(contour, skeletonData)`
  - `normalizeSkeletonPoint(point, skeletonData)`

- [ ] **Step 1: Write the failing constructor/normalization tests**

Create `src-js/fontra-core/tests/test-skeleton-model.js`:

```javascript
import {
  DEFAULT_SKELETON_WIDTH,
  SKELETON_SCHEMA_VERSION,
  makeEmptySkeletonData,
  makeSkeletonContour,
  makeSkeletonPoint,
  normalizeSkeletonData,
} from "@fontra/core/skeleton-model.js";
import { expect } from "chai";

describe("skeleton-model constructors and normalization", () => {
  it("creates an empty skeleton data object", () => {
    expect(makeEmptySkeletonData()).to.deep.equal({
      version: SKELETON_SCHEMA_VERSION,
      nextId: 1,
      contours: [],
      generated: [],
    });
  });

  it("allocates stable contour and point ids from nextId", () => {
    const skeleton = makeEmptySkeletonData();
    const contour = makeSkeletonContour({}, skeleton);
    const p0 = makeSkeletonPoint({ x: 10, y: 20 }, skeleton);
    const p1 = makeSkeletonPoint({ x: 30, y: 40, type: "cubic" }, skeleton);

    expect(contour.id).to.equal(1);
    expect(p0.id).to.equal(2);
    expect(p1.id).to.equal(3);
    expect(skeleton.nextId).to.equal(4);
    expect(contour.defaultWidth).to.equal(DEFAULT_SKELETON_WIDTH);
    expect(p0.type).to.equal(null);
    expect(p1.type).to.equal("cubic");
  });

  it("normalizes missing and malformed fields without reusing ids", () => {
    const normalized = normalizeSkeletonData({
      version: 99,
      nextId: 2,
      contours: [
        {
          id: 10,
          closed: true,
          singleSided: "right",
          points: [
            { id: 11, x: 1, y: 2, width: { left: 10, right: 20, linked: false } },
            { x: Number.NaN, y: Infinity, type: "bogus" },
          ],
        },
      ],
      generated: [{ skeletonContourId: 10, pathContourIndex: 3, pointMap: [] }],
    });

    expect(normalized.version).to.equal(1);
    expect(normalized.nextId).to.equal(13);
    expect(normalized.contours[0].id).to.equal(10);
    expect(normalized.contours[0].closed).to.equal(true);
    expect(normalized.contours[0].singleSided).to.equal("right");
    expect(normalized.contours[0].points[0].id).to.equal(11);
    expect(normalized.contours[0].points[1]).to.include({
      id: 12,
      x: 0,
      y: 0,
      type: null,
    });
    expect(normalized.generated).to.deep.equal([
      { skeletonContourId: 10, pathContourIndex: 3, pointMap: [] },
    ]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-model.js --reporter spec
```

Expected: FAIL because `@fontra/core/skeleton-model.js` does not exist.

- [ ] **Step 3: Create the initial model implementation**

Create `src-js/fontra-core/src/skeleton-model.js`:

```javascript
import { deepCopyObject } from "./utils.ts";

export const SKELETON_SCHEMA_VERSION = 1;
export const DEFAULT_SKELETON_WIDTH = 80;

const VALID_POINT_TYPES = new Set([null, "cubic"]);
const VALID_SINGLE_SIDED = new Set([null, "left", "right"]);

export function makeEmptySkeletonData() {
  return {
    version: SKELETON_SCHEMA_VERSION,
    nextId: 1,
    contours: [],
    generated: [],
  };
}

export function makeSkeletonContour(data = {}, skeletonData = null) {
  return normalizeSkeletonContour(
    {
      id: allocateSkeletonId(skeletonData, data.id),
      closed: false,
      defaultWidth: DEFAULT_SKELETON_WIDTH,
      singleSided: null,
      points: [],
      ...data,
    },
    skeletonData
  );
}

export function makeSkeletonPoint(data = {}, skeletonData = null) {
  return normalizeSkeletonPoint(
    {
      id: allocateSkeletonId(skeletonData, data.id),
      x: 0,
      y: 0,
      type: null,
      smooth: false,
      ...data,
    },
    skeletonData
  );
}

export function normalizeSkeletonData(data) {
  const normalized = makeEmptySkeletonData();
  const usedIds = new Set();

  for (const contour of Array.isArray(data?.contours) ? data.contours : []) {
    normalized.contours.push(normalizeSkeletonContour(contour, normalized, usedIds));
  }

  normalized.generated = Array.isArray(data?.generated)
    ? data.generated.map((entry) => ({
        skeletonContourId: asInteger(entry?.skeletonContourId, null),
        pathContourIndex: asInteger(entry?.pathContourIndex, null),
        pointMap: Array.isArray(entry?.pointMap) ? deepCopyObject(entry.pointMap) : [],
      }))
    : [];

  normalized.nextId = Math.max(
    asInteger(data?.nextId, 1),
    maxUsedId(usedIds) + 1,
    normalized.nextId
  );
  normalized.version = SKELETON_SCHEMA_VERSION;
  return normalized;
}

export function normalizeSkeletonContour(contour, skeletonData = null, usedIds = null) {
  const id = normalizeId(contour?.id, skeletonData, usedIds);
  const normalized = {
    id,
    closed: contour?.closed === true,
    defaultWidth: asNonNegativeNumber(contour?.defaultWidth, DEFAULT_SKELETON_WIDTH),
    singleSided: VALID_SINGLE_SIDED.has(contour?.singleSided)
      ? contour.singleSided
      : null,
    points: [],
  };
  for (const point of Array.isArray(contour?.points) ? contour.points : []) {
    normalized.points.push(normalizeSkeletonPoint(point, skeletonData, usedIds));
  }
  return normalized;
}

export function normalizeSkeletonPoint(point, skeletonData = null, usedIds = null) {
  const type = VALID_POINT_TYPES.has(point?.type) ? point.type : null;
  const normalized = {
    id: normalizeId(point?.id, skeletonData, usedIds),
    x: asFiniteNumber(point?.x, 0),
    y: asFiniteNumber(point?.y, 0),
    type,
    smooth: point?.smooth === true,
  };

  if (!type) {
    normalized.width = normalizeWidth(point?.width);
    normalized.nudge = normalizeNudge(point?.nudge);
    normalized.editable = normalizeEditable(point?.editable);
    normalized.handleOffsets = normalizeHandleOffsets(point?.handleOffsets);
  }

  return normalized;
}

function allocateSkeletonId(skeletonData, requestedId = undefined) {
  if (Number.isInteger(requestedId) && requestedId > 0) {
    if (skeletonData) {
      skeletonData.nextId = Math.max(skeletonData.nextId || 1, requestedId + 1);
    }
    return requestedId;
  }
  if (!skeletonData) {
    return 1;
  }
  const id = Math.max(1, asInteger(skeletonData.nextId, 1));
  skeletonData.nextId = id + 1;
  return id;
}

function normalizeId(value, skeletonData, usedIds) {
  let id = Number.isInteger(value) && value > 0 ? value : null;
  if (!id || usedIds?.has(id)) {
    id = allocateSkeletonId(skeletonData);
  } else if (skeletonData) {
    skeletonData.nextId = Math.max(skeletonData.nextId || 1, id + 1);
  }
  usedIds?.add(id);
  return id;
}

function maxUsedId(usedIds) {
  return usedIds?.size ? Math.max(...usedIds) : 0;
}

function normalizeWidth(width) {
  return {
    left: asNonNegativeNumber(width?.left, DEFAULT_SKELETON_WIDTH / 2),
    right: asNonNegativeNumber(width?.right, DEFAULT_SKELETON_WIDTH / 2),
    linked: width?.linked !== false,
  };
}

function normalizeNudge(nudge) {
  return {
    left: asFiniteNumber(nudge?.left, 0),
    right: asFiniteNumber(nudge?.right, 0),
  };
}

function normalizeEditable(editable) {
  return {
    left: editable?.left === true,
    right: editable?.right === true,
  };
}

function normalizeHandleOffsets(handleOffsets) {
  return handleOffsets && typeof handleOffsets === "object" && !Array.isArray(handleOffsets)
    ? deepCopyObject(handleOffsets)
    : {};
}

function asInteger(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
}

function asFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function asNonNegativeNumber(value, fallback) {
  return Math.max(0, asFiniteNumber(value, fallback));
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-model.js --reporter spec
```

Expected: PASS for the constructor/normalization tests.

- [ ] **Step 5: Format and run core tests**

Run:

```bash
cd src-js/fontra-core
npx prettier --write src/skeleton-model.js tests/test-skeleton-model.js
npm test
```

Expected: prettier reports the two files; `npm test` passes.

- [ ] **Step 6: Commit**

```bash
git add src-js/fontra-core/src/skeleton-model.js src-js/fontra-core/tests/test-skeleton-model.js
git commit -m "feat(skeleton): add core skeleton schema model"
```

---

## Task 3: Add Id-Based Accessors and Mutators

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-model.js`
- Modify: `src-js/fontra-core/tests/test-skeleton-model.js`

**Interfaces:**
- Produces:
  - `getSkeletonContour(skeletonData, contourId)`
  - `getSkeletonPoint(skeletonData, contourId, pointId)`
  - `appendSkeletonContour(skeletonData, contourData = {})`
  - `appendSkeletonPoint(skeletonData, contourId, pointData = {})`
  - `updateSkeletonPoint(skeletonData, contourId, pointId, patch)`
  - `deleteSkeletonPoint(skeletonData, contourId, pointId)`

- [ ] **Step 1: Write the failing accessor/mutator tests**

Update the existing import at the top of `src-js/fontra-core/tests/test-skeleton-model.js` so it includes the new exports:

```javascript
import {
  DEFAULT_SKELETON_WIDTH,
  SKELETON_SCHEMA_VERSION,
  appendSkeletonContour,
  appendSkeletonPoint,
  deleteSkeletonPoint,
  getSkeletonContour,
  getSkeletonPoint,
  makeEmptySkeletonData,
  makeSkeletonContour,
  makeSkeletonPoint,
  normalizeSkeletonData,
  updateSkeletonPoint,
} from "@fontra/core/skeleton-model.js";
```

Then append:

```javascript

describe("skeleton-model id accessors and mutators", () => {
  it("appends contours and points using stable ids", () => {
    const skeleton = makeEmptySkeletonData();
    const contour = appendSkeletonContour(skeleton, { closed: true });
    const p0 = appendSkeletonPoint(skeleton, contour.id, { x: 100, y: 200 });
    const p1 = appendSkeletonPoint(skeleton, contour.id, { x: 150, y: 250 });

    expect(getSkeletonContour(skeleton, contour.id)).to.equal(contour);
    expect(getSkeletonPoint(skeleton, contour.id, p0.id)).to.equal(p0);
    expect(getSkeletonPoint(skeleton, contour.id, p1.id)).to.equal(p1);
    expect(skeleton.nextId).to.equal(4);
  });

  it("updates a point by id and preserves its id", () => {
    const skeleton = makeEmptySkeletonData();
    const contour = appendSkeletonContour(skeleton);
    const point = appendSkeletonPoint(skeleton, contour.id, { x: 10, y: 20 });

    const updated = updateSkeletonPoint(skeleton, contour.id, point.id, {
      x: 30,
      smooth: true,
      width: { left: 12, right: 18, linked: false },
    });

    expect(updated).to.include({ id: point.id, x: 30, y: 20, smooth: true });
    expect(updated.width).to.deep.equal({ left: 12, right: 18, linked: false });
  });

  it("deletes a point by id without reusing ids", () => {
    const skeleton = makeEmptySkeletonData();
    const contour = appendSkeletonContour(skeleton);
    const p0 = appendSkeletonPoint(skeleton, contour.id);
    const p1 = appendSkeletonPoint(skeleton, contour.id);

    expect(deleteSkeletonPoint(skeleton, contour.id, p0.id)).to.equal(true);
    expect(getSkeletonPoint(skeleton, contour.id, p0.id)).to.equal(null);
    const p2 = appendSkeletonPoint(skeleton, contour.id);
    expect(p2.id).to.be.greaterThan(p1.id);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-model.js --reporter spec
```

Expected: FAIL because the accessor/mutator exports do not exist.

- [ ] **Step 3: Implement accessors and mutators**

Append these exports to `src-js/fontra-core/src/skeleton-model.js` after `normalizeSkeletonPoint`:

```javascript
export function getSkeletonContour(skeletonData, contourId) {
  return skeletonData?.contours?.find((contour) => contour.id === contourId) || null;
}

export function getSkeletonPoint(skeletonData, contourId, pointId) {
  const contour = getSkeletonContour(skeletonData, contourId);
  return contour?.points?.find((point) => point.id === pointId) || null;
}

export function appendSkeletonContour(skeletonData, contourData = {}) {
  const contour = makeSkeletonContour(contourData, skeletonData);
  skeletonData.contours.push(contour);
  return contour;
}

export function appendSkeletonPoint(skeletonData, contourId, pointData = {}) {
  const contour = getSkeletonContour(skeletonData, contourId);
  if (!contour) {
    throw new Error(`unknown skeleton contour id: ${contourId}`);
  }
  const point = makeSkeletonPoint(pointData, skeletonData);
  contour.points.push(point);
  return point;
}

export function updateSkeletonPoint(skeletonData, contourId, pointId, patch) {
  const contour = getSkeletonContour(skeletonData, contourId);
  if (!contour) {
    throw new Error(`unknown skeleton contour id: ${contourId}`);
  }
  const pointIndex = contour.points.findIndex((point) => point.id === pointId);
  if (pointIndex < 0) {
    throw new Error(`unknown skeleton point id: ${pointId}`);
  }
  const updated = normalizeSkeletonPoint(
    {
      ...contour.points[pointIndex],
      ...patch,
      id: pointId,
    },
    skeletonData
  );
  contour.points[pointIndex] = updated;
  return updated;
}

export function deleteSkeletonPoint(skeletonData, contourId, pointId) {
  const contour = getSkeletonContour(skeletonData, contourId);
  if (!contour) {
    return false;
  }
  const pointIndex = contour.points.findIndex((point) => point.id === pointId);
  if (pointIndex < 0) {
    return false;
  }
  contour.points.splice(pointIndex, 1);
  return true;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-model.js --reporter spec
```

Expected: PASS.

- [ ] **Step 5: Format and run core tests**

Run:

```bash
cd src-js/fontra-core
npx prettier --write src/skeleton-model.js tests/test-skeleton-model.js
npm test
```

Expected: prettier reports the two files; `npm test` passes.

- [ ] **Step 6: Commit**

```bash
git add src-js/fontra-core/src/skeleton-model.js src-js/fontra-core/tests/test-skeleton-model.js
git commit -m "feat(skeleton): add id based skeleton mutators"
```

---

## Task 4: Add Width, Nudge, Segment, Normal, and Rib Geometry Helpers

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-model.js`
- Modify: `src-js/fontra-core/tests/test-skeleton-model.js`

**Interfaces:**
- Produces:
  - `getSkeletonPointHalfWidth(point, defaultWidth, side)`
  - `getSkeletonPointWidth(point, defaultWidth, side = null)`
  - `getSkeletonPointNudge(point, side, defaultWidth = DEFAULT_SKELETON_WIDTH)`
  - `buildSegmentsFromSkeletonPoints(points, closed)`
  - `calculateNormalAtSkeletonPoint(skeletonContour, pointIndexOrPointId)`
  - `projectSkeletonRibPoint(point, normal, halfWidth, side, nudge = 0)`

- [ ] **Step 1: Write the failing geometry tests**

Extend the import in `src-js/fontra-core/tests/test-skeleton-model.js` with:

```javascript
  buildSegmentsFromSkeletonPoints,
  calculateNormalAtSkeletonPoint,
  getSkeletonPointHalfWidth,
  getSkeletonPointNudge,
  getSkeletonPointWidth,
  projectSkeletonRibPoint,
```

Append these tests:

```javascript
describe("skeleton-model geometry helpers", () => {
  it("reads symmetric and asymmetric widths from the canonical schema", () => {
    const point = makeSkeletonPoint({
      width: { left: 12, right: 18, linked: false },
    });
    expect(getSkeletonPointHalfWidth(point, DEFAULT_SKELETON_WIDTH, "left")).to.equal(12);
    expect(getSkeletonPointHalfWidth(point, DEFAULT_SKELETON_WIDTH, "right")).to.equal(18);
    expect(getSkeletonPointWidth(point, DEFAULT_SKELETON_WIDTH)).to.equal(30);
    expect(getSkeletonPointWidth(point, DEFAULT_SKELETON_WIDTH, "left")).to.equal(24);
    expect(getSkeletonPointWidth(point, DEFAULT_SKELETON_WIDTH, "right")).to.equal(36);
  });

  it("returns nudge only for editable non-zero-width sides", () => {
    const point = makeSkeletonPoint({
      nudge: { left: 7, right: 9 },
      editable: { left: true, right: false },
    });
    expect(getSkeletonPointNudge(point, "left")).to.equal(7);
    expect(getSkeletonPointNudge(point, "right")).to.equal(0);

    const zeroWidthPoint = makeSkeletonPoint({
      width: { left: 0, right: 40, linked: false },
      nudge: { left: 11, right: 13 },
      editable: { left: true, right: true },
    });
    expect(getSkeletonPointNudge(zeroWidthPoint, "left")).to.equal(0);
    expect(getSkeletonPointNudge(zeroWidthPoint, "right")).to.equal(13);
  });

  it("builds line and cubic segments between on-curve skeleton points", () => {
    const points = [
      makeSkeletonPoint({ id: 1, x: 0, y: 0 }),
      makeSkeletonPoint({ id: 2, x: 25, y: 50, type: "cubic" }),
      makeSkeletonPoint({ id: 3, x: 75, y: 50, type: "cubic" }),
      makeSkeletonPoint({ id: 4, x: 100, y: 0 }),
    ];
    const segments = buildSegmentsFromSkeletonPoints(points, false);
    expect(segments).to.have.length(1);
    expect(segments[0].startPoint.id).to.equal(1);
    expect(segments[0].endPoint.id).to.equal(4);
    expect(segments[0].controlPoints.map((point) => point.id)).to.deep.equal([2, 3]);
  });

  it("calculates normals and rib endpoints using the donor orientation", () => {
    const contour = makeSkeletonContour({
      points: [
        makeSkeletonPoint({ id: 1, x: 0, y: 0 }),
        makeSkeletonPoint({ id: 2, x: 100, y: 0 }),
      ],
    });
    const normal = calculateNormalAtSkeletonPoint(contour, 0);
    expect(normal.x).to.be.closeTo(0, 1e-9);
    expect(normal.y).to.be.closeTo(-1, 1e-9);

    expect(projectSkeletonRibPoint(contour.points[0], normal, 40, "left")).to.deep.equal({
      x: 0,
      y: -40,
    });
    expect(
      projectSkeletonRibPoint(contour.points[0], normal, 40, "right", 10)
    ).to.deep.equal({
      x: -10,
      y: 40,
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-model.js --reporter spec
```

Expected: FAIL because the geometry exports do not exist.

- [ ] **Step 3: Implement the geometry helpers**

Add these imports at the top of `src-js/fontra-core/src/skeleton-model.js`:

```javascript
import { Bezier } from "bezier-js";
import {
  normalizeVector,
  rotateVector90CW,
  subVectors,
} from "./vector.js";
```

Append these exports before the private helper functions:

```javascript
export function getSkeletonPointHalfWidth(point, defaultWidth, side) {
  const width = normalizeWidth(point?.width);
  if (side === "left") {
    return width.left;
  }
  if (side === "right") {
    return width.right;
  }
  return asNonNegativeNumber(defaultWidth, DEFAULT_SKELETON_WIDTH) / 2;
}

export function getSkeletonPointWidth(point, defaultWidth, side = null) {
  if (side === "left") {
    return getSkeletonPointHalfWidth(point, defaultWidth, "left") * 2;
  }
  if (side === "right") {
    return getSkeletonPointHalfWidth(point, defaultWidth, "right") * 2;
  }
  return (
    getSkeletonPointHalfWidth(point, defaultWidth, "left") +
    getSkeletonPointHalfWidth(point, defaultWidth, "right")
  );
}

export function getSkeletonPointNudge(
  point,
  side,
  defaultWidth = DEFAULT_SKELETON_WIDTH
) {
  const editable = normalizeEditable(point?.editable);
  if (!editable[side]) {
    return 0;
  }
  if (getSkeletonPointHalfWidth(point, defaultWidth, side) < 0.5) {
    return 0;
  }
  return normalizeNudge(point?.nudge)[side];
}

export function buildSegmentsFromSkeletonPoints(points, closed) {
  const segments = [];
  const onCurveIndices = [];
  for (let i = 0; i < points.length; i++) {
    if (!points[i].type) {
      onCurveIndices.push(i);
    }
  }
  if (onCurveIndices.length < 2) {
    return segments;
  }
  for (let i = 0; i < onCurveIndices.length - 1; i++) {
    segments.push(makeSegment(points, onCurveIndices[i], onCurveIndices[i + 1]));
  }
  if (closed) {
    const lastIdx = onCurveIndices[onCurveIndices.length - 1];
    const firstIdx = onCurveIndices[0];
    segments.push(makeWrappingSegment(points, lastIdx, firstIdx));
  }
  return segments;
}

export function calculateNormalAtSkeletonPoint(skeletonContour, pointIndexOrPointId) {
  const points = skeletonContour?.points || [];
  if (points.length < 2) {
    return { x: 0, y: 1 };
  }
  const pointIndex =
    pointIndexOrPointId >= 0 && pointIndexOrPointId < points.length
      ? pointIndexOrPointId
      : points.findIndex((point) => point.id === pointIndexOrPointId);
  const point = points[pointIndex];
  if (!point || point.type) {
    return { x: 0, y: 1 };
  }

  const segments = buildSegmentsFromSkeletonPoints(points, skeletonContour.closed);
  let incomingSegment = null;
  let outgoingSegment = null;
  for (const segment of segments) {
    if (segment.endPoint === point) {
      incomingSegment = segment;
    }
    if (segment.startPoint === point) {
      outgoingSegment = segment;
    }
  }

  const dir1 = incomingSegment ? segmentEndDirection(incomingSegment) : null;
  const dir2 = outgoingSegment ? segmentStartDirection(outgoingSegment) : null;

  if (!dir1 && dir2) {
    return getEffectiveNormal(point, rotateVector90CW(dir2));
  }
  if (dir1 && !dir2) {
    return getEffectiveNormal(point, rotateVector90CW(dir1));
  }
  if (!dir1 && !dir2) {
    return getEffectiveNormal(point, { x: 0, y: 1 });
  }

  const dot = dir1.x * dir2.x + dir1.y * dir2.y;
  const cross = dir1.x * dir2.y - dir1.y * dir2.x;
  const halfAngle = Math.atan2(cross, dot) / 2;
  const cosH = Math.cos(halfAngle);
  const sinH = Math.sin(halfAngle);
  const bisector = normalizeVector({
    x: dir1.x * cosH - dir1.y * sinH,
    y: dir1.x * sinH + dir1.y * cosH,
  });
  return getEffectiveNormal(point, rotateVector90CW(bisector));
}

export function projectSkeletonRibPoint(point, normal, halfWidth, side, nudge = 0) {
  const sign = side === "left" ? 1 : -1;
  const tangent = { x: -normal.y, y: normal.x };
  const baseX = Math.round(point.x + sign * normal.x * halfWidth);
  const baseY = Math.round(point.y + sign * normal.y * halfWidth);
  return {
    x: Math.round(baseX + tangent.x * nudge),
    y: Math.round(baseY + tangent.y * nudge),
  };
}

function makeSegment(points, startIdx, endIdx) {
  return {
    startPoint: points[startIdx],
    endPoint: points[endIdx],
    controlPoints: points.slice(startIdx + 1, endIdx).filter((point) => point.type),
  };
}

function makeWrappingSegment(points, lastIdx, firstIdx) {
  return {
    startPoint: points[lastIdx],
    endPoint: points[firstIdx],
    controlPoints: [
      ...points.slice(lastIdx + 1).filter((point) => point.type),
      ...points.slice(0, firstIdx).filter((point) => point.type),
    ],
  };
}

function segmentStartDirection(segment) {
  if (!segment.controlPoints.length) {
    return normalizeVector(subVectors(segment.endPoint, segment.startPoint));
  }
  const bezier = createBezierFromSegment(segment);
  const deriv = bezier.derivative(0);
  return normalizeVector({ x: deriv.x, y: deriv.y });
}

function segmentEndDirection(segment) {
  if (!segment.controlPoints.length) {
    return normalizeVector(subVectors(segment.endPoint, segment.startPoint));
  }
  const bezier = createBezierFromSegment(segment);
  const deriv = bezier.derivative(1);
  return normalizeVector({ x: deriv.x, y: deriv.y });
}

function createBezierFromSegment(segment) {
  return new Bezier(segment.startPoint, ...segment.controlPoints, segment.endPoint);
}

function getEffectiveNormal(point, calculatedNormal) {
  if (point.forceHorizontal) {
    return { x: 0, y: calculatedNormal.y >= 0 ? 1 : -1 };
  }
  if (point.forceVertical) {
    return { x: calculatedNormal.x >= 0 ? 1 : -1, y: 0 };
  }
  return calculatedNormal;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-model.js --reporter spec
```

Expected: PASS.

- [ ] **Step 5: Format and run core tests**

Run:

```bash
cd src-js/fontra-core
npx prettier --write src/skeleton-model.js tests/test-skeleton-model.js
npm test
```

Expected: prettier reports the two files; `npm test` passes.

- [ ] **Step 6: Commit**

```bash
git add src-js/fontra-core/src/skeleton-model.js src-js/fontra-core/tests/test-skeleton-model.js
git commit -m "feat(skeleton): add shared skeleton geometry helpers"
```

---

## Task 5: Add Layer Persistence Convenience Helpers

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-model.js`
- Modify: `src-js/fontra-core/tests/test-skeleton-model.js`

**Interfaces:**
- Consumes: `getFontraInternalSection`, `setFontraInternalSection`, `deleteFontraInternalSection`.
- Produces:
  - `getSkeletonData(layerOrCustomData)`
  - `setSkeletonData(layer, skeletonData)`
  - `clearSkeletonData(layer)`

- [ ] **Step 1: Write the failing persistence-helper tests**

Extend the import in `src-js/fontra-core/tests/test-skeleton-model.js` with:

```javascript
  clearSkeletonData,
  getSkeletonData,
  setSkeletonData,
```

Append:

```javascript
describe("skeleton-model layer persistence helpers", () => {
  it("sets, normalizes, reads, and clears skeleton data on a layer", () => {
    const layer = {};
    setSkeletonData(layer, {
      nextId: 1,
      contours: [{ points: [{ x: 10, y: 20 }] }],
    });

    const skeleton = getSkeletonData(layer);
    expect(skeleton.version).to.equal(1);
    expect(skeleton.contours).to.have.length(1);
    expect(skeleton.contours[0].points[0]).to.include({ x: 10, y: 20 });
    expect(skeleton.contours[0].points[0].id).to.be.a("number");

    clearSkeletonData(layer);
    expect(getSkeletonData(layer)).to.equal(null);
  });

  it("returns null for absent or malformed skeleton data", () => {
    expect(getSkeletonData(null)).to.equal(null);
    expect(getSkeletonData({ customData: {} })).to.equal(null);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-model.js --reporter spec
```

Expected: FAIL because the persistence-helper exports do not exist.

- [ ] **Step 3: Implement persistence helpers**

Add these imports to `src-js/fontra-core/src/skeleton-model.js`:

```javascript
import {
  deleteFontraInternalSection,
  getFontraInternalSection,
  setFontraInternalSection,
} from "./fontra-internal-data.js";
import {
  FONTRA_INTERNAL_KEY,
  FONTRA_INTERNAL_SECTIONS,
} from "./fontra-internal-schema.js";
```

Append these exports before private helper functions:

```javascript
export function getSkeletonData(layerOrCustomData) {
  if (layerOrCustomData?.customData) {
    const internalSkeleton = getFontraInternalSection(
      layerOrCustomData,
      FONTRA_INTERNAL_SECTIONS.SKELETON
    );
    return internalSkeleton ? normalizeSkeletonData(internalSkeleton) : null;
  }
  const customData = layerOrCustomData?.customData ?? layerOrCustomData;
  const internalSkeleton =
    customData?.[FONTRA_INTERNAL_KEY]?.[FONTRA_INTERNAL_SECTIONS.SKELETON];
  return internalSkeleton ? normalizeSkeletonData(internalSkeleton) : null;
}

export function setSkeletonData(layer, skeletonData) {
  if (!layer) {
    return;
  }
  if (skeletonData === null || skeletonData === undefined) {
    clearSkeletonData(layer);
    return;
  }
  setFontraInternalSection(
    layer,
    FONTRA_INTERNAL_SECTIONS.SKELETON,
    normalizeSkeletonData(skeletonData)
  );
}

export function clearSkeletonData(layer) {
  if (!layer) {
    return;
  }
  deleteFontraInternalSection(layer, FONTRA_INTERNAL_SECTIONS.SKELETON);
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
cd src-js/fontra-core
npx mocha tests/test-skeleton-model.js --reporter spec
```

Expected: PASS.

- [ ] **Step 5: Format and run core tests**

Run:

```bash
cd src-js/fontra-core
npx prettier --write src/skeleton-model.js tests/test-skeleton-model.js
npm test
```

Expected: prettier reports the two files; `npm test` passes.

- [ ] **Step 6: Commit**

```bash
git add src-js/fontra-core/src/skeleton-model.js src-js/fontra-core/tests/test-skeleton-model.js
git commit -m "feat(skeleton): add skeleton persistence helpers"
```

---

## Task 6: Final WS-6 Rail Checks

**Files:**
- Verify only; no planned code edits.

**Interfaces:**
- Confirms WS-6 exports are pure core only and no later-workstream plumbing slipped in.

- [ ] **Step 1: Run the full core test suite**

Run:

```bash
cd src-js/fontra-core
npm test
```

Expected: PASS.

- [ ] **Step 2: Run formatting check/write on touched files**

Run:

```bash
cd src-js/fontra-core
npx prettier --write src/fontra-internal-schema.js src/skeleton-model.js tests/test-fontra-internal-data.js tests/test-skeleton-model.js
```

Expected: prettier reports all four files.

- [ ] **Step 3: Verify no editor work was added in WS-6**

Run:

```bash
git diff --name-only HEAD~4..HEAD
```

Expected: only these files appear:

```text
src-js/fontra-core/src/fontra-internal-schema.js
src-js/fontra-core/src/skeleton-model.js
src-js/fontra-core/tests/test-fontra-internal-data.js
src-js/fontra-core/tests/test-skeleton-model.js
```

- [ ] **Step 4: Verify no generator or geometric recovery was introduced**

Run:

```bash
rg -n "recover|inverse|tolerance|generateContoursFromSkeleton|generateFromSkeleton|skeleton-generator" src-js/fontra-core/src/skeleton-model.js src-js/fontra-core/tests/test-skeleton-model.js
```

Expected: no matches.

- [ ] **Step 5: Verify the skeleton default width has one forkra source**

Run:

```bash
rg -n "DEFAULT_SKELETON_WIDTH|DEFAULT_WIDTH = 80" src-js
```

Expected: only `src-js/fontra-core/src/skeleton-model.js` and `src-js/fontra-core/tests/test-skeleton-model.js` contain `DEFAULT_SKELETON_WIDTH`; no forkra file contains a new `DEFAULT_WIDTH = 80`.

- [ ] **Step 6: Commit final formatting or verification-only adjustments if needed**

If Step 2 changed files:

```bash
git add src-js/fontra-core/src/fontra-internal-schema.js src-js/fontra-core/src/skeleton-model.js src-js/fontra-core/tests/test-fontra-internal-data.js src-js/fontra-core/tests/test-skeleton-model.js
git commit -m "style(skeleton): format skeleton core files"
```

If Step 2 made no changes, do not create an empty commit.

---

## Manual Test Matrix

No `views-editor` files are touched in WS-6, so there is no editor manual test matrix for this workstream. Manual verification starts in WS-8 read-only rendering and WS-9 editing.

---

## Acceptance Criteria

- `FONTRA_INTERNAL_SECTIONS.SKELETON` exists and is `"skeleton"`.
- `src-js/fontra-core/src/skeleton-model.js` exports schema constructors, normalization, id allocation, accessors/mutators, width/nudge helpers, segment construction, normal calculation, rib projection, and layer persistence helpers.
- `normalizeSkeletonData()` always returns schema `version: 1`, monotonic `nextId`, normalized contours/points, and copied `generated` metadata.
- All contour/point lookup and mutation helpers operate by stable ids, not path point indices.
- No generated contour algorithm, editor hit-testing, pointer dispatch, visualization, drawing tool, or parameter panel code is added.
- No geometric recovery, inverse projection, or tolerance-based generated-to-skeleton lookup is introduced.
- `cd src-js/fontra-core && npm test` passes.
- Rail greps from Task 6 produce the expected results.

---

## Self-Review

- **Spec coverage:** WS-6 roadmap items are covered: schema section in Task 1, data model/id allocation/accessors/mutators in Tasks 2-3, width/nudge flags in Tasks 2 and 4, consolidated default width and pure rib/normal geometry in Task 4, persistence helpers through `fontra.internal` in Task 5.
- **Scope check:** WS-7 generator/provenance, WS-8 rendering, WS-9 editing, WS-10 drawing tool, WS-11 ribs UI, and later panel/Tunni work are explicitly excluded.
- **Placeholder scan:** no `TBD`, `TODO`, "implement later", or unnamed tests remain.
- **Type/name consistency:** every exported name used by tests is defined in the task that implements it; all imports use `@fontra/core/...` in tests and relative imports in core modules.
