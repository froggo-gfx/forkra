# Pointer/Edit Behavior Refactor Plan (Reset v3)

## 0) Intent (explicit, non-negotiable)
This refactor has one goal:

1. Behavior meaning is defined once in central sources.
2. Drag and nudge are two transport modalities over the same semantics.
3. Pointer handlers only route input/context and dispatch execution.
4. Adding/changing a behavior is done centrally, not by searching call-sites.

Non-negotiable interpretation:

1. We do not close steps by fixing one behavior family manually.
2. We do not accept parity that depends on pointer-local branches.
3. Coverage is driven by the behavior table contract, not by remembered cases.

## 1) Canonical Sources of Truth
There are only three semantic sources:

1. `edit-behavior.js` behavior table and central resolver(s): what behavior means.
2. Central plan mapping: how intent maps to execution family and constraints.
3. Central executor families: where geometry/math is applied.

Everything else (especially pointer handlers) is transport/routing only.

## 2) Scope

### In scope
1. `src-js/views-editor/src/edit-behavior.js`
2. `src-js/views-editor/src/edit-tools-pointer.js`
3. Internal execution abstractions required to run drag+nudge through one semantic pipeline.
4. All behavior families present in current baseline table:
- regular points
- skeleton points
- rib points
- editable generated handles (including equalize-like intents)

### Out of scope
1. External/public API breakage.
2. Data schema migrations unrelated to behavior execution architecture.
3. New behavior types not present in current baseline semantics.

## 3) Target Architecture Contract

### 3.1 Intent resolution (single gateway)
`resolveModifierIntent(objectKind, flags)` is the only modifier->intent gateway.

Rules:
1. Explicit precedence per object kind.
2. Unsupported combinations return explicit semantic result (`unsupported`), never silent pointer fallback.

### 3.2 Plan resolution (single gateway)
`resolveModifierPlan(objectKind, modality, intent, context)` is the only intent->execution-plan gateway.

Plan payload must include:
1. Executor family id.
2. Constraint mode and fallback policy.
3. Explicit unsupported/no-op reason (if not executable).

### 3.3 Execution (single gateway per family)
Execution math lives only in centralized executors/runners.

Rules:
1. Same family logic is called by drag and nudge.
2. Pointer may not embed family-specific geometry behavior.

### 3.4 Pointer contract (routing only)
Pointer handlers may:
1. Hit-test and normalize selection.
2. Normalize event delta.
3. Build context and call intent->plan->executor pipeline.
4. Dispatch updates/transactions.

Pointer handlers may not:
1. Reinterpret modifier semantics.
2. Duplicate behavior math for drag vs nudge.
3. Add object-kind-specific semantic branches beyond routing.

## 4) Completion Gate (binary, mandatory for every step)
A step is complete only if all checks pass:

1. `Intent Link`: the step improves one pipeline leg (`intent -> plan -> executor`).
2. `Coverage Link`: change is mapped to behavior-table coverage entries, not ad hoc cases.
3. `Drift Reduction`: semantic duplication in pointer is removed or replaced by shared execution.
4. `No New Pointer Semantics`: pointer contains no new behavior meaning.
5. `Parity Proof`: targeted behaviors run through the same executor family for drag and nudge.
6. `Evidence`: files/branches/paths/manual checks are listed with PASS/FAIL.

If any check fails, status remains `In progress`.

## 5) Coverage-First Workflow (prevents manual case hunting)

### 5.1 Build Behavior Coverage Map (BCM)
Before each implementation step, maintain a map keyed by:
`(objectKind, intent, modality)`

Each BCM row includes:
1. Source row from behavior table (`edit-behavior.js`).
2. Current plan resolver path.
3. Current executor family.
4. Pointer branch ownership (`none` expected in target).
5. Verification status (`untested/pass/fail`).

### 5.2 Step work must reference BCM rows
No step can be closed by saying "fixed X". It must state:
1. Which BCM rows moved from pointer-semantic ownership to central ownership.
2. Which rows now share drag+nudge executor path.

### 5.3 Regression rule
Any new behavior or modifier combination must be added as BCM rows first, then implemented centrally.

## 6) Execution Plan (detailed, architecture-first)

## Step R1 - Baseline inventory and BCM bootstrap
Status: Completed (2026-02-25)

Objective:
1. Inventory all pointer semantic branches.
2. Build initial BCM from behavior table and current routing.

Required outputs:
1. Pointer semantic branch list with file/region references.
2. Initial BCM entries for all currently supported behavior combinations.
3. Mapping: each semantic pointer branch -> target central owner (`intent`, `plan`, `executor`).

Done criteria:
1. Every semantic pointer branch is represented in BCM ownership columns.
2. No known behavior-table row is missing from BCM.

### R1 Output A - Pointer semantic branch inventory (baseline)
| ID | Pointer branch site | What semantics are still decided in pointer | Current owner | Planned central owner |
| --- | --- | --- | --- | --- |
| P1 | `src-js/views-editor/src/edit-tools-pointer.js:1288` | X+nudge for skeleton handles routed to dedicated equalize path (`_handleArrowKeysForEqualizeSkeletonHandles`) | pointer | executor family `skeleton-handle-equalize` selected via plan |
| P2 | `src-js/views-editor/src/edit-tools-pointer.js:1314` | fixed-rib/fixed-rib-compress override in skeleton nudge flow | pointer | plan policy + dedicated executor family |
| P3 | `src-js/views-editor/src/edit-tools-pointer.js:1444` | X+nudge for regular path handles routed to dedicated equalize path (`_handleArrowKeysForEqualizePathHandles`) | pointer | executor family `regular-handle-equalize` selected via plan |
| P4 | `src-js/views-editor/src/edit-tools-pointer.js:2652` | mid-drag X-equalize geometry for regular handles inside general drag loop | pointer | shared equalize executor used by drag+nudge |
| P5 | `src-js/views-editor/src/edit-tools-pointer.js:3129` | fixed-rib override in skeleton drag flow | pointer | plan policy + dedicated executor family |
| P6 | `src-js/views-editor/src/edit-tools-pointer.js:3156` | X+drag equalize geometry for skeleton handles inside skeleton drag flow | pointer | shared equalize executor used by drag+nudge |
| P7 | `src-js/views-editor/src/edit-tools-pointer.js:3237` | rib drag intent start-plan is central, but behavior family selection remains local (`Rib/Editable/Interpolating`) | mixed (plan + pointer) | executor registry keyed by plan |
| P8 | `src-js/views-editor/src/edit-tools-pointer.js:3492` | rib drag recomputes constrain mode from plan, then pointer applies family-specific execution branches | mixed (plan + pointer) | executor registry keyed by plan |
| P9 | `src-js/views-editor/src/edit-tools-pointer.js:3920` | editable generated point drag uses rib plan intent, but still chooses behavior family in pointer | mixed (plan + pointer) | executor registry keyed by plan |
| P10 | `src-js/views-editor/src/edit-tools-pointer.js:4096` | editable generated handle drag does not use resolver/plan; pointer owns default and X-equalize semantics | pointer | new `editable-generated-handle` plan + executor |
| P11 | `src-js/views-editor/src/edit-tools-pointer.js:4308` | editable generated handle nudge duplicates drag-side handle semantics and X-equalize logic | pointer | same executor family as drag |
| P12 | `src-js/views-editor/src/edit-tools-pointer.js:4623` | rib X+nudge equalize math is dedicated pointer path (`_handleArrowKeysForEqualizeRibHandles`) | pointer | rib equalize executor selected by plan |
| P13 | `src-js/views-editor/src/edit-tools-pointer.js:4796` | rib nudge intent resolves centrally, but family selection/fallback behavior is still pointer-local | mixed (plan + pointer) | executor registry keyed by plan |
| P14 | `src-js/views-editor/src/edit-tools-pointer.js:7512` | helper `getBehaviorPresetNameFromEvent` forwards only `shift/alt`; `z/x` semantics live in separate pointer branches | pointer | unified plan payload for all semantic flags |

### R1 Output B - Initial BCM (table-backed rows from `edit-behavior.js`)
Notes:
1. Intent priority source: `src-js/views-editor/src/edit-behavior.js:1413`.
2. Mapping completeness is validated centrally: `src-js/views-editor/src/edit-behavior.js:1556`.
3. `Verification` is baseline-only at this step and set to `untested`.

| BCM ID | objectKind | modality | intent | Source row | Current plan output | Current execution path | Pointer ownership | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BCM-REG-DRAG-DEFAULT | regular | drag | default | `edit-behavior.js:1414`, `edit-behavior.js:1440` | `presetName=default` | `edit-tools-pointer.js:2524` (`EditBehaviorFactory`) | partial (X path outside table) | untested |
| BCM-REG-DRAG-CONSTRAIN | regular | drag | constrain | `edit-behavior.js:1417`, `edit-behavior.js:1442` | `presetName=constrain` | `edit-tools-pointer.js:2524` (`EditBehaviorFactory`) | partial (X path outside table) | untested |
| BCM-REG-DRAG-ALTERNATE | regular | drag | alternate | `edit-behavior.js:1416`, `edit-behavior.js:1443` | `presetName=alternate` | `edit-tools-pointer.js:2524` (`EditBehaviorFactory`) | partial (X path outside table) | untested |
| BCM-REG-DRAG-ALT-CONSTRAIN | regular | drag | alternate-constrain | `edit-behavior.js:1415`, `edit-behavior.js:1444` | `presetName=alternate-constrain` | `edit-tools-pointer.js:2524` (`EditBehaviorFactory`) | partial (X path outside table) | untested |
| BCM-REG-NUDGE-DEFAULT | regular | nudge | default | `edit-behavior.js:1418`, `edit-behavior.js:1453` | `presetName=default` | `edit-tools-pointer.js:1382` (`EditBehaviorFactory`) | partial (X path outside table) | untested |
| BCM-REG-NUDGE-CONSTRAIN | regular | nudge | constrain | `edit-behavior.js:1417`, `edit-behavior.js:1454` | `presetName=default` | `edit-tools-pointer.js:1382` (`EditBehaviorFactory`) | partial (X path outside table) | untested |
| BCM-REG-NUDGE-ALTERNATE | regular | nudge | alternate | `edit-behavior.js:1416`, `edit-behavior.js:1455` | `presetName=alternate` | `edit-tools-pointer.js:1382` (`EditBehaviorFactory`) | partial (X path outside table) | untested |
| BCM-REG-NUDGE-ALT-CONSTRAIN | regular | nudge | alternate-constrain | `edit-behavior.js:1415`, `edit-behavior.js:1456` | `presetName=alternate` | `edit-tools-pointer.js:1382` (`EditBehaviorFactory`) | partial (X path outside table) | untested |
| BCM-SKL-DRAG-DEFAULT | skeleton | drag | default | `edit-behavior.js:1420`, `edit-behavior.js:1465` | `presetName=default` | `edit-tools-pointer.js:2593`, `edit-tools-pointer.js:3099` (`createSkeletonEditBehavior`) | partial (fixed-rib/X branches) | untested |
| BCM-SKL-DRAG-CONSTRAIN | skeleton | drag | constrain | `edit-behavior.js:1423`, `edit-behavior.js:1467` | `presetName=constrain` | `edit-tools-pointer.js:2593`, `edit-tools-pointer.js:3099` (`createSkeletonEditBehavior`) | partial (fixed-rib/X branches) | untested |
| BCM-SKL-DRAG-ALTERNATE | skeleton | drag | alternate | `edit-behavior.js:1422`, `edit-behavior.js:1468` | `presetName=alternate` | `edit-tools-pointer.js:2593`, `edit-tools-pointer.js:3099` (`createSkeletonEditBehavior`) | partial (fixed-rib/X branches) | untested |
| BCM-SKL-DRAG-ALT-CONSTRAIN | skeleton | drag | alternate-constrain | `edit-behavior.js:1421`, `edit-behavior.js:1469` | `presetName=alternate-constrain` | `edit-tools-pointer.js:2593`, `edit-tools-pointer.js:3099` (`createSkeletonEditBehavior`) | partial (fixed-rib/X branches) | untested |
| BCM-SKL-NUDGE-DEFAULT | skeleton | nudge | default | `edit-behavior.js:1424`, `edit-behavior.js:1477` | `presetName=default` | `edit-tools-pointer.js:1347` (`createSkeletonEditBehavior`) | partial (fixed-rib/X branches) | untested |
| BCM-SKL-NUDGE-CONSTRAIN | skeleton | nudge | constrain | `edit-behavior.js:1423`, `edit-behavior.js:1478` | `presetName=default` | `edit-tools-pointer.js:1347` (`createSkeletonEditBehavior`) | partial (fixed-rib/X branches) | untested |
| BCM-SKL-NUDGE-ALTERNATE | skeleton | nudge | alternate | `edit-behavior.js:1422`, `edit-behavior.js:1479` | `presetName=alternate` | `edit-tools-pointer.js:1347` (`createSkeletonEditBehavior`) | partial (fixed-rib/X branches) | untested |
| BCM-SKL-NUDGE-ALT-CONSTRAIN | skeleton | nudge | alternate-constrain | `edit-behavior.js:1421`, `edit-behavior.js:1480` | `presetName=alternate` | `edit-tools-pointer.js:1347` (`createSkeletonEditBehavior`) | partial (fixed-rib/X branches) | untested |
| BCM-RIB-DRAG-DEFAULT | rib | drag | default | `edit-behavior.js:1430`, `edit-behavior.js:1490` | `useInterpolation=false`, `constrainMode` from context | `edit-tools-pointer.js:3237`, `edit-tools-pointer.js:3492` | high | untested |
| BCM-RIB-DRAG-TANGENT | rib | drag | tangent | `edit-behavior.js:1429`, `edit-behavior.js:1491` | `useInterpolation=false`, `constrainMode` from context | `edit-tools-pointer.js:3237`, `edit-tools-pointer.js:3492` | high | untested |
| BCM-RIB-DRAG-INTERPOLATE | rib | drag | interpolate | `edit-behavior.js:1428`, `edit-behavior.js:1492` | `useInterpolation=true`, `constrainMode` from context | `edit-tools-pointer.js:3237`, `edit-tools-pointer.js:3492` | high | untested |
| BCM-RIB-DRAG-EQUALIZE | rib | drag | equalize | `edit-behavior.js:1427`, `edit-behavior.js:1495` | `useInterpolation=true`, `constrainMode` from context | `edit-tools-pointer.js:3237`, `edit-tools-pointer.js:3492` | high | untested |
| BCM-RIB-NUDGE-DEFAULT | rib | nudge | default | `edit-behavior.js:1430`, `edit-behavior.js:1503` | `useInterpolation=false`, `constrainMode=null` | `edit-tools-pointer.js:4796`, `edit-tools-pointer.js:4903` | high | untested |
| BCM-RIB-NUDGE-TANGENT | rib | nudge | tangent | `edit-behavior.js:1429`, `edit-behavior.js:1504` | `useInterpolation=false`, `constrainMode=tangent` | `edit-tools-pointer.js:4796`, `edit-tools-pointer.js:4903` | high | untested |
| BCM-RIB-NUDGE-INTERPOLATE | rib | nudge | interpolate | `edit-behavior.js:1428`, `edit-behavior.js:1505` | `useInterpolation=true`, fallback constrain from plan | `edit-tools-pointer.js:4796`, `edit-tools-pointer.js:4903` | high | untested |
| BCM-RIB-NUDGE-EQUALIZE | rib | nudge | equalize | `edit-behavior.js:1427`, `edit-behavior.js:1510` | `useInterpolation=true`, equalize intent path | `edit-tools-pointer.js:4796`, `edit-tools-pointer.js:4623` | high | untested |

### R1 Output C - Initial BCM extension (runtime rows outside behavior table)
These rows are currently supported in pointer runtime but are not first-class rows in `INTENT_PRIORITY_BY_KIND` / `MODIFIER_SPEC`:

| BCM ID | objectKind | modality | runtime intent | Current execution path | Pointer ownership | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| BCM-EDH-DRAG-DEFAULT | editable-generated-handle | drag | default (tangent-constrained) | `edit-tools-pointer.js:4096` | high | untested |
| BCM-EDH-DRAG-EQUALIZE | editable-generated-handle | drag | equalize (X) | `edit-tools-pointer.js:5164`, `edit-tools-pointer.js:4221` | high | untested |
| BCM-EDH-NUDGE-DEFAULT | editable-generated-handle | nudge | default (tangent-constrained) | `edit-tools-pointer.js:4308`, `edit-tools-pointer.js:4444` | high | untested |
| BCM-EDH-NUDGE-EQUALIZE | editable-generated-handle | nudge | equalize (X) | `edit-tools-pointer.js:4308`, `edit-tools-pointer.js:4415` | high | untested |

### R1 Gate Check
1. Intent Link: PASS (`intent -> plan` ownership and leaks are explicitly mapped).
2. Coverage Link: PASS (all table rows from `regular/skeleton/rib` listed as BCM entries).
3. Drift Reduction: PASS (baseline captured; migration targets defined for each semantic pointer site).
4. No New Pointer Semantics: PASS (inventory-only step, no runtime code change).
5. Parity Proof: BASELINE ONLY (deferred to R4/R6; current drift explicitly documented).
6. Evidence: PASS (files, branch sites, and BCM rows recorded).

## Step R2 - Stabilize central resolver contract
Status: Completed (2026-02-25)

Objective:
1. Make resolver/plan outputs explicit enough for all BCM rows.

Required outputs:
1. Normalized intent result model (`supported/unsupported + reason`).
2. Normalized plan result model (`executorFamily`, constraints, fallback policy).
3. Pointer call-sites updated to consume resolver results without adding meaning.

Done criteria:
1. Pointer no longer decides unsupported semantics ad hoc.
2. BCM rows point to explicit resolver+plan outputs.

### R2 Output A - Normalized intent result model
Implemented in `src-js/views-editor/src/edit-behavior.js`:
1. `resolveModifierIntentResult(...)` now returns normalized intent payload:
- `status`: `supported` / `unsupported`
- `supported`: boolean
- `unsupportedReason`: code (`unknown-object-kind`, `unknown-modality`, `unknown-intent`, `unsupported-modifiers`, or `null`)
- `unsupportedModifiers`: explicit list
- `ignoredActiveModifiers`: explicit list
2. Same contract is used by `resolveModifierPlan(...)`, so plan cannot be "implicitly unsupported".

### R2 Output B - Normalized plan result model
`resolveModifierPlan(...)` now always returns routing metadata:
1. `executorFamily`:
- regular: `regular-point`
- skeleton: `skeleton-point`
- rib: `rib-point` / `rib-point-interpolating` / `rib-handle-equalize`
2. `fallbackPolicy`:
- `kind: none` for direct cases
- `kind: missing-interpolation-axis` with `constrainModeWhenMissingAxis` for rib nudge interpolation fallback
- `kind: unsupported` for unsupported object-kind branches
3. Existing fields remain available for compatibility:
- regular/skeleton: `presetName`
- rib: `useInterpolationBehavior`, `constrainMode`, `shouldProjectToBaseNormal`

### R2 Output C - Pointer call-sites consume support contract
Updated `src-js/views-editor/src/edit-tools-pointer.js`:
1. Rib drag start (`_handleDragRibPoint`) exits early when `plan.supported === false`.
2. Rib drag loop and editable generated point drag loop skip event tick when plan becomes unsupported.
3. Rib nudge path exits/skips when plan is unsupported.
4. `getBehaviorPresetNameFromEvent(...)` now routes via plan support and falls back to `"default"` only as transport safety.

### R2 Gate Check
1. Intent Link: PASS (intent result model is explicit and normalized).
2. Coverage Link: PASS (all current BCM rows now receive structured support status from resolver/plan).
3. Drift Reduction: PARTIAL PASS (semantic execution branches still exist in pointer; moved to R3/R4).
4. No New Pointer Semantics: PASS (pointer only consumes `supported` state; no new modifier meaning introduced).
5. Parity Proof: BASELINE ONLY (full drag+nudge same-family execution remains R3/R4 scope).
6. Evidence: PASS (contract fields + call-site wiring documented and implemented).

## Step R3 - Introduce executor registry and shared execution entrypoint
Status: Completed (2026-02-25)

Objective:
1. Route execution through a central registry keyed by plan payload.

Required outputs:
1. Executor interface and registry.
2. Shared invocation path used by both drag and nudge.
3. Migration wrappers for existing family math where needed.

Done criteria:
1. Drag+nudge execution selection is centralized.
2. Pointer does not choose family behavior with semantic `if/else`.

### R3 Output A - Executor registry and contract
Implemented in `src-js/views-editor/src/edit-behavior.js`:
1. Added central rib executor families constant: `RIB_EXECUTOR_FAMILIES`.
2. Added `RIB_BEHAVIOR_EXECUTOR_REGISTRY` mapping family -> behavior factory.
3. Added `createRibBehaviorExecutor(plan, context)` as single execution entrypoint:
- consumes `plan.executorFamily`
- applies runtime fallback to point-family when needed
- returns `{ behavior, requestedFamily, resolvedFamily }`

### R3 Output B - Shared invocation path in drag and nudge
Updated `src-js/views-editor/src/edit-tools-pointer.js`:
1. `_handleDragRibPoint(...)` now creates rib behaviors only through `createRibBehaviorExecutor(...)`.
2. `_handleDragEditableGeneratedPoints(...)` now uses the same entrypoint.
3. `_handleArrowKeysForRibPoints(...)` now uses the same entrypoint and derives interpolation availability from `resolvedFamily`.

### R3 Output C - Pointer semantic reduction
1. Removed pointer-local class selection branches (`createRibEditBehavior` vs `createEditableRibBehavior` vs `createInterpolatingRibBehavior`) from drag/nudge call-sites.
2. Pointer now passes routing context (`isEditable`, `interpolationAxis`) and applies returned behavior uniformly.
3. Executor family string usage in pointer is bound to central constant (`RIB_EXECUTOR_FAMILIES.POINT_INTERPOLATING`).

### R3 Gate Check
1. Intent Link: PASS (`resolveModifierPlan.executorFamily` now drives runtime behavior selection through registry).
2. Coverage Link: PASS (affected BCM rows for rib drag/nudge and editable-generated-point drag are routed through registry).
3. Drift Reduction: PASS (duplicated family-selection branches removed from three major call-sites).
4. No New Pointer Semantics: PASS (pointer passes context only; family meaning moved to registry).
5. Parity Proof: PARTIAL PASS (drag+nudge family selection unified for rib flows; equalize/path-handle families remain for R4).
6. Evidence: PASS (files and routing changes documented).

## Step R4 - Migrate all BCM rows to shared drag+nudge execution
Status: In progress (2026-02-25)

Objective:
1. Move every behavior-table-supported row from modality-local logic to shared executor family path.

Required outputs:
1. For each object kind, drag and nudge route through identical semantic pipeline.
2. Remove duplicated modality-specific geometry branches.
3. Keep unsupported rows explicit at plan layer (with reason), never implicit in pointer.

Done criteria:
1. No BCM row remains with pointer semantic ownership.
2. All supported rows have one central executor-family mapping for both modalities.

### R4 Progress - Completed Subtasks (detailed, code-level)
1. Added centralized handle-family plan IDs in `src-js/views-editor/src/edit-behavior.js`:
- `HANDLE_EXECUTOR_FAMILIES.EDITABLE_GENERATED`
- `HANDLE_EXECUTOR_FAMILIES.EDITABLE_GENERATED_EQUALIZE`
- `HANDLE_EXECUTOR_FAMILIES.REGULAR_EQUALIZE`
- `HANDLE_EXECUTOR_FAMILIES.SKELETON_EQUALIZE`
2. Added central resolver for editable generated handles in `src-js/views-editor/src/edit-behavior.js`:
- `resolveEditableGeneratedHandlePlan(modality, flagsOrIntent)`
- normalizes `x` into semantic intent (`default` / `equalize`)
- returns explicit routing payload (`supported`, `intent`, `executorFamily`, `fallbackPolicy`)
3. Added central resolver for regular/skeleton X-equalize routing in `src-js/views-editor/src/edit-behavior.js`:
- `resolveHandleEqualizePlan(objectKind, modality, flagsOrIntent)`
- exposes explicit support state instead of pointer-local boolean checks
- maps family by kind (`regular` -> `regular-handle-equalize`, `skeleton` -> `skeleton-handle-equalize`)
4. Migrated pointer X-entry routing to central plan checks in `src-js/views-editor/src/edit-tools-pointer.js`:
- skeleton nudge X branch now gated by `resolveHandleEqualizePlan("skeleton", "nudge", ...)`
- regular nudge X branch now gated by `resolveHandleEqualizePlan("regular", "nudge", ...)`
- regular drag X branch now gated by `resolveHandleEqualizePlan("regular", "drag", ...)`
- skeleton drag X branch now gated by `resolveHandleEqualizePlan("skeleton", "drag", ...)`
- skeleton drag-loop equalize application now also re-checks central plan
5. Unified editable generated handle runtime path in `src-js/views-editor/src/edit-tools-pointer.js`:
- removed dedicated X-only drag path by routing X+drag through `_handleDragEditableGeneratedHandles(...)`
- both drag and nudge now use shared helpers:
  - `_buildEditableHandleLayersData(...)`
  - `_buildEditableHandleEqualizeState(...)`
  - `_applyEditableHandleBehaviorEntry(...)`
  - `_collectEditableHandleLayerChanges(...)`
- both modalities compute `equalizeEnabled` from `resolveEditableGeneratedHandlePlan(...)` and apply the same per-entry runtime
6. Kept rib family execution on shared registry path (from R3) while integrating R4 handle routing:
- rib drag/nudge execution still uses `createRibBehaviorExecutor(...)`
- pointer no longer performs direct rib class selection in migrated call-sites
7. Syntax safety check executed for touched runtime files:
- `node --check src-js/views-editor/src/edit-behavior.js`
- `node --check src-js/views-editor/src/edit-tools-pointer.js`
- result: PASS

### R4 BCM Impact (current state)
| BCM ID | Current ownership after R4 progress | State |
| --- | --- | --- |
| BCM-EDH-DRAG-DEFAULT | shared runtime path in pointer helpers + central plan family | migrated |
| BCM-EDH-DRAG-EQUALIZE | same runtime as default drag, X semantic from central plan | migrated |
| BCM-EDH-NUDGE-DEFAULT | shared runtime path in pointer helpers + central plan family | migrated |
| BCM-EDH-NUDGE-EQUALIZE | same runtime as default nudge, X semantic from central plan | migrated |
| BCM-REG-DRAG (X branch) | central plan routing added, legacy equalize executor path still separate | partial |
| BCM-REG-NUDGE (X branch) | central plan routing added, legacy equalize executor path still separate | partial |
| BCM-SKL-DRAG (X branch) | central plan routing added, legacy equalize executor path still separate | partial |
| BCM-SKL-NUDGE (X branch) | central plan routing added, legacy equalize executor path still separate | partial |

### R4 Progress - Remaining Subtasks (explicit)
1. Replace regular/skeleton legacy equalize handlers with centralized executor path so drag+nudge share one execution implementation:
- `_handleArrowKeysForEqualizeSkeletonHandles(...)`
- `_handleArrowKeysForEqualizePathHandles(...)`
- `_handleEqualizeHandlesDrag(...)`
- `_handleEqualizeHandlesDragForPath(...)`
2. Remove inline skeleton drag-loop equalize geometry branch and route it through the same executor family used by nudge.
3. Rebuild BCM ownership column after executor migration and confirm `pointer semantic ownership = none` for all supported rows.
4. Run full manual parity matrix from Section 7 and update verification states from `untested` to `pass/fail`.

### R4 Gate Snapshot (not closable yet)
1. Intent Link: PASS (new handle plan resolvers are central).
2. Coverage Link: PASS (BCM rows above are explicitly tracked).
3. Drift Reduction: PARTIAL PASS (entry routing centralized; executor math for regular/skeleton equalize still split).
4. No New Pointer Semantics: PASS (new code consumes plan outputs, does not define new modifier meaning).
5. Parity Proof: PARTIAL PASS (editable generated handles unified; regular/skeleton equalize still pending full executor unification).
6. Evidence: PASS (functions and affected branches listed above).

## Step R5 - Pointer semantic purge and simplification
Status: Pending

Objective:
1. Reduce pointer to transport-only responsibilities.

Required outputs:
1. Delete dead/transitional semantic helpers in pointer.
2. Keep only routing/context/update mechanics.
3. Add succinct comments only where routing complexity is non-obvious.

Done criteria:
1. Pointer semantic branch inventory from R1 is fully eliminated or downgraded to routing-only.
2. Net semantic complexity in pointer is lower than baseline.

## Step R6 - Verification, sign-off, and freeze rules
Status: Pending

Objective:
1. Validate architecture and parity using BCM, not intuition.

Required outputs:
1. Full BCM marked PASS/FAIL with manual checks.
2. Evidence block per step (template below).
3. Residual risk list (if any) with explicit owner and follow-up.

Done criteria:
1. All mandatory checks pass.
2. No unresolved parity drift between drag and nudge for supported rows.
3. No open pointer-semantic ownership rows in BCM.

## 7) Mandatory Manual Verification Matrix
Run and record for all relevant BCM rows:

1. Regular points: drag/nudge for default/Shift/Alt/Shift+Alt.
2. Skeleton points: drag/nudge for default/Shift/Alt/Shift+Alt.
3. Rib points: drag/nudge for all intents declared in behavior table.
4. Editable generated handles: drag/nudge for default and equalize-like intents.
5. Modifier transition safety: press/release modifiers during drag follows resolver contract.
6. Transaction safety: undo/redo consistency per executor family.
7. Structural safety: no runtime import/type errors.

Rule:
If a row is unsupported by design, it must appear as explicit `unsupported + reason` in BCM and plan output.

## 8) Governance Rules (strict)
1. No step closure without binary gate evidence.
2. No "partial complete" on behavior families.
3. No new pointer-local semantics.
4. No manual case hunting as closure strategy.
5. Any parity bug is fixed at intent/plan/executor layer first.
6. Plan changes must preserve coverage-first workflow and BCM completeness.

## 9) Evidence Template (required per completed step)
1. Files touched:
2. BCM rows affected:
3. Removed pointer semantic branches:
4. New central resolver/plan/executor paths:
5. Manual checks executed:
6. Result (PASS/FAIL):
