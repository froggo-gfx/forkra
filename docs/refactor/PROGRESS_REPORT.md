# Refactor Progress Report

This document tracks implementation progress across the refactor workstreams. Add new sections as each workstream lands.

## WS-1: Coarse Grid Panel

**Branch:** `refactor-simple/ws1-coarse-grid-panel`

**Status:** Implemented and locally verified.

WS-1 added a Coarse Grid accordion to the Designspace Navigation sidebar. The panel exposes the existing coarse-grid behavior through app-level settings rather than project data, keeping the D9 decision intact: coarse-grid preferences live in `applicationSettingsController` and localStorage, with no writes to font files.

Completed work:

- Added `src-js/fontra-core/src/coarse-grid-presets.js` for pure preset, normalization, slider-value, and snapping math.
- Added mocha coverage in `src-js/fontra-core/tests/test-coarse-grid-presets.js`.
- Added app-level settings keys for custom mode, base, increment, and restored spacing.
- Added English localization strings for the Coarse Grid accordion.
- Added the sidebar controls: Display, Spacing, Custom, Base, and Increment.
- Wired the Display checkbox to `visualizationLayersSettings["fontra.coarse.grid"]`.
- Wired the spacing slider to the existing `coarseGridSpacing` scene setting.
- Kept custom Base/Increment inputs uncapped, while limiting slider choices to the 40-unit slider cap.
- Disabled coarse snapping whenever the Coarse Grid visual layer is hidden.

Verification performed:

- `src-js/fontra-core`: `npx mocha tests/test-coarse-grid-presets.js --reporter spec`
- `node --check` on the modified browser-side modules.
- User-side bundle watch was used instead of running a separate `npm run bundle`.

Follow-up notes:

- The coarse-grid implementation now establishes the app-level settings pattern expected by later panel work.
- Later workstreams should append their own sections below this one, including branch, status, completed work, verification, and any carried-forward notes.

## WS-2: Q-Measure Port

**Branch:** `refactor-simple/ws2-q-measure`

**Status:** Implemented and locally syntax/unit verified; browser verification remains tied to the running bundle watch.

WS-2 ports the skeleton Q-measure feature without the skeleton/rib coupling. Holding Q now enters a realtime measure mode owned by a dedicated interaction module, while the overlay rendering reads measure state from the scene model and uses core distance helpers.

Completed work:

- Added `calculateProjectedDistanceComponents` and `calculateHandleMeasure` to `src-js/fontra-core/src/distance-angle.js`.
- Added mocha coverage in `src-js/fontra-core/tests/test-distance-angle.js`.
- Added measure mode, direct-mode, and hover-target state to `src-js/views-editor/src/scene-model.js`.
- Added `src-js/views-editor/src/measure-interactions.js` for Q/Alt+Q key lifecycle and hover target resolution.
- Registered `action.realtime.measure` and `action.realtime.measure-direct` with shortcut labels.
- Wired the pointer tool through thin dispatch hooks for hover, drag suppression, and keydown.
- Added the render-only `fontra.measure.overlay` visualization layer for handle, segment, and two-selected-point measurement.
- Kept D10 exclusions out of the port: no realtime X-equalize, rib tangent, fixed-rib, fixed-rib-compress, `measureHoverRibPoint`, or skeleton selection branches.

Verification performed:

- `src-js/fontra-core`: `npx mocha tests/test-distance-angle.js --reporter spec`
- `src-js/fontra-core`: `npm test`
- `node --check` on `scene-model.js`, `measure-interactions.js`, `editor.js`, `edit-tools-pointer.js`, `visualization-layer-definitions.js`, and `en.js`.
- Source scan for skipped realtime/rib terms across the new WS-2 touch points.

Follow-up notes:

- User-side `bundle watch` is the build verification path for this pass; manual hold-Q browser behavior should be checked there.
- `measure-interactions.js` now provides the interaction-module pattern expected by the later Tunni refactor.

## WS-3: SpeedPunk Panel + Visualization Extraction

**Branch:** `refactor-simple/ws3-speedpunk-panel`

**Status:** Implemented and locally syntax/unit verified; browser behavior remains tied to the running bundle watch.

WS-3 moves SpeedPunk sampling and geometry out of the visualization layer and adds an app-level SpeedPunk accordion to Designspace Navigation. The visualization layer now renders quads returned by core math, while the panel persists display parameters through `applicationSettingsController` and bridges them into scene settings for live redraw.

Completed work:

- Added SpeedPunk sampling helpers to `src-js/fontra-core/src/curvature.js`.
- Added pure `computeSpeedPunkSamples(path, params)` for quad/color generation.
- Added mocha coverage in `src-js/fontra-core/tests/test-curvature-sampling.js`.
- Replaced the inline `fontra.curvature` math/draw loop with a render-only fill loop.
- Removed the old hard-coded `-180000` / `-48000` height scaling from the visualization layer.
- Added app-level settings for peak height, sharpness, and opacity.
- Added scene-setting defaults used by the live rendering bridge.
- Added English localization strings for the SpeedPunk accordion.
- Added the sidebar controls: Display, Peak height, Sharpness, and Opacity.
- Wired the Display checkbox to `visualizationLayersSettings["fontra.curvature"]`.
- Wired numeric controls to app-level persistence and live scene settings.

Verification performed:

- `src-js/fontra-core`: `npx mocha tests/test-curvature-sampling.js --reporter spec`
- `src-js/fontra-core`: `npm test`
- `node --check` on the modified core and browser-side modules.
- Source scan confirmed old inline SpeedPunk helper/math names and magic constants are gone from `visualization-layer-definitions.js`.

Follow-up notes:

- The default SpeedPunk look intentionally changes because comb height is now parameterized by peak height and sharpness instead of the old cubic/quad magic constants.
- User-side `bundle watch` is the build/browser verification path for this pass; manual checks should confirm Display toggle, live value changes, localStorage persistence, and no font dirty state.
