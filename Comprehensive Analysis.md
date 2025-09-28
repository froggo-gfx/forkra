# Comprehensive Analysis and Fix for Tunni Tools Undo-Redo Issue

## 1. General Undo-Redo Functionality in the System

### Overview
The Fontra editor implements a sophisticated undo-redo system that works at the glyph level. Each glyph has its own undo stack maintained by the `FontController` class. The system uses a command pattern where each edit operation creates a change object and a corresponding rollback change object.

### Core Components
- **UndoStack class**: Manages the undo and redo stacks for each glyph
- **FontController**: Maintains undo stacks per glyph and handles undo/redo operations
- **SceneController**: Provides methods like `editLayersAndRecordChanges` and `editGlyph` for making changes
- **ChangeRecorder**: Records changes to objects using the `recordChanges` function

### How Undo-Redo Works
1. When an edit operation occurs, changes are recorded in a change object
2. A corresponding rollback change is created
3. Both changes are pushed to the undo stack for the specific glyph
4. When undo is requested, the topmost undo record is popped from the undo stack and pushed to the redo stack
5. The rollback change is applied to revert the edit
6. When redo is requested, the process is reversed

### Key Methods
- `editLayersAndRecordChanges`: Creates a single undo record for the entire operation
- `editGlyph`: Allows incremental changes during operations like dragging without creating undo records immediately
- `editFinal`: Commits the changes and creates the undo record

## 2. How Undo-Redo Should Work

### Expected Behavior
- Each distinct user operation should correspond to exactly one undo/redo record
- A single undo/redo hotkey press should revert/redo exactly one logical operation
- For drag operations, all changes made during the drag should be grouped into a single undo record
- The final state after an undo should match the state before the operation started

### Best Practices
- Use `editLayersAndRecordChanges` for atomic operations that should be undoable as a single unit
- Use `editGlyph` with incremental changes only during live interactions (like dragging) where immediate visual feedback is needed
- Ensure that when a drag operation ends, no additional undo records are created if the changes were already applied incrementally

## 3. The Issue with Tunni Undo-Redo

### Problem Description
The issue manifests as the first action in the row of undos requiring two hotkey presses instead of one. This happens because:

1. During the tunni point drag operation, changes are applied incrementally via `editGlyph` (in `handleTunniPointMouseDrag` function)
2. When the mouse is released, `handleTunniPointMouseUp` calls `editLayersAndRecordChanges` to record the final state
3. This creates TWO undo records: one for the incremental changes and one for the final recording
4. When the user presses undo, the first press undoes the final recording operation (which doesn't visually change anything since the changes were already applied)
5. The second press undoes the actual changes made during the drag

### Root Cause
The refactored implementation incorrectly separates the drag changes (applied via `editGlyph`) from the undo recording (done in `handleTunniPointMouseUp` via `editLayersAndRecordChanges`). This creates two separate undo operations for what should be a single logical operation.

### Code Locations with Issues
- `tunni-calculations.js`:
 - `handleTunniPointMouseDrag`: Uses `editGlyph` for incremental changes
  - `handleTunniPointMouseUp`: Uses `editLayersAndRecordChanges` to record final state

## 4. Clear Actionable Plan for Fixing the Issue

### Solution Approach
The fix should ensure that the entire tunni point drag operation is treated as a single undo-able operation, similar to the original tool-based implementation shown in `broken-redo.js`.

### Files and Functions That Need Changes

#### 1. `src-js/fontra-core/src/tunni-calculations.js`

**Function: `handleTunniPointMouseDrag`**
- **Current Issue**: Uses `editGlyph` which sends incremental changes but doesn't create undo records
- **Fix**: Remove the `editGlyph` call during drag since changes will be applied in a single atomic operation

**Function: `handleTunniPointMouseUp`**
- **Current Issue**: Creates a separate undo record for changes that were already applied incrementally
- **Fix**: This function should only return the final state without applying changes, as the changes will be applied atomically in the pointer tool

**Function: `handleTunniPointMouseDown`**
- **No changes needed** - this function correctly captures the initial state

#### 2. `src-js/views-editor/src/edit-tools-pointer.js`

**Drag handling logic in `handleDrag` function** (around lines 178-194)
- **Current Issue**: The drag operation is split between the tunni functions and doesn't use a single atomic operation
- **Fix**: Wrap the entire tunni drag operation in a single `editLayersAndRecordChanges` call, similar to the pattern in `broken-redo.js`

### Implementation Plan

#### Step 1: Modify `tunni-calculations.js`
1. Update `handleTunniPointMouseDrag` to only calculate the new positions without applying them
2. Update `handleTunniPointMouseUp` to return the calculated changes without applying them

#### Step 2: Update `edit-tools-pointer.js`
1. Modify the drag handling logic to use a single atomic operation
2. Apply all changes at the end of the drag operation using `editLayersAndRecordChanges`

#### Step 3: Maintain backward compatibility
1. Ensure the hover and click detection still works properly
2. Preserve the visual feedback during dragging

### Specific Code Changes

#### In `tunni-calculations.js`:

```javascript
/**
 * Calculates new control points based on Tunni point movement during drag
 * @param {Object} event - Mouse event
 * @param {Object} initialState - Initial state from mouse down
 * @param {Object} sceneController - Scene controller for editing operations
 * @returns {Object} Object containing control point indices and new positions
 */
export function calculateTunniPointDragChanges(event, initialState, sceneController) {
  // Check if we have the necessary data to process the drag
  if (!initialState || !initialState.initialMousePosition || !initialState.initialOffPoint1 || !initialState.initialOffPoint2 || !initialState.selectedSegment || !initialState.originalSegmentPoints) {
    return null;
 }

  const point = sceneController.localPoint(event);
  
  // Convert from scene coordinates to glyph coordinates
  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return null; // No positioned glyph, so no Tunni point interaction possible
  }
  
  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };
  
  // Calculate mouse movement vector
  const mouseDelta = {
    x: glyphPoint.x - initialState.initialMousePosition.x,
    y: glyphPoint.y - initialState.initialMousePosition.y
 };
  
  // Check if Alt key is pressed to disable equalizing distances
  const equalizeDistances = !event.altKey;
  
  let newControlPoint1, newControlPoint2;
  
  if (equalizeDistances) {
    // Proportional editing: Move both control points by the same amount along their respective vectors
    // Project mouse movement onto the 45-degree vector
    const projection = mouseDelta.x * initialState.fortyFiveVector.x + mouseDelta.y * initialState.fortyFiveVector.y;
    
    // Move both control points by the same amount along their respective vectors
    newControlPoint1 = {
      x: initialState.initialOffPoint1.x + initialState.unitVector1.x * projection,
      y: initialState.initialOffPoint1.y + initialState.unitVector1.y * projection
    };
    
    newControlPoint2 = {
      x: initialState.initialOffPoint2.x + initialState.unitVector2.x * projection,
      y: initialState.initialOffPoint2.y + initialState.unitVector2.y * projection
    };
  } else {
    // Non-proportional editing: Each control point moves independently along its own vector
    // Project mouse movement onto each control point's individual unit vector
    const projection1 = mouseDelta.x * initialState.unitVector1.x + mouseDelta.y * initialState.unitVector1.y;
    const projection2 = mouseDelta.x * initialState.unitVector2.x + mouseDelta.y * initialState.unitVector2.y;
    
    // Move each control point by its own projection amount
    newControlPoint1 = {
      x: initialState.initialOffPoint1.x + initialState.unitVector1.x * projection1,
      y: initialState.initialOffPoint1.y + initialState.unitVector1.y * projection1
    };
    
    newControlPoint2 = {
      x: initialState.initialOffPoint2.x + initialState.unitVector2.x * projection2,
      y: initialState.initialOffPoint2.y + initialState.unitVector2.y * projection2
    };
  }

 // Return the changes instead of applying them
  return {
    controlPoint1Index: initialState.selectedSegment.parentPointIndices[1],
    controlPoint2Index: initialState.selectedSegment.parentPointIndices[2],
    newControlPoint1: newControlPoint1,
    newControlPoint2: newControlPoint2
  };
}
```

#### In `edit-tools-pointer.js`:

```javascript
// In the handleDrag function, replace the tunni drag handling with:
if (tunniInitialState) {
  // Process the drag events for Tunni point manipulation as a single atomic operation
  let finalChanges = null;
  for await (const event of eventStream) {
    if (event.type === "mouseup") {
      // Handle mouse up event for Tunni point - no separate action needed since 
      // all changes are part of the atomic operation
      break;
    } else if (event.type === "mousemove") {
      // Calculate the changes for this mouse move event
      const dragChanges = calculateTunniPointDragChanges(event, tunniInitialState, sceneController);
      if (dragChanges) {
        finalChanges = dragChanges;
      }
    }
  }
  
  // Apply all changes in a single atomic operation
  if (finalChanges) {
    await sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      for (const layerGlyph of Object.values(layerGlyphs)) {
        // Update the control points in the path
        layerGlyph.path.setPointPosition(finalChanges.controlPoint1Index, finalChanges.newControlPoint1.x, finalChanges.newControlPoint1.y);
        layerGlyph.path.setPointPosition(finalChanges.controlPoint2Index, finalChanges.newControlPoint2.x, finalChanges.newControlPoint2.y);
      }
      return "Move Tunni Points";
    });
  }
  return;
}
```

### Expected Outcome
With these changes:
1. The entire tunni point drag operation will be treated as a single undo-able operation
2. Pressing undo once will revert the entire drag operation
3. Visual feedback during dragging can be maintained through other mechanisms if needed
4. The refactored architecture remains intact while fixing the undo-redo issue