# Curvatura Implementation Design Document for Fontra

## Overview

This document outlines the implementation of Curvatura functionality in Fontra. Curvatura is a FontForge plugin that provides tools for harmonizing, tunnifying, and adding inflection points to Bézier curves. This implementation will bring these curvature-based operations to Fontra as native functionality.

## Goals

1. Implement core Curvatura mathematical functions in JavaScript
2. Integrate with Fontra's scene-controller for real-time operations
3. Create UI controls in the transformation panel
4. Maintain compatibility with Fontra's path data structures
5. Provide real-time feedback during operations

## Architecture Overview

### Core Components

1. **Curvatura Math Library** (`src-js/fontra-core/src/curvatura.js`)
   - Mathematical functions for curvature operations
   - Bézier curve manipulation algorithms
   - Inflection point detection and insertion
   - Handle adjustment functions

2. **Scene Controller Integration** (`src-js/views-editor/src/scene-controller.js`)
   - Real-time operation execution
   - Selection handling for curvature operations
   - Undo/redo support

3. **Transformation Panel UI** (`src-js/views-editor/src/panel-transformation.js`)
   - Curvature operation controls
   - Parameter adjustment widgets
   - Visual feedback mechanisms

## Detailed Implementation

### 1. Curvatura Math Library

The core mathematical functions have been implemented in `curvatura.js` with the following key operations:

- `side()`: Calculate signed distance from point to line
- `directionAtStart()`: Get direction vector at curve start
- `curvatureAtStart()`: Calculate curvature at curve start
- `inflection()`: Find inflection points in cubic Bézier curves
- `tunnify()`: Balance handle lengths according to Eduardo Tunni's method
- `harmonizeCubic()` / `harmonizeQuadratic()`: Make curves G2-continuous
- `adjustHandles()`: Adjust handles to achieve target curvatures
- `applyCurvaturaOperation()`: Main function to apply operations to paths

### 2. Scene Controller Integration

#### Integration Points

The Curvatura functionality will be integrated into the scene controller to provide real-time operations:

```javascript
// In scene-controller.js
import { applyCurvaturaOperation } from "@fontra/core/curvatura.js";

// Add methods for curvature operations
async performCurvaturaOperation(operation, senderID) {
  return await this.editLayersAndRecordChanges((layerGlyphs) => {
    let undoLabel;
    for (const [layerName, layerGlyph] of Object.entries(layerGlyphs)) {
      applyCurvaturaOperation(
        operation, 
        layerGlyph.path, 
        this.selection, 
        this.selection.size === 0  // isGlyphVariant
      );
    }
    undoLabel = `curvatura ${operation}`;
    return undoLabel;
  }, senderID);
}
```

#### Key Features

1. **Real-time Processing**: Operations execute immediately when applied
2. **Selection Awareness**: Operations respect current point selections
3. **Layer Support**: Operations work across multiple editing layers
4. **Undo/Redo**: Full integration with Fontra's undo system
5. **Change Tracking**: Proper change recording for collaborative editing

### 3. Transformation Panel UI

#### UI Components

The transformation panel will be extended with new curvature operation controls:

1. **Operation Selector**: Dropdown to choose between harmonize, tunnify, inflection, etc.
2. **Parameter Controls**: Sliders for fine-tuning operations (if applicable)
3. **Apply Button**: Execute the selected operation
4. **Preview Toggle**: Enable/disable real-time preview

#### Integration

```javascript
// In panel-transformation.js
import { applyCurvaturaOperation } from "@fontra/core/curvatura.js";

// Add new section to transformation panel
const curvaturaSection = {
  type: "header",
  label: "Curvature Operations"
};

const operationSelector = {
  type: "popup-button",
  key: "curvaturaOperation",
  value: "harmonize",
  items: [
    { key: "harmonize", label: "Harmonize" },
    { key: "tunnify", label: "Tunnify" },
    { key: "inflection", label: "Add Inflection Points" },
    { key: "harmonizehandles", label: "Harmonize Handles" }
  ]
};

const applyButton = {
  type: "button",
  title: "Apply",
  callback: () => {
    this.sceneController.performCurvaturaOperation(
      this.transformParameters.curvaturaOperation
    );
 }
};
```

## Implementation Approach

### Phase 1: Core Math Library
- [x] Implement mathematical functions from Curvatura
- [x] Test functions with sample data
- [x] Ensure compatibility with Fontra's path structures

### Phase 2: Scene Controller Integration
- [ ] Add Curvatura operation methods to SceneController
- [ ] Implement selection handling for curvature operations
- [ ] Integrate with undo/redo system
- [ ] Test real-time performance

### Phase 3: UI Integration
- [ ] Extend transformation panel with curvature controls
- [ ] Add visual feedback for operations
- [ ] Implement parameter adjustment UI
- [ ] Test user experience

### Phase 4: Advanced Features
- [ ] Real-time preview of operations
- [ ] Batch processing for multiple glyphs
- [ ] Custom parameter presets
- [ ] Performance optimization

## API Design

### Curvatura Core API

```javascript
// Main operation function
applyCurvaturaOperation(operation, path, selection, isGlyphVariant)

// Individual operation functions
harmonizeContour(path, contourIndex, selection, isGlyphVariant)
tunnifyContour(path, contourIndex, selection, isGlyphVariant)
addInflectionPointsToContour(path, contourIndex, selection, isGlyphVariant)
harmonizeHandlesContour(path, contourIndex, selection, isGlyphVariant)
```

### Scene Controller API

```javascript
// Methods added to SceneController
performCurvaturaOperation(operation, senderID)
getCurvaturaSelectionInfo()
isCurvaturaOperationAvailable(operation)
```

### UI API

```javascript
// Methods for transformation panel
updateCurvaturaControls()
applyCurvaturaOperation(operation)
setCurvaturaParameter(param, value)
```

## Data Flow

1. User selects points in glyph editor
2. User chooses curvature operation from transformation panel
3. UI sends operation request to scene controller
4. Scene controller applies operation to selected layers using curvatura library
5. Changes are recorded and broadcast to other clients
6. Results are displayed in real-time

## Error Handling

- Invalid selections are handled gracefully
- Operations on incompatible path types are prevented
- Numerical errors in calculations are caught and managed
- Undo system preserves state before operations

## Performance Considerations

- Operations should complete within 100ms for responsive UI
- Complex calculations should be optimized or run asynchronously
- Path validation should be efficient
- Memory usage should be minimal during operations

## Testing Strategy

1. Unit tests for mathematical functions
2. Integration tests for scene controller operations
3. UI tests for transformation panel controls
4. Performance tests with complex glyphs
5. Compatibility tests with different path structures

## Future Enhancements

1. Advanced curvature analysis visualization
2. Custom curvature target functions
3. Batch processing across multiple glyphs
4. Machine learning-based curve optimization
5. Integration with variable font technology

## Conclusion

This design provides a comprehensive approach to implementing Curvatura functionality in Fontra. The modular architecture separates mathematical operations from UI concerns while maintaining tight integration with Fontra's existing systems. The implementation will provide powerful curvature-based operations while maintaining the performance and user experience standards of Fontra.