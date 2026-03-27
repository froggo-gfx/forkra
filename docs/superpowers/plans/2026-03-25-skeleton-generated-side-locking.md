# Skeleton Generated Side Locking Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace skeleton-side `leftEditable` / `rightEditable` semantics with canonical `leftLocked` / `rightLocked`, keep generated-side adjustments available by default, and block every generated-side adjustment path when a side is locked.

**Architecture:** Keep the storage model explicit and consistent by making `leftLocked` / `rightLocked` the only side-state fields used by skeleton data, routing, and panel UX. Update generated-point and generated-handle discovery to be structural instead of editable-gated, then add centralized lock checks at drag/nudge/panel mutation boundaries so every interaction path honors the same rule.

**Tech Stack:** JavaScript, Fontra editor UI, skeleton contour generation/persistence, panel forms, pointer routing

---

## File Map

- Modify: `src-js/fontra-core/src/skeleton-contour-generator.js`
  Responsibility: canonical skeleton point normalization and generated rib/handle geometry gating that currently depends on `leftEditable` / `rightEditable`.
- Modify: `src-js/views-editor/src/scene-model.js`
  Responsibility: map generated path points back to skeleton-side metadata for `editableGeneratedPoint` and `editableGeneratedHandle`.
- Modify: `src-js/views-editor/src/edit-behavior-adapters.js`
  Responsibility: canonical drag/nudge persistence for `skeletonRibPoint`, `editableGeneratedPoint`, and `editableGeneratedHandle`.
- Modify: `src-js/views-editor/src/edit-tools-pointer.js`
  Responsibility: pointer-side routing, object-kind selection, and rib-point hit geometry.
- Modify: `src-js/views-editor/src/panel-skeleton-parameters.js`
  Responsibility: panel state, lock controls, reset actions, and skeleton-point combined side lock editing.
- Modify: `src-js/views-editor/src/skeleton-visualization-layers.js`
  Responsibility: rib-point visuals that currently reflect editable state.
- Modify: `src-js/views-editor/src/visualization-layer-definitions.js`
  Responsibility: any overlay logic that still checks editable state for ribs/measurements.
- Modify: `src-js/views-editor/src/edit-tools-skeleton.js`
  Responsibility: any rib hit/drawing or tool-local assumptions that still depend on editable flags.
- Modify: `src-js/views-editor/src/edit-behavior.js`
  Responsibility: helper methods or comments that currently flip or describe `leftEditable` / `rightEditable`.
- Modify: `docs/superpowers/specs/2026-03-25-skeleton-generated-side-locking-design.md`
  Responsibility: only if implementation reveals a needed terminology tweak; otherwise leave unchanged.

## Chunk 1: Canonical Side State

### Task 1: Replace canonical side flags in core skeleton data handling

**Files:**
- Modify: `src-js/fontra-core/src/skeleton-contour-generator.js`
- Modify: `src-js/views-editor/src/edit-behavior.js`

- [ ] **Step 1: Inspect every `leftEditable` / `rightEditable` read and write in core skeleton helpers**

Run: `rg -n "leftEditable|rightEditable" src-js/fontra-core/src/skeleton-contour-generator.js src-js/views-editor/src/edit-behavior.js`
Expected: all current editable-flag touchpoints are listed before editing.

- [ ] **Step 2: Rename canonical side-state fields to `leftLocked` / `rightLocked`**

Update every direct field read/write in these files so side state is expressed only as:

```js
point.leftLocked = true;
point.rightLocked = true;
const lockedKey = side === "left" ? "leftLocked" : "rightLocked";
```

Implementation rule:

```js
const isSideLocked = !!point?.[lockedKey];
```

- [ ] **Step 3: Invert geometry gating from editable-only to unlocked-by-default**

Where geometry helpers currently do:

```js
if (!skeletonPoint?.[editableKey]) {
  return ribPoint;
}
```

replace the decision with:

```js
if (skeletonPoint?.[lockedKey]) {
  return ribPoint;
}
```

and keep absence of the field equivalent to unlocked.

- [ ] **Step 4: Remove or rewrite comments and helper names that preserve the old mental model**

Update code comments so they describe side locking rather than side editability. Rename local variables such as `editableKey`, `isLeftEditable`, or `isRightEditable` to `lockedKey`, `isLeftLocked`, and `isRightLocked`.

- [ ] **Step 5: Verify syntax**

Run: `node --check src-js/fontra-core/src/skeleton-contour-generator.js`
Expected: no syntax errors

Run: `node --check src-js/views-editor/src/edit-behavior.js`
Expected: no syntax errors

- [ ] **Step 6: Commit**

```bash
git add src-js/fontra-core/src/skeleton-contour-generator.js src-js/views-editor/src/edit-behavior.js
git commit -m "refactor: replace skeleton editable flags with locked flags"
```

## Chunk 2: Generated Object Discovery And Routing

### Task 2: Make generated rib/handle discovery structural and lock-aware

**Files:**
- Modify: `src-js/views-editor/src/scene-model.js`
- Modify: `src-js/views-editor/src/edit-tools-pointer.js`
- Modify: `src-js/views-editor/src/edit-tools-skeleton.js`

- [ ] **Step 1: Inspect generated-point lookup functions and rib hit logic**

Run: `rg -n "_getEditableRibPointForGeneratedPoint|_getEditableHandleForGeneratedPoint|leftEditable|rightEditable" src-js/views-editor/src/scene-model.js src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/edit-tools-skeleton.js`
Expected: discovery and hit-test paths that still depend on editable flags are identified.

- [ ] **Step 2: Update generated-point lookup to discover both locked and unlocked generated sides**

Change `scene-model.js` so generated-point and generated-handle lookup is based on structural matching of skeleton rib points and generated handles, not on the side being editable. The functions may keep their existing names for this session if renaming them would create too much churn, but their behavior must change to find generated objects regardless of lock state.

Key rule:

```js
const isSideLocked = !!skeletonPoint[lockedKey];
```

Use lock state only for routing/mutation decisions, not for geometric discovery.

- [ ] **Step 3: Keep locked generated objects selectable if selection is needed, but block mutating entry points**

Adjust pointer routing so a locked side does not start a drag/nudge/edit session for:
- `skeletonRibPoint`
- `editableGeneratedPoint`
- `editableGeneratedHandle`

Plain selection may still be allowed if the current UX depends on selection for showing the `Locked` control. The hard requirement is that the lock blocks mutation, not necessarily inspection.

- [ ] **Step 4: Update rib-point hit/drawing assumptions from editable-only to unlocked-by-default**

Where rib-point hit geometry or rib-point positioning currently uses `leftEditable` / `rightEditable`, switch to the new default:
- side exists structurally when width is present
- nudge/handle adjustments apply only when the side is unlocked

- [ ] **Step 5: Verify syntax**

Run: `node --check src-js/views-editor/src/scene-model.js`
Expected: no syntax errors

Run: `node --check src-js/views-editor/src/edit-tools-pointer.js`
Expected: no syntax errors

Run: `node --check src-js/views-editor/src/edit-tools-skeleton.js`
Expected: no syntax errors

- [ ] **Step 6: Commit**

```bash
git add src-js/views-editor/src/scene-model.js src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/edit-tools-skeleton.js
git commit -m "refactor: route generated skeleton objects by lock state"
```

### Task 3: Enforce lock state in adapter-owned drag and nudge persistence

**Files:**
- Modify: `src-js/views-editor/src/edit-behavior-adapters.js`

- [ ] **Step 1: Inspect all editable-generated and rib adapter entry points**

Run: `rg -n "leftEditable|rightEditable|editableGenerated|skeletonRibPoint" src-js/views-editor/src/edit-behavior-adapters.js`
Expected: all canonical adapter paths that still gate by editable semantics are listed.

- [ ] **Step 2: Add a single lock helper near the skeleton-side adapter utilities**

Introduce a small helper such as:

```js
function isSkeletonSideLocked(point, side) {
  const lockedKey = side === "left" ? "leftLocked" : "rightLocked";
  return !!point?.[lockedKey];
}
```

Use it everywhere adapter-owned mutation needs to decide whether a side can change.

- [ ] **Step 3: Block `editableGeneratedPoint` drag/nudge mutations when locked**

Before applying width, nudge, interpolation, or handle-offset changes to a generated on-curve side, skip that side if it is locked.

- [ ] **Step 4: Block `editableGeneratedHandle` drag/nudge mutations when locked**

Before applying `Z`-drag, equalize, interpolation, detached-handle offset edits, or nudge changes to a generated handle side, skip that side if it is locked.

- [ ] **Step 5: Block `skeletonRibPoint` adapter mutations when locked**

Any adapter path that edits rib-side data directly must no-op for locked sides, including arrow-key movement and modifier-driven variants.

- [ ] **Step 6: Update undo labels and comments only where wording still says editable**

Preserve object-kind names such as `editableGeneratedPoint` and `editableGeneratedHandle`, but remove user-facing phrases like "editable rib points" where they now mean "locked/unlocked rib points".

- [ ] **Step 7: Verify syntax**

Run: `node --check src-js/views-editor/src/edit-behavior-adapters.js`
Expected: no syntax errors

- [ ] **Step 8: Commit**

```bash
git add src-js/views-editor/src/edit-behavior-adapters.js
git commit -m "refactor: enforce skeleton side locks in edit adapters"
```

## Chunk 3: Panel And Visual UX

### Task 4: Replace panel editable controls with side lock controls

**Files:**
- Modify: `src-js/views-editor/src/panel-skeleton-parameters.js`

- [ ] **Step 1: Inspect panel sections that compute or render editable state**

Run: `rg -n "Editable|editable rib|leftEditable|rightEditable|Make Ribs Uneditable|Reset rib point position|Reset handle offsets" src-js/views-editor/src/panel-skeleton-parameters.js`
Expected: all panel UX paths that need lock terminology and behavior updates are visible.

- [ ] **Step 2: Rename panel state aggregation from editable to locked**

Replace local state concepts such as `editableStates`, `hasEditableRibs`, and similar helpers with lock-oriented state, for example:

```js
let lockedStates = new Set();
const isLeftLocked = !!point.leftLocked;
const isRightLocked = !!point.rightLocked;
```

- [ ] **Step 3: Replace side toggle UI from `Editable` to `Locked`**

When a rib side, `editableGeneratedPoint`, or `editableGeneratedHandle` is selected, show a side-level `Locked` toggle that writes only that side's lock field.

- [ ] **Step 4: Replace skeleton-point bulk action with combined lock toggle**

When `skeletonPoint` selection is active, show a combined `Locked` control that writes both side locks for each selected skeleton point.

- [ ] **Step 5: Preserve offsets on lock toggle**

Make lock toggles update only `leftLocked` / `rightLocked`. Do not clear:
- `leftNudge` / `rightNudge`
- handle offsets
- detached-handle flags
- any other generated-side adjustment fields

- [ ] **Step 6: Make panel reset actions skip locked sides**

For reset commands such as rib-position reset and handle-offset reset, keep the action available when relevant but skip mutation for any locked side.

- [ ] **Step 7: Remove old destructive bulk actions that existed only to disable editability**

Delete or repurpose panel actions such as "Make Ribs Uneditable" if they no longer match the approved UX. If a bulk action remains, it should be a lock action, not a state-clearing action.

- [ ] **Step 8: Verify syntax**

Run: `node --check src-js/views-editor/src/panel-skeleton-parameters.js`
Expected: no syntax errors

- [ ] **Step 9: Commit**

```bash
git add src-js/views-editor/src/panel-skeleton-parameters.js
git commit -m "feat: replace skeleton editable panel controls with locks"
```

### Task 5: Align rib visuals and overlays with lock semantics

**Files:**
- Modify: `src-js/views-editor/src/skeleton-visualization-layers.js`
- Modify: `src-js/views-editor/src/visualization-layer-definitions.js`

- [ ] **Step 1: Inspect rib visuals that still branch on editable state**

Run: `rg -n "leftEditable|rightEditable|editable rib|rib point" src-js/views-editor/src/skeleton-visualization-layers.js src-js/views-editor/src/visualization-layer-definitions.js`
Expected: all visual-state branches using editable semantics are listed.

- [ ] **Step 2: Update visuals to branch on locked state or unlocked state intentionally**

Decide the visual outcome that best matches current behavior:
- if the UI currently highlights editable sides, reinterpret that highlight as unlocked sides
- if a distinct locked visual is already easy to express, add it without changing unrelated visuals

Keep the plan conservative: preserve the existing visual language as much as possible while making it semantically correct.

- [ ] **Step 3: Verify syntax**

Run: `node --check src-js/views-editor/src/skeleton-visualization-layers.js`
Expected: no syntax errors

Run: `node --check src-js/views-editor/src/visualization-layer-definitions.js`
Expected: no syntax errors

- [ ] **Step 4: Commit**

```bash
git add src-js/views-editor/src/skeleton-visualization-layers.js src-js/views-editor/src/visualization-layer-definitions.js
git commit -m "refactor: align skeleton rib visuals with side locks"
```

## Chunk 4: Manual Verification And Closeout

### Task 6: Manual verification pass

**Files:**
- Modify: none required unless fixes are found

- [ ] **Step 1: Verify unlocked `editableGeneratedPoint` behavior manually**

Check in the editor:
- plain drag changes rib width
- `Z`-drag performs tangent slide
- `X` and `Alt` modifier behaviors still work as before

- [ ] **Step 2: Verify unlocked `editableGeneratedHandle` behavior manually**

Check in the editor:
- plain drag does nothing
- `Z`-drag adjusts handle position
- `X` and `Alt` modifier behaviors still work as before

- [ ] **Step 3: Verify locked-side blocking manually**

Check in the editor for a locked side:
- rib drag is blocked
- `Z` tangent slide is blocked
- handle `Z` drag is blocked
- `X` actions are blocked
- `Alt` actions are blocked
- arrow nudge is blocked
- panel reset actions do not change that side

- [ ] **Step 4: Verify preserved adjustment state manually**

Create visible rib nudge and handle offsets, lock the side, unlock it again, and confirm the stored adjustments remain intact.

- [ ] **Step 5: Verify combined `skeletonPoint` lock control manually**

Select one or more `skeletonPoint` objects and confirm the combined panel toggle writes both side locks without affecting width or cap editing.

- [ ] **Step 6: Verify round-cap endpoint and detached-handle behavior manually**

Confirm the new lock semantics do not break round-cap endpoint restrictions or detached-handle behavior.

- [ ] **Step 7: Commit any follow-up fixes**

```bash
git add <files-fixed-during-manual-verification>
git commit -m "fix: polish skeleton side locking behavior"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-25-skeleton-generated-side-locking.md`. Ready to execute?
