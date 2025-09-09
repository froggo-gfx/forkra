# Fontra Glyph Appearance - On-Curve Point Parameters

## Overview

This document details how on-curve point appearance (circle size and color) is handled in the Fontra codebase. The visualization system uses layered definitions to render different aspects of glyphs, with specific layers dedicated to node visualization.

## Key Files

1. [`src-js/views-editor/src/visualization-layers.js`](file:///c:/Users/marty/Desktop/fontra/fontra-test/src-js/views-editor/src/visualization-layers.js) - Core visualization layer management
2. [`src-js/views-editor/src/visualization-layer-definitions.js`](file:///c:/Users/marty/Desktop/fontra/fontra-test/src-js/views-editor/src/visualization-layer-definitions.js) - Definitions for all visualization layers

## Data Flow

1. `VisualizationLayers` class manages multiple visualization layers
2. Each layer is defined with an identifier, drawing function, parameters, and colors
3. Layers are rendered in order based on their `zIndex`
4. The drawing functions are called with context, positioned glyph, parameters, model, and controller
5. Parameters include both static values and dynamic values based on theme or scale

## On-Curve Point Appearance Parameters

### Nodes Layer ("fontra.nodes")

Defined in [`src-js/views-editor/src/visualization-layer-definitions.js`](file:///c:/Users/marty/Desktop/fontra/fontra-test/src-js/views-editor/src/visualization-layer-definitions.js) at lines 1278-1296:

```javascript
registerVisualizationLayerDefinition({
  identifier: "fontra.nodes",
  name: "Nodes",
  selectionFunc: glyphSelector("editing"),
  zIndex: 500,
  screenParameters: { cornerSize: 8, smoothSize: 8, handleSize: 6.5 },
  colors: { color: "#BBB" },
  colorsDarkMode: { color: "#BBB" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const glyph = positionedGlyph.glyph;
    const cornerSize = parameters.cornerSize;
    const smoothSize = parameters.smoothSize;
    const handleSize = parameters.handleSize;

    context.fillStyle = parameters.color;
    for (const pt of glyph.path.iterPoints()) {
      fillNode(context, pt, cornerSize, smoothSize, handleSize);
    }
  },
});
```

### Selected Nodes Layer ("fontra.selected.nodes")

Defined in [`src-js/views-editor/src/visualization-layer-definitions.js`](file:///c:/Users/marty/Desktop/fontra/fontra-test/src-js/views-editor/src/visualization-layer-definitions.js) at lines 1299-1353:

```javascript
registerVisualizationLayerDefinition({
  identifier: "fontra.selected.nodes",
  name: "Selected nodes",
  selectionFunc: glyphSelector("editing"),
  zIndex: 500,
  screenParameters: {
    cornerSize: 8,
    smoothSize: 8,
    handleSize: 6.5,
    strokeWidth: 1,
    hoverStrokeOffset: 4,
    underlayOffset: 2,
  },
  colors: { hoveredColor: "#BBB", selectedColor: "#000", underColor: "#FFFA" },
  colorsDarkMode: { hoveredColor: "#BBB", selectedColor: "#FFF", underColor: "#0008" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    // Implementation details...
  },
});
```

## Circle Size Parameters

On-curve point circle sizes are defined in the `screenParameters` section of the visualization layer definitions:

1. **cornerSize: 8** - Size for corner nodes (on-curve, non-smooth)
2. **smoothSize: 8** - Size for smooth nodes (on-curve, smooth)
3. **handleSize: 6.5** - Size for handle nodes (off-curve)

These sizes are passed to the `fillNode` function which determines the appropriate drawing method based on the point type.

## Color Parameters

Colors are defined separately for light and dark modes:

### Regular Nodes
- **Light mode**: `#BBB` (light gray)
- **Dark mode**: `#BBB` (light gray)

### Selected Nodes
- **Light mode**: 
  - Selected: `#000` (black)
  - Hovered: `#BBB` (light gray)
  - Under layer: `#FFFA` (almost white with slight transparency)
- **Dark mode**:
  - Selected: `#FFF` (white)
  - Hovered: `#BBB` (light gray)
  - Under layer: `#0008` (almost black with slight transparency)

## Drawing Functions

### fillNode Function

Defined in [`src-js/views-editor/src/visualization-layer-definitions.js`](file:///c:/Users/marty/Desktop/fontra/fontra-test/src-js/views-editor/src/visualization-layer-definitions.js) at lines 1949-1956:

```javascript
function fillNode(context, pt, cornerNodeSize, smoothNodeSize, handleNodeSize) {
  if (!pt.type && !pt.smooth) {
    fillSquareNode(context, pt, cornerNodeSize);
  } else if (!pt.type) {
    fillRoundNode(context, pt, smoothNodeSize);
  } else {
    fillRoundNode(context, pt, handleNodeSize);
  }
}
```

This function determines which drawing method to use based on the point properties:
- Points with no type and not smooth → corner nodes (drawn with `fillSquareNode`)
- Points with no type but smooth → smooth nodes (drawn with `fillRoundNode`)
- Points with a type → handle nodes (drawn with `fillRoundNode`)

### fillRoundNode Function

Defined in [`src-js/views-editor/src/visualization-layer-definitions.js`](file:///c:/Users/marty/Desktop/fontra/fontra-test/src-js/views-editor/src/visualization-layer-definitions.js) at lines 1973-1976:

```javascript
export function fillRoundNode(context, pt, nodeSize) {
  context.beginPath();
  context.arc(pt.x, pt.y, nodeSize / 2, 0, 2 * Math.PI, false);
  context.fill();
}
```

This function draws circular nodes by creating an arc with the specified radius (`nodeSize / 2`).

## Summary

## Glyph Editor Layers Appearance

Glyph editor layers (similar to Photoshop layers) are handled through specific visualization layers in Fontra:

### Background and Editing Layer Visualization

There are two specific visualization layers that handle the appearance of editor layers:
1. "Background glyph layers" - Visualizes background layers
2. "Editing glyph layers" - Visualizes non-primary editing layers

These are defined in [`src-js/views-editor/src/visualization-layer-definitions.js`](file:///c:/Users/marty/Desktop/fontra/fontra-test/src-js/views-editor/src/visualization-layer-definitions.js):
- Lines 1583-1608: Background glyph layers
- Lines 1610-1638: Editing glyph layers

### Appearance Handling

**Transparency:**
- Both visualization layers use stroke colors with alpha transparency:
  - Background layers: `#AAA8` (light mode) and `#8888` (dark mode)
  - Editing layers: `#66FA` (light mode) and `#88FA` (dark mode)
- The last two characters in the hex color represent the alpha channel

**Fill Color:**
- These layers are drawn using `context.stroke()` rather than `context.fill()`
- They only have stroke colors, not fill colors
- They appear as outlines of the layer shapes rather than filled shapes

### Data Flow

1. Layer glyphs are set up in `scene-model.js`:
   - `updateBackgroundGlyphs()` 
   - `_setupBackgroundGlyphs()`
2. These layer glyphs are stored as `backgroundLayerGlyphs` and `editingLayerGlyphs` properties
3. The visualization layers access these properties from the model
4. The layers are drawn as outlines using stroke colors with alpha transparency

### Key Files

1. [`src-js/views-editor/src/visualization-layer-definitions.js`](file:///c:/Users/marty/Desktop/fontra/fontra-test/src-js/views-editor/src/visualization-layer-definitions.js) - Layer visualization definitions
2. [`src-js/views-editor/src/scene-model.js`](file:///c:/Users/marty/Desktop/fontra/fontra-test/src-js/views-editor/src/scene-model.js) - Layer glyph setup
3. [`src-js/views-editor/src/visualization-layers.js`](file:///c:/Users/marty/Desktop/fontra/fontra-test/src-js/views-editor/src/visualization-layers.js) - Visualization layer management
## Theme System and Color Parameters

While Fontra does have a centralized theme system, the colors for on-curve points in the visualization layers are explicitly defined in the layer definitions themselves rather than being derived from the theme system.

### Theme System Overview

The theme system is managed by:
1. [`src-js/fontra-core/src/theme-settings.js`](file:///c:/Users/marty/Desktop/fontra/fontra-test/src-js/fontra-core/src/theme-settings.js) - Controls the theme state (light, dark, or automatic)
2. [`src-js/fontra-core/assets/css/core.css`](file:///c:/Users/marty/Desktop/fontra/fontra-test/src-js/fontra-core/assets/css/core.css) - Defines CSS variables for various UI elements

The theme system uses CSS variables with a clever technique involving `--fontra-theme-marker` to toggle between light and dark theme values. However, this system is primarily used for general UI elements rather than visualization layer colors.

### Relationship to Visualization Layer Colors

The colors for on-curve points (like `#BBB` for regular nodes and `#00`/`#FFF` for selected nodes) are explicitly defined in the visualization layer definitions:
- Light mode colors are defined in the `colors` section
- Dark mode colors are defined in the `colorsDarkMode` section

These color values are not derived from the theme system's CSS variables, which means they are fixed and not automatically adjusted if the theme colors were to change. This provides consistency in how glyphs are displayed regardless of the UI theme.

If the visualization layer colors were to be made theme-dependent, they would need to be modified to use CSS variables from the theme system, but currently they use hardcoded hex color values.
On-curve point appearance in Fontra is controlled through visualization layer definitions with specific parameters for size and color. The system distinguishes between different types of points (corner, smooth, handle) and provides separate size parameters for each. Colors can be customized for both light and dark modes. The drawing is handled by a combination of functions that determine the appropriate shape and size based on point properties.