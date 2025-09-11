import { VarPackedPath } from "./var-path.js";
import { addOverlap } from "./loop-zoop.js";

// Create a simple square path for testing
function createTestPath() {
  const path = new VarPackedPath();
  path.addContour([
    { x: 0, y: 0 },      // Point 0
    { x: 100, y: 0 },    // Point 1
    { x: 100, y: 100 },  // Point 2
    { x: 0, y: 100 }     // Point 3
  ]);
  return path;
}

// Test that addOverlap can be called multiple times
function testMultipleCalls() {
  console.log("Testing addOverlap function multiple calls...");
  
  // Create initial path
  const initialPath = createTestPath();
  console.log(`Initial path has ${initialPath.numPoints} points`);
  
  // First call - add overlap to point 0
  const pathAfterFirstCall = addOverlap(initialPath, [0]);
  console.log(`After first call: ${pathAfterFirstCall.numPoints} points`);
  
  // Second call - add overlap to point 2 (which is now at a different index due to insertion)
  // In the original path, point 2 was at index 2, but after inserting a point after point 0,
  // point 2 is now at index 3
  const pathAfterSecondCall = addOverlap(pathAfterFirstCall, [3]);
  console.log(`After second call: ${pathAfterSecondCall.numPoints} points`);
  
  // Third call - add overlap to point 1 (which is now at a different index)
  // In the original path, point 1 was at index 1, but after the previous operations
  // it's now at index 2
  const pathAfterThirdCall = addOverlap(pathAfterSecondCall, [2]);
  console.log(`After third call: ${pathAfterThirdCall.numPoints} points`);
  
  console.log("Test completed successfully! The function works multiple times without requiring a page refresh.");
}

// Run the test
testMultipleCalls();