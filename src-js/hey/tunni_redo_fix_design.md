# Tunni Tool Redo Functionality Fix - Design Document

## Overview

This document analyzes the issue with the Tunni tool's undo-redo functionality where it requires two key presses (Ctrl+Z/Ctrl+Shift+Z) to perform each undo/redo operation instead of one. The problem was introduced when fixing the original broken redo functionality.

## Analysis of Current Implementation vs Broken Version

### Key Differences Identified

1. **Initial State Recording**:
   - **Broken version (src-js/hey/broken-redo.js)**: Records initial state in `handleMouseDown` for both clicking on existing Tunni points and clicking near cubic segments.
   - **Current version (src-js/views-editor/src/edit-tools-tunni.js)**: Records initial state in `handleMouseDown` only when clicking on existing Tunni points, but NOT when clicking near cubic segments (lines 260-276 removed the recording).

2. **Final State Recording**:
   - **Broken version**: Does NOT record final state in `handleMouseUp` (the method is synchronous and doesn't record anything).
   - **Current version**: DOES record final state in `handleMouseUp` (lines 520-544, the method is async and records the final state).

3. **Duplicate Recording Issue**:
   - The current version had a bug where clicking near cubic segments would record the initial state twice (fixed by removing the duplicate recording).

### Root Cause of Double Press Issue

The issue occurs because:

1. In the current version, when clicking near cubic segments (not on existing Tunni points), the initial state is NOT recorded in `handleMouseDown` (lines 260-276 in the current version don't call `editLayersAndRecordChanges`).
2. However, in `handleMouseUp`, the code still attempts to record the final state.
3. This creates an inconsistent state in the undo stack where there might be:
   - No initial state recorded for some operations (when clicking near segments)
   - Final state recorded in `handleMouseUp` for all operations
   - This causes the undo/redo to behave inconsistently

### Comparison of Undo-Redo Flow

#### Broken Version (redo broken, but no double press):
- Initial state recorded in `handleMouseDown` for all operations
- No final state recorded in `handleMouseUp`
- Undo works (goes back to initial state), redo doesn't work

#### Current Version (with double press issue):
- Initial state recorded in `handleMouseDown` only for clicking on Tunni points
- Initial state NOT recorded in `handleMouseDown` when clicking near segments
- Final state recorded in `handleMouseUp` for all operations
- This creates an inconsistent undo stack causing double press behavior

## Technical Solution

### Minimal Actionable Steps

1. **Ensure Initial State is Always Recorded**: Modify the `handleMouseDown` method to record the initial state consistently for both clicking on existing Tunni points and clicking near cubic segments.

2. **Fix the Final State Recording**: Modify the `handleMouseUp` method to properly record the final state without creating duplicate entries.

3. **Maintain Consistent State Management**: Ensure both initial and final states are recorded appropriately for the undo-redo stack to work correctly.

### Detailed Implementation Plan

#### Step 1: Fix Initial State Recording in handleMouseDown

In the current version, modify lines 198-280 to ensure that when clicking near cubic segments, the initial state is also recorded:

```javascript
// In handleMouseDown, when clicking near cubic segments
if (controlPoint1Index !== undefined && controlPoint2Index !== undefined) {
  // Record the original state for undo functionality by capturing it at the start of the drag
  this.originalControlPoints = {
    controlPoint1Index: controlPoint1Index,
    controlPoint2Index: controlPoint2Index,
    originalControlPoint1: { ...path.getPoint(controlPoint1Index) },
    originalControlPoint2: { ...path.getPoint(controlPoint2Index) }
  };

  // Immediately record the starting state for undo functionality
  const originalControlPoint1 = { ...path.getPoint(controlPoint1Index) };
  const originalControlPoint2 = { ...path.getPoint(controlPoint2Index) };

  // This will create the initial undo point for this action
 await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
    for (const layerGlyph of Object.values(layerGlyphs)) {
      const layerPath = layerGlyph.path;
      // The points are already at their original positions, so we're just recording this state
      // This creates the baseline for the undo operation
      layerPath.setPointPosition(controlPoint1Index, originalControlPoint1.x, originalControlPoint1.y);
      layerPath.setPointPosition(controlPoint2Index, originalControlPoint2.x, originalControlPoint2.y);
    }
    return "Start Tunni Point Drag";
  });
}
```

#### Step 2: Improve Final State Recording in handleMouseUp

Modify the `handleMouseUp` method to ensure it only records the final state when appropriate and doesn't create duplicate entries in the undo stack.

## Expected Outcome

After implementing these changes:
1. The undo operation should work correctly (one press to undo)
2. The redo operation should work correctly (one press to redo)
3. No double press behavior should occur
4. Both clicking on existing Tunni points and clicking near cubic segments should behave consistently

## Testing Strategy

1. Test undo/redo functionality when clicking on existing Tunni points
2. Test undo/redo functionality when clicking near cubic segments
3. Verify that one key press is sufficient for both undo and redo operations
4. Ensure that the behavior is consistent across different scenarios