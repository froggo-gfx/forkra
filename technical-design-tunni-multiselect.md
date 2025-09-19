# Technical Design Document: Frame Selection and Multi-Select Capabilities for Tunni Tool

## 1. Overview

This document outlines the technical design for implementing frame selection and multi-select capabilities in the Tunni tool within Fontra. The Tunni tool allows users to manipulate cubic Bézier curves by directly manipulating the Tunni point (the intersection of lines connecting start/end points with their respective control points). Currently, the tool only supports single-point selection and manipulation.

The goal is to enhance the tool with:
1. Integration with Fontra's global selection system
2. Frame selection capability for Tunni points
3. Shift key multi-selection for Tunni points
4. Simultaneous movement of multiple selected Tunni points

## 2. Current Implementation Analysis

### 2.1 Tunni Tool Architecture

The Tunni tool consists of two main components:
1. `TunniTool` class in [`src-js/views-editor/src/edit-tools.js`](file:///c%3A/Users/frena/Desktop/fontra-test/src-js/views-editor/src/edit-tools.js) - The main tool implementation
2. `TunniEditingTool` class in [`src-js/views-editor/src/tunni-editing-tool.js`](file:///c%3A/Users/frena/Desktop/fontra-test/src-js/views-editor/src/tunni-editing-tool.js) - Handles the actual manipulation logic

### 2.2 Current Limitations

1. **Local Selection Management**: The tool maintains its own selection state rather than integrating with Fontra's global selection system
2. **Single Point Selection**: Only one Tunni point can be selected and manipulated at a time
3. **No Frame Selection**: Users cannot select multiple Tunni points using a selection rectangle
4. **No Multi-Select Visualization**: The visualization layer doesn't indicate which Tunni points are selected

## 3. Design Approach

### 3.1 Integration with Global Selection System

The Tunni tool will be integrated with Fontra's global selection system using a new selection identifier `tunni/segmentIndex` where `segmentIndex` identifies a specific cubic segment that has a Tunni point.

Key changes:
1. Replace local selection state with global selection
2. Modify selection handling to work with the global system
3. Update visualization to reflect global selection state

### 3.2 Frame Selection Capability

Frame selection will be implemented by:
1. Adding a new method `tunniSelectionAtRect(selRect)` to `SceneModel`
2. Iterating through all cubic segments and checking if their Tunni points fall within the selection rectangle
3. Returning a Set of `tunni/segmentIndex` identifiers for points within the rectangle

### 3.3 Shift Key Multi-Selection

Multi-selection with the Shift key will follow Fontra's existing patterns:
1. Use `symmetricDifference` for Shift+Click (toggle selection)
2. Use `union` for Cmd/Ctrl+Click (add to selection)
3. Use `replace` for normal Click (new selection)

### 3.4 Simultaneous Movement

Multiple Tunni points will be moved simultaneously by:
1. Extending the existing `handleMouseDrag` method to handle multiple selected segments
2. Calculating movement vectors for each selected Tunni point
3. Applying the same proportional movement logic to all selected points

## 4. Detailed Implementation Plan

### 4.1 Data Structure Modifications

#### 4.1.1 Selection Identifiers
A new selection identifier format will be introduced:
```
tunni/contourIndex:segmentIndex
```
Where:
- `contourIndex` is the index of the contour containing the segment
- `segmentIndex` is the index of the segment within the contour

#### 4.1.2 SceneModel Enhancements

Add the following methods to `SceneModel` in [`src-js/views-editor/src/scene-model.js`](file:///c%3A/Users/frena/Desktop/fontra-test/src-js/views-editor/src/scene-model.js):

1. `tunniSelectionAtPoint(point, size)` - Find Tunni points near a point
2. `tunniSelectionAtRect(selRect)` - Find Tunni points within a rectangle

### 4.2 Core Component Modifications

#### 4.2.1 TunniEditingTool ([`src-js/views-editor/src/tunni-editing-tool.js`](file:///c%3A/Users/frena/Desktop/fontra-test/src-js/views-editor/src/tunni-editing-tool.js))

1. **Modify `handleMouseDown` method**:
   - Accept multiple selected segments instead of just one
   - Store initial positions for all selected segments
   - Calculate movement vectors for all selected segments

2. **Modify `handleMouseDrag` method**:
   - Apply movement to all selected segments simultaneously
   - Maintain proportional relationships for all segments

3. **Modify `handleMouseUp` method**:
   - Clean up state for all selected segments

4. **Modify `findTunniPointHit` method**:
   - Return information that can be used to create global selection identifiers

#### 4.2.2 TunniTool ([`src-js/views-editor/src/edit-tools.js`](file:///c%3A/Users/frena/Desktop/fontra-test/src-js/views-editor/src/edit-tools.js))

1. **Modify `handleHover` method**:
   - Use global selection system for hover detection

2. **Modify `handleDrag` method**:
   - Integrate with global selection system for multi-select
   - Handle frame selection initiation

3. **Add `handleRectSelect` method**:
   - Implement frame selection similar to PointerTool

#### 4.2.3 SceneModel ([`src-js/views-editor/src/scene-model.js`](file:///c%3A/Users/frena/Desktop/fontra-test/src-js/views-editor/src/scene-model.js))

1. **Add `tunniSelectionAtPoint` method**:
   ```javascript
   tunniSelectionAtPoint(point, size) {
     const positionedGlyph = this.getSelectedPositionedGlyph();
     if (!positionedGlyph) {
       return new Set();
     }
     
     const glyphPoint = {
       x: point.x - positionedGlyph.x,
       y: point.y - positionedGlyph.y,
     };
     
     const selection = new Set();
     
     // Iterate through all contours and segments
     for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
       let segmentIndex = 0;
       for (const segment of path.iterContourDecomposedSegments(contourIndex)) {
         if (segment.points.length === 4) {
           const pointTypes = segment.parentPointIndices.map(
             index => path.pointTypes[index]
           );
           
           if (pointTypes[1] === 2 && pointTypes[2] === 2) {
             const tunniPoint = calculateTunniPoint(segment.points);
             if (tunniPoint && distance(glyphPoint, tunniPoint) <= size) {
               selection.add(`tunni/${contourIndex}:${segmentIndex}`);
               break;
             }
           }
         }
         segmentIndex++;
       }
     }
     
     return selection;
   }
   ```

2. **Add `tunniSelectionAtRect` method**:
   ```javascript
   tunniSelectionAtRect(selRect) {
     const selection = new Set();
     if (!this.selectedGlyph?.isEditing) {
       return selection;
     }
     
     const positionedGlyph = this.getSelectedPositionedGlyph();
     if (!positionedGlyph) {
       return selection;
     }
     
     selRect = offsetRect(selRect, -positionedGlyph.x, -positionedGlyph.y);
     const path = positionedGlyph.glyph.path;
     
     // Iterate through all contours and segments
     for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
       let segmentIndex = 0;
       for (const segment of path.iterContourDecomposedSegments(contourIndex)) {
         if (segment.points.length === 4) {
           const pointTypes = segment.parentPointIndices.map(
             index => path.pointTypes[index]
           );
           
           if (pointTypes[1] === 2 && pointTypes[2] === 2) {
             const tunniPoint = calculateTunniPoint(segment.points);
             if (tunniPoint && pointInRect(tunniPoint.x, tunniPoint.y, selRect)) {
               selection.add(`tunni/${contourIndex}:${segmentIndex}`);
             }
           }
         }
         segmentIndex++;
       }
     }
     
     return selection;
   }
   ```

### 4.3 Visualization Layer Integration

#### 4.3.1 Tunni Visualization Layer ([`src-js/views-editor/src/visualization-layer-tunni.js`](file:///c%3A/Users/frena/Desktop/fontra-test/src-js/views-editor/src/visualization-layer-tunni.js))

1. **Modify `drawTunniLines` function**:
   - Add support for highlighting selected Tunni points
   - Use different colors/styles for selected vs. unselected points
   - Visualize multiple selected points

   ```javascript
   function drawTunniLines(context, positionedGlyph, parameters, model, controller) {
     const path = positionedGlyph.glyph.path;
     
     // Get current selection
     const selection = model.selection || new Set();
     
     // Check if there's an active Tunni point
     const isActive = model?.sceneController?.tunniEditingTool?.isActive || false;
     
     // Set base colors
     let tunniLineColor = parameters.tunniLineColor;
     let tunniPointColor = parameters.tunniPointColor;
     
     // Modify colors based on active state
     if (isActive) {
       tunniLineColor = parameters.tunniLineColor + "80"; // More transparent when active
       tunniPointColor = "#FF0000"; // Red when active
     }
     
     context.lineWidth = parameters.strokeWidth;
     context.setLineDash(parameters.dashPattern);
     
     // Iterate through all contours
     for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
       let segmentIndex = 0;
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
               // Check if this Tunni point is selected
               const isSelected = selection.has(`tunni/${contourIndex}:${segmentIndex}`);
               
               // Set colors based on selection state
               context.strokeStyle = isSelected ? "#FF0000" : tunniLineColor;
               context.fillStyle = isSelected ? "#FF0000" : tunniPointColor;
               
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
               
               // Draw Tunni point with highlight if selected
               context.beginPath();
               context.arc(
                 tunniPoint.x, 
                 tunniPoint.y, 
                 isSelected ? parameters.tunniPointSize * 1.5 : parameters.tunniPointSize, 
                 0, 
                 2 * Math.PI
               );
               context.fill();
               
               // Draw selection indicator if needed
               if (isSelected) {
                 context.beginPath();
                 context.arc(
                   tunniPoint.x, 
                   tunniPoint.y, 
                   parameters.tunniPointSize * 2, 
                   0, 
                   2 * Math.PI
                 );
                 context.stroke();
               }
               
               // Draw line between control points
               context.beginPath();
               context.moveTo(p2.x, p2.y);
               context.lineTo(p3.x, p3.y);
               context.stroke();
             }
           }
         }
         segmentIndex++;
       }
     }
     
     context.setLineDash([]);
   }
   ```

### 4.4 Multi-Select Movement Implementation

#### 4.4.1 Enhanced TunniEditingTool

The `TunniEditingTool` will be enhanced to handle multiple selected segments:

1. **Modify data structures**:
   ```javascript
   export class TunniEditingTool {
     constructor(sceneController) {
       this.sceneController = sceneController;
       this.sceneModel = sceneController.sceneModel;
       this.selectedSegments = new Map(); // Store multiple segments
       this.originalSegmentPoints = new Map(); // Store original points for all segments
       this.isActive = false;
     }
   }
   ```

2. **Enhanced handleMouseDown**:
   ```javascript
   handleMouseDown(event) {
     const point = this.sceneController.localPoint(event);
     const size = this.sceneController.mouseClickMargin;
     
     // Convert from scene coordinates to glyph coordinates
     const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
     const glyphPoint = {
       x: point.x - positionedGlyph.x,
       y: point.y - positionedGlyph.y,
     };
     
     // Get current selection
     const selection = this.sceneController.selection;
     
     // Process all selected Tunni segments
     for (const selectionItem of selection) {
       if (selectionItem.startsWith("tunni/")) {
         const [contourIndex, segmentIndex] = selectionItem.substring(6).split(":").map(Number);
         
         // Get the segment
         const segment = this.getSegmentAt(contourIndex, segmentIndex);
         if (segment) {
           const segmentPoints = segment.points;
           
           // Store initial positions
           this.originalSegmentPoints.set(selectionItem, [...segmentPoints]);
           
           // Calculate initial vectors from on-curve to off-curve points
           const initialVector1 = {
             x: segmentPoints[1].x - segmentPoints[0].x,
             y: segmentPoints[1].y - segmentPoints[0].y
           };
           
           const initialVector2 = {
             x: segmentPoints[2].x - segmentPoints[3].x,
             y: segmentPoints[2].y - segmentPoints[3].y
           };
           
           // Store segment info
           this.selectedSegments.set(selectionItem, {
             segment: segment,
             originalPoints: [...segmentPoints],
             initialVector1: initialVector1,
             initialVector2: initialVector2
           });
         }
       }
     }
     
     this.isActive = true;
   }
   ```

3. **Enhanced handleMouseDrag**:
   ```javascript
   async handleMouseDrag(event) {
     if (!this.isActive || this.selectedSegments.size === 0) {
       return;
     }
     
     const point = this.sceneController.localPoint(event);
     
     // Convert from scene coordinates to glyph coordinates
     const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
     const glyphPoint = {
       x: point.x - positionedGlyph.x,
       y: point.y - positionedGlyph.y,
     };
     
     // Calculate mouse movement vector based on first selected segment
     const firstSegmentInfo = this.selectedSegments.values().next().value;
     const initialMousePosition = firstSegmentInfo.originalPoints[0]; // Simplified
     const mouseDelta = {
       x: glyphPoint.x - initialMousePosition.x,
       y: glyphPoint.y - initialMousePosition.y
     };
     
     // Check if Alt key is pressed to disable equalizing distances
     const equalizeDistances = !event.altKey;
     
     // Update all selected segments
     const updates = [];
     
     for (const [selectionId, segmentInfo] of this.selectedSegments) {
       const { segment, originalPoints, initialVector1, initialVector2 } = segmentInfo;
       
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
       
       // Calculate 45-degree vector (average of the two unit vectors)
       const fortyFiveVector = {
         x: (unitVector1.x + unitVector2.x) / 2,
         y: (unitVector1.y + unitVector2.y) / 2
       };
       
       // Normalize the 45-degree vector
       const fortyFiveLength = Math.sqrt(fortyFiveVector.x * fortyFiveVector.x + fortyFiveVector.y * fortyFiveVector.y);
       if (fortyFiveLength > 0) {
         fortyFiveVector.x /= fortyFiveLength;
         fortyFiveVector.y /= fortyFiveLength;
       }
       
       let newControlPoint1, newControlPoint2;
       
       if (equalizeDistances) {
         // Proportional editing: Move both control points by the same amount along their respective vectors
         const projection = mouseDelta.x * fortyFiveVector.x + mouseDelta.y * fortyFiveVector.y;
         
         newControlPoint1 = {
           x: originalPoints[1].x + unitVector1.x * projection,
           y: originalPoints[1].y + unitVector1.y * projection
         };
         
         newControlPoint2 = {
           x: originalPoints[2].x + unitVector2.x * projection,
           y: originalPoints[2].y + unitVector2.y * projection
         };
       } else {
         // Non-proportional editing: Each control point moves independently
         const projection1 = mouseDelta.x * unitVector1.x + mouseDelta.y * unitVector1.y;
         const projection2 = mouseDelta.x * unitVector2.x + mouseDelta.y * unitVector2.y;
         
         newControlPoint1 = {
           x: originalPoints[1].x + unitVector1.x * projection1,
           y: originalPoints[1].y + unitVector1.y * projection1
         };
         
         newControlPoint2 = {
           x: originalPoints[2].x + unitVector2.x * projection2,
           y: originalPoints[2].y + unitVector2.y * projection2
         };
       }
       
       updates.push({
         selectionId: selectionId,
         segment: segment,
         newControlPoints: [newControlPoint1, newControlPoint2]
       });
     }
     
     // Apply updates to all layers
     try {
       await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
         for (const layerGlyph of Object.values(layerGlyphs)) {
           const path = layerGlyph.path;
           
           for (const update of updates) {
             const { segment, newControlPoints } = update;
             
             // Update the control points in the path
             const controlPoint1Index = segment.parentPointIndices[1];
             const controlPoint2Index = segment.parentPointIndices[2];
             
             path.setPointPosition(controlPoint1Index, newControlPoints[0].x, newControlPoints[0].y);
             path.setPointPosition(controlPoint2Index, newControlPoints[1].x, newControlPoints[1].y);
           }
         }
         return "Update Tunni Points";
       });
     } catch (error) {
       console.error("Error updating Tunni points:", error);
       throw error;
     }
   }
   ```

## 5. Integration with Existing Components

### 5.1 Pointer Tool Integration

The Tunni tool will follow the same interaction patterns as the Pointer tool:
1. Shift+Click for toggle selection
2. Cmd/Ctrl+Click for adding to selection
3. Click for new selection
4. Drag for frame selection

### 5.2 Visualization Consistency

The Tunni visualization will follow the same styling patterns as other selection visualizations in Fontra:
1. Selected points will be highlighted with a different color
2. Selection indicators will be drawn around selected points
3. Active points will have distinct styling

## 6. Performance Considerations

1. **Efficient Segment Iteration**: The implementation will cache segment information to avoid repeated calculations
2. **Selective Rendering**: Only selected Tunni points will have enhanced visualization
3. **Batch Updates**: Multiple segment updates will be batched into a single edit operation

## 7. Testing Strategy

1. **Unit Tests**: Test individual methods in TunniEditingTool
2. **Integration Tests**: Test interaction with global selection system
3. **UI Tests**: Test frame selection and multi-select interactions
4. **Performance Tests**: Verify efficient handling of multiple selected points

## 8. Backward Compatibility

The implementation will maintain backward compatibility by:
1. Preserving existing single-point selection behavior
2. Not breaking existing API contracts
3. Ensuring visualization layer continues to work for single selections

## 9. Future Enhancements

1. **Keyboard Shortcuts**: Add support for keyboard navigation of selected Tunni points
2. **Selection Transformation**: Enable scaling/rotating multiple selected Tunni points
3. **Selection Filtering**: Allow filtering Tunni points by contour or other criteria

## 10. Implementation Roadmap

1. **Phase 1**: Implement global selection integration
2. **Phase 2**: Add frame selection capability
3. **Phase 3**: Implement multi-select movement
4. **Phase 4**: Enhance visualization layer
5. **Phase 5**: Add comprehensive testing

## 11. Conclusion

This design provides a comprehensive approach to implementing frame selection and multi-select capabilities in the Tunni tool while maintaining consistency with the rest of Fontra's editing tools. The implementation will enhance the usability of the Tunni tool by allowing users to work with multiple points simultaneously, following established patterns in the application.