import { BaseTool } from "./edit-tools-base.js";
import { calculateTunniPoint, calculateControlPointsFromTunni, calculateEqualizedControlPoints, areDistancesEqualized } from "@fontra/core/tunni-calculations.js";
import { distance, subVectors, dotVector, vectorLength } from "@fontra/core/vector.js";

// TunniTool is a specialized editing tool for manipulating cubic Bézier curves
// using the Tunni construction method. It allows users to directly manipulate
// the Tunni point (the intersection of the lines connecting the start/end points
// with their respective control points) to adjust the curve shape.
export class TunniTool extends BaseTool {
  iconPath = "/images/tunni.svg";
  identifier = "tunni-tool";

  activate() {
    super.activate();
    // Activate the Tunni visualization layer
    this.editor.visualizationLayersSettings.model["fontra.tunni.lines"] = true;
  }

  deactivate() {
    super.deactivate();
    // Deactivate the Tunni visualization layer
    this.editor.visualizationLayersSettings.model["fontra.tunni.lines"] = false;
    // Clean up any tool-specific state
    this.sceneController.tunniEditingTool.handleMouseUp({});
  }

  setCursor() {
    this.canvasController.canvas.style.cursor = "crosshair";
  }

  handleHover(event) {
    // Check if we're hovering over a Tunni point
    const point = this.sceneController.localPoint(event);
    const size = this.sceneController.mouseClickMargin;
    const hit = this.sceneController.tunniEditingTool.findTunniPointHit(point, size);
    
    if (hit) {
      // If we're hovering over a Tunni point, change the cursor
      this.canvasController.canvas.style.cursor = "pointer";
    } else {
      // Otherwise, use the default crosshair cursor
      this.setCursor();
    }
  }

  async handleDrag(eventStream, initialEvent) {
    // Check if the tool is active before processing events
    if (!this.isActive) {
      return;
    }
    
    // Handle the initial mouse down event
    this.sceneController.tunniEditingTool.handleMouseDown(initialEvent);

    // Process the drag events
    for await (const event of eventStream) {
      if (event.type === "mouseup") {
        // Handle mouse up event
        this.sceneController.tunniEditingTool.handleMouseUp(event);
        break;
      } else if (event.type === "mousemove") {
        // Handle mouse drag events
        try {
          await this.sceneController.tunniEditingTool.handleMouseDrag(event);
        } catch (error) {
          console.error("Error handling mouse drag event:", error);
        }
      }
    }
  }
}

// TunniEditingTool is a helper class for the TunniTool that handles the actual
// manipulation of cubic Bézier curves using the Tunni construction method.
// It provides methods for handling mouse events and updating the curve based
// on the position of the Tunni point.
export class TunniEditingTool {
 constructor(sceneController) {
    this.sceneController = sceneController;
    this.sceneModel = sceneController.sceneModel;
    this.tunniPoint = null;
    this.selectedSegment = null;
    this.originalSegmentPoints = null;
    this.originalControlPoints = null; // Store original control point positions for undo
    this.isActive = false; // Track when a Tunni point is actively being manipulated
  }

 async handleMouseDown(event) {
    const point = this.sceneController.localPoint(event);
    const size = this.sceneController.mouseClickMargin;
    
    // Convert from scene coordinates to glyph coordinates
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    const glyphPoint = {
      x: point.x - positionedGlyph.x,
      y: point.y - positionedGlyph.y,
    };
    
    // Check for Ctrl + Shift + Click to equalize control point distances
    if (event.ctrlKey && event.shiftKey) {
      // Handle the Ctrl + Shift + Click functionality
      await this.handleEqualizeDistances(point, size);
      return;
    }
    
    // First check if we clicked on an existing Tunni point
    const hit = this.findTunniPointHit(point, size);
    if (hit) {
      // Store the initial mouse position as the starting point for dragging
      this.initialMousePosition = glyphPoint;
      const segmentPoints = hit.segmentPoints;
      
      // Store initial positions
      this.initialOnPoint1 = { ...segmentPoints[0] }; // p1
      this.initialOffPoint1 = { ...segmentPoints[1] }; // p2
      this.initialOffPoint2 = { ...segmentPoints[2] }; // p3
      this.initialOnPoint2 = { ...segmentPoints[3] }; // p4
      
      // Calculate initial vectors from on-curve to off-curve points
      this.initialVector1 = {
        x: this.initialOffPoint1.x - this.initialOnPoint1.x,
        y: this.initialOffPoint1.y - this.initialOnPoint1.y
      };
      
      this.initialVector2 = {
        x: this.initialOffPoint2.x - this.initialOnPoint2.x,
        y: this.initialOffPoint2.y - this.initialOnPoint2.y
      };
      
      // Calculate unit vectors for movement direction
      const length1 = Math.sqrt(this.initialVector1.x * this.initialVector1.x + this.initialVector1.y * this.initialVector1.y);
      const length2 = Math.sqrt(this.initialVector2.x * this.initialVector2.x + this.initialVector2.y * this.initialVector2.y);
      
      this.unitVector1 = length1 > 0 ? {
        x: this.initialVector1.x / length1,
        y: this.initialVector1.y / length1
      } : { x: 1, y: 0 };
      
      this.unitVector2 = length2 > 0 ? {
        x: this.initialVector2.x / length2,
        y: this.initialVector2.y / length2
      } : { x: 1, y: 0 };
      
      // Calculate 45-degree vector (average of the two unit vectors)
      this.fortyFiveVector = {
        x: (this.unitVector1.x + this.unitVector2.x) / 2,
        y: (this.unitVector1.y + this.unitVector2.y) / 2
      };
      
      // Normalize the 45-degree vector
      const fortyFiveLength = Math.sqrt(this.fortyFiveVector.x * this.fortyFiveVector.x + this.fortyFiveVector.y * this.fortyFiveVector.y);
      if (fortyFiveLength > 0) {
        this.fortyFiveVector.x /= fortyFiveLength;
        this.fortyFiveVector.y /= fortyFiveLength;
      }
      
      this.selectedSegment = hit.segment;
      this.originalSegmentPoints = [...segmentPoints];
      
      // Store original control point positions for undo functionality
      const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph && positionedGlyph.glyph && positionedGlyph.glyph.path) {
        const path = positionedGlyph.glyph.path;
        const controlPoint1Index = hit.segment.parentPointIndices[1];
        const controlPoint2Index = hit.segment.parentPointIndices[2];
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
      }
      
      this.isActive = true; // Set active state when Tunni point is selected
      return;
    }
    
    // If not, check if we clicked near a cubic segment
    const pathHit = this.sceneModel.pathHitAtPoint(point, size);
    if (pathHit.segment && pathHit.segment.points.length === 4) {
      // Check if it's a cubic segment (two off-curve points)
      const pointTypes = pathHit.segment.parentPointIndices.map(
        index => this.sceneModel.getSelectedPositionedGlyph().glyph.path.pointTypes[index]
      );
      
      if (pointTypes[1] === 2 && pointTypes[2] === 2) { // Both are cubic control points
        const segmentPoints = pathHit.segment.points;
        const tunniPoint = calculateTunniPoint(segmentPoints);
        
        if (tunniPoint && distance(glyphPoint, tunniPoint) <= size) {
          // Store the initial mouse position as the starting point for dragging
          this.initialMousePosition = glyphPoint;
          
          // Store initial positions
          this.initialOnPoint1 = { ...segmentPoints[0] }; // p1
          this.initialOffPoint1 = { ...segmentPoints[1] }; // p2
          this.initialOffPoint2 = { ...segmentPoints[2] }; // p3
          this.initialOnPoint2 = { ...segmentPoints[3] }; // p4
          
          // Calculate initial vectors from on-curve to off-curve points
          this.initialVector1 = {
            x: this.initialOffPoint1.x - this.initialOnPoint1.x,
            y: this.initialOffPoint1.y - this.initialOnPoint1.y
          };
          
          this.initialVector2 = {
            x: this.initialOffPoint2.x - this.initialOnPoint2.x,
            y: this.initialOffPoint2.y - this.initialOnPoint2.y
          };
          
          // Calculate unit vectors for movement direction
          const length1 = Math.sqrt(this.initialVector1.x * this.initialVector1.x + this.initialVector1.y * this.initialVector1.y);
          const length2 = Math.sqrt(this.initialVector2.x * this.initialVector2.x + this.initialVector2.y * this.initialVector2.y);
          
          this.unitVector1 = length1 > 0 ? {
            x: this.initialVector1.x / length1,
            y: this.initialVector1.y / length1
          } : { x: 1, y: 0 };
          
          this.unitVector2 = length2 > 0 ? {
            x: this.initialVector2.x / length2,
            y: this.initialVector2.y / length2
          } : { x: 1, y: 0 };
          
          // Calculate 45-degree vector (average of the two unit vectors)
          this.fortyFiveVector = {
            x: (this.unitVector1.x + this.unitVector2.x) / 2,
            y: (this.unitVector1.y + this.unitVector2.y) / 2
          };
          
          // Normalize the 45-degree vector
          const fortyFiveLength = Math.sqrt(this.fortyFiveVector.x * this.fortyFiveVector.x + this.fortyFiveVector.y * this.fortyFiveVector.y);
          if (fortyFiveLength > 0) {
            this.fortyFiveVector.x /= fortyFiveLength;
            this.fortyFiveVector.y /= fortyFiveLength;
          };
          
          this.selectedSegment = pathHit.segment;
          this.originalSegmentPoints = [...segmentPoints];
          
          // Store original control point positions for undo functionality
          const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
          if (positionedGlyph && positionedGlyph.glyph && positionedGlyph.glyph.path) {
            const path = positionedGlyph.glyph.path;
            const controlPoint1Index = pathHit.segment.parentPointIndices[1];
            const controlPoint2Index = pathHit.segment.parentPointIndices[2];
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
          }
          
          this.isActive = true; // Set active state when Tunni point is selected
        }
      }
    }
  }

  /**
   * Handle Ctrl + Shift + Click to equalize control point distances using arithmetic mean
   * @param {Object} point - The point where the mouse was clicked
   * @param {number} size - The click margin size
   */
  async handleEqualizeDistances(point, size) {
    // First check if we clicked on an existing Tunni point
    const hit = this.findTunniPointHit(point, size);
    if (hit) {
      await this.equalizeSegmentDistances(hit.segment, hit.segmentPoints);
      return;
    }
    
    // If not, check if we clicked near a cubic segment
    const pathHit = this.sceneModel.pathHitAtPoint(point, size);
    if (pathHit.segment && pathHit.segment.points.length === 4) {
      // Check if it's a cubic segment (two off-curve points)
      const pointTypes = pathHit.segment.parentPointIndices.map(
        index => this.sceneModel.getSelectedPositionedGlyph().glyph.path.pointTypes[index]
      );
      
      if (pointTypes[1] === 2 && pointTypes[2] === 2) { // Both are cubic control points
        await this.equalizeSegmentDistances(pathHit.segment, pathHit.segment.points);
      }
    }
  }

  /**
   * Equalize the distances of control points in a segment using arithmetic mean
   * @param {Object} segment - The segment to modify
   * @param {Array} segmentPoints - Array of 4 points: [start, control1, control2, end]
   */
  async equalizeSegmentDistances(segment, segmentPoints) {
    // Check if distances are already equalized
    if (areDistancesEqualized(segmentPoints)) {
      console.log("Distances are already equalized, skipping...");
      return;
    }
    
    // Calculate new control points with equalized distances using arithmetic mean
    const newControlPoints = calculateEqualizedControlPoints(segmentPoints);
    
    // Update the path with new control points using editLayersAndRecordChanges
    try {
      await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
        for (const layerGlyph of Object.values(layerGlyphs)) {
          const path = layerGlyph.path;
          
          // Validate that the path and segment indices exist
          if (!path || !segment?.parentPointIndices) {
            console.warn("Invalid path or segment indices", {
              path: !!path,
              parentPointIndices: segment?.parentPointIndices
            });
            return "Equalize Control Point Distances"; // Return early but still provide undo label
          }
          
          // Find the indices of the control points within the segment
          // In a cubic segment, control points are typically at indices 1 and 2
          const controlPoint1Index = segment.parentPointIndices[1];
          const controlPoint2Index = segment.parentPointIndices[2];
          
          // Validate the control point indices
          if (controlPoint1Index === undefined || controlPoint2Index === undefined) {
            console.warn("Invalid control point indices", {
              controlPoint1Index: controlPoint1Index,
              controlPoint2Index: controlPoint2Index
            });
            return "Equalize Control Point Distances"; // Return early but still provide undo label
          }
          
          // Update the control points in the path
          path.setPointPosition(controlPoint1Index, newControlPoints[0].x, newControlPoints[0].y);
          path.setPointPosition(controlPoint2Index, newControlPoints[1].x, newControlPoints[1].y);
        }
        return "Equalize Control Point Distances";
      });
    } catch (error) {
      console.error("Error equalizing control point distances:", error);
      throw error; // Re-throw the error so it can be handled upstream
    }
  }

 async handleMouseDrag(event) {
   // Check if we have the necessary data to process the drag
   if (!this.initialMousePosition || !this.initialOffPoint1 || !this.initialOffPoint2 || !this.selectedSegment || !this.originalSegmentPoints) {
     return;
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
   // (proportional editing is now the default behavior)
   const equalizeDistances = !event.altKey;
   
   let newControlPoint1, newControlPoint2;
   
   if (equalizeDistances) {
     // Proportional editing: Move both control points by the same amount along their respective vectors
     // Project mouse movement onto the 45-degree vector
     // This gives us the scalar amount to move along the 45-degree vector
     const projection = mouseDelta.x * this.fortyFiveVector.x + mouseDelta.y * this.fortyFiveVector.y;
     
     // Move both control points by the same amount along their respective vectors
     newControlPoint1 = {
       x: this.initialOffPoint1.x + this.unitVector1.x * projection,
       y: this.initialOffPoint1.y + this.unitVector1.y * projection
     };
     
     newControlPoint2 = {
       x: this.initialOffPoint2.x + this.unitVector2.x * projection,
       y: this.initialOffPoint2.y + this.unitVector2.y * projection
     };
   } else {
     // Non-proportional editing: Each control point moves independently along its own vector
     // Project mouse movement onto each control point's individual unit vector
     const projection1 = mouseDelta.x * this.unitVector1.x + mouseDelta.y * this.unitVector1.y;
     const projection2 = mouseDelta.x * this.unitVector2.x + mouseDelta.y * this.unitVector2.y;
     
     // Move each control point by its own projection amount
     newControlPoint1 = {
       x: this.initialOffPoint1.x + this.unitVector1.x * projection1,
       y: this.initialOffPoint1.y + this.unitVector1.y * projection1
     };
     
     newControlPoint2 = {
       x: this.initialOffPoint2.x + this.unitVector2.x * projection2,
       y: this.initialOffPoint2.y + this.unitVector2.y * projection2
     };
   }
   
   // Calculate Tunni point using the calculateTunniPoint function
   this.tunniPoint = calculateTunniPoint([
     this.initialOnPoint1,
     newControlPoint1,
     newControlPoint2,
     this.initialOnPoint2
   ]);
    
    // Calculate new control points based on the new positions
    const newControlPoints = [newControlPoint1, newControlPoint2];
    
    // Validate that we have a proper segment and control points
    if (!this.selectedSegment || !newControlPoints || newControlPoints.length !== 2) {
      console.warn("Invalid segment or control points", {
        selectedSegment: this.selectedSegment,
        newControlPoints: newControlPoints
      });
      return;
    }
    
    // Validate that the selected segment is a cubic segment
    if (this.selectedSegment.points.length !== 4) {
      console.warn("Selected segment is not a cubic segment", {
      segmentPointsLength: this.selectedSegment.points.length
      });
      return;
    }
    
    // Update the path with new control points using editGlyph for incremental changes
    // This will provide visual feedback during dragging without creating undo records
    try {
      await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
        const layerInfo = Object.entries(
          this.sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
        ).map(([layerName, layerGlyph]) => {
          return {
            layerName,
            layerGlyph,
            changePath: ["layers", layerName, "glyph"],
          };
        });

        const forwardChanges = [];
        for (const { layerGlyph, changePath } of layerInfo) {
          const path = layerGlyph.path;
          
          // Validate that the path and segment indices exist
          if (!path || !this.selectedSegment?.parentPointIndices) {
            console.warn("Invalid path or segment indices", {
              path: !!path,
              parentPointIndices: this.selectedSegment?.parentPointIndices
            });
            continue;
          }
          
          // Find the indices of the control points within the segment
          // In a cubic segment, control points are typically at indices 1 and 2
          const controlPoint1Index = this.selectedSegment.parentPointIndices[1];
          const controlPoint2Index = this.selectedSegment.parentPointIndices[2];
          
          // Validate the control point indices
          if (controlPoint1Index === undefined || controlPoint2Index === undefined) {
            console.warn("Invalid control point indices", {
              controlPoint1Index: controlPoint1Index,
              controlPoint2Index: controlPoint2Index
            });
            continue;
          }
          
          // Update the control points in the path
          path.setPointPosition(controlPoint1Index, newControlPoints[0].x, newControlPoints[0].y);
          path.setPointPosition(controlPoint2Index, newControlPoints[1].x, newControlPoints[1].y);
          
          // Record the change for this layer using the proper format for incremental changes
          forwardChanges.push({
            p: changePath,
            c: [
              { f: "setPointPosition", a: [controlPoint1Index, newControlPoints[0].x, newControlPoints[0].y] },
              { f: "setPointPosition", a: [controlPoint2Index, newControlPoints[1].x, newControlPoints[1].y] }
            ]
          });
        }

        if (forwardChanges.length > 0) {
          await sendIncrementalChange({ c: forwardChanges }, true); // true: "may drop" for performance
        }
      });
    } catch (error) {
      console.error("Error updating Tunni points:", error);
      throw error; // Re-throw the error so it can be handled upstream
    }
}

 handleMouseUp(event) {
    // The final state should already be applied from the drag operation
    // The undo/redo is handled by the combination of the initial state recorded in handleMouseDown
    // and the final state that's currently in the glyph
    this.tunniPoint = null;
    this.selectedSegment = null;
    this.originalSegmentPoints = null;
    this.originalControlPoints = null; // Clear stored original control points
    this.isActive = false; // Clear active state when mouse is released
    this.initialMousePosition = null;
    // Clear vector-based properties
    this.initialOnPoint1 = null;
    this.initialOffPoint1 = null;
    this.initialOffPoint2 = null;
    this.initialOnPoint2 = null;
    this.initialVector1 = null;
    this.initialVector2 = null;
    this.unitVector1 = null;
    this.unitVector2 = null;
  }

  findTunniPointHit(point, size) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) {
      return null;
    }
    
    const path = positionedGlyph.glyph.path;
    
    // Convert from scene coordinates to glyph coordinates
    const glyphPoint = {
      x: point.x - positionedGlyph.x,
      y: point.y - positionedGlyph.y,
    };
    
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
            const tunniPoint = calculateTunniPoint(segment.points);
            if (tunniPoint && distance(glyphPoint, tunniPoint) <= size) {
              return {
                tunniPoint: tunniPoint,
                segment: segment,
                segmentPoints: segment.points
              };
            }
          }
        }
      }
    }
    
    return null;
  }
}