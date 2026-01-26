// Test script to verify sidebearing skeleton fix
// This script simulates different sidebearing adjustment scenarios

console.log("=== Testing Sidebearing Skeleton Fix ===");

// Test Case 1: Left sidebearing adjustment
console.log("\n--- Test Case 1: Left Sidebearing Adjustment ---");
const deltaX1 = 10;
const isLeftSidebearingDrag1 = true;
const event1 = { altKey: false, shiftKey: false };

// Simulate the delta calculation
const leftDeltaX1 = event1.altKey && !isLeftSidebearingDrag1 ? -deltaX1 : deltaX1;
const rightDeltaX1 = event1.altKey && isLeftSidebearingDrag1 ? -deltaX1 : deltaX1;
const actualDeltaX1 = isLeftSidebearingDrag1 ? leftDeltaX1 : rightDeltaX1;

console.log(`Input: deltaX=${deltaX1}, isLeftSidebearingDrag=${isLeftSidebearingDrag1}, altKey=${event1.altKey}`);
console.log(`Calculated: leftDeltaX=${leftDeltaX1}, rightDeltaX=${rightDeltaX1}, actualDeltaX=${actualDeltaX1}`);

// For left sidebearing ("L"), the delta should be negative
const sidebearingDelta1 = -leftDeltaX1;
console.log(`Left sidebearing delta: ${sidebearingDelta1}`);
console.log(`Expected: Skeleton points should move right by ${Math.abs(sidebearingDelta1)} units`);

// Test Case 2: Right sidebearing adjustment
console.log("\n--- Test Case 2: Right Sidebearing Adjustment ---");
const deltaX2 = 10;
const isLeftSidebearingDrag2 = false;
const event2 = { altKey: false, shiftKey: false };

const leftDeltaX2 = event2.altKey && !isLeftSidebearingDrag2 ? -deltaX2 : deltaX2;
const rightDeltaX2 = event2.altKey && isLeftSidebearingDrag2 ? -deltaX2 : deltaX2;
const actualDeltaX2 = isLeftSidebearingDrag2 ? leftDeltaX2 : rightDeltaX2;

console.log(`Input: deltaX=${deltaX2}, isLeftSidebearingDrag=${isLeftSidebearingDrag2}, altKey=${event2.altKey}`);
console.log(`Calculated: leftDeltaX=${leftDeltaX2}, rightDeltaX=${rightDeltaX2}, actualDeltaX=${actualDeltaX2}`);

// For right sidebearing ("R"), the delta should be positive
const sidebearingDelta2 = rightDeltaX2;
console.log(`Right sidebearing delta: ${sidebearingDelta2}`);
console.log(`Expected: Skeleton points should move right by ${sidebearingDelta2} units`);

// Test Case 3: Both sidebearings adjustment (symmetric)
console.log("\n--- Test Case 3: Both Sidebearings Adjustment (Symmetric) ---");
const deltaX3 = 10;
const isLeftSidebearingDrag3 = true;
const event3 = { altKey: false, shiftKey: false };

const leftDeltaX3 = event3.altKey && !isLeftSidebearingDrag3 ? -deltaX3 : deltaX3;
const rightDeltaX3 = event3.altKey && isLeftSidebearingDrag3 ? -deltaX3 : deltaX3;
const actualDeltaX3 = isLeftSidebearingDrag3 ? leftDeltaX3 : rightDeltaX3;

console.log(`Input: deltaX=${deltaX3}, isLeftSidebearingDrag=${isLeftSidebearingDrag3}, altKey=${event3.altKey}`);
console.log(`Calculated: leftDeltaX=${leftDeltaX3}, rightDeltaX=${rightDeltaX3}, actualDeltaX=${actualDeltaX3}`);

// For both sidebearings ("LR") with symmetric adjustment
const sidebearingDelta3 = rightDeltaX3;
console.log(`Both sidebearings delta (symmetric): ${sidebearingDelta3}`);
console.log(`Expected: Skeleton points should move right by ${sidebearingDelta3} units`);

// Test Case 4: Both sidebearings adjustment with altKey
console.log("\n--- Test Case 4: Both Sidebearings Adjustment (Alt Key) ---");
const deltaX4 = 10;
const isLeftSidebearingDrag4 = true;
const event4 = { altKey: true, shiftKey: false };

const leftDeltaX4 = event4.altKey && !isLeftSidebearingDrag4 ? -deltaX4 : deltaX4;
const rightDeltaX4 = event4.altKey && isLeftSidebearingDrag4 ? -deltaX4 : deltaX4;
const actualDeltaX4 = isLeftSidebearingDrag4 ? leftDeltaX4 : rightDeltaX4;

console.log(`Input: deltaX=${deltaX4}, isLeftSidebearingDrag=${isLeftSidebearingDrag4}, altKey=${event4.altKey}`);
console.log(`Calculated: leftDeltaX=${leftDeltaX4}, rightDeltaX=${rightDeltaX4}, actualDeltaX=${actualDeltaX4}`);

// For both sidebearings ("LR") with altKey
const sidebearingDelta4 = rightDeltaX4 - leftDeltaX4;
console.log(`Both sidebearings delta (altKey): ${sidebearingDelta4}`);
console.log(`Expected: Skeleton points should move right by ${sidebearingDelta4} units`);

console.log("\n=== Test Analysis ===");
console.log("The test cases show the expected behavior for different sidebearing adjustments.");
console.log("The actual issue might be in how the delta values are calculated or applied.");
console.log("The logging added to the code should help identify where the problem occurs.");