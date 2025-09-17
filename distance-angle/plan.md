# Plan: Porting Show Distance and Angle Plugin from Glyphs to Fontra

## Overview
This document outlines the plan for porting the "Show Distance and Angle" plugin from Glyphs to Fontra. The plugin displays the distance and angle between two selected nodes in a glyph.

## Implementation Files
1. `distance-angle.js` - Main plugin functionality
2. `visualization-layer-definitions.js` - Visualization layer integration

## Functional Breakdown

### 1. Unit Vector Calculation
**File:** `distance-angle.js`
**Function:** `unitVectorFromTo(pointB, pointA)`
**Description:** Calculate the unit vector from point B to point A
**Inputs:** 
- `pointB`: Object with x, y coordinates (destination point)
- `pointA`: Object with x, y coordinates (source point)
**Outputs:** 
- Object with normalized x, y coordinates representing the unit vector
**Data Flow:**
1. Calculate difference vector: `dx = A.x - B.x`, `dy = A.y - B.y`
2. Calculate length: `length = sqrt(dx² + dy²)`
3. Normalize: `dx/length`, `dy/length`
4. Return normalized vector

### 2. Preferences Management
**File:** `distance-angle.js`
**Function:** `loadPreferences()`
**Description:** Load user preferences for angle style
**Inputs:** None
**Outputs:** 
- Boolean indicating if absolute angle is used (true) or shortest angle (false)
**Data Flow:**
1. Check if preference exists in localStorage
2. Return stored value or default (true for absolute)

**File:** `distance-angle.js`
**Function:** `savePreferences(angleAbsolute)`
**Description:** Save user preferences for angle style
**Inputs:** 
- `angleAbsolute`: Boolean indicating if absolute angle is used
**Outputs:** None
**Data Flow:**
1. Store angleAbsolute value in localStorage

### 3. Angle Style Toggle
**File:** `distance-angle.js`
**Function:** `toggleAngleStyle()`
**Description:** Toggle between absolute and shortest angle display
**Inputs:** None
**Outputs:** None
**Data Flow:**
1. Load current angleAbsolute preference
2. Toggle the value
3. Save updated preference
4. Trigger UI refresh

### 4. Distance and Angle Calculation
**File:** `distance-angle.js`
**Function:** `calculateDistanceAndAngle(point1, point2, angleAbsolute)`
**Description:** Calculate distance and angle between two points
**Inputs:** 
- `point1`: Object with x, y coordinates (first point)
- `point2`: Object with x, y coordinates (second point)
- `angleAbsolute`: Boolean indicating angle calculation method
**Outputs:** 
- Object with `distance` and `angle` properties
**Data Flow:**
1. Calculate distance using hypot function: `distance = sqrt((x2-x1)² + (y2-y1)²)`
2. Calculate angle:
   - Determine dx, dy based on angleAbsolute flag
   - Calculate radians using atan2(dy, dx)
   - Convert to degrees
   - Apply modulo operations based on angleAbsolute flag
3. Return object with distance and angle

### 5. Badge Dimensions Calculation
**File:** `distance-angle.js`
**Function:** `calculateBadgeDimensions(text, fontSize)`
**Description:** Calculate the dimensions needed for the info badge
**Inputs:** 
- `text`: String containing distance and angle information
- `fontSize`: Number representing the font size for the badge
**Outputs:** 
- Object with `width`, `height`, and `radius` properties
**Data Flow:**
1. Measure text dimensions using canvas context
2. Add padding to width and height
3. Return dimensions with predefined corner radius

### 6. Badge Position Calculation
**File:** `distance-angle.js`
**Function:** `calculateBadgePosition(midPoint, unitVector, badgeWidth, badgeHeight)`
**Description:** Calculate the position for the info badge
**Inputs:** 
- `midPoint`: Object with x, y coordinates (midpoint between the two points)
- `unitVector`: Object with x, y coordinates (unit vector perpendicular to the line)
- `badgeWidth`: Number representing the badge width
- `badgeHeight`: Number representing the badge height)
**Outputs:** 
- Object with `x`, `y` coordinates for badge position
**Data Flow:**
1. Calculate offset based on unit vector and badge dimensions
2. Apply offset to midpoint
3. Return final badge position

### 7. Text Formatting
**File:** `distance-angle.js`
**Function:** `formatDistanceAndAngle(distance, angle)`
**Description:** Format distance and angle values for display
**Inputs:** 
- `distance`: Number representing the distance
- `angle`: Number representing the angle in degrees
**Outputs:** 
- String with formatted distance and angle values
**Data Flow:**
1. Round distance to 1 decimal place
2. Round angle to 1 decimal place
3. Format as "distance\nangle°"
4. Return formatted string

### 8. Visualization Layer Definition
**File:** `visualization-layer-definitions.js`
**Function:** `defineDistanceAngleLayer()`
**Description:** Define the visualization layer for distance and angle display
**Inputs:** None
**Outputs:** 
- Object with layer definition properties
**Data Flow:**
1. Define layer properties (name, drawing function, etc.)
2. Return layer definition object

### 9. Drawing Functions
**File:** `visualization-layer-definitions.js`
**Function:** `drawDistanceAngleVisualization(context, position, selection, layer, model)`
**Description:** Draw the distance and angle visualization
**Inputs:** 
- `context`: Canvas rendering context
- `position`: Position information
- `selection`: Selected points
- `layer`: Current glyph layer
- `model`: Data model
**Outputs:** None
**Data Flow:**
1. Check if exactly two points are selected
2. Calculate distance and angle between points
3. Draw line between points
4. Calculate badge position
5. Draw badge
6. Draw distance and angle text

**File:** `visualization-layer-definitions.js`
**Function:** `drawLine(context, point1, point2)`
**Description:** Draw a line between two points
**Inputs:** 
- `context`: Canvas rendering context
- `point1`: Object with x, y coordinates (start point)
- `point2`: Object with x, y coordinates (end point)
**Outputs:** None
**Data Flow:**
1. Set line style (color, width)
2. Begin path
3. Move to point1
4. Draw line to point2
5. Stroke path

**File:** `visualization-layer-definitions.js`
**Function:** `drawBadge(context, x, y, width, height, radius)`
**Description:** Draw a rounded rectangle badge
**Inputs:** 
- `context`: Canvas rendering context
- `x`: Number representing x coordinate
- `y`: Number representing y coordinate
- `width`: Number representing badge width
- `height`: Number representing badge height
- `radius`: Number representing corner radius
**Outputs:** None
**Data Flow:**
1. Set fill style (color, opacity)
2. Begin path
3. Draw rounded rectangle using arcTo or bezier curves
4. Fill path

**File:** `visualization-layer-definitions.js`
**Function:** `drawText(context, text, x, y, color)`
**Description:** Draw text at specified position
**Inputs:** 
- `context`: Canvas rendering context
- `text`: String to draw
- `x`: Number representing x coordinate
- `y`: Number representing y coordinate
- `color`: String representing text color
**Outputs:** None
**Data Flow:**
1. Set text style (font, color, alignment)
2. Draw text at specified position

## Implementation Steps
1. Create `distance-angle.js` with core calculation and utility functions
2. Create/modify `visualization-layer-definitions.js` with drawing functions
3. Register the visualization layer with Fontra
4. Implement preference management using localStorage
5. Test with various point selections
6. Verify angle calculation modes work correctly
7. Ensure proper UI refresh when toggling angle style

## Constants
- `BADGE_COLOR`: RGBA values for badge color (now greener)
- `LINE_COLOR`: RGBA values for line color
- `TEXT_COLOR`: Color for text display
- `BADGE_PADDING`: Padding around text in badge
- `BADGE_RADIUS`: Corner radius for badge