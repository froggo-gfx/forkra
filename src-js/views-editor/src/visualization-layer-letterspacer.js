import { registerVisualizationLayerDefinition, glyphSelector } from "./visualization-layer-definitions.js";

export const LetterspacerVisualizationLayer = {
  identifier: "letterspacer-visualization",
  name: "Letterspacer",
  selectionMode: "editing",
  userSwitchable: true,
  defaultOn: true,
  zIndex: 500,
  selectionFunc: glyphSelector("editing"),

  draw: (context, positionedGlyph, parameters, model, controller) => {
    if (!positionedGlyph) return;

    const { path } = positionedGlyph.glyph;
    if (!path || path.coordinates.length === 0) return;

    let vizData = null;
    if (model && model.letterspacerVisualizationData) {
      vizData = model.letterspacerVisualizationData;
    } else {
      return;
    }

    if (!vizData.scanLines || vizData.scanLines.length === 0) return;

    context.save();
    const opacity =
      typeof vizData.opacity === "number"
        ? Math.max(0, Math.min(1, vizData.opacity))
        : 1;
    context.globalAlpha *= opacity;

    const angle = typeof vizData.italicAngle === "number" ? vizData.italicAngle : 0;
    const xHeight = typeof vizData.xHeight === "number" ? vizData.xHeight : 0;
    const useAlgoData =
      Array.isArray(vizData.leftMarginsProcessedAlgo) &&
      Array.isArray(vizData.rightMarginsProcessedAlgo) &&
      Array.isArray(vizData.leftAlgoPolygon) &&
      Array.isArray(vizData.rightAlgoPolygon);
    const applyReslant = useAlgoData && angle !== 0 && xHeight !== 0;
    const tanAngle = applyReslant ? Math.tan((angle * Math.PI) / 180) : 0;
    const mline = xHeight * 0.5;
    const reslantPoint = (point) => {
      if (!applyReslant) return point;
      return { x: point.x + (point.y - mline) * tanAngle, y: point.y };
    };
    const reslantX = (x, y) => {
      if (!applyReslant) return x;
      return x + (y - mline) * tanAngle;
    };

    const leftMarginsProcessed = useAlgoData
      ? vizData.leftMarginsProcessedAlgo
      : vizData.leftMarginsProcessed;
    const rightMarginsProcessed = useAlgoData
      ? vizData.rightMarginsProcessedAlgo
      : vizData.rightMarginsProcessed;
    const leftPolygon = useAlgoData && vizData.leftAlgoPolygon.length
      ? vizData.leftAlgoPolygon
      : vizData.leftSBPolygon;
    const rightPolygon = useAlgoData && vizData.rightAlgoPolygon.length
      ? vizData.rightAlgoPolygon
      : vizData.rightSBPolygon;
    const leftDepthLimit = useAlgoData && vizData.leftDepthLimitAlgo !== null && vizData.leftDepthLimitAlgo !== undefined
      ? vizData.leftDepthLimitAlgo
      : vizData.leftDepthLimit;
    const rightDepthLimit = useAlgoData && vizData.rightDepthLimitAlgo !== null && vizData.rightDepthLimitAlgo !== undefined
      ? vizData.rightDepthLimitAlgo
      : vizData.rightDepthLimit;
    const refMinY = vizData.referenceBounds?.minY ?? 0;
    const refMaxY = vizData.referenceBounds?.maxY ?? 1000;

    // Draw depth-limited margins (where algorithm actually looks)
    if (leftMarginsProcessed && rightMarginsProcessed) {
      context.strokeStyle = "rgba(255, 100, 100, 0.6)";
      context.lineWidth = 1.5;
      context.setLineDash([]);
      context.beginPath();
      // Left margins
      for (const p of leftMarginsProcessed) {
        const pt = reslantPoint(p);
        context.moveTo(pt.x - 4, pt.y);
        context.lineTo(pt.x + 4, pt.y);
      }
      // Right margins
      for (const p of rightMarginsProcessed) {
        const pt = reslantPoint(p);
        context.moveTo(pt.x - 4, pt.y);
        context.lineTo(pt.x + 4, pt.y);
      }
      context.stroke();
    }

    // Draw depth limit lines (showing the depth boundary)
    if (leftDepthLimit !== null && leftDepthLimit !== undefined) {
      context.strokeStyle = "rgba(255, 165, 0, 0.8)"; // Orange for depth limit
      context.lineWidth = 2;
      context.setLineDash([5, 5]);
      context.beginPath();
      context.moveTo(reslantX(leftDepthLimit, refMinY), refMinY);
      context.lineTo(reslantX(leftDepthLimit, refMaxY), refMaxY);
      context.stroke();
    }

    if (rightDepthLimit !== null && rightDepthLimit !== undefined) {
      context.strokeStyle = "rgba(255, 165, 0, 0.8)"; // Orange for depth limit
      context.lineWidth = 2;
      context.setLineDash([5, 5]);
      context.beginPath();
      context.moveTo(reslantX(rightDepthLimit, refMinY), refMinY);
      context.lineTo(reslantX(rightDepthLimit, refMaxY), refMaxY);
      context.stroke();
      context.setLineDash([]);
    }

    // Draw left sidebearing polygon (penetration area)
    if (leftPolygon && leftPolygon.length > 0) {
      context.strokeStyle = "rgba(0, 200, 0, 0.8)";
      context.fillStyle = "rgba(0, 200, 0, 0.15)";
      context.lineWidth = 1;
      context.beginPath();
      const firstPoint = reslantPoint(leftPolygon[0]);
      context.moveTo(firstPoint.x, firstPoint.y);
      for (let i = 1; i < leftPolygon.length; i++) {
        const point = reslantPoint(leftPolygon[i]);
        context.lineTo(point.x, point.y);
      }
      context.closePath();
      context.fill();
      context.stroke();

      // Draw sidebearing line
      if (vizData.leftSBLine !== null && vizData.leftSBLine !== undefined) {
        context.strokeStyle = "rgba(0, 150, 0, 0.9)";
        context.lineWidth = 2;
        context.setLineDash([]);
        context.beginPath();
        context.moveTo(vizData.leftSBLine, refMinY);
        context.lineTo(vizData.leftSBLine, refMaxY);
        context.stroke();
      }
    }

    // Draw right sidebearing polygon (penetration area)
    if (rightPolygon && rightPolygon.length > 0) {
      context.strokeStyle = "rgba(0, 100, 200, 0.8)";
      context.fillStyle = "rgba(0, 100, 200, 0.15)";
      context.lineWidth = 1;
      context.beginPath();
      const firstPoint = reslantPoint(rightPolygon[0]);
      context.moveTo(firstPoint.x, firstPoint.y);
      for (let i = 1; i < rightPolygon.length; i++) {
        const point = reslantPoint(rightPolygon[i]);
        context.lineTo(point.x, point.y);
      }
      context.closePath();
      context.fill();
      context.stroke();

      // Draw sidebearing line
      if (vizData.rightSBLine !== null && vizData.rightSBLine !== undefined) {
        context.strokeStyle = "rgba(0, 50, 150, 0.9)";
        context.lineWidth = 2;
        context.setLineDash([]);
        context.beginPath();
        context.moveTo(vizData.rightSBLine, refMinY);
        context.lineTo(vizData.rightSBLine, refMaxY);
        context.stroke();
      }
    }

    // Draw scan lines (faint)
    if (vizData.scanLines && vizData.scanLines.length > 0) {
      context.strokeStyle = "rgba(255, 0, 0, 0.15)";
      context.lineWidth = 0.5;
      context.setLineDash([2, 4]);
      context.beginPath();
      for (const scanLine of vizData.scanLines) {
        context.moveTo(scanLine.start.x, scanLine.start.y);
        context.lineTo(scanLine.end.x, scanLine.end.y);
      }
      context.stroke();
      context.setLineDash([]);
    }

    context.restore();
  },
};

registerVisualizationLayerDefinition(LetterspacerVisualizationLayer);
