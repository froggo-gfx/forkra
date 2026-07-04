# Post-WS-16 Code Review — Findings and Fixes

Date: 2026-07-05
Branch: `refactor-simple/ws16-cross-feature-audit`
Scope: the full WS-6…WS-16 skeleton integration range
(`9bf2c86fa..HEAD`, ~14.5k added lines across 43 source files), triggered by
three user-reported parity gaps. Companion to `ws16-parity-audit.md` (which
records the WS-16 cross-feature matrix; this note records defects found by
review after it).

Verification state at the end of this pass: `node --check` clean on all touched
files, `npx prettier --write` applied, fontra-core `npm test` 1352 passing,
`npm run bundle` compiles.

---

## A. Fixed in this pass

### A1. Smooth-toggled skeleton points did not snap handles collinear (user report 1) — FIXED
- **Where:** `views-editor/src/skeleton-editing.js` `toggleSkeletonSmooth`.
- **Defect:** the toggle only flipped the `smooth` flag; upstream `toggleSmooth`
  (`fontra-core/src/path-functions.js`) additionally re-aligns the neighboring
  off-curve handles (both-handles, in-only, out-only cases) and refuses to
  smooth a corner between two straight segments. Skeleton points had neither
  behavior, so converting a corner point to smooth left the handles at their
  angled positions.
- **Fix:** exported `alignHandle`/`alignHandles` from `path-functions.js` (one
  copy of the geometry, per the roadmap rail) and ported `toggleSmooth`'s exact
  guard + fix-up into `toggleSkeletonSmooth` (`skeletonNeighborPoints`,
  `snapSkeletonHandlesCollinear`). Closed contours wrap neighbors; open-contour
  endpoints and line-line corners are skipped exactly like upstream.
- **Manual check:** double-click an angled skeleton corner point with two cubic
  handles → handles snap collinear (compare donor); repeat on an open-contour
  endpoint → no smooth applied.

### A2. Generated-contour points were selectable/editable as regular points (user report 3, first half) — FIXED
- **Where:** `views-editor/src/scene-model.js` `pointSelectionAtPoint`,
  `selectionAtRect`.
- **Defect:** generated contours are real path contours, and after the skeleton
  hit tests miss, `selectionAtPoint` falls through to the regular point hit
  test, which had no filter. A generated point without the per-point
  `editable` flag (`resolveEditableGeneratedTarget` correctly returns null for
  those, `skeleton-generated.js:123`) therefore became a plain `point/N`
  selection — click or marquee — and could be dragged/deleted as a normal path
  point, bypassing `editSkeleton` entirely; the next regeneration silently
  clobbers such edits.
- **Fix:** new `SceneModel._getGeneratedPointIndices()` (absolute point indices
  of all `skeleton.generated[*].pathContourIndex` contours) and exclusion of
  those indices in both the click hit test and the marquee. Editable-tagged
  points are unaffected: they are matched earlier by `editableGeneratedAtPoint`
  and selected under `editableGeneratedPoint/…` keys, never `point/N`.
- **Manual check:** click and marquee generated outline points with no editable
  flag → nothing selected; tag a rib editable → point selectable/draggable as
  before; regular glyphs without skeleton → unchanged behavior.

### A3. Join-contours corrupted generated-contour indices — FIXED
- **Where:** `views-editor/src/scene-controller.js`
  `doJoinSelectedOpenContours`.
- **Defect:** it called `recordSkeletonContourIndexShift(layerGlyph, 0, -1)`,
  shifting **every** generated `pathContourIndex` down by one, on the
  assumption the removed contour always precedes the generated block. The pen
  tool appends new contours at the **end** of the path — after the generated
  block — so joining two pen-drawn contours in a skeleton glyph shifted the
  provenance indices to point at the wrong contours. Consequence of drift: the
  next `editSkeleton` structural replace deletes the wrongly-referenced
  contours (real user geometry) and re-inserts generated ones there.
- **Fix:** compute the removed contour (`joinContours` removes the
  higher-indexed one) from `Math.max(pointIndex1, pointIndex2)` before the
  join, and shift only entries at/after that index.

### A4. Debug leftover in the nudge hot path — FIXED
- **Where:** `views-editor/src/scene-controller.js:1098`.
- `window._sceneController = this; // <-- add this` ran once per editable layer
  on every arrow-key nudge; nothing in the codebase reads it. Removed.

---

## B. Second pass (same day): runtime errors traced to root causes — ALL FIXED

The first pass wrongly attributed the undo and panel reports to a stale
bundle. Runtime console output disproved that; each symptom had a real
defect. All are fixed in this pass.

### B1. Skeleton data never persisted; server rejected every skeleton edit — FIXED (root cause of user reports 2 and "no persistence")
- **Symptom:** `Uncaught (in promise) o: KeyError('customData')` from
  `_handleIncomingMessage` on every skeleton edit; skeleton "converts to
  basic contours" after a page refresh; undo/redo dead for skeleton edits.
- **Root cause:** the entire feature (WS-6 through WS-16, and the WS-8
  rendering fixture) stores skeleton data in the **layer glyph's**
  (`StaticGlyph`) `customData` — but the Python data model's `StaticGlyph`
  has **no `customData` field**. `_applyChange` → `getItemCast` →
  `classFields["customData"]` raises `KeyError('customData')`, so the server
  rejected every skeleton change (killing server-side persistence and the
  echoed edit round-trip), and cattrs dropped the key on read/write, so
  nothing survived a refresh. The frozen generated contours survive because
  they are ordinary path contours. The donor avoided this by writing to
  `Layer.customData` (which Python supports). No Python file was touched in
  any skeleton workstream — the review's cross-language boundary check
  failed to happen in WS-6 planning and in the first review pass.
- **Fix (schema extension, chosen over relocating storage):**
  - `src/fontra/core/classes.py`: `StaticGlyph.customData: CustomData`
    (same shape as `Layer.customData`).
  - `src-js/fontra-core/src/classes.json`: regenerated
    (`PYTHONPATH=src python -m fontra.core.classes`). Note: running
    `scripts/rebuild_classes_json.sh` bare picks up whatever `fontra` the
    ambient Python resolves (an editable install of a *different* checkout,
    `Desktop/fontra-skeletron`) and silently strips fork fields — always
    regenerate with the repo source on `PYTHONPATH`, and verify the diff.
  - `src-js/fontra-core/src/var-glyph.js`: `StaticGlyph.fromObject` now
    carries `customData` (it silently dropped it before; this also removes
    the "fromObject drops customData" caveat recorded in
    `ws16-parity-audit.md`'s copy/paste exclusion — re-check that analysis
    when implementing the paste follow-up).
  - Relocating storage to `Layer.customData` (the donor's choice) was
    rejected because WS-9's target entries compose changes relative to the
    layer *glyph* inside `EditBehavior`; `Layer.customData` is a sibling of
    `glyph` and cannot be expressed there without restructuring the seam.
  - Verified: `structure`/`unstructure`/`applyChange` round-trip in Python
    (empty dict omitted on write), `test_classes.py` + `test_changes.py`
    130 passing, JS test expectations updated (`test-var-glyph.js`).
- **Runtime requirement:** restart the fontra server (it runs forkra's
  `venv`, which imports `forkra/src`) and hard-reload the browser (new
  bundle hash). Undo/redo is expected to work once the server stops
  rejecting the changes; if it still fails after that, re-diagnose with the
  server accepting edits.

### B2. Skeleton parameters panel crashed on update — FIXED (user report "panel broken")
- **Symptom:** `TypeError: defaultValue: expected instance of Number, got
  undefined` at `_addEditNumberSlider` → the panel's `update()` aborts, so
  the panel shows but is broken/empty.
- **Cause:** every `edit-number-slider` descriptor built by
  `panel-skeleton-parameters.js` omitted `defaultValue`; the `RangeSlider`
  web component type-checks it. Every other panel passes it.
- **Fix:** `_pushSlider`/`_pushSummarySlider` take a `defaultValue`
  (falling back to `minValue`), call sites pass the natural neutral values
  (distribution 0, scale 100, roundness 0, asymmetry 0, trim-ratio 0.5,
  radius-boost 1).

### B3. Tunni points appeared (and were draggable) on generated contours — FIXED
- **Symptom:** regular Tunni handles shown on generated outlines; dragging
  them edits the generated path directly (not via `editSkeleton`), and the
  edit is discarded on the next regeneration.
- **Fix:** new `getGeneratedPathContourIndices(skeletonData)` in
  `fontra-core/src/skeleton-model.js`; `tunniLayerHitTest`
  (`tunni-interactions.js`) and both Tunni visualization draw functions
  (`visualization-layer-definitions.js`) skip generated contours. Skeleton
  Tunni (on the skeleton itself) is unaffected.

### B4. Console spam `invalid behavior name: "rib-default"` / `"rib-interpolate"` — FIXED
- **Cause:** rib drags/nudges pass `getSkeletonRibBehaviorName()` results to
  the base `EditBehaviorFactory.getBehavior`, and `behaviorTypes` had no
  entries for them (unlike the fixed-rib/equalize names added by WS-13), so
  every rib interaction logged and fell back.
- **Fix:** added `rib-default`/`rib-interpolate` entries mirroring
  `fixed-rib` (default point rules; rib semantics live in the rib executor
  target entries).

---

## C. Needs more attention (not fixed in this pass)

### C1. Contour-count bookkeeping is under-enumerated (HIGH — data corruption class)
The roadmap (§5, §10) requires every operation that inserts/deletes path
contours to update `generated[*].pathContourIndex`. Today the **only** call
site of `recordSkeletonContourIndexShift` is the join fix (A3). Unhandled
count-changing operations:
- `deleteSelectedPoints` (`editor._deleteSelection`) deletes a contour when its
  last point goes — no shift;
- knife tool slicing (`slicePaths`) restructures contours — no shift;
- pen-tool contour merges (`connectToContour` in `edit-tools-pen.js`) — known,
  commented as a WS-9 deviation, still a live drift source;
- selection paste / `_pasteLayerGlyphs` paths that splice contours.
Drift consequence is the same as A3 (wrong contours deleted on the next
skeleton edit). **Recommendation:** implement the roadmap's own fallback as a
safety net *inside* `editSkeleton`: before the structural-replace branch
trusts a `pathContourIndex`, sanity-check the referenced contour against the
entry's `pointMap` length (a pure bookkeeping comparison, not geometric
matching); on mismatch, treat the skeleton as detached from that contour
(drop the entry) instead of deleting the contour. Then add the missing shift
calls site by site.

### C2. Select-all leaks generated points (MEDIUM)
`editor.doSelectAllNone` collects every on-curve `point/N` from the raw path —
including generated contours — and never includes skeleton points. With A2 in
place, click/marquee can no longer produce these selections, but Ctrl+A still
can, re-opening the same bypass. Fix is mechanical (filter through the same
generated-index set, likely via a scene-model accessor); whether select-all
should *also* cycle skeleton points is a donor-parity question to check
against `fd76d3abe` before implementing.

### C3. Pen/knife can insert points into generated contours (MEDIUM)
`pathHitAtPoint`/segment hit tests are not gated, so the pen tool inserts a
point into a generated contour's segment; the insertion survives until the
next `editSkeleton`, whose in-place check then fails (point-count mismatch)
and the structural replace silently deletes the user's point. Donor behavior
(generated outline not insertable) should be restored by excluding generated
contours from the pen/knife segment hit tests — same generated-index source
as A2.

### C4. `alignHandleDirections` disabled in the generator (MEDIUM — undocumented deviation)
`fontra-core/src/skeleton-generator.js:1409` and `:2009`: the donor's handle
direction alignment pass is commented out ("DISABLED for performance testing -
alignHandleDirections is O(n³)"). That is a deliberate output deviation from
`fd76d3abe` that appears in no plan's Deviations section. Either re-enable it
(and let the golden-master fixtures arbitrate), optimize it, or record it as
an accepted deviation with a fixture diff showing the effect.

### C5. Positional pairing in `replaceGeneratedSkeletonContours` (LOW)
`skeleton-editing.js` pairs `previous[i]` with `generated.contours[i]` by
array position; `canUpdateGeneratedContoursInPlace` compares only point
counts/types. Deleting one skeleton contour and adding another with the same
point structure in a single mutation can pass the in-place check with a
mispaired `skeletonContourId ↔ pathContourIndex` assignment. All coordinates
still get written, so geometry is right, but contour order vs. skeleton order
can diverge between designspace sources, which is what the interpolation
compatibility contract depends on. Cheap hardening: also require
`previous[i].skeletonContourId === generated.provenance[i].skeletonContourId`
in the in-place check.

### C6. Copy/cut/paste of skeleton data (documented exclusion)
Already recorded with a follow-up plan in `ws16-parity-audit.md` — repeated
here only so this note is a complete defect list.

### C7. Performance watch item (INFO)
Every drag frame runs `structuredClone` of the layer glyph + full
`generateFromSkeleton` over **all** skeleton contours
(`makeEditSkeletonChange` per frame). The donor paid the same cost, so this is
parity-consistent; keep the WS-9 frame-budget manual check in the regression
matrix and only optimize (per-contour regeneration, `preferInPlace`) if it
fails on real glyphs.

---

## D. Review coverage caveat

A parallel 8-angle finder sweep (line-by-line core, line-by-line editor,
removed-behavior audit, cross-file trace, reuse, simplification, efficiency,
altitude/conventions) was launched but every agent was killed by the session
usage limit before producing candidates. The findings above come from a
targeted single-pass review focused on the user-reported gaps, the roadmap's
architecture rails, and the files they implicate. The following got only spot
checks and deserve a dedicated pass when capacity allows: the generator
internals (`skeleton-generator.js`, 3.8k lines) beyond C4, `skeleton-model.js`
mutators, `skeleton-modifiers.js` (D/S/X math), `skeleton-tunni.js`,
`edit-tools-skeleton.js` interaction details, and the parameters panel
internals.
