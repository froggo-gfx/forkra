# Skeleton Feature — Mental Model & Code-Level Optimization Review

Date: 2026-07-03
Subject: the skeleton **feature code itself**, as it exists in the donor
checkout (`./skeleton/` at `fd76d3abe`). This is not about the porting plans
(see `PLANS-OPTIMISATION.md` for those); it is a model of what the code
actually does, built from reading it, with line references — and then
recommendations for optimizing the feature, independent of where it lives.

File inventory (all paths relative to `skeleton/src-js/`):

| File | Lines | Role |
|---|---|---|
| `fontra-core/src/skeleton-contour-generator.js` | 3,918 | outline generation, persistence, normals |
| `views-editor/src/edit-tools-pointer.js` | 7,496 | all drag/nudge/modifier interaction (skeleton parts ~4,500 lines) |
| `views-editor/src/skeleton-edit-behavior.js` | 1,615 | skeleton copy of the point-behavior rules engine + rib behaviors |
| `views-editor/src/edit-tools-skeleton.js` | 1,490 | Skeleton Pen drawing tool |
| `views-editor/src/skeleton-visualization-layers.js` | 1,086 | 9+ canvas layers |
| `views-editor/src/panel-skeleton-parameters.js` | 6,951 | numeric editing panel (128 methods) |
| `views-editor/src/skeleton-tunni-calculations.js` | 425 | Tunni math on skeleton segments |
| `views-editor/src/skeleton-source-defaults.js` | 151 | per-source default widths/caps |

---

## 1. What the feature is

Stroke-based glyph design. Instead of drawing filled outlines directly, the
designer draws **centerline contours** ("skeletons") — ordinary point/handle
paths — and attaches a **stroke width** to each on-curve point. The system
generates the filled outline contours live: every edit to the skeleton
regenerates the outline. The generated contours are ordinary path contours in
the glyph (they export, interpolate, and render like hand-drawn ones); the
skeleton itself lives in `customData["fontra.internal"].skeleton` and is
invisible to any consumer that doesn't know about it.

Everything else in the feature is elaboration of that one idea:

- **Ribs** — the width at a point, visualized as a bar across the centerline;
  draggable at both endpoints.
- **Caps** — how open stroke ends are closed (butt / round / square, each
  parameterized).
- **Corner rounding** — sharp outline corners produced by non-smooth skeleton
  points can be rounded, per point, asymmetrically per side.
- **Editable generated geometry** — individual generated outline points and
  handles can be marked editable and offset from their computed positions
  (nudges, handle offsets, detached handles), while remaining *generated*.
- **Single-sided contours** — all width pushed to one side of the centerline
  (the other side lies exactly on the skeleton).
- **Modifier behaviors** — D (fixed-rib), S (fixed-rib-compress), X
  (equalize), Z (tangent-only rib drag) held as realtime keys during drags.
- **Tunni points** on skeleton curve segments.
- **Per-source defaults** — new points inherit widths/caps from source-level
  settings, keyed by glyph case (uppercase/lowercase).

## 2. The data model

From `normalizeSkeletonContour` / `normalizeSkeletonPoint`
(`skeleton-contour-generator.js:3545-3614`):

```
skeletonData = {
  version, contours: [...], generatedContourIndices: [int]   // derived, tracked
}
contour = {
  isClosed, points: [...],
  defaultWidth (80), capStyle ("butt"|"round"|"square"),
  capRadiusRatio, capTension, capAngle, capDistance, defaultDistribution
}
point (on-curve) = {
  x, y, smooth,
  width,                    // symmetric total width
  leftWidth, rightWidth,    // optional per-side half-width overrides
  leftNudge, rightNudge,    // tangent displacement of rib endpoints
  leftEditable, rightEditable,
  capStyle + cap params,    // per-endpoint override of contour cap
  cornerRoundness, cornerAsymmetry, cornerReach, roundnessStrength,
  forceHorizontal, forceVertical,          // rib angle overrides
  leftHandle{In,Out}Offset{X,Y}, leftHandleDetached, (…right…)  // generated-handle edits
}
point (off-curve) = { x, y, type: "cubic" }
```

The width of a side is a **fallback cascade**, not a stored value — see
`getPointHalfWidth` (`:68`) and `RibEditBehavior`'s constructor
(`skeleton-edit-behavior.js:897-905`):

```javascript
halfWidth = point.leftWidth ?? point.width / 2 ?? contour.defaultWidth / 2
```

This matters: a point with no width fields at all is a *live consumer* of the
contour default — change `defaultWidth` and un-overridden points follow. (The
forkra port's WS-6 normalization currently materializes widths on every point,
which silently kills this behavior — flagged as O5 in `PLANS-OPTIMISATION.md`.)

`generatedContourIndices` is the only link from skeleton to its generated path
contours, and it is maintained by hand at every mutation site — the feature's
known weak point (two of the three post-refactor bug fixes patch exactly this).

## 3. The generation pipeline — life of one skeleton contour

`generateOutlineFromSkeletonContour` (`skeleton-contour-generator.js:1118-1807`)
is a six-stage pipeline. For a concrete picture, take an open, curved skeleton
of 3 on-curve points A–B–C with cubic handles between them, widths 40/60/40:

**Stage 1 — segmentation.** `buildSegmentsFromPoints` (`:1829`) splits the
point list into on-curve→on-curve segments, each carrying its off-curve control
points. Here: `[A→B, B→C]`.

**Stage 2 — per-segment offsetting.** `generateOffsetPointsForSegment`
(`:2297`) produces the left- and right-side outline points for one segment.

- *Line segments* (`:2358-2443`): endpoints are projected along the normal by
  each side's half-width; where two segments meet, `calculateCornerNormal`
  (`:2971`) computes a miter-style bisector normal so both segments share one
  rib direction. `projectPoint` (`:2348`) rounds to the UPM grid immediately.
- *Cubic segments* (`:2444-2962`) are the interesting case, and the source of
  most of the file's complexity:
  1. Offset the curve with **bezier-js** at the *average* of the start/end
     half-widths: `bezier.offset(-avgLeftHW)` / `offset(avgRightHW)` (`:2486`).
     bezier-js internally splits the curve into "simple" sub-curves and offsets
     each, so this returns 1–N curves per side.
  2. `simplifyOffsetCurves` (`:2183`) collapses those N curves back into ONE
     cubic: sample 5 points per sub-curve (`SAMPLES_PER_CURVE`, `:311`), then
     run `fitCubic` in an **adaptive-tolerance loop** — 2% of halfWidth, then
     4%, … up to 15% (`:2229-2243`) — accepting the first fit whose measured
     error passes.
  3. **Pin the endpoints**: the fitted curve was built at *average* width, so
     its endpoints are wrong wherever widths vary. The code computes exact rib
     endpoints (`fixedStartLeft` etc., `:2491-2501`, including nudges via
     `applyNudgeToRibPoint` `:172`) and *translates the fitted handles* by the
     endpoint correction (`:2599-2620`).
  4. Apply user handle offsets for editable sides
     (`applyHandleOffsetToControlPoint` `:255` — 2D offsets, legacy 1D offsets,
     and detached-absolute mode).
  5. **Stabilize**: `lockNearZeroHandleDirection` (`:2090`) prevents handles
     shorter than 1.25 units from flipping 180° across their anchor (this is
     the cherry-picked `c2cd2ce51` fix territory); everything is then rounded
     to the grid again (`:2701-2708`).
  - A side whose half-width is < 0.5 ("collapsed", e.g. single-sided) skips all
    of this and copies the skeleton geometry verbatim (`:2523-2551`).

**Stage 3 — corner rounding.** `roundSharpCornersOnSide` (`:739-1080`).
Corner metadata rides along on generated on-curve points — `buildGeneratedOnCurve`
(`:103`) stamps `cornerRoundness` / `cornerRoundBase` / `cornerAsymmetry` from
the source skeleton point. For each non-smooth generated corner the function
computes trim distances along both incoming/outgoing directions (bounded by
`cornerReach` and neighboring handle lengths), a circular-arc radius from the
corner angle, and replaces the corner point with two on-curves plus cubic
handles using the standard `kappa = 4/3·tan(β/4)` arc approximation (`:887`).
When two rounded corners share a segment, a pairwise pass (`:909-…`) shrinks
both trims so they can't overlap. `stripCornerRoundMetadata` (`:136`) removes
the metadata before output.

**Stage 4 — caps** (open contours only, `:1292-1775`). Three styles:

- *butt*: `generateCap` (`:3217`) — essentially connects the two side ends.
- *round* (`:1305-1479` for start, `:1540-1716` for end — two near-identical
  ~170-line mirror-image blocks): builds a "shelf" cap from four points (two
  projected side points + two tip points shifted along the normal by
  `capRadiusRatio`), with cubic handles whose lengths come from
  `computeTunniHandleLengths` (`:3186`) at `capTension`.
- *square* (`:1480-1527` / `:1717-1764`): appends one extra shifted point per
  side, implementing `capAngle` (slant) and `capDistance` (extension).

**Stage 5 — assembly** (`:1777-1806`): `left + endCap + reversed(right) +
startCap` → one closed contour. Closed skeletons instead produce **two**
contours — left side and reversed right side (`:1226-1263`) — outer and
counter-wound inner.

**Stage 6 — smoothing.** `enforceSmoothColinearity` (`:335-527`) walks the
assembled points and re-collinearizes handle pairs around smooth on-curves
(length-weighted average direction, rotation capped at 60°, near-zero handles
left alone), including smooth-into-line pivot cases.

Two things are notable about the pipeline as a whole:

- **It is per-contour and pure.** `generateContoursFromSkeleton` (`:1080`) is
  just a loop; contour i's output depends only on contour i's input. (This
  independence is completely unexploited by the callers — see R2.)
- **Grid rounding happens at every stage**, not once at the end — projection
  (`:2352`), nudge (`:195`), handle adjustment (`:2701`), caps, corner
  rounding. Several of the defensive mechanisms (near-zero handle locks,
  colinearity re-enforcement, `minReliableHandleLength`) exist substantially
  to cope with error introduced by this early quantization.

## 4. Regeneration and persistence — life of one drag frame

`regenerateSkeletonContours` (`:3738-3821`) is the write-side entry: generate
all contours, then update the glyph path by one of three strategies:

1. `preferInPlace` (`:3755-3779`): if point counts match, write coordinates
   with `setPointPosition` — indices stable, changes tiny;
2. replace-at-indices (`:3781-3796`): `deleteContour(i)` + `insertContour(i)`
   per contour — indices stable, changes are whole packed contours;
3. rebuild (`:3798-3814`): delete all, re-insert at the lowest old index.

**Only 3 of the 32 call sites pass `preferInPlace: true`** (verified:
`edit-tools-pointer.js:1366, 2710, 5476`). The main skeleton-point drag loop
does not.

That drag loop, `_handleDragSkeletonPoints` (`edit-tools-pointer.js:2955-3185`),
is the canonical interaction and worth tracing end to end. Per **drag session**:
two `JSON.parse(JSON.stringify(skeletonData))` clones per layer (`:2986-2987`)
plus a behavior set (`createSkeletonEditBehavior`,
`skeleton-edit-behavior.js:816`). Then per **mousemove frame**, per layer:

```javascript
// edit-tools-pointer.js:3086-3171 (abridged)
reset working coords from original                 // :3087-3094
applyFixedRibDragToSkeletonData(...)               // D/S mode, :3096
behaviors[i].applyDelta(delta, roundFunc)          // rules-driven moves, :3113
inline X-equalize mirror                           // :3123-3152
pathChange = recordChanges(staticGlyph, (sg) =>
  regenerateSkeletonContours(sg, working));        // :3157  ← no preferInPlace
customDataChange = recordChanges(layer, (l) =>
  setSkeletonData(l, JSON.parse(JSON.stringify(working))));  // :3163
accumulatedChanges = accumulatedChanges.concat(combinedChange);  // :3171
await sendIncrementalChange(combinedChange.change, true);
```

So each frame costs: full regeneration of **every** skeleton contour (stage
1–6 above, including bezier-js offsets and up to 7 `fitCubic` attempts per
side per cubic segment), a delete+insert change containing every packed
generated contour, a full deep clone + `normalizeSkeletonData` (which itself
does `JSON.parse(JSON.stringify())` inside `stripDerivedSkeletonFields`,
`:3628`) written into customData, and — critically — **the undo record grows
by the whole frame's change**: `accumulatedChanges.concat(...)` per frame
means a 300-frame drag stores 300 copies of contour-replacement changes in the
undo stack (`:3169-3176`).

## 5. The interaction model

**A parallel rules engine.** `skeleton-edit-behavior.js` duplicates upstream
`edit-behavior.js` wholesale for skeleton contours: the same `actionFactories`
(`:55`), the same four rule tables (`defaultRules :297`, `constrainRules :346`,
`alternateRules :362`, `alternateConstrainRules :404`), the same
`buildPointMatchTree` compilation (`:414-417`). Shift/Alt pick the table
(`getSkeletonBehaviorName :857`). This is why skeleton point dragging *feels*
identical to path point dragging — it literally runs a copy of the same rules.
The cost is 1,615 lines of drift-prone duplication (the copies were already
one refactor-cycle apart from upstream when the donor was frozen).

**Ribs.** Three behavior classes in the same file express the width-editing
semantics:

- `RibEditBehavior` (`:866`): non-editable side — the drag delta is projected
  onto the rib normal, `newHalfWidth = originalHalfWidth + sign·(delta·normal)`
  (`:932-953`). Nothing else moves.
- `EditableRibBehavior` (`:993`): editable side — the normal component still
  edits width, the tangential component edits `leftNudge`/`rightNudge`; it
  also snapshots handle offsets so generated handles stay put while the rib
  endpoint moves (`_initHandleOffsets`, `:1045`). Z (tangent mode) locks the
  width component.
- `InterpolatingRibBehavior` (`:1229`): Alt-drag — changes width while
  interpolating the *neighboring generated handles* along an axis built from
  the current generated path (`_buildRibInterpolationAxis`,
  `edit-tools-pointer.js:3647`).

**Editable generated geometry** is where the architecture is weakest: the user
selects an ordinary generated *path* point, and
`_getEditableGeneratedPointsFromSelection` (`edit-tools-pointer.js:3616`)
reverse-maps it to a skeleton (contour, point, side) by re-projecting every
rib and comparing coordinates; `_findHandlesForRibPointFromSkeleton` (`:3722`)
does a tolerance search to find which generated handles belong to a rib point.
Geometric identity recovery — this is the class of code the forkra port
replaces with forward provenance.

**Modifiers.** X/D/S/Z are realtime key states on the pointer (constants at
`edit-tools-pointer.js:96-99`). D/S bypass the rules engine entirely via
`applyFixedRibDragToSkeletonData` (`:392`) — move the clicked on-curve along
the drag while re-anchoring one rib side and optionally scaling neighbor
handles. X is an inline special case *inside* the drag loop (`:3123-3152`)
that mirrors the opposite handle around a smooth point — the "equalize side
channel" that regressed five times during the donor's refactor era.

**Tunni on skeleton** (`skeleton-tunni-calculations.js`): a small, clean,
pure module — midpoint Tunni (`calculateSkeletonTunniPoint :102`), true Tunni
intersection (`:120`), drag mappings (`:141`, `:232`), equalize (`:346`). It
has its own `buildSegmentsFromSkeletonPoints` (`:26`) — the third copy of
segmentation logic in the feature (generator `:1829`, drawing tool inline).

**Drawing tool** (`edit-tools-skeleton.js`): hover/hit-tests the centerline by
brute-force closest-point search (`_hitTestSkeletonCenterline :637` with
`_pointToBezierDistance :810` — Bezier `project()` per segment per mousemove),
inserts points by de Casteljau split (`_splitClosingSegmentBezier :1408`),
seeds new points from source defaults (`_getDefaultSkeletonWidth :176`,
distribution `:198`, caps `:212`).

**Rendering** (`skeleton-visualization-layers.js`): nine layers (centerline
`:145`, ribs `:174`, rib endpoints `:259`, nodes `:406`, handles `:446`,
selection `:512`/`:606`, insert-preview `:739`, handle labels `:879`, Tunni
`:1014`). The rib layers call `calculateNormalAtSkeletonPoint(contour, i)` per
on-curve point per frame (`:203`, `:312`) — and that function **rebuilds all
segments of the contour and up to two Bezier objects on every call**
(`skeleton-contour-generator.js:3371-3423`). With the panel
(`_getRibPointPosition`, `panel-skeleton-parameters.js:2550`) and the
pointer's hit tests calling the same function, normals for a contour of n
points are computed O(n²)-ish several times per rendered frame.

**Panel** (`panel-skeleton-parameters.js`, 6,951 lines / 128 methods): width,
total width, distribution (left/right ratio as −100…100), width anchor (keep
left/right rib fixed while width changes — `_applyWidthAnchorTranslation
:2212`), profiles ("Set Global" writes back into source defaults, `:3041`),
cap and corner parameter editing, editable-rib management. Every setter is a
hand-rolled variant of the same read-selection → mutate → `setSkeletonData` →
`regenerateSkeletonContours` sequence.

## 6. Optimization recommendations

Ordered by expected impact. R1–R3 are performance; R4–R6 are
simplification-with-performance-benefits; R7–R9 are code-size/duplication.

### R1 — Fix the drag-frame write path (biggest win, smallest risk)

Four independent fixes to `_handleDragSkeletonPoints` and its siblings, each
observable on any glyph with a few skeleton contours:

1. **Pass `preferInPlace: true` at line 3158.** The fast path already exists
   and is proven (three call sites use it). During a coordinate drag, point
   counts never change, so every frame would take the `setPointPosition` route
   instead of delete+insert of packed contours. One-line change per call site.
2. **Regenerate only dirty contours.** Generation is per-contour and pure
   (`generateContoursFromSkeleton :1080` is a plain loop). A drag touches a
   known set of skeleton contour indices (derivable from the selection), yet
   every frame regenerates *all* contours — the untouched letter-skeleton
   parts pay the full bezier-offset + fitCubic cost for nothing. Thread a
   `dirtyContourIndices` set through `regenerateSkeletonContours` and reuse
   the previous output for clean contours. On a glyph with k of n contours
   being edited this is an n/k speedup of the dominant cost.
3. **Stop accumulating per-frame changes into undo** (`:3169-3176`). The undo
   record for a drag needs exactly two things: the rollback (state before the
   drag — capturable once at drag start) and the final state. The current
   `accumulatedChanges.concat(...)` per frame makes undo memory and
   apply-time linear in mousemove count. Fontra's own path-drag pattern
   (rollback once + absolute per-frame changes, final change only in the
   return) is the model.
4. **Write customData once, at drag end.** `setSkeletonData` per frame
   (`:3163`) deep-clones and normalizes the entire skeleton (normalization
   itself contains another `JSON.parse(JSON.stringify())`, generator `:3628`)
   and ships it in every incremental change. Nothing consumes intermediate
   skeleton states — the canvas renders from the working copy and the path.
   Record the customData change once at mouseup.

### R2 — Simplify the cubic offset pipeline

The per-cubic-segment cost chain is: `bezier.offset(avg)` (internal reduce +
scale, allocating N sub-curves) → 5·N samples → up to **7** `fitCubic`
attempts in the adaptive-tolerance loop (`simplifyOffsetCurves :2229-2243`),
each followed by `computeMaxError`. Two levels of fix:

- *Cheap:* replace the escalating loop with a single `fitCubic` call at
  `maxError` (15%) followed by acceptance — or at most two calls (strict, then
  lenient). The loop's only effect over a single lenient fit is possibly
  choosing a marginally tighter curve; measure whether that is ever visible at
  UPM resolution before paying 7×.
- *Structural:* offset the **variable-width** curve directly instead of
  offsetting at average width and then pinning endpoints. Sample the exact
  target directly — `point(t) + normal(t) · lerp(w_start, w_end, t)` — and fit
  once. The entire pin-and-warp block (`:2599-2620`), and a good part of the
  near-zero-handle defenses (`:2646-2708`), exist to repair the discrepancy
  between the averaged offset and the true endpoints; generating the right
  curve in the first place removes the repair. This also deletes the
  dependency on bezier-js `offset()` in the hot path (its `reduce()` is the
  single most expensive primitive in the pipeline).

### R3 — Compute rib geometry once per contour

`calculateNormalAtSkeletonPoint` (`:3355`) rebuilds all segments and
constructs Bezier objects **per point queried**, and is called per point, per
consumer (ribs layer `skeleton-visualization-layers.js:203`, rib-points layer
`:312`, panel `:2550`, pointer hit tests `:6338/:6475`), per frame. Replace
with a bulk `computeContourRibData(contour)` that builds segments once, walks
them once, and returns `{point, normal, leftPos, rightPos}` per on-curve —
plus a per-frame memo keyed on the skeleton object identity (skeleton objects
are replaced wholesale by `setSkeletonData`, so identity is a valid cache
key). This collapses an O(n²)×consumers pattern to O(n) once, and as a bonus
gives every consumer (renderer, hit test, panel, bounds) *identical* rib
coordinates — eliminating the "hit target isn't where the pixel is" bug class.
The same bulk structure should absorb the three independent copies of
segmentation (`buildSegmentsFromPoints` generator `:1829`, Tunni `:26`,
drawing-tool inline walks).

### R4 — Round once, at the boundary

Grid quantization is applied at every intermediate stage: rib projection
(`projectPoint :2352`), nudges (`:195`), adjusted handles (`:2701`), cap
points, corner-rounding outputs. Early rounding is why 1-unit handles can flip
across their anchors, which is why `lockNearZeroHandleDirection` (`:2090`),
`NEAR_ZERO_*` constants (`:317-320`), `minReliableHandleLength` in
`enforceSmoothColinearity` (`:343`), and the 35°-rotation clamp exist. Keep
the pipeline in floats and round exactly once in
`outlineContourToPackedPath` (`:3459`) — endpoint/rib positions that must be
grid-exact (they're user-visible edit targets) can be rounded at computation
*and preserved*, but interior handles gain nothing from intermediate
quantization. Expected result: several defensive subsystems shrink or become
dead code, and generated curves get smoother for free.

### R5 — Delete the dead weight in the generator

Verified dead or disabled code that costs complexity (and some of it costs
runtime):

- `alignHandleDirections` (`:536-687`, ~150 lines): disabled at both call
  sites with `// DISABLED for performance testing - alignHandleDirections is
  O(n³)` (`:1232-1234`, `:1787-1788`). Either it matters (then it needs an
  O(n) rewrite) or it doesn't (delete it). It has been off since before the
  freeze; nobody missed it.
- `stabilizeSingleCubicHandles` (`:1993-2090`) behind
  `ENABLE_EXPERIMENTAL_HANDLE_STABILIZATION = false` (`:322`) — plus the
  branch that calls it (`:2679-2698`).
- The `mergeCap` branches in both round-cap blocks are dead: `const mergeCap =
  false;` (`:1329`, `:1564`) makes `if (mergeCap)` (`:1395-1432`,
  `:1632-1669`) unreachable — ~80 lines × 2.
- **Debug logging allocates even when disabled**: the ~40-field payload
  objects passed to `logSkeletonDebug` are constructed eagerly at the call
  sites (`:2710-2769` is one, built per segment side per frame) before the
  function checks whether logging is on (`shouldLogSkeletonDebug :1906`).
  Guard with `if (getSkeletonDebugState().enabled)` at the call site or make
  the payload a closure. In the drag hot path this is pure garbage-collector
  pressure.
- `generateSampledOffsetPoints` (`:3846-3918`) has no callers in the editor
  (the visualization layers don't import it) — debug leftover.

### R6 — Make round/square caps one function each

The round-cap builder is duplicated as two ~170-line mirror-image blocks
(start `:1305-1479`, end `:1540-1716`) whose only differences are sign
conventions (`tOut`, cap direction flip `:1573`) and left/right ordering. The
square-cap builder is duplicated the same way (`:1480-1527` / `:1717-1764`).
Extract `buildRoundCap(sideEnds, tangent, params, isStart)` /
`buildSquareCap(...)`. Beyond the ~350 saved lines, this is a correctness
guard: the two copies already show micro-divergence in how they set
`smooth`/`skipColinear` flags, which is exactly how end-cap-only bugs are
born.

### R7 — Unify the duplicated rules engine

`skeleton-edit-behavior.js:55-441` is a copy of upstream `edit-behavior.js`'s
action factories and rule tables, differing only in that it walks skeleton
contours instead of `instance.path`. Any upstream rule fix bypasses skeletons
and vice versa. The clean fix is to parameterize by *input adapter* (a packed
path built from skeleton points) rather than duplicating the tables — which is
precisely what the forkra port's WS-9 does with the synthetic-`VarPackedPath`
target entry, so for the port this recommendation is "keep that design"; for
the donor codebase in isolation it would be the highest-value refactor.
The rib behaviors (`RibEditBehavior` etc.) are *not* duplication and should
stay — they encode genuinely skeleton-specific semantics.

### R8 — Replace geometric reverse-mapping with forward provenance

`_getEditableGeneratedPointsFromSelection` (`edit-tools-pointer.js:3616`),
`_findHandlesForRibPointFromSkeleton` (`:3722`), and
`_findAdjacentHandlesForRibPoint` (`:3895`) all recover "which skeleton point
does this generated point come from" by re-projecting ribs and comparing
coordinates with tolerances. Aside from fragility (coincident points,
symmetric shapes), this re-runs projection math per hit test. The generator
*knows* the mapping when it emits each point (`buildGeneratedOnCurve` `:103`
already attaches per-point metadata for corner rounding — the same channel
could carry source identity). Emitting `{sourcePointIndex, side, role}` per
generated point and storing it beside `generatedContourIndices` deletes all
three functions and their bug class. (This is the port's C3; stated here
because it is also simply the right fix for the donor code.)

### R9 — Move X-equalize and D/S inside the behavior model

X-equalize lives as an inline branch of the drag loop
(`edit-tools-pointer.js:3123-3152`), plus separate arrow-key variants
(`_handleArrowKeysForEqualizeSkeletonHandles :5402`,
`…ForEqualizePathHandles :5501`) and a separate drag session
(`_handleEqualizeHandlesDrag :5588`). D/S are a pre-emption of the behavior
result (`:3096-3121`). Each of these is a second code path that must
re-implement working-copy reset, rounding, regeneration and undo — and the
equalize path regressed five times in the donor's own history precisely
because tests exercised the behavior engine while the feature lived outside
it. Expressing them as behavior names/rule variants (as the rules engine
already does for Alt — `alternateRules` contains an `Equalize` action
upstream) removes the parallel plumbing. (Port plans WS-13 already commit to
this; same rationale.)

### R10 — Panel: data-driven parameter descriptors

128 methods, most of which are one of two shapes: "summarize field F across
selection (mixed/uniform)" or "set field F across selection with undo label
L". A descriptor table (`{key, get, set, clamp, label, widget}`) driving a
generic summarize/apply pair would collapse an estimated 2,500–3,500 of the
6,951 lines and make adding a parameter a one-line change. The width-anchor
translation (`_applyWidthAnchorTranslation :2212`) and profile logic are the
only genuinely bespoke parts.

---

## 7. What is genuinely good and should be preserved

Worth saying explicitly, because a rewrite that loses these regresses the
product:

- **The width fallback cascade** (point override → symmetric width → contour
  default) — cheap, expressive, and what makes "change the stroke weight of
  this whole contour" a one-field edit.
- **Corner metadata riding on generated points** (`buildGeneratedOnCurve
  :103` → `roundSharpCornersOnSide :739`) — a clean way to let a per-skeleton-
  point parameter act at the right place in outline space, after both sides
  exist. The same channel is the natural carrier for provenance (R8).
- **The collapsed-side rule** (`:2523`): a side under 0.5 units lies *exactly*
  on the skeleton — this identity is what makes single-sided contours and
  open-counter constructions predictable.
- **`preferInPlace` regeneration** (`:3755`) — the right mechanism, merely
  under-used (R1.1).
- **The rules-tables interaction feel** — skeleton points behaving exactly
  like path points under Shift/Alt is the feature's best UX decision; R7 is
  about achieving it without a fork, not about changing it.
- **Pairwise corner-trim limiting** (`:909`) — prevents adjacent rounded
  corners from eating each other; easy to lose in a reimplementation.
