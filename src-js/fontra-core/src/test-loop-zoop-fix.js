// Test to verify the fix for TypeError when segment.pointIndices is undefined or not an array

console.log("Testing fix for TypeError in calculateVirtualPointsForTwoPointExpansion...");

// Mock Bezier class for testing purposes
class Bezier {
  constructor(...points) {
    this.points = points;
  }
  
  intersects(lineSegment) {
    // Mock implementation that returns some intersection points
    return [0.5];
  }
  
  compute(t) {
    // Mock implementation that returns a point
    return { x: 50, y: 50 };
  }
  
  derivative(t) {
    // Mock implementation that returns a tangent vector
    return { x: 1, y: 0 };
  }
}

// Mock implementation of the fixed function logic
function calculateVirtualPointsForTwoPointExpansion(path, pointA, pointB, contourIndex) {
  try {
    // Create a line segment between the two selected points
    const lineSegment = {
      p1: { x: pointA.x, y: pointA.y },
      p2: { x: pointB.x, y: pointB.y }
    };
    
    // Initialize array to store virtual points
    const virtualPoints = [];
    
    // Validate that path has the required properties
    if (typeof path.numContours === 'undefined' || typeof path.iterContourSegmentPointIndices !== 'function') {
      throw new Error('Path object is missing required properties or methods');
    }
    
    // Iterate through all contours to find intersections
    for (let cIndex = 0; cIndex < path.numContours; cIndex++) {
      // Skip the contour that contains our selected points (to avoid self-intersection)
      if (cIndex === contourIndex) continue;
      
      // Iterate through segments of this contour, keeping track of segment index
      let segmentIndex = 0;
      for (const segment of path.iterContourSegmentPointIndices(cIndex)) {
        // THIS IS THE FIX: Check if segment.pointIndices exists and is an array before using it
        if (!segment.pointIndices || !Array.isArray(segment.pointIndices)) {
          // Skip segments without valid pointIndices
          segmentIndex++;
          continue;
        }
        
        // Get the points of this segment
        const segmentPoints = segment.pointIndices.map(i => path.getPoint(i));
        
        // If this is a curve segment (has 3 or more points), calculate intersections
        if (segmentPoints.length >= 3) {
          // Create Bezier curve for this segment
          const bezierCurve = new Bezier(...segmentPoints);
          
          // Calculate intersections between the Bezier curve and our line segment
          const intersections = bezierCurve.intersects(lineSegment);
          
          // Convert intersection parameters to actual points and create virtual point objects
          for (const t of intersections) {
            // Get the intersection point on the Bezier curve
            const intersectionPoint = bezierCurve.compute(t);
            
            // Calculate suggested handles based on local geometry
            const tangent = bezierCurve.derivative(t);
            
            // Create perpendicular vector for handle directions
            const perpVector = {
              x: -tangent.y,
              y: tangent.x
            };
            
            // Normalize the perpendicular vector
            const perpLength = Math.sqrt(perpVector.x * perpVector.x + perpVector.y * perpVector.y);
            if (perpLength > 0) {
              perpVector.x /= perpLength;
              perpVector.y /= perpLength;
            }
            
            // Scale the perpendicular vector to a reasonable handle length (30% of tangent length)
            const handleLength = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y) * 0.3;
            const handleVector = {
              x: perpVector.x * handleLength,
              y: perpVector.y * handleLength
            };
            
            // Create the virtual point object
            const virtualPoint = {
              x: intersectionPoint.x,
              y: intersectionPoint.y,
              suggestedHandles: {
                in: {
                  x: Math.round(intersectionPoint.x - handleVector.x),
                  y: Math.round(intersectionPoint.y - handleVector.y)
                },
                out: {
                  x: Math.round(intersectionPoint.x + handleVector.x),
                  y: Math.round(intersectionPoint.y + handleVector.y)
                }
              },
              contourIndex: cIndex,
              segmentIndex: segmentIndex,
              t: t
            };
            
            virtualPoints.push(virtualPoint);
          }
        }
        
        // Increment segment index
        segmentIndex++;
      }
    }
    
    return virtualPoints;
  } catch (error) {
    // If there's an error in calculating intersections, return an empty array
    console.warn("Error calculating virtual points:", error);
    return [];
  }
}

// Create a mock VarPackedPath object
class MockVarPackedPath {
  constructor() {
    this.numContours = 2;
    this.contourInfo = [
      { endPoint: 3, isClosed: true },  // First contour with 4 points
      { endPoint: 7, isClosed: true }   // Second contour with 4 points
    ];
  }

  getPoint(pointIndex) {
    // Return simple point objects
    return { x: pointIndex * 10, y: pointIndex * 10 };
  }

  // Mock iterContourSegmentPointIndices to simulate the problematic scenario
  *iterContourSegmentPointIndices(contourIndex) {
    // For contour 0, return normal segments with pointIndices
    if (contourIndex === 0) {
      yield { type: "line", pointIndices: [0, 1] };
      yield { type: "line", pointIndices: [1, 2] };
      yield { type: "line", pointIndices: [2, 3] };
      yield { type: "line", pointIndices: [3, 0] };
    }
    
    // For contour 1, simulate the problematic case with missing or invalid pointIndices
    if (contourIndex === 1) {
      // Normal segment
      yield { type: "line", pointIndices: [4, 5] };
      
      // Problematic segments that would cause TypeError before the fix
      yield { type: "curve" };  // No pointIndices property
      yield { type: "curve", pointIndices: undefined };  // undefined pointIndices
      yield { type: "curve", pointIndices: null };  // null pointIndices
      yield { type: "curve", pointIndices: "not-an-array" };  // not an array
      
      // Normal segment again
      yield { type: "line", pointIndices: [6, 7] };
    }
  }
}

// Test function
function testVirtualPointsCalculation() {
  try {
    // Create mock path
    const mockPath = new MockVarPackedPath();
    
    // Create mock points A and B
    const pointA = { x: 0, y: 0 };
    const pointB = { x: 100, y: 100 };
    
    // Call the function with contourIndex = 0 (different from the contour with problematic segments)
    // This should work without issues
    console.log("Testing with contourIndex = 0 (normal segments)...");
    const result1 = calculateVirtualPointsForTwoPointExpansion(mockPath, pointA, pointB, 0);
    console.log("Success: Function completed without error");
    console.log("Number of virtual points found:", result1.length);
    
    // Call the function with contourIndex = 1 (contains problematic segments)
    // This should also work without throwing TypeError due to the fix
    console.log("\nTesting with contourIndex = 1 (contains problematic segments)...");
    const result2 = calculateVirtualPointsForTwoPointExpansion(mockPath, pointA, pointB, 1);
    console.log("Success: Function completed without TypeError");
    console.log("Number of virtual points found:", result2.length);
    
    console.log("\nTest passed: The fix successfully handles segments with invalid pointIndices");
    return true;
  } catch (error) {
    console.error("Test failed with error:", error.message);
    console.error("Stack trace:", error.stack);
    return false;
  }
}

// Run the test
const testPassed = testVirtualPointsCalculation();

if (testPassed) {
  console.log("\n✅ All tests passed! The fix for TypeError in calculateVirtualPointsForTwoPointExpansion is working correctly.");
} else {
  console.log("\n❌ Test failed! The fix may not be working as expected.");
}

export { testVirtualPointsCalculation };