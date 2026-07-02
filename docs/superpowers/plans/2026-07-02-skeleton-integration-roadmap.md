# Skeleton Integration Roadmap

Date: 2026-07-02
Status: Proposed
Scope: Full parity with the donor's skeleton feature set
Donor: `./skeleton/` (read-only checkout of forka-detach @ `ref/cleanup`, commit `d8d82b442`)

This is a roadmap, not an implementation plan. Each workstream below gets its
own detailed plan (`docs/superpowers/plans/YYYY-MM-DD-wsN-*.md`) when its turn
comes, written against the code as it exists at that moment.

---

## 1. What this is about

forkra is a clean, upstream-shaped Fontra fork. A previous fork (the "donor",
checked out read-only at `./skeleton/`) contains a large, working feature
called **skeleton functionality**, plus Tunni points and other extensions.
Tunni, measure, letterspacer, and other pieces have already been ported to
forkra in workstreams WS-1 through WS-5.1. Skeleton is the last and largest
piece.

We are deliberately **not** merging the donor's skeleton code. It works, but
its architecture accreted over many refactors and carries structural problems
(section 3). Instead we re-integrate the feature from scratch on forkra,
reusing the donor's proven geometry math but redesigning the plumbing around
four architectural concepts (section 4). The donor serves as the behavioral
reference: for every interaction, "what should happen" is defined as "what the
donor does."

## 2. What the skeleton feature is (user's view)

A **skeleton** is a set of center-line contours the designer draws inside a
glyph. Each skeleton contour automatically generates a closed outline around
itself — like a calligraphic stroke around a pen path. The designer edits the
center-line and stroke widths; the app generates the actual glyph outline.

Everything the donor supports, and which "full parity" means here:

- **Skeleton contours**: open or closed, cubic curves, on-curve and off-curve
  points, sharp/smooth points — drawn and edited like normal path contours,
  with a dedicated drawing tool (analog of the pen tool).
- **Widths ("ribs")**: every on-curve skeleton point has a left and a right
  half-width. On screen these appear as draggable "rib" endpoints on either
  side of the point. Widths can be linked (drag one side, both move) or
  independent. Each point can also be **nudged** sideways (offset along the
  rib tangent). Contours have a default width; a contour can be
  **single-sided** (the outline is generated only on one side of the
  skeleton).
- **Generated contours**: the closed outlines computed from the skeleton.
  They are written into the glyph's real path, so exports, interpolation and
  every other tool see ordinary outlines.
- **Editable generated points**: individual generated on-curve points can be
  marked "editable"; dragging one adjusts the underlying width/nudge.
  Generated off-curve handles can likewise be dragged, storing per-handle
  offsets from their computed position (including a "detached" mode).
- **Editing modifiers** (during drag or arrow-key nudge):
  - Shift — constrain to horizontal/vertical/diagonal; 10× for nudges
  - Alt — alternate point behavior; interpolation variant on ribs
  - X — equalize opposite handle lengths
  - Z — constrain rib edits to the tangent direction
  - D — "fixed rib" mode (skeleton point moves without changing rib geometry)
  - S — "fixed rib compress" variant
- **Tunni points** on skeleton segments (curve-tension handles between two
  control points), same as the regular-path Tunni already ported in WS-4.
- **Measure mode** readouts for rib widths and handle tension near skeleton
  geometry (extends WS-2/WS-4.5 measure work).
- **Skeleton parameters panel**: numeric editing of widths, nudges, flags,
  defaults — a sidebar panel, plus per-source defaults
  (donor: `skeleton-source-defaults.js`).
- **Cross-feature hooks**: transformation panel transforms skeletons; the
  letterspacer moves skeleton data when sidebearings change (this coupling was
  deliberately stripped in WS-5 and gets restored at the end); selection info,
  smooth-toggle, undo/redo, incremental sync and multi-layer editing all work
  on skeleton edits exactly as on path edits.

## 3. Why not merge the donor (the problems)

These are the donor's structural defects, established by direct code audit.
Every one of them shapes a decision in section 4.

**P1 — Derived data with no reliable link to its source.** Generated contours
live in the glyph path, but the record of *which* path contours are generated
(`generatedContourIndices`) can drift when other contours are added/removed —
so the donor has a "recovery" routine that re-identifies generated contours
by comparing geometry. Worse, mapping a clicked generated point back to its
skeleton source is done by inverse projection with a 1.5-unit tolerance
(`getEditableGeneratedHandleInfoForPoint`). Geometry matching as a substitute
for bookkeeping is the donor's deepest flaw and its most insidious bug class
(selection landing on the wrong point, "drag feels off").

**P2 — Too many object kinds for too few concepts.** The donor has five
skeleton selection kinds (`skeletonPoint`, `skeletonHandle`,
`skeletonRibPoint`, `editableGeneratedPoint`, `editableGeneratedHandle`),
each with its own parser, executor factory and transform-application shim.
Analysis shows they reduce to about three actual edit semantics; two of the
kinds exist only because selection stores *path* point indices that must be
reverse-mapped to skeleton coordinates (see P1).

**P3 — Multiple write paths.** Skeleton mutations happen from the drag/nudge
pipeline, from the smooth-toggle, from transforms, and from a 7,250-line
parameters panel that calls the persistence primitives directly 36 times.
There is no single choke point, so invariants (regeneration, index
bookkeeping, undo shape) are re-implemented and drift apart.

**P4 — Duplicated geometry.** `projectRibPoint` (the function that computes a
rib endpoint) exists twice — once in the generator, once in the editor — and
`DEFAULT_SKELETON_WIDTH = 80` is copy-pasted in five files. If copies drift,
the generated outline and the editing targets disagree.

**P5 — Features bolted on outside the behavior model.** The X-equalize
feature bypasses the behavior-rules system as a special flag with its own
branch in the change pipeline and its own state machine. It regressed five
times during the donor's refactor. Interpolation, done the right way (as a
rules-table behavior), never regressed.

**P6 — File bloat.** Donor `edit-behavior.js` is 4,785 lines (upstream:
1,297), `edit-tools-pointer.js` 3,844 (upstream: 857), the parameters panel
7,250. forkra's whole point is staying upstream-shaped.

## 4. Target architecture (the solutions)

Four concepts. Everything in the feature is an instance of one of them.

**C1 — A skeleton is a path.** Skeleton geometry uses the same point
representation as glyph paths (x, y, on/off-curve type, smooth flag), plus
per-point attributes (widths, nudges, flags, handle offsets). Consequence:
forkra's existing point-editing machinery — behavior rules, executors,
hit-testing conventions, selection semantics — applies to skeleton points
*verbatim*, parameterized only by which path is edited and where the change
is recorded. On-curve points and handles are one selection kind
(`skeletonPoint/contour/index`), exactly as upstream's `point/N` never
distinguished them. This dissolves donor kinds 1–2 of P2.

**C2 — One write path.** A single function is the only caller of the contour
generator on the editing side:

```
editSkeleton(layer, mutate)
  → apply mutate() to a working copy of the skeleton data
  → regenerate generated contours in place
  → update provenance bookkeeping
  → return ONE combined change object (customData + path) with rollback
```

Drags, nudges, smooth-toggle, transforms, Tunni-on-skeleton and the
parameters panel all call it. Because the result is one ordinary Fontra
change object, undo/redo, incremental sync and multi-layer editing come from
the existing change system for free. Inside `EditBehaviorFactory` this
surfaces as exactly one extra target-entry type (working-copy + recompute
hook), keeping `makeChangeForDelta` free of skeleton branches. Solves P3.

**C3 — Provenance is emitted forward, never recovered backward.** The
generator knows at generation time that output point 42 came from skeleton
point (contour 0, point 3), left side, "out" handle. It emits that mapping.
Stable ids in the schema (section 5) make the mapping survive edits. All
lookups — "which skeleton point does this generated point belong to?" — are
map lookups. The geometric recovery routine and the tolerance-based inverse
projection are not ported. Selection for generated geometry stores
skeleton-space addresses (`skeletonRib/…`), resolved once at hit-test time.
This dissolves donor kinds 4–5 of P2 and solves P1.

**C4 — Derived control handles are gizmos with one contract.** Rib
endpoints, editable generated handles and Tunni points are all the same
thing: a screen point computed from source geometry, whose drag maps back to
a source mutation. One contract — `position(source)` for
rendering/hit-testing, `applyDrag(delta) → source mutation` for editing.
Tunni is written once against "a path + an edit sink": the regular-path sink
writes path changes directly (WS-4 already works this way); the skeleton sink
is `editSkeleton`. Non-selection gizmos (Tunni) are dispatched directly by
the pointer, as WS-4 established.

**Integration points with forkra (all upstream conventions):**

- `scene-model.js` owns all new hit-testing as `*AtPoint` methods.
- `edit-tools-pointer.js` stays a thin dispatcher.
- Visualization layers are registration-only modules.
- Persistence goes through WS-5's `fontra-internal-data.js`
  (`setFontraInternalSection`), new `SKELETON` section in
  `fontra-internal-schema.js`.
- Pure geometry lives in `fontra-core`, once (solves P4).
- Equalize and the D/S/Z modifier behaviors are expressed inside the behavior
  rules/executor model — behavior names and executor variants, not bypass
  flags (solves P5).

## 5. Schema (free redesign — no donor-file compatibility)

Decided: forkra does **not** need to open skeleton files created by the
donor. That buys stable identifiers, which is what makes C3 cheap. Sketch
(final field list is WS-6's job):

```jsonc
customData["fontra.internal"].skeleton = {
  "version": 1,
  "nextId": 7,                       // monotonic id counter
  "contours": [
    {
      "id": 1,                       // stable, never reused
      "closed": true,
      "defaultWidth": 80,
      "singleSided": null,           // null | "left" | "right"
      "points": [
        {
          "id": 2,                   // stable per point
          "x": 100, "y": 250,
          "type": null,              // null = on-curve; "cubic" = off-curve
          "smooth": true,
          // on-curve only:
          "width":  { "left": 40, "right": 40, "linked": true },
          "nudge":  { "left": 0,  "right": 0 },
          "editable": { "left": false, "right": false },
          "handleOffsets": { /* per side/in-out offsets, detached flags */ }
        }
      ]
    }
  ],
  // provenance: generated path contours, keyed by skeleton contour id.
  // pathContourIndex is maintained transactionally by editSkeleton (C2);
  // pointMap is emitted by the generator (C3) and maps every generated
  // point index to { skeletonPointId, side, role: "onCurve"|"in"|"out" }.
  "generated": [
    { "skeletonContourId": 1, "pathContourIndex": 3, "pointMap": [ /* … */ ] }
  ]
}
```

Notes:

- Point/contour **ids** are the load-bearing change vs the donor. Selection,
  provenance and undo all reference ids, not indices, so structural edits
  can't silently retarget them.
- `pointMap` may alternatively live in a scene-side cache rather than in the
  file if size becomes a concern; the roadmap only commits to it being
  *emitted forward by the generator*, never reconstructed geometrically.
- Path contours themselves have no id facility in Fontra, so
  `pathContourIndex` can still be invalidated by non-skeleton contour
  insertion/deletion. Mitigation: every operation that inserts/deletes path
  contours in the editor already flows through a small number of code paths;
  those update the mapping in the same change. This is the one place where
  bookkeeping needs a hook outside `editSkeleton`, and it is an explicit
  task in WS-9, not an afterthought.

## 6. Workstreams

Numbering continues forkra's sequence (WS-1…5.1 done). Each workstream ships
working, verifiable software and gets its own detailed plan and
`refactor-simple/wsN-*` branch. "Donor:" lines say what gets ported (math
verbatim, plumbing redesigned).

### WS-6 — Skeleton core: schema + data model

Add `SKELETON` to `fontra-internal-schema.js`. New `fontra-core/src/skeleton-model.js`:
schema constructors, id allocation, accessors/mutators for points, widths,
nudges, flags; all pure and mocha-tested. Consolidated pure geometry
(normals, `projectRibPoint` — the single copy, `DEFAULT_SKELETON_WIDTH` — the
single constant).
Donor: geometry functions from `skeleton-contour-generator.js` and
`edit-behavior.js`, verbatim where possible.
Deliverable: tested core module; no UI change.

### WS-7 — Contour generator with forward provenance

New `fontra-core/src/skeleton-generator.js`: port the donor's generation
pipeline (segments, offset curves, caps/joins, single-sided, handle offsets,
detached handles) and make it **emit the point map** (C3) alongside generated
contours. No geometric recovery is ported. Golden-master tests: run the
donor's generator on fixture skeletons, assert forkra's output matches
(coordinates within rounding), plus provenance-map unit tests.
Donor: `skeleton-contour-generator.js` (~4,500 lines; the math moves, the
recovery/matching code does not).
Deliverable: `generateFromSkeleton(skeletonData) → { contours, provenance }`,
fully tested, still no UI.

### WS-8 — Read-only rendering

Port visualization layers: skeleton center-lines, points/handles, rib
endpoints, width shading, editable-point markers. Register per forkra's
declarative layer convention. A fixture `.fontra` file with skeleton data
(created via a WS-6 test helper) renders correctly.
Donor: `skeleton-visualization-layers.js`, relevant parts of
`visualization-layer-definitions.js`.
Deliverable: skeleton data on a layer is visible in the editor; nothing is
editable yet.

### WS-9 — Editing pipeline: `editSkeleton` + skeleton point editing

The heart of the integration.

- `views-editor/src/skeleton-editing.js`: `editSkeleton` (C2), the factory
  target entry (working copy + regenerate + one change), `skeletonPoint`
  selection kind, executors reusing the existing point-behavior rules (C1).
- `scene-model.js`: `skeletonPointAtPoint` hit-testing.
- Pointer/scene-controller wiring: click-select, marquee, drag, arrow-key
  nudge, Shift/Alt behaviors, undo/redo, incremental sync, multi-layer.
- The path-contour-index bookkeeping hook (section 5, last note).
Donor: behavior semantics only; the plumbing is new.
Deliverable: skeleton points and handles fully editable with parity to the
donor for the base + Shift/Alt modifier matrix; generated contours follow
live during drag.

### WS-10 — Skeleton drawing tool

Port the dedicated tool: create contours, append points, close contours,
delete points, smooth toggle; toolbar registration and shortcuts.
Donor: `edit-tools-skeleton.js` (1,490 lines).
Deliverable: skeletons can be created from scratch in forkra (until now,
fixtures were required).

### WS-11 — Widths and ribs

Rib gizmos (C4): `skeletonRib/contourId/pointId/side` selection kind,
rib hit-testing in scene-model, width/nudge executors, linked/unlinked
widths, single-sided contours, contour default width. Measure-mode rib
readouts (extends WS-2/4.5 measure surfaces).
Donor: rib behavior math (`createRibEditBehavior` family) verbatim; the
executor plumbing follows WS-9's protocol.
Deliverable: full rib drag/nudge parity, including Z (tangent) constraint.

### WS-12 — Editable generated points and handles

Editable flags, dragging generated on-curve points (resolves to a rib edit
via the provenance map — no new edit semantics), generated-handle offsets and
detached mode. All source lookups are provenance-map lookups (C3).
Donor: offset/detach semantics; the inverse-projection matcher is not ported.
Deliverable: parity for the editable-generated interaction surface.

### WS-13 — Modifier parity: D / S / X behaviors

The behaviors deferred from WS-9/11 because they are cross-cutting:
fixed-rib (D), fixed-rib-compress (S), and equalize (X) for skeleton and
editable-generated handles. Constraint: each is expressed **inside** the
behavior model — behavior names, rule sets, executor variants — not as
bypass flags (C4/P5). If equalize genuinely cannot be expressed in the rules
vocabulary, the fallback is a documented, isolated mechanism with its own
tests — but integration is attempted first.
Donor: semantics and test cases; explicitly not the implementation.
Deliverable: full modifier matrix parity with the donor.

### WS-14 — Skeleton Tunni

Parameterize WS-4's Tunni interactions by edit sink (C4): skeleton segments
get Tunni points whose drags flow through `editSkeleton`. Hit-testing beside
the existing Tunni tests in scene-model/pointer.
Donor: `tunni-interactions.js` skeleton branches, as behavioral reference.
Deliverable: Tunni parity on skeleton curves, including equalize where the
donor supports it.

### WS-15 — Skeleton parameters panel + source defaults

Port the panel, rewritten to write **only** through `editSkeleton` and
`skeleton-model.js` accessors (C2). Per-source skeleton defaults. Expect the
port to shrink substantially: the donor panel's 7,250 lines include
duplicated persistence and geometry that now live in core.
Donor: `panel-skeleton-parameters.js`, `skeleton-source-defaults.js`.
Deliverable: full numeric-editing parity.

### WS-16 — Cross-feature integration + parity audit

- Transformation panel operating on skeleton selections.
- Letterspacer ↔ skeleton coupling restored (the branch WS-5 stripped:
  sidebearing changes move skeleton data).
- Selection-info, copy/paste, decompose and any remaining touchpoints.
- Multi-source/interpolation check: skeleton data across designspace sources,
  generated contours staying compatible (point counts/order) for
  interpolation.
- Final parity audit: walk the donor's full action-object matrix
  (`./skeleton/docs/refactor/` has the matrices) feature by feature; file
  gaps as fixes or explicit exclusions.
Deliverable: skeleton feature signed off at full parity; donor checkout can
be deleted.

## 7. Order and dependencies

```
WS-6 ──► WS-7 ──► WS-8 ──► WS-9 ──► WS-10 ──► WS-11 ──► WS-12 ──► WS-13 ─┐
 (core)  (gen)   (render)  (edit)   (tool)    (ribs)    (editable) (D/S/X) │
                                                                           ▼
                                              WS-14 (tunni) ──► WS-15 (panel) ──► WS-16 (audit)
```

Strictly sequential except WS-10 (drawing tool), which can run in parallel
with WS-11+ once WS-9 lands, and WS-14, which depends only on WS-9. The
sequence front-loads the pure, testable core (WS-6/7 are mocha-covered before
any UI exists) and puts rendering before editing so every editing workstream
is visually verifiable.

## 8. Verification model

- **fontra-core** (WS-6/7 and everything later that adds core code): mocha +
  chai, TDD, run via `npm test` in `src-js/fontra-core`. WS-7 additionally
  uses golden-master fixtures generated from the donor.
- **views-editor**: no test harness (forkra convention) — each plan carries an
  explicit manual test matrix, with the donor open side-by-side as the
  behavioral reference. `node --check` + `npx prettier --write` before every
  commit; `npm run bundle` must stay green.
- **Parity definition**: for every interaction in the donor's action-object
  matrix, forkra produces the same visible result. Deviations are allowed
  only when they fix a donor bug, and each one is written down in the
  workstream's plan.

## 9. Donor usage rules

- `./skeleton/` is read-only. Copy from it; never modify it.
- **Port verbatim**: geometry/math (generator internals, rib projection,
  normals, tension math, cap/join construction), visualization drawing code,
  behavior *semantics* and their test cases.
- **Redesign, never port**: selection kinds and parsers, adapter/executor
  plumbing, persistence recording, the geometric recovery + inverse
  projection, the panel's direct persistence calls, the equalize bypass.
- When a donor function is ported, its forkra home is decided by layer:
  pure geometry → `fontra-core`; editor plumbing → `views-editor`. Nothing
  is imported from donor paths at runtime.

## 10. Risks and open questions

- **Path-contour identity** (section 5, last note) is the riskiest design
  point. WS-9's plan must enumerate every editor operation that can
  insert/delete/reorder path contours and route the mapping update through
  each. If enumeration proves impractical, fallback: tag generated contours
  by making the provenance mapping self-healing *through ids at edit time*
  (recompute only inside `editSkeleton`, treat external structural edits as
  detaching the skeleton) — decided in WS-9, documented either way.
- **Generator parity** is a large surface (caps, joins, single-sided,
  detached handles). Golden-master tests against donor output de-risk it, but
  building representative fixtures is real work budgeted inside WS-7.
- **Performance**: regeneration runs on every drag frame. The donor already
  does this acceptably (with an in-place update mode); WS-9 keeps the
  in-place path and adds a frame-budget check to its manual test matrix.
- **Interpolation semantics** for skeleton data across sources (point-count
  compatibility of generated contours) is under-specified in the donor;
  WS-16 investigates and either matches donor behavior or specifies better.
- **Equalize-in-the-rules-model** (WS-13) is an experiment with a defined
  fallback; it must not block WS-14/15, which don't depend on it.
