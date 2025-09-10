import { VarPackedPath } from "./var-path.js";

// Test to understand how point types work in VarPackedPath
function testPointTypes() {
  console.log("Testing VarPackedPath point types...");
  
  // Create a new path
  const path = new VarPackedPath();
  
  // Start a new contour
  path.moveTo(100, 100);
  
  // Add an on-curve point (no type specified)
  path.lineTo(200, 100);
  
  // Add a quadratic off-curve point
  path.quadraticCurveTo(250, 150, 300, 100);
  
  // Add a cubic off-curve point
  path.cubicCurveTo(350, 50, 400, 150, 450, 100);
  
  // Close the path
  path.closePath();
  
  // Print information about each point
  console.log("Points in path:");
  for (let i = 0; i < path.numPoints; i++) {
    const point = path.getPoint(i);
    console.log(`Point ${i}: x=${point.x}, y=${point.y}, type=${point.type}, smooth=${point.smooth}`);
  }
  
  // Test creating points with explicit types
  console.log("\nTesting explicit point type creation:");
  
  // Create a new path for testing explicit point types
  const testPath = new VarPackedPath();
  testPath.moveTo(0, 0);
  
  // Add an on-curve point explicitly (type = undefined)
  const onCurvePoint = { x: 100, y: 0, type: undefined };
  testPath.appendPoint(0, onCurvePoint);
  
  // Add a quadratic off-curve point
  const quadPoint = { x: 150, y: 50, type: "quad" };
  testPath.appendPoint(0, quadPoint);
  
  // Add a cubic off-curve point
  const cubicPoint = { x: 200, y: 0, type: "cubic" };
  testPath.appendPoint(0, cubicPoint);
  
  // Try to add a point with "line" type (this should be treated as on-curve)
  const linePoint = { x: 300, y: 0, type: "line" };
  testPath.appendPoint(0, linePoint);
  
  // Print information about each point in the test path
  console.log("Test path points:");
  for (let i = 0; i < testPath.numPoints; i++) {
    const point = testPath.getPoint(i);
    console.log(`Point ${i}: x=${point.x}, y=${point.y}, type=${point.type}, smooth=${point.smooth}`);
  }
  
  console.log("\nTest completed.");
}

// Run the test
testPointTypes();