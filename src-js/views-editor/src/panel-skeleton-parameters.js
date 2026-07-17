import { recordChanges } from "@fontra/core/change-recorder.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import {
  getSkeletonData,
  setSkeletonCapParameters,
  setSkeletonCornerParameters,
} from "@fontra/core/skeleton-model.js";
import {
  SKELETON_SOURCE_DEFAULT_FALLBACKS,
  SKELETON_SOURCE_DEFAULT_KEYS,
  getSkeletonGlyphCase,
  getSourceSkeletonDefaultsValue,
  setSourceSkeletonDefaultsValues,
} from "@fontra/core/skeleton-source-defaults.js";
import { throttleCalls } from "@fontra/core/utils.ts";
import { Form } from "@fontra/web-components/ui-form.js";
import Panel from "./panel.js";
import {
  resetPanelRibs,
  scalePanelPointWidth,
  setPanelCapParameters,
  setPanelCapStyle,
  setPanelContourDefaultWidth,
  setPanelContourSingleSided,
  setPanelCornerParameters,
  setPanelPointDistribution,
  setPanelPointDistributionStream,
  setPanelPointLinked,
  setPanelPointSideWidth,
  setPanelPointTotalWidth,
  setPanelPointValuesStream,
  setPanelRibDetached,
  setPanelRibEditable,
} from "./skeleton-panel-edits.js";
import {
  collectSkeletonPanelSelection,
  collectWidthEditPoints,
  makeSkeletonPanelStateSignature,
  summarizeSkeletonCapSelection,
  summarizeSkeletonCapStyleSelection,
  summarizeSkeletonContourSelection,
  summarizeSkeletonCornerSelection,
  summarizeSkeletonPointWidths,
  summarizeSkeletonRibSelection,
} from "./skeleton-panel-model.js";

// Cap parameter UI constants (donor parity: panel-skeleton-parameters.js).
// The round-cap radius slider works in 20 discrete positions mapped
// logarithmically onto the [CAP_RADIUS_MIN, CAP_RADIUS_MAX] ratio range.
const DEFAULT_CAP_RADIUS_RATIO = 1 / 8;
const DEFAULT_CAP_TENSION = 0.55;
const DEFAULT_CAP_ANGLE = 0;
const CAP_RADIUS_MIN = 1 / 128;
const CAP_RADIUS_MAX = 1 / 4;
const CAP_RADIUS_POSITIONS = 20;
const CAP_ANGLE_MIN = -85;
const CAP_ANGLE_MAX = 85;

function capRadiusRatioFromIndex(index) {
  const clampedIndex = Math.min(Math.max(index, 0), CAP_RADIUS_POSITIONS - 1);
  const t = clampedIndex / (CAP_RADIUS_POSITIONS - 1);
  const minLog = Math.log2(CAP_RADIUS_MIN);
  const maxLog = Math.log2(CAP_RADIUS_MAX);
  return 2 ** (minLog + t * (maxLog - minLog));
}

function capRadiusIndexFromRatio(ratio) {
  const clampedRatio = Math.min(Math.max(ratio, CAP_RADIUS_MIN), CAP_RADIUS_MAX);
  const minLog = Math.log2(CAP_RADIUS_MIN);
  const maxLog = Math.log2(CAP_RADIUS_MAX);
  const t = (Math.log2(clampedRatio) - minLog) / (maxLog - minLog);
  return Math.round(t * (CAP_RADIUS_POSITIONS - 1));
}

// Slider-unit -> model-unit conversion, shared by the streaming and the
// final-value paths. The radius slider edits a 1-based log-scale position,
// tension/roundness/reach/strength edit percent.
function capValuesFromField(name, value) {
  if (name === "radius") {
    return { capRadiusRatio: capRadiusRatioFromIndex(Number(value) - 1) };
  }
  if (name === "tension") {
    return { capTension: Number(value) / 100 };
  }
  if (name === "angle") {
    return { capAngle: Number(value) };
  }
  if (name === "distance") {
    return { capDistance: Number(value) };
  }
  return null;
}

function cornerValuesFromField(name, value) {
  if (name === "roundness") {
    return { cornerRoundness: Number(value) / 100 };
  }
  if (name === "asymmetry") {
    return { cornerAsymmetry: Number(value) };
  }
  if (name === "reach") {
    return { cornerReach: Number(value) / 100 };
  }
  if (name === "strength") {
    return { roundnessStrength: Number(value) / 100 };
  }
  return null;
}

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
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;
    this.sceneSettingsController = this.editorController.sceneSettingsController;

    this._widthSnapshot = null;
    this._widthSnapshotKey = null;
    this._lastSignature = null;

    this.updateBound = this.update.bind(this);
    // External glyph edits (e.g. dblclick smooth toggle) must refresh the
    // panel's gates immediately; our own field edits already rebuild in
    // _onFieldChange and must NOT trigger a rebuild mid-drag.
    this._suppressGlyphChangeUpdate = false;
    this._throttledGlyphChangeUpdate = throttleCalls(() => {
      this._forceRebuild = true;
      this.update();
    }, 100);
    this.sceneController.addCurrentGlyphChangeListener(() => {
      if (!this._suppressGlyphChangeUpdate) {
        this._throttledGlyphChangeUpdate();
      }
    });
    this.sceneSettingsController.addKeyListener(
      [
        "fontLocationSourceMapped",
        "selectedGlyphName",
        "selection",
        "editingLayers",
        "editLayerName",
      ],
      this.updateBound
    );
  }

  getContentElement() {
    return html.div({ class: "panel" }, []);
  }

  async toggle(on) {
    if (on) {
      await this.update();
    }
  }

  // ---- Reading current skeleton state --------------------------------------

  _getPositionedGlyph() {
    return this.sceneController.sceneModel?.getSelectedPositionedGlyph?.() || null;
  }

  // Mirror scene-model._getEditLayerSkeletonData: the panel edits and displays
  // the edit layer, whose ids are canonical for cross-layer resolution (WS-9).
  _getEditLayerSkeletonData(positionedGlyph) {
    if (!positionedGlyph) {
      return null;
    }
    const editLayerName =
      this.sceneSettingsController.model?.editLayerName ||
      positionedGlyph.glyph?.layerName;
    const layerGlyph =
      editLayerName && positionedGlyph.varGlyph?.glyph?.layers?.[editLayerName]?.glyph;
    return getSkeletonData(layerGlyph || positionedGlyph.glyph);
  }

  getSelectedGlyphName() {
    return this.sceneController.sceneSettings?.selectedGlyphName;
  }

  // ---- Source defaults access ----------------------------------------------

  _getEffectiveSource() {
    const location =
      this.sceneController.sceneSettings.fontLocationSourceMapped ||
      this.sceneController.sceneSettings.fontLocationSource ||
      {};
    const sourceId =
      this.fontController.fontSourcesInstancer?.getSourceIdentifierForLocation(
        location
      ) || this.fontController.defaultSourceIdentifier;
    return {
      sourceId,
      source: sourceId ? this.fontController.sources?.[sourceId] : null,
    };
  }

  _sourceDefault(key) {
    const { source } = this._getEffectiveSource();
    const fallback = SKELETON_SOURCE_DEFAULT_FALLBACKS[key];
    return source ? getSourceSkeletonDefaultsValue(source, key, fallback) : fallback;
  }

  async _persistSourceDefaults(values, undoLabel) {
    if (this.fontController.readOnly) {
      return;
    }
    const { sourceId } = this._getEffectiveSource();
    if (!sourceId || !this.fontController.sources?.[sourceId]) {
      return;
    }
    const root = { sources: this.fontController.sources };
    const changes = recordChanges(root, (root) => {
      const source = root.sources[sourceId];
      if (source) {
        setSourceSkeletonDefaultsValues(source, values);
      }
    });
    if (changes.hasChange) {
      await this.fontController.postChange(
        changes.change,
        changes.rollbackChange,
        undoLabel || "edit skeleton defaults",
        this
      );
      await this._refreshDesignspacePanel();
    }
  }

  async _refreshDesignspacePanel() {
    const panel = this.editorController.getSidebarPanel?.("designspace-navigation");
    if (panel?.refreshSourcesAndStatus) {
      await panel.refreshSourcesAndStatus();
    }
  }

  // ---- Panel rebuild --------------------------------------------------------

  async update() {
    if (!this.infoForm.contentElement.offsetParent) {
      return;
    }
    await this.fontController.ensureInitialized;

    const positionedGlyph = this._getPositionedGlyph();
    const skeletonData = this._getEditLayerSkeletonData(positionedGlyph);
    const glyphName = this.getSelectedGlyphName();
    const panelSelection = collectSkeletonPanelSelection({
      selection: this.sceneController.selection,
      skeletonData,
    });
    this._panelSelection = panelSelection;

    const signature = makeSkeletonPanelStateSignature({
      glyphName,
      editingLayerNames: this.sceneController.editingLayerNames,
      selection: this.sceneController.selection,
      sourceDefaultsSignature: this._sourceDefaultsSignature(glyphName),
      panelSelection: skeletonData ? panelSelection : null,
    });
    if (signature === this._lastSignature && !this._forceRebuild) {
      return;
    }
    this._lastSignature = signature;
    this._forceRebuild = false;

    const formContents = [
      { type: "header", label: translate("sidebar.skeleton-parameters.title") },
    ];

    if (!skeletonData) {
      formContents.push({
        type: "text",
        value: translate("sidebar.skeleton-parameters.no-skeleton"),
      });
      this.infoForm.setFieldDescriptions(formContents);
      this.infoForm.onFieldChange = () => {};
      return;
    }

    this._buildSourceDefaultsSection(formContents, glyphName);

    const widthPoints = collectWidthEditPoints(panelSelection);
    if (widthPoints.length) {
      this._buildPointWidthSection(formContents, widthPoints);
    }
    if (panelSelection.contours.length) {
      this._buildContourSection(formContents, panelSelection.contours);
    }
    if (widthPoints.length) {
      this._buildCapSection(formContents, widthPoints);
      this._buildCornerSection(formContents, widthPoints);
    }
    if (panelSelection.ribs.length) {
      this._buildRibSection(formContents, panelSelection.ribs);
    }

    if (
      !widthPoints.length &&
      !panelSelection.contours.length &&
      !panelSelection.ribs.length
    ) {
      formContents.push({
        type: "text",
        value: translate("sidebar.skeleton-parameters.no-selection"),
      });
    }

    formContents.push({ type: "spacer" });

    this.infoForm.setFieldDescriptions(formContents);
    this.infoForm.onFieldChange = (fieldItem, value, valueStream) =>
      this._onFieldChange(fieldItem, value, valueStream);
  }

  _sourceDefaultsSignature(glyphName) {
    const keys = [
      SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_CAPITAL_BASE,
      SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_LOWERCASE_BASE,
      SKELETON_SOURCE_DEFAULT_KEYS.CAP_RADIUS_RATIO,
      SKELETON_SOURCE_DEFAULT_KEYS.CAP_TENSION,
      SKELETON_SOURCE_DEFAULT_KEYS.CAP_ANGLE,
      SKELETON_SOURCE_DEFAULT_KEYS.CAP_DISTANCE,
    ];
    return `${getSkeletonGlyphCase(glyphName)}:${keys
      .map((key) => this._sourceDefault(key))
      .join(",")}`;
  }

  // ---- Section builders -----------------------------------------------------

  _buildSourceDefaultsSection(formContents, glyphName) {
    const glyphCase = getSkeletonGlyphCase(glyphName);
    const isLower = glyphCase === "lowercase";
    const K = SKELETON_SOURCE_DEFAULT_KEYS;
    const baseKey = isLower ? K.WIDTH_LOWERCASE_BASE : K.WIDTH_CAPITAL_BASE;
    const horizKey = isLower
      ? K.WIDTH_LOWERCASE_HORIZONTAL
      : K.WIDTH_CAPITAL_HORIZONTAL;
    const contrastKey = isLower ? K.WIDTH_LOWERCASE_CONTRAST : K.WIDTH_CAPITAL_CONTRAST;
    const distKey = isLower
      ? K.WIDTH_LOWERCASE_DISTRIBUTION
      : K.WIDTH_CAPITAL_DISTRIBUTION;

    formContents.push({ type: "divider" });
    formContents.push({
      type: "header",
      label: translate("sidebar.skeleton-parameters.source-defaults"),
    });
    formContents.push({
      type: "text",
      value: translate(
        isLower
          ? "sidebar.skeleton-parameters.case.lowercase"
          : "sidebar.skeleton-parameters.case.uppercase"
      ),
    });
    this._pushNumber(formContents, `default:${baseKey}`, "default-base", () =>
      this._sourceDefault(baseKey)
    );
    this._pushNumber(formContents, `default:${horizKey}`, "default-horizontal", () =>
      this._sourceDefault(horizKey)
    );
    this._pushNumber(formContents, `default:${contrastKey}`, "default-contrast", () =>
      this._sourceDefault(contrastKey)
    );
    this._pushSlider(
      formContents,
      `default:${distKey}`,
      "default-distribution",
      () => this._sourceDefault(distKey),
      -100,
      100,
      0,
      { step: 10 }
    );
    formContents.push({ type: "divider" });
    formContents.push({
      type: "header",
      label: translate("sidebar.skeleton-parameters.default-caps"),
    });
    this._pushNumber(formContents, `default:${K.CAP_RADIUS_RATIO}`, "cap-radius", () =>
      this._sourceDefault(K.CAP_RADIUS_RATIO)
    );
    this._pushNumber(formContents, `default:${K.CAP_TENSION}`, "cap-tension", () =>
      this._sourceDefault(K.CAP_TENSION)
    );
    this._pushNumber(formContents, `default:${K.CAP_ANGLE}`, "cap-angle", () =>
      this._sourceDefault(K.CAP_ANGLE)
    );
    this._pushNumber(formContents, `default:${K.CAP_DISTANCE}`, "cap-distance", () =>
      this._sourceDefault(K.CAP_DISTANCE)
    );
  }

  _buildPointWidthSection(formContents, widthPoints) {
    const summary = summarizeSkeletonPointWidths(widthPoints);
    formContents.push({ type: "divider" });
    formContents.push({
      type: "header",
      label: translate("sidebar.skeleton-parameters.point-widths"),
    });
    formContents.push({
      type: "checkbox",
      key: "width:linked",
      label: translate("sidebar.skeleton-parameters.linked"),
      value: summary.linked.mixed ? false : summary.linked.value,
    });
    this._pushSummaryNumber(formContents, "width:total", "total-width", summary.total);
    this._pushSummaryNumber(formContents, "width:left", "left-width", summary.left);
    this._pushSummaryNumber(formContents, "width:right", "right-width", summary.right);
    this._pushSummarySlider(
      formContents,
      "width:distribution",
      "distribution",
      summary.distribution,
      -100,
      100,
      0,
      { step: 10 }
    );
    // Donor: scale 0.2–2.0 in 0.2 steps, shown here in percent; the number
    // input accepts values beyond the slider range.
    formContents.push({
      type: "edit-number-slider",
      key: "width:scale",
      label: translate("sidebar.skeleton-parameters.scale"),
      value: 100,
      minValue: 20,
      defaultValue: 100,
      maxValue: 200,
      step: 20,
      allowInputBeyondRange: true,
    });
  }

  _buildContourSection(formContents, contours) {
    const summary = summarizeSkeletonContourSelection(contours);
    formContents.push({ type: "divider" });
    formContents.push({
      type: "header",
      label: translate("sidebar.skeleton-parameters.contour"),
    });
    const singleSided = summary.singleSided.value;
    formContents.push({
      type: "checkbox",
      key: "contour:single-sided",
      label: translate("sidebar.skeleton-parameters.single-sided"),
      value: summary.singleSided.mixed ? false : singleSided != null,
    });
    if (singleSided != null) {
      formContents.push({
        type: "checkbox",
        key: "contour:single-sided-right",
        label: translate("sidebar.skeleton-parameters.single-sided-right"),
        value: singleSided === "right",
      });
    }
    this._pushSummaryNumber(
      formContents,
      "contour:default-width",
      "contour-default-width",
      summary.defaultWidth
    );
  }

  _buildCapSection(formContents, widthPoints) {
    const cap = summarizeSkeletonCapSelection(widthPoints);
    const capStyle = summarizeSkeletonCapStyleSelection(widthPoints);
    formContents.push({ type: "divider" });
    formContents.push({
      type: "header",
      label: translate("sidebar.skeleton-parameters.caps"),
    });
    formContents.push({
      type: "select",
      key: "cap:style",
      label: translate("sidebar.skeleton-parameters.cap-style"),
      value: capStyle.mixed ? "" : (capStyle.value ?? "butt"),
      disabled: !capStyle.canEdit,
      options: [
        ...(capStyle.mixed ? [{ value: "", label: "mixed", disabled: true }] : []),
        {
          value: "butt",
          label: translate("sidebar.skeleton-parameters.cap-style.flat"),
        },
        {
          value: "square",
          label: translate("sidebar.skeleton-parameters.cap-style.square"),
        },
        {
          value: "round",
          label: translate("sidebar.skeleton-parameters.cap-style.round"),
        },
      ],
    });
    // Donor parity: cap parameters appear as sliders, only for the styles
    // they apply to. Radius maps 20 discrete slider positions logarithmically
    // onto the [1/128, 1/4] ratio range; tension is edited in percent. Both
    // are converted back in _onCapChange.
    const styleValue = capStyle.mixed ? null : (capStyle.value ?? "butt");
    if (styleValue === "round") {
      const radiusSummary = {
        value:
          capRadiusIndexFromRatio(
            cap.capRadiusRatio.value ?? DEFAULT_CAP_RADIUS_RATIO
          ) + 1,
        mixed: cap.capRadiusRatio.mixed,
      };
      this._pushSummarySlider(
        formContents,
        "cap:radius",
        "cap-radius",
        radiusSummary,
        1,
        CAP_RADIUS_POSITIONS,
        capRadiusIndexFromRatio(DEFAULT_CAP_RADIUS_RATIO) + 1,
        { step: 1 }
      );
      const tensionSummary = {
        value: Math.round((cap.capTension.value ?? DEFAULT_CAP_TENSION) * 100),
        mixed: cap.capTension.mixed,
      };
      this._pushSummarySlider(
        formContents,
        "cap:tension",
        "cap-tension",
        tensionSummary,
        0,
        100,
        Math.round(DEFAULT_CAP_TENSION * 100),
        { step: 5 }
      );
    } else if (styleValue === "square") {
      const angleSummary = {
        value: Math.round(cap.capAngle.value ?? DEFAULT_CAP_ANGLE),
        mixed: cap.capAngle.mixed,
      };
      this._pushSummarySlider(
        formContents,
        "cap:angle",
        "cap-angle",
        angleSummary,
        CAP_ANGLE_MIN,
        CAP_ANGLE_MAX,
        DEFAULT_CAP_ANGLE,
        { step: 1 }
      );
      this._pushSummaryNumber(
        formContents,
        "cap:distance",
        "cap-distance",
        cap.capDistance
      );
    }
  }

  // Donor "Corner Rounding" section: parameters of the angle-point rounding
  // engine, NOT cap parameters. All four live on the point; edited in percent
  // (except asymmetry) and gated to angle points (non-smooth, non-endpoint).
  _buildCornerSection(formContents, widthPoints) {
    const corner = summarizeSkeletonCornerSelection(widthPoints);
    formContents.push({ type: "divider" });
    formContents.push({
      type: "header",
      label: translate("sidebar.skeleton-parameters.corner-rounding"),
    });
    const gate = { disabled: !corner.canEdit };
    const asPercent = (summary) => ({
      value: summary.value == null ? null : Math.round(summary.value * 100),
      mixed: summary.mixed,
    });
    this._pushSummarySlider(
      formContents,
      "corner:roundness",
      "corner-roundness",
      asPercent(corner.cornerRoundness),
      0,
      100,
      0,
      { step: 1, ...gate }
    );
    this._pushSummarySlider(
      formContents,
      "corner:asymmetry",
      "corner-asymmetry",
      corner.cornerAsymmetry,
      -1,
      1,
      0,
      { step: 0.1, ...gate }
    );
    this._pushSummarySlider(
      formContents,
      "corner:reach",
      "corner-reach",
      asPercent(corner.cornerReach),
      5,
      99,
      50,
      { step: 1, ...gate }
    );
    this._pushSummarySlider(
      formContents,
      "corner:strength",
      "corner-strength",
      asPercent(corner.roundnessStrength),
      10,
      400,
      100,
      { step: 1, ...gate }
    );
  }

  _buildRibSection(formContents, ribs) {
    const summary = summarizeSkeletonRibSelection(ribs);
    formContents.push({ type: "divider" });
    formContents.push({
      type: "header",
      label: translate("sidebar.skeleton-parameters.ribs"),
    });
    formContents.push({
      type: "checkbox",
      key: "rib:editable",
      label: translate("sidebar.skeleton-parameters.editable"),
      value: summary.editable.mixed ? false : summary.editable.value,
    });
    if (summary.editable.value === true || summary.editable.mixed) {
      formContents.push({
        type: "checkbox",
        key: "rib:detached",
        label: translate("sidebar.skeleton-parameters.detached"),
        value: summary.detached.mixed ? false : summary.detached.value,
      });
    }
    formContents.push({
      type: "single-icon",
      element: html.div({ style: "display:flex; gap:0.5rem; flex-wrap:wrap;" }, [
        html.button({ onclick: () => this._resetRibs({ handlesOnly: false }) }, [
          translate("sidebar.skeleton-parameters.reset-rib"),
        ]),
        html.button({ onclick: () => this._resetRibs({ handlesOnly: true }) }, [
          translate("sidebar.skeleton-parameters.reset-handles"),
        ]),
      ]),
    });
  }

  // ---- Field description helpers -------------------------------------------

  _pushNumber(formContents, key, labelKey, getValue) {
    formContents.push({
      type: "edit-number",
      key,
      label: translate(`sidebar.skeleton-parameters.${labelKey}`),
      value: getValue(),
    });
  }

  _pushSlider(
    formContents,
    key,
    labelKey,
    getValue,
    minValue,
    maxValue,
    defaultValue,
    options = {}
  ) {
    formContents.push({
      type: "edit-number-slider",
      key,
      label: translate(`sidebar.skeleton-parameters.${labelKey}`),
      value: getValue(),
      minValue,
      // The RangeSlider web component requires a numeric defaultValue
      defaultValue: defaultValue ?? minValue,
      maxValue,
      ...options,
    });
  }

  _pushSummaryNumber(formContents, key, labelKey, summary) {
    formContents.push({
      type: "edit-number",
      key,
      label: translate(`sidebar.skeleton-parameters.${labelKey}`),
      value: summary.mixed ? null : summary.value,
      placeholder: summary.placeholder || undefined,
    });
  }

  _pushSummarySlider(
    formContents,
    key,
    labelKey,
    summary,
    minValue,
    maxValue,
    defaultValue,
    options = {}
  ) {
    // A mixed or absent value must NOT pin the thumb to minValue: that makes
    // the slider draggable in only one direction. Park it at the default and
    // show "mixed" as a placeholder instead (donor parity).
    const noValue = summary.mixed || summary.value == null;
    formContents.push({
      type: "edit-number-slider",
      key,
      label: translate(`sidebar.skeleton-parameters.${labelKey}`),
      value: noValue ? (defaultValue ?? minValue) : summary.value,
      displayValue: summary.mixed ? "mixed" : undefined,
      minValue,
      // The RangeSlider web component requires a numeric defaultValue
      defaultValue: defaultValue ?? minValue,
      maxValue,
      ...options,
    });
  }

  // ---- Field change dispatch ------------------------------------------------

  async _onFieldChange(fieldItem, value, valueStream) {
    const [group, name] = String(fieldItem.key).split(":");
    this._suppressGlyphChangeUpdate = true;
    try {
      // Distribution, cap and corner sliders stream onto the canvas while
      // dragging; all other fields apply the committed value once.
      if (group === "width" && name === "distribution" && valueStream) {
        await setPanelPointDistributionStream(
          this.sceneController,
          this._widthPoints(),
          valueStream,
          this._undo("set-distribution")
        );
        return;
      }
      if (valueStream && (group === "cap" || group === "corner")) {
        const makeValues = group === "cap" ? capValuesFromField : cornerValuesFromField;
        const setter =
          group === "cap" ? setSkeletonCapParameters : setSkeletonCornerParameters;
        if (makeValues(name, value)) {
          await setPanelPointValuesStream(
            this.sceneController,
            this._widthPoints(),
            valueStream,
            (point, contour, streamedValue) =>
              setter(point, makeValues(name, streamedValue)),
            this._undo(group === "cap" ? "set-cap" : "set-corner")
          );
          return;
        }
      }
      const finalValue = await this._resolveStreamValue(value, valueStream);
      if (group === "default") {
        await this._onSourceDefaultChange(name, finalValue);
      } else if (group === "width") {
        await this._onWidthChange(name, finalValue);
      } else if (group === "contour") {
        await this._onContourChange(name, finalValue);
      } else if (group === "cap") {
        await this._onCapChange(name, finalValue);
      } else if (group === "corner") {
        await this._onCornerChange(name, finalValue);
      } else if (group === "rib") {
        await this._onRibChange(name, finalValue);
      }
    } finally {
      this._suppressGlyphChangeUpdate = false;
      this._forceRebuild = true;
      await this.update();
    }
  }

  // Consume a slider value stream and return the final value: applying only the
  // committed value yields exactly one undo record per drag.
  async _resolveStreamValue(value, valueStream) {
    if (!valueStream) {
      return value;
    }
    let last = value;
    for await (const v of valueStream) {
      last = v;
    }
    return last;
  }

  _widthPoints() {
    return collectWidthEditPoints(this._panelSelection);
  }

  async _onSourceDefaultChange(defaultKey, value) {
    await this._persistSourceDefaults(
      { [defaultKey]: value },
      translate("sidebar.skeleton-parameters.undo.set-defaults")
    );
  }

  async _onWidthChange(name, value) {
    const points = this._widthPoints();
    const sc = this.sceneController;
    if (name === "linked") {
      await setPanelPointLinked(sc, points, value === true, this._undo("set-linked"));
    } else if (name === "total") {
      await setPanelPointTotalWidth(sc, points, value, this._undo("set-total-width"));
    } else if (name === "left") {
      await setPanelPointSideWidth(sc, points, "left", value, this._undo("set-width"));
    } else if (name === "right") {
      await setPanelPointSideWidth(sc, points, "right", value, this._undo("set-width"));
    } else if (name === "distribution") {
      await setPanelPointDistribution(
        sc,
        points,
        value,
        this._undo("set-distribution")
      );
    } else if (name === "scale") {
      await scalePanelPointWidth(
        sc,
        points,
        (Number(value) || 100) / 100,
        this._undo("scale-width")
      );
    }
  }

  async _onContourChange(name, value) {
    const contours = this._panelSelection.contours;
    const sc = this.sceneController;
    if (name === "single-sided") {
      await setPanelContourSingleSided(
        sc,
        contours,
        value === true ? "left" : null,
        this._undo("set-single-sided")
      );
    } else if (name === "single-sided-right") {
      await setPanelContourSingleSided(
        sc,
        contours,
        value === true ? "right" : "left",
        this._undo("set-single-sided")
      );
    } else if (name === "default-width") {
      await setPanelContourDefaultWidth(
        sc,
        contours,
        value,
        this._undo("set-contour-width")
      );
    }
  }

  async _onCapChange(name, value) {
    if (name === "style") {
      if (!["butt", "square", "round"].includes(value)) {
        return;
      }
      await setPanelCapStyle(
        this.sceneController,
        this._widthPoints(),
        value,
        this._undo("set-cap")
      );
      return;
    }
    const values = capValuesFromField(name, value);
    if (!values) {
      return;
    }
    await setPanelCapParameters(
      this.sceneController,
      this._widthPoints(),
      values,
      this._undo("set-cap")
    );
  }

  async _onCornerChange(name, value) {
    const values = cornerValuesFromField(name, value);
    if (!values) {
      return;
    }
    await setPanelCornerParameters(
      this.sceneController,
      this._widthPoints(),
      values,
      this._undo("set-corner")
    );
  }

  async _onRibChange(name, value) {
    if (name === "editable") {
      await setPanelRibEditable(
        this.sceneController,
        this._panelSelection.ribs,
        value === true,
        this._undo("set-rib-editable")
      );
    } else if (name === "detached") {
      await setPanelRibDetached(
        this.sceneController,
        this._panelSelection.ribs,
        value === true,
        this._undo("set-rib-detached")
      );
    }
  }

  async _resetRibs({ handlesOnly }) {
    await resetPanelRibs(
      this.sceneController,
      this._panelSelection.ribs,
      { handlesOnly },
      this._undo(handlesOnly ? "reset-handles" : "reset-ribs")
    );
    this._forceRebuild = true;
    await this.update();
  }

  _undo(key) {
    return translate(`sidebar.skeleton-parameters.undo.${key}`);
  }
}

customElements.define("panel-skeleton-parameters", SkeletonParametersPanel);
