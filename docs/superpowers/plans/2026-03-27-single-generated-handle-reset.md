# Single Generated Handle Reset Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a panel reset action for a single selected `editableGeneratedHandle` that clears only that exact handle offset.

**Architecture:** Reuse the existing handle-offset reset flow in the skeleton parameters panel instead of introducing new schema or routing. Extend the panel selection logic to detect a single selected generated off-curve handle, surface the existing reset affordance in that state, and apply a narrow reset that clears only the selected handle's offset keys while preserving the opposite handle and all other side state.

**Tech Stack:** JavaScript, Fontra editor panel UI, skeleton customData persistence

---

## File Map

- Modify: `src-js/views-editor/src/panel-skeleton-parameters.js`
  Responsibility: detect single generated-handle selection, expose the reset control, and reset only the selected handle offset keys.

## Chunk 1: Single Generated Handle Reset

### Task 1: Add single-handle reset support to the skeleton parameters panel

**Files:**
- Modify: `src-js/views-editor/src/panel-skeleton-parameters.js`

- [ ] **Step 1: Inspect the current handle-offset reset flow and selected generated-handle mapping**

Run: `rg -n "Reset handle offsets|editableGeneratedHandle|_getSelectedRibSides|handle offset" src-js/views-editor/src/panel-skeleton-parameters.js`
Expected: locate the current side-level reset flow and the selection mapping that already distinguishes off-curve generated handles.

- [ ] **Step 2: Detect the exact single selected generated handle**

Add or reuse a helper that resolves a single selected `editableGeneratedHandle` to:

```js
{
  contourIdx,
  pointIdx,
  side,
  handleType, // "in" or "out"
}
```

Only the exact single selected off-curve handle should qualify for the new reset affordance.

- [ ] **Step 3: Reuse the existing panel reset affordance for that state**

When exactly one generated off-curve handle is selected, show the existing reset action in the panel, but scoped to that selected handle instead of the whole side.

- [ ] **Step 4: Implement narrow reset behavior**

Clear only the offset keys for the selected handle:

```js
leftHandleInOffset
leftHandleInOffsetSaved
leftHandleInOffsetX
leftHandleInOffsetY
```

or the matching `Out` / `right` keys depending on selection.

Do not clear:
- the opposite handle on the same side
- side nudge
- detach state
- lock state

If the selected side is locked, keep the current locked-side reset behavior consistent.

- [ ] **Step 5: Verify syntax**

Run: `node --check src-js/views-editor/src/panel-skeleton-parameters.js`
Expected: no syntax errors

- [ ] **Step 6: Commit**

```bash
git add src-js/views-editor/src/panel-skeleton-parameters.js
git commit -m "feat: add single generated handle reset action"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-27-single-generated-handle-reset.md`. Ready to execute?
