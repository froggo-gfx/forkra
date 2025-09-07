# Progress Report: Step 1-a Eligibility Check Implementation

## Summary

This document describes the implementation of the eligibility check for the "Expand terminals (create chord)" feature in Fontra. The implementation validates that selected points meet specific criteria before allowing the expansion operation to proceed.

## Files Modified

1. `src-js/fontra-core/src/path-functions.js`
2. `src-js/views-editor/src/scene-controller.js`

## Functions Added/Modified

### In `src-js/fontra-core/src/path-functions.js`:

1. **`expandTerminals()`**
   - Main function that performs the eligibility checks
   - Validates exactly two points are selected
   - Ensures both points are on-curve
   - Confirms both points are on the same contour
   - Checks that each point has exactly one handle on the stalk side
   - Verifies there are no off-curve points between the selected points
   - Ensures each point has one handle in the direction of the other neighboring nodes
   - Outputs "Eligible" to the console when validation passes

2. **`getPrimaryHandleDirection()`**
   - Helper function to determine the handle direction for a given point
   - Returns "previous" if there's a handle in the previous direction
   - Returns "next" if there's a handle in the next direction
   - Returns null if no handles are found or if the point is off-curve

3. **`computeExpansionPoint()`**
   - Helper function to compute the new position of an expanded point
   - Calculates a vector from anchor to handle and normalizes it
   - Scales by a fallback distance and adds to the anchor point
   - Handles cases where the vector is too small by using a fallback distance

4. **`tagPointAttr()`**
   - Optional utility function to label expanded points
   - Sets custom attributes on points for identification

### In `src-js/views-editor/src/scene-controller.js`:

1. **New "expand-terminals" action**
   - Registered in the setupContextMenuActions() method
   - Parses the current selection to get point indices
   - Validates exactly 2 points are selected
   - Calls the expandTerminals() function for each editing layer
   - Integrated with the existing editGlyph mechanism for undo/redo support

## Eligibility Check Implementation Details

The eligibility check implementation consists of several validation steps:

1. **Validation of exactly two points selected**
   - The function first checks that exactly two points are selected
   - If not, it logs "Not eligible: exactly two points must be selected" and returns null

2. **Verification that both points are on-curve**
   - Both selected points must be on-curve points (not off-curve)
   - If either point is off-curve, it logs "Not eligible: both points must be on-curve" and returns null

3. **Confirmation that each has exactly one handle on the stalk side**
   - Uses the `getPrimaryHandleDirection()` helper function to check handle directions
   - If either point doesn't have exactly one handle, it logs "Not eligible: each point must have exactly one handle" and returns null

4. **Check that there are no off-curve points between them**
   - Uses the `checkForOffCurvePointsBetween()` helper function
   - For open contours, checks the direct path between points
   - For closed contours, checks both directions and determines the shorter path
   - If off-curve points are found between the selected points, it logs "Not eligible: there are off-curve points between the selected points" and returns null

5. **Verification that each point has one handle that does NOT point toward the other neighboring nodes**
   - Additional validation of handle directions to ensure they do NOT point toward each other
   - Considers both open and closed contour cases
   - If handle directions are pointing toward each other, it logs "Not eligible: handle directions are pointing toward each other" and returns null

6. **Console output of "Eligible" when points pass validation**
   - When all validation checks pass, the function logs "Eligible" to the console
   - Returns a placeholder result with empty arrays for newPointIndices and createdAttrsInfo

## Hotkey Registration

The "Expand terminals (create chord)" action is registered with the hotkey **Ctrl+Alt+E** in the scene controller.

## Integration with Existing Mechanisms

The implementation integrates with the existing editGlyph mechanism for undo/redo support. The expand-terminals action:
- Uses the editGlyph function to perform the operation
- Works with multiple layers if needed
- Integrates with the change recording system for proper undo/redo functionality