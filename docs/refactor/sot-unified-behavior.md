# Single Source of Truth: Unified Behavior Pipeline

Date: 2026-03-04
Status: Draft (authoritative once approved)

## 1. Intent (Primary Goal)
Unify all editable object kinds under a single behavior set so the same behavior rules apply everywhere.

Domain separation is the method, not the goal. We separate responsibilities only to make unified behavior
possible, testable, and maintainable.

### What "Unified Behavior" means
- One behavior engine for all point-like edits.
- No parallel behavior systems by object kind.
- Object-specific differences live in adapters as translation and persistence rules.

### Why
- Consistency across regular, skeleton, rib, and editable-generated edits.
- Reduced duplication and drift.
- Easier parity with mainline and with future features.

### Non-negotiables
- One behavior engine. Any point-like movement uses it.
- Pointer is transport only for drag and nudge.
- Composer is orchestration only.
- Adapters own translation and persistence.
- Registry is the single map for capabilities and routing.

## 2. Intended Pipeline (Runtime Flow)
1. Pointer hit-tests and produces a selection.
2. Pointer determines the object kind and routes to composer.
3. Composer resolves modifiers and routes through the registry routing map.
4. Behavior engine computes point changes from delta.
5. Adapter translates behavior output into canonical data changes.
6. Adapter persists changes and returns { forward, rollback }.
7. Pointer commits returned changes (undo/redo).

## 3. Intended Architecture (Responsibilities)

### Behavior Engine (math only)
File: `src-js/views-editor/src/edit-behavior.js`
- Computes point changes from delta.
- No knowledge of storage, layers, skeleton data, or regeneration.
- Single engine for regular points, skeleton on-curve and off-curve points, ribs, and editable-generated points.

### Registry (declarative routing)
File: `src-js/views-editor/src/edit-behavior-registry.js`
- Object catalog and capabilities.
- Modifier-to-row mapping.
- Drag/nudge routing maps.
- No persistence or behavior math.

### Composer (orchestration only)
File: `src-js/views-editor/src/edit-behavior-composer.js`
- Orchestrates drag/nudge and calls adapters.
- Does not apply or record persistence directly.
- Does not branch on object kind outside the routing map.

### Adapters (translation + persistence)
File: `src-js/views-editor/src/pointer-objects.js`
- Translate {x,y} behavior output into object-specific canonical changes.
- Persist canonical data (including skeleton regeneration when required).
- Return { forward, rollback } change objects.
- Must not call pointer drag/nudge handlers.

### Pointer (transport only for drag/nudge)
File: `src-js/views-editor/src/edit-tools-pointer.js`
- Hit-test, selection, cursor/hover, routing.
- No behavior math or persistence for drag/nudge.
- For drag/nudge, only calls composer routing entry points.

## 4. Scope
In scope for unified behavior:
- Drag and nudge for regular points, anchors, guidelines.
- Drag and nudge for skeleton on-curve and off-curve points.
- Drag and nudge for rib points.
- Drag and nudge for editable generated points and handles.

Out of scope (explicitly deferred):
- Tunni-specific drag workflows.
- Non-drag actions like double-click, rect select, transform panel, component tools.

## 5. Plan (Broad Phases)

### Phase A: Baseline + Contracts
- Action/object matrix and inventory are the parity contract.
- Registry and routing maps are defined.
- Adapter contract is explicit.

### Phase B: Uniform Routing
- Drag and nudge routed through composer using registry maps.
- No behavior changes.

### Phase C: Real Adapters (Unify Behavior)
- Remove custom per-kind behavior classes.
- Use the single behavior engine for all point-like edits.
- Adapters perform translation and persistence.

### Phase D: Pointer Transport-Only
- Remove drag/nudge math and persistence from pointer.
- Pointer only routes and commits adapter results.

### Phase E: Parity Verification
- Full matrix run, undo/redo verified for all in-scope kinds.

## 6. Acceptance Criteria (Project-Level)
- No parallel behavior engines.
- Pointer contains no drag/nudge persistence or math.
- Adapters perform translation + persistence for all in-scope kinds.
- Composer does not persist.
- Full baseline matrix passes with identical behavior.
