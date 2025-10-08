# Tunni Tool Undo-Redo Issue: Comprehensive Analysis & Fix Plan

## 1. Analysis of Correct Undo-Redo Implementation (Reference: Pen Tool)

### Key Characteristics of Correct Implementation

The Pen Tool demonstrates the correct pattern for undo-redo in Fontra:

```javascript
// From edit-tools-pen.js, lines 204-263
async _handleAddPoints(eventStream, initialEvent) {
  await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    // 1. Setup initial state
    const initialChanges = recordLayerChanges(layerInfo, (behavior, layerGlyph) => {
      behavior.initialChanges(layerGlyph.path, initialEvent);
    });
    
    // 2. Apply initial changes
    await sendIncrementalChange(initialChanges.change);
    
    // 3. Handle drag (if applicable)
    let preDragChanges = new ChangeCollector();
    let dragChanges = new ChangeCollector();
    
    if (await shouldInitiateDrag(eventStream, initialEvent)) {
      preDragChanges = recordLayerChanges(...);
      await sendIncrementalChange(preDragChanges.change);
      
      for await (const event of eventStream) {
        dragChanges = recordLayerChanges(...);
        await sendIncrementalChange(dragChanges.change, true); // mayDrop=true
      }
    }
    
    await sendIncrementalChange(dragChanges.change);
    
    // 4. Consolidate all changes
    const finalChanges = initialChanges.concat(preDragChanges, dragChanges);
    
    // 5. Return consolidated changes
    return {
      changes: finalChanges,
      undoLabel: primaryBehavior.undoLabel,
    };
  });
}
```

**Critical Pattern:**
- Uses `editGlyph()` which handles the entire edit session
- Collects ALL changes (initial + drag) into a single ChangeCollector
- Returns consolidated changes at the end
- Only ONE undo record is created for the entire operation

## 2. Analysis of Current Tunni Tool Implementation

### Problem Areas Identified

#### Issue #1: Double Recording in `handleMouseDown`

```javascript
// From edit-tools-tunni.js, lines 179-189
await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
  for (const layerGlyph of Object.values(layerGlyphs)) {
    const layerPath = layerGlyph.path;
    // Recording the STARTING state - THIS CREATES UNDO RECORD #1
    layerPath.setPointPosition(controlPoint1Index, originalControlPoint1.x, originalControlPoint1.y);
    layerPath.setPointPosition(controlPoint2Index, originalControlPoint2.x, originalControlPoint2.y);
  }
  return "Start Tunni Point Drag";
});
```

**Problem:** This creates an unnecessary undo record at the start of the drag.

#### Issue #2: Using `editGlyph` During Drag

```javascript
// From edit-tools-tunni.js, lines 458-513
await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
  // This correctly uses incremental changes during drag
  // but the changes are NOT accumulated
  await sendIncrementalChange({ c: forwardChanges }, true);
});
```

**Problem:** While this correctly uses incremental updates during drag, it doesn't accumulate changes.

#### Issue #3: Double Recording in `handleMouseUp`

```javascript
// From edit-tools-tunni.js, lines 524-540
await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
  for (const layerGlyph of Object.values(layerGlyphs)) {
    // Recording the FINAL state - THIS CREATES UNDO RECORD #2
    path.setPointPosition(controlPoint1Index, finalControlPoint1.x, finalControlPoint1.y);
    path.setPointPosition(controlPoint2Index, finalControlPoint2.x, finalControlPoint2.y);
  }
  return "Move Tunni Points";
});
```

**Problem:** This creates another undo record at the end of the drag.

### Current Flow Diagram

```
Mouse Down → editLayersAndRecordChanges() → UNDO RECORD #1 ❌
    ↓
Mouse Drag → editGlyph() → sendIncrementalChange() → Visual updates ✓
    ↓
Mouse Up → editLayersAndRecordChanges() → UNDO RECORD #2 ❌

Result: 2 undo records instead of 1
```

## 3. Comparison and Root Cause Analysis

| Aspect | Pen Tool (Correct) | Tunni Tool (Broken) |
|--------|-------------------|---------------------|
| **Entry Point** | `editGlyph()` wraps entire operation | `editLayersAndRecordChanges()` called at start |
| **Initial State** | Recorded via `recordLayerChanges()` | Recorded via `editLayersAndRecordChanges()` ❌ |
| **Drag Updates** | `sendIncrementalChange()` with mayDrop | `sendIncrementalChange()` ✓ |
| **Change Accumulation** | ChangeCollector concatenates all changes | No accumulation ❌ |
| **Final State** | Returned from `editGlyph()` callback | `editLayersAndRecordChanges()` called again ❌ |
| **Undo Records Created** | 1 (correct) | 2 (incorrect) |

### Root Causes

1. **Wrong Method Usage**: Using `editLayersAndRecordChanges()` creates immediate undo records. Should use `editGlyph()` instead.
2. **Missing Change Accumulation**: Not collecting changes in a ChangeCollector to consolidate at the end.
3. **Split Recording**: Recording at both start AND end instead of consolidating into one operation.

## 4. Comprehensive Fix Plan

### Architecture Principles to Maintain

- **Do NOT change** `scene-controller.js` core methods
- **Do NOT change** the overall tool architecture
- **Only modify** `edit-tools-tunni.js` implementation
- Follow the established pattern from `edit-tools-pen.js`

### Fix Strategy Overview

Transform the Tunni Tool to follow the same pattern as Pen Tool:
1. Wrap entire drag operation in a single `editGlyph()` call
2. Use `recordLayerChanges()` helper to collect changes
3. Accumulate all changes in ChangeCollector
4. Return consolidated changes at the end

---

## Step-by-Step Fix Plan

### Step 1: Create Helper Function `recordLayerChanges`

**File:** `edit-tools-tunni.js`  
**Location:** After imports, before `TunniTool` class definition  
**Purpose:** Provide a reusable function to record changes across multiple layers (same pattern as pen tool)

**Function Signature:**
```javascript
function recordLayerChanges(layerInfo, editFunc)
```

**Inputs:**
- `layerInfo`: Array of objects with `{ layerName, layerGlyph }`
- `editFunc`: Function that performs edits on a layer

**Outputs:**
- Returns: `ChangeCollector` with accumulated changes

**Implementation:**
```javascript
import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector } from "@fontra/core/changes.js";

function recordLayerChanges(layerInfo, editFunc) {
  const layerChanges = [];
  for (const { layerName, layerGlyph } of layerInfo) {
    const layerChange = recordChanges(layerGlyph, (layerGlyph) =>
      editFunc(layerGlyph)
    );
    layerChanges.push(layerChange.prefixed(["layers", layerName, "glyph"]));
  }
  return new ChangeCollector().concat(...layerChanges);
}
```

---

### Step 2: Refactor `handleMouseDown` - Remove Recording

**File:** `edit-tools-tunni.js`  
**Function:** `TunniEditingTool.handleMouseDown`  
**Lines:** 88-281  
**Purpose:** Remove the `editLayersAndRecordChanges` call that creates the first unwanted undo record

**Changes:**

**REMOVE these lines (179-189):**
```javascript
// Immediately record the starting state for undo functionality
const originalControlPoint1 = { ...path.getPoint(controlPoint1Index) };
const originalControlPoint2 = { ...path.getPoint(controlPoint2Index) };

// This will create the initial undo point for this action
await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
  for (const layerGlyph of Object.values(layerGlyphs)) {
    const layerPath = layerGlyph.path;
    layerPath.setPointPosition(controlPoint1Index, originalControlPoint1.x, originalControlPoint1.y);
    layerPath.setPointPosition(controlPoint2Index, originalControlPoint2.x, originalControlPoint2.y);
  }
  return "Start Tunni Point Drag";
});
```

**KEEP the storage of original control points** (lines 166-173), but just for reference:
```javascript
// Store original control point positions for undo functionality
const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
if (positionedGlyph && positionedGlyph.glyph && positionedGlyph.glyph.path) {
  const path = positionedGlyph.glyph.path;
  const controlPoint1Index = hit.segment.parentPointIndices[1];
  const controlPoint2Index = hit.segment.parentPointIndices[2];
  if (controlPoint1Index !== undefined && controlPoint2Index !== undefined) {
    this.originalControlPoints = {
      controlPoint1Index: controlPoint1Index,
      controlPoint2Index: controlPoint2Index,
      originalControlPoint1: { ...path.getPoint(controlPoint1Index) },
      originalControlPoint2: { ...path.getPoint(controlPoint2Index) }
    };
  }
}
```

**Result:** `handleMouseDown` now only stores state, doesn't create undo records.

---

### Step 3: Create `handleDragOperation` Method

**File:** `edit-tools-tunni.js`  
**Class:** `TunniEditingTool`  
**Location:** Add new method after `handleMouseDown`  
**Purpose:** Wrap the entire drag operation in a single `editGlyph()` call (like Pen Tool)

**Function Signature:**
```javascript
async handleDragOperation(eventStream, initialEvent)
```

**Inputs:**
- `eventStream`: Async iterator of drag events
- `initialEvent`: The initial mouse down event

**Outputs:**
- Returns: Promise that resolves when drag is complete

**Implementation:**
```javascript
async handleDragOperation(eventStream, initialEvent) {
  await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    // Prepare layer info
    const layerInfo = Object.entries(
      this.sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
    ).map(([layerName, layerGlyph]) => {
      return {
        layerName,
        layerGlyph,
        changePath: ["layers", layerName, "glyph"],
      };
    });

    // No initial changes needed - we're already at the starting position
    let dragChanges = new ChangeCollector();

    // Process all drag events
    for await (const event of eventStream) {
      if (event.type === "mouseup") {
        break;
      } else if (event.type === "mousemove") {
        // Calculate new control point positions
        const newControlPoints = this.calculateNewControlPoints(event);
        
        if (newControlPoints) {
          // Record the changes for this drag step
          dragChanges = recordLayerChanges(layerInfo, (layerGlyph) => {
            const path = layerGlyph.path;
            const controlPoint1Index = this.originalControlPoints.controlPoint1Index;
            const controlPoint2Index = this.originalControlPoints.controlPoint2Index;
            
            path.setPointPosition(controlPoint1Index, newControlPoints[0].x, newControlPoints[0].y);
            path.setPointPosition(controlPoint2Index, newControlPoints[1].x, newControlPoints[1].y);
          });
          
          // Send incremental update for visual feedback
          await sendIncrementalChange(dragChanges.change, true); // mayDrop=true
        }
      }
    }

    // Return the final accumulated changes
    return {
      changes: dragChanges,
      undoLabel: "Move Tunni Points",
    };
  });
}
```

---

### Step 4: Extract Control Point Calculation Logic

**File:** `edit-tools-tunni.js`  
**Class:** `TunniEditingTool`  
**Location:** Add new method after `handleDragOperation`  
**Purpose:** Extract the control point calculation logic from `handleMouseDrag` into a pure calculation method

**Function Signature:**
```javascript
calculateNewControlPoints(event)
```

**Inputs:**
- `event`: Mouse event with position information

**Outputs:**
- Returns: Array `[newControlPoint1, newControlPoint2]` or `null` if calculation fails

**Implementation:**
```javascript
calculateNewControlPoints(event) {
  // Check if we have the necessary data
  if (!this.initialMousePosition || !this.initialOffPoint1 || 
      !this.initialOffPoint2 || !this.selectedSegment) {
    return null;
  }
  
  const point = this.sceneController.localPoint(event);
  
  // Convert from scene coordinates to glyph coordinates
  const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };
  
  // Calculate mouse movement vector
  const mouseDelta = {
    x: glyphPoint.x - this.initialMousePosition.x,
    y: glyphPoint.y - this.initialMousePosition.y
  };
  
  // Check if Alt key is pressed to disable equalizing distances
  const equalizeDistances = !event.altKey;
  
  let newControlPoint1, newControlPoint2;
  
  if (equalizeDistances) {
    // Proportional editing
    const projection = mouseDelta.x * this.fortyFiveVector.x + 
                      mouseDelta.y * this.fortyFiveVector.y;
    
    newControlPoint1 = {
      x: this.initialOffPoint1.x + this.unitVector1.x * projection,
      y: this.initialOffPoint1.y + this.unitVector1.y * projection
    };
    
    newControlPoint2 = {
      x: this.initialOffPoint2.x + this.unitVector2.x * projection,
      y: this.initialOffPoint2.y + this.unitVector2.y * projection
    };
  } else {
    // Non-proportional editing
    const projection1 = mouseDelta.x * this.unitVector1.x + 
                       mouseDelta.y * this.unitVector1.y;
    const projection2 = mouseDelta.x * this.unitVector2.x + 
                       mouseDelta.y * this.unitVector2.y;
    
    newControlPoint1 = {
      x: this.initialOffPoint1.x + this.unitVector1.x * projection1,
      y: this.initialOffPoint1.y + this.unitVector1.y * projection1
    };
    
    newControlPoint2 = {
      x: this.initialOffPoint2.x + this.unitVector2.x * projection2,
      y: this.initialOffPoint2.y + this.unitVector2.y * projection2
    };
  }
  
  // Update tunniPoint for visualization
  this.tunniPoint = calculateTunniPoint([
    this.initialOnPoint1,
    newControlPoint1,
    newControlPoint2,
    this.initialOnPoint2
  ]);
  
  return [newControlPoint1, newControlPoint2];
}
```

---

### Step 5: Refactor `handleMouseDrag` - Remove Recording

**File:** `edit-tools-tunni.js`  
**Function:** `TunniEditingTool.handleMouseDrag`  
**Lines:** 366-518  
**Purpose:** This method is no longer needed since all logic moves to `handleDragOperation`

**Action:** **MARK AS DEPRECATED** (keep for now but don't use)

Add comment at the top:
```javascript
/**
 * @deprecated This method is no longer used. The drag operation is now handled
 * by handleDragOperation() which wraps everything in a single editGlyph() call.
 * Keeping this method temporarily for reference.
 */
async handleMouseDrag(event) {
  // ... existing code ...
}
```

---

### Step 6: Refactor `handleMouseUp` - Remove Recording

**File:** `edit-tools-tunni.js`  
**Function:** `TunniEditingTool.handleMouseUp`  
**Lines:** 520-563  
**Purpose:** Simplify to only clean up state, no recording

**REPLACE entire function with:**
```javascript
handleMouseUp(event) {
  // Clear all stored state
  this.tunniPoint = null;
  this.selectedSegment = null;
  this.originalSegmentPoints = null;
  this.originalControlPoints = null;
  this.isActive = false;
  this.initialMousePosition = null;
  this.initialOnPoint1 = null;
  this.initialOffPoint1 = null;
  this.initialOffPoint2 = null;
  this.initialOnPoint2 = null;
  this.initialVector1 = null;
  this.initialVector2 = null;
  this.unitVector1 = null;
  this.unitVector2 = null;
  this.fortyFiveVector = null;
}
```

**Note:** Remove all the `editLayersAndRecordChanges` code. Cleanup is now synchronous.

---

### Step 7: Update `TunniTool.handleDrag`

**File:** `edit-tools-tunni.js`  
**Function:** `TunniTool.handleDrag`  
**Lines:** 46-70  
**Purpose:** Update to use the new `handleDragOperation` method

**REPLACE entire function with:**
```javascript
async handleDrag(eventStream, initialEvent) {
  // Check if the tool is active before processing events
  if (!this.isActive) {
    return;
  }
  
  // Handle the initial mouse down event (stores state, no recording)
  await this.sceneController.tunniEditingTool.handleMouseDown(initialEvent);
  
  // Check if a segment was selected
  if (!this.sceneController.tunniEditingTool.selectedSegment) {
    return;
  }

  // Handle the entire drag operation with proper undo/redo
  try {
    await this.sceneController.tunniEditingTool.handleDragOperation(
      eventStream, 
      initialEvent
    );
  } catch (error) {
    console.error("Error handling drag operation:", error);
  } finally {
    // Always clean up state
    this.sceneController.tunniEditingTool.handleMouseUp({});
  }
}
```

---

### Step 8: Fix `handleEqualizeDistances` - Maintain Current Behavior

**File:** `edit-tools-tunni.js`  
**Function:** `TunniEditingTool.handleEqualizeDistances`  
**Lines:** 288-308  
**Purpose:** This function is called separately (Ctrl+Shift+Click), it should keep using `editLayersAndRecordChanges` since it's a single atomic operation

**Action:** **NO CHANGES NEEDED** - This function is correct as-is because:
- It's triggered by a single click, not a drag
- It should create ONE undo record immediately
- It uses `editLayersAndRecordChanges` correctly

Keep lines 327-363 as they are.

---

### Step 9: Update Imports

**File:** `edit-tools-tunni.js`  
**Location:** Top of file  
**Purpose:** Add necessary imports for the new implementation

**ADD these imports:**
```javascript
import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector } from "@fontra/core/changes.js";
```

**Existing imports to keep:**
```javascript
import { BaseTool } from "./edit-tools-base.js";
import { 
  calculateTunniPoint, 
  calculateControlPointsFromTunni, 
  calculateEqualizedControlPoints, 
  areDistancesEqualized 
} from "@fontra/core/tunni-calculations.js";
import { distance, subVectors, dotVector, vectorLength } from "@fontra/core/vector.js";
```

---

### Step 10: Testing and Verification

**File:** N/A (Testing procedure)  
**Purpose:** Verify the fix works correctly

**Test Cases:**

1. **Basic Drag Test**
   - Action: Click and drag a Tunni point
   - Expected: Single undo brings back original position
   - Verify: Press Ctrl+Z once, point returns to start

2. **Multiple Drag Test**
   - Action: Drag Tunni point, release, drag another
   - Expected: Each drag creates one undo record
   - Verify: Press Ctrl+Z twice, both operations undo

3. **Equalize Test**
   - Action: Ctrl+Shift+Click on Tunni point
   - Expected: Single undo reverts equalization
   - Verify: Press Ctrl+Z once, distances return to original

4. **Alt Key Test**
   - Action: Drag with Alt key pressed (non-proportional)
   - Expected: Single undo brings back original position
   - Verify: Behavior consistent with proportional mode

5. **Redo Test**
   - Action: Drag, undo, redo
   - Expected: Single redo restores the drag
   - Verify: Press Ctrl+Y once, drag is reapplied

---

## Summary of Changes

### Files Modified
1. **edit-tools-tunni.js** - Main implementation file

### Functions Modified/Added

| Function | Type | Purpose |
|----------|------|---------|
| `recordLayerChanges` | NEW | Helper to record changes across layers |
| `handleMouseDown` | MODIFIED | Remove recording, only store state |
| `handleDragOperation` | NEW | Main drag handler with proper undo/redo |
| `calculateNewControlPoints` | NEW | Extract calculation logic |
| `handleMouseDrag` | DEPRECATED | Marked for removal |
| `handleMouseUp` | MODIFIED | Simplified to only cleanup |
| `TunniTool.handleDrag` | MODIFIED | Use new drag operation flow |
| `handleEqualizeDistances` | NO CHANGE | Already correct |

### Key Improvements

1. **Single Undo Record**: Entire drag operation creates only one undo record
2. **Proper Change Accumulation**: Uses ChangeCollector pattern like Pen Tool
3. **Clean Separation**: Calculation logic separated from recording logic
4. **Maintains Architecture**: No changes to scene-controller or core systems
5. **Backward Compatible**: Equalize function unchanged

### Before vs After Flow

**BEFORE (Broken):**
```
Mouse Down → Record Start State → UNDO #1 ❌
    ↓
Mouse Drag → Visual Updates
    ↓
Mouse Up → Record End State → UNDO #2 ❌
```

**AFTER (Fixed):**
```
Mouse Down → Store Initial State (no recording)
    ↓
Drag Operation (editGlyph wraps entire operation)
    ├→ Mouse Drag → Calculate + Apply + Record Changes
    └→ Mouse Up → Return Accumulated Changes → UNDO #1 ✅
```

This plan provides a complete, step-by-step solution that follows Fontra's established patterns and fixes the double-undo issue without architectural changes.