# Design Document: Stroke Tool for Fontra (Improved)

Based on your specification and analysis of four architectural proposals, this document synthesizes the best ideas into a cohesive design. It uses Document #2's elegant metadata-based architecture as a foundation, incorporates naming clarity from #1, explicit role attributes from #3, and behavioral patterns from #4.

---

## 1. Conceptual Model

The Stroke Tool implements a **live offset curve system** with a dual-path architecture:

- **Spine (Centerline)**: An open Bézier curve that serves as the source of truth
- **Ribs (Width Data)**: Per-point width attributes stored on spine points
- **Generated Outline**: A transient closed contour derived from spine + widths
- **Edit Model**: The user manipulates the **outline**, but changes are projected back to spine widths

**Key Principle**: *Edit the ribbon, modify the spine.*

---

## 2. Data Model

### 2.1 Modified VarPackedPath Schema (Existing File: `var-path.js`)

Extend `contourInfo` to track derived contours:

```javascript
{
    isClosed: boolean,
    // NEW: Stroke metadata
    strokeSource: {
        contourIndex: number,  // Source spine contour
        mapping: Array<{ spineIndex: number, leftIndex: number, rightIndex: number }>
    } || null
}
```

### 2.2 Point Attributes (Existing File: `var-path.js`)

Add width attributes to spine points only:

```javascript
{
    widthLeft: number,      // Distance along negative normal
    widthRight: number,     // Distance along positive normal  
    isWidthHandle: boolean, // Marks virtual handle points (for selection clarity)
    strokeGroupId: string   // Links projected points to source
}
```

*Advantage: Uses existing `pointAttributes` infrastructure without breaking compatibility.*

---

## 3. Core Components (Patched into Existing Files)

### 3.1 Geometry Module (`path-functions.js`)

```javascript
// NEW: Stroke geometry extensions

export function calculateNormalAtAnchor(path, contourIndex, contourPointIndex) {
    // Uses existing bezier-js derivative logic
    // Angle bisector at corners, perpendicular at endpoints
}

export function generateStrokeOutline(spineContour, widthLeft, widthRight) {
    // 1. Calculate normals for all on-curve points
    // 2. Project left/right points: P ± N × width
    // 3. Build closed contour: [L0..Ln] + [Rn..R0]
    // 4. Generate end caps (flat for Phase 3, round for Phase 4)
    return { points: closedContourPoints, mapping: indexMapping };
}

export function insertOrUpdateStrokeContour(path, spineContourIndex) {
    // Creates spine's stroke contour if missing, updates existing
    // Maintains strokeSource metadata
}
```

### 3.2 Edit Behavior (`edit-behavior.js`)

```javascript
// NEW: WidthHandleEditBehavior (in existing file)

class WidthHandleEditBehavior extends BaseEditBehavior {
    makeChangeForDelta(delta) {
        const normal = calculateNormalAtAnchor(spinePath, spineIndex);
        const projectedDelta = vector.projectOntoNormal(delta, normal);
        
        if (event.altKey) {
            // Symmetric: adjust both widths equally
            updateWidths(spineIndex, projectedDelta, both=true);
        } else {
            // Asymmetric: adjust one side
            updateWidths(spineIndex, projectedDelta, side=this.side);
        }
    }
}
```

---

## 4. Implementation Plan: 5 Iterative Phases

### **Phase 1: Live-Stroke Tool Skeleton** (1-2 days)

**Goal**: Create a tool that behaves like Pen but produces separate open contours.

**Files Modified**:
- `scene-controller.js`: Register new tool
- `edit-tools-pen.js`: Extract reusable pen logic

**New File**: `tools/stroke-pen-tool.js`

```javascript
export class StrokePenTool extends PenToolCubic {
    identifier = "stroke-pen-tool";
    
    async _handleAddPoints(eventStream, initialEvent) {
        // Copy-paste pen logic but:
        // 1. Set `contour.strokeSource = null` (not a derived contour)
        // 2. Add `widthLeft`/`widthRight` (default 20) to each new point
        // 3. Never call `closeContour()`
    }
}
```

**Validation**:
- Draw open curves that persist in VarPackedPath
- Points have `widthLeft: 20, widthRight: 20` attributes
- Shows as thin centerline only (no projection yet)
- Undo/redo works via existing mechanisms

---

### **Phase 2: Normal Projection & Points Creation** (2 days)

**Goal**: Generate projected points along normals for each spine anchor.

**Files Modified**:
- `path-functions.js`: Add `calculateNormalAtAnchor()` helper
- `stroke-pen-tool.js`: Call projection after each `insertAnchorPoint()`

**Logic**:
```javascript
// After inserting point at index i:
const normal = calculateNormalAtAnchor(spinePath, contourIndex, i);
const leftPoint = project(spinePoint, normal, -20);
const rightPoint = project(spinePoint, normal, 20);

// Store projected points as *temporary* virtual handles
// (Not yet persisted - just for visualization)
```

**Validation**:
- Hovering spine point shows left/right diamond handles at 20 UPM offset
- Handles appear/disappear with tool switching
- No persistence yet (prevents data corruption during iteration)

---

### **Phase 3: Straight-Line Contour Generation** (3 days)

**Goal**: Create closed contour from projected points using straight segments.

**Files Modified**:
- `path-functions.js`: Implement `generateStrokeOutline()` with flat caps
- `scene-model.js`: Add stroke rendering path in `drawToPath2d` hook

**Steps**:
1. **Cap Generation**: Connect left[0]→right[0] and left[n]→right[n] with lines
2. **Contour Assembly**: `[L0..Ln] + [Rn..R0]` forming closed loop
3. **Metadata**: Store as derived contour with `strokeSource` mapping
4. **Rendering**: Draw filled outline instead of spine when tool is active

**Key Code**:
```javascript
// In scene-model.js draw loop:
if (contour.strokeSource) {
    const outline = generateStrokeOutline(spineContour);
    path.appendContour(outline.points);
    path.drawToPath2d(context);
    // Draw spine faintly for reference
    drawFaintCenterline(spineContour, context);
}
```

**Validation**:
- Stroke appears as filled polygon with flat ends
- Spine is visible as faint dashed line
- Selection only hits the filled outline (not spine)
- Zoom/pan performance is acceptable (cache generated outline)

---

### **Phase 4: Curved Contour Following Spine** (4 days)

**Goal**: Replace straight segments with smooth Bézier curves that match spine curvature.

**Files Modified**:
- `path-functions.js`: Enhance `generateStrokeOutline()` to calculate handles

**Math**:
```javascript
// For each segment between spine points P[i] and P[i+1]:
const tangent1 = getTangent(spine, i);
const tangent2 = getTangent(spine, i+1);
const normal1 = calculateNormal(tangent1);
const normal2 = calculateNormal(tangent2);

// Generate offset curve handles using 2/3 rule
leftHandleOut = P1 + normal1*width - tangent1*(dist/3);
rightHandleIn = P2 + normal2*width + tangent2*(dist/3);
```

**Edge Cases**:
- **Sharp corners**: Implement bevel/miter limit (start with simple bevel)
- **Zero width**: Collapse to spine point gracefully
- **Self-intersections**: Detect and clamp widths (Phase 5 polish)

**Validation**:
- Outline smoothly follows spine curvature
- Dragging spine handles regenerates outline correctly
- End caps become curved (semi-circles for round caps - optional)

---

### **Phase 5: Draggable Projected Points** (4 days)

**Goal**: Enable direct manipulation of stroke width via outline points.

**Files Modified**:
- `selection/hit-testing.js`: Extend `pointSelectionAtPoint()` to recognize width handles
- `edit-behavior.js`: Register `WidthHandleEditBehavior`
- `pointer-tool.js`: Dispatch to stroke behavior when `isWidthHandle: true`

**Implementation**:
1. **Selection Mapping**: When user clicks outline point:
   ```javascript
   const selection = new Set([`widthHandle/${spineIndex}/${side}`]);
   // side: "left" or "right"
   ```
2. **Constraint Logic**: In `WidthHandleEditBehavior.makeChangeForDelta()`:
   ```javascript
   const mouseDelta = {x: event.dx, y: event.dy};
   const normal = getCachedNormal(spineIndex); // From Phase 2
   const constrainedDelta = vector.projectOntoNormal(mouseDelta, normal);
   ```
3. **Width Update**: 
   ```javascript
   if (altKey) {
       // Symmetric: adjust both sides
       spinePoint.widthLeft += delta;
       spinePoint.widthRight += delta;
   } else {
       // Asymmetric: adjust one side only
       spinePoint[widthAttr] += delta;
   }
   ```
4. **Live Update**: Regenerate outline contour on drag, send incremental changes

**Validation**:
- Clicking outline edge selects width handle (not underlying spine)
- Dragging moves along normal only
- Alt-drag adjusts both sides symmetrically
- Undo/redo records width changes correctly
- Performance: outline regenerates at 60fps during drag

---

## 5. Integration Points Summary

| System | Modified File | Change |
|--------|---------------|--------|
| **Tool Registration** | `scene-controller.js` | Add `stroke-pen-tool` to registry |
| **Path Functions** | `path-functions.js` | Add 4 new stroke geometry helpers |
| **Selection** | `scene-model.js` | Check `strokeSource` metadata |
| **Hit Testing** | `selection/hit-testing.js` | Detect `isWidthHandle` attribute |
| **Behaviors** | `edit-behavior.js` | Add `WidthHandleEditBehavior` |
| **Pointer Tool** | `edit-tools-pointer.js` | Route stroke selections to new behavior |
| **Undo/Redo** | `path-functions.js` | Use existing `recordChanges` pattern |
| **Serialization** | `var-path.js` | Preserve `strokeSource` in `fromObject()` |

---


## 8. Deliverables

1. **One new file**: `src-js/views-editor/stroke-pen-tool.js`
2. **Modified files**: `path-functions.js`, `edit-behavior.js`, `scene-model.js`, `selection/hit-testing.js`, `var-path.js` (minimal changes)

This plan ensures each iteration is testable, builds on previous work, and maintains Fontra's architectural cleanliness.