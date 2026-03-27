# Skeleton Side Locking Pre-Testing Progress Report

Date: 2026-03-25
Branch: `test/z-mod-for-editable`
Commit Range: `cab49231d..53746bd67`

## Summary

The planned implementation work for skeleton generated-side locking is in place and the codebase
has been moved from side `leftEditable` / `rightEditable` semantics to side `leftLocked` /
`rightLocked` semantics across the core skeleton model, routed editing logic, and panel/visual
UI.

This report is intentionally pre-testing. The implementation is complete at code level, but the
manual UI verification pass has not been performed yet.

## Implemented Scope

### 1. Canonical side-state model

- Replaced core skeleton-side state usage with `leftLocked` / `rightLocked`.
- Removed the old sticky side effect where width collapse could implicitly create a lasting lock.
- Rewrote stale editable-model comments and helper naming to match the new lock model.

Primary files:

- `src-js/fontra-core/src/skeleton-contour-generator.js`
- `src-js/views-editor/src/edit-behavior.js`
- `src-js/views-editor/src/edit-behavior-adapters.js`

### 2. Structural discovery and routed mutation guards

- Generated rib points and generated handles are now discovered structurally for both locked and
  unlocked sides.
- Locked sides keep their preserved rib geometry for hit-testing and inspection.
- Routed mutation paths now block edits for locked sides at the adapter boundary for:
  - `skeletonRibPoint`
  - `editableGeneratedPoint`
  - `editableGeneratedHandle`

Primary files:

- `src-js/views-editor/src/scene-model.js`
- `src-js/views-editor/src/edit-tools-pointer.js`
- `src-js/views-editor/src/edit-tools-skeleton.js`
- `src-js/views-editor/src/edit-behavior-adapters.js`

### 3. Panel and visualization semantics

- Replaced side `Editable` panel controls with `Locked`.
- Added combined `Locked` control for `skeletonPoint` selection that writes both sides at once.
- Made lock toggles non-destructive: locking no longer clears nudge, handle offsets, or detach
  state.
- Updated rib reset actions to skip locked sides.
- Removed the old destructive "Make Uneditable" panel flow.
- Kept the existing accented rib visual language, but remapped it to mean "unlocked side".

Primary files:

- `src-js/views-editor/src/panel-skeleton-parameters.js`
- `src-js/views-editor/src/skeleton-visualization-layers.js`
- `src-js/views-editor/src/visualization-layer-definitions.js`

## Verification Completed So Far

Fresh verification completed in this session:

- `node --check src-js/fontra-core/src/skeleton-contour-generator.js`
- `node --check src-js/views-editor/src/edit-behavior.js`
- `node --check src-js/views-editor/src/edit-behavior-adapters.js`
- `node --check src-js/views-editor/src/scene-model.js`
- `node --check src-js/views-editor/src/edit-tools-pointer.js`
- `node --check src-js/views-editor/src/edit-tools-skeleton.js`
- `node --check src-js/views-editor/src/panel-skeleton-parameters.js`
- `node --check src-js/views-editor/src/skeleton-visualization-layers.js`
- `node --check src-js/views-editor/src/visualization-layer-definitions.js`
- `rg -n "leftEditable|rightEditable" src-js/fontra-core/src src-js/views-editor/src`

Results:

- All `node --check` commands passed.
- The editor/runtime source tree no longer contains `leftEditable` / `rightEditable`.

## Review Status

The implementation chunks were reviewed during execution:

- Core side-state chunk: spec compliant, code-quality approved
- Structural discovery and routed lock-guard chunk: spec compliant, code-quality approved
- Panel and visualization chunk: spec compliant, code-quality approved

## Pending Manual Verification

Manual UI exercise is still required for the behavior matrix, especially:

- unlocked `editableGeneratedPoint` plain drag, `Z` drag, `X` drag, and `Alt` drag behavior
- unlocked `editableGeneratedHandle` `Z` drag plus modifier behavior
- locked-side blocking for drag, nudge, reset, and modifier paths
- persistence of preserved nudge and handle offsets through lock/unlock
- combined `skeletonPoint` locking behavior
- round-cap endpoints
- single-sided contours
- mixed locked/unlocked selections
- detached handles

## Commit Summary

- `e8772c913` `refactor: replace skeleton editable flags with locked flags`
- `918322317` `fix: remove implicit skeleton lock on width collapse`
- `f356f7267` `refactor: remove stale editable skeleton wording`
- `0fe7a4993` `refactor: enforce skeleton side locks in routed edits`
- `f434b3456` `fix: preserve locked rib geometry for discovery`
- `53746bd67` `feat: switch skeleton panel and visuals to side locks`

## Current Status

Implementation complete.

Pre-testing report complete.

Manual UI verification pending.
