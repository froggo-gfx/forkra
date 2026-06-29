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
