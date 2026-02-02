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
  if (isLeft) {
    const limit = extreme - maxDepth;
    return margins.map(p => ({
      x: Math.max(p.x, limit),
      y: p.y
    }));
  } else {
    const limit = extreme + maxDepth;
    return margins.map(p => ({
      x: Math.min(p.x, limit),
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

    // Calculate depth-limited extremes
    this.leftExtremeDepthLimited = Math.min(...processedLeft.map(p => p.x));
    this.rightExtremeDepthLimited = Math.max(...processedRight.map(p => p.x));

    // Close polygons at the depth-limited extremes
    this.leftPolygon = closePolygon(processedLeft, this.leftExtremeDepthLimited, refMinY, refMaxY);
    this.rightPolygon = closePolygon(processedRight, this.rightExtremeDepthLimited, refMinY, refMaxY);

    this.lsb = calculateSidebearing(this.leftPolygon, targetArea, amplitudeY);
    this.rsb = calculateSidebearing(this.rightPolygon, targetArea, amplitudeY);

    // Calculate sidebearing line positions from depth-limited extremes
    this.leftSBLine = this.leftExtremeDepthLimited - this.lsb;
    this.rightSBLine = this.rightExtremeDepthLimited + this.rsb;

    // For visualization: use depth-limited margins
    this.leftSBPolygon = this.createSBPolygon(processedLeft, this.leftSBLine, refMinY, refMaxY, true);
    this.rightSBPolygon = this.createSBPolygon(processedRight, this.rightSBLine, refMinY, refMaxY, false);

    return { lsb: this.lsb, rsb: this.rsb };
  }

  createSBPolygon(margins, sbLine, minY, maxY, isLeft) {
    const polygon = [];
    
    // Add glyph edge points (margins) - these are the inner boundary
    for (const p of margins) {
      polygon.push({ x: p.x, y: p.y });
    }
    
    // Add sidebearing line points in reverse order (outer boundary)
    for (let i = margins.length - 1; i >= 0; i--) {
      polygon.push({ x: sbLine, y: margins[i].y });
    }
    
    return polygon;
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

    this.params = {
      area: 400,
      depth: 15,
      overshoot: 0,
      applyLSB: 1,
      applyRSB: 1,
      referenceGlyph: "",
    };
  }

  getContentElement() {
    return html.div({ class: "panel" }, []);
  }

  async update(senderInfo) {
    if (!this.infoForm.contentElement.offsetParent) return;
    await this.fontController.ensureInitialized;

    const formContents = [
      { type: "header", label: translate("sidebar.letterspacer.title") },

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

      { type: "spacer" },
    ];

    const applyButton = html.createDomElement("button", {
      onclick: () => this.applySpacing(),
    });
    applyButton.textContent = translate("sidebar.letterspacer.apply");

    formContents[0].auxiliaryElement = applyButton;

    this.infoForm.setFieldDescriptions(formContents);
    this.infoForm.onFieldChange = async (fieldItem, value) => {
      this.params[fieldItem.key] = value;

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
    };

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

  async applySpacing() {
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return;

    const fontMetrics = await this.getFontMetrics();
    const refBounds = await this.getReferenceBounds(fontMetrics);
    const engine = new LetterspacerEngine(this.params, fontMetrics);

    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      const layerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(glyph.layers);

      for (const [layerName, layerGlyph] of Object.entries(layerGlyphs)) {
        const path = layerGlyph.path;
        const bounds = path.getBounds?.() || path.getControlBounds?.();
        if (!bounds) continue;

        const { lsb, rsb } = engine.computeSpacing(
          path, bounds, refBounds.minY, refBounds.maxY
        );

        if (lsb === null || rsb === null) continue;

        const currentLSB = bounds.xMin;

        if (this.params.applyLSB) {
          const deltaLSB = lsb - currentLSB;
          this.shiftPath(layerGlyph.path, deltaLSB);
        }

        if (this.params.applyRSB || this.params.applyLSB) {
          const newBounds = layerGlyph.path.getBounds?.() || layerGlyph.path.getControlBounds?.();
          if (this.params.applyRSB) {
            layerGlyph.xAdvance = newBounds.xMax + rsb;
          } else {
            layerGlyph.xAdvance = newBounds.xMax + (layerGlyph.xAdvance - bounds.xMax);
          }
        }
      }

      return "letterspacer";
    }, undefined, true);

    if (this.editorController.sceneModel) {
      this.editorController.sceneModel.letterspacerVisualizationData = await this.getVisualizationData();
      if (this.editorController.canvasController) {
        this.editorController.canvasController.requestUpdate();
      }
    }
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
