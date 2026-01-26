import { doPerformAction } from "@fontra/core/actions.js";
import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector } from "@fontra/core/changes.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { generateContoursFromSkeleton } from "@fontra/core/skeleton-contour-generator.js";
import { parseSelection } from "@fontra/core/utils.js";
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

    // Flag to prevent form rebuild during slider drag
    this._isDraggingSlider = false;

    // Cache for avoiding unnecessary form rebuilds
    this._lastStateSignature = null;

    // Listen to selection changes to update UI
    // Skip update if dragging slider to prevent form rebuild interrupting drag
    this.sceneController.sceneSettingsController.addKeyListener(
      ["selectedGlyph", "selectedGlyphName", "selection"],
      (event) => {
        if (!this._isDraggingSlider) {
          this.update();
        }
      }
    );

    // Listen to source (editing layer) changes to update Default Width
    this.sceneController.sceneSettingsController.addKeyListener(
      ["editingLayers"],
      () => {
        if (!this._isDraggingSlider) {
          this.update();
        }
      }
    );

    // Listen to glyph changes (e.g., rib editing through canvas)
    // Skip update if dragging slider to prevent form rebuild interrupting drag
    this.sceneController.sceneSettingsController.addKeyListener(
      "positionedLines",
      () => {
        if (!this._isDraggingSlider) {
          this.update();
        }
      }
    );
  }

  getContentElement() {
    return html.div({ class: "panel" }, []);
  }

  async toggle(on, focus) {
    if (on) this.update();
  }

  async update() {
    // Check if state actually changed to avoid unnecessary rebuilds
    const stateSignature = this._computeStateSignature();
    if (stateSignature === this._lastStateSignature) {
      return; // No change, skip rebuild
    }
    this._lastStateSignature = stateSignature;

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

    // === FLIP ===
    formContents.push({ type: "spacer" });
    formContents.push({
      type: "header",
      label: "Flip Skeleton Points",
    });

    formContents.push({
      type: "universal-row",
      field1: {
        type: "auxiliaryElement",
        key: "FlipHorizontally",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/flip-horizontal.svg",
          "onclick": () => doPerformAction("action.selection-transformation.flip.horizontally"),
          "class": "ui-form-icon ui-form-icon-button",
          "data-tooltip": translate("sidebar.selection-transformation.flip.horizontally"),
          "data-tooltipposition": "bottom-left",
        }),
      },
      field2: {
        type: "auxiliaryElement",
        key: "FlipVertically",
        auxiliaryElement: html.createDomElement("icon-button", {
          "src": "/tabler-icons/flip-vertical.svg",
          "onclick": () => doPerformAction("action.selection-transformation.flip.vertically"),
          "class": "ui-form-icon",
          "data-tooltip": translate("sidebar.selection-transformation.flip.vertically"),
          "data-tooltipposition": "bottom",
        }),
      },
      field3: {
        type: "spacer",
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
    const multiSelection = hasSelection && selectedData.points.length > 1;

    // Get values: from selected points or defaults
    let left, right, leftMixed = false, rightMixed = false;
    let asymStates = new Set(); // Track asymmetric states across selection
    let forceHorizontalStates = new Set(); // Track forceHorizontal states
    let forceVerticalStates = new Set(); // Track forceVertical states

    if (hasSelection) {
      const defaultWidth = this._getCurrentDefaultWidthWide();

      // Collect all values from selected points
      const leftValues = [];
      const rightValues = [];

      for (const { point } of selectedData.points) {
        const widths = this._getPointWidths(point, defaultWidth);
        leftValues.push(Math.round(widths.left));
        rightValues.push(Math.round(widths.right));
        asymStates.add(this._isAsymmetric(point));
        forceHorizontalStates.add(!!point.forceHorizontal);
        forceVerticalStates.add(!!point.forceVertical);
      }

      // Check if values are mixed
      const allLeftSame = leftValues.every(v => v === leftValues[0]);
      const allRightSame = rightValues.every(v => v === rightValues[0]);

      left = allLeftSame ? leftValues[0] : null;
      right = allRightSame ? rightValues[0] : null;
      leftMixed = !allLeftSame;
      rightMixed = !allRightSame;

      // Sync UI state from selection
      // If all points have same state, sync to that state
      // If mixed, keep current UI state (will show indeterminate)
      if (asymStates.size === 1) {
        this.pointParameters.asymmetrical = asymStates.has(true);
      }
    } else {
      // No selection - show Source Width / 2
      const defaultWide = this._getCurrentDefaultWidthWide();
      left = defaultWide / 2;
      right = defaultWide / 2;
    }

    // Determine checkbox state
    const isAsym = this.pointParameters.asymmetrical;
    const isIndeterminate = asymStates.size > 1; // Mixed asym states

    // Header with Asymmetrical toggle
    // When indeterminate, set checked=false so first click turns ON
    const checkbox = html.input({
      type: "checkbox",
      id: "asymmetrical-toggle",
      checked: isIndeterminate ? false : isAsym,
      onchange: (e) => this._onAsymmetricalToggle(e.target.checked),
    });
    // Set indeterminate state after creation (can't be set via attribute)
    if (isIndeterminate) {
      checkbox.indeterminate = true;
    }

    formContents.push({
      type: "header",
      label: "Point Parameters",
      auxiliaryElement: html.span({}, [
        checkbox,
        html.label({ for: "asymmetrical-toggle", style: "margin-left: 4px" }, "Asym"),
      ]),
    });

    // Width fields (Left / Right) - show "mixed" placeholder if values differ
    formContents.push({
      type: "edit-number",
      key: "pointWidthLeft",
      label: "Left",
      value: leftMixed ? null : Math.round(left),
      placeholder: leftMixed ? "mixed" : undefined,
      minValue: 1,
      allowEmptyField: leftMixed,
    });
    formContents.push({
      type: "edit-number",
      key: "pointWidthRight",
      label: "Right",
      value: rightMixed ? null : Math.round(right),
      placeholder: rightMixed ? "mixed" : undefined,
      minValue: 1,
      allowEmptyField: rightMixed,
    });

    // Distribution slider (only in asymmetric mode)
    if (isAsym && !isIndeterminate) {
      // When values are mixed, show slider at neutral (0) position
      const distributionMixed = leftMixed || rightMixed;
      const distribution = distributionMixed ? 0 : this._calculateDistribution(left, right);
      formContents.push({
        type: "edit-number-slider",
        key: "pointDistribution",
        label: "Distribution",
        value: distribution,
        minValue: -100,
        defaultValue: 0,
        maxValue: 100,
        step: 2,
      });
    }

    // Scale slider (last)
    formContents.push({
      type: "edit-number-slider",
      key: "pointWidthScale",
      label: "Scale",
      value: this.pointParameters.scaleValue,
      minValue: 0.2,
      defaultValue: 1.0,
      maxValue: 2.0,
      step: 0.2,
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

    // === ANGLE OVERRIDE ===
    formContents.push({ type: "spacer" });
    formContents.push({
      type: "header",
      label: "Angle",
    });

    // Determine checkbox states for angle override
    const isForceHorizontal = forceHorizontalStates.has(true) && forceHorizontalStates.size === 1;
    const isForceVertical = forceVerticalStates.has(true) && forceVerticalStates.size === 1;
    const isHorizontalIndeterminate = forceHorizontalStates.size > 1;
    const isVerticalIndeterminate = forceVerticalStates.size > 1;

    // Force Horizontal checkbox
    const forceHorizontalCheckbox = html.input({
      type: "checkbox",
      id: "force-horizontal-toggle",
      checked: isHorizontalIndeterminate ? false : isForceHorizontal,
      onchange: (e) => this._onForceHorizontalToggle(e.target.checked),
    });
    if (isHorizontalIndeterminate) {
      forceHorizontalCheckbox.indeterminate = true;
    }

    // Force Vertical checkbox
    const forceVerticalCheckbox = html.input({
      type: "checkbox",
      id: "force-vertical-toggle",
      checked: isVerticalIndeterminate ? false : isForceVertical,
      onchange: (e) => this._onForceVerticalToggle(e.target.checked),
    });
    if (isVerticalIndeterminate) {
      forceVerticalCheckbox.indeterminate = true;
    }

    formContents.push({
      type: "universal-row",
      field1: {
        type: "auxiliaryElement",
        key: "forceHorizontal",
        auxiliaryElement: html.span({}, [
          forceHorizontalCheckbox,
          html.label({ for: "force-horizontal-toggle", style: "margin-left: 4px" }, "Vertical"),
        ]),
      },
      field2: {
        type: "auxiliaryElement",
        key: "forceVertical",
        auxiliaryElement: html.span({}, [
          forceVerticalCheckbox,
          html.label({ for: "force-vertical-toggle", style: "margin-left: 4px" }, "Horizontal"),
        ]),
      },
      field3: {
        type: "spacer",
      },
    });

    this.infoForm.setFieldDescriptions(formContents);

    this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
      if (fieldItem.key === "defaultSkeletonWidthWide") {
        await this._setDefaultSkeletonWidth(SKELETON_DEFAULT_WIDTH_WIDE_KEY, value);
      } else if (fieldItem.key === "defaultSkeletonWidthNarrow") {
        await this._setDefaultSkeletonWidth(SKELETON_DEFAULT_WIDTH_NARROW_KEY, value);
      } else if (fieldItem.key === "pointWidthLeft" || fieldItem.key === "pointWidthRight") {
        await this._setPointWidth(fieldItem.key, value);
      } else if (fieldItem.key === "pointWidthScale") {
        // Protect scale slider from form rebuilds during drag
        if (valueStream) {
          this._isDraggingSlider = true;
          try {
            for await (const v of valueStream) {
              this.pointParameters.scaleValue = v;
            }
          } finally {
            this._isDraggingSlider = false;
          }
        } else {
          this.pointParameters.scaleValue = value;
        }
      } else if (fieldItem.key === "pointDistribution") {
        // For distribution slider, consume valueStream but apply changes directly
        // This preserves totalWidth during the entire drag operation
        if (valueStream) {
          this._isDraggingSlider = true;
          try {
            for await (const dist of valueStream) {
              await this._setPointDistributionDirect(dist);
            }
          } finally {
            this._isDraggingSlider = false;
            this.update(); // Update form after drag ends
          }
        } else {
          await this._setPointDistributionDirect(value);
        }
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
   * Also handles skeletonRibPoint selection (extracts parent skeleton point).
   * @returns {Object|null} Object with points array, skeletonData, layer, editLayerName or null
   */
  _getSelectedSkeletonPoints() {
    const { skeletonPoint, skeletonRibPoint } = parseSelection(this.sceneController.selection);

    // Collect unique point keys from both skeletonPoint and skeletonRibPoint
    const pointKeys = new Set();

    if (skeletonPoint) {
      for (const key of skeletonPoint) {
        pointKeys.add(key); // Format: "contourIdx/pointIdx"
      }
    }

    if (skeletonRibPoint) {
      for (const key of skeletonRibPoint) {
        // Format: "contourIdx/pointIdx/side" - extract "contourIdx/pointIdx"
        const parts = key.split("/");
        pointKeys.add(`${parts[0]}/${parts[1]}`);
      }
    }

    if (pointKeys.size === 0) return null;

    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    const editLayerName = this.sceneController.editingLayerNames?.[0];
    const layer = positionedGlyph?.varGlyph?.glyph?.layers?.[editLayerName];
    const skeletonData = layer?.customData?.[SKELETON_CUSTOM_DATA_KEY];
    if (!skeletonData) return null;

    const points = [];
    for (const key of pointKeys) {
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
   * Compute a signature string representing the current state.
   * Used to detect if form rebuild is actually needed.
   * @returns {string} State signature
   */
  _computeStateSignature() {
    const parts = [];

    // Include source widths
    parts.push(`wide:${this._getCurrentDefaultWidthWide()}`);
    parts.push(`narrow:${this._getCurrentDefaultWidthNarrow()}`);

    // Include selection
    const selection = this.sceneController.selection;
    parts.push(`sel:${selection ? [...selection].sort().join(",") : ""}`);

    // Include selected point values
    const selectedData = this._getSelectedSkeletonPoints();
    if (selectedData) {
      const defaultWidth = this._getCurrentDefaultWidthWide();
      for (const { contourIdx, pointIdx, point } of selectedData.points) {
        const widths = this._getPointWidths(point, defaultWidth);
        parts.push(
          `p${contourIdx}/${pointIdx}:` +
            `${Math.round(widths.left)},${Math.round(widths.right)},` +
            `${this._isAsymmetric(point)},${!!point.forceHorizontal},${!!point.forceVertical}`
        );
      }
    }

    return parts.join("|");
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
   * Check if a point is in asymmetric mode.
   * Returns true if the point has separate leftWidth/rightWidth properties,
   * regardless of whether they're equal or different.
   * @param {Object} point - The skeleton point
   * @returns {boolean} True if asymmetric mode
   */
  _isAsymmetric(point) {
    // Asymmetric mode = has leftWidth or rightWidth defined
    // Symmetric mode = only has width (or no width, using default)
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
   * When clicked from indeterminate state (mixed asym flags), sets all to checked (asym).
   * Then subsequent clicks toggle between all-asym and all-symmetric.
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
      const allChanges = [];

      // Apply changes to ALL editable layers (multi-source editing support)
      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = JSON.parse(
          JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
        );

        for (const { contourIdx, pointIdx } of selectedData.points) {
          const contour = skeletonData.contours[contourIdx];
          if (!contour) continue;
          const point = contour.points[pointIdx];
          if (!point) continue;

          const defaultWidth = contour.defaultWidth || this._getCurrentDefaultWidthWide();

          if (checked) {
            // Convert to asymmetric: split width into leftWidth/rightWidth
            // Preserve existing values if already asymmetric
            const leftHW = point.leftWidth ?? (point.width ?? defaultWidth) / 2;
            const rightHW = point.rightWidth ?? (point.width ?? defaultWidth) / 2;
            point.leftWidth = leftHW;
            point.rightWidth = rightHW;
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

        // Record changes for this layer
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          this._regenerateOutlineContours(sg, skeletonData);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        const customDataChange = recordChanges(layer, (l) => {
          l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      if (allChanges.length === 0) return;

      const combined = new ChangeCollector().concat(...allChanges);
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
   * Toggle Force Horizontal angle override on selected skeleton points.
   * When enabled, clears Force Vertical (mutually exclusive).
   */
  async _onForceHorizontalToggle(checked) {
    const selectedData = this._getSelectedSkeletonPoints();
    if (!selectedData) {
      this.update();
      return;
    }

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = JSON.parse(
          JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
        );

        for (const { contourIdx, pointIdx } of selectedData.points) {
          const contour = skeletonData.contours[contourIdx];
          if (!contour) continue;
          const point = contour.points[pointIdx];
          if (!point) continue;

          if (checked) {
            point.forceHorizontal = true;
            delete point.forceVertical; // Mutually exclusive
          } else {
            delete point.forceHorizontal;
          }
        }

        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          this._regenerateOutlineContours(sg, skeletonData);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        const customDataChange = recordChanges(layer, (l) => {
          l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      if (allChanges.length === 0) return;

      const combined = new ChangeCollector().concat(...allChanges);
      await sendIncrementalChange(combined.change);

      return {
        changes: combined,
        undoLabel: checked ? "Enable force horizontal" : "Disable force horizontal",
        broadcast: true,
      };
    });

    this.update();
  }

  /**
   * Toggle Force Vertical angle override on selected skeleton points.
   * When enabled, clears Force Horizontal (mutually exclusive).
   */
  async _onForceVerticalToggle(checked) {
    const selectedData = this._getSelectedSkeletonPoints();
    if (!selectedData) {
      this.update();
      return;
    }

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = JSON.parse(
          JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
        );

        for (const { contourIdx, pointIdx } of selectedData.points) {
          const contour = skeletonData.contours[contourIdx];
          if (!contour) continue;
          const point = contour.points[pointIdx];
          if (!point) continue;

          if (checked) {
            point.forceVertical = true;
            delete point.forceHorizontal; // Mutually exclusive
          } else {
            delete point.forceVertical;
          }
        }

        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          this._regenerateOutlineContours(sg, skeletonData);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        const customDataChange = recordChanges(layer, (l) => {
          l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      if (allChanges.length === 0) return;

      const combined = new ChangeCollector().concat(...allChanges);
      await sendIncrementalChange(combined.change);

      return {
        changes: combined,
        undoLabel: checked ? "Enable force vertical" : "Disable force vertical",
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
      const allChanges = [];

      // Apply changes to ALL editable layers (multi-source editing support)
      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = JSON.parse(
          JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
        );

        for (const { contourIdx, pointIdx } of selectedData.points) {
          const contour = skeletonData.contours[contourIdx];
          if (!contour) continue;
          const point = contour.points[pointIdx];
          if (!point) continue;

          const defaultWidth = contour.defaultWidth || this._getCurrentDefaultWidthWide();

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

        // Record changes for this layer
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          this._regenerateOutlineContours(sg, skeletonData);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        const customDataChange = recordChanges(layer, (l) => {
          l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      if (allChanges.length === 0) return;

      const combined = new ChangeCollector().concat(...allChanges);
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
   * Apply scale to selected points. Multiplies current width by scale factor.
   */
  async _applyScaleToSelectedPoints() {
    const scale = this.pointParameters.scaleValue;
    console.log("Applying scale:", scale);
    if (scale === 1.0) return;

    // Get fresh selection data
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return;

    const { skeletonPoint, skeletonRibPoint } = parseSelection(this.sceneController.selection);

    // Collect unique point keys
    const pointKeys = new Set();
    if (skeletonPoint) {
      for (const key of skeletonPoint) pointKeys.add(key);
    }
    if (skeletonRibPoint) {
      for (const key of skeletonRibPoint) {
        const parts = key.split("/");
        pointKeys.add(`${parts[0]}/${parts[1]}`);
      }
    }
    if (pointKeys.size === 0) return;

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      // Apply changes to ALL editable layers (multi-source editing support)
      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        const originalSkeletonData = layer?.customData?.[SKELETON_CUSTOM_DATA_KEY];
        if (!originalSkeletonData) continue;

        // Clone skeleton data for modification
        const newSkeletonData = JSON.parse(JSON.stringify(originalSkeletonData));

        for (const key of pointKeys) {
          const [contourIdx, pointIdx] = key.split("/").map(Number);
          const contour = newSkeletonData.contours[contourIdx];
          const point = contour?.points[pointIdx];
          if (!point || point.type) continue; // Skip off-curve points

          // Get current effective widths using the same logic as UI display
          const defaultWidth = contour.defaultWidth || this._getCurrentDefaultWidthWide();
          const currentLeft = point.leftWidth ?? (point.width ?? defaultWidth) / 2;
          const currentRight = point.rightWidth ?? (point.width ?? defaultWidth) / 2;

          // Apply scale
          const newLeft = Math.round(currentLeft * scale);
          const newRight = Math.round(currentRight * scale);

          // Store result - preserve symmetric/asymmetric mode
          if (point.leftWidth !== undefined || point.rightWidth !== undefined) {
            // Was asymmetric - keep asymmetric
            point.leftWidth = newLeft;
            point.rightWidth = newRight;
            delete point.width;
          } else {
            // Was symmetric (or default) - keep symmetric
            point.width = newLeft + newRight;
            delete point.leftWidth;
            delete point.rightWidth;
          }
        }

        // Record changes for this layer
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          this._regenerateOutlineContours(sg, newSkeletonData);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        const customDataChange = recordChanges(layer, (l) => {
          l.customData[SKELETON_CUSTOM_DATA_KEY] = newSkeletonData;
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      if (allChanges.length === 0) return;

      const combined = new ChangeCollector().concat(...allChanges);
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
   * Set point distribution directly. Called for each slider value during drag.
   * Preserves total width by storing it on first call of drag operation.
   */
  async _setPointDistributionDirect(distribution) {
    const selectedData = this._getSelectedSkeletonPoints();
    if (!selectedData) return;

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      // Apply changes to ALL editable layers (multi-source editing support)
      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = JSON.parse(
          JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
        );

        for (const { contourIdx, pointIdx } of selectedData.points) {
          const contour = skeletonData.contours[contourIdx];
          if (!contour) continue;
          const point = contour.points[pointIdx];
          if (!point) continue;

          const defaultWidth = contour.defaultWidth || this._getCurrentDefaultWidthWide();

          // Get current total width (leftHW + rightHW)
          const leftHW = point.leftWidth ?? (point.width ?? defaultWidth) / 2;
          const rightHW = point.rightWidth ?? (point.width ?? defaultWidth) / 2;
          const totalWidth = leftHW + rightHW;

          // Calculate new widths based on distribution
          const newLeftHW = totalWidth * (0.5 + distribution / 200);
          const newRightHW = totalWidth - newLeftHW;

          point.leftWidth = Math.max(0, Math.round(newLeftHW));
          point.rightWidth = Math.max(0, Math.round(newRightHW));
          delete point.width;
        }

        // Record changes for this layer
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          this._regenerateOutlineContours(sg, skeletonData);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        const customDataChange = recordChanges(layer, (l) => {
          l.customData[SKELETON_CUSTOM_DATA_KEY] = skeletonData;
        });
        allChanges.push(customDataChange.prefixed(["layers", editLayerName]));
      }

      if (allChanges.length === 0) return;

      const combined = new ChangeCollector().concat(...allChanges);
      await sendIncrementalChange(combined.change, true);

      return {
        changes: combined,
        undoLabel: "Set point distribution",
        broadcast: true,
      };
    });
  }
}

customElements.define("panel-skeleton-parameters", SkeletonParametersPanel);
