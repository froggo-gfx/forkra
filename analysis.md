# Technical Analysis: `deleteSingleOffCurvePoint` Function

## 1. Function Overview and Implementation Details

The `deleteSingleOffCurvePoint` function is implemented in `src-js/fontra-core/src/path-functions.js` (lines 1198-1217). This function is responsible for deleting a single off-curve point from a path, where off-curve points are either quadratic or cubic control points.

### Function Signature
```javascript
export function deleteSingleOffCurvePoint(path, pointIndex)
```

### Parameters
- `path`: A `VarPackedPath` object representing the path from which to delete the point
- `pointIndex`: The index of the point to be deleted

### Return Value
- Returns `true` if the point was successfully deleted
- Returns `false` if the point could not be deleted (invalid index or not an off-curve point)

### Implementation Details

1. **Index Validation**: The function first validates that the provided `pointIndex` is within the valid range (0 to `path.numPoints - 1`).

2. **Point Type Check**: It retrieves the point using `path.getPoint(pointIndex)` and checks if it's an off-curve point by examining the `type` property. A point is considered an off-curve point if its type is either `POINT_TYPE_OFF_CURVE_QUAD` ("quad") or `POINT_TYPE_OFF_CURVE_CUBIC` ("cubic").

3. **Point Deletion**: If the point is a valid off-curve point, the function:
   - Gets the contour index and contour point index using `path.getContourAndPointIndex(pointIndex)`
   - Deletes the point from the contour using `path.deletePoint(contourIndex, contourPointIndex)`

4. **Return Status**: The function returns `true` if the point was successfully deleted, or `false` if the deletion failed due to invalid parameters or point type.

## 2. Action Registration in Editor

The "delete-single-off-curve" action is registered in the `initActions()` method of `src-js/views-editor/src/editor.js` (lines 340-349):

```javascript
registerAction(
  "action.delete-single-off-curve",
  {
    topic: "0030-action-topics.menu.edit",
    titleKey: "action.delete-single-off-curve",
    defaultShortCuts: [{ baseKey: "Backspace", commandKey: true }],
  },
  () => this.doDeleteSingleOffCurvePoint(),
  () => this.canDeleteSingleOffCurvePoint()
);
```

This registration:
- Associates the action with the identifier "action.delete-single-off-curve"
- Places it in the "Edit" menu topic
- Sets a default keyboard shortcut of Command+Backspace
- Links it to the `doDeleteSingleOffCurvePoint()` method for execution
- Uses `canDeleteSingleOffCurvePoint()` to determine when the action is enabled

## 3. Method Implementations in Editor

### `canDeleteSingleOffCurvePoint()` Method

Implemented in `src-js/views-editor/src/editor.js` (lines 2230-2261), this method determines whether the "delete-single-off-curve" action should be enabled:

```javascript
canDeleteSingleOffCurvePoint() {
  // Check if exactly one point is selected and it's an off-curve point
  if (this.fontController.readOnly || this.sceneModel.isSelectedGlyphLocked()) {
    return false;
  }
  
  if (!this.sceneSettings.selectedGlyph?.isEditing) {
    return false;
  }
  
  const { point: pointSelection } = parseSelection(this.sceneController.selection);
  
  if (!pointSelection || pointSelection.length !== 1) {
    return false;
  }
  
  // Check if the selected point is an off-curve point
  const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return false;
  }
  
  const pointIndex = pointSelection[0];
  const point = positionedGlyph.glyph.path.getPoint(pointIndex);
  
  if (!point || !point.type) {
    return false;
  }
  
  // Check if it's an off-curve point (either quad or cubic)
  return point.type === POINT_TYPE_OFF_CURVE_QUAD || point.type === POINT_TYPE_OFF_CURVE_CUBIC;
}
```

The method checks several conditions:
- The font is not read-only and the glyph is not locked
- A glyph is currently being edited
- Exactly one point is selected
- The selected point exists and has a type
- The point is an off-curve point (either quadratic or cubic)

### `doDeleteSingleOffCurvePoint()` Method

Implemented in `src-js/views-editor/src/editor.js` (lines 2350-2367), this method performs the actual deletion:

```javascript
async doDeleteSingleOffCurvePoint() {
  if (!this.canDeleteSingleOffCurvePoint()) {
    return;
  }

  const { point: pointSelection } = parseSelection(this.sceneController.selection);
  const pointIndex = pointSelection[0];

  await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
    for (const layerGlyph of Object.values(layerGlyphs)) {
      // Call the deleteSingleOffCurvePoint function for each layer
      deleteSingleOffCurvePoint(layerGlyph.path, pointIndex);
    }
    // Clear the selection after deletion
    this.sceneController.selection = new Set();
    return translate("action.delete-single-off-curve");
  });
}
```

The method:
- Verifies that deletion is allowed by calling `canDeleteSingleOffCurvePoint()`
- Extracts the selected point index
- Uses `editLayersAndRecordChanges()` to apply the deletion to all layers of the glyph
- Calls `deleteSingleOffCurvePoint()` for each layer
- Clears the selection after deletion
- Returns a translated string for the undo/redo history
## 5. Potential Issues Identified

### Missing Imports (Previously Identified Issue)
In the previous analysis, there were concerns about missing imports of `POINT_TYPE_OFF_CURVE_QUAD` and `POINT_TYPE_OFF_CURVE_CUBIC`. However, upon examining the current implementation, these constants are properly imported in `path-functions.js`:

```javascript
import {
  POINT_TYPE_OFF_CURVE_CUBIC,
  POINT_TYPE_OFF_CURVE_QUAD,
  VarPackedPath,
  arePathsCompatible,
} from "./var-path.js";
```

Therefore, there is no issue with missing imports in the current implementation.

### Function Behavior
The function has appropriate validation and error handling:
- It checks for valid point indices
- It verifies that the point is actually an off-curve point before attempting deletion
- It properly extracts contour information before deleting the point

One potential improvement could be to provide more detailed error information when the function returns `false`, but this would require changing the function's return type or adding additional parameters.

## 6. Analysis of Constant Definitions

The constants `POINT_TYPE_OFF_CURVE_QUAD` and `POINT_TYPE_OFF_CURVE_CUBIC` are defined in `src-js/fontra-core/src/var-path.js` (lines 15-16):

```javascript
export const POINT_TYPE_OFF_CURVE_QUAD = "quad";
export const POINT_TYPE_OFF_CURVE_CUBIC = "cubic";
```

These constants are string values that represent the types of off-curve points in the path system:
- `POINT_TYPE_OFF_CURVE_QUAD` ("quad"): Represents quadratic Bézier control points
- `POINT_TYPE_OFF_CURVE_CUBIC` ("cubic"): Represents cubic Bézier control points

These constants are used throughout the codebase to identify and work with different types of off-curve points consistently.

## 7. Recommendations for Improvement

1. **Enhanced Return Information**: Consider modifying the function to return more detailed information about why a deletion failed. This could be done by returning an object with both success status and error details, or by throwing specific error types.

2. **Documentation**: Add JSDoc comments to the function to improve code documentation and help developers understand its purpose, parameters, and return values.

3. **Input Validation**: While the function validates the point index and type, it doesn't validate that the `path` parameter is a valid `VarPackedPath` object. Adding this validation could prevent runtime errors.

4. **Unit Tests**: Ensure comprehensive unit tests cover all edge cases, including:
   - Invalid point indices (negative, out of bounds)
   - On-curve points (which should not be deleted by this function)
   - Points with invalid types
   - Valid off-curve points of both quadratic and cubic types

5. **Performance Considerations**: For very large paths, consider if there are more efficient ways to handle point deletion, though the current implementation appears to be reasonably efficient.

## 8. Conclusion


## 9. Analysis of Implementation in scene-controller.js

### 1. Context Menu Action Registration

In `src-js/views-editor/src/scene-controller.js`, the "delete-single-off-curve" action is registered in the `setupContextMenuActions()` method (lines 545-550):

```javascript
registerAction(
  "action.delete-single-off-curve",
  { topic },
  () => this.doDeleteSingleOffCurvePoint(),
  () => this.contextMenuState.singleOffCurvePointSelection?.length
);
```

This registration:
- Associates the action with the identifier "action.delete-single-off-curve"
- Places it in the general edit topic
- Links it to the `doDeleteSingleOffCurvePoint()` method for execution
- Uses a condition based on `contextMenuState.singleOffCurvePointSelection?.length` to determine when the action is enabled

The action is also included in the context menu items in the `getContextMenuItems()` method (line 880):

```javascript
{ actionIdentifier: "action.delete-single-off-curve" },
```

### 2. `doDeleteSingleOffCurvePoint` Method Details

The `doDeleteSingleOffCurvePoint` method is implemented in `src-js/views-editor/src/scene-controller.js` (lines 1520-1539):

```javascript
async doDeleteSingleOffCurvePoint() {
  const { point: pointSelection } = parseSelection(this.selection);
  if (!pointSelection?.length) {
    return;
  }

  await this.editLayersAndRecordChanges((layerGlyphs) => {
    for (const layerGlyph of Object.values(layerGlyphs)) {
      const path = layerGlyph.path;
      // Delete each selected off-curve point
      for (const pointIndex of pointSelection) {
        // Use the new function from path-functions.js
        deleteSingleOffCurvePoint(path, pointIndex);
      }
    }
    // Clear selection after deletion
    this.selection = new Set();
    return translate("action.delete-single-off-curve");
  });
}
```

Key details of this implementation:
- It first parses the current selection to extract point indices
- It checks if there are any selected points before proceeding
- It uses `editLayersAndRecordChanges()` to apply the deletion to all layers of the glyph
- It iterates through all selected points (supporting multiple selections) and calls `deleteSingleOffCurvePoint` for each
- It clears the selection after deletion
- It returns a translated string for the undo/redo history

### 3. `getSelectedSingleOffCurvePoints` Function Analysis

The `getSelectedSingleOffCurvePoints` functionality is implemented as `getSelectedSingleOffCurvePoints` function in `src-js/views-editor/src/scene-controller.js` (lines 1839-1852):

```javascript
function getSelectedSingleOffCurvePoints(path, pointSelection) {
  if (!path || !pointSelection || pointSelection.length !== 1) {
    return [];
  }
  
  const pointIndex = pointSelection[0];
  const point = path.getPoint(pointIndex);
  
 // Check if the point is an off-curve point (quad or cubic)
  if (point && point.type && (point.type === "quad" || point.type === "cubic")) {
    return [pointIndex];
  }
  
  return [];
}
```

This function:
- Validates that a path exists, point selection exists, and exactly one point is selected
- Gets the point at the selected index
- Checks if the point has a type and if that type is either "quad" or "cubic"
- Returns an array with the point index if it's a valid off-curve point, or an empty array otherwise

This function is used in the `updateContextMenuState` method (line 861) to populate `contextMenuState.singleOffCurvePointSelection`:

```javascript
this.contextMenuState.singleOffCurvePointSelection = glyphController.canEdit
  ? getSelectedSingleOffCurvePoints(glyphController.instance.path, pointSelection)
  : [];
```

### 4. Potential Issues and Inconsistencies

#### Inconsistency with Constant Usage

One potential issue is an inconsistency in how off-curve point types are checked. In the `getSelectedSingleOffCurvePoints` function (line 1848), the code directly compares point types with string literals:

```javascript
if (point && point.type && (point.type === "quad" || point.type === "cubic")) {
```

However, in other parts of the codebase (as seen in the earlier analysis), constants are defined for these values:
- `POINT_TYPE_OFF_CURVE_QUAD = "quad"`
- `POINT_TYPE_OFF_CURVE_CUBIC = "cubic"`

Using the constants instead of string literals would improve consistency and maintainability:

```javascript
if (point && point.type && (point.type === POINT_TYPE_OFF_CURVE_QUAD || point.type === POINT_TYPE_OFF_CURVE_CUBIC)) {
```

This would require importing these constants from `var-path.js` in `scene-controller.js`.

#### Multiple Point Selection Handling

The `getSelectedSingleOffCurvePoints` function is designed to work with single point selections (as indicated by its name and the length check), but the `doDeleteSingleOffCurvePoint` method can process multiple selected points. This creates a disconnect where:
- The context menu action is only enabled when exactly one off-curve point is selected
- But the deletion method can actually handle multiple points

This inconsistency could be intentional (to limit the context menu action to single selections for safety), but it might also be confusing for users who might expect to be able to delete multiple off-curve points at once through the context menu.

## 10. Conclusion

The implementation of the single off-curve point deletion feature in `scene-controller.js` is well-structured and follows the established patterns in the codebase. The context menu registration properly integrates with the existing action system, and the deletion method correctly leverages the core functionality from `path-functions.js`.

The main areas for improvement would be:
1. Using defined constants instead of string literals for point type checking
2. Clarifying the intended behavior regarding single vs. multiple point selection
3. Ensuring consistent naming (the function is named "getSelectedSingleOffCurvePoints" but the context menu state property is "singleOffCurvePointSelection")
The `deleteSingleOffCurvePoint` function is well-implemented and correctly handles the deletion of off-curve points from a path. The previously identified issue with missing imports has been resolved in the current implementation. The function includes appropriate validation and error handling, making it robust for its intended purpose.