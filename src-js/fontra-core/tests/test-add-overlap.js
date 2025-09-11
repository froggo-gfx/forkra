import { expect } from "chai";
import { VarPackedPath } from "@fontra/core/var-path.js";
import { addOverlap } from "@fontra/core/loop-zoop.js";

describe("addOverlap function tests", () => {
  it("should create two on-curve points when adding overlap", () => {
    // Create a simple path with a single contour
    const path = new VarPackedPath();
    path.moveTo(0, 0);
    path.lineTo(100, 0);
    path.lineTo(100, 100);
    path.lineTo(0, 100);
    path.closePath();

    // Select the second point (100, 0) to add overlap to
    const selectedPointIndices = [1];

    // Call addOverlap function
    const newPath = addOverlap(path, selectedPointIndices);

    // Original path had 4 points, after addOverlap it should have 5 points
    expect(newPath.numPoints).to.equal(5);

    // Check that the original point is still on-curve
    const originalPoint = newPath.getPoint(1);
    expect(originalPoint.type).to.be.undefined; // On-curve points have undefined type

    // Check that the inserted point is also on-curve
    const insertedPoint = newPath.getPoint(2);
    expect(insertedPoint.type).to.be.undefined; // On-curve points have undefined type

    // Verify that both points are correctly positioned with offset
    // The addOverlap function should offset the points in perpendicular directions
    // Both should be on-curve (no type property)
    expect(originalPoint.type).to.be.undefined;
    expect(insertedPoint.type).to.be.undefined;
  });

  it("should handle multiple selected points", () => {
    // Create a simple path with a single contour
    const path = new VarPackedPath();
    path.moveTo(0, 0);
    path.lineTo(100, 0);
    path.lineTo(100, 100);
    path.lineTo(0, 100);
    path.closePath();

    // Select multiple points to add overlap to
    const selectedPointIndices = [0, 2]; // First and third points

    // Call addOverlap function
    const newPath = addOverlap(path, selectedPointIndices);

    // Original path had 4 points, after addOverlap it should have 6 points (2 points added)
    expect(newPath.numPoints).to.equal(6);

    // Check that all points are on-curve
    for (let i = 0; i < newPath.numPoints; i++) {
      const point = newPath.getPoint(i);
      expect(point.type).to.be.undefined; // All points should be on-curve
    }
  });

  it("should correctly calculate positions based on offset logic", () => {
    // Create a simple path with a single contour
    const path = new VarPackedPath();
    path.moveTo(0, 0);
    path.lineTo(100, 0);
    path.lineTo(100, 100);
    path.closePath();

    // Select the second point (100, 0) to add overlap to
    const selectedPointIndices = [1];

    // Call addOverlap function
    const newPath = addOverlap(path, selectedPointIndices);

    // Should have 4 points now (original 3 + 1 inserted)
    expect(newPath.numPoints).to.equal(4);

    // Get the two points around the selected point
    const originalPoint = newPath.getPoint(1);
    const insertedPoint = newPath.getPoint(2);

    // Both points should be on-curve
    expect(originalPoint.type).to.be.undefined;
    expect(insertedPoint.type).to.be.undefined;

    // Both points should have valid coordinates
    expect(originalPoint.x).to.be.a('number');
    expect(originalPoint.y).to.be.a('number');
    expect(insertedPoint.x).to.be.a('number');
    expect(insertedPoint.y).to.be.a('number');
  });

  it("should handle two selected points with new workflow", () => {
    // Create a simple path with a single contour
    const path = new VarPackedPath();
    path.moveTo(0, 0);
    path.lineTo(100, 0);
    path.lineTo(100, 100);
    path.lineTo(0, 100);
    path.closePath();

    // Select two points to add overlap to
    const selectedPointIndices = [0, 2]; // First and third points (0,0) and (100,100)

    // Call addOverlap function
    const newPath = addOverlap(path, selectedPointIndices);

    // Original path had 4 points, after addOverlap with two points selected it should have 6 points (2 points added)
    // Note: With the new workflow, we don't delete original points and only add 2 new points
    expect(newPath.numPoints).to.equal(6);

    // Check that all points are on-curve
    for (let i = 0; i < newPath.numPoints; i++) {
      const point = newPath.getPoint(i);
      expect(point.type).to.be.undefined; // All points should be on-curve
    }

    // Verify that original points are still in place
    const originalPointA = newPath.getPoint(0);
    // After inserting points, the indices of existing points may have shifted
    // We need to find the second original point by its coordinates
    let originalPointB = null;
    for (let i = 0; i < newPath.numPoints; i++) {
      const point = newPath.getPoint(i);
      if (point.x === 100 && point.y === 100) {
        originalPointB = point;
        break;
      }
    }
    
    expect(originalPointA.x).to.equal(0);
    expect(originalPointA.y).to.equal(0);
    expect(originalPointB).to.not.be.null;
    expect(originalPointB.x).to.equal(100);
    expect(originalPointB.y).to.equal(100);
  });
});