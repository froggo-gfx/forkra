# Tunni Tool to Visual Layer Refactoring Plan

## Problem Description

Currently, the Tunni Lines functionality is implemented as a separate tool (`edit-tools-tunni.js`) that:
1. Requires user to select the tool
2. Shows a visual layer from `visualization-layer-definitions.js` with dashed lines and control points
3. Allows dragging control points to make changes
4. Disappears when user changes to another tool

After testing, it's clear that this tool approach is not ideal. The visualization layer already exists and can be toggled via hotkey, so the functionality should be refactored into a visual aid that works as follows:
1. User switches tunni visual layer on
2. A visual layer from `visualization-layer-definitions.js` appears: dashed lines with a control point
3. Control point is draggable by the basic pointer tool
4. If the user doesn't want it in the way, they can switch the visual layer off

## Task Description

Refactor the Tunni Lines functionality from a separate tool into a visual aid layer that can be toggled on/off. Move all necessary and non-tool specific functionality from `edit-tools-tunni.js` to `tunni-calculations.js`, eliminating the need for the separate tool file.

## Implementation Plan

### Step 1: Move non-tool specific functions to tunni-calculations.js

1. **Function**: `findTunniPointHit`
   - **Description**: Finds if a point is hitting a Tunni point within a given size margin
   - **Input**: `point` (x, y coordinates), `size` (hit margin size), `sceneModel` (to access glyph path)
   - **Output**: Object with tunniPoint, segment and segmentPoints if hit, otherwise null
   - **File**: Move from `edit-tools-tunni.js` to `tunni-calculations.js`

2. **Function**: `calculateTunniPointFromSegment` (rename of internal logic)
   - **Description**: Calculates the Tunni point position from a given cubic segment
   - **Input**: `segmentPoints` (array of 4 points: [start, control1, control2, end])
   - **Output**: Object with x, y coordinates of the Tunni point
   - **File**: Move calculation logic from `edit-tools-tunni.js` to `tunni-calculations.js`

3. **Function**: `handleEqualizeDistances`
   - **Description**: Equalizes the distances of control points in a segment using arithmetic mean
   - **Input**: `segment` (cubic segment), `segmentPoints` (array of 4 points), `sceneController` (for editing operations)
   - **Output**: Promise that updates the path with equalized control points
   - **File**: Move from `edit-tools-tunni.js` to `tunni-calculations.js`

4. **Function**: `equalizeSegmentDistances`
   - **Description**: Equalizes the distances of control points in a segment using arithmetic mean
   - **Input**: `segment` (cubic segment), `segmentPoints` (array of 4 points), `sceneController` (for editing operations)
   - **Output**: Promise that updates the path with equalized control points
   - **File**: Move from `edit-tools-tunni.js` to `tunni-calculations.js`

### Step 2: Create new functions for pointer tool integration

5. **Function**: `handleTunniPointMouseDown`
   - **Description**: Handles mouse down event when clicking on a Tunni point
   - **Input**: `event` (mouse event), `sceneController` (for scene access), `visualizationLayerSettings` (to check if Tunni layer is active)
   - **Output**: Object with initial state for drag operation (initial mouse pos, vectors, etc.)
   - **File**: Create in `tunni-calculations.js`

6. **Function**: `handleTunniPointMouseDrag`
   - **Description**: Handles mouse drag event to update control points based on Tunni point movement
   - **Input**: `event` (mouse event), `initialState` (from mouse down), `sceneController` (for editing operations)
   - **Output**: Promise that updates the glyph with new control point positions
   - **File**: Create in `tunni-calculations.js`

7. **Function**: `handleTunniPointMouseUp`
   - **Description**: Handles mouse up event to finalize the Tunni point drag operation
   - **Input**: `initialState` (from mouse down), `sceneController` (for editing operations)
   - **Output**: Promise that records final state for undo/redo
   - **File**: Create in `tunni-calculations.js`

### Step 3: Update visualization layer for hit testing

8. **Function**: `tunniLayerHitTest`
   - **Description**: Performs hit testing specifically for Tunni visualization layer elements
   - **Input**: `point` (x, y coordinates), `size` (hit margin), `positionedGlyph` (glyph to test against)
   - **Output**: Hit result object if Tunni point is near the given point
   - **File**: Create in `tunni-calculations.js`

### Step 4: Update visualization layer drawing function

9. **Function**: Enhanced `drawTunniLines` (in `visualization-layer-definitions.js`)
   - **Description**: Updated drawing function that can indicate active state when Tunni point is being dragged
   - **Input**: Same as current but with additional state information
   - **Output**: Draws Tunni visualization with possible active state highlighting
   - **File**: Modify existing function in `visualization-layer-definitions.js`

### Step 5: Integrate with pointer tool

10. **Integration**: Pointer tool mouse event handlers
    - **Description**: Add checks in pointer tool to detect and handle Tunni point interactions when the Tunni visualization layer is active
    - **Input**: Mouse events from pointer tool
    - **Output**: Call appropriate Tunni functions when visualization layer is active and Tunni point is clicked/dragged
    - **File**: `edit-tools-pointer.js` (will need to import Tunni functions)

### Step 6: Remove the TunniTool class

11. **Removal**: `TunniTool` class from `edit-tools-tunni.js`
    - **Description**: Complete removal of the tool class since functionality will be integrated into the pointer tool
    - **Input**: N/A
    - **Output**: Delete the file or repurpose it
    - **File**: `edit-tools-tunni.js`

12. **Removal**: `TunniEditingTool` class from `edit-tools-tunni.js`
    - **Description**: The logic will be distributed to `tunni-calculations.js` and integrated with the pointer tool
    - **Input**: N/A
    - **Output**: Delete the class
    - **File**: `edit-tools-tunni.js`

## Implementation Sequence

1. First, move all non-tool specific utility functions to `tunni-calculations.js`
2. Create new functions for pointer tool integration
3. Update the visualization layer drawing function
4. Integrate with the pointer tool to handle Tunni point interactions
5. Remove the old TunniTool class and file
6. Test the functionality to ensure it works when the visualization layer is toggled on/off

## Key Considerations

- The visualization layer (`fontra.tunni.lines`) should remain user-switchable as it is currently
- The hotkey toggle the layer should continue to work as before
- The drag functionality should only be active when the Tunni visualization layer is enabled
- The Ctrl+Shift+click to equalize distances should continue to work
- All existing undo/redo functionality should be preserved
- The Tunni point should be draggable by the basic pointer tool when the layer is active