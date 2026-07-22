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

### 2.6 `skeleton-model.js` is already the operations file — so `skeleton-modifiers.js` merges too

An earlier draft kept `skeleton-modifiers.js` separate from `skeleton-model.js` on a
"state vs operations" split. **That split does not exist in the code.** `skeleton-model.js`
already exports 21 mutators:

```text
deleteSkeletonPoints          setSkeletonPointSideWidth     setSkeletonPointSideNudge
setSkeletonContourDefaultWidth setSkeletonHandleOffset      setSkeletonHandleDetached
setSkeletonPointTotalWidth    setSkeletonPointWidthDistribution
setSkeletonPointWidthLinked   setSkeletonContourSingleSided setSkeletonCapParameters
setSkeletonCornerParameters   setSkeletonSideLocked         resetSkeletonEditableRib
resetSkeletonEditableRibHandle(s)                           setSkeletonData / clearSkeletonData
```

`skeleton-modifiers.js` holds `applyFixedRibDelta` and the equalize family — the same kind of
pure operation over the same data, differing only in that they act on a delta rather than a
value. There is no boundary here to defend.

### 2.7 `skeleton-source-defaults.js` merges too — the footprint argument was wrong

An earlier draft kept it out on "distinct dependency footprint." That was checked and is
false: **`skeleton-model.js` already imports `fontra-internal-data.js` and
`fontra-internal-schema.js`** (lines 7 and 11), which were the substance of the claim. It also
already imports `utils.ts`, the source of `splitGlyphNameExtension`.

The only genuinely new import is `glyph-data.js`, for `getGlyphInfoFromGlyphName`. That file is
183 lines and is already imported by ten modules including `scene-model.js`, so pulling it in
costs nothing.

"It is config, not geometry" is also weak: both are pure functions over persisted skeleton
data, which is exactly what `skeleton-model.js` is for.

**Both 2.6 and 2.7 were my objections, and both were wrong. Corrected on evidence, on the
user's challenge.**

---

## 3. Target structure

**15 skeleton files → 9. Six deleted, none created.**

### Core — `fontra-core/src/`

| File                    | Role                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skeleton-model.js`     | Everything pure: schema, stable ids, accessors, mutators, rib projection, normals, constants, selection-key grammar for every kind, modifier math, Tunni adaptation, per-source defaults |
| `skeleton-generator.js` | Centerline → outline, forward provenance                                                                                                                                                 |

Dissolved into `skeleton-model.js`: `skeleton-modifiers.js` (§2.6),
`skeleton-source-defaults.js` (§2.7), `skeleton-tunni.js` (§4.2), and the calculation half of
`skeleton-ribs.js` / `skeleton-generated.js` (§4.5).

`skeleton-generator.js` stays out on the one boundary that is real: it is the only consumer of
`fit-cubic` and offset-curve machinery, it is the sole implementer of R-D provenance, and it
is guarded by golden-master fixtures that pin its output. Merging it would put the fork's most
heavily tested pipeline behind the fork's most-edited file.

### Editor — `views-editor/src/`

| File                              | Role                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `skeleton-editing.js`             | `editSkeleton` (R-C), target entries, executors, behavior-name mapping, cross-layer resolution, generated-contour index bookkeeping |
| `edit-tools-skeleton.js`          | Skeleton Pen tool                                                                                                                   |
| `visualization-layer-skeleton.js` | Canvas layers                                                                                                                       |

Dissolved into `skeleton-editing.js`: `skeleton-ribs.js`, `skeleton-generated.js` and
`views-editor/src/skeleton-modifiers.js` — the interaction half of each (§4.5).

Plus the four panel files, out of scope pending the UI/UX rework.

### The dividing line

**Calculation goes to `fontra-core`; interaction stays in `views-editor`.** That is the only
axis the layout needs, and it decides every case in this plan without inventing a third
category.

Applied to the rib/generated pair, it splits them by role rather than by kind:

| Half                                                      | Nature                                           | Home                  |
| --------------------------------------------------------- | ------------------------------------------------ | --------------------- |
| Key make/parse, address resolution, target iteration      | pure, total, needs no `layerGlyph` — calculation | `skeleton-model.js`   |
| Target entries, executors, behavior names, the write path | touches selection, events and change records     | `skeleton-editing.js` |

This is the same move §4.1 already makes for `parseSkeletonPointKey` and
`getSkeletonPointAddress`, generalised from the point kind to every kind. An earlier draft of
this plan proposed a new `skeleton-selection.js` for the calculation half; that was rejected —
it would have been a third category alongside calculation and interaction, justified by
nothing but the wish to keep `skeleton-editing.js` small, which §0 already rules out as a
reason.

---

## 4. Phases

Ordered by value ÷ risk. Each is independently landable.

### 4.1 Fix the divergent duplicate — **correctness, do this regardless**

Delete the three private helpers at the bottom of `fontra-core/src/skeleton-modifiers.js`
(`getSkeletonContourAddress:430`, `getSkeletonPointAddress:440`,
`parseSkeletonPointKey:458`) and keep one canonical copy in `skeleton-model.js`.

Decide the contract _first_, because the two versions disagree (§2.1): the strict version
(`null` on malformed) is the correct one — a NaN-filled address is worse than a null in every
call site. Move the length check into the canonical `parseSkeletonPointKey` and audit its
existing callers for the behaviour change.

Import direction: core must not import from `views-editor`, so the canonical pair lives in
`skeleton-model.js` and `skeleton-editing.js` imports it.

This phase stands alone even if nothing else in the plan happens. Land it first.

Risk: low. Covered by `test-skeleton-modifiers.js` and `test-skeleton-ribs.js`.

### 4.2 Dissolve `skeleton-tunni.js`

**Delete** the four pass-throughs — `calculateSkeletonTunniPoint`,
`calculateSkeletonTrueTunniPoint`, `calculateSkeletonEqualizedControlPoints`,
`areSkeletonTensionsEqualized`. Each is a one-liner; call the generic
`tunni-calculations.js` function with `segmentToTunniPoints(segment)` at the call site.

**Move to `skeleton-model.js`** — `segmentToTunniPoints`, `buildSkeletonTunniSegments`,
`calculateSkeletonControlPointsFromTunniDelta`, `calculateSkeletonOnCurveFromTunni`, and the
private helpers `makeSkeletonTunniSegment`, `collectControlEntries`, `addProjected`. They join
the equalize family arriving from `skeleton-modifiers.js` in 4.4 — same data, same purity.

**Move to `scene-model.js`** — `skeletonTunniHitTest`, folded into the existing
`skeletonTunniAtPoint`, which today is a five-line wrapper that subtracts the glyph origin and
delegates. R-A puts hit-testing in `scene-model.js` as `*AtPoint`; this removes a hop rather
than adding one.

### 4.3 Dissolve `skeleton-modifiers.js` and `skeleton-source-defaults.js` into `skeleton-model.js`

Both are pure functions over skeleton data, and the boundaries that were claimed to separate
them from `skeleton-model.js` do not exist (§2.6, §2.7). Straight moves, no restructuring:

- `skeleton-modifiers.js` → `applyFixedRibDelta`, the equalize family, and their private
  helpers. `skeleton-model.js` already exports 21 mutators; these are more of the same.
- `skeleton-source-defaults.js` → the key tables, `normalizeSkeletonSourceDefaults`,
  the get/set/resolve trio, `getSkeletonGlyphCase`,
  `getDefaultSkeletonWidthKeyForGlyphName`. Adds one new import to `skeleton-model.js`:
  `glyph-data.js`.

`test-skeleton-modifiers.js` and `test-skeleton-source-defaults.js` keep working with only
their import lines changed — the functions keep their names and signatures.

Risk: low. This is the largest volume of code moved and the least thinking required.

### 4.4 Fold `views-editor/src/skeleton-modifiers.js` into `skeleton-editing.js`

Three functions (§2.4). Behavior-name mapping is interaction, so it lands on the editor side.
Move as part of 4.5; not worth landing on its own.

### 4.5 Dissolve `skeleton-ribs.js` and `skeleton-generated.js` — **the real work**

Split each file along the calculation/interaction line, per §3:

- **To `skeleton-model.js`** — `makeSkeletonRibKey`, `parseSkeletonRibKey`,
  `getSkeletonRibAddress`, `iterSkeletonRibTargets`, the four
  `make`/`parse` editable-generated key functions, `findGeneratedPathAddress`,
  `resolveGeneratedPointProvenance`, `resolveEditableGeneratedTarget`, and the private
  assertion helpers. All pure over `skeletonData` (+ `path` for the generated kinds).
  `skeleton-ribs.js` already re-exports `getSkeletonRibPosition` from here, so rib geometry
  is partly home already.
- **To `skeleton-editing.js`** — `createSkeletonRibExecutor`,
  `applySkeletonRibExecutorResult`, `createEditableGenerated{Point,Handle}TargetEntries`,
  `createEditableGeneratedHandleExecutor`, `toggleEditableGeneratedHandleDetached`,
  `getSkeletonRibBehaviorName`, and the 4.4 functions. These rejoin
  `createSkeletonRibTargetEntries`, which is already there (§2.3).

The point is **not** concatenation. The six roles in §2.3 exist twice; after the move they
must collapse into one descriptor per kind —

```
{ kind, keyArity, parseKey, makeKey, resolveAddress, behaviorName }
```

— with the generic code driven off that table. If they will not (see §7.4), stop: two
implementations sharing a file is strictly worse than two implementations in two files, and
the honest outcome is to land 4.1–4.4 only.

Constraint: this must not reintroduce kind-branching into `makeChangeForDelta` or below
(R-E). The table is consumed at target-entry _construction_ time; the emit path stays kind-blind.

Watch the import direction: `skeleton-model.js` is core and must not import from
`views-editor`. The calculation half has to be genuinely free of editor imports, or it does
not belong there — that is the test for whether this split is real.

Risk: highest in the plan. It touches the one write path and eight importers. Do it last,
and only after 4.1–4.4 have landed and settled.

---

## 5. Verification

Per phase, in order:

1. `cd src-js/fontra-core && npm test` — 1394 baseline. Phases 4.1, 4.3 and 4.5 are
   genuinely covered here (§2.2). 4.2 keeps its coverage only if `test-skeleton-tunni.js`
   follows the code it tests. **The test count must not drop at any phase** — that is the
   check that a move did not quietly shed coverage.
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
6. Manual matrix for 4.2 and 4.5 — rib drag, generated point/handle drag, detach, Tunni
   drag on both path and skeleton segments, marquee over mixed selections.

A green bundle is not evidence that an interaction works.

---

## 6. Explicitly not doing

| Item                                            | Why                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel files                                     | Out of scope — UI/UX rework is coming                                                                                                                         |
| Splitting `skeleton-generator.js`               | Separate decision. It is one coherent pipeline (94 functions, 8 exported) and has the best test coverage in the fork — but size alone is not a reason, per §0 |
| Moving core tests out of `views-editor` imports | §2.2 is load-bearing coverage; removing it would lose real tests                                                                                              |
| Creating any new file                           | The calculation/interaction axis (§3) places every symbol in a file that already exists. A new file would need a third category, and none is justified        |

---

## 7. Risks

1. **4.1 changes a contract.** The strict/lenient `parseSkeletonPointKey` divergence means
   picking a winner changes behaviour for at least one existing caller. Audit before, not after.
2. **4.5 touches R-C.** Every skeleton write goes through `editSkeleton`. A mistake here is
   not local.
3. **Editor-side coverage is partial.** §2.2 is better than expected but far from complete —
   the Pen tool, visualization layers and pointer dispatch remain manual-only.
4. **The table in 4.5 may not exist.** Rib addresses need only `skeletonData`; generated
   addresses need the `path` and provenance. If the two cannot be expressed as one descriptor
   without a discriminated union that is really two code paths wearing one name, stop — merge
   them into `skeleton-editing.js` as two honest implementations and skip the table.
5. **`skeleton-model.js` becomes the fork's second-largest file.** Accepted per §0: one
   coherent job (everything pure about a skeleton) beats five files that must be read
   together. Revisit only if a genuine second concern appears inside it — not on size.
