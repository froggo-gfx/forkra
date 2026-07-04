# WS-16 Cross-Feature Parity Audit

Date: 2026-07-04
Branch: `refactor-simple/ws16-cross-feature-audit`
Reference: donor `fd76d3abe` (pre-refactor feature-era ground truth).

This note records the state of every cross-feature skeleton touchpoint after
WS-16, as **pass** / **deviation** / **exclusion**. Automated checks and rail
greps are recorded at the end.

## Rail greps (all pass)

- (a) No generator/`setSkeletonData` call sites outside `skeleton-editing.js`
  (the one write path) / `skeleton-generator.js` (the generator). `setSkeletonData`
  is defined in `skeleton-model.js` and called only inside `skeleton-editing.js`.
- (b) No donor cross-feature plumbing: `moveSkeletonData`, `SkeletonMovableObject`,
  `SkeletonRibHandleMovableObject`, `_findHandlePositionsForRibPoint`,
  `skeleton-contour-generator` — none present (only an explanatory comment).
- (c) No index-based skeleton selection keys anywhere in `views-editor`.
- (d) No `skeleton` reference inside `edit-behavior.js` (the shared emit code);
  the skeleton target entry lives entirely in `skeleton-editing.js`.

## Automated checks

- `fontra-core`: 122 passing across `test-skeleton-*.js` + `test-glyph-controller.js`
  (includes the new WS-16 translate/transform/id-allocation, selection-bounds,
  and interpolation-compatibility tests).
- `node --check` clean on every touched core and views-editor file.
- `npm run bundle`: owned by the developer's background bundle-watch (not run here).

## Feature-by-feature

### Transformation panel — PASS (via factory seam)
- Scale / rotate / skew / flip / move / set-dimensions on a skeleton selection:
  `transformSelection` was already skeleton-wired (guard + `getSkeletonSelectionBounds`
  + `makeSkeletonPointTargetEntry`); WS-16 Task 3 fixed the target entry so
  `makeChangeForTransformation` actually works (it previously would have thrown
  because the synthetic behavior was delta-only and `getBehavior`/`getTransformBehavior`
  share a cache key). Implemented through the WS-9 `EditBehaviorFactory` target
  entry — **deviation from donor plumbing** (no `SkeletonMovableObject`), visible
  behavior matches `fd76d3abe`.
- Align / distribute on skeleton points: WS-16 Task 4 emits one movable object per
  selected skeleton point; bounds come from Task 2 `getSelectionBounds`, deltas
  route through the factory target entry. **Deviation from donor plumbing**, same
  visible result.
- Mixed selection (path points + skeleton points): both transform together in one
  undo — path via the normal factory targets, skeleton via the target entry.

### getSelectionBounds — PASS
- Resolves `skeletonPoint`, `skeletonRib`, and editable-generated keys from stable
  ids through `skeleton-model.js` accessors + the shared `getSkeletonRibPosition`
  forward projection (moved to `fontra-core` this workstream). Tested.
- **Deviation:** editable-generated point/handle bounds use the rib forward-projection
  anchor position rather than the exact generated handle tip. This is a bounds-only
  approximation (C4 forward projection, no inverse recovery) and keeps
  `glyph-controller.js` free of any `views-editor` provenance import.

### Letterspacer ↔ skeleton — PASS
- Apply LSB shifts the skeleton by the same delta via
  `editSkeleton(layerGlyph, translateSkeletonData(...))`, in the same undo as the
  path shift. **Deviation from donor** `moveSkeletonData`+`setSkeletonData`.
- Because `shiftPath` moves the generated path contours and `editSkeleton`
  regenerates them from the translated skeleton by setting absolute positions,
  there is no double-shift. Apply RSB does not move geometry (skeleton unchanged),
  matching donor.

### Delete — PASS
- Deleting a `skeletonPoint` selection routes through `editSkeleton` +
  `deleteSkeletonPoint`, regenerating outlines, resolving ids across editable
  layers by structural ordinal (WS-9). One undo.

### Decompose — PASS (verify-only, no code change)
- `doDecomposeSelectedComponents` appends decomposed contours at the **end** of the
  path and never touches `customData`. The parent glyph's
  `fontra.internal.skeleton` survives unchanged, and appending after the generated
  block leaves `generated[].pathContourIndex` valid. Matches the donor requirement
  ("skeleton customData never silently lost").

### Selection-info — PASS (verify-only, no code change)
- `panel-selection-info._getSelection` extracts only `point`/`component`/etc and
  ignores `skeletonPoint` keys, so a skeleton selection neither crashes nor
  corrupts the dimensions readout; a skeleton-only selection falls back to glyph
  bounds. WS-15 owns the skeleton numeric panel, so no duplicate editing text is
  added here.

### Interpolation — PASS (specified, tested)
- `generateFromSkeleton` produces interpolation-compatible output (identical
  contour counts, closed flags, and per-contour on/off-curve type sequences) for
  structurally identical skeletons that differ only in coordinates/widths
  (`test-skeleton-interpolation.js`). The caller's contract is to keep skeleton
  structure identical across sources; a structural difference (extra point) is
  documented as legitimately incompatible, not a generator bug. No generator change
  was required.

## Exclusions (explicit, justified)

### Copy / cut / paste of skeleton — EXCLUDED (deferred)
- **Status:** not implemented in WS-16. Delete is implemented; copy/cut/paste is not.
- **Why:** `StaticGlyph.fromObject` (verified) drops `customData`, so skeleton data
  does **not** ride along the layer clipboard automatically — a correct implementation
  requires the donor's explicit `skeletonDataByLayer` clipboard field **plus**, on
  paste, stripping the frozen generated contours from the pasted path and
  regenerating via `editSkeleton` with `allocateSkeletonIds` (Task 1 helper, already
  built and tested). Doing this safely without the editor test harness or a
  side-by-side donor risks corrupting glyphs (frozen-contour duplication, selection
  index drift, id collisions on paste-into-existing).
- **Current behavior:** whole-glyph copy/paste-replace carries skeleton via
  `Layer.customData` (which `Layer.fromObject` *does* preserve), so a full-glyph
  paste into an empty glyph likely round-trips. Layer/selection paste drops skeleton
  editability (the pasted generated outline appears as frozen path contours) —
  lossy but non-corrupting.
- **Follow-up:** implement `skeletonDataByLayer` carry in `_prepareCopyOrCutLayers`
  /`_writeLayersToClipboard`, and a gated paste merge in `_pasteLayerGlyphs`
  (`allocateSkeletonIds` → `editSkeleton` append, skipping the pasted glyph's
  generated contours). The pure id-reallocation helper this needs already exists
  and is tested.

### Skeleton width-anchor / profiles in the transformation panel — OUT OF SCOPE
- Drawing-tool contour actions (WS-10), rib/handle/modifier/Tunni semantics
  (WS-11–14), and panel numeric editing/profiles (WS-15) are verified by their own
  workstreams, not re-audited here.

## Manual editor matrix

The manual side-by-side matrix (forkra vs donor `fd76d3abe`) in the WS-16 plan
Task 9 Step 4 is the developer's to run in-browser; it is not executable from this
environment. The implemented surfaces above are ready for that pass; the copy/paste
rows are expected to show the excluded behavior documented here.
