import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { Form } from "@fontra/web-components/ui-form.js";
import Panel from "./panel.js";
import {
  visualizationLayerDefinitions,
} from "./visualization-layer-definitions.js";

export default class VisualizationSettingsPanel extends Panel {
  identifier = "visualization-settings";
  iconPath = "/tabler-icons/eye.svg";

  constructor(editorController) {
    super(editorController);
    this.infoForm = new Form();
    this.contentElement.appendChild(
      html.div(
        { class: "panel-section panel-section--flex panel-section--scrollable" },
        [this.infoForm]
      )
    );
    
    this.visualizationLayersSettings = this.editorController.visualizationLayersSettings;
    
    // Listen for changes to visualization layer settings
    this.visualizationLayersSettings.addListener((event) => {
      this.update();
    }, true);
  }

  getContentElement() {
    return html.div(
      {
        class: "panel",
      },
      []
    );
  }

  async update() {
    if (!this.infoForm.contentElement || !this.infoForm.contentElement.offsetParent) {
      // If the info form is not visible, do nothing
      return;
    }

    const formContents = [];
    
    formContents.push({
      type: "header",
      label: translate("sidebar.visualization-settings.title"),
    });

    // Get user-switchable visualization layers
    const userSwitchableLayers = visualizationLayerDefinitions
      .filter((layer) => layer.userSwitchable)
      // Sort layers by name for consistent ordering
      .sort((a, b) => {
        const nameA = a.dontTranslate ? a.name : translate(a.name);
        const nameB = b.dontTranslate ? b.name : translate(b.name);
        return nameA.localeCompare(nameB);
      });

    // Add a toggle for each user-switchable layer
    for (const layerDef of userSwitchableLayers) {
      const checkboxID = `visualization-layer-${layerDef.identifier}`;
      const checkboxElement = html.createDomElement("input", {
        type: "checkbox",
        id: checkboxID,
        checked: this.visualizationLayersSettings.model[layerDef.identifier],
        onchange: (event) => this._toggleLayer(layerDef.identifier, event.target.checked)
      });
      
      const labelElement = html.label(
        {
          for: checkboxID,
          style: "white-space: nowrap; margin-left: 0.5em; cursor: pointer;"
        },
        [layerDef.dontTranslate ? layerDef.name : translate(layerDef.name)]
      );
      
      // Create a container div that holds both checkbox and label
      const containerElement = html.div(
        {
          style: "display: flex; align-items: center;"
        },
        [checkboxElement, labelElement]
      );
      
      formContents.push({
        type: "single-icon",
        element: containerElement
      });
      
      // Add slider for line thickness if the layer has strokeWidth parameter
      if (layerDef.screenParameters && layerDef.screenParameters.strokeWidth !== undefined) {
        const sliderID = `visualization-layer-${layerDef.identifier}-strokeWidth`;
        const sliderElement = html.createDomElement("input", {
          type: "range",
          id: sliderID,
          min: "0.1",
          max: "5",
          step: "0.1",
          value: layerDef.screenParameters.strokeWidth,
          style: "width: 100%; margin: 0.5em 0;",
          oninput: (event) => this._changeStrokeWidth(layerDef.identifier, event.target.value)
        });
        
        const sliderLabelElement = html.div(
          {
            style: "margin-left: 1.5em; font-size: 0.9em; color: #888;"
          },
          [translate("sidebar.visualization-settings.line-thickness")]
        );
        
        formContents.push({
          type: "single-icon",
          element: sliderElement
        });
        
        formContents.push({
          type: "single-icon",
          element: sliderLabelElement
        });
      }
    }

    this.infoForm.setFieldDescriptions(formContents);
  }

  _toggleLayer(layerID, onOff) {
    this.visualizationLayersSettings.model[layerID] = onOff;
    // The VisualizationLayers class already listens for these changes
    // and will update the canvas accordingly
    this.editorController.canvasController.requestUpdate();
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
    }
  }

  _changeStrokeWidth(layerID, strokeWidth) {
    // Set the parameter override for strokeWidth
    this.editorController.visualizationLayers.setParameterOverride(layerID, "strokeWidth", parseFloat(strokeWidth));
    // Request an update to the canvas
    this.editorController.canvasController.requestUpdate();
  }
}

customElements.define("panel-visualization-settings", VisualizationSettingsPanel);