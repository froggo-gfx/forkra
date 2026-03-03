# Phase 6 Clarification: What Adapters Must Actually Do

Date: 2026-03-03
Status: **Critical Design Correction**

---

## The Problem

**Current state:** The "canonical adapters" in `pointer-objects.js` are **fake** — they are thin wrappers that delegate back to pointer methods. They do NOT implement the adapter pattern as defined in the plan.

**Evidence:**
```javascript
// src-js/views-editor/src/pointer-objects.js, line 139-150
async function runEditableGeneratedPointsDragCanonical({
  pointerTool,
  eventStream,
  initialEvent,
  editablePoints,
}) {
  await pointerTool._handleDragEditableGeneratedPoints(  // ← Delegates to pointer
    eventStream,
    initialEvent,
    editablePoints
  );
}
```

**Every "canonical adapter" does this.** The persistence logic remains in `edit-tools-pointer.js`, not in adapters.

---

## Root Cause of Confusion

**Misinterpretation:** Previous implementation treated "adapter" as a **routing layer** (select which pointer method to call).

**Correct definition (from plan):** Adapters are a **translation layer** between behavior output and canonical storage.

From `docs/refactor/plan-domain-separation.md`:
> **Adapter Purpose (Non-Negotiable)**
> Adapters are the translation layer between behavior math and canonical storage.
> - Translate shared behavior output into object-specific updates (e.g., rib width/nudge, handle offsets).
> - Own persistence for their object kind (write canonical data and emit `{ forward, rollback }`).

---

## The Core Insight: Editable Generated Points ARE Regular Points

**Fact:** Editable generated points are **regular path points** in a skeleton-generated contour. They:
- Have standard `point/index` selection format
- Can be exported to UFO/OpenType as normal contours
- Are visually identical to regular points

**What makes them "editable generated":** Selection metadata that links them to skeleton data:
```
Selection: "editableGeneratedPoint/pathPointIndex/skeletonContourIndex/skeletonPointIndex/side"
Meaning: "Point 5 in generated path → skeleton contour 0, point 3, left side width"
```

**Why custom behavior was used (WRONG reason):**
- Current code uses `EditableRibBehavior`, `InterpolatingRibBehavior` classes
- These return `{halfWidth, nudge}` instead of `{x, y}`
- This DUPLICATES behavior logic that already exists in `EditBehavior`

**Why custom behavior seemed necessary (CORRECT reason identified):**
- **Persistence** is different: must update skeleton width, then regenerate path
- **NOT** because delta calculation is different

---

## What Phase 6 Must Actually Do

### For Each Object Kind (C5-C8)

**Current (WRONG):**
```
Pointer → Custom Behavior Class → Pointer Persistence
```

**Target (CORRECT):**
```
Pointer → Composer → Standard EditBehavior → Adapter Translation → Adapter Persistence
```

### Specific Implementation for Editable Generated Points

**Step 1: Use Standard Behavior Engine**
```javascript
// In adapter, NOT pointer
const behaviorFactory = new EditBehaviorFactory(glyph, selection);
const behavior = behaviorFactory.getBehavior("default");

// Drag loop
for await (const event of eventStream) {
  const delta = calculateDelta(event, initialEvent);
  const pointChanges = behavior.applyDelta(delta);  // Returns {pointIndex, x, y}
  
  // ADAPTER TRANSLATION (this is the adapter's job)
  const skeletonChanges = translatePointToSkeleton(pointChanges, skeletonData);
  
  // ADAPTER PERSISTENCE (this is the adapter's job)
  applySkeletonChanges(skeletonData, skeletonChanges);
  regenerateSkeletonContours(glyph, skeletonData);
}
```

**Step 2: Adapter Translates `{x, y}` → `{halfWidth, nudge}`**
```javascript
function translatePointToSkeleton(pointChange, skeletonData) {
  const { x, y } = pointChange;
  
  // Project new position onto normal/tangent
  const normal = calculateNormalAtSkeletonPoint(...);
  const tangent = { x: -normal.y, y: normal.x };
  
  const expectedBasePos = calculateExpectedRibPosition(skeletonPoint, side);
  const deltaFromBase = { x: x - expectedBasePos.x, y: y - expectedBasePos.y };
  
  // Normal component → width change
  const halfWidthDelta = dot(deltaFromBase, normal);
  const newHalfWidth = originalHalfWidth + halfWidthDelta;
  
  // Tangent component → nudge change
  const nudgeDelta = dot(deltaFromBase, tangent);
  const newNudge = originalNudge + nudgeDelta;
  
  return { halfWidth: newHalfWidth, nudge: newNudge };
}
```

**Step 3: Adapter Persists to Skeleton (Not Path)**
```javascript
function applySkeletonChanges(skeletonData, changes) {
  for (const change of changes) {
    const point = skeletonData.contours[change.contourIndex].points[change.pointIndex];
    if (change.side === "left") {
      point.leftWidth = change.halfWidth;
      point.leftNudge = change.nudge;
    } else {
      point.rightWidth = change.halfWidth;
      point.rightNudge = change.nudge;
    }
  }
}

// Path regeneration is part of persistence
regenerateSkeletonContours(glyph, skeletonData);
```

---

## What Must Be Deleted

**From `edit-tools-pointer.js`:**
| Method | Lines | Reason |
|--------|-------|--------|
| `_handleDragSkeletonPoints` | ~240 | Move to `skeletonPoint` adapter |
| `_handleDragRibPoint` | ~720 | Move to `skeletonRibPoint` adapter |
| `_handleDragEditableGeneratedPoints` | ~200 | Move to `editableGeneratedPoint` adapter |
| `_handleDragEditableGeneratedHandles` | ~220 | Move to `editableGeneratedHandle` adapter |
| `_handleEqualizeHandlesDrag` | ~150 | Move to `skeletonHandle` adapter |
| `_handleEqualizeHandlesDragForPath` | ~150 | Move to adapter |
| `_handleArrowKeysLegacy` (skeleton branch) | ~150 | Move to adapter |
| `_handleArrowKeysForEditableHandles` | ~220 | Move to adapter |
| `_handleArrowKeysForRibPoints` | ~280 | Move to adapter |
| `_handleArrowKeysForEqualizeSkeletonHandles` | ~100 | Move to adapter |
| `_handleArrowKeysForEqualizePathHandles` | ~100 | Move to adapter |

**Total removable: ~2,530 lines** (pointer becomes transport-only for drag/nudge)

**From `edit-behavior.js`:**
| Class/Function | Lines | Reason |
|----------------|-------|--------|
| `RibEditBehavior` | ~90 | Replace with standard `EditBehavior` + adapter translation |
| `EditableRibBehavior` | ~180 | Replace with standard `EditBehavior` + adapter translation |
| `InterpolatingRibBehavior` | ~240 | Replace with standard `EditBehavior` + adapter translation |
| `EditableHandleBehavior` | ~90 | Replace with standard `EditBehavior` + adapter translation |

**Total removable: ~600 lines** (behavior math unified in `EditBehavior`)

**From `pointer-objects.js`:**
| Function | Current | Target |
|----------|---------|--------|
| `runSkeletonDragCanonical` | Wrapper calling pointer | Full implementation |
| `runRibDragCanonical` | Wrapper calling pointer | Full implementation |
| `runEditableGeneratedPointsDragCanonical` | Wrapper calling pointer | Full implementation |
| `runEditableGeneratedHandlesDragCanonical` | Wrapper calling pointer | Full implementation |
| `runSkeletonNudgeCanonical` | Wrapper calling pointer | Full implementation |
| `runRibNudgeCanonical` | Wrapper calling pointer | Full implementation |
| `runEditableGeneratedNudgeCanonical` | Wrapper calling pointer | Full implementation |

**Current: ~20 lines (wrappers)**
**Target: ~400 lines (real implementations)**

---

## Passing Criteria for Phase 6

**Criterion 1: Adapters own persistence**
- `pointer-objects.js` adapters call `regenerateSkeletonContours`, `setSkeletonData` directly
- `edit-tools-pointer.js` does NOT contain `regenerateSkeletonContours` calls for drag/nudge
- **Test:** Grep for `regenerateSkeletonContours` — all usages must be in adapters or `skeleton-contour-generator.js`

**Criterion 2: Standard behavior engine is used**
- `editableGeneratedPoint` drag uses `EditBehaviorFactory` (not `EditableRibBehavior`)
- `skeletonPoint` drag uses `createPointBehaviorExecutor` (already does)
- `skeletonRibPoint` drag uses `EditBehavior` + adapter translation (not `RibEditBehavior`)
- **Test:** Grep for `EditableRibBehavior`, `InterpolatingRibBehavior`, `RibEditBehavior` — must not be used in drag/nudge paths

**Criterion 3: Pointer is transport-only**
- `handleDragSelection` only calls `runDragRoutingOrchestration`
- `handleArrowKeys` only calls `runNudgeRoutingOrchestration`
- No drag/nudge math in pointer (no delta calculations, no behavior instantiation)
- **Test:** `handleDragSelection` and `handleArrowKeys` should be <50 lines each

**Criterion 4: Matrix parity**
- All drag/nudge matrix cells (R1-R9, R10-R20 for C5-C8) pass manual testing
- Undo/redo works correctly for all object kinds
- **Test:** Execute baseline matrix from `docs/refactor/action-object-matrix.md`

---

## Non-Negotiable Design Rules

1. **Behavior engine does math only** — `EditBehavior` returns `{pointIndex, x, y}`. It does NOT know about skeleton, width, or regeneration.

2. **Adapter translates** — Adapter converts `{x, y}` → object-specific format (`{halfWidth, nudge}` for ribs, `{x, y}` for skeleton points).

3. **Adapter owns persistence** — Adapter writes canonical data and returns `{forward, rollback}` change objects.

4. **Pointer routes only** — Pointer parses selection, determines `objectKind`, calls composer. Nothing else.

5. **No parallel behavior systems** — All point-like movement uses `EditBehavior` or `createPointBehaviorExecutor`. No `SkeletonEditBehavior`, no `RibEditBehavior` for drag/nudge.

---

## Verification Checklist

Before marking Phase 6 complete, verify:

- [ ] `edit-tools-pointer.js` line count reduced by ~2,500 lines
- [ ] `edit-behavior.js` custom behavior classes removed (~600 lines)
- [ ] All adapters in `pointer-objects.js` contain full implementation (not wrappers)
- [ ] No adapter calls `pointerTool._handle*` methods
- [ ] Grep for `regenerateSkeletonContours` shows only adapter usage
- [ ] Grep for `EditableRibBehavior|InterpolatingRibBehavior|RibEditBehavior` shows no drag/nudge usage
- [ ] Full matrix test passes (all C5-C8 cells)

---

## Why This Matters

**If adapters remain as wrappers:**
- Pointer still owns persistence (violates Rule 3)
- Behavior duplication remains (violates Rule 5)
- Domain separation is not achieved
- The refactor is incomplete

**If adapters are implemented correctly:**
- Pointer is transport-only (Rule 1 satisfied)
- Behavior is unified in `EditBehavior` (Rule 5 satisfied)
- Adapters own persistence (Rule 3 satisfied)
- Domain separation is achieved

---

## Sources

- `docs/refactor/plan-domain-separation.md` — Adapter Purpose (lines 26-40)
- `docs/refactor/pipeline-gap-report.md` — V2, V3, V4 (current violations)
- `src-js/views-editor/src/pointer-objects.js` — Current fake adapters (lines 28-240)
- `src-js/views-editor/src/edit-tools-pointer.js` — Pointer methods to move (lines 3243-6000)
- `src-js/views-editor/src/edit-behavior.js` — Custom behavior classes to remove (lines 1558-2175)
