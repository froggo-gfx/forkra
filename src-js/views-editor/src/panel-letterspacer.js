import { PathHitTester } from "@fontra/core/path-hit-tester.js";
import { getGlyphInfoFromGlyphName } from "@fontra/core/glyph-data.js";
import { recordChanges } from "@fontra/core/change-recorder.js";
import { moveSkeletonData } from "@fontra/core/skeleton-contour-generator.js";
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

function computeParamAreaFromTargetArea(targetArea, fontMetrics, amplitudeY, factor = 1) {
  const upmScale = Math.pow(fontMetrics.upm / 1000, 2);
  if (amplitudeY === 0 || upmScale === 0 || factor === 0) return 0;
  return (targetArea * fontMetrics.xHeight) / (amplitudeY * 100 * upmScale * factor);
}

function triangle(angle, y) {
  const radians = (angle * Math.PI) / 180;
  return y * Math.tan(radians);
}

function deslantMargins(margins, xHeight, angle) {
  if (!angle) return margins;
  const radians = (angle * Math.PI) / 180;
  const tanAngle = Math.tan(radians);
  const mline = xHeight * 0.5;
  return margins.map(point => ({
    x: point.x - (point.y - mline) * tanAngle,
    y: point.y
  }));
}

function filterMarginsByY(margins, minY, maxY) {
  if (!margins?.length) return [];
  return margins.filter(point => point.y >= minY && point.y <= maxY);
}

function getExtremes(leftMargins, rightMargins, bounds) {
  let leftExtreme = Infinity;
  let rightExtreme = -Infinity;
  for (const point of leftMargins) {
    leftExtreme = Math.min(leftExtreme, point.x);
  }
  for (const point of rightMargins) {
    rightExtreme = Math.max(rightExtreme, point.x);
  }
  if (leftExtreme === Infinity) leftExtreme = bounds?.xMin ?? 0;
  if (rightExtreme === -Infinity) rightExtreme = bounds?.xMax ?? 0;
  return { leftExtreme, rightExtreme };
}

function extendMarginsToReference(
  leftMargins,
  rightMargins,
  leftDepthLimit,
  rightDepthLimit,
  minY,
  maxY,
  step
) {
  if (!leftMargins.length || !rightMargins.length) {
    return { leftMargins, rightMargins };
  }

  const extendedLeft = [...leftMargins];
  const extendedRight = [...rightMargins];

  let y = extendedLeft[0].y - step;
  while (y >= minY) {
    extendedLeft.unshift({ x: leftDepthLimit, y });
    extendedRight.unshift({ x: rightDepthLimit, y });
    y -= step;
  }

  y = extendedLeft[extendedLeft.length - 1].y + step;
  while (y <= maxY) {
    extendedLeft.push({ x: leftDepthLimit, y });
    extendedRight.push({ x: rightDepthLimit, y });
    y += step;
  }

  return { leftMargins: extendedLeft, rightMargins: extendedRight };
}

const LETTERSPACER_CUSTOM_DATA_KEYS = {
  area: "fontra.letterspacer.area",
  depth: "fontra.letterspacer.depth",
  overshoot: "fontra.letterspacer.overshoot",
  reference: "fontra.letterspacer.reference",
};

const LETTERSPACER_FONT_CUSTOM_DATA_KEYS = {
  enabled: "fontra.letterspacer.enabled",
};

const LETTERSPACER_DEFAULTS = {
  area: 400,
  depth: 15,
  overshoot: 0,
  referenceGlyph: "",
};

const HT_REFERENCE_RULES = [
  // Letters
  { script: "*", category: "Letter", subCategory: "Uppercase", factor: 1.25, reference: "H", filter: "*" },
  { script: "*", category: "Letter", subCategory: "Smallcaps", factor: 1.1, reference: "h.sc", filter: "*" },
  { script: "*", category: "Letter", subCategory: "Lowercase", factor: 1.0, reference: "x", filter: "*" },
  { script: "*", category: "Letter", subCategory: "Lowercase", factor: 0.7, reference: "m.sups", filter: ".sups" },

  // Numbers
  { script: "*", category: "Number", subCategory: "Decimal Digit", factor: 1.2, reference: "one", filter: "*" },
  { script: "*", category: "Number", subCategory: "Decimal Digit", factor: 1.2, reference: "zero.osf", filter: ".osf" },
  { script: "*", category: "Number", subCategory: "Fraction", factor: 1.3, reference: "*", filter: "*" },
  { script: "*", category: "Number", subCategory: "*", factor: 0.8, reference: "*", filter: ".dnom" },
  { script: "*", category: "Number", subCategory: "*", factor: 0.8, reference: "*", filter: ".numr" },
  { script: "*", category: "Number", subCategory: "*", factor: 0.8, reference: "*", filter: ".inferior" },
  { script: "*", category: "Number", subCategory: "*", factor: 0.8, reference: "*", filter: "superior" },

  // Punctuation
  { script: "*", category: "Punctuation", subCategory: "Other", factor: 1.4, reference: "*", filter: "*" },
  { script: "*", category: "Punctuation", subCategory: "Parenthesis", factor: 1.2, reference: "*", filter: "*" },
  { script: "*", category: "Punctuation", subCategory: "Quote", factor: 1.2, reference: "*", filter: "*" },
  { script: "*", category: "Punctuation", subCategory: "Dash", factor: 1.0, reference: "*", filter: "*" },
  { script: "*", category: "Punctuation", subCategory: "*", factor: 1.0, reference: "*", filter: "slash" },
  { script: "*", category: "Punctuation", subCategory: "*", factor: 1.2, reference: "*", filter: "*" },

  // Symbols
  { script: "*", category: "Symbol", subCategory: "Currency", factor: 1.6, reference: "*", filter: "*" },
  { script: "*", category: "Symbol", subCategory: "*", factor: 1.5, reference: "*", filter: "*" },
  { script: "*", category: "Mark", subCategory: "*", factor: 1.0, reference: "*", filter: "*" },

  // Devanagari
  { script: "devanagari", category: "Letter", subCategory: "Other", factor: 1.0, reference: "devaHeight", filter: "*" },
  { script: "devanagari", category: "Letter", subCategory: "Ligature", factor: 1.0, reference: "devaHeight", filter: "*" },
];

function matchesRuleField(ruleValue, glyphValue) {
  if (ruleValue === "*") return true;
  if (glyphValue === undefined || glyphValue === null) return false;
  return String(ruleValue).toLowerCase() === String(glyphValue).toLowerCase();
}

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
    this.leftMarginsProcessedAlgo = [];
    this.rightMarginsProcessedAlgo = [];
    this.leftExtreme = null;
    this.rightExtreme = null;
    this.leftExtremeDepthLimited = null;
    this.rightExtremeDepthLimited = null;
    this.leftDepthLimit = null;
    this.rightDepthLimit = null;
    this.leftDepthLimitAlgo = null;
    this.rightDepthLimitAlgo = null;
    this.leftAlgoPolygon = [];
    this.rightAlgoPolygon = [];
  }

  computeSpacing(path, bounds, refMinY, refMaxY, factor = 1) {
    const freq = 5;
    const minY = bounds.yMin;
    const maxY = bounds.yMax;
    const amplitudeY = refMaxY - refMinY;

    this.scanLines = [];
    this.leftPolygon = [];
    this.rightPolygon = [];
    this.leftSBPolygon = [];
    this.rightSBPolygon = [];
    this.leftMarginsProcessed = [];
    this.rightMarginsProcessed = [];
    this.leftMarginsProcessedAlgo = [];
    this.rightMarginsProcessedAlgo = [];
    this.leftAlgoPolygon = [];
    this.rightAlgoPolygon = [];
    this.leftDepthLimitAlgo = null;
    this.rightDepthLimitAlgo = null;

    const areaUPM = this.params.area * factor * Math.pow(this.upm / 1000, 2);
    const targetArea = (amplitudeY * areaUPM * 100) / this.xHeight;

    const maxDepth = this.xHeight * this.params.depth / 100;

    const margins = this.collectMargins(path, bounds, minY, maxY, refMinY, refMaxY, freq);
    if (!margins.hasRefIntersections) {
      return { lsb: null, rsb: null, noRefIntersections: true };
    }

    const zoneLeftMargins = filterMarginsByY(margins.leftMargins, refMinY, refMaxY);
    const zoneRightMargins = filterMarginsByY(margins.rightMargins, refMinY, refMaxY);

    if (zoneLeftMargins.length < 2 || zoneRightMargins.length < 2) {
      return { lsb: null, rsb: null };
    }

    const displayExtremes = getExtremes(zoneLeftMargins, zoneRightMargins, bounds);
    this.leftMargins = zoneLeftMargins;
    this.rightMargins = zoneRightMargins;
    this.leftExtreme = displayExtremes.leftExtreme;
    this.rightExtreme = displayExtremes.rightExtreme;

    let fullLeftMargins = margins.leftMargins;
    let fullRightMargins = margins.rightMargins;
    let algoZoneLeftMargins = zoneLeftMargins;
    let algoZoneRightMargins = zoneRightMargins;

    if (this.angle) {
      fullLeftMargins = deslantMargins(fullLeftMargins, this.xHeight, this.angle);
      fullRightMargins = deslantMargins(fullRightMargins, this.xHeight, this.angle);
      algoZoneLeftMargins = deslantMargins(algoZoneLeftMargins, this.xHeight, this.angle);
      algoZoneRightMargins = deslantMargins(algoZoneRightMargins, this.xHeight, this.angle);
    }

    const fullExtremes = getExtremes(fullLeftMargins, fullRightMargins, bounds);
    const zoneExtremes = getExtremes(algoZoneLeftMargins, algoZoneRightMargins, bounds);
    const distanceL = zoneExtremes.leftExtreme - fullExtremes.leftExtreme;
    const distanceR = fullExtremes.rightExtreme - zoneExtremes.rightExtreme;

    const leftDepthLimitAlgo = zoneExtremes.leftExtreme + maxDepth;
    const rightDepthLimitAlgo = zoneExtremes.rightExtreme - maxDepth;

    // Apply depth limit to margins (algorithm space)
    let processedLeft = setDepth(algoZoneLeftMargins, zoneExtremes.leftExtreme, maxDepth, true);
    let processedRight = setDepth(algoZoneRightMargins, zoneExtremes.rightExtreme, maxDepth, false);
    ({ leftMargins: processedLeft, rightMargins: processedRight } = extendMarginsToReference(
      processedLeft,
      processedRight,
      leftDepthLimitAlgo,
      rightDepthLimitAlgo,
      refMinY,
      refMaxY,
      freq
    ));

    const algoLeftPolygon = closePolygon(
      processedLeft,
      zoneExtremes.leftExtreme,
      refMinY,
      refMaxY
    );
    const algoRightPolygon = closePolygon(
      processedRight,
      zoneExtremes.rightExtreme,
      refMinY,
      refMaxY
    );

    this.leftMarginsProcessedAlgo = [...processedLeft];
    this.rightMarginsProcessedAlgo = [...processedRight];
    this.leftAlgoPolygon = [...algoLeftPolygon];
    this.rightAlgoPolygon = [...algoRightPolygon];
    this.leftDepthLimitAlgo = leftDepthLimitAlgo;
    this.rightDepthLimitAlgo = rightDepthLimitAlgo;

    this.lsb = calculateSidebearing(algoLeftPolygon, targetArea, amplitudeY) - distanceL;
    this.rsb = calculateSidebearing(algoRightPolygon, targetArea, amplitudeY) - distanceR;

    const leftDepthLimitDisplay = this.leftExtreme + maxDepth;
    const rightDepthLimitDisplay = this.rightExtreme - maxDepth;

    // Apply depth limit to margins (display space)
    let displayProcessedLeft = setDepth(zoneLeftMargins, this.leftExtreme, maxDepth, true);
    let displayProcessedRight = setDepth(zoneRightMargins, this.rightExtreme, maxDepth, false);
    ({ leftMargins: displayProcessedLeft, rightMargins: displayProcessedRight } =
      extendMarginsToReference(
        displayProcessedLeft,
        displayProcessedRight,
        leftDepthLimitDisplay,
        rightDepthLimitDisplay,
        refMinY,
        refMaxY,
        freq
      ));

    // Store processed margins for visualization
    this.leftMarginsProcessed = [...displayProcessedLeft];
    this.rightMarginsProcessed = [...displayProcessedRight];

    // Calculate depth limits (how far inward from glyph edge)
    this.leftDepthLimit = leftDepthLimitDisplay;  // Inward from left extreme (rightward)
    this.rightDepthLimit = rightDepthLimitDisplay;  // Inward from right extreme (leftward)

    this.leftExtremeDepthLimited = Math.min(...displayProcessedLeft.map(p => p.x));
    this.rightExtremeDepthLimited = Math.max(...displayProcessedRight.map(p => p.x));

    // Close polygons at the ORIGINAL extremes (not the depth limits)
    // The depth limit only affects how far inward the margins can extend,
    // but the polygon area is bounded by the original glyph edge
    this.leftPolygon = closePolygon(displayProcessedLeft, this.leftExtreme, refMinY, refMaxY);
    this.rightPolygon = closePolygon(displayProcessedRight, this.rightExtreme, refMinY, refMaxY);

    // For visualization: show polygon in display space
    // The polygon goes from extreme -> clipped margins -> extreme
    this.leftSBPolygon = [...this.leftPolygon];
    this.rightSBPolygon = [...this.rightPolygon];

    // Calculate sidebearing line positions from depth-limited extremes
    this.leftSBLine = this.leftExtremeDepthLimited - this.lsb;
    this.rightSBLine = this.rightExtremeDepthLimited + this.rsb;

    return { lsb: this.lsb, rsb: this.rsb, noRefIntersections: false };
  }

  collectMargins(path, bounds, minY, maxY, refMinY, refMaxY, freq) {
    const hitTester = new PathHitTester(path, bounds);
    const leftMargins = [];
    const rightMargins = [];
    let leftExtreme = Infinity;  // Will be set from actual margins
    let rightExtreme = -Infinity;  // Will be set from actual margins
    let hasRefIntersections = false;
    const angle = this.angle || 0;
    const origin = bounds.xMin;
    const endpointx = bounds.xMax;
    const endpointy = bounds.yMax;
    const xpos = triangle(angle, endpointy) + origin;
    const slantWidth = endpointx - xpos;
    const dfltDepth = slantWidth;

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

      let left = null;
      let right = null;

      if (intersections.length >= 2) {
        // Sort by x
        const sorted = intersections
          .map(i => i.x !== undefined ? i : { x: i.point?.x })
          .filter(i => i.x !== undefined)
          .sort((a, b) => a.x - b.x);

        if (sorted.length >= 2) {
          left = sorted[0].x;
          right = sorted[sorted.length - 1].x;
          if (y >= refMinY && y <= refMaxY) {
            hasRefIntersections = true;
          }
        }
      }

      if (left === null || right === null) {
        const slantOffset = triangle(angle, y);
        left = origin + slantOffset + dfltDepth;
        right = origin + slantOffset;
      }

      leftMargins.push({ x: left, y });
      rightMargins.push({ x: right, y });

      leftExtreme = Math.min(leftExtreme, left);
      rightExtreme = Math.max(rightExtreme, right);
    }

    // Fallback to bounds if no intersections found
    if (leftExtreme === Infinity) leftExtreme = bounds.xMin;
    if (rightExtreme === -Infinity) rightExtreme = bounds.xMax;

    return { leftMargins, rightMargins, leftExtreme, rightExtreme, hasRefIntersections };
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
    this.reverseWarningArmed = false;
    this.reverseWarningMessage = "";
    this.reverseWarningTooltip = null;
    this.debugLogging = true;
    this.algorithmEnabled = true;
  }

  getContentElement() {
    return html.div({ class: "panel" }, []);
  }

  buildHeaderControls() {
    const toggleInput = html.input({
      type: "checkbox",
      checked: this.algorithmEnabled,
      onchange: (event) => this.setAlgorithmEnabled(event.target.checked),
    });
    const toggleLabel = html.label(
      {
        style:
          "display: flex; align-items: center; gap: 0.35rem; font-weight: normal; font-size: 0.85rem;",
        title: "Enable letterspacer",
      },
      [toggleInput, html.span({ style: "font-weight: normal;" }, ["Enabled"])]
    );

    const controls = html.div(
      { style: "display: flex; align-items: center; gap: 0.5rem;" },
      [toggleLabel]
    );

    if (this.algorithmEnabled) {
      const reverseButton = html.createDomElement(
        "button",
        {
          style:
            "margin-left: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer;",
          onclick: (event) => this.reverseSpacing(event),
          disabled: !this.hasCurrentMaster,
        },
        ["Reverse"]
      );
      controls.appendChild(reverseButton);
    }

    return controls;
  }

  async setAlgorithmEnabled(enabled) {
    const nextValue = !!enabled;
    if (this.algorithmEnabled === nextValue) {
      return;
    }
    this.algorithmEnabled = nextValue;
    if (!this.algorithmEnabled) {
      this.calculatedLSB = null;
      this.calculatedRSB = null;
      this.clearVisualizationData();
    }
    await this.persistAlgorithmEnabled(nextValue);
    await this.refreshDesignspacePanel();
    await this.update();
  }

  async update(senderInfo) {
    if (!this.infoForm.contentElement.offsetParent) return;
    await this.fontController.ensureInitialized;

    this._suppressPersist = true;
    try {
      await this.loadAlgorithmEnabled();
      if (this.algorithmEnabled) {
        await this.loadPersistedParams();
      }
      this.hasCurrentMaster = this.algorithmEnabled
        ? await this.hasCurrentMasterForGlyph()
        : false;

      const headerControls = this.buildHeaderControls();
      const formContents = [
        {
          type: "header",
          label: translate("sidebar.letterspacer.title"),
          auxiliaryElement: headerControls,
        },
      ];

      if (this.algorithmEnabled) {
        formContents.push(
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
        );
      }

      this.infoForm.setFieldDescriptions(formContents);
      this.infoForm.onFieldChange = async (fieldItem, value) => {
        if (this._suppressPersist) {
          this.params[fieldItem.key] = value;
          return;
        }
        if (!this.algorithmEnabled) {
          return;
        }
        this.params[fieldItem.key] = value;
        await this.persistParam(fieldItem.key, value);

        if (
          fieldItem.key === "area" ||
          fieldItem.key === "depth" ||
          fieldItem.key === "overshoot" ||
          fieldItem.key === "referenceGlyph"
        ) {
          this.calculatedLSB = null;
          this.calculatedRSB = null;
          this.clearVisualizationData();
        }

        // Update value display without rebuilding the form
        this.updateValueDisplay();
      };

      if (this.algorithmEnabled) {
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
      }
    } finally {
      this._suppressPersist = false;
    }

    if (this.algorithmEnabled) {
      this.updateValueDisplay();
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

  clearVisualizationData() {
    const sceneModel =
      this.editorController.sceneController?.sceneModel || this.editorController.sceneModel;
    if (sceneModel?.letterspacerVisualizationData) {
      sceneModel.letterspacerVisualizationData = null;
    }
    if (this.editorController.canvasController) {
      this.editorController.canvasController.requestUpdate();
    }
  }

  async updateCurrentValues() {
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return false;

    const glyphController = positionedGlyph.glyph;
    const bounds = glyphController.bounds;
    if (!bounds) return false;

    this.currentLSB = Math.round(bounds.xMin);
    this.currentRSB = Math.round(positionedGlyph.glyph.xAdvance - bounds.xMax);
    return true;
  }


  async applySpacing() {
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return;

    // Font metrics
    const fontMetrics = await this.getFontMetrics();

    // Engine
    const engine = new LetterspacerEngine(this.params, fontMetrics);

    const spacingByLayer = {};
    const layerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
      positionedGlyph.varGlyph?.glyph?.layers || {}
    );
    const glyphName = this.getSelectedGlyphName() || positionedGlyph.glyphName;
    const { referenceGlyph, factor } = this.getReferenceSettings(glyphName);
    const referenceGlyphController = referenceGlyph
      ? await this.fontController.getGlyph(referenceGlyph)
      : null;

    for (const layerName of Object.keys(layerGlyphs)) {
      const glyphController = await this.sceneController.sceneModel.getGlyphInstance(
        glyphName,
        layerName
      );
      if (!glyphController) {
        continue;
      }
      const path = glyphController.flattenedPath;
      const bounds = glyphController.bounds;
      if (!bounds) {
        continue;
      }

      const refBounds = await this.getReferenceBoundsForLayer(
        referenceGlyph,
        referenceGlyphController,
        layerName,
        glyphController,
        fontMetrics,
        glyphName
      );

      const { lsb, rsb } = engine.computeSpacing(
        path,
        bounds,
        refBounds.minY,
        refBounds.maxY,
        factor
      );

      if (lsb === null || rsb === null) {
        continue;
      }

      const roundedLSB = Math.round(lsb);
      const roundedRSB = Math.round(rsb);
      const currentLSB = bounds.xMin;
      const deltaLSB = roundedLSB - currentLSB;
      const newXAdvanceWithRSB = Math.round(bounds.xMax + deltaLSB + roundedRSB);
      const newXAdvanceKeepRSB = Math.round(glyphController.xAdvance + deltaLSB);

      spacingByLayer[layerName] = {
        deltaLSB,
        newXAdvanceWithRSB,
        newXAdvanceKeepRSB
      };
    }

    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      const layerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(glyph.layers);

      for (const [layerName, layerGlyph] of Object.entries(layerGlyphs)) {
        const spacing = spacingByLayer[layerName];
        if (!spacing) {
          continue;
        }

        if (this.params.applyLSB) {
          const reference = layerGlyph.getMoveReference();
          layerGlyph.moveWithReference(reference, spacing.deltaLSB, 0);
          const layer = glyph.layers?.[layerName];
          const skeletonData = layer?.customData?.["fontra.skeleton"];
          if (skeletonData) {
            moveSkeletonData(skeletonData, spacing.deltaLSB, 0);
          }
        }

        if (this.params.applyRSB) {
          layerGlyph.xAdvance = spacing.newXAdvanceWithRSB;
        } else if (this.params.applyLSB) {
          layerGlyph.xAdvance = spacing.newXAdvanceKeepRSB;
        }
      }

      return "letterspacer";
    }, undefined, true);
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
    } else {
      this.params.overshoot = this.params.overshoot ?? LETTERSPACER_DEFAULTS.overshoot;
    }

    const referenceValue = await this.getGlyphReferenceValue();
    this.params.referenceGlyph =
      typeof referenceValue === "string"
        ? referenceValue
        : LETTERSPACER_DEFAULTS.referenceGlyph;
  }

  async loadAlgorithmEnabled() {
    const value =
      this.fontController?.customData?.[LETTERSPACER_FONT_CUSTOM_DATA_KEYS.enabled];
    if (value === undefined || value === null) {
      return;
    }
    this.algorithmEnabled = !!value;
  }

  async persistAlgorithmEnabled(enabled) {
    if (this.fontController.readOnly) {
      return;
    }
    const nextValue = !!enabled;
    const root = { customData: this.fontController.customData || {} };
    const changes = recordChanges(root, (root) => {
      if (!root.customData) {
        root.customData = {};
      }
      root.customData[LETTERSPACER_FONT_CUSTOM_DATA_KEYS.enabled] = nextValue;
    });
    if (changes.hasChange) {
      await this.fontController.postChange(
        changes.change,
        changes.rollbackChange,
        "edit letterspacer enabled",
        this
      );
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
      LETTERSPACER_CUSTOM_DATA_KEYS.overshoot in source.customData;
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
    if (key === "referenceGlyph") {
      await this.persistGlyphReference(value);
      return;
    }
    if (key === "area" || key === "depth" || key === "overshoot") {
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
      };
      const customKey = customKeyMap[key];
      const valueToStore = coerceNumber(value, 0);

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

  async getGlyphReferenceValue() {
    const varGlyph = await this.getSelectedVarGlyph();
    return varGlyph?.glyph?.customData?.[LETTERSPACER_CUSTOM_DATA_KEYS.reference];
  }

  async persistGlyphReference(value) {
    const glyphName =
      this.getSelectedGlyphName() ||
      this.sceneController.sceneModel?.getSelectedPositionedGlyph?.()?.glyphName;
    if (!glyphName) {
      return;
    }
    const nextValue = String(value ?? "");
    await this.sceneController.editNamedGlyphAndRecordChanges(glyphName, (glyph) => {
      const existing = glyph.customData?.[LETTERSPACER_CUSTOM_DATA_KEYS.reference];
      if (existing === nextValue) {
        return "edit letterspacer reference";
      }
      if (!glyph.customData) {
        glyph.customData = {};
      }
      glyph.customData[LETTERSPACER_CUSTOM_DATA_KEYS.reference] = nextValue;
      return "edit letterspacer reference";
    });
  }

  async getSelectedVarGlyph() {
    const positionedGlyph = this.sceneController.sceneModel?.getSelectedPositionedGlyph?.();
    if (positionedGlyph?.varGlyph) {
      return positionedGlyph.varGlyph;
    }
    if (this.sceneController.sceneModel?.getSelectedVariableGlyphController) {
      return await this.sceneController.sceneModel.getSelectedVariableGlyphController();
    }
    return null;
  }

  async reverseSpacing(event) {
    if (!this.algorithmEnabled) {
      return;
    }
    if (!(await this.hasCurrentMasterForGlyph())) {
      return;
    }
    const guardInfo = await this.getReverseGuardInfo();
    if (guardInfo.shouldGuard && !this.reverseWarningArmed) {
      this.reverseWarningArmed = true;
      this.reverseWarningMessage = guardInfo.message;
      this.showReverseWarningTooltip(event?.currentTarget, guardInfo.message);
      return;
    }
    this.reverseWarningArmed = false;
    this.reverseWarningMessage = "";
    this.hideReverseWarningTooltip();

    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return;

    const fontMetrics = await this.getFontMetrics();
    const glyphName = this.getSelectedGlyphName() || positionedGlyph.glyphName;
    const { factor } = this.getReferenceSettings(glyphName);
    const glyphController = positionedGlyph.glyph;
    const path = glyphController.flattenedPath;
    const bounds = glyphController.bounds;
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
      hitTester,
      bounds,
      minY,
      maxY,
      freq,
      fontMetrics.italicAngle || 0
    );

    if (!margins.leftMargins || !margins.rightMargins || !margins.hasIntersections) {
      return;
    }

    const maxDepth = fontMetrics.xHeight * this.params.depth / 100;
    let leftMargins = margins.leftMargins;
    let rightMargins = margins.rightMargins;
    if (fontMetrics.italicAngle) {
      leftMargins = deslantMargins(leftMargins, fontMetrics.xHeight, fontMetrics.italicAngle);
      rightMargins = deslantMargins(rightMargins, fontMetrics.xHeight, fontMetrics.italicAngle);
    }
    const reverseExtremes = getExtremes(leftMargins, rightMargins, bounds);
    const processedLeft = setDepth(leftMargins, reverseExtremes.leftExtreme, maxDepth, true);
    const processedRight = setDepth(rightMargins, reverseExtremes.rightExtreme, maxDepth, false);

    if (processedLeft.length < 2 || processedRight.length < 2) {
      return;
    }

    const leftPolygon = closePolygon(processedLeft, reverseExtremes.leftExtreme, minY, maxY);
    const rightPolygon = closePolygon(processedRight, reverseExtremes.rightExtreme, minY, maxY);

    const areaLeft = polygonArea(leftPolygon);
    const areaRight = polygonArea(rightPolygon);

    const targetAreaLeft = computeTargetAreaFromSidebearing(areaLeft, currentLSB, amplitudeY);
    const targetAreaRight = computeTargetAreaFromSidebearing(areaRight, currentRSB, amplitudeY);

    const paramAreaLeft = computeParamAreaFromTargetArea(
      targetAreaLeft,
      fontMetrics,
      amplitudeY,
      factor
    );
    const paramAreaRight = computeParamAreaFromTargetArea(
      targetAreaRight,
      fontMetrics,
      amplitudeY,
      factor
    );

    const averagedArea = (paramAreaLeft + paramAreaRight) / 2;
    this.params.area = Math.max(50, Math.min(2000, Math.round(averagedArea)));
    await this.persistParam("area", this.params.area);

    const finalEngine = new LetterspacerEngine(this.params, fontMetrics);
    const result = finalEngine.computeSpacing(path, bounds, minY, maxY, factor);
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

  collectMarginsForReverse(hitTester, bounds, minY, maxY, freq, angle) {
    const leftMargins = [];
    const rightMargins = [];
    let leftExtreme = Infinity;
    let rightExtreme = -Infinity;
    let hasIntersections = false;
    const origin = bounds.xMin;
    const endpointx = bounds.xMax;
    const endpointy = bounds.yMax;
    const xpos = triangle(angle || 0, endpointy) + origin;
    const slantWidth = endpointx - xpos;
    const dfltDepth = slantWidth;

    for (let y = minY; y <= maxY; y += freq) {
      const lineStart = { x: bounds.xMin - 100, y };
      const lineEnd = { x: bounds.xMax + 100, y };

      const intersections = hitTester.lineIntersections(lineStart, lineEnd);

      let left = null;
      let right = null;
      if (intersections.length >= 2) {
        const sorted = intersections
          .map(i => i.x !== undefined ? i : { x: i.point?.x })
          .filter(i => i.x !== undefined)
          .sort((a, b) => a.x - b.x);

        if (sorted.length >= 2) {
          left = sorted[0].x;
          right = sorted[sorted.length - 1].x;
          hasIntersections = true;
        }
      }

      if (left === null || right === null) {
        const slantOffset = triangle(angle || 0, y);
        left = origin + slantOffset + dfltDepth;
        right = origin + slantOffset;
      }

      leftMargins.push({ x: left, y });
      rightMargins.push({ x: right, y });

      leftExtreme = Math.min(leftExtreme, left);
      rightExtreme = Math.max(rightExtreme, right);
    }

    if (leftExtreme === Infinity) leftExtreme = bounds.xMin;
    if (rightExtreme === -Infinity) rightExtreme = bounds.xMax;

    return { leftMargins, rightMargins, leftExtreme, rightExtreme, hasIntersections };
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

  getSelectedGlyphName() {
    return (
      this.sceneController.sceneModel?.getSelectedGlyphName?.() ??
      this.sceneController.sceneSettings?.selectedGlyphName
    );
  }

  getReferenceSettings(glyphName) {
    const manualReference = (this.params.referenceGlyph || "").trim();
    if (manualReference) {
      return { referenceGlyph: manualReference, factor: 1 };
    }
    return this.getAutoReferenceSettings(glyphName);
  }

  getAutoReferenceSettings(glyphName) {
    if (!glyphName) {
      return { referenceGlyph: "", factor: 1 };
    }
    let glyphInfo = getGlyphInfoFromGlyphName(glyphName);
    if (!glyphInfo && glyphName.includes(".")) {
      const baseName = glyphName.split(".")[0];
      glyphInfo = getGlyphInfoFromGlyphName(baseName);
    }
    glyphInfo = glyphInfo || {};
    const category = glyphInfo.category;
    const script = glyphInfo.script;
    const subCategory = this.getHtSubCategory(glyphName, glyphInfo);

    let match = null;
    for (const rule of HT_REFERENCE_RULES) {
      if (
        !matchesRuleField(rule.script, script) ||
        !matchesRuleField(rule.category, category) ||
        !matchesRuleField(rule.subCategory, subCategory)
      ) {
        continue;
      }

      if (!match) {
        match = rule;
        continue;
      }

      if (rule.filter && rule.filter !== "*" && glyphName.includes(rule.filter)) {
        match = rule;
      }
    }

    if (!match) {
      return { referenceGlyph: glyphName, factor: 1 };
    }

    const referenceGlyph =
      match.reference === "*" ? glyphName : match.reference;
    return {
      referenceGlyph: referenceGlyph || glyphName,
      factor: Number(match.factor) || 1,
    };
  }

  getHtSubCategory(glyphName, glyphInfo) {
    const suffixes = glyphName?.split(".").slice(1).map((item) => item.toLowerCase()) || [];
    if (suffixes.includes("sc") || suffixes.includes("smcp") || suffixes.includes("c2sc")) {
      return "Smallcaps";
    }

    if (glyphInfo?.subCategory) {
      return glyphInfo.subCategory;
    }

    const caseValue = glyphInfo?.case;
    if (!caseValue) {
      return undefined;
    }

    const normalized = String(caseValue).toLowerCase();
    if (normalized === "upper") return "Uppercase";
    if (normalized === "lower") return "Lowercase";
    if (normalized === "smallcaps") return "Smallcaps";

    return undefined;
  }

  getLayerBounds(layerGlyph) {
    if (!layerGlyph) {
      return null;
    }
    if (layerGlyph.bounds) {
      return layerGlyph.bounds;
    }
    if (layerGlyph.controlBounds) {
      return layerGlyph.controlBounds;
    }
    const path = layerGlyph.path;
    return path?.getBounds?.() || path?.getControlBounds?.() || null;
  }

  async getReferenceBoundsForLayer(
    referenceGlyphName,
    referenceGlyphController,
    sourceId,
    layerGlyph,
    fontMetrics,
    glyphName
  ) {
    const overshoot = fontMetrics.xHeight * this.params.overshoot / 100;
    const fallbackBounds = this.getLayerBounds(layerGlyph);

    if (referenceGlyphName) {
      const refInstance =
        sourceId &&
        this.sceneController.sceneModel?.getGlyphInstance &&
        (await this.sceneController.sceneModel.getGlyphInstance(referenceGlyphName, sourceId));
      const refBounds = this.getLayerBounds(refInstance);
      if (refBounds) {
        return {
          minY: refBounds.yMin - overshoot,
          maxY: refBounds.yMax + overshoot,
          referenceGlyph: referenceGlyphName,
        };
      }
    }

    if (referenceGlyphName && referenceGlyphController?.layers) {
      const refLayer =
        referenceGlyphController.layers[sourceId] ||
        Object.values(referenceGlyphController.layers)[0];
      const refBounds = this.getLayerBounds(refLayer?.glyph);
      if (refBounds) {
        return {
          minY: refBounds.yMin - overshoot,
          maxY: refBounds.yMax + overshoot,
          referenceGlyph: referenceGlyphName,
        };
      }
    }

    if (fallbackBounds) {
      return {
        minY: fallbackBounds.yMin - overshoot,
        maxY: fallbackBounds.yMax + overshoot,
        referenceGlyph: glyphName,
      };
    }

    return {
      minY: -overshoot,
      maxY: fontMetrics.xHeight + overshoot,
      referenceGlyph: glyphName,
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
    this.clearVisualizationData();
  }

  async refreshPersistedParams() {
    if (!this.infoForm.contentElement.offsetParent) {
      return;
    }
    await this.update();
  }

  async clearVisualization() {
    if (!this.algorithmEnabled) {
      this.clearVisualizationData();
      return;
    }
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

  async updateCalculatedValues({ warnOnNoRef = false } = {}) {
    // Update current and calculated spacing values
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return;

    const hasBounds = await this.updateCurrentValues();
    if (!hasBounds) return;
    if (!this.algorithmEnabled) return;

    // Calculate new values using letterspacer
    const glyphController = positionedGlyph.glyph;
    const path = glyphController.flattenedPath;
    const bounds = glyphController.bounds;
    if (!bounds) return;

    const fontMetrics = await this.getFontMetrics();
    const glyphName = this.getSelectedGlyphName() || positionedGlyph.glyphName;
    const { referenceGlyph, factor } = this.getReferenceSettings(glyphName);
    const referenceGlyphController = referenceGlyph
      ? await this.fontController.getGlyph(referenceGlyph)
      : null;
    const sourceId = this.getCurrentSourceIdentifier();
    const refBounds = await this.getReferenceBoundsForLayer(
      referenceGlyph,
      referenceGlyphController,
      sourceId,
      positionedGlyph.glyph,
      fontMetrics,
      glyphName
    );
    const engine = new LetterspacerEngine(this.params, fontMetrics);
    const result = engine.computeSpacing(
      path,
      bounds,
      refBounds.minY,
      refBounds.maxY,
      factor
    );

    if (result.noRefIntersections) {
      this.calculatedLSB = null;
      this.calculatedRSB = null;
      if (warnOnNoRef) {
      }
      return;
    }

    if (result.lsb !== null && result.rsb !== null) {
      this.calculatedLSB = Math.round(result.lsb);
      this.calculatedRSB = Math.round(result.rsb);
    }
  }

  async calculateSpacing() {
    if (!this.algorithmEnabled) {
      return;
    }
    if (!(await this.hasCurrentMasterForGlyph())) {
      return;
    }
    // Recalculate spacing after glyph edits
    this.visualizationOpacity = 1;
    await this.updateCalculatedValues({ warnOnNoRef: true });
    this.updateValueDisplay();
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
    if (!this.algorithmEnabled) {
      return null;
    }
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) {
      return null;
    }

    const fontMetrics = await this.getFontMetrics();
    const glyphName = this.getSelectedGlyphName() || positionedGlyph.glyphName;
    const { referenceGlyph, factor } = this.getReferenceSettings(glyphName);
    const referenceGlyphController = referenceGlyph
      ? await this.fontController.getGlyph(referenceGlyph)
      : null;
    const sourceId = this.getCurrentSourceIdentifier();
    const refBounds = await this.getReferenceBoundsForLayer(
      referenceGlyph,
      referenceGlyphController,
      sourceId,
      positionedGlyph.glyph,
      fontMetrics,
      glyphName
    );
    const engine = new LetterspacerEngine(this.params, fontMetrics);

    const glyphController = positionedGlyph.glyph;
    const path = glyphController.flattenedPath;
    const bounds = glyphController.bounds;
    if (!bounds) {
      return null;
    }

    const spacingResult = engine.computeSpacing(
      path,
      bounds,
      refBounds.minY,
      refBounds.maxY,
      factor
    );
    if (spacingResult.noRefIntersections) {
      return null;
    }

    const result = {
      opacity: this.visualizationOpacity ?? 1,
      scanLines: engine.scanLines,
      leftPolygon: engine.leftPolygon,
      rightPolygon: engine.rightPolygon,
      leftSBPolygon: engine.leftSBPolygon,
      rightSBPolygon: engine.rightSBPolygon,
      leftAlgoPolygon: engine.leftAlgoPolygon,
      rightAlgoPolygon: engine.rightAlgoPolygon,
      leftSBLine: engine.leftSBLine,
      rightSBLine: engine.rightSBLine,
      lsb: engine.lsb,
      rsb: engine.rsb,
      leftExtreme: engine.leftExtreme,
      rightExtreme: engine.rightExtreme,
      leftDepthLimit: engine.leftDepthLimit,
      rightDepthLimit: engine.rightDepthLimit,
      leftDepthLimitAlgo: engine.leftDepthLimitAlgo,
      rightDepthLimitAlgo: engine.rightDepthLimitAlgo,
      leftExtremeDepthLimited: engine.leftExtremeDepthLimited,
      rightExtremeDepthLimited: engine.rightExtremeDepthLimited,
      leftMargins: engine.leftMargins,
      rightMargins: engine.rightMargins,
      leftMarginsProcessed: engine.leftMarginsProcessed,
      rightMarginsProcessed: engine.rightMarginsProcessed,
      leftMarginsProcessedAlgo: engine.leftMarginsProcessedAlgo,
      rightMarginsProcessedAlgo: engine.rightMarginsProcessedAlgo,
      params: this.params,
      referenceBounds: { minY: refBounds.minY, maxY: refBounds.maxY },
      italicAngle: fontMetrics.italicAngle || 0,
      xHeight: fontMetrics.xHeight
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

  async getReverseGuardInfo() {
    const sourceId = this.getCurrentSourceIdentifier();
    const activeSourceIds = await this.getCurrentGlyphSourceIdentifiers();
    const effectiveSourceId = this.getEffectiveSourceIdentifier(
      sourceId,
      activeSourceIds
    );
    if (!effectiveSourceId) {
      return { shouldGuard: false, message: "" };
    }
    const values = this.getLetterspacerValuesForSource(effectiveSourceId);
    if (values.area === LETTERSPACER_DEFAULTS.area) {
      return { shouldGuard: false, message: "" };
    }
    const message =
      "Will apply reverse value across the whole source. Press again to continue.";
    return { shouldGuard: true, message };
  }

  showReverseWarningTooltip(anchor, message) {
    if (!anchor || !message) {
      return;
    }
    this.hideReverseWarningTooltip();

    const tooltip = document.createElement("div");
    tooltip.textContent = message;
    Object.assign(tooltip.style, {
      position: "fixed",
      zIndex: "9999",
      maxWidth: "220px",
      padding: "8px 10px",
      borderRadius: "6px",
      fontSize: "0.85rem",
      lineHeight: "1.3",
      color: "var(--tooltip-foreground-color, #fff)",
      background: "var(--tooltip-background-color, #000)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
      pointerEvents: "none",
      whiteSpace: "normal",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
      boxSizing: "border-box",
    });

    document.body.appendChild(tooltip);

    const rect = anchor.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    const margin = 8;
    let left = rect.left - tipRect.width - margin;
    if (left < margin) {
      left = rect.right + margin;
    }
    if (left + tipRect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - tipRect.width - margin);
    }
    let top = rect.top + rect.height / 2 - tipRect.height / 2;
    top = Math.min(
      window.innerHeight - tipRect.height - margin,
      Math.max(margin, top)
    );

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;

    this.reverseWarningTooltip = tooltip;
  }

  hideReverseWarningTooltip() {
    if (this.reverseWarningTooltip) {
      this.reverseWarningTooltip.remove();
      this.reverseWarningTooltip = null;
    }
  }
}

customElements.define("panel-letterspacer", LetterspacerPanel);
