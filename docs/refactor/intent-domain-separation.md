# Intent: Domain Separation for Editing Pipeline

Date: 2026-02-27

## Purpose
State the intent before writing a detailed refactor plan. This is the reference for later steps and reviews.

## What
We want domain separation in the editing pipeline.

Definition in this context:
- Data (objects and parameters) is separate from behavior (rules).
- Behavior is separate from routing (pointer input and orchestration).
- Each object kind has a clear ownership of its canonical data.

## Why
The current code is entangled.

Problems we see:
- Object specific math is scattered across pointer, composer, and adapters.
- Editing logic for skeleton and rib is duplicated or special cased.
- Behavior rules are mixed with persistence and layer routing.
- It is hard to reason about changes or keep parity with main.

## How
We build a proper pipeline modeled after the existing points and guidelines flow.

Baseline example (mainline):
- Guidelines are edited through the same behavior pipeline as points.
- Pointer does routing only, not object specific math.
- Edit behavior produces standard change objects with rollback.

Target pipeline (same shape for all object kinds):
1. Hit test builds selection keys (object kind + id).
2. Selection and modifiers resolve to a behavior plan.
3. Adapter applies behavior math to the object representation.
4. Adapter persists to canonical storage and returns change objects and rollback.
5. Pointer commits the change bundle and maintains undo/redo.

Key rules:
- Pointer is transport only.
- Composer is uniform and does not branch on object kind.
- Adapters own persistence for their object kinds.
- Behaviors are rule definitions only.
- All edits yield standard change objects with rollback.

Object kinds and persistence:
- Persistent objects store canonical data (example: guidelines, skeleton points).
- Virtual objects are derived and must write to canonical data (example: rib points, Tunni points).

## Scope (Intent Only)
This document does not define step by step tasks or file edits. It only captures the goal and architectural shape we must preserve during the refactor plan and implementation.

Scope notes:
- Tunni points are drag targets but remain non-selection (no parseSelection keys).
