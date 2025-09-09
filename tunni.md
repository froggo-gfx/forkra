# Fontra Tunni Curves Implementation Specification

This document provides a comprehensive technical specification for implementing Tunni Curves functionality in Fontra. It includes a detailed analysis of the original Tunni Curves plugin, Fontra's path representation and curve editing architecture, a complete data flow diagram, and specific implementation recommendations.

## 1. Original Tunni Curves Plugin Analysis

### 1.1 Overview

The Tunni Curves plugin, originally developed for Glyphs.app, provides a visual method for editing cubic Bézier curves. Instead of directly manipulating the control handles, users interact with "Tunni lines" - lines drawn from the start point to the first control point and from the end point to the second control point. The intersection of these lines defines the "Tunni point," which represents the ideal curve shape.

### 1.2 Core Concepts

1. **Tunni Point**: The intersection point of the two lines extending from the start point to the first control point and from the end point to the second control point.
2. **Tunni Lines**: The visual representation of these lines, drawn to help users understand the relationship between control points.
3. **Balance Operation**: An operation that adjusts both control points to make the distances from their respective endpoints to the Tunni point equal, creating a balanced curve.

### 1.3 Mathematical Implementation

The original implementation in `tunni/SuperTool+TunniEditing.m` calculates the Tunni point using the `GSIntersectLineLineUnlimited` function, which finds the intersection of two infinite lines:

```objc
NSPoint p1 = [seg[0] pointValue];  // Start point
NSPoint p2 = [seg[1] pointValue];  // First control point
NSPoint p3 = [seg[2] pointValue];  // Second control point
NSPoint p4 = [seg[3] pointValue];  // End point
NSPoint t = GSIntersectLineLineUnlimited(p1,p2,p3,p4); // Tunni point
```

The distances from the endpoints to the Tunni point are calculated:

```objc
CGFloat sDistance = GSDistance(p1,t);  // Distance from start to Tunni point
CGFloat eDistance = GSDistance(p4, t); // Distance from end to Tunni point
```

Percentages along each line segment are computed:

```objc
CGFloat xPercent = GSDistance(p1,p2) / sDistance;
CGFloat yPercent = GSDistance(p3,p4) / eDistance;
```

### 1.4 Interaction Handling

The plugin handles three main types of interactions:
1. **Dragging the Tunni point**: Moves the Tunni point to a new location while maintaining curvature
2. **Dragging along the Tunni line**: Adjusts the curve's tension while maintaining the Tunni point's position
3. **Balance operation**: Makes the distances from both endpoints to the Tunni point equal

### 1.5 Visualization

The plugin draws:
1. Tunni lines as dashed lines between the control points
2. A small circle at the Tunni point
3. Percentage labels showing the position of control points along their respective lines

## 2. Fontra Path Representation and Curve Editing Architecture

### 2.1 Data Structures for Representing Paths and Curves

#### VarPackedPath Class

The core data structure for representing paths in Fontra is the `VarPackedPath` class, found in `src-js/fontra-core/src/var-path.js`. This class efficiently stores path data using:

- `coordinates`: A `VarArray` storing alternating x and y coordinates for all points
- `pointTypes`: An array of integers representing point types using bit flags:
  - `ON_CURVE` (0x00): On-curve point
  - `OFF_CURVE_QUAD` (0x01): Quadratic off-curve point
  - `OFF_CURVE_CUBIC` (0x02): Cubic off-curve point
  - `SMOOTH_FLAG` (0x08): Flag indicating a smooth point
- `contourInfo`: An array of objects containing contour information:
  - `endPoint`: The index of the last point in the contour
  - `isClosed`: Boolean indicating if the contour is closed

#### Point Representation

Points in Fontra are represented as simple objects with `x` and `y` properties. Additional properties include:
- `type`: String indicating the point type ("quad" or "cubic") for off-curve points
- `smooth`: Boolean indicating if the point is smooth
- `attrs`: Optional object for additional point attributes

### 2.2 Functions for Curve Manipulation and Editing

#### Path Manipulation Functions

The `src-js/fontra-core/src/path-functions.js` file contains numerous functions for manipulating paths:

- `insertPoint()`: Inserts a point into a path at a specific location, handling both lines and curves
- `insertHandles()`: Inserts Bézier handles into a path segment
- `filterPathByPointIndices()`: Filters a path based on selected point indices
- `splitPathAtPointIndices()`: Splits a path at specified point indices
- `connectContours()`: Connects two contours or closes a contour
- `deleteSelectedPoints()`: Deletes selected points from a path
- `toggleSmooth()`: Toggles the smooth property of points

#### Contour Operations

- `getUnpackedContour()`: Retrieves a contour in an unpacked format for easier manipulation
- `setUnpackedContour()`: Sets a contour from an unpacked format
- `appendUnpackedContour()`: Appends a contour in unpacked format
- `insertUnpackedContour()`: Inserts a contour in unpacked format

#### Point Operations

- `getPoint()`: Retrieves a point by its index
- `setPoint()`: Sets a point's properties
- `insertPoint()`: Inserts a point at a specific contour and point index
- `deletePoint()`: Deletes a point from a contour

### 2.3 Mathematical Functions for Curve Calculations

#### Vector Operations

The `src-js/fontra-core/src/vector.js` file provides essential vector operations:

- `addVectors()`, `subVectors()`: Basic vector arithmetic
- `mulVectorScalar()`, `mulVectorVector()`: Vector scaling
- `vectorLength()`: Calculates the length of a vector
- `normalizeVector()`: Normalizes a vector to unit length
- `rotateVector90CW()`: Rotates a vector 90 degrees clockwise
- `intersect()`: Finds the intersection point of two lines
- `distance()`: Calculates the distance between two points
- `dotVector()`: Calculates the dot product of two vectors
- `interpolateVectors()`: Interpolates between two vectors

#### Bézier Curve Calculations

Fontra uses the `bezier-js` library for advanced Bézier curve operations:

- `split()`: Splits a Bézier curve at specified parameters
- `compute()`: Computes a point on the curve at parameter t
- `derivative()`: Computes the derivative at parameter t
- `project()`: Projects a point onto the curve
- `lineIntersects()`: Finds intersections between a curve and a line
- `extrema()`: Finds extrema points of the curve

### 2.4 Path Rendering and Display

#### Scene Rendering

Paths are rendered through a layered visualization system defined in `src-js/views-editor/src/visualization-layer-definitions.js`:

- `draw()` methods in visualization layers handle the actual rendering
- Context-aware rendering based on selection state (editing, selected, hovered)
- Different visual representations for different path elements (points, handles, contours)

#### Canvas Rendering

The `CanvasController` in `src-js/fontra-core/src/canvas-controller.js` manages the HTML5 canvas:

- Handles coordinate transformations between canvas and glyph space
- Manages magnification and view positioning
- Provides methods for converting between local and canvas coordinates

#### Path Drawing

- `drawToPath2d()`: Draws the entire path to a Path2D object
- `drawContourToPath2d()`: Draws a specific contour to a Path2D object
- `iterContourDecomposedSegments()`: Iterates through decomposed segments of a contour for rendering

### 2.5 Event Handling for Mouse Interactions with Curves

#### Mouse Tracking

The `MouseTracker` class in `src-js/fontra-core/src/mouse-tracker.js` handles mouse events:

- Tracks mouse down, move, and up events
- Manages drag operations with event streams
- Handles modifier key changes during interactions

#### Hit Testing

The `PathHitTester` class in `src-js/fontra-core/src/path-hit-tester.js` provides hit testing functionality:

- `hitTest()`: Tests if a point is near a path segment within a margin
- `findNearest()`: Finds the nearest point on the path to a given point
- `rayIntersections()`: Finds intersections between a ray and path segments
- `lineIntersections()`: Finds intersections between a line and path segments

#### Selection Handling

The `SceneModel` in `src-js/views-editor/src/scene-model.js` manages selection:

- `selectionAtPoint()`: Determines selection based on a point click
- `pointSelectionAtPoint()`: Selects points near a given point
- `segmentSelectionAtPoint()`: Selects segments near a given point
- `componentSelectionAtPoint()`: Selects components near a given point

## 3. Complete Data Flow Diagram

```
User Interaction → MouseTracker → SceneModel.selectionAtPoint() → PathHitTester.hitTest()
     ↓
PathHitTester.findNearest() ← Calculate Tunni Point Intersection
     ↓
SceneModel Updates Selection → Visualization Layers Redraw
     ↓
User Drags → MouseTracker.handleMouseMove() → Tunni Editing Tool
     ↓
Calculate New Control Points Based on Tunni Point Position
     ↓
VarPackedPath.setPoint() → Update Path Data
     ↓
Visualization Layers Redraw with Updated Tunni Lines
```

## 4. Specific Files, Functions, and Data Structures for Tunni Curves Implementation

### 4.1 New Files to Create

1. `src-js/views-editor/src/tunni-editing-tool.js` - Main Tunni editing tool implementation
2. `src-js/fontra-core/src/tunni-calculations.js` - Core Tunni point calculations
3. `src-js/views-editor/src/visualization-layer-tunni.js` - Visualization layer for Tunni lines

### 4.2 Files to Modify

1. `src-js/views-editor/src/scene-controller.js` - Add Tunni editing tool to available tools
2. `src-js/views-editor/src/edit-tools.js` - Register Tunni editing tool
3. `src-js/views-editor/src/visualization-layer-definitions.js` - Add Tunni visualization layer

### 4.3 Key Functions and Data Structures

#### Core Calculation Functions (tunni-calculations.js)

- `calculateTunniPoint(segmentPoints)`: Calculates the Tunni point for a cubic segment
- `calculateControlPointsFromTunni(tunniPoint, segmentPoints)`: Calculates new control points based on a Tunni point position
- `balanceSegment(segmentPoints)`: Balances a cubic segment by making distances to the Tunni point equal

#### Editing Tool Functions (tunni-editing-tool.js)

- `TunniEditingTool.handleMouseDown(event)`: Handles mouse down events for Tunni point interaction
- `TunniEditingTool.handleMouseDrag(event)`: Handles mouse drag events for Tunni point manipulation
- `TunniEditingTool.handleMouseUp(event)`: Handles mouse up events to finalize Tunni point editing

#### Visualization Functions (visualization-layer-tunni.js)

- `drawTunniLines(context, path, parameters)`: Draws Tunni lines and points for all cubic segments
- `shouldDrawTunniLines(model)`: Determines if Tunni lines should be drawn based on user settings

## 5. Detailed Implementation Recommendations

### 5.1 Core Tunni Calculations

Create a new file `src-js/fontra-core/src/tunni-calculations.js` with the following functions:

```javascript
import { intersect, distance } from "./vector.js";

export function calculateTunniPoint(segmentPoints) {
 // segmentPoints should be an array of 4 points: [start, control1, control2, end]
  if (segmentPoints.length !== 4) {
    throw new Error("Segment must have exactly 4 points");
  }
  
  const [p1, p2, p3, p4] = segmentPoints;
  
  // Calculate intersection of lines (p1,p2) and (p3,p4)
  const intersection = intersect(p1, p2, p3, p4);
  
  if (!intersection) {
    return null; // Lines are parallel
  }
  
  return {
    x: intersection.x,
    y: intersection.y
  };
}

export function calculateControlPointsFromTunni(tunniPoint, segmentPoints) {
  const [p1, p2, p3, p4] = segmentPoints;
  
  // Calculate distances
  const sDistance = distance(p1, tunniPoint);
  const eDistance = distance(p4, tunniPoint);
  
  // Calculate percentages if distances are valid
  let xPercent, yPercent;
  if (sDistance > 0) {
    xPercent = distance(p1, p2) / sDistance;
  } else {
    xPercent = 0;
  }
  
  if (eDistance > 0) {
    yPercent = distance(p3, p4) / eDistance;
  } else {
    yPercent = 0;
  }
  
  // Calculate new control points
  const newP2 = {
    x: p1.x + xPercent * (tunniPoint.x - p1.x),
    y: p1.y + xPercent * (tunniPoint.y - p1.y)
  };
  
  const newP3 = {
    x: p4.x + yPercent * (tunniPoint.x - p4.x),
    y: p4.y + yPercent * (tunniPoint.y - p4.y)
  };
  
  return [newP2, newP3];
}

export function balanceSegment(segmentPoints) {
  const tunniPoint = calculateTunniPoint(segmentPoints);
  if (!tunniPoint) {
    return segmentPoints; // Can't balance if lines are parallel
  }
  
  const [p1, p2, p3, p4] = segmentPoints;
  
  // Calculate distances
  const sDistance = distance(p1, tunniPoint);
  const eDistance = distance(p4, tunniPoint);
  
  // If either distance is zero, we can't balance
  if (sDistance <= 0 || eDistance <= 0) {
    return segmentPoints;
  }
  
  // Calculate percentages
  const xPercent = distance(p1, p2) / sDistance;
  const yPercent = distance(p3, p4) / eDistance;
  
  // Calculate average percentage
  const avgPercent = (xPercent + yPercent) / 2;
  
  // Calculate new control points
  const newP2 = {
    x: p1.x + avgPercent * (tunniPoint.x - p1.x),
    y: p1.y + avgPercent * (tunniPoint.y - p1.y)
  };
  
  const newP3 = {
    x: p4.x + avgPercent * (tunniPoint.x - p4.x),
    y: p4.y + avgPercent * (tunniPoint.y - p4.y)
  };
  
  return [p1, newP2, newP3, p4];
}
```

### 5.2 Tunni Editing Tool

Create a new file `src-js/views-editor/src/tunni-editing-tool.js`:

```javascript
import { calculateTunniPoint, calculateControlPointsFromTunni } from "@fontra/core/tunni-calculations.js";
import { distance } from "@fontra/core/vector.js";

export class TunniEditingTool {
  constructor(sceneController) {
    this.sceneController = sceneController;
    this.sceneModel = sceneController.sceneModel;
    this.tunniPoint = null;
    this.selectedSegment = null;
    this.originalSegmentPoints = null;
  }

  handleMouseDown(event) {
    const point = this.sceneController.localPoint(event);
    const size = this.sceneController.mouseClickMargin;
    
    // First check if we clicked on an existing Tunni point
    const hit = this.findTunniPointHit(point, size);
    if (hit) {
      this.tunniPoint = hit.tunniPoint;
      this.selectedSegment = hit.segment;
      this.originalSegmentPoints = [...hit.segmentPoints];
      return;
    }
    
    // If not, check if we clicked near a cubic segment
    const pathHit = this.sceneModel.pathHitAtPoint(point, size);
    if (pathHit.segment && pathHit.segment.points.length === 4) {
      // Check if it's a cubic segment (two off-curve points)
      const pointTypes = pathHit.segment.pointIndices.map(
        index => this.sceneModel.getSelectedPositionedGlyph().glyph.path.pointTypes[index]
      );
      
      if (pointTypes[1] === 2 && pointTypes[2] === 2) { // Both are cubic control points
        const segmentPoints = pathHit.segment.points;
        const tunniPoint = calculateTunniPoint(segmentPoints);
        
        if (tunniPoint && distance(point, tunniPoint) <= size) {
          this.tunniPoint = tunniPoint;
          this.selectedSegment = pathHit.segment;
          this.originalSegmentPoints = [...segmentPoints];
        }
      }
    }
  }

  handleMouseDrag(event) {
    if (!this.tunniPoint || !this.selectedSegment) {
      return;
    }
    
    const point = this.sceneController.localPoint(event);
    
    // Update Tunni point position
    this.tunniPoint = point;
    
    // Calculate new control points
    const newControlPoints = calculateControlPointsFromTunni(
      this.tunniPoint,
      this.originalSegmentPoints
    );
    
    // Update the path with new control points
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    const path = positionedGlyph.glyph.path;
    
    // Apply changes to the actual path
    const editLayerName = this.sceneModel.sceneSettings.editLayerName;
    // Implementation would need to update the path through the proper editing channels
  }

  handleMouseUp(event) {
    this.tunniPoint = null;
    this.selectedSegment = null;
    this.originalSegmentPoints = null;
  }

  findTunniPointHit(point, size) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) {
      return null;
    }
    
    const path = positionedGlyph.glyph.path;
    
    // Iterate through all cubic segments and check if the point is near any Tunni point
    for (const segment of path.iterContourDecomposedSegments(0)) { // TODO: iterate through all contours
      if (segment.points.length === 4) {
        // Check if it's a cubic segment
        const pointTypes = segment.parentPointIndices.map(
          index => path.pointTypes[index]
        );
        
        if (pointTypes[1] === 2 && pointTypes[2] === 2) { // Both are cubic control points
          const tunniPoint = calculateTunniPoint(segment.points);
          if (tunniPoint && distance(point, tunniPoint) <= size) {
            return {
              tunniPoint: tunniPoint,
              segment: segment,
              segmentPoints: segment.points
            };
          }
        }
      }
    }
    
    return null;
  }
}
```

### 5.3 Visualization Layer for Tunni Lines

Create a new file `src-js/views-editor/src/visualization-layer-tunni.js`:

```javascript
import { calculateTunniPoint } from "@fontra/core/tunni-calculations.js";
import { distance } from "@fontra/core/vector.js";

export function registerTunniVisualizationLayer() {
  registerVisualizationLayerDefinition({
    identifier: "fontra.tunni.lines",
    name: "Tunni Lines",
    selectionFunc: glyphSelector("editing"),
    userSwitchable: true,
    defaultOn: false,
    zIndex: 550,
    screenParameters: {
      strokeWidth: 1,
      dashPattern: [5, 5],
      tunniPointSize: 4
    },
    colors: { 
      tunniLineColor: "#0000FF80",
      tunniPointColor: "#0000FF"
    },
    colorsDarkMode: { 
      tunniLineColor: "#00FFFF80",
      tunniPointColor: "#00FFFF"
    },
    draw: drawTunniLines
  });
}

function drawTunniLines(context, positionedGlyph, parameters, model, controller) {
  const path = positionedGlyph.glyph.path;
  
  context.strokeStyle = parameters.tunniLineColor;
  context.lineWidth = parameters.strokeWidth;
  context.setLineDash(parameters.dashPattern);
 context.fillStyle = parameters.tunniPointColor;
  
  // Iterate through all contours
  for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
    // Iterate through all segments in the contour
    for (const segment of path.iterContourDecomposedSegments(contourIndex)) {
      if (segment.points.length === 4) {
        // Check if it's a cubic segment
        const pointTypes = segment.parentPointIndices.map(
          index => path.pointTypes[index]
        );
        
        // Both control points must be cubic
        if (pointTypes[1] === 2 && pointTypes[2] === 2) {
          const tunniPoint = calculateTunniPoint(segment.points);
          if (tunniPoint) {
            // Draw lines from start to first control and from second control to end
            const [p1, p2, p3, p4] = segment.points;
            
            // Draw first line
            context.beginPath();
            context.moveTo(p1.x, p1.y);
            context.lineTo(p2.x, p2.y);
            context.stroke();
            
            // Draw second line
            context.beginPath();
            context.moveTo(p4.x, p4.y);
            context.lineTo(p3.x, p3.y);
            context.stroke();
            
            // Draw Tunni point
            context.beginPath();
            context.arc(tunniPoint.x, tunniPoint.y, parameters.tunniPointSize, 0, 2 * Math.PI);
            context.fill();
            
            // Draw line between control points
            context.beginPath();
            context.moveTo(p2.x, p2.y);
            context.lineTo(p3.x, p3.y);
            context.stroke();
          }
        }
      }
    }
  }
  
  context.setLineDash([]);
}
```

### 5.4 Integration with Scene Controller

Modify `src-js/views-editor/src/scene-controller.js` to register the Tunni editing tool:

```javascript
// Add import at the top
import { TunniEditingTool } from "./tunni-editing-tool.js";

// In the constructor or initialization method, add:
this.tunniEditingTool = new TunniEditingTool(this);
```

### 5.5 User Interface Integration

Add UI controls to enable/disable Tunni lines visualization and to access Tunni editing tools. This would involve:

1. Adding menu items to toggle Tunni lines visibility
2. Adding a "Balance" command to balance selected cubic segments
3. Adding keyboard shortcuts for Tunni operations

## 6. Architectural Considerations

### 6.1 Performance

1. **Caching**: Tunni point calculations should be cached to avoid recalculating on every render
2. **Selective Rendering**: Only draw Tunni lines when the feature is enabled and when zoom level is appropriate
3. **Efficient Hit Testing**: Optimize hit testing for Tunni points to maintain responsive interaction

### 6.2 User Experience

1. **Visual Feedback**: Provide clear visual feedback when interacting with Tunni points
2. **Settings**: Allow users to customize Tunni line appearance (color, thickness, visibility)
3. **Undo/Redo**: Ensure all Tunni operations are properly integrated with Fontra's undo/redo system

### 6.3 Compatibility

1. **Variable Fonts**: Ensure Tunni calculations work correctly with variable font interpolation
2. **Component Glyphs**: Handle Tunni editing in component glyphs appropriately
3. **File Format**: No changes needed to file format since Tunni points are calculated, not stored

## 7. Testing Considerations

1. **Unit Tests**: Create unit tests for all Tunni calculation functions
2. **Integration Tests**: Test Tunni editing tool integration with the rest of Fontra
3. **Edge Cases**: Test with edge cases like parallel lines, zero-length segments, etc.
4. **Performance Tests**: Verify performance with complex glyphs containing many cubic segments

## 8. Future Enhancements

1. **Tunni Line Snapping**: Add snapping to significant angles or positions
2. **Tunni Point Constraints**: Add constraints to keep Tunni points within certain boundaries
3. **Multi-Segment Editing**: Allow editing multiple Tunni points simultaneously
4. **Tunni Presets**: Save and apply Tunni point positions as presets for consistent curve shapes

## Conclusion

This specification provides a comprehensive roadmap for implementing Tunni Curves functionality in Fontra. The implementation leverages Fontra's existing architecture while adding the specialized functionality needed for Tunni curve editing. By following this specification, developers can create a robust and user-friendly Tunni editing experience that integrates seamlessly with Fontra's existing tools and workflows.