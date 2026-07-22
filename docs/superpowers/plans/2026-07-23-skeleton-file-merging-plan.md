# Skeleton file merging plan

**Date:** 2026-07-23
**Branch:** `refactor-simple/ws17-parity-bugs`
**Scope:** the skeleton module layout only. Panels are **out of scope** — the whole UI/UX
side is slated for rework, so `panel-skeleton-parameters.js`, `skeleton-panel-edits.js`,
`skeleton-panel-model.js` and `panel-skeleton-defaults.js` are untouched here.

Companion: `FEATURE-ARCHITECTURE-MAP.md` §F7 (where things are today).

---

## 0. The criterion

**Not line count.** File size was a useful proxy back when functionality was dumped into
whatever native file was nearest. It stopped being informative once the architecture took
shape — a large file with one coherent job is fine, and preferable to five small files that
must be read together to understand one operation.

The criterion used throughout this plan:

> A file earns its own existence by having a **distinct dependency footprint** or a
> **distinct role in the pipeline** — not by naming a concept, and not by being about a
> particular selection kind.

Everything below follows from applying that test, plus the rails in the roadmap (R-A layer
placement, R-B one copy of every symbol, R-C one write path, R-E no kind-branching in shared
emit code).

---

## 1. What was verified

All findings below are from reading the tree on 2026-07-23, not from planning docs.

- Export/function inventories per file (`grep '^export '`, `'^function '`).
- Importer graph for every skeleton module.
- Side-by-side diff of the suspected duplicate helpers.

Two findings changed the plan materially; they are in §2.

---

## 2. Findings

### 2.1 `fontra-core/src/skeleton-modifiers.js` duplicates `skeleton-editing.js`, divergently

It carries **private copies** of helpers that `skeleton-editing.js` already exports:

| Symbol                      | core/skeleton-modifiers.js | views-editor/skeleton-editing.js |
| --------------------------- | -------------------------- | -------------------------------- |
| `parseSkeletonPointKey`     | `:458` (private)           | `:40` (exported)                 |
| `getSkeletonPointAddress`   | `:440` (private)           | `:50` (exported)                 |
| `getSkeletonContourAddress` | `:430` (private)           | —                                |

They are **not** the same function:

```text
core/skeleton-modifiers.js:458        views-editor/skeleton-editing.js:40
------------------------------        -----------------------------------
if (parts.length !== 2) {             (no length check)
  return null;                        returns { contourId: NaN, pointId: NaN }
}
```

Same name, same purpose, different contract on malformed input. This is a live R-B violation
and a latent correctness bug, not a tidiness complaint. **It is the only item in this plan
that is worth doing on correctness grounds alone.**

### 2.2 The core test suite already imports from `views-editor`

`fontra-core/tests/test-skeleton-ribs.js` and `test-skeleton-modifiers.js` reach across the
package boundary by relative path:

```js
import { editSkeleton } from "../../views-editor/src/skeleton-editing.js";
import { findGeneratedPathAddress } from "../../views-editor/src/skeleton-generated.js";
import { computeRibDetachConversions } from "../../views-editor/src/skeleton-panel-edits.js";
import { EditBehaviorFactory } from "../../views-editor/src/edit-behavior.js";
```

Consequences for this plan:

1. `skeleton-editing.js`, `skeleton-generated.js`, `skeleton-ribs.js` **are already under
   mocha coverage**. The merges below are verifiable by `npm test`, not only by hand.
2. The core/editor boundary is already porous. "It must live in core to be testable" is not
   a real constraint for these files — which removes the main argument for the current split.

This does not license moving DOM-touching code into core. It does mean the split between
`fontra-core/src/skeleton-modifiers.js` and `views-editor/src/skeleton-editing.js` buys
nothing that it is currently claimed to buy.

### 2.3 `skeleton-ribs.js` and `skeleton-generated.js` are the same file twice

They are split by **selection kind**, not by role. Every row exists in both:

| Role            | `skeleton-ribs.js`           | `skeleton-generated.js`                              |
| --------------- | ---------------------------- | ---------------------------------------------------- |
| make key        | `makeSkeletonRibKey`         | `makeEditableGeneratedPointKey` / `…HandleKey`       |
| parse key       | `parseSkeletonRibKey`        | `parseEditableGeneratedPointKey` / `…HandleKey`      |
| resolve address | `getSkeletonRibAddress`      | `findGeneratedPathAddress`                           |
| iterate targets | `iterSkeletonRibTargets`     | `resolveEditableGeneratedTarget`                     |
| target entries  | _(in `skeleton-editing.js`)_ | `createEditableGenerated{Point,Handle}TargetEntries` |
| executor        | `createSkeletonRibExecutor`  | `createEditableGeneratedHandleExecutor`              |
| behavior name   | `getSkeletonRibBehaviorName` | _(in `views-editor/skeleton-modifiers.js`)_          |

Note the two italic cells: the rib **target entries** already live in `skeleton-editing.js`
(`createSkeletonRibTargetEntries:670`) while the rib **executor** lives in `skeleton-ribs.js`,
and the generated **behavior name** lives in a third file. The current boundaries cut through
the middle of single operations.

`skeleton-generated.js` also imports _from_ `skeleton-editing.js`, so the split runs against
its own dependency direction.

### 2.4 `views-editor/src/skeleton-modifiers.js` is three functions

`getSkeletonModifierBehaviorName`, `getSelectionTargetKinds`, `makeSkeletonModifierOptions`.
Its only import is `parseSelection`. It is the kind→behavior-name mapping described by R-F,
separated from both the kinds it maps and the behaviors it names.

### 2.5 `skeleton-tunni.js` is half adapter, half pass-through

Four of nine exports are one-liners onto `tunni-calculations.js`:

```js
export function calculateSkeletonTunniPoint(segment) {
  return calculateControlHandlePoint(segmentToTunniPoints(segment));
}
```

`calculateSkeletonTrueTunniPoint`, `calculateSkeletonEqualizedControlPoints` and
`areSkeletonTensionsEqualized` have the same shape. The remaining exports —
`buildSkeletonTunniSegments`, `skeletonTunniHitTest`,
`calculateSkeletonControlPointsFromTunniDelta`, `calculateSkeletonOnCurveFromTunni`,
`segmentToTunniPoints` — are genuine adaptation between the skeleton contour representation
and generic cubic segments.

### 2.6 `skeleton-source-defaults.js` passes the criterion — **do not merge**

It is the only file in the set with a different dependency footprint:
`fontra-internal-data.js`, `fontra-internal-schema.js`, `glyph-data.js`,
`splitGlyphNameExtension`. Everything else here imports `skeleton-model.js` and little more.

It is also not skeleton geometry — it is per-source configuration that happens to be keyed by
skeleton parameter names, with glyph-case resolution on top. Folding it into
`skeleton-model.js` would drag persistence and glyph-name parsing into the geometry core.

**Verdict: keep as is.** Listed here so the decision is recorded and not revisited.

---

## 3. Target structure

### Core — `fontra-core/src/`

| File                          | Role                                                              | Change           |
| ----------------------------- | ----------------------------------------------------------------- | ---------------- |
| `skeleton-model.js`           | Schema, stable ids, accessors, rib projection, normals, constants | unchanged        |
| `skeleton-generator.js`       | Centerline → outline, forward provenance                          | unchanged        |
| `skeleton-modifiers.js`       | Pure operations on the model: fixed-rib, equalize family          | **dedup** (§4.1) |
| `skeleton-tunni.js`           | Adapter: skeleton contours ↔ generic cubic segments               | **slim** (§4.2)  |
| `skeleton-source-defaults.js` | Per-source config + glyph-case resolution                         | unchanged (§2.6) |

`skeleton-model.js` stays separate from `skeleton-modifiers.js` on a state-vs-operations
split. That is a real role distinction and it survives the criterion.

### Editor — `views-editor/src/`

Two files instead of four, split by **role** rather than by kind:

| File                    | Role                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skeleton-selection.js` | **NEW.** The complete selection-kind grammar: key make/parse, address resolution, target iteration, kind→behavior-name mapping — for _every_ kind, in one table |
| `skeleton-editing.js`   | `editSkeleton` (R-C), target entries, executors, cross-layer resolution, generated-contour index bookkeeping                                                    |

Unchanged: `edit-tools-skeleton.js` (the Pen tool), `visualization-layer-skeleton.js`.

Why this split and not one merged file: "what is this selection key and what does it point
at" is a genuinely different job from "mutate the skeleton and emit a change." The first is
pure, total, and needs no `layerGlyph`; the second owns the write path. Keeping them apart
keeps R-C legible — there is one file you must go through to write, and it stays the one file
that talks about writes.

Why this split and not the current one: the current boundary is _kind_ (rib vs generated),
which forces the same six roles to be implemented twice and cuts operations in half across
files (§2.3).

---

## 4. Phases

Ordered by value ÷ risk. Each is independently landable.

### 4.1 Dedup the core modifier helpers — **correctness**

Delete the three private helpers at the bottom of `fontra-core/src/skeleton-modifiers.js`
(`getSkeletonContourAddress:430`, `getSkeletonPointAddress:440`,
`parseSkeletonPointKey:458`). Import the canonical ones instead.

Decide the contract _first_, because the two versions disagree (§2.1): the strict version
(`null` on malformed) is the correct one — a NaN-filled address is worse than a null in every
call site. Move the length check into the canonical `parseSkeletonPointKey` and audit its
existing callers for the behaviour change.

Import direction: core must not import from `views-editor`. So the canonical pair moves
**down** into `skeleton-model.js` (they are pure functions over `skeletonData` — they belong
there anyway), and both `skeleton-modifiers.js` and `skeleton-editing.js` import from it.

Risk: low. Covered by `test-skeleton-modifiers.js` and `test-skeleton-ribs.js`.

### 4.2 Drop the `skeleton-tunni.js` pass-throughs — pure deletion

Remove `calculateSkeletonTunniPoint`, `calculateSkeletonTrueTunniPoint`,
`calculateSkeletonEqualizedControlPoints`, `areSkeletonTensionsEqualized`. Call the generic
`tunni-calculations.js` function with `segmentToTunniPoints(segment)` at each call site.

Importers to update: `scene-model.js`, `tunni-interactions.js`,
`visualization-layer-skeleton.js`, `test-skeleton-tunni.js`.

Risk: low, but it is the one phase where the call sites are in _untested_ editor code.
Every touched site needs eyes.

### 4.3 Fold `views-editor/src/skeleton-modifiers.js` into `skeleton-selection.js`

Three functions (§2.4), moved as part of creating the new file in 4.4. Not worth landing
on its own.

### 4.4 Unify rib + generated behind one kind table — **the real work**

Create `skeleton-selection.js`. Move in, from `skeleton-ribs.js` and `skeleton-generated.js`:
all key make/parse, all address resolution, target iteration, and the behavior-name mapping
from 4.3.

The point is **not** concatenation. If the six roles in §2.3 do not collapse into one
descriptor per kind —

```
{ kind, keyArity, parseKey, makeKey, resolveAddress, behaviorName }
```

— with the generic code driven off that table, then this phase has failed and should be
reverted. Two implementations in one file is strictly worse than two implementations in two
files.

Executors and target-entry construction move to `skeleton-editing.js`, rejoining
`createSkeletonRibTargetEntries` which is already there.

Constraint: this must not reintroduce kind-branching into `makeChangeForDelta` or below
(R-E). The table is consumed at target-entry _construction_ time; the emit path stays kind-blind.

Risk: highest in the plan. It touches the one write path and eight importers. Do it last,
and only after 4.1–4.3 have landed and settled.

---

## 5. Verification

Per phase, in order:

1. `cd src-js/fontra-core && npm test` — 1394 baseline. Phases 4.1 and 4.4 are genuinely
   covered here (§2.2); 4.2 is only partly.
2. `node --check` on every touched editor file.
3. **Direct instantiation check** for anything touching `scene-model.js`:
   ```
   node --input-type=module -e "import { SceneModel } from './src/scene-model.js'; …"
   ```
   `node --check` only parses and webpack does not resolve method names — a call to a
   method that does not exist passes both. This is not hypothetical: it shipped in
   `045db86b6` and was caught only by the user (fixed in `c1d32180f`).
4. `npx prettier --write` on touched files.
5. `npm run bundle` green.
6. Manual matrix for 4.2 and 4.4 — rib drag, generated point/handle drag, detach, Tunni
   drag on both path and skeleton segments, marquee over mixed selections.

A green bundle is not evidence that an interaction works.

---

## 6. Explicitly not doing

| Item                                                  | Why                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel files                                           | Out of scope — UI/UX rework is coming                                                                                                                         |
| `skeleton-source-defaults.js`                         | Distinct dependency footprint, distinct concern (§2.6)                                                                                                        |
| Splitting `skeleton-generator.js`                     | Separate decision. It is one coherent pipeline (94 functions, 8 exported) and has the best test coverage in the fork — but size alone is not a reason, per §0 |
| Merging `skeleton-model.js` + `skeleton-modifiers.js` | State vs operations is a real role split                                                                                                                      |
| Moving core tests out of `views-editor` imports       | §2.2 is load-bearing coverage; removing it would lose real tests                                                                                              |

---

## 7. Risks

1. **4.1 changes a contract.** The strict/lenient `parseSkeletonPointKey` divergence means
   picking a winner changes behaviour for at least one existing caller. Audit before, not after.
2. **4.4 touches R-C.** Every skeleton write goes through `editSkeleton`. A mistake here is
   not local.
3. **Editor-side coverage is partial.** §2.2 is better than expected but far from complete —
   the Pen tool, visualization layers and pointer dispatch remain manual-only.
4. **The table in 4.4 may not exist.** Rib addresses need only `skeletonData`; generated
   addresses need the `path` and provenance. If the two cannot be expressed as one descriptor
   without a discriminated union that is really two code paths wearing one name, stop — the
   current split is then the honest one, and only 4.1–4.3 should land.
