import { VarPackedPath } from "./var-path.js";
import { addOverlap } from "./loop-zoop.js";

// Test script to verify virtual points calculation for two point selection

console.log("Testing virtual points calculation for two point selection...");

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

console.log("Original path with two contours:");
for (let i = 0; i < path.numContours; i++) {
  console.log(`  Contour ${i}:`);
  const numPoints = path.getNumPointsOfContour(i);
  const startPoint = path.getAbsolutePointIndex(i, 0);
  for (let j = 0; j < numPoints; j++) {
    const point = path.getPoint(startPoint + j);
    console.log(`    Point ${j}: (${point.x}, ${point.y}) type: ${point.type || 'on-curve'}`);
  }
}

// Select two points from the first contour (rectangle)
const selectedPointIndices = [0, 2]; // Points (0,0) and (100,100)

console.log(`\nSelected points: ${selectedPointIndices}`);

// Call addOverlap function which now calculates virtual points
const result = addOverlap(path, selectedPointIndices);

console.log("\nAfter addOverlap with two points:");
if (result.path) {
  // New format with virtual points
  console.log(`Number of points in path: ${result.path.numPoints}`);
  console.log(`Number of virtual points: ${result.virtualPoints.length}`);
  
  if (result.virtualPoints.length > 0) {
    console.log("\nVirtual points:");
    result.virtualPoints.forEach((vp, index) => {
      console.log(`  ${index}: (${vp.x}, ${vp.y})`);
      console.log(`    Suggested handles: in(${vp.suggestedHandles.in.x}, ${vp.suggestedHandles.in.y}) out(${vp.suggestedHandles.out.x}, ${vp.suggestedHandles.out.y})`);
      console.log(`    Contour: ${vp.contourIndex}, Segment: ${vp.segmentIndex}, t: ${vp.t}`);
    });
  } else {
    console.log("\nNo virtual points found.");
  }
} else {
  // Old format, just a path
  console.log(`Number of points: ${result.numPoints}`);
}

// Since we're only returning the path for compatibility, we can't directly access the virtual points
// In a real implementation, we would modify the function to return both the path and virtual points
// or store the virtual points in a separate structure

console.log("\nTest completed.");