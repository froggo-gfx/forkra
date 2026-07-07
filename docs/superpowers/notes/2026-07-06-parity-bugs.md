# 2026-07-06 — Parity bug catalog (fifth pass)

User-reported bugs from runtime testing of the skeleton integration (WS-6…WS-16 plus
the third/fourth fix passes, through commit `ace647ccb`). This document is the intake
list: each bug is recorded as reported, with whatever context can be *inferred* from
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
(skeleton-ribs.js) which *relied* on the mirroring for its symmetric split now sets
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

### 1.4 Where are default stroke widths for masters set? — `open`

**Report:** Unclear where per-master default stroke width is configured.

**Inferred context:** Skeleton data lives per layer glyph in
`customData["fontra.internal"]`; stroke width is presumably per-layer (per-master)
there, but a *default* for new contours / new masters must come from somewhere — donor
may have a font-level or source-level setting (axis-mapped?) that wasn't ported, or it
exists and is just undiscoverable. Needs donor research. Possibly documentation/UX
rather than code.

### 1.5 Generated contours (editable ribs)

#### 1.5.1 Editable ribs move freely; editable flag must ONLY enable z-tangent-drag — `open`

**Report:** Marking a rib editable currently lets its points move freely. For ribs, the
editable flag must gate *only* the z-tangent-drag — nothing else.

**Inferred context:** Third pass (E2) established donor parity as "nudge follows tangent
only when constrained" and that tangent nudge requires `point.editable[side] === true`.
The inverse constraint was apparently not enforced: the ported code lets editable rib
points take the default free-move behavior too. Donor reference:
`skeleton/src-js/views-editor/src/skeleton-edit-behavior.js` (`EditableRibBehavior`)
and the pointer tool's `constrainMode: "tangent"` / `forceTangent` handling in
`skeleton/src-js/views-editor/src/edit-tools-pointer.js`.

#### 1.5.2 Editable ribs' handles aren't mouse-selectable/movable — `open`

**Report:** The off-curve handles belonging to editable ribs can't be clicked or
dragged.

**Inferred context:** An `editableGeneratedHandle/…` selection kind exists in the ported
selection model, so the vocabulary is there — likely the scene-model hit-testing never
returns it (possibly because the fourth-pass C3 gating treats *all* generated-contour
geometry as untouchable, without carving out the editable-rib exception), or the
pointer tool doesn't map it to a drag behavior.

#### 1.5.3 Alt-drag should engage interpolation for editable ribs — currently n/a — `open`

**Report:** Alt-dragging an editable rib should switch to the interpolation behavior;
right now nothing happens.

**Inferred context:** `"rib-interpolate"` and `"rib-tangent-interpolate"` behavior names
exist in `behaviorTypes` (added in pass E2), but the pointer tool's modifier→behavior
mapping evidently never selects them for rib drags. Check how the donor picks the
behavior name from event modifiers vs. the ported `_getBehaviorName` equivalent.

### 1.6 No visualization for ribs — `open`

**Report:** Ribs have no dedicated visualization. Both distinctions must be visible:
selected vs. unselected, and editable vs. non-editable.

**Inferred context:** The third pass (E3) added `fontra.skeleton.selected-nodes` for
skeleton *points* only. The donor has rib drawing in
`skeleton/src-js/views-editor/src/skeleton-visualization-layers.js` — that part wasn't
ported (or was ported without the editable/selected state styling). New visualization
layer(s) needed, keyed off `skeletonRib/<contourId>/<pointId>/<side>` selection keys
and the rib `editable` flags.

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

### 2.1 Reverse resets the depth parameter — `open`

**Report:** Running the reverse function resets the depth parameter in the UI. The
calculation itself uses the value that was set — it just resets *afterwards*.

**Inferred context:** Letterspacer (WS-5/5.1) passed the WS-16 parity audit on engine
behavior, so this is a panel/UI state bug: the reverse action probably triggers a panel
refresh that repopulates fields from defaults instead of the current in-panel values
(or writes params back without the depth field). Purely a state-retention fix in the
letterspacer panel.

---

## Process

Per the standing directive: fix what's worth fixing in real time, write down what needs
more attention — either way, all findings land in this doc (statuses updated per item)
and/or `2026-07-05-post-ws16-review.md` for anything that turns out to be a
cross-cutting finding.
