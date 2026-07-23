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
| **Creating** a link (you type `=n`) | **Automatic.** Parse → resolve → set the margin → store the key. One action. |
| **Refreshing** an existing link (`n` changed later) | **Manual.** An **"Update" button** re-resolves the source's keys and re-applies them. |

A link is signalled by a leading **`=`** (`=n`, `=o!`, `=(a+b)/2`), matching
Glyphs/RoboFont. A bare glyph name (no `=`) keeps its current **one-shot**
behavior — evaluate once, store nothing. So the two intents are distinct and
both survive.

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

**Entity level: the source (layer), not the glyph.** A key is stored on the
layer's `StaticGlyph.customData` — exactly where the skeleton lives. Each source
carries its own key per side, so `o`'s LSB can be keyed to `n` in Regular and to
something else (or nothing) in Bold. This is a deliberate reversal of an earlier
draft: metrics relationships genuinely differ per master, so the key is
per-source, not one glyph-wide rule.

**Shape** (on each layer that has a key):

```js
layerGlyph.customData["fontra.internal"].sidebearingKeys = {
  left:  { expression: "n" },    // note: expression is stored WITHOUT the leading '='
  right: { expression: "o!" },
}
```

- `expression` — the reference the user typed, `=` stripped, stored raw (`n`,
  `o!`, `(a+b)/2`). The **only** stored field, and the source of truth for the
  link; replayed through the shared resolver (§4.7) on Update.

**No cached resolved value is persisted** (a change from the prototype, which
stored `value`). Three reasons: (a) it is redundant — the authoritative resolved
number already lives in the real per-source margin; (b) a persisted cache is a
*third* copy that can silently disagree with both the real margin and the
live-resolved value — a data-integrity smell; (c) resolving the current source's
≤2 expressions on panel build is cheap (referenced glyphs are already
`fontController`-cached). Resolving on display is also what powers the staleness
highlight (§4.8): live-resolved value vs. applied margin, no extra machinery.

A side with no key has no entry. An empty `sidebearingKeys` object is deleted,
and so is an empty `fontra.internal` — no residue in clean glyphs.

**Why the real margin is still written:** because we also apply the resolved
value to the actual sidebearing, the font stays correct for any consumer that
doesn't understand keys (export, other editors). The key is *additive*
metadata, exactly like Glyphs writing both the number and the `=n`.

---

## 4. Behavior spec

### 4.1 Creating a link
1. User types `=` + a metrics reference (`=n`, `=o!`, `=(a+b)/2`) into a
   sidebearing field.
2. Resolve it (§4.7) for each **currently-edited source**, at that source's
   location.
3. Apply the resolved margin to each edited source (§5).
4. Store `{ expression }` (the `=`-stripped string) under the matching side, on
   **each edited source's** layer customData.
5. Field now shows the link (§4.5).

A bare reference without `=` runs the existing one-shot evaluation and stores
nothing.

### 4.2 Refreshing (the Update button — current glyph)
- A single **Update** button appears in the sidebearings row **only when the
  glyph has at least one keyed source**. Single press (it is idempotent and
  non-destructive — no confirm needed).
- Pressing it: for **every source** of the glyph that has a key, re-resolve at
  that source's location (§4.7) and re-apply (§5). One undo step
  (`"update sidebearings"`).
- Disabled when the glyph is locked or the font is read-only.

### 4.3 Refreshing everything (Update all — two-press)
- A font-wide **"Update all metrics"** command, exposed as an editor action
  (menu entry, shortcut-assignable) rather than a panel button, since it isn't
  scoped to the selected glyph.
- **Two-press confirm** (per the user): because it rewrites margins across the
  whole font, the first invocation arms and asks for confirmation; the second
  within a short window executes. (A menu action confirms via a dialog rather
  than the icon-swap used by in-panel buttons.)
- It enumerates every glyph, and for each **source** carrying a key, performs the
  same per-source re-resolve and re-apply as §4.2, skipping locked glyphs.
- **Atomic, single undo step.** Editing many glyphs by name in one undo record is
  an existing capability in the codebase (font-level `recordChanges` +
  `fontController.editFinal`). The plan reuses that mechanism.
- Still fully manual. No automatic/push behavior.
- Chain ordering (`a`←`b`, `b`←`c`) in a single pass: keys resolve from each
  reference's **current** margin, so a long chain may settle one link per pass.
  Run the pass **to a fixpoint** (bounded by glyph count; stop when a pass
  changes nothing). Cycles (§7.5) are the natural stop condition.
- Cost: a full glyph scan. Acceptable because it is explicit and infrequent; no
  reverse index is built — each source resolves only its own keys.

### 4.4 Clearing / unlinking
Two ways, matching the two mental models:
- **Type a plain number** into a keyed field → breaks that side's link on the
  edited source(s); the number stands. (Typing a new `=…` replaces the key.)
- **Unlink button — two-press.** A small unlink icon on a keyed field, using the
  established armed-state pattern (`panel-skeleton-defaults.js:194-217`: first
  click swaps the icon and arms, second click executes). It removes the key from
  the edited source(s) while **leaving the current margin value in place** — you
  keep the number, you just drop the dependency. This is the discoverable
  counterpart to the type-a-number gesture.

### 4.5 Display
A keyed field must show both the link (the expression) and its current resolved
number. The prototype baked them into one string — `n (80)` — and then had to
regex-strip the `(80)` back off (`stripDisplaySuffix`) every time the field was
re-read. That is fragile (an editable string carrying non-editable content) and
is avoided here.

The field's editable value is the pure expression shown with its `=` (`=n`); the
resolved number is a **separate, non-editable adornment** (suffix label or
tooltip). No stripping, no parse ambiguity.

Implementation note: `ui-form`'s existing `displayValue` hook is wired only to
the **range-slider** widget (`ui-form.js:511`), not the `edit-number-x-y` fields
sidebearings use — so a small `ui-form` addition is needed to carry the
adornment on the number field.

### 4.6 Opposite-side (`!`) semantics
Preserved from the existing evaluator: `=n` → `n`'s same-side margin; `=n!` →
`n`'s opposite-side margin. No new syntax invented beyond the `=` prefix.

### 4.7 The shared resolver (one implementation)
Creating a link (§4.1), the live-display resolve (§4.5 / §4.8), per-glyph Update
(§4.2) and Update-all (§4.3) all go through **one** resolver — not the
prototype's two parallel copies (it duplicated the `instantiateController` loop).

It resolves **one source's** expression **at that source's location**: the
referenced glyph is instantiated at the same location, so a Bold key reads the
referenced glyph's Bold margin. Signature roughly:
`resolveMetricsKey(fontController, expression, side, location) → number`.

**Detail found in code:** the existing `_evaluateMetricsExpression` resolves only
over **editing** layers (`_getEditingLocations`). This feature must also resolve
for sources that aren't open (Update, Update-all). So the shared resolver is a
generalization parameterized by an explicit location, and
`_evaluateMetricsExpression` becomes a thin caller of it. One copy of the
`nameCapture` → `compute` → `instantiateController` chain.

### 4.8 Staleness highlight
When a referenced glyph's sidebearing has changed but Update has not been pressed,
the keyed field is **visually marked stale**. Mechanism (no new watchers): on
panel build, for each keyed side of the current source, the resolver produces the
*live* value; compare it to the source's *applied* margin. If they differ beyond
a rounding epsilon, render the field in a stale style (e.g. a warning tint /
marker on the number). Pressing Update clears it by definition. This is the
signal that tells the user *when* the manual Update is worth pressing.

---

## 5. Applying a margin

Once a key resolves to a number, applying it to a side **is just setting that
sidebearing** — the exact operation the field's existing `setValue` already
performs (`panel-selection-info.js:268-304`). The feature reuses that path; it
does not reimplement margin geometry.

This spec takes no position on how margin-setting works internally, and does not
touch anything outside the link layer (no metrics-tool changes, no skeleton-move
work — those are pre-existing concerns unrelated to this feature). The only
requirement: **create, per-glyph Update, and Update-all must all funnel through
one apply-margin call**, so the "how" lives in a single place regardless of what
that place does today.

Note: setting the left margin repositions the glyph, which shifts what the right
margin means. When both sides are keyed, apply **left before right** so the
result is deterministic.

---

## 6. Files touched (anticipated)

| File | Change |
| --- | --- |
| `fontra-core/src/fontra-internal-schema.js` | add `SIDEBEARING_KEYS` section constant |
| `fontra-core/src/metrics-keys.js` *(new)* | pure helpers: parse/validate an expression as a key, format for display; mocha-tested (Q5) |
| `views-editor/src/panel-selection-info.js` | per-source key store on layer customData; display + staleness style (§4.8); per-glyph Update button; two-press unlink button (§4.4); clear-on-number; generalize `_evaluateMetricsExpression` into the shared resolver (§4.7) |
| `views-editor/src/editor.js` | register the **Update all metrics** action (§4.3) — menu entry + shortcut + confirm |
| `fontra-core/assets/lang/en.js` | UI strings (`Update`, unlink tooltip + confirm, `Update all metrics` + confirm) |
| `fontra-webcomponents/src/ui-form.js` | number-field display **adornment** for the resolved value + a stale style hook (§4.5, §4.8); today `displayValue` only serves the range slider |

No backend change (customData already persists). The feature is a link layer on
top of the existing margin-setting path — it changes no margin geometry and no
other tool.

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
| 7 | Referenced glyph has no source at this location | `instantiateController` interpolates the referenced glyph at the source's location — already handled by the resolver. |
| 8 | Composite/component glyph | Reuses the existing margin-set path, which already handles components. |
| 9 | Locked glyph / read-only font | Update, Update-all (per glyph) and creation all skip/block. |
| 10 | Plain-number edit, or unlink button, on a keyed field | Removes that side's key on the edited source(s), keeps the number (§4.4). |
| 11 | Expression references several glyphs (`=(a+b)/2`) | Stored verbatim; Update replays it. No dependency tracking needed (no push). |
| 12 | Editing several sources at once, with different keys per side | The field shows a **mixed** state (as margins already do for multi-source edits); Update/unlink act per source on each edited layer. |
| 13 | A source is keyed, another source of the same glyph is not | Fine — keys are per-source. Update touches only keyed sources; unkeyed sources' margins are left as-is. |

---

## 8. Open questions — decisions made, with justification

**Q0 — Link vs one-shot signal? — RESOLVED (user): `=` prefix.**
`=n` creates a persistent link; a bare `n` keeps the existing one-shot
evaluation. Matches Glyphs/RoboFont, self-documenting, preserves both behaviors.

**Q1 — Store the raw expression, or a parsed `{glyph, side}`?**
→ **Store the raw expression string** (`=`-stripped). Justification: the resolver
already handles full expressions; storing the string is *less* code than
re-parsing to a single ref, and it transparently supports `=(a+b)/2`. The
prototype stored a parsed ref and was thereby limited to single-glyph links.

**Q2 — Store keys per glyph or per source? — RESOLVED (user): per source.**
Keys live on the layer's `StaticGlyph.customData` (where the skeleton lives), so
each master can key a side independently — different variables for different
sources. This reverses the earlier glyph-wide draft. The resolver evaluates each
source's expression at that source's own location.

**Q3 — Terminology.**
→ Internally call them **metrics keys** (industry-standard, matches Glyphs/
RoboFont, unambiguous); keep user-facing copy plain ("Update"). Justification:
"variable" collides with Fontra's variable-glyph/axis vocabulary and would
confuse. The section constant stays `sidebearingKeys`. Open to the user's
preference on any visible label.

**Q4 — Scope of the update action(s)? — RESOLVED (user).**
Three controls, all manual: per-glyph **Update** (single press, idempotent);
**Unlink** (two-press, §4.4); **Update all metrics** (two-press, §4.3). No
automatic push. "Update all" is an editor action (menu/shortcut) since it isn't
tied to the selection; the others live on the field/row.

**Q5 — Extract parse/format helpers into core (mocha-tested) or keep in the panel?**
→ **Extract** `parseMetricsKey` (handles the `=` prefix, `!`, glyph-map
validation) and `formatMetricsKeyDisplay` into a small core module with tests.
Justification: `views-editor` has no harness (rail R-G); this parse logic is
exactly what regresses silently. (No `stripDisplaySuffix` needed — the adornment
approach in Q7 removes the strip-on-read problem entirely.)

**Q6 — Mark a stale key? — RESOLVED (user): yes, required (§4.8).**
When a referenced sidebearing has changed but Update hasn't run, the field is
styled stale. It comes cheap: the live resolve done for display, compared against
the applied margin, *is* the staleness test — no watcher, no extra machinery.

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
- Kerning-value keys — this spec is sidebearings only.
- Any change to margin geometry, the metrics tool, or skeleton-move behavior —
  pre-existing concerns, not part of this link layer.
