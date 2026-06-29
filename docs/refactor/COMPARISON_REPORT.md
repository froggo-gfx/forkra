# Fontra Fork Comparison Report — `original` vs `forkra`

**Date:** 2026-06-28
**Scope:** `src-js/` only (all fork material lives here; differences elsewhere are size/date noise and were ignored).

---

## 1. Methodology & an important caveat

`original` is a fresh clone of upstream Fontra with the **latest** updates, while `forkra`
is a fork branched off an **older** upstream commit. A raw `diff -qr` of the two `src-js`
trees therefore mixes **two completely different kinds of change**:

- **(A) Fork features** — functionality you added. *This is what the report documents.*
- **(B) Upstream drift** — changes upstream made *after* you forked. These are **not**
  your features and should be ignored.

To avoid mislabeling upstream drift as fork work, the following diffs were identified as
**upstream-only churn (NOT fork features)** and excluded:

| Upstream change | Evidence |
|---|---|
| TypeScript → JS migration | `forkra` has `utils.js`, `rectangle.js`, `observable-object.js`; `original` has the newer `.ts` versions |
| `cross-axis-mapper.js` → `cross-axis-mapping.js` | upstream rename |
| `character-lines.js` / `glyph-lines.js` | upstream rename/refactor |
| `glyphsets-controller.js`, `glyphsets-ui.js`, `shaper-controller.js`, `local-font-engine.js`, `fontra-backend.js`, `opentype-tags.js`, `panel-characters-glyphs.js` | new **upstream** files absent from forkra (forkra predates them) |

The fork's own additions were then confirmed by (1) **new files unique to forkra** and
(2) **keyword tracing** (`speedpunk/curvature`, `tunni`, `equalize`, `coarse`,
`distance/angle`, `overlap`) through the modified files.

---

## 2. Fork features you listed — file locations

### Feature 1 — SpeedPunk (curvature combs)
Visualizes curvature combs along outlines (adapted from the Speed Punk Python plugin).

| Role | File | Notes |
|---|---|---|
| **Core math (NEW)** | `fontra-core/src/curvature.js` | cubic/quadratic bezier solvers, curvature sampling, `curvatureToColor` |
| Visualization layer | `views-editor/src/visualization-layer-definitions.js` | layer `fontra.curvature`, display name **"SpeedPunk"** (≈ lines 1792–2160); imports `curvatureToColor` from `curvature.js` |

### Feature 2 — Tunni lines & points
Interactive Tunni-line editing (drag Tunni points to adjust both handles symmetrically).

| Role | File | Notes |
|---|---|---|
| **Core (NEW, ~1346 lines)** | `fontra-core/src/tunni-calculations.js` | `calculateTunniPoint`, `calculateTrueTunniPoint`, mouse down/drag/up handlers, `tunniLayerHitTest`, drawing helpers |
| Visualization layers | `views-editor/src/visualization-layer-definitions.js` | `fontra.tunni.combined` ("TUNNI Lines and Points", ≈2402) and `fontra.tunni.actual.points` ("Actual TUNNI Points", ≈2500) |
| Pointer-tool integration | `views-editor/src/edit-tools-pointer.js` | imports `handleTunniPointMouseDown/Drag/Up`, `tunniLayerHitTest`, true-Tunni-point handlers; hit-tests Tunni points when those layers are active (≈ lines 44–110) |

### Feature 3 — Equalize (alt-drag / Ctrl+Shift)
Equalizes control-point distances of a segment.

| Role | File | Notes |
|---|---|---|
| Edit behavior | `views-editor/src/edit-behavior.js` | `Equalize` transform (≈ lines 1137–1156) + entry in the constraint rule table (≈ line 1319) |
| Pointer-tool trigger | `views-editor/src/edit-tools-pointer.js` | imports `calculateEqualizedControlPoints`, `areDistancesEqualized`, `equalizeSegmentDistances`; Ctrl+Shift drag calls `equalizeSegmentDistances` instead of starting a normal drag (≈ lines 50–52, 233–237) |
| Supporting math | `fontra-core/src/tunni-calculations.js` | equalize helper functions live alongside the Tunni math |

### Feature 4 — Coarse grid
A user-settable coarse snapping grid with keyboard size control.

| Role | File | Notes |
|---|---|---|
| Snapping logic | `views-editor/src/edit-behavior.js` | snaps to `window.coarseGridSpacing`; Ctrl/Cmd ⇒ always coarse, arrow keys ⇒ 1-unit (≈ lines 120–138) |
| Settings + actions | `views-editor/src/scene-controller.js` | default `coarseGridSpacing = 10`, key listeners syncing `window.coarseGridSpacing`, and actions `action.decrease-coarse-grid` (**F**) / `action.increase-coarse-grid` (**G**) stepping ±5 within 5–40 (≈ lines 70, 391–491) |
| Visualization layer | `views-editor/src/visualization-layer-definitions.js` | `fontra.coarse.grid`, name **"Coarse Grid"**, `userSwitchable` (≈ line 2359) |

### Feature 5 — Point labels (you call them "Tunni labels" — naming is misleading)
On-canvas labels showing per-segment distance / tension / angle. Implemented under the
"Tunni" naming but functions as general point/segment labels.

| Role | File | Notes |
|---|---|---|
| Visualization layer | `views-editor/src/visualization-layer-definitions.js` | `fontra.tunni.labels`, name **"Tunni Labels"** (≈ line 2583) |
| Controls | `views-editor/src/panel-transformation.js` | "Tunni Labels" control section with `showTunniDistance` / `showTunniTension` / `showTunniAngle` toggles (≈ lines 108–116, 665–675) |

### Feature 6 — Measurement between points (Distance & Angle)
Ported from the Glyphs plugin "Show Distance And Angle".

| Role | File | Notes |
|---|---|---|
| **Core (NEW, ~1490 lines)** | `fontra-core/src/distance-angle.js` | badge/label geometry, color constants, `unitVectorFromTo`, off-curve distance helpers |
| Visualization layer | `views-editor/src/visualization-layer-definitions.js` | `fontra.distance-angle`, name **"Distance & Angle"** (≈ line 2553) |

---

## 3. Fork features you FORGOT (found during the sweep)

### Forgotten A — Corner Overlap / "Add Overlap"
Inserts an overlap at selected corner point(s) — a distinct command, not part of any
feature above.

| Role | File | Notes |
|---|---|---|
| **Core (NEW, ~349 lines)** | `fontra-core/src/corner-overlap.js` | `addOverlap(path, selectedPointIndices)` with extensive `VarPackedPath` validation |
| Action + handler | `views-editor/src/scene-controller.js` | imports `addOverlapToPath`; registers `action.add-overlap` bound to **Cmd/Ctrl + Shift + O**; `doAddOverlap()` implementation (≈ lines 18, 560–566, 1533) |

### Forgotten B — Manhattan Distance overlay
A **separate** visualization layer (distinct from Distance & Angle), drawing axis-aligned
(Manhattan) distance between points.

| Role | File | Notes |
|---|---|---|
| Visualization layer | `views-editor/src/visualization-layer-definitions.js` | `fontra.manhattan-distance`, name **"Manhattan Distance"** (≈ line 2568); shares helpers from `distance-angle.js` |

### Forgotten C — Replace / Remove selected glyph on canvas
Two new menu/keyboard actions for managing which glyph occupies the canvas.

| Role | File | Notes |
|---|---|---|
| Actions | `views-editor/src/scene-controller.js` | `action.replace-selected-glyph-on-canvas` and `action.remove-selected-glyph-from-canvas` (≈ lines 489–512); wired into the menu at ≈ lines 1427–1430 |
| New localization keys | `fontra-core/src/assets/lang/en.js` | `menubar.view.replace-selected-glyph-on-canvas`, `menubar.view.remove-selected-glyph-from-canvas` — both are forkra-only additions |

### Forgotten D — "Actual / True Tunni Points" (sub-mode of the Tunni feature)
Beyond the standard Tunni point, the fork adds a **true/actual** Tunni point with its own
layer (`fontra.tunni.actual.points`) and its own drag handlers
(`handleTrueTunniPointMouseDown/Drag/Up`, `calculateTrueTunniPointDragChanges`,
`calculateTrueTunniPoint`). Listed here in case you consider it a feature in its own right
rather than part of Feature 2.

---

## 4. Quick reference — NEW files unique to `forkra/src-js`

| New file | Feature |
|---|---|
| `fontra-core/src/curvature.js` | SpeedPunk |
| `fontra-core/src/tunni-calculations.js` | Tunni lines/points + equalize helpers |
| `fontra-core/src/distance-angle.js` | Distance & Angle + Manhattan distance |
| `fontra-core/src/corner-overlap.js` | Add Overlap (forgotten A) |

> Note: `utils.js`, `rectangle.js`, `observable-object.js`, `glyph-lines.js`,
> `cross-axis-mapping.js`, `curvature.js`'s sibling renames, etc. that *appear* only in
> forkra are **upstream-drift artifacts** (JS-vs-TS / renames), **not** fork features —
> see §1.

---

## 5. Central hub file

`views-editor/src/visualization-layer-definitions.js` is the single most important
fork-touched file: it registers **7 new visualization layers** (`fontra.curvature`,
`fontra.coarse.grid`, `fontra.tunni.combined`, `fontra.tunni.actual.points`,
`fontra.distance-angle`, `fontra.manhattan-distance`, `fontra.tunni.labels`) and imports
all four new core modules. Start here when tracing any rendered fork feature.

---
---

# Part B — `forkra` vs `skeleton`: non-skeleton additions

**Scope:** find what the `skeleton` fork added **beyond** the skeleton tool itself.

## B.1 Methodology & exclusions

`skeleton` is `forkra` + the skeleton tool + a **large in-progress refactor of the pointer
tool / edit-behavior**. Two classes of change were deliberately **excluded** from the
"added functionality" list below:

- **Skeleton-tool files (expected, not reported):**
  `fontra-core/src/skeleton-contour-generator.js`, `fontra-core/src/fontra-internal-data.js`,
  `fontra-core/src/fontra-internal-schema.js`, `views-editor/src/edit-tools-skeleton.js`,
  `panel-skeleton-parameters.js`, `skeleton-source-defaults.js`,
  `skeleton-visualization-layers.js`, `assets/images/skeleton-pen.svg`, the
  `action.*-skeleton-contour` actions, and the `rib-tangent` / `fixed-rib` /
  `fixed-rib-compress` realtime hotkeys (the "rib" terminology is skeleton-specific).
- **Pointer/edit-behavior refactor churn (noise, per your guidance):** the heavy rewrites in
  `edit-tools-pointer.js`, `edit-behavior.js`, and the newly extracted
  `views-editor/src/tunni-interactions.js` (Tunni interaction logic refactored out of the
  pointer tool — a *move*, not a new feature).
- **Upstream drift (not fork work):** `character-lines.js` (forkra's `glyph-lines.js`
  renamed upstream), `glyphsets-ui.js`, `opentype-tags.js`, `shaper-controller.js`,
  `panel-characters-glyphs.js` + its `sidebar.characters-glyphs.*` lang keys — all newer
  upstream (skeleton was rebased onto a newer upstream than forkra).

## B.2 Features you listed

### Skeleton-extra 1 — Automatic sidebearings (HT Letterspacer)
A port of **HTLetterspacer**: auto-computes left/right sidebearings from outline area.

| Role | File | Notes |
|---|---|---|
| **Panel + engine (NEW, ~1662 lines)** | `views-editor/src/panel-letterspacer.js` | shoelace area, `setDepth`, margin sampling; sidebar form with **area / depth / overshoot / reference / reverse** params and **apply / apply-LSB / apply-RSB** buttons |
| **Visualization (NEW, ~147 lines)** | `views-editor/src/visualization-layer-letterspacer.js` | draws the spacing polygons/margins |
| Icon (NEW) | `fontra-core/assets/tabler-icons/spacing-horizontal.svg` | sidebar tool icon |
| Localization (NEW keys) | `fontra-core/assets/lang/en.js` | `sidebar.letterspacer.*` (title, area, depth, overshoot, reference, reverse, apply, apply-lsb, apply-rsb) |
| Registration | `views-editor/src/editor.js` | panel wired into the sidebar |

> Note: `panel-letterspacer.js` imports skeleton infrastructure (`skeleton-contour-generator.js`,
> `fontra-internal-data.js`, `fontra-internal-schema.js`) for storage, but the spacing
> algorithm itself is a distinct, non-skeleton feature.

### Skeleton-extra 2 — Q-measure (realtime measure hotkey)
Hold **Q** to measure on the canvas in realtime while using the pointer tool (Alt+Q =
"measure-direct" variant).

| Role | File | Notes |
|---|---|---|
| Action defs | `views-editor/src/editor.js` | `action.realtime.measure` → **baseKey `q`** (≈ line 754); `action.realtime.measure-direct` → **Alt+Q** (≈ line 762); titleKeys `shortcuts.realtime.measure[-direct]` |
| Implementation | `views-editor/src/edit-tools-pointer.js` | `REALTIME_MEASURE_ACTION` / `REALTIME_MEASURE_DIRECT_ACTION`; key-down/up handlers driving a realtime measurement overlay (≈ lines 78–80, 787–851) |
| Hover/overlay state | `views-editor/src/scene-model.js` | `setMeasureActive()`, `clearMeasureHover()` and related measure-hover state (part of the ~+1089-line addition; the rest of that file is skeleton/rib code) |
| Supporting math | `fontra-core/src/distance-angle.js` | new `calculateHandleMeasure()` + `calculateProjectedDistanceComponents()` |
| Topic + lang | `fontra-core/assets/lang/en.js` | new `action-topics.realtime-hotkeys`, `shortcuts.realtime.measure` |

### Skeleton-extra 3 — X-equalize (realtime equalize hotkey) — redundant, reported as requested
Hold **X** to equalize in realtime — functionally overlaps forkra's existing Ctrl+Shift
equalize (Feature 3), just exposed as a realtime hotkey.

| Role | File | Notes |
|---|---|---|
| Action def | `views-editor/src/editor.js` | `action.realtime.equalize` → **baseKey `x`** (≈ line 770); titleKey `shortcuts.realtime.equalize` |
| Implementation | `views-editor/src/edit-tools-pointer.js` | `REALTIME_EQUALIZE_ACTION`, key handlers (≈ lines 80, 815, 907) |

## B.3 Additional non-skeleton changes found (not on your list)

### Editable sidebearings in the Selection Info panel
Separate from the Letterspacer (which *computes* spacing), the skeleton fork adds
**manually editable Left/Right margin fields** directly in the Selection Info sidebar, with
**expression evaluation** (type a formula, not just a number).

| Role | File | Notes |
|---|---|---|
| Panel fields | `views-editor/src/panel-selection-info.js` | `_updateSidebearingVariables()`, editable `["leftMargin"]` / `["rightMargin"]` rows with `evaluateExpression`, undo label "update sidebearings" (part of the ~+1292-line addition) |

> The rest of that large `panel-selection-info.js` addition is **skeleton stroke parameters**
> (`CapSquare` / `CapRounded` / `WidthList` / `rib` custom-data editors) and is *not* counted
> as a separate non-skeleton feature.

### SpeedPunk sidebar controls
The SpeedPunk feature (added back in forkra) gained **interactive sidebar controls** in the
skeleton fork — adjustable **opacity / peak-height / sharpness**.

| Role | File | Notes |
|---|---|---|
| Controls UI | `views-editor/src/panel-designspace-navigation.js` | new SpeedPunk control group |
| Localization (NEW keys) | `fontra-core/assets/lang/en.js` | `sidebar.designspace-navigation.speedpunk`, `.opacity`, `.peak-height`, `.sharpness` |

> This is an *enhancement* of an existing forkra feature rather than a brand-new one, but it
> is non-skeleton functionality that the skeleton fork introduced — flagged for completeness.

## B.4 Quick reference — NEW non-skeleton files in `skeleton/src-js`

| New file | Feature |
|---|---|
| `views-editor/src/panel-letterspacer.js` | Auto sidebearings (HT Letterspacer) |
| `views-editor/src/visualization-layer-letterspacer.js` | Auto sidebearings overlay |
| `fontra-core/assets/tabler-icons/spacing-horizontal.svg` | Letterspacer icon |

(Realtime **Q-measure** and **X-equalize** add *no* new files — they live as new actions in
`editor.js` and handlers inside the refactored `edit-tools-pointer.js`.)
