# Findings: Persistent Power Rulers

## Current Implementation Analysis

### Power Ruler Tool (edit-tools-power-ruler.js)

**Current behavior:**
- Single ruler per glyph stored in `this.glyphRulers[glyphName]`
- Ruler created on drag (not on glyph)
- Ruler data: `{ basePoint, directionVector, intersections, measurePoints }`
- Deleted on Backspace key
- Not persistent (lost on glyph switch/reload)

**Key methods:**
- `handleDrag(eventStream, initialEvent)` - Creates/updates ruler on drag
- `recalcRulerFromPoint()` - Creates ruler from point and nearest path hit
- `recalcRulerFromLine()` - Calculates intersections and measure points
- `draw()` - Renders ruler line, markers, and distance labels
- `handleKeyDown()` - Backspace deletes ruler

### Visualization Layers

**Registration:**
```javascript
registerVisualizationLayerDefinition({
  identifier: "fontra.power.ruler",
  zIndex: 600,
  draw: (context, positionedGlyph, parameters, model, controller) =>
    thePowerRulerTool?.draw(...)
})
```

**Colors:**
- strokeColor: "#0004" (light), "#FFF6" (dark)
- intersectionColor: "#F085" (light), "#F696" (dark)
- insideBlobColor, outsideBlobColor for distance labels

### Persistence Mechanism

**ObservableController:**
- Used throughout Fontra for reactive state
- `synchronizeWithLocalStorage(prefix)` method for persistence
- Automatically syncs changes to/from localStorage
- Used by reference font panel, plugin manager, etc.

**Example usage:**
```javascript
this.controller = new ObservableController({...});
this.controller.synchronizeWithLocalStorage("fontra.reference-font.");
```

### Pointer Tool (edit-tools-pointer.js)

**Current behavior:**
- Selects points, contours, components
- Dragging moves selected elements
- Need to add ruler hit detection and dragging

**Key methods to understand:**
- `handleHover()` - Detect what's under cursor
- `handleDrag()` - Handle drag operations

### Sidebar Panels

**Panel structure:**
- Panels registered in editor.js
- Each panel is a class extending base Panel class
- Panels in: panel-designspace-navigation.js, panel-glyph-note.js, etc.

**Panel registration:**
```javascript
// In editor.js
const panelDefinitions = {
  "text-entry": { panel: TextEntryPanel, ... },
  "glyph-note": { panel: GlyphNotePanel, ... },
  ...
};
```

## Technical Approach

### New Data Structure
```javascript
glyphRulers[glyphName] = {
  activeRulerId: string | null,
  rulers: {
    [rulerId]: {
      id: string,
      name: string,
      basePoint: {x, y},
      directionVector: {x, y},
      intersections: [...],
      measurePoints: [...]
    }
  }
}
```

### Opacity Handling
- Static ruler lines: Multiply alpha channel by 0.4-0.5
- Markers and labels: Keep full opacity
- Parse CSS color and modify alpha

### Pointer Tool Integration
- Add ruler hit testing to `handleHover()`
- When hovering ruler, show draggable cursor
- On drag, make that ruler active and update position

## Files Identified

| File | Purpose |
|------|---------|
| src-js/views-editor/src/edit-tools-power-ruler.js | Main ruler tool |
| src-js/views-editor/src/edit-tools-pointer.js | Pointer tool for ruler dragging |
| src-js/views-editor/src/visualization-layer-definitions.js | Layer definitions |
| src-js/views-editor/src/editor.js | Editor main, panel registration |
| src-js/views-editor/src/panel.js | Base panel class |
| src-js/views-editor/src/panel-glyph-note.js | Example simple panel |
| src-js/fontra-core/src/observable-object.js | ObservableController |
| src-js/fontra-core/assets/lang/en.js | Localization strings |
