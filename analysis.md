# Virtual Points Calculation and Storage Analysis

This document provides a comprehensive analysis of how virtual points are calculated and stored in the Fontra font editor application. Virtual points are special intersection points that are computed based on specific geometric configurations of four consecutive on-curve points.

## 1. How Virtual Points Are Calculated and Stored

Virtual points are calculated and stored through a multi-step process that involves geometric validation and intersection computation:

1. **Selection Detection**: When a user selects exactly four points in the editor, the system automatically triggers the virtual points calculation process.

2. **Configuration Validation**: The system validates that the four selected points meet specific geometric criteria:
   - All four points must be consecutive on-curve points along a single contour
   - The first point (A) and last point (D) each have exactly one off-curve handle
   - The segments connecting A-B, B-C, and C-D are straight lines (no off-curve points between them)
   - Proper handling of both open and closed contours

3. **Intersection Computation**: When a valid four-point configuration is detected, the system computes intersection points:
   - Identifies the incoming curve to point A (prev→A)
   - Identifies the outgoing curve from point D
   - Creates a line segment B-C (the middle segment)
   - Computes intersections between the incoming curve and line B-C
   - Computes intersections between the outgoing curve and line B-C

4. **Virtual Point Creation**: For each intersection, the system creates a virtual point with:
   - Position coordinates (x, y)
   - Suggested handle positions based on local geometry
   - Reference information (contour index, segment index, t parameter)

5. **Storage**: The calculated virtual points are stored in the scene model's virtualPoints array:
   ```javascript
   sceneModel.virtualPoints = virtualPointsArray;
   ```

6. **Rendering**: The virtual points are rendered in the editor with a distinctive dashed outline to distinguish them from real points.

## 2. Functions Involved in the Calculation

Several key functions are involved in the virtual points calculation process:

### Core Geometric Functions (path-functions.js)

1. **`checkFourPointConfiguration(path, pointIndices)`**:
   - Validates that four selected points meet the required geometric criteria
   - Checks point consecutiveness, on-curve status, and handle configuration
   - Returns a boolean indicating if the configuration is valid

2. **`computeChordIntersections(selection, path)`**:
   - Computes intersection points when a valid four-point configuration is detected
   - Uses the Bezier.js library for accurate curve/line intersection calculations
   - Calculates perpendicular vectors for suggested handle directions
   - Returns an array of virtual point objects

### Scene Controller Functions (scene-controller.js)

3. **`doCheckFourPointConfiguration()`**:
   - Manually triggered by a keyboard shortcut (Cmd+Alt+E)
   - Gets current selection and validates it
   - Calls the core geometric functions
   - Stores results in the scene model

4. **`updateVirtualPointsIfNeeded()`**:
   - Automatically triggered when selection changes
   - Checks if exactly four points are selected
   - Performs validation and computation
   - Updates the scene model with results

### Visualization Functions (visualization-layer-definitions.js)

5. **Virtual Points Layer Definition**:
   - Renders virtual points with distinctive styling
   - Uses dashed outlines to distinguish from real points
   - Accesses stored virtual points from scene settings

## 3. Four-Point Configuration Validation

The four-point configuration validation is performed by the `checkFourPointConfiguration` function with the following criteria:

1. **Point Count**: Exactly four points must be selected.

2. **Single Contour**: All four points must belong to the same contour.

3. **Consecutive Points**: Points must be consecutive on the contour with special handling for closed contours (including wraparound cases like [n-3, n-2, n-1, 0]).

4. **On-Curve Points**: All four points must be on-curve points (no type attribute indicating off-curve points).

5. **Handle Configuration**: 
   - Point A (first point) must have exactly one off-curve handle
   - Point D (last point) must have exactly one off-curve handle

6. **Straight Segments**: Segments A-B, B-C, and C-D must be straight lines (no off-curve points between consecutive on-curve points).

The validation process involves:
- Sorting point indices to ensure proper order
- Checking contour membership
- Verifying consecutive point placement
- Counting off-curve handles for points A and D
- Ensuring segments between points are straight

## 4. Intersection Computation Between Curves and Line Segments

Intersection computation is performed by the `computeChordIntersections` function using the following process:

1. **Segment Identification**:
   - Identifies the incoming curve to point A (from the previous point)
   - Identifies the outgoing curve from point D (to the next point)
   - Defines the line segment B-C as the middle segment

2. **Bezier Curve Creation**:
   - Creates Bezier curve objects for the incoming and outgoing curves using the Bezier.js library
   - Each curve is defined by its control points

3. **Intersection Calculation**:
   - Uses the `intersects` method of the Bezier.js library to compute intersections
   - Calculates intersections between each curve and the B-C line segment
   - Returns intersection parameters (t values) along the curves

4. **Point Computation**:
   - Uses the `compute` method to get actual intersection point coordinates
   - Calculates the curve's tangent at each intersection point

5. **Handle Suggestion**:
   - Creates perpendicular vectors to the curve's tangent at intersection points
   - Scales perpendicular vectors to a reasonable handle length (30% of tangent length)
   - Calculates suggested handle positions for both incoming and outgoing directions

6. **Virtual Point Object Creation**:
   - Creates virtual point objects containing:
     - Position coordinates (x, y)
     - Suggested handle positions (in and out)
     - Reference information (contour index, segment index, t parameter)

The mathematical computations involved include:
- Bezier curve intersection algorithms via the Bezier.js library
- Vector operations for tangent and perpendicular calculations
- Vector normalization and scaling for handle positioning
- Parametric curve evaluation to get actual point coordinates

## Data Flow

The complete data flow for virtual points is:
1. User selects four points in the editor
2. Selection triggers automatic validation via `updateVirtualPointsIfNeeded`
3. `checkFourPointConfiguration` validates the geometric criteria
4. `computeChordIntersections` calculates intersection points if valid
5. Results are stored in `sceneModel.virtualPoints`
6. Canvas update is requested
7. Visualization layer renders virtual points from stored data

## Technical Implementation Details

- **Library Usage**: The Bezier.js library is used for accurate curve intersection calculations
- **Performance Optimization**: Computation only occurs when exactly four points are selected
- **Validation First**: Early rejection of invalid configurations prevents expensive computations
- **Visual Distinction**: Virtual points are rendered with dashed outlines and semi-transparent colors
- **Real-time Updates**: Virtual points update automatically as selection changes