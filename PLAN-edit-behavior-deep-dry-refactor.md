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
### 7.0 Step Completion Gate (applies to every step)
A step is not complete unless all of the following are true:

1. It has an explicit link to architecture intent:
- Which part of `resolve intent -> resolve plan -> execute` this step improves.

2. It reduces or enables reduction of semantic drift:
- either removes local semantic branches now,
- or introduces shared primitives that are consumed by at least two independent execution paths.

3. It provides evidence in code review notes:
- exact files/lines touched,
- which semantic branches were removed or which central model was introduced,
- manual parity checks run.

4. It does not introduce new modality-specific semantic meaning in pointer call sites.

If any of these fail, the step status must remain `In progress`.

## Step 1 - Internal rib context helpers
Status: Completed

### Primary output
- `getContourPoint(...)`
- `getContourDefaultWidth(...)`
- `getOriginalHalfWidth(...)`
- `getOriginalNudge(...)`
- `buildTangentFromNormal(...)`

### Architecture intent linkage
- Establishes shared execution primitives used by multiple rib paths.
- Prevents per-class re-derivation of identical base state.

### Completion evidence required
- Helpers used by `RibEditBehavior`, `EditableRibBehavior`, `InterpolatingRibBehavior`.

## Step 2 - Offset key resolver centralization
Status: Completed

### Primary output
- `getHandleOffsetKeys(...)`
- `getRibHandleOffsetKeys(...)`
- `getRibNudgeKey(...)`

### Architecture intent linkage
- Moves key semantics to a single location.
- Prevents call-site key composition drift.

### Completion evidence required
- No direct side/type string concatenation remains in consumers.

## Step 3 - Shared projection math
Status: Completed

### Primary output
- `projectDelta(...)`
- `projectToNormalSigned(...)`
- `projectToTangent(...)`
- `clampHalfWidth(...)`

### Architecture intent linkage
- Centralizes geometric behavior semantics used by drag/nudge execution.
- Prevents sign/clamp divergence across modalities.

### Completion evidence required
- Rib width/nudge math paths use shared helpers rather than local formulas.

## Step 4 - Handle offset adapter (1D/2D bridge)
Status: Completed

### Primary output
- `readNormalizedHandleOffsets(...)`
- `buildCompensatedOffsets(...)`

### Architecture intent linkage
- Unifies offset representation before execution.
- Removes representation-specific semantic decisions from behavior classes.

### Completion evidence required
- Presence and normalization logic sourced from adapter, not duplicated in consumers.

## Step 5 - Rib strategy runtime
Status: Completed

### Primary output
- `createRibRuntimeContext(...)`
- `runRibStrategy(...)`
- strategy keys for basic/editable/interpolate

### Architecture intent linkage
- Centralizes how rib execution is applied after intent/plan selection.
- Replaces class-local execution drift with strategy runner.

### Completion evidence required
- Public rib classes delegate to runner for apply semantics.

## Step 5.5 - Intent parity architecture
Status: Completed

### Mandatory objective
Make intent and plan central, and make pointer call sites purely executors.

### Required outputs
1. Single intent gateway:
- `resolveModifierIntent(objectKind, flags)`

2. Single plan gateway:
- `resolveModifierPlan(objectKind, modality, intentOrFlags, context)`

3. Pointer parity:
- drag and nudge for each object kind consume plan output.
- pointer does not define semantic meaning via local modifier branches.

### Non-negotiable done criteria
Step 5.5 is complete only if all are true:

1. Same modifiers + same object kind => same intent in drag and nudge.
2. Any modality-specific behavior differences are defined in central plan mapping, not pointer branches.
3. Changing mapping for a modifier/object kind requires editing one central mapping location.
4. Unsupported combinations are explicit in central mapping (never silent no-op by omission).
5. Code review can list removed local semantic branches in pointer.

## Step 6 - Rollback payload builders
Status: Completed

### Primary output
- `buildRibRollbackPayload(...)`
- `buildHandleRollbackPayload(...)`

### Architecture intent linkage
- Centralizes rollback semantics after execution.
- Prevents class-level payload drift.

### Completion evidence required
- Rib/editable/interpolation/handle `getRollback()` routed through builders.

## Step 7 - Skeleton DRY pass
Status: Completed

### Primary output
- `buildMatchedEditEntry(...)`
- `partitionTransformVsConstrain(...)`
- `collectParticipatingIndices(...)`

### Architecture intent linkage
- Reduces duplicate internal skeleton execution assembly.
- Prepares skeleton path for plan-driven execution parity.

### Completion evidence required
- No rule semantic changes (`actionFactories` semantics preserved).

## Step 8 - Final consolidation and net reduction
Status: Pending

### Mandatory objective
Finish migration from distributed semantic branching to central intent/plan execution with net simplification.

### Required tasks
1. Remove dead/transitional helpers no longer needed.
2. Eliminate remaining pointer-local semantic branches for behavior meaning.
3. Reduce number of semantic branch points in pointer (net decrease from baseline).
4. Keep comments only where logic is non-obvious.

### Done criteria
1. No stale references.
2. Stable bundle/runtime.
3. Demonstrable reduction of semantic duplication hotspots.
4. Plan-to-execution mapping readable from one central area.

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
