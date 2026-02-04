import { PathHitTester } from "@fontra/core/path-hit-tester.js";
import { recordChanges } from "@fontra/core/change-recorder.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { Form } from "@fontra/web-components/ui-form.js";
import Panel from "./panel.js";

// ============================================================
// LETTERSPACER ENGINE (порт из HTLetterspacer)
// ============================================================

function polygonArea(points) {
  // Shoelace formula
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    s += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(s) * 0.5;
}

function setDepth(margins, extreme, maxDepth, isLeft) {
  // Limit depth of margins to maxDepth from extreme
  // For left: extreme + maxDepth (limit on the right/inward side), use min() to clip
  // For right: extreme - maxDepth (limit on the left/inward side), use max() to clip
  if (isLeft) {
    const limit = extreme + maxDepth;
    return margins.map(p => ({
      x: Math.min(p.x, limit),
      y: p.y
    }));
  } else {
    const limit = extreme - maxDepth;
    return margins.map(p => ({
      x: Math.max(p.x, limit),
      y: p.y
    }));
  }
}

function closePolygon(margins, extreme, minY, maxY) {
  // Замкнуть margins в полигон добавив вертикальную линию
  const polygon = [...margins];
  polygon.push({ x: extreme, y: maxY });
  polygon.push({ x: extreme, y: minY });
  return polygon;
}

function calculateSidebearing(polygon, targetArea, amplitudeY) {
  const currentArea = polygonArea(polygon);
  const shortfall = targetArea - currentArea;
  return shortfall / amplitudeY;
}

function computeTargetAreaFromSidebearing(polygonAreaValue, sidebearing, amplitudeY) {
  return polygonAreaValue + sidebearing * amplitudeY;
}

function computeParamAreaFromTargetArea(targetArea, fontMetrics, amplitudeY) {
  const upmScale = Math.pow(fontMetrics.upm / 1000, 2);
  if (amplitudeY === 0 || upmScale === 0) return 0;
  return (targetArea * fontMetrics.xHeight) / (amplitudeY * 100 * upmScale);
}

const LETTERSPACER_CUSTOM_DATA_KEYS = {
  area: "fontra.letterspacer.area",
  depth: "fontra.letterspacer.depth",
  overshoot: "fontra.letterspacer.overshoot",
  reference: "fontra.letterspacer.reference",
};

const LETTERSPACER_DEFAULTS = {
  area: 400,
  depth: 15,
  overshoot: 0,
  referenceGlyph: "",
};

function coerceNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

class LetterspacerEngine {
  constructor(params, fontMetrics) {
    this.params = params;
    this.upm = fontMetrics.upm;
    this.xHeight = fontMetrics.xHeight;
    this.angle = fontMetrics.italicAngle || 0;
    this.scanLines = [];
    this.leftPolygon = [];
    this.rightPolygon = [];
    this.leftSBPolygon = [];
    this.rightSBPolygon = [];
    this.leftSBLine = null;
    this.rightSBLine = null;
    this.lsb = null;
    this.rsb = null;
    this.leftMargins = [];
    this.rightMargins = [];
    this.leftMarginsProcessed = [];
    this.rightMarginsProcessed = [];
    this.leftExtreme = null;
    this.rightExtreme = null;
    this.leftExtremeDepthLimited = null;
    this.rightExtremeDepthLimited = null;
    this.leftDepthLimit = null;
    this.rightDepthLimit = null;
  }

  computeSpacing(path, bounds, refMinY, refMaxY) {
    const freq = 5;
    const amplitudeY = refMaxY - refMinY;

    this.scanLines = [];
    this.leftPolygon = [];
    this.rightPolygon = [];
    this.leftSBPolygon = [];
    this.rightSBPolygon = [];
    this.leftMarginsProcessed = [];
    this.rightMarginsProcessed = [];

    const areaUPM = this.params.area * Math.pow(this.upm / 1000, 2);
    const targetArea = (amplitudeY * areaUPM * 100) / this.xHeight;

    const maxDepth = this.xHeight * this.params.depth / 100;

    const margins = this.collectMargins(path, bounds, refMinY, refMaxY, freq);
    this.leftMargins = margins.leftMargins;
    this.rightMargins = margins.rightMargins;
    this.leftExtreme = margins.leftExtreme;
    this.rightExtreme = margins.rightExtreme;

    if (this.leftMargins.length < 2 || this.rightMargins.length < 2) {
      return { lsb: null, rsb: null };
    }

    // Apply depth limit to margins
    let processedLeft = setDepth(this.leftMargins, this.leftExtreme, maxDepth, true);
    let processedRight = setDepth(this.rightMargins, this.rightExtreme, maxDepth, false);

    // Store processed margins for visualization
    this.leftMarginsProcessed = [...processedLeft];
    this.rightMarginsProcessed = [...processedRight];

    // Calculate depth limits (how far inward from glyph edge)
    this.leftDepthLimit = this.leftExtreme + maxDepth;  // Inward from left extreme (rightward)
    this.rightDepthLimit = this.rightExtreme - maxDepth;  // Inward from right extreme (leftward)
    
    this.leftExtremeDepthLimited = Math.min(...processedLeft.map(p => p.x));
    this.rightExtremeDepthLimited = Math.max(...processedRight.map(p => p.x));

    // Close polygons at the ORIGINAL extremes (not the depth limits)
    // The depth limit only affects how far inward the margins can extend,
    // but the polygon area is bounded by the original glyph edge
    this.leftPolygon = closePolygon(processedLeft, this.leftExtreme, refMinY, refMaxY);
    this.rightPolygon = closePolygon(processedRight, this.rightExtreme, refMinY, refMaxY);

    this.lsb = calculateSidebearing(this.leftPolygon, targetArea, amplitudeY);
    this.rsb = calculateSidebearing(this.rightPolygon, targetArea, amplitudeY);

    // Calculate sidebearing line positions from depth-limited extremes
    this.leftSBLine = this.leftExtremeDepthLimited - this.lsb;
    this.rightSBLine = this.rightExtremeDepthLimited + this.rsb;

    // For visualization: show the actual polygon used by algorithm
    // The algorithm polygon goes from extreme -> clipped margins -> extreme
    // This is the actual shape used for area calculation
    this.leftSBPolygon = [...this.leftPolygon];
    this.rightSBPolygon = [...this.rightPolygon];

    return { lsb: this.lsb, rsb: this.rsb };
  }

  collectMargins(path, bounds, minY, maxY, freq) {
    const hitTester = new PathHitTester(path, bounds);
    const leftMargins = [];
    const rightMargins = [];
    let leftExtreme = Infinity;  // Will be set from actual margins
    let rightExtreme = -Infinity;  // Will be set from actual margins

    // Clear previous scan lines
    this.scanLines = [];

    for (let y = minY; y <= maxY; y += freq) {
      const lineStart = { x: bounds.xMin - 100, y };
      const lineEnd = { x: bounds.xMax + 100, y };

      const intersections = hitTester.lineIntersections(lineStart, lineEnd);

      // Store scan line for visualization
      this.scanLines.push({
        start: lineStart,
        end: lineEnd,
        intersections: [...intersections],
        y: y
      });

      if (intersections.length >= 2) {
        // Сортируем по x
        const sorted = intersections
          .map(i => i.x !== undefined ? i : { x: i.point?.x })
          .filter(i => i.x !== undefined)
          .sort((a, b) => a.x - b.x);

        if (sorted.length >= 2) {
          const left = sorted[0].x;
          const right = sorted[sorted.length - 1].x;

          leftMargins.push({ x: left, y });
          rightMargins.push({ x: right, y });

          leftExtreme = Math.min(leftExtreme, left);
          rightExtreme = Math.max(rightExtreme, right);
        }
      }
    }

    // Fallback to bounds if no intersections found
    if (leftExtreme === Infinity) leftExtreme = bounds.xMin;
    if (rightExtreme === -Infinity) rightExtreme = bounds.xMax;

    return { leftMargins, rightMargins, leftExtreme, rightExtreme };
  }
}

// ============================================================
// PANEL UI
// ============================================================

export default class LetterspacerPanel extends Panel {
  identifier = "letterspacer";
  iconPath = "/tabler-icons/spacing-horizontal.svg";

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
    this.handleSelectionChangeBound = this.handleSelectionChange.bind(this);

    // Listen for glyph edits to clear visualization
    this.sceneController.addCurrentGlyphChangeListener((event) => {
      this.clearVisualization();
      this.refreshPersistedParams();
    });

    this.refreshPersistedParamsBound = this.refreshPersistedParams.bind(this);
    this.sceneSettingsController.addKeyListener(
      [
        "fontLocationSourceMapped",
        "selectedGlyphName",
        "selection",
        "editingLayers",
        "editLayerName",
      ],
      this.refreshPersistedParamsBound
    );

    this.params = {
      area: 400,
      depth: 15,
      overshoot: 0,
      applyLSB: 1,
      applyRSB: 1,
      referenceGlyph: "",
    };

    // Track current and calculated spacing values
    this.currentLSB = 0;
    this.currentRSB = 0;
    this.calculatedLSB = null;
    this.calculatedRSB = null;
    this.visualizationOpacity = 1;
  }

  getContentElement() {
    return html.div({ class: "panel" }, []);
  }

  async update(senderInfo) {
    if (!this.infoForm.contentElement.offsetParent) return;
    await this.fontController.ensureInitialized;

    this._suppressPersist = true;
    try {
      await this.loadPersistedParams();
      this.hasCurrentMaster = await this.hasCurrentMasterForGlyph();

      const formContents = [
      { 
        type: "header", 
        label: translate("sidebar.letterspacer.title"),
        auxiliaryElement: html.createDomElement("button", {
          "style": "margin-left: 8px; padding: 2px 8px; font-size: 11px; cursor: pointer;",
          "onclick": () => this.reverseSpacing(),
          "disabled": !this.hasCurrentMaster,
          "data-tooltip": translate("sidebar.letterspacer.reverse.tooltip"),
          "data-tooltipposition": "left",
        }, ["Reverse"])
      },

      { type: "edit-number", key: "area",
        label: translate("sidebar.letterspacer.area"),
        value: this.params.area },

      { type: "edit-number", key: "depth",
        label: translate("sidebar.letterspacer.depth"),
        value: this.params.depth },

      { type: "edit-number", key: "overshoot",
        label: translate("sidebar.letterspacer.overshoot"),
        value: this.params.overshoot },

      { type: "divider" },

      { type: "edit-number", key: "applyLSB",
        label: translate("sidebar.letterspacer.apply-lsb"),
        value: this.params.applyLSB ? 1 : 0,
        minValue: 0,
        maxValue: 1,
        integer: true },

      { type: "edit-number", key: "applyRSB",
        label: translate("sidebar.letterspacer.apply-rsb"),
        value: this.params.applyRSB ? 1 : 0,
        minValue: 0,
        maxValue: 1,
        integer: true },

      { type: "divider" },

      { type: "edit-text", key: "referenceGlyph",
        label: translate("sidebar.letterspacer.reference"),
        value: this.params.referenceGlyph },

      { type: "divider" },

      // Display current and calculated spacing values
      { type: "header", 
        label: `Current: LSB=${this.formatValue(this.currentLSB)}, RSB=${this.formatValue(this.currentRSB)}`,
        class: "current-values" },
      
      { type: "header", 
        label: `Calculated: LSB=${this.formatValue(this.calculatedLSB)}, RSB=${this.formatValue(this.calculatedRSB)}`,
        class: "calculated-values" },

      { type: "spacer" },
    ];

      this.infoForm.setFieldDescriptions(formContents);
      this.infoForm.onFieldChange = async (fieldItem, value) => {
        if (this._suppressPersist) {
          this.params[fieldItem.key] = value;
          return;
        }
        this.params[fieldItem.key] = value;
        await this.persistParam(fieldItem.key, value);
      
        // Update calculated values dynamically
        await this.updateCalculatedValues();
      
        // Update visualization
        if (this.editorController.sceneController?.sceneModel) {
          this.editorController.sceneController.sceneModel.letterspacerVisualizationData = await this.getVisualizationData();
        }
        if (this.editorController.canvasController) {
          this.editorController.canvasController.requestUpdate();
        }
      
        // Update value display without rebuilding the form
        this.updateValueDisplay();
      };

      // Calculate and Apply buttons at the bottom
      const buttonContainer = html.div({ class: "button-container" }, []);
    
      const calculateButton = html.button({
        onclick: () => this.calculateSpacing(),
        class: "calculate-button",
        disabled: !this.hasCurrentMaster,
      }, ["Calculate"]);
    
      const applyButton = html.button({
        onclick: () => this.applySpacing(),
        class: "apply-button",
        disabled: !this.hasCurrentMaster,
      }, ["Apply"]);
    
      buttonContainer.appendChild(calculateButton);
      buttonContainer.appendChild(applyButton);
    
      this.infoForm.contentElement.appendChild(buttonContainer);
    } finally {
      this._suppressPersist = false;
    }

    // Initial calculation and visualization
    await this.updateCalculatedValues();
    this.updateValueDisplay();
    
    if (this.editorController.sceneController?.sceneModel) {
      this.editorController.sceneController.sceneModel.letterspacerVisualizationData = await this.getVisualizationData();
    }
    if (this.editorController.canvasController) {
      this.editorController.canvasController.requestUpdate();
    }
  }

  updateValueDisplay() {
    // Update the value display elements without rebuilding the form
    const currentLabel = this.infoForm.contentElement.querySelector(".current-values");
    const calculatedLabel = this.infoForm.contentElement.querySelector(".calculated-values");
    
    if (currentLabel) {
      currentLabel.textContent = `Current: LSB=${this.formatValue(this.currentLSB)}, RSB=${this.formatValue(this.currentRSB)}`;
    }
    if (calculatedLabel) {
      calculatedLabel.textContent = `Calculated: LSB=${this.formatValue(this.calculatedLSB)}, RSB=${this.formatValue(this.calculatedRSB)}`;
    }
  }

  async applySpacing() {
    if (!(await this.hasCurrentMasterForGlyph())) {
      return;
    }
    this.visualizationOpacity = 1;
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return;

    const fontMetrics = await this.getFontMetrics();
    const refBounds = await this.getReferenceBounds(fontMetrics);
    const engine = new LetterspacerEngine(this.params, fontMetrics);
    
    // Store calculated values from the edit operation
    let calculatedLSB = null;
    let calculatedRSB = null;

    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      const layerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(glyph.layers);

      for (const [layerName, layerGlyph] of Object.entries(layerGlyphs)) {
        const path = layerGlyph.path;
        const bounds = path.getBounds?.() || path.getControlBounds?.();
        if (!bounds) continue;

        // Calculate fresh values for this layer
        const { lsb, rsb } = engine.computeSpacing(
          path, bounds, refBounds.minY, refBounds.maxY
        );

        if (lsb === null || rsb === null) continue;
        
        // Store calculated values (rounded to avoid fractional sidebearings)
        const roundedLSB = Math.round(lsb);
        const roundedRSB = Math.round(rsb);
        calculatedLSB = roundedLSB;
        calculatedRSB = roundedRSB;

        const currentLSB = bounds.xMin;

        if (this.params.applyLSB) {
          const deltaLSB = roundedLSB - currentLSB;
          this.shiftPath(layerGlyph.path, deltaLSB);
        }

        if (this.params.applyRSB || this.params.applyLSB) {
          const newBounds = layerGlyph.path.getBounds?.() || layerGlyph.path.getControlBounds?.();
          if (this.params.applyRSB) {
            layerGlyph.xAdvance = Math.round(newBounds.xMax + roundedRSB);
          } else {
            layerGlyph.xAdvance = Math.round(newBounds.xMax + (layerGlyph.xAdvance - bounds.xMax));
          }
        }
      }

      return "letterspacer";
    }, undefined, true);

    // Update the stored calculated values
    this.calculatedLSB = calculatedLSB;
    this.calculatedRSB = calculatedRSB;
    
    // Update current values from the modified glyph
    const path = positionedGlyph.glyph.path;
    const bounds = path.getBounds?.() || path.getControlBounds?.();
    if (bounds) {
      this.currentLSB = Math.round(bounds.xMin);
      this.currentRSB = Math.round(positionedGlyph.glyph.xAdvance - bounds.xMax);
    }
    
    // Update value display without rebuilding the form
    this.updateValueDisplay();

    if (this.editorController.sceneModel) {
      this.editorController.sceneModel.letterspacerVisualizationData = await this.getVisualizationData();
      if (this.editorController.canvasController) {
        this.editorController.canvasController.requestUpdate();
      }
    }

    // Force interpolation status to refresh after edits
    const mappedLocation = this.sceneController.sceneSettings.fontLocationSourceMapped;
    if (mappedLocation) {
      this.sceneSettingsController.setItem(
        "fontLocationSourceMapped",
        { ...mappedLocation },
        { senderID: this }
      );
    }

    await this.refreshDesignspacePanel();
    await this.update();
  }

  async loadPersistedParams() {
    await this.ensureLetterspacerSchema();
    const sourceId = this.getCurrentSourceIdentifier();
    const activeSourceIds = await this.getCurrentGlyphSourceIdentifiers();
    const effectiveSourceId = this.getEffectiveSourceIdentifier(
      sourceId,
      activeSourceIds
    );
    if (effectiveSourceId && this.fontController.sources[effectiveSourceId]) {
      const sourceCustomData = this.fontController.sources[effectiveSourceId].customData || {};
      this.params.area = coerceNumber(
        sourceCustomData[LETTERSPACER_CUSTOM_DATA_KEYS.area],
        this.params.area ?? LETTERSPACER_DEFAULTS.area
      );
      this.params.depth = coerceNumber(
        sourceCustomData[LETTERSPACER_CUSTOM_DATA_KEYS.depth],
        this.params.depth ?? LETTERSPACER_DEFAULTS.depth
      );
      this.params.overshoot = coerceNumber(
        sourceCustomData[LETTERSPACER_CUSTOM_DATA_KEYS.overshoot],
        this.params.overshoot ?? LETTERSPACER_DEFAULTS.overshoot
      );
      const referenceValue = sourceCustomData[LETTERSPACER_CUSTOM_DATA_KEYS.reference];
      this.params.referenceGlyph =
        typeof referenceValue === "string"
          ? referenceValue
          : this.params.referenceGlyph ?? LETTERSPACER_DEFAULTS.referenceGlyph;
    } else {
      this.params.overshoot = this.params.overshoot ?? LETTERSPACER_DEFAULTS.overshoot;
      this.params.referenceGlyph =
        this.params.referenceGlyph ?? LETTERSPACER_DEFAULTS.referenceGlyph;
    }
  }

  getCurrentSourceIdentifier() {
    const mappedLocation = this.sceneController.sceneSettings.fontLocationSourceMapped || {};
    const sourceLocation = this.sceneController.sceneSettings.fontLocationSource || {};
    const hasMappedKeys = Object.keys(mappedLocation).length > 0;
    const location = hasMappedKeys ? mappedLocation : sourceLocation;
    return (
      this.fontController.fontSourcesInstancer?.getSourceIdentifierForLocation(location) ||
      this.fontController.defaultSourceIdentifier
    );
  }

  async getCurrentGlyphSourceIdentifiers() {
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    let varGlyph = positionedGlyph?.varGlyph;
    if (!varGlyph) {
      varGlyph = await this.sceneController.sceneModel.getSelectedVariableGlyphController();
    }
    if (!varGlyph?.sources) {
      return [];
    }
    const ids = new Set();
    for (const source of varGlyph.sources) {
      const id = source.locationBase || source.layerName;
      if (id && this.fontController.sources?.[id]) {
        ids.add(id);
      }
    }
    return [...ids];
  }

  getEffectiveSourceIdentifier(sourceId, activeSourceIds) {
    if (!sourceId) {
      return sourceId;
    }
    if (!activeSourceIds?.length || activeSourceIds.includes(sourceId)) {
      return sourceId;
    }
    return this.getNearestSourceIdentifier(sourceId, activeSourceIds) || sourceId;
  }

  getSourceLocationForId(sourceId) {
    const source = this.fontController.sources[sourceId];
    if (!source) return this.fontController.fontSourcesInstancer?.defaultSourceLocation || {};
    const base = this.fontController.fontSourcesInstancer?.defaultSourceLocation || {};
    return { ...base, ...source.location };
  }

  getLetterspacerValuesForSource(sourceId) {
    const source = this.fontController.sources[sourceId];
    const customData = source?.customData || {};
    return {
      area: coerceNumber(customData[LETTERSPACER_CUSTOM_DATA_KEYS.area], LETTERSPACER_DEFAULTS.area),
      depth: coerceNumber(customData[LETTERSPACER_CUSTOM_DATA_KEYS.depth], LETTERSPACER_DEFAULTS.depth),
      overshoot: coerceNumber(
        customData[LETTERSPACER_CUSTOM_DATA_KEYS.overshoot],
        LETTERSPACER_DEFAULTS.overshoot
      ),
      referenceGlyph:
        typeof customData[LETTERSPACER_CUSTOM_DATA_KEYS.reference] === "string"
          ? customData[LETTERSPACER_CUSTOM_DATA_KEYS.reference]
          : LETTERSPACER_DEFAULTS.referenceGlyph,
    };
  }

  getNearestSourceIdentifier(targetId, candidateIds) {
    if (!candidateIds.length) return undefined;
    const axes = this.fontController.fontAxesSourceSpace || [];
    const targetLoc = this.getSourceLocationForId(targetId);
    const defaultId = this.fontController.defaultSourceIdentifier;
    let bestId = undefined;
    let bestDist = Infinity;
    for (const id of candidateIds) {
      if (id === targetId) continue;
      const loc = this.getSourceLocationForId(id);
      let sum = 0;
      for (const axis of axes) {
        const a = targetLoc[axis.name] ?? axis.defaultValue ?? 0;
        const b = loc[axis.name] ?? axis.defaultValue ?? 0;
        const d = a - b;
        sum += d * d;
      }
      const dist = Math.sqrt(sum);
      if (dist < bestDist - 1e-9 || (Math.abs(dist - bestDist) < 1e-9 && id === defaultId)) {
        bestDist = dist;
        bestId = id;
      }
    }
    if (!bestId && candidateIds.includes(defaultId)) {
      bestId = defaultId;
    }
    return bestId ?? candidateIds[0];
  }

  getMissingLetterspacerValues(sourceIds) {
    const sources = this.fontController.sources || {};
    const idsToCheck =
      Array.isArray(sourceIds) && sourceIds.length
        ? sourceIds.filter((id) => sources[id])
        : Object.keys(sources);
    const hasKeys = (source) =>
      source?.customData &&
      LETTERSPACER_CUSTOM_DATA_KEYS.area in source.customData &&
      LETTERSPACER_CUSTOM_DATA_KEYS.depth in source.customData &&
      LETTERSPACER_CUSTOM_DATA_KEYS.overshoot in source.customData &&
      LETTERSPACER_CUSTOM_DATA_KEYS.reference in source.customData;
    const candidateIds = idsToCheck.filter((id) => hasKeys(sources[id]));
    const missing = {};
    for (const id of idsToCheck) {
      const source = sources[id];
      if (hasKeys(source)) {
        continue;
      }
      const nearestId = this.getNearestSourceIdentifier(id, candidateIds);
      const values = nearestId
        ? this.getLetterspacerValuesForSource(nearestId)
        : { ...LETTERSPACER_DEFAULTS };
      missing[id] = values;
    }
    return missing;
  }

  async ensureLetterspacerSchema() {
    if (this.fontController.readOnly || this._ensuringSchema) {
      return;
    }
    const activeSourceIds = await this.getCurrentGlyphSourceIdentifiers();
    if (!activeSourceIds.length) {
      return;
    }
    const missing = this.getMissingLetterspacerValues(activeSourceIds);
    const missingIds = Object.keys(missing);
    if (!missingIds.length) {
      return;
    }
    this._ensuringSchema = true;
    try {
      const root = { sources: this.fontController.sources };
      const changes = recordChanges(root, (root) => {
        for (const id of missingIds) {
          const source = root.sources[id];
          const existing = source.customData || {};
          const next = { ...existing };
          if (!(LETTERSPACER_CUSTOM_DATA_KEYS.area in next)) {
            next[LETTERSPACER_CUSTOM_DATA_KEYS.area] = missing[id].area;
          }
          if (!(LETTERSPACER_CUSTOM_DATA_KEYS.depth in next)) {
            next[LETTERSPACER_CUSTOM_DATA_KEYS.depth] = missing[id].depth;
          }
          if (!(LETTERSPACER_CUSTOM_DATA_KEYS.overshoot in next)) {
            next[LETTERSPACER_CUSTOM_DATA_KEYS.overshoot] = missing[id].overshoot;
          }
          if (!(LETTERSPACER_CUSTOM_DATA_KEYS.reference in next)) {
            next[LETTERSPACER_CUSTOM_DATA_KEYS.reference] = missing[id].referenceGlyph;
          }
          source.customData = next;
        }
      });
      if (changes.hasChange) {
        await this.fontController.postChange(
          changes.change,
          changes.rollbackChange,
          "init letterspacer schema",
          this
        );
      }
    } finally {
      this._ensuringSchema = false;
    }
  }

  async persistParam(key, value) {
    if (key === "area" || key === "depth" || key === "overshoot" || key === "referenceGlyph") {
      const sourceId = this.getCurrentSourceIdentifier();
      const activeSourceIds = await this.getCurrentGlyphSourceIdentifiers();
      const effectiveSourceId = this.getEffectiveSourceIdentifier(
        sourceId,
        activeSourceIds
      );
      if (!effectiveSourceId || !this.fontController.sources[effectiveSourceId]) {
        return;
      }
      const targetSourceIds = activeSourceIds.length ? activeSourceIds : [effectiveSourceId];
      const customKeyMap = {
        area: LETTERSPACER_CUSTOM_DATA_KEYS.area,
        depth: LETTERSPACER_CUSTOM_DATA_KEYS.depth,
        overshoot: LETTERSPACER_CUSTOM_DATA_KEYS.overshoot,
        referenceGlyph: LETTERSPACER_CUSTOM_DATA_KEYS.reference,
      };
      const customKey = customKeyMap[key];
      const valueToStore =
        key === "referenceGlyph" ? String(value ?? "") : coerceNumber(value, 0);

      const missing = this.getMissingLetterspacerValues(targetSourceIds);
      const root = { sources: this.fontController.sources };
      const changes = recordChanges(root, (root) => {
        for (const id of targetSourceIds) {
          const source = root.sources[id];
          if (!source) {
            continue;
          }
          const existing = source.customData || {};
          const next = { ...existing };
          if (!(LETTERSPACER_CUSTOM_DATA_KEYS.area in next)) {
            next[LETTERSPACER_CUSTOM_DATA_KEYS.area] =
              missing[id]?.area ?? LETTERSPACER_DEFAULTS.area;
          }
          if (!(LETTERSPACER_CUSTOM_DATA_KEYS.depth in next)) {
            next[LETTERSPACER_CUSTOM_DATA_KEYS.depth] =
              missing[id]?.depth ?? LETTERSPACER_DEFAULTS.depth;
          }
          if (!(LETTERSPACER_CUSTOM_DATA_KEYS.overshoot in next)) {
            next[LETTERSPACER_CUSTOM_DATA_KEYS.overshoot] =
              missing[id]?.overshoot ?? LETTERSPACER_DEFAULTS.overshoot;
          }
          if (!(LETTERSPACER_CUSTOM_DATA_KEYS.reference in next)) {
            next[LETTERSPACER_CUSTOM_DATA_KEYS.reference] =
              missing[id]?.referenceGlyph ?? LETTERSPACER_DEFAULTS.referenceGlyph;
          }
          if (id === effectiveSourceId) {
            next[customKey] = valueToStore;
          }
          source.customData = next;
        }
      });
      if (changes.hasChange) {
        await this.fontController.postChange(
          changes.change,
          changes.rollbackChange,
          `edit letterspacer ${key}`,
          this
        );
      }
    }
  }

  async reverseSpacing() {
    if (!(await this.hasCurrentMasterForGlyph())) {
      return;
    }
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return;

    const fontMetrics = await this.getFontMetrics();
    const path = positionedGlyph.glyph.path;
    const bounds = path.getBounds?.() || path.getControlBounds?.();
    if (!bounds) return;

    const currentLSB = bounds.xMin;
    const currentRSB = positionedGlyph.glyph.xAdvance - bounds.xMax;

    const hitTester = new PathHitTester(path, bounds);
    const freq = 5;
    const minY = bounds.yMin;
    const maxY = bounds.yMax;
    const amplitudeY = maxY - minY;
    if (amplitudeY === 0) return;

    const margins = this.collectMarginsForReverse(
      hitTester, path, bounds, minY, maxY, freq
    );

    if (!margins.leftMargins || !margins.rightMargins) {
      console.warn("Could not collect margins for reverse calculation");
      return;
    }

    const maxDepth = fontMetrics.xHeight * this.params.depth / 100;
    const processedLeft = setDepth(margins.leftMargins, margins.leftExtreme, maxDepth, true);
    const processedRight = setDepth(margins.rightMargins, margins.rightExtreme, maxDepth, false);

    if (processedLeft.length < 2 || processedRight.length < 2) {
      console.warn("Insufficient margins for reverse calculation");
      return;
    }

    const leftPolygon = closePolygon(processedLeft, margins.leftExtreme, minY, maxY);
    const rightPolygon = closePolygon(processedRight, margins.rightExtreme, minY, maxY);

    const areaLeft = polygonArea(leftPolygon);
    const areaRight = polygonArea(rightPolygon);

    const targetAreaLeft = computeTargetAreaFromSidebearing(areaLeft, currentLSB, amplitudeY);
    const targetAreaRight = computeTargetAreaFromSidebearing(areaRight, currentRSB, amplitudeY);

    const paramAreaLeft = computeParamAreaFromTargetArea(targetAreaLeft, fontMetrics, amplitudeY);
    const paramAreaRight = computeParamAreaFromTargetArea(targetAreaRight, fontMetrics, amplitudeY);

    const averagedArea = (paramAreaLeft + paramAreaRight) / 2;
    this.params.area = Math.max(50, Math.min(2000, Math.round(averagedArea)));
    await this.persistParam("area", this.params.area);

    const finalEngine = new LetterspacerEngine(this.params, fontMetrics);
    const result = finalEngine.computeSpacing(path, bounds, minY, maxY);
    if (result.lsb !== null && result.rsb !== null) {
      this.calculatedLSB = Math.round(result.lsb);
      this.calculatedRSB = Math.round(result.rsb);
    }

    await this.update();
    this.updateValueDisplay();

    if (this.editorController.sceneController?.sceneModel) {
      this.editorController.sceneModel.letterspacerVisualizationData = await this.getVisualizationData();
    }
    if (this.editorController.canvasController) {
      this.editorController.canvasController.requestUpdate();
    }
  }

  collectMarginsForReverse(hitTester, path, bounds, minY, maxY, freq) {
    const leftMargins = [];
    const rightMargins = [];
    let leftExtreme = Infinity;
    let rightExtreme = -Infinity;

    for (let y = minY; y <= maxY; y += freq) {
      const lineStart = { x: bounds.xMin - 100, y };
      const lineEnd = { x: bounds.xMax + 100, y };

      const intersections = hitTester.lineIntersections(lineStart, lineEnd);

      if (intersections.length >= 2) {
        const sorted = intersections
          .map(i => i.x !== undefined ? i : { x: i.point?.x })
          .filter(i => i.x !== undefined)
          .sort((a, b) => a.x - b.x);

        if (sorted.length >= 2) {
          const left = sorted[0].x;
          const right = sorted[sorted.length - 1].x;

          leftMargins.push({ x: left, y });
          rightMargins.push({ x: right, y });

          leftExtreme = Math.min(leftExtreme, left);
          rightExtreme = Math.max(rightExtreme, right);
        }
      }
    }

    if (leftExtreme === Infinity) leftExtreme = bounds.xMin;
    if (rightExtreme === -Infinity) rightExtreme = bounds.xMax;

    return { leftMargins, rightMargins, leftExtreme, rightExtreme };
  }

  shiftPath(path, deltaX) {
    const coords = path.coordinates;
    for (let i = 0; i < coords.length; i += 2) {
      coords[i] += deltaX;
    }
  }

  async getFontMetrics() {
    const fontSource = this.fontController.fontSourcesInstancer?.fontSourceAtLocation?.(
      this.sceneController.sceneSettings.fontLocationSourceMapped
    );
    const lineMetrics = fontSource?.lineMetricsHorizontalLayout || {};

    return {
      upm: this.fontController.unitsPerEm,
      xHeight: lineMetrics.xHeight?.value || this.fontController.unitsPerEm * 0.5,
      italicAngle: fontSource?.italicAngle || 0,
    };
  }

  async getReferenceBounds(fontMetrics) {
    if (this.params.referenceGlyph) {
      const refGlyph = await this.fontController.getGlyph(this.params.referenceGlyph);
      if (refGlyph) {
        const layer = Object.values(refGlyph.layers)[0];
        const bounds = layer?.glyph?.path?.getBounds?.();
        if (bounds) {
          const overshoot = fontMetrics.xHeight * this.params.overshoot / 100;
          return {
            minY: bounds.yMin - overshoot,
            maxY: bounds.yMax + overshoot
          };
        }
      }
    }

    const overshoot = fontMetrics.xHeight * this.params.overshoot / 100;
    return {
      minY: -overshoot,
      maxY: fontMetrics.xHeight + overshoot
    };
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
      this.sceneController.addEventListener("selectionChanged", this.handleSelectionChangeBound);
    } else {
      this.sceneController.removeEventListener("selectionChanged", this.handleSelectionChangeBound);
    }
  }

  async handleSelectionChange() {
    if (this.editorController.sceneController && this.editorController.sceneController.sceneModel) {
      this.editorController.sceneController.sceneModel.letterspacerVisualizationData = await this.getVisualizationData();
      if (this.editorController.canvasController) {
        this.editorController.canvasController.requestUpdate();
      }
    } else if (this.editorController.sceneModel) {
      this.editorController.sceneModel.letterspacerVisualizationData = await this.getVisualizationData();
      if (this.editorController.canvasController) {
        this.editorController.canvasController.requestUpdate();
      }
    }
  }

  async refreshPersistedParams() {
    if (!this.infoForm.contentElement.offsetParent) {
      return;
    }
    await this.update();
  }

  async clearVisualization() {
    // Fade the visualization when glyph is edited (until Calculate/Apply)
    this.visualizationOpacity = 0.2;
    const sceneModel = this.editorController.sceneController?.sceneModel;
    if (sceneModel?.letterspacerVisualizationData) {
      sceneModel.letterspacerVisualizationData = {
        ...sceneModel.letterspacerVisualizationData,
        opacity: this.visualizationOpacity,
      };
    }
    if (this.editorController.canvasController) {
      this.editorController.canvasController.requestUpdate();
    }

    await this.refreshDesignspacePanel();
    await this.update();
  }

  formatValue(value) {
    // Format spacing value for display
    if (value === null || value === undefined) return "-";
    return Math.round(value);
  }

  async updateCalculatedValues() {
    // Update current and calculated spacing values
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return;

    // Get current values from glyph
    const path = positionedGlyph.glyph.path;
    const bounds = path.getBounds?.() || path.getControlBounds?.();
    if (!bounds) return;

    this.currentLSB = Math.round(bounds.xMin);
    this.currentRSB = Math.round(positionedGlyph.glyph.xAdvance - bounds.xMax);

    // Calculate new values using letterspacer
    const fontMetrics = await this.getFontMetrics();
    const refBounds = await this.getReferenceBounds(fontMetrics);
    const engine = new LetterspacerEngine(this.params, fontMetrics);
    const result = engine.computeSpacing(path, bounds, refBounds.minY, refBounds.maxY);

    if (result.lsb !== null && result.rsb !== null) {
      this.calculatedLSB = Math.round(result.lsb);
      this.calculatedRSB = Math.round(result.rsb);
    }
  }

  async calculateSpacing() {
    if (!(await this.hasCurrentMasterForGlyph())) {
      return;
    }
    // Recalculate spacing after glyph edits
    this.visualizationOpacity = 1;
    await this.updateCalculatedValues();
    await this.update();

    // Refresh visualization
    if (this.editorController.sceneController?.sceneModel) {
      this.editorController.sceneController.sceneModel.letterspacerVisualizationData = await this.getVisualizationData();
    }
    if (this.editorController.canvasController) {
      this.editorController.canvasController.requestUpdate();
    }
  }

  getEngine() {
    return this.engine;
  }

  async getVisualizationData() {
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) {
      return null;
    }

    const fontMetrics = await this.getFontMetrics();
    const refBounds = await this.getReferenceBounds(fontMetrics);
    const engine = new LetterspacerEngine(this.params, fontMetrics);

    const path = positionedGlyph.glyph.path;
    const bounds = path.getBounds?.() || path.getControlBounds?.();
    if (!bounds) {
      return null;
    }

    engine.computeSpacing(path, bounds, refBounds.minY, refBounds.maxY);

    const result = {
      opacity: this.visualizationOpacity ?? 1,
      scanLines: engine.scanLines,
      leftPolygon: engine.leftPolygon,
      rightPolygon: engine.rightPolygon,
      leftSBPolygon: engine.leftSBPolygon,
      rightSBPolygon: engine.rightSBPolygon,
      leftSBLine: engine.leftSBLine,
      rightSBLine: engine.rightSBLine,
      lsb: engine.lsb,
      rsb: engine.rsb,
      leftExtreme: engine.leftExtreme,
      rightExtreme: engine.rightExtreme,
      leftDepthLimit: engine.leftDepthLimit,
      rightDepthLimit: engine.rightDepthLimit,
      leftExtremeDepthLimited: engine.leftExtremeDepthLimited,
      rightExtremeDepthLimited: engine.rightExtremeDepthLimited,
      leftMargins: engine.leftMargins,
      rightMargins: engine.rightMargins,
      leftMarginsProcessed: engine.leftMarginsProcessed,
      rightMarginsProcessed: engine.rightMarginsProcessed,
      params: this.params,
      referenceBounds: { minY: refBounds.minY, maxY: refBounds.maxY }
    };

    return result;
  }

  async hasCurrentMasterForGlyph() {
    const sourceId = this.getCurrentSourceIdentifier();
    if (!sourceId) {
      return false;
    }
    const activeSourceIds = await this.getCurrentGlyphSourceIdentifiers();
    return activeSourceIds.includes(sourceId);
  }

  async refreshDesignspacePanel() {
    const panel = this.editorController.getSidebarPanel?.("designspace-navigation");
    if (panel?.refreshSourcesAndStatus) {
      await panel.refreshSourcesAndStatus();
    }
  }
}

customElements.define("panel-letterspacer", LetterspacerPanel);
