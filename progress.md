# Virtual Points Implementation Analysis

This document provides a detailed analysis of how the virtual points functionality is implemented in Fontra, specifically focusing on the detection of four-point configurations and computation of intersection points.

## Overview

The virtual points feature detects specific geometric configurations of four consecutive on-curve points and computes intersection points where the middle segment intersects with the curves connected to the outer points. These intersection points are then visualized as virtual points in the editor.

## Core Implementation Files

The functionality is implemented across four main files:

1. `src-js/fontra-core/src/path-functions.js` - Core geometric algorithms
2. `src-js/views-editor/src/scene-model.js` - Data model and storage
3. `src-js/views-editor/src/scene-controller.js` - UI interactions and actions
4. `src-js/views-editor/src/visualization-layer-definitions.js` - Rendering

## Detailed Implementation Analysis

### 1. Path Functions (src-js/fontra-core/src/path-functions.js)

#### checkFourPointConfiguration Function

This function validates if four selected points meet the specific geometric criteria:

1. All four points must be consecutive on-curve points along a single contour
2. The first point (A) and last point (D) each have exactly one off-curve handle
3. The segments connecting A-B, B-C, and C-D are straight lines (no off-curve points between them)
4. Handles both open and closed contours correctly

Implementation details:
- Verifies exactly four points are selected
- Ensures all points belong to the same contour
- Checks that points are consecutive on the contour (with special handling for closed contours)
- Confirms all four points are on-curve (no type attribute)
- Validates that A and D each have exactly one off-curve handle
- Ensures segments A-B, B-C, and C-D are straight lines

#### computeChordIntersections Function

When a valid four-point configuration is detected, this function computes the intersection points:

1. Identifies the incoming curve to point A (prev→A)
2. Identifies the outgoing curve from point D
3. Creates a line segment B-C (the middle segment)
4. Computes intersections between the incoming curve and line B-C
5. Computes intersections between the outgoing curve and line B-C
6. For each intersection, creates a virtual point with suggested handle positions

Implementation details:
- Uses Bezier.js library for curve intersection calculations
- Calculates perpendicular vectors for suggested handle directions
- Creates virtual point objects with position, suggested handles, and reference information
- Returns an array of virtual point objects

### 2. Scene Model (src-js/fontra-core/src/scene-model.js)

The SceneModel class manages the virtual points data:

1. Stores virtual points in the scene settings:
   ```javascript
   virtualPoints: [],
   ```

2. Provides getter/setter methods for virtual points:
   ```javascript
   get virtualPoints() {
     return this.sceneSettings.virtualPoints;
   }
   
   set virtualPoints(points) {
     this.sceneSettings.virtualPoints = points;
   }
   ```

### 3. Scene Controller (src-js/views-editor/src/scene-controller.js)

The SceneController handles UI interactions and triggers the virtual points computation:

#### doCheckFourPointConfiguration Method

This method is triggered by a keyboard shortcut (Cmd+Alt+E) and performs:

1. Gets the current selection
2. Parses point selection (must be exactly 4 points)
3. Retrieves the current glyph's path
4. Calls `checkFourPointConfiguration` to validate the selection
5. If valid:
   - Calls `computeChordIntersections` to calculate intersections
   - Stores results in `sceneModel.virtualPoints`
   - Triggers canvas update
6. If invalid:
   - Clears virtual points
   - Triggers canvas update

#### updateVirtualPointsIfNeeded Method

This method automatically updates virtual points based on current selection:

1. Gets current selection
2. Checks if exactly four points are selected
3. If not, clears virtual points and updates canvas
4. If four points are selected:
   - Retrieves glyph path
   - Calls `checkFourPointConfiguration`
   - If valid:
     * Calls `computeChordIntersections`
     * Stores results in `sceneModel.virtualPoints`
     * Triggers canvas update
   - If invalid:
     * Clears virtual points
     * Triggers canvas update

### 4. Visualization Layer Definitions (src-js/views-editor/src/visualization-layer-definitions.js)

The visualization layer renders the virtual points:

#### Virtual Points Layer Definition

Identifier: "fontra.virtual.points"
Name: "Virtual points"
Z-index: 50 (drawn behind most other elements)

Rendering characteristics:
- Corner size: 8
- Smooth size: 8
- Handle size: 6.5
- Stroke width: 2
- Dash length: 2
- Color: #8888FF80 (semi-transparent blue) in light mode, #888FF60 in dark mode

Drawing process:
1. Checks if virtualPoints exist in sceneSettings
2. Sets fill and stroke styles with dashed lines
3. Iterates through each virtual point:
   - Draws a filled round node (smooth appearance)
   - Draws a dashed stroke around the point to distinguish from real points
4. Clears line dash pattern after drawing

## Data Flow

1. **User selects four points** in the editor
2. **Selection triggers update** via `updateVirtualPointsIfNeeded`
3. **Configuration check** performed by `checkFourPointConfiguration`
4. **Intersection computation** done by `computeChordIntersections` if valid
5. **Results stored** in `sceneModel.virtualPoints`
6. **Canvas update requested**
7. **Visualization layer** renders virtual points from stored data

## Key Features

1. **Automatic Detection**: Virtual points are automatically computed when four points are selected
2. **Visual Distinction**: Virtual points are rendered with dashed outlines to distinguish them from real points
3. **Geometric Validation**: Strict validation ensures only valid configurations produce virtual points
4. **Interactive Action**: Manual trigger available via keyboard shortcut for explicit checking
5. **Real-time Updates**: Virtual points update as selection changes

## Technical Details

### Mathematical Computations

1. **Bezier Intersections**: Uses Bezier.js library for accurate curve/line intersection calculations
2. **Handle Suggestions**: Calculates perpendicular vectors to the curve's tangent at intersection points
3. **Vector Operations**: Extensive use of vector math for geometric calculations

### Performance Considerations

1. **Selective Computation**: Only computes intersections when exactly four points are selected
2. **Early Validation**: Quick rejection of invalid configurations before expensive computations
3. **Efficient Rendering**: Direct access to stored virtual points for visualization

### Error Handling

1. **Configuration Validation**: Comprehensive checks ensure only valid geometric configurations are processed
2. **Boundary Conditions**: Proper handling of open vs. closed contours
3. **Edge Cases**: Handles cases where points don't meet criteria gracefully

## Integration Points

1. **Scene Model**: Central storage of virtual points data
2. **Scene Controller**: Logic for computing and updating virtual points
3. **Path Functions**: Core geometric algorithms
4. **Visualization**: Rendering of virtual points in the editor
5. **UI Actions**: Keyboard shortcut for manual triggering

## Future Considerations

1. **Performance Optimization**: For complex glyphs with many potential intersections
2. **Extended Configurations**: Support for other geometric patterns
3. **User Customization**: Options for visualization appearance
4. **Interaction Models**: Direct manipulation of virtual points