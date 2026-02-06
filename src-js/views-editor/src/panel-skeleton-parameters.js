import { doPerformAction } from "@fontra/core/actions.js";
import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector } from "@fontra/core/changes.js";
import { getGlyphInfoFromGlyphName } from "@fontra/core/glyph-data.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import {
  generateContoursFromSkeleton,
  calculateNormalAtSkeletonPoint,
  getPointHalfWidth,
} from "@fontra/core/skeleton-contour-generator.js";
import { parseSelection } from "@fontra/core/utils.js";
import { packContour, VarPackedPath } from "@fontra/core/var-path.js";
import { Form } from "@fontra/web-components/ui-form.js";
import Panel from "./panel.js";

const SKELETON_CUSTOM_DATA_KEY = "fontra.skeleton";

// Source width keys stored in source customData
const SKELETON_WIDTH_CAPITAL_BASE_KEY = "fontra.skeleton.capitalBase";
const SKELETON_WIDTH_CAPITAL_HORIZONTAL_KEY = "fontra.skeleton.capitalHorizontal";
const SKELETON_WIDTH_CAPITAL_CONTRAST_KEY = "fontra.skeleton.capitalContrast";
const SKELETON_WIDTH_CAPITAL_DISTRIBUTION_KEY = "fontra.skeleton.capitalDistribution";
const SKELETON_WIDTH_LOWERCASE_BASE_KEY = "fontra.skeleton.lowercaseBase";
const SKELETON_WIDTH_LOWERCASE_HORIZONTAL_KEY = "fontra.skeleton.lowercaseHorizontal";
const SKELETON_WIDTH_LOWERCASE_CONTRAST_KEY = "fontra.skeleton.lowercaseContrast";
const SKELETON_WIDTH_LOWERCASE_DISTRIBUTION_KEY = "fontra.skeleton.lowercaseDistribution";

const SKELETON_CAP_RADIUS_RATIO_KEY = "fontra.skeleton.capRadiusRatio";
const SKELETON_CAP_TENSION_KEY = "fontra.skeleton.capTension";
const SKELETON_CAP_ANGLE_KEY = "fontra.skeleton.capAngle";
const SKELETON_CAP_DISTANCE_KEY = "fontra.skeleton.capDistance";

const DEFAULT_WIDTH_CAPITAL_BASE = 60;
const DEFAULT_WIDTH_CAPITAL_HORIZONTAL = 50;
const DEFAULT_WIDTH_CAPITAL_CONTRAST = 40;
const DEFAULT_WIDTH_LOWERCASE_BASE = 60;
const DEFAULT_WIDTH_LOWERCASE_HORIZONTAL = 50;
const DEFAULT_WIDTH_LOWERCASE_CONTRAST = 40;
const DEFAULT_DISTRIBUTION = 0;

const DEFAULT_CAP_RADIUS_RATIO = 1 / 8;
const DEFAULT_CAP_TENSION = 0.55;
const DEFAULT_CAP_ANGLE = 0;
const DEFAULT_CAP_DISTANCE = 0;
const CAP_RADIUS_MIN = 1 / 128;
const CAP_RADIUS_MAX = 1 / 4;
const CAP_RADIUS_POSITIONS = 20;
const CAP_ANGLE_MIN = -85;
const CAP_ANGLE_MAX = 85;

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

    // Contour parameters state (for immediate UI updates)
    this._singleSidedState = {
      enabled: false,
      direction: "left",
    };

    // Flag to prevent form rebuild during slider drag
    this._isDraggingSlider = false;

    // Cache for avoiding unnecessary form rebuilds
    this._lastStateSignature = null;

    // Confirmation state for "Set Global" actions
    this._confirmState = {
      point: { pending: false, context: null },
      square: { pending: false, context: null },
      round: { pending: false, context: null },
    };

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
    // Skip rebuild if state hasn't changed (but not during slider drag)
    if (!this._isDraggingSlider) {
      const signature = this._computeStateSignature();
      if (signature === this._lastStateSignature) {
        return;
      }
      this._lastStateSignature = signature;
    }

    const formContents = [];

    // === CURRENT GLYPH ===
    const glyphCase = this._getGlyphCase();
    const glyphCaseLabel = glyphCase === "lower" ? "Lowercase" : "Uppercase";
    const widthBaseKey =
      glyphCase === "lower"
        ? SKELETON_WIDTH_LOWERCASE_BASE_KEY
        : SKELETON_WIDTH_CAPITAL_BASE_KEY;
    const widthHorizontalKey =
      glyphCase === "lower"
        ? SKELETON_WIDTH_LOWERCASE_HORIZONTAL_KEY
        : SKELETON_WIDTH_CAPITAL_HORIZONTAL_KEY;
    const widthContrastKey =
      glyphCase === "lower"
        ? SKELETON_WIDTH_LOWERCASE_CONTRAST_KEY
        : SKELETON_WIDTH_CAPITAL_CONTRAST_KEY;
    const widthDistributionKey =
      glyphCase === "lower"
        ? SKELETON_WIDTH_LOWERCASE_DISTRIBUTION_KEY
        : SKELETON_WIDTH_CAPITAL_DISTRIBUTION_KEY;
    const widthBase = this._getSourceWidth(
      widthBaseKey,
      glyphCase === "lower" ? DEFAULT_WIDTH_LOWERCASE_BASE : DEFAULT_WIDTH_CAPITAL_BASE
    );
    const widthHorizontal = this._getSourceWidth(
      widthHorizontalKey,
      glyphCase === "lower"
        ? DEFAULT_WIDTH_LOWERCASE_HORIZONTAL
        : DEFAULT_WIDTH_CAPITAL_HORIZONTAL
    );
    const widthContrast = this._getSourceWidth(
      widthContrastKey,
      glyphCase === "lower"
        ? DEFAULT_WIDTH_LOWERCASE_CONTRAST
        : DEFAULT_WIDTH_CAPITAL_CONTRAST
    );
    const distribution = this._getSourceCustomDataValue(
      widthDistributionKey,
      DEFAULT_DISTRIBUTION
    );
    const capRadiusRatio = this._getSourceCustomDataValue(
      SKELETON_CAP_RADIUS_RATIO_KEY,
      DEFAULT_CAP_RADIUS_RATIO
    );
    const capTension = this._getSourceCustomDataValue(
      SKELETON_CAP_TENSION_KEY,
      DEFAULT_CAP_TENSION
    );
    const capAngle = this._getSourceCustomDataValue(
      SKELETON_CAP_ANGLE_KEY,
      DEFAULT_CAP_ANGLE
    );
    const capDistance = this._getSourceCustomDataValue(
      SKELETON_CAP_DISTANCE_KEY,
      DEFAULT_CAP_DISTANCE
    );
    const capRadiusText = Math.round(capRadiusRatio * 10000) / 10000;
    const capTensionText = `${Math.round(capTension * 100)}%`;

    formContents.push({
      type: "header",
      label: "Current Glyph",
    });
    formContents.push({
      type: "text",
      key: "currentGlyphCase",
      label: "Case",
      value: glyphCaseLabel,
    });
    formContents.push({
      type: "text",
      key: "currentGlyphWidths",
      label: "Default widths",
      value: `Base ${widthBase}, Horizontal ${widthHorizontal}, Contrast ${widthContrast}`,
    });
    formContents.push({
      type: "text",
      key: "currentGlyphDistribution",
      label: "Default distribution",
      value: `${distribution}`,
    });
    formContents.push({
      type: "text",
      key: "currentGlyphCaps",
      label: "Default caps",
      value: `Square angle ${capAngle}°, distance ${capDistance}; Round radius ${capRadiusText}, tension ${capTensionText}`,
    });

    formContents.push({ type: "divider" });

    // Sync single-sided state from skeleton data on form rebuild
    this._syncSingleSidedState();

    // Single-sided checkbox with direction dropdown
    const singleSidedCheckbox = html.input({
      type: "checkbox",
      id: "single-sided-toggle",
      checked: this._singleSidedState.enabled,
      onchange: (e) => this._onSingleSidedToggle(e.target.checked),
    });

    const singleSidedElements = [
      singleSidedCheckbox,
      html.label({ for: "single-sided-toggle", style: "margin-left: 4px" }, "Single-sided"),
    ];

    // Add direction dropdown if single-sided is enabled
    if (this._singleSidedState.enabled) {
      const directionSelect = html.select({
        style: "margin-left: 8px",
        onchange: (e) => this._onSingleSidedDirectionChange(e.target.value),
      }, [
        html.option({ value: "left", selected: this._singleSidedState.direction === "left" }, "Left"),
        html.option({ value: "right", selected: this._singleSidedState.direction === "right" }, "Right"),
      ]);
      singleSidedElements.push(directionSelect);
    }

    formContents.push({
      type: "header",
      label: "",
      auxiliaryElement: html.span({}, singleSidedElements),
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
    const selectionContext = this._getSelectionContextKey();

    // Get values: from selected points or defaults
    let left, right, leftMixed = false, rightMixed = false;
    let asymStates = new Set(); // Track asymmetric states across selection
    // Cap style states are computed on demand below
    let hasSingleSided = false; // Track if any selected point is in single-sided contour
    let singleSidedDirection = null; // Track single-sided direction ("left" or "right")

      // Track editable states per side based on selected rib points
      const selectedRibSides = this._getSelectedRibSides();
      let editableStates = new Set();
      let detachedStates = new Set(); // Track detached handle states
      let forceHorizontalStates = new Set();
      let forceVerticalStates = new Set();

    if (hasSelection) {
      const { key: widthKey, fallback: widthFallback } = this._getDefaultWidthForGlyph();
      const defaultWidth = this._getSourceWidth(widthKey, widthFallback);

      // Collect all values from selected points
      const leftValues = [];
      const rightValues = [];

        for (const { point, contourIdx, pointIdx } of selectedData.points) {
          const widths = this._getPointWidths(point, defaultWidth);
          leftValues.push(Math.round(widths.left));
          rightValues.push(Math.round(widths.right));
          asymStates.add(this._isAsymmetric(point));
          forceHorizontalStates.add(!!point.forceHorizontal);
          forceVerticalStates.add(!!point.forceVertical);

        // Check if contour is single-sided
        const contour = selectedData.skeletonData?.contours?.[contourIdx];
        if (contour?.singleSided) {
          hasSingleSided = true;
          singleSidedDirection = contour.singleSidedDirection ?? "left";
        }

        // Collect editable and detached states for selected rib sides
        const pointKey = `${contourIdx}/${pointIdx}`;
        if (selectedRibSides.has(`${pointKey}/left`)) {
          editableStates.add(!!point.leftEditable);
          detachedStates.add(!!point.leftHandleDetached);
        }
        if (selectedRibSides.has(`${pointKey}/right`)) {
          editableStates.add(!!point.rightEditable);
          detachedStates.add(!!point.rightHandleDetached);
        }
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
      const { key: widthKey, fallback: widthFallback } = this._getDefaultWidthForGlyph();
      const defaultWide = this._getSourceWidth(widthKey, widthFallback);
      left = defaultWide / 2;
      right = defaultWide / 2;
    }

    // Determine checkbox state
    const isAsym = this.pointParameters.asymmetrical;
    const isIndeterminate = asymStates.size > 1; // Mixed asym states
    const canSetPointGlobal = hasSelection && !leftMixed && !rightMixed;

    this._ensureConfirmState("point", `${selectionContext}|point`);

    // Header with Asymmetrical toggle
    // Disabled for single-sided contours (asym doesn't make sense there)
    // When indeterminate, set checked=false so first click turns ON
    const checkbox = html.input({
      type: "checkbox",
      id: "asymmetrical-toggle",
      checked: isIndeterminate ? false : isAsym,
      disabled: hasSingleSided,
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
        html.label({
          for: "asymmetrical-toggle",
          style: `margin-left: 4px${hasSingleSided ? "; opacity: 0.5" : ""}`,
          title: hasSingleSided ? "Asymmetric mode not available for single-sided contours" : undefined,
        }, "Asym"),
      ]),
    });

    // Width fields (Left / Right) - show "mixed" placeholder if values differ
    // In single-sided mode: active side shows full width, inactive side is disabled
    const totalWidth = (left ?? 0) + (right ?? 0);
    const leftDisabled = hasSingleSided && singleSidedDirection === "right";
    const rightDisabled = hasSingleSided && singleSidedDirection === "left";

    formContents.push({
      type: "edit-number",
      key: "pointWidthLeft",
      label: "Left",
      value: leftMixed ? null : Math.round(leftDisabled ? 0 : (rightDisabled ? totalWidth : left)),
      placeholder: leftMixed ? "mixed" : undefined,
      minValue: leftDisabled ? 0 : 1,
      allowEmptyField: leftMixed,
      disabled: leftDisabled,
    });
    formContents.push({
      type: "edit-number",
      key: "pointWidthRight",
      label: "Right",
      value: rightMixed ? null : Math.round(rightDisabled ? 0 : (leftDisabled ? totalWidth : right)),
      placeholder: rightMixed ? "mixed" : undefined,
      minValue: rightDisabled ? 0 : 1,
      allowEmptyField: rightMixed,
      disabled: rightDisabled,
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

      const pointMakeGlobalButton = html.button(
        {
          style: "font-size: 11px; padding: 2px 6px; margin-right: 6px;",
          disabled: !hasSelection,
          onclick: async () => {
            this._clearConfirmState("point");
            await this._applyGlobalPointDefaultsToSelection();
            this.update();
          },
        },
        "Make Global"
      );
      const pointSetGlobalLabel = this._confirmState.point.pending ? "Confirm" : "Set Global";
      const pointSetGlobalButton = html.button(
        {
          style: "font-size: 11px; padding: 2px 6px;",
          disabled: !canSetPointGlobal,
          onclick: async () => {
            const context = `${this._getSelectionContextKey()}|point`;
            if (!this._confirmState.point.pending || this._confirmState.point.context !== context) {
              this._confirmState.point.pending = true;
              this._confirmState.point.context = context;
              this.update();
              return;
            }
            this._clearConfirmState("point");
            await this._setGlobalFromPointSelection(left, right);
            this.update();
          },
        },
        pointSetGlobalLabel
      );

      formContents.push({
        type: "universal-row",
        field1: {
          type: "auxiliaryElement",
          key: "pointMakeGlobal",
          auxiliaryElement: html.span({}, [pointMakeGlobalButton, pointSetGlobalButton]),
        },
        field2: { type: "spacer" },
        field3: { type: "spacer" },
      });

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
      allowInputBeyondRange: true,
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

    // === EDITABLE RIB POINTS ===
    // Only show when rib points are selected (not just skeleton points)
    if (selectedRibSides.size > 0) {
      formContents.push({ type: "spacer" });

      const isEditable = editableStates.has(true) && editableStates.size === 1;
      const isEditableIndeterminate = editableStates.size > 1;
      let hasEditableUnlocked = true;
      if (selectedData) {
        hasEditableUnlocked = false;
        for (const key of selectedRibSides) {
          const parts = key.split("/");
          const contourIdx = Number(parts[0]);
          const pointIdx = Number(parts[1]);
          const contour = selectedData.skeletonData?.contours?.[contourIdx];
          if (!this._isCapStyleEditableLocked(contour, pointIdx)) {
            hasEditableUnlocked = true;
            break;
          }
        }
      }

      const editableCheckbox = html.input({
        type: "checkbox",
        id: "editable-toggle",
        checked: isEditableIndeterminate ? false : isEditable,
        disabled: !hasEditableUnlocked,
        onchange: (e) => this._onEditableToggle(e.target.checked, selectedRibSides),
      });
      if (isEditableIndeterminate) {
        editableCheckbox.indeterminate = true;
      }

      // Detach Handles checkbox - only visible when editable
      const isDetached = detachedStates.has(true) && detachedStates.size === 1;
      const isDetachedIndeterminate = detachedStates.size > 1;
      const showDetachOption = isEditable || isEditableIndeterminate;

      const detachCheckbox = showDetachOption ? html.input({
        type: "checkbox",
        id: "detach-handles-toggle",
        checked: isDetachedIndeterminate ? false : isDetached,
        onchange: (e) => this._onDetachHandlesToggle(e.target.checked, selectedRibSides),
      }) : null;
      if (detachCheckbox && isDetachedIndeterminate) {
        detachCheckbox.indeterminate = true;
      }

      // Check if any selected editable rib points have nudge values or handle offsets
      const hasNudge = this._selectedRibPointsHaveNudge(selectedRibSides);
      const hasHandleOffsets = this._selectedRibPointsHaveHandleOffsets(selectedRibSides);

      // Build reset buttons array
      const resetButtons = [];
      if ((isEditable || isEditableIndeterminate) && hasNudge) {
        resetButtons.push(
          html.button(
            {
              style: "font-size: 11px; padding: 2px 6px; margin-right: 4px;",
              onclick: () => this._onResetRibPosition(selectedRibSides),
            },
            "Reset"
          )
        );
      }
      if ((isEditable || isEditableIndeterminate) && hasHandleOffsets) {
        resetButtons.push(
          html.button(
            {
              style: "font-size: 11px; padding: 2px 6px;",
              onclick: () => this._onResetHandleOffsets(selectedRibSides),
            },
            "Reset Handles"
          )
        );
      }

      formContents.push({
        type: "universal-row",
        field1: {
          type: "auxiliaryElement",
          key: "editable",
          auxiliaryElement: html.span({}, [
            editableCheckbox,
            html.label({
              for: "editable-toggle",
              style: `margin-left: 4px${hasEditableUnlocked ? "" : "; opacity: 0.5"}`,
              title: hasEditableUnlocked ? undefined : "Editable is disabled for round/square caps",
            }, "Editable"),
          ]),
        },
        field2: {
          type: "auxiliaryElement",
          key: "detachHandles",
          auxiliaryElement: showDetachOption
            ? html.span({}, [
                detachCheckbox,
                html.label({
                  for: "detach-handles-toggle",
                  style: "margin-left: 4px",
                  title: "Detach handle lengths from skeleton (absolute positioning)",
                }, "Detach"),
              ])
            : html.span(),
        },
        field3: {
          type: "auxiliaryElement",
          key: "resetButtons",
          auxiliaryElement: resetButtons.length > 0
            ? html.span({}, resetButtons)
            : html.span(),
        },
      });
    }

    // === SKELETON POINT RIB CONTROLS ===
    // Show when skeleton points are selected (not rib points) and they have editable ribs
    if (hasSelection && selectedRibSides.size === 0) {
      const ribEditInfo = this._getSkeletonPointsRibEditInfo(selectedData);

      if (ribEditInfo.hasEditableRibs) {
        formContents.push({ type: "spacer" });

        const buttons = [];

        // Reset Ribs button - only if there are nudged ribs
        if (ribEditInfo.hasNudgedRibs) {
          buttons.push(
            html.button(
              {
                style: "font-size: 11px; padding: 2px 6px; margin-right: 6px;",
                onclick: () => this._onResetSkeletonRibs(selectedData),
              },
              "Reset Ribs"
            )
          );
        }

        // Make Ribs Uneditable button - always when there are editable ribs
        buttons.push(
          html.button(
            {
              style: "font-size: 11px; padding: 2px 6px;",
              onclick: () => this._onMakeRibsUneditable(selectedData),
            },
            "Make Uneditable"
          )
        );

        formContents.push({
          type: "universal-row",
          field1: {
            type: "auxiliaryElement",
            key: "ribControls",
            auxiliaryElement: html.span({}, buttons),
          },
          field2: { type: "spacer" },
          field3: { type: "spacer" },
        });
      }
    }

    // === CAP STYLES ===
    formContents.push({ type: "divider" });
    formContents.push({ type: "spacer" });

    const capStyleState = this._getSelectedEndpointCapStyleState(selectedData);
    const capValue = capStyleState.value || "flat";
    const capOptions = [];
    if (capStyleState.mixed) {
      capOptions.push(
        html.option({ value: "", selected: true, disabled: true }, "mixed")
      );
    }
    capOptions.push(
      html.option({ value: "flat", selected: !capStyleState.mixed && capValue === "flat" }, "Flat")
    );
    capOptions.push(
      html.option({ value: "square", selected: !capStyleState.mixed && capValue === "square" }, "Square")
    );
    capOptions.push(
      html.option({ value: "round", selected: !capStyleState.mixed && capValue === "round" }, "Round")
    );

    const capStyleSelect = html.select(
      {
        id: "cap-style-select",
        disabled: !capStyleState.canEdit,
        onchange: (e) => this._onCapStyleChange(e.target.value),
      },
      capOptions
    );

    formContents.push({
      type: "header",
      label: "Cap Styles",
      auxiliaryElement: capStyleSelect,
    });

      const capRadiusState = this._getSelectedEndpointCapParamState(
        selectedData,
        "capRadiusRatio",
        DEFAULT_CAP_RADIUS_RATIO
      );
      const capTensionState = this._getSelectedEndpointCapParamState(
        selectedData,
        "capTension",
        DEFAULT_CAP_TENSION
      );
      const capAngleState = this._getSelectedEndpointCapParamState(
        selectedData,
        "capAngle",
        DEFAULT_CAP_ANGLE
      );
      const capDistanceState = this._getSelectedEndpointCapParamState(
        selectedData,
        "capDistance",
        DEFAULT_CAP_DISTANCE
      );

      const capRadiusValue = capRadiusState.value ?? DEFAULT_CAP_RADIUS_RATIO;
      const capRadiusIndex = this._capRadiusIndexFromRatio(capRadiusValue);
      const capRadiusPosition = capRadiusIndex + 1;
      const defaultCapRadiusIndex = this._capRadiusIndexFromRatio(DEFAULT_CAP_RADIUS_RATIO);
      const capTensionPercent = Math.round(
        (capTensionState.value ?? DEFAULT_CAP_TENSION) * 100
      );
      const capAngleValue = Math.round(capAngleState.value ?? DEFAULT_CAP_ANGLE);
      const capDistanceValue = Math.round(capDistanceState.value ?? DEFAULT_CAP_DISTANCE);
        const showCapRound = !capStyleState.mixed && capValue === "round";
        const showCapAngle = !capStyleState.mixed && capValue === "square";
        const showCapDistance = !capStyleState.mixed && capValue === "square";
        const showForceAngle = !capStyleState.mixed && capValue === "flat";
        const canSetRoundGlobal =
          capRadiusState.canEdit &&
          capTensionState.canEdit &&
          !capRadiusState.mixed &&
          !capTensionState.mixed;
        const canSetSquareGlobal =
          capAngleState.canEdit &&
          capDistanceState.canEdit &&
          !capAngleState.mixed &&
          !capDistanceState.mixed;

        if (showCapRound) {
          this._ensureConfirmState("round", `${selectionContext}|cap:round`);
        } else {
          this._clearConfirmState("round");
        }
        if (showCapAngle || showCapDistance) {
          this._ensureConfirmState("square", `${selectionContext}|cap:square`);
        } else {
          this._clearConfirmState("square");
        }

        if (showCapRound) {
          formContents.push({
            type: "edit-number-slider",
            key: "capRadiusIndex",
          label: "Cap Radius",
          value: capRadiusPosition,
          minValue: 1,
          defaultValue: defaultCapRadiusIndex + 1,
          maxValue: CAP_RADIUS_POSITIONS,
          step: 1,
          disabled: !capRadiusState.canEdit,
        });

          formContents.push({
            type: "edit-number-slider",
            key: "capTension",
            label: "Cap Tension (%)",
            value: capTensionPercent,
            minValue: 0,
            defaultValue: Math.round(DEFAULT_CAP_TENSION * 100),
            maxValue: 100,
            step: 5,
            disabled: !capTensionState.canEdit,
          });

          const roundMakeGlobalButton = html.button(
            {
              style: "font-size: 11px; padding: 2px 6px; margin-right: 6px;",
              disabled: !capRadiusState.canEdit || !capTensionState.canEdit,
              onclick: async () => {
                this._clearConfirmState("round");
                await this._applyGlobalRoundDefaultsToSelection();
                this.update();
              },
            },
            "Make Global"
          );
          const roundSetGlobalLabel = this._confirmState.round.pending ? "Confirm" : "Set Global";
          const roundSetGlobalButton = html.button(
            {
              style: "font-size: 11px; padding: 2px 6px;",
              disabled: !canSetRoundGlobal,
              onclick: async () => {
                const context = `${this._getSelectionContextKey()}|cap:round`;
                if (!this._confirmState.round.pending || this._confirmState.round.context !== context) {
                  this._confirmState.round.pending = true;
                  this._confirmState.round.context = context;
                  this.update();
                  return;
                }
                this._clearConfirmState("round");
                await this._setGlobalFromRoundSelection(
                  capRadiusState.value ?? DEFAULT_CAP_RADIUS_RATIO,
                  capTensionState.value ?? DEFAULT_CAP_TENSION
                );
                this.update();
              },
            },
            roundSetGlobalLabel
          );
          formContents.push({
            type: "universal-row",
            field1: {
              type: "auxiliaryElement",
              key: "roundMakeGlobal",
              auxiliaryElement: html.span({}, [roundMakeGlobalButton, roundSetGlobalButton]),
            },
            field2: { type: "spacer" },
            field3: { type: "spacer" },
          });
        }
        if (showCapAngle) {
          formContents.push({
            type: "edit-number-slider",
            key: "capAngle",
          label: "Cap Angle (deg)",
          value: capAngleValue,
          minValue: CAP_ANGLE_MIN,
          defaultValue: DEFAULT_CAP_ANGLE,
          maxValue: CAP_ANGLE_MAX,
          step: 1,
          disabled: !capAngleState.canEdit,
        });
      }
        if (showCapDistance) {
          formContents.push({
            type: "edit-number",
            key: "capDistance",
            label: "Cap Distance",
            value: capDistanceValue,
            minValue: 0,
            integer: true,
            disabled: !capDistanceState.canEdit,
          });
        }
        if (showCapAngle || showCapDistance) {
          const squareMakeGlobalButton = html.button(
            {
              style: "font-size: 11px; padding: 2px 6px; margin-right: 6px;",
              disabled: !capAngleState.canEdit || !capDistanceState.canEdit,
              onclick: async () => {
                this._clearConfirmState("square");
                await this._applyGlobalSquareDefaultsToSelection();
                this.update();
              },
            },
            "Make Global"
          );
          const squareSetGlobalLabel = this._confirmState.square.pending ? "Confirm" : "Set Global";
          const squareSetGlobalButton = html.button(
            {
              style: "font-size: 11px; padding: 2px 6px;",
              disabled: !canSetSquareGlobal,
              onclick: async () => {
                const context = `${this._getSelectionContextKey()}|cap:square`;
                if (!this._confirmState.square.pending || this._confirmState.square.context !== context) {
                  this._confirmState.square.pending = true;
                  this._confirmState.square.context = context;
                  this.update();
                  return;
                }
                this._clearConfirmState("square");
                await this._setGlobalFromSquareSelection(
                  capAngleState.value ?? DEFAULT_CAP_ANGLE,
                  capDistanceState.value ?? DEFAULT_CAP_DISTANCE
                );
                this.update();
              },
            },
            squareSetGlobalLabel
          );
          formContents.push({
            type: "universal-row",
            field1: {
              type: "auxiliaryElement",
              key: "squareMakeGlobal",
              auxiliaryElement: html.span({}, [squareMakeGlobalButton, squareSetGlobalButton]),
            },
            field2: { type: "spacer" },
            field3: { type: "spacer" },
          });
        }
      if (showForceAngle) {
        const forceHorizontal = forceHorizontalStates.size === 1 && forceHorizontalStates.has(true);
        const forceVertical = forceVerticalStates.size === 1 && forceVerticalStates.has(true);
        const forceHorizontalIndeterminate = forceHorizontalStates.size > 1;
        const forceVerticalIndeterminate = forceVerticalStates.size > 1;

        const forceHorizontalCheckbox = html.input({
          type: "checkbox",
          id: "force-horizontal-toggle",
          checked: forceHorizontalIndeterminate ? false : forceHorizontal,
          disabled: !capStyleState.canEdit,
          onchange: (e) => this._onForceHorizontalToggle(e.target.checked),
        });
        if (forceHorizontalIndeterminate) {
          forceHorizontalCheckbox.indeterminate = true;
        }

        const forceVerticalCheckbox = html.input({
          type: "checkbox",
          id: "force-vertical-toggle",
          checked: forceVerticalIndeterminate ? false : forceVertical,
          disabled: !capStyleState.canEdit,
          onchange: (e) => this._onForceVerticalToggle(e.target.checked),
        });
        if (forceVerticalIndeterminate) {
          forceVerticalCheckbox.indeterminate = true;
        }

        formContents.push({
          type: "universal-row",
          field1: {
            type: "auxiliaryElement",
            key: "forceHorizontal",
            auxiliaryElement: html.span({}, [
              forceHorizontalCheckbox,
              html.label({
                for: "force-horizontal-toggle",
                style: `margin-left: 4px${capStyleState.canEdit ? "" : "; opacity: 0.5"}`,
              }, "Force Vertical"),
            ]),
          },
          field2: {
            type: "auxiliaryElement",
            key: "forceVertical",
            auxiliaryElement: html.span({}, [
              forceVerticalCheckbox,
              html.label({
                for: "force-vertical-toggle",
                style: `margin-left: 4px${capStyleState.canEdit ? "" : "; opacity: 0.5"}`,
              }, "Force Horizontal"),
            ]),
          },
          field3: { type: "spacer" },
        });
      }

    this.infoForm.setFieldDescriptions(formContents);

    this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
      const sourceWidthKeyMap = {
        capitalBase: SKELETON_WIDTH_CAPITAL_BASE_KEY,
        capitalHorizontal: SKELETON_WIDTH_CAPITAL_HORIZONTAL_KEY,
        capitalContrast: SKELETON_WIDTH_CAPITAL_CONTRAST_KEY,
        lowercaseBase: SKELETON_WIDTH_LOWERCASE_BASE_KEY,
        lowercaseHorizontal: SKELETON_WIDTH_LOWERCASE_HORIZONTAL_KEY,
        lowercaseContrast: SKELETON_WIDTH_LOWERCASE_CONTRAST_KEY,
      };
      if (sourceWidthKeyMap[fieldItem.key]) {
        await this._setDefaultSkeletonWidth(sourceWidthKeyMap[fieldItem.key], value);
      } else if (fieldItem.key === "pointWidthLeft" || fieldItem.key === "pointWidthRight") {
        await this._setPointWidth(fieldItem.key, value);
      } else if (fieldItem.key === "capRadiusIndex") {
        if (valueStream) {
          this._isDraggingSlider = true;
          try {
            const mappedStream = this._mapValueStream(valueStream, (v) => {
              const index = Math.round(v) - 1;
              return this._capRadiusRatioFromIndex(index);
            });
            await this._setCapParameterForSelectionStream("capRadiusRatio", mappedStream);
          } finally {
            this._isDraggingSlider = false;
            this._blurActiveFormElement();
          }
          this.update();
        } else {
          const index = Math.round(value) - 1;
          const ratio = this._capRadiusRatioFromIndex(index);
          await this._onCapRadiusChange(ratio);
        }
      } else if (fieldItem.key === "capTension") {
        if (valueStream) {
          this._isDraggingSlider = true;
          try {
            const mappedStream = this._mapValueStream(valueStream, (v) => v / 100);
            await this._setCapParameterForSelectionStream("capTension", mappedStream);
          } finally {
            this._isDraggingSlider = false;
            this._blurActiveFormElement();
          }
          this.update();
        } else {
          await this._onCapTensionChange(value);
        }
      } else if (fieldItem.key === "capAngle") {
        if (valueStream) {
          this._isDraggingSlider = true;
          try {
            await this._setCapParameterForSelectionStream("capAngle", valueStream);
          } finally {
            this._isDraggingSlider = false;
            this._blurActiveFormElement();
          }
          this.update();
        } else {
          await this._setCapParameterForSelection("capAngle", value);
          this.update();
        }
      } else if (fieldItem.key === "capDistance") {
        await this._setCapParameterForSelection("capDistance", value);
        this.update();
      } else if (fieldItem.key === "pointWidthScale") {
        // Protect scale slider from form rebuilds during drag
        if (valueStream) {
          // Slider drag: just update value, wait for "Apply Scale" button
          this._isDraggingSlider = true;
          try {
            for await (const v of valueStream) {
              this.pointParameters.scaleValue = v;
            }
          } finally {
            this._isDraggingSlider = false;
          }
        } else {
          // Direct input (Enter key): apply immediately
          this.pointParameters.scaleValue = value;
          await this._applyScaleToSelectedPoints();
        }
      } else if (fieldItem.key === "pointDistribution") {
        // For distribution slider
        if (valueStream) {
          this._isDraggingSlider = true;
          // Store initial state for multi-selection
          const selectedData = this._getSelectedSkeletonPoints();

          if (selectedData && selectedData.points.length > 1) {
            const pointStates = new Map();
            let maxLeft = 0;
            let maxRight = 0;

            const { key: widthKey, fallback: widthFallback } = this._getDefaultWidthForGlyph();
            for (const { contourIdx, pointIdx, point } of selectedData.points) {
              const key = `${contourIdx}/${pointIdx}`;
              const defaultWidth = this._getSourceWidth(widthKey, widthFallback);
              const left = point.leftWidth ?? (point.width ?? defaultWidth) / 2;
              const right = point.rightWidth ?? (point.width ?? defaultWidth) / 2;

              pointStates.set(key, { initialLeft: left, initialRight: right });
              maxLeft = Math.max(maxLeft, left);
              maxRight = Math.max(maxRight, right);
            }

            this._multiSelectionState = { pointStates, maxLeft, maxRight };
            } else {
              this._multiSelectionState = null;
            }
            try {
              await this._setPointDistributionStream(valueStream);
            } finally {
              this._isDraggingSlider = false;
              this._multiSelectionState = null;
              this._blurActiveFormElement();
              this.update();
            }
        } else {
          await this._setPointDistributionDirect(value);
        }
      } else {
        this.parameters[fieldItem.key] = value;
      }
      };
    }

    _blurActiveFormElement() {
      const root = this.infoForm?.shadowRoot;
      const active = root?.activeElement;
      if (active && typeof active.blur === "function") {
        active.blur();
      }
    }

  _mapValueStream(valueStream, mapper) {
    const self = this;
    return (async function* () {
      for await (const value of valueStream) {
        yield mapper.call(self, value);
      }
    })();
  }

  _getSelectionContextKey() {
    const sel = this.sceneController.selection;
    if (!sel || sel.size === 0) return "";
    return [...sel].sort().join("|");
  }

  _ensureConfirmState(kind, context) {
    const state = this._confirmState?.[kind];
    if (!state) return;
    if (state.pending && state.context !== context) {
      state.pending = false;
      state.context = null;
    }
  }

  _clearConfirmState(kind) {
    const state = this._confirmState?.[kind];
    if (!state) return;
    state.pending = false;
    state.context = null;
  }

    /**
     * Get a source width value from the active source's customData.
     * @param {string} key - The customData key
     * @param {number} fallback - Default value if not set
     * @returns {number} The width value
   */
  _getSourceWidth(key, fallback) {
    const sourceIdentifier = this.sceneController.editingLayerNames?.[0];
    if (!sourceIdentifier) return fallback;

    const source = this.fontController.sources[sourceIdentifier];
    return source?.customData?.[key] ?? fallback;
  }

  _getSourceCustomDataValue(key, fallback) {
    return this._getSourceWidth(key, fallback);
  }

  async _setSourceCustomDataValues(values, undoLabel) {
    const sourceIdentifier = this.sceneController.editingLayerNames?.[0];
    if (!sourceIdentifier) return;

    const root = { sources: this.fontController.sources };
    const changes = recordChanges(root, (r) => {
      if (!r.sources[sourceIdentifier].customData) {
        r.sources[sourceIdentifier].customData = {};
      }
      for (const [key, value] of Object.entries(values)) {
        r.sources[sourceIdentifier].customData[key] = value;
      }
    });

    if (changes.hasChange) {
      await this.fontController.postChange(
        changes.change,
        changes.rollbackChange,
        undoLabel || "Set skeleton defaults"
      );
    }
  }

  /**
   * Determine if the current glyph is lowercase or uppercase.
   * @returns {"lower" | "upper"} The glyph case
   */
  _getGlyphCase() {
    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    if (!glyphName) return "upper";
    const info = getGlyphInfoFromGlyphName(glyphName);
    return info?.case === "lower" ? "lower" : "upper";
  }

  /**
   * Get the default base width key and value for the current glyph case.
   * @returns {{ key: string, fallback: number }} The width key and default value
   */
  _getDefaultWidthForGlyph() {
    const glyphCase = this._getGlyphCase();
    if (glyphCase === "lower") {
      return {
        key: SKELETON_WIDTH_LOWERCASE_BASE_KEY,
        fallback: DEFAULT_WIDTH_LOWERCASE_BASE,
      };
    }
    return {
      key: SKELETON_WIDTH_CAPITAL_BASE_KEY,
      fallback: DEFAULT_WIDTH_CAPITAL_BASE,
    };
  }

  _getDefaultDistributionForGlyph() {
    const glyphCase = this._getGlyphCase();
    if (glyphCase === "lower") {
      return this._getSourceCustomDataValue(
        SKELETON_WIDTH_LOWERCASE_DISTRIBUTION_KEY,
        DEFAULT_DISTRIBUTION
      );
    }
    return this._getSourceCustomDataValue(
      SKELETON_WIDTH_CAPITAL_DISTRIBUTION_KEY,
      DEFAULT_DISTRIBUTION
    );
  }

  async _applyGlobalPointDefaultsToSelection() {
    const selectedData = this._getSelectedSkeletonPoints();
    if (!selectedData) return;

    const { key: widthKey, fallback: widthFallback } = this._getDefaultWidthForGlyph();
    const totalWidth = Math.round(this._getSourceWidth(widthKey, widthFallback));
    const distribution = this._getDefaultDistributionForGlyph();
    const clampedDist = Math.max(-100, Math.min(100, distribution));
    const left = Math.round(totalWidth * (0.5 + clampedDist / 200));
    const right = totalWidth - left;
    const useAsym = Math.abs(clampedDist) > 1e-6;
    if (useAsym) {
      this.pointParameters.asymmetrical = true;
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

          if (contour.singleSided) {
            point.width = totalWidth;
            delete point.leftWidth;
            delete point.rightWidth;
          } else if (useAsym) {
            point.leftWidth = left;
            point.rightWidth = right;
            delete point.width;
          } else {
            point.width = totalWidth;
            delete point.leftWidth;
            delete point.rightWidth;
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
        undoLabel: "Apply global point defaults",
        broadcast: true,
      };
    });
  }

  async _setGlobalFromPointSelection(left, right) {
    if (!Number.isFinite(left) || !Number.isFinite(right)) return;
    const totalWidth = Math.round(left + right);
    const distribution = this._calculateDistribution(left, right);
    const glyphCase = this._getGlyphCase();
    const widthKey =
      glyphCase === "lower"
        ? SKELETON_WIDTH_LOWERCASE_BASE_KEY
        : SKELETON_WIDTH_CAPITAL_BASE_KEY;
    const distributionKey =
      glyphCase === "lower"
        ? SKELETON_WIDTH_LOWERCASE_DISTRIBUTION_KEY
        : SKELETON_WIDTH_CAPITAL_DISTRIBUTION_KEY;
    await this._setSourceCustomDataValues(
      {
        [widthKey]: totalWidth,
        [distributionKey]: distribution,
      },
      "Set skeleton defaults"
    );
  }

  async _setCapParametersForSelection(paramValues, undoLabel) {
    const selectedData = this._getSelectedSkeletonPoints();
    if (!selectedData) return;

    const clampedValues = {};
    for (const [key, value] of Object.entries(paramValues)) {
      clampedValues[key] = this._clampCapParam(key, value);
    }

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = JSON.parse(
          JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
        );
        let changed = false;

        for (const { contourIdx, pointIdx } of selectedData.points) {
          const contour = skeletonData.contours[contourIdx];
          if (!contour || contour.isClosed) continue;
          const endpoints = this._getContourEndpointIndices(contour);
          if (!endpoints) continue;
          if (pointIdx !== endpoints.firstOnCurve && pointIdx !== endpoints.lastOnCurve) {
            continue;
          }
          const point = contour.points[pointIdx];
          if (!point || point.type) continue;
          for (const [key, value] of Object.entries(clampedValues)) {
            point[key] = value;
          }
          changed = true;
        }

        if (!changed) continue;

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
        undoLabel: undoLabel || "Set cap parameters",
        broadcast: true,
      };
    });
  }

  async _applyGlobalRoundDefaultsToSelection() {
    const capRadiusRatio = this._getSourceCustomDataValue(
      SKELETON_CAP_RADIUS_RATIO_KEY,
      DEFAULT_CAP_RADIUS_RATIO
    );
    const capTension = this._getSourceCustomDataValue(
      SKELETON_CAP_TENSION_KEY,
      DEFAULT_CAP_TENSION
    );
    await this._setCapParametersForSelection(
      { capRadiusRatio, capTension },
      "Apply global round caps"
    );
  }

  async _applyGlobalSquareDefaultsToSelection() {
    const capAngle = this._getSourceCustomDataValue(
      SKELETON_CAP_ANGLE_KEY,
      DEFAULT_CAP_ANGLE
    );
    const capDistance = this._getSourceCustomDataValue(
      SKELETON_CAP_DISTANCE_KEY,
      DEFAULT_CAP_DISTANCE
    );
    await this._setCapParametersForSelection(
      { capAngle, capDistance },
      "Apply global square caps"
    );
  }

  async _setGlobalFromRoundSelection(capRadiusRatio, capTension) {
    await this._setSourceCustomDataValues(
      {
        [SKELETON_CAP_RADIUS_RATIO_KEY]: this._clampCapParam(
          "capRadiusRatio",
          capRadiusRatio
        ),
        [SKELETON_CAP_TENSION_KEY]: this._clampCapParam("capTension", capTension),
      },
      "Set global round caps"
    );
  }

  async _setGlobalFromSquareSelection(capAngle, capDistance) {
    await this._setSourceCustomDataValues(
      {
        [SKELETON_CAP_ANGLE_KEY]: this._clampCapParam("capAngle", capAngle),
        [SKELETON_CAP_DISTANCE_KEY]: this._clampCapParam("capDistance", capDistance),
      },
      "Set global square caps"
    );
  }

  /**
   * Get the single-sided mode from the first selected skeleton contour.
   * @returns {boolean} Whether single-sided mode is enabled
   */
  _getCurrentSingleSided() {
    const selectedData = this._getSelectedSkeletonPoints();
    if (selectedData && selectedData.points.length > 0) {
      const contourIdx = selectedData.points[0].contourIdx;
      const contour = selectedData.skeletonData.contours[contourIdx];
      return contour?.singleSided ?? false;
    }
    return false;
  }

  /**
   * Get the single-sided direction from the first selected skeleton contour.
   * @returns {string} The direction ("left" or "right")
   */
  _getCurrentSingleSidedDirection() {
    const selectedData = this._getSelectedSkeletonPoints();
    if (selectedData && selectedData.points.length > 0) {
      const contourIdx = selectedData.points[0].contourIdx;
      const contour = selectedData.skeletonData.contours[contourIdx];
      return contour?.singleSidedDirection ?? "left";
    }
    return "left";
  }

  /**
   * Set single-sided mode for selected skeleton contours.
   * @param {boolean} value - Whether single-sided mode is enabled
   */
  async _setSingleSided(value) {
    const selectedData = this._getSelectedSkeletonPoints();
    if (!selectedData) return;

    // Get unique contour indices from selected points
    const contourIndices = new Set(selectedData.points.map((p) => p.contourIdx));

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = JSON.parse(
          JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
        );

        // Update single-sided mode for each selected contour
        for (const contourIdx of contourIndices) {
          const contour = skeletonData.contours[contourIdx];
          if (contour) {
            contour.singleSided = value;
            if (value && !contour.singleSidedDirection) {
              contour.singleSidedDirection = "left"; // Default direction
            }
          }
        }

        // Regenerate contours
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          this._regenerateOutlineContours(sg, skeletonData);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        // Update skeleton data
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
        undoLabel: value ? "Enable single-sided" : "Disable single-sided",
        broadcast: true,
      };
    });
  }

  /**
   * Set single-sided direction for selected skeleton contours.
   * @param {string} value - The direction ("left" or "right")
   */
  async _setSingleSidedDirection(value) {
    const selectedData = this._getSelectedSkeletonPoints();
    if (!selectedData) return;

    // Get unique contour indices from selected points
    const contourIndices = new Set(selectedData.points.map((p) => p.contourIdx));

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = JSON.parse(
          JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
        );

        // Update direction for each selected contour
        for (const contourIdx of contourIndices) {
          const contour = skeletonData.contours[contourIdx];
          if (contour) {
            contour.singleSidedDirection = value;
          }
        }

        // Regenerate contours
        const staticGlyph = layer.glyph;
        const pathChange = recordChanges(staticGlyph, (sg) => {
          this._regenerateOutlineContours(sg, skeletonData);
        });
        allChanges.push(pathChange.prefixed(["layers", editLayerName, "glyph"]));

        // Update skeleton data
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
        undoLabel: "Set single-sided direction",
        broadcast: true,
      };
    });
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
    const { skeletonPoint, skeletonHandle } = parseSelection(this.sceneController.selection);
    const selectedRibSides = this._getSelectedRibSides();

    // Collect raw point keys from skeletonPoint and skeletonHandle
    const directPointKeys = new Set();

    if (skeletonPoint) {
      for (const key of skeletonPoint) {
        directPointKeys.add(key); // Format: "contourIdx/pointIdx"
      }
    }

    if (skeletonHandle) {
      for (const key of skeletonHandle) {
        // Format: "contourIdx/pointIdx/in|out" - extract "contourIdx/pointIdx"
        const parts = key.split("/");
        directPointKeys.add(`${parts[0]}/${parts[1]}`);
      }
    }

    if (directPointKeys.size === 0 && selectedRibSides.size === 0) return null;

    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    const editLayerName = this.sceneController.editingLayerNames?.[0];
    const layer = positionedGlyph?.varGlyph?.glyph?.layers?.[editLayerName];
    const skeletonData = layer?.customData?.[SKELETON_CUSTOM_DATA_KEY];
    if (!skeletonData) return null;

    const pointKeys = new Set();

    // Rib sides map directly to on-curve points
    for (const key of selectedRibSides) {
      const parts = key.split("/");
      pointKeys.add(`${parts[0]}/${parts[1]}`);
    }

    // Resolve direct selections (including off-curve handles) to on-curve points
    for (const key of directPointKeys) {
      const [contourIdx, pointIdx] = key.split("/").map(Number);
      const contour = skeletonData.contours[contourIdx];
      const point = contour?.points?.[pointIdx];
      if (!point || !contour) continue;

      if (!point.type) {
        pointKeys.add(`${contourIdx}/${pointIdx}`);
        continue;
      }

      const onCurveIdx = this._getOnCurveIndexForOffCurve(contour, pointIdx);
      if (onCurveIdx !== null && onCurveIdx !== undefined) {
        pointKeys.add(`${contourIdx}/${onCurveIdx}`);
      }
    }

    const points = [];
    for (const key of pointKeys) {
      const [contourIdx, pointIdx] = key.split("/").map(Number);
      const point = skeletonData.contours[contourIdx]?.points[pointIdx];
      if (point && !point.type) {
        points.push({ contourIdx, pointIdx, point });
      }
    }
    return points.length > 0 ? { points, skeletonData, layer, editLayerName } : null;
  }

  _getOnCurveIndexForOffCurve(contour, pointIdx) {
    const points = contour?.points;
    if (!points?.length) return null;
    const numPoints = points.length;
    if (!points[pointIdx] || !points[pointIdx].type) return pointIdx;

    let prevIdx = null;
    for (let i = pointIdx - 1; i >= 0; i--) {
      if (!points[i]?.type) {
        prevIdx = i;
        break;
      }
    }
    let nextIdx = null;
    for (let i = pointIdx + 1; i < numPoints; i++) {
      if (!points[i]?.type) {
        nextIdx = i;
        break;
      }
    }

    if (contour.isClosed) {
      if (prevIdx === null) {
        for (let i = numPoints - 1; i > pointIdx; i--) {
          if (!points[i]?.type) {
            prevIdx = i;
            break;
          }
        }
      }
      if (nextIdx === null) {
        for (let i = 0; i < pointIdx; i++) {
          if (!points[i]?.type) {
            nextIdx = i;
            break;
          }
        }
      }
    }

    if (prevIdx === null && nextIdx === null) return null;
    if (prevIdx === null) return nextIdx;
    if (nextIdx === null) return prevIdx;

    if (!contour.isClosed) {
      const distPrev = pointIdx - prevIdx;
      const distNext = nextIdx - pointIdx;
      return distPrev <= distNext ? prevIdx : nextIdx;
    }

    const steps = (fromIdx, toIdx) =>
      fromIdx <= toIdx ? toIdx - fromIdx : numPoints - fromIdx + toIdx;
    return steps(prevIdx, pointIdx) <= steps(pointIdx, nextIdx) ? prevIdx : nextIdx;
  }

  _getContourEndpointIndices(contour) {
    if (!contour?.points?.length) return null;
    let firstOnCurve = -1;
    let lastOnCurve = -1;
    for (let i = 0; i < contour.points.length; i++) {
      if (!contour.points[i]?.type) {
        if (firstOnCurve === -1) firstOnCurve = i;
        lastOnCurve = i;
      }
    }
    if (firstOnCurve === -1) return null;
    return { firstOnCurve, lastOnCurve };
  }

  _getSelectedEndpointCapStyleState(selectedData) {
    if (!selectedData || selectedData.points.length === 0) {
      return { canEdit: false, mixed: false, value: "flat" };
    }

    const styles = new Set();

    for (const { contourIdx, pointIdx, point } of selectedData.points) {
      const contour = selectedData.skeletonData?.contours?.[contourIdx];
      if (!contour || contour.isClosed) {
        return { canEdit: false, mixed: false, value: "flat" };
      }
      const endpoints = this._getContourEndpointIndices(contour);
      if (!endpoints) {
        return { canEdit: false, mixed: false, value: "flat" };
      }
      if (pointIdx !== endpoints.firstOnCurve && pointIdx !== endpoints.lastOnCurve) {
        return { canEdit: false, mixed: false, value: "flat" };
      }
      const capStyle = point.capStyle ?? contour.capStyle ?? "butt";
      styles.add(capStyle);
    }

    if (styles.size > 1) {
      return { canEdit: true, mixed: true, value: null };
    }

    const [singleStyle] = styles;
    const normalized = singleStyle === "butt" ? "flat" : singleStyle;
    return { canEdit: true, mixed: false, value: normalized };
  }

  _getSelectedEndpointCapParamState(selectedData, paramKey, defaultValue) {
    if (!selectedData || selectedData.points.length === 0) {
      return { canEdit: false, mixed: false, value: defaultValue };
    }

    const values = new Set();

    for (const { contourIdx, pointIdx, point } of selectedData.points) {
      const contour = selectedData.skeletonData?.contours?.[contourIdx];
      if (!contour || contour.isClosed) {
        return { canEdit: false, mixed: false, value: defaultValue };
      }
      const endpoints = this._getContourEndpointIndices(contour);
      if (!endpoints) {
        return { canEdit: false, mixed: false, value: defaultValue };
      }
      if (pointIdx !== endpoints.firstOnCurve && pointIdx !== endpoints.lastOnCurve) {
        return { canEdit: false, mixed: false, value: defaultValue };
      }

      const value = point[paramKey] ?? contour[paramKey] ?? defaultValue;
      values.add(value);
    }

    if (values.size > 1) {
      return { canEdit: true, mixed: true, value: null };
    }

    const [singleValue] = values;
    return { canEdit: true, mixed: false, value: singleValue };
  }

  _isCapStyleEditableLocked(contour, pointIdx) {
    if (!contour || contour.isClosed) return false;
    const endpoints = this._getContourEndpointIndices(contour);
    if (!endpoints) return false;
    if (pointIdx !== endpoints.firstOnCurve && pointIdx !== endpoints.lastOnCurve) {
      return false;
    }
    const point = contour.points?.[pointIdx];
    const capStyle = point?.capStyle ?? contour.capStyle ?? "butt";
    return capStyle === "round" || capStyle === "square";
  }

  _disableEditableSide(point, side) {
    const editableKey = side === "left" ? "leftEditable" : "rightEditable";
    const nudgeKey = side === "left" ? "leftNudge" : "rightNudge";
    const handleInKey = side === "left" ? "leftHandleIn" : "rightHandleIn";
    const handleOutKey = side === "left" ? "leftHandleOut" : "rightHandleOut";
    const handleInAngleKey = side === "left" ? "leftHandleInAngle" : "rightHandleInAngle";
    const handleOutAngleKey = side === "left" ? "leftHandleOutAngle" : "rightHandleOutAngle";
    // Legacy 1D handle offset keys
    const handleInOffsetKey = side === "left" ? "leftHandleInOffset" : "rightHandleInOffset";
    const handleOutOffsetKey = side === "left" ? "leftHandleOutOffset" : "rightHandleOutOffset";
    // New 2D handle offset keys
    const handleInOffsetXKey = side === "left" ? "leftHandleInOffsetX" : "rightHandleInOffsetX";
    const handleInOffsetYKey = side === "left" ? "leftHandleInOffsetY" : "rightHandleInOffsetY";
    const handleOutOffsetXKey = side === "left" ? "leftHandleOutOffsetX" : "rightHandleOutOffsetX";
    const handleOutOffsetYKey = side === "left" ? "leftHandleOutOffsetY" : "rightHandleOutOffsetY";
    // Saved keys for preserving values when toggling editable off/on
    const nudgeSavedKey = side === "left" ? "leftNudgeSaved" : "rightNudgeSaved";
    const handleInOffsetSavedKey = side === "left" ? "leftHandleInOffsetSaved" : "rightHandleInOffsetSaved";
    const handleOutOffsetSavedKey = side === "left" ? "leftHandleOutOffsetSaved" : "rightHandleOutOffsetSaved";

    delete point[editableKey];
    // Save current values before clearing
    if (point[nudgeKey] !== undefined && point[nudgeKey] !== 0) {
      point[nudgeSavedKey] = point[nudgeKey];
    }
    if (point[handleInOffsetKey] !== undefined && point[handleInOffsetKey] !== 0) {
      point[handleInOffsetSavedKey] = point[handleInOffsetKey];
    }
    if (point[handleOutOffsetKey] !== undefined && point[handleOutOffsetKey] !== 0) {
      point[handleOutOffsetSavedKey] = point[handleOutOffsetKey];
    }
    // Clear active values when disabling
    delete point[nudgeKey];
    delete point[handleInKey];
    delete point[handleOutKey];
    delete point[handleInAngleKey];
    delete point[handleOutAngleKey];
    // Clear legacy 1D offsets
    delete point[handleInOffsetKey];
    delete point[handleOutOffsetKey];
    // Clear new 2D offsets
    delete point[handleInOffsetXKey];
    delete point[handleInOffsetYKey];
    delete point[handleOutOffsetXKey];
    delete point[handleOutOffsetYKey];
  }

  _capRadiusRatioFromIndex(index) {
    const clampedIndex = Math.min(Math.max(index, 0), CAP_RADIUS_POSITIONS - 1);
    const t = clampedIndex / (CAP_RADIUS_POSITIONS - 1);
    const minLog = Math.log2(CAP_RADIUS_MIN);
    const maxLog = Math.log2(CAP_RADIUS_MAX);
    return Math.pow(2, minLog + (maxLog - minLog) * t);
  }

  _capRadiusIndexFromRatio(ratio) {
    const clampedRatio = Math.min(Math.max(ratio, CAP_RADIUS_MIN), CAP_RADIUS_MAX);
    const minLog = Math.log2(CAP_RADIUS_MIN);
    const maxLog = Math.log2(CAP_RADIUS_MAX);
    const t = (Math.log2(clampedRatio) - minLog) / (maxLog - minLog);
    return Math.round(t * (CAP_RADIUS_POSITIONS - 1));
  }

  /**
   * Get the sides of selected rib points.
   * @returns {Set} Set of "contourIdx/pointIdx/side" strings for selected rib points
   */
  _getSelectedRibSides() {
    const {
      skeletonRibPoint,
      point: pointSelection,
      editableGeneratedPoint,
    } = parseSelection(this.sceneController.selection);

    const selectedRibSides = new Set();

    if (skeletonRibPoint) {
      for (const key of skeletonRibPoint) {
        selectedRibSides.add(key);
      }
    }

    // If selection includes editable generated points, add their rib sides
    if (editableGeneratedPoint) {
      for (const key of editableGeneratedPoint) {
        // Format: "pathPointIndex/skeletonContourIndex/skeletonPointIndex/side"
        const parts = key.split("/");
        if (parts.length === 4) {
          selectedRibSides.add(`${parts[1]}/${parts[2]}/${parts[3]}`);
        }
      }
    }

    // Also map selected generated points (on-curve rib points or off-curve handles)
    // back to their corresponding rib sides.
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    if (positionedGlyph && pointSelection?.length) {
      for (const pointIndex of pointSelection) {
        const ribInfo = this.sceneController.sceneModel._getEditableRibPointForGeneratedPoint(
          positionedGlyph,
          pointIndex
        );
        if (ribInfo) {
          selectedRibSides.add(
            `${ribInfo.skeletonContourIndex}/${ribInfo.skeletonPointIndex}/${ribInfo.side}`
          );
        }

        const handleInfo = this.sceneController.sceneModel._getEditableHandleForGeneratedPoint(
          positionedGlyph,
          pointIndex
        );
        if (handleInfo) {
          selectedRibSides.add(
            `${handleInfo.skeletonContourIndex}/${handleInfo.skeletonPointIndex}/${handleInfo.side}`
          );
        }
      }
    }

    return selectedRibSides;
  }

  /**
   * Compute a signature representing current panel state.
   * Used to skip unnecessary form rebuilds.
   */
  _computeStateSignature() {
    const parts = [];

      // Source widths and defaults
      parts.push(`w:${this._getSourceWidth(SKELETON_WIDTH_CAPITAL_BASE_KEY, DEFAULT_WIDTH_CAPITAL_BASE)},${this._getSourceWidth(SKELETON_WIDTH_CAPITAL_HORIZONTAL_KEY, DEFAULT_WIDTH_CAPITAL_HORIZONTAL)},${this._getSourceWidth(SKELETON_WIDTH_CAPITAL_CONTRAST_KEY, DEFAULT_WIDTH_CAPITAL_CONTRAST)},${this._getSourceWidth(SKELETON_WIDTH_LOWERCASE_BASE_KEY, DEFAULT_WIDTH_LOWERCASE_BASE)},${this._getSourceWidth(SKELETON_WIDTH_LOWERCASE_HORIZONTAL_KEY, DEFAULT_WIDTH_LOWERCASE_HORIZONTAL)},${this._getSourceWidth(SKELETON_WIDTH_LOWERCASE_CONTRAST_KEY, DEFAULT_WIDTH_LOWERCASE_CONTRAST)}`);
      parts.push(
        `wd:${this._getSourceCustomDataValue(SKELETON_WIDTH_CAPITAL_DISTRIBUTION_KEY, DEFAULT_DISTRIBUTION)},${this._getSourceCustomDataValue(SKELETON_WIDTH_LOWERCASE_DISTRIBUTION_KEY, DEFAULT_DISTRIBUTION)}`
      );
      parts.push(
        `capd:${this._getSourceCustomDataValue(SKELETON_CAP_RADIUS_RATIO_KEY, DEFAULT_CAP_RADIUS_RATIO)},${this._getSourceCustomDataValue(SKELETON_CAP_TENSION_KEY, DEFAULT_CAP_TENSION)},${this._getSourceCustomDataValue(SKELETON_CAP_ANGLE_KEY, DEFAULT_CAP_ANGLE)},${this._getSourceCustomDataValue(SKELETON_CAP_DISTANCE_KEY, DEFAULT_CAP_DISTANCE)}`
      );

    // Single-sided state
    parts.push(`ss:${this._getCurrentSingleSided()},${this._getCurrentSingleSidedDirection()}`);

    // Selection (just the string representation)
    const sel = this.sceneController.selection;
    parts.push(`s:${sel ? sel.size : 0}`);

    // Include selected rib sides to distinguish skeleton vs rib selection
    const selectedRibSides = this._getSelectedRibSides();
    if (selectedRibSides?.size) {
      parts.push(`rs:${[...selectedRibSides].sort().join(",")}`);
    } else {
      parts.push("rs:");
    }

    // Glyph case
    const glyphCase = this._getGlyphCase();
    parts.push(`gc:${glyphCase}`);

      // Selected skeleton points state (including editable and nudge)
      const selectedData = this._getSelectedSkeletonPoints();
      if (selectedData) {
        const { key: widthKey, fallback: widthFallback } = this._getDefaultWidthForGlyph();
        const defaultWidth = this._getSourceWidth(widthKey, widthFallback);
        for (const { contourIdx, pointIdx, point } of selectedData.points) {
          const contour = selectedData.skeletonData?.contours?.[contourIdx];
          const w = this._getPointWidths(point, defaultWidth);
          const isAsym = this._isAsymmetric(point);
          // Include editable and nudge state for Reset button visibility
          const leftEdit = point.leftEditable ? 1 : 0;
          const rightEdit = point.rightEditable ? 1 : 0;
          const leftNudge = point.leftNudge || 0;
          const rightNudge = point.rightNudge || 0;
          const capStyle = point.capStyle ?? "";
          const capRadiusRatio = point.capRadiusRatio ?? contour?.capRadiusRatio ?? "";
          const capTension = point.capTension ?? contour?.capTension ?? "";
          const capAngle = point.capAngle ?? contour?.capAngle ?? "";
          const capDistance = point.capDistance ?? contour?.capDistance ?? "";
          const forceH = point.forceHorizontal ? 1 : 0;
          const forceV = point.forceVertical ? 1 : 0;
          parts.push(`${contourIdx}/${pointIdx}:${Math.round(w.left)},${Math.round(w.right)},${isAsym},${leftEdit},${rightEdit},${leftNudge},${rightNudge},${capStyle},${capRadiusRatio},${capTension},${capAngle},${capDistance},${forceH},${forceV}`);
        }
      }

      const confirmPoint = this._confirmState?.point?.pending ? 1 : 0;
      const confirmSquare = this._confirmState?.square?.pending ? 1 : 0;
      const confirmRound = this._confirmState?.round?.pending ? 1 : 0;
      parts.push(`confirm:${confirmPoint},${confirmSquare},${confirmRound}`);

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

          const defaultWidth = contour.defaultWidth || this._getSourceWidth(this._getDefaultWidthForGlyph().key, this._getDefaultWidthForGlyph().fallback);

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
   * Handle single-sided toggle change.
   */
  async _onSingleSidedToggle(checked) {
    // Update local state immediately for UI
    this._singleSidedState.enabled = checked;
    // Persist to skeleton data and regenerate contours
    await this._setSingleSided(checked);
    // Then rebuild UI
    this._lastStateSignature = null;
    this.update();
  }

  /**
   * Handle single-sided direction change.
   */
  async _onSingleSidedDirectionChange(value) {
    // Update local state immediately for UI
    this._singleSidedState.direction = value;
    // Persist to skeleton data and regenerate contours
    await this._setSingleSidedDirection(value);
    // Then rebuild UI
    this._lastStateSignature = null;
    this.update();
  }

  /**
   * Sync single-sided state from skeleton data.
   */
  _syncSingleSidedState() {
    const selectedData = this._getSelectedSkeletonPoints();
    if (selectedData && selectedData.points.length > 0) {
      const contourIdx = selectedData.points[0].contourIdx;
      const contour = selectedData.skeletonData.contours[contourIdx];
      this._singleSidedState.enabled = contour?.singleSided ?? false;
      this._singleSidedState.direction = contour?.singleSidedDirection ?? "left";
    }
  }

  /**
   * Set cap style for selected skeleton endpoints.
   */
  async _onCapStyleChange(value) {
    const selectedData = this._getSelectedSkeletonPoints();
    if (!selectedData) {
      this.update();
      return;
    }

    const capStyle = value === "flat" ? "butt" : value;

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = JSON.parse(
          JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
        );
        let changed = false;

        for (const { contourIdx, pointIdx } of selectedData.points) {
          const contour = skeletonData.contours[contourIdx];
          if (!contour || contour.isClosed) continue;
          const endpoints = this._getContourEndpointIndices(contour);
          if (!endpoints) continue;
          if (pointIdx !== endpoints.firstOnCurve && pointIdx !== endpoints.lastOnCurve) {
            continue;
          }
          const point = contour.points[pointIdx];
          if (!point || point.type) continue;
          point.capStyle = capStyle;
          if (capStyle === "round" || capStyle === "square") {
            this._disableEditableSide(point, "left");
            this._disableEditableSide(point, "right");
          }
          changed = true;
        }

        if (!changed) continue;

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
        undoLabel: "Set cap style",
        broadcast: true,
      };
    });

    this.update();
  }

  async _setCapParameterForSelection(paramKey, value) {
    const selectedData = this._getSelectedSkeletonPoints();
    if (!selectedData) {
      return;
    }

    const clampedValue = this._clampCapParam(paramKey, value);

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const combined = this._buildCapParameterChanges(
        glyph,
        selectedData,
        paramKey,
        clampedValue,
        null,
        false
      );
      if (!combined) return;

      await sendIncrementalChange(combined.change);

      return {
        changes: combined,
        undoLabel: this._capParamUndoLabel(paramKey),
        broadcast: true,
      };
    });
  }

  async _setCapParameterForSelectionStream(paramKey, valueStream) {
    const selectedData = this._getSelectedSkeletonPoints();
    if (!selectedData) {
      return;
    }

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const layerInfo = [];
      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;
        layerInfo.push({
          editLayerName,
          layer,
          originalSkeletonData: JSON.parse(
            JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
          ),
        });
      }

      let lastValue = null;
      for await (const raw of valueStream) {
        const clampedValue = this._clampCapParam(paramKey, raw);
        lastValue = clampedValue;
        const combined = this._buildCapParameterChanges(
          glyph,
          selectedData,
          paramKey,
          clampedValue,
          null,
          false
        );
        if (combined) {
          await sendIncrementalChange(combined.change, true);
        }
      }

      if (lastValue === null) return;

      const finalCombined = this._buildCapParameterChanges(
        glyph,
        selectedData,
        paramKey,
        lastValue,
        layerInfo,
        true
      );
      if (!finalCombined) return;

      return {
        changes: finalCombined,
        undoLabel: this._capParamUndoLabel(paramKey),
        broadcast: true,
      };
    });
  }

  _clampCapParam(paramKey, value) {
    if (paramKey === "capRadiusRatio") {
      return Math.min(Math.max(value, CAP_RADIUS_MIN), CAP_RADIUS_MAX);
    }
    if (paramKey === "capTension") {
      return Math.min(Math.max(value, 0.0), 1.0);
    }
    if (paramKey === "capAngle") {
      return Math.min(Math.max(value, CAP_ANGLE_MIN), CAP_ANGLE_MAX);
    }
    if (paramKey === "capDistance") {
      return Math.max(0, value);
    }
    return value;
  }

  _capParamUndoLabel(paramKey) {
    return paramKey === "capRadiusRatio"
      ? "Set cap radius"
      : paramKey === "capTension"
        ? "Set cap tension"
        : paramKey === "capAngle"
          ? "Set cap angle"
          : paramKey === "capDistance"
            ? "Set cap distance"
            : "Set cap parameter";
  }

  _buildCapParameterChanges(
    glyph,
    selectedData,
    paramKey,
    value,
    layerInfo,
    resetBaseline
  ) {
    const allChanges = [];
    const layers = layerInfo || this.sceneController.editingLayerNames.map((editLayerName) => {
      const layer = glyph.layers[editLayerName];
      if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) return null;
      return {
        editLayerName,
        layer,
        originalSkeletonData: null,
      };
    }).filter(Boolean);

    for (const info of layers) {
      const { editLayerName, layer } = info;
      const baseSkeletonData = info.originalSkeletonData
        ? JSON.parse(JSON.stringify(info.originalSkeletonData))
        : JSON.parse(JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY]));

      if (resetBaseline && info.originalSkeletonData) {
        layer.customData[SKELETON_CUSTOM_DATA_KEY] = JSON.parse(
          JSON.stringify(info.originalSkeletonData)
        );
        this._regenerateOutlineContours(layer.glyph, layer.customData[SKELETON_CUSTOM_DATA_KEY]);
      }

      const skeletonData = JSON.parse(JSON.stringify(baseSkeletonData));
      let changed = false;

      for (const { contourIdx, pointIdx } of selectedData.points) {
        const contour = skeletonData.contours[contourIdx];
        if (!contour || contour.isClosed) continue;
        const endpoints = this._getContourEndpointIndices(contour);
        if (!endpoints) continue;
        if (pointIdx !== endpoints.firstOnCurve && pointIdx !== endpoints.lastOnCurve) {
          continue;
        }
        const point = contour.points[pointIdx];
        if (!point || point.type) continue;
        point[paramKey] = value;
        changed = true;
      }

      if (!changed) continue;

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

    if (allChanges.length === 0) return null;
    return new ChangeCollector().concat(...allChanges);
  }

  async _onCapRadiusChange(value) {
    await this._setCapParameterForSelection("capRadiusRatio", value);
    this.update();
  }

  async _onCapTensionChange(percentValue) {
    const tension = percentValue / 100;
    await this._setCapParameterForSelection("capTension", tension);
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
   * Toggle Editable mode for selected rib points.
   * When enabled, rib points can be nudged along the tangent direction
   * and their handle lengths can be adjusted.
   * @param {boolean} checked - Whether to enable or disable editable mode
   * @param {Set} selectedRibSides - Set of "contourIdx/pointIdx/side" strings
   */
  async _onEditableToggle(checked, selectedRibSides) {
    if (!selectedRibSides || selectedRibSides.size === 0) {
      this.update();
      return;
    }

    // Parse selected rib sides into a map: "contourIdx/pointIdx" -> Set of sides
    const pointSidesMap = new Map();
    for (const key of selectedRibSides) {
      const parts = key.split("/");
      const pointKey = `${parts[0]}/${parts[1]}`;
      const side = parts[2];
      if (!pointSidesMap.has(pointKey)) {
        pointSidesMap.set(pointKey, new Set());
      }
      pointSidesMap.get(pointKey).add(side);
    }

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = JSON.parse(
          JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
        );

        for (const [pointKey, sides] of pointSidesMap) {
          const [contourIdx, pointIdx] = pointKey.split("/").map(Number);
          const contour = skeletonData.contours[contourIdx];
          if (!contour) continue;
          const point = contour.points[pointIdx];
          if (!point) continue;
          const isLocked = this._isCapStyleEditableLocked(contour, pointIdx);

          // Update editable state for each selected side
          for (const side of sides) {
            const editableKey = side === "left" ? "leftEditable" : "rightEditable";
            const nudgeKey = side === "left" ? "leftNudge" : "rightNudge";
            const handleInKey = side === "left" ? "leftHandleIn" : "rightHandleIn";
            const handleOutKey = side === "left" ? "leftHandleOut" : "rightHandleOut";
            const handleInAngleKey = side === "left" ? "leftHandleInAngle" : "rightHandleInAngle";
            const handleOutAngleKey = side === "left" ? "leftHandleOutAngle" : "rightHandleOutAngle";
            // Legacy 1D handle offset keys
            const handleInOffsetKey = side === "left" ? "leftHandleInOffset" : "rightHandleInOffset";
            const handleOutOffsetKey = side === "left" ? "leftHandleOutOffset" : "rightHandleOutOffset";
            // New 2D handle offset keys
            const handleInOffsetXKey = side === "left" ? "leftHandleInOffsetX" : "rightHandleInOffsetX";
            const handleInOffsetYKey = side === "left" ? "leftHandleInOffsetY" : "rightHandleInOffsetY";
            const handleOutOffsetXKey = side === "left" ? "leftHandleOutOffsetX" : "rightHandleOutOffsetX";
            const handleOutOffsetYKey = side === "left" ? "leftHandleOutOffsetY" : "rightHandleOutOffsetY";
            // Saved keys for preserving values when toggling editable off/on
            const nudgeSavedKey = side === "left" ? "leftNudgeSaved" : "rightNudgeSaved";
            const handleInOffsetSavedKey = side === "left" ? "leftHandleInOffsetSaved" : "rightHandleInOffsetSaved";
            const handleOutOffsetSavedKey = side === "left" ? "leftHandleOutOffsetSaved" : "rightHandleOutOffsetSaved";

            if (isLocked) {
              this._disableEditableSide(point, side);
              continue;
            }

            if (checked) {
              point[editableKey] = true;
              // Restore saved values if they exist
              if (point[nudgeSavedKey] !== undefined) {
                point[nudgeKey] = point[nudgeSavedKey];
                delete point[nudgeSavedKey];
              }
              if (point[handleInOffsetSavedKey] !== undefined) {
                point[handleInOffsetKey] = point[handleInOffsetSavedKey];
                delete point[handleInOffsetSavedKey];
              }
              if (point[handleOutOffsetSavedKey] !== undefined) {
                point[handleOutOffsetKey] = point[handleOutOffsetSavedKey];
                delete point[handleOutOffsetSavedKey];
              }
            } else {
              this._disableEditableSide(point, side);
            }
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
        undoLabel: checked ? "Enable editable rib points" : "Disable editable rib points",
        broadcast: true,
      };
    });

    this.update();
  }

  /**
   * Toggle Detach Handles mode for selected editable rib points.
   * When enabled, handle positions are stored as absolute offsets from the rib point,
   * independent of skeleton handle lengths.
   * @param {boolean} checked - Whether to enable or disable detach mode
   * @param {Set} selectedRibSides - Set of "contourIdx/pointIdx/side" strings
   */
  async _onDetachHandlesToggle(checked, selectedRibSides) {
    if (!selectedRibSides || selectedRibSides.size === 0) {
      this.update();
      return;
    }

    // Parse selected rib sides into a map: "contourIdx/pointIdx" -> Set of sides
    const pointSidesMap = new Map();
    for (const key of selectedRibSides) {
      const parts = key.split("/");
      const pointKey = `${parts[0]}/${parts[1]}`;
      const side = parts[2];
      if (!pointSidesMap.has(pointKey)) {
        pointSidesMap.set(pointKey, new Set());
      }
      pointSidesMap.get(pointKey).add(side);
    }

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = JSON.parse(
          JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
        );

        // Get the current generated path to find handle positions
        const generatedPath = layer.glyph.path;

        for (const [pointKey, sides] of pointSidesMap) {
          const [contourIdx, pointIdx] = pointKey.split("/").map(Number);
          const contour = skeletonData.contours[contourIdx];
          if (!contour) continue;
          const point = contour.points[pointIdx];
          if (!point) continue;

          const defaultWidth = contour.defaultWidth || 20;
          const singleSided = contour.singleSided ?? false;
          const singleSidedDirection = contour.singleSidedDirection ?? "left";

          // Update detached state for each selected side
          for (const side of sides) {
            const detachedKey = side === "left" ? "leftHandleDetached" : "rightHandleDetached";

            if (checked) {
              // When enabling detach, capture current handle positions as 2D offsets
              const normal = calculateNormalAtSkeletonPoint(contour, pointIdx);
              const tangent = { x: -normal.y, y: normal.x };

              let halfWidth = getPointHalfWidth(point, defaultWidth, side);
              if (singleSided && singleSidedDirection === side) {
                const leftHW = getPointHalfWidth(point, defaultWidth, "left");
                const rightHW = getPointHalfWidth(point, defaultWidth, "right");
                halfWidth = leftHW + rightHW;
              }

              const nudgeKey = side === "left" ? "leftNudge" : "rightNudge";
              const nudge = point[nudgeKey] || 0;
              const sign = side === "left" ? 1 : -1;

              // Calculate rib point position
              const ribPoint = {
                x: Math.round(point.x + sign * normal.x * halfWidth + tangent.x * nudge),
                y: Math.round(point.y + sign * normal.y * halfWidth + tangent.y * nudge),
              };

              // Find handles in generated path by matching rib point position
              const handlePositions = this._findHandlePositionsForRibPoint(
                generatedPath, ribPoint, side
              );

              // Store handle offsets relative to rib point
              for (const handleType of ["in", "out"]) {
                const handlePos = handlePositions?.[handleType];
                if (handlePos) {
                  const offsetXKey = side === "left"
                    ? (handleType === "in" ? "leftHandleInOffsetX" : "leftHandleOutOffsetX")
                    : (handleType === "in" ? "rightHandleInOffsetX" : "rightHandleOutOffsetX");
                  const offsetYKey = side === "left"
                    ? (handleType === "in" ? "leftHandleInOffsetY" : "leftHandleOutOffsetY")
                    : (handleType === "in" ? "rightHandleInOffsetY" : "rightHandleOutOffsetY");

                  point[offsetXKey] = handlePos.x - ribPoint.x;
                  point[offsetYKey] = handlePos.y - ribPoint.y;

                  // Clear legacy 1D offset
                  const offset1DKey = side === "left"
                    ? (handleType === "in" ? "leftHandleInOffset" : "leftHandleOutOffset")
                    : (handleType === "in" ? "rightHandleInOffset" : "rightHandleOutOffset");
                  delete point[offset1DKey];
                }
              }

              point[detachedKey] = true;
            } else {
              // When disabling detach, preserve handle positions by converting
              // offsets from rib-point space to control-point space.
              const normal = calculateNormalAtSkeletonPoint(contour, pointIdx);
              const tangent = { x: -normal.y, y: normal.x };

              let halfWidth = getPointHalfWidth(point, defaultWidth, side);
              if (singleSided && singleSidedDirection === side) {
                const leftHW = getPointHalfWidth(point, defaultWidth, "left");
                const rightHW = getPointHalfWidth(point, defaultWidth, "right");
                halfWidth = leftHW + rightHW;
              }

              const nudgeKey = side === "left" ? "leftNudge" : "rightNudge";
              const nudge = point[nudgeKey] || 0;
              const sign = side === "left" ? 1 : -1;

              const ribPoint = {
                x: Math.round(point.x + sign * normal.x * halfWidth + tangent.x * nudge),
                y: Math.round(point.y + sign * normal.y * halfWidth + tangent.y * nudge),
              };

              const currentHandlePositions = this._findHandlePositionsForRibPoint(
                generatedPath, ribPoint, side
              );

              const tempSkeletonData = JSON.parse(JSON.stringify(skeletonData));
              const tempPoint = tempSkeletonData.contours?.[contourIdx]?.points?.[pointIdx];
              const handleInOffsetXKey = side === "left" ? "leftHandleInOffsetX" : "rightHandleInOffsetX";
              const handleInOffsetYKey = side === "left" ? "leftHandleInOffsetY" : "rightHandleInOffsetY";
              const handleOutOffsetXKey = side === "left" ? "leftHandleOutOffsetX" : "rightHandleOutOffsetX";
              const handleOutOffsetYKey = side === "left" ? "leftHandleOutOffsetY" : "rightHandleOutOffsetY";

              if (tempPoint) {
                delete tempPoint[detachedKey];
                delete tempPoint[handleInOffsetXKey];
                delete tempPoint[handleInOffsetYKey];
                delete tempPoint[handleOutOffsetXKey];
                delete tempPoint[handleOutOffsetYKey];
              }

              const baseContours = generateContoursFromSkeleton(tempSkeletonData);
              const basePath = VarPackedPath.fromUnpackedContours(baseContours);
              const baseHandlePositions = this._findHandlePositionsForRibPoint(
                basePath, ribPoint, side
              );

              if (currentHandlePositions && baseHandlePositions) {
                for (const handleType of ["in", "out"]) {
                  const currentPos = currentHandlePositions[handleType];
                  const basePos = baseHandlePositions[handleType];
                  if (!currentPos || !basePos) continue;

                  const offsetXKey = side === "left"
                    ? (handleType === "in" ? "leftHandleInOffsetX" : "leftHandleOutOffsetX")
                    : (handleType === "in" ? "rightHandleInOffsetX" : "rightHandleOutOffsetX");
                  const offsetYKey = side === "left"
                    ? (handleType === "in" ? "leftHandleInOffsetY" : "leftHandleOutOffsetY")
                    : (handleType === "in" ? "rightHandleInOffsetY" : "rightHandleOutOffsetY");

                  point[offsetXKey] = currentPos.x - basePos.x;
                  point[offsetYKey] = currentPos.y - basePos.y;
                }
              }

              delete point[detachedKey];
            }
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
        undoLabel: checked ? "Detach handle lengths" : "Attach handle lengths",
        broadcast: true,
      };
    });

    this.update();
  }

  /**
   * Find handle positions for a rib point in the generated path.
   * @param {Object} path - The generated path
   * @param {Object} ribPoint - The rib point position {x, y}
   * @param {string} side - "left" or "right"
   * @returns {Object|null} { in: {x, y}, out: {x, y} } or null
   */
  _findHandlePositionsForRibPoint(path, ribPoint, side) {
    if (!path) return null;

    const tolerance = 2;
    const numPoints = path.numPoints;

    // Find the rib point (on-curve) in the path
    for (let i = 0; i < numPoints; i++) {
      const pointType = path.pointTypes[i];
      const isOnCurve = (pointType & 0x03) === 0;
      if (!isOnCurve) continue;

      const pt = path.getPoint(i);
      const dx = Math.abs(pt.x - ribPoint.x);
      const dy = Math.abs(pt.y - ribPoint.y);

      if (dx <= tolerance && dy <= tolerance) {
        // Found the rib point, now get adjacent handles
        const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(i);
        const numContourPoints = path.getNumPointsOfContour(contourIndex);
        const contourStart = i - contourPointIndex;

        const wrapIndex = (idx) => {
          const relative = idx - contourStart;
          const wrapped = ((relative % numContourPoints) + numContourPoints) % numContourPoints;
          return contourStart + wrapped;
        };

        const prevIdx = wrapIndex(i - 1);
        const nextIdx = wrapIndex(i + 1);

        const prevType = path.pointTypes[prevIdx];
        const nextType = path.pointTypes[nextIdx];
        const prevIsOffCurve = (prevType & 0x03) !== 0;
        const nextIsOffCurve = (nextType & 0x03) !== 0;

        const result = {};

        // For right side, contour direction is opposite, so swap in/out
        if (side === "left") {
          if (prevIsOffCurve) result.in = path.getPoint(prevIdx);
          if (nextIsOffCurve) result.out = path.getPoint(nextIdx);
        } else {
          // Right side: prev = out, next = in (opposite direction)
          if (prevIsOffCurve) result.out = path.getPoint(prevIdx);
          if (nextIsOffCurve) result.in = path.getPoint(nextIdx);
        }

        return Object.keys(result).length > 0 ? result : null;
      }
    }

    return null;
  }

  /**
   * Check if any selected editable rib points have nudge values.
   * @param {Set} selectedRibSides - Set of "contourIdx/pointIdx/side" strings
   * @returns {boolean} True if at least one selected editable rib point has nudge
   */
  _selectedRibPointsHaveNudge(selectedRibSides) {
    if (!selectedRibSides || selectedRibSides.size === 0) return false;

    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    const editLayerName = this.sceneController.editingLayerNames?.[0];
    const layer = positionedGlyph?.varGlyph?.glyph?.layers?.[editLayerName];
    const skeletonData = layer?.customData?.[SKELETON_CUSTOM_DATA_KEY];
    if (!skeletonData) return false;

    for (const key of selectedRibSides) {
      const parts = key.split("/");
      const contourIdx = parseInt(parts[0], 10);
      const pointIdx = parseInt(parts[1], 10);
      const side = parts[2];

      const point = skeletonData.contours[contourIdx]?.points[pointIdx];
      if (!point) continue;

      const editableKey = side === "left" ? "leftEditable" : "rightEditable";
      const nudgeKey = side === "left" ? "leftNudge" : "rightNudge";

      if (point[editableKey] && point[nudgeKey] && point[nudgeKey] !== 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if any selected editable rib points have handle offset values.
   * @param {Set} selectedRibSides - Set of "contourIdx/pointIdx/side" strings
   * @returns {boolean} True if at least one selected editable rib point has handle offsets
   */
  _selectedRibPointsHaveHandleOffsets(selectedRibSides) {
    if (!selectedRibSides || selectedRibSides.size === 0) return false;

    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    const editLayerName = this.sceneController.editingLayerNames?.[0];
    const layer = positionedGlyph?.varGlyph?.glyph?.layers?.[editLayerName];
    const skeletonData = layer?.customData?.[SKELETON_CUSTOM_DATA_KEY];
    if (!skeletonData) return false;

    for (const key of selectedRibSides) {
      const parts = key.split("/");
      const contourIdx = parseInt(parts[0], 10);
      const pointIdx = parseInt(parts[1], 10);
      const side = parts[2];

      const point = skeletonData.contours[contourIdx]?.points[pointIdx];
      if (!point) continue;

      const editableKey = side === "left" ? "leftEditable" : "rightEditable";
      // Legacy 1D offset keys
      const handleInOffsetKey = side === "left" ? "leftHandleInOffset" : "rightHandleInOffset";
      const handleOutOffsetKey = side === "left" ? "leftHandleOutOffset" : "rightHandleOutOffset";
      // New 2D offset keys
      const handleInOffsetXKey = side === "left" ? "leftHandleInOffsetX" : "rightHandleInOffsetX";
      const handleInOffsetYKey = side === "left" ? "leftHandleInOffsetY" : "rightHandleInOffsetY";
      const handleOutOffsetXKey = side === "left" ? "leftHandleOutOffsetX" : "rightHandleOutOffsetX";
      const handleOutOffsetYKey = side === "left" ? "leftHandleOutOffsetY" : "rightHandleOutOffsetY";

      if (point[editableKey] &&
          ((point[handleInOffsetKey] && point[handleInOffsetKey] !== 0) ||
           (point[handleOutOffsetKey] && point[handleOutOffsetKey] !== 0) ||
           (point[handleInOffsetXKey] && point[handleInOffsetXKey] !== 0) ||
           (point[handleInOffsetYKey] && point[handleInOffsetYKey] !== 0) ||
           (point[handleOutOffsetXKey] && point[handleOutOffsetXKey] !== 0) ||
           (point[handleOutOffsetYKey] && point[handleOutOffsetYKey] !== 0))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Reset handle offset values for selected editable rib points to 0.
   * This returns the handles to their generated positions without affecting nudge.
   * @param {Set} selectedRibSides - Set of "contourIdx/pointIdx/side" strings
   */
  async _onResetHandleOffsets(selectedRibSides) {
    if (!selectedRibSides || selectedRibSides.size === 0) {
      return;
    }

    // Parse selected rib sides into a map: "contourIdx/pointIdx" -> Set of sides
    const pointSidesMap = new Map();
    for (const key of selectedRibSides) {
      const parts = key.split("/");
      const pointKey = `${parts[0]}/${parts[1]}`;
      const side = parts[2];
      if (!pointSidesMap.has(pointKey)) {
        pointSidesMap.set(pointKey, new Set());
      }
      pointSidesMap.get(pointKey).add(side);
    }

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = JSON.parse(
          JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
        );

        for (const [pointKey, sides] of pointSidesMap) {
          const [contourIdx, pointIdx] = pointKey.split("/").map(Number);
          const contour = skeletonData.contours[contourIdx];
          if (!contour) continue;
          const point = contour.points[pointIdx];
          if (!point) continue;

          // Reset handle offsets for each selected side (only if editable)
          for (const side of sides) {
            const editableKey = side === "left" ? "leftEditable" : "rightEditable";
            // Legacy 1D offset keys
            const handleInOffsetKey = side === "left" ? "leftHandleInOffset" : "rightHandleInOffset";
            const handleOutOffsetKey = side === "left" ? "leftHandleOutOffset" : "rightHandleOutOffset";
            const handleInOffsetSavedKey = side === "left" ? "leftHandleInOffsetSaved" : "rightHandleInOffsetSaved";
            const handleOutOffsetSavedKey = side === "left" ? "leftHandleOutOffsetSaved" : "rightHandleOutOffsetSaved";
            // New 2D offset keys
            const handleInOffsetXKey = side === "left" ? "leftHandleInOffsetX" : "rightHandleInOffsetX";
            const handleInOffsetYKey = side === "left" ? "leftHandleInOffsetY" : "rightHandleInOffsetY";
            const handleOutOffsetXKey = side === "left" ? "leftHandleOutOffsetX" : "rightHandleOutOffsetX";
            const handleOutOffsetYKey = side === "left" ? "leftHandleOutOffsetY" : "rightHandleOutOffsetY";

            if (point[editableKey]) {
              // Clear legacy 1D offsets
              delete point[handleInOffsetKey];
              delete point[handleOutOffsetKey];
              delete point[handleInOffsetSavedKey];
              delete point[handleOutOffsetSavedKey];
              // Clear new 2D offsets
              delete point[handleInOffsetXKey];
              delete point[handleInOffsetYKey];
              delete point[handleOutOffsetXKey];
              delete point[handleOutOffsetYKey];
            }
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
        undoLabel: "Reset handle offsets",
        broadcast: true,
      };
    });

    this.update();
  }

  /**
   * Reset nudge values for selected editable rib points to 0.
   * This returns the rib points to their generated positions without disabling editable.
   * @param {Set} selectedRibSides - Set of "contourIdx/pointIdx/side" strings
   */
  async _onResetRibPosition(selectedRibSides) {
    if (!selectedRibSides || selectedRibSides.size === 0) {
      return;
    }

    // Parse selected rib sides into a map: "contourIdx/pointIdx" -> Set of sides
    const pointSidesMap = new Map();
    for (const key of selectedRibSides) {
      const parts = key.split("/");
      const pointKey = `${parts[0]}/${parts[1]}`;
      const side = parts[2];
      if (!pointSidesMap.has(pointKey)) {
        pointSidesMap.set(pointKey, new Set());
      }
      pointSidesMap.get(pointKey).add(side);
    }

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const allChanges = [];

      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;

        const skeletonData = JSON.parse(
          JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
        );

        for (const [pointKey, sides] of pointSidesMap) {
          const [contourIdx, pointIdx] = pointKey.split("/").map(Number);
          const contour = skeletonData.contours[contourIdx];
          if (!contour) continue;
          const point = contour.points[pointIdx];
          if (!point) continue;

          // Reset nudge for each selected side (only if editable)
          for (const side of sides) {
            const editableKey = side === "left" ? "leftEditable" : "rightEditable";
            const nudgeKey = side === "left" ? "leftNudge" : "rightNudge";

            if (point[editableKey]) {
              delete point[nudgeKey];
            }
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
        undoLabel: "Reset rib point position",
        broadcast: true,
      };
    });

    this.update();
  }

  /**
   * Get info about editable ribs for selected skeleton points.
   * @param {Object} selectedData - Data from _getSelectedSkeletonPoints()
   * @returns {Object} { hasEditableRibs, hasNudgedRibs }
   */
  _getSkeletonPointsRibEditInfo(selectedData) {
    if (!selectedData || selectedData.points.length === 0) {
      return { hasEditableRibs: false, hasNudgedRibs: false };
    }

    let hasEditableRibs = false;
    let hasNudgedRibs = false;

    for (const { point } of selectedData.points) {
      if (point.leftEditable || point.rightEditable) {
        hasEditableRibs = true;

        if ((point.leftEditable && point.leftNudge && point.leftNudge !== 0) ||
            (point.rightEditable && point.rightNudge && point.rightNudge !== 0)) {
          hasNudgedRibs = true;
          break; // Found both, no need to continue
        }
      }
    }

    return { hasEditableRibs, hasNudgedRibs };
  }

  /**
   * Reset nudge for all editable ribs of selected skeleton points.
   * @param {Object} selectedData - Data from _getSelectedSkeletonPoints()
   */
  async _onResetSkeletonRibs(selectedData) {
    if (!selectedData || selectedData.points.length === 0) {
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

          // Reset nudge for both sides if editable
          if (point.leftEditable) {
            delete point.leftNudge;
          }
          if (point.rightEditable) {
            delete point.rightNudge;
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
        undoLabel: "Reset skeleton ribs",
        broadcast: true,
      };
    });

    this.update();
  }

  /**
   * Make all ribs of selected skeleton points uneditable.
   * @param {Object} selectedData - Data from _getSelectedSkeletonPoints()
   */
  async _onMakeRibsUneditable(selectedData) {
    if (!selectedData || selectedData.points.length === 0) {
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

          // Remove all editable-related properties
          delete point.leftEditable;
          delete point.rightEditable;
          delete point.leftNudge;
          delete point.rightNudge;
          delete point.leftHandleIn;
          delete point.leftHandleOut;
          delete point.rightHandleIn;
          delete point.rightHandleOut;
          delete point.leftHandleInAngle;
          delete point.leftHandleOutAngle;
          delete point.rightHandleInAngle;
          delete point.rightHandleOutAngle;
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
        undoLabel: "Make ribs uneditable",
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

          const defaultWidth = contour.defaultWidth || this._getSourceWidth(this._getDefaultWidthForGlyph().key, this._getDefaultWidthForGlyph().fallback);

          // Check if contour is single-sided
          const isSingleSided = contour.singleSided ?? false;

          if (isSingleSided) {
            // Single-sided mode: the value is the full width, store as symmetric
            point.width = value;
            delete point.leftWidth;
            delete point.rightWidth;
          } else if (isAsym) {
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
          const defaultWidth = contour.defaultWidth || this._getSourceWidth(this._getDefaultWidthForGlyph().key, this._getDefaultWidthForGlyph().fallback);
          const currentLeft = point.leftWidth ?? (point.width ?? defaultWidth) / 2;
          const currentRight = point.rightWidth ?? (point.width ?? defaultWidth) / 2;

          // Apply scale, clamping total width to minimum 2 UPM
          let newLeft = currentLeft * scale;
          let newRight = currentRight * scale;
          const totalWidth = newLeft + newRight;
          if (totalWidth < 2) {
            const ratio = 2 / totalWidth;
            newLeft *= ratio;
            newRight *= ratio;
          }
          newLeft = Math.round(newLeft);
          newRight = Math.round(newRight);

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
   * Set point distribution directly.
   * For multi-selection: all points move with the same speed, clamping at skeleton (width=0).
   * For single selection: distribution maps directly to left/right ratio.
   */
  async _setPointDistributionDirect(distribution) {
    const selectedData = this._getSelectedSkeletonPoints();
    if (!selectedData) return;

    const isMulti = this._multiSelectionState && this._multiSelectionState.pointStates.size > 0;

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
        const combined = this._buildPointDistributionChanges(
          glyph,
          selectedData,
          distribution,
          isMulti,
          null,
          false
        );
        if (!combined) return;

        await sendIncrementalChange(combined.change);

        return {
          changes: combined,
          undoLabel: "Set point distribution",
          broadcast: true,
        };
      });
  }

  async _setPointDistributionStream(valueStream) {
    const selectedData = this._getSelectedSkeletonPoints();
    if (!selectedData) return;

    const isMulti = this._multiSelectionState && this._multiSelectionState.pointStates.size > 0;

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const layerInfo = [];
      for (const editLayerName of this.sceneController.editingLayerNames) {
        const layer = glyph.layers[editLayerName];
        if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) continue;
        layerInfo.push({
          editLayerName,
          layer,
          originalSkeletonData: JSON.parse(
            JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY])
          ),
        });
      }

      let lastDist = null;
      let lastProcessedTime = 0;
      const THROTTLE_MS = 32;

      for await (const dist of valueStream) {
        lastDist = dist;
        const now = Date.now();
        const isExtreme = dist >= 100 || dist <= -100;
        if (!isExtreme && now - lastProcessedTime < THROTTLE_MS) {
          continue;
        }
        lastProcessedTime = now;
        const combined = this._buildPointDistributionChanges(
          glyph,
          selectedData,
          dist,
          isMulti,
          null,
          false
        );
        if (combined) {
          await sendIncrementalChange(combined.change, true);
        }
      }

      if (lastDist === null) return;

      const finalCombined = this._buildPointDistributionChanges(
        glyph,
        selectedData,
        lastDist,
        isMulti,
        layerInfo,
        true
      );
      if (!finalCombined) return;

      return {
        changes: finalCombined,
        undoLabel: "Set point distribution",
        broadcast: true,
      };
    });
  }

  _buildPointDistributionChanges(
    glyph,
    selectedData,
    distribution,
    isMulti,
    layerInfo,
    resetBaseline
  ) {
    const allChanges = [];
    const layers = layerInfo || this.sceneController.editingLayerNames.map((editLayerName) => {
      const layer = glyph.layers[editLayerName];
      if (!layer?.customData?.[SKELETON_CUSTOM_DATA_KEY]) return null;
      return {
        editLayerName,
        layer,
        originalSkeletonData: null,
      };
    }).filter(Boolean);

    for (const info of layers) {
      const { editLayerName, layer } = info;
      const baseSkeletonData = info.originalSkeletonData
        ? JSON.parse(JSON.stringify(info.originalSkeletonData))
        : JSON.parse(JSON.stringify(layer.customData[SKELETON_CUSTOM_DATA_KEY]));

      if (resetBaseline && info.originalSkeletonData) {
        layer.customData[SKELETON_CUSTOM_DATA_KEY] = JSON.parse(
          JSON.stringify(info.originalSkeletonData)
        );
        this._regenerateOutlineContours(layer.glyph, layer.customData[SKELETON_CUSTOM_DATA_KEY]);
      }

      const skeletonData = JSON.parse(JSON.stringify(baseSkeletonData));

      for (const { contourIdx, pointIdx } of selectedData.points) {
        const contour = skeletonData.contours[contourIdx];
        if (!contour) continue;
        const point = contour.points[pointIdx];
        if (!point) continue;

        const key = `${contourIdx}/${pointIdx}`;
        const defaultWidth = contour.defaultWidth || this._getSourceWidth(this._getDefaultWidthForGlyph().key, this._getDefaultWidthForGlyph().fallback);

        if (isMulti) {
          const state = this._multiSelectionState.pointStates.get(key);
          if (!state) continue;

          const { initialLeft, initialRight } = state;
          const { maxLeft, maxRight } = this._multiSelectionState;

          let newLeft, newRight;

          if (distribution >= 0) {
            const delta = (distribution / 100) * maxLeft;
            newLeft = Math.max(0, initialLeft - delta);
            newRight = initialRight + Math.min(delta, initialLeft);
          } else {
            const delta = (Math.abs(distribution) / 100) * maxRight;
            newRight = Math.max(0, initialRight - delta);
            newLeft = initialLeft + Math.min(delta, initialRight);
          }

          point.leftWidth = Math.round(newLeft);
          point.rightWidth = Math.round(newRight);
          delete point.width;
        } else {
          const leftHW = point.leftWidth ?? (point.width ?? defaultWidth) / 2;
          const rightHW = point.rightWidth ?? (point.width ?? defaultWidth) / 2;
          const totalWidth = leftHW + rightHW;

          const newLeftHW = totalWidth * (0.5 + distribution / 200);
          const newRightHW = totalWidth - newLeftHW;

          point.leftWidth = Math.max(0, Math.round(newLeftHW));
          point.rightWidth = Math.max(0, Math.round(newRightHW));
          delete point.width;
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

    if (allChanges.length === 0) return null;
    return new ChangeCollector().concat(...allChanges);
  }
}

customElements.define("panel-skeleton-parameters", SkeletonParametersPanel);
