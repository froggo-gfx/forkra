import { VarPackedPath } from "./var-path.js";
import { addOverlap } from "./loop-zoop.js";

// Test script to verify two point selection workflow

console.log("Testing addOverlap function with two point selection...");

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

// Select two points to add overlap to (first and third points)
const selectedPointIndices = [0, 2]; // Points (0,0) and (100,100)

console.log(`\nSelected points: ${selectedPointIndices}`);

// Call addOverlap function
const newPath = addOverlap(path, selectedPointIndices);

console.log("\nAfter addOverlap with two points:");
console.log(`Number of points: ${newPath.numPoints}`);

for (let i = 0; i < newPath.numPoints; i++) {
  const point = newPath.getPoint(i);
  console.log(`  Point ${i}: (${point.x}, ${point.y}) type: ${point.type || 'on-curve'}`);
}

// Verify that all points are on-curve
let allOnCurve = true;
for (let i = 0; i < newPath.numPoints; i++) {
  const point = newPath.getPoint(i);
  if (point.type) {
    allOnCurve = false;
    break;
  }
}

console.log("\nVerification:");
console.log(`All points are on-curve: ${allOnCurve ? 'PASS' : 'FAIL'}`);

if (allOnCurve) {
  console.log("\n✅ SUCCESS: All points are correctly created as on-curve points!");
} else {
  console.log("\n❌ FAILURE: Some points are not on-curve points!");
}