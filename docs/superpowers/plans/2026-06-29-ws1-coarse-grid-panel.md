# WS-1 — Coarse-Grid Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Coarse Grid" accordion to the designspace-navigation sidebar panel (display toggle, spacing slider, custom base/increment preset) wired to **app-level** settings, reusing forkra's existing `coarseGridSpacing` snapping mechanics.

**Architecture:** Extract the preset/snapping math into a new **pure, unit-tested** core module `coarse-grid-presets.js` (the testable win + the "functional code lives in core" throughline). The panel becomes a thin consumer: it reads/writes **app-level** settings on `applicationSettingsController` (localStorage, per D9 — *nothing* written to project files), drives the existing **scene setting** `coarseGridSpacing` as the live conduit (which already syncs `window.coarseGridSpacing` for snapping + the `fontra.coarse.grid` layer + the F/G keyboard actions), and binds the display toggle to `visualizationLayersSettings["fontra.coarse.grid"]`.

**Tech Stack:** ES modules (`"type": "module"`), `@fontra/core/*` import alias, lit-based web components (`range-slider`), mocha + chai (core tests only), prettier 3.8.3.

## Global Constraints

Copied verbatim from `docs/refactor/IMPLEMENTATION_PLAN.md` §3 — every task implicitly includes these.

- **Branching model:** Work in the **`refactor-simple/`** branch group, cut from `experimental/up-to-date`. This workstream's branch: `refactor-simple/ws1-coarse-grid-panel`. Frequent commits; **never push unless the user asks.**
- **Donor location:** the skeleton donor is **nested at `./skeleton/`** inside this repo (full repo, own `.git`) — **read-only**, never modify. Donor line numbers below were re-verified on 2026-06-29 against the current `./skeleton/` tree; re-verify if it drifts.
- **Decision D9 (binding):** Coarse-grid panel settings are **app-level/global** via `applicationSettingsController` (localStorage) — **NOT** per-font, **nothing written to project files.** This is the one place this plan diverges from the skeleton donor, which persists to `fontra.internal` customData via `performEdit`. **Drop all skeleton customData persistence** (`_getFontCoarseGridSettingsFromEntity`, `_persistCoarseGridSettings` via `performEdit`, `getFontraInternalSection`/`setFontraInternalSection`, the `readOnly` guard).
- **Leave intact:** the `f`/`g` actions + `coarseGridSpacing` default in `scene-controller.js`, the snapping in `edit-behavior.js`, and the `fontra.coarse.grid` layer in `visualization-layer-definitions.js`. WS-1 adds UI only — it does **not** change the F/G ±5 / 5–40 behavior.
- **Language:** ES modules. Import alias `@fontra/core/...` → `src-js/fontra-core/src/...`, `@fontra/web-components/...` → `src-js/fontra-webcomponents/src/...`.
- **Formatting:** `npx prettier --write <files>` before every commit.
- **Line endings:** working tree is CRLF on Windows; use `git diff`/`git show` (not raw `diff`).

## Verified facts (donor + target, 2026-06-29)

- Forkra `application-settings.js`: `applicationSettingsController = new ObservableController({...})` synced to localStorage via `synchronizeWithLocalStorage("fontra-application-settings-")`. Adding keys to the constructor object is the D9 storage surface.
- Forkra `coarseGridSpacing` is a **scene** setting (default 10, set in `scene-controller.js:110`), key-listened and mirrored to `window.coarseGridSpacing` (`scene-controller.js:648–654`); F/G actions step ±5 within 5–40 (`scene-controller.js:745–758`).
- Forkra `panel-designspace-navigation.js`: `class DesignspaceNavigationPanel extends Panel`; constructor stores `this.editorController`, `this.sceneSettingsController`, `this.sceneSettings`; accordion items array built in `getContentElement()` (line ~145); **`setup()` method at line ~329** (the lifecycle hook — add setup calls here); already imports `applicationSettingsController` (line 2), `* as html` (line 9), `translate` (line 11), and `objectsEqual`, `range` from `utils.ts` (lines 26–27).
- Forkra `editorController.visualizationLayersSettings` exists (`editor.js:150`) — an ObservableController keyed by layer identifier; `model["fontra.coarse.grid"]` is the bool visibility for that layer.
- Forkra `range-slider` (`fontra-webcomponents/src/range-slider.js`) supports discrete mode: set `.values` (array) and `.value`; it snaps internally via `getClosestDiscreteValue` and fires `onChangeCallback({ value })` with the **already-snapped** value. **Divergence from skeleton:** forkra's callback payload is only `{ value }` (no `dragEnd`/`isDragging`) — so persist on every change (cheap; localStorage, no font edit).
- Skeleton donor constants (`./skeleton/.../panel-designspace-navigation.js:88–95`): `BASE=5, INCREMENT=5, STEP_COUNT=8, SPACING=10`, default values `[5,10,15,20,25,30,35,40]` — **identical to forkra's F/G 5–40 step-5 domain**, so the default preset and the keyboard actions already agree.
- Core tests import via `@fontra/core/...` alias + `import { expect } from "chai"` (e.g. `tests/test-fit-cubic.js`). Run from `src-js/fontra-core`. No fork tests exist yet — this is the first.

---

## File Structure

```
src-js/fontra-core/src/
  coarse-grid-presets.js          [CREATE] pure preset/snapping math + constants (testable)

src-js/fontra-core/tests/
  test-coarse-grid-presets.js     [CREATE] mocha unit tests for the above

src-js/fontra-core/src/
  application-settings.js         [MODIFY] add 4 app-level coarse-grid keys (D9)

src-js/views-editor/src/
  panel-designspace-navigation.js [MODIFY] accordion markup + getters + wiring + setup() calls

src-js/fontra-core/assets/lang/
  en.js                           [MODIFY] add sidebar.designspace-navigation.coarse-grid.* keys
```

---

## Task 1: Core preset/snapping math (`coarse-grid-presets.js`)

**Files:**
- Create: `src-js/fontra-core/src/coarse-grid-presets.js`
- Test: `src-js/fontra-core/tests/test-coarse-grid-presets.js`

**Interfaces:**
- Produces (consumed by Task 4):
  - `COARSE_GRID_DEFAULT_BASE: number` (5), `COARSE_GRID_DEFAULT_INCREMENT: number` (5), `COARSE_GRID_DEFAULT_STEP_COUNT: number` (8), `COARSE_GRID_DEFAULT_SPACING: number` (10), `COARSE_GRID_DEFAULT_VALUES: number[]` (`[5,10,15,20,25,30,35,40]`)
  - `normalizeCoarseGridBase(value): number` — finite→`max(1, round(value))`, else default base
  - `normalizeCoarseGridIncrement(value): number` — finite→`max(1, round(value))`, else default increment
  - `buildCoarseGridValues({custom, base, increment}): number[]` — non-custom → default values; custom → `STEP_COUNT` values `normBase + i*normIncrement`
  - `snapCoarseGridSpacing(value, values): number` — nearest entry in `values`; empty→`DEFAULT_SPACING`; non-finite value→`values[min(1, len-1)]`

- [ ] **Step 1: Write the failing test**

Create `src-js/fontra-core/tests/test-coarse-grid-presets.js`:

```javascript
import { expect } from "chai";
import {
  COARSE_GRID_DEFAULT_VALUES,
  COARSE_GRID_DEFAULT_SPACING,
  normalizeCoarseGridBase,
  normalizeCoarseGridIncrement,
  buildCoarseGridValues,
  snapCoarseGridSpacing,
} from "@fontra/core/coarse-grid-presets.js";

describe("coarse-grid-presets", () => {
  it("default values are 5..40 step 5", () => {
    expect(COARSE_GRID_DEFAULT_VALUES).deep.equals([5, 10, 15, 20, 25, 30, 35, 40]);
  });

  it("normalizeCoarseGridBase clamps and rounds", () => {
    expect(normalizeCoarseGridBase(0)).equals(1);
    expect(normalizeCoarseGridBase(3.6)).equals(4);
    expect(normalizeCoarseGridBase(NaN)).equals(5);
    expect(normalizeCoarseGridBase("nope")).equals(5);
  });

  it("normalizeCoarseGridIncrement clamps and rounds", () => {
    expect(normalizeCoarseGridIncrement(0)).equals(1);
    expect(normalizeCoarseGridIncrement(2.4)).equals(2);
    expect(normalizeCoarseGridIncrement(undefined)).equals(5);
  });

  it("buildCoarseGridValues non-custom returns the defaults", () => {
    expect(buildCoarseGridValues({ custom: false, base: 99, increment: 99 })).deep.equals([
      5, 10, 15, 20, 25, 30, 35, 40,
    ]);
  });

  it("buildCoarseGridValues custom builds STEP_COUNT entries from base+increment", () => {
    expect(buildCoarseGridValues({ custom: true, base: 10, increment: 20 })).deep.equals([
      10, 30, 50, 70, 90, 110, 130, 150,
    ]);
  });

  it("buildCoarseGridValues custom normalizes bad base/increment", () => {
    expect(buildCoarseGridValues({ custom: true, base: 0, increment: 0 })).deep.equals([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it("snapCoarseGridSpacing snaps to nearest value", () => {
    const values = [5, 10, 15, 20];
    expect(snapCoarseGridSpacing(12, values)).equals(10);
    expect(snapCoarseGridSpacing(13, values)).equals(15);
    expect(snapCoarseGridSpacing(100, values)).equals(20);
  });

  it("snapCoarseGridSpacing handles empty and non-finite", () => {
    expect(snapCoarseGridSpacing(12, [])).equals(COARSE_GRID_DEFAULT_SPACING);
    expect(snapCoarseGridSpacing(NaN, [5, 10, 15])).equals(10);
    expect(snapCoarseGridSpacing(NaN, [5])).equals(5);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd src-js/fontra-core && npx mocha tests/test-coarse-grid-presets.js --reporter spec`
Expected: FAIL — cannot resolve `@fontra/core/coarse-grid-presets.js` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src-js/fontra-core/src/coarse-grid-presets.js`:

```javascript
// Pure preset/snapping math for the coarse snapping grid.
// No DOM, no settings, no rendering — unit-tested in tests/test-coarse-grid-presets.js.

export const COARSE_GRID_DEFAULT_BASE = 5;
export const COARSE_GRID_DEFAULT_INCREMENT = 5;
export const COARSE_GRID_DEFAULT_STEP_COUNT = 8;
export const COARSE_GRID_DEFAULT_SPACING = 10;

export function normalizeCoarseGridBase(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return COARSE_GRID_DEFAULT_BASE;
  }
  return Math.max(1, Math.round(n));
}

export function normalizeCoarseGridIncrement(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return COARSE_GRID_DEFAULT_INCREMENT;
  }
  return Math.max(1, Math.round(n));
}

export function buildCoarseGridValues(settings) {
  const base = settings && settings.custom
    ? normalizeCoarseGridBase(settings.base)
    : COARSE_GRID_DEFAULT_BASE;
  const increment = settings && settings.custom
    ? normalizeCoarseGridIncrement(settings.increment)
    : COARSE_GRID_DEFAULT_INCREMENT;
  const values = [];
  for (let i = 0; i < COARSE_GRID_DEFAULT_STEP_COUNT; i++) {
    values.push(base + i * increment);
  }
  return values;
}

export function snapCoarseGridSpacing(value, values) {
  if (!values || !values.length) {
    return COARSE_GRID_DEFAULT_SPACING;
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return values[Math.min(1, values.length - 1)];
  }
  let closest = values[0];
  let closestDistance = Math.abs(numericValue - closest);
  for (const candidate of values) {
    const distance = Math.abs(numericValue - candidate);
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

export const COARSE_GRID_DEFAULT_VALUES = buildCoarseGridValues({ custom: false });
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd src-js/fontra-core && npx mocha tests/test-coarse-grid-presets.js --reporter spec`
Expected: PASS — 8 passing.

- [ ] **Step 5: Run the full core suite (no regressions)**

Run: `cd src-js/fontra-core && npm test`
Expected: full suite passes, including the new file.

- [ ] **Step 6: Prettier + commit**

```bash
npx prettier --write src-js/fontra-core/src/coarse-grid-presets.js src-js/fontra-core/tests/test-coarse-grid-presets.js
git add src-js/fontra-core/src/coarse-grid-presets.js src-js/fontra-core/tests/test-coarse-grid-presets.js
git commit -m "feat(coarse-grid): add pure preset/snapping math module with tests"
```

---

## Task 2: App-level settings keys (D9)

**Files:**
- Modify: `src-js/fontra-core/src/application-settings.js`

**Interfaces:**
- Produces (consumed by Task 4): four keys on `applicationSettingsController.model` —
  `coarseGridCustom: boolean` (false), `coarseGridBase: number` (5), `coarseGridIncrement: number` (5), `coarseGridDefaultSpacing: number` (10).
  (Note: the **live** spacing stays in the existing scene setting `coarseGridSpacing`; `coarseGridDefaultSpacing` is the persisted/restored app-level value. Distinct names on purpose — different controllers.)

- [ ] **Step 1: Add the keys**

In `src-js/fontra-core/src/application-settings.js`, extend the controller object:

```javascript
export const applicationSettingsController = new ObservableController({
  clipboardFormat: "glif",
  rectSelectLiveModifierKeys: false,
  glyphSourcesSortOptions: "by-axis-value",
  alwaysShowGlobalAxesInComponentLocation: false,
  sortComponentLocationGlyphAxes: true,
  disableAdHocMarks: false,
  shapingDebuggerShowIneffectiveItems: false,
  // fork: coarse-grid panel settings (app-level, per D9 — not written to project files)
  coarseGridCustom: false,
  coarseGridBase: 5,
  coarseGridIncrement: 5,
  coarseGridDefaultSpacing: 10,
});
```

(Leave the `synchronizeWithLocalStorage("fontra-application-settings-")` call unchanged — it now persists the new keys automatically.)

- [ ] **Step 2: Verify the module still imports cleanly via the build**

Run: `npm run bundle`
Expected: webpack build completes with no errors referencing `application-settings.js`.
(Reason: `application-settings.js` calls `synchronizeWithLocalStorage` at module load, which touches `localStorage` — not available under node/mocha — so it is **not** unit-tested directly; the build is the verification.)

- [ ] **Step 3: Prettier + commit**

```bash
npx prettier --write src-js/fontra-core/src/application-settings.js
git add src-js/fontra-core/src/application-settings.js
git commit -m "feat(coarse-grid): add app-level coarse-grid settings keys (D9)"
```

---

## Task 3: Accordion markup, getters & lang keys

This task makes the panel **render** the controls (no behavior yet). Deliverable a reviewer can gate: open the panel and see a "Coarse Grid" accordion with the right controls.

**Files:**
- Modify: `src-js/views-editor/src/panel-designspace-navigation.js`
- Modify: `src-js/fontra-core/assets/lang/en.js`

**Donor:** `./skeleton/src-js/views-editor/src/panel-designspace-navigation.js` accordion markup lines 352–439, getters 485–506.

- [ ] **Step 1: Add lang keys**

In `src-js/fontra-core/assets/lang/en.js`, immediately after the line `"sidebar.designspace-navigation": "Designspace Navigation",` (≈line 292), insert:

```javascript
  "sidebar.designspace-navigation.coarse-grid": "Coarse Grid",
  "sidebar.designspace-navigation.coarse-grid.base": "Base",
  "sidebar.designspace-navigation.coarse-grid.custom": "Custom",
  "sidebar.designspace-navigation.coarse-grid.display": "Display",
  "sidebar.designspace-navigation.coarse-grid.increment": "Increment",
  "sidebar.designspace-navigation.coarse-grid.spacing": "Spacing",
```

(Only `en.js` is required — `translate()` falls back to English for locales missing a key. Other `lang/*.js` files are optional and out of scope for WS-1.)

- [ ] **Step 2: Add the accordion item**

In `getContentElement()` (the `this.accordion.items = [ ... ]` array, ≈line 145), add a new item to the end of the array (after the existing `glyph-layers-accordion-item`). Adapted from the donor, using `translate()` for labels:

```javascript
      {
        id: "coarse-grid-accordion-item",
        label: translate("sidebar.designspace-navigation.coarse-grid"),
        open: false,
        content: html.div(
          {
            style: `
              display: grid;
              grid-template-columns: auto 1fr;
              gap: 0.5em;
              align-items: center;
            `,
          },
          [
            html.label(
              { for: "coarse-grid-display-toggle", style: "white-space: nowrap;" },
              [translate("sidebar.designspace-navigation.coarse-grid.display")]
            ),
            html.input({ id: "coarse-grid-display-toggle", type: "checkbox" }),
            html.label(
              { for: "coarse-grid-spacing-input", style: "white-space: nowrap;" },
              [translate("sidebar.designspace-navigation.coarse-grid.spacing")]
            ),
            html.createDomElement("range-slider", {
              id: "coarse-grid-spacing-input",
              type: "range",
            }),
            html.label(
              { for: "coarse-grid-custom-toggle", style: "white-space: nowrap;" },
              [translate("sidebar.designspace-navigation.coarse-grid.custom")]
            ),
            html.input({ id: "coarse-grid-custom-toggle", type: "checkbox" }),
            html.div(),
            html.div(
              {
                id: "coarse-grid-custom-fields",
                style: `
                  display: none;
                  grid-template-columns: auto 1fr;
                  gap: 0.5em;
                  align-items: center;
                `,
              },
              [
                html.label(
                  { for: "coarse-grid-base-input", style: "white-space: nowrap;" },
                  [translate("sidebar.designspace-navigation.coarse-grid.base")]
                ),
                html.input({ id: "coarse-grid-base-input", type: "number", min: 1, step: 1 }),
                html.label(
                  { for: "coarse-grid-increment-input", style: "white-space: nowrap;" },
                  [translate("sidebar.designspace-navigation.coarse-grid.increment")]
                ),
                html.input({
                  id: "coarse-grid-increment-input",
                  type: "number",
                  min: 1,
                  step: 1,
                }),
              ]
            ),
          ]
        ),
      },
```

- [ ] **Step 3: Add the element getters**

Add these getters to the class (next to the existing accordion-item getters, ≈lines 301–326):

```javascript
  get coarseGridSpacingInput() {
    return this.accordion.querySelector("#coarse-grid-spacing-input");
  }

  get coarseGridCustomToggle() {
    return this.accordion.querySelector("#coarse-grid-custom-toggle");
  }

  get coarseGridDisplayToggle() {
    return this.accordion.querySelector("#coarse-grid-display-toggle");
  }

  get coarseGridCustomFields() {
    return this.accordion.querySelector("#coarse-grid-custom-fields");
  }

  get coarseGridBaseInput() {
    return this.accordion.querySelector("#coarse-grid-base-input");
  }

  get coarseGridIncrementInput() {
    return this.accordion.querySelector("#coarse-grid-increment-input");
  }
```

- [ ] **Step 4: Build + manual render check**

Run: `npm run bundle`
Expected: build succeeds.
Then run the Fontra server (venv at `./venv`, Python 3.11) and open a glyph in the editor. In the left "Designspace Navigation" sidebar, confirm a **"Coarse Grid"** accordion appears with: a Display checkbox, a Spacing slider, a Custom checkbox, and (Custom off ⇒) hidden Base/Increment fields. No behavior yet — controls need not do anything.

- [ ] **Step 5: Prettier + commit**

```bash
npx prettier --write src-js/views-editor/src/panel-designspace-navigation.js src-js/fontra-core/assets/lang/en.js
git add src-js/views-editor/src/panel-designspace-navigation.js src-js/fontra-core/assets/lang/en.js
git commit -m "feat(coarse-grid): add Coarse Grid accordion markup, getters, lang keys"
```

---

## Task 4: Wire the controls (app settings ↔ scene ↔ layer)

Makes the controls functional. Deliverable a reviewer can gate: changing the controls actually changes the grid and persists across reload.

**Files:**
- Modify: `src-js/views-editor/src/panel-designspace-navigation.js`

**Donor (adapt — drop customData persistence per D9):** `./skeleton/...:_syncCoarseGridControls` 633–675, `_setupCoarseGridControls` 726–790, `_setupCoarseGridDisplayToggle` 1258–1271, `_updateCoarseGridCustomFieldsVisibility` 625–631.

**Interfaces:**
- Consumes from Task 1: `buildCoarseGridValues`, `snapCoarseGridSpacing`, `normalizeCoarseGridBase`, `normalizeCoarseGridIncrement`, `COARSE_GRID_DEFAULT_SPACING`.
- Consumes from Task 2: `applicationSettingsController.model.{coarseGridCustom,coarseGridBase,coarseGridIncrement,coarseGridDefaultSpacing}`.

- [ ] **Step 1: Import the core helpers**

At the top of `panel-designspace-navigation.js`, add an import (alongside the existing `@fontra/core/*` imports):

```javascript
import {
  COARSE_GRID_DEFAULT_SPACING,
  buildCoarseGridValues,
  normalizeCoarseGridBase,
  normalizeCoarseGridIncrement,
  snapCoarseGridSpacing,
} from "@fontra/core/coarse-grid-presets.js";
```

(`applicationSettingsController` is already imported at line 2; `range` is already imported from `utils.ts`.)

- [ ] **Step 2: Add the read/apply helper methods**

Add these methods to the class. They read app settings into in-memory `_coarseGridSettings`, push state to the controls + the live scene setting, and persist back to app settings (localStorage — D9, **no** `performEdit`, **no** customData):

```javascript
  _readCoarseGridSettingsFromApp() {
    const model = applicationSettingsController.model;
    const custom = !!model.coarseGridCustom;
    const base = normalizeCoarseGridBase(model.coarseGridBase);
    const increment = normalizeCoarseGridIncrement(model.coarseGridIncrement);
    const values = buildCoarseGridValues({ custom, base, increment });
    const spacing = snapCoarseGridSpacing(model.coarseGridDefaultSpacing, values);
    return { custom, base, increment, spacing };
  }

  _persistCoarseGridSettings() {
    const s = this._coarseGridSettings;
    const model = applicationSettingsController.model;
    model.coarseGridCustom = !!s.custom;
    model.coarseGridBase = normalizeCoarseGridBase(s.base);
    model.coarseGridIncrement = normalizeCoarseGridIncrement(s.increment);
    model.coarseGridDefaultSpacing = s.spacing;
  }

  _updateCoarseGridCustomFieldsVisibility() {
    const fields = this.coarseGridCustomFields;
    if (fields) {
      fields.style.display = this._coarseGridSettings.custom ? "grid" : "none";
    }
  }

  _syncCoarseGridControls() {
    const settings = this._coarseGridSettings;
    const values = buildCoarseGridValues(settings);
    const spacing = snapCoarseGridSpacing(settings.spacing, values);

    this._isApplyingCoarseGridSettings = true;
    try {
      const spacingInput = this.coarseGridSpacingInput;
      if (spacingInput) {
        spacingInput.values = values;
        spacingInput.minValue = values[0];
        spacingInput.maxValue = values[values.length - 1];
        spacingInput.defaultValue = values[Math.min(1, values.length - 1)];
        spacingInput.value = spacing;
      }
      if (this.coarseGridCustomToggle) {
        this.coarseGridCustomToggle.checked = settings.custom;
      }
      if (this.coarseGridBaseInput) {
        this.coarseGridBaseInput.value = String(settings.base);
      }
      if (this.coarseGridIncrementInput) {
        this.coarseGridIncrementInput.value = String(settings.increment);
      }
      this._updateCoarseGridCustomFieldsVisibility();
      window.coarseGridValues = values;
      this.sceneSettingsController.setItem("coarseGridSpacing", spacing, { senderID: this });
      this._coarseGridSettings = { ...settings, spacing };
    } finally {
      this._isApplyingCoarseGridSettings = false;
    }
  }
```

- [ ] **Step 3: Add the setup + listener method**

```javascript
  _setupCoarseGridControls() {
    this._coarseGridSettings = this._readCoarseGridSettingsFromApp();
    this._syncCoarseGridControls();
    this._persistCoarseGridSettings();

    const spacingInput = this.coarseGridSpacingInput;
    if (spacingInput) {
      spacingInput.onChangeCallback = (event) => {
        // range-slider (discrete mode) already snaps; event.value is the chosen grid value
        this._coarseGridSettings = { ...this._coarseGridSettings, spacing: event.value };
        this.sceneSettingsController.setItem("coarseGridSpacing", event.value, {
          senderID: this,
        });
        this._persistCoarseGridSettings();
      };
    }

    const customToggle = this.coarseGridCustomToggle;
    if (customToggle) {
      customToggle.addEventListener("change", (event) => {
        const custom = !!event.target.checked;
        const values = buildCoarseGridValues({ ...this._coarseGridSettings, custom });
        const spacing = snapCoarseGridSpacing(this.sceneSettings.coarseGridSpacing, values);
        this._coarseGridSettings = { ...this._coarseGridSettings, custom, spacing };
        this._syncCoarseGridControls();
        this._persistCoarseGridSettings();
      });
    }

    const onPresetInput = () => {
      const base = normalizeCoarseGridBase(Number(this.coarseGridBaseInput?.value));
      const increment = normalizeCoarseGridIncrement(
        Number(this.coarseGridIncrementInput?.value)
      );
      const values = buildCoarseGridValues({ ...this._coarseGridSettings, base, increment });
      const spacing = snapCoarseGridSpacing(this.sceneSettings.coarseGridSpacing, values);
      this._coarseGridSettings = { ...this._coarseGridSettings, base, increment, spacing };
      this._syncCoarseGridControls();
      this._persistCoarseGridSettings();
    };
    if (this.coarseGridBaseInput) {
      this.coarseGridBaseInput.addEventListener("change", onPresetInput);
    }
    if (this.coarseGridIncrementInput) {
      this.coarseGridIncrementInput.addEventListener("change", onPresetInput);
    }

    // Keep the slider in sync when F/G keyboard actions change the scene setting.
    this.sceneSettingsController.addKeyListener("coarseGridSpacing", (event) => {
      if (this._isApplyingCoarseGridSettings || event.senderInfo?.senderID === this) {
        return;
      }
      const values = buildCoarseGridValues(this._coarseGridSettings);
      const spacing = snapCoarseGridSpacing(event.newValue, values);
      this._coarseGridSettings = { ...this._coarseGridSettings, spacing };
      if (this.coarseGridSpacingInput) {
        this.coarseGridSpacingInput.value = spacing;
      }
      this._persistCoarseGridSettings();
    });
  }

  _setupCoarseGridDisplayToggle() {
    const toggle = this.coarseGridDisplayToggle;
    if (!toggle) {
      return;
    }
    const visualizationSettings = this.editorController.visualizationLayersSettings;
    toggle.checked = !!visualizationSettings.model["fontra.coarse.grid"];
    toggle.addEventListener("change", () => {
      visualizationSettings.model["fontra.coarse.grid"] = !!toggle.checked;
    });
    visualizationSettings.addKeyListener("fontra.coarse.grid", (event) => {
      toggle.checked = !!event.newValue;
    });
  }
```

- [ ] **Step 4: Call the setup from `setup()`**

In the existing `setup()` method (≈line 329), add at the end of the method body:

```javascript
    this._setupCoarseGridControls();
    this._setupCoarseGridDisplayToggle();
```

- [ ] **Step 5: Build**

Run: `npm run bundle`
Expected: build succeeds, no errors.

- [ ] **Step 6: Manual end-to-end verification**

Run the Fontra server and open a glyph. Verify:
1. **Spacing slider:** dragging it snaps to 5/10/.../40 and the on-canvas coarse grid (enable the "Coarse Grid" layer) changes density to match; dragging a point snaps to the chosen spacing.
2. **Display toggle:** toggling it shows/hides the `fontra.coarse.grid` layer, and the layers list checkbox for "Coarse Grid" stays in sync (toggle from either side).
3. **Custom + Base/Increment:** turning Custom on reveals Base/Increment; e.g. Base=8, Increment=8 makes the slider snap to 8,16,…,64 and the grid follows.
4. **F/G keys still work** (unchanged): press F/G — spacing steps ±5 within 5–40 and the slider thumb follows.
5. **Persistence (D9):** reload the page — the spacing, custom flag, base, and increment are restored from localStorage. Open a **different font** — the same app-level values apply (not per-font). Confirm nothing coarse-grid-related was written to the font (check the saved file / no "edit coarse grid" undo entry appears).

- [ ] **Step 7: Prettier + commit**

```bash
npx prettier --write src-js/views-editor/src/panel-designspace-navigation.js
git add src-js/views-editor/src/panel-designspace-navigation.js
git commit -m "feat(coarse-grid): wire panel to app settings, scene spacing, and layer toggle"
```

---

## Self-Review

**Spec coverage (against IMPLEMENTATION_PLAN WS-1 outline):**
- (1) app-level keys + lang keys → Task 2 (keys) + Task 3 Step 1 (lang). ✅
- (2) port accordion markup → Task 3. ✅
- (3) wire inputs ↔ app settings ↔ `coarseGridSpacing` scene setting + `fontra.coarse.grid` layer toggle → Task 4. ✅
- (4) prettier + commit → every task. ✅
- (5) manual verify (build, change spacing, F/G still works) → Task 4 Step 6. ✅
- D9 (app-level, no project-file writes) → enforced: Task 2 storage + Task 4 `_persistCoarseGridSettings` writes only to `applicationSettingsController`; donor customData/`performEdit` path explicitly dropped. ✅
- "Leave F/G + snapping + layer intact" → no edits to `scene-controller.js`, `edit-behavior.js`, or the layer; verified in Task 4 Step 6.4. ✅
- §4 testing split: pure math (Task 1) = mocha TDD; panel (Tasks 3–4) = manual. The extracted `coarse-grid-presets.js` is the WS-1 "establish the pattern" testable win. ✅

**Placeholder scan:** none — every code step contains full code; every run step has an exact command + expected result.

**Type/name consistency:** the `_coarseGridSettings` shape `{custom, base, increment, spacing}` is used identically across `_readCoarseGridSettingsFromApp`, `_syncCoarseGridControls`, `_persistCoarseGridSettings`, and all listeners. App keys `coarseGridCustom/Base/Increment/DefaultSpacing` match between Task 2 (definition) and Task 4 (use). Helper names match Task 1's exports.

**Carried-forward note for WS-3:** Task 2 establishes the app-level-settings pattern and Task 3/4 establish the accordion + `visualizationLayersSettings` display-toggle pattern — WS-3 (SpeedPunk) reuses both.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-29-ws1-coarse-grid-panel.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Requires `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute tasks in this session with checkpoints. Requires `superpowers:executing-plans`.
