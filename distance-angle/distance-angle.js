// Distance and Angle plugin for Fontra
// Ported from Glyphs plugin "Show Distance And Angle"

const COLOR = "rgba(0, 153, 255, 0.75)"; // Similar to Glyphs plugin color
const BADGE_COLOR = "rgba(0, 153, 255, 0.75)";
const TEXT_COLOR = "white";
const BADGE_PADDING = 4;
const BADGE_RADIUS = 5;
const FONT_SIZE = 12;

// Calculate unit vector from point B to point A
export function unitVectorFromTo(pointB, pointA) {
  let dx = pointA.x - pointB.x;
  let dy = pointA.y - pointB.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  
  return { x: dx / length, y: dy / length };
}


// Calculate distance and angle between two points
export function calculateDistanceAndAngle(point1, point2) {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  
  // Calculate distance
  const distance = Math.hypot(dx, dy);
  
  // New algorithm: Identify bottom point and calculate angle from horizontal baseline
  // Determine which point is lower (has smaller y-coordinate)
  const bottomPoint = point1.y <= point2.y ? point1 : point2;
  const topPoint = point1.y <= point2.y ? point2 : point1;
  
  // Calculate dx and dy relative to the bottom point as origin
  const relDx = topPoint.x - bottomPoint.x;
  const relDy = topPoint.y - bottomPoint.y;
  
  // Calculate angle from horizontal baseline through bottom point
  let rads = Math.atan2(relDy, relDx);
  let degs = rads * (180 / Math.PI);
  
  // Ensure angle is always between 0 and 90 degrees
  degs = Math.abs(degs);
  if (degs > 90) {
    degs = 180 - degs;
  }
  
  return {
    distance: distance,
    angle: degs
  };
}

// Calculate the dimensions needed for the info badge
export function calculateBadgeDimensions(text, fontSize = FONT_SIZE) {
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
  
  const width = maxWidth + BADGE_PADDING * 2;
  const height = lines.length * fontSize + BADGE_PADDING * 2;
  
  return {
    width: width,
    height: height,
    radius: BADGE_RADIUS
  };
}

// Calculate the position for the info badge
export function calculateBadgePosition(midPoint, unitVector, badgeWidth, badgeHeight) {
  // Position the badge's center at the midpoint of the line
  // No offset is applied - the badge will be centered on the line
  
  // Return the top-left corner position for drawing
  return {
    x: midPoint.x - badgeWidth / 2,
    y: midPoint.y - badgeHeight / 2
  };
}

// Format distance and angle values for display
export function formatDistanceAndAngle(distance, angle) {
  return `${distance.toFixed(1)}\n${angle.toFixed(1)}°`;
}