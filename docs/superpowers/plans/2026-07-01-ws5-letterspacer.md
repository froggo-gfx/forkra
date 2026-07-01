# WS-5 — Letterspacer Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the HT-Letterspacer auto-sidebearings feature from skeleton into forkra — pure engine math in core (tested), persistence via `fontra.internal` customData (D1), the UI embedded in the **Glyph Info** panel, and a margin/polygon overlay layer — with all skeleton/rib coupling stripped.

**Architecture:** Extract the pure geometry engine into `fontra-core/src/letterspacer-engine.js` (mocha-tested). Persistence uses two new core modules (`fontra-internal-schema.js`, `fontra-internal-data.js`) storing a `letterspacer` section in `customData["fontra.internal"]` at font / source(master) / glyph levels. The `LetterspacerPanel` (ported from skeleton, ~1662 lines, minus engine math + skeleton branches) is **embedded as a child of `panel-selection-info.js`** (the Glyph Info panel) — **not** a standalone sidebar tab. A registration-only overlay layer (`visualization-layer-letterspacer.js`) renders the margins/scan-lines/SB polygons from `model.letterspacerVisualizationData`.

**Tech Stack:** ES modules, `@fontra/core/...` alias. Mocha+chai for core (`fontra-core`); manual verification for `views-editor` (no harness). Uses `PathHitTester` (`@fontra/core/path-hit-tester.js`) for margin scanning.

## Global Constraints

- **Branch:** cut `refactor-simple/ws5-letterspacer` from the current `refactor-simple/` head (WS-1..4.5 done). Frequent commits; **never push** unless asked.
- **Skeleton is read-only donor.** Copy code from `./skeleton/...`; never modify it. **Strip ALL skeleton coupling:** the `@fontra/core/skeleton-contour-generator.js` import (`getSkeletonData`/`moveSkeletonData`/`setSkeletonData`) and the `if (skeletonData && deltaLSB)` apply branch. No `SKELETON`/`SKELETON_DEFAULTS` schema sections.
- **D1 (persistence):** the `letterspacer` section lives in `customData["fontra.internal"]` — font (enabled flag), source/master (area/depth/overshoot), glyph (referenceGlyphName). Written only through `setFontraInternalSection`. Round-trips through save/load.
- **Registration correction (verified):** skeleton does **not** add the letterspacer as a sidebar tab — `panel-selection-info.js` imports `LetterspacerPanel`, instantiates it, and mounts it in a host div inserted after the dimensions/sidebearings block. Mirror that. `editor.js` only side-effect-imports the overlay layer.
- **Import path fix:** `deepCopyObject` is in forkra's **`utils.ts`** (skeleton imports `./utils.js`). Adjust to `./utils.ts`.
- **Formatting:** `npx prettier --write <files>` (3.8.3) before commit. CRLF; `node --check` every views-editor file.

---

## File Structure

```
src-js/fontra-core/src/
  fontra-internal-schema.js  [CREATE] FONTRA_INTERNAL_KEY, _SCHEMA_VERSION, SECTIONS (LETTERSPACER only)
  fontra-internal-data.js    [CREATE] get/ensure/getSection/setSection/deleteSection (customData helpers)
  letterspacer-engine.js     [CREATE] polygonArea, setDepth, closePolygon, calculateSidebearing,
                                      computeTargetAreaFromSidebearing, computeParamAreaFromTargetArea,
                                      class LetterspacerEngine (computeSpacing/collectMargins; uses PathHitTester)
src-js/fontra-core/tests/
  test-fontra-internal-data.js [CREATE]  round-trip get/set/ensure/delete
  test-letterspacer-engine.js  [CREATE]  the 6 pure geometry funcs
src-js/fontra-core/assets/tabler-icons/
  spacing-horizontal.svg     [CREATE] copy from skeleton
src-js/views-editor/src/
  panel-letterspacer.js              [CREATE] port from skeleton; engine math → import; skeleton coupling stripped
  visualization-layer-letterspacer.js [CREATE] port verbatim (clean); registration-only overlay
  panel-selection-info.js            [MODIFY] embed LetterspacerPanel after the sidebearings block
  editor.js                          [MODIFY] side-effect import "./visualization-layer-letterspacer.js"
src-js/fontra-core/assets/lang/
  en.js                              [MODIFY] add sidebar.letterspacer.{title,area,depth,overshoot,apply-lsb,apply-rsb,reference}
```

---

## Task 1: Persistence core — `fontra-internal-{schema,data}.js` (TDD)

**Files:**
- Create: `src-js/fontra-core/src/fontra-internal-schema.js`, `src-js/fontra-core/src/fontra-internal-data.js`
- Test: `src-js/fontra-core/tests/test-fontra-internal-data.js`

**Interfaces:**
- Produces: `getFontraInternal(entity)`, `ensureFontraInternal(entity)`, `getFontraInternalSection(entity, section)`, `setFontraInternalSection(entity, section, value)`, `deleteFontraInternalSection(entity, section)`; `FONTRA_INTERNAL_KEY`, `FONTRA_INTERNAL_SCHEMA_VERSION`, `FONTRA_INTERNAL_SECTIONS`.

- [ ] **Step 1: Write the failing test**

Create `src-js/fontra-core/tests/test-fontra-internal-data.js`:

```javascript
import {
  getFontraInternal,
  ensureFontraInternal,
  getFontraInternalSection,
  setFontraInternalSection,
  deleteFontraInternalSection,
} from "@fontra/core/fontra-internal-data.js";
import {
  FONTRA_INTERNAL_KEY,
  FONTRA_INTERNAL_SECTIONS,
} from "@fontra/core/fontra-internal-schema.js";
import { expect } from "chai";

describe("fontra-internal-data", () => {
  it("getFontraInternal is null-safe and returns null when absent", () => {
    expect(getFontraInternal(null)).to.equal(null);
    expect(getFontraInternal({})).to.equal(null);
  });

  it("ensureFontraInternal creates the container with a schema version", () => {
    const e = {};
    const internal = ensureFontraInternal(e);
    expect(e.customData[FONTRA_INTERNAL_KEY]).to.equal(internal);
    expect(internal.schemaVersion).to.equal(1);
  });

  it("set/get a section round-trips a deep copy", () => {
    const e = {};
    const value = { area: 400, depth: 15 };
    setFontraInternalSection(e, FONTRA_INTERNAL_SECTIONS.LETTERSPACER, value);
    const read = getFontraInternalSection(e, FONTRA_INTERNAL_SECTIONS.LETTERSPACER);
    expect(read).to.deep.equal(value);
    value.area = 999; // mutate source
    expect(getFontraInternalSection(e, FONTRA_INTERNAL_SECTIONS.LETTERSPACER).area).to.equal(400);
  });

  it("setting a section to undefined, and delete, remove it", () => {
    const e = {};
    setFontraInternalSection(e, FONTRA_INTERNAL_SECTIONS.LETTERSPACER, { area: 1 });
    setFontraInternalSection(e, FONTRA_INTERNAL_SECTIONS.LETTERSPACER, undefined);
    expect(getFontraInternalSection(e, FONTRA_INTERNAL_SECTIONS.LETTERSPACER)).to.equal(undefined);
    setFontraInternalSection(e, FONTRA_INTERNAL_SECTIONS.LETTERSPACER, { area: 2 });
    deleteFontraInternalSection(e, FONTRA_INTERNAL_SECTIONS.LETTERSPACER);
    expect(getFontraInternalSection(e, FONTRA_INTERNAL_SECTIONS.LETTERSPACER)).to.equal(undefined);
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd src-js/fontra-core && npx mocha tests/test-fontra-internal-data.js --reporter spec`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `fontra-internal-schema.js`**

```javascript
export const FONTRA_INTERNAL_KEY = "fontra.internal";
export const FONTRA_INTERNAL_SCHEMA_VERSION = 1;

export const FONTRA_INTERNAL_SECTIONS = Object.freeze({
  LETTERSPACER: "letterspacer",
});
```

> SKELETON / SKELETON_DEFAULTS / EDITOR_VIEW sections are intentionally dropped (no skeleton tool; grid/speedpunk use app-level settings, not customData).

- [ ] **Step 4: Create `fontra-internal-data.js`** (verbatim from skeleton, `utils.js`→`utils.ts`)

```javascript
import { deepCopyObject } from "./utils.ts";
import {
  FONTRA_INTERNAL_KEY,
  FONTRA_INTERNAL_SCHEMA_VERSION,
} from "./fontra-internal-schema.js";

export function getFontraInternal(entity) {
  return entity?.customData?.[FONTRA_INTERNAL_KEY] || null;
}

export function ensureFontraInternal(entity) {
  entity.customData ||= {};
  const internal = entity.customData[FONTRA_INTERNAL_KEY];
  if (!internal || typeof internal !== "object" || Array.isArray(internal)) {
    entity.customData[FONTRA_INTERNAL_KEY] = {
      schemaVersion: FONTRA_INTERNAL_SCHEMA_VERSION,
    };
  } else if (internal.schemaVersion === undefined) {
    internal.schemaVersion = FONTRA_INTERNAL_SCHEMA_VERSION;
  }
  return entity.customData[FONTRA_INTERNAL_KEY];
}

export function getFontraInternalSection(entity, section) {
  const internal = getFontraInternal(entity);
  return internal?.[section];
}

export function setFontraInternalSection(entity, section, value) {
  const internal = ensureFontraInternal(entity);
  if (value === undefined) {
    delete internal[section];
  } else {
    internal[section] = deepCopyObject(value);
  }
  return internal;
}

export function deleteFontraInternalSection(entity, section) {
  const internal = getFontraInternal(entity);
  if (!internal) {
    return;
  }
  delete internal[section];
}
```

- [ ] **Step 5: Run — verify pass**

Run: `cd src-js/fontra-core && npx mocha tests/test-fontra-internal-data.js --reporter spec`
Expected: PASS (4 passing).

- [ ] **Step 6: Commit**

```bash
git add src-js/fontra-core/src/fontra-internal-schema.js src-js/fontra-core/src/fontra-internal-data.js src-js/fontra-core/tests/test-fontra-internal-data.js
git commit -m "feat(letterspacer): add fontra.internal customData persistence core (D1)"
```

---

## Task 2: Letterspacer engine — pure geometry math (TDD)

Extract the 6 pure functions + `LetterspacerEngine` class from skeleton's `panel-letterspacer.js` (≈23–365) into a core module. The pure funcs are the algorithm's testable heart; the class wraps them with `PathHitTester` margin scanning.

**Files:**
- Create: `src-js/fontra-core/src/letterspacer-engine.js`
- Test: `src-js/fontra-core/tests/test-letterspacer-engine.js`

**Interfaces:**
- Produces: `polygonArea(points)`, `setDepth(margins, extreme, maxDepth, isLeft)`, `closePolygon(margins, extreme, minY, maxY)`, `calculateSidebearing(polygon, targetArea, amplitudeY)`, `computeTargetAreaFromSidebearing(polygonAreaValue, sidebearing, amplitudeY)`, `computeParamAreaFromTargetArea(targetArea, fontMetrics, amplitudeY, factor=1)`, `class LetterspacerEngine`.

- [ ] **Step 1: Write the failing test**

Create `src-js/fontra-core/tests/test-letterspacer-engine.js`:

```javascript
import {
  polygonArea,
  setDepth,
  closePolygon,
  calculateSidebearing,
  computeTargetAreaFromSidebearing,
  computeParamAreaFromTargetArea,
} from "@fontra/core/letterspacer-engine.js";
import { expect } from "chai";

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe("letterspacer-engine geometry", () => {
  it("polygonArea (shoelace) of a 10×10 square is 100", () => {
    expect(polygonArea(square)).to.be.closeTo(100, 1e-9);
  });

  it("setDepth clips left margins inward with min(x, extreme+maxDepth)", () => {
    const out = setDepth([{ x: 0, y: 0 }, { x: 50, y: 10 }], 0, 20, true);
    expect(out).to.deep.equal([{ x: 0, y: 0 }, { x: 20, y: 10 }]);
  });

  it("setDepth clips right margins inward with max(x, extreme-maxDepth)", () => {
    const out = setDepth([{ x: 100, y: 0 }, { x: 50, y: 10 }], 100, 20, false);
    expect(out).to.deep.equal([{ x: 100, y: 0 }, { x: 80, y: 10 }]);
  });

  it("closePolygon appends the two extreme corners", () => {
    const out = closePolygon([{ x: 0, y: 0 }, { x: 0, y: 10 }], 0, 0, 10);
    expect(out).to.deep.equal([
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ]);
  });

  it("calculateSidebearing = (targetArea - polygonArea) / amplitudeY", () => {
    expect(calculateSidebearing(square, 300, 10)).to.be.closeTo(20, 1e-9);
  });

  it("computeTargetAreaFromSidebearing is the inverse of calculateSidebearing", () => {
    const sb = calculateSidebearing(square, 300, 10); // 20
    expect(computeTargetAreaFromSidebearing(polygonArea(square), sb, 10)).to.be.closeTo(300, 1e-9);
  });

  it("computeParamAreaFromTargetArea scales by xHeight/(amp*100*upmScale*factor)", () => {
    expect(
      computeParamAreaFromTargetArea(1000, { upm: 1000, xHeight: 500 }, 500, 1)
    ).to.be.closeTo(10, 1e-9);
    expect(
      computeParamAreaFromTargetArea(1000, { upm: 1000, xHeight: 500 }, 0, 1)
    ).to.equal(0); // amplitudeY === 0 guard
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd src-js/fontra-core && npx mocha tests/test-letterspacer-engine.js --reporter spec`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `letterspacer-engine.js`**

Copy from skeleton `panel-letterspacer.js` **lines 23–74** (the six functions `polygonArea`, `setDepth`, `closePolygon`, `calculateSidebearing`, `computeTargetAreaFromSidebearing`, `computeParamAreaFromTargetArea`) and **lines 218–365** (`class LetterspacerEngine`), verbatim. Add `export` to each of the six functions and to the class, and add the import at the top:

```javascript
import { PathHitTester } from "./path-hit-tester.js";
```

(The class's `collectMargins` uses `new PathHitTester(path, bounds)` + `hitTester.lineIntersections(lineStart, lineEnd)` — both already provided by forkra's `path-hit-tester.js`. No other imports needed.)

- [ ] **Step 4: Run — verify pass**

Run: `cd src-js/fontra-core && npx mocha tests/test-letterspacer-engine.js --reporter spec`
Expected: PASS (7 passing).

- [ ] **Step 5: Commit**

```bash
git add src-js/fontra-core/src/letterspacer-engine.js src-js/fontra-core/tests/test-letterspacer-engine.js
git commit -m "feat(letterspacer): extract pure geometry engine to core (tested)"
```

---

## Task 3: Port `panel-letterspacer.js` (strip skeleton, import the engine)

Copy skeleton's `panel-letterspacer.js` into forkra, then: delete the engine math (now imported), delete the skeleton-contour-generator import + apply branch, keep the persistence helpers (`getSourceLetterspacerValues`, `setSourceLetterspacerValues`, `setFontLetterspacerEnabled`, `setGlyphLetterspacerReference`, `HT_REFERENCE_RULES`, `matchesRuleField`, `coerceNumber`, `isRecord`, `LETTERSPACER_*` constants) and all UI.

**Files:**
- Create: `src-js/views-editor/src/panel-letterspacer.js`

> Manual verification only.

- [ ] **Step 1: Copy the donor file**

```bash
cp skeleton/src-js/views-editor/src/panel-letterspacer.js src-js/views-editor/src/panel-letterspacer.js
```

- [ ] **Step 2: Strip the skeleton-contour-generator import**

Delete the import (skeleton lines 9–13):
```javascript
// DELETE:
import {
  getSkeletonData,
  moveSkeletonData,
  setSkeletonData,
} from "@fontra/core/skeleton-contour-generator.js";
```

- [ ] **Step 3: Remove the inlined engine math; import it instead**

Delete the six functions (`polygonArea` … `computeParamAreaFromTargetArea`, ≈23–74) and `class LetterspacerEngine` (≈218–365) from the file. Add an import near the top:

```javascript
import {
  polygonArea,
  setDepth,
  closePolygon,
  calculateSidebearing,
  computeTargetAreaFromSidebearing,
  computeParamAreaFromTargetArea,
  LetterspacerEngine,
} from "@fontra/core/letterspacer-engine.js";
```

(Keep the `LETTERSPACER_SOURCE_FIELDS` / `_FONT_FIELDS` / `_GLYPH_FIELDS` / `_DEFAULTS` / `HT_REFERENCE_RULES` constants and the persistence + rule helpers — they are panel concerns.) Confirm the persistence-helper imports still resolve: the file imports `setFontraInternalSection`, `getFontraInternalSection` from `@fontra/core/fontra-internal-data.js` and `FONTRA_INTERNAL_SECTIONS` from `@fontra/core/fontra-internal-schema.js` (Task 1 modules).

- [ ] **Step 4: Strip the skeleton apply branch**

In the apply flow (skeleton ≈728–734), delete the skeleton-data block, keeping the `shiftPath`:
```javascript
  if (this.params.applyLSB) {
    const deltaLSB = roundedLSB - currentLSB;
    this.shiftPath(layerGlyph.path, deltaLSB);
    // DELETE the following:
    // const layer = glyph.layers?.[layerName];
    // const skeletonData = getSkeletonData(layer);
    // if (skeletonData && deltaLSB) {
    //   const newSkeletonData = JSON.parse(JSON.stringify(skeletonData));
    //   moveSkeletonData(newSkeletonData, deltaLSB, 0);
    //   setSkeletonData(layer, newSkeletonData);
    // }
  }
```

- [ ] **Step 5: Verify no skeleton coupling remains + it parses**

```bash
git grep -n "skeleton\|Skeleton" src-js/views-editor/src/panel-letterspacer.js
node --check src-js/views-editor/src/panel-letterspacer.js
```
Expected: **no** skeleton references; clean parse. (`iconPath = "/tabler-icons/spacing-horizontal.svg"` stays — icon copied in Task 4.)

- [ ] **Step 6: Commit**

```bash
git add src-js/views-editor/src/panel-letterspacer.js
git commit -m "feat(letterspacer): port panel (engine imported, skeleton coupling stripped)"
```

---

## Task 4: Overlay layer + icon + lang + editor.js wiring

**Files:**
- Create: `src-js/views-editor/src/visualization-layer-letterspacer.js`, `src-js/fontra-core/assets/tabler-icons/spacing-horizontal.svg`
- Modify: `src-js/views-editor/src/editor.js`, `src-js/fontra-core/assets/lang/en.js`

> Manual verification only.

- [ ] **Step 1: Copy the overlay + icon (both clean, no edits)**

```bash
cp skeleton/src-js/views-editor/src/visualization-layer-letterspacer.js src-js/views-editor/src/visualization-layer-letterspacer.js
cp skeleton/src-js/fontra-core/assets/tabler-icons/spacing-horizontal.svg src-js/fontra-core/assets/tabler-icons/spacing-horizontal.svg
```
The overlay imports `registerVisualizationLayerDefinition`, `glyphSelector` from `./visualization-layer-definitions.js` (present in forkra) and reads `model.letterspacerVisualizationData`. No skeleton coupling.

- [ ] **Step 2: Side-effect import the overlay in editor.js**

In `src-js/views-editor/src/editor.js`, next to the other `import "./..."` side-effect imports (near the visualization-layer imports), add:
```javascript
import "./visualization-layer-letterspacer.js";
```

- [ ] **Step 3: Add lang keys**

In `src-js/fontra-core/assets/lang/en.js`, add (match the file's existing key style/placement):
```javascript
"sidebar.letterspacer.title": "Letterspacer",
"sidebar.letterspacer.area": "Area",
"sidebar.letterspacer.depth": "Depth",
"sidebar.letterspacer.overshoot": "Overshoot",
"sidebar.letterspacer.apply-lsb": "Apply LSB",
"sidebar.letterspacer.apply-rsb": "Apply RSB",
"sidebar.letterspacer.reference": "Reference",
```

- [ ] **Step 4: Verify**

```bash
node --check src-js/views-editor/src/visualization-layer-letterspacer.js
node --check src-js/views-editor/src/editor.js
git grep -n "sidebar.letterspacer" src-js/fontra-core/assets/lang/en.js
```
Expected: clean parses; 7 lang keys present.

- [ ] **Step 5: Commit**

```bash
git add src-js/views-editor/src/visualization-layer-letterspacer.js src-js/fontra-core/assets/tabler-icons/spacing-horizontal.svg src-js/views-editor/src/editor.js src-js/fontra-core/assets/lang/en.js
git commit -m "feat(letterspacer): overlay layer + icon + lang + editor wiring"
```

---

## Task 5: Embed `LetterspacerPanel` in the Glyph Info panel

Mirror skeleton's integration into `panel-selection-info.js` (import → instantiate → host div → insert after the sidebearings block → delegate `toggle`). This is the corrected registration — **not** a sidebar tab.

**Files:**
- Modify: `src-js/views-editor/src/panel-selection-info.js`

> Manual verification only.

- [ ] **Step 1: Import the panel**

Add near the other panel imports in `panel-selection-info.js`:
```javascript
import LetterspacerPanel from "./panel-letterspacer.js";
```

- [ ] **Step 2: Instantiate + prepare the host (constructor)**

In the `SelectionInfoPanel` constructor (after `this.sceneController = ...`), add:
```javascript
this.letterspacerPanel = new LetterspacerPanel(this.editorController);
if (this.letterspacerHost) {
  this.letterspacerHost.appendChild(this.letterspacerPanel);
}
```

- [ ] **Step 3: Create the host div in `getContentElement`**

In `getContentElement()`, where the form is created (`this.infoForm = new Form();`), add:
```javascript
this.letterspacerHost = html.div({});
this.letterspacerHost.appendChild(this.letterspacerPanel);
```
(Appending here—rather than only in the constructor—guarantees the panel is hosted regardless of construction order. `html` is already imported in this file.)

- [ ] **Step 4: Insert the host into the form after the sidebearings block**

In the form-building code (the `formContents` array — after the `'["sidebearings"]'` push at ≈232–289 and before the following section), add:
```javascript
formContents.push({ element: this.letterspacerHost });
```
(forkra's `Form` renders a field's `element` into the value cell — verified in `ui-form.js`.)

- [ ] **Step 5: Delegate visibility to the embedded panel**

Find the panel's `toggle(on, focus)` method (Panel base override) — if `panel-selection-info.js` already overrides `toggle`, delegate at its end; otherwise add an override:
```javascript
async toggle(on, focus) {
  await super.toggle?.(on, focus);
  if (this.letterspacerPanel?.toggle) {
    await this.letterspacerPanel.toggle(on, focus);
  }
}
```
> If the file already has a `toggle`/visibility hook (grep `toggle(` first), fold the `letterspacerPanel.toggle` call into it rather than adding a second override.

- [ ] **Step 6: Verify + build**

```bash
node --check src-js/views-editor/src/panel-selection-info.js
npm run bundle
```
Expected: clean parse; webpack success.

- [ ] **Step 7: Commit**

```bash
git add src-js/views-editor/src/panel-selection-info.js
git commit -m "feat(letterspacer): embed panel in Glyph Info (selection-info)"
```

---

## Task 6: Format, build, and manual verification

**Files:** all created/modified.

- [ ] **Step 1: Format**

```bash
npx prettier --write src-js/fontra-core/src/fontra-internal-schema.js src-js/fontra-core/src/fontra-internal-data.js src-js/fontra-core/src/letterspacer-engine.js src-js/fontra-core/tests/test-fontra-internal-data.js src-js/fontra-core/tests/test-letterspacer-engine.js src-js/views-editor/src/panel-letterspacer.js src-js/views-editor/src/visualization-layer-letterspacer.js src-js/views-editor/src/panel-selection-info.js src-js/views-editor/src/editor.js
```

- [ ] **Step 2: Full core suite + build**

```bash
cd src-js/fontra-core && npm test
cd ../.. && npm run bundle
```
Expected: core PASS (incl. the two new test files); webpack success.

- [ ] **Step 3: Manual verification (run server, open a glyph)**

Observe, don't assume:
- [ ] The **Letterspacer** section appears inside the **Glyph Info** panel (below sidebearings), with Area / Depth / Overshoot / Apply-LSB / Apply-RSB / Reference controls.
- [ ] With a reference glyph set, computing sidebearings updates the LSB/RSB **preview values**; the **overlay** renders margins, scan lines, and the green/blue SB polygons.
- [ ] **Apply LSB/RSB** shifts the outline / sets `xAdvance` (rounded integers), one undo step.
- [ ] **Persistence (D1):** set area/depth/overshoot + a reference glyph, **save**, reload the font → values persist (stored in `customData["fontra.internal"].letterspacer` at the right level).
- [ ] No console errors referencing `skeleton`/`getSkeletonData`.

- [ ] **Step 4: Commit any formatting**

```bash
git add -A && git commit -m "style(letterspacer): prettier pass for WS-5"
```

---

## Self-Review

**Spec coverage (master §6 WS-5 outline → tasks):**
- (1) TDD `fontra-internal-data.js` + schema (LETTERSPACER) with round-trip tests → **Task 1**.
- (2) TDD extract pure area/margin math into `letterspacer-engine.js` → **Task 2** (6 pure funcs + `LetterspacerEngine`, 7 tests).
- (3) port `panel-letterspacer.js`, strip skeleton branch → **Task 3**.
- (4) port overlay layer + icon + lang → **Task 4**.
- (5) register the panel → **Task 5** (corrected: embed in Glyph Info, not a sidebar tab).
- (6) prettier + commit per task → throughout + **Task 6**.
- (7) manual verify compute/apply/persist → **Task 6 Step 3**.

**Decision D1:** persistence via `fontra.internal` customData at font/source/glyph — Task 1 module + panel helpers (kept in Task 3). ✅

**Corrections baked in:** (a) registration is an **embed into `panel-selection-info.js`**, verified against skeleton (import@30, instantiate@93, host@138, insert-after-dimensions@785, toggle-delegate@167) — the master plan's "register in editor.js" was inaccurate; editor.js only gets the overlay side-effect import. (b) `deepCopyObject` import path `utils.js`→`utils.ts`. (c) schema drops SKELETON/SKELETON_DEFAULTS/EDITOR_VIEW.

**Placeholder scan:** none — the small/pure modules are reproduced in full with concrete-value tests; the 1662-line panel is ported by copy + exact, line-anchored strips + import repoint (reproducing it inline would be less reliable than the surgical instructions).

**Type/name consistency:** engine exports (`polygonArea`, `setDepth`, `closePolygon`, `calculateSidebearing`, `computeTargetAreaFromSidebearing`, `computeParamAreaFromTargetArea`, `LetterspacerEngine`) match the panel's Task-3 import; `FONTRA_INTERNAL_SECTIONS.LETTERSPACER` used identically in schema, data helpers, and panel persistence.

**Risk:** medium — the panel is large and only manually verifiable, and it introduces the customData persistence surface. Mitigations: the algorithm core is TDD'd in isolation (Task 2), persistence is TDD'd (Task 1), and the port is copy+strip (no rewrite). Highest-attention manual check is the **save/reload persistence round-trip** (Task 6 Step 3).

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-07-01-ws5-letterspacer.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between. Sub-skill: `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute in-session with checkpoints. Sub-skill: `superpowers:executing-plans`.
