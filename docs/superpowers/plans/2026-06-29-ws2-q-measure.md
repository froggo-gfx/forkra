# WS-2 — Q-Measure Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port skeleton's realtime hold-**Q** measurement (and **Alt+Q** "direct" variant) into forkra — a measure-overlay that, while Q is held, shows distance/projected-dx-dy/angle/tension for the segment, control-handle, or two selected points under the cursor — **without** any skeleton/rib coupling.

**Architecture:** The pure measurement math lands in `fontra-core/distance-angle.js` (unit-tested). Per **D11**, all interaction (key lifecycle + hover hit-testing) lives in a **new `views-editor/src/measure-interactions.js`** module (keeps the pointer lean — the pattern WS-4 will mirror for `tunni-interactions.js`); the pointer only instantiates it and adds three thin dispatch hooks. Measure-hover state lives on `scene-model.js`; a render-only `fontra.measure.overlay` layer draws it. Per **D10**, the realtime **X-equalize** action and all rib hotkeys are **not** ported.

**Tech Stack:** ES modules, `@fontra/core/*` / `@fontra/web-components/*` aliases, mocha + chai (core tests only), prettier 3.8.3.

## Global Constraints

Copied from `docs/refactor/IMPLEMENTATION_PLAN.md` §3 — every task implicitly includes these.

- **Branch:** this workstream is on **`refactor-simple/ws2-q-measure`**, stacked on `refactor-simple/ws1-coarse-grid-panel` (so the planning docs, `skeleton/` donor, and `.gitignore` carry over). Frequent commits; **never push unless the user asks.**
- **Donor location:** the skeleton donor is **nested at `./skeleton/`** (read-only, own `.git`, gitignored). Donor line numbers below were re-verified on 2026-06-29; re-verify if it drifts.
- **D10 (binding):** Port **measure-only**. Do **NOT** port `action.realtime.equalize` (X), `rib-tangent` (Z), `fixed-rib` (D), `fixed-rib-compress` (S), or any `*RibMode`/`measureHoverRibPoint` code.
- **D11 (binding):** Q-measure interaction goes in a **new `measure-interactions.js`**, not inline in the pointer.
- **Strip all skeleton coupling:** drop `getSkeletonDataFromGlyph`, `buildSegmentsFromSkeletonPoints`, `_findRibPointForMeasure`, `_buildSkeletonTensionContext`, `skeletonPoint`/`skeletonRibPoint` selection branches, `measureHoverRibPoint` state, and the overlay's rib branch. On regular glyphs these are no-ops anyway — delete, don't keep.
- **Testing split (§4):** core math in `fontra-core` → real mocha TDD. `views-editor` (module, scene-model, overlay, editor, pointer) → **manual verification** (build, run server, hold Q, observe). No test harness exists there; do not invent one.
- **Formatting:** `npx prettier --write <files>` before every commit. Working tree is CRLF; use `git diff`/`git show`.

## Verified facts (donor + forkra, 2026-06-29)

**Forkra has NONE of the measure code** — every piece below is a clean add:
- `distance-angle.js`: `calculateHandleMeasure`/`calculateProjectedDistanceComponents` **absent**; but their deps `calculateDistanceAndAngle` (line 73) and `calculateTension` (line 162) **are present** — so the port is self-contained.
- `scene-model.js`: no measure state.
- `editor.js`: action registration uses `registerActionInfo(id, {topic, titleKey, defaultShortCuts})` with topics like `"0020-action-topics.menu.view"`; **no** `realtime-hotkeys` topic.
- `edit-tools-pointer.js`: clean hook sites — `handleHover(event)` @74, `async handleDrag(eventStream, initialEvent)` @220, `handleKeyDown(event)` @973 (currently only handles Tab). Already imports `centeredRect` (10), `parseSelection` (29), `* as vector` (34). Does **not** import `eventMatchesActionShortCut`/`eventMatchesActionBaseKey` — `measure-interactions.js` will (donor imports them; re-verify the exact module path at the top of `./skeleton/.../edit-tools-pointer.js`, it is `@fontra/core/actions.js`).
- `visualization-layer-definitions.js`: layers register via `registerVisualizationLayerDefinition({...})`; zIndex values 0–700 in use; no measure layer.
- `lang/en.js`: flat alphabetically-sorted keys, e.g. `"action-topics.menu.view": "View"`, plus `shortcuts.*` keys.

**Donor key locations (`./skeleton/src-js/...`):**
- `views-editor/editor.js`: realtime topic + measure actions **752–768** (equalize **769–776** and rib **777–800** → skip).
- `views-editor/edit-tools-pointer.js`: measure constants **78–79** (80–83 skip); `handleKeyDown` measure activation **785–814**; key lifecycle `_handleMeasureKeyUp/_handleMeasureAltKeyDown/_handleMeasureAltKeyUp/_handleMeasureWindowBlur/_endMeasureMode` **848–904**; `handleHover` measure block **981–1006**; `resolveMeasureHoverTarget` **115–142**; finders `_measurePointsEqual` **2939–2959**, `_findControlPointForMeasure` **2969–3087** (skeleton branch 2983–3022 → strip), `_buildPathTensionContext` **3088–3117**, `_getMeasurePointsFromSelection` **3162–3231** (skeleton/rib branches 3176–3208 → strip, keep path branch 3210–3219), `_findSegmentForMeasure` **3278–~3538**, `_measureHoverTargetsEqual` **3539–~3590**.
- `views-editor/scene-model.js`: measure state **79–83** (drop `measureHoverRibPoint`), `setMeasureActive`/`setMeasureShowDirect`/`setMeasureHoverTarget`/`getMeasureHoverTarget`/`resetMeasureState` **161–216** (drop rib cases), reset block **155–158**.
- `views-editor/visualization-layer-definitions.js`: `fontra.measure.overlay` registration **2276–2387** (strip rib branch 2311–2320); draw helpers `drawMeasureLine`/`drawMeasureLabel`/`drawMeasureGuideLine` follow it (**~2389–~2480**).
- `fontra-core/distance-angle.js`: `calculateProjectedDistanceComponents` **112–117**, `calculateHandleMeasure` **975–1001**.

---

## File Structure

```
src-js/fontra-core/src/
  distance-angle.js               [MODIFY] add calculateProjectedDistanceComponents + calculateHandleMeasure

src-js/fontra-core/tests/
  test-distance-angle.js          [CREATE] mocha tests for the two helpers

src-js/views-editor/src/
  scene-model.js                  [MODIFY] add measure-hover state + setters/getter/reset (no rib)
  measure-interactions.js         [CREATE] D11: key lifecycle + hover hit-testing (no rib/skeleton)
  editor.js                       [MODIFY] register realtime-hotkeys topic + measure/measure-direct actions
  edit-tools-pointer.js           [MODIFY] instantiate MeasureInteraction + 3 thin dispatch hooks
  visualization-layer-definitions.js [MODIFY] add render-only fontra.measure.overlay layer (no rib)

src-js/fontra-core/assets/lang/
  en.js                           [MODIFY] action-topics.realtime-hotkeys + shortcuts.realtime.measure(-direct)
```

**Dependency order:** Task 1 (math) → Task 2 (state) → Task 3 (module, consumes 1+2) → Task 4 (actions, consumed by 3's key-matching) → Task 5 (pointer wires 3) → Task 6 (overlay consumes 1+2). Tasks 4 can land before/after 3 but its action ids must exist before manual testing.

---

## Task 1: Measure math in `distance-angle.js` (TDD)

**Files:**
- Modify: `src-js/fontra-core/src/distance-angle.js`
- Test: `src-js/fontra-core/tests/test-distance-angle.js`

**Interfaces:**
- Produces (consumed by Task 3 + Task 6):
  - `calculateProjectedDistanceComponents(point1, point2) → { dx, dy }` — absolute axis deltas.
  - `calculateHandleMeasure(segmentPoints, hoveredHandleSide) → { distance, angle, tension } | null` — `segmentPoints` = `[onStart, offStart, offEnd, onEnd]`; `hoveredHandleSide` ∈ `"start"|"end"`; `tension` is `null` when non-finite. Returns `null` for malformed input.

- [ ] **Step 1: Write the failing test**

Create `src-js/fontra-core/tests/test-distance-angle.js`:

```javascript
import { expect } from "chai";
import {
  calculateProjectedDistanceComponents,
  calculateHandleMeasure,
} from "@fontra/core/distance-angle.js";

describe("distance-angle measure helpers", () => {
  it("calculateProjectedDistanceComponents returns absolute deltas", () => {
    expect(calculateProjectedDistanceComponents({ x: 10, y: 20 }, { x: 13, y: 16 })).deep.equals({
      dx: 3,
      dy: 4,
    });
    expect(calculateProjectedDistanceComponents({ x: 13, y: 16 }, { x: 10, y: 20 })).deep.equals({
      dx: 3,
      dy: 4,
    });
  });

  it("calculateHandleMeasure returns distance/angle/tension for the start handle", () => {
    // square-ish cubic: on(0,0) off(0,100) off(100,200) on(200,200)
    const seg = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 200 },
      { x: 200, y: 200 },
    ];
    const m = calculateHandleMeasure(seg, "start");
    expect(m).to.not.equal(null);
    expect(m.distance).to.be.closeTo(100, 1e-6); // |on(0,0) -> off(0,100)|
    expect(m.angle).to.be.closeTo(90, 1e-6);
    expect(m.tension).to.be.a("number");
  });

  it("calculateHandleMeasure measures the end handle from the end anchor", () => {
    const seg = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 200 },
      { x: 200, y: 200 },
    ];
    const m = calculateHandleMeasure(seg, "end");
    expect(m.distance).to.be.closeTo(100, 1e-6); // |on(200,200) -> off(100,200)|
  });

  it("calculateHandleMeasure rejects malformed input", () => {
    expect(calculateHandleMeasure(null, "start")).to.equal(null);
    expect(calculateHandleMeasure([{ x: 0, y: 0 }], "start")).to.equal(null);
    expect(
      calculateHandleMeasure(
        [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: 0 },
        ],
        "middle"
      )
    ).to.equal(null);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd src-js/fontra-core && npx mocha tests/test-distance-angle.js --reporter spec`
Expected: FAIL — `calculateProjectedDistanceComponents`/`calculateHandleMeasure` are not exported.

- [ ] **Step 3: Add the two functions**

Append to `src-js/fontra-core/src/distance-angle.js` (they reuse the existing `calculateDistanceAndAngle` @73 and `calculateTension` @162 in this file — verify those names before adding):

```javascript
export function calculateProjectedDistanceComponents(point1, point2) {
  return {
    dx: Math.abs(point2.x - point1.x),
    dy: Math.abs(point2.y - point1.y),
  };
}

export function calculateHandleMeasure(segmentPoints, hoveredHandleSide) {
  if (!segmentPoints || segmentPoints.length !== 4) {
    return null;
  }
  if (hoveredHandleSide !== "start" && hoveredHandleSide !== "end") {
    return null;
  }

  const [onStart, offStart, offEnd, onEnd] = segmentPoints;
  const anchorPoint = hoveredHandleSide === "start" ? onStart : onEnd;
  const handlePoint = hoveredHandleSide === "start" ? offStart : offEnd;
  const oppositeAnchor = hoveredHandleSide === "start" ? onEnd : onStart;
  const oppositeHandle = hoveredHandleSide === "start" ? offEnd : offStart;
  const { distance, angle } = calculateDistanceAndAngle(anchorPoint, handlePoint);
  const tension = calculateTension(handlePoint, anchorPoint, oppositeHandle, oppositeAnchor);

  return {
    distance,
    angle,
    tension: Number.isFinite(tension) ? tension : null,
  };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd src-js/fontra-core && npx mocha tests/test-distance-angle.js --reporter spec`
Expected: PASS — 4 passing. (If the tension assertion is brittle, relax to `expect(m.tension === null || Number.isFinite(m.tension)).to.equal(true)` — but keep distance/angle exact.)

- [ ] **Step 5: Full core suite + commit**

```bash
cd src-js/fontra-core && npm test
```
Expected: full suite passes. Then:

```bash
npx prettier --write src-js/fontra-core/src/distance-angle.js src-js/fontra-core/tests/test-distance-angle.js
git add src-js/fontra-core/src/distance-angle.js src-js/fontra-core/tests/test-distance-angle.js
git commit -m "feat(measure): add handle/projected measure helpers to distance-angle"
```

---

## Task 2: Measure-hover state on `scene-model.js`

**Files:**
- Modify: `src-js/views-editor/src/scene-model.js`

**Interfaces:**
- Produces (consumed by Task 3 + Task 6): on the scene model — fields `measureMode`, `measureShowDirect`, `measureHoverSegment`, `measureHoverPoints`, `measureHoverHandle` (all default `false`/`null`); methods `setMeasureActive(active, {showDirect}={})`, `setMeasureShowDirect(b)`, `setMeasureHoverTarget(kind, payload=null)` (`kind` ∈ `"handle"|"segment"|"points"`), `getMeasureHoverTarget() → {kind, payload}|null`, `resetMeasureState()`.

- [ ] **Step 1: Add state fields**

In the scene-model constructor (next to other view-state fields), add:

```javascript
    // fork: Q-measure realtime overlay state (WS-2; no skeleton/rib)
    this.measureMode = false;
    this.measureShowDirect = false; // Alt+Q shows direct distance + angle
    this.measureHoverSegment = null; // { p1, p2, type }
    this.measureHoverPoints = null; // { p1, p2, type }
    this.measureHoverHandle = null; // { p1, p2, type, tensionContext? }
```

- [ ] **Step 2: Add the methods**

Add to the scene-model class (rib cases from donor 175–212 intentionally dropped):

```javascript
  setMeasureActive(active, options = {}) {
    this.measureMode = !!active;
    if (!this.measureMode) {
      this.measureShowDirect = false;
      this._clearMeasureHover();
      return;
    }
    this.measureShowDirect = !!options.showDirect;
  }

  setMeasureShowDirect(showDirect) {
    this.measureShowDirect = !!showDirect;
  }

  _clearMeasureHover() {
    this.measureHoverSegment = null;
    this.measureHoverPoints = null;
    this.measureHoverHandle = null;
  }

  setMeasureHoverTarget(kind, payload = null) {
    this._clearMeasureHover();
    switch (kind) {
      case "handle":
        this.measureHoverHandle = payload;
        break;
      case "segment":
        this.measureHoverSegment = payload;
        break;
      case "points":
        this.measureHoverPoints = payload;
        break;
    }
  }

  getMeasureHoverTarget() {
    if (this.measureHoverHandle) {
      return { kind: "handle", payload: this.measureHoverHandle };
    }
    if (this.measureHoverSegment) {
      return { kind: "segment", payload: this.measureHoverSegment };
    }
    if (this.measureHoverPoints) {
      return { kind: "points", payload: this.measureHoverPoints };
    }
    return null;
  }

  resetMeasureState() {
    this.setMeasureActive(false);
  }
```

- [ ] **Step 3: Syntax check + commit**

```bash
node --check src-js/views-editor/src/scene-model.js
npx prettier --write src-js/views-editor/src/scene-model.js
git add src-js/views-editor/src/scene-model.js
git commit -m "feat(measure): add measure-hover state to scene model"
```

---

## Task 3: `measure-interactions.js` (D11)

This is the bulk. Create a `MeasureInteraction` class that owns the Q lifecycle and hover hit-testing, ported from skeleton's pointer-inline code with **all rib/skeleton paths stripped**. The pointer (Task 5) holds one instance and delegates.

**Files:**
- Create: `src-js/views-editor/src/measure-interactions.js`

**Interfaces:**
- Consumes: the tool instance (for `sceneController`, `sceneModel`, `canvasController`); `calculateHandleMeasure` is **not** needed here (the overlay computes it) — this module only produces hover *targets*. `eventMatchesActionShortCut`/`eventMatchesActionBaseKey` from `@fontra/core/actions.js`; `centeredRect` from `@fontra/core/rectangle.js`; `* as vector`, `parseSelection` (verify exact module). Action ids from Task 4.
- Produces (consumed by Task 5): `new MeasureInteraction(tool)`; properties/methods `isActive` (getter → `sceneModel.measureMode`), `handleKeyDown(event) → boolean` (true if it consumed the key), `handleHover(event) → boolean` (true if in measure mode — caller must then skip normal hover).

- [ ] **Step 1: Create the module shell + lifecycle**

Create `src-js/views-editor/src/measure-interactions.js` with the constants, imports, and key/lifecycle code (ported from donor pointer 78–79, 785–904; rib/equalize constants and branches omitted):

```javascript
import {
  eventMatchesActionBaseKey,
  eventMatchesActionShortCut,
} from "@fontra/core/actions.js";
import { centeredRect } from "@fontra/core/rectangle.js";
import { parseSelection } from "@fontra/core/utils.ts";
import * as vector from "@fontra/core/vector.js";

const REALTIME_MEASURE_ACTION = "action.realtime.measure";
const REALTIME_MEASURE_DIRECT_ACTION = "action.realtime.measure-direct";

// Realtime hold-Q measurement. Owns the key lifecycle and produces hover
// "targets" ({kind, payload}) consumed by the fontra.measure.overlay layer.
// No skeleton/rib paths (D10/D11).
export class MeasureInteraction {
  constructor(tool) {
    this.tool = tool;
    this._boundKeyUp = null;
    this._boundAltKeyDown = null;
    this._boundAltKeyUp = null;
    this._boundWindowBlur = null;
  }

  get sceneController() {
    return this.tool.sceneController;
  }
  get sceneModel() {
    return this.tool.sceneModel;
  }
  get canvasController() {
    return this.tool.canvasController;
  }
  get isActive() {
    return this.sceneModel.measureMode;
  }

  // Returns true if this consumed the key (caller should stop).
  handleKeyDown(event) {
    if (
      eventMatchesActionShortCut(REALTIME_MEASURE_ACTION, event) ||
      eventMatchesActionShortCut(REALTIME_MEASURE_DIRECT_ACTION, event)
    ) {
      if (!this.sceneModel.measureMode) {
        this.sceneModel.setMeasureActive(true, {
          showDirect:
            eventMatchesActionShortCut(REALTIME_MEASURE_DIRECT_ACTION, event) ||
            event.altKey,
        });
        this._boundKeyUp = (e) => this._handleKeyUp(e);
        window.addEventListener("keyup", this._boundKeyUp);
        this._boundAltKeyDown = (e) => this._handleAltKeyDown(e);
        window.addEventListener("keydown", this._boundAltKeyDown);
        this._boundAltKeyUp = (e) => this._handleAltKeyUp(e);
        window.addEventListener("keyup", this._boundAltKeyUp);
        this._boundWindowBlur = () => this._end();
        window.addEventListener("blur", this._boundWindowBlur);
        this.canvasController.requestUpdate();
      }
      return true;
    }
    return false;
  }

  _handleKeyUp(event) {
    if (
      eventMatchesActionBaseKey(REALTIME_MEASURE_ACTION, event) ||
      eventMatchesActionBaseKey(REALTIME_MEASURE_DIRECT_ACTION, event)
    ) {
      this._end();
    }
  }

  _handleAltKeyDown(event) {
    if (!this.sceneModel.measureMode) return;
    if (event.key === "Alt" || event.altKey) {
      this.sceneModel.setMeasureShowDirect(true);
      this.canvasController.requestUpdate();
    }
  }

  _handleAltKeyUp(event) {
    if (!this.sceneModel.measureMode) return;
    if (event.key === "Alt" || !event.altKey) {
      this.sceneModel.setMeasureShowDirect(false);
      this.sceneModel.setMeasureHoverTarget(null, null);
      this.canvasController.requestUpdate();
    }
  }

  _end() {
    if (!this.sceneModel.measureMode) return;
    this.sceneModel.resetMeasureState();
    for (const [evt, bound] of [
      ["keyup", this._boundKeyUp],
      ["keydown", this._boundAltKeyDown],
      ["keyup", this._boundAltKeyUp],
      ["blur", this._boundWindowBlur],
    ]) {
      if (bound) window.removeEventListener(evt, bound);
    }
    this._boundKeyUp = this._boundAltKeyDown = this._boundAltKeyUp = this._boundWindowBlur = null;
    this.canvasController.requestUpdate();
  }
```

- [ ] **Step 2: Add hover resolution + equality (close the class)**

Continue the class with the hover entry point and target equality (donor `handleHover` 987–1006, `resolveMeasureHoverTarget` 115–142, `_measureHoverTargetsEqual` 3539+, `_measurePointsEqual` 2939–2959 — rib removed):

```javascript
  // Returns true when in measure mode (caller must skip normal hover).
  handleHover(event) {
    if (!this.sceneModel.measureMode) return false;
    const point = this.sceneController.localPoint(event);
    const size = this.sceneController.mouseClickMargin;
    this.sceneModel.setMeasureShowDirect(event.altKey);
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();

    const next =
      this._findControlPointForMeasure(point, size, positionedGlyph) ?? null;
    let target = next ? { kind: "handle", payload: next } : null;
    if (!target) {
      const seg = this._findSegmentForMeasure(point, size, positionedGlyph);
      if (seg) target = { kind: "segment", payload: seg };
    }
    if (!target) {
      const pts = this._getMeasurePointsFromSelection();
      if (pts) target = { kind: "points", payload: pts };
    }

    const current = this.sceneModel.getMeasureHoverTarget();
    if (!this._targetsEqual(target, current)) {
      this.sceneModel.setMeasureHoverTarget(target?.kind ?? null, target?.payload ?? null);
      this.canvasController.requestUpdate();
    }
    return true;
  }

  _targetsEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.kind !== b.kind) return false;
    return this._measurePointsEqual(a.payload, b.payload);
  }

  _measurePointsEqual(mp1, mp2) {
    if (mp1 === mp2) return true;
    if (!mp1 || !mp2) return false;
    const t1 = mp1.tensionContext;
    const t2 = mp2.tensionContext;
    const sameTension =
      (!t1 && !t2) ||
      (t1 &&
        t2 &&
        t1.hoveredHandleSide === t2.hoveredHandleSide &&
        JSON.stringify(t1.segmentPoints) === JSON.stringify(t2.segmentPoints));
    return (
      mp1.type === mp2.type &&
      mp1.p1?.x === mp2.p1?.x &&
      mp1.p1?.y === mp2.p1?.y &&
      mp1.p2?.x === mp2.p2?.x &&
      mp1.p2?.y === mp2.p2?.y &&
      sameTension
    );
  }
```

- [ ] **Step 3: Port the regular-path finders (strip skeleton)**

Add three private methods, ported from the donor with **only the regular-path branches kept**:

- `_findControlPointForMeasure(point, size, positionedGlyph)` — copy donor **3024–3087** (the path branch; **omit** the skeleton branch 2983–3022 and the `getSkeletonDataFromGlyph` lookup). It returns `{ p1: handlePos, p2: anchorPos, tensionContext, type: "path" }` and calls `this._buildPathTensionContext(...)`. Convert scene→glyph point with `{ x: point.x - positionedGlyph.x, y: point.y - positionedGlyph.y }` (guard `!positionedGlyph?.glyph?.path` → return null).
- `_buildPathTensionContext(path, contourIndex, hoveredPointIndex)` — copy donor **3088–3117** verbatim (pure path logic, no skeleton).
- `_findSegmentForMeasure(point, size, positionedGlyph)` — copy donor **3278–~3538**, **deleting** any `skeletonData`/`getSkeletonDataFromGlyph`/`buildSegmentsFromSkeletonPoints` branch and keeping the `positionedGlyph.glyph.path` segment search; it returns `{ p1, p2, type: "path" }` (or `"segment"`-shaped payload matching the overlay's `{p1,p2,type}` read). **Re-read these donor lines at execution and trim every skeleton reference** — this is the one method large enough that you must verify the strip line-by-line.
- `_getMeasurePointsFromSelection()` — copy donor **3162–3231** but keep **only** the `pointSelection`/`path` branch (3210–3219) and `parseSelection(this.sceneController.selection).point`; **delete** the `skeletonPoint`/`skeletonRibPoint` branches and `_getRibPointPositionForSelection`. Returns `{ p1, p2, type: "path" }` when exactly two path points are selected, else `null`.

> Note: every returned `type` will be `"path"` in forkra (no skeleton) — the overlay's `type === "skeleton"` color branch (Task 6) becomes a harmless dead branch; leave it or simplify to the path color.

- [ ] **Step 4: Syntax check**

Run: `node --check src-js/views-editor/src/measure-interactions.js`
Expected: no output (valid). Fix any leftover skeleton identifier references it flags as undefined later in the build.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src-js/views-editor/src/measure-interactions.js
git add src-js/views-editor/src/measure-interactions.js
git commit -m "feat(measure): add measure-interactions module (key lifecycle + hover, no rib)"
```

---

## Task 4: Register actions + lang

**Files:**
- Modify: `src-js/views-editor/src/editor.js`, `src-js/fontra-core/assets/lang/en.js`

- [ ] **Step 1: Register the realtime-hotkeys topic + two actions**

In `editor.js`, in the action-registration area (alongside the other `registerActionInfo` topic blocks), add (donor editor.js 751–768, equalize/rib omitted per D10):

```javascript
    {
      const topic = "0055-action-topics.realtime-hotkeys";
      registerActionInfo("action.realtime.measure", {
        topic,
        titleKey: "shortcuts.realtime.measure",
        defaultShortCuts: [{ baseKey: "q" }],
      });
      registerActionInfo("action.realtime.measure-direct", {
        topic,
        titleKey: "shortcuts.realtime.measure-direct",
        defaultShortCuts: [{ baseKey: "q", altKey: true }],
      });
    }
```

- [ ] **Step 2: Add lang keys**

In `src-js/fontra-core/assets/lang/en.js`, add `"action-topics.realtime-hotkeys": "Realtime hotkeys",` among the `action-topics.*` block (after `"action-topics.reference-font"`), and add in the `shortcuts.*` block:

```javascript
  "shortcuts.realtime.measure": "Measure (hold)",
  "shortcuts.realtime.measure-direct": "Measure direct (hold)",
```

- [ ] **Step 3: Build + commit**

```bash
node --check src-js/views-editor/src/editor.js
npm run bundle
```
Expected: build succeeds. Then:

```bash
npx prettier --write src-js/views-editor/src/editor.js src-js/fontra-core/assets/lang/en.js
git add src-js/views-editor/src/editor.js src-js/fontra-core/assets/lang/en.js
git commit -m "feat(measure): register realtime measure actions + lang keys"
```

---

## Task 5: Wire the pointer (instantiate + 3 thin hooks)

**Files:**
- Modify: `src-js/views-editor/src/edit-tools-pointer.js`

**Interfaces:** Consumes `MeasureInteraction` from Task 3.

- [ ] **Step 1: Import + instantiate**

Add at the top: `import { MeasureInteraction } from "./measure-interactions.js";`
In the `PointerTool` constructor (after `super(...)`), add: `this.measureInteraction = new MeasureInteraction(this);`
(Verify `this.sceneController`, `this.sceneModel`, `this.canvasController` are reachable on the tool — they are used elsewhere in this file.)

- [ ] **Step 2: Hook `handleKeyDown` (before the Tab guard, @973)**

Change the start of `handleKeyDown(event)` from:

```javascript
  handleKeyDown(event) {
    if (event.key !== "Tab" || !this.sceneSettings.selectedGlyph?.isEditing) {
```
to:
```javascript
  handleKeyDown(event) {
    if (this.measureInteraction.handleKeyDown(event)) {
      return;
    }
    if (event.key !== "Tab" || !this.sceneSettings.selectedGlyph?.isEditing) {
```

- [ ] **Step 3: Hook `handleHover` (top, @74)**

Change the start of `handleHover(event)` from:

```javascript
  handleHover(event) {
    const sceneController = this.sceneController;
```
to:
```javascript
  handleHover(event) {
    if (this.measureInteraction.handleHover(event)) {
      return; // measure mode owns hover
    }
    const sceneController = this.sceneController;
```

- [ ] **Step 4: Hook `handleDrag` (top, @220)**

Change the start of `async handleDrag(eventStream, initialEvent)` from:

```javascript
  async handleDrag(eventStream, initialEvent) {
    if (this.sceneModel.pathInsertHandles) {
```
to:
```javascript
  async handleDrag(eventStream, initialEvent) {
    if (this.measureInteraction.isActive) {
      return; // don't start a drag while measuring
    }
    if (this.sceneModel.pathInsertHandles) {
```

- [ ] **Step 5: Build + commit**

```bash
node --check src-js/views-editor/src/edit-tools-pointer.js
npm run bundle
```
Expected: build succeeds. Then:

```bash
npx prettier --write src-js/views-editor/src/edit-tools-pointer.js
git add src-js/views-editor/src/edit-tools-pointer.js
git commit -m "feat(measure): dispatch measure interaction from pointer tool"
```

---

## Task 6: Render-only `fontra.measure.overlay` layer

**Files:**
- Modify: `src-js/views-editor/src/visualization-layer-definitions.js`

**Interfaces:** Consumes scene-model measure state (Task 2) + `calculateHandleMeasure`, `calculateProjectedDistanceComponents`, `calculateDistanceAndAngle` (distance-angle.js).

- [ ] **Step 1: Add imports**

Ensure these are imported from `@fontra/core/distance-angle.js` (extend the existing distance-angle import in this file): `calculateHandleMeasure`, `calculateProjectedDistanceComponents`, `calculateDistanceAndAngle`. Ensure `strokeLine` is imported (used by the draw helpers — verify its source; in forkra it is defined in `tunni-calculations.js`).

- [ ] **Step 2: Register the layer + draw helpers**

Copy the donor `fontra.measure.overlay` registration (donor `visualization-layer-definitions.js` **2276–2387**) into forkra's layer-registration area, **deleting the rib branch** (donor 2311–2320 — the `if (measureHoverRibPoint)` block and its `measureHoverRibPoint` destructure). Keep `zIndex: 650`, the `screenParameters`, `colors`/`colorsDarkMode`, and the three remaining branches (handle / segment / points). Then copy the draw helper functions that follow it — `drawMeasureLine`, `drawMeasureLabel`, `drawMeasureGuideLine` (donor **~2389–~2480**) — into this file (re-verify their exact ranges; copy each fully).

The kept draw body is:

```javascript
  draw: (context, positionedGlyph, parameters, model, controller) => {
    if (!model.measureMode) return;
    const { measureHoverSegment, measureHoverHandle, measureHoverPoints, measureShowDirect } =
      model;

    if (measureHoverHandle) {
      const { p1, p2, type } = measureHoverHandle;
      const segmentColor = type === "skeleton" ? parameters.skeletonColor : parameters.pathColor;
      const tensionContext = measureHoverHandle.tensionContext;
      const handleMeasure = calculateHandleMeasure(
        tensionContext?.segmentPoints,
        tensionContext?.hoveredHandleSide
      );
      const dist = handleMeasure?.distance ?? calculateDistanceAndAngle(p2, p1).distance;
      const angle = handleMeasure?.angle ?? calculateDistanceAndAngle(p2, p1).angle;
      const tension = handleMeasure?.tension ?? null;
      const tensionText = tension == null ? "n/a" : tension.toFixed(2);
      const label = `${dist.toFixed(1)}\n${tensionText}\n${angle.toFixed(1)}°`;
      drawMeasureGuideLine(context, p2, p1, segmentColor, parameters);
      drawMeasureLabel(context, p1.x, p1.y, label, segmentColor, parameters, {
        offsetY: 8,
        alignBottom: true,
      });
      return;
    }

    if (measureHoverSegment || measureHoverPoints) {
      const { p1, p2, type } = measureHoverSegment || measureHoverPoints;
      const segmentColor = type === "skeleton" ? parameters.skeletonColor : parameters.pathColor;
      if (measureShowDirect) {
        const { distance: dist, angle } = calculateDistanceAndAngle(p1, p2);
        const label = `${dist.toFixed(1)}  ${angle.toFixed(1)}°`;
        drawMeasureLine(context, p1, p2, label, segmentColor, parameters);
      } else {
        const { dx, dy } = calculateProjectedDistanceComponents(p1, p2);
        const cornerPoint = { x: p2.x, y: p1.y };
        if (dx > 0.5) {
          drawMeasureLine(context, p1, cornerPoint, dx.toFixed(1), segmentColor, parameters);
        }
        if (dy > 0.5) {
          drawMeasureLine(context, cornerPoint, p2, dy.toFixed(1), segmentColor, parameters);
        }
      }
    }
  },
```

(The layer header — `identifier`, `name: "Measure Overlay"`, `selectionFunc: glyphSelector("editing")`, `zIndex: 650`, `screenParameters`, `colors`, `colorsDarkMode` — copy verbatim from donor 2277–2299. `skeletonColor` stays in `colors` only because the `type === "skeleton"` branch references it; it is dead in forkra but harmless.)

- [ ] **Step 3: Build + commit**

```bash
node --check src-js/views-editor/src/visualization-layer-definitions.js
npm run bundle
```
Expected: build succeeds. Then:

```bash
npx prettier --write src-js/views-editor/src/visualization-layer-definitions.js
git add src-js/views-editor/src/visualization-layer-definitions.js
git commit -m "feat(measure): add render-only measure overlay layer (no rib)"
```

- [ ] **Step 4: Manual end-to-end verification**

Run the Fontra server (venv `./venv`, Python 3.11) and open a glyph in the editor with the pointer tool:
1. **Hover a control handle + hold Q** → a dashed guide line from the on-curve anchor to the off-curve handle, plus a label showing `distance / tension / angle`.
2. **Hover a segment + hold Q** → two projected lines showing `dx` and `dy` with their lengths.
3. **Hold Alt+Q (or hold Alt while holding Q)** → switches the segment readout to a single direct distance + angle line.
4. **Select exactly two on-curve points + hold Q** (cursor not over a handle/segment) → direct measurement between the two selected points.
5. **Release Q** → overlay clears; normal hover/selection works again; dragging still works (no stuck measure mode). Tab still cycles selection.
6. **Confirm no X/Z/D/S realtime behavior exists** (D10) and the layers list shows a "Measure Overlay" entry.

---

## Self-Review

**Spec coverage (against IMPLEMENTATION_PLAN WS-2 outline):**
- (1) TDD `calculateHandleMeasure` + `calculateProjectedDistanceComponents` → Task 1. ✅
- (2) measure-hover state + setters/getter/reset on scene-model → Task 2. ✅
- (3) `measure-interactions.js` key-match→toggle + mousemove→hover → Task 3 (D11). ✅
- (4) register Q/Alt+Q actions + topic + lang → Task 4. ✅
- (5) `fontra.measure.overlay` render-only consuming core helpers → Task 6. ✅
- (6) thin dispatch hook in pointer → Task 5. ✅
- (7) prettier + commit per task → all tasks. ✅
- (8) manual verify hold-Q → Task 6 Step 4. ✅
- D10 (skip X-equalize + rib) → enforced in Tasks 3/4/6 (omitted constants, actions, state, overlay branch). ✅
- D11 (new module) → Task 3. ✅
- §4 split: core math = mocha TDD (Task 1); views-editor = manual. ✅

**Placeholder scan:** the bulky view-code ports (`_findSegmentForMeasure`, draw helpers) are specified as **exact donor line ranges to copy + exact skeleton branches to delete**, not vague TODOs — these are complete port instructions for manual-verify view code (the donor source is in-repo at `./skeleton/`). All new/core/small code is given literally.

**Type/name consistency:** hover payloads are `{ p1, p2, type, tensionContext? }`; `setMeasureHoverTarget(kind, payload)` kinds `"handle"|"segment"|"points"` match between scene-model (Task 2), the module (Task 3), and the overlay reads (Task 6). Action ids `action.realtime.measure(-direct)` match between Task 4 (register) and Task 3 (`eventMatchesActionShortCut`).

**⚠️ Scope note carried up to the master plan:** WS-2 is **larger and more skeleton-coupled than the master's "low–medium, mostly mechanical" estimate** — the measure feature in skeleton lives inline in the pointer and threads through a ~260-line segment finder, a control-point finder, a tension context, and a selection-points reader, each with rib branches to strip. The math is trivial; the *extraction* is the work. Budget Task 3 accordingly.

**Carried-forward for WS-4:** `measure-interactions.js` establishes the "interaction module + thin pointer dispatch" pattern that WS-4 mirrors for `tunni-interactions.js`, and Task 5 edits the pointer's `handleHover`/`handleDrag`/`handleKeyDown` first (small) so WS-4's larger pointer cleanup rebases on top.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-29-ws2-q-measure.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks. Requires `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute in this session with checkpoints. Requires `superpowers:executing-plans`.
