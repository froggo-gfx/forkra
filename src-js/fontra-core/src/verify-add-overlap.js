import { VarPackedPath } from "./var-path.js";
import { addOverlap } from "./loop-zoop.js";

// Test script to verify the addOverlap function works correctly

console.log("Testing addOverlap function...");

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

// Test 1: Single point selection (existing workflow)
console.log("\n=== Test 1: Single point selection ===");
const selectedPointIndices1 = [1]; // Second point (100, 0)
const newPath1 = addOverlap(path, selectedPointIndices1);

console.log("After addOverlap with single point:");
console.log(`Number of points: ${newPath1.numPoints}`);

for (let i = 0; i < newPath1.numPoints; i++) {
  const point = newPath1.getPoint(i);
 console.log(`  Point ${i}: (${point.x}, ${point.y}) type: ${point.type || 'on-curve'}`);
}

// Test 2: Two point selection (new workflow)
console.log("\n=== Test 2: Two point selection ===");
const selectedPointIndices2 = [0, 2]; // First and third points (0,0) and (100,100)
const newPath2 = addOverlap(path, selectedPointIndices2);

console.log("After addOverlap with two points:");
console.log(`Number of points: ${newPath2.numPoints}`);

for (let i = 0; i < newPath2.numPoints; i++) {
  const point = newPath2.getPoint(i);
  console.log(`  Point ${i}: (${point.x}, ${point.y}) type: ${point.type || 'on-curve'}`);
}

// Verify that all points are on-curve
let allOnCurve = true;
for (let i = 0; i < newPath2.numPoints; i++) {
  const point = newPath2.getPoint(i);
  if (point.type) {
    allOnCurve = false;
    break;
  }
}

console.log("\nVerification:");
console.log(`All points are on-curve: ${allOnCurve ? 'PASS' : 'FAIL'}`);

// Find the original points by their coordinates
let originalPointA = null;
let originalPointB = null;
for (let i = 0; i < newPath2.numPoints; i++) {
  const point = newPath2.getPoint(i);
  if (point.x === 0 && point.y === 0) {
    originalPointA = point;
  }
  if (point.x === 100 && point.y === 100) {
    originalPointB = point;
  }
}

console.log(`Original point A (0,0) found: ${originalPointA ? 'PASS' : 'FAIL'}`);
console.log(`Original point B (100,100) found: ${originalPointB ? 'PASS' : 'FAIL'}`);

if (allOnCurve && originalPointA && originalPointB) {
  console.log("\n✅ SUCCESS: All tests passed!");
} else {
  console.log("\n❌ FAILURE: Some tests failed!");
}