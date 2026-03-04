# Unified Behavior Refactor Plan

Date: 2026-03-04
Status: Draft
Source of truth: docs/refactor/sot-unified-behavior.md

## Summary
Goal: Unify all editable object kinds under a single behavior set. Domain separation is the method.
This plan is incremental and requires manual UI testing after every step.

## Non-negotiables
- One behavior engine for all point-like edits.
- Pointer is transport only for drag and nudge.
- Composer is orchestration only (no persistence).
- Adapters own translation and persistence and return {forward, rollback}.
- Registry is the single map for capabilities and routing.

## Scope
In scope:
- Drag and nudge for regular points, anchors, guidelines.
- Drag and nudge for skeleton on-curve and off-curve points.
- Drag and nudge for rib points.
- Drag and nudge for editable generated points and handles.

Out of scope (deferred):
- Tunni workflows.
- Non-drag actions (double-click, rect select, transform panel, component tools).

## Required Progress Report Format (for every step)
Each step must add an entry to docs/refactor/progress-report.md using this format:
- Step header (phase + step name)
- Problem (restated in plain language)
- Code analysis (what changed, which files, what the code does)
- Comparison (does the code solve the problem? yes/no, with reasoning)
- Manual test results (pass/fail per test)
- Undo/redo verification (pass/fail)

This is a hard gate: a step is not complete without a matching progress report entry.

## Phase 0: Baseline and Alignment

### Step 0.1: Align the action/object matrix with the SoT
Problem aspect: The matrix can drift from the unified-behavior goal.
Solution (plain language): Update docs/refactor/action-object-matrix.md so all rows/columns align with the SoT scope and terminology (use skeleton on-curve/off-curve, not skeleton handles).
Code snippets:
- Update the Objects list and matrix rows/columns.
Manual tests:
- None (documentation step).
Verification criteria:
- Matrix matches the SoT scope and terms.
- Progress report entry added.

### Step 0.2: Align target-architecture.md with the SoT
Problem aspect: The target architecture doc must match the unified-behavior goal.
Solution (plain language): Ensure docs/refactor/target-architecture.md states that shared behavior is the goal, adapters own persistence, and skeleton off-curve points are treated as off-curve points.
Code snippets:
- Update architecture responsibilities and examples.
Manual tests:
- None (documentation step).
Verification criteria:
- No contradictions with sot-unified-behavior.md.
- Progress report entry added.

## Phase 1: Registry and Routing Contracts

### Step 1.1: Registry completeness
Problem aspect: The registry must be complete and consistent with parseSelection.
Solution (plain language): Ensure OBJECT_KINDS covers all in-scope kinds and uses the correct selection key names.
Code snippets:
- docs/refactor/object-kind-inventory.md
- src-js/views-editor/src/edit-behavior-registry.js
Manual tests:
- None (definition step).
Verification criteria:
- Registry includes all in-scope kinds.
- No new selection formats introduced.
- Progress report entry added.

### Step 1.2: Routing maps are complete for drag and nudge
Problem aspect: Routing gaps cause untracked behavior changes.
Solution (plain language): Ensure DRAG_ROUTING_MAP and NUDGE_ROUTING_MAP cover all in-scope object kinds and modifier rows listed in the matrix.
Code snippets:
- src-js/views-editor/src/edit-behavior-registry.js
- docs/refactor/action-object-matrix.md
Manual tests:
- None (definition step).
Verification criteria:
- Every Yes/Specificity matrix cell has a routing value.
- Progress report entry added.

## Phase 2: Adapter Contract and Composer Purity

### Step 2.1: Adapter contract is explicit
Problem aspect: Without a contract, adapters drift into wrappers.
Solution (plain language): Define and enforce a consistent adapter API that returns {forward, rollback} and owns persistence.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
- docs/refactor/phase-6-clarification.md (reference only)
Manual tests:
- None (contract step).
Verification criteria:
- Adapter contract is documented and referenced.
- Progress report entry added.

### Step 2.2: Composer is orchestration-only
Problem aspect: Composer currently applies persistence for some kinds.
Solution (plain language): Move persistence out of edit-behavior-composer.js and into adapters for all in-scope kinds.
Code snippets:
- src-js/views-editor/src/edit-behavior-composer.js
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Drag a regular point; drag a skeleton on-curve point. Behavior must match baseline.
Verification criteria:
- Composer contains no applyChange/recordChanges for drag/nudge.
- Progress report entry added.

## Phase 3: Unify Behavior Engine

### Step 3.1: Remove per-kind behavior classes from edit-behavior.js
Problem aspect: Multiple behavior engines violate unified behavior.
Solution (plain language): Remove RibEditBehavior, EditableRibBehavior, InterpolatingRibBehavior, EditableHandleBehavior and re-route logic through shared behavior + adapters.
Code snippets:
- src-js/views-editor/src/edit-behavior.js
Manual tests:
- Drag regular points and anchors (default/shift/alt).
- Drag editable generated points (left/right) and verify movement matches baseline.
Verification criteria:
- No per-kind behavior classes remain in edit-behavior.js.
- Progress report entry added.

## Phase 4: Canonical Adapters by Object Kind

### Step 4.1: Regular points/anchors/guidelines (drag)
Problem aspect: Regular drag still relies on composer persistence.
Solution (plain language): Implement canonical drag adapter that uses shared behavior and persists to path/anchors/guidelines.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Drag regular on-curve and off-curve points.
- Drag anchors.
- Drag guidelines.
- Repeat with shift and alt modifiers.
Verification criteria:
- All C1-C4 drag rows pass in the matrix.
- Progress report entry added.

### Step 4.2: Regular points/anchors/guidelines (nudge)
Problem aspect: Regular nudge still bypasses canonical adapters.
Solution (plain language): Implement canonical nudge adapter for regular kinds with shared behavior and persistence.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Nudge regular points, anchors, guidelines with arrow keys.
- Repeat with shift and shift+ctrl/meta modifiers.
Verification criteria:
- All C1-C4 nudge rows pass in the matrix.
- Progress report entry added.

### Step 4.3: Skeleton on-curve/off-curve (drag)
Problem aspect: Skeleton drag math/persistence still lives in pointer.
Solution (plain language): Implement canonical drag adapters for skeleton on-curve and off-curve points using shared behavior and skeleton persistence.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Drag skeleton on-curve and off-curve points.
- Repeat with shift and alt modifiers.
Verification criteria:
- All C5-C6 drag rows pass in the matrix.
- Progress report entry added.

### Step 4.4: Skeleton on-curve/off-curve (nudge)
Problem aspect: Skeleton nudge still lives in pointer.
Solution (plain language): Implement canonical nudge adapters for skeleton on-curve and off-curve points.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Nudge skeleton on-curve and off-curve points.
- Repeat with shift and alt modifiers.
Verification criteria:
- All C5-C6 nudge rows pass in the matrix.
- Progress report entry added.

### Step 4.5: Skeleton equalize (drag + nudge)
Problem aspect: Equalize behavior is pointer-owned and special-cased.
Solution (plain language): Move equalize handling for skeleton off-curve points into the canonical adapters.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Drag skeleton off-curve points with X and X+shift.
- Nudge skeleton off-curve points with X and X+shift.
Verification criteria:
- All equalize rows in C6 pass in the matrix.
- Progress report entry added.

### Step 4.6: Rib points (drag)
Problem aspect: Rib drag uses per-kind behavior.
Solution (plain language): Use shared behavior output then project onto normal in the rib adapter and persist width changes.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Drag rib points (left/right).
- Repeat with Z, D, S modes as applicable.
Verification criteria:
- All C7 drag rows pass in the matrix.
- Progress report entry added.

### Step 4.7: Rib points (nudge)
Problem aspect: Rib nudge is pointer-owned.
Solution (plain language): Implement canonical nudge adapter with shared behavior and projection.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Nudge rib points with arrow keys.
- Repeat with shift and alt modifiers.
Verification criteria:
- All C7 nudge rows pass in the matrix.
- Progress report entry added.

### Step 4.8: Editable generated points (drag)
Problem aspect: Editable generated point drag uses custom behavior classes.
Solution (plain language): Use shared behavior on generated point positions, then translate to skeleton width/nudge in the adapter.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Drag editable generated points (left/right) and confirm skeleton widths update.
Verification criteria:
- All C8 drag rows pass in the matrix.
- Progress report entry added.

### Step 4.9: Editable generated handles (drag)
Problem aspect: Editable generated handle drag uses custom behavior classes.
Solution (plain language): Use shared behavior on handle positions, translate to skeleton handle offsets in the adapter.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Drag editable generated handles and confirm skeleton handle offsets update.
Verification criteria:
- All C8 drag handle rows pass in the matrix.
- Progress report entry added.

### Step 4.10: Editable generated points/handles (nudge)
Problem aspect: Nudge for editable generated points/handles is pointer-owned.
Solution (plain language): Implement canonical nudge adapters using shared behavior and translation to skeleton changes.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Nudge editable generated points and handles with arrow keys.
- Repeat with shift and alt modifiers.
Verification criteria:
- All C8 nudge rows pass in the matrix.
- Progress report entry added.

## Phase 5: Pointer Transport-Only Audit

### Step 5.1: Remove drag/nudge math from pointer
Problem aspect: Pointer still performs drag/nudge math and persistence.
Solution (plain language): Remove drag/nudge handlers for in-scope kinds and keep only routing to composer.
Code snippets:
- src-js/views-editor/src/edit-tools-pointer.js
Manual tests:
- Repeat a representative subset of drag/nudge tests for each object kind.
Verification criteria:
- Pointer contains no drag/nudge persistence calls.
- handleDragSelection and handleArrowKeys are routing-only for in-scope kinds.
- Progress report entry added.

## Phase 6: Full Parity Sweep

### Step 6.1: Matrix-wide manual test
Problem aspect: Final parity needs confirmation across all in-scope kinds.
Solution (plain language): Execute the full action/object matrix and record results.
Code snippets:
- docs/refactor/action-object-matrix.md
Manual tests:
- Run every Yes/Specificity cell in the matrix.
Verification criteria:
- All matrix cells PASS.
- Undo/redo verified for each action set.
- Progress report entry added.


---

# Granular Plan (SoT-Based, Rectification Focus)

This section expands the SoT into concrete, testable steps without deleting prior content.
All steps must follow the required progress-report format (problem -> code analysis -> comparison -> tests -> undo/redo).

## Phase A: Intent and Scope Lock

### Step A1: Confirm intent wording in this plan file
Problem aspect: The plan still frames “domain separation” as the goal instead of the method.
Solution (plain language): Add a short statement in this plan that unified behavior is the goal and domain separation is the method.
Code snippets:
- Update the plan header section in this file.
Manual tests:
- None (documentation step).
Verification criteria:
- Plan explicitly states the goal is unified behavior.
- Progress report entry added.

### Step A2: Scope and terminology lock
Problem aspect: “Skeleton handles” wording creates confusion; off-curve points should be treated consistently.
Solution (plain language): Standardize on “skeleton off-curve point” terminology and treat it as a normal off-curve point in the plan.
Code snippets:
- Update object-kind references in this plan.
Manual tests:
- None (documentation step).
Verification criteria:
- All steps refer to skeleton off-curve points (no “skeleton handle” ambiguity).
- Progress report entry added.

## Phase B: Pipeline Enforcement (Registry + Composer + Adapter Contract)

### Step B1: Registry is authoritative for routing
Problem aspect: Registry exists but is not the authoritative map for drag/nudge routing.
Solution (plain language): Ensure all drag/nudge routing decisions are made via registry maps, not pointer/composer ad-hoc logic.
Code snippets:
- src-js/views-editor/src/edit-behavior-registry.js
- src-js/views-editor/src/edit-behavior-composer.js
Manual tests:
- Drag regular points and skeleton points; confirm behavior unchanged.
Verification criteria:
- All drag/nudge routing goes through DRAG_ROUTING_MAP / NUDGE_ROUTING_MAP.
- Progress report entry added.

### Step B2: Adapter contract is enforced (no wrappers)
Problem aspect: “Adapters” are wrappers that call pointer methods, so persistence still lives in pointer.
Solution (plain language): Implement adapters as real translation + persistence layers that return {forward, rollback}.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Drag a skeleton on-curve point and a rib point; verify behavior matches baseline.
Verification criteria:
- No canonical adapter calls pointerTool._handle* methods.
- Progress report entry added.

### Step B3: Composer is orchestration-only
Problem aspect: Composer still applies changes directly for some kinds.
Solution (plain language): Move all applyChange/recordChanges work into adapters for in-scope kinds.
Code snippets:
- src-js/views-editor/src/edit-behavior-composer.js
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Drag a regular point; undo/redo works as before.
Verification criteria:
- Composer has no applyChange/recordChanges for drag/nudge.
- Progress report entry added.

## Phase C: Unified Behavior Engine

### Step C1: Remove per-kind behavior classes
Problem aspect: Multiple behavior engines violate unified behavior.
Solution (plain language): Remove RibEditBehavior / EditableRibBehavior / InterpolatingRibBehavior / EditableHandleBehavior and route all point-like edits through the shared behavior engine + adapters.
Code snippets:
- src-js/views-editor/src/edit-behavior.js
Manual tests:
- Drag regular on-curve/off-curve points.
- Drag editable generated points.
Verification criteria:
- No per-kind behavior classes remain in edit-behavior.js.
- Progress report entry added.

## Phase D: Canonical Adapters (Object-Kind Migration)

### Step D1: Regular points/anchors/guidelines (drag)
Problem aspect: Regular drag still depends on legacy orchestration.
Solution (plain language): Implement canonical drag adapters for regular kinds using shared behavior + direct persistence.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Drag regular points, anchors, guidelines (default/shift/alt).
Verification criteria:
- All C1-C4 drag rows PASS.
- Progress report entry added.

### Step D2: Regular points/anchors/guidelines (nudge)
Problem aspect: Regular nudge still bypasses adapters.
Solution (plain language): Implement canonical nudge adapters for regular kinds.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Nudge regular points, anchors, guidelines (normal/shift/shift+ctrl/meta).
Verification criteria:
- All C1-C4 nudge rows PASS.
- Progress report entry added.

### Step D3: Skeleton on-curve/off-curve (drag)
Problem aspect: Skeleton drag math and persistence still live in pointer.
Solution (plain language): Implement canonical drag adapters for skeleton on-curve/off-curve points using shared behavior and skeleton persistence.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Drag skeleton on-curve and off-curve points (default/shift/alt).
Verification criteria:
- All C5-C6 drag rows PASS.
- Progress report entry added.

### Step D4: Skeleton on-curve/off-curve (nudge)
Problem aspect: Skeleton nudge still lives in pointer.
Solution (plain language): Implement canonical nudge adapters for skeleton on-curve/off-curve points.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Nudge skeleton on-curve/off-curve points (normal/shift/alt).
Verification criteria:
- All C5-C6 nudge rows PASS.
- Progress report entry added.

### Step D5: Skeleton equalize (drag + nudge)
Problem aspect: Equalize behavior is pointer-owned and special-cased.
Solution (plain language): Move skeleton off-curve equalize into canonical adapters.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Drag skeleton off-curve with X and X+shift.
- Nudge skeleton off-curve with X and X+shift.
Verification criteria:
- All C6 equalize rows PASS.
- Progress report entry added.

### Step D6: Rib points (drag)
Problem aspect: Rib drag uses per-kind behavior.
Solution (plain language): Use shared behavior output, project onto normal in the adapter, persist width changes.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Drag rib points (left/right), including Z/D/S modes.
Verification criteria:
- All C7 drag rows PASS.
- Progress report entry added.

### Step D7: Rib points (nudge)
Problem aspect: Rib nudge is pointer-owned.
Solution (plain language): Implement canonical nudge adapter with shared behavior + projection.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Nudge rib points (normal/shift/alt/Z variants).
Verification criteria:
- All C7 nudge rows PASS.
- Progress report entry added.

### Step D8: Editable generated points (drag)
Problem aspect: Editable generated point drag uses custom behavior classes.
Solution (plain language): Use shared behavior on generated point positions, then translate to skeleton width/nudge in adapter.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Drag editable generated points (left/right) and confirm skeleton widths update.
Verification criteria:
- All C8 drag rows PASS.
- Progress report entry added.

### Step D9: Editable generated handles (drag)
Problem aspect: Editable generated handle drag uses custom behavior classes.
Solution (plain language): Use shared behavior on handle positions, translate to skeleton handle offsets in adapter.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Drag editable generated handles; confirm skeleton handle offsets update.
Verification criteria:
- All C8 drag handle rows PASS.
- Progress report entry added.

### Step D10: Editable generated points/handles (nudge)
Problem aspect: Nudge for editable generated points/handles is pointer-owned.
Solution (plain language): Implement canonical nudge adapters with shared behavior + translation.
Code snippets:
- src-js/views-editor/src/pointer-objects.js
Manual tests:
- Nudge editable generated points/handles (normal/shift/alt).
Verification criteria:
- All C8 nudge rows PASS.
- Progress report entry added.

## Phase E: Pointer Transport-Only Audit

### Step E1: Remove drag/nudge math from pointer
Problem aspect: Pointer still performs drag/nudge math and persistence.
Solution (plain language): Remove drag/nudge handlers for in-scope kinds; keep routing only.
Code snippets:
- src-js/views-editor/src/edit-tools-pointer.js
Manual tests:
- Repeat representative drag/nudge tests for each object kind.
Verification criteria:
- No drag/nudge persistence calls remain in pointer.
- handleDragSelection and handleArrowKeys are routing-only.
- Progress report entry added.

## Phase F: Full Parity Sweep

### Step F1: Matrix-wide manual test
Problem aspect: Final parity needs confirmation.
Solution (plain language): Execute the full action/object matrix and record results.
Code snippets:
- docs/refactor/action-object-matrix.md
Manual tests:
- Run every Yes/Specificity cell.
Verification criteria:
- All matrix cells PASS.
- Undo/redo verified for each action set.
- Progress report entry added.


---

# Appendix: Adapter Clarification (Extracted)

Source: docs/refactor/phase-6-clarification.md (2026-03-03)
Purpose: Preserve the useful, concrete guidance without keeping a separate phase-numbered doc.

## Key Clarifications (Still Required)

1. Adapters are not routing wrappers.
   - Adapters must translate behavior output and own persistence.
   - Adapters must return {forward, rollback} change objects.

2. Editable generated points are regular points in generated contours.
   - Use shared behavior for {x, y} movement.
   - Translate {x, y} to skeleton width/nudge in the adapter.

3. Remove per-kind behavior classes.
   - RibEditBehavior, EditableRibBehavior, InterpolatingRibBehavior, EditableHandleBehavior must be removed.

4. Pointer must be transport-only for drag and nudge.
   - Pointer does hit testing, selection, routing, and UI feedback only.

## Implementation Notes (Concrete, Still Useful)

### Editable generated points (adapter flow)
Use shared behavior, then translate to skeleton data:
```js
const behaviorFactory = new EditBehaviorFactory(glyph, selection);
const behavior = behaviorFactory.getBehavior("default");

for await (const event of eventStream) {
  const delta = calculateDelta(event, initialEvent);
  const pointChanges = behavior.applyDelta(delta); // {pointIndex, x, y}

  const skeletonChanges = translatePointToSkeleton(pointChanges, skeletonData);
  applySkeletonChanges(skeletonData, skeletonChanges);
  regenerateSkeletonContours(glyph, skeletonData);
}
```

Translation sketch:
```js
function translatePointToSkeleton(pointChange, skeletonData) {
  const { x, y } = pointChange;
  const normal = calculateNormalAtSkeletonPoint(...);
  const tangent = { x: -normal.y, y: normal.x };
  const expectedBasePos = calculateExpectedRibPosition(skeletonPoint, side);
  const deltaFromBase = { x: x - expectedBasePos.x, y: y - expectedBasePos.y };
  const halfWidthDelta = dot(deltaFromBase, normal);
  const nudgeDelta = dot(deltaFromBase, tangent);
  return { halfWidth: originalHalfWidth + halfWidthDelta, nudge: originalNudge + nudgeDelta };
}
```

### What must be removed from pointer
Move these into adapters (names may be updated to “skeleton off-curve point”):
- `_handleDragSkeletonPoints`
- `_handleDragRibPoint`
- `_handleDragEditableGeneratedPoints`
- `_handleDragEditableGeneratedHandles`
- `_handleEqualizeHandlesDrag`
- `_handleEqualizeHandlesDragForPath`
- `_handleArrowKeysLegacy` (skeleton branch)
- `_handleArrowKeysForEditableHandles`
- `_handleArrowKeysForRibPoints`
- `_handleArrowKeysForEqualizeSkeletonHandles`
- `_handleArrowKeysForEqualizePathHandles`

### What must be removed from edit-behavior.js
- `RibEditBehavior`
- `EditableRibBehavior`
- `InterpolatingRibBehavior`
- `EditableHandleBehavior`

## Verification Checklist (Use in Phase E/F)
- `pointer-objects.js` adapters call `regenerateSkeletonContours` / `setSkeletonData` directly.
- `edit-tools-pointer.js` has no drag/nudge persistence calls for in-scope kinds.
- No adapter calls `pointerTool._handle*` methods.
- Grep shows no usage of Rib/Editable/Interpolating behavior classes in drag/nudge paths.
- Full matrix test passes (C5–C8 rows for drag/nudge), undo/redo verified.

