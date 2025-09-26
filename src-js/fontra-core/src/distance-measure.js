// X/Y Distance measurement plugin for Fontra

// Color constants for X/Y distance visualization
export const XY_DISTANCE_COLOR = "rgba(255, 0, 0, 0.75)"; // Red color for visibility
export const XY_DISTANCE_BADGE_COLOR = "rgba(255, 0, 0, 0.9)"; // Red badge color
export const XY_DISTANCE_TEXT_COLOR = "white";
export const XY_DISTANCE_BADGE_PADDING = 4;
export const XY_DISTANCE_BADGE_RADIUS = 5;
export const XY_DISTANCE_FONT_SIZE = 10;

/**
 * Calculates the horizontal and vertical distances between two points
 * @param {Object} point1 - First point object with x and y properties
 * @param {Object} point2 - Second point object with x and y properties
 * @property {number} point1.x - X coordinate of the first point
 * @property {number} point1.y - Y coordinate of the first point
 * @property {number} point2.x - X coordinate of the second point
 * @property {number} point2.y - Y coordinate of the second point
 * @returns {Object} Object with xDistance and yDistance properties
 * @property {number} xDistance - Horizontal distance (point2.x - point1.x)
 * @property {number} yDistance - Vertical distance (point2.y - point1.y)
 */
export function calculateXYDistances(point1, point2, controller) {
   // Calculate the horizontal and vertical distances between two points
   // Logging is handled by the visualization layer function

   const xDistance = point2.x - point1.x;
   const yDistance = point2.y - point1.y;

   return {
     xDistance: xDistance,
     yDistance: yDistance
   };
}

/**
 * Calculate the dimensions needed for the distance badge
 * @param {string} text - Text to display in the badge
 * @param {number} fontSize - Font size for the text
 * @returns {Object} Object with width, height, and radius properties
 * @property {number} width - Width of the badge
 * @property {number} height - Height of the badge
 * @property {number} radius - Radius of the badge corners
 */
export function calculateBadgeDimensions(text, fontSize) {
  // Create a temporary canvas to measure text
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = `${fontSize}px sans-serif`;
  
  const lines = text.split("\n");
  let maxWidth = 0;
  
  for (const line of lines) {
    const metrics = context.measureText(line);
    maxWidth = Math.max(maxWidth, metrics.width);
  }
  
  const width = maxWidth + XY_DISTANCE_BADGE_PADDING * 2;
  const height = lines.length * fontSize + XY_DISTANCE_BADGE_PADDING * 2;
  
  return {
    width: width,
    height: height,
    radius: XY_DISTANCE_BADGE_RADIUS
  };
}

/**
 * Calculate the position for the distance badge
 * @param {Object} midPoint - Midpoint where badge should be positioned
 * @param {Object} unitVector - Unit vector for offset direction
 * @param {number} badgeWidth - Width of the badge
 * @param {number} badgeHeight - Height of the badge
 * @returns {Object} Object with x and y properties for badge position
 * @property {number} x - X coordinate of the badge position
 * @property {number} y - Y coordinate of the badge position
 */
export function calculateBadgePosition(midPoint, unitVector, badgeWidth, badgeHeight) {
  // Position the badge's center at the midpoint of the line
  // No offset is applied - the badge will be centered on the line
  
  // Return the top-left corner position for drawing
  return {
    x: midPoint.x - badgeWidth / 2,
    y: midPoint.y - badgeHeight / 2
  };
}

/**
 * Format X and Y distance values for display
 * @param {number} xDistance - Horizontal distance
 * @param {number} yDistance - Vertical distance
 * @returns {string} Formatted string with X and Y distances
 */
export function formatXYDistances(xDistance, yDistance) {
  return `X: ${xDistance.toFixed(1)}\nY: ${yDistance.toFixed(1)}`;
}

/**
 * Draws a line between two points
 * @param {CanvasRenderingContext2D} context - Canvas context for drawing
 * @param {Object} point1 - First point object with x and y properties
 * @param {Object} point2 - Second point object with x and y properties
 * @param {number} strokeWidth - Width of the line
 * @param {string} color - Color of the line
 */
export function drawLine(context, point1, point2, strokeWidth, color) {
  context.strokeStyle = color;
  context.lineWidth = strokeWidth;
  context.beginPath();
  context.moveTo(point1.x, point1.y);
  context.lineTo(point2.x, point2.y);
  context.stroke();
}

/**
 * Draws a rounded rectangle badge
 * @param {CanvasRenderingContext2D} context - Canvas context for drawing
 * @param {number} x - X coordinate of the top-left corner
 * @param {number} y - Y coordinate of the top-left corner
 * @param {number} width - Width of the badge
 * @param {number} height - Height of the badge
 * @param {number} radius - Radius of the corners
 * @param {string} color - Fill color of the badge
 */
export function drawBadge(context, x, y, width, height, radius, color) {
  context.fillStyle = color;
  
  // Draw rounded rectangle
 context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
  context.fill();
}

/**
 * Draws text at specified position
 * @param {CanvasRenderingContext2D} context - Canvas context for drawing
 * @param {string} text - Text to draw
 * @param {number} x - X coordinate for text center
 * @param {number} y - Y coordinate for text center
 * @param {string} color - Color of the text
 * @param {number} fontSize - Font size for the text
 */
export function drawText(context, text, x, y, color, fontSize) {
  context.save();
  context.fillStyle = color;
  context.font = `${fontSize}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  
  // Apply coordinate system transformation (Y-axis inversion)
 context.scale(1, -1);
  
  const lines = text.split("\n");
  const lineHeight = fontSize;
  const totalHeight = lines.length * lineHeight;
  
  // Draw each line centered, accounting for Y-axis inversion
  for (let i = 0; i < lines.length; i++) {
    const lineY = -y - totalHeight / 2 + (i + 0.5) * lineHeight;
    context.fillText(lines[i], x, lineY);
  }
  
  context.restore();
}

/**
 * Draws lines and labels showing the X and Y distances between selected and hovered points
 * @param {CanvasRenderingContext2D} context - Canvas context for drawing
 * @param {Object} positionedGlyph - The positioned glyph object
 * @param {Object} parameters - Visualization parameters (colors, stroke width, etc.)
 * @param {Object} model - The scene model
 * @param {Object} controller - The scene controller
 */
export function drawXYDistanceVisualization(context, positionedGlyph, parameters, model, controller) {
  // Check if Alt key is pressed by checking controller state
  // The scene controller should have the altKeyPressed property
  // The controller parameter is typically the scene controller itself
  const isAltPressed = controller?.altKeyPressed;

  if (!isAltPressed) {
    return;
  }

  // Check if we have a selected point and a hovered point
  const { point: selectedPointIndices } = parseSelection(controller?.sceneModel?.selection);
  const { point: hoveredPointIndices } = parseSelection(controller?.sceneModel?.hoverSelection);

  // We need exactly one selected point and one hovered point to show X/Y distances
  if (!selectedPointIndices || selectedPointIndices.length !== 1) {
    return;
  }

 if (!hoveredPointIndices || hoveredPointIndices.length !== 1) {
    return;
  }

  // Get the actual points from the path
  const path = positionedGlyph?.glyph?.path;
  if (!path) {
    return;
  }

  const selectedPoint = path.getPoint(selectedPointIndices[0]);
  const hoveredPoint = path.getPoint(hoveredPointIndices[0]);

  if (!selectedPoint || !hoveredPoint) {
    return;
  }

  // Calculate X and Y distances
  const { xDistance, yDistance } = calculateXYDistances(selectedPoint, hoveredPoint, controller);

  // LOG THE DISTANCE CALCULATION HERE
  console.log(`Distance calculation: X=${xDistance.toFixed(1)}, Y=${yDistance.toFixed(1)}`);

  // Draw horizontal distance line (X distance)
  // This is a line from (selectedPoint.x, hoveredPoint.y) to (hoveredPoint.x, hoveredPoint.y)
  const horizontalStart = { x: selectedPoint.x, y: hoveredPoint.y };
  const horizontalEnd = { x: hoveredPoint.x, y: hoveredPoint.y };

  drawLine(
    context,
    horizontalStart,
    horizontalEnd,
    parameters.strokeWidth,
    parameters.strokeColor
  );

  // Draw vertical distance line (Y distance)
  // This is a line from (selectedPoint.x, selectedPoint.y) to (hoveredPoint.x, selectedPoint.y)
  const verticalStart = { x: selectedPoint.x, y: selectedPoint.y };
  const verticalEnd = { x: hoveredPoint.x, y: selectedPoint.y };

  drawLine(
    context,
    verticalStart,
    verticalEnd,
    parameters.strokeWidth,
    parameters.strokeColor
  );

  // Format text for display
 const text = formatXYDistances(xDistance, yDistance);

  // Calculate badge dimensions
  const badgeDimensions = calculateBadgeDimensions(text, parameters.fontSize);

  // Position badge at the midpoint between the selected and hovered points
  const midPoint = {
    x: (selectedPoint.x + hoveredPoint.x) / 2,
    y: (selectedPoint.y + hoveredPoint.y) / 2
  };

  // Calculate badge position
  const badgePosition = calculateBadgePosition(
    midPoint,
    { x: 0, y: 0 }, // No offset needed
    badgeDimensions.width,
    badgeDimensions.height
 );

  // Draw badge
  drawBadge(
    context,
    badgePosition.x,
    badgePosition.y,
    badgeDimensions.width,
    badgeDimensions.height,
    XY_DISTANCE_BADGE_RADIUS,
    parameters.badgeColor
  );

  // Draw text
  drawText(
    context,
    text,
    badgePosition.x + badgeDimensions.width / 2,
    badgePosition.y + badgeDimensions.height / 2,
    parameters.textColor,
    XY_DISTANCE_FONT_SIZE
  );
}

/**
 * Helper function to draw a line between two points
 * @param {CanvasRenderingContext2D} context - Canvas context for drawing
 * @param {number} x1 - X coordinate of the first point
 * @param {number} y1 - Y coordinate of the first point
 * @param {number} x2 - X coordinate of the second point
 * @param {number} y2 - Y coordinate of the second point
 */
export function strokeLine(context, x1, y1, x2, y2) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

/**
 * Helper function to parse selection
 * @param {Set} selection - The selection set
 * @returns {Object} Parsed selection object
 */
function parseSelection(selection) {
  const result = {};
  for (const item of selection || []) {
    const [type, index] = item.split("/");
    if (type) {
      if (!result[type]) {
        result[type] = [];
      }
      result[type].push(parseInt(index) || index);
    }
  }
  return result;
}