# Points vs Guidelines: Findings and Intent Alignment

Date: 2026-02-27

## Purpose
Document what we learned about how mainline handles guidelines versus points, and how that informs the refactor intent (domain separation and adherence to existing architecture).

## What We Found

### 1. Guidelines are not a special pipeline
Guidelines are handled through the same edit behavior pipeline as regular points, anchors, components, and background images.

Key traits:
- Selection uses a dedicated selection kind ("guideline/<index>") but still flows through the same selection parsing.
- Pointer does not implement guideline specific drag or nudge logic. It only handles routing and a double click entry to the guideline edit dialog.
- EditBehaviorFactory unpacks guidelines and builds guideline edit functions alongside point and anchor edit functions.
- Guideline edits generate standard change objects under the "guidelines" path and participate in undo/redo like everything else.

This means the maintainers already use a common pipeline for different object kinds. Guidelines are just another object kind in the same flow.

### 2. Behavior math lives outside pointer
The pointer tool is transport and routing. The math for how an object changes is implemented in behavior or helper logic, not in pointer. That is true for guidelines and points alike.

### 3. Rib points are derived, not persisted
Rib points are generated from skeleton data (skeleton point position, normal, half width, nudge, and per side editability flags). They are computed on the fly for hit test and visualization. Their position is not stored as a separate point.

Editing a rib point is effectively editing skeleton parameters and then regenerating the outline contours. This is not a persistent object in the same sense as guidelines.

### 4. Tunni points are also derived
Tunni points are generated from path geometry. They are not canonical data. Editing a Tunni point should mutate the underlying path geometry, not store a Tunni object.

## How This Supports Our Intent

We want domain separation where object data, action rules, and routing are clearly split. The guidelines pipeline already demonstrates the expected architecture:

- Object kind is recognized at selection time.
- Behavior resolves to a set of edit functions that do the math.
- Changes are recorded as standard change objects with rollback.
- Pointer only routes and commits changes.

To align new object kinds (skeleton, rib, Tunni) with this architecture, we should follow the same pattern but respect persistence differences:

### Persistent object kinds (guideline style)
- Canonical storage exists and is edited directly.
- Example: skeleton points stored in internal custom data.
- Adapter writes to canonical storage and returns change objects.

### Virtual object kinds (derived)
- No canonical object to store; position is computed on the fly.
- Example: rib points (derived from skeleton data), Tunni points (derived from path geometry).
- Adapter translates the virtual edit into mutations of canonical data and returns change objects.

This keeps domain separation intact: object kind defines data ownership, behaviors define how it changes, and pointer remains routing only.

## Broad Strokes We Can Use Later

These are the minimum reference points for the upcoming pipeline and refactor plan:

1. Pointer is transport only. No object specific math.
2. Composer is uniform. No branching on object kind inside orchestration.
3. Adapters own persistence. They translate edits into canonical changes and rollback.
4. Behaviors are rules only. No storage paths or layer specific logic.
5. All edits produce standard change objects that feed undo/redo.

## Working Classification (Initial)

This is a starting point, not final. It matches current generation logic and can be revised later.

- Persistent:
  - Skeleton points (stored in internal custom data)
  - Guidelines (stored in glyph.guidelines)
- Virtual:
  - Rib points (derived from skeleton point data)
  - Tunni points (derived from path geometry)

## Outcome
The guidelines pipeline is the precedent we should follow. It proves that new object kinds can share the same behavior and undo/redo pipeline without pointer level special casing. The key difference for our new types is whether the object kind is persistent or virtual. That distinction determines adapter responsibilities, not pointer or composer logic.
