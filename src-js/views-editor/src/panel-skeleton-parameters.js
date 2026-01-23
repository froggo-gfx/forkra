import { doPerformAction } from "@fontra/core/actions.js";
import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector } from "@fontra/core/changes.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { generateContoursFromSkeleton } from "@fontra/core/skeleton-contour-generator.js";
import { parseSelection, scheduleCalls } from "@fontra/core/utils.js";
import { packContour } from "@fontra/core/var-path.js";
import { Form } from "@fontra/web-components/ui-form.js";
import Panel from "./panel.js";

const SKELETON_DEFAULT_WIDTH_WIDE_KEY = "fontra.skeleton.defaultWidthWide";
const SKELETON_DEFAULT_WIDTH_NARROW_KEY = "fontra.skeleton.defaultWidthNarrow";
const SKELETON_CUSTOM_DATA_KEY = "fontra.skeleton";
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

    // Point parameters state
    this.pointParameters = {
      asymmetrical: false,
      scaleValue: 1.0,
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

    // Listen to glyph changes (e.g., rib editing through canvas)
    // Use debounced update to avoid excessive redraws during drag
    this._debouncedUpdate = scheduleCalls(() => this.update(), 50);
    this.sceneController.sceneSettingsController.addKeyListener(
      "positionedLines",
      () => this._debouncedUpdate()
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
    formContents.push({ type: "divider" });

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

    // === POINT PARAMETERS (always visible) ===
    formContents.push({ type: "divider" });

    const selectedData = this._getSelectedSkeletonPoints();
    const hasSelection = selectedData && selectedData.points.length > 0;

    // Get values: from selected point or defaults
    let left, right;
    if (hasSelection) {
      const { point } = selectedData.points[0];
      const defaultWidth = this._getCurrentDefaultWidthWide();
      const widths = this._getPointWidths(point, defaultWidth);
      left = widths.left;
      right = widths.right;
      // If point has asymmetric data, sync UI state to true
      if (this._isAsymmetric(point)) {
        this.pointParameters.asymmetrical = true;
      }
    } else {
      // No selection - show Source Width / 2
      const defaultWide = this._getCurrentDefaultWidthWide();
      left = defaultWide / 2;
      right = defaultWide / 2;
    }
    // Use persistent UI state for toggle
    const isAsym = this.pointParameters.asymmetrical;

    // Header with Asymmetrical toggle
    formContents.push({
      type: "header",
      label: "Point Parameters",
      auxiliaryElement: html.span({}, [
        html.input({
          type: "checkbox",
          id: "asymmetrical-toggle",
          checked: isAsym,
          onchange: (e) => this._onAsymmetricalToggle(e.target.checked),
        }),
        html.label({ for: "asymmetrical-toggle", style: "margin-left: 4px" }, "Asym"),
      ]),
    });

    // Width fields (Left / Right)
    formContents.push({
      type: "edit-number",
      key: "pointWidthLeft",
      label: "Left",
      value: Math.round(left),
      minValue: 1,
    });
    formContents.push({
      type: "edit-number",
      key: "pointWidthRight",
      label: "Right",
      value: Math.round(right),
      minValue: 1,
    });

    // Scale slider
    formContents.push({
      type: "edit-number-slider",
      key: "pointWidthScale",
      label: "Scale",
      value: this.pointParameters.scaleValue,
      minValue: 0.2,
      defaultValue: 1.0,
      maxValue: 2.0,
    });

    // Apply Scale button
    formContents.push({
      type: "header",
      label: "",
      auxiliaryElement: html.button(
        {
          onclick: () => this._applyScaleToSelectedPoints(),
          style: "padding: 2px 8px; cursor: pointer;",
        },
        "Apply Scale"
      ),
    });

    // Distribution slider (only in asymmetric mode)
    if (isAsym) {
      const distribution = this._calculateDistribution(left, right);
      formContents.push({
        type: "edit-number-slider",
        key: "pointDistribution",
        label: "Distribution",
        value: distribution,
        minValue: -100,
        defaultValue: 0,
        maxValue: 100,
      });
    }

    this.infoForm.setFieldDescriptions(formContents);

    this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
      if (fieldItem.key === "defaultSkeletonWidthWide") {
        await this._setDefaultSkeletonWidth(SKELETON_DEFAULT_WIDTH_WIDE_KEY, value);
      } else if (fieldItem.key === "defaultSkeletonWidthNarrow") {
        await this._setDefaultSkeletonWidth(SKELETON_DEFAULT_WIDTH_NARROW_KEY, value);
      } else if (fieldItem.key === "pointWidthLeft" || fieldItem.key === "pointWidthRight") {
        await this._setPointWidth(fieldItem.key, value);
      } else if (fieldItem.key === "pointWidthScale") {
        this.pointParameters.scaleValue = value;
      } else if (fieldItem.key === "pointDistribution") {
        await this._setPointDistribution(value, valueStream);
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

  // === POINT PARAMETERS HELPERS ===

  /**
   * Get skeleton points that are currently selected.
   * @returns {Object|null} Object with points array, skeletonData, layer, editLayerName or null
   */
  _getSelectedSkeletonPoints() {
    const { skeletonPoint } = parseSelection(this.sceneController.selection);
    if (!skeletonPoint || skeletonPoint.size === 0) return null;

    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    const editLayerName = this.sceneController.editingLayerNames?.[0];
    const layer = positionedGlyph?.varGlyph?.glyph?.layers?.[editLayerName];
    const skeletonData = layer?.customData?.[SKELETON_CUSTOM_DATA_KEY];
    if (!skeletonData) return null;

    const points = [];
    for (const key of skeletonPoint) {
      const [contourIdx, pointIdx] = key.split("/").map(Number);
      const point = skeletonData.contours[contourIdx]?.points[pointIdx];
      if (point && !point.type) {
        // Only on-curve points
        points.push({ contourIdx, pointIdx, point });
      }
    }
    return points.length > 0 ? { points, skeletonData, layer, editLayerName } : null;
  }

  /**
   * Get the half-widths for a point.
   * @param {Object} point - The skeleton point
   * @param {number} defaultWidth - Default width to use if point has no width
   * @returns {Object} { left, right } half-widths
   */
  _getPointWidths(point, defaultWidth) {
    const leftHW = point.leftWidth ?? (point.width ?? defaultWidth) / 2;
    const rightHW = point.rightWidth ?? (point.width ?? defaultWidth) / 2;
    return { left: leftHW, right: rightHW };
  }

  /**
   * Calculate distribution value from left/right half-widths.
   * @param {number} leftHW - Left half-width
   * @param {number} rightHW - Right half-width
   * @returns {number} Distribution value (-100 to +100)
   */
  _calculateDistribution(leftHW, rightHW) {
    const total = leftHW + rightHW;
    if (total === 0) return 0;
    return Math.round(((leftHW - rightHW) / total) * 100);
  }

  /**
   * Check if a point has asymmetric widths.
   * @param {Object} point - The skeleton point
   * @returns {boolean} True if asymmetric
   */
  _isAsymmetric(point) {
    return point.leftWidth !== undefined || point.rightWidth !== undefined;
  }

  /**
   * Helper to regenerate outline contours from skeleton data.
   */
  _regenerateOutlineContours(staticGlyph, skeletonData) {
    const oldGeneratedIndices = skeletonData.generatedContourIndices || [];
    const sortedIndices = [...oldGeneratedIndices].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
      if (idx < staticGlyph.path.numContours) {
        staticGlyph.path.deleteContour(idx);
      }
    }

    const generatedContours = generateContoursFromSkeleton(skeletonData);
    const newGeneratedIndices = [];
    for (const contour of generatedContours) {
      const newIndex = staticGlyph.path.numContours;
      staticGlyph.path.insertContour(staticGlyph.path.numContours, packContour(contour));
      newGeneratedIndices.push(newIndex);
    }
    skeletonData.generatedContourIndices = newGeneratedIndices;
  }

  /**
   * Handle asymmetrical toggle change.
   */
  async _onAsymmetricalToggle(checked) {
    this.pointParameters.asymmetrical = checked;

    const selectedData = this._getSelectedSkeletonPoints();
    if (!selectedData) {
      this.update();
      return;
    }

    // Convert selected points to/from asymmetric mode
    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const layer = glyph.layers[selectedData.editLayerName];
      const skeletonData = JSON.parse(
        JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
      );

      for (const { contourIdx, pointIdx } of selectedData.points) {
        const point = skeletonData.contours[contourIdx].points[pointIdx];
        const defaultWidth = skeletonData.contours[contourIdx].defaultWidth || this._getCurrentDefaultWidthWide();

        if (checked) {
          // Convert to asymmetric: split width into leftWidth/rightWidth
          const halfWidth = (point.width ?? defaultWidth) / 2;
          point.leftWidth = halfWidth;
          point.rightWidth = halfWidth;
          delete point.width;
        } else {
          // Convert to symmetric: combine leftWidth/rightWidth into width
          const leftHW = point.leftWidth ?? (point.width ?? defaultWidth) / 2;
          const rightHW = point.rightWidth ?? (point.width ?? defaultWidth) / 2;
          point.width = leftHW + rightHW;
          delete point.leftWidth;
          delete point.rightWidth;
        }
      }

      // Record changes
      const changes = [];
      const staticGlyph = layer.glyph;
      const pathChange = recordChanges(staticGlyph, (sg) => {
        this._regenerateOutlineContours(sg, skeletonData);
      });
      changes.push(pathChange.prefixed(["layers", selectedData.editLayerName, "glyph"]));

      const customDataChange = recordChanges(layer, (l) => {
        l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
      });
      changes.push(customDataChange.prefixed(["layers", selectedData.editLayerName]));

      const combined = new ChangeCollector().concat(...changes);
      await sendIncrementalChange(combined.change);

      return {
        changes: combined,
        undoLabel: checked ? "Enable asymmetric width" : "Disable asymmetric width",
        broadcast: true,
      };
    });

    this.update();
  }

  /**
   * Set point width (Left or Right).
   */
  async _setPointWidth(key, value) {
    const selectedData = this._getSelectedSkeletonPoints();
    if (!selectedData) return;

    const isLeft = key === "pointWidthLeft";
    const isAsym = this.pointParameters.asymmetrical;

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const layer = glyph.layers[selectedData.editLayerName];
      const skeletonData = JSON.parse(
        JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
      );

      for (const { contourIdx, pointIdx } of selectedData.points) {
        const point = skeletonData.contours[contourIdx].points[pointIdx];
        const defaultWidth = skeletonData.contours[contourIdx].defaultWidth || this._getCurrentDefaultWidthWide();

        if (isAsym) {
          // Asymmetric mode - edit individual sides
          if (isLeft) {
            point.leftWidth = value;
            if (point.rightWidth === undefined) {
              point.rightWidth = point.width ? point.width / 2 : value;
            }
          } else {
            point.rightWidth = value;
            if (point.leftWidth === undefined) {
              point.leftWidth = point.width ? point.width / 2 : value;
            }
          }
          delete point.width;
        } else {
          // Symmetric mode - change both sides together
          point.width = value * 2;
          delete point.leftWidth;
          delete point.rightWidth;
        }
      }

      // Record changes
      const changes = [];
      const staticGlyph = layer.glyph;
      const pathChange = recordChanges(staticGlyph, (sg) => {
        this._regenerateOutlineContours(sg, skeletonData);
      });
      changes.push(pathChange.prefixed(["layers", selectedData.editLayerName, "glyph"]));

      const customDataChange = recordChanges(layer, (l) => {
        l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
      });
      changes.push(customDataChange.prefixed(["layers", selectedData.editLayerName]));

      const combined = new ChangeCollector().concat(...changes);
      await sendIncrementalChange(combined.change);

      return {
        changes: combined,
        undoLabel: "Set point width",
        broadcast: true,
      };
    });

    this.update();
  }

  /**
   * Apply scale to selected points.
   */
  async _applyScaleToSelectedPoints() {
    const scale = this.pointParameters.scaleValue;
    if (scale === 1.0) return;

    const selectedData = this._getSelectedSkeletonPoints();
    if (!selectedData) return;

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const layer = glyph.layers[selectedData.editLayerName];
      const skeletonData = JSON.parse(
        JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
      );

      for (const { contourIdx, pointIdx } of selectedData.points) {
        const point = skeletonData.contours[contourIdx].points[pointIdx];
        const defaultWidth = skeletonData.contours[contourIdx].defaultWidth || this._getCurrentDefaultWidthWide();

        if (point.leftWidth !== undefined || point.rightWidth !== undefined) {
          // Asymmetric
          const leftHW = point.leftWidth ?? (point.width ?? defaultWidth) / 2;
          const rightHW = point.rightWidth ?? (point.width ?? defaultWidth) / 2;
          point.leftWidth = Math.round(leftHW * scale);
          point.rightWidth = Math.round(rightHW * scale);
          delete point.width;
        } else {
          // Symmetric
          const width = point.width ?? defaultWidth;
          point.width = Math.round(width * scale);
        }
      }

      // Record changes
      const changes = [];
      const staticGlyph = layer.glyph;
      const pathChange = recordChanges(staticGlyph, (sg) => {
        this._regenerateOutlineContours(sg, skeletonData);
      });
      changes.push(pathChange.prefixed(["layers", selectedData.editLayerName, "glyph"]));

      const customDataChange = recordChanges(layer, (l) => {
        l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
      });
      changes.push(customDataChange.prefixed(["layers", selectedData.editLayerName]));

      const combined = new ChangeCollector().concat(...changes);
      await sendIncrementalChange(combined.change);

      return {
        changes: combined,
        undoLabel: `Scale point width by ${scale}`,
        broadcast: true,
      };
    });

    // Reset scale value after applying
    this.pointParameters.scaleValue = 1.0;
    this.update();
  }

  /**
   * Set point distribution. Supports streaming mode for smooth slider dragging.
   */
  async _setPointDistribution(distribution, valueStream) {
    const selectedData = this._getSelectedSkeletonPoints();
    if (!selectedData) return;

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const layer = glyph.layers[selectedData.editLayerName];
      const originalSkeletonData = JSON.parse(
        JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
      );

      // Store original total widths for each point (preserved during drag)
      const pointTotalWidths = [];
      for (const { contourIdx, pointIdx } of selectedData.points) {
        const point = originalSkeletonData.contours[contourIdx].points[pointIdx];
        const defaultWidth = originalSkeletonData.contours[contourIdx].defaultWidth || this._getCurrentDefaultWidthWide();
        const leftHW = point.leftWidth ?? (point.width ?? defaultWidth) / 2;
        const rightHW = point.rightWidth ?? (point.width ?? defaultWidth) / 2;
        pointTotalWidths.push(leftHW + rightHW);
      }

      // Helper to apply distribution value
      const applyDistribution = (skeletonData, dist) => {
        for (let i = 0; i < selectedData.points.length; i++) {
          const { contourIdx, pointIdx } = selectedData.points[i];
          const point = skeletonData.contours[contourIdx].points[pointIdx];
          const totalWidth = pointTotalWidths[i];

          const newLeftHW = totalWidth * (0.5 + dist / 200);
          const newRightHW = totalWidth - newLeftHW;

          point.leftWidth = Math.max(0, Math.round(newLeftHW));
          point.rightWidth = Math.max(0, Math.round(newRightHW));
          delete point.width;
        }
      };

      // Helper to send changes
      const sendChanges = async (skeletonData, mayDrop = false) => {
        const changes = [];
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          this._regenerateOutlineContours(sg, skeletonData);
        });
        changes.push(pathChange.prefixed(["layers", selectedData.editLayerName, "glyph"]));

        const customDataChange = recordChanges(layer, (l) => {
          l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
        });
        changes.push(customDataChange.prefixed(["layers", selectedData.editLayerName]));

        const combined = new ChangeCollector().concat(...changes);
        await sendIncrementalChange(combined.change, mayDrop);
        return combined;
      };

      let finalChanges;

      if (valueStream) {
        // Streaming mode: process all values from slider drag
        for await (const dist of valueStream) {
          const workingSkeletonData = JSON.parse(JSON.stringify(originalSkeletonData));
          applyDistribution(workingSkeletonData, dist);
          finalChanges = await sendChanges(workingSkeletonData, true);
        }
        // Final send without mayDrop flag
        if (finalChanges) {
          await sendIncrementalChange(finalChanges.change);
        }
      } else {
        // Single value mode
        const workingSkeletonData = JSON.parse(JSON.stringify(originalSkeletonData));
        applyDistribution(workingSkeletonData, distribution);
        finalChanges = await sendChanges(workingSkeletonData);
      }

      return {
        changes: finalChanges,
        undoLabel: "Set point distribution",
        broadcast: true,
      };
    });
  }
}

customElements.define("panel-skeleton-parameters", SkeletonParametersPanel);
