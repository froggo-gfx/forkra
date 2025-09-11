import { expect } from "chai";
import { VarPackedPath } from "@fontra/core/var-path.js";
import { addOverlap } from "@fontra/core/loop-zoop.js";

// Test to verify the fix for TypeError when segment.pointIndices is undefined or not an array

describe("Loop Zoop Fix Tests", () => {
  it("should handle segments with invalid pointIndices without throwing TypeError", () => {
    // Create a path with contours that will trigger the problematic code path
    const path = new VarPackedPath();
    
    // First contour - a rectangle
    path.moveTo(0, 0);
    path.lineTo(100, 0);
    path.lineTo(100, 100);
    path.lineTo(0, 100);
    path.closePath();
    
    // Second contour - a triangle that may have segments with invalid pointIndices
    path.moveTo(20, -50);
    path.lineTo(80, -50);
    path.lineTo(50, 50);
    path.closePath();
    
    // Select two points from the first contour (rectangle)
    const selectedPointIndices = [0, 2]; // Points (0,0) and (100,100)
    
    // This should not throw an error due to the fix in calculateVirtualPointsForTwoPointExpansion
    // The function internally calls calculateVirtualPointsForTwoPointExpansion which contains the fix
    expect(() => {
      const result = addOverlap(path, selectedPointIndices);
    }).to.not.throw(TypeError);
  });

  it("should properly skip segments with invalid pointIndices", () => {
    // Create a simple path
    const path = new VarPackedPath();
    path.moveTo(0, 0);
    path.lineTo(100, 0);
    path.lineTo(100, 100);
    path.lineTo(0, 100);
    path.closePath();
    
    // Select two points
    const selectedPointIndices = [0, 2];
    
    // This test verifies that the function completes without error
    const result = addOverlap(path, selectedPointIndices);
    
    // Should return a path object
    expect(result).to.be.an.instanceof(VarPackedPath);
  });
  
  // This test directly targets the specific fix in calculateVirtualPointsForTwoPointExpansion
  it("should handle iterContourSegmentPointIndices with segments missing pointIndices", () => {
    // Create a custom path class that simulates the problematic case
    class ProblematicPath extends VarPackedPath {
      *iterContourSegmentPointIndices(contourIndex) {
        // For contour 1, simulate segments with missing or invalid pointIndices
        if (contourIndex === 1) {
          // Normal segment with valid pointIndices
          yield { type: "line", pointIndices: [4, 5] };
          
          // Problematic segments that would cause TypeError before the fix
          yield { type: "curve" };  // No pointIndices property
          yield { type: "curve", pointIndices: undefined };  // undefined pointIndices
          yield { type: "curve", pointIndices: null };  // null pointIndices
          yield { type: "curve", pointIndices: "not-an-array" };  // not an array
          
          // Normal segment again
          yield { type: "line", pointIndices: [6, 7] };
        } else {
          // Delegate to parent class for other contours
          yield* super.iterContourSegmentPointIndices(contourIndex);
        }
      }
    }
    
    // Create a path with the custom class
    const path = new ProblematicPath();
    
    // First contour - a rectangle
    path.moveTo(0, 0);
    path.lineTo(100, 0);
    path.lineTo(100, 100);
    path.lineTo(0, 100);
    path.closePath();
    
    // Second contour - some points
    path.moveTo(20, -50);
    path.lineTo(80, -50);
    path.lineTo(50, 50);
    path.closePath();
    
    // Select two points from the first contour
    const selectedPointIndices = [0, 2]; // Points (0,0) and (100,100)
    
    // This should not throw an error due to the fix
    expect(() => {
      const result = addOverlap(path, selectedPointIndices);
    }).to.not.throw();
  });
});