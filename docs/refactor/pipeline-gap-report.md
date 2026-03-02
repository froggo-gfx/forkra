# Pipeline Gap Report (Intent vs. Implementation)

Date: 2026-03-02  
Status: Draft

## Purpose
Document **current intent violations** against the domain-separation pipeline and list the **rectification steps**
already added to `docs/refactor/plan-domain-separation.md` (Phase 6).

## Pipeline Rules (From Intent/Plan)
1. Pointer is transport only.
2. Composer is uniform and does not branch on object kind.
3. Adapters own persistence and emit `{ forward, rollback }`.
4. Registry drives object kinds + modifier mapping.
5. Behaviors are rule-only (math, no persistence).

## Current Intent Violations (With Evidence)

### V1 — Registry is unused (Rule 4 violated)
**Evidence**
- `OBJECT_KINDS` only defined: `src-js/views-editor/src/edit-behavior-registry.js:20`
- `resolveBehaviorPreset` only defined: `src-js/views-editor/src/edit-behavior-registry.js:125`
- No other references in repo (search results show only definitions).

**Impact**
Pointer/composer still determine object kind and modifiers directly, so registry is dead code.

---

### V2 — Adapter contract not implemented (Rule 3 violated)
**Evidence**
- Canonical adapters are plain functions, not `{ applyDelta, applyToLayer }` objects:
  - `src-js/views-editor/src/pointer-objects.js:217` (`canonicalDragAdapters`)
  - `src-js/views-editor/src/pointer-objects.js:229` (`canonicalNudgeAdapters`)

**Impact**
No uniform adapter API; persistence ownership is inconsistent.

---

### V3 — Composer owns persistence (Rule 3 violated)
**Evidence**
- `runDragOrchestration` applies and records changes directly:
  - `applyChange` at `src-js/views-editor/src/edit-behavior-composer.js:129,149,172`
  - `recordChanges` at `src-js/views-editor/src/edit-behavior-composer.js:215`

**Impact**
Composer is not orchestration-only; persistence is not adapter-owned.

---

### V4 — Pointer still owns drag/nudge math + persistence (Rule 1 violated)
**Evidence (drag + nudge handlers live in pointer)**
- Drag handlers:
  - `_handleDragSkeletonPoints` `src-js/views-editor/src/edit-tools-pointer.js:3243`
  - `_handleDragRibPoint` `src-js/views-editor/src/edit-tools-pointer.js:3479`
  - `_handleDragEditableGeneratedPoints` `src-js/views-editor/src/edit-tools-pointer.js:4193`
  - `_handleDragEditableGeneratedHandles` `src-js/views-editor/src/edit-tools-pointer.js:4387`
  - `_handleEqualizeHandlesDrag` `src-js/views-editor/src/edit-tools-pointer.js:5923`
  - `_handleEqualizeHandlesDragForPath` `src-js/views-editor/src/edit-tools-pointer.js:6073`
- Nudge handlers:
  - `_handleArrowKeysLegacy` `src-js/views-editor/src/edit-tools-pointer.js:1281`
  - `_handleArrowKeysForEditableHandles` `src-js/views-editor/src/edit-tools-pointer.js:4605`
  - `_handleArrowKeysForRibPoints` `src-js/views-editor/src/edit-tools-pointer.js:4824`
  - `_handleArrowKeysForEqualizeSkeletonHandles` `src-js/views-editor/src/edit-tools-pointer.js:5737`
  - `_handleArrowKeysForEqualizePathHandles` `src-js/views-editor/src/edit-tools-pointer.js:5836`

**Impact**
Pointer is not transport-only for drag/nudge.

---

### V5 — Pointer still determines object kinds (Rule 1 + 4 violated)
**Evidence**
- `handleDragSelection` sets objectKind and routes by selection:
  - `src-js/views-editor/src/edit-tools-pointer.js:2637`
- `handleArrowKeys` sets objectKind based on selection:
  - `src-js/views-editor/src/edit-tools-pointer.js:1239`

**Impact**
Registry/composer are not authoritative for object kind selection.

---

### V6 — Non-drag actions are outside pipeline (Rule 1 + 2 violated)
**Evidence**
- `handleDoubleClick` `src-js/views-editor/src/edit-tools-pointer.js:2265`
- `handleRectSelect` `src-js/views-editor/src/edit-tools-pointer.js:2602`
- `handleBoundsTransformSelection` `src-js/views-editor/src/edit-tools-pointer.js:6334`

**Impact**
Non-drag actions bypass composer/registry/adapters.

---

### V7 — Tunni bypasses adapters (Rule 3 + 4 violated)
**Evidence**
- `_handleTunniPointDrag` `src-js/views-editor/src/edit-tools-pointer.js:1534`
- `_handleSkeletonTunniDrag` `src-js/views-editor/src/edit-tools-pointer.js:5365`

**Impact**
Virtual object kind edits are not adapter-owned.

## Rectification Steps (Already Added to the Plan)
- See **Phase 6 — Pointer Transport-Only (Drag + Nudge)** in
  `docs/refactor/plan-domain-separation.md` (Steps 6.1–6.10).
- Non-drag actions and registry activation remain to be planned after Phase 6.
