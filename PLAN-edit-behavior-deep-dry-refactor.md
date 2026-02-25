# Pointer/Edit Behavior Refactor Plan

## 0) Intent (explicit, non-negotiable)
This refactor exists to enforce one architecture rule:

- Behavior meaning is defined once.
- Drag and nudge consume the same meaning.
- Changing behavior must require editing one central model, not chasing duplicated `if/else` branches.

If a change does not move us toward this rule, it is not in scope, even if it "works."

## 1) Problem Statement
Current behavior logic is split across:

- `src-js/views-editor/src/edit-behavior.js`
- `src-js/views-editor/src/edit-tools-pointer.js`

This creates drift risk:

- Modifier interpretation duplicated by modality (`drag` vs `nudge`).
- Object-kind semantics (`regular` / `skeleton` / `rib`) not always centralized.
- Rollback/build logic repeated across classes.

Result: parity bugs, high cognitive load, and expensive behavior changes.

## 2) Refactor Objective
Move from "distributed behavior branching" to an "intent-driven architecture":

1. Resolve modifier intent once per object kind.
2. Resolve execution plan from that intent.
3. Execute plan in each modality without redefining semantics.

## 3) Scope and Non-Scope

### In scope
- `src-js/views-editor/src/edit-behavior.js`
- Minimal call-site rewiring in `src-js/views-editor/src/edit-tools-pointer.js`
- Internal helper extraction and strategy routing
- Rollback payload unification
- Explicit intent/parity contract documentation

### Out of scope
- Public API breakage
- Skeleton data schema changes
- Routing redesign of pointer tool ownership
- New automated tests in this refactor track

## 4) Hard Constraints

1. Public exports/signatures remain stable:
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

2. No hidden modality-specific reinterpretation of modifiers.
3. Any unsupported modifier combination must be explicit in a central table/resolver, never implicit in call-site branches.

## 5) Architecture Contract

### 5.1 Core terms
- `object kind`: `regular`, `skeleton`, `rib`
- `modality`: `drag`, `nudge`
- `intent`: normalized semantic mode resolved from modifiers
- `plan`: executable behavior decisions derived from intent and object context

### 5.2 Mandatory flow
All pointer behavior must follow:

`raw flags -> resolve intent -> resolve plan -> execute`

`pointer` call sites may pass context, but may not redefine intent semantics.

### 5.3 "No branch drift" rule
In pointer handlers, this pattern is forbidden for behavior semantics:

- `if (alt) ... else if (z) ... else ...`

unless the branch calls a shared resolver/table and does not define meaning itself.

## 6) Single Source of Truth Requirements

### 6.1 Intent source
`resolveModifierIntent(objectKind, flags)` in `edit-behavior.js` is the semantic gateway.

Requirements:
- deterministic precedence per object kind
- parity across `drag`/`nudge`
- explicit handling of unsupported combinations

### 6.2 Plan source
Behavior execution choices must be represented centrally (table/resolver), including:
- strategy selection
- constrain mode
- interpolation/equalize policy
- rollback mode contract

### 6.3 Execution source
Behavior classes/runners apply plan data; pointer handlers should not encode business meaning.

## 7) Step Plan (Detailed)

## Step 1 - Internal rib context helpers
Status: Completed

### Delivered
- `getContourPoint(...)`
- `getContourDefaultWidth(...)`
- `getOriginalHalfWidth(...)`
- `getOriginalNudge(...)`
- `buildTangentFromNormal(...)`

### Acceptance
- No behavior deltas for rib/skeleton/regular drag baseline

## Step 2 - Offset key resolver centralization
Status: Completed

### Delivered
- `getHandleOffsetKeys(...)`
- `getRibHandleOffsetKeys(...)`
- `getRibNudgeKey(...)`

### Acceptance
- No key drift
- No undefined-key runtime errors in editable handle flows

## Step 3 - Shared projection math
Status: Completed

### Delivered
- `projectDelta(...)`
- `projectToNormalSigned(...)`
- `projectToTangent(...)`
- `clampHalfWidth(...)`

### Acceptance
- Width sign/parity preserved
- Clamp behavior unchanged

## Step 4 - Handle offset adapter (1D/2D bridge)
Status: Completed

### Delivered
- `readNormalizedHandleOffsets(...)`
- `buildCompensatedOffsets(...)`
- Presence flags sourced from adapter path

### Acceptance
- Alt interpolation keeps handles visually stable
- Rollback parity preserved

## Step 5 - Rib strategy runtime
Status: Completed

### Delivered
- `createRibRuntimeContext(...)`
- `runRibStrategy(...)`
- Strategy constants for basic/editable/interpolate

### Acceptance
- Rib drag matrix parity (basic/editable/interpolate/tangent)

## Step 5.5 - Intent parity architecture (re-opened until fully done)
Status: In progress (partial wiring done, architectural completion pending)

### Required end-state
- Shared intent resolver is not enough by itself.
- Shared execution plan resolution must also be centralized.
- Pointer drag/nudge must not contain semantic re-interpretation branches.

### Required tasks
1. Keep `resolveModifierIntent(objectKind, flags)` as the only intent gateway.
2. Add/complete centralized intent-to-plan mapping for object kinds and modalities.
3. Replace remaining local modality branches that define semantics.
4. Keep selection/routing ownership unchanged in pointer.
5. Document explicit support matrix per object kind (including unsupported combos).

### Definition of done
Step 5.5 is done only when:
- same modifiers on same object kind resolve to the same intent in drag and nudge
- pointer call sites do not redefine semantic meaning
- changing a modifier mapping requires editing one central mapping location

## Step 6 - Rollback payload builders
Status: Completed

### Delivered
- `buildRibRollbackPayload(...)`
- `buildHandleRollbackPayload(...)`
- Rib/editable/interpolation/handle `getRollback()` routing through builders

### Acceptance
- Undo/redo parity for rib/editable/interpolate/handle flows

## Step 7 - Skeleton DRY pass
Status: Completed

### Delivered
- `buildMatchedEditEntry(...)`
- `partitionTransformVsConstrain(...)`
- `collectParticipatingIndices(...)`

### Acceptance
- No rule semantic change
- Mixed selection parity retained

## Step 8 - Final consolidation and net reduction
Status: Pending

### Required tasks
1. Remove dead helpers and transitional wrappers.
2. Collapse remaining duplicated pointer-side semantic branches into centralized mapping.
3. Ensure net complexity reduction (fewer semantic branch points in pointer).
4. Keep comments only for non-obvious logic.

### Acceptance
- No stale references
- Stable bundle/runtime
- Reduced semantic duplication hotspots

## 8) Behavior Support Matrix Policy
Support must be explicit, centrally documented, and code-backed:

- If a modifier combination is unsupported for an object kind, this must be represented in one table/resolver.
- Silent "no-op by omission" in call-site logic is not acceptable.
- Adding new behavior mode must require central map update, not modality edits.

## 9) Manual Verification Matrix (Mandatory)

1. Regular points
- drag: default / Shift / Alt / Shift+Alt
- nudge: default / Shift / Alt / Shift+Alt
- undo/redo

2. Skeleton points
- drag: default / Shift / Alt / Shift+Alt
- nudge: default / Shift / Alt / Shift+Alt
- mixed selection with regular
- undo/redo

3. Rib points
- drag: default / editable / interpolation / tangent
- nudge: same intent mapping as drag for supported modes
- single-sided and linked variants
- undo/redo

4. Editable generated handles
- drag + nudge
- left/right, in/out
- detached and non-detached
- undo/redo

5. Cross-modality parity
- for each object kind, same modifiers => same intent => same semantic mode

6. Safety matrix
- modifier press/release during drag does not violate current contract
- no runtime import errors

## 10) Governance Rules For Future Changes

1. Any new behavior mode must be added through intent/plan central mapping first.
2. Any intentional UX delta must be documented in this file under a new "Intent Delta" entry before implementation.
3. If parity bug appears, fix resolver/plan tables first, not call-site branches.

## 11) Working Agreement
When discussing "is this in scope?":

- In scope if it improves central intent/plan architecture and reduces drift.
- Out of scope if it adds modality-specific semantic branches.

This file is the source of truth for that decision.
