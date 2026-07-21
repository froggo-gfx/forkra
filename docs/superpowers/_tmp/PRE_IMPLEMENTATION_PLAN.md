# Forkra Improvement Plan — Adopting Skeleton's Good Decisions
### Pre-implementation analysis (no code changed yet)

**Date:** 2026-06-28
**Goal:** For features present in **both** forks, identify what `skeleton` does better and outline how to bring those improvements **into `forkra`**.
**Explicitly out of scope:** the skeleton tool itself, the pointer/edit-behavior refactor, and Q-measure / Distance-Angle (superseded by Q-measure in skeleton — your call, deferred).

---

## 0. Method
Direct file-by-file comparison of the two forks' `src-js`. Key structural facts established:

- **`fontra-core/src/curvature.js` is byte-identical** in forkra and skeleton → Speedpunk's *core math* is not the difference.
- **Tunni was genuinely refactored in skeleton:** `tunni-calculations.js` went **1346 → 355 lines** (pure math), interaction was extracted into a new **`tunni-interactions.js` (1101 lines)**, and label drawing moved into `visualization-layer-definitions.js`.
- **Tension math is duplicated in forkra:** `calculateTension()` exists in `distance-angle.js:162`, while `tunni-calculations.js` recomputes tension inline (its `distance-angle` imports are commented out, lines 3–12) and there's tangled two-way coupling between those two files.

---

## 1. Executive summary

| # | Feature | Verdict | Action in forkra |
|---|---------|---------|------------------|
| 1 | Speedpunk | **Skeleton better** | Port panel controls + settings-driven rendering. Core math unchanged. |
| 2 | Tunni lines | **Forkra is a mess** | Adopt skeleton's 3-layer separation, create one tension/geometry source of truth, fix naming. |
| 3 | Equalize | **Forkra fine** | Do not touch — but protect it during the Tunni refactor (shared file). |
| 4 | Coarse grid | **Skeleton has panel** | Copy skeleton's accordion panel; wire to forkra's existing settings/actions. |
| 5 | Point labels | **Forkra is a mess** | Relocate out of the math file, rename, consume central math. |
| 6 | Distance/Manhattan | Superseded by Q-measure | **Out of scope** (no action). |

---

## 2. Per-feature analysis

### 2.1 Speedpunk — port skeleton's panel & parameterised rendering
**Forkra today**
- `fontra-core/src/curvature.js` — math (identical to skeleton).
- `visualization-layer-definitions.js:1794` `fontra.curvature` ("SpeedPunk") layer with **hard-coded** multipliers (e.g. `* -180000`), **no UI**, no persistence.
- `panel-designspace-navigation.js` — **zero** speedpunk controls.

**Skeleton's better decision**
- `panel-designspace-navigation.js` — a **SpeedPunk accordion** (`speedpunk-accordion-item`): display toggle + **peak-height**, **sharpness**, **opacity** inputs (lines ~283–343).
- **Per-font persisted settings** read off the font entity (`_getFontSpeedPunkSettingsFromEntity` → `.speedpunk` = `{ peakHeightUpm, sharpness, opacity }`).
- **Normalization helpers** (`_normalizeSpeedPunkPeakHeightUpm`, `_normalizeSpeedPunkSharpness`, `_normalizeSpeedPunkOpacity`) — peak height is **UPM-relative**, which is the "more advanced maths": the comb render is driven by normalized, font-scaled parameters instead of magic constants.
- `fontra.curvature` layer at `visualization-layer-definitions.js:1885` reads those settings to scale the combs.

**Recommendation:** Port (a) the accordion UI, (b) the settings storage + normalization, (c) the settings-driven render in the `fontra.curvature` layer. Leave `curvature.js` alone. Add the `sidebar.designspace-navigation.speedpunk.*` lang keys.
**Risk:** Low–medium. Self-contained; main work is settings plumbing + persistence schema.

---

### 2.2 Tunni lines — the big refactor

**Forkra today (the mess)** — `fontra-core/src/tunni-calculations.js` (1346 lines) mixes **three concerns**:
- *Drawing:* `strokeLine` (15), `drawRoundRect` (22), `drawTunniLabels` (315, ~290 lines).
- *Math:* `calculateTunniPoint` (42), `calculateTrueTunniPoint` (65), `calculateControlPointsFromTunni` (99), `calculateEqualizedControlPoints` (186), `balanceSegment` (223), `areDistancesEqualized` (267), `calculateControlHandleDistance` (284), `calculateOnCurvePointsFromTunni` (1293).
- *Interaction / hit-test:* `findTunniPointHit` (604), `handleTunniPointMouseDown/Drag/Up` (750/953/964), `tunniLayerHitTest` (987), `handleTrueTunniPointMouseDown/Drag/Up` (1049/1250/1261), `calculateTunniPointDragChanges` (866), `calculateTrueTunniPointDragChanges` (1152).

Plus: **tension recomputed inline** (no single source), and **tangled coupling** — `distance-angle.js` imports from `tunni-calculations.js`, and `tunni-calculations.js` has commented-out imports back from `distance-angle.js`. Consumers: `edit-tools-pointer.js`, `visualization-layer-definitions.js`, `distance-angle.js`.

**Skeleton's better decision (architecture to adopt — the "100% good direction")**
- `fontra-core/src/tunni-calculations.js` (**355 lines, pure math only**): `calculateTunniPoint`, `calculateTrueTunniPoint`, `calculateControlPointsFromTunni`, `calculateEqualizedControlPoints`, `balanceSegment`, `areDistancesEqualized`, `calculateControlHandleDistance`, `calculateOnCurvePointsFromTunni`, `snapToGrid`. **No drawing, no hit-testing.**
- `views-editor/src/tunni-interactions.js` (1101 lines): hit-tests + drag handlers.
- `drawTunniLabels` lives in `visualization-layer-definitions.js:2809` (delegates to a `drawTunniSegmentLabels` helper).

> ⚠️ **Don't copy skeleton's `tunni-interactions.js` verbatim** — it's heavily skeleton-coupled (`calculateSkeletonTunniPoint`, `calculateSkeletonTrueTunniPoint`, `skeletonTunniHitTest`, `buildSkeletonTunniSegment`). Take the **structure** and the **non-skeleton handlers**; drop the skeleton-rib wrappers.

**Target architecture for forkra**
```
fontra-core/src/tunni-calculations.js   ← PURE MATH + single tension source of truth
   ├─ geometry: tunni point, control-handle point, control-points-from-tunni
   ├─ tension:  ONE calculateSegmentTension()  (de-duplicate vs distance-angle.js)
   └─ equalize: calculateEqualizedControlPoints / areDistancesEqualized (feeds §2.3)

views-editor/src/tunni-interactions.js   ← hit-tests + drag handlers (consume math)
   └─ imported by edit-tools-pointer.js

views-editor/src/visualization-layer-definitions.js  ← drawTunniLabels / lines (consume math)
```

**Single source of truth for tension/curve math (core ask):** create **one** `calculateSegmentTension(segment)` in `tunni-calculations.js`; have the labels (visualization), the canvas controls (interaction), and `distance-angle.js` all import it. Remove the inline recompute and decide whether `distance-angle.js:calculateTension` becomes a thin re-export or is deleted (D5: deleted). **Note the dedupe is broader than tension:** `distance-angle.js` also duplicates the tunni-point geometry itself (`calculateTrueTunniPoint`, `calculateTunniPointz`) — fold those into the same single-source cleanup (see §2.6 and D5).

**Naming fix (the "tunni point" mislabel)** — confirmed in code: `calculateTunniPoint` returns the **midpoint between the two control points** ("a point along the line segment between the two control points… the midpoint"), while `calculateTrueTunniPoint` is the **real** Tunni point (intersection of the on-curve tangent rays). So:

| Concept (geometry) | Current (wrong) name | Proposed name |
|---|---|---|
| Intersection of tangent rays = **the real Tunni point** | `calculateTrueTunniPoint` / "Actual TUNNI Points" / `fontra.tunni.actual.points` | **Tunni point** (`calculateTunniPoint`, `fontra.tunni.point`) |
| Midpoint between the two control handles (drag handle, **not** a Tunni point) | `calculateTunniPoint` / "TUNNI Lines and Points" / `fontra.tunni.combined` | **Control-handle point** (`calculateControlHandlePoint`, e.g. `fontra.tunni.handle`) — *final name your call* |

This rename cascades through: function names, the `handle(True)TunniPoint*` handlers, layer identifiers + display names, and scene-setting keys. **Decide back-compat:** hard-rename vs. keep old layer identifiers as aliases (saved visualization-layer on/off state keys off the identifier string).

**Pointer file must be cleaned of Tunni (essentially fully).** `edit-tools-pointer.js` carries **+259 fork-added lines over upstream (~27% bloat), ~97% of it Tunni** — hover detection, cursor handling, hit-test dispatch, and a **190-line inline drag/undo loop** (builds `=xy` changes + rollback records for both the real Tunni point and the control-handle case). All of this belongs in `tunni-interactions.js`. After extraction the pointer's fork footprint should collapse to **just an import + a couple of early-return dispatch hooks** in `handleHover`/`handleDrag`. Note the Ctrl+Shift **equalize trigger (~8 lines) is embedded inside the Tunni drag block**, so it rides along with the extraction even though equalize itself (§2.3) is otherwise untouched. (~27% of the added lines are comments/blanks — verbose narration that can be trimmed.)

**Risks:** Highest of the set. `edit-tools-pointer.js` imports the interaction handlers (update import paths post-move); the equalize math (§2.3) shares this file; the `distance-angle.js ↔ tunni` coupling must be untangled. **Do this with tests** (skeleton ships `test-edit-behavior-factory.js` as a reference fixture worth a look).

---

### 2.3 Equalize — leave alone, but treat as a constraint
Forkra's equalize is fine and **must not change behaviour**. Its math (`calculateEqualizedControlPoints`, `areDistancesEqualized`, `balanceSegment`) currently lives **inside** `tunni-calculations.js` and is consumed by `edit-tools-pointer.js` (`equalizeSegmentDistances`). The Tunni refactor (§2.2) moves code around these functions — **keep their signatures/exports stable** and regression-test equalize after the refactor. No feature work here.

---

### 2.4 Coarse grid — copy skeleton's panel
**Forkra today:** feature works (snapping in `edit-behavior.js`, `f`/`g` actions + `coarseGridSpacing` in `scene-controller.js`, `fontra.coarse.grid` layer) but **no panel UI**.
**Skeleton:** full **Coarse Grid accordion** in `panel-designspace-navigation.js` (`coarse-grid-accordion-item`, lines ~353–432): display toggle, spacing input, **custom toggle + custom base/increment fields**, backed by `_coarseGridSettings` state + apply logic.
**Recommendation:** Port the accordion and its handlers; wire to forkra's **existing** `coarseGridSpacing` scene setting and `decrease/increase-coarse-grid` actions. Mostly mechanical. **Risk:** Low. Good warm-up task.

---

### 2.5 Point labels — relocate + rename + de-duplicate
**Forkra today:** `drawTunniLabels` sits in `tunni-calculations.js:315` (a **math** file) and recomputes tension inline. Name "Tunni Labels" is misleading — they're per-segment **distance / tension / angle** labels.
**Skeleton:** label drawing moved to `visualization-layer-definitions.js:2809` (`drawTunniLabels` → `drawTunniSegmentLabels`).
**Recommendation:** Move forkra's label rendering into `visualization-layer-definitions.js`; have it **consume the central tension function** (§2.2) instead of recomputing; give it accurate naming (e.g. "Segment labels" / "Point labels"). Keep the `showTunniDistance/Tension/Angle` settings (rename consistently if you also rename the Tunni layers). **Depends on §2.2.** **Risk:** Low once §2.2 lands.

---

### 2.6 Distance / Manhattan — out of scope
Superseded by Q-measure in skeleton; per your direction, no action this round. (For reference: forkra's `fontra.distance-angle` + `fontra.manhattan-distance` layers and `distance-angle.js` remain; note `distance-angle.js` is entangled with the §2.2 dedupe **beyond just `calculateTension`** — it also holds duplicate tunni-point geometry `calculateTrueTunniPoint` (≈1058) and `calculateTunniPointz` (≈1173, used ≈1250), all of which the §2.2 / D5 cleanup removes and routes to `tunni-calculations.js`.)

---

## 3. Suggested sequencing

1. **Coarse-grid panel (§2.4)** — independent, low risk, mechanical. Good first PR to establish the panel-porting pattern.
2. **Speedpunk panel (§2.1)** — independent, medium; introduces the per-font settings/normalization pattern.
3. **Tunni refactor (§2.2)** — the core, highest risk. Land behind tests; do the naming cascade in the same pass.
4. **Point labels (§2.5)** — depends on §2.2; finishes the Tunni cleanup.
5. **Regression-check Equalize (§2.3)** after §2.2.

Rationale: 1–2 are safe parallelizable wins; 3 is the keystone that 4 depends on; 5 is verification.

---

## 4. Open decisions for you (needed before implementation)

1. **Name for the "control-handle point"** (midpoint between handles, currently mis-named "tunni point"). Proposed: `control-handle point`. Alternatives: "handle balance point", "control midpoint".
2. **Layer-identifier back-compat:** hard-rename `fontra.tunni.combined` / `fontra.tunni.actual.points`, or keep old identifiers as aliases so users' saved layer on/off state survives?
3. **Tension home:** put the single `calculateSegmentTension` in `tunni-calculations.js` and make `distance-angle.js` import it (deleting its own `calculateTension`) — confirm that's acceptable given Distance/Angle is "out of scope" but shares the function.
4. **File name:** keep `tunni-calculations.js` (purified to math-only) or rename to `tunni-math.js`?
5. **Settings-key renames** (`showTunni*`): rename for clarity or keep for stability?

---
---

# Part C — New feature ports from Skeleton (not present in Forkra)

Unlike §2 (refactors of features forkra already has), these are **additive ports**: bring the skeleton feature into forkra and **strip skeleton-only coupling**. Both features operate on **regular *and* skeleton points**, so for forkra we keep the regular-point paths and drop the skeleton branches — they degrade to no-ops on regular glyphs anyway. These are **direct ports, not adjustments**.

## C.1 Letterspacer (automatic sidebearings — HTLetterspacer port)

**Files to port**
| File | Role |
|---|---|
| `views-editor/src/panel-letterspacer.js` (~1662 ln) | Engine (area/margin math) + sidebar panel (area/depth/overshoot/reference/reverse, apply/LSB/RSB) |
| `views-editor/src/visualization-layer-letterspacer.js` (~147 ln) | Margin/area overlay |
| `fontra-core/src/fontra-internal-data.js` + `fontra-internal-schema.js` | **Persistence helpers** (see caveat) |
| `fontra-core/assets/tabler-icons/spacing-horizontal.svg` | Sidebar icon |
| `fontra-core/assets/lang/*.js` | `sidebar.letterspacer.*` keys |
| `views-editor/src/editor.js` | Register the panel in the sidebar |

**Persistence caveat (your recollection — confirmed and made precise).** There is **no Python/backend component** — all code is in `src-js`. The "permanent data in project files" works by writing a customData blob under key **`"fontra.internal"`** → section **`letterspacer`**, at **three entity levels**:
- per **source** → `area`, `depth`, `overshoot` (`setFontraInternalSection(source, …)`)
- **font**-level → `enabled`
- per **glyph** → `referenceGlyphName`

`customData` is freeform and round-tripped by every Fontra backend, so this lands **permanently in the user's project files** (`.fontra` / `.designspace` / UFO lib). That's the out-of-`src-js` footprint — it's *data*, not *code*. **No backend change required.**

**Skeleton coupling to strip:** the `import { getSkeletonData, moveSkeletonData, setSkeletonData } from skeleton-contour-generator.js` (lines 10–13) and the optional `if (skeletonData && deltaLSB)` branch (~lines 729–733) that also shifts skeleton data. On regular glyphs `getSkeletonData()` returns null and the branch already no-ops → safe to delete the import + branch. The area-based margin math is skeleton-agnostic. The shared schema also reserves `SKELETON`/`SKELETON_DEFAULTS` sections — for forkra trim to just `LETTERSPACER` (or leave them; harmless).

**Risk:** Medium — self-contained UI + math, but it introduces a **new persistence surface** (a `fontra.internal` customData schema) into users' fonts. Test save/load round-trip.

## C.2 Q-measure (realtime "hold-Q" measurement)

**Files/pieces to port**
| File | Role |
|---|---|
| `views-editor/src/editor.js` | Register topic `realtime-hotkeys` + actions `action.realtime.measure` (**Q**), `action.realtime.measure-direct` (**Alt+Q**) |
| `views-editor/src/edit-tools-pointer.js` | keydown/keyup → `setMeasureActive(true/false)` + `clearMeasureHover()` (small footprint; **no dedicated measure file in skeleton**) |
| `views-editor/src/scene-model.js` | measure-hover state (`measureHoverSegment`, `measureHoverPoints`, `measureHoverHandle`) + `setMeasureActive()` / `clearMeasureHover()` |
| `views-editor/src/visualization-layer-definitions.js` | layer `fontra.measure.overlay` ("Measure Overlay", zIndex 650) |
| `fontra-core/src/distance-angle.js` | helpers `calculateHandleMeasure`, `calculateProjectedDistanceComponents` |
| `fontra-core/assets/lang/*.js` | `action-topics.realtime-hotkeys`, `shortcuts.realtime.measure(-direct)` |

**Skeleton coupling to strip:** the rib realtime hotkeys (`rib-tangent`=Z, `fixed-rib`=D, `fixed-rib-compress`) — skip entirely; the `measureHoverRibPoint` state and any rib branches inside the measure-overlay drawing.

**Architecture notes**
- **Ties to §2.2 pointer cleanup:** skeleton puts the measure key-handling *in the pointer tool*. The toggle footprint is small, but the mousemove hover-detection that populates `measureHover*` may also touch the pointer — verify during implementation. To honor the lean-pointer goal, consider a `measure-interactions.js` module mirroring `tunni-interactions.js`. Optional; skeleton's inline approach is modest.
- **Distance/Angle overlap:** Q-measure reuses `distance-angle.js`, which you scoped *out* for the Distance/Manhattan layers. Porting Q-measure therefore keeps `distance-angle.js` in forkra (for `calculateHandleMeasure` / `calculateProjectedDistanceComponents`) even though the Distance/Manhattan *visualization layers* remain out of scope.
- **X-equalize (`action.realtime.equalize`, key X):** same realtime framework, but you flagged it redundant with the existing Ctrl+Shift equalize. **Optional** — include only if you want the hold-X variant.

**Risk:** Low–medium. Mostly mechanical; main care is stripping rib branches and managing the `distance-angle.js` overlap.

## C.3 Sequencing & added decisions

- **Sequencing:** both ports are **independent of the Tunni refactor (§2.2)** and of each other — schedulable anytime. Letterspacer is the larger/riskier (persistence); Q-measure is mechanical. Reasonable order: Q-measure (mechanical warm-up) → Letterspacer (after you've decided the persistence question).
- **New decisions for §4:**
  1. **OK to write a `fontra.internal` customData blob into users' fonts?** (Letterspacer persistence — irreversible footprint in saved projects.)
  2. **Include realtime X-equalize**, or measure-only?
  3. **Q-measure handling location:** inline in the pointer (skeleton's way) or a new `measure-interactions.js` (consistent with the §2.2 lean-pointer goal)?

---
---

# Part D — Decision Log (LOCKED — 2026-06-28)

**This supersedes the open-question lists in §4 and §C.3.** All locked except where noted.

| # | Decision | Resolution |
|---|----------|------------|
| **D1** | Persistence model | Adopt `fontra.internal` **customData** for **Letterspacer** — written at **font + source (master) + glyph** levels. *Already implemented* in skeleton's code (`area/depth/overshoot` per source, `enabled` per font, `referenceGlyphName` per glyph). Panel view-prefs handled separately under **D9**. |
| **D2** | Mid-handle point name | **`control-handle point`** (the midpoint-between-controls, formerly mislabeled "tunni point"). |
| **D3** | Reclaim "Tunni point" | **Yes** — the real (tangent-ray intersection) point becomes the canonical **"Tunni point"**; the `trueTunniPoint` / "Actual TUNNI" naming is retired. |
| **D4** | Layer identifiers | **Hard-rename** `fontra.tunni.*` — **no** back-compat aliases. |
| **D5** | Tension single source of truth | One `calculateSegmentTension` in the tunni math file; **`distance-angle.js` imports it** and its own `calculateTension` is deleted (along with that function's leftover `console.log` debug blocks). **Verified wider scope:** `distance-angle.js` also duplicates *tunni-point geometry* — `calculateTrueTunniPoint` (≈1058) and `calculateTunniPointz` (≈1173, used ≈1250). These are deleted too and routed to the canonical `tunni-calculations.js` functions. |
| **D6** | Math file name | **Keep `tunni-calculations.js`** (it already exists in forkra), purified to math-only. (A *new* file would have been named `*-math.js`; not applicable here.) |
| **D7** | Tunni settings keys | **Rename** (`showTunni*` → consistent new names, alongside D8). |
| **D8** | "Tunni Labels" feature | They are **point labels** → rename to **"Labels" / "Point labels"** (NOT "segment labels"). |
| **D9** | Speedpunk + Coarse-grid panel settings | **App-level / global** (via `applicationSettings`) — view preferences, **not** per-font; **nothing written to project files**. (Overrides the earlier "master-wise" idea; revisit only if you want per-master.) |
| **D10** | Realtime X-equalize | **Skip** — redundant. (Note: the kept equalize is **alt-drag**, not ctrl-shift.) Port **measure-only**. |
| **D11** | Q-measure handler location | New **`measure-interactions.js`** module (keeps the pointer lean, per §2.2). |

**Net effect on persistence:** only **Letterspacer** writes into users' project files (`fontra.internal` customData); Speedpunk and Coarse-grid panel prefs stay app-global. So the one "permanent data" footprint to consciously accept is Letterspacer's.

---
---

# Part E — `visualization-layer-definitions.js` cleanup

**Guiding principle (your directive):** this file should contain **only rendering + layer registration**. *All functional, non-rendering code* (math, curve sampling, geometry, hit-testing) must move into proper modules. The file's job is to register layers and stroke pixels — nothing else.

## E.1 Scope of the mess
Forkra added **+734 lines / −0** to upstream's 1861-line file → **2594 lines (~39% bloat)**, pure insertion. ~23% of the added lines are blank/comment (111 blank + 60 comment); only 1 `console.log` (cleaner than the pointer file).

| Feature block | ~Lines | Draw fn location | Contains non-rendering code? |
|---|---|---|---|
| Imports (tunni-calc, curvature, var-path, distance-angle) | 39 | — | — |
| **SpeedPunk / curvature** | **~456 (62%)** | **inline** (`fontra.curvature`, 1794) | **Yes — heavy** |
| Tunni combined (`drawTunniCombined`, 2424) | ~98 | **inline** | Yes |
| Tunni actual points (`drawActualTunniPoints`, 2518) | ~53 | **inline** | Yes |
| Coarse grid (`fontra.coarse.grid`, 2359) | ~43 | inline | Minor (spacing math) |
| Distance & Angle (`fontra.distance-angle`, 2553) | ~15 | **imported** (`drawDistanceAngleVisualization`) | No ✅ |
| Manhattan (`fontra.manhattan-distance`, 2568) | ~15 | **imported** (`drawManhattanDistanceVisualization`) | No ✅ |
| Tunni labels (`fontra.tunni.labels`, 2583) | ~12 | **imported** (`drawTunniLabels`) | No ✅ |

## E.2 The core problem: inconsistent structure
Three fork layers already do it right — **thin registration + `draw: <importedFn>`** (Distance/Angle, Manhattan, Tunni-labels delegate to functions in `distance-angle.js` / `tunni-calculations.js`). But the three biggest blocks (**SpeedPunk, Tunni-combined, Tunni-actual**) **define fat draw functions inline**, with functional math baked into them. That inconsistency is the mess.

**Non-rendering code that must move out:**
- **SpeedPunk sampling helpers (~87 ln, 100% non-rendering):** `calculateSegmentBudget`, `estimateCurveLength`, `adjustStepsForCurve`, `countCurveSegments` — pure math sitting at module scope in the viz file. → move to `curvature.js` (or a `speedpunk-sampling.js`).
- **SpeedPunk inline draw (~366 ln):** mixes curvature **sampling/normalization** (functional — global range passes, per-segment sampling, color-stop mapping) with the actual stroke/fill. → extract a `computeSpeedPunkSamples()` into the math module; leave only the stroke/fill in the layer. (This is also where the §2.1 *parameterization* — peak-height/sharpness/opacity from settings — slots in.)
- **`drawTunniCombined` / `drawActualTunniPoints`:** already import `calculateTunniPoint`/`calculateTrueTunniPoint`, but carry inline hit-area/geometry math. → push remaining geometry into `tunni-calculations.js`; keep only drawing. (Folds into the §2.2 Tunni refactor + the D2–D8 renames — these two layers are exactly `fontra.tunni.combined`/`.actual.points` being hard-renamed.)
- **Coarse grid:** verify no spacing/rounding math inline; if present, move to the grid helper.

## E.3 Target end-state
Every fork layer matches the clean pattern already used by Distance/Manhattan/Labels:
```
registerVisualizationLayerDefinition({
  identifier: "...",
  name: "...",
  draw: <importedRenderFn>,   // render-only; pulls math from the feature module
});
```
- `visualization-layer-definitions.js` keeps **layer registrations + pure render functions** only.
- Functional code lands in: `curvature.js`/speedpunk-sampling (SpeedPunk), `tunni-calculations.js` (Tunni geometry/tension — per §2.2), the grid helper (coarse grid), `distance-angle.js` (already done).
- Expected shrinkage: most of the ~456 SpeedPunk lines and the inline portions of the Tunni draws leave the file; the registrations + thin renderers remain.

**Risk:** Medium. SpeedPunk extraction is the bulk; do it alongside §2.1 (panel/parameterization) so sampling is touched once. Tunni-layer cleanup is part of §2.2 and inherits the D2–D8 renames.

## E.4 How much does borrowing from Skeleton cover? (verified)
| Concern | Skeleton already does it? | Notes |
|---|---|---|
| Tunni math/interaction split (§2.2) | **Yes** | `tunni-calculations.js` is pure math (355 ln) + `tunni-interactions.js` for interaction — port the structure. |
| Tunni viz cleanup (Part E) | **Mostly** | Skeleton's `drawTunniCombined`/`drawActualTunniPoints` already live in the viz file as **rendering that imports the pure-math functions** (`calculateTunniPoint`/`calculateTrueTunniPoint`). Remaining forkra work = D2–D8 renames + tension de-dup + strip skeleton coupling. |
| SpeedPunk panel + parameterization (§2.1) | **Yes** | Port the accordion + settings + normalization. |
| **SpeedPunk non-rendering extraction (Part E)** | **No** | `curvature.js` is byte-identical; the sampling helpers (`calculateSegmentBudget`, `estimateCurveLength`, `adjustStepsForCurve`, `countCurveSegments`) are **still inline in skeleton's viz file too** (its curvature draw is even bigger). This extraction is **net-new in forkra** — and must be done **during** the §2.1 port, or porting skeleton's parameterized SpeedPunk will *add* more inline code, not less. |
