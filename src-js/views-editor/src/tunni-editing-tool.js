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
    for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
      for (const segment of path.iterContourDecomposedSegments(contourIndex)) {
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
  }}