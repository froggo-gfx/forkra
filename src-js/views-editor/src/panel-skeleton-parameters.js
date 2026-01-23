import { doPerformAction } from "@fontra/core/actions.js";
import { recordChanges } from "@fontra/core/change-recorder.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { Form } from "@fontra/web-components/ui-form.js";
import Panel from "./panel.js";

const SKELETON_DEFAULT_WIDTH_WIDE_KEY = "fontra.skeleton.defaultWidthWide";
const SKELETON_DEFAULT_WIDTH_NARROW_KEY = "fontra.skeleton.defaultWidthNarrow";
const DEFAULT_WIDTH_WIDE = 80;
const DEFAULT_WIDTH_NARROW = 40;

export default class SkeletonParametersPanel extends Panel {
  identifier = "skeleton-parameters";
  iconPath = "/tabler-icons/bone.svg";

  constructor(editorController) {
    super(editorController);
    this.infoForm = new Form();
    this.contentElement.appendChild(
      html.div(
        { class: "panel-section panel-section--flex panel-section--scrollable" },
        [this.infoForm]
      )
    );
    this.sceneController = this.editorController.sceneController;
    this.fontController = this.editorController.fontController;

    // Shared parameters (customDistributionSpacing is used by TransformationPanel's action)
    this.parameters = {
      customDistributionSpacing: null,
    };

    // Listen to selection changes to update UI
    this.sceneController.sceneSettingsController.addKeyListener(
      ["selectedGlyph", "selectedGlyphName", "selection"],
      (event) => this.update()
    );

    // Listen to source (editing layer) changes to update Default Width
    this.sceneController.sceneSettingsController.addKeyListener(
      ["editingLayers"],
      () => this.update()
    );
  }

  getContentElement() {
    return html.div({ class: "panel" }, []);
  }

  async toggle(on, focus) {
    if (on) this.update();
  }

  async update() {
    const formContents = [];

    // === SOURCE WIDTHS ===
    formContents.push({
      type: "header",
      label: "Source Widths",
    });

    formContents.push({
      type: "edit-number",
      key: "defaultSkeletonWidthWide",
      label: "Wide",
      value: this._getCurrentDefaultWidthWide(),
      minValue: 1,
    });

    formContents.push({
      type: "edit-number",
      key: "defaultSkeletonWidthNarrow",
      label: "Narrow",
      value: this._getCurrentDefaultWidthNarrow(),
      minValue: 1,
    });

    // Divider
    formContents.push({
      type: "auxiliaryElement",
      auxiliaryElement: html.hr({ style: "border: none; border-top: 1px solid #ccc; margin: 1em 0;" }),
    });

    // === ALIGN ===
    formContents.push({
      type: "header",
      label: "Align Skeleton Points",
    });

    // Row 1: Left, Center, Right
    formContents.push({
      type: "universal-row",
      field1: {
        type: "auxiliaryElement",
        key: "AlignLeft",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/vertical-align-left.svg",
          "onclick": () => doPerformAction("action.selection-transformation.align.left"),
          "class": "ui-form-icon ui-form-icon-button",
          "data-tooltip": translate("sidebar.selection-transformation.align.left"),
          "data-tooltipposition": "bottom-left",
        }),
      },
      field2: {
        type: "auxiliaryElement",
        key: "AlignCenter",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/vertical-align-center.svg",
          "onclick": () => doPerformAction("action.selection-transformation.align.center"),
          "class": "ui-form-icon",
          "data-tooltip": translate("sidebar.selection-transformation.align.center"),
          "data-tooltipposition": "bottom",
        }),
      },
      field3: {
        type: "auxiliaryElement",
        key: "AlignRight",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/vertical-align-right.svg",
          "onclick": () => doPerformAction("action.selection-transformation.align.right"),
          "class": "ui-form-icon",
          "data-tooltip": translate("sidebar.selection-transformation.align.right"),
          "data-tooltipposition": "bottom-right",
        }),
      },
    });

    // Row 2: Top, Middle, Bottom
    formContents.push({
      type: "universal-row",
      field1: {
        type: "auxiliaryElement",
        key: "AlignTop",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/horizontal-align-top.svg",
          "onclick": () => doPerformAction("action.selection-transformation.align.top"),
          "class": "ui-form-icon ui-form-icon-button",
          "data-tooltip": translate("sidebar.selection-transformation.align.top"),
          "data-tooltipposition": "bottom-left",
        }),
      },
      field2: {
        type: "auxiliaryElement",
        key: "AlignMiddle",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/horizontal-align-center.svg",
          "onclick": () => doPerformAction("action.selection-transformation.align.middle"),
          "class": "ui-form-icon",
          "data-tooltip": translate("sidebar.selection-transformation.align.middle"),
          "data-tooltipposition": "bottom",
        }),
      },
      field3: {
        type: "auxiliaryElement",
        key: "AlignBottom",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/horizontal-align-bottom.svg",
          "onclick": () => doPerformAction("action.selection-transformation.align.bottom"),
          "class": "ui-form-icon",
          "data-tooltip": translate("sidebar.selection-transformation.align.bottom"),
          "data-tooltipposition": "bottom-right",
        }),
      },
    });

    // === DISTRIBUTE ===
    formContents.push({ type: "spacer" });
    formContents.push({
      type: "header",
      label: "Distribute Skeleton Points",
    });

    formContents.push({
      type: "universal-row",
      field1: {
        type: "auxiliaryElement",
        key: "distributeHorizontally",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/layout-distribute-vertical.svg",
          "onclick": () =>
            doPerformAction("action.selection-transformation.distribute.horizontally"),
          "class": "ui-form-icon ui-form-icon-button",
          "data-tooltip": translate(
            "sidebar.selection-transformation.distribute.horizontally"
          ),
          "data-tooltipposition": "top-left",
        }),
      },
      field2: {
        type: "auxiliaryElement",
        key: "distributeVertically",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/layout-distribute-horizontal.svg",
          "onclick": () =>
            doPerformAction("action.selection-transformation.distribute.vertically"),
          "class": "ui-form-icon",
          "data-tooltip": translate(
            "sidebar.selection-transformation.distribute.vertically"
          ),
          "data-tooltipposition": "top",
        }),
      },
      field3: {
        type: "edit-number",
        key: "customDistributionSpacing",
        value: this.parameters.customDistributionSpacing,
        allowEmptyField: true,
        "data-tooltip": translate(
          "sidebar.selection-transformation.distribute.distance-in-units"
        ),
        "data-tooltipposition": "top-right",
      },
    });

    this.infoForm.setFieldDescriptions(formContents);

    this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
      if (fieldItem.key === "defaultSkeletonWidthWide") {
        await this._setDefaultSkeletonWidth(SKELETON_DEFAULT_WIDTH_WIDE_KEY, value);
      } else if (fieldItem.key === "defaultSkeletonWidthNarrow") {
        await this._setDefaultSkeletonWidth(SKELETON_DEFAULT_WIDTH_NARROW_KEY, value);
      } else {
        this.parameters[fieldItem.key] = value;
      }
    };
  }

  /**
   * Get the current default wide skeleton width from the active source's customData.
   * @returns {number} The default wide width value
   */
  _getCurrentDefaultWidthWide() {
    const sourceIdentifier = this.sceneController.editingLayerNames?.[0];
    if (!sourceIdentifier) return DEFAULT_WIDTH_WIDE;

    const source = this.fontController.sources[sourceIdentifier];
    return source?.customData?.[SKELETON_DEFAULT_WIDTH_WIDE_KEY] ?? DEFAULT_WIDTH_WIDE;
  }

  /**
   * Get the current default narrow skeleton width from the active source's customData.
   * @returns {number} The default narrow width value
   */
  _getCurrentDefaultWidthNarrow() {
    const sourceIdentifier = this.sceneController.editingLayerNames?.[0];
    if (!sourceIdentifier) return DEFAULT_WIDTH_NARROW;

    const source = this.fontController.sources[sourceIdentifier];
    return source?.customData?.[SKELETON_DEFAULT_WIDTH_NARROW_KEY] ?? DEFAULT_WIDTH_NARROW;
  }

  /**
   * Set a default skeleton width in the active source's customData.
   * @param {string} key - The customData key to set
   * @param {number} value - The new default width value
   */
  async _setDefaultSkeletonWidth(key, value) {
    const sourceIdentifier = this.sceneController.editingLayerNames?.[0];
    if (!sourceIdentifier) return;

    const root = { sources: this.fontController.sources };
    const changes = recordChanges(root, (r) => {
      if (!r.sources[sourceIdentifier].customData) {
        r.sources[sourceIdentifier].customData = {};
      }
      r.sources[sourceIdentifier].customData[key] = value;
    });

    if (changes.hasChange) {
      await this.fontController.postChange(
        changes.change,
        changes.rollbackChange,
        "Set default skeleton width"
      );
    }
  }
}

customElements.define("panel-skeleton-parameters", SkeletonParametersPanel);
