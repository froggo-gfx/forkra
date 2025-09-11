import { expect } from "chai";
import { VarPackedPath } from "@fontra/core/var-path.js";
import { addOverlap } from "@fontra/core/loop-zoop.js";

describe("addOverlap function virtual points tests", () => {
  it("should create virtual points when adding overlap to two points", () => {
    // Create a simple path with two contours
    // First contour - a rectangle
    const path = new VarPackedPath();
    path.moveTo(0, 0);
    path.lineTo(100, 0);
    path.lineTo(100, 100);
    path.lineTo(0, 100);
    path.closePath();

    // Second contour - a triangle that intersects with the line between two points of the rectangle
    path.moveTo(20, -50);
    path.lineTo(80, -50);
    path.lineTo(50, 50);
    path.closePath();

    // Select two points from the first contour (rectangle) that form a diagonal
    const selectedPointIndices = [0, 2]; // Points (0,0) and (100,100)

    // Call addOverlap function
    const resultPath = addOverlap(path, selectedPointIndices);

    // Check that the path has the expected number of points
    // Original path had 7 points (4 from rectangle + 3 from triangle)
    // After addOverlap with two points selected, it should have 9 points (7 original + 2 new)
    expect(resultPath.numPoints).to.equal(9);

    // Check that virtual points were calculated and stored in path._virtualPoints
    // The addOverlap function should store virtual points in path._virtualPoints
    expect(resultPath._virtualPoints).to.not.be.undefined;
    expect(Array.isArray(resultPath._virtualPoints)).to.be.true;

    // Verify that virtual points were found
    // In this case, we expect at least one virtual point where the diagonal of the rectangle
    // intersects with the triangle
    expect(resultPath._virtualPoints.length).to.be.greaterThan(0);

    // Verify that virtual points have the expected structure
    for (const virtualPoint of resultPath._virtualPoints) {
      // Each virtual point should have x and y coordinates
      expect(virtualPoint.x).to.be.a('number');
      expect(virtualPoint.y).to.be.a('number');

      // Each virtual point should have suggested handles
      expect(virtualPoint.suggestedHandles).to.not.be.undefined;
      expect(virtualPoint.suggestedHandles.in).to.not.be.undefined;
      expect(virtualPoint.suggestedHandles.out).to.not.be.undefined;
      expect(virtualPoint.suggestedHandles.in.x).to.be.a('number');
      expect(virtualPoint.suggestedHandles.in.y).to.be.a('number');
      expect(virtualPoint.suggestedHandles.out.x).to.be.a('number');
      expect(virtualPoint.suggestedHandles.out.y).to.be.a('number');

      // Each virtual point should have contour and segment information
      expect(virtualPoint.contourIndex).to.be.a('number');
      expect(virtualPoint.segmentIndex).to.be.a('number');
      expect(virtualPoint.t).to.be.a('number');
    }

    // Verify that virtual points are at expected locations
    // At least one virtual point should be near the intersection of the rectangle diagonal
    // and the triangle (around point (50, 50))
    let foundExpectedVirtualPoint = false;
    for (const virtualPoint of resultPath._virtualPoints) {
      // Check if the virtual point is near (50, 50) with some tolerance
      if (Math.abs(virtualPoint.x - 50) < 20 && Math.abs(virtualPoint.y - 50) < 20) {
        foundExpectedVirtualPoint = true;
        break;
      }
    }
    expect(foundExpectedVirtualPoint).to.be.true;
  });

  it("should handle case with no intersections", () => {
    // Create a simple path with two separate contours that don't intersect
    const path = new VarPackedPath();
    // First contour - a rectangle
    path.moveTo(0, 0);
    path.lineTo(100, 0);
    path.lineTo(100, 100);
    path.lineTo(0, 100);
    path.closePath();

    // Second contour - a rectangle far away from the first
    path.moveTo(200, 200);
    path.lineTo(300, 200);
    path.lineTo(300, 300);
    path.lineTo(200, 300);
    path.closePath();

    // Select two points from the first contour
    const selectedPointIndices = [0, 2]; // Points (0,0) and (100,100)

    // Call addOverlap function
    const resultPath = addOverlap(path, selectedPointIndices);

    // Check that the path has the expected number of points
    expect(resultPath.numPoints).to.equal(10); // 8 original + 2 new

    // Check that virtual points were calculated and stored
    expect(resultPath._virtualPoints).to.not.be.undefined;
    expect(Array.isArray(resultPath._virtualPoints)).to.be.true;

    // In this case, there should be no virtual points since the contours don't intersect
    // The line between (0,0) and (100,100) doesn't intersect with the second rectangle
    expect(resultPath._virtualPoints.length).to.equal(0);
  });
});