# Virtual Points Display Issue

## Problem Description

Virtual points in Fontra are not displaying in the correct location. These points are computed intersections between curves and lines when users select exactly four points that form a specific geometric configuration. While the points are being computed correctly, they appear in the wrong position on the canvas.

## Root Cause Analysis

The issue is caused by incorrect coordinate transformation in the virtual points visualization layer. Here's the detailed breakdown:

1. **Point Computation**: In `src-js/fontra-core/src/path-functions.js`, the `computeChordIntersections` function correctly calculates virtual points in glyph space coordinates (lines 1430-1449).

2. **Point Storage**: In `src-js/views-editor/src/scene-controller.js`, the `doCheckFourPointConfiguration` method stores these computed points in `sceneModel.virtualPoints` (line 153).

3. **Point Display**: In `src-js/views-editor/src/visualization-layer-definitions.js`, the "fontra.virtual.points" visualization layer retrieves these points and attempts to display them (lines 1947-2000).

The bug occurs in the visualization layer where virtual points are being double-transformed:
- The points are already in glyph space when computed
- However, in lines 1985-1986, they're being offset by `positionedGlyph.x` and `positionedGlyph.y` again
- This results in the points being displayed at incorrect locations on the canvas

## Code Locations

1. **Virtual Points Computation**: 
   - File: `src-js/fontra-core/src/path-functions.js`
   - Function: `computeChordIntersections` (lines 1336-1452)
   - Specific lines where points are created: 1430-1449

2. **Virtual Points Storage**:
   - File: `src-js/views-editor/src/scene-controller.js`
   - Method: `doCheckFourPointConfiguration` (lines 1522-1567)
   - Storage line: 153

3. **Virtual Points Display (Buggy Code)**:
   - File: `src-js/views-editor/src/visualization-layer-definitions.js`
   - Visualization layer: "fontra.virtual.points" (lines 1947-2000)
   - Problematic lines: 1985-1986

## Required Changes

To fix the virtual points display issue, the coordinate transformation in the visualization layer needs to be corrected:

1. **In `src-js/views-editor/src/visualization-layer-definitions.js`**, in the "fontra.virtual.points" visualization layer (around lines 1984-1989):
   - Remove the addition of `positionedGlyph.x` and `positionedGlyph.y` to the virtual point coordinates
   - Virtual points are already in the correct glyph space coordinates and don't need additional transformation

The fix involves modifying the point creation code from:
```javascript
const point = {
  x: virtualPoint.x + positionedGlyph.x,
  y: virtualPoint.y + positionedGlyph.y,
  type: undefined,
  smooth: true
};
```

To:
```javascript
const point = {
  x: virtualPoint.x,
  y: virtualPoint.y,
  type: undefined,
  smooth: true
};
```

This change ensures that virtual points are displayed in their correct locations without being double-transformed.