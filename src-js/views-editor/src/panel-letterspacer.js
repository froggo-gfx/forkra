import { PathHitTester } from "@fontra/core/path-hit-tester.js";
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
    this.handleSelectionChangeBound = this.handleSelectionChange.bind(this);

    // Listen for glyph edits to clear visualization
    this.sceneController.addCurrentGlyphChangeListener((event) => {
      this.clearVisualization();
    });

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
  }

  getContentElement() {
    return html.div({ class: "panel" }, []);
  }

  async update(senderInfo) {
    if (!this.infoForm.contentElement.offsetParent) return;
    await this.fontController.ensureInitialized;

    const formContents = [
      { 
        type: "header", 
        label: translate("sidebar.letterspacer.title"),
        auxiliaryElement: html.createDomElement("button", {
          "style": "margin-left: 8px; padding: 2px 8px; font-size: 11px; cursor: pointer;",
          "onclick": () => this.reverseSpacing(),
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
      this.params[fieldItem.key] = value;
      
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
      class: "calculate-button"
    }, ["Calculate"]);
    
    const applyButton = html.button({
      onclick: () => this.applySpacing(),
      class: "apply-button"
    }, ["Apply"]);
    
    buttonContainer.appendChild(calculateButton);
    buttonContainer.appendChild(applyButton);
    
    this.infoForm.contentElement.appendChild(buttonContainer);

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
        
        // Store calculated values
        calculatedLSB = Math.round(lsb);
        calculatedRSB = Math.round(rsb);

        const currentLSB = bounds.xMin;

        if (this.params.applyLSB) {
          const deltaLSB = lsb - currentLSB;
          this.shiftPath(layerGlyph.path, deltaLSB);
        }

        if (this.params.applyRSB || this.params.applyLSB) {
          const newBounds = layerGlyph.path.getBounds?.() || layerGlyph.path.getControlBounds?.();
          if (this.params.applyRSB) {
            layerGlyph.xAdvance = Math.round(newBounds.xMax + rsb);
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
  }

  async reverseSpacing() {
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return;

    const fontMetrics = await this.getFontMetrics();
    const refBounds = await this.getReferenceBounds(fontMetrics);
    const path = positionedGlyph.glyph.path;
    const bounds = path.getBounds?.() || path.getControlBounds?.();
    if (!bounds) return;

    const currentLSB = bounds.xMin;
    const currentRSB = positionedGlyph.glyph.xAdvance - bounds.xMax;

    const hitTester = new PathHitTester(path, bounds);
    const freq = 5;
    const amplitudeY = refBounds.maxY - refBounds.minY;

    const margins = this.collectMarginsForReverse(
      hitTester, path, bounds, refBounds.minY, refBounds.maxY, freq
    );

    if (!margins.leftMargins || !margins.rightMargins) {
      console.warn("Could not collect margins for reverse calculation");
      return;
    }

    let bestParams = { area: 400, depth: 15 };
    let bestError = Infinity;

    for (let area = 100; area <= 1000; area += 50) {
      for (let depth = 5; depth <= 100; depth += 5) {
        const testParams = { ...this.params, depth, area };
        const testEngine = new LetterspacerEngine(testParams, fontMetrics);
        const { lsb, rsb } = testEngine.computeSpacing(path, bounds, refBounds.minY, refBounds.maxY);

        if (lsb === null || rsb === null) continue;

        const error = Math.abs(lsb - currentLSB) + Math.abs(rsb - currentRSB);

        if (error < bestError) {
          bestError = error;
          bestParams = { area, depth };
        }
      }
    }

    if (bestError > 5) {
      for (let area = Math.max(50, bestParams.area - 50); area <= Math.min(2000, bestParams.area + 50); area += 10) {
        for (let depth = Math.max(1, bestParams.depth - 10); depth <= Math.min(150, bestParams.depth + 10); depth += 1) {
          const testParams = { ...this.params, depth, area };
          const testEngine = new LetterspacerEngine(testParams, fontMetrics);
          const { lsb, rsb } = testEngine.computeSpacing(path, bounds, refBounds.minY, refBounds.maxY);

          if (lsb === null || rsb === null) continue;

          const error = Math.abs(lsb - currentLSB) + Math.abs(rsb - currentRSB);

          if (error < bestError) {
            bestError = error;
            bestParams = { area, depth };
          }
        }
      }
    }

    this.params.area = bestParams.area;
    this.params.depth = bestParams.depth;

    const finalEngine = new LetterspacerEngine(this.params, fontMetrics);
    const result = finalEngine.computeSpacing(path, bounds, refBounds.minY, refBounds.maxY);
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
    const newCoords = new Array(path.coordinates.length);
    for (let i = 0; i < path.coordinates.length; i += 2) {
      newCoords[i] = path.coordinates[i] + deltaX;
      newCoords[i + 1] = path.coordinates[i + 1];
    }
    path.coordinates = newCoords;
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

  clearVisualization() {
    // Clear the visualization data when glyph is edited
    if (this.editorController.sceneController?.sceneModel) {
      this.editorController.sceneController.sceneModel.letterspacerVisualizationData = null;
    }
    if (this.editorController.canvasController) {
      this.editorController.canvasController.requestUpdate();
    }
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
    // Recalculate spacing after glyph edits
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
}

customElements.define("panel-letterspacer", LetterspacerPanel);
