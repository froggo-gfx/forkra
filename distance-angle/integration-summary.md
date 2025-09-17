# Distance & Angle Visualization Layer Integration Guide

## Overview
This document explains how to integrate the Distance & Angle visualization layer into Fontra. The implementation consists of two main files:
1. `distance-angle.js` - Core calculation functions
2. `visualization-layer-definitions.js` - Visualization layer definition and rendering

## Integration Steps

### 1. File Placement
Place the following files in the Fontra project:
- `distance-angle/distance-angle.js` - Core calculation functions
- `distance-angle/visualization-layer-definitions.js` - Visualization layer definition

### 2. Import Path Correction
The current implementation uses relative imports that may need adjustment based on the final file placement in the Fontra project structure:

```javascript
// In visualization-layer-definitions.js, update these paths as needed:
import { registerVisualizationLayerDefinition } from "../src-js/views-editor/src/visualization-layer-definitions.js";
import { strokeLine } from "../src-js/views-editor/src/visualization-layer-definitions.js";
import { 
  unitVectorFromTo, 
  loadPreferences, 
  calculateDistanceAndAngle, 
  calculateBadgeDimensions, 
  calculateBadgePosition, 
  formatDistanceAndAngle 
} from "./distance-angle.js";
```

### 3. Registration
The visualization layer is automatically registered when `visualization-layer-definitions.js` is imported, thanks to the `registerVisualizationLayerDefinition` function call.

### 4. Features Implemented
- Distance calculation between two selected points
- Angle calculation with two modes:
  - Absolute angle (0-180 degrees)
  - Shortest angle (0-90 degrees)
- Visual line connecting the two points
- Information badge displaying distance and angle values
- Preference persistence using localStorage
- Responsive design that scales with zoom level

## Technical Details

### Core Functions
All core calculation functions are in `distance-angle.js`:
- `unitVectorFromTo(pointB, pointA)` - Calculates unit vector between two points
- `loadPreferences()` - Loads angle calculation mode from localStorage
- `savePreferences(angleAbsolute)` - Saves angle calculation mode to localStorage
- `toggleAngleStyle()` - Toggles between angle calculation modes
- `calculateDistanceAndAngle(point1, point2, angleAbsolute)` - Calculates distance and angle
- `calculateBadgeDimensions(text, fontSize)` - Calculates badge dimensions for text
- `calculateBadgePosition(midPoint, unitVector, badgeWidth, badgeHeight)` - Positions the info badge
- `formatDistanceAndAngle(distance, angle)` - Formats values for display

### Visualization Layer
The visualization layer is defined in `visualization-layer-definitions.js`:
- Identifier: `fontra.distance-angle`
- Name: "Distance & Angle"
- Active only in editing mode with exactly two points selected
- Automatically appears when two points are selected
- Can be toggled on/off through the view menu

## Usage
1. Select exactly two points in the glyph editor
2. The distance and angle information will automatically appear
3. Toggle between angle modes using localStorage persistence
4. The layer can be turned on/off from the View menu

## Customization
Colors, fonts, and sizes can be adjusted by modifying the constants at the top of `visualization-layer-definitions.js`:
- `COLOR` - Line color
- `BADGE_COLOR` - Badge background color (now greener)
- `TEXT_COLOR` - Text color
- `BADGE_PADDING` - Padding around text in badge
- `BADGE_RADIUS` - Corner radius of badge
- `FONT_SIZE` - Text font size