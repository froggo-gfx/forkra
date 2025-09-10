# Visualization Settings Panel

## Overview

The Visualization Settings Panel is a new UI component that allows users to control the visibility of various visualization layers in the Fontra editor. It follows the same architectural patterns as other panels in the application and integrates with the existing visualization layer system.

## Architecture

### Panel Structure

The panel extends the base `Panel` class and follows the standard panel structure:

1. **Identifier**: `visualization-settings`
2. **Icon**: Eye icon (`/tabler-icons/eye.svg`)
3. **UI Component**: Uses the `Form` component from `@fontra/web-components/ui-form.js`

### Integration Points

1. **Editor Controller**: The panel is registered in the editor's sidebar system in `editor.js`
2. **Visualization Layers**: Connects to the `visualizationLayersSettings` ObservableController
3. **Canvas Updates**: Requests canvas updates when layer visibility changes

## Implementation Details

### File Structure

The panel is implemented in `src-js/views-editor/src/panel-visualization-settings.js` and registered in the editor sidebar.

### Key Implementation Details

1. **Layer Discovery**: Gets user-switchable layers from `visualizationLayerDefinitions.filter(layer => layer.userSwitchable)`
2. **Settings Access**: Accesses visualization layers settings through `this.editorController.visualizationLayersSettings`
3. **Settings Updates**: Updates settings with `this.editorController.visualizationLayersSettings.model[layerID] = onOff`
4. **Event Listening**: Listens for settings changes to update the UI when layers are toggled from elsewhere

### Data Flow

1. **On Panel Initialization**:
   - Get the list of user-switchable visualization layers from `visualizationLayerDefinitions`
   - Get the current visibility state from `visualizationLayersSettings`
   
2. **When Rendering the UI**:
   - Create a form with a toggle for each user-switchable layer
   - Set the toggle state based on the current visibility settings
   
3. **When a Toggle is Changed**:
   - Update the `visualizationLayersSettings` model
   - The `VisualizationLayers` class already listens for these changes and updates accordingly
   - Request a canvas update to reflect the changes

### UI Components

The panel uses the Form component with checkbox fields for each visualization layer:

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

## Visualization Layer System Integration

### How It Works

1. **Layer Definitions**: Visualization layers are defined in `visualization-layer-definitions.js` with properties:
   - `identifier`: Unique identifier for the layer
   - `name`: Display name (can be a translation key)
   - `userSwitchable`: Boolean indicating if users can toggle the layer
   - `defaultOn`: Boolean indicating if the layer is on by default

2. **Settings Management**: Layer visibility is controlled through `visualizationLayersSettings`, which is an `ObservableController` that synchronizes with localStorage

3. **Rendering**: The `VisualizationLayers` class in `visualization-layers.js` handles the actual rendering of layers based on their visibility settings

### Event Flow

1. **User Interaction**: User toggles a visualization layer checkbox
2. **Settings Update**: Panel updates the `visualizationLayersSettings.model`
3. **Event Propagation**: `VisualizationLayers` class listens for changes and updates its internal state
4. **Canvas Refresh**: Canvas is updated to reflect the new layer visibility

## Testing

### Verification Points

1. All user-switchable layers appear in the panel
2. Toggling a layer updates the canvas
3. Changing layer visibility from other sources (like the View menu) updates the panel UI
4. Settings persist between sessions

## Future Enhancements

1. **Grouping**: Group layers by category (e.g., "Glyph", "Guidelines", "Grid", etc.)
2. **Search/Filter**: Add search/filter functionality for many layers
3. **Opacity Controls**: Add layer opacity controls
4. **Ordering Controls**: Add layer ordering controls

## Code References

- Panel Implementation: [`src-js/views-editor/src/panel-visualization-settings.js`](file:///c%3A/Users/frena/Desktop/fontra-test/src-js/views-editor/src/panel-visualization-settings.js)
- Visualization Layer Definitions: [`src-js/views-editor/src/visualization-layer-definitions.js`](file:///c%3A/Users/frena/Desktop/fontra-test/src-js/views-editor/src/visualization-layer-definitions.js)
- Visualization Layers: [`src-js/views-editor/src/visualization-layers.js`](file:///c%3A/Users/frena/Desktop/fontra-test/src-js/views-editor/src/visualization-layers.js)
- Editor Integration: [`src-js/views-editor/src/editor.js`](file:///c%3A/Users/frena/Desktop/fontra-test/src-js/views-editor/src/editor.js)