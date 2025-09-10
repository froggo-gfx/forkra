import { VarPackedPath } from "./var-path.js";

// Test to understand the correct way to create on-curve points
function testOnCurvePoints() {
  console.log("Testing correct way to create on-curve points...");
  
  // Create a new path
  const path = new VarPackedPath();
  path.moveTo(0, 0);
  
  // Method 1: Create on-curve point without specifying type
  const onCurvePoint1 = { x: 100, y: 0 };
  path.appendPoint(0, onCurvePoint1);
  
  // Method 2: Create on-curve point with explicit undefined type
  const onCurvePoint2 = { x: 200, y: 0, type: undefined };
  path.appendPoint(0, onCurvePoint2);
  
  // Method 3: Create on-curve point with explicit null type
  const onCurvePoint3 = { x: 300, y: 0, type: null };
  path.appendPoint(0, onCurvePoint3);
  
  // Print information about each point
  console.log("Path points:");
  for (let i = 0; i < path.numPoints; i++) {
    const point = path.getPoint(i);
    console.log(`Point ${i}: x=${point.x}, y=${point.y}, type=${point.type}`);
  }
  
  // Verify that all points are on-curve
  console.log("\nVerifying point types:");
  for (let i = 0; i < path.numPoints; i++) {
    const point = path.getPoint(i);
    const isOnCurve = !point.type; // On-curve points have type = undefined
    console.log(`Point ${i} is ${isOnCurve ? 'on-curve' : 'off-curve'} (type: ${point.type})`);
  }
  
  console.log("\nTest completed.");
}

// Run the test
testOnCurvePoints();