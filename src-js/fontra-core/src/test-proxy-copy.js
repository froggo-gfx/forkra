import { VarPackedPath } from "./var-path.js";
import VarArray from "./var-array.js";

// Create a test path
function createTestPath() {
  const path = new VarPackedPath();
  
  // Manually create the path data to avoid using methods that might not be relevant to our test
  const coordinates = new VarArray(4);
  coordinates[0] = 0;
  coordinates[1] = 0;
  coordinates[2] = 100;
  coordinates[3] = 0;
  
  const pointTypes = [0, 0, 0, 0]; // All on-curve points
  const contourInfo = [{ endPoint: 3, isClosed: true }];
  
  // Use the constructor directly to create our test path
  const testPath = new VarPackedPath(coordinates, pointTypes, contourInfo);
  return testPath;
}

// Create a proxy that simulates the issue where copy method is not forwarded properly
function createProblematicProxy(path) {
  return new Proxy(path, {
    get(target, prop, receiver) {
      if (prop === 'coordinates') {
        // Return a proxy of coordinates that doesn't properly forward the copy method
        const coords = target.coordinates;
        return new Proxy(coords, {
          get(target, prop, receiver) {
            // Simulate the issue: don't forward the copy method
            if (prop === 'copy') {
              // Return undefined or non-function to simulate the problem
              return undefined;
            }
            return Reflect.get(target, prop, receiver);
          }
        });
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

// Test the fix
function testProxyCopy() {
  console.log("Testing VarPackedPath.copy() with Proxy objects...");
  
  try {
    // Create a normal path
    const normalPath = createTestPath();
    console.log(`Normal path has ${normalPath.numPoints} points`);
    
    // Copy the normal path
    const normalCopy = normalPath.copy();
    console.log(`Normal copy has ${normalCopy.numPoints} points`);
    console.log("Normal copy successful!");
    
    // Create a proxied path that simulates the issue
    const proxiedPath = createProblematicProxy(normalPath);
    console.log(`Proxied path has ${proxiedPath.numPoints} points`);
    
    // Try to copy the proxied path - this would fail before our fix
    const proxiedCopy = proxiedPath.copy();
    console.log(`Proxied copy has ${proxiedCopy.numPoints} points`);
    console.log("Proxied copy successful! The fix works.");
    
    return true;
  } catch (error) {
    console.error("Test failed with error:", error);
    return false;
  }
}

// Run the test
testProxyCopy();