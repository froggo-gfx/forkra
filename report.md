# Why Off-Curve Points Are Deleted Only in Pairs in Fontra

## Introduction

In digital typography and font design applications, the manipulation of Bézier curves is a fundamental operation. Fontra, a modern collaborative font editor, implements a specific behavior when deleting points from paths: off-curve points (also known as control points or handles) are deleted exclusively in pairs. This report explains the technical reasons behind this design decision and how it's implemented in Fontra's architecture.

## Understanding Off-Curve Points and Bézier Curves

### What Are Off-Curve Points?

In font design, paths are defined by a series of points. These points can be categorized as:

1. **On-curve points** - Points that lie directly on the path outline
2. **Off-curve points** - Control points that define the curvature of Bézier segments

Off-curve points come in two varieties:
- **Quadratic (conic) control points** - Used in quadratic Bézier curves
- **Cubic control points** - Used in cubic Bézier curves

### Role in Bézier Curves

Off-curve points define the shape of Bézier curves between on-curve points:

- **Quadratic curves** require one off-curve point between two on-curve points
- **Cubic curves** require two off-curve points between two on-curve points

This mathematical foundation is essential to understanding why off-curve points must be handled in pairs.

## Why Off-Curve Points Are Deleted in Pairs

### 1. Mathematical Integrity of Bézier Curves

The primary reason for deleting off-curve points in pairs is to maintain the mathematical integrity of Bézier curves:

- When deleting a cubic curve segment, both control points must be removed to avoid creating malformed curve segments
- Deleting only one control point from a cubic segment would leave the path in an inconsistent state
- The same principle applies to quadratic curves when multiple segments are involved

### 2. Path Consistency and Validity

Fontra maintains strict path consistency by ensuring that:
- Curve segments have the correct number of control points
- Path data structures remain valid after any operation
- The visual representation matches the underlying mathematical model

Deleting off-curve points individually would break these consistency rules.

### 3. User Experience Considerations

From a user experience perspective:
- Deleting curve handles in pairs matches the way they are created (typically in pairs)
- It provides predictable behavior that aligns with user expectations
- It prevents accidental creation of invalid path states that could cause rendering issues

## Implementation in Fontra

### Fragment-Based Deletion Approach

Fontra implements a fragment-based deletion approach, as seen in the `path-functions.js` file. This approach:

1. Identifies selected points and segments
2. Groups adjacent selected elements into "fragments"
3. Processes each fragment to determine appropriate deletion behavior
4. Handles curve reconstruction when necessary

### Key Implementation Details

The deletion process involves several important functions:

#### `deleteSelectedPoints` Function

In `path-functions.js`, the `deleteSelectedPoints` function orchestrates the deletion process:

```javascript
export function deleteSelectedPoints(path, pointIndices) {
  // `pointIndices` must be sorted
  const contourFragmentsToDelete = preparePointDeletion(path, pointIndices);
  // Process fragments and perform deletions
}
```

This function:
1. Prepares for deletion by identifying contour fragments
2. Processes each fragment according to its characteristics
3. Reconstructs curves when needed to maintain path integrity

#### `preparePointDeletion` Function

The `preparePointDeletion` function analyzes what needs to be deleted:

```javascript
function preparePointDeletion(path, pointIndices) {
  const contourFragmentsToDelete = [];
  const selectionByContour = getSelectionByContour(path, pointIndices);
  for (const [contourIndex, contourPointIndices] of selectionByContour.entries()) {
    contourFragmentsToDelete.push(
      findContourFragments(path, contourIndex, contourPointIndices)
    );
  }
  return contourFragmentsToDelete;
}
```

This function:
1. Groups point selections by contour
2. Finds connected fragments of selected points
3. Determines how to handle each fragment during deletion

#### `findContourFragments` Function

The `findContourFragments` function identifies connected segments:

```javascript
function findContourFragments(path, contourIndex, contourPointIndices) {
  // Implementation details for finding connected fragments
}
```

This function:
1. Identifies segments that are fully or partially selected
2. Groups adjacent segments into fragments
3. Prepares information for proper curve reconstruction

### Curve Reconstruction

When deleting curve segments, Fontra may reconstruct curves to maintain visual continuity:

```javascript
const { curveType, onlyOffCurvePoints } = determineDominantCurveType(
  points.slice(1, -1)
);

if (curveType && !onlyOffCurvePoints) {
  newPoints = computeHandlesFromFragment(curveType, fragment.contour);
}
```

This approach:
1. Determines the dominant curve type in the fragment
2. Computes new handles to replace deleted ones when appropriate
3. Maintains visual continuity while ensuring mathematical correctness

## Technical Architecture

### Path Representation

In `var-path.js`, paths are represented using a packed structure that efficiently stores:
- Point coordinates
- Point types (on-curve, off-curve quadratic, off-curve cubic)
- Contour information (closed/open status)

This representation allows for efficient manipulation of path data while maintaining the relationships between points.

### Editor Integration

In `editor.js`, the deletion process is integrated with the editor's change recording system:

```javascript
await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
  for (const layerGlyph of Object.values(layerGlyphs)) {
    if (pointSelection) {
      deleteSelectedPoints(layerGlyph.path, pointSelection);
    }
    // Handle other selections...
  }
  this.sceneController.selection = new Set();
  return "Delete Selection";
});
```

This integration ensures that:
1. All layers are updated consistently
2. Changes are properly recorded for undo/redo functionality
3. The user interface reflects the updated path state

## Deletion Scenarios

### Scenario 1: Deleting a Single Curve Segment

When deleting a cubic curve segment between two on-curve points:
1. Both off-curve control points are selected
2. The fragment-based approach identifies this as a complete segment
3. Both control points are deleted together
4. The two on-curve points are connected with a straight line

### Scenario 2: Deleting Partial Curve Segments

When deleting only part of a curve segment:
1. The fragment-based approach identifies the incomplete selection
2. New control points are computed to maintain visual continuity
3. The resulting curve maintains mathematical integrity

### Scenario 3: Deleting Multiple Adjacent Segments

When deleting multiple adjacent curve segments:
1. All off-curve points in the selected segments are identified
2. Fragments are grouped appropriately
3. Deletion proceeds in a way that maintains path validity

## Benefits of Pair-Based Deletion

### 1. Mathematical Correctness

By ensuring that off-curve points are deleted in pairs:
- All Bézier segments maintain their required control points
- No malformed segments are created
- The path remains mathematically valid

### 2. Predictable Behavior

Users can expect consistent behavior:
- Deletion operations produce predictable results
- Visual feedback matches user intentions
- No unexpected path modifications occur

### 3. Performance Optimization

The fragment-based approach:
- Processes deletions efficiently
- Minimizes computational overhead
- Reduces the likelihood of path validation errors

## Conclusion

Fontra's approach to deleting off-curve points in pairs is a deliberate design decision that prioritizes mathematical correctness, path integrity, and user experience. By implementing a fragment-based deletion system, Fontra ensures that:

1. Bézier curves maintain their mathematical properties
2. Paths remain valid and renderable
3. User interactions produce predictable results
4. Performance is optimized through efficient processing

This approach reflects Fontra's commitment to providing a robust and professional font editing environment that respects both the mathematical foundations of typography and the practical needs of font designers.