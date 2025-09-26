# Panel Hookup Design Document: Tunni Labels Control

## Overview
This document outlines the implementation plan for adding three checkboxes (distance, tension, angle) to the selection transformation panel that will control the visibility of respective labels in the `drawTunniLabels` function.

## Current Implementation Analysis

### drawTunniLabels Function
The `drawTunniLabels` function in `src-js/fontra-core/src/tunni-calculations.js` currently displays all three metrics (distance, tension, angle) simultaneously for cubic segments and off-curve points. The function calculates and displays:

1. **Distance**: Distance from on-curve to off-curve points
2. **Tension**: Tension values calculated using the Tunni formula
3. **Angle**: Angle of off-curve points relative to on-curve points

### Visualization Layer System
The visualization layer system is defined in `src-js/views-editor/src/visualization-layer-definitions.js`. The Tunni labels layer is registered as:
```javascript
registerVisualizationLayerDefinition({
  identifier: "fontra.tunni.labels",
  name: "Tunni Labels",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  // ...
  draw: drawTunniLabels,
});
```

### Transformation Panel Structure
The transformation panel in `src-js/views-editor/src/panel-transformation.js` uses a Form UI system with various input types. The panel updates through the `update()` method which rebuilds the form content.

## Implementation Plan

### Step 1: Add Tunni Labels Settings to Scene Controller
**File**: `src-js/views-editor/src/scene-controller.js`
**Function**: Add properties to control visibility of distance, tension, and angle labels

**Input**: Scene settings model
**Output**: Extended scene settings with `showTunniDistance`, `showTunniTension`, `showTunniAngle` properties

### Step 2: Update Visualization Layer Definition
**File**: `src-js/fontra-core/src/tunni-calculations.js`
**Function**: Modify `drawTunniLabels` to respect visibility settings

**Input**: Canvas context, positioned glyph, parameters, model, controller
**Output**: Conditional drawing of distance, tension, or angle labels based on settings

### Step 3: Create Tunni Labels Control Section
**File**: `src-js/views-editor/src/panel-transformation.js`
**Function**: Add a new section with three checkboxes to control label visibility

**Input**: Current form content array
**Output**: Extended form content with Tunni labels control section

### Step 4: Implement Parameter Handling
**File**: `src-js/views-editor/src/panel-transformation.js`
**Function**: Update the `onFieldChange` handler to store checkbox states

**Input**: Field change events from checkboxes
**Output**: Updated `transformParameters` with checkbox states

### Step 5: Connect Parameters to Visualization
**File**: `src-js/views-editor/src/visualization-layer-definitions.js`
**Function**: Pass visibility parameters from scene controller to `drawTunniLabels`

**Input**: Model and controller objects containing visibility settings
**Output**: Properly configured parameters for conditional drawing

## Detailed Implementation Steps

### Step 1: Add Tunni Labels Settings to Scene Controller

In `src-js/views-editor/src/scene-controller.js`, extend the scene settings controller initialization to include Tunni label visibility properties:

```javascript
setupSceneSettings() {
 // ... existing code ...
  this.sceneSettingsController = new ObservableController({
    // ... existing properties ...
    showTunniDistance: true,
    showTunniTension: true,
    showTunniAngle: true,
  });
  // ... rest of the method
}
```

### Step 2: Modify drawTunniLabels Function

In `src-js/fontra-core/src/tunni-calculations.js`, update the `drawTunniLabels` function to accept and respect visibility parameters:

```javascript
export function drawTunniLabels(context, positionedGlyph, parameters, model, controller) {
  // Extract visibility settings from model or controller
  const showDistance = model.sceneSettings?.showTunniDistance ?? true;
  const showTension = model.sceneSettings?.showTunniTension ?? true;
  const showAngle = model.sceneSettings?.showTunniAngle ?? true;

  // ... existing code until text formatting ...

  // Format text based on visibility settings
  const visibleComponents = [];
  if (showDistance) visibleComponents.push(dist1.toFixed(1));
  if (showTension) visibleComponents.push(tension1.toFixed(2));
  if (showAngle) visibleComponents.push(`${angle1.toFixed(1)}°`);
  const text1 = visibleComponents.join('\n');

  // Same logic for text2
  const visibleComponents2 = [];
  if (showDistance) visibleComponents2.push(dist2.toFixed(1));
  if (showTension) visibleComponents2.push(tension2.toFixed(2));
  if (showAngle) visibleComponents2.push(`${angle2.toFixed(1)}°`);
  const text2 = visibleComponents2.join('\n');

  // ... rest of the function
}
```

### Step 3: Add Control Section to Transformation Panel

In `src-js/views-editor/src/panel-transformation.js`, add a new section in the `update()` method before the return statement:

```javascript
// Add Tunni labels control section
formContents.push({ type: "divider" });
formContents.push({
  type: "header",
  label: "Tunni Labels",
});

// Add three checkboxes for distance, tension, and angle
formContents.push({
  type: "checkbox-group",
  checkboxes: [
    {
      key: "showTunniDistance",
      label: "Distance",
      value: this.transformParameters.showTunniDistance ?? true,
    },
    {
      key: "showTunniTension",
      label: "Tension",
      value: this.transformParameters.showTunniTension ?? true,
    },
    {
      key: "showTunniAngle",
      label: "Angle",
      value: this.transformParameters.showTunniAngle ?? true,
    }
  ]
});
```

### Step 4: Update Parameter Handling

In the `onFieldChange` handler in `src-js/views-editor/src/panel-transformation.js`, add handling for the new parameters:

```javascript
this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
  this.transformParameters[fieldItem.key] = value;
  
  // Handle Tunni visibility parameters
  if (["showTunniDistance", "showTunniTension", "showTunniAngle"].includes(fieldItem.key)) {
    // Update the scene settings
    this.sceneController.sceneSettingsController.setItem(fieldItem.key, value);
  }
  
  // ... existing code ...
};
```

### Step 5: Initialize Transform Parameters

In the constructor of `TransformationPanel`, initialize the new transform parameters:

```javascript
constructor(editorController) {
 // ... existing code ...
  this.transformParameters = {
    // ... existing parameters ...
    showTunniDistance: true,
    showTunniTension: true,
    showTunniAngle: true,
  };
  // ... rest of constructor
}
```

## Data Flow

1. **User Interaction**: User toggles checkboxes in the transformation panel
2. **Panel Update**: `onFieldChange` handler updates `transformParameters` and scene settings
3. **Scene Update**: Scene controller updates the `showTunni*` properties in scene settings
4. **Visualization Update**: Canvas is redrawn, calling `drawTunniLabels` with updated model
5. **Conditional Drawing**: `drawTunniLabels` checks visibility settings and draws only selected labels

## Error Handling

- Ensure proper default values for visibility settings to prevent undefined behavior
- Add try-catch blocks around label drawing operations to prevent crashes if calculations fail
- Validate that the scene settings are properly initialized before accessing visibility properties

## Testing Considerations

1. Verify that all three checkboxes work independently
2. Test that labels update immediately when checkboxes are toggled
3. Confirm that the visualization layer continues to function properly
4. Ensure that the panel layout remains clean and readable with the new section
5. Test with different glyph types (with and without cubic segments)

## Files to Modify

1. `src-js/views-editor/src/scene-controller.js` - Add scene settings for Tunni label visibility
2. `src-js/fontra-core/src/tunni-calculations.js` - Update `drawTunniLabels` to respect visibility settings
3. `src-js/views-editor/src/panel-transformation.js` - Add checkboxes and parameter handling
4. `src-js/views-editor/src/visualization-layer-definitions.js` - Ensure parameters are passed correctly (if needed)

## Dependencies

- The implementation depends on the existing visualization layer system
- Requires the `drawTunniLabels` function to accept additional parameters
- Relies on the form system in the transformation panel to handle checkbox inputs