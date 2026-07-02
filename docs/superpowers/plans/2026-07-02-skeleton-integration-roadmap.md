# Skeleton Integration Roadmap

Date: 2026-07-02 (rev. 2 — donor re-pinned to the pre-refactor snapshot)
Status: Proposed
Scope: Full parity with the donor's skeleton feature set
Primary donor: `./skeleton/` (read-only checkout of the old fork at `fd76d3abe`,
2026-02-20 — the last **pre-refactor** commit)
Secondary reference: the same repo's `ref/cleanup` branch (`d8d82b442`, the
post-refactor state), consulted via `git -C skeleton show ref/cleanup:<path>`
— never checked out as the working donor

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

We are deliberately **not** merging the donor's skeleton code. We re-integrate
the feature from scratch on forkra, reusing the donor's proven geometry math
but redesigning the plumbing around four architectural concepts (section 4).
The donor serves as the behavioral reference: for every interaction, "what
should happen" is defined as "what the donor does."

## 2. Which donor snapshot, and why (history of the old fork)

The old fork's history splits into two eras, and the choice of donor snapshot
matters:

- **Feature era (→ 2026-02-20, commit `fd76d3abe`).** The skeleton feature
  was built here. Architecture is crude — nearly all interaction logic lives
  inline in one giant pointer-tool file — but the behavior is the product of
  direct feature development. The `fontra.internal` customData storage
  migration (which forkra's persistence also uses) completed just before this
  point.
- **Refactor era (2026-02-27 → 2026-07).** Four-plus months of architecture
  work: first an adapter/registry/composer layer (~6,000 lines of
  indirection, later judged a mistake and deleted), then a "unified factory"
  re-refactor that undid it. Both swore behavior parity with the feature-era
  state; in practice the era produced a long tail of parity regressions
  (the equalize feature alone regressed five times) and, at its end, the code
  still had known bugs.

**Decision: the donor is pinned at `fd76d3abe`, the last feature-era commit.**
Rationale:

- It is the **behavioral ground truth** — the very state the refactor's own
  parity matrices were written against. Its bugs are original feature bugs;
  the post-refactor state has those *plus* refactor regressions.
- Every user-facing capability exists there (verified by audit): Z tangent
  mode, D fixed-rib, S fixed-rib-compress, X equalize, rib interpolation,
  single-sided contours, detached handles, editable generated points/handles,
  skeleton Tunni, the parameters panel.
- For a port that redesigns all plumbing anyway, the crude architecture is an
  advantage as *reading material*: each donor drag handler is one
  self-contained story, with no factory indirection to chase.

**What the secondary reference (`ref/cleanup`) is still good for:**

- `docs/refactor/` — the intended-state parity matrices (they document
  feature-era behavior, interaction by interaction) and the phase reviews.
- Three generator bug fixes made during the refactor era that fix genuine
  feature-era bugs, to be **cherry-picked as semantics** during WS-7:
  - `9ddfc746a` — persist generated contour indices after regeneration
  - `d0b4ec217` — preserve generated-contour purge sets on contour-count shrink
  - `c2cd2ce51` — near-zero handles fix
- Architectural lessons, positive and negative (sections 3–4).

Donor file sizes at `fd76d3abe`, for orientation: `edit-tools-pointer.js`
7,496 lines (contains nearly all skeleton + Tunni interaction logic),
`panel-skeleton-parameters.js` 6,951, `skeleton-contour-generator.js` 3,918,
`edit-tools-skeleton.js` 1,490, `skeleton-visualization-layers.js` 1,086.
`edit-behavior.js` is 1,391 — essentially untouched upstream, which makes
"diff donor against upstream" a clean way to isolate the feature.

## 3. Why not merge either state (the problems)

These structural defects motivated re-integration. Most exist in **both**
donor states; the refactor moved them around without removing them. Every one
shapes a decision in section 4.

**P1 — Derived data with no reliable link to its source.** Generated contours
live in the glyph path, but the record of *which* path contours are generated
can drift when other contours are added or removed. Mapping a clicked
generated point back to its skeleton source is done by geometric matching
(inverse projection); the post-refactor state even grew a "recovery" routine
that re-identifies generated contours by comparing coordinates. Geometry
matching as a substitute for bookkeeping is the feature's deepest flaw and its
most insidious bug class (selection landing on the wrong point, "drag feels
off").

**P2 — Interaction kinds multiplied beyond the underlying concepts.** Five
skeleton selection kinds (`skeletonPoint`, `skeletonHandle`,
`skeletonRibPoint`, `editableGeneratedPoint`, `editableGeneratedHandle`)
where analysis shows about three actual edit semantics. Two of the kinds
exist only because selection stores *path* point indices that must be
reverse-mapped to skeleton coordinates (see P1).

**P3 — No single write path.** Skeleton mutations happen from drag/nudge
handlers, smooth-toggle, transforms, and a ~7,000-line parameters panel that
calls persistence primitives directly. Invariants (regeneration, index
bookkeeping, undo shape) are re-implemented per call site and drift apart.

**P4 — Duplicated geometry.** The rib-endpoint projection function and the
default-width constant exist in multiple copies across files (post-refactor:
`projectRibPoint` twice, `DEFAULT_SKELETON_WIDTH` five times). If copies
drift, the generated outline and the editing targets disagree.

**P5 — Features bolted on outside the behavior model.** X-equalize lives
outside the behavior-rules system (feature era: inline pointer code;
refactor era: a bypass flag with its own branch in the change pipeline). It
regressed five times during the refactor. Interpolation, expressed *inside*
the rules model, never regressed. The lesson: cross-cutting modifiers must be
behavior names and executor variants, not side channels.

**P6 — Monolith files.** Feature era: pointer at 7,496 lines (upstream: 857).
Refactor era: `edit-behavior.js` at 4,785 (upstream: 1,297). Both violate
forkra's upstream-shaped discipline; the refactor demonstrated that moving
the bulk around doesn't shrink it.

**P7 — The refactor's own cautionary tale.** Four months of in-place
rearchitecting on top of a live feature produced two successive architectures
and a regression tail, while adding no user-facing capability. That is the
strongest argument for this roadmap's approach: re-integrate onto a clean
base, porting semantics and math, never plumbing.

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
distinguished them. This dissolves two of P2's five kinds.

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
map lookups. No geometric recovery or tolerance-based inverse projection is
ported from either donor state. Selection for generated geometry stores
skeleton-space addresses (`skeletonRib/…`), resolved once at hit-test time.
This dissolves P2's remaining surplus kinds and solves P1.

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
- `edit-tools-pointer.js` stays a thin dispatcher. Porting from a donor whose
  pointer is 7,496 lines does **not** mean forkra's pointer grows: donor
  handlers are read for semantics, which are then implemented behind the
  factory/scene-model/gizmo seams. (Solves P6 by construction.)
- Visualization layers are registration-only modules.
- Persistence goes through WS-5's `fontra-internal-data.js`
  (`setFontraInternalSection`), new `SKELETON` section in
  `fontra-internal-schema.js`.
- Pure geometry lives in `fontra-core`, once (solves P4).
- Equalize and the D/S/Z modifier behaviors are expressed inside the behavior
  rules/executor model — behavior names and executor variants, not bypass
  flags or inline pointer code (solves P5).

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
  task in WS-9, not an afterthought. (The donor hit exactly this: two of the
  three cherry-picked fixes in section 2 patch index-drift bugs.)

## 6. Workstreams

Numbering continues forkra's sequence (WS-1…5.1 done). Each workstream ships
working, verifiable software and gets its own detailed plan and
`refactor-simple/wsN-*` branch. "Donor:" lines name the `fd76d3abe` files
that get read or ported (math verbatim, plumbing redesigned).

### WS-6 — Skeleton core: schema + data model

Add `SKELETON` to `fontra-internal-schema.js`. New `fontra-core/src/skeleton-model.js`:
schema constructors, id allocation, accessors/mutators for points, widths,
nudges, flags; all pure and mocha-tested. Consolidated pure geometry
(normals, rib projection — the single copy, default width — the single
constant).
Donor: geometry functions from `skeleton-contour-generator.js` and the
pointer's inline helpers, verbatim where possible.
Deliverable: tested core module; no UI change.

### WS-7 — Contour generator with forward provenance

New `fontra-core/src/skeleton-generator.js`: port the donor's generation
pipeline (segments, offset curves, caps/joins, single-sided, handle offsets,
detached handles) and make it **emit the point map** (C3) alongside generated
contours. Apply the three cherry-picked fixes from section 2 as part of the
port (`9ddfc746a`, `d0b4ec217`, `c2cd2ce51` — read their diffs on
`ref/cleanup` history, re-express against the ported code). No geometric
recovery is ported. Golden-master tests: run the donor's generator on fixture
skeletons, assert forkra's output matches (coordinates within rounding), plus
provenance-map unit tests.
Donor: `skeleton-contour-generator.js` (3,918 lines at `fd76d3abe`; the math
moves, index-recovery patterns do not).
Deliverable: `generateFromSkeleton(skeletonData) → { contours, provenance }`,
fully tested, still no UI.

### WS-8 — Read-only rendering

Port visualization layers: skeleton center-lines, points/handles, rib
endpoints, width shading, editable-point markers. Register per forkra's
declarative layer convention. A fixture `.fontra` file with skeleton data
(created via a WS-6 test helper) renders correctly.
Donor: `skeleton-visualization-layers.js` (1,086 lines — nearly unchanged by
the donor's refactor era, safe to port from either state), relevant parts of
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
Donor: the pointer's skeleton drag/nudge handlers, read for semantics only;
the plumbing is new. The secondary reference's `docs/refactor/` matrices
define the expected modifier behavior interaction-by-interaction.
Deliverable: skeleton points and handles fully editable with parity to the
donor for the base + Shift/Alt modifier matrix; generated contours follow
live during drag.

### WS-10 — Skeleton drawing tool

Port the dedicated tool: create contours, append points, close contours,
delete points, smooth toggle; toolbar registration and shortcuts.
Donor: `edit-tools-skeleton.js` (1,490 lines, identical in both donor states).
Deliverable: skeletons can be created from scratch in forkra (until now,
fixtures were required).

### WS-11 — Widths and ribs

Rib gizmos (C4): `skeletonRib/contourId/pointId/side` selection kind,
rib hit-testing in scene-model, width/nudge executors, linked/unlinked
widths, single-sided contours, contour default width. Measure-mode rib
readouts (extends WS-2/4.5 measure surfaces).
Donor: the pointer's rib drag/hit-test handlers (self-contained inline code
at `fd76d3abe`) — projection math verbatim, plumbing per WS-9's protocol.
Deliverable: full rib drag/nudge parity, including Z (tangent) constraint.

### WS-12 — Editable generated points and handles

Editable flags, dragging generated on-curve points (resolves to a rib edit
via the provenance map — no new edit semantics), generated-handle offsets and
detached mode. All source lookups are provenance-map lookups (C3).
Donor: offset/detach semantics from the pointer's editable-generated
handlers; the geometric matchers are not ported.
Deliverable: parity for the editable-generated interaction surface.

### WS-13 — Modifier parity: D / S / X behaviors

The behaviors deferred from WS-9/11 because they are cross-cutting:
fixed-rib (D), fixed-rib-compress (S), and equalize (X) for skeleton and
editable-generated handles. Constraint: each is expressed **inside** the
behavior model — behavior names, rule sets, executor variants — not as
bypass flags (C4/P5). If equalize genuinely cannot be expressed in the rules
vocabulary, the fallback is a documented, isolated mechanism with its own
tests — but integration is attempted first.
Donor: semantics from the pointer's inline D/S/X handlers, plus the equalize
test cases the refactor era added on `ref/cleanup`
(`test-edit-behavior-factory.js`) as extra behavioral fixtures. Explicitly
not the implementation from either state.
Deliverable: full modifier matrix parity with the donor.

### WS-14 — Skeleton Tunni

Parameterize WS-4's Tunni interactions by edit sink (C4): skeleton segments
get Tunni points whose drags flow through `editSkeleton`. Hit-testing beside
the existing Tunni tests in scene-model/pointer.
Donor: the skeleton-Tunni handlers inline in the `fd76d3abe` pointer; the
secondary reference's consolidated `tunni-interactions.js` is useful as a
cleaner reading of the same semantics.
Deliverable: Tunni parity on skeleton curves, including equalize where the
donor supports it.

### WS-15 — Skeleton parameters panel + source defaults

Port the panel, rewritten to write **only** through `editSkeleton` and
`skeleton-model.js` accessors (C2). Per-source skeleton defaults. Expect the
port to shrink substantially: the donor panel's 6,951 lines include
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
- Final parity audit: walk the full action-object matrix
  (`git -C skeleton show ref/cleanup` → `docs/refactor/` matrices, which
  document the `fd76d3abe` behavior) feature by feature; file gaps as fixes
  or explicit exclusions.
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
  matrix, forkra produces the same visible result **as the `fd76d3abe`
  state**. Where the post-refactor state disagrees with `fd76d3abe`, the
  pre-refactor behavior wins unless it is one of the three cherry-picked bug
  fixes. Deviations are allowed only when they fix a donor bug, and each one
  is written down in the workstream's plan.

## 9. Donor usage rules

- `./skeleton/` is a full, independent git clone of the old fork
  (`froggo-gfx/glyphcad`), nested inside forkra and covered by forkra's
  `.gitignore` — the two repos never interact. All git operations on it run
  from forkra's root via `git -C skeleton …`; no directory-jumping needed.
- It is read-only and pinned at `fd76d3abe` (detached HEAD). Copy from it;
  never modify it; **never move its HEAD** (`checkout`/`switch`) without
  updating this roadmap — plans and agents assume the on-disk state is the
  pinned donor.
- Every other state is readable without moving HEAD, and these are the only
  sanctioned forms:
  - `git -C skeleton show ref/cleanup:<path>` — a file from the
    post-refactor state
  - `git -C skeleton log ref/cleanup --oneline -- <path>` — history
  - `git -C skeleton diff fd76d3abe ref/cleanup -- <path>` — what the
    refactor era changed in a file
- If browsing the post-refactor tree on disk becomes necessary, use a linked
  worktree, not a re-checkout:
  `git -C skeleton worktree add ../skeleton-refactored ref/cleanup`
  (and add `skeleton-refactored/` to forkra's `.gitignore` in the same
  change). The pin in `./skeleton/` stays untouched.
- Use the post-refactor state for the `docs/refactor/` matrices/reviews, the
  three cherry-picked generator fixes, and the refactor-era test suites as
  behavioral fixtures. Do not port its plumbing.
- **Port verbatim**: geometry/math (generator internals, rib projection,
  normals, tension math, cap/join construction), visualization drawing code,
  behavior *semantics* and their test cases.
- **Redesign, never port**: the pointer monolith's structure, selection
  kinds and parsers, persistence recording, geometric recovery / inverse
  projection, the panel's direct persistence calls, the equalize side
  channel — and equally the refactor era's adapter/factory plumbing.
- When a donor function is ported, its forkra home is decided by layer:
  pure geometry → `fontra-core`; editor plumbing → `views-editor`. Nothing
  is imported from donor paths at runtime.

## 10. Risks and open questions

- **Path-contour identity** (section 5, last note) is the riskiest design
  point. WS-9's plan must enumerate every editor operation that can
  insert/delete/reorder path contours and route the mapping update through
  each. If enumeration proves impractical, fallback: recompute the mapping
  only inside `editSkeleton` and treat external structural edits as
  detaching the skeleton — decided in WS-9, documented either way. The donor
  hit this exact problem twice (see the cherry-picked fixes); ids + a single
  write path are the structural answer, but the enumeration work is real.
- **Generator parity** is a large surface (caps, joins, single-sided,
  detached handles). Golden-master tests against donor output de-risk it, but
  building representative fixtures is real work budgeted inside WS-7.
- **Reading semantics out of a 7,496-line pointer** is slower per feature
  than reading the refactored executors would be. Mitigation: the secondary
  reference's matrices and phase reviews act as the index into the donor
  code; when the two states agree, either may be read, and the refactored
  state is often the quicker read for *what* while `fd76d3abe` is the
  authority for *correct*.
- **Performance**: regeneration runs on every drag frame. The donor already
  does this acceptably; WS-9 adds a frame-budget check to its manual test
  matrix. (The post-refactor `preferInPlace` regeneration mode is a
  legitimate idea to re-derive if profiling demands it.)
- **Interpolation semantics** for skeleton data across sources (point-count
  compatibility of generated contours) is under-specified in the donor;
  WS-16 investigates and either matches donor behavior or specifies better.
- **Equalize-in-the-rules-model** (WS-13) is an experiment with a defined
  fallback; it must not block WS-14/15, which don't depend on it.

## 11. Instructions for plan authors

You are writing the detailed implementation plan for one workstream of this
roadmap. Read this whole roadmap first. Then follow these rules — each one
exists because its violation already happened once in the donor's history.

**Ground your plan in the code, not in this document.**

1. Before writing a single task, audit the current forkra code your
   workstream touches. File names, sizes, line numbers and helper names in
   this roadmap describe the state at 2026-07-02; earlier workstreams will
   have moved things. Every path, symbol and line reference in your plan must
   be verified by grep/read against the tree you're planning for, the day you
   write the plan.
2. Never trust a progress report, review doc, or this roadmap over the code.
   (The donor's progress report claimed a duplicate function had been
   unified; the tree said otherwise.) If a claim matters to your plan, verify
   it with a grep and put the grep in the plan as a verification step.

**Donor discipline.**

3. `./skeleton/` is read-only, pinned at `fd76d3abe`. Plans may copy from it,
   never modify it, never re-checkout it.
4. Port **verbatim**: geometry, math, drawing code, behavior semantics.
   Redesign **always**: selection kinds, parsers, persistence calls,
   executor plumbing, anything reaching into the pointer monolith's
   structure. If your plan says "adapt the donor's routing/dispatch/handler
   structure", the plan is wrong. The correct wording is either "copy
   function `<exact name>` verbatim" or "implement `<semantics>` behind
   `<forkra seam>`".
5. When you need the post-refactor state (matrices, the three cherry-picked
   generator fixes, refactor-era tests as fixtures), read it via
   `git -C skeleton show ref/cleanup:<path>`. Its plumbing is never a
   template.

**Architecture rails (check your plan against every one).**

6. All skeleton mutation flows through `editSkeleton` (C2). If any task adds
   a second call site of the generator on the editing side, or writes
   skeleton customData outside `editSkeleton`, the plan is wrong.
7. No branching on object kind inside change-emission code
   (`makeChangeForDelta` and below). Kind decisions happen at construction
   time. If a task adds `if (skeleton…)` to a shared emit path, the plan is
   wrong.
8. No geometric recovery, no tolerance-based inverse projection, ever —
   provenance is emitted forward by the generator (C3). Selection and
   provenance reference stable ids, never raw path-point indices.
9. Layer placement is fixed: pure geometry → `fontra-core` (mocha-tested);
   hit-testing → `scene-model.js` as `*AtPoint` methods; pointer stays a
   thin dispatcher and must not grow glyph-geometry logic. One copy of every
   constant and geometry function — if a symbol you need exists anywhere in
   forkra, import it; re-declaring it (even "it's just a constant") is a
   plan failure.
10. Cross-cutting modifiers (D/S/X/Z) are behavior names and executor
    variants inside the rules model — never side-channel flags threaded
    around it.

**Scope and parity.**

11. Pure parity, no improvements. The target behavior is what `fd76d3abe`
    does (§8); where the two donor states disagree, `fd76d3abe` wins except
    for the three cherry-picks (§2). Any deliberate deviation gets its own
    line in the plan under a "Deviations" heading, with the reason.
12. Do not pull work from later workstreams forward, even when it looks
    cheap. If your workstream discovers that a later workstream's interface
    assumption is wrong, update this roadmap in the same commit and say so
    in the plan.

**Plan mechanics (forkra conventions).**

13. Use the superpowers plan format: header block, exact file paths, tasks
    with TDD step cycles, complete code in every step, no placeholders, an
    Interfaces block per task (consumes/produces with exact signatures).
    Name the file `docs/superpowers/plans/YYYY-MM-DD-wsN-<name>.md`; the
    branch is `refactor-simple/wsN-<name>`, cut from the current
    `refactor-simple` head.
14. Every task ends with: run the relevant tests (`npm test` in
    `src-js/fontra-core` for core code), `node --check` on every touched
    views-editor file, `npx prettier --write` on touched files, then a
    commit with a focused message. One concern per commit — never mix a
    verbatim port and a modification of the ported code in the same commit;
    port first, change in the next commit, so every diff is either "pure
    copy" or "pure change".
15. views-editor work has no test harness: your plan must carry an explicit
    manual test matrix naming every interaction × modifier combination it
    affects, with the donor open side-by-side as reference. "Test manually"
    without the matrix is a placeholder, i.e. a plan failure.
16. End the plan with acceptance criteria that include the rail checks from
    this section expressed as runnable greps (e.g. "grep for generator call
    sites outside `editSkeleton` returns only the one in
    `skeleton-editing.js`").
