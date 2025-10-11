# Tunni Enhancement Plan

## Overview

This document outlines the plan for enhancing the Tunni Lines functionality in Fontra. The current implementation allows users to drag a handle (blue dot) in the middle of the lines connecting pairs of off-curve points, which changes the on-curve-to-off-curve distance along the vectors between those points. The enhancement will add a separate visualization vector for the actual Tunni point (the intersection of the infinite vectors between pairs of on-curve-off-curve points), allowing users to drag this point to move on-curve points along the on-curve-off-curve vectors at equal distances while off-curve points stay in place.

## Current Functionality Analysis

### Files Involved:
- `src-js/fontra-core/src/tunni-calculations.js` - Core Tunni calculations
- `src-js/views-editor/src/visualization-layer-definitions.js` - Visualization layer for Tunni lines
- `src-js/views-editor/src/edit-tools-pointer.js` - Pointer tool interaction with Tunni points

### Current Implementation:
1. The `calculateTunniPoint()` function calculates the midpoint between control points
2. The `calculateTrueTunniPoint()` function calculates the intersection of on-curve-off-curve vectors
3. Visualization layer draws lines between on-curve and off-curve points with a handle in the middle
4. Pointer tool handles mouse events for dragging the Tunni handle

## Enhancement Requirements

### 1. Separate Visualization for Actual Tunni Point
- Visualize the true Tunni point (intersection of on-curve-off-curve vectors)
- Distinguish it visually from the current handle

### 2. Dragging the Tunni Point
- User can drag the Tunni point to move on-curve points along the on-curve-off-curve vectors
- Off-curve points remain in place
- Equal distance movement of on-curve points from their vectors

### 3. Alt-Drag Functionality
- Alt-drag uncouples the distances (but still moves on vectors)
- Maintains the vector direction but allows different distances

## Implementation Plan

### Step 1: Update `calculateTrueTunniPoint` function

**File**: `src-js/fontra-core/src/tunni-calculations.js`
**Function**: `calculateTrueTunniPoint`
**Change**: Ensure the function properly calculates the intersection point of the infinite vectors between on-curve and off-curve points

**Input/Output**:
- Input: Array of 4 points [start, control1, control2, end] where start/end are on-curve, controls are off-curve
- Output: Object with x, y coordinates of the intersection point or null if lines are parallel

**Current Implementation**:
```js
export function calculateTrueTunniPoint(segmentPoints) {
  // segmentPoints should be an array of 4 points: [start, control1, control2, end]
  if (segmentPoints.length !== 4) {
    throw new Error("Segment must have exactly 4 points");
  }
  
  const [p1, p2, p3, p4] = segmentPoints;
  
  // Calculate unit vectors for the original directions
  const dir1 = normalizeVector(subVectors(p2, p1));
  const dir2 = normalizeVector(subVectors(p3, p4));
  
  // Calculate the intersection point of the lines along the fixed directions
 // This represents where the lines would intersect if extended infinitely
 const line1Start = p1;
  const line1End = addVectors(p1, dir1);
  const line2Start = p4;
  const line2End = addVectors(p4, dir2);
  
  // Calculate intersection of the lines along the fixed directions
  const intersection = intersect(line1Start, line1End, line2Start, line2End);
  
  return intersection;
}
```

### Step 2: Create function to calculate new on-curve positions based on Tunni point

**File**: `src-js/fontra-core/src/tunni-calculations.js`
**New Function**: `calculateOnCurvePointsFromTunni`
**Purpose**: Calculate new positions for on-curve points when the Tunni point is moved

**Input/Output**:
- Input: 
  - tunniPoint: The new position of the Tunni point
  - segmentPoints: Array of 4 points [start, control1, control2, end]
  - equalizeDistances: Boolean indicating if distances should be equalized (true) or uncoupled (false when Alt is pressed)
- Output: Array of 4 points with new on-curve positions [newStart, control1, control2, newEnd]

**Implementation**:
```js
/**
 * Calculate new on-curve point positions based on a moved Tunni point.
 *
 * @param {Object} tunniPoint - The new Tunni point position
 * @param {Array} segmentPoints - Array of 4 points: [start, control1, control2, end]
 * @param {boolean} equalizeDistances - If true, makes distances from on-curve to Tunni point equal
 * @returns {Array} Array of 4 points with new on-curve positions
 */
export function calculateOnCurvePointsFromTunni(tunniPoint, segmentPoints, equalizeDistances = true) {
  const [p1, p2, p3, p4] = segmentPoints;
  
  // Calculate unit vectors for the original directions (from on-curve to off-curve)
  const dir1 = normalizeVector(subVectors(p2, p1));
  const dir2 = normalizeVector(subVectors(p3, p4));
  
  // Calculate original distances from on-curve points to their respective off-curve points
  const origDist1 = distance(p1, p2);
  const origDist2 = distance(p4, p3);
  
  // Calculate distances from on-curve points to the new Tunni point
  const distToTunni1 = distance(p1, tunniPoint);
  const distToTunni2 = distance(p4, tunniPoint);
  
  // Calculate the ratio of original distance to distance to Tunni point for each on-curve point
  const ratio1 = origDist1 / distToTunni1;
  const ratio2 = origDist2 / distToTunni2;
  
  let finalRatio1, finalRatio2;
  
  if (equalizeDistances) {
    // Use average ratio to maintain equal distances
    const avgRatio = (ratio1 + ratio2) / 2;
    finalRatio1 = avgRatio;
    finalRatio2 = avgRatio;
  } else {
    // Use individual ratios to allow uncoupled distances
    finalRatio1 = ratio1;
    finalRatio2 = ratio2;
  }
  
  // Calculate new distances from Tunni point to on-curve points
  const newDist1 = distToTunni1 * finalRatio1;
  const newDist2 = distToTunni2 * finalRatio2;
  
  // Calculate new on-curve point positions along the fixed direction vectors
  // The new on-curve points are positioned along the opposite direction from Tunni point
  const newP1 = {
    x: tunniPoint.x - newDist1 * dir1.x,
    y: tunniPoint.y - newDist1 * dir1.y
  };
  
  const newP4 = {
    x: tunniPoint.x - newDist2 * dir2.x,
    y: tunniPoint.y - newDist2 * dir2.y
  };
  
  // Return with original control points unchanged
  return [newP1, p2, p3, newP4];
}
```

### Step 3: Update visualization layer to show true Tunni point

**File**: `src-js/views-editor/src/visualization-layer-definitions.js`
**Function**: `drawTunniLines`
**Change**: Add visualization for the true Tunni point intersection

**Current Implementation**:
```js
function drawTunniLines(context, positionedGlyph, parameters, model, controller) {
  const path = positionedGlyph.glyph.path;
  
  // We can't determine if a Tunni point is actively being dragged from the visualization layer context
  // The active state is determined by whether the Tunni visualization layer is enabled and
  // if the user is interacting with Tunni points in the pointer tool
  // For now, we'll base the active state on whether the layer is enabled and
  // the pointer tool is in a state where it's handling Tunni points
  const isTunniLayerActive = controller?.editor?.visualizationLayersSettings?.model?.["fontra.tunni.lines"] || false;
  // Since we can't access the actual drag state from here, we'll just use the layer active state
  // The actual active visual feedback is handled in the pointer tool interaction
  const isActiveFinal = isTunniLayerActive;
  
  // Set colors based on active state
 const tunniLineColor = isActiveFinal ?
    "#FF000080" : // Red color when active (more transparent)
    parameters.tunniLineColor;
    
  const tunniPointColor = isActiveFinal ?
    "#FF000" : // Red color when active
    parameters.tunniPointColor;
    
 // Set stroke width based on active state
 const strokeWidth = isActiveFinal ?
    parameters.strokeWidth * 2 : // Thicker when active
    parameters.strokeWidth;
  
  context.strokeStyle = tunniLineColor;
  context.lineWidth = strokeWidth;
  context.setLineDash(isActiveFinal ? [] : parameters.dashPattern); // Remove dash pattern when active
  context.fillStyle = tunniPointColor;
  
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
            
            // Draw Tunni point (current midpoint)
            context.beginPath();
            context.arc(tunniPoint.x, tunniPoint.y, isActiveFinal ? parameters.tunniPointSize * 1.5 : parameters.tunniPointSize, 0, 2 * Math.PI);
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

**Enhanced Implementation**:
```js
function drawTunniLines(context, positionedGlyph, parameters, model, controller) {
  const path = positionedGlyph.glyph.path;
  
  // Set up colors and styles
  const isTunniLayerActive = controller?.editor?.visualizationLayersSettings?.model?.["fontra.tunni.lines"] || false;
  const isActiveFinal = isTunniLayerActive;
  
  // Set colors based on active state
  const tunniLineColor = isActiveFinal ?
    "#FF000080" : // Red color when active (more transparent)
    parameters.tunniLineColor;
    
 const tunniPointColor = isActiveFinal ?
    "#FF000" : // Red color when active
    parameters.tunniPointColor;
    
 // For the true Tunni point, use a different color
 const trueTunniPointColor = isActiveFinal ?
    "#00FF00" : // Green color when active
    parameters.trueTunniPointColor || "#00FF00"; // Default to green
    
  // Set stroke width based on active state
 const strokeWidth = isActiveFinal ?
    parameters.strokeWidth * 2 : // Thicker when active
    parameters.strokeWidth;
  
  context.strokeStyle = tunniLineColor;
  context.lineWidth = strokeWidth;
  context.setLineDash(isActiveFinal ? [] : parameters.dashPattern); // Remove dash pattern when active
  
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
          const [p1, p2, p3, p4] = segment.points;
          
          // Draw lines from start to first control and from second control to end
          // These represent the on-curve to off-curve vectors
          context.beginPath();
          context.moveTo(p1.x, p1.y);
          context.lineTo(p2.x, p2.y);
          context.stroke();
          
          context.beginPath();
          context.moveTo(p4.x, p4.y);
          context.lineTo(p3.x, p3.y);
          context.stroke();
          
          // Draw line between control points (the current handle line)
          context.beginPath();
          context.moveTo(p2.x, p2.y);
          context.lineTo(p3.x, p3.y);
          context.stroke();
          
          // Draw the current Tunni point (midpoint between control points)
          const tunniPoint = calculateTunniPoint(segment.points);
          if (tunniPoint) {
            context.fillStyle = tunniPointColor;
            context.beginPath();
            context.arc(tunniPoint.x, tunniPoint.y, isActiveFinal ? parameters.tunniPointSize * 1.5 : parameters.tunniPointSize, 0, 2 * Math.PI);
            context.fill();
          }
          
          // Draw the true Tunni point (intersection of on-curve to off-curve vectors)
          const trueTunniPoint = calculateTrueTunniPoint(segment.points);
          if (trueTunniPoint) {
            context.fillStyle = trueTunniPointColor;
            context.beginPath();
            // Draw as a different shape to distinguish from current handle
            const size = isActiveFinal ? parameters.tunniPointSize * 1.5 : parameters.tunniPointSize;
            // Draw a diamond/square shape to distinguish from circle
            context.rect(trueTunniPoint.x - size/2, trueTunniPoint.y - size/2, size, size);
            context.fill();
          }
        }
      }
    }
  }
  
  context.setLineDash([]);
}
```

### Step 4: Update visualization layer definition to include new parameters

**File**: `src-js/views-editor/src/visualization-layer-definitions.js`
**Section**: Tunni layer registration

**Current Implementation**:
```js
// Register the Tunni visualization layer
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
```

**Enhanced Implementation**:
```js
// Register the Tunni visualization layer
registerVisualizationLayerDefinition({
  identifier: "fontra.tunni.lines",
  name: "Tunni Lines",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: false,
  zIndex: 50,
  screenParameters: {
    strokeWidth: 1,
    dashPattern: [5, 5],
    tunniPointSize: 4
  },
  colors: {
    tunniLineColor: "#0000FF80",
    tunniPointColor: "#0000FF",
    trueTunniPointColor: "#0FF00"  // Green for true Tunni point
 },
  colorsDarkMode: {
    tunniLineColor: "#00FFFF80",
    tunniPointColor: "#00FFFF",
    trueTunniPointColor: "#00FF00"  // Green remains the same in dark mode
  },
  draw: drawTunniLines
});
```

### Step 5: Update Tunni layer hit test to include true Tunni point

**File**: `src-js/fontra-core/src/tunni-calculations.js`
**Function**: `tunniLayerHitTest`
**Change**: Add hit testing for the true Tunni point intersection

**Current Implementation**:
```js
/**
 * Performs hit testing specifically for Tunni visualization layer elements
 * @param {Object} point - The point to check (x, y coordinates)
 * @param {number} size - The hit margin size
 * @param {Object} positionedGlyph - The positioned glyph to test against
 * @returns {Object|null} Hit result object if Tunni point is near the given point, null otherwise
 */
export function tunniLayerHitTest(point, size, positionedGlyph) {
  if (!positionedGlyph || !positionedGlyph.glyph || !positionedGlyph.glyph.path) {
    return null;
  }
  
  const path = positionedGlyph.glyph.path;
  
  // The point is already in the glyph coordinate system when passed from the pointer tool
 const glyphPoint = point;
  
  // Iterate through ALL contours and check if the point is near any Tunni point
  for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
    for (const segment of path.iterContourDecomposedSegments(contourIndex)) {
      // Process each segment in the contour
      if (segment.points.length === 4) {
        // Check if it's a cubic segment
        const pointTypes = segment.parentPointIndices.map(
          index => path.pointTypes[index]
        );
    
        if (pointTypes[1] === 2 && pointTypes[2] === 2) { // Both are cubic control points
          // Calculate the true Tunni point (intersection-based) for this segment
          const trueTunniPoint = calculateTrueTunniPoint(segment.points);
          const visualTunniPoint = calculateTunniPoint(segment.points);
          
          // Check both the true intersection point and the visual point (midpoint)
          // This ensures we can hit both the actual intersection and the visual representation
          if (trueTunniPoint && distance(glyphPoint, trueTunniPoint) <= size) {
            return {
              tunniPoint: trueTunniPoint,
              segment: segment,
              segmentPoints: segment.points,
              contourIndex: contourIndex,
              hitType: "true-tunni-point"
            };
          }
          
          if (visualTunniPoint && distance(glyphPoint, visualTunniPoint) <= size) {
            return {
              tunniPoint: visualTunniPoint,
              segment: segment,
              segmentPoints: segment.points,
              contourIndex: contourIndex,
              hitType: "tunni-point"
            };
          }
        }
      }
    }
  }
  
  // If no Tunni point is found within the hit margin, return null
  return null;
}
```

### Step 6: Create new mouse event handlers for true Tunni point interaction

**File**: `src-js/fontra-core/src/tunni-calculations.js`
**New Functions**: 
- `handleTrueTunniPointMouseDown`
- `handleTrueTunniPointMouseDrag` 
- `handleTrueTunniPointMouseUp`

**Implementation**:

```js
/**
 * Handles mouse down event when clicking on a true Tunni point (intersection)
 * @param {Object} event - Mouse event
 * @param {Object} sceneController - Scene controller for scene access
 * @param {Object} visualizationLayerSettings - To check if Tunni layer is active
 * @returns {Object} Initial state for drag operation (initial mouse pos, vectors, etc.)
 */
export function handleTrueTunniPointMouseDown(event, sceneController, visualizationLayerSettings) {
  // Check if Tunni layer is active
  if (!visualizationLayerSettings.model["fontra.tunni.lines"]) {
    return null;
  }

  const point = sceneController.localPoint(event);
  const size = sceneController.mouseClickMargin;
  
  // Convert from scene coordinates to glyph coordinates
  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return null; // No positioned glyph, so no Tunni point interaction possible
  }
  
  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };
  
  // First check if we clicked on an existing true Tunni point
  // Use the same hit testing function that's used for hover detection to ensure consistency
  const hit = tunniLayerHitTest(glyphPoint, size, positionedGlyph);
  if (!hit || hit.hitType !== "true-tunni-point") {
    return null;
  }

  const segmentPoints = hit.segmentPoints;
  
  // Store initial positions
  const initialOnPoint1 = { ...segmentPoints[0] }; // p1 (on-curve)
  const initialOffPoint1 = { ...segmentPoints[1] }; // p2 (off-curve)
  const initialOffPoint2 = { ...segmentPoints[2] }; // p3 (off-curve)
  const initialOnPoint2 = { ...segmentPoints[3] }; // p4 (on-curve)
  
 // Calculate initial vectors from on-curve to off-curve points
  const initialVector1 = {
    x: initialOffPoint1.x - initialOnPoint1.x,
    y: initialOffPoint1.y - initialOnPoint1.y
  };

  const initialVector2 = {
    x: initialOffPoint2.x - initialOnPoint2.x,
    y: initialOffPoint2.y - initialOnPoint2.y
  };

  // Calculate unit vectors for movement direction
  const length1 = Math.sqrt(initialVector1.x * initialVector1.x + initialVector1.y * initialVector1.y);
  const length2 = Math.sqrt(initialVector2.x * initialVector2.x + initialVector2.y * initialVector2.y);
  
  const unitVector1 = length1 > 0 ? {
    x: initialVector1.x / length1,
    y: initialVector1.y / length1
  } : { x: 1, y: 0 };
  
  const unitVector2 = length2 > 0 ? {
    x: initialVector2.x / length2,
    y: initialVector2.y / length2
  } : { x: 1, y: 0 };
  
  // Store original control point positions (these should remain unchanged)
  let originalControlPoints = null;
  if (positionedGlyph && positionedGlyph.glyph && positionedGlyph.glyph.path) {
    const path = positionedGlyph.glyph.path;
    const controlPoint1Index = hit.segment.parentPointIndices[1];
    const controlPoint2Index = hit.segment.parentPointIndices[2];
    if (controlPoint1Index !== undefined && controlPoint2Index !== undefined) {
      originalControlPoints = {
        controlPoint1Index: controlPoint1Index,
        controlPoint2Index: controlPoint2Index,
        originalControlPoint1: { ...path.getPoint(controlPoint1Index) },
        originalControlPoint2: { ...path.getPoint(controlPoint2Index) }
      };
    }
  }

  // Return initial state for drag operation
  return {
    initialMousePosition: { ...glyphPoint }, // Make a copy to avoid reference issues
    initialOnPoint1,
    initialOffPoint1,
    initialOffPoint2,
    initialOnPoint2,
    initialVector1,
    initialVector2,
    unitVector1,
    unitVector2,
    selectedSegment: hit.segment,
    originalSegmentPoints: [...segmentPoints],
    originalControlPoints,
    tunniPointHit: hit,
    hitType: "true-tunni-point"  // Distinguish from current handle
  };
}

/**
 * Calculates new on-curve point positions based on true Tunni point movement during drag
 * @param {Object} event - Mouse event
 * @param {Object} initialState - Initial state from mouse down
 * @param {Object} sceneController - Scene controller for editing operations
 * @returns {Object} Object containing on-curve point indices and new positions
 */
export function calculateTrueTunniPointDragChanges(event, initialState, sceneController) {
  // Check if we have the necessary data to process the drag
  if (!initialState || !initialState.initialMousePosition || 
      !initialState.initialOnPoint1 || !initialState.initialOnPoint2 || 
      !initialState.selectedSegment || !initialState.originalSegmentPoints) {
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
  
  // Calculate the new Tunni point position based on mouse movement
  const newTunniPoint = {
    x: initialState.tunniPointHit.tunniPoint.x + mouseDelta.x,
    y: initialState.tunniPointHit.tunniPoint.y + mouseDelta.y
  };
  
  // Calculate new on-curve point positions based on the moved Tunni point
  const newOnCurvePoints = calculateOnCurvePointsFromTunni(
    newTunniPoint, 
    initialState.originalSegmentPoints, 
    equalizeDistances
  );
  
  let newOnPoint1, newOnPoint2;
  if (newOnCurvePoints) {
    newOnPoint1 = newOnCurvePoints[0];  // New position for initialOnPoint1
    newOnPoint2 = newOnCurvePoints[3];  // New position for initialOnPoint2
  } else {
    // If calculation failed, don't change the on-curve points
    newOnPoint1 = initialState.initialOnPoint1;
    newOnPoint2 = initialState.initialOnPoint2;
  }
  
  // Get the original on-curve point indices
  const onPoint1Index = initialState.selectedSegment.parentPointIndices[0];
  const onPoint2Index = initialState.selectedSegment.parentPointIndices[3];
  
  // Return the changes instead of applying them
  return {
    onPoint1Index: onPoint1Index,
    onPoint2Index: onPoint2Index,
    newOnPoint1: newOnPoint1,
    newOnPoint2: newOnPoint2,
    // Keep control points unchanged
    controlPoint1Index: initialState.originalControlPoints.controlPoint1Index,
    controlPoint2Index: initialState.originalControlPoints.controlPoint2Index,
    newControlPoint1: initialState.initialOffPoint1,  // Unchanged
    newControlPoint2: initialState.initialOffPoint2   // Unchanged
  };
}

/**
 * Handles mouse drag event to calculate on-curve point changes based on true Tunni point movement
 * @param {Object} event - Mouse event
 * @param {Object} initialState - Initial state from mouse down
 * @param {Object} sceneController - Scene controller for editing operations
 * @returns {Object} Object containing on-curve point indices and new positions
 */
export function handleTrueTunniPointMouseDrag(event, initialState, sceneController) {
  // Calculate the changes for this mouse move event
  return calculateTrueTunniPointDragChanges(event, initialState, sceneController);
}

/**
 * Handles mouse up event to return the final state for the true Tunni point drag operation
 * @param {Object} initialState - Initial state from mouse down
 * @param {Object} sceneController - Scene controller for editing operations
 * @returns {Object} Object containing original on-curve point indices and their final positions
 */
export function handleTrueTunniPointMouseUp(initialState, sceneController) {
  // Check if we have the necessary data to process the mouse up event
  if (!initialState || !initialState.selectedSegment || !initialState.originalControlPoints) {
    return null;
  }

  // Get the original on-curve point indices
  const onPoint1Index = initialState.selectedSegment.parentPointIndices[0];
  const onPoint2Index = initialState.selectedSegment.parentPointIndices[3];
  
  // Return the original control point information without applying changes
 // The actual changes will be applied in the pointer tool as a single atomic operation
  return {
    onPoint1Index: onPoint1Index,
    onPoint2Index: onPoint2Index,
    originalOnPoint1: initialState.initialOnPoint1,
    originalOnPoint2: initialState.initialOnPoint2,
    controlPoint1Index: initialState.originalControlPoints.controlPoint1Index,
    controlPoint2Index: initialState.originalControlPoints.controlPoint2Index,
    originalControlPoint1: initialState.originalControlPoints.originalControlPoint1,
    originalControlPoint2: initialState.originalControlPoints.originalControlPoint2
  };
}
```

### Step 7: Update pointer tool to handle true Tunni point interactions

**File**: `src-js/views-editor/src/edit-tools-pointer.js`
**Section**: Mouse event handlers
**Change**: Add support for true Tunni point dragging in addition to current handle dragging

**Current Mouse Drag Handler Enhancement**:
```js
async handleDrag(eventStream, initialEvent) {
  const sceneController = this.sceneController;
  const initialSelection = sceneController.selection;
  
  // Check if Tunni visualization layer is active and if we clicked on a Tunni point
  const isTunniLayerActive = this.editor.visualizationLayersSettings.model["fontra.tunni.lines"];
  let tunniInitialState = null;
  let isTrueTunniPoint = false;  // Flag to distinguish between current handle and true Tunni point
  
  if (isTunniLayerActive) {
    // First try to handle true Tunni point (intersection)
    tunniInitialState = handleTrueTunniPointMouseDown(
      initialEvent,
      sceneController,
      this.editor.visualizationLayersSettings
    );
    
    if (tunniInitialState) {
      isTrueTunniPoint = true;
    } else {
      // Fall back to current handle
      tunniInitialState = handleTunniPointMouseDown(
        initialEvent,
        sceneController,
        this.editor.visualizationLayersSettings
      );
    }
  }
  
  // If we clicked on a Tunni point, handle the drag operation to provide visual feedback during drag
  // while maintaining a single undo record
  if (tunniInitialState) {
    // Check if Ctrl+Shift keys are pressed to equalize control point distances
    // Only for current handle, not for true Tunni point
    if (!isTrueTunniPoint && initialEvent.ctrlKey && initialEvent.shiftKey) {
      // Equalize the control point distances instead of starting drag
      await equalizeSegmentDistances(
        tunniInitialState.tunniPointHit.segment,
        tunniInitialState.originalSegmentPoints,
        sceneController.sceneModel,
        sceneController.sceneModel.getSelectedPositionedGlyph(),
        sceneController
      );
      return;
    }
    
    // Process the drag events for Tunni point manipulation with visual feedback
    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      let finalChanges = null;
      
      // Set up the initial layer info for the editing operation
      const layerInfo = Object.entries(
        sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      ).map(([layerName, layerGlyph]) => {
        return {
          layerName,
          layerGlyph,
          changePath: ["layers", layerName, "glyph"],
        };
      });
      
      assert(layerInfo.length >= 1, "no layer to edit");
      
      // Get the original point positions for rollback
      let originalOnPoint1, originalOnPoint2;
      if (isTrueTunniPoint) {
        // For true Tunni point, we need to get on-curve point positions
        originalOnPoint1 = { ...layerInfo[0].layerGlyph.path.getPoint(tunniInitialState.selectedSegment.parentPointIndices[0]) };
        originalOnPoint2 = { ...layerInfo[0].layerGlyph.path.getPoint(tunniInitialState.selectedSegment.parentPointIndices[3]) };
      } else {
        // For current handle, get control point positions
        originalOnPoint1 = { ...layerInfo[0].layerGlyph.path.getPoint(tunniInitialState.originalControlPoints.controlPoint1Index) };
        originalOnPoint2 = { ...layerInfo[0].layerGlyph.path.getPoint(tunniInitialState.originalControlPoints.controlPoint2Index) };
      }
      
      for await (const event of eventStream) {
        if (event.type === "mouseup") {
          // Handle mouse up event for Tunni point - finalize the changes
          break;
        } else if (event.type === "mousemove") {
          // Calculate the changes for this mouse move event
          let dragChanges;
          if (isTrueTunniPoint) {
            dragChanges = handleTrueTunniPointMouseDrag(event, tunniInitialState, sceneController);
          } else {
            dragChanges = handleTunniPointMouseDrag(event, tunniInitialState, sceneController);
          }
          
          if (dragChanges) {
            finalChanges = dragChanges;
            
            // Apply temporary visual changes for each mouse move event
            const deepEditChanges = [];
            for (const layer of layerInfo) {
              let tempChanges = [];
              
              if (isTrueTunniPoint) {
                // For true Tunni point, change on-curve points while keeping off-curve points unchanged
                tempChanges = [
                  { f: "=xy", a: [dragChanges.onPoint1Index, dragChanges.newOnPoint1.x, dragChanges.newOnPoint1.y] },
                  { f: "=xy", a: [dragChanges.onPoint2Index, dragChanges.newOnPoint2.x, dragChanges.newOnPoint2.y] },
                  // Keep control points unchanged
                  { f: "=xy", a: [dragChanges.controlPoint1Index, dragChanges.newControlPoint1.x, dragChanges.newControlPoint1.y] },
                  { f: "=xy", a: [dragChanges.controlPoint2Index, dragChanges.newControlPoint2.x, dragChanges.newControlPoint2.y] }
                ];
              } else {
                // For current handle, change control points
                tempChanges = [
                  { f: "=xy", a: [dragChanges.controlPoint1Index, dragChanges.newControlPoint1.x, dragChanges.newControlPoint1.y] },
                  { f: "=xy", a: [dragChanges.controlPoint2Index, dragChanges.newControlPoint2.x, dragChanges.newControlPoint2.y] }
                ];
              }
              
              // Apply the changes to the layer glyph path for visual feedback
              for (const tempChange of tempChanges) {
                applyChange(layer.layerGlyph.path, tempChange);
              }
              
              // Consolidate the temporary changes for this layer
              deepEditChanges.push(consolidateChanges(tempChanges, [...layer.changePath, "path"]));
            }
            
            const editChange = consolidateChanges(deepEditChanges);
            await sendIncrementalChange(editChange, true); // true: "may drop" - for visual feedback only
          }
        }
      }
      
      // Prepare the final atomic changes for the undo record
      if (finalChanges) {
        // Create the final change that will be recorded for undo
        const finalLayerChanges = [];
        const rollbackChanges = [];
        
        for (const layer of layerInfo) {
          let finalChangesForLayer = [];
          let rollbackChangesForLayer = [];
          
          if (isTrueTunniPoint) {
            // For true Tunni point, change on-curve points while keeping off-curve points unchanged
            finalChangesForLayer = [
              { f: "=xy", a: [finalChanges.onPoint1Index, finalChanges.newOnPoint1.x, finalChanges.newOnPoint1.y] },
              { f: "=xy", a: [finalChanges.onPoint2Index, finalChanges.newOnPoint2.x, finalChanges.newOnPoint2.y] },
              // Keep control points unchanged
              { f: "=xy", a: [finalChanges.controlPoint1Index, finalChanges.newControlPoint1.x, finalChanges.newControlPoint1.y] },
              { f: "=xy", a: [finalChanges.controlPoint2Index, finalChanges.newControlPoint2.x, finalChanges.newControlPoint2.y] }
            ];
            
            // Rollback to original on-curve positions
            rollbackChangesForLayer = [
              { f: "=xy", a: [finalChanges.onPoint1Index, originalOnPoint1.x, originalOnPoint1.y] },
              { f: "=xy", a: [finalChanges.onPoint2Index, originalOnPoint2.x, originalOnPoint2.y] },
              // Control points remain unchanged
              { f: "=xy", a: [finalChanges.controlPoint1Index, originalOnPoint1.x, originalOnPoint1.y] }, // This is correct - control points unchanged
              { f: "=xy", a: [finalChanges.controlPoint2Index, originalOnPoint2.x, originalOnPoint2.y] }  // This is correct - control points unchanged
            ];
          } else {
            // For current handle, change control points
            finalChangesForLayer = [
              { f: "=xy", a: [finalChanges.controlPoint1Index, finalChanges.newControlPoint1.x, finalChanges.newControlPoint1.y] },
              { f: "=xy", a: [finalChanges.controlPoint2Index, finalChanges.newControlPoint2.x, finalChanges.newControlPoint2.y] }
            ];
            
            // Rollback to original control point positions
            rollbackChangesForLayer = [
              { f: "=xy", a: [tunniInitialState.originalControlPoints.controlPoint1Index, originalOnPoint1.x, originalOnPoint1.y] },
              { f: "=xy", a: [tunniInitialState.originalControlPoints.controlPoint2Index, originalOnPoint2.x, originalOnPoint2.y] }
            ];
          }
          
          finalLayerChanges.push(consolidateChanges(finalChangesForLayer, [...layer.changePath, "path"]));
          rollbackChanges.push(consolidateChanges(rollbackChangesForLayer, [...layer.changePath, "path"]));
        }
        
        return {
          changes: ChangeCollector.fromChanges(
            consolidateChanges(finalLayerChanges),
            consolidateChanges(rollbackChanges)
          ),
          undoLabel: isTrueTunniPoint ? "Move On-Curve Points via Tunni" : "Move Tunni Points",
          broadcast: true,
        };
      }
    });
    return;
  }
  
  // ... rest of the original handleDrag method
}
```

### Step 8: Update hover handling to show different cursor for true Tunni point

**File**: `src-js/views-editor/src/edit-tools-pointer.js`
**Section**: `handleHover` method
**Change**: Detect hover over true Tunni point and show appropriate cursor

**Current Hover Handler Enhancement**:
```js
handleHover(event) {
  const sceneController = this.sceneController;
  const point = sceneController.localPoint(event);
  const size = sceneController.mouseClickMargin;
  const selRect = centeredRect(point.x, point.y, size);
  const { selection, pathHit } = this.sceneModel.selectionAtPoint(
    point,
    size,
    sceneController.selection,
    sceneController.hoverSelection,
    event.altKey
  );
  sceneController.hoverSelection = selection;
  sceneController.hoverPathHit = pathHit;

  if (!sceneController.hoverSelection.size && !sceneController.hoverPathHit) {
    sceneController.hoveredGlyph = this.sceneModel.glyphAtPoint(point);
  } else {
    sceneController.hoveredGlyph = undefined;
  }

  this.sceneController.sceneModel.showTransformSelection = true;

  // Check if Tunni visualization layer is active and if we're hovering over a Tunni point
  const isTunniLayerActive = this.editor.visualizationLayersSettings.model["fontra.tunni.lines"];
  let isHoveringTunniPoint = false;
  let isHoveringTrueTunniPoint = false;  // New flag for true Tunni point
  
  if (isTunniLayerActive) {
    const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
    if (positionedGlyph) {
      // Convert from scene coordinates to glyph coordinates for hit testing
      const glyphPoint = {
        x: point.x - positionedGlyph.x,
        y: point.y - positionedGlyph.y,
      };
      const tunniHit = tunniLayerHitTest(glyphPoint, size, positionedGlyph);
      isHoveringTunniPoint = tunniHit !== null;
      isHoveringTrueTunniPoint = tunniHit !== null && tunniHit.hitType === "true-tunni-point";
    }
  }

  const resizeHandle = this.getResizeHandle(event, sceneController.selection);
  const rotationHandle = !resizeHandle
    ? this.getRotationHandle(event, sceneController.selection)
    : undefined;
  if (this.sceneController.sceneModel.hoverResizeHandle != resizeHandle) {
    this.sceneController.sceneModel.hoverResizeHandle = resizeHandle;
    this.canvasController.requestUpdate();
  }
  if (rotationHandle) {
    this.setCursorForRotationHandle(rotationHandle);
  } else if (resizeHandle) {
    this.setCursorForResizeHandle(resizeHandle);
  } else if (isHoveringTunniPoint) {
    // If hovering over a Tunni point, use pointer cursor
    // If it's a true Tunni point, we could use a different cursor
    if (isHoveringTrueTunniPoint) {
      this.canvasController.canvas.style.cursor = "crosshair";  // Different cursor for true Tunni point
    } else {
      this.canvasController.canvas.style.cursor = "pointer";  // Current handle
    }
  } else {
    this.setCursor();
  }
}
```

## Implementation Summary

The implementation plan includes the following changes:

1. **Enhanced `calculateTrueTunniPoint`**: Properly calculates the intersection of on-curve-off-curve vectors
2. **New `calculateOnCurvePointsFromTunni`**: Calculates new on-curve positions when Tunni point is moved
3. **Updated visualization**: Shows both the current handle and the true Tunni point with different visual representations
4. **Enhanced hit testing**: Distinguishes between current handle and true Tunni point
5. **New mouse handlers**: Handles dragging of true Tunni point to move on-curve points while keeping off-curve points fixed
6. **Updated pointer tool**: Integrates true Tunni point interaction with existing functionality
7. **Visual feedback**: Different cursors for different Tunni point types

## Testing Plan

1. Test that the true Tunni point is correctly visualized (green square)
2. Test that dragging the true Tunni point moves on-curve points along their vectors
3. Test that off-curve points remain fixed during true Tunni point dragging
4. Test that Alt-dragging uncouples the distances while maintaining vector directions
5. Test that the current handle functionality remains unchanged
6. Test undo/redo functionality for both types of interactions
7. Test that both points can be clicked and dragged independently

## Dependencies

- The implementation depends on the existing vector math functions in the codebase
- All changes are backward compatible and don't break existing functionality
- New functionality is only active when the Tunni visualization layer is enabled