# Deep DRY Refactor for `edit-behavior.js` (No UX Change)

## Summary
Goal: reduce duplicated code in the merged `edit-behavior.js` (regular + skeleton/rib) while preserving current UX and public contracts.

Approach: small incremental steps, each manually verifiable and safe to roll back.

## Scope and Non-Scope

### In Scope
- `src-js/views-editor/src/edit-behavior.js`
- Minimal import updates in consumers only if required by internal moves
- Minimal call-site wiring in `src-js/views-editor/src/edit-tools-pointer.js` only to reuse shared modifier-intent resolution (no routing redesign)
- Internal refactor only:
  - rib/skeleton helpers
  - offset key resolvers
  - shared projection math
  - strategy-based rib delta handling
  - unified rollback builders

### Out of Scope
- Any UX or behavior changes in drag/arrow/modifier flows
- Skeleton data schema changes
- Pointer routing redesign
- New automated tests

## Architectural Invariant (Added)
- For a given `object kind`, modifier semantics are resolved once and reused across input modalities (`drag`, `nudge`).
- Input modality must not redefine modifier meaning.
- Differences between `regular`, `skeleton`, and `rib` are allowed, but they must live in shared behavior tables/resolvers, not duplicated per-handler condition trees.

## Public APIs / Interfaces (Must Stay Stable)
- `EditBehaviorFactory`
- `SkeletonEditBehavior`
- `RibEditBehavior`
- `EditableRibBehavior`
- `InterpolatingRibBehavior`
- `EditableHandleBehavior`
- `createSkeletonEditBehavior(...)`
- `getSkeletonBehaviorName(...)`
- `createRibEditBehavior(...)`
- `createEditableRibBehavior(...)`
- `createInterpolatingRibBehavior(...)`
- `createEditableHandleBehavior(...)`
- `resolveBehaviorPresetName(...)`
- `getBehaviorPreset(...)`

## Step 1 — Introduce internal rib context helpers
### Problem
`RibEditBehavior`, `EditableRibBehavior`, and `InterpolatingRibBehavior` duplicate the same context extraction.

### Step focus
Create shared non-behavioral helpers for contour/point base access.

### Solution
Add private helpers:
- `getContourPoint(skeletonData, contourIndex, pointIndex)`
- `getContourDefaultWidth(contour)`
- `getOriginalHalfWidth(point, contourDefaultWidth, side)`
- `getOriginalNudge(point, side)`
- `buildTangentFromNormal(normal)`

### Mock code
```js
function getOriginalHalfWidth(point, contourDefaultWidth, side) {
  if (side === "left") {
    return point.leftWidth ?? (point.width !== undefined ? point.width / 2 : contourDefaultWidth / 2);
  }
  return point.rightWidth ?? (point.width !== undefined ? point.width / 2 : contourDefaultWidth / 2);
}
```

### Manual testing
- No functional change expected.
- Quick smoke: rib drag, skeleton drag, regular drag behave unchanged.

### Corner cases
- `point.width` exists, `leftWidth/rightWidth` absent
- `contour.defaultWidth` absent

## Step 2 — Centralize offset key resolution
### Problem
String key composition (`left/right + in/out + X/Y + 1D`) is duplicated and error-prone.

### Step focus
Avoid key drift by using one resolver layer.

### Solution
Add:
- `getHandleOffsetKeys(side, handleType)` for `EditableHandleBehavior`
- `getRibHandleOffsetKeys(side)` for in/out groups
- `getRibNudgeKey(side)`

### Mock code
```js
function getHandleOffsetKeys(side, handleType) {
  const prefix = side === "left" ? "left" : "right";
  const stem = handleType === "in" ? "HandleInOffset" : "HandleOutOffset";
  return {
    oneD: `${prefix}${stem}`,
    x: `${prefix}${stem}X`,
    y: `${prefix}${stem}Y`,
  };
}
```

### Manual testing
- Editable handle drag (`in/out`, `left/right`) unchanged.
- No `undefined` key access errors.

### Corner cases
- Mixed 1D-only and 2D-only points

## Step 3 — Unify delta projection math
### Problem
Normal/tangent projections and half-width clamp logic are repeated.

### Step focus
Use one internal math helper set.

### Solution
Add:
- `projectDelta(delta, axis)`
- `projectToNormalSigned(delta, normal, side)`
- `projectToTangent(delta, tangent)`
- `clampHalfWidth(value, min = 0)`

### Mock code
```js
function projectToNormalSigned(delta, normal, side) {
  const sign = side === "left" ? 1 : -1;
  return sign * (delta.x * normal.x + delta.y * normal.y);
}
```

### Manual testing
- Rib width drag remains identical (left/right sign sanity).
- Shift/non-Shift in editable rib unchanged.

### Corner cases
- near-zero normal/tangent
- collapse to zero width

## Step 4 — Extract handle offset adapter (1D/2D bridge)
### Problem
1D↔2D conversion and handle-offset presence logic are duplicated and scattered.

### Step focus
One adapter for normalized offset runtime state.

### Solution
Add:
- `readNormalizedHandleOffsets(point, side, dirs, tangent)`
- `buildCompensatedOffsets(baseOffsets, tangent, deltaNudge, hasIncoming, hasOutgoing)`

### Mock code
```js
function readNormalizedHandleOffsets(point, side, dirs, tangent) {
  // 2D if present; else convert 1D via direction; else zero
  return { inX, inY, outX, outY, hasAny, hasIncoming, hasOutgoing };
}
```

### Manual testing
- Alt interpolation rib drag keeps handles visually stationary.
- Rollback payload equals pre-refactor behavior.

### Corner cases
- only incoming handle
- only outgoing handle
- no handles

## Step 5 — Introduce internal rib strategy runner
### Problem
`RibEditBehavior`, `EditableRibBehavior`, and `InterpolatingRibBehavior` duplicate state plumbing; only delta strategy differs.

### Step focus
Create one strategy-driven internal runtime.

### Solution
Introduce:
- `createRibRuntimeContext(...)`
- `runRibStrategy(context, delta, strategy, options)`
- Strategies:
  - `RIB_STRATEGY_BASIC_WIDTH`
  - `RIB_STRATEGY_EDITABLE_WIDTH_NUDGE`
  - `RIB_STRATEGY_INTERPOLATE`

Keep public classes and signatures unchanged; delegate internals to runner.

### Mock code
```js
class EditableRibBehavior {
  applyDelta(delta, constrainMode = null, roundFunc = this.roundFunc) {
    return runRibStrategy(this._ctx, delta, RIB_STRATEGY_EDITABLE_WIDTH_NUDGE, {
      constrainMode,
      roundFunc,
    });
  }
}
```

### Manual testing
- Rib matrix:
  - basic rib drag
  - editable rib drag
  - Alt interpolation drag
  - Z tangent mode
  - arrow nudge
- Undo/redo in each mode.

### Corner cases
- fast modifier switching during drag
- single-sided behavior

## Step 5.5 — Add shared modifier-intent resolver and reuse it in drag+nudge call sites
### Problem
Modifier meaning for non-regular objects drifts when drag and arrow paths resolve modes independently.

### Step focus
Keep current UX, but force one source of truth for modifier intent per object kind.

### Solution
Add shared intent resolver API (in `edit-behavior.js`) and route existing call sites through it.
- Add `resolveModifierIntent(objectKind, flags)` with explicit precedence rules.
- Keep output compatible with existing preset/mode names (`default`, `constrain`, `alternate`, `alternate-constrain`, rib-specific runtime intents).
- Update existing drag+nudge call sites in pointer to call the resolver instead of local `if/else` trees.
- Do not change routing order or selection ownership in pointer.

### Mock code
```js
// edit-behavior.js
export function resolveModifierIntent(objectKind, flags) {
  if (objectKind === "rib") {
    if (flags.alt) return "interpolate";
    if (flags.z) return "tangent";
    return "default";
  }
  return resolveBehaviorPresetName(flags);
}
```

```js
// edit-tools-pointer.js
const ribIntent = resolveModifierIntent("rib", {
  alt: event.altKey,
  z: this.tangentRibMode,
  x: this.equalizeMode,
});
```

### Manual testing
- For each object kind (`regular`, `skeleton`, `rib`), compare drag vs arrow with the same modifier state.
- Verify no behavior delta from baseline for regular points.
- Verify rib/skeleton no longer depend on duplicated local mode branches.

### Corner cases
- `Alt+Z` precedence is deterministic and documented.
- `X` remains no-op for object kinds where it is intentionally unsupported.
- Modifier press/release mid-drag keeps current behavior contracts.

## Step 6 — Unify rollback builders
### Problem
Rollback payloads are manually repeated across classes.

### Step focus
Central rollback payload builders.

### Solution
Add:
- `buildRibRollbackPayload(context, mode, extras?)`
- Optional `buildHandleRollbackPayload(...)` for editable handles

Replace manual `getRollback()` assembly with builders.

### Mock code
```js
function buildRibRollbackPayload(ctx, mode) {
  // mode controls nudge / 2D offsets / interpolation flag inclusion
}
```

### Manual testing
- Undo/redo parity for every rib/editable/interpolation path.
- 2D offset rollback correctness.

### Corner cases
- `hasHandleOffsets = false`
- interpolation rollback includes `isInterpolation: true`

## Step 7 — Skeleton behavior DRY pass
### Problem
`SkeletonEditBehavior` still has internal repetition that can be reduced without changing rule semantics.

### Step focus
Refactor internals of edit-entry build and partitioning only.

### Solution
Extract helpers:
- `buildMatchedEditEntry(...)`
- `partitionTransformVsConstrain(...)`
- `collectParticipatingIndices(...)`

Do not modify `actionFactories` or rule semantics.

### Mock code
```js
function buildMatchedEditEntry(points, match, neighborIndices, actionFactories) {
  return normalizedEntry;
}
```

### Manual testing
- Skeleton drag with `Shift`, `Alt`, mixed selection
- X-equalize and Z-related flows unchanged

### Corner cases
- open contour endpoints
- closed contour neighbor wrap

## Step 8 — Final cleanup and parity pass
### Problem
After DRY refactor, dead helpers/noise may remain.

### Step focus
Cleanup only, no functional change.

### Solution
- Remove unused helpers/vars
- Keep concise comments only where logic is non-obvious
- Ensure no stale references to removed structures

### Manual testing
- Full regression smoke (matrix below)

## Regression test matrix (manual, mandatory)
1. Regular points
- drag default / Shift / Alt / Shift+Alt
- arrows default / Shift / Alt / Shift+Alt
- undo/redo

2. Skeleton points
- drag default / Shift / Alt / Shift+Alt
- arrows default / Shift / Alt / Shift+Alt
- mixed selection with regular
- undo/redo

3. Rib points
- normal rib drag
- editable rib drag (`linked/editable` variants)
- arrow movement (same intent mapping as drag for supported modifiers)
- `Z` tangent mode

4. Interpolation
- Alt-drag rib interpolation
- handle visual stability
- rollback integrity

5. Editable generated handles
- drag + arrows
- `left/right`, `in/out`
- undo/redo

6. Tunni / Q
- no regression in hover/drag/key lifecycle
- Q/Alt+Q on mixed glyph remains baseline

7. Panel transformations
- skeleton-related transform flows remain stable
- no runtime import errors

8. Cross-modality intent parity
- For each object kind, modifier intent is resolved once and used consistently in drag and nudge paths.

## Assumptions and defaults
- No UX/behavior changes.
- Public exports and signatures remain stable.
- Work is delivered in small commits with manual test after each step.
- No automated tests added in this refactor.
