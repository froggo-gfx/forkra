# Visualization Settings Panel Design

## Overview

This document describes the design for a new visualization settings panel that allows users to control visualization layers in Fontra. The panel will follow the same architectural patterns as the existing transformation panel and integrate with the existing visualization layer system.

## Requirements

1. Lists all user-switchable visualization layers
2. Provides toggles for enabling/disabling each layer
3. Follows the same architectural patterns as the existing transformation panel
4. Integrates with the existing visualization layer system

## Analysis

### Visualization Layer System

From examining the code, I found that:

1. Visualization layers are defined in [`src-js/views-editor/src/visualization-layer-definitions.js`](file:///c%3A/Users/frena/Desktop/fontra-test/src-js/views-editor/src/visualization-layer-definitions.js) with the `registerVisualizationLayerDefinition` function
2. Each layer definition has properties:
   - `identifier`: Unique identifier for the layer
   - `name`: Display name (can be a translation key)
   - `userSwitchable`: Boolean indicating if users can toggle the layer
   - `defaultOn`: Boolean indicating if the layer is on by default
   - `zIndex`: Rendering order
   - `selectionFunc`: Function to determine which glyphs to render
   - `draw`: Drawing function
   - `colors`/`colorsDarkMode`: Color definitions
   - `screenParameters`: Screen-specific parameters

3. The visualization layers are managed by the `VisualizationLayers` class in [`src-js/views-editor/src/visualization-layers.js`](file:///c%3A/Users/frena/Desktop/fontra-test/src-js/views-editor/src/visualization-layers.js)
4. Layer visibility is controlled through `visualizationLayersSettings`, which is an `ObservableController` that synchronizes with localStorage
5. The editor controller in [`src-js/views-editor/src/editor.js`](file:///c%3A/Users/frena/Desktop/fontra-test/src-js/views-editor/src/editor.js) creates and manages the visualization layers and their settings

### Existing Panel Patterns

From examining the transformation panel and other panels:

1. Panels extend the `Panel` base class
2. They have an `identifier` and `iconPath` property
3. They implement a `getContentElement()` method that returns the panel's UI
4. They implement an `update()` method that refreshes the panel content
5. They listen to relevant events to trigger updates
6. They use the `Form` component from `@fontra/web-components/ui-form.js` for UI elements

## Design

### Panel Structure

The visualization settings panel will:

1. Extend the `Panel` base class
2. Have identifier "visualization-settings"
3. Use an appropriate icon (possibly eye or eye-off icons)
4. Display a list of all user-switchable visualization layers with toggle switches
5. Use the same Form component pattern as other panels

### Data Flow

1. On panel initialization:
   - Get the list of user-switchable visualization layers from `visualizationLayerDefinitions`
   - Get the current visibility state from `visualizationLayersSettings`
   
2. When rendering the UI:
   - Create a form with a toggle for each user-switchable layer
   - Set the toggle state based on the current visibility settings
   
3. When a toggle is changed:
   - Update the `visualizationLayersSettings` model
   - The `VisualizationLayers` class already listens for these changes and updates accordingly
   - Request a canvas update to reflect the changes

### UI Components

The panel will use the Form component with checkbox fields for each visualization layer:

```javascript
formContents.push({
 type: "single-icon",
  label: translate(layerDef.name),
  element: html.createDomElement("input", {
    type: "checkbox",
    checked: this.visualizationLayersSettings.model[layerDef.identifier],
    onchange: (event) => this._toggleLayer(layerDef.identifier, event.target.checked)
  })
});
```

## Implementation Plan

### File Structure

1. Create `src-js/views-editor/src/panel-visualization-settings.js`
2. Register the panel in the editor controller

### Key Implementation Details

1. Get user-switchable layers from `visualizationLayerDefinitions.filter(layer => layer.userSwitchable)`
2. Access the visualization layers settings through `this.editorController.visualizationLayersSettings`
3. Update settings with `this.editorController.visualizationLayersSettings.model[layerID] = onOff`
4. Listen for settings changes to update the UI when layers are toggled from elsewhere

## Integration Points

1. The panel needs to be added to the editor's sidebar system
2. It should be placed in the right sidebar with other settings panels
3. The panel needs access to the visualization layers settings from the editor controller

## Testing

1. Verify that all user-switchable layers appear in the panel
2. Verify that toggling a layer updates the canvas
3. Verify that changing layer visibility from other sources (like the View menu) updates the panel UI
4. Verify that the settings persist between sessions

## Future Enhancements

1. Group layers by category (e.g., "Glyph", "Guidelines", "Grid", etc.)
2. Add search/filter functionality for many layers
3. Add layer opacity controls
4. Add layer ordering controls