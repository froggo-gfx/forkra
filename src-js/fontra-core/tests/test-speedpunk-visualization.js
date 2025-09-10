import { expect } from "chai";
import { VarPackedPath } from "@fontra/core/var-path.js";
import {
  calculateCurvatureForSegment,
  calculateCurvatureForQuadraticSegment,
  findCurvatureRange,
  curvatureToColor
} from "@fontra/core/curvature.js";

describe("SpeedPunk Visualization Tests", () => {
  describe("Curvature Visualization with Cubic and Quadratic Curves", () => {
    let path;
    
    beforeEach(() => {
      // Create a path with both cubic and quadratic segments
      path = new VarPackedPath();
      
      // Add a cubic segment: ON-OFF-OFF-ON
      path.moveTo(0, 0); // Start point
      path.cubicCurveTo(0, 100, 100, 100, 100, 0); // Control points and end point
      
      // Add a quadratic segment: ON-OFF-ON
      path.quadraticCurveTo(150, 50, 200, 0); // Control point and end point
    });
    
    it("should correctly identify cubic and quadratic segments", () => {
      // Simulate the logic from visualization-layer-definitions.js to identify segments
      const cubicSegments = [];
      const quadraticSegments = [];
      const allCurvatureData = [];
      
      // Process all contours
      for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
        const contour = path.getContour(contourIndex);
        const startPoint = path.getAbsolutePointIndex(contourIndex, 0);
        const numPoints = contour.pointTypes.length;
        
        for (let i = 0; i < numPoints; i++) {
          const pointIndex = startPoint + i;
          const pointType = path.pointTypes[pointIndex];
          
          // Check if this is an on-curve point
          if ((pointType & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.ON_CURVE) {
            // Look ahead to identify segment type
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
            } else {
              // Check for quadratic segments
              const isNext1OffQuad = (nextType1 & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.OFF_CURVE_QUAD;
              const nextNextOnIndex = path.getAbsolutePointIndex(contourIndex, (i + 2) % numPoints);
              const isNextNextOn = (path.pointTypes[nextNextOnIndex] & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.ON_CURVE;
              
              if (isNext1OffQuad && isNextNextOn) {
                // Quadratic segment: ON-OFF-ON
                const p1 = path.getPoint(pointIndex);
                const p2 = path.getPoint(nextIndex1);
                const p3 = path.getPoint(nextNextOnIndex);
                
                quadraticSegments.push([p1, p2, p3]);
              }
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
      // Simulate the curvature calculation process from the visualization layer
      const cubicSegments = [];
      const quadraticSegments = [];
      const allCurvatureData = [];
      const stepsPerSegment = 20;
      
      // Process all contours to identify segments and calculate curvature
      for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
        const contour = path.getContour(contourIndex);
        const startPoint = path.getAbsolutePointIndex(contourIndex, 0);
        const numPoints = contour.pointTypes.length;
        
        for (let i = 0; i < numPoints; i++) {
          const pointIndex = startPoint + i;
          const pointType = path.pointTypes[pointIndex];
          
          // Check if this is an on-curve point
          if ((pointType & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.ON_CURVE) {
            // Look ahead to identify segment type
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
              const segmentCurvatureData = calculateCurvatureForSegment(
                [p1.x, p1.y],
                [p2.x, p2.y],
                [p3.x, p3.y],
                [p4.x, p4.y],
                stepsPerSegment
              );
              allCurvatureData.push(segmentCurvatureData);
            } else {
              // Check for quadratic segments
              const isNext1OffQuad = (nextType1 & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.OFF_CURVE_QUAD;
              const nextNextOnIndex = path.getAbsolutePointIndex(contourIndex, (i + 2) % numPoints);
              const isNextNextOn = (path.pointTypes[nextNextOnIndex] & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.ON_CURVE;
              
              if (isNext1OffQuad && isNextNextOn) {
                // Quadratic segment: ON-OFF-ON
                const p1 = path.getPoint(pointIndex);
                const p2 = path.getPoint(nextIndex1);
                const p3 = path.getPoint(nextNextOnIndex);
                
                quadraticSegments.push([p1, p2, p3]);
                const segmentCurvatureData = calculateCurvatureForQuadraticSegment(
                  [p1.x, p1.y],
                  [p2.x, p2.y],
                  [p3.x, p3.y],
                  stepsPerSegment
                );
                allCurvatureData.push(segmentCurvatureData);
              }
            }
          }
        }
      }
      
      // Validate that we have curvature data for both segments
      expect(allCurvatureData).to.have.lengthOf(2);
      expect(allCurvatureData[0]).to.have.lengthOf(stepsPerSegment + 1); // 0 to 1.0 in steps
      expect(allCurvatureData[1]).to.have.lengthOf(stepsPerSegment + 1); // 0 to 1.0 in steps
      
      // Check that all curvature values are non-negative
      for (const segmentData of allCurvatureData) {
        for (const pointData of segmentData) {
          expect(pointData.curvature).to.be.at.least(0);
          expect(pointData.t).to.be.at.least(0);
          expect(pointData.t).to.be.at.most(1);
        }
      }
    });
    
    it("should find correct curvature range", () => {
      // Calculate curvature data for both segments
      const cubicCurvatureData = calculateCurvatureForSegment(
        [0, 0], [0, 100], [100, 100], [100, 0], 20
      );
      
      const quadraticCurvatureData = calculateCurvatureForQuadraticSegment(
        [100, 0], [150, 50], [200, 0], 20
      );
      
      const allCurvatureData = [cubicCurvatureData, quadraticCurvatureData];
      
      // Find the curvature range
      const { min, max } = findCurvatureRange(allCurvatureData);
      
      // Both min and max should be valid numbers
      expect(min).to.be.a('number');
      expect(max).to.be.a('number');
      expect(min).to.be.at.least(0); // Curvature should be non-negative
      expect(max).to.be.at.least(min); // Max should be >= min
    });
    
    it("should map curvature values to colors correctly", () => {
      // Test color mapping with sample values
      const minCurvature = 0;
      const maxCurvature = 10;
      const colorStops = ["#8b939c", "#f29400", "#e3004f"]; // Speed Punk colors
      
      // Test minimum curvature (should map to first color)
      let color = curvatureToColor(0, minCurvature, maxCurvature, colorStops);
      expect(color).to.equal("rgba(139, 147, 156, 1)"); // #8b939c
      
      // Test maximum curvature (should map to last color)
      color = curvatureToColor(10, minCurvature, maxCurvature, colorStops);
      expect(color).to.equal("rgba(227, 0, 79, 1)"); // #e3004f
      
      // Test middle curvature (should map to intermediate color)
      color = curvatureToColor(5, minCurvature, maxCurvature, colorStops);
      // This should be between #f29400 and #e3004f
      expect(color).to.contain("rgba(");
    });
  });
});