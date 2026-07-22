# 2026-07-06 — Parity bug catalog (fifth pass)

User-reported bugs from runtime testing of the skeleton integration (WS-6…WS-16 plus
the third/fourth fix passes, through commit `ace647ccb`). This document is the intake
list: each bug is recorded as reported, with whatever context can be _inferred_ from
the previous sessions. **No code research has been done yet** — the "Inferred context"
notes are hypotheses to check, not diagnoses.

Status legend: `open` (not yet investigated) — statuses will be updated as the pass
proceeds.

---

## 1. Skeleton

### 1.1 Cap style selection is missing completely — `fixed`

**Report:** No way to select a cap style anywhere in the UI. The feature is untestable
in this state.

**Root cause:** The donor's "Cap Styles" `<select>` (Flat/Square/Round, endpoint-gated)
was never ported to the WS-15 panel; additionally `ui-form.js` had no select/dropdown
field type at all (same translation gap as the E1 checkbox). Everything below the UI
already existed: `setSkeletonCapParameters` accepts `capStyle`, the generator honors
per-point cap style at open-contour endpoints (`skeleton-generator.js:1469`), and the
panel model summarized `capStyle`.

**Fix:** Added `_addSelect` field type to `ui-form.js`; added endpoint-gated
`summarizeSkeletonCapStyleSelection` + `skeletonContourEndpointIndices` to
`skeleton-panel-model.js`; added `setPanelCapStyle` to `skeleton-panel-edits.js`
(endpoint check re-applied per layer; **round caps clear editable rib state on both
sides**, donor parity); panel renders the select in Caps & corners (stored values
`butt`/`square`/`round`, labels Flat/Square/Round, donor's UI value "flat" ==
stored "butt"). Select is disabled unless every selected point is an endpoint of an
open contour.

### 1.2 Distribution slider

#### 1.2.1 Distribution doesn't persist when Linked is engaged — `fixed`

**Report:** With Linked engaged, the distribution slider value doesn't persist.
**This reveals an incorrect model of "linked": linked does NOT mean symmetrical — it
means an equal delta is applied to both sides.** (i.e. linked preserves the existing
left/right difference while moving both by the same amount.)

**Root cause:** Exactly as reported — `setSkeletonPointSideWidth` (skeleton-model.js)
copied the edited value to the other side when linked ("mirror"). The distribution
write itself was fine, but the next linked width edit (canvas rib drag via
`applyFixedRibWidthDelta`, panel Left/Right fields) collapsed the sides back to equal.
Donor proof: `skeleton/.../panel-skeleton-parameters.js:6362` — "Linked: update both
sides by the same delta".

**Fix:** `setSkeletonPointSideWidth` now applies the same delta to the opposite side
when linked (clamped at 0), preserving distribution. `setSingleSidedTotalWidth`
(skeleton-ribs.js) which _relied_ on the mirroring for its symmetric split now sets
both halves explicitly. Rib drags are unaffected compositionally: each drag tick
rebuilds from a clone of the pre-drag layer glyph. Tests: renamed the "mirrors" test
(same outcome for symmetric widths) and added asymmetric-preservation + clamp tests
in test-skeleton-model.js.

#### 1.2.2 Distribution doesn't update on canvas in realtime with the slider — `fixed`

**Report:** Canvas only reflects the distribution after the slider is released (or not
at all until some other refresh), not continuously during the drag.

**Root cause:** The ported panel's `_resolveStreamValue` drains every slider value
stream and applies only the final value (one editSkeleton per commit). The donor
consumes the stream incrementally (`_setPointDistributionStream`, 32ms throttle,
`sendIncrementalChange(change, true)` per tick) and resets to the pre-drag baseline
before recording the final change so the drag lands as ONE undo record.

**Fix:** New `setPanelPointDistributionStream` in `skeleton-panel-edits.js`: snapshots
each layer's path + skeleton before the drag, then per throttled tick restores the
snapshot and re-applies the current value via `editSkeleton` (so every recorded change
is original→value; the last one IS the undo record — no per-tick undo bloat, which
also avoids feeding the suspected slowdown from bug #5's unbounded undo hypothesis).
Panel routes `width:distribution` with a live stream to it; all other fields keep the
apply-final-value behavior. Note: the other sliders (corner roundness/asymmetry etc.)
still apply on release only — same recipe can be extended to them if realtime matters
there too.

### 1.3 What even is "default caps" (panel)? — `answered` (currently inert; decision pending)

**Report:** The meaning of the "default caps" panel item is unclear.

**Answer:** The "Default caps" numbers (cap radius ratio, cap tension, cap angle, cap
distance) are **per-master presets** stored in the source's customData
(`capDefaults.round.{radiusRatio,tension}` / `capDefaults.square.{angle,distance}`,
see skeleton-source-defaults.js). They are NOT live fallbacks: the generator's chain
is `point.capX ?? contour.capX ?? hard-coded constant`
(skeleton-generator.js:1685 etc.) — source defaults never enter generation. In the
donor they exist to feed (a) the "Current Glyph" info line and (b) the **cap profile
dropdown's "Base" preset**, which copies these values onto selected endpoints on
demand. The fork hasn't ported cap profiles, so today the section is write-only
storage: editable, persisted per source, consumed by nothing.

**Decision (2026-07-07):** base widths and cap parameters should be **master-wide and
editable** — the panel's per-source storage is the right home; they need to actually
mean something, not remain write-only.

Additionally (idea, documented only — no planning or research done): rib widths could
be expressed **relative to the master width** rather than as absolute values. Example:
master width 60, rib width 80 = mw + 20; when the master width changes to 40, offer
the option to recalculate that rib to 60 (keep the +20 offset). I.e. an opt-in
"follow master width" recalculation when master-wide defaults change, not a live
binding.

### 1.4 Where are default stroke widths for masters set? — `fixed` (2026-07-18, with 1.3)

**Report:** Unclear where per-master default stroke width is configured.

**Inferred context:** Skeleton data lives per layer glyph in
`customData["fontra.internal"]`; stroke width is presumably per-layer (per-master)
there, but a _default_ for new contours / new masters must come from somewhere — donor
may have a font-level or source-level setting (axis-mapped?) that wasn't ported, or it
exists and is just undiscoverable. Needs donor research. Possibly documentation/UX
rather than code.

**Fix (1.3/1.4, 2026-07-18):** per the user's placement decision, master-wide
skeleton defaults now live as their own section in the **glyph panel (selection
info), directly below the letterspacer** — new `SkeletonDefaultsPanel`
(panel-skeleton-defaults.js), hosted the same way LetterspacerPanel is. It
edits the per-source base/horizontal/contrast widths (by glyph case) and the
cap parameter presets, persisting to the source's customData (same storage as
before). The "Source defaults"/"Default caps" section was removed from the
skeleton parameters panel along with its now-dead plumbing. Discoverability
solved: the defaults are visible per master wherever you are, not only when a
skeleton selection exists. Follow-up (same day) — both remaining 1.3 pieces implemented:

- **Cap presets consumed:** setting a cap style now seeds the style's
  parameters from the master's "Default caps" presets when the point has no
  explicit values yet (round → radius/tension, square → angle/distance) —
  the donor "Base" profile semantics, applied at style-set time
  (`setPanelCapStyle` + `resolveEffectiveSourceSkeletonDefault`). Explicit
  per-point values always win; the generator chain is unchanged.
- **Relative rib widths (mw+offset):** changing a master **base width** in the
  defaults panel now offers an opt-in dialog: "Keep absolute widths" vs
  "Recalculate ribs". Recalculate shifts every rib total (and contour default
  width) by the delta across ALL skeleton glyphs of that case in the edited
  master (layer resolved per glyph via `getSourceIndex(fontSource.location)`),
  preserving each rib's left/right distribution — i.e. every rib keeps its
  offset relative to the master width. Not a live binding, exactly per the
  1.3 decision. One undo record per glyph.

### 1.5 Generated contours (editable ribs)

#### 1.5.1 Editable ribs move freely; editable flag must ONLY enable z-tangent-drag — `fixed`

**Report:** Marking a rib editable currently lets its points move freely. For ribs, the
editable flag must gate _only_ the z-tangent-drag — nothing else.

**Root cause:** `createSkeletonRibExecutor.applyDelta` (skeleton-ribs.js) applied the
tangent nudge on every non-rib-tangent drag of an editable rib
(`editable && (tangentOnly || !forceTangent)`). Donor `EditableRibBehavior`: free
movement = width only; "Nudge follows tangent only when constrained".

**Fix:** nudge condition tightened to `editable && tangentOnly` (rib-tangent behavior
or Z constrain mode). New executor tests in test-skeleton-ribs.js cover free /
tangent / non-editable cases.

#### 1.5.2 Editable ribs' handles aren't mouse-selectable/movable — `fixed`

**Report:** The off-curve handles belonging to editable ribs can't be clicked or
dragged.

**Root cause (deeper than expected):** the entire editable-generated selection surface
was dead at runtime. All the machinery existed (hit test `editableGeneratedAtPoint`,
target entries, drag pipeline, markers layer) but it keys off side-bearing provenance
in `generated[].pointMap` — and the generator NEVER emitted it. The only annotation
was the fallback `annotateGeneratedContourProvenance`, which ratio-guesses skeleton
point ids and writes `side: null`, which every consumer rejects. The existing
provenance tests only passed because they asserted ids/roles, never `side`; the
target-entry tests hand-crafted their pointMap.

**Fix:** the generator now attaches real `_provenance` at emission:
`buildGeneratedOnCurve` gained a `side` parameter (all rib on-curve emission sites),
and the handles adjacent to skeleton on-curves get `{skeletonPointId, side, role:
"in"/"out"}` in both the simplified-cubic and multi-curve branches. Provenance
survives all post-processing stages (they spread or mutate points in place; corner
rounding / caps that REPLACE points drop it — those aren't editable targets anyway)
and is collected into pointMap then stripped. Geometry unchanged: golden masters
still pass. New tests assert side-bearing on-curve and handle provenance.

#### 1.5.3 Alt-drag should engage interpolation for editable ribs — currently n/a — `fixed`

**Report:** Alt-dragging an editable rib should switch to the interpolation behavior;
right now nothing happens.

**Root cause:** the behavior names (`rib-interpolate`, `rib-tangent-interpolate`)
reached the rib executor, but it had no interpolation branch — they degraded to a
plain width drag. Donor `InterpolatingRibBehavior`: the rib point slides along the
axis between its generated handles (single handle: rib→handle; none: tangent), width
stays fixed, nudge absorbs the tangent component, and the handle offsets are
compensated by −tangent·Δnudge so the handles stay put on canvas.

**Fix:** `createSkeletonRibExecutor` gained an interpolation mode (editable ribs
only; non-editable alt-drag still behaves as a plain width drag, donor parity) fed by
`makeRibInterpolationAxis` in skeleton-editing.js, which resolves the generated
handle positions from the pre-drag path via `findGeneratedPathAddress` (requires the
1.5.2 provenance). `applySkeletonRibExecutorResult` persists the compensated 2D
handle offsets (preserving `detached`). Executor-level tests cover axis slide,
tangent fallback, non-editable fallback and offset persistence.

### 1.6 No visualization for ribs — `fixed`

**Report:** Ribs have no dedicated visualization. Both distinctions must be visible:
selected vs. unselected, and editable vs. non-editable.

**Root cause:** two layers existed but underdelivered: `fontra.skeleton.ribs` drew
5px filled dots with color-only selection states (easy to miss, no editable
distinction), and `fontra.skeleton.editable-markers` drew editable diamonds on a
separate layer — plus its generated-target half was dead via the 1.5.2 provenance
bug. Donor draws rib endpoints as stroked diamonds: larger + purple when editable,
filled when selected.

**Fix:** `fontra.skeleton.ribs` endpoints are now donor-style diamonds (8px, 12px
when editable; purple palette for editable sides, orange for selected non-editable,
purple-filled for selected editable; hover variants). The duplicate rib-diamond
drawing was removed from `fontra.skeleton.editable-markers`, which now only marks
editable generated targets on the outline (alive again thanks to 1.5.2).

**Follow-up (sixth pass, after runtime testing):** the diamonds were still invisible
for non-editable ribs — they sat at zIndex 452 (under the other skeleton layers) in a
faint 0.65-alpha blue at strokeWidth 1.5, while the donor draws its rib points at
**zIndex 560** in pink at strokeWidth 2 (donor `fontra.skeleton.rib.points`). The rib
endpoints now live in their own `fontra.skeleton.rib-points` layer (zIndex 560, donor
palette: pink 10px non-editable, purple 12px editable, orange/purple filled when
selected); `fontra.skeleton.ribs` keeps only the connecting line.

### 1.5.4 (follow-up) Alt-drag equalize for editable rib handles — `fixed`

Alt-dragging an editable generated handle now equalizes the opposite handle of the
same rib side (`createEditableGeneratedHandleExecutor` treats
`alternate`/`alternate-constrain` as equalize). Previously only the `equalize*`
behavior names triggered it, and after the X-binding removal nothing produced those.

**Second follow-up (runtime testing found two defects in the equalize math):**
(a) it clamped the OFFSET length at ≥ 0 and forced it along +direction, so the
handle could never move inside its generated base position (the reported "minimum
distance"); (b) it equalized offset lengths, but the on-canvas handle length is
|base + offset| and the two bases differ, so it degraded to "equal deltas", not
equalization. Rewritten position-based (parity with the skeleton smooth-point
equalize): geometry is captured from the pre-drag path (rib on-curve, both handle
positions, per-handle bases; a detached handle's base is the rib point), the dragged
handle moves (projected along the skeleton handle direction, free when detached) and
the opposite handle takes the SAME distance from the rib point along its own
direction. No clamps. Unit tests plus a live target-entry invariant test
(equal lengths, drag inside the base allowed).

### 1.5.5 (follow-up) Detach flag for ribs — `fixed`

The detach machinery existed end-to-end (2D `handleOffsets` with `detached`,
`setSkeletonHandleDetached`, panel summary) but was never surfaced in the UI. Added a
"Detach" checkbox to the panel's rib section (shown when the selection has editable
sides), backed by `setPanelRibDetached`. Also fixed a latent core bug found via TDD:
`setSkeletonHandleDetached(point, side, false)` could never re-attach, because
`setSkeletonHandleOffset` ORs the detached flag with the existing state (by design —
drags must not silently re-attach); the setter now writes the flag directly.

**Second follow-up ("detach does nothing"):** two more defects. (a) The generator's
detached branch read the donor's per-SIDE flag (`leftHandleDetached`) which the fork's
canonical converter never writes — it writes per-role flags
(`leftHandleInDetached`/`leftHandleOutDetached`) — so absolute positioning never
engaged during regeneration; fixed to per-role (matching the canonical model). The
`detached-handle-offsets` golden fixture had been captured with the donor ALSO
ignoring detach (its converter had the same key gap); the fixture script now sets the
donor's per-side key and the fixture was regenerated — fork output matches the donor
with detach actually engaged. (b) The panel toggle was a naive flag flip, which
reinterprets stored offsets in a different space (handles jump / behave wrong).
Now position-preserving both ways (donor parity): detaching rewrites offsets into
rib-point space from the current path; re-attaching rewrites them against base
handle positions from a scratch regeneration without that side's offsets
(`computeRibDetachConversions`, with a round-trip invariant test). What detach
MEANS: a detached handle is absolutely positioned relative to the rib point and
stops following the skeleton handle geometry; drags move it freely in 2D.

### 1.7 What happens on x-drag of the skeleton handle? — `deprecated` (X binding removed)

**Report:** Open question — the X modifier's effect when dragging a skeleton handle is
unknown/undefined.

**Answer:** X is the **equalize** realtime modifier (`action.realtime.equalize`,
default base key "x", editor.js:693; full map: Z = rib-tangent, X = equalize,
D = fixed-rib, S = fixed-rib-compress, Q = measure). On a skeleton **handle** drag,
X selects the "equalize" behavior (shift+X = "equalize-constrain"), implemented in
`equalizeSkeletonHandleFromDelta` (skeleton-modifiers.js:232). It only engages when
the handle sits next to a **smooth** on-curve point that has a handle on its other
side (`getSkeletonHandleEqualizeInfo`); otherwise the drag is a normal handle move.
Effect: the dragged handle moves freely, and the opposite handle of that smooth point
keeps its own direction but is scaled to the **same length** — equalized tension
around the joint. With shift the dragged vector is 45°-constrained and the opposite
handle becomes the exact mirror. Related X effects on other target kinds: on editable
generated points X routes to upstream's "alternate" behavior; on skeleton Tunni
points X equalizes Tunni tensions.

**No gap found:** unlike Z's missing "rib-tangent" (E2), the equalize behaviors are
resolved via `getSkeletonModifierBehaviorName` and dedicated target entries
(`makeEqualizeSkeletonHandleTargetEntry`), not via the point-match behavior registry,
so there is no `invalid behavior name` risk here.

**Decision (2026-07-07): deprecate X-drag equalize.** Alt-drag already covers the
equalize use case, and user testing shows X-drag doesn't work at runtime anyway (not
investigated — moot once deprecated).

**Done (2026-07-07):** removed the `action.realtime.equalize` registration
(editor.js), the `equalizeMode` tool plumbing (edit-tools-pointer.js,
scene-controller.js), the equalize branches in `getSkeletonModifierBehaviorName`
(views-editor skeleton-modifiers.js), the shortcut label (en.js), and the one test
asserting X-routing. Deliberately KEPT: the `"equalize"`/`"equalize-constrain"`
behavior definitions, `makeEqualizeSkeletonHandleTargetEntry`, the fontra-core
equalize helpers and their tests — the machinery is intact, only the X key binding
and its dispatch are gone. Tunni equalize is untouched (it triggers on
ctrl+shift+click of a Tunni midpoint, not the X key). This is a deliberate deviation
from the donor.

---

## 2. Letterspacer

### 2.1 Reverse resets the depth parameter — `fixed` (2026-07-18)

**Report:** Running the reverse function resets the depth parameter in the UI. The
calculation itself uses the value that was set — it just resets _afterwards_.

**Inferred context:** Letterspacer (WS-5/5.1) passed the WS-16 parity audit on engine
behavior, so this is a panel/UI state bug: the reverse action probably triggers a panel
refresh that repopulates fields from defaults instead of the current in-panel values
(or writes params back without the depth field). Purely a state-retention fix in the
letterspacer panel.

**Root cause:** `persistParam` (panel-letterspacer.js) rebuilt each target
source's stored values from `LETTERSPACER_DEFAULTS`, overriding only the edited
key — the `missing[id]` fills only exist for sources _lacking_ values, so any
already-complete source had its two non-edited keys silently reset in storage.
Reverse persists "area" → stored depth wiped to 15 → the `update()` at the end
of reverse reloads params → UI shows reset depth. (The reverse calculation ran
before that, with the in-memory value — hence "calculation uses the value, it
resets afterwards". Ordinary field edits corrupted storage the same way; it
only became visible on the next full panel refresh.)

**Fix:** complete sources now keep their existing stored values as the base
(`getSourceLetterspacerValues(source)`); defaults/nearest-source fills still
apply to genuinely missing sources only.

### 2.2 Apply leaves decimal sidebearings — `fixed` (2026-07-18)

**Report:** letterspacer leaves decimals in sidebearings after apply.

**Root cause:** `applySpacing` rounded the target LSB but shifted the outline by
`roundedLSB - bounds.xMin` — a fractional delta whenever the left extremum is
fractional — smearing decimals onto every point; the RSB (int advance minus now
fractional xMax) then displays decimals too.

**Fix:** the shift delta itself is rounded, keeping point coordinates on the
grid. Remaining decimals can only come from the glyph's own fractional
extrema, not from the letterspacer.

---

## 3. Sixth pass (2026-07-07)

### 3.1 Slider polish — `fixed`

**Report:** Sliders are poorly done overall. (a) Check increments, e.g. for the scale
and distribution sliders. (b) Double-click on the slider thumb should reset the value
to its default. (c) The distribution slider is sometimes only slideable in a single
direction at a time — while increasing you can't reverse into decreasing — but not
reproducibly always.

**Inferred context:** All panel sliders go through
`fontra-webcomponents/src/range-slider.js`. (c) smells like the realtime streaming
path added for 1.2.2 (snapshot-restore per tick) fighting the slider's own value
updates — if the panel repopulates the field from a stale glyph state mid-drag, the
thumb snaps back and drags feel one-directional. (a)/(b) are widget-level features to
compare against the donor's slider.

**Root causes (2026-07-09):**

- (a) _Increments_: no skeleton-panel slider passed a `step`, and even if one had,
  `ui-form.js _addEditNumberSlider` never forwarded `step` (or `displayValue` /
  `values` / `allowInputBeyondRange`) to the RangeSlider — sliders always ran with
  `step="any"` and produced arbitrary fractional values. The donor's RangeSlider also
  derives display decimal places from the step; ours used a range-based heuristic
  only.
- (b) _Double-click reset_: the donor RangeSlider has an `ondblclick` → `reset()`
  handler; our upstream-based copy only had alt-click reset.
- (c) _Direction lock_: in `_pushSummarySlider`, a mixed or absent summary value put
  the thumb at `minValue` (distribution: −100, hard left) — from the end stop the
  slider is literally draggable in only one direction. After one committed drag the
  selection has a uniform value and the slider behaves again, hence "not all the
  time". (Any fresh multi-point selection with differing or unset distributions
  triggered it.)

**Fix:** ported the donor slider features into `range-slider.js` (step-derived
decimals, `displayValue` placeholder, `allowInputBeyondRange`, dblclick reset,
`source` on change events), forwarded the new field properties in
`ui-form.js _addEditNumberSlider` (incl. `disabled`), and set donor-equivalent steps
in the panel: distribution ±100 step 10 (donor ±1 step 0.1), scale 20–200% step 20
with input-beyond-range (donor 0.2–2.0 step 0.2), corner roundness/trim/boost step
0.01, asymmetry step 0.1 (donor edits these as percent with step 1). Mixed/absent
summaries now park the thumb at the default and show a "mixed" placeholder.

### 3.2 Skeleton contours aren't copiable — `fixed`

**Report:** Copying a skeleton contour does not work.

**Inferred context:** Clipboard serialization operates on the path + selected point
indices; skeleton data lives in layer `customData["fontra.internal"]`, which the
copy/paste path presumably never touches. Donor behavior to check: how does the donor
carry skeleton point data through copy/paste (its model stores per-point fields on
the path points themselves, which copy for free — our canonical sidecar doesn't).

**Root cause (2026-07-09):** the donor ships a full implementation — copy embeds a
`skeletonDataByLayer` sidecar in the `fontra-json` clipboard payload (selected
skeleton points mark their contours, per layer), paste appends those contours to the
target layer's skeleton and regenerates. Our fork even had the paste-side id helper
ready (`allocateSkeletonIds` in skeleton-model.js, with tests, comment "Used on
paste") but none of the editor.js plumbing was ever wired.

**Fix:** donor-pattern port adapted to our canonical model.
_Copy_ (`_prepareCopyOrCutLayers`): skeletonPoint selection keys (edit-layer
canonical ids, WS-9) resolve per layer via `resolveSkeletonAddressAcrossLayers`;
selected contours are deep-cloned into `skeletonDataByLayer[layerName]`, which
`_writeLayersToClipboard` embeds in the JSON payload.
_Paste_ (`_pasteLayerGlyphs`): per editing layer, contours are appended through
`editSkeleton` (the one write path — regenerates generated contours), with ids
re-minted by `allocateSkeletonIds` from the target's `nextId`; pasted on-curve
points are added to the selection using the edit layer's new ids.
Caveats (donor-parity scope): cut copies the skeleton sidecar but only deletes path
points, not the skeleton contours; whole-glyph copy (select mode) carries skeleton
data automatically inside layer `customData`, no sidecar needed.

### 3.3 Cap style parameters should be sliders — `fixed`

**Report:** Check the cap style parameters: those should be sliders.

**Inferred context:** The donor panel exposes round-cap radius as a 20-position
logarithmic slider (CAP_RADIUS_MIN 1/128 → CAP_RADIUS_MAX 1/4) plus a tension
slider; square caps have angle/distance. Our panel currently renders these as
number-edit fields. Convert to sliders with donor ranges/mappings.

**Fix (2026-07-09):** cap parameters are now style-gated donor-style sliders in the
Caps & corners section. Round → radius slider (positions 1–20, step 1, mapped
logarithmically onto ratio [1/128, 1/4] via ported `capRadiusRatioFromIndex` /
`capRadiusIndexFromRatio`; default 1/8) and tension slider (0–100%, step 5, default
55%); square → angle slider (−85…85°, step 1) plus distance number field (donor
keeps distance as a number too); butt/mixed → no parameter fields.
`_onCapChange` converts slider units back to model units (index→ratio,
percent→fraction). The per-source "Default caps" number fields are untouched (cap
defaults aren't consumed by the generator — see 1.3/1.4 notes).

### 3.4 Adapt round-cap approach from `test/cap-rounding-rewamp` — `fixed`

**Report:** Check how rounding is done in `test/cap-rounding-rewamp` and adapt the
approach here.

**Inferred context:** That branch (old codebase lineage, diverged at `030a97468`)
reworked round caps to _split-outline geometry_: instead of the projected-scaffold
`generateCap` path, each side outline is split inward from the endpoint
(`splitTerminalSideForRoundCap`), then the cap is rebuilt locally
(`buildRoundCapGeometry`, `getRoundCapFrame`, `assembleOpenOutlineWithRoundCaps`)
with Tunni handle lengths and stable max-roundness topology (coincident endpoints
preserved, `skipColinear` flags). The branch carries its own map doc:
`docs/superpowers/cap-logic-overview.md` (commit `7719b68f4`). The donor pin
`fd76d3abe` predates all of this and forkra's `skeleton-generator.js` only has the
legacy `generateCap` path — so this is a forward-port of donor-side improvements that
never landed in the pinned donor. Significant geometry work; golden-master fixtures
will change by design (they pin the legacy cap output).

**Done (2026-07-09):** ported the split-outline round caps into
`skeleton-generator.js`.

- _Helpers_ (~730 lines, taken verbatim from branch tip `7719b68f4` — all
  geometry-pure, `vector.*`-namespaced, no model coupling): `getRoundCapFrame`,
  `splitTerminalSideForRoundCap` (+ `solveTerminalSplitForDistance`,
  `getRoundCapTerminalSegment`, `resolveRoundCapFallbackDirection`,
  `buildSplitOffCurve`, `buildInsertedRoundCapPoint`),
  `trimSideForRoundCapEmission`, `buildRoundCapGeometry` (+
  `buildRoundCapSegment`, `buildRoundCapEndpoint`, `buildRoundCapTipPoint`,
  `orientDirectionToward`, `isUsableDirection`), `assembleOpenOutlineWithRoundCaps`
  (not called — our inline assembly already has the identical order),
  `getNext/PreviousOnCurvePoint`, `cloneRoundCapPoint`,
  `serializeRoundCapDebugPoint`.
- _Integration_: replaced the old projected-scaffold bodies of `startIsRound` /
  `endIsRound` in `generateOutlineFromSkeletonContour` with the branch's
  helper-driven versions (square/butt branches were already identical). The
  fork's `enforceSmoothColinearity` final-pass options already matched.
- _Golden masters_: the fixture script now supports per-fixture `capReference:
true` — those expectations are generated by the branch generator (extracted
  from git at regen time via `git archive 7719b68f4`, no vendored blob; see
  `CAP_REFERENCE_COMMIT` in the script) while all other fixtures still pin the
  donor at `fd76d3abe`. `open-cubic-round-cap` regenerated against the branch
  reference and **our ported output matches it exactly** — strongest available
  port-fidelity evidence short of runtime.
- _Provenance caveat_: split-outline caps consume the terminal side segment, so
  round-capped endpoints lose their terminal on-curve/handle pointMap entries
  (the split-inserted points carry no provenance). This is consistent with cap
  semantics — setting a round cap already clears the editable flags (1.1) — but
  it means editableGenerated targets never resolve on round-capped terminals.
  Added `open-cubic-butt-cap` fixture and repointed the handle-provenance test
  at it.
- 1368 tests passing, bundle green. **Runtime look still owed**: radius slider
  sweep 1→20 (esp. position 20 = exact max, the historically fragile boundary),
  tension sweep, single-sided round caps, and caps on curved terminals.

---

## 4. Seventh pass (2026-07-17) — problem list only, no research/fixes yet

Recorded verbatim per the user's instruction: list the problems, do not research or
code yet. Items may partially overlap earlier passes; overlaps to be reconciled when
each item is picked up.

### 4.1 Handle labels: layer separation for basic vs skeleton points — `fixed` (2026-07-17)

**Report:** Handle labels should be different layers for basic points and _skeleton_
points. Generated points can share the same layer as basic points. Not a bug but
quality-of-life.

**Fix:** the distance/tension/angle badge rendering for a cubic handle pair was
extracted from `drawPointLabels` into shared `drawCubicHandleLabelPair`
(distance-angle.js). The existing "Point labels" layer keeps covering the path —
basic AND generated contours. New user-switchable layer **"Skeleton point labels"**
(`fontra.skeleton.point-labels`, visualization-layer-skeleton.js) draws the same
badges for the skeleton centerline's cubic segments, honoring the same
show-distance/tension/angle settings. Both layers toggle independently in the
visualization menu.

### 4.2 Realize contours functionality fully missing — `fixed` (2026-07-18)

**Report:** "Realize contours" functionality is fully missing (converting generated
outline contours into plain editable contours, detaching them from the skeleton).

**Donor:** context-menu action "Realize skeleton projection"
(`doRealizeSkeletonProjection`, scene-controller): removes the selected skeleton
contours and their generated-contour tracking; the outlines stay in the path
untouched and become plain contours. No path change, no regeneration.

**Fix (adapted):** `doRealizeSkeletonContours` in scene-controller.js — context
menu "Realize Skeleton Contours", enabled when skeleton points are selected.
Per editing layer (contours resolved by structural ordinal from the edit layer,
WS-9): drop `generated` entries by `skeletonContourId` and the skeleton
contours themselves; `clearSkeletonData` when nothing remains. Deliberately does
NOT go through editSkeleton — regeneration would delete the orphaned outlines.
The freed path contours automatically become fully editable everywhere, since
all gates (selection, pen, knife, select-all) key off the `generated` entries.
Skeleton keys are stripped from the selection afterwards.

### 4.3 Ribs multi-select missing — `fixed` (2026-07-18)

**Report:** Ribs multi-select functionality is missing. Marked per the user as
needing deep UX investment before implementation.

**UX decided by user:** (1) ribs selectable by marquee and shift+click; (2) if
the marquee also covers any other object (basic/skeleton point, anchor, etc.)
the rib selection is dropped in favor of that object; (3) selected ribs are
draggable together — all ribs receive the same delta as the dragged one.

**Fix:** `selectionAtRect` (scene-model.js) collects ribs as a fallback when
the rect contains nothing else (alt-marquee never selects ribs); shift+click
already merged rib keys via the generic select-mode function. The
contiguous-run drag gate (`isSkeletonRibDragAllowed`) was removed;
`createSkeletonRibTargetEntries` (skeleton-editing.js) now applies the dragged
rib's width delta (cursor delta projected onto the clicked rib's own normal)
to every selected rib, so mixed rib orientations grow/shrink together.
Tangent- and interpolate-drag behaviors keep per-rib raw deltas. The clicked
rib is tracked as `initialClickedSkeletonRibKey` (edit-tools-pointer.js),
mirroring the skeleton-point mechanism.

### 4.4 Skeleton + basic contours multi-select UX rework — `works as described` (audited 2026-07-22); a _different_ mixed case is still broken

**Report:** Multi-select across skeleton and basic contours needs a UX rework too
(companion to 4.3).

**Audit (2026-07-22).** No commit ever referenced 4.4 and it never had a Fix
section — it was parked pending a UX decision, exactly as 4.3 was before the
user specified its three rules. But the capability it names **works today**,
acquired incidentally from three other changes:

1. **Marquee** — `selectionAtRect` (scene-model.js) collects `point/N` and
   `skeletonPoint/…` in the same rect (from 4.3's `919bd2634`, plus
   `d667d1555` for the point/handle filter). Ribs are the documented
   fallback-only exception.
2. **Drag** — `EditBehaviorFactory` unpacks `pointSelection` into
   `this.contours` **and** stores `targetEntries` (edit-behavior.js:61–72).
   They are additive, not exclusive: basic points move through the factory's
   own path behavior, skeleton points through the skeleton target entry, in
   one drag and one undo record.
3. **Transform** — 4.13 (`29f9156bb`) passes skeleton target entries to
   `handleBoundsTransformSelection`, using that same additive mechanism.

Ctrl+A (4.6) deliberately produces a mixed skeleton+path selection, which
already assumed this worked.

**The real remaining gap is a different pairing.** `makeSkeletonTargetEntries`
(edit-tools-pointer.js:689) is a mutually exclusive if/else over selection
kinds, so mixed **skeleton-kind × skeleton-kind** selections silently drop part
of the selection:

| Selection                         | Branch taken     | Silently not moved |
| --------------------------------- | ---------------- | ------------------ |
| skeleton point + rib              | rib-like         | the skeleton point |
| skeleton point + generated handle | generated-handle | the skeleton point |
| rib + generated handle            | generated-handle | the rib            |

Reachable by shift+click (marquee can't produce rib+other, by 4.3's rule 2).
Note `getSelectionTargetKinds` already returns a **Set** of kinds — the
modifier machinery anticipates mixed selections while entry construction does
not, which suggests the exclusivity is an unexamined shortcut rather than a
considered design.

**Not fixed here because it needs a UX call**, the same one 4.4 was parked for:
when a rib and a skeleton point are dragged together, does the rib take the
point's raw delta or its own normal-projected width delta (4.3's shared-delta
rule)? The per-kind modifier options (`constrainMode`, `clickedRibKey`,
`fixedRib`) differ, so merging the branches naively would change rib drag
semantics. Decide the rule, then make the branches additive.

### 4.5 Double-click selects whole skeleton contour — `fixed` (2026-07-17)

**Report:** Double-click on a skeleton contour must select the whole contour.

**Fix:** in `handleDoubleClick` (edit-tools-pointer.js): when the double-click
lands on the centerline itself (skeleton segment hit, no skeleton point directly
under the cursor) all on-curve points of that skeleton contour are selected —
mirroring the path behavior where double-clicking a curve selects its contour.
Double-click on a skeleton _point_ keeps its existing meaning (toggle smooth).

### 4.6 Ctrl+A must include skeleton contours — `fixed` (2026-07-18)

**Report:** Skeleton contours must be selected with the Ctrl+A (select all)
shortcut. (Note: WS-era work deliberately _excluded_ generated points from
select-all — C2 — but skeleton points/contours themselves should be included.)

**Fix:** `doSelectAllNone` (editor.js) now treats skeleton on-curve points as
part of the "objects" tier: they're selected with regular points/components,
count toward `hasObjects` and the all-selected check, and participate in the
progressive cycle (objects → +anchors → guidelines). Generated points stay
excluded (C2). Selection keys come from the edit layer's skeleton data
(canonical ids, WS-9).

### 4.7 Point deletion broken — `fixed` (2026-07-17)

**Report:** "Worst bug yet": deletion of points doesn't work properly — leaves stray
handles, draws a non-functional skeleton centerline from the last point to the first
(i.e. the contour appears to close or bridge after deletion), etc. Needs deep
research and fixing.

**Root causes:**

- _Stray handles_: the fork's `deleteSkeletonPoint` (skeleton-model.js) was a naive
  single-point splice. The donor's shape-preserving `deleteSkeletonPoints`
  (path-functions.js:1240) was never ported — it expands the selection to adjacent
  handle runs (on-curve) / the paired handle (off-curve), refits the bridging
  segment with `fitCubic` against the original geometry, inherits cap data onto
  new open-contour endpoints, clears meaningless smooth flags, and removes contours
  left without on-curves.
- _Phantom last→first centerline_: `skeletonContourToPath2d`
  (visualization-layer-skeleton.js) indexed `next`/`afterNext` with
  `% points.length` even for open contours, so trailing stray cubic handles made
  the renderer wrap around and draw a bezier from the last on-curve through the
  strays back to point 0 — exactly the reported bridge.

**Fix:** ported `deleteSkeletonPoints` into `skeleton-model.js`, adapted to the
fork's model (id-addressed points resolved to indices per call, `closed` flag,
cubic-only off-curves, fork cap/corner field set incl. `roundnessStrength` /
`cornerAsymmetry`, fitted handles minted via `makeSkeletonPoint` so ids/nextId
stay consistent, prev-anchor matched by id instead of donor's coordinate match).
`_deleteSelection` in editor.js now passes the resolved `[contourId, pointId]`
pairs to it in one call (still inside `editSkeleton`, so generated contours
regenerate). Renderer hardened: open contours no longer wrap `next`/`afterNext`
(defense-in-depth for malformed data from any source). 5 new model tests
(mid-on-curve refit, paired-handle removal, endpoint cap inheritance, empty-contour
removal, smooth-flag fixup); 1373 passing, bundle green. Runtime check owed:
delete mid points / endpoints / handles on curved skeletons, multi-point delete,
delete across layers. Follow-up (2026-07-17): after deletion the nearest surviving on-curve neighbor of each deleted point stays selected (survivor computed pre-delete, verified post-delete).

### 4.8 Parity miss: asymmetry / corner trim / corner radius misplaced as cap params — `fixed` (2026-07-17)

**Report:** Asymmetry, corner trim and corner radius are _not_ cap style parameters.
They are parameters of the angle-point rounding engine (corner rounding at
non-smooth skeleton points). Needs research from the donor and fixing — both where
the panel surfaces them and how the generator consumes them.

**Donor research:** the donor has a separate **"Corner Rounding"** panel section
with four _point-level_ sliders — Corner Round % (`cornerRoundness`, 0–100),
Corner Asymmetry (`cornerAsymmetry`, −1..1), Corner Reach % (`cornerReach`,
5–99), Roundness Strength % (`roundnessStrength`, 10–400) — all gated by
`_isCornerRoundEditableForPoint`: on-curve, **non-smooth** (angle point), and for
open contours **not an endpoint** (the exact inverse of the cap gate). The
generator consumes those point fields; contour-level `cornerTrimRatio` /
`cornerRadiusBoost` are only fallbacks.

**Root causes in the fork (worse than misplacement):**

- `normalizeSkeletonPoint` only preserved `roundnessStrength`/`cornerAsymmetry` —
  `cornerRoundness` and `cornerReach` were **stripped on every normalize**, so the
  master corner-rounding dial could never persist. The fork's generator was already
  donor-faithful (reads all four point fields) but never saw them.
- The panel's "roundness" slider wrote `roundnessStrength` (the strength/boost
  param) instead of `cornerRoundness` (the main dial) — conflated keys.
- Trim/boost sliders wrote the contour-level _debug fallback_ fields instead of
  point-level `cornerReach`/`roundnessStrength`.
- All four sat inside "Caps & corners" with no angle-point gating.

**Fix:** model — `CAP_POINT_FIELDS` and `CORNER_POINT_FIELDS` split (normalization
keeps both; deletion cap-inheritance copies caps only; `setSkeletonCornerParameters`
writes the four corner fields). Panel — new "Corner rounding" section with the
donor's four percent-based sliders and angle-point gating
(`summarizeSkeletonCornerSelection` rewritten point-level with `canEdit`); caps
section renamed "Caps"; `_onCornerChange` converts % → ratios and routes everything
through `setPanelCornerParameters`; dead `setPanelContourCornerDebug` removed
(contour-level fallbacks remain supported in model/generator). Follow-up: the
generator had its own conflated `CAP_CORNER_POINT_FIELDS` list which lacked
`cornerRoundness`/`cornerReach`, so corner params were dropped at the
canonical→generator boundary and never affected generated points — both model and
generator now use separate `CAP_POINT_FIELDS` / `CORNER_POINT_FIELDS` lists and
forward all corner fields (regression test: corner params must change the
generated outline). 4 new tests; 1376 passing, bundle green. Follow-up
(realtime): cap sliders (radius/tension/angle) and all four corner sliders now
stream onto the canvas while dragging via the generalized
`setPanelPointValuesStream` (the 1.2.2 snapshot-restore recipe — one undo record
per drag; distribution rides the same helper). The panel also listens to
`addCurrentGlyphChangeListener` (throttled, suppressed during its own field
edits) so gates refresh immediately — toggling a point smooth disables the
corner sliders without clickaway. Runtime check owed: corner-round sweep on an angle
point of a closed and an open contour, gating (smooth points and endpoints must
disable the sliders), reach/strength/asymmetry effect on the generated outline.

---

### Intake 2026-07-21 (on `refactor-simple/ws17-parity-bugs`, drop cap merged in)

Recorded as reported; the "inferred context" notes are hypotheses to check, not
diagnoses. The user's own ranking is preserved: 4.12 is flagged "big", 4.13
"biggest".

### 4.9 Drag crosshair missing for skeleton objects — `fixed` (2026-07-22)

**Report:** the drag crosshair should be visible when dragging skeleton-related
objects too — skeleton points, ribs, generated points and handles.

**Root cause.** The `fontra.crosshair` layer
(`visualization-layer-definitions.js`) resolved its position from exactly one
piece of state:

```js
const pointIndex = model.initialClickedPointIndex;
if (pointIndex === undefined) return;
const { x, y } = positionedGlyph.glyph.path.getPoint(pointIndex);
```

`initialClickedPointIndex` is a **path** point index, only ever set from the
`point/N` part of the selection. The skeleton equivalents
`initialClickedSkeletonPointKey` / `initialClickedSkeletonRibKey` were already
being captured and published on the scene model (added for 4.3's multi-rib
drag), but nothing read them for the crosshair — and the editable-generated
kinds were never captured at all.

**Fix.** Three parts, no new drawing code:

1. `scene-model.js` gains `getDragCrosshairPosition(positionedGlyph)` — the one
   seam that resolves the live position of whatever started the drag: path
   point (`path.getPoint`), skeleton point/handle (`getSkeletonPointAddress`),
   rib endpoint (matched against `iterSkeletonRibTargets`), or editable
   generated point/handle (via the existing
   `_getEditableGeneratedCurrentPointIndices`). Every branch reuses an existing
   resolver — no geometry is recomputed (R-B). It early-returns before touching
   skeleton data when no skeleton drag is active, so the layer costs nothing per
   frame when idle.
2. `edit-tools-pointer.js` now also captures `editableGeneratedPoint` /
   `editableGeneratedHandle` from the selection as `initialClickedGeneratedKey`,
   published and deleted alongside the existing keys.
3. The layer becomes render-only (R-A): it calls `getDragCrosshairPosition` and
   strokes, with no knowledge of selection kinds.

Because every branch reads live geometry, the crosshair tracks the object
through the drag rather than sticking at the mousedown position.

**Note on `model` in draw functions:** this is the first fork layer to call a
_method_ on the scene model rather than read a property. Verified safe —
`VisualizationContext` (`visualization-layers.js:98`) holds the live `SceneModel`
instance and already calls `model.getSelectedPositionedGlyph()` on it.

**Scope note:** covers the drag kinds named in the report. Non-selection gizmo
drags (skeleton Tunni) dispatch through a different path and still show no
crosshair — consistent with regular-path Tunni, which doesn't either.

**Manual test matrix (views-editor — no harness).** The layer is
`defaultOn: false` — enable **Drag crosshair** in user settings first. For each
row, drag the object and confirm the dashed crosshair appears and _follows_ it:

| #   | Dragged object                    | Expected                                  |
| --- | --------------------------------- | ----------------------------------------- |
| 1   | Regular path on-curve point       | crosshair follows (regression)            |
| 2   | Regular path handle               | crosshair follows (regression)            |
| 3   | Skeleton on-curve point           | crosshair follows                         |
| 4   | Skeleton off-curve handle         | crosshair follows                         |
| 5   | Rib endpoint (width drag)         | crosshair follows the rib endpoint        |
| 6   | Editable generated on-curve point | crosshair follows                         |
| 7   | Editable generated handle         | crosshair follows                         |
| 8   | Multi-select drag (skeleton)      | crosshair tracks the _clicked_ point only |
| 9   | Marquee/rect select               | no crosshair                              |
| 10  | After mouseup                     | crosshair disappears (state deleted)      |
| 11  | Layer toggled off                 | no crosshair for any of the above         |

### 4.10 Panel must show all skeleton parameters for any skeleton selection — `fixed` (2026-07-22)

**Report:** ALL skeleton-related parameters should be visible when _any_
skeleton object is selected. Consult the donor for how its panel behaved.

**Investigation.** Audited the four section gates in `update()`
(`panel-skeleton-parameters.js`). Three were already correct after 6.8:

- **width / cap / corner** gate on `collectWidthEditPoints`, which since 6.8
  resolves every selected skeleton object (points, handles, generated
  points/handles, ribs) to its owning on-curve. ✅
- **contour** gates on `panelSelection.contours`, and
  `collectSkeletonPanelSelection` calls `noteContour` for _every_ kind, so the
  contour section already appeared for any skeleton selection. ✅
- **ribs** gated on `panelSelection.ribs` — the only section that required an
  _explicit rib endpoint_ selection. Selecting a skeleton point, handle or
  generated point showed no rib parameters at all. ❌

So 4.10 reduced to the rib section alone.

**Fix.** New `collectRibEditTargets(panelSelection)` in
`skeleton-panel-model.js`: an explicit rib selection is used verbatim;
otherwise every resolved on-curve point contributes **both** of its ribs, via
the shared `getSkeletonRibSidesForPoint` (so single-sided contours contribute
only their live side). The panel gates the rib section on this list and routes
`_onRibChange` / `_resetRibs` through it.

Also added `editable` to the panel state signature so the rib checkbox stays
correct when a rib is made editable outside the panel. Handle offsets are
deliberately **not** in the signature: they change every frame while a
generated handle is dragged, which would rebuild the panel per frame.

### 4.11 No "reset ribs" button for a selected skeleton point — `fixed` (2026-07-22)

**Report:** when a skeleton point is selected there should be a button that
resets _both_ of that point's ribs.

**Fix.** Falls out of 4.10's `collectRibEditTargets`: with a skeleton point
selected, the rib section's existing **Reset rib** / **Reset handles** buttons
now act on both of that point's ribs, because the derived target list contains
both sides. No new edit code was needed — `resetPanelRibs` →
`resetSkeletonEditableRib` / `resetSkeletonEditableRibHandles` already did the
per-side work, and was already wired to the buttons.

The reset button relabels itself to **Reset both ribs**
(`sidebar.skeleton-parameters.reset-ribs-both`) when it is acting on derived
targets covering more than one rib, so it is clear it is not resetting a single
hand-picked rib.

Scope: "reset" therefore means what `resetSkeletonEditableRib` already meant —
per-side width override, nudge, handle offsets/detach and the editable flag.
The related 5.3 item (single generated handle reset, from
`z-mod-for-editable`) is a narrower scope and remains open.

**Manual test matrix for 4.10 + 4.11 (views-editor — no harness):**

| #   | Selection                         | Expected                                                       |
| --- | --------------------------------- | -------------------------------------------------------------- |
| 1   | Skeleton on-curve point           | width + contour + cap + corner + **rib** sections all show     |
| 2   | Skeleton off-curve handle         | same sections show (resolves to owning on-curve)               |
| 3   | Editable generated point          | same sections show                                             |
| 4   | Editable generated handle         | same sections show                                             |
| 5   | Single rib endpoint               | rib section shows; button reads **Reset rib** (singular)       |
| 6   | Skeleton point → Reset rib        | button reads **Reset both ribs**; both sides reset in one undo |
| 7   | Skeleton point → Reset handles    | handle offsets/detach cleared on both sides                    |
| 8   | Point on a single-sided contour   | rib section shows one side only; label stays **Reset rib**     |
| 9   | Point → toggle Editable           | both ribs become editable (markers appear on both sides)       |
| 10  | Multi-select several points       | rib ops apply to every selected point's both ribs, one undo    |
| 11  | Make a rib editable via canvas    | panel checkbox updates without needing a reselect              |
| 12  | Drag an editable generated handle | panel does **not** rebuild per frame (no flicker, no lag)      |

### 4.12 Q-measure ignores the skeleton — `fixed` (2026-07-22)

**Report:** the Q measurement tool does not see skeleton geometry at all.
Consult the donor if necessary.

**Investigation (correcting the report's scope).** Measure has four hover
targets, checked in order: control-point handle → skeleton rib → segment →
selected points. Two of the four already covered the skeleton:

- **Rib width** was already wired (`_findSkeletonRibForMeasure` →
  `skeletonRibAtPoint`, renders total + L/R half-widths). Not broken.
- **Two-point selection** measure is path-only, but that is a selection
  feature, not a hover surface — out of scope here.

The genuinely missing surfaces were the two hover targets that only ever
looked at `positionedGlyph.glyph.path`:

1. **Centerline segments** — `_findSegmentForMeasure` checked only the path.
   Hovering the centerline measured nothing; the generated _outline_ measured
   as a green "path", which is what made the skeleton look invisible to
   measure (you always hit the outline, never the centerline).
2. **Skeleton handles** — `_findControlPointForMeasure` scanned only path
   handles, so hovering a skeleton off-curve handle gave no length/tension.

**Fix (detection-only wiring; the overlay already renders `type: "skeleton"`).**
Two new hit-tests in `scene-model.js`, both reusing the existing private
iterators `iterSkeletonCurveSegments` / `skeletonSegmentDistance` (R-A, R-B):

- `skeletonSegmentAtPoint(point, size, positionedGlyph)` → `{ p1, p2 }` of the
  hit centerline segment's on-curve endpoints (distance/angle only — curve
  tension is a handle measurement, matching the path-segment behavior).
- `skeletonHandleAtPoint(point, size, positionedGlyph)` →
  `{ p1: handle, p2: anchor, tensionContext }`. For cubic segments the context
  carries the four segment points + hovered side so `calculateHandleMeasure`
  reports tension; quadratic handles report tension `n/a`.

`measure-interactions.js` consumes both, tagging the payload `type: "skeleton"`:
the skeleton handle is checked before path handles in `_findControlPointForMeasure`,
and the skeleton segment before the path in `_findSegmentForMeasure`. The
overlay's handle and segment branches already select `skeletonColor` on
`type === "skeleton"` and already compute tension from `tensionContext`, so no
render change was needed. `_measurePointsEqual` already compares `type` and
`tensionContext`, so the added targets don't flicker.

Priority note: on the centerline the skeleton segment wins (the outline edges
are ~half-width away, well beyond the hit margin); near the edges the path
outline still measures. This is intentional and matches the donor.

**Deliberately still `open` (separate from measure):** the z-order / hit-radius
hygiene and the drag-marker/measurement affordance from
`test/skeleton-width-highlight` / `test/q-metrix-drag` (5.1/5.2) are not part of
the measure fix and remain to be adapted.

**Manual test matrix (views-editor — no harness):** on a glyph with a curved
skeleton stroke, hold **Q** and verify:

| #   | Hover target                         | Expected                                                        |
| --- | ------------------------------------ | --------------------------------------------------------------- |
| 1   | Straight skeleton centerline segment | blue segment measure, X/Y (or direct with Alt) distance         |
| 2   | Curved skeleton centerline segment   | blue segment measure, endpoint distance (no tension on segment) |
| 3   | Skeleton cubic handle                | blue guide, `dist / tension / angle`, tension is a real number  |
| 4   | Skeleton quadratic handle            | blue guide, `dist / n/a / angle`                                |
| 5   | Rib endpoint                         | blue, `width / L … R …` (regression — was already working)      |
| 6   | Generated outline edge/segment       | green "path" measure (unchanged)                                |
| 7   | Generated outline handle             | green path handle measure (unchanged)                           |
| 8   | Centerline vs nearby outline         | centerline gives blue; moving onto the edge switches to green   |
| 9   | Alt held (direct mode)               | segment shows single direct distance+angle instead of X/Y split |
| 10  | Release Q                            | all measure overlays clear                                      |

### 4.13 Skeleton is not marquee-transformable — `fixed` (2026-07-21)

**Report:** the selection border with its drag controls (the draggable circles,
same as for basic points) _appears_ around a skeleton selection, but the
transform itself cannot be performed — dragging the handles does nothing.

**Inferred context:** so selection-bounds computation already includes skeleton
points (the box is correct) while the transform application path does not — the
handles presumably move regular path points through the edit-behavior machinery
and never route skeleton points through `editSkeleton` (C2). Compare 6.9, where
the transformation panel's align/distribute had the mirror-image problem (bounds
wrong, movement fine) — this is bounds fine, movement missing. Also compare
WS-16's "transformation panel operating on skeleton selections" deliverable,
which may have covered the panel but not the on-canvas marquee handles.

**Root cause:** exactly that split. `getSelectionBounds` (glyph-controller.js)
already parses `skeletonPoint`/`skeletonRib`/`editableGenerated*` keys, so the
box is drawn correctly — but `handleBoundsTransformSelection`
(edit-tools-pointer.js) built its `EditBehaviorFactory` with only three
arguments, i.e. **no `targetEntries`**. Skeleton geometry reaches the edit
behavior exclusively through target entries (C2), so the transform moved the
path selection only; with a pure skeleton selection there was nothing to move.
The drag path (`handleDragSelection`) has passed `targetEntries` all along —
only the transform path was never wired. `makeSkeletonPointTargetEntry` already
builds a separate transform factory and implements
`makeChangeForTransformation`, so no new edit semantics were needed.

**Fix:** `handleBoundsTransformSelection` now resolves the edit layer's
reference skeleton data and builds `makeSkeletonPointTargetEntry(..., "default",
...)` per layer, handing it to the factory the same way the drag path does.
Rollback needed no work — `EditBehavior.rollbackChange` already consolidates
target-entry rollbacks. Rib and editable-generated entries are deliberately not
built here: their `makeChangeForTransformation` returns null (no transform
semantics), so a rib-only selection still gets a box that does nothing —
recorded as a follow-up if it turns out the donor scaled rib widths.

**Manual test matrix owed** (no views-editor test harness): marquee a whole
skeleton contour and drag each of the 8 resize handles; the same with rotation
handles; shift-constrain and alt-from-center on both; mixed skeleton + path
selection; two-master editing (both layers must transform); undo/redo lands as
one record; generated contours follow live during the drag.

---

## 5. Old-architecture feature branches to adapt

Three branches carry functionally useful features built on the _old_ codebase
architecture (all diverge from main at `030a97468`, the same lineage as
`test/cap-rounding-rewamp`). They need to be re-adapted to the current
refactor-simple architecture — a port of behavior, not a merge (the merge base is
~1050 commits back and the underlying data model has since changed).

**Branch topology (important):** the three branches plus `cap-rounding-rewamp` sit
on a single line:

```
030a97468 (old main)
  └─ … ~1040 commits (old architecture) …
      └─ test/skeleton-width-highlight   (tip 14043f1e0)
          ├─ test/q-metrix-drag          (tip 70bc74dbd = width-highlight + 1 commit)
          │    └─ test/cap-rounding-rewamp (tip 7719b68f4 — already ported, § 3.4)
          └─ test/z-mod-for-editable     (tip 91b9b77ce = q-metrix + 14 commits)
```

So `cap-rounding-rewamp` (our 3.4 reference) already _contains_ everything in
`skeleton-width-highlight` and `q-metrix-drag` — its working tree is a valid single
reference for those features. Only `z-mod-for-editable` has commits beyond it.

### 5.1 `test/skeleton-width-highlight` — `open` (adapt)

Tip `14043f1e0` "Fix skeleton handle hit priority and show rib width labels".
Feature content (top-of-branch cluster):

- **Rib width labels**: show rib width values as canvas labels (tip commit), plus
  the Q-metrics hover overlay lineage deeper in the branch: "Add Q-metrics: show
  rib width on hover over skeleton points" (`36a5e952b`), width shown on rib
  endpoints not skeleton points, nudge-offset aware, tension display, styled label
  (rounded corners, darker border), curved-segment detection by bezier sampling.
- **Hit-test / z-order hygiene**: skeleton centerline/ribs/segments z-index lowered
  below editable elements (400/402/398), segment selection moved to lowest priority
  (below anchors/guidelines), fixed hit radii in glyph units (Tunni points 10,
  segments 4 — no zoom scaling), editable off-curve hit-test fix, handle hit
  priority fix.

### 5.2 `test/q-metrix-drag` — `open` (adapt)

Tip `70bc74dbd` = skeleton-width-highlight + one commit ("small marker fix",
touching `edit-behavior-adapters.js` + `edit-tools-pointer.js`, +87 lines — a
drag-marker/measurement affordance in the pointer tool). The branch's namesake
content is the **Q-key metrics measurement tool** for the Pointer Tool
(`98cb61d7e` "Add Q-key measurement tool for Pointer Tool" and the Q-metrics
commits listed under 5.1) plus drag-behavior work: preserve handle angles during
fixed-rib drag, X-equalize restore for editable generated handles. Since
`cap-rounding-rewamp` contains all of it except the tip commit, adapting 5.1 + 5.2
can be done from the `cap-rounding-rewamp` tree (plus `70bc74dbd` cherry-read).

### 5.3 `test/z-mod-for-editable` — `partly adapted` (2026-07-22)

**Outcome:** of the three features, one was portable and is done; the other two
are coupled to a product decision we have not taken. See the disposition after
the feature list.

Tip `91b9b77ce`; 14 commits beyond `q-metrix-drag` (also beyond
`cap-rounding-rewamp`), so this branch itself is the reference. Three features:

- **Side locks replace editable flags** (`e8772c913` … `53746bd67`): the skeleton
  point `editable: {left, right}` flags become `locked: {left, right}` semantics —
  panel and visuals switched to side locks, locks enforced in routed edits, locked
  rib geometry preserved for discovery, implicit lock on width collapse removed.
  Design/spec/plan docs are in the branch
  (`docs/…/2026-03-25-skeleton-generated-side-locking*.md`). **Adaptation note:**
  our current model kept `editable` flags (1.5.x rework gated z-tangent-drag on
  them) — adapting this means reconciling two divergent evolutions of the same
  flag, not a straight port.
- **Z-only generated handle drag** (`9ab2640c7` "restore z-only generated handle
  drag and rib colors"): the Z modifier restricted to dragging generated handles
  (we re-implemented a version of this as z-tangent-drag; compare behavior).
- **Single generated handle reset action** (`1c4027b5b` + spec
  `2026-03-27-single-generated-handle-reset.md`): an action to reset one generated
  handle (not the whole pair/point) to its derived position.

Runtime files touched beyond q-metrix (for scoping): `edit-behavior-adapters.js`
(±212), `panel-skeleton-parameters.js` (±513), `skeleton-visualization-layers.js`,
`edit-behavior.js/-registry.js`, `edit-tools-pointer.js/-skeleton.js`,
`scene-model.js`, `skeleton-contour-generator.js`.

#### Disposition (2026-07-22)

**Single generated handle reset — `adapted`.** Semantics ported, keys not: the
donor's plan clears flat legacy keys (`leftHandleInOffsetX` …); our canonical
model stores `handleOffsets[side+role] = {x, y, detached}`.

- `resetSkeletonEditableRibHandle(point, side, role)` in `skeleton-model.js`
  removes the single entry. `resetSkeletonEditableRibHandles` now loops through
  it, so the deletion exists once (R-B). Mocha-covered (3 new tests).
- `resetPanelGeneratedHandle` in `skeleton-panel-edits.js` routes it through
  `editSelectedSkeletonPoints` → `editSkeleton` (R-C).
- `singleGeneratedHandleTarget` (`skeleton-panel-model.js`) qualifies the state:
  exactly one selected `editableGeneratedHandle` and no other skeleton object.
  The panel then shows a third **Reset this handle** button in the rib section —
  which is reachable in that state only because 4.10 derives rib targets from
  the owning point.

  **Detach survives the reset** (donor spec: "do not clear detach state"). A
  detached handle is reset _and re-detached at the derived position_, which
  becomes its new absolute anchor — the mode is a user choice, so resetting a
  position must not silently discard it.

  It can't just ride through, because the flag is stored on the very offset
  entry being cleared, and an all-zero detached offset would sit on the rib
  point (detached offsets are measured from the rib point,
  `skeleton-generator.js:529`). So `resetPanelGeneratedHandle` regenerates with
  that one offset removed, reads the derived handle and rib-point positions out
  of the generator output, and writes back
  `{x: derived − ribPoint, y: …, detached: true}` — the same
  scratch-regeneration technique `computeRibDetachConversions` already uses.

**Z-only generated handle drag — `not ported` (coupled to side locks).** The
donor's rule is "plain drag does nothing on a generated handle; Z-drag adjusts
it". That exists because the side-lock model makes generated adjustment
**default-on**, so plain drags had to be restricted to avoid nudging derived
geometry by accident. Our model is opt-in via `editable`: the user has already
declared intent for that handle, so plain drag is the useful default. Porting
the restriction alone would make our editable handles strictly harder to use.
Revisit only if the side-lock model is adopted.

**Side locks replace editable flags — `not ported` (needs a product decision).**
This is a semantic inversion, not a port: generated-side adjustment becomes
available by default and `locked: {left, right}` blocks it, replacing
`editable: {left, right}` opt-in. It touches the schema, the panel, visuals,
routed edits and the generator (locked rib geometry preserved for discovery),
and it conflicts with our own evolution — 1.5.x gated z-tangent-drag on
`editable`, and 4.10/4.11 build the panel's rib section and reset flow on it.

The call is a UX one: should marking a side be **opt-in to edit** (today) or
**opt-out of editing** (donor)? Everything else in this bullet follows from
that answer. Do not start it as a mechanical rename.

---

## 6. Eighth pass — defaults/caps stability (2026-07-18, all fixed same day)

### 6.1 Cap/width sliders resetting to defaults mid-edit — `fixed`

**Root cause:** skeleton panel edits carried no sender identity, so the panel's
own postChange echo arrived after the suppression window and scheduled a
trailing throttled rebuild that replaced the slider input under the user (and
could briefly read not-yet-settled values). **Fix:** `SKELETON_PANEL_SENDER`
passed as `editGlyph` senderID by both write funnels in skeleton-panel-edits.js
(`runSkeletonPanelEdit`, `setPanelPointValuesStream`); the panel's glyphChanged
listener ignores events with that sender.

### 6.2 Force-apply master defaults (caps + width) — `fixed`

Donor "Profile" select adapted: width section gets a dropdown
(base/horizontal/contrast + custom widths for the glyph's case) and cap section
gets one (base + custom cap profiles for the active style), each with an
"Apply default" button using the letterspacer-reverse two-click confirm
(arm + tooltip, second click applies). Applies via setPanelPointTotalWidth /
setPanelCapParameters.

### 6.3 Master default width not hooked — `fixed`

The skeleton pen created contours with hardcoded `DEFAULT_SKELETON_WIDTH` (80);
now seeds `defaultWidth` from the master's case width
(`resolveEffectiveSourceSkeletonDefault` + `getDefaultSkeletonWidthKeyForGlyphName`).

### 6.4 Custom width parameters missing — `fixed`

Donor `addCustomWidthRows` ported into the glyph-panel defaults section:
per-case list of {name, value} rows (rename, edit, two-click delete, Add),
stored under `widthProfiles.<case>` (CUSTOM_WIDTHS keys already existed in the
schema). Entries feed the 6.2 width dropdown.

### 6.5 Cap defaults were number inputs — `fixed`

Glyph-panel "Default caps" now uses the same sliders as the parameters panel
(radius as 1-based log positions, tension %, angle −85..85); values convert
back to model units on persist.

### 6.6 Virtual (not-yet-created) source: skeleton invisible, deletion ate generated points — `fixed`

**Report:** with a font source that has no glyph source yet ("virtual" row in the
designspace panel) selected, the canvas showed generated points without the
centerline, and deleting removed only the generated points, leaving the
skeleton curve — instead of duplicating the normal skeleton deletion.

**Root cause:** at non-source positions every skeleton resolver ends in
`getSkeletonData(positionedGlyph.glyph)` — but that's the
StaticGlyphController, which didn't expose `customData`, so skeleton data
resolved to null (no centerline, no generated-point gating, plain-path
deletion). The interpolated _instance_ actually carries correctly interpolated
skeleton customData (structure is identical across layers per WS-9, so the
variation model interpolates it numerically — verified empirically).

**Fix:** `StaticGlyphController.customData` getter returning
`instance.customData` (glyph-controller.js). With skeleton data resolvable,
display/hit-tests/gating work at virtual positions, and deletion flows through
the normal skeleton path: `_editGlyphOrInstance` first runs
`_insertGlyphSourceIfAtFontSource` (implicit source creation, seeded from the
same instance — including its skeleton data), then `_deleteSelection`'s
skeleton branch edits the new layer via editSkeleton. Regression test:
"get StaticGlyphController customData".

### 6.7 Editable handles next to a round-capped endpoint unselectable — `fixed`

**Report:** for a skeleton point adjacent to the last point, only the generated
handles facing _away_ from the last point were editable.

**Root cause:** the round-cap terminal split (3.4 split-outline port) rebuilds
the trimmed terminal segment from scratch (`splitTerminalSideForRoundCap`) —
the new split handles and inserted on-curve carried no `_provenance`, so the
fallback annotator guessed with `side: null`, and
`resolveEditableGeneratedTarget` rejects side-less provenance: everything in
the trimmed region (both sides, toward the endpoint) stopped being
addressable/selectable. Away-facing handles kept their original provenance.

**Fix:** provenance is carried through the split
(`withRoundCapProvenance` in skeleton-generator.js): new handles inherit the
original segment handles' attribution, the inserted on-curve inherits the
reference endpoint's. Cap-arc geometry stays side-null (never editable, by
design). Regression test: "keeps provenance on handles next to a round-capped
endpoint".

### 6.8 Panel shows parameters only for skeleton on-curve selections — `fixed`

**Report:** skeleton parameters should show on the panel when _any_ skeleton
object is selected — not only skeleton on-curve points, but also skeleton
handles, generated points and generated handles.

**Root cause:** `collectSkeletonPanelSelection` already parsed generated
points/handles, but `collectWidthEditPoints` (which feeds every parameter
section) only consumed on-curve skeleton points and ribs. Skeleton handles
share the `skeletonPoint/` key namespace and landed in `points` as off-curves
with no meaningful width/cap/corner values.

**Fix:** every selected skeleton object now resolves to its owning on-curve
skeleton point in `collectWidthEditPoints` (skeleton-panel-model.js):
off-curve handles via `anchorOnCurveEntry` (handle right after an on-curve is
its "out"; otherwise it leads into the next on-curve), generated
points/handles via the skeleton point id already in their selection keys. The
rebuild-skip signature tracks the resolved edit points so parameter changes
reached through handles/generated objects still trigger a rebuild.

### 6.9 Align/distribute ignores basic handles — `fixed`

**Report:** aligning should work for basic (path) handles the same way it does
for basic points; skeleton points and handles were alignable from the start.

**Root cause:** the transformation panel did turn each selected handle into an
individual movable object, and the edit behavior moves bare off-curves fine —
but `MovableObject.computeBounds` went through `getSelectionBounds` →
`filterPathByPointIndices`, which greedily expands an off-curve selection to
its whole segment. Every handle's "bounds" was its segment's box: handles in
the same segment got identical boxes (align deltas all zero — nothing visibly
happened), handles in different segments aligned their segment boxes instead
of themselves. Skeleton points/handles never had the problem because their
bounds resolve per point id.

**Fix:** `MovablePoint` (panel-transformation.js) — per-point movable objects
now report the point's own coordinate rect as bounds, matching the
zero-size-rect convention anchors already use. On-curve point behavior is
unchanged (their filtered bounds already collapsed to the point itself).

### 6.10 Detached handles "shiver" when adjusting skeleton handles — `open (investigated)`

**Report:** detached generated handles visibly shiver while the corresponding
skeleton handles are adjusted. Investigation only, no code changes yet.

**Findings (verified with a generator sweep script — skeleton handle moved in
1-unit steps, detached generated handle tracked via provenance):**

1. **Detached mode's absolute position is destroyed downstream.**
   `applyHandleOffsetToControlPoint` correctly computes ribPoint + offset, but
   the single-cubic emission path then runs `lockNearZeroHandleDirection`
   (skeleton-generator.js ~2751) on _every_ terminal handle. Its normal branch
   rebuilds the handle as `anchor + skeletonHandleDir * projectedLength` — the
   perpendicular component of the detached offset is discarded and the handle
   is re-coupled to the skeleton handle _direction_. Measured: stored offset
   (25, 40) emitted as ≈(35, 12), exactly the projection onto the skeleton
   handle dir. So every skeleton-handle rotation rotates the "detached" handle
   with it. Bonus defect: `preferMinimalOnFlip=true` collapses the handle to a
   ~1-unit stub if the detached offset points backward vs the skeleton handle.

2. **`enforceSmoothColinearity` doesn't know about detached/editable
   handles.** The post-pass rotates both handles around every smooth generated
   on-curve into a length-weighted average direction; the only escape hatch is
   `skipColinear`, set only for round-cap endpoints. As the opposite-side
   handle moves with the skeleton, the detached handle is re-rotated — and the
   pass engages/disengages across thresholds (60° rotation cap,
   minReliableHandleLength 0.75), producing discontinuous jumps. Evidence: the
   sweep output flips from integer to un-rounded float coordinates mid-sweep
   (colinearity writes are the only unrounded emission).

3. **Quantization flicker.** Handles are `Math.round`ed at several stages
   while their bases move smoothly → ±1 stepping on top of 1–2.

4. Secondary: the multi-curve fallback path applies offsets only to first/last
   curves and skips the near-zero lock entirely, so flipping between the
   simplified-cubic and fallback emission paths mid-drag changes the handle
   math frame-to-frame.

**Likely fix direction (not applied):** treat detached (and probably any
user-offset editable) handles as authoritative — skip the direction
reprojection and exclude them from colinearity enforcement (e.g. mark emitted
points, like `skipColinear`, when a detached/2D offset was applied).

---

## 7. New cap style: "drop" (asymmetric ball terminal) — `feature, added`

Requested feature, not a parity bug: a bulbous serif-style terminal (as on an
'a' tail) that reads as a **continuation of the outer generated edge**, so it is
asymmetric rather than a symmetric droplet.

**Construction** (`buildDropCap` in `skeleton-generator.js`, dispatched from
the start/end cap branches alongside round/square):

1. Resolve the outer (swell) side. `resolveDropCapOuterSide` uses the terminal
   segment's curvature — convex side gets the ball (`cross > 0 → left`) — with
   a per-point/contour `capBallSide` override (`auto`/`left`/`right`); straight
   terminals fall back to the wider side.
2. The ball is an **ellipse expressed as the unit circle under an affine map**
   (`makeDropCapBall`): `p(u,v) = center + ex·a·u + ey·b·v`, with `ex` along the
   outer edge's tangent at the attachment and `ey` pointing from the outer edge
   toward the skeleton. Lateral radius `b = clamp(capBallRatio, 0.5..3) ·
capWidth / 2`; along-stroke radius `a` comes from step 3. Affinity is what
   makes this cheap: arcs emitted in (u,v) space stay exact cubics after
   mapping, and "inside the ball" is a unit test on (u,v) — so all the trim
   machinery works on the ellipse unchanged.
3. **The ball is pulled back onto the terminal** (`solveDropCapBallOnTerminal`).
   The outer edge is trimmed back by the shape-derived distance with the round
   cap's own `splitTerminalSideForRoundCap`; the ball is tangent to the edge at
   the inserted point (`center = tangency + ey·b`, so the attachment sits at
   parametric `θ = −π/2`); and `a` is then solved so the ball's furthest point
   along the outward tangent lands **exactly on the terminal plane** — the line
   through the endpoint that a butt cap sits on. On a curved terminal the edge
   tangent has rotated, so the lateral swell reaches forward too and the solve
   accounts for it (`hypot(a·ex·f, b·ey·f) = room`); when the lateral swell
   alone already breaches the plane, the trim walks further back until there is
   room.
4. `findSideBallCrossing` trims the **inner** side at the ball boundary
   (bisection on the segment bezier; linear segments interpolated), inserting a
   crossing on-curve — the concave neck. It takes the **rear-most** transition
   scanning backward from the terminal (everything forward of it is swallowed by
   the ball, so that is where the ball lifts off the edge) and walks onto earlier
   segments while they stay inside the ball, since an elongated or large ball
   easily reaches past the terminal segment. Provenance is carried onto the
   crossing via `withRoundCapProvenance`. When the ball is too small to reach
   the inner edge, a short concave neck cubic bridges to the untrimmed inner
   terminal instead.
5. Emit the ball as kappa cubic arcs (`emitDropCapArc`) counter-clockwise from
   the tangency at `θ = −π/2`, around the forward tip at `θ = 0`, to the inner
   attachment. No sweep heuristic is needed — the direction falls out of the
   parametrization. The arc's terminal on-curve is dropped in corner mode — the
   trimmed inner side already provides the crossing. The piece count is
   **fixed** (`DROP_CAP_ARC_PIECES = 4`, so every piece stays under 90° even at
   a full sweep) rather than derived from the sweep: a count that steps with the
   sweep restructures the contour mid-drag and would break point compatibility
   between masters.

**Both** sides are trimmed: the outer at the tangency, the inner at the
crossing. `buildDropCap` returns the trimmed left/right sides plus the cap
points; the dispatch reassigns `roundedLeftSide`/`roundedRightSide`. Ball
on-curves and the tangency carry `skipColinear` so the colinearity post-pass
can't deform the ellipse or rotate the tangential junction.

_Revision history: the first cut lengthened the stroke and mirrored to the
concave side; the second centred the ball on the endpoint's perpendicular
(tangent-from-inside + inner trim), which still hung a full radius past the end
of the skeleton. The current construction pins the ball to the terminal plane —
a drop-capped stroke now measures exactly as long as a butt- or round-capped one,
on straight and curved terminals alike._

**`capTension` drives the neck.** `findSideBallCrossing`/`rebuildTrimmedSide`
split the trim into crossing-finding + rebuild. With tension the inner trim is
pulled back by inflating the trim ball (`1 + tension·NECK_PULLBACK_FACTOR`); the
arc ends at a backed-off ball attachment and a single cubic eases into the
pulled-back trim — tangent to the ball at the ball end, along the stroke edge at
the inner end (`NECK_HANDLE_FRACTION` of the chord). Tension 0 = a crisp corner;
higher = a wider concave ease. The inflation backs off (×0.65 per step) until the
grown ball still yields a crossing genuinely _behind_ the plain one
(`crossingBackness`) — otherwise a ball large enough to run the rear crossing off
the side would report the forward crossing and fold the neck back over the
stroke.

**The neck leaves the edge tangentially** wherever it lands. The fillet's
edge-side handle takes its direction from `crossingTangent` — the actual
derivative of the inner edge at the crossing, emitted by `findSideBallCrossing`
— not from the ball's own axis `ex`. Using `ex` (a fixed direction, the outer
edge's tangent at the tangency) only looked right while the crossing sat on a
stretch parallel to it; as tension or shape walked the neck further back along a
curved edge the error grew, and `enforceSmoothColinearity` hid it by rotating
the _edge_ handle to match — so the edge handle stopped tracking the curve and
the point appeared to "travel with a fixed handle angle". Measured on a curved
terminal, the neck handle's deviation from the true edge tangent used to grow
1.1° → 7.5° across tension 0.5 → 2.5; it is now flat at 0.1–1.0° (coordinate
rounding). The bridge-mode neck likewise uses `getSideTerminalTangent`.

The neck backs off **both** sides of the corner: the ball attachment along the
arc (`thetaArcEnd = thetaInner − backoff`) as well as the inner trim along the
edge. An earlier cut kept the arc running to the exact crossing and pulled only
the inner side back, so the ball-side handle continued the arc's tangent and
**overshot below the edge into a dip** rather than easing in. The backoff is
capped (`MAX_NECK_ARC_BACKOFF = 0.6` rad, and 0.35·sweep) so a very soft neck
eases into the edge instead of eating the ball itself; past the cap the extra
tension only reaches further back along the edge.

**`capBallShape` stretches the ball backward** (0 = round, 1 = fully teardrop),
setting how far back along the outer edge the ball attaches:
`trim = b · (1 + shape · BALL_SHAPE_ELONGATION)` with `BALL_SHAPE_ELONGATION =
1.4`, clamped to 95% of the outer terminal segment. Because the forward extreme
stays pinned to the terminal plane and the lateral radius `b` is untouched, the
**swell does not change size** — the ball attaches further back and tapers into
the stroke, which is what makes it read as a drop. (The previous `warpDropCapBall`
radial-bulge warp is gone: it pushed the arc outward, so the slider behaved as a
second, coarser size control.)

**`capTension` range** for the drop cap is `[0, MAX_CAP_TENSION_DROP]` = **0–3**,
with the panel slider at 0–300% (`CAP_TENSION_DROP_MAX`). Other cap styles keep
their own 0–1 tension slider.

**Data / UI:** `capStyle: "drop"` and fields `capBallRatio` + `capBallShape`
(numeric, in `CAP_POINT_FIELDS`) + `capBallSide` (string, `auto`/`left`/`right`)
in `skeleton-model.js` (normalize, copy, set) and threaded through the
generator's canonical mapping. Panel: "Drop" in the cap-style dropdown, a
Ball-size slider (percent of stroke width, **105–300%**, default 125), a
**Ball-shape** slider (**0–40%**, default 0), the tension slider (0–300%), an
auto/left/right Ball-side select, and drop in the force-apply profile flow.
Master-level ball default deferred (force-apply uses the 1.25 constant).

The ball-size and ball-shape slider ranges are _usable_ ranges, not limits: both
carry `allowInputBeyondRange`, so typing into the number field reaches the
model's full range (ball 50–300%, shape 0–100%) — below 105% the ball is
narrower than the stroke and reads as a fillet rather than a bulb, and past 40%
shape it attaches so far back it stops reading as a terminal. `range-slider.js`
now also drops the step constraint on the number input when
`allowInputBeyondRange` is set, so a manual override is not quantised to the
slider's drag step.

Tests: twelve cases in `test-skeleton-generator.js` — straight/curved terminals,
ratio scaling, side override, start endpoint, all finite/closed, plus the three
that pin the current behavior: **reach equals a butt cap's** across every ball
size/shape/tension on both a straight and a curved terminal (sampled, since
control points overshoot the curve), tension eases further back without dipping
below the edge and keeps working past 1, and shape stretches backward with the
lateral swell unchanged. 1391 passing, bundle green.

---

## Process

Per the standing directive: fix what's worth fixing in real time, write down what needs
more attention — either way, all findings land in this doc (statuses updated per item)
and/or `2026-07-05-post-ws16-review.md` for anything that turns out to be a
cross-cutting finding.
