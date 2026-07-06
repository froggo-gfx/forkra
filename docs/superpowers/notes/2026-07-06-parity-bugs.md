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

### 1.1 Cap style selection is missing completely — `open`

**Report:** No way to select a cap style anywhere in the UI. The feature is untestable
in this state.

**Inferred context:** The skeleton parameters panel (WS-15) was ported from the donor's
raw-DOM implementation to upstream's `ui-form.js` field-descriptor idiom. The checkbox
field type was missing from `ui-form.js` until the third pass (E1) — a cap-style picker
(likely a dropdown/segmented control in the donor) may have been dropped or stubbed
during the same translation, or may require another field type that `ui-form.js` lacks.
Check donor `skeleton/src-js/views-editor/src/` panel implementation for how cap style
is presented and where the value lives in the skeleton data model.

### 1.2 Distribution slider

#### 1.2.1 Distribution doesn't persist when Linked is engaged — `open`

**Report:** With Linked engaged, the distribution slider value doesn't persist.
**This reveals an incorrect model of "linked": linked does NOT mean symmetrical — it
means an equal delta is applied to both sides.** (i.e. linked preserves the existing
left/right difference while moving both by the same amount.)

**Inferred context:** The ported panel presumably implements linked as "mirror/equalize
both sides", which would clobber an asymmetric distribution on the next edit and look
like a persistence failure. The fix is semantic (delta-based linking), not just a
storage bug. Verify against donor behavior before changing.

#### 1.2.2 Distribution doesn't update on canvas in realtime with the slider — `open`

**Report:** Canvas only reflects the distribution after the slider is released (or not
at all until some other refresh), not continuously during the drag.

**Inferred context:** Panel field changes likely commit through a single `editSkeleton`
write on change-complete rather than an incremental edit stream
(`editBegin`/`editIncremental`/`editFinal`) during slider drag. Other numeric fields
may share this; distribution is where it was noticed.

### 1.3 What even is "default caps" (panel)? — `open`

**Report:** The meaning of the "default caps" panel item is unclear.

**Inferred context:** Open question, not necessarily a bug. Needs: (a) donor semantics
(is it a font-/glyph-level fallback cap style that per-contour caps override?),
(b) whether the ported panel wired it to anything, (c) a decision on labeling/UX once
1.1 gives cap styles a working UI at all. Likely interacts with 1.1.

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

### 1.7 What happens on x-drag of the skeleton handle? — `open`

**Report:** Open question — the X modifier's effect when dragging a skeleton handle is
unknown/undefined.

**Inferred context:** D/S/X/Z modifiers are behavior names inside the rules model
(WS-13 modifier parity). X presumably maps to some donor behavior for handles;
needs a check that (a) the behavior name is registered in `behaviorTypes` (Z's
"rib-tangent" was missing until pass E2 — X may have the same gap; watch the console
for `invalid behavior name:`), and (b) what the donor semantics actually are, so the
answer can be documented.

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
