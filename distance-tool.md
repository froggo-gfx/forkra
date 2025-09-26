# Distance Tool Implementation Plan

## Task Description

Create a visual tool that shows X and Y (not the beeline) distance from the selected point to the point over which user hovers with Alt pressed.

This tool should:
- Detect when a user has a point selected
- Show visual distance indicators when the user hovers over another point while holding Alt
- Display horizontal and vertical distances separately (X and Y distances)
- Not show the beeline distance (diagonal distance)

## Implementation Approach

The implementation will involve:
1. Adding hit detection functionality to identify points under cursor
2. Modifying the editor to detect Alt key presses during hover
3. Calculating X and Y distances between selected and hovered points
4. Creating visual indicators to show these distances
5. Integrating the functionality into the existing visualization layer system

## Design Document: Implementation Plan with Actionable Steps

### Step 1: Create function to get selected point coordinates
- **File**: `src-js/views-editor/src/scene-controller.js`
- **Function**: `getSelectedPointCoordinates()`
- **Input**: None
- **Output**: Object with x, y coordinates of the selected point, or undefined if no point is selected
- **Description**: This function will parse the current selection and return coordinates of the selected point if it exists

### Step 2: Create function to get hovered point coordinates
- **File**: `src-js/views-editor/src/scene-controller.js`
- **Function**: `getHoveredPointCoordinates(event)`
- **Input**: Mouse event object
- **Output**: Object with x, y coordinates of the point under the cursor, or undefined if no point is near the cursor
- **Description**: This function will use the scene model's point selection functionality to find the point under the cursor

### Step 3: Create function to calculate X and Y distances
- **File**: `src-js/fontra-core/src/distance-measure.js`
- **Function**: `calculateXYDistances(point1, point2)`
- **Input**: Two point objects with x and y properties
- **Output**: Object with xDistance and yDistance properties
- **Description**: This function will calculate the horizontal and vertical distances between two points

### Step 4: Create visualization drawing function
- **File**: `src-js/fontra-core/src/distance-measure.js`
- **Function**: `drawXYDistanceVisualization(context, positionedGlyph, parameters, model, controller)`
- **Input**: Canvas context, positioned glyph, parameters, model, and controller objects
- **Output**: None (draws to canvas)
- **Description**: This function will draw lines and labels showing the X and Y distances between selected and hovered points

### Step 5: Create visualization layer definition
- **File**: `src-js/views-editor/src/visualization-layer-definitions.js`
- **Function**: Register a new visualization layer definition
- **Input**: None (registers globally)
- **Output**: None (registers a visualization layer)
- **Description**: This will register a new visualization layer that shows X and Y distances when enabled

### Step 6: Update scene controller to track Alt key state
- **File**: `src-js/views-editor/src/scene-controller.js`
- **Function**: Modify `handleHover` method
- **Input**: Mouse event object
- **Output**: None
- **Description**: Update the hover handling to detect when Alt key is pressed and store this state

### Step 7: Update editor to handle Alt key during hover
- **File**: `src-js/views-editor/src/editor.js`
- **Function**: Modify hover event handling
- **Input**: Mouse event object
- **Output**: None
- **Description**: Ensure the editor properly handles Alt key state during hover events

### Step 8: Add user preference for the tool
- **File**: `src-js/views-editor/src/visualization-layer-definitions.js`
- **Function**: Add user switchable option
- **Input**: None
- **Output**: None
- **Description**: Make the visualization layer user-switchable in the UI

## Technical Implementation Details

### Data Flow:
1. User selects a point (stored in sceneController.selection)
2. User hovers over another point with Alt key pressed
3. Scene controller detects Alt key state and hover position
4. Hovered point coordinates are calculated using scene model
5. X and Y distances are calculated between selected and hovered points
6. Visualization layer draws distance indicators on canvas

### Key Components to Modify:
- SceneController: For handling Alt key state and hover events
- SceneModel: For point hit detection
- Visualization layers: For drawing distance indicators
- Distance/angle utilities: For distance calculations

### Visualization Style:
- Two lines showing the X and Y distances (horizontal and vertical)
- Labels showing the distance values
- Color scheme consistent with existing distance-angle visualization
- Only visible when Alt key is pressed and both points exist

## Files to be Modified or Created:

1. `src-js/views-editor/src/scene-controller.js` - Add selected/hovered point functions and Alt key handling
2. `src-js/fontra-core/src/distance-measure.js` - Add X/Y distance calculation and drawing functions
3. `src-js/views-editor/src/visualization-layer-definitions.js` - Add new visualization layer
4. `distance-tool.md` - This design document