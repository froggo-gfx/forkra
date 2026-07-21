# forkra Feature Architecture Map

**Date:** 2026-07-22
**Verified against:** `refactor-simple/ws17-parity-bugs`, diffed against `upstream/main` (`f70e2017f`)
**Scope:** every file forkra adds or changes on top of upstream Fontra, mapped to the feature that owns it.

This is the **inventory and ownership map**. It answers "what did we build, where does it live,
and what may I touch?" — so a fresh session or a delegated agent can start work without
re-deriving the architecture.

Companion documents, each with a different job:

| Doc                                                              | Answers                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `plans/2026-07-02-skeleton-integration-roadmap.md`               | _Why_ the skeleton is built this way; the C1–C4 rails; donor rules       |
| `SKELETON-FEATURE-MODEL.md`                                      | What the **donor's** skeleton code does (reading material, not our code) |
| `notes/2026-07-06-parity-bugs.md`                                | Live bug/parity registry — the working queue                             |
| `_tmp/IMPLEMENTATION_PLAN.md`, `_tmp/PRE_IMPLEMENTATION_PLAN.md` | Historical: the WS-1…WS-5 program plan and its audit                     |
| **this doc**                                                     | Where everything **is**, and who owns it                                 |

---

## 0. How to use this doc

- **Starting a feature task?** Find it in §3. That section lists every file you should need,
  plus the seams you must go through.
- **About to edit a shared file** (`editor.js`, `scene-model.js`, `edit-tools-pointer.js`,
  `visualization-layer-definitions.js`, `scene-controller.js`, `panel-transformation.js`)?
  Read §4 first — several features share those files and the hunks are not interleaved by accident.
- **Adding a new feature?** Read §2 (the rails) and §5 (infrastructure you extend rather than duplicate).
- **Line counts** are `git diff --numstat` against upstream: `+added / −removed`.
  For new files, added = file length.

**Totals:** 71 files under `src-js` (+28,809 / −131), 1 backend file, 3 docs, 1 test fixture font.
212 non-merge commits.

---

## 1. Feature inventory

| #   | Feature                 | Status                                            | Origin                         | Owned files                                              | Entry point                                 |
| --- | ----------------------- | ------------------------------------------------- | ------------------------------ | -------------------------------------------------------- | ------------------------------------------- |
| F1  | **Coarse grid**         | shipped (WS-1)                                    | donor panel + forkra mechanics | 1 new core, 1 panel                                      | `fontra.coarse.grid` layer, `f`/`g` actions |
| F2  | **Q-measure**           | shipped (WS-2)                                    | donor port                     | 1 new editor module                                      | hold **Q** / **Alt+Q**                      |
| F3  | **SpeedPunk**           | shipped (WS-3)                                    | fork-original + donor panel    | `curvature.js`                                           | `fontra.curvature` layer                    |
| F4  | **Tunni**               | shipped (WS-4)                                    | fork-original, refactored      | 1 core + 1 editor module                                 | `fontra.tunni.*` layers                     |
| F5  | **Point labels**        | shipped (WS-4.5)                                  | fork-original, relocated       | inside `distance-angle.js`                               | `fontra.point.labels` layer                 |
| F6  | **Letterspacer**        | shipped (WS-5)                                    | donor port                     | engine + panel + overlay                                 | Selection-info sidebar                      |
| F7  | **Skeleton**            | shipped WS-6…WS-16; parity pass WS-17 in progress | re-integrated from donor       | 5 core + 9 editor + panel set                            | Skeleton Pen tool, right sidebar            |
| F8  | **Carried fork extras** | shipped, pre-dating the program                   | fork-original                  | `corner-overlap.js`, quad handles, equalize, pen-connect | scattered — see §3.8                        |

Feature sizes, owned code only (shared-file hunks excluded):

```
Skeleton      ████████████████████████████████████████  ~15,700 lines
Letterspacer  █████                                      ~1,900
Tunni         █████                                      ~1,850
Measure+labels████                                       ~2,050  (F2 + F5 share distance-angle.js)
SpeedPunk     █▌                                           ~460
Corner overlap█                                            ~350
Coarse grid   ▏                                             ~66
```

---

## 2. The rails (constraints every feature obeys)

These come from the roadmap's §4 and the program plan's §4/§5. They are the reason the file
layout looks the way it does — violating one is how you get a regression that tests can't catch.

**R-A — Layer placement is fixed.**
Pure geometry/math → `fontra-core/src/` (mocha-tested). Hit-testing → `scene-model.js` as
`*AtPoint` methods. Interaction → a dedicated `*-interactions.js` or `skeleton-*.js` module.
Rendering → a `visualization-layer-*.js` file or a render-only draw in
`visualization-layer-definitions.js`. `edit-tools-pointer.js` stays a **thin dispatcher**.

**R-B — One copy of every constant and geometry function.**
If a symbol exists anywhere in forkra, import it. This rail exists because the donor had
`projectRibPoint` twice and `DEFAULT_SKELETON_WIDTH` five times.

**R-C — Skeleton: one write path.** Every skeleton mutation goes through `editSkeleton`
(`views-editor/src/skeleton-editing.js:94`). No second call site of the generator on the
editing side. No skeleton customData written outside it.

**R-D — Skeleton: provenance forward, never recovered.** The generator emits the
skeleton-point → generated-point mapping. No geometric matching, no tolerance-based inverse
projection anywhere.

**R-E — No kind-branching in shared emit code.** `makeChangeForDelta` and below must not
contain `if (skeleton…)`. Kind decisions happen at construction time, via **target entries**.

**R-F — Cross-cutting modifiers are behavior names**, not bypass flags — see
`skeleton-modifiers.js` (both copies, core + editor).

**R-G — Test split.** Only `fontra-core` has a harness (mocha + chai, `npm test`).
`views-editor` has none: those changes carry a manual test matrix in their plan.
Every commit: `node --check` on touched editor files, `npx prettier --write`, `npm run bundle` green.

---

## 3. Per-feature file maps

### F1 — Coarse grid

Snap-to-grid with presets and a panel. Mechanics were already in forkra; WS-1 added the UI.

| File                                                  | +/−      | Role                                             |
| ----------------------------------------------------- | -------- | ------------------------------------------------ |
| `fontra-core/src/coarse-grid-presets.js`              | +66      | **NEW** — preset table and resolution math       |
| `views-editor/src/panel-designspace-navigation.js`    | (shared) | Coarse-grid accordion                            |
| `views-editor/src/scene-controller.js`                | (shared) | `coarseGridSpacing` setting, `f`/`g` actions     |
| `views-editor/src/edit-behavior.js`                   | (shared) | the actual snapping during edits                 |
| `views-editor/src/visualization-layer-definitions.js` | (shared) | `fontra.coarse.grid` layer                       |
| `fontra-core/src/application-settings.js`             | +9       | app-level (localStorage) keys — **not** per-font |
| `fontra-core/tests/test-coarse-grid-presets.js`       | +80      | tests                                            |

Settings live in `applicationSettingsController` by decision D9: view preferences, never
written to project files.

### F2 — Q-measure

Hold **Q** for realtime measurement; **Alt+Q** for direct mode.

| File                                                  | +/−                   | Role                                                                                         |
| ----------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `views-editor/src/measure-interactions.js`            | +503                  | **NEW** — key state, hover detection, dispatch                                               |
| `fontra-core/src/distance-angle.js`                   | (shared, +1545 total) | `calculateHandleMeasure`, `calculateProjectedDistanceComponents`, `drawMeasureOverlay`       |
| `views-editor/src/scene-model.js`                     | (shared)              | `setMeasureActive`, `setMeasureShowDirect`, `setMeasureHoverTarget`, `getMeasureHoverTarget` |
| `views-editor/src/editor.js`                          | (shared)              | `action.realtime.measure`, `…measure-direct`; topic `realtime-hotkeys`                       |
| `views-editor/src/visualization-layer-definitions.js` | (shared)              | `fontra.measure.overlay`, registration-only                                                  |
| `fontra-core/tests/test-distance-angle.js`            | +84                   | tests                                                                                        |

**Known gap:** measure ignores skeleton geometry entirely — registry item 4.12, and it overlaps
the unadapted branches 5.1/5.2.

### F3 — SpeedPunk

Curvature combs with app-level parameters (peak height, sharpness, opacity).

| File                                                  | +/−      | Role                                                |
| ----------------------------------------------------- | -------- | --------------------------------------------------- |
| `fontra-core/src/curvature.js`                        | +460     | **NEW** — sampling math + `computeSpeedPunkSamples` |
| `views-editor/src/visualization-layer-definitions.js` | (shared) | `fontra.curvature`, render-only                     |
| `views-editor/src/panel-designspace-navigation.js`    | (shared) | SpeedPunk accordion                                 |
| `fontra-core/src/application-settings.js`             | +9       | shared with F1                                      |
| `fontra-core/tests/test-curvature-sampling.js`        | +112     | tests                                               |

Peak height is UPM-relative — that normalization is what replaced the original hardcoded
`* -180000` magic constants.

### F4 — Tunni

The keystone refactor: 1,346-line monolith → pure math + interaction + render-only draws.

| File                                                  | +/−      | Role                                                          |
| ----------------------------------------------------- | -------- | ------------------------------------------------------------- |
| `fontra-core/src/tunni-calculations.js`               | +436     | **NEW** — pure math only. Canonical `calculateSegmentTension` |
| `views-editor/src/tunni-interactions.js`              | +1178    | **NEW** — hit-tests, drag handlers, equalize trigger          |
| `views-editor/src/edit-tools-pointer.js`              | (shared) | thin dispatch hooks only                                      |
| `views-editor/src/visualization-layer-definitions.js` | (shared) | `fontra.tunni.handle`, `fontra.tunni.point`                   |
| `views-editor/src/panel-transformation.js`            | (shared) | settings keys                                                 |
| `fontra-core/tests/test-tunni-calculations.js`        | +82      | tests                                                         |

**Naming is settled and load-bearing** (decisions D2/D3/D4 — hard rename, no aliases):

| Geometry                                              | Canonical name                | Layer id              |
| ----------------------------------------------------- | ----------------------------- | --------------------- |
| Intersection of tangent rays = the _real_ Tunni point | `calculateTunniPoint`         | `fontra.tunni.point`  |
| Midpoint between the two control handles              | `calculateControlHandlePoint` | `fontra.tunni.handle` |

`calculateSegmentTension` is the **single** tension source (D5). `distance-angle.js` imports it;
its old `calculateTension` and duplicate tunni-point geometry are deleted.

### F5 — Point labels

Per-segment distance / tension / angle labels. Formerly "Tunni Labels" (D8).

| File                                                  | +/−              | Role                                         |
| ----------------------------------------------------- | ---------------- | -------------------------------------------- |
| `fontra-core/src/distance-angle.js`                   | (shared with F2) | `drawTunniLabels`, consuming central tension |
| `views-editor/src/visualization-layer-definitions.js` | (shared)         | `fontra.point.labels`, registration-only     |
| `views-editor/src/panel-transformation.js`            | (shared)         | label toggles                                |

Skeleton has its **own** label layer (`fontra.skeleton.point-labels`) — separated deliberately
by registry item 4.1. Do not merge them.

### F6 — Letterspacer

HTLetterspacer-style automatic sidebearings.

| File                                                     | +/−      | Role                                           |
| -------------------------------------------------------- | -------- | ---------------------------------------------- |
| `fontra-core/src/letterspacer-engine.js`                 | +215     | **NEW** — pure area/margin math                |
| `views-editor/src/panel-letterspacer.js`                 | +1528    | **NEW** — panel UI                             |
| `views-editor/src/visualization-layer-letterspacer.js`   | +150     | **NEW** — `letterspacer-visualization` overlay |
| `views-editor/src/panel-selection-info.js`               | (shared) | hosts the panel                                |
| `fontra-core/assets/tabler-icons/spacing-horizontal.svg` | +7       | icon                                           |
| `fontra-core/tests/test-letterspacer-engine.js`          | +93      | tests                                          |

Persists through the `fontra.internal` customData section `letterspacer` at three entity levels:
`area`/`depth`/`overshoot` per source, `enabled` per font, `referenceGlyphName` per glyph.

**The one skeleton coupling that was deliberately kept out at port time is now back in scope:**
sidebearing changes should move skeleton data with them. That is roadmap WS-16's
"letterspacer ↔ skeleton coupling" line — verify before assuming it is wired.

### F7 — Skeleton

The largest feature by an order of magnitude: ~15,700 lines of owned code across 14 files.
Stroke-based design — the designer draws centerlines with per-point widths, and the filled
outline contours are generated live.

**Core (pure, mocha-tested):**

| File                                          | +/−   | Role                                                                                                                                                                               |
| --------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fontra-core/src/skeleton-model.js`           | +1243 | Schema, stable-id allocation, accessors/mutators, rib projection, normals. **The single home for skeleton geometry constants.**                                                    |
| `fontra-core/src/skeleton-generator.js`       | +5168 | Centerline → outline. Segments, offset curves, caps (butt/round/square/**drop**), corner rounding, single-sided, handle offsets, detached handles. Emits forward provenance (R-D). |
| `fontra-core/src/skeleton-modifiers.js`       | +475  | D/S/X/Z semantics: `applyFixedRibDelta`, the equalize family                                                                                                                       |
| `fontra-core/src/skeleton-source-defaults.js` | +241  | Per-source defaults, resolved by glyph case                                                                                                                                        |
| `fontra-core/src/skeleton-tunni.js`           | +234  | Tunni math on skeleton segments                                                                                                                                                    |

**Editor (no test harness — manual matrices):**

| File                                               | +/−   | Role                                                                                                                       |
| -------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------- |
| `views-editor/src/skeleton-editing.js`             | +959  | **`editSkeleton` — the one write path (R-C).** Selection keys, target entries, contour-index bookkeeping, selection bounds |
| `views-editor/src/skeleton-generated.js`           | +639  | Editable generated points/handles; provenance resolution; detach                                                           |
| `views-editor/src/skeleton-ribs.js`                | +233  | Rib keys, addresses, width/nudge executors                                                                                 |
| `views-editor/src/skeleton-modifiers.js`           | +42   | Thin: maps selection kinds → behavior names                                                                                |
| `views-editor/src/edit-tools-skeleton.js`          | +855  | Skeleton Pen drawing tool                                                                                                  |
| `views-editor/src/visualization-layer-skeleton.js` | +781  | 11 canvas layers                                                                                                           |
| `views-editor/src/panel-skeleton-parameters.js`    | +1181 | Numeric editing panel (right sidebar)                                                                                      |
| `views-editor/src/skeleton-panel-edits.js`         | +741  | Panel → `editSkeleton` write helpers, streaming edits                                                                      |
| `views-editor/src/skeleton-panel-model.js`         | +460  | Panel read model: selection summaries, mixed/uniform state                                                                 |
| `views-editor/src/panel-skeleton-defaults.js`      | +483  | Per-source defaults panel                                                                                                  |

**Selection kinds** — compound keys, all id-based (never path indices):

```
skeletonPoint/<contourId>/<pointId>                        on-curve AND handles (C1)
skeletonRib/<contourId>/<pointId>/<side>                   side ∈ left|right
editableGeneratedPoint/<contourId>/<pointId>/<side>
editableGeneratedHandle/<contourId>/<pointId>/<side>/<role>  role ∈ in|out
```

`fontra-core/src/utils.ts` was changed (+14/−6) precisely so `parseSelection` keeps the raw
remainder for these compound kinds instead of `parseInt`-ing them.

**Visualization layers (11):**
`width-shading`, `ribs`, `rib-points`, `centerline`, `handles`, `nodes`, `selected-nodes`,
`tunni`, `insert-handles-preview`, `editable-markers`, `point-labels` — all under
`fontra.skeleton.*` in `visualization-layer-skeleton.js`.

**Hit-testing** — all in `scene-model.js`, per R-A:
`skeletonPointAtPoint`, `skeletonRibAtPoint`, `skeletonTunniAtPoint`, `editableGeneratedAtPoint`,
`skeletonRibSelectionAtPoint`, `skeletonSegmentSelectionAtPoint`, plus `isGeneratedPathContour`.

**Tests:** `test-skeleton-model.js` (873), `test-skeleton-generator.js` (609),
`test-skeleton-modifiers.js` (485), `test-skeleton-ribs.js` (298), `test-skeleton-tunni.js` (273),
`test-skeleton-source-defaults.js` (125), `test-skeleton-interpolation.js` (99).
Golden-master fixtures: `tests/data/skeleton-generator/fixtures.json` (1165), regenerated by
`tests/scripts/make-skeleton-generator-fixtures.js`.

**Other tools had to learn about generated contours** — these are small but essential:

| File                  | +/−     | What it learned                                                                                                       |
| --------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `edit-tools-knife.js` | +54/−1  | Never slice generated contours; carry identity through slicing via temporary point attributes, then re-derive indices |
| `edit-tools-pen.js`   | +125/−2 | Never insert into generated contours; record index shifts via `recordSkeletonContourIndexShift`                       |
| `edit-tools-shape.js` | +3      | Comment only — `appendPath` appends after the generated block, so no bookkeeping needed                               |

That third row is the pattern to copy: when a tool restructures the contour list, it must
either update the generated-contour mapping in the same change, or prove it doesn't need to.

### F8 — Carried fork extras

Features that pre-date the WS program and were kept through the refactor. They have no
workstream and thin documentation — flagging them so they aren't mistaken for upstream code.

| Feature                  | Files                                                                                                                          | Notes                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **Corner overlap**       | `fontra-core/src/corner-overlap.js` (+350), consumed via `path-functions.js:addOverlapToPath`, action in `scene-controller.js` | Carries leftover `console.log` debug — see §7                                |
| **Quad handles**         | `path-functions.js:insertHandles` (type/shiftKey params), `edit-tools-pen.js`                                                  | Shift modifier picks 1 vs 2 handles for quad curves                          |
| **Equalize**             | `edit-behavior.js`, `tunni-interactions.js`                                                                                    | Alt-drag. Explicitly frozen during WS-4 — regression-watch it                |
| **Pen connect**          | `edit-tools-pen.js:_getPathConnectTargetPoint`                                                                                 | Connect to an open contour's endpoint                                        |
| **Distance / Manhattan** | `distance-angle.js`, two layers                                                                                                | Frozen — superseded by Q-measure, kept because `distance-angle.js` is shared |

---

## 4. Shared-file reverse index

Twelve files carry hunks from more than one feature. **Read this before editing them.**

| File                                                  | +/−      | Feature split                                                                                                             |
| ----------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `views-editor/src/scene-model.js`                     | +604/−9  | **Skeleton** (6 `*AtPoint` methods, generated-contour predicate) ≫ **Q-measure** (hover state) > Tunni                    |
| `views-editor/src/edit-tools-pointer.js`              | +507/−19 | **Skeleton** (drag/marquee/transform dispatch) > **Tunni** (thin hooks) > measure, equalize. Must stay a dispatcher (R-A) |
| `views-editor/src/panel-designspace-navigation.js`    | +503/−0  | **Coarse grid** ≈ **SpeedPunk**. Pure insertion — two accordions                                                          |
| `views-editor/src/visualization-layer-definitions.js` | +415/−0  | **Tunni** > **Coarse grid** > SpeedPunk, measure, labels, quad handles. Registration + render-only                        |
| `views-editor/src/scene-controller.js`                | +345/−11 | **Skeleton** ≫ **Coarse grid**. Also corner-overlap action, labels, speedpunk                                             |
| `views-editor/src/editor.js`                          | +318/−18 | **Skeleton** (tool + panel + actions) ≫ measure actions, letterspacer                                                     |
| `views-editor/src/panel-transformation.js`            | +259/−24 | **Skeleton** ≈ **point labels**                                                                                           |
| `views-editor/src/edit-behavior.js`                   | +167/−15 | **Coarse grid** (snapping) > ribs, equalize. Kept close to upstream on purpose (R-E)                                      |
| `views-editor/src/edit-tools-pen.js`                  | +125/−2  | **Quad handles** + **pen connect** + skeleton index bookkeeping                                                           |
| `fontra-core/src/glyph-controller.js`                 | +67/−0   | **Skeleton** only — selection bounds parse skeleton keys                                                                  |
| `fontra-webcomponents/src/range-slider.js`            | +53/−10  | **Skeleton panel** — `allowInputBeyondRange`, `displayValue`, `values`, `step`                                            |
| `fontra-webcomponents/src/ui-form.js`                 | +56/−0   | **Skeleton panel** — passes those slider options through; adds checkbox with indeterminate                                |
| `views-editor/src/panel-selection-info.js`            | +24/−1   | Hosts **letterspacer** + **skeleton-defaults** sub-panels                                                                 |
| `fontra-core/assets/lang/en.js`                       | +107/−0  | skeleton-parameters 73, designspace-navigation 11, letterspacer 7, realtime shortcuts 5, skeleton tool 6                  |

Small shared edits worth knowing about:

| File                                | +/−     | Why                                                                   |
| ----------------------------------- | ------- | --------------------------------------------------------------------- |
| `fontra-core/src/utils.ts`          | +14/−6  | `parseSelection` must not `parseInt` compound skeleton keys           |
| `fontra-core/src/var-glyph.js`      | +3      | `customData` survives glyph copy — skeleton persistence depends on it |
| `fontra-core/src/var-path.js`       | +8/−2   | `copy()` tolerates a Proxy-wrapped `coordinates`                      |
| `fontra-core/src/path-functions.js` | +45/−12 | quad handles + corner-overlap entry                                   |
| `fontra-core/src/mouse-tracker.js`  | +2/−1   | —                                                                     |

---

## 5. Cross-cutting infrastructure

### Persistence — `fontra.internal` customData

One key, three sections (`fontra-core/src/fontra-internal-schema.js`):

```js
FONTRA_INTERNAL_KEY = "fontra.internal";
FONTRA_INTERNAL_SECTIONS = { LETTERSPACER, SKELETON, SKELETON_DEFAULTS };
```

Access **only** through `fontra-core/src/fontra-internal-data.js`
(`getFontraInternalSection` / `setFontraInternalSection`), tested in `test-fontra-internal-data.js`.
customData is freeform and round-tripped by every Fontra backend, so this lands permanently in
users' project files (`.fontra` / `.designspace` / UFO lib).

### The one backend change

`src/fontra/core/classes.py` — **a single line**:

```python
class StaticGlyph:
    customData: CustomData = field(default_factory=dict)
```

Skeleton data is per-layer, and `StaticGlyph` had no `customData` upstream. Mirrored in
`src-js/fontra-core/src/classes.json` (+4).

> ⚠️ `classes.json` is **generated**. Regenerating it from an ambient Python environment
> silently reverts this. See the memory note on the venv layout — the venv imports this repo's
> `src`; ambient `python` may import a stale clone.

### App-level settings

`fontra-core/src/application-settings.js` (+9) — SpeedPunk and coarse-grid view preferences via
`applicationSettingsController` (localStorage). Deliberately **not** per-font (D9).

### Assets

`assets/images/skeleton-pen.svg`, `assets/tabler-icons/bone.svg` (skeleton),
`assets/tabler-icons/spacing-horizontal.svg` (letterspacer).

### Test fixture font

`test-py/data/fonts/SkeletonRendering.fontra/` — a glyph with skeleton data, for rendering checks.

---

## 6. Test coverage map

`cd src-js/fontra-core && npm test` — currently **1391 tests**.

| Feature                             | Automated                                                                                   | Manual only                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Coarse grid                         | presets math                                                                                | panel, snapping feel                                        |
| Q-measure                           | measure math                                                                                | overlay, hover, key handling                                |
| SpeedPunk                           | sampling math                                                                               | comb rendering, sliders                                     |
| Tunni                               | all math + tension                                                                          | drag, equalize, layers                                      |
| Letterspacer                        | engine + persistence round-trip                                                             | panel, apply, overlay                                       |
| Skeleton                            | model, generator (+ golden masters), modifiers, ribs, tunni, source defaults, interpolation | **all interaction** — drag, marquee, transform, tool, panel |
| Corner overlap / quad / pen-connect | none                                                                                        | all                                                         |

The asymmetry is structural, not an oversight: `views-editor` has no harness by forkra
convention. That is why every editor-side plan carries an explicit manual test matrix, and why
"I ran the bundle" is not evidence that an interaction works.

---

## 7. Known gaps and residue

**Live queue:** `notes/2026-07-06-parity-bugs.md` is authoritative. Open at time of writing:

| Item            | Summary                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------- |
| 4.4             | Skeleton + basic contour multi-select UX needs rework                                        |
| 4.9             | Drag crosshair missing for skeleton objects                                                  |
| 4.10            | Panel should show all skeleton parameters for any skeleton selection                         |
| 4.11            | No "reset both ribs" button for a selected skeleton point                                    |
| 4.12            | **Q-measure ignores the skeleton** (big) — overlaps 5.1/5.2                                  |
| 5.1 / 5.2 / 5.3 | Old-architecture branches still to adapt: width-highlight, q-metrix-drag, z-mod-for-editable |
| 6.10            | Detached handles "shiver" when adjusting skeleton handles (investigated, unresolved)         |
| 4.13            | Fixed 2026-07-21 — **manual test matrix still owed**                                         |

**Structural debt, not yet filed as bugs:**

1. **Rib and editable-generated entries do not implement `makeChangeForTransformation`** — they
   return `null`. A rib-only marquee selection draws a transform box that does nothing.
2. **Corner-overlap debug logging** — `console.log` in `path-functions.js:1225` and a block of
   validation `console.log`/`console.warn` in `scene-controller.js:~2033–2087`. Bring-up cruft
   from a pre-program feature.
3. **Letterspacer ↔ skeleton coupling** (roadmap WS-16) — verify whether sidebearing changes
   move skeleton data before assuming it works.
4. **`skeleton-generator.js` is 5,168 lines.** Justified by the port, but it is the single
   largest file in the fork and the roadmap's own P6 warns about monoliths.

---

## 8. Delegation recipes

Minimal reading sets for the most likely next tasks. Each assumes §2 (rails) has been read.

**"Add a skeleton parameter to the panel"**
`skeleton-model.js` (accessor) → `skeleton-panel-model.js` (summarize across selection) →
`skeleton-panel-edits.js` (write via `editSkeleton`) → `panel-skeleton-parameters.js` (widget) →
`lang/en.js`. Never call the generator or write customData directly (R-C).

**"Make feature X skeleton-aware"** (e.g. 4.12, Q-measure)
`scene-model.js` for the hit-test → `skeleton-model.js` for geometry (rib positions, normals —
do **not** recompute them) → the feature's own interaction module. Provenance lookups go through
`skeleton-generated.js`, never geometry matching (R-D).

**"Fix a skeleton editing behavior"**
`skeleton-editing.js` (target entries) → `skeleton-modifiers.js`, both copies → the relevant
executor in `skeleton-ribs.js` / `skeleton-generated.js`. If the fix wants a branch inside
`makeChangeForDelta`, it is the wrong fix (R-E).

**"Change generated outline geometry"**
`skeleton-generator.js` + `test-skeleton-generator.js`. TDD is available and expected here.
Watch generated **point count stability** — it must stay constant across parameter values, or
cross-master interpolation breaks.

**"Add a visualization"**
New draw in the feature's `visualization-layer-*.js`; register in
`visualization-layer-definitions.js` with `draw: <importedFn>` only.

---

## Maintaining this doc

Update it when a feature gains or loses a file, when a selection kind changes, or when a rail
gets an exception. It is verified by construction — every path, count and export above came from
`git diff upstream/main...HEAD` and greps against the tree on 2026-07-22, not from the older
planning docs. Re-verify the same way rather than trusting this text; per the roadmap's own rule,
never trust a document over the code.
