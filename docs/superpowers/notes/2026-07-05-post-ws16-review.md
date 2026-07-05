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

---

## E. Third pass — user-reported parity gaps (2026-07-05, later same day)

User report after the section-B fixes: (1) no selection indication for
skeleton curves, (2) no segment selection for skeleton curves, (3) z-drag
dead + `invalid behavior name: "rib-tangent"`, (4) panel crash
`Unknown field type: checkbox`, (5) editing bogs down over the session.

### E1. `checkbox` field type missing from ui-form (FIXED)
`panel-skeleton-parameters.js` pushes four `type: "checkbox"` descriptors
(width:linked, contour:single-sided, contour:single-sided-right,
rib:editable), but `ui-form.js` had no `_addCheckbox` — the form's
`setFieldDescriptions` threw, killing the whole panel whenever a skeleton
point/contour/rib selection produced one of those sections. Added
`_addCheckbox` (checked/disabled/indeterminate, getter/setter, routes through
`_fieldChanging`). The donor never hit this because its panel is raw
`html.input` DOM, not ui-form descriptors.

### E2. `rib-tangent` / `rib-tangent-interpolate` not registered (FIXED)
Same class as the B-pass rib-default/rib-interpolate fix:
`getSkeletonRibBehaviorName` returns four names, only two were registered in
`edit-behavior.js` behaviorTypes. Added the two tangent entries (defaultRules;
tangent semantics live in the rib executors' `forceTangent`, not the point
rules). Note the z-drag interlock with E1: tangent drag only moves the nudge
of ribs flagged `editable`, and the only UI that sets `editable` is the
panel's rib checkbox — which E1 had broken. Same donor behavior (nudge
requires editable), so with both fixes z-drag has parity.

### E3. No selection/hover indication for skeleton points (FIXED)
`fontra.skeleton.nodes` drew every node in one color and never consulted
`model.selection` / `model.hoverSelection` (ribs and editable-generated
markers did, skeleton points didn't). Added layer
`fontra.skeleton.selected-nodes` (zIndex 552): selected points get an
underlay + orange fill, hovered points a blue outline ring, shapes matching
the base nodes layer (square corner / round smooth / small round handle).
Keys are id-based (`contourId/pointId` parseSelection remainders), unlike the
donor's index-based keys.

### E4. No segment selection on the skeleton centerline (FIXED)
The donor has a whole `skeletonSegment/<contourIdx>/<segmentIdx>` selection
kind (hit test, viz layer, drag conversion, context-menu plumbing). Ported to
the upstream idiom instead: upstream segment clicks select the segment's two
parent `point/N` keys, so `scene-model.js` got
`skeletonSegmentSelectionAtPoint` which hit-tests the centerline (line
projection + 24-sample bezier distance) and returns the two endpoint
`skeletonPoint/<contourId>/<pointId>` keys. Runs just before regular segment
selection in `selectionAtPoint`. Drag/undo/arrow keys/indication all come for
free via the existing skeletonPoint machinery; no new selection kind, no
parseSelection changes. Bonus gating fix in the same function:
`segmentSelectionAtPoint` now refuses segments of skeleton-generated contours
(previously a click on a generated outline segment selected two generated
points as regular `point/N` — the segment-shaped sibling of the B-pass point
gating).

### E5. Progressive slowdown (PARTIALLY ADDRESSED + hypotheses)
No per-edit listener leaks found (realtime modifier key handlers clean up;
panel/controller listeners are constructor-only). Two real cost centers:

1. **`getSkeletonData` rebuilt the full normalized skeleton on every call**
   (~8 viz layers × every rendered frame, plus every mousemove hit test,
   each allocating contours+points+pointMap deep copies). Cost scales with
   skeleton size, so it *feels* progressive as the glyph grows during a
   session. FIXED: memoized per stored-section object via WeakMap —
   invalidation is automatic because every skeleton write replaces the
   section object (`setSkeletonData` / `"="` change ops). The returned object
   is now shared: callers must treat it read-only (all mutation paths
   already structuredClone; comment added at the cache).
2. **Unbounded undo stacks with full-skeleton payloads** (OPEN, primary
   session-growth suspect). Every skeleton drag pushes change + rollback
   each containing the complete skeleton customData JSON (upstream undo
   records are tiny point deltas; ours are ~100× bigger). `UndoStack` has no
   cap, so hours of editing retain hundreds of MB → GC pressure → sluggish
   UI that resets on refresh. Discriminator for the user: if a page refresh
   on the same glyph restores speed, this is it; if not, it was (1)/skeleton
   size. Candidate fixes when commissioned: cap `UndoStack` length, or
   record granular skeleton ops instead of whole-object replacement.
3. Per-frame websocket `editIncremental` ships the whole skeleton customData
   (throttled 50ms, mayDrop) — constant per frame, adds base cost with big
   skeletons, watch alongside C7.

---

## F. Fourth pass — closing the contour-index bookkeeping class (C1/C2/C3/C5)

Commissioned after re-reviewing the roadmap's §10 recommendations: the
"path-contour identity" risk (the roadmap's #1) was only wired into
join-contours. This pass closes the class.

### F1. C5 — in-place pairing hardened (FIXED)
`canUpdateGeneratedContoursInPlace` now also requires
`previous[i].skeletonContourId === generated.provenance[i].skeletonContourId`,
so a delete+add with matching point structure can no longer mispair
skeletonContourId ↔ pathContourIndex.

### F2. C2 — select-all no longer leaks generated points (FIXED)
`doSelectAllNone` filters `_getGeneratedPointIndices` out of its on-curve
enumeration, consistent with the click/marquee hit tests.

### F3. C3 — pen and knife gated off generated contours (FIXED)
- scene-model gained `isGeneratedPathContour(contourIndex)`.
- Pen (cubic + quad): hovering a generated segment no longer offers
  insert-point / alt-insert-handles; treated as empty canvas. (Hover over
  generated *points* was already impossible via the gated point hit test.)
- Knife: intersections on generated contours are filtered out live during
  the drag (markers not drawn) and never sliced.
- Pointer alt-insert-handles was already covered by the E4 segment gating.

### F4. C1 — generated-index bookkeeping wired into every structural op (FIXED)
Two mechanisms, chosen per site:

*Simple shift* (`recordSkeletonContourIndexShift`): pen contour merge
(`connectToContour` — net −1 contour; shift start = targetContourIndex in
both merge directions, recorded by `_handleAddPoints` where the layer glyph
is in scope). This closes the WS-9 documented deviation.

*Marker remap* (new in `skeleton-editing.js`:
`markGeneratedContoursForRemap` / `readGeneratedContourRemap` /
`remapGeneratedEntries` / `computeGeneratedContourRemap` /
`applyGeneratedContourRemap`): for edits whose effect on contour order is not
a simple shift, tag the first point of every generated contour with a temp
point attribute, dry-run the edit on a scratch copy of the path, read the
markers back, rewrite `pathContourIndex`. Explicit identity bookkeeping —
not geometric recovery (rail C3 respected: generated contours are never
restructured by these edits, only moved). Wired into:
- delete selection (`editor._deleteSelection` → `deleteSelectedPoints`,
  which deletes fully-selected contours)
- cut / alt-delete (`editor._prepareCopyOrCut` → `filterPathByPointIndices`
  with doCut)
- break contour (`scene-controller.doBreakSelectedContours` →
  `splitPathAtPointIndices`)
- knife slice (`edit-tools-knife.doSliceGlyph` → `slicePaths`; markers
  applied to the detached layer path copies directly)
- transformation panel union-with-selection (delete selected contours +
  appendPath)

Audited as already safe (append-at-end or net-zero, comments in place):
paste (`appendPath`), shape tool, decompose, reverse-contour, set-start-point,
close-contour, add-overlap (no contour-count change).

Remaining documented limitation (unchanged): whole-path boolean ops
(union-all, subtract/intersect/exclude) consume generated contours by
construction; comment clarified in panel-transformation.js. Proper handling
(strip generated before the op, regenerate after) is future work, noted in
ws16-parity-audit.md's spirit as an explicit exclusion.

Verification: 1352 fontra-core tests pass, bundle green, node --check +
prettier on all seven touched files.
