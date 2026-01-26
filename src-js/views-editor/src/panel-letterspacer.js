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

function setDepth(margins, extreme, maxDepth) {
  // Ограничить глубину margins до maxDepth от extreme
  return margins.map(p => ({
    x: Math.max(p.x, extreme - maxDepth),  // для левого
    y: p.y
  }));
}

function diagonize(margins) {
  // Закрыть открытые каунтеры под 45°
  const result = [];
  for (let i = 0; i < margins.length; i++) {
    result.push(margins[i]);
    if (i < margins.length - 1) {
      const curr = margins[i];
      const next = margins[i + 1];
      const deltaY = next.y - curr.y;
      const deltaX = next.x - curr.x;
      if (Math.abs(deltaX) > deltaY) {
        // Нужна диагональ
        const midY = curr.y + Math.abs(deltaX);
        result.push({ x: curr.x, y: midY });
      }
    }
  }
  return result;
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
    this.scanLines = [];  // Store scan lines for visualization
    this.leftPolygon = [];  // Store left polygon for visualization
    this.rightPolygon = [];  // Store right polygon for visualization
  }

  computeSpacing(path, bounds, refMinY, refMaxY) {
    const freq = 5;  // шаг сканирования
    const amplitudeY = refMaxY - refMinY;

    // Clear previous visualization data
    this.scanLines = [];
    this.leftPolygon = [];
    this.rightPolygon = [];

    // Целевая белая площадь
    const areaUPM = this.params.area * Math.pow(this.upm / 1000, 2);
    const targetArea = (amplitudeY * areaUPM * 100) / this.xHeight;

    // Максимальная глубина
    const maxDepth = this.xHeight * this.params.depth / 100;

    // Собрать margins
    const { leftMargins, rightMargins, leftExtreme, rightExtreme } =
      this.collectMargins(path, bounds, refMinY, refMaxY, freq);

    if (leftMargins.length < 2 || rightMargins.length < 2) {
      return { lsb: null, rsb: null };
    }

    // Обработка margins
    let processedLeft = setDepth(leftMargins, leftExtreme, maxDepth);
    let processedRight = setDepth(rightMargins, rightExtreme, -maxDepth);

    processedLeft = diagonize(processedLeft);
    processedRight = diagonize(processedRight);

    // Замкнуть полигоны
    this.leftPolygon = closePolygon(processedLeft, leftExtreme, refMinY, refMaxY);
    this.rightPolygon = closePolygon(processedRight, rightExtreme, refMinY, refMaxY);

    // Вычислить sidebearings
    const lsb = calculateSidebearing(this.leftPolygon, targetArea, amplitudeY);
    const rsb = calculateSidebearing(this.rightPolygon, targetArea, amplitudeY);

    return { lsb, rsb };
  }

  collectMargins(path, bounds, minY, maxY, freq) {
    const hitTester = new PathHitTester(path, bounds);
    const leftMargins = [];
    const rightMargins = [];
    let leftExtreme = bounds.xMin;
    let rightExtreme = bounds.xMax;

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
        intersections: [...intersections], // Copy the intersections
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
      applyLSB: 1,  // 1 for true, 0 for false
      applyRSB: 1,  // 1 for true, 0 for false
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
        value: this.params.applyLSB ? 1 : 0,  // Convert boolean to number for display
        minValue: 0,
        maxValue: 1,
        integer: true },

      { type: "edit-number", key: "applyRSB",
        label: translate("sidebar.letterspacer.apply-rsb"),
        value: this.params.applyRSB ? 1 : 0,  // Convert boolean to number for display
        minValue: 0,
        maxValue: 1,
        integer: true },

      { type: "divider" },

      { type: "edit-text", key: "referenceGlyph",
        label: translate("sidebar.letterspacer.reference"),
        value: this.params.referenceGlyph },

      { type: "spacer" },
    ];

    // Apply button
    const applyButton = html.createDomElement("button", {
      onclick: () => this.applySpacing(),
    });
    applyButton.textContent = translate("sidebar.letterspacer.apply");

    // Add the apply button to the header
    formContents[0].auxiliaryElement = applyButton;

    this.infoForm.setFieldDescriptions(formContents);
    this.infoForm.onFieldChange = async (fieldItem, value) => {
      this.params[fieldItem.key] = value;

      // Update visualization data when parameters change
      if (this.editorController.sceneController && this.editorController.sceneController.sceneModel) {
        this.editorController.sceneController.sceneModel.letterspacerVisualizationData = await this.getVisualizationData();
        // Request update through the editor's canvas controller
        if (this.editorController.canvasController) {
          this.editorController.canvasController.requestUpdate();
        }
      } else if (this.editorController.sceneModel) {
        // Fallback to editor controller's scene model
        this.editorController.sceneModel.letterspacerVisualizationData = await this.getVisualizationData();
        // Request update through the editor's canvas controller
        if (this.editorController.canvasController) {
          this.editorController.canvasController.requestUpdate();
        }
      }
    };

    // Also update visualization data when the panel is updated
    if (this.editorController.sceneController && this.editorController.sceneController.sceneModel) {
      this.editorController.sceneController.sceneModel.letterspacerVisualizationData = await this.getVisualizationData();
      // Request update through the editor's canvas controller
      if (this.editorController.canvasController) {
        this.editorController.canvasController.requestUpdate();
      }
    } else if (this.editorController.sceneModel) {
      // Fallback to editor controller's scene model
      this.editorController.sceneModel.letterspacerVisualizationData = await this.getVisualizationData();
      // Request update through the editor's canvas controller
      if (this.editorController.canvasController) {
        this.editorController.canvasController.requestUpdate();
      }
    }
  }

  async applySpacing() {
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return;

    // Font metrics
    const fontMetrics = await this.getFontMetrics();

    // Reference bounds
    const refBounds = await this.getReferenceBounds(fontMetrics);

    // Engine
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
        const glyphWidth = bounds.xMax - bounds.xMin;

        if (this.params.applyLSB) {
          const deltaLSB = lsb - currentLSB;
          // Сдвинуть path
          this.shiftPath(layerGlyph.path, deltaLSB);
        }

        if (this.params.applyRSB || this.params.applyLSB) {
          // Пересчитать xAdvance
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

    // Update visualization data after applying changes
    if (this.editorController.sceneModel) {
      this.editorController.sceneModel.letterspacerVisualizationData = await this.getVisualizationData();
      // Request update through the editor's canvas controller
      if (this.editorController.canvasController) {
        this.editorController.canvasController.requestUpdate();
      }
    }
  }

  shiftPath(path, deltaX) {
    // Create a new coordinate array with shifted values
    const newCoords = new Array(path.coordinates.length);
    for (let i = 0; i < path.coordinates.length; i += 2) {
      newCoords[i] = path.coordinates[i] + deltaX;   // x coordinate
      newCoords[i + 1] = path.coordinates[i + 1];   // y coordinate remains unchanged
    }
    
    // Update the path coordinates properly
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
    // Если указан reference glyph — использовать его bounds
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

    // Fallback: использовать xHeight
    const overshoot = fontMetrics.xHeight * this.params.overshoot / 100;
    return {
      minY: -overshoot,
      maxY: fontMetrics.xHeight + overshoot
    };
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
      // Add a listener to update visualization when selection changes
      this.sceneController.addEventListener("selectionChanged", this.handleSelectionChangeBound);
    } else {
      // Remove the listener when panel is turned off
      this.sceneController.removeEventListener("selectionChanged", this.handleSelectionChangeBound);
    }
  }

  // Handle selection changes to update visualization data
  async handleSelectionChange() {
    if (this.editorController.sceneController && this.editorController.sceneController.sceneModel) {
      this.editorController.sceneController.sceneModel.letterspacerVisualizationData = await this.getVisualizationData();
      // Request update through the editor's canvas controller
      if (this.editorController.canvasController) {
        this.editorController.canvasController.requestUpdate();
      }
    } else if (this.editorController.sceneModel) {
      // Fallback to editor controller's scene model
      this.editorController.sceneModel.letterspacerVisualizationData = await this.getVisualizationData();
      // Request update through the editor's canvas controller
      if (this.editorController.canvasController) {
        this.editorController.canvasController.requestUpdate();
      }
    }
  }

  // Methods for visualization layer
  getEngine() {
    return this.engine;
  }

  async getVisualizationData() {
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) {
      console.log("No positioned glyph selected for visualization data");
      return null;
    }

    console.log("Generating visualization data for glyph:", positionedGlyph.glyphName);

    // Font metrics
    const fontMetrics = await this.getFontMetrics();

    // Reference bounds
    const refBounds = await this.getReferenceBounds(fontMetrics);

    // Create temporary engine to compute visualization data
    const engine = new LetterspacerEngine(this.params, fontMetrics);

    const path = positionedGlyph.glyph.path;
    const bounds = path.getBounds?.() || path.getControlBounds?.();
    if (!bounds) {
      console.log("No bounds found for glyph path");
      return null;
    }

    console.log("Computing spacing with bounds:", bounds);

    // Compute spacing to populate the visualization data
    engine.computeSpacing(path, bounds, refBounds.minY, refBounds.maxY);

    const result = {
      scanLines: engine.scanLines,
      leftPolygon: engine.leftPolygon,
      rightPolygon: engine.rightPolygon,
      params: this.params
    };

    console.log("Generated visualization data with", result.scanLines?.length, "scan lines");

    return result;
  }
}

customElements.define("panel-letterspacer", LetterspacerPanel);