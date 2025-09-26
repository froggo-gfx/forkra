# Distance Tool Implementation Plan - Detailed Function Prototypes

## Overview
This document provides detailed function prototypes for the distance tool that shows X and Y (not the beeline) distance from the selected point to the point over which user hovers with Alt pressed.

## Step 1: Create function to get selected point coordinates

### File: `src-js/views-editor/src/scene-controller.js`

```javascript
/**
 * Gets the coordinates of the currently selected point
 * @returns {Object|undefined} Object with x, y coordinates of the selected point, or undefined if no point is selected
 * @property {number} x - X coordinate of the selected point
 * @property {number} y - Y coordinate of the selected point
 */
SceneController.prototype.getSelectedPointCoordinates = function() {
  // Parse the current selection and return coordinates of the selected point if it exists
  // Uses this.sceneModel.selection to determine the selected point
  // Returns undefined if no point is selected or if multiple points are selected
}
```

## Step 2: Create function to get hovered point coordinates

### File: `src-js/views-editor/src/scene-controller.js`

```javascript
/**
 * Gets the coordinates of the point under the cursor during hover
 * @param {MouseEvent} event - Mouse event object containing cursor position
 * @returns {Object|undefined} Object with x, y coordinates of the point under the cursor, or undefined if no point is near the cursor
 * @property {number} x - X coordinate of the hovered point
 * @property {number} y - Y coordinate of the hovered point
 */
SceneController.prototype.getHoveredPointCoordinates = function(event) {
  // Uses the scene model's point selection functionality to find the point under the cursor
  // Takes into account the mouse click margin for hit detection
  // Returns undefined if no point is found near the cursor position
}
```

## Step 3: Create function to calculate X and Y distances

### File: `src-js/fontra-core/src/distance-measure.js`

```javascript
/**
 * Calculates the horizontal and vertical distances between two points
 * @param {Object} point1 - First point object with x and y properties
 * @param {Object} point2 - Second point object with x and y properties
 * @property {number} point1.x - X coordinate of the first point
 * @property {number} point1.y - Y coordinate of the first point
 * @property {number} point2.x - X coordinate of the second point
 * @property {number} point2.y - Y coordinate of the second point
 * @returns {Object} Object with xDistance and yDistance properties
 * @property {number} xDistance - Horizontal distance (point2.x - point1.x)
 * @property {number} yDistance - Vertical distance (point2.y - point1.y)
 */
export function calculateXYDistances(point1, point2) {
  // Calculate the horizontal and vertical distances between two points
  // Returns an object with xDistance and yDistance properties
  // Positive xDistance means point2 is to the right of point1
  // Positive yDistance means point2 is above point1
}
```

## Step 4: Create visualization drawing function

### File: `src-js/fontra-core/src/distance-measure.js`

```javascript
/**
 * Draws lines and labels showing the X and Y distances between selected and hovered points
 * @param {CanvasRenderingContext2D} context - Canvas context for drawing
 * @param {Object} positionedGlyph - The positioned glyph object
 * @param {Object} parameters - Visualization parameters (colors, stroke width, etc.)
 * @param {Object} model - The scene model
 * @param {Object} controller - The scene controller
 */
export function drawXYDistanceVisualization(context, positionedGlyph, parameters, model, controller) {
  // Draws horizontal and vertical lines showing X and Y distances
  // Uses the selected point from model.selection and hovered point from model.hoverSelection
  // Only draws when Alt key is pressed and both points exist
  // Draws labels showing the distance values
  // Uses parameters for styling (colors, stroke width, etc.)
}
```

## Step 5: Create visualization layer definition

### File: `src-js/views-editor/src/visualization-layer-definitions.js`

```javascript
// Register a new visualization layer definition for X/Y distance visualization
registerVisualizationLayerDefinition({
  identifier: "fontra.xy-distance",
  name: "X/Y Distance Tool",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 500,
  screenParameters: {
    strokeWidth: 1,
    fontSize: 10,
  },
  colors: { 
    strokeColor: "rgba(255, 0, 0, 0.75)", // Red color for visibility
    textColor: "white",
    badgeColor: "rgba(255, 0, 0, 0.9)"
  },
  colorsDarkMode: { 
    strokeColor: "rgba(25, 10, 100, 0.75)",
    textColor: "white",
    badgeColor: "rgba(25, 10, 100, 0.9)"
  },
  draw: drawXYDistanceVisualization,
});
```

## Step 6: Update scene controller to track Alt key state

### File: `src-js/views-editor/src/scene-controller.js`

```javascript
/**
 * Modifies the handleHover method to detect when Alt key is pressed
 * @param {MouseEvent} event - Mouse event object
 */
SceneController.prototype.handleHover = function(event) {
  // Store Alt key state in a property like this.altKeyPressed
 // Call the original hover handling logic
  // Check if Alt key is pressed and both selected and hovered points exist
  // If so, trigger the X/Y distance visualization
}
```

## Step 7: Update editor to handle Alt key during hover

### File: `src-js/views-editor/src/editor.js`

```javascript
// Modify hover event handling to properly track Alt key state
// Ensure the editor properly handles Alt key state during hover events
// This may involve updating the mouse tracker or event handlers
```

## Step 8: Add user preference for the tool

### File: `src-js/views-editor/src/visualization-layer-definitions.js`

```javascript
// The user switchable option is already included in the visualization layer definition
// The layer will appear in the UI settings and can be toggled on/off by the user
```

## Data Flow

1. User selects a point (stored in sceneController.selection)
2. User hovers over another point with Alt key pressed
3. Scene controller detects Alt key state and hover position
4. Hovered point coordinates are calculated using scene model
5. X and Y distances are calculated between selected and hovered points
6. Visualization layer draws distance indicators on canvas

## Key Components to Modify

- SceneController: For handling Alt key state and hover events
- SceneModel: For point hit detection
- Visualization layers: For drawing distance indicators
- Distance/angle utilities: For distance calculations

## Visualization Style

- Two lines showing the X and Y distances (horizontal and vertical)
- Labels showing the distance values
- Color scheme consistent with existing distance-angle visualization
- Only visible when Alt key is pressed and both points exist