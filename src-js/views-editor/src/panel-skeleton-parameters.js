import { recordChanges } from "@fontra/core/change-recorder.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { getSkeletonData } from "@fontra/core/skeleton-model.js";
import {
  SKELETON_SOURCE_DEFAULT_FALLBACKS,
  SKELETON_SOURCE_DEFAULT_KEYS,
  getSkeletonGlyphCase,
  getSourceSkeletonDefaultsValue,
  setSourceSkeletonDefaultsValues,
} from "@fontra/core/skeleton-source-defaults.js";
import { Form } from "@fontra/web-components/ui-form.js";
import Panel from "./panel.js";
import {
  resetPanelRibs,
  scalePanelPointWidth,
  setPanelCapParameters,
  setPanelCapStyle,
  setPanelContourCornerDebug,
  setPanelContourDefaultWidth,
  setPanelContourSingleSided,
  setPanelCornerParameters,
  setPanelPointDistribution,
  setPanelPointDistributionStream,
  setPanelPointLinked,
  setPanelPointSideWidth,
  setPanelPointTotalWidth,
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
      this._buildCapCornerSection(formContents, widthPoints, panelSelection.contours);
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
      0
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
      0
    );
    formContents.push({
      type: "edit-number-slider",
      key: "width:scale",
      label: translate("sidebar.skeleton-parameters.scale"),
      value: 100,
      minValue: 10,
      defaultValue: 100,
      maxValue: 300,
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

  _buildCapCornerSection(formContents, widthPoints, contours) {
    const cap = summarizeSkeletonCapSelection(widthPoints);
    const capStyle = summarizeSkeletonCapStyleSelection(widthPoints);
    const corner = summarizeSkeletonCornerSelection(widthPoints, contours);
    formContents.push({ type: "divider" });
    formContents.push({
      type: "header",
      label: translate("sidebar.skeleton-parameters.caps-corners"),
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
    this._pushSummaryNumber(
      formContents,
      "cap:radius",
      "cap-radius",
      cap.capRadiusRatio
    );
    this._pushSummaryNumber(formContents, "cap:tension", "cap-tension", cap.capTension);
    this._pushSummaryNumber(formContents, "cap:angle", "cap-angle", cap.capAngle);
    this._pushSummaryNumber(
      formContents,
      "cap:distance",
      "cap-distance",
      cap.capDistance
    );
    this._pushSummarySlider(
      formContents,
      "corner:roundness",
      "corner-roundness",
      corner.roundnessStrength,
      0,
      1,
      0
    );
    this._pushSummarySlider(
      formContents,
      "corner:asymmetry",
      "corner-asymmetry",
      corner.cornerAsymmetry,
      -1,
      1,
      0
    );
    this._pushSummarySlider(
      formContents,
      "corner:trim-ratio",
      "corner-trim-ratio",
      corner.cornerTrimRatio,
      0.05,
      0.99,
      0.5
    );
    this._pushSummarySlider(
      formContents,
      "corner:radius-boost",
      "corner-radius-boost",
      corner.cornerRadiusBoost,
      0.1,
      4,
      1
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

  _pushSlider(formContents, key, labelKey, getValue, minValue, maxValue, defaultValue) {
    formContents.push({
      type: "edit-number-slider",
      key,
      label: translate(`sidebar.skeleton-parameters.${labelKey}`),
      value: getValue(),
      minValue,
      // The RangeSlider web component requires a numeric defaultValue
      defaultValue: defaultValue ?? minValue,
      maxValue,
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
    defaultValue
  ) {
    formContents.push({
      type: "edit-number-slider",
      key,
      label: translate(`sidebar.skeleton-parameters.${labelKey}`),
      value: summary.mixed || summary.value == null ? minValue : summary.value,
      minValue,
      // The RangeSlider web component requires a numeric defaultValue
      defaultValue: defaultValue ?? minValue,
      maxValue,
    });
  }

  // ---- Field change dispatch ------------------------------------------------

  async _onFieldChange(fieldItem, value, valueStream) {
    const [group, name] = String(fieldItem.key).split(":");
    try {
      // The distribution slider streams onto the canvas while dragging (donor
      // parity); all other fields apply the committed value once.
      if (group === "width" && name === "distribution" && valueStream) {
        await setPanelPointDistributionStream(
          this.sceneController,
          this._widthPoints(),
          valueStream,
          this._undo("set-distribution")
        );
        return;
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
    const map = {
      radius: "capRadiusRatio",
      tension: "capTension",
      angle: "capAngle",
      distance: "capDistance",
    };
    const field = map[name];
    if (!field) {
      return;
    }
    await setPanelCapParameters(
      this.sceneController,
      this._widthPoints(),
      { [field]: value },
      this._undo("set-cap")
    );
  }

  async _onCornerChange(name, value) {
    const sc = this.sceneController;
    if (name === "roundness") {
      await setPanelCornerParameters(
        sc,
        this._widthPoints(),
        { roundnessStrength: value },
        this._undo("set-corner")
      );
    } else if (name === "asymmetry") {
      await setPanelCornerParameters(
        sc,
        this._widthPoints(),
        { cornerAsymmetry: value },
        this._undo("set-corner")
      );
    } else if (name === "trim-ratio") {
      await setPanelContourCornerDebug(
        sc,
        this._panelSelection.contours,
        { cornerTrimRatio: value },
        this._undo("set-corner")
      );
    } else if (name === "radius-boost") {
      await setPanelContourCornerDebug(
        sc,
        this._panelSelection.contours,
        { cornerRadiusBoost: value },
        this._undo("set-corner")
      );
    }
  }

  async _onRibChange(name, value) {
    if (name === "editable") {
      await setPanelRibEditable(
        this.sceneController,
        this._panelSelection.ribs,
        value === true,
        this._undo("set-rib-editable")
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
