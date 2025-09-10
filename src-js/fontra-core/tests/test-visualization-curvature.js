import { expect } from "chai";
import { VarPackedPath } from "@fontra/core/var-path.js";
import {
  calculateCurvatureForSegment,
  calculateCurvatureForQuadraticSegment
} from "@fontra/core/curvature.js";

describe("Visualization Curvature Tests", () => {
  describe("Curvature Visualization with Cubic and Quadratic Curves", () => {
    it("should create a path with both cubic and quadratic segments", () => {
      // Create a path with both cubic and quadratic segments using the pen API
      const path = new VarPackedPath();
      
      // Add a cubic segment: ON-OFF-OFF-ON
      path.moveTo(0, 0); // Start point
      path.cubicCurveTo(0, 100, 100, 100, 100, 0); // Control points and end point
      
      // Add a quadratic segment: ON-OFF-ON
      path.quadraticCurveTo(150, 50, 200, 0); // Control point and end point
      
      expect(path.numPoints).to.equal(6);
      expect(path.numContours).to.equal(1);
      
      // Check that we have the correct point types
      expect(path.pointTypes[0]).to.equal(VarPackedPath.ON_CURVE);
      expect(path.pointTypes[1]).to.equal(VarPackedPath.OFF_CURVE_CUBIC);
      expect(path.pointTypes[2]).to.equal(VarPackedPath.OFF_CURVE_CUBIC);
      expect(path.pointTypes[3]).to.equal(VarPackedPath.ON_CURVE);
      expect(path.pointTypes[4]).to.equal(VarPackedPath.OFF_CURVE_QUAD);
      expect(path.pointTypes[5]).to.equal(VarPackedPath.ON_CURVE);
    });
    
    it("should identify cubic and quadratic segments correctly", () => {
      // Create a path with both cubic and quadratic segments
      const path = new VarPackedPath();
      
      // Add a cubic segment: ON-OFF-OFF-ON
      path.moveTo(0, 0); // Start point
      path.cubicCurveTo(0, 100, 100, 100, 100, 0); // Control points and end point
      
      // Add a quadratic segment: ON-OFF-ON
      path.quadraticCurveTo(150, 50, 200, 0); // Control point and end point
      
      // Simulate the logic from visualization-layer-definitions.js to identify segments
      const cubicSegments = [];
      const quadraticSegments = [];
      
      // Check contour 0
      const contourIndex = 0;
      const contour = path.getContour(contourIndex);
      const startPoint = path.getAbsolutePointIndex(contourIndex, 0);
      const numPoints = contour.pointTypes.length;
      
      for (let i = 0; i < numPoints; i++) {
        const pointIndex = startPoint + i;
        const pointType = path.pointTypes[pointIndex];
        
        if ((pointType & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.ON_CURVE) {
          const nextIndex1 = path.getAbsolutePointIndex(contourIndex, (i + 1) % numPoints);
          const nextIndex2 = path.getAbsolutePointIndex(contourIndex, (i + 2) % numPoints);
          const nextType1 = path.pointTypes[nextIndex1];
          const nextType2 = path.pointTypes[nextIndex2];
          
          const isNext1OffCubic = (nextType1 & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.OFF_CURVE_CUBIC;
          const isNext2OffCubic = (nextType2 & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.OFF_CURVE_CUBIC;
          
          const nextOnIndex = path.getAbsolutePointIndex(contourIndex, (i + 3) % numPoints);
          const isNextOn = (path.pointTypes[nextOnIndex] & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.ON_CURVE;
          
          if (isNext1OffCubic && isNext2OffCubic && isNextOn) {
            // Cubic segment: ON-OFF-OFF-ON
            const p1 = path.getPoint(pointIndex);
            const p2 = path.getPoint(nextIndex1);
            const p3 = path.getPoint(nextIndex2);
            const p4 = path.getPoint(nextOnIndex);
            
            cubicSegments.push([p1, p2, p3, p4]);
          } else if (isNext1OffCubic && isNextOn) {
            // Check if it's a quadratic segment: ON-OFF-ON
            // For a quadratic, we need to check that the first off-curve is actually a quad type
            // But in our case, we're using cubicCurveTo which creates cubic off-curves
            // Let's check for quad off-curves instead
            const isNext1OffQuad = (nextType1 & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.OFF_CURVE_QUAD;
            if (isNext1OffQuad && isNextOn) {
              const p1 = path.getPoint(pointIndex);
              const p2 = path.getPoint(nextIndex1);
              const p3 = path.getPoint(nextOnIndex);
              
              quadraticSegments.push([p1, p2, p3]);
            }
          } else {
            // Check for quadratic segments with quad off-curves
            const isNext1OffQuad = (nextType1 & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.OFF_CURVE_QUAD;
            const nextNextOnIndex = path.getAbsolutePointIndex(contourIndex, (i + 2) % numPoints);
            const isNextNextOn = (path.pointTypes[nextNextOnIndex] & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.ON_CURVE;
            
            if (isNext1OffQuad && isNextNextOn) {
              const p1 = path.getPoint(pointIndex);
              const p2 = path.getPoint(nextIndex1);
              const p3 = path.getPoint(nextNextOnIndex);
              
              quadraticSegments.push([p1, p2, p3]);
            }
          }
        }
      }
      
      // We should have identified one cubic segment and one quadratic segment
      expect(cubicSegments).to.have.lengthOf(1);
      expect(quadraticSegments).to.have.lengthOf(1);
      
      // Check cubic segment points
      const cubic = cubicSegments[0];
      expect(cubic[0]).to.deep.equal({ x: 0, y: 0 });
      expect(cubic[1]).to.deep.equal({ x: 0, y: 100, type: "cubic" });
      expect(cubic[2]).to.deep.equal({ x: 100, y: 100, type: "cubic" });
      expect(cubic[3]).to.deep.equal({ x: 100, y: 0 });
      
      // Check quadratic segment points
      const quadratic = quadraticSegments[0];
      expect(quadratic[0]).to.deep.equal({ x: 100, y: 0 });
      expect(quadratic[1]).to.deep.equal({ x: 150, y: 50, type: "quad" });
      expect(quadratic[2]).to.deep.equal({ x: 200, y: 0 });
    });
    
    it("should calculate curvature for both cubic and quadratic segments", () => {
      // Test cubic segment
      const cubicPoints = [
        [0, 0],     // Start point
        [0, 100],   // First control point
        [100, 100], // Second control point
        [100, 0]    // End point
      ];
      
      const cubicCurvatures = calculateCurvatureForSegment(
        cubicPoints[0], 
        cubicPoints[1], 
        cubicPoints[2], 
        cubicPoints[3], 
        5
      );
      
      expect(cubicCurvatures).to.have.lengthOf(6); // 0, 0.2, 0.4, 0.6, 0.8, 1.0
      expect(cubicCurvatures[0].t).to.equal(0);
      expect(cubicCurvatures[cubicCurvatures.length - 1].t).to.equal(1);
      
      // Test quadratic segment
      const quadraticPoints = [
        [100, 0],  // Start point
        [150, 50], // Control point
        [200, 0]   // End point
      ];
      
      const quadraticCurvatures = calculateCurvatureForQuadraticSegment(
        quadraticPoints[0], 
        quadraticPoints[1], 
        quadraticPoints[2], 
        5
      );
      
      expect(quadraticCurvatures).to.have.lengthOf(6); // 0, 0.2, 0.4, 0.6, 0.8, 1.0
      expect(quadraticCurvatures[0].t).to.equal(0);
      expect(quadraticCurvatures[quadraticCurvatures.length - 1].t).to.equal(1);
      
      // Both should have non-negative curvature values
      for (const point of cubicCurvatures) {
        expect(point.curvature).to.be.at.least(0);
      }
      
      for (const point of quadraticCurvatures) {
        expect(point.curvature).to.be.at.least(0);
      }
    });
  });
});