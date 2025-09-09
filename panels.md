# Fontra Panel System Documentation

This document provides comprehensive documentation on how settings panels are implemented in Fontra, with a focus on the rotation transform as an example.

## 1. Overview of the Panel System Architecture

Fontra's panel system is built on a modular architecture that allows for flexible and extensible UI components. The system consists of several key components:

### Core Components

1. **Base Panel Class**: The foundation for all panels, providing common functionality and structure.
2. **UI Form Component**: A flexible form system for creating panel content with various input types.
3. **Web Components**: Reusable UI elements like rotary controls, sliders, and buttons.
4. **Scene Controller**: Manages the interaction between panels and the editing canvas.
5. **Edit Behavior System**: Handles how transformations are applied to selected elements.

### Panel Structure

Panels in Fontra follow a consistent structure:

```javascript
class ExamplePanel extends Panel {
  identifier = "example-panel";
  iconPath = "/tabler-icons/example.svg";

  constructor(editorController) {
    super(editorController);
    // Panel initialization
  }

  async update() {
    // Update panel content based on current state
  }

  async toggle(on, focus) {
    // Handle panel visibility changes
  }
}
```

The panel system uses a declarative approach to define UI elements through form descriptions, which are then rendered by the UI Form component.

## 2. How Settings Panels Work

Settings panels in Fontra are implemented using a combination of the base Panel class and the UI Form component. The UI Form provides a flexible way to define various types of input controls and layout structures.

### Form System

The UI Form component supports various field types:

- Text inputs
- Number inputs
- Checkboxes
- Radio buttons
- Sliders
- Custom components (like rotary controls)

Form content is defined through a declarative structure:

```javascript
const formContents = [
  {
    type: "edit-number",
    key: "rotation",
    label: "Rotation",
    value: this.transformParameters.rotation
  },
  // More form fields...
];

this.infoForm.setFieldDescriptions(formContents);
```

### Event Handling

Panels respond to changes in the application state through event listeners:

```javascript
this.sceneController.sceneSettingsController.addKeyListener(
  ["selectedGlyph", "selection"],
  (event) => this.update()
);
```

When form fields change, the `onFieldChange` callback is invoked:

```javascript
this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
  this.transformParameters[fieldItem.key] = value;
  // Handle field change
};
```

## 3. Rotation Transform Implementation

The rotation transform is implemented as part of the Transformation Panel, which provides a comprehensive set of transformation tools.

### UI Implementation

The rotation control in the Transformation Panel uses both a numeric input and a rotary control for intuitive manipulation:

```javascript
formContents.push({
  type: "edit-number",
  key: "rotation",
  label: buttonRotate,
  value: this.transformParameters.rotation,
  onEnterKey: (event) => {
    buttonRotate.click();
  },
});
```

The rotary control is implemented as a custom web component that provides a visual knob for rotation:

```javascript
_addEditAngle(valueElement, fieldItem) {
  const inputElement = html.input({
    type: "number",
    value: fieldItem.value,
    onchange: () => {
      // Handle input change
    },
  });
  
  const rotaryControl = html.createDomElement("rotary-control", {
    value: -fieldItem.value,
  });
  
  rotaryControl.onChangeCallback = (event) => {
    const value = -event.value;
    inputElement.value = value;
    // Handle rotation change
  };
  
  valueElement.appendChild(
    html.div({ style: "display: flex; gap: 0.15rem;" }, [inputElement, rotaryControl])
  );
}
```

### Mathematical Implementation

The actual rotation transformation is implemented using the Transform class:

```javascript
const buttonRotate = html.createDomElement("icon-button", {
  "src": "/tabler-icons/rotate.svg",
  "onclick": (event) =>
    this.transformSelection(
      () =>
        new Transform().rotate((this.transformParameters.rotation * Math.PI) / 180),
      "rotate"
    ),
  // ... other properties
});
```

The Transform class provides a rotate method that creates a rotation matrix:

```javascript
rotate(angle) {
  // Return a new transformation, rotated by 'angle' (radians).
  const c = _normSinCos(Math.cos(angle));
  const s = _normSinCos(Math.sin(angle));
  return this._transform(c, s, -s, c, 0, 0);
}
```

### Transformation Application

When applying a rotation transformation, the system:

1. Calculates the bounding box of the selected elements
2. Determines the pivot point based on the selected origin
3. Applies the transformation relative to the pivot point
4. Updates all layers of the glyph

```javascript
async transformSelection(transformationForLayer, undoLabel) {
  // ... parse selection ...
  
  const staticGlyphControllers = await this.sceneController.getStaticGlyphControllers();
  
  await this.sceneController.editGlyph((sendIncrementalChange, glyph) => {
    const layerInfo = Object.entries(
      this.sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
    ).map(([layerName, layerGlyph]) => {
      const behaviorFactory = new EditBehaviorFactory(
        layerGlyph,
        this.sceneController.selection,
        this.sceneController.selectedTool.scalingEditBehavior
      );
      return {
        layerName,
        changePath: ["layers", layerName, "glyph"],
        layerGlyphController: staticGlyphControllers[layerName],
        editBehavior: behaviorFactory.getTransformBehavior("default"),
      };
    });
    
    const editChanges = [];
    const rollbackChanges = [];
    for (const { changePath, editBehavior, layerGlyphController } of layerInfo) {
      const layerGlyph = layerGlyphController.instance;
      const selectionBounds = layerGlyphController.getSelectionBounds(
        this.sceneController.selection
      );
      const pinPoint = getPinPoint(
        selectionBounds,
        this.transformParameters.originX,
        this.transformParameters.originY
      );
      
      const pinnedTransformation = new Transform()
        .translate(pinPoint.x, pinPoint.y)
        .transform(transformationForLayer(layerGlyphController, selectionBounds))
        .translate(-pinPoint.x, -pinPoint.y);
        
      const editChange = editBehavior.makeChangeForTransformation(pinnedTransformation);
      
      applyChange(layerGlyph, editChange);
      editChanges.push(consolidateChanges(editChange, changePath));
      rollbackChanges.push(
        consolidateChanges(editBehavior.rollbackChange, changePath)
      );
    }
    
    // ... return changes ...
  });
}
```

## 4. Data Flow and State Management

The panel system uses a reactive approach to data flow and state management:

### State Observables

Fontra uses observable objects to track state changes:

```javascript
this.sceneController.sceneSettingsController.addKeyListener(
  ["selectedGlyph", "selection", "fontLocationSourceMapped", "glyphLocation"],
  (event) => this.update()
);
```

### Form State Management

Form fields are bound to internal state variables:

```javascript
this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
  this.transformParameters[fieldItem.key] = value;
  // Update dependent state
};
```

### Undo/Redo System

Transformations are integrated with the undo/redo system through change recording:

```javascript
return {
  changes: changes,
  undoLabel: undoLabel,
  broadcast: true,
};
```

## 5. Interaction with Mouse-Based Tools

The panel system integrates with mouse-based tools through the scene controller and edit behavior system.

### Pointer Tool Integration

The pointer tool provides direct manipulation of selected elements, including rotation:

```javascript
getRotationHandle(event, selection) {
  return this.getTransformSelectionHandle(event, selection, true);
}

handleBoundsTransformSelection(selection, eventStream, initialEvent, rotation = false) {
  // Handle rotation transformation
  if (rotation) {
    const angle = Math.atan2(
      pinPointSelectedLayer.y - currentPoint.y,
      pinPointSelectedLayer.x - currentPoint.x
    );
    const angleInitial = Math.atan2(
      pinPointSelectedLayer.y - initialPoint.y,
      pinPointSelectedLayer.x - initialPoint.x
    );
    // Snap to 45 degrees if shift is pressed
    const rotationAngle = !event.shiftKey
      ? angle - angleInitial
      : Math.round((angle - angleInitial) / (Math.PI / 4)) * (Math.PI / 4);
    transformation = new Transform().rotate(rotationAngle);
  }
  // ... apply transformation ...
}
```

### Visual Feedback

The system provides visual feedback during transformations through visualization layers:

```javascript
registerVisualizationLayerDefinition({
  identifier: "fontra.transform.selection",
  name: "edit-tools-pointer.transform.selection",
  draw: (context, positionedGlyph, parameters, model, controller) => {
    if (!model.showTransformSelection) {
      return;
    }
    // Draw transform handles
    const handles = getTransformHandles(transformBounds, parameters.margin);
    for (const [handleName, handle] of Object.entries(handles)) {
      strokeRoundNode(context, handle, parameters.handleSize);
    }
  },
});
```

## 6. Code Examples and Implementation Details

### Complete Transformation Panel Example

Here's a simplified example of how the transformation panel works:

```javascript
export default class TransformationPanel extends Panel {
  constructor(editorController) {
    super(editorController);
    this.infoForm = new Form();
    this.contentElement.appendChild(
      html.div(
        { class: "panel-section panel-section--flex panel-section--scrollable" },
        [this.infoForm]
      )
    );
    
    this.transformParameters = {
      scaleX: 100,
      scaleY: undefined,
      rotation: 0,
      moveX: 0,
      moveY: 0,
      originX: "center",
      originY: "middle",
    };
    
    // Listen for selection changes
    this.sceneController.sceneSettingsController.addKeyListener(
      ["selectedGlyph", "selection"],
      (event) => this.update()
    );
  }
  
  async update() {
    if (!this.infoForm.contentElement.offsetParent) {
      return;
    }
    
    const formContents = [];
    
    // Add rotation control
    const buttonRotate = html.createDomElement("icon-button", {
      "src": "/tabler-icons/rotate.svg",
      "onclick": (event) =>
        this.transformSelection(
          () =>
            new Transform().rotate((this.transformParameters.rotation * Math.PI) / 180),
          "rotate"
        ),
      "data-tooltip": "Rotate",
    });
    
    formContents.push({
      type: "edit-number",
      key: "rotation",
      label: buttonRotate,
      value: this.transformParameters.rotation,
    });
    
    this.infoForm.setFieldDescriptions(formContents);
    
    this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
      this.transformParameters[fieldItem.key] = value;
    };
  }
  
  async transformSelection(transformationForLayer, undoLabel) {
    // Implementation as shown in previous sections
  }
}
```

### Rotary Control Implementation

The rotary control is a custom web component that provides visual rotation feedback:

```javascript
export class RotaryControl extends html.UnlitElement {
  static styles = `
  .knob {
    width: var(--knob-size);
    height: var(--knob-size);
    border-radius: 50%;
    background: #e3e3e3;
    display: flex;
    justify-content: center;
  }
  
  .knob:before {
    content: "";
    width: var(--thumb-size);
    height: var(--thumb-size);
    background: rgb(89, 89, 89);
    border-radius: 50%;
    margin-top: calc(var(--knob-size) / 8);
  }
  `;
  
  set value(value) {
    this._value = value;
    if (this.knob) {
      this.knob.style.transform = `rotate(${this.value}deg)`;
    }
  }
  
  get value() {
    return this._value;
  }
  
  render() {
    return html.div({ class: "rotary-control" }, [
      (this.knob = html.div(
        {
          class: "knob",
          style: `transform: rotate(${this.value}deg);`,
          onmousedown: (event) => {
            this.positionDragBegin = event.clientY;
            this.angleWhenDragStart = this.value;
            this.dragBegin = true;
            event.preventDefault();
            this.attachOverlay();
          },
        },
        []
      )),
    ]);
  }
}
```

This documentation provides a comprehensive overview of how settings panels are implemented in Fontra, with a detailed look at the rotation transform as a key example of the system's capabilities.