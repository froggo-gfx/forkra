# Sidebearing Variables — Design Spec

**Date:** 2026-07-24
**Branch:** `feature/sidebearing-variables`
**Status:** design — awaiting user review before a plan is written

---

## 1. Problem

Fontra's selection-info panel already lets you type a **glyph name** into a
sidebearing field instead of a number. Typing `n` into `o`'s left sidebearing
resolves `n`'s left margin and sets `o`'s left margin to that value. `n!` uses
`n`'s **opposite** (right) margin. Arbitrary expressions work too (`n + 10`,
`(a + b) / 2`), evaluated per editing layer.

**The gap:** this is a *one-shot* evaluation. The resolved number is written and
the reference is forgotten. If you later change `n`'s sidebearing, `o` does not
follow — the link never existed after the first keystroke.

This is the industry-standard **"metrics keys"** feature (Glyphs.app `=n` /
`=|n`, RoboFont metrics linking). The fork already has the hard part — the
expression evaluator (`_evaluateMetricsExpression`,
`panel-selection-info.js:929`). What's missing is **persisting** the reference
so it can be re-evaluated.

A prior fork attempt already prototyped this: commit `0327a50dd` ("persistent
sidebearings variables") on the abandoned `test/refactor` lineage. This spec
ports that idea cleanly onto the current baseline, using the decisions below.

---

## 2. The model (decided with the user)

Two distinct moments, deliberately behaving differently:

| Moment | Behavior |
| --- | --- |
| **Creating** a link (field currently has no key; you type `n`) | **Automatic.** Parse → resolve → set the margin → store the key. One action. |
| **Refreshing** an existing link (the key already exists; `n` changed later) | **Manual.** An **"Update" button** re-resolves all of the glyph's keys and re-applies them. |

This is explicitly **not** an automatic-propagation system. Editing `n` never
reaches out and rewrites `o` on its own. There is no reverse dependency index,
no cross-glyph write during normal editing, no cycle-driven cascade, no undo
pollution from glyphs you didn't touch. The one command that *does* touch other
glyphs — **Update all metrics** (§4.3) — is an explicit, user-triggered sweep,
not a side effect of editing. The user chose the button-driven model on purpose:
predictable, cheap, and the designer stays in control of *when* metrics
propagate.

---

## 3. Data model & persistence

Stored in the shared `fontra.internal` customData section infrastructure — the
same mechanism the skeleton uses (`fontra-internal-schema.js` /
`fontra-internal-data.js`), so it round-trips through every Fontra backend into
the user's project files.

**New section constant** in `FONTRA_INTERNAL_SECTIONS`:

```js
SIDEBEARING_KEYS: "sidebearingKeys"
```

**Entity level: the glyph** (`VariableGlyph.customData`), not the layer. One key
per side describes a rule; the rule is re-evaluated per source/layer on update.
(`VariableGlyph.customData` already round-trips — cf. `fontra.glyph.locked`.)

**Shape:**

```js
glyph.customData["fontra.internal"].sidebearingKeys = {
  left:  { expression: "n" },
  right: { expression: "o!" },
}
```

- `expression` — the raw string the user typed. The **only** stored field: it is
  the source of truth for the link, replayed verbatim through the shared
  resolver (§4.7) on Update.

**No cached resolved value is persisted** (a change from the prototype, which
stored `value`). Three reasons: (a) it is redundant — the authoritative resolved
number already lives in the real per-layer margin; (b) a persisted cache is a
*third* copy that can silently disagree with both the real margin and the
live-resolved value — a data-integrity smell; (c) resolving the current glyph's
≤2 expressions on panel build is cheap (the referenced glyphs are already
`fontController`-cached). Resolving on display has a bonus: the number shown next
to the expression is the *live* referenced value, so a mismatch with the actual
margin **is** the staleness signal (see Q6) — for free, no extra machinery.

A side with no key simply has no entry. Empty `sidebearingKeys` is deleted.

**Why the real margin is still written:** because we also apply the resolved
value to the actual sidebearing, the font stays correct for any consumer that
doesn't understand keys (export, other editors). The key is *additive*
metadata, exactly like Glyphs writing both the number and the `=n`.

---

## 4. Behavior spec

### 4.1 Creating a link
1. User types an expression that parses as a metrics reference (bare glyph name,
   optionally `!`, or an expression referencing glyphs) into a sidebearing field.
2. Resolve it through the existing evaluator, per editing layer.
3. Apply the resolved margin to each layer (§5).
4. Store `{ expression, value }` under the matching side.
5. Field now shows the link (§4.5).

### 4.2 Refreshing (the Update button — current glyph)
- A single **Update** button appears in the sidebearings row **only when the
  glyph has at least one key**.
- Pressing it: for each side that has a key, re-resolve across **all the glyph's
  sources** (§4.7) and re-apply the resolved margin per layer (§5). One undo step
  (`"update sidebearings"`).
- Disabled when the glyph is locked or the font is read-only.

### 4.3 Refreshing everything (Update all)
- A font-wide **"Update all metrics"** command, exposed as an editor action
  (menu entry, shortcut-assignable) rather than a panel button, since it isn't
  scoped to the selected glyph.
- It enumerates every glyph in the font, and for each glyph that has
  `sidebearingKeys`, performs the same per-side, per-source re-resolve and
  re-apply as §4.2, skipping locked glyphs.
- **Atomic, single undo step.** This is *not* a new capability to invent: the
  metrics tool's `SidebearingEditContext` already edits many glyphs by name in
  one undo record via `recordChanges(font, …)` over `font.glyphs[name]` +
  `fontController.editFinal(change, rollback, undoLabel)`
  (`edit-tools-metrics.js:711`). That class even carries a `// TODO: move to its
  own module` note — so the plan **extracts** its multi-glyph edit orchestration
  and reuses it here rather than hand-rolling cross-glyph editing.
- Still fully manual — the user triggers it. No automatic/push behavior.
- Chain ordering (`a`←`b`, `b`←`c`) in a single pass: keys resolve from each
  reference's **current** margin, so a long chain may settle one link per pass.
  Resolve by running the pass **to a fixpoint** (bounded by glyph count; stop
  when a pass changes nothing). Cycles (§7.5) are the natural stop condition.
- Cost: a full glyph scan. Acceptable because it is explicit and infrequent; no
  reverse index or dependency graph is built — each glyph resolves only its own
  keys.

### 4.4 Clearing a link
- Typing a **plain number** into a keyed field removes that side's key (the link
  is broken; the number stands). Matches Glyphs.
- Typing a **new expression** replaces the key.

### 4.5 Display
A keyed field must show both the link (the expression) and its current resolved
number. The prototype baked them into one string — `n (80)` — and then had to
regex-strip the `(80)` back off (`stripDisplaySuffix`) every time the field was
re-read. That is fragile (an editable string carrying non-editable content) and
is avoided here.

**Preferred:** the field's editable value is the pure expression (`n`); the
resolved number is a **separate, non-editable adornment** (suffix label or
tooltip). No stripping, no parse ambiguity.

Caveat found in code: `ui-form`'s existing `displayValue` hook is wired only to
the **range-slider** widget (`ui-form.js:511`), not the `edit-number-x-y` fields
sidebearings use. So this needs a small `ui-form` addition either way — the
choice is *adornment* (recommended) vs *replacement string* (prototype). Decided
in Q7.

### 4.6 Opposite-side (`!`) semantics
Preserved from the existing evaluator: `n` → `n`'s same-side margin; `n!` →
`n`'s opposite-side margin. No new syntax invented.

### 4.7 The shared resolver (one implementation)
Creating a link (§4.1), the field's live-display resolve (§4.5), per-glyph Update
(§4.2) and Update-all (§4.3) must all go through **one** resolver, not the
prototype's two parallel copies (it duplicated the `instantiateController` loop
inside `_updateSidebearingVariables`).

Signature roughly: `resolveMetricsKey(fontController, glyphName, side,
expression, { sources }) → { [layerName]: number }`.

**Blocking detail found in code:** the existing `_evaluateMetricsExpression`
resolves only over **editing** layers (`_getEditingLocations`, which reads
`editingLayerNames`). Persistence needs **all sources** of the target glyph,
including glyphs that aren't open. The resolver is therefore a generalization of
`_evaluateMetricsExpression` parameterized by the location set — and
`_evaluateMetricsExpression` becomes a thin caller of it (editing-locations
case). This keeps one copy of the `nameCapture` → `compute` → `instantiateController`
chain.

---

## 5. Applying a margin (shared write path)

Setting a **left** margin translates the glyph body by `dx = value −
leftMargin` and adjusts `xAdvance`; setting a **right** margin adjusts only
`xAdvance` (no translate). So the skeleton-coupling concern below applies to the
**left side only**.

**There is already a canonical translate primitive — use it.** `StaticGlyph`
has `getMoveReference()` / `moveWithReference(ref, dx, dy)`
(`var-glyph.js:76,99`); the metrics **tool** already sets sidebearings through it
(`edit-tools-metrics.js:721,748`). The current panel `setValue`
(`panel-selection-info.js:268-304`) hand-rolls its own coordinate loop instead —
a duplicate that also omits anchors/guidelines/background-image that
`moveWithReference` handles. **Decision:** route every margin write — the plain
manual edit *and* the metrics-key apply — through `moveWithReference`, deleting
the panel's bespoke loop (rail R-B).

**The skeleton coupling is a real, shared bug.** `moveWithReference` moves path,
components, anchors, guidelines and background image — but **not** the skeleton
customData (`var-glyph.js:99-123`). Therefore the metrics *tool* today also
leaves the skeleton behind on a left-sidebearing drag — the bug isn't unique to
this feature; it lives in the shared primitive. The prototype patched it only in
its own private copy (`moveSkeletonData`), which would have left the tool still
broken.

**Decision:** add the skeleton move **once**, at the shared seam, so tool, panel
and metrics-key apply all get it. Two implementation options for the plan to
choose:
1. Extend `getMoveReference`/`moveWithReference` to include the skeleton section
   — cleanest for callers, but pulls skeleton-schema knowledge into foundational
   `var-glyph.js` (a layering cost).
2. A thin editor-side helper `setLeftMargin(layerGlyph, value)` =
   `moveWithReference` + a skeleton translate, keeping `var-glyph.js` ignorant of
   skeleton. Preferred on layering grounds.

Either way a small **skeleton translate** helper is needed: current-base
`skeleton-model.js` has *no* whole-skeleton move function (the donor's
`moveSkeletonData` was not ported). The plan adds one — translate every skeleton
contour point and every editable-generated offset by `(dx, dy)` — living in
`skeleton-model.js` with a mocha test (it is pure geometry, rail R-A/R-G).

> Fixing the shared primitive also repairs the pre-existing metrics-tool bug.
> That is a welcome side effect, but it widens the blast radius: the plan should
> call it out and manually test the metrics tool + skeleton, not just the panel.

---

## 6. Files touched (anticipated)

| File | Change |
| --- | --- |
| `fontra-core/src/fontra-internal-schema.js` | add `SIDEBEARING_KEYS` section constant |
| `fontra-core/src/metrics-keys.js` *(new)* | pure helpers: parse/validate an expression as a key, format for display; mocha-tested (Q5) |
| `fontra-core/src/skeleton-model.js` | add pure whole-skeleton translate helper (§5) + test |
| `fontra-core/src/var-glyph.js` *or* a helper | skeleton-aware left-margin move seam (§5, option 1 vs 2) |
| `views-editor/src/panel-selection-info.js` | key store/display, per-glyph Update button, route margin writes through the shared move, clear-on-number; generalize `_evaluateMetricsExpression` into the shared resolver (§4.7) |
| `views-editor/src/edit-tools-metrics.js` | extract `SidebearingEditContext`'s multi-glyph edit orchestration for reuse (§4.3) — it already flags `// TODO: move to its own module` |
| `views-editor/src/editor.js` | register the **Update all metrics** action (§4.3) — menu entry + shortcut |
| `fontra-core/assets/lang/en.js` | UI strings (`Update`, `Update all metrics`, tooltips) |
| `fontra-webcomponents/src/ui-form.js` | number-field display **adornment** for the resolved value (§4.5); today `displayValue` only serves the range slider |

No backend change (customData already persists).

---

## 7. Corner cases

| # | Case | Handling |
| --- | --- | --- |
| 1 | Referenced glyph deleted / missing | Keep the key, skip the update — the real margin is left untouched; surface an error state on the field rather than crashing. |
| 2 | Referenced glyph has undefined margin (empty/no outline) | Skip that side's update; real margin untouched. |
| 3 | Self-reference same side (`o`'s left ← `=o`) | No-op identity; guard against writing. |
| 4 | Self-reference opposite side (`o`'s left ← `=o!`) | Legit (symmetry); allow. |
| 5 | Cycle (`a`←`b`, `b`←`a`) | Manual model makes this harmless: each Update resolves once from the referenced glyph's *current* margin, no cascade. Update-all's fixpoint pass (§4.3) stops when nothing changes. No cycle-breaker needed. |
| 6 | Both sides keyed | Apply **left first, then right** (left translates the path and shifts the raw right margin; deterministic order required). |
| 7 | Multiple sources, referenced glyph missing a source | `instantiateController` interpolates at the source location — already handled by the evaluator. |
| 8 | Composite/component glyph | Left translate already moves components; fine. |
| 9 | Locked glyph / read-only font | Update disabled; creation blocked. |
| 10 | Plain-number edit on a keyed field | Clears that side's key (§4.4). |
| 11 | Expression references several glyphs (`(a+b)/2`) | Stored verbatim; Update replays it. No per-glyph dependency tracking needed (no push). |

---

## 8. Open questions — decisions made, with justification

**Q0 — How does the user signal "make this a persistent link" vs "evaluate once"?**
(The one I most want your call on.) Today, typing a bare glyph name does a
one-shot evaluation. If bare `n` now *always* creates a persistent key (the
prototype's behavior), the one-shot gesture is gone — every reference becomes a
link.
→ **Recommendation: require a leading `=` for a link** (`=n`, `=o!`,
`=(a+b)/2`), leaving bare `n` as the existing one-shot. Justification: it matches
Glyphs/RoboFont exactly, is self-documenting ("this field is keyed"), and
preserves both behaviors instead of trading one for the other. Cost: it adds one
character to the gesture you described ("enter the letter"). If you'd rather keep
the barer gesture, the alternative is **bare name = link, no one-shot** — simpler
but lossy. This is a genuine UX fork, hence Q0.

**Q1 — Store the raw expression, or a parsed `{glyph, side}`?**
→ **Store the raw expression string.** Justification: the evaluator already
handles full expressions; storing the string is *less* code than re-parsing to a
single ref, and it transparently supports `n + 10` and `(a+b)/2`. The prototype
stored a parsed ref and was thereby limited to single-glyph links. Cost: display
of a long expression is less tidy than `n (80)` — acceptable.

**Q2 — Store keys per glyph or per source/layer?**
→ **Per glyph** (one rule per side), re-evaluated per source on Update.
Justification: a metrics key is conceptually "this glyph's LSB is defined by
`n`" — one intent across masters. Per-source keys (Glyphs allows them) are real
but rare; YAGNI. Cost: you can't key Bold's LSB to a different glyph than
Regular's. If that need appears, promote the value to a per-source map later
without changing the section name.

**Q3 — Terminology.**
→ Internally call them **metrics keys** (industry-standard, matches Glyphs/
RoboFont, unambiguous); keep user-facing copy plain ("Update"). Justification:
"variable" collides with Fontra's variable-glyph/axis vocabulary and would
confuse. The section constant stays `sidebearingKeys`. Open to the user's
preference on any visible label.

**Q4 — Scope of the update action(s)?**
→ **Two, both manual:** a per-glyph **Update** button (the common case, O(1)),
and a font-wide **Update all metrics** command (§4.3). Justification: the user
asked for both. The per-glyph button is the everyday tool; "Update all" is the
occasional "propagate everything I've changed" sweep. Both stay user-triggered —
no automatic push — so the manual-control intent holds. "Update all" costs a
glyph scan but builds no reverse index; each glyph resolves only its own keys.
Placed as an editor action (menu/shortcut) rather than a panel button because it
isn't tied to the selection.

**Q5 — Extract parse/format helpers into core (mocha-tested) or keep in the panel?**
→ **Extract** `parseSidebearingKey` / `formatSidebearingKeyDisplay` /
`stripDisplaySuffix` into a small core module with tests. Justification:
`views-editor` has no harness (rail R-G); the parsing rules (`!` handling,
display-suffix stripping, glyph-map validation) are exactly the kind of pure
logic that regresses silently. Small, high-value test surface.

**Q6 — Should the field visually mark a *stale* key (referenced glyph changed
since last Update)?**
→ **Yes, and it comes for free** — reversing the prototype's stance now that we
resolve-on-display (§3, §4.5). Since the field shows the *live* resolved value
next to the expression, and the actual margin is visible, a divergence between
them already reads as "out of date, press Update." Justification: no extra
watcher or repaint cost — the live resolve we already do for display *is* the
indicator. A subtle visual emphasis (e.g. tinting the number when it differs
from the applied margin) is a cheap polish, optional for phase 1.

**Q7 — Display the resolved value as an adornment or as a replacement string?**
→ **Adornment** (expression stays the editable value; number shown beside it),
not the prototype's baked-in `n (80)` string. Justification: an editable field
should not carry non-editable content that must be regex-stripped on every read
(`stripDisplaySuffix`) — that is a latent parse-bug surface. Confirmed cost
either way: `ui-form`'s `displayValue` currently serves only the range slider
(`ui-form.js:511`), so the `edit-number-x-y` field needs a small addition
regardless; adornment is the cleaner shape.

---

## 9. Out of scope (explicit)

- Automatic push propagation (editing `n` rewriting `o`). Rejected by the user.
- A font-level named-variable table (a third shared entity). The reference model
  achieves the same visible result with less machinery.
- Per-source metrics keys (Q2).
- Kerning-value keys — this spec is sidebearings only.
