# Target Architecture: File Structure and Data Flow

Date: 2026-03-10
Status: Target state specification

Primary Goal: Unify all in-scope point-like editable object kinds under a single behavior set.
Domain separation is the method used to achieve this goal.

Important scope rule:
- not every routed object kind belongs to the canonical point-like behavior engine
- Tunni and Q-measure remain separate domains
- they must still fit the same high-level pointer -> composer -> adapter pipeline when they are routed
- they must not bypass the pipeline by reintroducing pointer-owned execution
- do not describe Tunni as a "fallback" architecture; it is a specialized routed domain

Execution rule:
- architecture gates close before behavior changes start
- a gate is not closed while a disallowed owner, disallowed file, or adapter -> pointer bounce-back still exists
- completion must be verified mechanically against explicit conditions, not inferred from most of the work being done
- before editing, declare the target files and keep the step inside those existing files
- do not create new files for this chapter
- helper extraction does not justify a new file by itself

---

## Part 1: Desired File Structure

### Core Behavior Engine (Single Source of Truth for Canonical Point-Like Edits)

```
src-js/views-editor/src/edit-behavior.js
- EditBehaviorFactory (creates behavior instances)
- EditBehavior (shared behavior rules)
- Shared executor for canonical point-like kinds:
  regular points, skeleton on-curve/off-curve points, ribs, editable-generated
- No Tunni session ownership
```

Responsibility:
- pure behavior math for canonical point-like edits
- takes `delta` -> returns normalized point changes
- does not know about skeleton persistence, path regeneration, layers, or Tunni sessions

### Registry (Declarative Configuration)

```
src-js/views-editor/src/edit-behavior-registry.js
- OBJECT_KINDS (object catalog + capabilities)
- resolveBehaviorPreset (modifiers -> behavior preset)
- DRAG_ROUTING_MAP (row x objectKind -> CA/CL/NA)
- NUDGE_ROUTING_MAP (row x objectKind -> CA/CL/NA)
- getDragRowId (modifiers -> matrix row)
- getNudgeRowId (modifiers -> matrix row)
```

Responsibility:
- declarative routing configuration plus modifier/row mapping helpers
- no persistence or behavior math
- Tunni stays listed here as specialized routed drag kinds: `tunniPoint` and `skeletonTunniPoint`

### Composer (Uniform Orchestration)

```
src-js/views-editor/src/edit-behavior-composer.js
- runDragRoutingOrchestration (routes drag by object kind using routing map)
- runNudgeRoutingOrchestration (routes nudge by object kind using routing map)
- runDragOrchestration / runNudgeOrchestration (shared orchestration helpers, no persistence)
```

Responsibility:
- orchestration only
- dispatches canonical adapters for canonical routes
- dispatches specialized adapters for non-canonical routed domains such as Tunni
- does not own persistence, object-specific execution, or behavior math

### Adapters (Translation + Persistence)

```
src-js/views-editor/src/edit-behavior-adapters.js
- canonicalDragAdapters
  - regularPoint
  - anchor
  - guideline
  - skeletonPoint
  - skeletonHandle
  - skeletonRibPoint
  - editableGeneratedPoint
  - editableGeneratedHandle
- canonicalNudgeAdapters (same ownership as drag)
- mixedSelectionDragAdapters / mixedSelectionNudgeAdapters
- specializedDragAdapters for routed non-canonical domains
  - current code still names this map `fallbackDragAdapters`
  - Tunni belongs here until names are cleaned up in code
```

Responsibility:
1. translation from shared behavior output into object-specific canonical data for canonical routes
2. persistence for adapter-owned routes
3. boolean handled/unhandled contract back to composer
4. specialized execution ownership for routed non-canonical domains such as Tunni

Must not:
- call `pointerTool._handle*` execution methods
- parse selection strings
- do modifier mapping
- create new sidecar files for Tunni or measure helpers

### Shared Tunni Code

```
src-js/fontra-core/src/tunni-calculations.js
- single shared Tunni file for regular + skeleton reusable logic
- shared geometry
- shared equalization helpers
- any shareable Tunni formulas used by regular and skeleton workflows
```

Target rule:
- there is one shared Tunni file
- there is no separate skeleton-Tunni file in the target architecture
- skeleton-specific execution glue belongs in existing pointer-related files:
  - `src-js/views-editor/src/edit-tools-pointer.js`
  - `src-js/views-editor/src/edit-behavior-adapters.js`

### Pointer Tool (Transport Only)

```
src-js/views-editor/src/edit-tools-pointer.js
- handleDrag -> handleDragSelection (routes to composer)
- handleArrowKeys (routes to composer)
- handleHover
- handleRectSelect
- handleDoubleClick
- handleBoundsTransformSelection
- measure-mode lifecycle and hover transport
- Tunni hit testing, cursor updates, and route selection
```

Responsibility:
1. hit testing
2. selection management
3. routing
4. cursor and hover transport
5. measure-mode lifecycle

Must not:
- instantiate behavior classes for routed drag/nudge paths
- call `regenerateSkeletonContours`
- call `setSkeletonData`
- own live Tunni drag execution sessions

### Visualization Ownership

```
src-js/views-editor/src/visualization-layer-definitions.js
- Tunni visualization layers
- Tunni label registration
- Q overlay and distance/manhattan registrations

src-js/views-editor/src/skeleton-visualization-layers.js
- skeleton visualization layers
```

Responsibility:
- draw only
- no persistence
- no live drag-session ownership

### Storage (Canonical Data)

```
src-js/fontra-core/src/skeleton-contour-generator.js
- getSkeletonData
- setSkeletonData
- regenerateSkeletonContours
- helpers
```

Responsibility:
- only file family that knows canonical skeleton storage shape
- adapters call these functions
- pointer and composer do not persist skeleton data directly

---

## Part 2: Mouse Input -> Data Storage Pipeline

### Scenario 0: Tunni Drag on the Existing Routing Surface

```
User Action: Mouse down on a regular or skeleton Tunni point, drag, mouse up

1. Pointer Tool
   -> hit test identifies `tunniPoint` or `skeletonTunniPoint`
   -> pointer owns cursor state and route selection only
   -> runDragRoutingOrchestration({ objectKind, ... })

2. Composer
   -> dispatch specialized Tunni adapter
   -> current code may still call this adapter map `fallbackDragAdapters`, but that name is not architectural guidance

3. Specialized Tunni Adapter
   -> starts adapter-owned drag session
   -> tracks input stream and delta
   -> calls shared reusable Tunni code from `tunni-calculations.js`
   -> persists:
      -> regular Tunni: update path points directly
      -> skeleton Tunni: update skeleton data, regenerate contours, write skeleton data

4. Storage
   -> regular Tunni writes `layerGlyph.path`
   -> skeleton Tunni writes `skeletonData` and regenerated path
```

Key:
- Tunni is routed through the same pointer -> composer -> adapter pipeline
- Tunni is not a canonical point-like behavior route
- Tunni execution is specialized, not backup or temporary

### Scenario 1: Regular Point Drag (Canonical)

```
User Action: Mouse down on regular path point, drag, mouse up

1. Pointer Tool
   -> objectKind = "regularPoint"
   -> runDragRoutingOrchestration(...)

2. Composer
   -> dispatch canonical adapter

3. Behavior Engine
   -> shared point-like executor from `edit-behavior.js`

4. Adapter
   -> persist to `layerGlyph.path`
```

### Scenario 2: Skeleton On-Curve/Off-Curve Point Drag (Canonical)

```
User Action: Mouse down on skeleton point, drag, mouse up

1. Pointer Tool
   -> objectKind = "skeletonPoint"

2. Composer
   -> dispatch canonical adapter

3. Adapter
   -> run shared point-like executor
   -> persist to skeleton data
   -> regenerate path
```

---

## Part 3: Data Flow Summary Table

| Object Kind | Route Family | Math Owner | Execution Owner | Persistence Target |
|-------------|--------------|------------|-----------------|-------------------|
| regularPoint | canonical | `edit-behavior.js` | canonical adapter | `layerGlyph.path` |
| anchor | canonical | `edit-behavior.js` | canonical adapter | `layerGlyph.anchors` |
| guideline | canonical | `edit-behavior.js` | canonical adapter | `layerGlyph.guidelines` |
| skeletonPoint | canonical | `edit-behavior.js` | canonical adapter | `skeletonData` + regenerate |
| skeletonHandle | canonical | `edit-behavior.js` | canonical adapter | `skeletonData` + regenerate |
| skeletonRibPoint | canonical | `edit-behavior.js` + skeleton helpers | canonical adapter | `skeletonData` + regenerate |
| editableGeneratedPoint | canonical | `edit-behavior.js` + adapter translation | canonical adapter | `skeletonData` + regenerate |
| editableGeneratedHandle | canonical | `edit-behavior.js` + adapter translation | canonical adapter | `skeletonData` + regenerate |
| tunniPoint | specialized routed | `tunni-calculations.js` | specialized Tunni adapter | `layerGlyph.path` |
| skeletonTunniPoint | specialized routed | `tunni-calculations.js` | specialized Tunni adapter | `skeletonData` + regenerate |

---

## Part 4: Tunni Guardrails

These are mandatory for the Tunni refactor target state:

1. Keep Tunni on the existing registry -> composer -> adapters surface.
2. Do not call it fallback in docs or planning; call it a specialized routed domain.
3. Keep one shared Tunni file: `src-js/fontra-core/src/tunni-calculations.js`.
4. Do not keep `src-js/views-editor/src/skeleton-tunni-calculations.js` as a Tunni owner in the target state.
5. Move specialized Tunni execution, including drag and equalize actions, into `src-js/views-editor/src/edit-behavior-adapters.js`.
6. Keep Tunni hit testing and route selection in `src-js/views-editor/src/edit-tools-pointer.js`.
7. Remove `_handleTunniPointDrag` and `_handleSkeletonTunniDrag` as execution owners from pointer.
8. Visualization files draw; they do not execute edits.
9. Do not move editor session logic into core.
10. Do not let wrappers preserve duplicate Tunni geometry.

---

## Summary

File structure:
- `edit-behavior.js` -> canonical point-like behavior math only
- `edit-behavior-registry.js` -> routing configuration
- `edit-behavior-composer.js` -> orchestration only
- `edit-behavior-adapters.js` -> translation, persistence, and specialized Tunni execution ownership
- `edit-tools-pointer.js` -> hit test, selection, routing, hover/cursor transport
- `tunni-calculations.js` -> the one shared Tunni file
- visualization files -> drawing only

Data flow:
`Mouse -> Pointer -> Composer -> Adapter -> Storage`

Tunni-specific rule:
`Mouse -> Pointer hit test/route -> Composer dispatch -> Adapter-owned Tunni drag/equalize execution -> Path or skeleton persistence`

