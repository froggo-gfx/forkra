# Plan for Fixing Single Off-Curve Point Deletion Functionality

## Issue Description

The single off-curve point deletion functionality in Fontra is not working correctly. When users try to delete only one handle of a segment using the Ctrl+Backspace shortcut, the application still deletes both handles and throws a JavaScript error:

```
views-editor.1dc9aec6.js:1 
Uncaught (in promise) ReferenceError: POINT_TYPE_OFF_CURVE_QUAD is not defined
    at ne.canDeleteSingleOffCurvePoint (views-editor.1dc9aec6.js:1:211203)
```

This indicates that the constant `POINT_TYPE_OFF_CURVE_QUAD` is not defined in the compiled JavaScript file, causing a runtime error when the `canDeleteSingleOffCurvePoint` method tries to use it.

## Root Cause Analysis

Based on the analysis in `analysis.md`, the issue is in the `canDeleteSingleOffCurvePoint` method in `src-js/views-editor/src/editor.js`. This method directly references the constants `POINT_TYPE_OFF_CURVE_QUAD` and `POINT_TYPE_OFF_CURVE_CUBIC` without importing them from `var-path.js`.

While the constants are properly defined in `var-path.js` and imported in `path-functions.js`, they are not imported in `editor.js`, which causes the build process to not include them in the compiled JavaScript file.

## Fix Plan

### Step 1: Add Missing Imports to editor.js

**File:** `src-js/views-editor/src/editor.js`

Add the missing import statement for the point type constants:

```javascript
import {
  POINT_TYPE_OFF_CURVE_CUBIC,
 POINT_TYPE_OFF_CURVE_QUAD,
} from "@fontra/core/var-path.js";
```

This import should be added with the other imports at the top of the file.

### Step 2: Verify Consistent Constant Usage

**File:** `src-js/views-editor/src/editor.js`

Ensure that the `canDeleteSingleOffCurvePoint` method uses the imported constants instead of potentially inconsistent checks:

In the method (around line 2259 in the analysis), change:
```javascript
return point.type === POINT_TYPE_OFF_CURVE_QUAD || point.type === POINT_TYPE_OFF_CURVE_CUBIC;
```

This is already correct as it uses the constants, but we need to ensure they're properly imported.

### Step 3: Check scene-controller.js for Similar Issues

**File:** `src-js/views-editor/src/scene-controller.js`

In the `getSelectedSingleOffCurvePoints` function (lines 1848-1850 in the analysis), there's an inconsistency in how point types are checked:

Change:
```javascript
if (point && point.type && (point.type === "quad" || point.type === "cubic")) {
```

To:
```javascript
if (point && point.type && (point.type === POINT_TYPE_OFF_CURVE_QUAD || point.type === POINT_TYPE_OFF_CURVE_CUBIC)) {
```

This will require adding the same import statement to `scene-controller.js`:
```javascript
import {
  POINT_TYPE_OFF_CURVE_CUBIC,
  POINT_TYPE_OFF_CURVE_QUAD,
} from "@fontra/core/var-path.js";
```

### Step 4: Test the Fix

1. Build the project to ensure the constants are properly bundled
2. Test the Ctrl+Backspace shortcut to delete single off-curve points
3. Verify that the Alt+Backspace shortcut still deletes both handles as expected
4. Test edge cases:
   - Trying to delete on-curve points with Ctrl+Backspace (should not work)
   - Trying to delete off-curve points with Alt+Backspace (should delete both)
   - Trying to delete single off-curve points with Ctrl+Backspace (should delete only one)

### Step 5: Verify No Regression

1. Test other point deletion functionality to ensure nothing else is broken
2. Test that the context menu options still work correctly
3. Verify that the undo/redo functionality works for both single and double point deletions

## Implementation Details

### Task 1: Add Missing Imports to editor.js
- Add import statement for `POINT_TYPE_OFF_CURVE_QUAD` and `POINT_TYPE_OFF_CURVE_CUBIC`
- Place the import with other imports at the top of the file

### Task 2: Add Missing Imports to scene-controller.js
- Add import statement for `POINT_TYPE_OFF_CURVE_QUAD` and `POINT_TYPE_OFF_CURVE_CUBIC`
- Place the import with other imports at the top of the file
- Update the string literal comparisons to use the constants

### Task 3: Build and Test
- Run the build process to compile the JavaScript files
- Test the functionality in the browser
- Verify that the error no longer occurs

### Task 4: Documentation Update
- Update any relevant documentation to reflect the changes
- Ensure code comments are accurate

## Expected Outcome

After implementing these fixes:
1. The `ReferenceError: POINT_TYPE_OFF_CURVE_QUAD is not defined` error will be resolved
2. The Ctrl+Backspace shortcut will correctly delete single off-curve points
3. The Alt+Backspace shortcut will continue to delete both handles as expected
4. The functionality will be consistent across the codebase with proper constant usage
5. Each step of the plan must be documented in progress.md