# Plan: regular-contour S/D drag via shared normal-offset scalar

## 1) Brief summary
We want to bring the same editing principle used by skeleton S/D drag to regular contours, but with regular-contour semantics:

1. `S` and `D` are aliases for the same mode for regular contours.
2. There is no fixed-rib distinction for regular contours.
3. The drag is always initiated on one clicked selected point.
4. The drag delta projected onto that clicked point's normal defines one shared signed scalar.
5. Every other selected regular on-curve point uses that same scalar, but applies it along its own local normal.
6. Handle angles must stay fixed.
7. Handle lengths should be recomputed with the same tension-preserving principle used by skeleton fixed-rib drag.

This is not a contour-wide geometric offset tool and not a BezierJS refit feature for v1.

It is also explicitly not fixed-rib drag for regular contours.

That means:

1. regular-contour `S` / `D` drag must not reuse skeleton fixed-rib routing semantics
2. regular-contour `S` / `D` drag must not be modeled as a fake "fixed rib" mode with no rib
3. regular-contour `S` / `D` drag may reuse only reconstruction principles from skeleton code, not the fixed-rib feature contract itself

The shipping implementation should adapt the existing regular drag/scaling path and reuse only the handle-reconstruction principles from the skeleton implementation.

---

## 2) Architecture constraints from target architecture

This plan must follow `docs/refactor/target-architecture.md`.

Mandatory constraints:

1. Keep the pipeline as `Pointer -> Composer -> Adapter -> Storage`.
2. Do not reintroduce pointer-owned execution for the new regular S/D mode.
3. Do not put persistence logic into `edit-behavior.js`.
4. Do not put modifier mapping or routing logic into adapters.
5. Keep canonical point-like behavior math in existing files only.
6. Do not create new source files for this chapter.
7. Before implementation, declare the target source files and keep the work inside them.
8. Do not repurpose skeleton fixed-rib routing rows or semantics as the regular-contour implementation surface.

Target source-file ownership for this feature:

1. `src-js/views-editor/src/edit-behavior-registry.js`
   Purpose:
   declare how regular `S` / `D` drag maps into canonical routing/preset resolution.
2. `src-js/views-editor/src/edit-behavior-composer.js`
   Purpose:
   keep orchestration uniform if a new canonical route or route metadata is needed.
3. `src-js/views-editor/src/edit-behavior.js`
   Purpose:
   own pure regular normal-offset behavior math and pure reconstruction helpers.
4. `src-js/views-editor/src/edit-behavior-adapters.js`
   Purpose:
   translate regular behavior output into path mutations and own persistence.
5. `src-js/views-editor/src/edit-tools-pointer.js`
   Purpose:
   transport only; it may expose existing mode state and clicked-point transport, but must not execute the feature.

Implementation rule:

1. If helper extraction is needed, add helpers to one of the existing files above.
2. Do not create a new `regular-normal-drag.js`, `regular-offset-utils.js`, or similar sidecar.

---

## 3) Core behavior contract

### 2.1 Triggering
For regular contours:

1. Holding `S` during drag enters the new normal-offset mode.
2. Holding `D` during drag enters the same normal-offset mode.
3. Both shortcuts are behaviorally identical for regular contours.
4. Existing distinct `S` / `D` semantics remain unchanged for skeleton editing.
5. The keys are shared with skeleton editing, but the regular implementation is a separate feature with its own semantics.

### 2.2 Selection model
The mode applies only to selected regular on-curve points.

1. Selections may span multiple contours.
2. Selections do not need to be contiguous.
3. Off-curve handles are not primary participants in v1.
4. The clicked point that starts the drag must be one of the selected regular on-curve points.

### 2.3 Shared scalar rule
The shared displacement scalar is computed once from the clicked point:

1. Compute the clicked point's local normal from original geometry.
2. Project the raw drag delta onto that normal.
3. Use the resulting signed scalar as the only offset magnitude for the whole selection.

Every selected point then moves as:

`newPoint = originalPoint + pointNormal * sharedScalar`

This means:

1. Expansion vs compression is not derived from absolute cursor direction.
2. Other points do not derive their own independent scalars from the mouse delta.
3. The clicked point determines the scalar sign and magnitude for the whole edit.
4. This is not a fixed-side or fixed-rib computation in disguised form.

### 2.4 Boundary rule
At the boundary against non-selected geometry:

1. Non-selected neighboring on-curves stay fixed.
2. Adjacent handles should be reconstructed to preserve local continuity where possible.
3. The mode may reshape incident segments, but must not drag unrelated anchors.

### 2.5 Handle rule
For every affected handle:

1. Preserve handle direction.
2. Change handle length only.
3. Prefer preserving tension when the segment supports reliable tension reconstruction.
4. Fall back to proportional length scaling only in degenerate cases.

This should match the quality target already used by skeleton fixed-rib control-point scaling.

---

## 4) Why the implementation should reuse existing logic

### 3.1 Why not ship BezierJS offset + fitCubic in v1
The repo already contains `bezier-js` and `fitCubic` primitives, and skeleton contour generation uses them for outline generation. However, they are not the right default shipping path here because:

1. This feature is an interactive editing transform, not a new contour-generation tool.
2. We need strict handle-angle preservation.
3. We need fixed neighboring anchors.
4. We need local continuity against partially selected contours.
5. A segment refit pipeline is more invasive and more likely to change curve character unexpectedly.

Conclusion: do not ship offset + refit in v1.

### 3.2 Existing code we should build on
There are already two strong implementation anchors in the codebase:

1. Regular drag orchestration and segment scaling in `src-js/views-editor/src/edit-behavior-adapters.js` and `src-js/views-editor/src/edit-behavior.js`.
2. Skeleton fixed-rib control-point reconstruction in `applyFixedRibDragToSkeletonData(...)`.

Those already solve most of the hard problems we need:

1. gesture routing
2. live drag sessions
3. rollback/final change assembly
4. segment decomposition
5. handle direction preservation
6. tension-aware cubic handle length reconstruction

Conclusion:

1. the regular version should be implemented as a new regular-contour drag path
2. it may borrow handle-reconstruction strategy from the skeleton implementation
3. it must not reuse the fixed-rib feature contract, fixed-rib route identity, or fixed-rib expand/compress semantics

---

## 5) Proposed implementation architecture

This section is rewritten to respect file ownership from the target architecture.

## Step 01. Introduce a dedicated regular normal-drag route
Add the feature through the canonical routing surface, not as pointer-owned logic.

Target behavior:

1. Existing regular drag remains unchanged when neither `S` nor `D` is active.
2. If the current modifier state corresponds to regular S/D drag, the canonical `regularPoint` route must resolve to a regular normal-offset behavior path instead of default regular drag math.

Important:

1. For regular contours, treat both flags as the same mode.
2. Do not branch on "compress" vs "expand" semantics.
3. Use the same canonical route for both shortcut states.
4. Do not route regular contours through the skeleton fixed-rib rows/behavior and then special-case them downstream.

Ownership by file:

1. In `edit-behavior-registry.js`
   add or adapt modifier-to-preset / override resolution so regular `S` and `D` are represented declaratively.
2. In `edit-behavior-composer.js`
   keep dispatch on the normal canonical route surface.
3. In `edit-tools-pointer.js`
   continue only to transport mode state and clicked-point context already needed by composer/adapters.

The pointer tool must not:

1. compute normals
2. mutate path geometry
3. own the drag session implementation for this feature

---

## Step 02. Define a pure helper for regular normal drag
Create pure behavior-level math in `src-js/views-editor/src/edit-behavior.js`, informed by the same reconstruction quality goals as the skeleton implementation but regular-path specific.

Suggested name:

`applyRegularNormalDragToPathData(...)`

Inputs:

1. original path or unpacked contour data
2. working path or mutable contour data
3. selected regular on-curve point indices
4. clicked point index
5. raw drag delta
6. round function
7. options object

Options for v1:

1. `preserveHandleAngles: true`
2. `preserveHandleTension: true`

Outputs:

1. mutate working geometry in place
2. return whether anything was applied

Non-goals:

1. no persistence
2. no layer awareness
3. no selection parsing inside the helper

Architecture rule:

1. This helper belongs in `edit-behavior.js`, not in pointer.
2. Adapter code may call it, but the helper must stay storage-agnostic.

---

## Step 03. Compute the shared scalar from the clicked point
This is the key design rule.

Algorithm:

1. Resolve the clicked selected on-curve point in original geometry.
2. Compute its local tangent.
3. Rotate tangent to a normal.
4. Project the raw drag delta onto that normal.
5. Store the signed scalar as `sharedNormalOffset`.

Suggested formula:

```js
sharedNormalOffset = dragDelta.x * clickedNormal.x + dragDelta.y * clickedNormal.y;
```

This scalar is then reused for all selected points.

Important invariant:

1. This computation happens once per event.
2. Other selected points do not project the raw drag delta independently.

---

## Step 04. Compute local tangent and normal for regular on-curve points
We need a regular-path analog of `calculateNormalAtSkeletonPoint(...)`.

Add a helper for regular contour anchors only, using original contour geometry.

Suggested behavior by case:

### 4.1 Interior on-curve with two incident segments
1. Compute tangent from incoming and outgoing segment tangents.
2. If the point is smooth, derive a stable bisector-style tangent.
3. If the point is a corner, use a stable averaged/weighted tangent that does not collapse on sharp turns.
4. Rotate tangent by 90 degrees to get normal.

### 4.2 Open contour endpoint
1. Use the tangent of the single incident segment.
2. Rotate to normal.

### 4.3 Line segment
1. Tangent is line direction.
2. Normal is perpendicular line direction.

### 4.4 Cubic/quadratic segment
Use Bezier derivative at the anchor.

Existing repo support:

1. `Bezier` already exists in `bezier-js`.
2. `VarPackedPath` / contour iteration already expose decomposed segment points.

Suggested helper split:

1. `getRegularAnchorIncidentSegments(...)`
2. `getRegularSegmentEndpointTangent(...)`
3. `calculateNormalAtRegularPoint(...)`

Failure rule:

1. If a stable tangent/normal cannot be computed, skip that point for this event rather than inventing direction.

---

## Step 05. Move all selected anchors from the shared scalar
For each selected regular on-curve point:

1. Compute its local normal from original geometry.
2. Apply `sharedNormalOffset` along that normal.
3. Write the new on-curve position into working geometry.

Suggested formula:

```js
newX = originalX + normal.x * sharedNormalOffset
newY = originalY + normal.y * sharedNormalOffset
```

This is the anchor-position phase only. Handles are reconstructed after anchors are placed.

---

## Step 06. Reconstruct adjacent handles while preserving handle angles
This is the most important geometry phase.

Principle:

1. Do not rotate affected handles.
2. Use original handle direction vectors as the source of truth.
3. Recompute only handle lengths.

This should mirror the skeleton handle-preservation principle in both single-handle and two-handle cases, without importing fixed-rib semantics.

For each affected segment:

1. Gather original endpoints and original control points.
2. Gather new endpoints after anchor displacement.
3. Derive original handle directions from original geometry.
4. Keep those directions unchanged.
5. Recompute new handle lengths.
6. Write new control point positions as:

```js
newControl = newAnchor + originalDirection * newLength
```

Affected segment means:

1. a segment whose start or end anchor is selected
2. a segment needed to preserve continuity against a selected/unselected boundary

---

## Step 07. Preserve tension when reconstructing cubic handles
This is a required quality target from the user.

Use the same principle already present in skeleton handle reconstruction:

1. derive segment tension information from original cubic geometry
2. when the new segment endpoints are known, compute handle lengths from preserved tension
3. use original handle directions with those new lengths

Existing reference behavior:

1. `calculateHandleTensionsForSegment(...)`
2. `computeHandleLengthsFromTensions(...)`
3. the cubic reconstruction logic in the skeleton helper

Plan for reuse:

1. move or refactor the tension-preserving cubic reconstruction into shared pure helpers inside `edit-behavior.js` if practical
2. otherwise duplicate the minimum logic inside existing target files only, but do not create a new sidecar module

Fallback policy:

1. If the cubic tension cannot be computed reliably, scale original handle lengths proportionally from the segment-length change.
2. Do not rotate handle directions in fallback mode.

---

## Step 08. Handle single-handle open-end cases explicitly
This is a known bug class from skeleton S/D drag and must be handled intentionally here.

For segments at open ends with one handle:

1. preserve the original handle direction
2. recompute length only
3. never derive new handle direction from the moved segment line in a way that rotates the handle unexpectedly

This must be tested separately because open-end single-handle behavior is where angle drift is most likely.

---

## Step 09. Preserve continuity at selected/unselected boundaries
Selection may be sparse and multi-contour, so we need explicit rules.

Rules:

1. Selected anchors move.
2. Unselected anchors do not move.
3. Segments incident to selected anchors are still reconstructed.
4. Boundary handles on both sides of a selected/unselected segment pair may need new lengths to avoid tearing.

Expected result:

1. no disconnected contour geometry
2. no unrelated anchor movement
3. local continuity preserved as far as original segment structure allows

We do not require perfect offset-curve fairness in v1. We do require stable editing behavior.

---

## Step 10. Limit v1 to on-curve regular point selections
Do not broaden scope in the first implementation.

Explicitly exclude:

1. off-curve-only selections
2. anchor/guideline/component routes
3. mixed-selection routing
4. direct support for component contours

If the current selection is not a regular on-curve selection:

1. do not enter the new mode
2. fall back to existing drag behavior

---

## 6) Suggested code organization

### 6.1 In `edit-behavior-registry.js`
Add only declarative routing changes:

1. represent regular `S` / `D` drag as the same canonical regular-point modifier case
2. do not add behavior math
3. do not add persistence

### 6.2 In `edit-behavior-composer.js`
Add orchestration only if needed:

1. pass through route metadata for the regular normal-offset mode
2. keep dispatch on canonical adapters
3. do not mutate geometry here

### 6.3 In `edit-behavior.js`
Add pure math helpers:

1. clicked-point shared-scalar computation
2. regular point normal calculation
3. anchor displacement from shared scalar
4. handle reconstruction preserving direction
5. tension-preserving cubic handle-length reconstruction
6. segment ownership helpers for selected/unselected boundaries

### 6.4 In `edit-behavior-adapters.js`
Add adapter-owned translation and persistence:

1. gather selected regular on-curve points
2. resolve clicked point index from routed drag context
3. call the pure helper from `edit-behavior.js`
4. write path changes to `layerGlyph.path`
5. keep rollback/finalization in the adapter layer

Adapters must not:

1. do modifier mapping
2. parse shortcuts directly
3. bounce back into pointer-owned execution

### 6.5 In `edit-tools-pointer.js`
Keep transport only:

1. existing hit testing
2. existing selection management
3. existing route invocation
4. pass clicked-point context needed by composer/adapter

Do not add:

1. direct normal-offset execution
2. direct path mutation
3. direct path persistence

### 6.6 Shared pure helper list
Prefer extracting small pure helpers instead of keeping all geometry in one route:

1. `calculateNormalAtRegularPoint(...)`
2. `collectAffectedRegularSegments(...)`
3. `rebuildRegularSegmentHandlesPreservingDirection(...)`
4. `rebuildRegularCubicHandlesPreservingTension(...)`
5. `applyRegularNormalDragToContour(...)`

### 6.7 Reuse from skeleton helper
If possible, extract shared tension-preserving cubic logic from the skeleton helper so both regular and skeleton paths call one utility.

Avoid:

1. copying the full skeleton helper wholesale
2. making regular path depend on skeleton-specific data structures
3. creating a new helper file just for this feature
4. treating the regular feature as a variant of fixed-rib drag instead of its own drag mode

---

## 7) Alternative path that should not be shipped in v1
If we want to evaluate the BezierJS offset + fitCubic route later, do it as a comparison spike only.

Questions it would need to answer:

1. Can it preserve handle angles strictly? Probably not naturally.
2. Can it keep unselected boundary anchors fixed? Only with extra control logic.
3. Can it remain stable under sparse multi-point selection? Likely harder than the adapted route.
4. Can it feel predictable in live editing? Unknown.

Conclusion:

1. do not build the production feature around this path now
2. keep it as optional future research only

---

## 8) Manual acceptance checklist

### 7.1 Basic interaction
1. Select one regular on-curve point on a line and drag with `S`.
2. Repeat with `D`.
3. Result must be identical.

### 7.2 Shared scalar rule
1. Select multiple on-curve points with different normal directions.
2. Click one of them and drag.
3. Verify all moved points use the clicked point's scalar offset, not independent cursor projections.
4. Click a different selected point and repeat.
5. The source scalar should change with the clicked point.

### 7.3 Open contour endpoint
1. Select an endpoint with a single handle.
2. Drag with `S` and `D`.
3. Handle angle must not rotate.
4. Only handle length may change.

### 7.4 Smooth cubic
1. Select a smooth on-curve point with two handles.
2. Drag in normal-offset mode.
3. Both handle angles stay fixed.
4. Handle lengths update consistently.

### 7.5 Corner anchor
1. Select a corner anchor.
2. Drag in normal-offset mode.
3. Point moves only along its local normal.
4. Adjacent segments remain connected.

### 7.6 Sparse multi-contour selection
1. Select anchors on multiple contours.
2. Start the drag from one selected anchor.
3. All selected anchors participate with the same scalar offset.
4. Contours remain independent except for shared scalar usage.

### 7.7 Boundary continuity
1. Select only part of a contour.
2. Drag in normal-offset mode.
3. Unselected neighboring anchors stay fixed.
4. No visible tearing or disconnected segment geometry.

### 7.8 Regression
1. Regular drag without `S` or `D` behaves exactly as before.
2. Skeleton `S` / `D` drag behaves exactly as before.
3. Pointer still only routes; no direct pointer-owned execution is reintroduced.
4. Regular `S` / `D` drag does not rely on skeleton fixed-rib row selection or fixed-side semantics.

---

## 9) Helper-level test cases to implement later
If unit tests are added, they should focus on pure geometry helpers:

1. normal computation for:
   1. line anchor
   2. cubic smooth anchor
   3. cubic corner anchor
   4. open contour endpoint
2. shared scalar reuse:
   1. clicked point projection computed once
   2. reused for all selected anchors
3. angle preservation:
   1. original handle direction vector equals new handle direction vector
4. tension preservation:
   1. cubic handle reconstruction preserves derived tension where valid
5. fallback behavior:
   1. degenerate segments do not explode
   2. invalid normals skip cleanly

---

## 10) Risks and guardrails

### 9.1 Main risk
The biggest risk is mixing two different ideas:

1. per-point normal offset driven by one shared scalar
2. local continuity reconstruction at partially selected boundaries

That combination is valid, but it needs careful segment ownership logic.

### 9.2 Guardrails
1. Keep anchor movement and handle reconstruction as separate phases.
2. Use original geometry as the only source of direction/tension truth.
3. Never derive handle direction from already-moved geometry in this mode.
4. Skip unsupported degenerate cases rather than inventing unstable geometry.
5. Keep behavior math in `edit-behavior.js`, not in adapters or pointer.
6. Keep persistence in adapters, not in `edit-behavior.js`.
7. Keep the work inside existing target files only.
8. Keep the regular feature semantically separate from skeleton fixed-rib drag even if some low-level helpers are shared.

---

## 11) Final implementation baseline
The shipping baseline should be:

1. one regular normal-offset drag mode
2. activated by either `S` or `D`
3. shared scalar from the clicked point's projected drag
4. per-point motion along each point's own normal
5. strict handle-angle preservation
6. tension-preserving handle length reconstruction when available
7. no Bezier offset/refit pipeline in v1
8. no new source files for this chapter
9. no pointer-owned execution outside the target architecture pipeline
