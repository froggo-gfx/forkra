# Fontra addOverlap Function Fix Documentation

## Issue Description

The `addOverlap` function in `src-js/fontra-core/src/loop-zoop.js` had a bug where it was creating one on-curve point and one off-curve point when it should create two on-curve points.

## Root Cause

The issue was in the `addOverlap` function where the inserted point was being created with a `type: "line"` property. In Fontra's path system, any point with a `type` property (including `"line"`) is treated as an off-curve point, while on-curve points have no `type` property (undefined).

## Fix Applied

The fix involved removing the `type: "line"` property from the inserted point in the `addOverlap` function. This ensures that both the original point and the inserted point are treated as on-curve points.

In the `loop-zoop.js` file, the fix was implemented in the section where the B2 point is created:

```javascript
// Create B2 point (B - nextOffset) and insert it after the current point
const b2Point = {
  x: point.x - nextOffsetX,
  y: point.y - nextOffsetY
  // No type property = on-curve point
};
```

## Test Results

We created comprehensive tests to verify the fix:

1. **Single Point Test**: Verified that when adding overlap to a single point, both the original and inserted points are on-curve.

2. **Multiple Points Test**: Verified that when adding overlap to multiple points, all points in the path remain on-curve.

3. **Position Calculation Test**: Verified that the function correctly calculates positions based on the offset logic.

All tests pass successfully, confirming that the fix works as intended.

## Verification Output

When running our demo script, we can see:

```
Testing addOverlap function fix...
Original path points:
  Point 0: (0, 0) type: on-curve
  Point 1: (100, 0) type: on-curve
  Point 2: (100, 100) type: on-curve
  Point 3: (0, 100) type: on-curve

After addOverlap:
Number of points: 5
  Point 0: (0, 0) type: on-curve
  Point 1: (130, 0) type: on-curve
  Point 2: (100, -30) type: on-curve
  Point 3: (100, 100) type: on-curve
  Point 4: (0, 100) type: on-curve

Verification:
Original point (index 1) type: on-curve - PASS
Inserted point (index 2) type: on-curve - PASS

✅ SUCCESS: Both points are correctly created as on-curve points!
```

## Conclusion

The fix successfully resolves the issue by ensuring that the `addOverlap` function creates two on-curve points as intended, rather than one on-curve and one off-curve point. This maintains the correct path structure and ensures proper behavior in Fontra's path operations.