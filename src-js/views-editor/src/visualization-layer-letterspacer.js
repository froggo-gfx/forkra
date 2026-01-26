import { registerVisualizationLayerDefinition, glyphSelector } from "./visualization-layer-definitions.js";

export const LetterspacerVisualizationLayer = {
  identifier: "letterspacer-visualization",
  name: "Letterspacer Polygons",
  selectionMode: "editing",
  userSwitchable: true,
  defaultOn: false, // Default to off so it doesn't interfere with normal editing
  zIndex: 500, // High enough to be visible over most other layers
  selectionFunc: glyphSelector("editing"),
  
  draw: (context, positionedGlyph, parameters, model, controller) => {
    if (!positionedGlyph) return;

    const { path } = positionedGlyph.glyph;
    if (!path || path.coordinates.length === 0) return;

    // Debug: Draw a simple indicator to see if the layer is being called
    context.fillStyle = "rgba(255, 0, 255, 0.5)"; // Magenta rectangle as debug indicator
    context.fillRect(positionedGlyph.bounds.xMin, positionedGlyph.bounds.yMin, 20, 20);

    // Debug: Log what parameters are available
    console.log("Visualization layer: model type:", typeof model);
    console.log("Visualization layer: model keys:", Object.keys(model || {}));
    console.log("Visualization layer: model has letterspacerVisualizationData?", 'letterspacerVisualizationData' in (model || {}));

    // The 'model' parameter in the visualization context might be the scene model
    // Let's try accessing the data from the 'model' parameter
    let vizData = null;
    if (model && model.letterspacerVisualizationData) {
      vizData = model.letterspacerVisualizationData;
      console.log("Visualization layer: Found visualization data in model with", vizData.scanLines?.length, "scan lines");
    } else {
      console.log("Visualization layer: No visualization data found in model");
      return;
    }

    // Draw scan lines
    context.strokeStyle = "rgba(255, 0, 0, 0.5)"; // More opaque red
    context.lineWidth = 1;
    context.setLineDash([5, 3]); // More visible dashed lines for scan lines
    context.beginPath();

    for (const scanLine of vizData.scanLines) {
      context.moveTo(scanLine.start.x, scanLine.start.y);
      context.lineTo(scanLine.end.x, scanLine.end.y);
    }

    context.stroke();
    context.setLineDash([]); // Reset line dash

    // Draw left polygon
    context.strokeStyle = "rgba(0, 255, 0, 0.8)"; // Green for left polygon
    context.fillStyle = "rgba(0, 255, 0, 0.2)"; // More opaque green fill
    context.lineWidth = 2;
    context.beginPath();

    if (vizData.leftPolygon && vizData.leftPolygon.length > 0) {
      const firstPoint = vizData.leftPolygon[0];
      context.moveTo(firstPoint.x, firstPoint.y);

      for (let i = 1; i < vizData.leftPolygon.length; i++) {
        context.lineTo(vizData.leftPolygon[i].x, vizData.leftPolygon[i].y);
      }

      context.closePath();
      context.fill();
      context.stroke();
    }

    // Draw right polygon
    context.strokeStyle = "rgba(0, 0, 255, 0.8)"; // Blue for right polygon
    context.fillStyle = "rgba(0, 0, 255, 0.2)"; // More opaque blue fill
    context.beginPath();

    if (vizData.rightPolygon && vizData.rightPolygon.length > 0) {
      const firstPoint = vizData.rightPolygon[0];
      context.moveTo(firstPoint.x, firstPoint.y);

      for (let i = 1; i < vizData.rightPolygon.length; i++) {
        context.lineTo(vizData.rightPolygon[i].x, vizData.rightPolygon[i].y);
      }

      context.closePath();
      context.fill();
      context.stroke();
    }
  },
};

// Register the visualization layer
registerVisualizationLayerDefinition(LetterspacerVisualizationLayer);