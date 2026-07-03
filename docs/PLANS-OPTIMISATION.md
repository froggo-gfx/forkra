# Plans Optimisation — WS-6…WS-16 Review

Date: 2026-07-03
Scope: the eleven detailed plans (`docs/superpowers/plans/2026-07-0{2,3}-ws{6..16}-*.md`)
for the skeleton integration roadmap.
Method: every plan read end-to-end; every "Verified Current Context" claim that a
finding depends on was re-verified against the forkra tree on 2026-07-03
(`parseSelection`, `change-recorder.js`, `vector.js`, `fontra-internal-data.js`,
`edit-behavior.js` rules tables, pointer `rollbackChange` usage, tool key dispatch,
tabler icon assets, donor checkout at `fd76d3abe`).

> **Status update (2026-07-03):** the blocking findings have been fixed in the
> plan documents themselves — B1 (WS-9 gained Task 0 extending `parseSelection`;
> `.size`→`.length` usages corrected in WS-9/10), B2 (WS-6 schema now normalizes
> cap/corner fields, verified against the donor generator's inputs; WS-7
> conversions pass them through; WS-15 references the canonical names), B3
> (WS-9's `replaceGeneratedSkeletonContours` rewritten to in-place steady-state
> updates with stable-position structural fallback), B4 (cross-layer ordinal
> resolution via `resolveSkeletonAddressAcrossLayers` specified in WS-9 and
> referenced from WS-10/13/14/15), plus WS-6/1 (nudge test corrected to donor
> semantics — donor `projectRibPoint` verified identical to the plan's
> implementation, including the double rounding, so finding WS-6/3 is
> withdrawn), WS-7/1+2 (import path, `writeFileSync`), WS-9/1 (key parse
> round-trip), WS-9/2 (rules reuse specified concretely as a synthetic
> `VarPackedPath` driven through the existing `EditBehaviorFactory`), WS-9/4
> (signature), WS-11/1+2 (test expectation aligned; measure payload renamed to
> `sideWidths`), WS-12/1+2 (path indices removed from selection keys;
> `findGeneratedPathAddress` added; resolver takes the path), WS-15/1+2
> (schema block keeps `SKELETON`; bone.svg vendoring step added), WS-16/1+2
> (rib bounds via the shared core forward-projection helper; nested-recorder
> caution added). **Part 3 (O1–O9) and the Medium finding WS-13/1 remain open
> by request** — optimizations were explicitly not applied.

Findings are grouped as:

- **Part 1 — Blockers**: cross-cutting defects that make the plans fail as written.
- **Part 2 — Per-workstream correctness oversights**: local bugs/inconsistencies.
- **Part 3 — Architecture & optimisation**: better solutions (less code, more
  unification, better performance).

Each finding names the workstream(s) it applies to.

---

## Part 1 — Blockers (cross-cutting)

### B1. `parseSelection` cannot carry the plans' compound selection keys — **WS-9, WS-10, WS-11, WS-12, WS-13, WS-15, WS-16**

The single most important finding. Forkra's `parseSelection`
(`src-js/fontra-core/src/utils.ts:286`) does:

```ts
const [tp, index] = item.split("/");
result[tp].push(parseInt(index, 10));
```

It keeps **only the first segment after the kind, as an integer**, and returns
**arrays**, not Sets. Consequences for the plans as written:

- `"skeletonPoint/3/5"` parses to `{ skeletonPoint: [3] }` — the **pointId is
  silently discarded**. Same for `skeletonRib/<cId>/<pId>/<side>` (side and
  pointId lost) and WS-12's six-segment editable-generated keys.
- WS-9 Task 4's `parseSelection(selection).skeletonPoint?.size` is always
  `undefined` (arrays have `.length`), so `hasSkeletonPointSelection()` is
  permanently `false`. WS-10 Task 4 (`skeletonPoint.size !== 1`,
  `parseSkeletonPointKey([...skeletonPoint][0])` — which would receive the
  number `3`, not `"3/5"`) breaks the same way. WS-15 Task 3 and WS-16 Task 2
  inherit the assumption.

**Fix (must be settled in WS-9 as a prerequisite task):** either

1. extend `parseSelection` so that when the remainder contains more than one
   segment it stores the remainder **string** (`"3/5"`, `"3/5/left"`) instead of
   an int — regular kinds (`point/12`) keep today's behavior, so nothing
   upstream changes; or
2. add a dedicated `parseSkeletonSelection(rawSelectionSet)` used everywhere
   skeleton kinds are involved, and forbid `parseSelection` for skeleton kinds
   via a rail grep.

Option 1 is less code overall and lets all later workstreams keep the
`parseSelection` one-liner they already wrote. Either way, WS-9's plan must add
the tests, and every later plan's `parseSelection(...)` snippets must be read
with this in mind.

### B2. Cap/corner parameters have no home in the WS-6 schema, but WS-7/WS-8/WS-15 depend on them — **WS-6, WS-7, WS-8, WS-15**

WS-6's `normalizeSkeletonPoint`/`normalizeSkeletonContour` whitelist exactly
`id/x/y/type/smooth/width/nudge/editable/handleOffsets` and
`id/closed/defaultWidth/singleSided/points`. Everything else is **actively
stripped**. But:

- WS-7's golden-master fixture `open-cubic-round-cap` puts `capStyle: "round"`
  on canonical points; `generateFromSkeleton` normalizes its input first, so the
  cap style is deleted before generation → forkra generates butt caps while the
  donor expected-output has round caps → **that golden-master test fails by
  construction**.
- WS-7's `canonicalToGeneratorInput` reads `contour.capStyle` and
  `contour.reversed` — both stripped by normalization → dead code.
- WS-8's fixture glyph also stores point-level `capStyle: "round"` (silently
  dropped on first normalize).
- WS-15 Tasks 4/8 build panel editing for `capRadiusRatio`, `capTension`,
  `capAngle`, `capDistance`, `roundnessStrength`, `cornerAsymmetry` and debug
  fields — none of which exist in the schema, and WS-15 only hedges with "if
  WS-6 named these fields differently". They aren't named differently; they are
  **absent**.

**Fix:** WS-6 must define the cap/corner surface up front: point-level
`capStyle` (+ cap parameters) and corner parameters, added to
`normalizeSkeletonPoint` (and `reversed` on the contour if the generator needs
it), with tests. WS-7's conversion then copies them through. This is a schema
decision, not a panel decision — deferring it to WS-15 guarantees rework of
WS-6/7/8 artifacts (normalizer, generator adapter, fixtures, golden masters).

### B3. Regenerate-by-delete-and-append breaks index stability, drag correctness, and interpolation — **WS-9 (origin), WS-12, WS-16 (victims)**

WS-9's `replaceGeneratedSkeletonContours` deletes the previous generated
contours at their recorded indices and **appends** the regenerated ones at the
end of the path. Three distinct problems:

1. **Drag-frame correctness.** `makeEditSkeletonChange` builds every frame's
   change against the *original* layer glyph, but the change is applied to the
   *current* glyph. The point-coordinate parts are absolute and idempotent —
   fine. The `deleteContour(i)`/`insertContour(j)` parts are **positional**: if
   the generated contours were not already at the end of the path (e.g. a user
   drew a normal contour after generation), frame 1 moves them to the end, and
   frame 2's delete-indices (computed against the original layout) then delete
   the **wrong contours**. This is a real corruption path, not a style issue.
2. **Index churn.** Every skeleton edit reorders path contours, so every
   consumer of `pathContourIndex` (WS-12 selection keys, WS-9 Task 7
   bookkeeping, undo diffs) deals with a moving target that never needed to
   move.
3. **Interpolation (WS-16 Task 8).** Contour order must match across sources
   for Fontra interpolation. Editing one source's skeleton reorders only that
   layer's path → structurally identical skeletons become interpolation-
   incompatible after a single-layer edit. WS-16's compatibility test cannot
   pass reliably while WS-9 reorders per-layer.

**Fix (in WS-9):** make in-place update the steady-state path. When the
regenerated result has the same contour count and per-contour point counts/type
runs as the previous generation (the case for every width/nudge/coordinate
drag), write point coordinates in place (`setPointPosition`, already proxied by
the change recorder) and keep `pathContourIndex` untouched. Fall back to
delete+insert **at the same indices** (not append) only when topology changes.
This is simultaneously the fix for 1–3, produces far smaller change objects per
drag frame, and is what the roadmap's own performance note (§10,
`preferInPlace`) anticipated.

### B4. Cross-layer editing vs. per-layer independent ids is unresolved — **WS-9, WS-10, WS-11, WS-12, WS-13, WS-15**

Stable ids are allocated per layer (`nextId` lives inside each layer's skeleton
object), but selections store ids from the *edit* layer, and every multi-layer
task ("apply the same edit to all editable layers") resolves those ids in
*other* layers. That only works if ids are in lockstep across layers. Nothing
in WS-6…15 establishes or checks that invariant:

- WS-10 creates points per layer via per-layer `makeSkeletonPoint(...,
  skeletonData)` id allocation — lockstep holds only if every structural edit
  always hits every editable layer, forever, in the same order.
- WS-11/12/13/15 manual matrices say "layers with matching stable ids … missing
  ids are skipped", which silently degrades multi-source editing into
  edit-layer-only editing the first time layers diverge (e.g. a layer added
  later, an undo applied in one layer, a paste into one layer).

**Fix:** decide explicitly in WS-9/WS-10, and write it down:

- either **enforce lockstep** — all structural skeleton edits are multi-layer
  by construction, ids allocated by one shared routine, plus a WS-16 audit
  check that flags divergent layers; paste (WS-16 Task 6) must then re-id into
  **all** layers consistently;
- or **map per layer** — treat the edit-layer id as canonical and resolve other
  layers by structural position (contour ordinal + point ordinal), which is
  what index-based donor code effectively did.

Skipping silently is the worst of both; at minimum it must become a visible,
tested behavior.

---

## Part 2 — Per-workstream correctness oversights

### WS-6

1. **Task 4 test contradicts its own implementation** (rib nudge sign). With
   `normal = (0, -1)` the implementation's tangent is `(-normal.y, normal.x) =
   (1, 0)`, so `projectSkeletonRibPoint(point, normal, 40, "right", 10)`
   returns `{ x: 10, y: 40 }`; the test asserts `{ x: -10, y: 40 }`. Step 4
   ("Expected: PASS") is wrong — one of the two must change. Resolve against
   the donor's `projectRibPoint` (line 100 of the donor pointer): if the donor
   signs the nudge per side, the implementation is wrong; otherwise the test is.
2. **`calculateNormalAtSkeletonPoint(contour, pointIndexOrPointId)` overload is
   ambiguous.** `pointIndexOrPointId >= 0 && < points.length` treats small ids
   as indices. Ids start at 1 and are glyph-global, so a point with id 2 in a
   5-point contour resolves as *index 2* — the wrong point. Split into
   `...AtIndex` / `...ById` (or take only ids); this is exactly the id/index
   confusion class the roadmap's P1 warns about, reintroduced inside a helper
   signature.
3. **Double rounding in `projectSkeletonRibPoint`** (`Math.round` on the base,
   then again after adding the nudge) — verify against the donor before locking
   golden numbers into WS-8/11 behavior; the donor rounds once, this can drift
   endpoints by 1 unit.
4. **`getSkeletonData` first branch makes the second unreachable for layers.**
   Minor, but the fallback branch re-reads `layerOrCustomData?.customData`
   which is known falsy there; collapse to `entity.customData ? viaSection :
   viaRawObject`.

### WS-7

1. **Fixture-script donor import path is one `../` too deep.**
   From `src-js/fontra-core/tests/scripts/`, `../../../../../skeleton/...`
   resolves *above* the repo root; it must be `../../../../skeleton/...`.
   The script fails at import time.
2. **`fs.writeFileSync(`${outputPath}\n`.trim(), ...)`** — the `\n`+`trim()` is
   applied to the *path* instead of the content. It happens to be harmless
   (trim undoes the append) but is clearly a transposed expression; the content
   already appends `\n`. Clean it up so implementers don't "fix" it wrongly.
3. **`open-cubic-round-cap` golden master cannot pass** (see B2).
4. **Task 4 (provenance emission) is prose in the riskiest spot.** "Do this
   mechanically in the functions that push into leftSide, rightSide, startCap,
   endCap" — against a 3,918-line ported file, this is the plan's only
   placeholder-grade instruction, in the task the whole architecture (C3)
   depends on. The plan should enumerate the donor's actual point-creation
   sites (function names + donor line anchors) the way WS-13 enumerates donor
   handlers, so the sub-agent doing the port has a checklist instead of a hunt.
5. Cosmetic: "Verified Current Context" contains another machine's path
   (`C:/Users/marty/Desktop/fontraz/...`) in the documented git commands.

### WS-8

1. **`skeletonContourToPath2d` handles `"quad"` point types** that the WS-6
   schema explicitly forbids (`VALID_POINT_TYPES = {null, "cubic"}`). Dead
   branch — drop it or widen the schema deliberately.
2. **Width shading draws straight quads between rib endpoints even across cubic
   segments.** If the donor shades sampled offset curves, this is a visible
   parity deviation on any curved skeleton; it isn't listed under Deviations.
   Verify donor behavior and either match or record the deviation.
3. Redundant guards: the layer code re-checks `editable && halfWidth >= 0.5`
   before calling `getSkeletonPointNudge`, which performs the same checks
   internally (WS-6). One source of truth — call the helper unconditionally.
4. Fixture uses point-level `capStyle` (B2).

### WS-9

1. **`makeSkeletonPointKey`/`parseSkeletonPointKey` are asymmetric.** `make`
   returns `"skeletonPoint/3/5"`; `parse` does `key.split("/").map(Number)` on
   the first two segments — parsing a *made* key yields `{ contourId: NaN,
   pointId: 3 }`. Define one canonical form (full key in, full key out) and add
   the round-trip test. (Interacts with B1.)
2. **Task 2 Step 3 is a placeholder in the core step.** "Before committing,
   replace this minimal direct transform body with the existing point-behavior
   rule executor" is exactly the "implement later" pattern the roadmap's plan
   rules (§11.13/15) forbid — and it is the step that realizes C1 (skeleton
   points reuse the behavior rules). The plan must spell out the mechanism:
   build a synthetic contour array from the skeleton contour's points with
   selected/smooth/on-off flags, run it through the existing rules matcher to
   obtain action factories, and apply the resulting edit funcs to the working
   copy inside `mutate`. Without this, every later workstream (11/12/13
   executors) builds on an unspecified foundation.
3. **Target-entry rollback can and should be eager, not lazy.** Verified: the
   current pointer reads `editBehavior.rollbackChange` only lazily (behavior
   switch at `edit-tools-pointer.js:492`, drag end at `:524`), so the plan's
   dynamic getter *works* — but it's fragile coupling ("read only after
   `makeChangeForTransform` was called at least once"). The skeleton entry
   knows its rollback at construction: "restore original skeleton customData +
   original generated contours". Compute it once, eagerly; the getter
   indirection and the ordering contract disappear.
4. **Interface/implementation mismatch:** Task 7's Interfaces block declares
   `shiftGeneratedContourIndices(layerGlyph, skeletonData, startIndex, delta)`;
   the implementation takes `(skeletonData, startIndex, delta)`.
5. Redundant work per edit: `applySkeletonMutation` runs `getSkeletonData`
   (which normalizes+copies), then `structuredClone`, then
   `normalizeSkeletonData` again, then `generateFromSkeleton` normalizes a
   third time (WS-7), then `setSkeletonData` normalizes a fourth (WS-6). See
   Part 3, O2.
6. Gap to note for the WS-16 audit: Backspace/Delete on a skeleton-point
   selection with the **pointer** tool is handled nowhere (WS-10 only handles
   it inside the skeleton tool). If the donor supported it, it's a parity hole.

### WS-10

1. Multi-layer structural edits assume id lockstep (B4) — `_getSelectedOpenEndpoint(skeletonData)`
   is evaluated per layer against edit-layer selection ids.
2. `handleKeyDown` delete routing is fine (verified: `scene-controller.js:1034`
   forwards non-arrow keys to the selected tool), but the plan should state
   that Backspace must call `event.preventDefault()`/not fall through to any
   global delete action, to avoid double handling.

### WS-11

1. **Task 1's test and implementation disagree about `defaultWidth`.** The test
   requires "missing point width: setting right initializes canonical width
   object from `contour.defaultWidth / 2`", but the shown implementation calls
   `normalizeWidth(point?.width)`, which (per WS-6) falls back to the global
   `DEFAULT_SKELETON_WIDTH / 2` and ignores the `defaultWidth` argument
   entirely. Root cause is a WS-6 schema question — see Part 3, O5
   (`contour.defaultWidth` is currently dead data).
2. **Task 7 vs Task 9 rail-grep contradiction.** Task 7 deliberately puts
   `leftWidth`/`rightWidth` into the measure payload ("these names exist only
   in the measure payload"); Task 9's rail grep then searches all of
   `src-js/views-editor/src` for `leftWidth|rightWidth|...` and expects **no
   matches**. The grep fails on the code Task 7 just wrote. Rename the payload
   fields (`sideWidths: { left, right }`) or exclude `measure-interactions.js`
   in the grep — the former is cleaner.

### WS-12

1. **Selection keys embed volatile path addresses** —
   `editableGeneratedPoint/<cId>/<pId>/<side>/<pathContourIndex>/<pathPointIndex>`.
   The roadmap's C3 says selection stores *skeleton-space* addresses; the path
   part goes stale after every regeneration (guaranteed churn under the current
   WS-9 replace strategy, B3). The plan itself then needs stale-address
   fallbacks (Task 4 Step 2). Drop the path segments from the key: identity is
   `contourId/pointId/side[/role]`; the current path address is a *lookup*
   through `generated[].pointMap` at use time, not part of the key. This also
   shrinks the B1 parsing problem and removes the "selection remains stable
   across regeneration" hazard from the manual matrix.
2. `resolveGeneratedPointProvenance(skeletonData, pathPointIndex)` needs the
   path (to convert a global point index into contour + contour-local offset)
   but doesn't take it. Signature gap.

### WS-13

1. **Regular-path X-equalize is orphaned.** The donor's X worked on regular
   (non-skeleton) handles too — the plan's own Task 7 fixture list includes
   "constrains regular X-eq handles like skeleton X-eq handles" — but no task
   maps the X realtime state to a behavior name for **regular path**
   selections; Task 4's resolver only covers skeleton target kinds. Either add
   the regular-path wiring (see Part 3, O6 — it's nearly free) or record an
   explicit exclusion.
2. `applyFixedRibDelta(originalSkeletonData, workingSkeletonData, ...)` — the
   plan never says why both are needed (presumably donor math is anchored to
   drag-start geometry). One sentence in the Interfaces block prevents an
   implementer from "simplifying" it into a working-copy-only helper and
   breaking cumulative-drag behavior.
3. Bare-key realtime shortcuts `d/s/x` (+ WS-11's `z`): the plan should include
   a step verifying no collision with existing single-key actions in the
   canvas-focused key path (the measure-mode precedent suggests it's fine, but
   "verified free" belongs in Verified Current Context).

### WS-14

1. Task 1 fixtures use string ids (`"contour-a"`, `"p0"`); WS-6 ids are
   positive integers and the normalizer would reassign strings. Make fixtures
   schema-canonical or they will mask id-handling bugs.
2. Hit-test placement is left conditional ("add to scene-model *if consistent*
   with current hit APIs"). The roadmap rail is unconditional: scene-model owns
   hit testing as `*AtPoint`. Remove the escape hatch.

### WS-15

1. **Task 1 Step 3 regresses WS-6's schema constant.** The replacement block
   for `FONTRA_INTERNAL_SECTIONS` contains only `LETTERSPACER` and
   `SKELETON_DEFAULTS` — it **drops the `SKELETON` key WS-6 added**, which
   would break all skeleton persistence. The block must contain all three.
   (Classic stale-plan hazard: WS-15 was clearly drafted against the pre-WS-6
   file; its own Verified Current Context even states "only LETTERSPACER
   exists", which will be false by implementation time.)
2. **Panel icon `/tabler-icons/bone.svg` does not exist** — verified missing in
   both `src-js/fontra-core/assets/tabler-icons/` and the donor's assets. Add a
   step that vendors the SVG (or picks an existing icon); otherwise the sidebar
   tab renders a broken image.
3. Cap/corner controls target non-existent schema fields (B2).
4. The width **anchor** behavior (L/Center/R shifts the skeleton point so a rib
   endpoint stays fixed) is referenced ("translate through the core/WS-11
   anchor helper if it exists — if not, add it in Task 2") but never specified.
   That's a geometry-semantics decision (donor parity) hiding behind an "if";
   specify the donor behavior in Task 2 directly.

### WS-16

Generally the strongest plan of the set (the Step-0 verification pattern and
the honest "skeleton is not yet landed" framing should be back-ported to any
plan that gets revised). Two issues:

1. **Rib-endpoint bounds via provenance contradicts WS-11's definition of the
   gizmo.** WS-16 Task 2 forbids "re-deriving the rib endpoint by projecting
   the skeleton point" and mandates a provenance lookup into generated path
   points. But WS-11 *defines* the rib endpoint by forward projection
   (`getSkeletonRibPosition`), and forward projection from source data is not
   "geometric recovery" (C3 bans *inverse* mapping). Worse, a rib endpoint has
   no guaranteed generated on-curve twin under caps/single-sided contours. Use
   one source of truth: move the pure rib-position helper into
   `skeleton-model.js` (core) in WS-11 and let both hit-testing and
   `getSelectionBounds` call it. Provenance stays what it is for: resolving
   *generated* points back to sources.
2. **Nested `recordChanges` proxies in Task 5** (letterspacer): `editSkeleton`
   calls `recordChanges(layerGlyph, ...)`, and inside
   `editGlyphAndRecordChanges` the `layerGlyph` is already a recorder proxy.
   Verified against `change-recorder.js`: this *should* work (inner proxy
   writes through to the outer proxy, which records), but the inner collector's
   result is discarded and the double-proxying is subtle enough that the plan's
   "confirm call form in Step 0" must explicitly cover it — or `editSkeleton`
   should detect/require a raw glyph and the letterspacer should merge the
   returned collector instead.

---

## Part 3 — Architecture & optimisation opportunities

### O1. Compute rib geometry once per contour, not once per point — **WS-6, WS-8, WS-11**

`calculateNormalAtSkeletonPoint` rebuilds **all** segments of the contour for
every point queried (WS-6). WS-8 then queries it per on-curve point, per layer,
and effectively 3–4× per point per frame (width-shading + ribs +
editable-markers each call `getRibPoints`, and shading calls it twice per
segment). That's O(points²) per contour per layer per frame, with segment
construction and Bezier derivative evaluation re-done each time.

**Better:** add one core function, `computeContourRibData(contour) →
[{ point, normal, left, right, leftEditable, rightEditable }]`, that builds
segments once and walks them once. WS-8's three layers and WS-11's hit-testing
all consume it; WS-8 can memoize it per draw pass keyed on the skeleton object
identity. This deletes `getRibPoints` from the visualization module entirely
(it currently re-implements single-sided logic that belongs in core) and gives
WS-11/12 the same numbers the renderer showed — eliminating a whole class of
"hit target isn't where the pixel is" bugs.

### O2. One normalization per edit, not four — **WS-6, WS-7, WS-9**

Per drag frame, the current plans normalize (with full deep copies) in
`getSkeletonData`, again in `applySkeletonMutation`
(`normalizeSkeletonData(structuredClone(original))` — the clone of an
already-fresh copy), again inside `generateFromSkeleton` (WS-7), and again in
`setSkeletonData` (WS-6). Plus `cloneLayerGlyphForSkeletonEdit` copies the path
and customData per frame.

**Better:** make normalization a boundary operation: normalize on *read from
persistence* (`getSkeletonData`) and trust internally.
`generateFromSkeleton` gets a documented precondition ("canonical data in") or
an `{ assumeNormalized }` option used by `editSkeleton`; `setSkeletonData`
accepts the already-normalized working copy (it already deep-copies via
`setFontraInternalSection`). This removes three deep passes per frame with no
behavioral change, and makes the data-flow contract ("canonical everywhere
inside the pipeline") explicit instead of enforced by repeated re-scrubbing.

### O3. `skeletonPoint` executors: specify rule reuse once, use it three times — **WS-9, WS-11, WS-12, WS-13**

C1's whole payoff is that skeleton points get Shift/Alt/D/S/X semantics from
the *existing* rules tables. The plans currently distribute this across WS-9
(unspecified, see WS-9 finding 2), WS-11 (rib executors with hand-rolled
behavior names), and WS-13 (new pure helpers). Once WS-9 defines the "synthetic
contour → rules matcher → action factories → working copy" bridge concretely,
WS-13's skeleton-handle equalize is *already expressible* as a rules-table
behavior (see O6) and WS-11/12's on-curve interactions reuse the same bridge.
Writing the bridge down once, in WS-9, with a unit-testable pure core function
(`applyPointBehaviorToSkeletonContour(contour, selectedIds, behaviorName,
transform)`) turns three plans' vague references into one tested seam.

### O4. Don't build a second segment builder — **WS-14 (vs WS-6)**

WS-14 Task 1 creates `buildSkeletonTunniSegments(contour)` in a new
`skeleton-tunni.js`, "porting donor `buildSegmentsFromSkeletonPoints`
semantics" — but WS-6 already ported exactly that function into
`skeleton-model.js`. Two segment walkers over the same schema is a P4-class
duplication the roadmap's rail 9 explicitly forbids ("if a symbol you need
exists anywhere in forkra, import it"). Extend WS-6's builder to also emit
point ids/indices on the segment records (WS-14 needs them; WS-6's tests
already assert `startPoint.id`), and let `skeleton-tunni.js` contain only the
Tunni-specific math. Same instinct applies to the midpoint/true-Tunni drag
formulas WS-14 keeps "local": if they are the same projections
`tunni-interactions.js` applies to regular paths (they read like it), extract
them into `tunni-calculations.js` (core) and parameterize by sink — that *is*
C4, and it prevents regular/skeleton Tunni drift.

### O5. Decide what `contour.defaultWidth` means — currently it's dead data — **WS-6, WS-8, WS-11, WS-15**

WS-6's `normalizeSkeletonPoint` materializes a `width` object on **every**
on-curve point using the *global* `DEFAULT_SKELETON_WIDTH`, and
`getSkeletonPointHalfWidth(point, defaultWidth, side)` ignores its
`defaultWidth` argument for side lookups (the normalized width always exists).
Net effect: `contour.defaultWidth` influences nothing, yet WS-8 threads it
through every call, WS-11's tests expect width init from it, and WS-15 gives it
a panel field that "must regenerate outlines". Two coherent options:

- **Sparse widths:** `point.width` becomes optional; absent means "use
  `contour.defaultWidth / 2`". Normalization stops materializing it; the
  helpers' `defaultWidth` parameter becomes load-bearing. This matches the
  donor's mental model (a contour-wide stroke width with per-point overrides)
  and makes the WS-15 contour-default edit actually do something.
- **Dense widths:** keep materialization, delete `contour.defaultWidth` from
  the schema, and make the WS-15 control a bulk "set all point widths" action.

Either is fine; the current half-and-half state means WS-11 Task 1 and WS-15
Task 8 are specified against behavior that cannot happen.

### O6. Skeleton equalize can ride the existing rules table — **WS-13**

Verified: forkra's `edit-behavior.js` already contains the `Equalize` action
factory and equalize-flavored rules (inside `alternateRules`, line ~1319), plus
`RotateNextEqualLength`. If WS-9's rule-reuse bridge (O3) exists, donor
X-equalize for *skeleton handles* is expressible as a new behavior name
(`equalize`/`equalize-constrain` rule sets reusing the existing action
factories) rather than the parallel pure-helper implementation WS-13 Task 3
builds — and, crucially, the **same** behavior name wired into the pointer's
`getBehaviorName` gives regular-path X-equalize for free, closing the WS-13
finding-1 gap with near-zero extra code. Keep WS-13's pure helpers only for
the two things genuinely outside the path model: fixed-rib (width math) and
editable-generated handle offsets. This is precisely the roadmap's P5 lesson
("expressed inside the rules model, never regressed") applied one level deeper
than the plan currently goes.

### O7. Persisting `pointMap` in customData: reconsider before WS-9 lands — **WS-6, WS-9, WS-12**

The schema stores each generated contour's full `pointMap` in
`customData["fontra.internal"].skeleton.generated[]`, rewritten on every edit.
For a real glyph this is hundreds of small objects serialized into every
change, every undo record, and every file save — while being pure derived data
the generator re-emits for free on the next regeneration. The roadmap (§5)
already anticipated this: "pointMap may alternatively live in a scene-side
cache". Given B3's fix keeps `pathContourIndex` stable, the persistent schema
only needs `{ skeletonContourId, pathContourIndex }` per generated contour; the
pointMap can live in a per-glyph cache keyed by layer, refreshed by
`editSkeleton` and on glyph load (one regeneration — cheap and, by C3,
authoritative). That halves the churn in the hot write path and keeps file
sizes proportional to source data, not derived data. If the team prefers the
simplicity of persisting it, at least strip `pointMap` from undo-relevant
change objects being equal each frame is not guaranteed — measure before
deciding, but decide in WS-9, not after WS-12 has baked it into selection
resolution.

### O8. WS-8 reads (and normalizes) skeleton data per layer per frame — **WS-8**

`getSkeletonDataFromGlyph` → `getSkeletonData` normalizes and deep-copies the
whole skeleton on every draw of every one of the six layers. Combined with O1
this is the rendering hot path. A one-line memo (cache normalized result keyed
on the raw customData object identity — it's replaced wholesale by
`setFontraInternalSection`, so identity is a valid cache key) removes ~6 deep
copies per frame without any invalidation subtlety.

### O9. Plan-mechanics: later plans regressed the discipline of earlier ones — **WS-11…WS-15**

Two patterns worth fixing while the plans are still documents:

- **`git add .` in commit steps** (WS-11 onward) versus WS-6…10's explicit file
  lists. On a real working tree `git add .` sweeps in unrelated state; the
  roadmap's "one concern per commit" rule is enforced by explicit paths.
- **WS-16's Step-0 pattern should be retrofitted.** WS-11…15 all consume
  WS-9/10 interfaces that don't exist yet, and their "Verified Current
  Context" sections will be stale by implementation time (WS-15's already
  contains a claim — "only LETTERSPACER exists" — that its own prerequisite
  invalidates, and it caused finding WS-15/1). A leading "grep the landed
  symbols, fail loudly if they differ" step per task is cheap insurance the
  roadmap's rule #1 already demands.

---

## Summary priority list

| # | Finding | WS | Severity |
|---|---------|----|----------|
| B1 | `parseSelection` drops compound-key segments; `.size` on arrays | 9–16 | Blocker |
| B2 | Cap/corner fields absent from schema; WS-7 golden master fails | 6,7,8,15 | Blocker |
| B3 | Delete+append regeneration: drag corruption, index churn, breaks interpolation | 9,12,16 | Blocker |
| B4 | Cross-layer id lockstep never established | 9–15 | Blocker (design decision) |
| WS-6/1 | Rib nudge test/impl sign contradiction | 6 | High |
| WS-15/1 | `FONTRA_INTERNAL_SECTIONS` block drops `SKELETON` | 15 | High |
| WS-7/1 | Fixture-script donor import path off by one | 7 | High |
| WS-9/1,2 | Key parse asymmetry; rules-reuse step is a placeholder | 9 | High |
| WS-12/1 | Path indices inside selection identity (violates C3) | 12 | High |
| WS-11/2 | Rail grep contradicts measure payload | 11 | Medium |
| WS-13/1 | Regular-path X-equalize unwired | 13 | Medium |
| WS-16/1 | Rib bounds via provenance vs projection — unify in core | 11,16 | Medium |
| WS-15/2 | Missing `bone.svg` asset | 15 | Low |
| O1–O8 | Perf/unification improvements (rib data, normalization, rules bridge, segment builder, defaultWidth, equalize-in-rules, pointMap persistence, render memo) | various | Design |
