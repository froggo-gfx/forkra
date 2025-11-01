# Curvatura Implementation Guide for Fontra

## Overview

This guide provides detailed instructions for implementing Curvatura functionality in Fontra. It covers the integration of curvature operations into the scene controller and transformation panel, building upon the mathematical functions already implemented in `curvatura.js`.

## Integration with Scene Controller

### 1. Import the Curvatura Module

First, import the curvatura module in the scene controller:

```javascript
// In src-js/views-editor/src/scene-controller.js
import { applyCurvaturaOperation } from "@fontra/core/curvatura.js";
```

### 2. Add Curvatura Operation Method

Add a new method to the SceneController class to handle curvature operations:

```javascript
// In SceneController class
async performCurvaturaOperation(operation, senderID) {
  if (!this.sceneSettings.selectedGlyph?.isEditing) {
    return;
  }

  return await this.editLayersAndRecordChanges((layerGlyphs) => {
    let undoLabel;
    for (const [layerName, layerGlyph] of Object.entries(layerGlyphs)) {
      // Check if the path contains cubic segments (Curvatura operations require cubic Bézier curves)
      const hasCubicSegments = this._pathHasCubicSegments(layerGlyph.path);
      if (!hasCubicSegments && operation !== "inflection") {
        console.warn(`Operation ${operation} requires cubic segments`);
        continue;
      }

      applyCurvaturaOperation(
        operation, 
        layerGlyph.path, 
        this.selection, 
        this.selection.size === 0  // isGlyphVariant - apply to whole glyph if nothing selected
      );
    }
    undoLabel = `curvatura ${operation}`;
    return undoLabel;
  }, senderID);
}

// Helper method to check if path has cubic segments
_pathHasCubicSegments(path) {
  for (const contourIndex of range(path.numContours)) {
    for (const segment of path.iterContourSegmentPointIndices(contourIndex)) {
      if (segment.type === "cubic") {
        return true;
      }
    }
  }
  return false;
}
```

### 3. Add Action Registration

Register the Curvatura actions in the scene controller:

```javascript
// In the registerActions method of SceneController
registerAction(
  "action.curvatura.harmonize",
  { 
    topic: "0070-action-topics.curvatura",
    titleKey: "sidebar.curvatura.harmonize",
    defaultShortCuts: [{ baseKey: "h", commandKey: true, shiftKey: true }]
  },
  () => this.performCurvaturaOperation("harmonize")
);

registerAction(
 "action.curvatura.tunnify",
  { 
    topic: "0070-action-topics.curvatura", 
    titleKey: "sidebar.curvatura.tunnify",
    defaultShortCuts: [{ baseKey: "t", commandKey: true, shiftKey: true }]
  },
  () => this.performCurvaturaOperation("tunnify")
);

registerAction(
  "action.curvatura.inflection",
  { 
    topic: "0070-action-topics.curvatura", 
    titleKey: "sidebar.curvatura.inflection",
    defaultShortCuts: [{ baseKey: "i", commandKey: true, shiftKey: true }]
  },
  () => this.performCurvaturaOperation("inflection")
);

registerAction(
  "action.curvatura.harmonizehandles",
  { 
    topic: "0070-action-topics.curvatura", 
    titleKey: "sidebar.curvatura.harmonizehandles",
    defaultShortCuts: [{ baseKey: "h", commandKey: true, altKey: true }]
  },
  () => this.performCurvaturaOperation("harmonizehandles")
);
```

## Integration with Transformation Panel

### 1. Import the Curvatura Module

```javascript
// In src-js/views-editor/src/panel-transformation.js
import { applyCurvaturaOperation } from "@fontra/core/curvatura.js";
```

### 2. Extend the Transformation Panel

Add Curvatura controls to the transformation panel by extending the form content:

```javascript
// In the update method of TransformationPanel
async update(senderInfo) {
  // ... existing code ...
  
  // Add Curvatura section before the end
  formContents.push({ type: "spacer" });
  formContents.push({
    type: "header",
    label: translate("sidebar.curvatura.title"),
  });

  const curvaturaOperations = [
    { key: "harmonize", label: translate("sidebar.curvatura.harmonize") },
    { key: "tunnify", label: translate("sidebar.curvatura.tunnify") },
    { key: "inflection", label: translate("sidebar.curvatura.inflection") },
    { key: "harmonizehandles", label: translate("sidebar.curvatura.harmonizehandles") }
  ];

  for (const op of curvaturaOperations) {
    formContents.push({
      type: "button",
      title: op.label,
      value: op.key,
      callback: (value) => {
        this.sceneController.performCurvaturaOperation(value);
      }
    });
  }

  // Add a combined operation with options
  formContents.push({ type: "divider" });
  
  formContents.push({
    type: "popup-button",
    key: "curvaturaOperation",
    value: "harmonize",
    label: translate("sidebar.curvatura.operation"),
    items: curvaturaOperations
  });

  const applyCurvaturaButton = html.createDomElement("icon-button", {
    "src": "/tabler-icons/adjustments.svg",
    "onclick": (event) => {
      this.sceneController.performCurvaturaOperation(
        this.transformParameters.curvaturaOperation
      );
    },
    "class": "ui-form-icon ui-form-icon-button",
    "data-tooltip": translate("sidebar.curvatura.apply-operation"),
    "data-tooltipposition": "top",
  });

  formContents.push({
    type: "button",
    key: "applyCurvatura",
    title: translate("sidebar.curvatura.apply"),
    label: applyCurvaturaButton,
    callback: () => {
      this.sceneController.performCurvaturaOperation(
        this.transformParameters.curvaturaOperation
      );
    }
  });
  
  // ... rest of existing code ...
}
```

### 3. Update Transform Parameters

Add Curvatura-related parameters to the transformParameters object:

```javascript
// In the constructor of TransformationPanel
this.transformParameters = {
  // ... existing parameters ...
  curvaturaOperation: "harmonize",  // Default operation
  // ... other parameters ...
};
```

## Localization Support

Add localization strings for the new Curvatura features:

```javascript
// These would be added to the appropriate localization files
{
  "sidebar.curvatura.title": "Curvature Operations",
  "sidebar.curvatura.harmonize": "Harmonize",
  "sidebar.curvatura.tunnify": "Tunnify",
  "sidebar.curvatura.inflection": "Add Inflection Points",
  "sidebar.curvatura.harmonizehandles": "Harmonize Handles",
  "sidebar.curvatura.operation": "Operation",
  "sidebar.curvatura.apply": "Apply",
  "sidebar.curvatura.apply-operation": "Apply Curvature Operation"
}
```

## Real-time Preview Implementation

For advanced functionality, implement real-time preview of curvature operations:

```javascript
// In SceneController, add a preview method
async previewCurvaturaOperation(operation, previewEnabled) {
  if (!previewEnabled) {
    // Clear any preview
    delete this.sceneModel.curvaturaPreviewPath;
    return;
  }

  // Create a temporary copy of the path to show preview
 const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) return;

  const layerGlyphs = this.getEditingLayerFromGlyphLayers(positionedGlyph.varGlyph.glyph.layers);
  
  for (const [layerName, layerGlyph] of Object.entries(layerGlyphs)) {
    const previewPath = layerGlyph.path.copy();
    applyCurvaturaOperation(
      operation,
      previewPath,
      this.selection,
      this.selection.size === 0
    );
    
    // Store preview path for visualization
    this.sceneModel.curvaturaPreviewPath = previewPath;
    break; // Only preview the first layer
  }
  
  this.canvasController.requestUpdate();
}
```

## Visualization Layer for Curvature

Create a visualization layer to show curvature information:

```javascript
// This would be added to visualization-layer-definitions.js
export const curvaturaVisualizationLayer = {
  identifier: "fontra.curvatura-preview",
  name: "Curvatura Preview",
  selectionMode: "editing",
  userSwitchable: true,
  defaultOn: false,
  zIndex: 600,
  screenParameters: {
    strokeWidth: 1,
    radius: 4,
  },
  colors: {
    previewPath: [0, 0.8, 1, 0.5],  // Light blue with transparency
    inflectionPoints: [1, 0.5, 0, 0.8],  // Orange for inflection points
  },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    if (!positionedGlyph?.varGlyph?.glyph) {
      return;
    }

    const previewPath = model.curvaturaPreviewPath;
    if (!previewPath) {
      return;
    }

    context.strokeStyle = `rgba(${parameters.colors.previewPath.map(c => Math.round(c * 255)).join(',')})`;
    context.lineWidth = parameters.screenParameters.strokeWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    
    const path2d = new Path2D();
    previewPath.drawToPath2d(path2d);
    context.stroke(path2d);
  },
};
```

## Error Handling and Validation

Implement proper error handling for curvature operations:

```javascript
// In the performCurvaturaOperation method, add validation:
async performCurvaturaOperation(operation, senderID) {
  if (!this.sceneSettings.selectedGlyph?.isEditing) {
    return;
  }

  // Validate operation
  const validOperations = ["harmonize", "tunnify", "inflection", "harmonizehandles", "softmerge"];
  if (!validOperations.includes(operation)) {
    console.error(`Invalid Curvatura operation: ${operation}`);
    return;
  }

  // Check if selection is appropriate for the operation
  const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return;
  }

  // Only proceed if there are cubic segments (except for inflection operation)
  if (operation !== "inflection") {
    const hasCubicSegments = this._pathHasCubicSegments(positionedGlyph.glyph.instance.path);
    if (!hasCubicSegments) {
      // Optionally show a message to the user
      console.warn(`Operation ${operation} requires cubic segments`);
      return;
    }
  }

  return await this.editLayersAndRecordChanges((layerGlyphs) => {
    let undoLabel;
    let operationsApplied = false;
    
    for (const [layerName, layerGlyph] of Object.entries(layerGlyphs)) {
      const originalPath = layerGlyph.path.copy();
      applyCurvaturaOperation(
        operation, 
        layerGlyph.path, 
        this.selection, 
        this.selection.size === 0
      );
      
      // Check if the operation actually changed the path
      if (!this._pathsAreEqual(originalPath, layerGlyph.path)) {
        operationsApplied = true;
      }
    }
    
    if (!operationsApplied) {
      console.warn(`Curvatura operation ${operation} did not modify any paths`);
    }
    
    undoLabel = `curvatura ${operation}`;
    return undoLabel;
  }, senderID);
}

// Helper method to compare paths
_pathsAreEqual(path1, path2) {
  if (path1.numContours !== path2.numContours || path1.numPoints !== path2.numPoints) {
    return false;
 }
  
  // Compare coordinates and point types
  for (let i = 0; i < path1.coordinates.length; i++) {
    if (Math.abs(path1.coordinates[i] - path2.coordinates[i]) > 0.001) {
      return false;
    }
  }
  
  for (let i = 0; i < path1.pointTypes.length; i++) {
    if (path1.pointTypes[i] !== path2.pointTypes[i]) {
      return false;
    }
  }
  
  return true;
}
```

## Performance Optimization

For large or complex glyphs, consider performance optimizations:

```javascript
// Add a method to check if an operation should be applied
_shouldApplyCurvaturaOperation(operation, path, selection) {
  // Quick check: if no points are selected and the path is too complex, 
  // warn the user or skip the operation
  if (selection.size === 0) {
    // For whole-glyph operations, check complexity
    if (path.numContours > 10 || path.numPoints > 2000) {
      return confirm("This glyph is very complex. Apply operation to all contours?");
    }
  }
  
  // Check if there are selected cubic segments
  if (selection.size > 0) {
    const { point: pointIndices } = parseSelection(selection);
    if (!pointIndices || pointIndices.length === 0) {
      return false; // No point selection, nothing to operate on
    }
  }
  
  return true;
}
```

## Testing Implementation

Create tests to verify the Curvatura functionality:

```javascript
// Example test file: test-curvatura.js
import { applyCurvaturaOperation } from "@fontra/core/curvatura.js";
import { VarPackedPath } from "@fontra/core/var-path.js";

// Test basic harmonize operation
function testHarmonizeOperation() {
  // Create a simple test path with two cubic segments
  const path = new VarPackedPath();
  path.moveTo(0, 0);
  path.cubicCurveTo(50, 100, 150, 100, 200, 0);  // First segment
  path.cubicCurveTo(250, -100, 350, -100, 400, 0); // Second segment
 path.closePath();
  
  const originalPath = path.copy();
  
  // Apply harmonize operation
 applyCurvaturaOperation("harmonize", path, new Set(), true);
  
  // Verify the path was modified
  console.assert(!pathsAreEqual(originalPath, path), "Path should be modified by harmonize operation");
  
  console.log("Harmonize operation test passed");
}

// Helper function to compare paths
function pathsAreEqual(path1, path2) {
  // Implementation similar to the one in scene controller
  if (path1.numContours !== path2.numContours || path1.numPoints !== path2.numPoints) {
    return false;
  }
  
  for (let i = 0; i < path1.coordinates.length; i++) {
    if (Math.abs(path1.coordinates[i] - path2.coordinates[i]) > 0.01) {
      return false;
    }
  }
  
  return true;
}

// Run tests
testHarmonizeOperation();
```

## Summary

This implementation guide provides a comprehensive approach to integrating Curvatura functionality into Fontra. The design includes:

1. A mathematical core in `curvatura.js` with all necessary algorithms
2. Integration with the scene controller for real-time operations
3. UI controls in the transformation panel
4. Proper error handling and validation
5. Performance considerations for complex glyphs
6. Visualization options for preview and feedback

The implementation maintains compatibility with Fontra's architecture while providing powerful curvature-based operations that were previously only available in FontForge.