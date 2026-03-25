# Skeleton Generated Side Locking Design

Date: 2026-03-25

## Summary

Replace the current per-side `leftEditable` / `rightEditable` skeleton semantics with explicit
`leftLocked` / `rightLocked` semantics across the skeleton data model, editor interaction
routing, and parameter panel UX.

The goal is to make generated sides adjustable by default and use lock state only to block
all generated-side adjustments without clearing stored adjustment data.

## Problem

The current model uses per-side `editable` flags to gate adjustments on generated rib points
and generated control points. That creates two UX problems:

1. Generated-side adjustment is hidden behind an opt-in flag instead of being available by
   default.
2. The stored schema and the UI language no longer match the intended behavior. The user
   mental model is "locked or unlocked", not "editable or not editable".

We want the editor to expose generated-side adjustment as the default state and reserve the
side toggle for blocking all generated-side adjustments while preserving existing offsets.

## Approved Behavior

### `editableGeneratedPoint` Behavior

- `editableGeneratedPoint` refers to the generated on-curve point that corresponds to a
  skeleton rib point side.
- Plain drag adjusts rib width.
- `Z`-drag performs tangent slide.
- Existing `X`-drag and `Alt`-drag keep their current specialized behaviors.
- If the side is locked, all of the above are blocked.

### `editableGeneratedHandle` Behavior

- `editableGeneratedHandle` refers to the generated off-curve control point associated with a
  skeleton rib point side.
- Plain drag does nothing.
- `Z`-drag adjusts the handle position.
- Existing `X`-drag and `Alt`-drag keep their current specialized behaviors.
- If the side is locked, all of the above are blocked.

### `skeletonPoint` Behavior

- Selecting the parent `skeletonPoint` shows a combined `Locked` control in the panel.
- The combined control writes both side locks at once.
- Width and cap edits on the `skeletonPoint` remain available.
- Lock state only applies to generated-side adjustment paths, not to core `skeletonPoint`
  editing.

### Side Lock Semantics

- Locking a side blocks every mutation path for that side's `editableGeneratedPoint` and
  `editableGeneratedHandle`, including:
  - plain rib drag
  - `Z` tangent slide
  - `Z` handle drag
  - `X` modifier actions
  - `Alt` modifier actions
  - arrow-key nudging
  - panel reset actions that change generated-side offsets or nudges
- Locking must not clear any stored nudge, handle offset, detached-handle, or related
  generated-side adjustment state.
- Unlocking re-exposes the preserved adjustments immediately.

## Data Model

### Canonical Fields

Each skeleton point uses these canonical side-level lock fields:

- `leftLocked`
- `rightLocked`

Absence of either field means the side is unlocked.

### Adjustment Fields

Existing generated-side adjustment fields remain in place and independent from lock state,
including values such as:

- `leftNudge` / `rightNudge`
- `leftHandleInOffset*` / `leftHandleOutOffset*`
- `rightHandleInOffset*` / `rightHandleOutOffset*`
- detached-handle flags and related generated-side adjustment fields

These fields are not cleared by lock toggles.

### Legacy Compatibility

Older data that still contains `leftEditable` / `rightEditable` must be normalized to
`leftLocked` / `rightLocked` at the skeleton-data boundary.

Legacy interpretation:

- `leftEditable: true` => `leftLocked: false`
- `leftEditable: false` => `leftLocked: true`
- missing `leftEditable` => treat as legacy default and normalize consistently at the chosen
  boundary
- same mapping for `rightEditable`

After normalization and any subsequent write, only `leftLocked` / `rightLocked` should be
persisted.

## Implementation Shape

### Boundary Normalization

Introduce one canonical normalization step where skeleton data is read or cloned for editor
use. That step should:

1. Convert legacy `*Editable` fields into `*Locked`.
2. Remove or ignore legacy `*Editable` fields from the in-memory canonical representation.
3. Ensure new writes persist only `*Locked`.

### Interaction Routing

Generated rib points and generated handles should remain discoverable structurally rather than
through editable gating. Every mutating route should consult canonical lock state before
performing side edits.

This includes:

- hit-testing paths that lead to generated-side edit routes
- drag routing
- nudge routing
- modifier-specific adapter paths
- panel-side reset and adjustment actions

The implementation should guard both:

1. at route selection or session start, to prevent entering an edit path for a locked side
2. at the adapter or persistence boundary, to prevent accidental mutation if a route slips
   through

### Panel UX

Replace `Editable` with `Locked`.

Panel behavior:

- generated-side selection shows individual side lock state
- skeleton-point selection shows a combined lock control that writes both sides
- reset actions remain available when relevant, but execution must skip locked sides
- lock toggles never clear preserved side adjustments

### Round-Cap Endpoints

Existing restrictions around round-cap endpoints must still apply, but they should align with
the new lock semantics rather than preserving the old editable language.

## Manual Verification

Verification for this change is manual only.

Focus areas:

- older glyphs with legacy `*Editable` data migrate cleanly to `*Locked`
- unlocked generated rib points still support plain width drag
- generated control points still require `Z` for direct adjustment
- locked sides block all generated-side adjustment paths
- locking does not clear stored nudge or handle offsets
- unlocking restores access to preserved adjustments
- combined skeleton-point locking writes both side locks
- round-cap endpoints still behave correctly
- detached handles still behave correctly
- mixed selections do not create inconsistent lock behavior

## Main Risk

The main regression risk is partial schema migration: one route still reading old editable
semantics while another route reads the new locked semantics. That would create inconsistent
behavior between hit testing, drag routing, panel state, and persisted skeleton data.

To avoid that, the implementation should establish one canonical `*Locked` interpretation and
route all generated-side mutation logic through it.
