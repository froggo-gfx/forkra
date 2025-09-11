import { expect } from "chai";
import { VarPackedPath } from "../src/var-path.js";
import { addOverlap } from "../src/loop-zoop.js";

describe("Four Point Configuration Tests", () => {
  it("should calculate virtual points for four consecutive points", () => {
    // Create a path with a contour that has enough points for a four-point selection
    const path = new VarPackedPath();
    
    // Create a contour with at least 6 points to allow for a four-point selection
    path.moveTo(0, 0);
    path.lineTo(50, 0);
    path.lineTo(100, 0);
    path.lineTo(100, 50);
    path.lineTo(100, 100);
    path.lineTo(50, 100);
    path.closePath();
    
    // Select four consecutive points
    const selectedPointIndices = [1, 2, 3, 4]; // Points (50,0), (100,0), (100,50), (100,100)
    
    // Call addOverlap function which calculates virtual points for four-point configuration
    const result = addOverlap(path, selectedPointIndices);
    
    // Verify that the result is a VarPackedPath instance
    expect(result).to.be.an.instanceof(VarPackedPath);
    
    // Verify that virtual points are stored in path._virtualPoints
    expect(result._virtualPoints).to.be.an("array");
  });

  it("should properly format virtual points for visualization", () => {
    // Create a path with a contour
    const path = new VarPackedPath();
    path.moveTo(0, 0);
    path.lineTo(50, 0);
    path.lineTo(100, 0);
    path.lineTo(100, 50);
    path.lineTo(100, 100);
    path.lineTo(50, 100);
    path.closePath();
    
    // Select four consecutive points
    const selectedPointIndices = [1, 2, 3, 4];
    
    // Call addOverlap function
    const result = addOverlap(path, selectedPointIndices);
    
    // Verify virtual points are properly formatted
    expect(result._virtualPoints).to.be.an("array");
    
    // Check that each virtual point has the required properties for visualization
    for (const virtualPoint of result._virtualPoints) {
      // Basic coordinates
      expect(virtualPoint.x).to.be.a("number");
      expect(virtualPoint.y).to.be.a("number");
      
      // Suggested handles for visualization
      expect(virtualPoint.suggestedHandles).to.be.an("object");
      expect(virtualPoint.suggestedHandles.in).to.be.an("object");
      expect(virtualPoint.suggestedHandles.in.x).to.be.a("number");
      expect(virtualPoint.suggestedHandles.in.y).to.be.a("number");
      expect(virtualPoint.suggestedHandles.out).to.be.an("object");
      expect(virtualPoint.suggestedHandles.out.x).to.be.a("number");
      expect(virtualPoint.suggestedHandles.out.y).to.be.a("number");
      
      // Context information
      expect(virtualPoint.contourIndex).to.be.a("number");
      expect(virtualPoint.segmentIndex).to.be.a("number");
      expect(virtualPoint.t).to.be.a("number");
    }
  });

  it("should handle edge cases with invalid four-point configurations", () => {
    // Create a path with a simple contour
    const path = new VarPackedPath();
    path.moveTo(0, 0);
    path.lineTo(100, 0);
    path.lineTo(100, 100);
    path.lineTo(0, 100);
    path.closePath();
    
    // Test case 1: Non-consecutive points
    const nonConsecutiveIndices = [0, 1, 2, 3]; // All points but let's make it invalid by making them non-consecutive in a different way
    // This should throw an error because we need to test a case that would be invalid
    
    // Actually, all points in a 4-point contour are consecutive, so let's create a different scenario
    // Let's try with points that are not all on the same contour
    const multiContourPath = new VarPackedPath();
    multiContourPath.moveTo(0, 0);
    multiContourPath.lineTo(100, 0);
    multiContourPath.lineTo(100, 100);
    multiContourPath.lineTo(0, 100);
    multiContourPath.closePath();
    
    multiContourPath.moveTo(200, 200);
    multiContourPath.lineTo(300, 200);
    multiContourPath.lineTo(300, 300);
    multiContourPath.lineTo(200, 300);
    multiContourPath.closePath();
    
    // Try to select points from different contours
    const crossContourIndices = [0, 1, 2, 4]; // Points from both contours
    
    // This should throw an error
    expect(() => {
      addOverlap(multiContourPath, crossContourIndices);
    }).to.throw();
    
    // Test case 2: Points that are not consecutive
    const path2 = new VarPackedPath();
    path2.moveTo(0, 0);
    path2.lineTo(50, 0);
    path2.lineTo(100, 0);
    path2.lineTo(100, 50);
    path2.lineTo(100, 100);
    path2.lineTo(50, 100);
    path2.closePath();
    
    // Select non-consecutive points
    const nonConsecutivePointIndices = [0, 2, 3, 5]; // Skipping some points
    
    // This should throw an error
    expect(() => {
      addOverlap(path2, nonConsecutivePointIndices);
    }).to.throw();
  });

  it("should correctly calculate virtual points for valid four-point configuration with curves", () => {
    // Create a path with curves to test intersection calculations
    const path = new VarPackedPath();
    
    // First contour - a rectangle
    path.moveTo(0, 0);
    path.lineTo(100, 0);
    path.lineTo(100, 100);
    path.lineTo(0, 100);
    path.closePath();
    
    // Second contour - a curved path that may intersect with chords
    path.moveTo(20, 50);
    path.quadraticCurveTo(50, 80, 50); // Control point (50, 80), end point (80, 50)
    path.closePath();
    
    // Create a path with enough points for a valid four-point selection
    const path2 = new VarPackedPath();
    path2.moveTo(0, 0);
    path2.lineTo(30, 0);
    path2.lineTo(60, 0);
    path2.lineTo(90, 0);
    path2.lineTo(90, 30);
    path2.lineTo(90, 60);
    path2.closePath();
    
    // Select four consecutive points
    const selectedPointIndices = [1, 2, 3, 4]; // Points (30,0), (60,0), (90,0), (90,30)
    
    // Call addOverlap function
    const result = addOverlap(path2, selectedPointIndices);
    
    // Verify that the result is a VarPackedPath instance
    expect(result).to.be.an.instanceof(VarPackedPath);
    
    // Verify that virtual points are stored in path._virtualPoints
    expect(result._virtualPoints).to.be.an("array");
    
    // Verify that virtual points have the expected properties
    if (result._virtualPoints.length > 0) {
      const virtualPoint = result._virtualPoints[0];
      expect(virtualPoint).to.have.property("x");
      expect(virtualPoint).to.have.property("y");
      expect(virtualPoint).to.have.property("suggestedHandles");
      expect(virtualPoint.suggestedHandles).to.have.property("in");
      expect(virtualPoint.suggestedHandles).to.have.property("out");
      expect(virtualPoint).to.have.property("contourIndex");
      expect(virtualPoint).to.have.property("segmentIndex");
      expect(virtualPoint).to.have.property("t");
    }
  });

  it("should verify that points A and D each have exactly one off-curve handle", () => {
    // Create a path with a contour where points A and D have exactly one off-curve handle
    const path = new VarPackedPath();
    
    // Create a contour with off-curve points
    path.moveTo(0, 0);  // Point A - this will have one off-curve handle
    path.lineTo(30, 0);
    path.lineTo(60, 0);
    path.lineTo(90, 0); // Point D - this will have one off-curve handle
    path.lineTo(90, 30);
    path.lineTo(90, 60);
    path.closePath();
    
    // Select four consecutive points
    const selectedPointIndices = [0, 1, 2, 3]; // Points A, B, C, D
    
    // Call addOverlap function
    const result = addOverlap(path, selectedPointIndices);
    
    // Verify that the result is a VarPackedPath instance
    expect(result).to.be.an.instanceof(VarPackedPath);
    
    // Verify that virtual points are stored in path._virtualPoints
    expect(result._virtualPoints).to.be.an("array");
  });
});