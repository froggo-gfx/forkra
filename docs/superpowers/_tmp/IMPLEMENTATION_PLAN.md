# Forkra Cleanup & Skeleton-Port Implementation Plan

> **For agentic workers / fresh sessions:** This is the **master (program) plan**. It captures intent, problem, locked decisions, architecture, the testable surface, and the workstream breakdown so that anyone with **zero prior context** can execute. Each workstream (WS-1 … WS-5) is an independent, shippable unit and gets expanded into its own fully bite-sized task list before execution — **see the Workstream Expansion Protocol in §6.0 for exactly how.** REQUIRED SUB-SKILL for executing any workstream: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax.

---

## 1. Intent

Bring **forkra** (a fork of [Fontra](https://github.com/fontra/fontra), now rebased onto upstream `main` @ `f70e2017f`) to a clean, maintainable state by:

1. **Refactoring forkra's own fork code** so that **functional logic (math, geometry, sampling, hit-testing) lives in proper modules**, and rendering/interaction files stay thin. ("Move all functional non-rendering code into proper files.")
2. **Porting the good architectural decisions and the two missing features** from the **skeleton** fork — *without* bringing the skeleton tool itself.

**End state:** forkra has feature-parity-plus with skeleton (minus the skeleton tool), with a clean separation of **math ↔ interaction ↔ rendering**, correct domain naming, no duplicated logic, and panel UIs for every fork feature.

This plan does **not** implement the skeleton tool, and treats the Distance/Manhattan visualization layers as frozen (superseded by Q-measure) — though `distance-angle.js` stays because Q-measure reuses it.

---

## 2. Problem Definition

Two reference trees plus the target:
- `original/` — pristine upstream clone (reference only); sibling of `forkra/`.
- `forkra/` — **this repository; the target we modify.** Already merged with upstream.
- `skeleton/` — a later fork with extra features + a refactor; **read-only donor** of code/architecture. **It is checked out *nested inside* forkra at `forkra/skeleton/`** (a full repo with its own `.git`), **not** a sibling.

> **Portability / required layout.** This document lives in **forkra**. Read every `skeleton/…` donor path as **`./skeleton/…`** (nested inside this repo) and every `forkra/…` path as **`./…`**, when your working directory is `forkra/`. The donor line numbers are written against the `skeleton/` tree as currently checked out — re-verify them at expansion time (they drift if skeleton is updated). `original/` is optional (upstream `f70e2017f` is also reachable as the `upstream/main` ref already fetched in forkra).
>
> ⚠️ **Nested-repo caveat:** `forkra/skeleton/` carries its own `.git`, so forkra's git commands do not see skeleton's history, and the nested tree must be kept out of forkra's commits (`.gitignore` it or treat as a submodule). Never modify anything under `skeleton/` — it is donor-only.

Forkra's fork code has these concrete problems (established by file-level analysis; see `PRE_IMPLEMENTATION_PLAN.md` for the full audit):

| Area | Problem |
|---|---|
| **Tunni** | `fontra-core/src/tunni-calculations.js` is a **1346-line monolith** mixing math + canvas drawing (`drawTunniLabels`, `strokeLine`) + interaction (mouse handlers, hit-tests). Tension is **duplicated** (`distance-angle.js:calculateTension` *and* recomputed inline in tunni code). The **naming is wrong**: what the code calls the "tunni point" is actually the midpoint between control handles; the *real* Tunni point is mislabeled "true/actual tunni point". ~**259 lines of Tunni interaction pollute** `edit-tools-pointer.js` (incl. a 190-line inline drag/undo loop). |
| **SpeedPunk** | No UI; hardcoded magic render constants (e.g. `* -180000`). The `fontra.curvature` layer is **~456 lines of inline sampling + rendering** in `visualization-layer-definitions.js`, including 4 pure-math helpers (`calculateSegmentBudget`, `estimateCurveLength`, `adjustStepsForCurve`, `countCurveSegments`). |
| **visualization-layer-definitions.js** | Fork added **+734 lines** (39% bloat), **inconsistent**: 3 layers delegate to imported draw fns (clean), but SpeedPunk + 2 Tunni layers define **fat inline draws with functional math baked in**. |
| **Coarse grid** | Works (snapping in `edit-behavior.js`, `f`/`g` actions + `coarseGridSpacing` scene setting in `scene-controller.js`, `fontra.coarse.grid` layer) but has **no panel UI**. |
| **Missing features** | **Letterspacer** (auto sidebearings) and **Q-measure** (hold-Q realtime measurement) exist in skeleton but not forkra. |

**Donor architecture (skeleton) — what we borrow:**
- Tunni split: `tunni-calculations.js` = **pure math (355 ln)**; `tunni-interactions.js` = interaction; draws live in the viz file **consuming the pure math**. (Strip skeleton-rib coupling.)
- Letterspacer: panel + overlay + `fontra-internal-data.js`/`fontra-internal-schema.js` persistence (customData). One ~5-line skeleton branch to drop.
- Q-measure: realtime-hotkey actions + measure overlay layer + scene-model hover state + `distance-angle.js` measure helpers. (Strip rib hotkeys.)
- **Note (verified):** skeleton does **not** extract SpeedPunk's sampling math — that cleanup is net-new in forkra and must be done *during* the SpeedPunk port.

---

## 3. Global Constraints

Copied verbatim — every task implicitly includes these.

- **Branching model:** All work happens in the **`refactor-simple/`** branch group, which is cut from **`experimental/up-to-date`** (in its most relevant/current state). Each workstream gets its own branch in that group — `refactor-simple/ws<N>-<name>` — with frequent commits; never push unless the user asks. (This is the single source of truth for the base branch; later references say "the `refactor-simple/` base.")
- **Upstream baseline:** `upstream/main` = `f70e2017f`. `original/` and `skeleton/` are **read-only references** — never modify them.
- **Skeleton coupling is OUT:** strip every reference to `skeleton-contour-generator.js`, rib/fixed-rib hotkeys, `measureHoverRibPoint`, `SKELETON`/`SKELETON_DEFAULTS` schema sections.
- **Language:** ES modules, `"type": "module"`. Import alias `@fontra/core/...` → `src-js/fontra-core/src/...`, `@fontra/web-components/...`, etc.
- **Formatting:** `npx prettier --write <files>` (prettier 3.8.3) before every commit.
- **Build (manual verify):** from `forkra/`, `npm run bundle` (webpack production) or `npm run bundle-watch`. Then run the Python `fontra` server (venv at `./venv` inside this repo, Python 3.11) and open a font in the editor.
- **Line endings:** working tree is **CRLF** on Windows; use `git diff`/`git show` (not raw `diff`) when comparing to `upstream/main`.

### Locked decisions (from `PRE_IMPLEMENTATION_PLAN.md` Part D)

| # | Decision |
|---|---|
| D1 | Letterspacer persists via `fontra.internal` **customData** at font + source(master) + glyph levels (already coded in skeleton). |
| D2 | Mid-handle point (midpoint between controls) is named **`control-handle point`** — NOT a tunni point. |
| D3 | The real (tangent-ray intersection) point becomes the canonical **"Tunni point"**; retire `trueTunniPoint`/"actual" naming. |
| D4 | **Hard-rename** `fontra.tunni.*` layer identifiers — no back-compat aliases. |
| D5 | **One** `calculateSegmentTension` in `tunni-calculations.js`; `distance-angle.js` imports it; delete its own `calculateTension` (incl. its leftover `console.log` debug blocks). **Scope is wider than tension:** `distance-angle.js` also holds duplicate *tunni-point geometry* (`calculateTrueTunniPoint`, `calculateTunniPointz`) — those are likewise deleted and routed to the canonical `tunni-calculations.js` functions (see WS-4 "Hidden entanglement"). |
| D6 | Keep the filename **`tunni-calculations.js`** (already exists), purified to math-only. |
| D7 | **Rename** the `showTunni*` settings keys consistently with D8. |
| D8 | Rename the "Tunni Labels" feature to **"Labels" / "Point labels"** (they are point labels, not segment labels). |
| D9 | Speedpunk + Coarse-grid panel settings are **app-level/global** via `applicationSettingsController` (localStorage) — **not** written to project files. |
| D10 | **Skip** realtime X-equalize (redundant; the kept equalize is alt-drag). Port **measure-only**. |
| D11 | Q-measure interaction goes in a new **`measure-interactions.js`** (keep the pointer lean). |

---

## 4. Testing Strategy (read before writing any task)

**Only `@fontra/core` (`src-js/fontra-core/`) has a test harness.** Tests are mocha + chai in `src-js/fontra-core/tests/test-*.js`.

- **Run all core tests:** `cd src-js/fontra-core && npm test` (→ `mocha tests --extension js --extension ts --reporter spec`).
- **Run one file:** `cd src-js/fontra-core && npx mocha tests/test-<name>.js --reporter spec`.
- **Test style:** `import { expect } from "chai"; describe("…", () => { it("…", () => { expect(actual).deep.equals(expected); }); });`

`views-editor`, `fontra-webcomponents`, etc. have **no test runner** (`"test": "echo \"No test specified\""`).

**Consequence — this drives the whole refactor:**
- **Functional code extracted into `fontra-core`** (tunni math/tension, curvature sampling, letterspacer area, measure geometry) → **TDD with real mocha unit tests.**
- **Panels, viz-layer draws, interaction modules in `views-editor`** → **manual verification** steps (build, run server, interact, observe). No automated tests; do not invent a harness (out of scope).

This is *why* "move functional code to core" is the throughline: it makes the logic testable and the view code thin.

---

## 5. Target File Structure (end state)

```
src-js/fontra-core/src/
  tunni-calculations.js     [MODIFY] purify to MATH ONLY; add calculateSegmentTension (D5);
                                     rename trueTunni→tunni / tunni→controlHandle (D2/D3)
  curvature.js              [MODIFY] add SpeedPunk sampling math moved out of viz file
  distance-angle.js         [MODIFY] import tension from tunni-calculations (D5); becomes the canonical
                                     measure+label math+render module (Q-measure, distance/angle, manhattan,
                                     point-label draws) — finalized in WS-4.5
  letterspacer-engine.js    [CREATE] pure area/margin math (extracted from panel for testability)
  fontra-internal-data.js   [CREATE] port from skeleton (customData get/set/ensure)
  fontra-internal-schema.js [CREATE] port from skeleton, LETTERSPACER section only (drop SKELETON*)

src-js/fontra-core/tests/
  test-tunni-calculations.js [CREATE]  test-curvature-sampling.js [CREATE]
  test-letterspacer-engine.js [CREATE] test-distance-angle.js [CREATE/EXTEND]

src-js/views-editor/src/
  edit-tools-pointer.js          [MODIFY] REMOVE ~259 lines of Tunni; add thin dispatch hooks only
  tunni-interactions.js          [CREATE] Tunni hit-test + drag handlers (consume core math)
  measure-interactions.js        [CREATE] Q-measure hover detect + key handling (D11)
  visualization-layer-definitions.js [MODIFY] thin layers only; render fns consume core math;
                                     rename fontra.tunni.* (D4); add measure overlay; speedpunk render-only;
                                     all measure/label layers registration-only (draw: imported) — WS-4.5
  panel-designspace-navigation.js [MODIFY] add Coarse-grid + SpeedPunk accordions (app-level settings, D9)
  panel-transformation.js        [MODIFY] rename "Tunni Labels"→"Point labels", showTunni*→new keys (D7/D8)
  panel-letterspacer.js          [CREATE] port from skeleton (strip skeleton branch; engine→core)
  visualization-layer-letterspacer.js [CREATE] port from skeleton
  scene-controller.js            [MODIFY] settings-key renames; coarse-grid wiring stays
  scene-model.js                 [MODIFY] add measure-hover state (no rib)
  editor.js                      [MODIFY] register Q-measure actions; register letterspacer panel
  application-settings.js (core) [MODIFY] add app-level speedpunk + coarseGrid keys (D9)

src-js/fontra-core/assets/
  lang/*.js                      [MODIFY] add sidebar.letterspacer.*, shortcuts.realtime.measure*,
                                     rename label keys; speedpunk/grid panel keys
  tabler-icons/spacing-horizontal.svg [CREATE] letterspacer icon (copy from skeleton)
```

---

## 6. Workstream Decomposition

### 6.0 — Workstream Expansion Protocol (READ FIRST)

**This plan is deliberately two-level. Do not skip this.**

- **Level 1 — this file (the master plan).** Captures intent, problem, constraints, architecture, sequencing, and a one-page **outline** per workstream (goal / files / donor refs / task outline / testing approach). It is the durable, context-loss-proof source of truth.
- **Level 2 — one expanded plan file per workstream.** A fully bite-sized, executable plan in which **every step contains real code or an exact command + expected output** — written only when that workstream is about to be built.

> ⚠️ **You never execute a Level-1 outline directly.** The outlines below are *scoping*, not instructions. Before writing any code, **expand** the chosen workstream into a Level-2 plan, then execute *that*.

**Expansion procedure — do this for each workstream, in turn:**

1. **Prerequisites.** Confirm the nested donor `./skeleton/` is present (see the Portability note in §2); create the workstream branch off the `refactor-simple/` base (see §3 "Branching model") — `git switch -c refactor-simple/ws<N>-<name>`.
2. **Re-read context.** This workstream's outline in §6 + its dependencies in §7 + the relevant locked decisions in §3 + the testing strategy in §4.
3. **Open the donors.** Read the actual current code at each cited `./skeleton/…` (and forkra) location and **re-verify the line numbers — they may have drifted** since this master was written. Trust the code, not the numbers.
4. **Write the Level-2 plan.** Invoke the `superpowers:writing-plans` skill and save to `docs/superpowers/plans/2026-06-28-ws<N>-<name>.md`. Follow its format: File Structure → right-sized **Tasks** → bite-sized **Steps** (write failing test → run it, see it fail → implement minimally → run it, see it pass → commit). **Complete code in every code step; exact commands + expected output; no placeholders.**
5. **Apply the §4 testing split.** Extracted core math → real mocha TDD (`cd src-js/fontra-core && npx mocha tests/test-<name>.js`). `views-editor` panels/draws/interaction → explicit **manual verification** steps (build, run server, interact, observe) — there is no harness, do not invent one.
6. **Self-review the Level-2 plan** against this workstream's outline: coverage, no placeholders, and name/type consistency with the canonical names fixed in §5 and WS-4.
7. **Execute** via `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`.
8. **Land it.** Only after this workstream's verification is green (tests pass / manual checks done) do you start the next workstream.

**Why two levels:** the master stays stable and re-readable across sessions/machines, while each workstream's full TDD detail is regenerated against the *real, current* code at execution time — so signatures and line numbers are never stale.

---

Five independent, shippable workstreams. Outlines below are detailed enough to scope and sequence; the per-task code is produced at **expansion time** (step 4 above) by reading the cited donor lines.

### WS-1 — Coarse-grid panel  *(risk: low — warm-up; establishes the panel + app-settings pattern)*
- **Goal:** Add a Coarse-grid accordion to `panel-designspace-navigation.js`, bound to **app-level** settings (D9), reusing forkra's existing `coarseGridSpacing` mechanics.
- **Files:** MODIFY `panel-designspace-navigation.js`, `application-settings.js` (core), lang files; leave `edit-behavior.js` snapping + `scene-controller.js` `f`/`g` actions intact.
- **Donor:** `skeleton/.../panel-designspace-navigation.js` coarse-grid accordion (≈ lines 353–432, getters 485–493, `_coarseGridSettings` 112–118, apply 697–699). **Adapt:** skeleton persists to `fontra.internal` EDITOR_VIEW customData — **rewire to `applicationSettingsController`** per D9.
- **Tasks (outline):** (1) add `coarseGridSpacing`/`coarseGridEnabled`/custom base+increment keys to `applicationSettingsController` + lang keys. (2) port the accordion markup into forkra's panel. (3) wire inputs ↔ app settings ↔ existing `coarseGridSpacing` scene setting + `fontra.coarse.grid` layer toggle. (4) prettier + commit. (5) manual verify: build, open editor, change spacing, confirm grid + F/G still work.
- **Testing:** manual (views-editor). The only unit-testable bit (none material) — skip.

### WS-2 — Q-measure port  *(risk: low–medium — mechanical; establishes measure-interactions pattern)*
- **Goal:** Hold-**Q** realtime measurement (+ **Alt+Q** direct), measure overlay layer, no rib coupling.
- **Files:** CREATE `measure-interactions.js` (D11); MODIFY `editor.js` (actions + topic), `scene-model.js` (measure-hover state, no rib), `visualization-layer-definitions.js` (`fontra.measure.overlay`), `distance-angle.js` (`calculateHandleMeasure`, `calculateProjectedDistanceComponents`), lang; thin hook in `edit-tools-pointer.js`.
- **Donor:** `skeleton/.../editor.js` (≈754–766 measure actions), `edit-tools-pointer.js` (REALTIME_MEASURE_* handlers ≈78–80, 787–851), `scene-model.js` (`setMeasureActive`/`clearMeasureHover` ≈154–161), viz `fontra.measure.overlay` (≈2275), `distance-angle.js` (`calculateHandleMeasure` 975, `calculateProjectedDistanceComponents` 112). **Drop:** rib-tangent/fixed-rib actions, `measureHoverRibPoint`, rib branches in overlay; **skip** X-equalize (D10).
- **Tasks (outline):** (1) **TDD** port `calculateHandleMeasure` + `calculateProjectedDistanceComponents` into `distance-angle.js` with mocha tests. (2) add measure-hover state + `setMeasureActive`/`clearMeasureHover` to `scene-model.js`. (3) create `measure-interactions.js` (key match → toggle active; mousemove → populate hover). (4) register Q / Alt+Q actions + topic + lang in `editor.js`. (5) add `fontra.measure.overlay` render-only layer consuming the core helpers. (6) thin dispatch hook in pointer. (7) prettier + commit per task. (8) manual verify: hold Q over outline, see measurement.
- **Testing:** core math = mocha TDD; overlay/interaction = manual.

### WS-3 — SpeedPunk panel + parameterization + viz extraction  *(risk: medium — combined per E.4)*
- **Goal:** SpeedPunk accordion (opacity/peak-height/sharpness, app-level D9) **and** move the sampling math out of the viz file in the same pass.
- **Files:** MODIFY `curvature.js` (receive sampling helpers + `computeSpeedPunkSamples`), `visualization-layer-definitions.js` (`fontra.curvature` becomes render-only consuming core), `panel-designspace-navigation.js` (accordion), `application-settings.js` (core; speedpunk keys), lang. CREATE `tests/test-curvature-sampling.js`.
- **Donor:** forkra viz `fontra.curvature` (helpers 1707–1793, layer 1794–~2160) for the math to extract; `skeleton/.../panel-designspace-navigation.js` speedpunk accordion (≈283–343, normalization 792–855) for the UI/params — **rewire persistence to app settings** (D9).
- **Tasks (outline):** (1) **TDD** move `calculateSegmentBudget`/`estimateCurveLength`/`adjustStepsForCurve`/`countCurveSegments` into `curvature.js` with mocha tests; re-import in viz. (2) **TDD** extract `computeSpeedPunkSamples(path, params)` returning sample/curvature data into `curvature.js`. (3) rewrite `fontra.curvature` draw to call it + stroke only (render-only). (4) add speedpunk keys to `applicationSettingsController` + lang. (5) port the accordion (peak-height/sharpness/opacity), bind to app settings, feed params into the layer. (6) prettier + commit per task. (7) manual verify: combs render; sliders change them live.
- **Testing:** sampling math = mocha TDD (the bulk); panel/render = manual.

### WS-4 — Tunni refactor (keystone)  *(risk: high — do behind tests; the big one)*
- **Goal:** Pure math in `tunni-calculations.js`; interaction in `tunni-interactions.js`; render in the viz file; **single tension source** (D5); **naming cascade** (D2–D4, D7, D8); **strip Tunni from the pointer**; relocate/rename point labels.
- **Files:** MODIFY `tunni-calculations.js` (purify + rename + add `calculateSegmentTension`), `distance-angle.js` (import tension, delete its `calculateTension` **and its duplicate tunni-point geometry — see "Hidden entanglement" below**), CREATE `tunni-interactions.js`, MODIFY `edit-tools-pointer.js` (remove ~259 Tunni lines → thin hooks), `visualization-layer-definitions.js` (rename `fontra.tunni.*`, thin draws), `panel-transformation.js` (labels rename + key renames), `scene-controller.js` (key renames). CREATE `tests/test-tunni-calculations.js`.
- **⚠️ Hidden entanglement (verified, wider than D5).** `distance-angle.js` does not only duplicate *tension* — it carries its **own copies of tunni-point geometry**: `calculateTrueTunniPoint` (≈line 1058) and a `calculateTunniPointz` (≈line 1173, consumed at ≈1250). So the D5 "single source of truth" + the D2/D3 naming cascade must **also** de-duplicate these: route `distance-angle.js` to the canonical `tunni-calculations.js` functions (real Tunni point), delete `calculateTrueTunniPoint`/`calculateTunniPointz`, and update the ≈1250 consumer to the renamed canonical function. Even though the Distance/Manhattan *layers* are frozen, `distance-angle.js` stays (Q-measure needs it) and its tunni dupes are in-scope for WS-4. Re-verify these line numbers at expansion time.
- **Cleanup riding along:** forkra's `calculateTension` in `distance-angle.js` has leftover `console.log` debug blocks (≈lines 165 & 270 — algorithm-bring-up cruft). They are deleted with the function as part of the D5 move; no debug logging survives into `calculateSegmentTension`.
- **Donor/architecture:** `skeleton/.../tunni-calculations.js` (pure-math shape) + `tunni-interactions.js` (interaction shape — **strip** `calculateSkeleton*`, `buildSkeletonTunniSegment`, `skeletonTunniHitTest`). Map current names: `calculateTrueTunniPoint`→`calculateTunniPoint` (real), old `calculateTunniPoint`→`calculateControlHandlePoint`; `fontra.tunni.actual.points`→`fontra.tunni.point`, `fontra.tunni.combined`→`fontra.tunni.handle` (final ids TBD but hard-rename, D4).
- **Tasks (outline):** (1) **TDD** add `calculateSegmentTension` to `tunni-calculations.js`; (2) repoint `distance-angle.js` to it, delete its `calculateTension` (and its `console.log` debug blocks), run tests. (2b) **TDD** de-dupe the tunni-point geometry in `distance-angle.js`: delete `calculateTrueTunniPoint`/`calculateTunniPointz`, import the canonical functions from `tunni-calculations.js`, and repoint the ≈1250 consumer. (3) **TDD** the rename within `tunni-calculations.js` (function-level), keeping behavior; purge drawing/interaction from it. (4) create `tunni-interactions.js` from the purged interaction code + skeleton structure (no skeleton refs). (5) update `edit-tools-pointer.js`: delete the ~259 Tunni lines, add an import + early-return dispatch hooks in `handleHover`/`handleDrag`. (6) move/rename the Tunni **geometry** draws (`drawTunniCombined`/`drawActualTunniPoints` → `fontra.tunni.combined`/`.actual.points`) in the viz file to render-only consuming core; hard-rename those layer ids (D4). *(The point-labels layer/draw + its rename move to WS-4.5.)* (7) `panel-transformation.js` + `scene-controller.js`: rename `showTunni*` keys (D7) and "Tunni Labels"→"Point labels" (D8). (8) prettier + commit per sub-step. (9) manual verify: Tunni lines/points drag, equalize (alt-drag) still works, labels show.
- **Testing:** all math/tension/geometry = mocha TDD; pointer/viz/panel = manual. **Regression-watch equalize** (must be untouched in behavior).

### WS-4.5 — Measure + label module consolidation  *(risk: low–medium — finalize/verify + rename; viz-delegation cleanup)*
- **Goal:** Make `distance-angle.js` the **canonical measure + label math/render module**, and reduce `visualization-layer-definitions.js` to registration-only for all four measure/label layers (Distance & Angle, Manhattan, Point labels, Measure overlay). Closes the Part E ✅-pattern gap for the WS-2 measure overlay and finishes the point-labels rename on the draw/layer side.
- **Depends on WS-4:** needs `calculateSegmentTension` to exist and `distance-angle.js`'s `calculateTension` + duplicate tunni-point geometry already deleted (D5). Runs **immediately after WS-4**.
- **Files:** MODIFY `distance-angle.js` (absorb the WS-2 overlay draw helpers; `drawTunniLabels` consumes central tension + rename), `visualization-layer-definitions.js` (measure overlay → `draw: imported`; hard-rename `fontra.tunni.labels`), lang (label display-key renames).
- **Already-true (verify, do NOT rebuild):** Distance & Angle / Manhattan / Tunni-labels layers already delegate to imported draws from `distance-angle.js` (viz import block ≈12–39 — the Part E ✅ rows). Distance/Manhattan stay **frozen** (no behavior change), just confirmed render-only.
- **The actual gap:** WS-2's measure overlay draws **inline in the viz file** (`drawMeasureLabel`/`drawMeasureLine`/`drawMeasureGuideLine` ≈2854) — the only measure/label layer not delegating. This WS makes it match the other three.
- **Tasks (outline):** (1) move the WS-2 overlay draw helpers out of the viz file into `distance-angle.js`; export one `drawMeasureOverlay(context, parameters, model)` render fn; rewrite `fontra.measure.overlay` to `draw: drawMeasureOverlay` (registration-only). (2) repoint `drawTunniLabels` to consume `calculateSegmentTension` from `tunni-calculations.js` (drop any inline tension recompute left after WS-4's D5 move); verify distance/tension/angle label values unchanged. (3) point-labels rename on the draw/layer side (D8/D4): hard-rename `fontra.tunni.labels`→`fontra.point.labels` (final id TBD), update the lang display key (panel text/keys already renamed in WS-4). (4) confirm Distance & Angle + Manhattan remain render-only delegating (no change; frozen). (5) prettier + commit per task. (6) manual verify: hold-Q overlay renders identically; point labels show distance/tension/angle under the new name; Distance/Manhattan unaffected.
- **Testing:** relocated code is **render/draw** → manual verify (no new mocha). Tension/geometry stays covered by WS-4's `test-tunni-calculations.js`; the measure *math* (`calculateHandleMeasure`) keeps its WS-2 `test-distance-angle.js` (relocating *draw* helpers doesn't touch it).

### WS-5 — Letterspacer port  *(risk: medium — introduces persistence surface)*
- **Goal:** Auto-sidebearings panel + overlay, persisting `fontra.internal` customData (D1).
- **Files:** CREATE `fontra-internal-data.js`, `fontra-internal-schema.js` (LETTERSPACER only), `letterspacer-engine.js` (extracted pure math, for tests), `panel-letterspacer.js`, `visualization-layer-letterspacer.js`, `tabler-icons/spacing-horizontal.svg`; MODIFY `editor.js` (register panel), lang. CREATE `tests/test-letterspacer-engine.js`, `tests/test-fontra-internal-data.js`.
- **Donor:** `skeleton/.../fontra-internal-{data,schema}.js`; `panel-letterspacer.js` (**strip** `skeleton-contour-generator` import lines 10–13 and the `if (skeletonData && deltaLSB)` branch ≈729–733); `visualization-layer-letterspacer.js`; icon.
- **Tasks (outline):** (1) **TDD** port `fontra-internal-data.js` + schema (LETTERSPACER section) with mocha tests for get/set/ensure round-trip. (2) **TDD** extract the pure area/margin math (`polygonArea`, `setDepth`, margin sampling) into `letterspacer-engine.js` with tests. (3) port `panel-letterspacer.js` consuming the engine, strip skeleton branch. (4) port the overlay layer + icon + lang. (5) register the panel in `editor.js`. (6) prettier + commit per task. (7) manual verify: compute + apply LSB/RSB on a glyph; reload → values persisted in the font.
- **Testing:** engine + persistence = mocha TDD; panel/overlay = manual. Verify customData round-trips through save/load.

---

## 7. Sequencing & Dependencies

```
WS-1 Coarse-grid panel ──┐ (establishes panel + app-settings pattern)
                         ▼
WS-3 SpeedPunk ──────────┘ (reuses the pattern; + viz math extraction)

WS-2 Q-measure ──► establishes measure-interactions.js; touches pointer lightly
                         │
WS-4 Tunni refactor ◄────┘ (cleans the pointer; do its pointer edit AFTER WS-2's,
                            or coordinate to avoid pointer churn conflicts)
         │
WS-4.5 Measure+label module (consolidate measure/label math+draws into distance-angle.js;
                            viz → registration-only; needs WS-4's calculateSegmentTension)

WS-5 Letterspacer ── independent; schedule anytime (recommended last)
```

**Recommended order:** WS-1 → WS-3 → WS-2 → WS-4 → WS-4.5 → WS-5.
- WS-1 then WS-3 share the panel + app-settings plumbing (do WS-1 first as the cheap warm-up).
- WS-2 before WS-4 so `measure-interactions.js` exists as the pattern WS-4 mirrors when extracting `tunni-interactions.js`, and so the pointer is edited by WS-2 first (small) then cleaned by WS-4 (large) — fewer conflicts than the reverse.
- WS-4.5 runs right after WS-4: it needs the single `calculateSegmentTension` to exist and `distance-angle.js`'s `calculateTension`/duplicate tunni-geometry already removed before the labels + measure overlay consume the central math.
- WS-5 is fully independent; last keeps the riskier refactors earlier.

Each workstream = its own branch in the `refactor-simple/` group (see §3 "Branching model"), merged only after its manual/automated verification passes.

---

## 8. Self-Review (against the audit)

- **Spec coverage:** SpeedPunk (WS-3 + viz extraction), Tunni mess incl. naming/tension/pointer (WS-4) + point-labels draw/layer (WS-4.5), Coarse-grid panel (WS-1), Letterspacer incl. persistence (WS-5), Q-measure (WS-2), measure+label math/render consolidation into `distance-angle.js` (WS-4.5), viz-file cleanup (WS-3 + WS-4 + WS-4.5). Equalize = intentionally untouched (regression-watched in WS-4). Distance/Manhattan = intentionally frozen (confirmed render-only in WS-4.5). ✅ all audit items mapped.
- **Decisions:** D1→WS-5, D2/D3→WS-4, D4→WS-4 + WS-4.5 (labels id), D5→WS-4, D6→WS-4, D7→WS-4, D8→WS-4 (panel text/keys) + WS-4.5 (labels draw/layer), D9→WS-1/WS-3, D10/D11→WS-2. ✅
- **Type/name consistency:** the canonical renames are fixed in §5/WS-4 (`calculateTunniPoint`=real point, `calculateControlHandlePoint`=mid-handle, `calculateSegmentTension`=single tension). Downstream tasks must use these exact names.
- **Open item carried forward:** final string for the renamed mid-handle layer id (D4) — pick at WS-4 expansion (`fontra.tunni.handle` proposed).

---

## 9. Execution Handoff

This master plan is saved. **Next step:** follow the **Workstream Expansion Protocol (§6.0)** — expand the chosen workstream into a fully bite-sized Level-2 plan (every step with real code/commands + expected output), then execute it.

Two execution options per workstream:
1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks. Requires `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute in-session with checkpoints. Requires `superpowers:executing-plans`.
