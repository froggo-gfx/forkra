import { VarPackedPath } from "./var-path.js";
import { addOverlap } from "./loop-zoop.js";

// Test script to verify single point selection workflow still works

console.log("Testing addOverlap function with single point selection...");

// Create a simple path with a single contour
const path = new VarPackedPath();
path.moveTo(0, 0);
path.lineTo(100, 0);
path.lineTo(100, 100);
path.lineTo(0, 100);
path.closePath();

console.log("Original path points:");
for (let i = 0; i < path.numPoints; i++) {
  const point = path.getPoint(i);
  console.log(`  Point ${i}: (${point.x}, ${point.y}) type: ${point.type || 'on-curve'}`);
}

// Select the second point (100, 0) to add overlap to
const selectedPointIndices = [1];

// Call addOverlap function
const newPath = addOverlap(path, selectedPointIndices);

console.log("\nAfter addOverlap:");
console.log(`Number of points: ${newPath.numPoints}`);

for (let i = 0; i < newPath.numPoints; i++) {
  const point = newPath.getPoint(i);
  console.log(`  Point ${i}: (${point.x}, ${point.y}) type: ${point.type || 'on-curve'}`);
}

// Verify that both the original and inserted points are on-curve
const originalPoint = newPath.getPoint(1);
const insertedPoint = newPath.getPoint(2);

console.log("\nVerification:");
console.log(`Original point (index 1) type: ${originalPoint.type || 'on-curve'} - ${originalPoint.type ? 'FAIL' : 'PASS'}`);
console.log(`Inserted point (index 2) type: ${insertedPoint.type || 'on-curve'} - ${insertedPoint.type ? 'FAIL' : 'PASS'}`);

if (!originalPoint.type && !insertedPoint.type) {
  console.log("\n✅ SUCCESS: Both points are correctly created as on-curve points!");
} else {
  console.log("\n❌ FAILURE: Points are not correctly created as on-curve points!");
}