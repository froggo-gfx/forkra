# Post-Refactor Recommendations: Pointer Decomposition and distance-angle.js Cleanup

Date: 2026-03-31
Status: Recommendations (not started)

---

## 1. Pointer Tool Decomposition (`edit-tools-pointer.js`, 3890 LOC)

### Current State

After the unified-behavior refactor, pointer is transport-only for in-scope drag/nudge.
It no longer owns persistence or behavior math for any point-like editing route.

What pointer still owns:

| Responsibility | Methods | Approx Lines |
|---|---|---|
| Hover + cursor | `handleHover`, `setCursor`, `setCursorForRotationHandle`, `setCursorForResizeHandle` | ~180 |
| Drag routing | `handleDrag`, `handleDragSelection` | ~630 |
| Nudge routing | `handleArrowKeys` | ~80 |
| Double-click | `handleDoubleClick`, `handlePointsDoubleClick`, `_handleSkeletonPointsDoubleClick`, `_handleSkeletonSegmentDoubleClick` | ~170 |
| Rect select | `handleRectSelect` | ~35 |
| Bounds transform | `handleBoundsTransformSelection`, `_handleSkeletonBoundsTransform` | ~310 |
| Measure mode | `_findRibPointForMeasure`, `_findControlPointForMeasure`, `_buildPathTensionContext`, `_buildSkeletonTensionContext`, `_getMeasurePointsFromSelection`, `_findSegmentForMeasure`, `_findPathSegmentNear`, `_findSkeletonSegmentNear`, `_distanceToCurve`, `_evaluateBezier`, `_distanceToSegment`, `resolveMeasureHoverTarget`, `_measureHoverTargetsEqual`, `_ribPointsEqual`, `_measurePointsEqual`, `_getRibPointPositionForSelection` | ~600 |
| Rib/editable helpers | `_hitTestRibPoints`, `_getEditableGeneratedPointsFromSelection`, `_getEditableGeneratedHandlesFromSelection`, `_selectedRibTargetsBelongToSingleSegment`, `_getSegmentOnCurvePoints`, `_convertSegmentSelectionToPoints` | ~200 |
| Selection helpers | `_classifyPointLikeSelection`, `stripRibSelectionWhenPointSelectionExists`, `getSelectionType` | ~80 |
| Tunni hit-test + route | `allowCtrlModifiedMouseDown`, Tunni branches in `handleDrag` | ~120 |
| Transform geometry | `getRotationHandle`, `getResizeHandle`, `getTransformSelectionHandle`, `getTransformHandles`, `getSkeletonSelectionBounds`, `getTransformSelectionBounds` | ~200 |
| Fixed-rib helpers | `applyFixedRibDragToSkeletonData`, `resetWidthStateFromOriginal`, `enforceSmoothColinearityForSkeleton`, `normalizeVectorSafe` | ~190 |
| Top-level free functions | `matchEventModifiers`, `eventMatchesActionShortCut`, `eventMatchesActionBaseKey`, `pointInSquareHandle`, `pointInCircleHandle`, `replace`, `getSelectModeFunction`, `findPrevOnCurveIndex`, `findNextOnCurveIndex` | ~100 |
| Activation / draw / class shell | `activate`, `deactivate`, drawing registration, class definition | ~100 |

### Problem

At 3890 LOC with ~45 methods, the file is still hard to navigate even though it no longer owns in-scope drag/nudge persistence. The remaining responsibilities group into clearly separate domains that rarely interact with each other.

### Recommended Decomposition

Split into domain-focused modules. Pointer class stays as the routing shell; extracted modules become imported helpers.

#### Extract 1: Measure mode (~600 LOC)

Target file: `src-js/views-editor/src/pointer-measure-helpers.js`

Move all `_find*ForMeasure`, `_build*TensionContext`, `_getMeasurePointsFromSelection`, `_findSegmentForMeasure`, `_find*SegmentNear`, `_distanceTo*`, `_evaluateBezier`, `resolveMeasureHoverTarget`, `_measureHoverTargetsEqual`, `_ribPointsEqual`, `_measurePointsEqual`, `_getRibPointPositionForSelection`.

Rationale:
- Measure mode is a self-contained hover/mode domain that was explicitly scoped out of the drag/nudge refactor.
- These methods only interact with pointer through `sceneModel` measure-state API and hit-test geometry.
- Extracting them makes the SceneModel measure API the only coupling surface, which is already clean.
- This single extraction removes ~15% of the file.

Calling pattern after extraction:
```js
import { resolveMeasureHoverTarget, findRibPointForMeasure, ... } from "./pointer-measure-helpers.js";
```

Pointer's `handleHover` continues to call these as free functions with the needed context passed as arguments.

#### Extract 2: Transform geometry (~200 LOC)

Target file: `src-js/views-editor/src/pointer-transform-helpers.js`

Move `getTransformHandles`, `getSkeletonSelectionBounds`, `getTransformSelectionBounds`, `getRotationHandle`, `getResizeHandle`, `getTransformSelectionHandle`.

Rationale:
- Transform handle hit-testing and bounds computation is pure geometry.
- Only consumed by `handleBoundsTransformSelection` and `handleDrag` (transform branch).
- No persistence, no state mutation.

#### Extract 3: Selection classification (~280 LOC)

Target file: `src-js/views-editor/src/pointer-selection-helpers.js`

Move `_classifyPointLikeSelection`, `stripRibSelectionWhenPointSelectionExists`, `getSelectionType`, `_getEditableGeneratedPointsFromSelection`, `_getEditableGeneratedHandlesFromSelection`, `_getSegmentOnCurvePoints`, `_convertSegmentSelectionToPoints`, `_selectedRibTargetsBelongToSingleSegment`.

Rationale:
- Selection classification was unified in Phase 1.5 of the beautify chapter and is now a stable helper set.
- Used by both `handleDragSelection` and `handleArrowKeys` but contains no state.
- Moving it out makes the classifier independently testable.

#### What stays in pointer (~2800 LOC)

- `handleDrag`, `handleDragSelection`, `handleArrowKeys` (routing shells)
- `handleHover` (calls extracted measure helpers)
- `handleDoubleClick` family
- `handleRectSelect`
- `handleBoundsTransformSelection`, `_handleSkeletonBoundsTransform`
- Tunni hit-test branches and `allowCtrlModifiedMouseDown`
- `activate`, `deactivate`, drawing registration
- Fixed-rib helpers (these are candidates for moving to `edit-behavior.js` or adapters in a future pass, but they are still consumed by pointer-local code paths like smooth-toggle and bounds-transform)

### Execution Constraints

1. No new behavior. Every extraction must preserve identical call paths.
2. Extracted functions become free functions, not methods. Pass context explicitly.
3. One extraction per step. Verify with `node --check` + `npm run bundle` + manual smoke test after each.
4. Do not extract code that still mutates pointer instance state (e.g., `this.cursor`). Only pure helpers and context-consuming functions qualify.
5. Do not fold this work into a broader behavior change. This is file hygiene only.

### Expected Result

- `edit-tools-pointer.js`: ~2800 LOC (down from 3890)
- 3 new helper files totaling ~1080 LOC
- Pointer class methods reduced from ~45 to ~25
- Measure, transform, and selection domains become independently navigable

---

## 2. `distance-angle.js` Cleanup (1021 LOC)

### Current State

After the Tunni+Metrics refactor, `distance-angle.js` lives in `src-js/fontra-core/src/` and was designated as the shared measure math home. Tunni label drawing was successfully moved out.

However, the file still mixes two categories of code:

| Category | Examples | Approx Lines |
|---|---|---|
| Pure math | `calculateDistanceAndAngle`, `calculateManhattanDistance`, `calculateProjectedDistanceComponents`, `calculateTension`, `calculateOffCurveAngle`, `calculateHandleMeasure`, `calculateBadgeDimensions`, `calculateBadgePosition`, `calculateDistancesToOffCurvePoints`, `unitVectorFromTo`, `lineIntersection`, `checkPointConfiguration`, `checkOffCurvePointConfiguration`, `calculateDistancesFromPoint` | ~520 |
| Canvas drawing | `drawDistanceAngleVisualization`, `drawManhattanDistanceVisualization`, `drawOffCurveDistanceVisualization`, `drawLine`, `drawBadge`, `drawText`, `strokeLine`, `drawRoundRect` | ~420 |
| Formatting | `formatDistanceAndAngle`, `formatDistanceAngle`, `formatDistanceTensionAngle`, `formatManhattanDistance` | ~30 |
| Color/style constants | `DISTANCE_ANGLE_COLOR`, `OFFCURVE_DISTANCE_COLOR`, etc. | ~15 |
| Selection parsing | `parseSelection` (local duplicate) | ~15 |

### Problems

1. **Core file owns canvas drawing.** The `draw*Visualization` functions call `context.fillRect`, `context.strokeStyle`, `context.beginPath`, etc. These are editor-side rendering responsibilities. A core math file should not know about the Canvas 2D API.

2. **Color/style constants in core.** `DISTANCE_ANGLE_COLOR`, badge padding/radius/font-size are pure presentation. They belong with the visualization layer.

3. **Local `parseSelection` duplicate.** Line 961 defines a local `parseSelection` that duplicates `src-js/fontra-core/src/utils.js:261-263`. This creates divergence risk.

4. **Formatting mixed with math.** The `format*` functions are display helpers (they produce human-readable strings), not math. They should live next to the code that renders them.

### Recommended Split

#### Keep in `distance-angle.js` (pure math, ~520 LOC):

- `unitVectorFromTo`
- `lineIntersection`
- `calculateDistanceAndAngle`
- `calculateManhattanDistance`
- `calculateProjectedDistanceComponents`
- `calculateBadgeDimensions` / `calculateBadgePosition` (geometry, no canvas)
- `calculateTension`
- `calculateOffCurveAngle`
- `calculateHandleMeasure`
- `checkPointConfiguration` / `checkOffCurvePointConfiguration`
- `calculateDistancesToOffCurvePoints`
- `calculateDistancesFromPoint`

These are the functions the Tunni+Metrics refactor converged into this file as the shared measure math home. They should stay.

#### Move to `visualization-layer-definitions.js` (~450 LOC):

- `drawDistanceAngleVisualization`
- `drawManhattanDistanceVisualization`
- `drawOffCurveDistanceVisualization`
- `drawLine`, `drawBadge`, `drawText`, `strokeLine`, `drawRoundRect`
- `formatDistanceAndAngle`, `formatDistanceAngle`, `formatDistanceTensionAngle`, `formatManhattanDistance`
- All color/style constants (`DISTANCE_ANGLE_COLOR`, `OFFCURVE_*`, badge padding/radius/font-size)

Rationale:
- `visualization-layer-definitions.js` already owns Tunni label drawing after the Tunni+Metrics refactor.
- The `draw*Visualization` functions are registered as visualization layers and called from the editor rendering loop.
- Moving them next to their registration site is consistent with the established pattern.

#### Delete from `distance-angle.js`:

- Local `parseSelection` — replace with import from `src-js/fontra-core/src/utils.js`.

### Execution Constraints

1. The pure-math surface in `distance-angle.js` must not change. Only the canvas-drawing and formatting functions move.
2. The moved `draw*Visualization` functions should import their math dependencies from `distance-angle.js` explicitly.
3. `visualization-layer-definitions.js` is already 3177 LOC. Evaluate whether the drawing helpers should go into a separate `measure-visualization-helpers.js` if the combined size exceeds ~3600 LOC. If so, keep the visualization registrations in `visualization-layer-definitions.js` and the draw implementation in the helper file.
4. One extraction step at a time. Verify after each: `node --check` on both files, `npm run bundle`, manual Q/Alt+Q/Manhattan smoke test.

### Expected Result

- `distance-angle.js`: ~520 LOC, purely math, no Canvas API references, no color constants
- Drawing code lives in the editor visualization layer, consistent with Tunni label drawing pattern
- Local `parseSelection` duplicate eliminated
- Core file is safe to import from non-editor contexts (e.g., future server-side use, testing)

---

## Priority

| Recommendation | Impact | Risk | Suggested Order |
|---|---|---|---|
| distance-angle.js cleanup | Medium (core purity, testability) | Low (well-bounded, no behavior change) | First |
| Pointer measure extraction | High (largest single-domain reduction) | Low (pure helpers, explicit context) | Second |
| Pointer transform extraction | Low-Medium (smaller win) | Low | Third |
| Pointer selection extraction | Medium (testability, shared classifier) | Low | Fourth |

The distance-angle cleanup is the smallest, safest change and directly addresses a violated architectural boundary (canvas drawing in core). The pointer extractions are larger but follow the same mechanical pattern.
