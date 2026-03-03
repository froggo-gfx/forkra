# Target Architecture: File Structure and Data Flow

Date: 2026-03-03
Status: **Target State Specification**

---

## Part 1: Desired File Structure

### Core Behavior Engine (Single Source of Truth)

```
src-js/views-editor/src/edit-behavior.js
├── EditBehaviorFactory          ← Creates behavior instances for regular points
├── EditBehavior                 ← Behavior for regular points, anchors, guidelines
├── createPointBehaviorExecutor() ← Behavior executor for skeleton points
└── [REMOVED after Phase 6]
    ├── RibEditBehavior          ← Delete: replaced by EditBehavior + adapter
    ├── EditableRibBehavior      ← Delete: replaced by EditBehavior + adapter
    ├── InterpolatingRibBehavior ← Delete: replaced by EditBehavior + adapter
    └── EditableHandleBehavior   ← Delete: replaced by EditBehavior + adapter
```

**Responsibility:** Pure math only. Takes `delta` → returns `{pointIndex, x, y}`. Does NOT know about:
- Skeleton data
- Path regeneration
- Storage format
- Layers

---

### Registry (Declarative Configuration)

```
src-js/views-editor/src/edit-behavior-registry.js
├── OBJECT_KINDS                 ← Object catalog with capabilities
├── resolveBehaviorPreset()      ← Modifiers → behavior preset mapping
├── DRAG_ROUTING_MAP             ← Row × ObjectKind → routing value (CA/CL/NA)
├── NUDGE_ROUTING_MAP            ← Row × ObjectKind → routing value (CA/CL/NA)
├── getDragRowId()               ← Modifiers → matrix row
└── getNudgeRowId()              ← Modifiers → matrix row
```

**Responsibility:** Declarative routing configuration. No logic, no persistence.

---

### Composer (Uniform Orchestration)

```
src-js/views-editor/src/edit-behavior-composer.js
├── runDragOrchestration()       ← Standard drag for regular points (C1-C4)
├── runDragRoutingOrchestration() ← Routes drag by object kind using routing map
├── runNudgeOrchestration()      ← Standard nudge for regular points (C1-C4)
└── runNudgeRoutingOrchestration() ← Routes nudge by object kind using routing map
```

**Responsibility:** Orchestration only. Does NOT:
- Branch on object kind (routing map handles this)
- Do persistence (adapters handle this)
- Contain behavior math (edit-behavior.js handles this)

---

### Adapters (Translation + Persistence) ← CRITICAL CHANGE

```
src-js/views-editor/src/pointer-objects.js
├── canonicalDragAdapters
│   ├── regularPoint             ← Calls runDragOrchestration (regular points only)
│   ├── anchor                   ← Calls runDragOrchestration (anchors only)
│   ├── guideline                ← Calls runDragOrchestration (guidelines only)
│   ├── skeletonPoint            ← FULL IMPLEMENTATION (not wrapper)
│   ├── skeletonHandle           ← FULL IMPLEMENTATION (not wrapper)
│   ├── skeletonRibPoint         ← FULL IMPLEMENTATION (not wrapper)
│   ├── editableGeneratedPoint   ← FULL IMPLEMENTATION (not wrapper)
│   └── editableGeneratedHandle  ← FULL IMPLEMENTATION (not wrapper)
│
├── canonicalNudgeAdapters
│   ├── regularPoint             ← Calls runNudgeOrchestration (regular points only)
│   ├── anchor                   ← Calls runNudgeOrchestration (anchors only)
│   ├── guideline                ← Calls runNudgeOrchestration (guidelines only)
│   ├── skeletonPoint            ← FULL IMPLEMENTATION (not wrapper)
│   ├── skeletonHandle           ← FULL IMPLEMENTATION (not wrapper)
│   ├── skeletonRibPoint         ← FULL IMPLEMENTATION (not wrapper)
│   └── editableGeneratedPoint   ← FULL IMPLEMENTATION (not wrapper)
│
└── legacyDragAdapters           ← Temporary for out-of-scope kinds (Tunni, components)
    └── legacyNudgeAdapters
```

**Responsibility (for canonical adapters):**
1. **Translation:** Convert `{x, y}` from behavior → object-specific format
2. **Persistence:** Write canonical data, regenerate paths if needed
3. **Return:** `{forward, rollback}` change objects

**Must NOT:**
- Call `pointerTool._handle*` methods (this is the current bug)
- Parse selection strings
- Do modifier mapping

---

### Pointer Tool (Transport Only)

```
src-js/views-editor/src/edit-tools-pointer.js
├── handleDrag()                 ← Entry point for mouse drag
│   └── handleDragSelection()    ← Parses selection, routes to composer
│
├── handleArrowKeys()            ← Entry point for nudge
│   └── [Routes to composer]
│
├── [REMOVED after Phase 6]
│   ├── _handleDragSkeletonPoints           ← Move to adapter
│   ├── _handleDragRibPoint                 ← Move to adapter
│   ├── _handleDragEditableGeneratedPoints  ← Move to adapter
│   ├── _handleDragEditableGeneratedHandles ← Move to adapter
│   ├── _handleEqualizeHandlesDrag          ← Move to adapter
│   ├── _handleArrowKeysLegacy              ← Move to adapter
│   ├── _handleArrowKeysForRibPoints        ← Move to adapter
│   └── [etc.]
│
└── [STAYS - not drag/nudge]
    ├── handleHover()
    ├── handleRectSelect()
    ├── handleDoubleClick()
    ├── handleBoundsTransformSelection()
    ├── _handleTunniPointDrag()              ← Out of scope (Phase 7+)
    └── _handleSkeletonTunniDrag()           ← Out of scope (Phase 7+)
```

**Responsibility:**
1. Hit testing (what did user click?)
2. Selection management (what is selected?)
3. Routing (call composer with objectKind)
4. Cursor, hover state, visual feedback

**Must NOT:**
- Instantiate behavior classes
- Call `regenerateSkeletonContours`
- Call `setSkeletonData`
- Calculate delta from mouse movement
- Know about skeleton data structure

---

### Storage (Canonical Data)

```
src-js/fontra-core/src/skeleton-contour-generator.js
├── getSkeletonData()            ← Read canonical skeleton data
├── setSkeletonData()            ← Write canonical skeleton data
├── regenerateSkeletonContours() ← Generate path from skeleton
└── [Helper functions]
```

**Responsibility:** Only file that knows skeleton data structure. Adapters call these functions.

---

## Part 2: Mouse Input → Data Storage Pipeline

### Scenario 1: Regular Point Drag (C1-C4)

```
User Action: Mouse down on regular path point, drag, mouse up

1. Pointer Tool (hit test + routing)
   └── handleDragSelection(eventStream, initialEvent)
       └── parseSelection() → {point: [5, 7]}
       └── objectKind = "regularPoint"
       └── runDragRoutingOrchestration({objectKind: "regularPoint", ...})

2. Composer (orchestration)
   └── DRAG_ROUTING_MAP["R1"]["regularPoint"] = "CA"
   └── Call canonicalDragAdapters.regularPoint(context)
       └── runDragOrchestration(context)

3. Behavior Engine (math)
   └── EditBehaviorFactory(glyph, selection)
   └── behavior = factory.getBehavior("default")
   └── For each mouse move event:
       └── delta = {x: 10, y: 5}
       └── changes = behavior.applyDelta(delta)
           └── Returns: [{pointIndex: 5, x: 123, y: 456}, ...]

4. Composer (persistence for regular points)
   └── applyChange(layerGlyph.path, changes)
   └── recordChanges() → {forward, rollback}

5. Storage
   └── layerGlyph.path.point[5].x = 123
   └── layerGlyph.path.point[5].y = 456
```

**Key:** Regular points edit path directly. No translation needed.

---

### Scenario 2: Skeleton Point Drag (C5-C6)

```
User Action: Mouse down on skeleton point, drag, mouse up

1. Pointer Tool (hit test + routing)
   └── handleDragSelection(eventStream, initialEvent)
       └── parseSelection() → {skeletonPoint: ["0/3", "0/5"]}
       └── objectKind = "skeletonPoint"
       └── runDragRoutingOrchestration({objectKind: "skeletonPoint", ...})

2. Composer (orchestration)
   └── DRAG_ROUTING_MAP["R1"]["skeletonPoint"] = "CA"
   └── Call canonicalDragAdapters.skeletonPoint(context)

3. Adapter (translation + persistence) ← CRITICAL
   └── // Setup
       └── skeletonData = getSkeletonData(layer)
       └── behaviors = createPointBehaviorExecutor(skeletonData.contours[0].points, ...)
   
   └── // For each mouse move event:
       └── delta = {x: 10, y: 5}
       
       └── // BEHAVIOR MATH (standard)
           └── changes = executor.applyDelta(delta)
               └── Returns: [{pointIndex: 3, x: 200, y: 300}, ...]
       
       └── // ADAPTER TRANSLATION (identity for skeleton points)
           └── skeletonPoint.x = 200
           └── skeletonPoint.y = 300
       
       └── // ADAPTER PERSISTENCE
           └── regenerateSkeletonContours(glyph, skeletonData)
               └── Generates path from updated skeleton
           └── setSkeletonData(layer, skeletonData)
               └── Writes canonical skeleton data
       
       └── // RETURN CHANGE OBJECTS
           └── return {forward: change, rollback: rollbackChange}

4. Storage
   └── layer.customData.skeletonData.contours[0].points[3].x = 200
   └── layer.customData.skeletonData.contours[0].points[3].y = 300
   └── layer.glyph.path ← REGENERATED from skeleton
```

**Key:** Skeleton points use standard behavior executor. Adapter writes skeleton data, regenerates path.

---

### Scenario 3: Editable Generated Point Drag (C7-C8)

```
User Action: Mouse down on generated contour point (editable rib), drag, mouse up

1. Pointer Tool (hit test + routing)
   └── handleDragSelection(eventStream, initialEvent)
       └── parseSelection() → {point: [42]}  ← Regular point selection!
       └── Check: is point 42 in skeleton-generated contour? YES
       └── Check: is leftEditable=true? YES
       └── objectKind = "editableGeneratedPoint"
       └── runDragRoutingOrchestration({
               objectKind: "editableGeneratedPoint",
               editablePoints: [{
                 pointIndex: 42,
                 skeletonContourIndex: 0,
                 skeletonPointIndex: 3,
                 side: "left"
               }]
             })

2. Composer (orchestration)
   └── DRAG_ROUTING_MAP["R1"]["editableGeneratedPoint"] = "CA"
   └── Call canonicalDragAdapters.editableGeneratedPoint(context)

3. Adapter (translation + persistence) ← CRITICAL DIFFERENCE
   └── // Setup
       └── skeletonData = getSkeletonData(layer)
       └── skeletonPoint = skeletonData.contours[0].points[3]
       └── normal = calculateNormalAtSkeletonPoint(contour, 3)
       └── tangent = {x: -normal.y, y: normal.x}
       └── originalHalfWidth = skeletonPoint.leftWidth
       └── originalNudge = skeletonPoint.leftNudge
       
       └── // Create STANDARD behavior (not custom!)
           └── behaviorFactory = new EditBehaviorFactory(glyph, selection)
           └── behavior = behaviorFactory.getBehavior("default")
   
   └── // For each mouse move event:
       └── delta = {x: 10, y: 5}
       
       └── // BEHAVIOR MATH (standard EditBehavior)
           └── pointChanges = behavior.applyDelta(delta)
               └── Returns: [{pointIndex: 42, x: 500, y: 600}]
               └── ← This is the GENERATED POINT position
       
       └── // ADAPTER TRANSLATION (x,y → halfWidth, nudge)
           └── expectedBasePos = skeletonPoint + normal × originalHalfWidth
           └── actualDelta = {x: 500, y: 600} - expectedBasePos
           
           └── // Project onto normal (width change)
               └── halfWidthDelta = dot(actualDelta, normal)
               └── newHalfWidth = originalHalfWidth + halfWidthDelta
           
           └── // Project onto tangent (nudge change)
               └── nudgeDelta = dot(actualDelta, tangent)
               └── newNudge = originalNudge + nudgeDelta
       
       └── // ADAPTER PERSISTENCE (update skeleton, not path)
           └── skeletonPoint.leftWidth = newHalfWidth
           └── skeletonPoint.leftNudge = newNudge
           └── regenerateSkeletonContours(glyph, skeletonData)
               └── Path point 42 moves as SIDE EFFECT
           └── setSkeletonData(layer, skeletonData)
       
       └── // RETURN CHANGE OBJECTS
           └── return {forward: change, rollback: rollbackChange}

4. Storage
   └── layer.customData.skeletonData.contours[0].points[3].leftWidth = 45
   └── layer.customData.skeletonData.contours[0].points[3].leftNudge = 2
   └── layer.glyph.path ← REGENERATED (point 42 position updated automatically)
```

**Key:** Editable generated points use STANDARD `EditBehavior`. Adapter translates `{x, y}` → `{halfWidth, nudge}`. Path is regenerated from skeleton.

---

### Scenario 4: Rib Point Drag (C7, width handle)

```
User Action: Mouse down on rib handle (diamond on side of skeleton point), drag, mouse up

1. Pointer Tool (hit test + routing)
   └── handleDragSelection(eventStream, initialEvent)
       └── parseSelection() → {skeletonRibPoint: ["0/3/left"]}
       └── objectKind = "skeletonRibPoint"
       └── runDragRoutingOrchestration({objectKind: "skeletonRibPoint", ...})

2. Composer (orchestration)
   └── DRAG_ROUTING_MAP["R1"]["skeletonRibPoint"] = "CA"
   └── Call canonicalDragAdapters.skeletonRibPoint(context)

3. Adapter (translation + persistence)
   └── // Setup
       └── skeletonData = getSkeletonData(layer)
       └── skeletonPoint = skeletonData.contours[0].points[3]
       └── normal = calculateNormalAtSkeletonPoint(contour, 3)
       └── originalHalfWidth = skeletonPoint.leftWidth
   
   └── // For each mouse move event:
       └── delta = {x: 10, y: 5}
       
       └── // ADAPTER TRANSLATION (constrain to normal)
           └── // Rib points ONLY move along normal (width change)
           └── halfWidthDelta = dot(delta, normal)
           └── newHalfWidth = originalHalfWidth + halfWidthDelta
       
       └── // ADAPTER PERSISTENCE
           └── skeletonPoint.leftWidth = newHalfWidth
           └── regenerateSkeletonContours(glyph, skeletonData)
           └── setSkeletonData(layer, skeletonData)
       
       └── return {forward: change, rollback: rollbackChange}

4. Storage
   └── layer.customData.skeletonData.contours[0].points[3].leftWidth = 45
   └── layer.glyph.path ← REGENERATED
```

**Key:** Rib points don't need full behavior engine — they only move along normal. Adapter does simple projection.

---

## Part 3: Data Flow Summary Table

| Object Kind | Behavior Used | Adapter Translation | Persistence Target |
|-------------|---------------|---------------------|-------------------|
| **regularPoint** | `EditBehavior` | None (identity) | `layerGlyph.path` |
| **anchor** | `EditBehavior` | None (identity) | `layerGlyph.anchors` |
| **guideline** | `EditBehavior` | None (identity) | `layerGlyph.guidelines` |
| **skeletonPoint** | `createPointBehaviorExecutor` | None (identity) | `skeletonData` + regenerate |
| **skeletonHandle** | `createPointBehaviorExecutor` | None (identity) | `skeletonData` + regenerate |
| **skeletonRibPoint** | (direct projection) | `delta` → `halfWidth` | `skeletonData` + regenerate |
| **editableGeneratedPoint** | `EditBehavior` | `{x,y}` → `{halfWidth, nudge}` | `skeletonData` + regenerate |
| **editableGeneratedHandle** | `EditBehavior` | `{x,y}` → `handleOffset` | `skeletonData` + regenerate |

---

## Part 4: What Changes in Phase 6

### Before (Current Fake Adapters)

```
pointer-objects.js:
  runEditableGeneratedPointsDragCanonical(context) {
    return pointerTool._handleDragEditableGeneratedPoints(...);  // ← Wrapper
  }

edit-tools-pointer.js:
  async _handleDragEditableGeneratedPoints(...) {
    // 200 lines of:
    // - Behavior instantiation (EditableRibBehavior)
    // - Delta calculation
    // - Persistence (regenerateSkeletonContours)
  }

edit-behavior.js:
  class EditableRibBehavior {  // ← Custom behavior (duplication)
    applyDelta(delta) { ... }
  }
```

### After (Real Adapters)

```
pointer-objects.js:
  async function runEditableGeneratedPointsDragCanonical(context) {
    const { sceneController, selection, initialEvent, eventStream, glyph } = context;
    
    // 1. Standard behavior
    const behaviorFactory = new EditBehaviorFactory(glyph, selection);
    const behavior = behaviorFactory.getBehavior("default");
    
    // 2. Get skeleton data
    const skeletonData = getSkeletonData(layer);
    
    // 3. Drag loop
    for await (const event of eventStream) {
      const delta = calculateDelta(event, initialEvent);
      
      // Standard behavior math
      const pointChanges = behavior.applyDelta(delta);  // {x, y}
      
      // Adapter translation
      const skeletonChanges = translateToWidth(pointChanges, skeletonData);
      
      // Adapter persistence
      applySkeletonChanges(skeletonData, skeletonChanges);
      regenerateSkeletonContours(glyph, skeletonData);
    }
    
    return {forward, rollback};
  }

edit-tools-pointer.js:
  // _handleDragEditableGeneratedPoints DELETED

edit-behavior.js:
  // EditableRibBehavior DELETED
```

---

## Part 5: Verification Commands

After Phase 6, run these to verify:

```bash
# 1. Pointer should NOT contain persistence logic
grep -n "regenerateSkeletonContours" src-js/views-editor/src/edit-tools-pointer.js
# Expected: No results (or only in Tunni handlers, which are out of scope)

# 2. Adapters MUST contain persistence logic
grep -n "regenerateSkeletonContours" src-js/views-editor/src/pointer-objects.js
# Expected: Multiple results (one per skeleton adapter)

# 3. Custom behavior classes should be deleted
grep -n "class EditableRibBehavior\|class InterpolatingRibBehavior\|class RibEditBehavior" src-js/views-editor/src/edit-behavior.js
# Expected: No results

# 4. Adapters should NOT call pointer methods
grep -n "pointerTool._handleDrag\|pointerTool._handleArrowKeys" src-js/views-editor/src/pointer-objects.js
# Expected: No results

# 5. Pointer line count should decrease
wc -l src-js/views-editor/src/edit-tools-pointer.js
# Expected: ~5,200 lines (down from 7,787)
```

---

## Summary

**File Structure:**
- `edit-behavior.js` — Behavior math only (unified)
- `edit-behavior-registry.js` — Routing configuration (declarative)
- `edit-behavior-composer.js` — Orchestration only (uniform)
- `pointer-objects.js` — Translation + persistence (object-specific)
- `edit-tools-pointer.js` — Hit test + routing only (transport)

**Data Flow:**
```
Mouse → Pointer (route) → Composer (orchestrate) → Behavior (math) → Adapter (translate + persist) → Storage
```

**Phase 6 Goal:** Make adapters REAL (translation + persistence), not fake wrappers.
