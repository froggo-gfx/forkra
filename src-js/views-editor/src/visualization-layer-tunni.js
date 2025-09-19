import { calculateTunniPoint } from "@fontra/core/tunni-calculations.js";
import { distance } from "@fontra/core/vector.js";
import { registerVisualizationLayerDefinition, glyphSelector } from "./visualization-layer-definitions.js";

export function registerTunniVisualizationLayer() {
  registerVisualizationLayerDefinition({
    identifier: "fontra.tunni.lines",
    name: "Tunni Lines",
    selectionFunc: glyphSelector("editing"),
    userSwitchable: true,
    defaultOn: false,
    zIndex: 550,
    screenParameters: {
      strokeWidth: 1,
      dashPattern: [5, 5],
      tunniPointSize: 4
    },
    colors: { 
      tunniLineColor: "#0000FF80",
      tunniPointColor: "#0000FF"
    },
    colorsDarkMode: { 
      tunniLineColor: "#00FFFF80",
      tunniPointColor: "#00FFFF"
    },
    draw: drawTunniLines
  });
}

function drawTunniLines(context, positionedGlyph, parameters, model, controller) {
  const path = positionedGlyph.glyph.path;
  
  // Check if there's an active Tunni point
  const isActive = model?.sceneController?.tunniEditingTool?.isActive || false;
  
  // Set colors based on active state
  const tunniLineColor = isActive ?
    (parameters.tunniLineColor + "80") : // Lighter outline when active (more transparent)
    parameters.tunniLineColor;
    
  const tunniPointColor = isActive ?
    "#FF0000" : // Red color when active
    parameters.tunniPointColor;
  
  context.strokeStyle = tunniLineColor;
  context.lineWidth = parameters.strokeWidth;
  context.setLineDash(parameters.dashPattern);
  context.fillStyle = tunniPointColor;
  
  // Iterate through all contours
  for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
    // Iterate through all segments in the contour
    for (const segment of path.iterContourDecomposedSegments(contourIndex)) {
      if (segment.points.length === 4) {
        // Check if it's a cubic segment
        const pointTypes = segment.parentPointIndices.map(
          index => path.pointTypes[index]
        );
        
        // Both control points must be cubic
        if (pointTypes[1] === 2 && pointTypes[2] === 2) {
          const tunniPoint = calculateTunniPoint(segment.points);
          if (tunniPoint) {
            // Draw lines from start to first control and from second control to end
            const [p1, p2, p3, p4] = segment.points;
            
            // Draw first line
            context.beginPath();
            context.moveTo(p1.x, p1.y);
            context.lineTo(p2.x, p2.y);
            context.stroke();
            
            // Draw second line
            context.beginPath();
            context.moveTo(p4.x, p4.y);
            context.lineTo(p3.x, p3.y);
            context.stroke();
            
            // Draw Tunni point
            context.beginPath();
            context.arc(tunniPoint.x, tunniPoint.y, parameters.tunniPointSize, 0, 2 * Math.PI);
            context.fill();
            
            // Draw line between control points
            context.beginPath();
            context.moveTo(p2.x, p2.y);
            context.lineTo(p3.x, p3.y);
            context.stroke();
          }
        }
      }
    }
  }
  
  context.setLineDash([]);
}