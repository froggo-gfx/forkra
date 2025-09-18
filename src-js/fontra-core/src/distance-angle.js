// Distance and Angle plugin for Fontra
// Ported from Glyphs plugin "Show Distance And Angle"

// Color constants for distance-angle visualization
export const DISTANCE_ANGLE_COLOR = "rgba(0, 153, 255, 0.75)"; // Similar to Glyphs plugin color
export const DISTANCE_ANGLE_BADGE_COLOR = "rgba(0, 153, 255, 0.75)"; // Blue color
export const DISTANCE_ANGLE_TEXT_COLOR = "white";
export const DISTANCE_ANGLE_BADGE_PADDING = 2;
export const DISTANCE_ANGLE_BADGE_RADIUS = 3;
export const DISTANCE_ANGLE_FONT_SIZE = 10;

// Color constants for off-curve distance visualization
export const OFFCURVE_DISTANCE_COLOR = "rgba(0, 200, 0, 0.75)"; // Green color
export const OFFCURVE_DISTANCE_BADGE_COLOR = "rgba(0, 200, 0, 0.75)";
export const OFFCURVE_DISTANCE_TEXT_COLOR = "white";
export const OFFCURVE_DISTANCE_BADGE_PADDING = 2;
export const OFFCURVE_DISTANCE_BADGE_RADIUS = 3;
export const OFFCURVE_DISTANCE_FONT_SIZE = 10;

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

// Calculate Manhattan distance between two points
export function calculateManhattanDistance(point1, point2) {
  const dx = Math.abs(point2.x - point1.x);
  const dy = Math.abs(point2.y - point1.y);
  return dx + dy;
}

// Calculate the dimensions needed for the info badge
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
  
  const width = maxWidth + DISTANCE_ANGLE_BADGE_PADDING * 2;
  const height = lines.length * fontSize + DISTANCE_ANGLE_BADGE_PADDING * 2;
  
  return {
    width: width,
    height: height,
    radius: DISTANCE_ANGLE_BADGE_RADIUS
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

// Format Manhattan distance for display
export function formatManhattanDistance(distance) {
  return `${distance.toFixed(1)}`;
}

// Check if a point is an on-curve point with specific configurations
export function checkPointConfiguration(path, pointIndex) {
  // Get the point
  const point = path.getPoint(pointIndex);
  if (!point) {
    return null;
  }

  // Check if it's an on-curve point
  const pointType = path.pointTypes[pointIndex] & 0x07; // VarPackedPath.POINT_TYPE_MASK
  if (pointType !== 0) { // VarPackedPath.ON_CURVE
    return null;
  }

  // Get contour information
  const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(pointIndex);
  const contourInfo = path.contourInfo[contourIndex];
  const startPoint = contourIndex === 0 ? 0 : path.contourInfo[contourIndex - 1].endPoint + 1;
  const endPoint = contourInfo.endPoint;
  const numPoints = endPoint - startPoint + 1;

  // Get neighboring points
  let prevPointIndex, nextPointIndex;
  if (contourInfo.isClosed) {
    prevPointIndex = startPoint + ((contourPointIndex - 1 + numPoints) % numPoints);
    nextPointIndex = startPoint + ((contourPointIndex + 1) % numPoints);
  } else {
    prevPointIndex = contourPointIndex > 0 ? pointIndex - 1 : null;
    nextPointIndex = contourPointIndex < numPoints - 1 ? pointIndex + 1 : null;
  }

  const prevPoint = prevPointIndex !== null ? path.getPoint(prevPointIndex) : null;
  const nextPoint = nextPointIndex !== null ? path.getPoint(nextPointIndex) : null;

  const prevPointType = prevPointIndex !== null ? path.pointTypes[prevPointIndex] & 0x07 : null;
  const nextPointType = nextPointIndex !== null ? path.pointTypes[nextPointIndex] & 0x07 : null;

  // Check for smooth point with two off-curve points
  if ((path.pointTypes[pointIndex] & 0x08) !== 0) { // VarPackedPath.SMOOTH_FLAG
    // Smooth point - check if both neighbors are off-curve points
    if (prevPoint && nextPoint &&
        prevPointType !== 0 && nextPointType !== 0) { // Both are off-curve
      return {
        type: "smooth",
        point: point,
        offCurvePoints: [prevPoint, nextPoint]
      };
    }
  }

  // Check for any type of point with only one off-curve point
  const offCurvePoints = [];
  if (prevPoint && prevPointType !== 0) { // Prev is off-curve
    offCurvePoints.push(prevPoint);
  }
  if (nextPoint && nextPointType !== 0) { // Next is off-curve
    offCurvePoints.push(nextPoint);
  }

  if (offCurvePoints.length === 1) {
    return {
      type: "single",
      point: point,
      offCurvePoints: offCurvePoints
    };
  }

  // Check for two off-curve points (corner point with two handles)
  if (offCurvePoints.length === 2) {
    return {
      type: "corner",
      point: point,
      offCurvePoints: offCurvePoints
    };
  }

  return null;
}

// Calculate distances from the selected on-curve point to its associated off-curve points
export function calculateDistancesToOffCurvePoints(onCurvePoint, offCurvePoints) {
  return offCurvePoints.map(offCurvePoint => {
    const dx = offCurvePoint.x - onCurvePoint.x;
    const dy = offCurvePoint.y - onCurvePoint.y;
    const distance = Math.hypot(dx, dy);
    return {
      point: offCurvePoint,
      distance: distance
    };
  });
}

// Check if an off-curve point is associated with an eligible on-curve point
export function checkOffCurvePointConfiguration(path, pointIndex) {
  // Get the point
  const point = path.getPoint(pointIndex);
  if (!point) {
    return null;
  }

  // Check if it's an off-curve point
  const pointType = path.pointTypes[pointIndex] & 0x07; // VarPackedPath.POINT_TYPE_MASK
  if (pointType === 0) { // VarPackedPath.ON_CURVE
    return null;
  }

  // Get contour information
  const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(pointIndex);
  const contourInfo = path.contourInfo[contourIndex];
  const startPoint = contourIndex === 0 ? 0 : path.contourInfo[contourIndex - 1].endPoint + 1;
  const endPoint = contourInfo.endPoint;
  const numPoints = endPoint - startPoint + 1;

  // Get neighboring points
  let prevPointIndex, nextPointIndex;
  if (contourInfo.isClosed) {
    prevPointIndex = startPoint + ((contourPointIndex - 1 + numPoints) % numPoints);
    nextPointIndex = startPoint + ((contourPointIndex + 1) % numPoints);
  } else {
    prevPointIndex = contourPointIndex > 0 ? pointIndex - 1 : null;
    nextPointIndex = contourPointIndex < numPoints - 1 ? pointIndex + 1 : null;
  }

  const prevPoint = prevPointIndex !== null ? path.getPoint(prevPointIndex) : null;
  const nextPoint = nextPointIndex !== null ? path.getPoint(nextPointIndex) : null;

  const prevPointType = prevPointIndex !== null ? path.pointTypes[prevPointIndex] & 0x07 : null;
  const nextPointType = nextPointIndex !== null ? path.pointTypes[nextPointIndex] & 0x07 : null;

  // Check if either neighbor is an on-curve point that is eligible
  let onCurvePoint = null;
  if (prevPoint && prevPointType === 0) { // VarPackedPath.ON_CURVE
    onCurvePoint = prevPoint;
  } else if (nextPoint && nextPointType === 0) { // VarPackedPath.ON_CURVE
    onCurvePoint = nextPoint;
  }

  // If we found an on-curve neighbor, check if it's eligible
  if (onCurvePoint) {
    // Check if the on-curve point is eligible by using the existing checkPointConfiguration function
    // but we need to get its index first
    let onCurvePointIndex = null;
    if (prevPoint && prevPointType === 0) {
      onCurvePointIndex = prevPointIndex;
    } else if (nextPoint && nextPointType === 0) {
      onCurvePointIndex = nextPointIndex;
    }
    
    if (onCurvePointIndex !== null) {
      const onCurveConfig = checkPointConfiguration(path, onCurvePointIndex);
      if (onCurveConfig) {
        // Return the configuration with the on-curve point and this off-curve point
        return {
          type: "offcurve",
          point: onCurvePoint,
          offCurvePoints: [point]
        };
      }
    }
  }

  return null;
}

// Calculate distances from a selected on-curve point to its associated off-curve points
// or from a selected off-curve point to its associated on-curve point
export function calculateDistancesFromPoint(pointIndex, path) {
  // First check if it's a valid on-curve point with associated off-curve points
  let pointConfig = checkPointConfiguration(path, pointIndex);
  
  // If not, check if it's an off-curve point associated with an eligible on-curve point
  if (!pointConfig) {
    pointConfig = checkOffCurvePointConfiguration(path, pointIndex);
  }
  
  // If the point is not a valid point with associated points, return null
  if (!pointConfig) {
    return null;
  }
  
  // Calculate distances to the associated points
  const distances = calculateDistancesToOffCurvePoints(pointConfig.point, pointConfig.offCurvePoints);
  
  // Return the point configuration type and the calculated distances
  return {
    type: pointConfig.type,
    point: pointConfig.point,
    distances: distances
  };
}

// Draw a line between two points
export function drawLine(context, point1, point2, strokeWidth, color) {
  context.strokeStyle = color;
  context.lineWidth = strokeWidth;
  strokeLine(context, point1.x, point1.y, point2.x, point2.y);
}

// Draw a rounded rectangle badge
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

// Draw text at specified position
export function drawText(context, text, x, y, color, fontSize) {
  context.save();
  context.fillStyle = color;
  context.font = `${fontSize}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.scale(1, -1);
  
  const lines = text.split("\n");
  const lineHeight = fontSize;
  const totalHeight = lines.length * lineHeight;
  
  // Draw each line centered
  for (let i = 0; i < lines.length; i++) {
    const lineY = -y - totalHeight / 2 + (i + 0.5) * lineHeight;
    context.fillText(lines[i], x, lineY);
  }
  
  context.restore();
}

// Draw distance and angle visualization
export function drawDistanceAngleVisualization(context, positionedGlyph, parameters, model, controller) {
  // Get the selected points
  const { point: selectedPointIndices } = parseSelection(model.selection);
  
  // We need exactly two points to show distance and angle
  if (!selectedPointIndices || selectedPointIndices.length !== 2) {
    return;
  }
  
  // Get the actual points from the path
  const path = positionedGlyph.glyph.path;
  const point1 = path.getPoint(selectedPointIndices[0]);
  const point2 = path.getPoint(selectedPointIndices[1]);
  
  if (!point1 || !point2) {
    return;
  }
  
  // Draw line between points
  drawLine(context, point1, point2, parameters.strokeWidth, parameters.strokeColor);
  
 // Calculate distance and angle
  const { distance, angle } = calculateDistanceAndAngle(point1, point2);
  
  // Format text for display
  const text = formatDistanceAndAngle(distance, angle);
  
  // Calculate midpoint
  const midPoint = {
    x: (point1.x + point2.x) / 2,
    y: (point1.y + point2.y) / 2
  };
  
  // Calculate badge dimensions
  const badgeDimensions = calculateBadgeDimensions(text, DISTANCE_ANGLE_FONT_SIZE);
  
  // Calculate unit vector perpendicular to the line
  const unitVector = unitVectorFromTo(point1, point2);
  
  // Calculate badge position
  const badgePosition = calculateBadgePosition(
    midPoint,
    { x: -unitVector.y, y: unitVector.x },
    badgeDimensions.width,
    badgeDimensions.height
  );
  
  // Draw badge
  drawBadge(context, badgePosition.x, badgePosition.y, badgeDimensions.width, badgeDimensions.height, DISTANCE_ANGLE_BADGE_RADIUS, DISTANCE_ANGLE_BADGE_COLOR);
  
  // Draw text
  drawText(context, text, badgePosition.x + badgeDimensions.width / 2, badgePosition.y + badgeDimensions.height / 2, DISTANCE_ANGLE_TEXT_COLOR, DISTANCE_ANGLE_FONT_SIZE);
}
// Draw Manhattan distance visualization
export function drawManhattanDistanceVisualization(context, positionedGlyph, parameters, model, controller) {
  // Get the selected points
  const { point: selectedPointIndices } = parseSelection(model.selection);
  
  // We need exactly two points to show Manhattan distance
  if (!selectedPointIndices || selectedPointIndices.length !== 2) {
    return;
  }
  
  // Get the actual points from the path
  const path = positionedGlyph.glyph.path;
  const point1 = path.getPoint(selectedPointIndices[0]);
  const point2 = path.getPoint(selectedPointIndices[1]);
  
  if (!point1 || !point2) {
    return;
  }
  
  // Calculate dx and dy as absolute differences
  const dx = Math.abs(point2.x - point1.x);
  const dy = Math.abs(point2.y - point1.y);
  
  // Check if either dx or dy is zero (meaning points are aligned)
  if (dx === 0 || dy === 0) {
    // Points are aligned, show only the direct line without any measurements
    drawLine(context, point1, point2, parameters.strokeWidth, parameters.strokeColor);
    return;
  }
  
  // Points are not aligned, show the Manhattan visualization with separate X and Y measurements
  // Calculate Manhattan distance
  const manhattanDistance = calculateManhattanDistance(point1, point2);
  
  // Create the corner point for the right angle path (horizontal first, then vertical)
  const cornerPoint = { x: point2.x, y: point1.y };
  
  // Draw the horizontal line from point1 to cornerPoint
  drawLine(context, point1, cornerPoint, parameters.strokeWidth, parameters.strokeColor);
  
  // Draw the vertical line from cornerPoint to point2
  drawLine(context, cornerPoint, point2, parameters.strokeWidth, parameters.strokeColor);
  
  // Format text for separate measurements
  const dxText = dx.toFixed(1);
  const dyText = dy.toFixed(1);
  
  // Calculate midpoint of horizontal segment for dx badge positioning
  const hMidPoint = {
    x: (point1.x + cornerPoint.x) / 2,
    y: (point1.y + cornerPoint.y) / 2
  };
  
  // Calculate midpoint of vertical segment for dy badge positioning
  const vMidPoint = {
    x: (cornerPoint.x + point2.x) / 2,
    y: (cornerPoint.y + point2.y) / 2
  };
  
  // Calculate badge dimensions for each text
  const dxBadgeDimensions = calculateBadgeDimensions(dxText, DISTANCE_ANGLE_FONT_SIZE);
  const dyBadgeDimensions = calculateBadgeDimensions(dyText, DISTANCE_ANGLE_FONT_SIZE);
  
  // Calculate unit vectors for badge positioning
  // For horizontal segment, perpendicular vector points vertically
  const hUnitVector = { x: 0, y: 1 };
  // For vertical segment, perpendicular vector points horizontally
  const vUnitVector = { x: 1, y: 0 };
  
  // Calculate badge positions
  const dxBadgePosition = calculateBadgePosition(
    hMidPoint,
    hUnitVector,
    dxBadgeDimensions.width,
    dxBadgeDimensions.height
  );
  
  const dyBadgePosition = calculateBadgePosition(
    vMidPoint,
    vUnitVector,
    dyBadgeDimensions.width,
    dyBadgeDimensions.height
  );
  
  // Draw badges
  drawBadge(context, dxBadgePosition.x, dxBadgePosition.y, dxBadgeDimensions.width, dxBadgeDimensions.height, DISTANCE_ANGLE_BADGE_RADIUS, DISTANCE_ANGLE_BADGE_COLOR);
  drawBadge(context, dyBadgePosition.x, dyBadgePosition.y, dyBadgeDimensions.width, dyBadgeDimensions.height, DISTANCE_ANGLE_BADGE_RADIUS, DISTANCE_ANGLE_BADGE_COLOR);
  
  // Draw text
  drawText(context, dxText, dxBadgePosition.x + dxBadgeDimensions.width / 2, dxBadgePosition.y + dxBadgeDimensions.height / 2, DISTANCE_ANGLE_TEXT_COLOR, DISTANCE_ANGLE_FONT_SIZE);
  drawText(context, dyText, dyBadgePosition.x + dyBadgeDimensions.width / 2, dyBadgePosition.y + dyBadgeDimensions.height / 2, DISTANCE_ANGLE_TEXT_COLOR, DISTANCE_ANGLE_FONT_SIZE);
}

// Draw off-curve distance visualization
export function drawOffCurveDistanceVisualization(context, positionedGlyph, parameters, model, controller) {
  // Get the selected points
  const { point: selectedPointIndices } = parseSelection(model.selection);
  
  // We need exactly one point to show off-curve distances
  if (!selectedPointIndices || selectedPointIndices.length !== 1) {
    return;
  }
  
  // Get the actual point from the path
  const path = positionedGlyph.glyph.path;
  const pointIndex = selectedPointIndices[0];
  
  // Calculate distances to off-curve points
  const distanceInfo = calculateDistancesFromPoint(pointIndex, path);
  
  // If no valid distance info, return
  if (!distanceInfo) {
    return;
  }
  
  // Draw lines and badges for each distance
  for (const distanceData of distanceInfo.distances) {
    const offCurvePoint = distanceData.point;
    const distance = distanceData.distance;
    
    // Draw line between points
    drawLine(context, distanceInfo.point, offCurvePoint, parameters.strokeWidth, parameters.strokeColor);
    
    // Format text for display
    const text = `${distance.toFixed(1)}`;
    
    // Calculate midpoint
    const midPoint = {
      x: (distanceInfo.point.x + offCurvePoint.x) / 2,
      y: (distanceInfo.point.y + offCurvePoint.y) / 2
    };
    
    // Calculate badge dimensions
    const badgeDimensions = calculateBadgeDimensions(text, OFFCURVE_DISTANCE_FONT_SIZE);
    
    // Calculate unit vector perpendicular to the line
    const unitVector = unitVectorFromTo(distanceInfo.point, offCurvePoint);
    
    // Calculate badge position
    const badgePosition = calculateBadgePosition(
      midPoint,
      { x: -unitVector.y, y: unitVector.x },
      badgeDimensions.width,
      badgeDimensions.height
    );
    
    // Draw badge
    drawBadge(context, badgePosition.x, badgePosition.y, badgeDimensions.width, badgeDimensions.height, OFFCURVE_DISTANCE_BADGE_RADIUS, OFFCURVE_DISTANCE_BADGE_COLOR);
    
    // Draw text
    drawText(context, text, badgePosition.x + badgeDimensions.width / 2, badgePosition.y + badgeDimensions.height / 2, OFFCURVE_DISTANCE_TEXT_COLOR, OFFCURVE_DISTANCE_FONT_SIZE);
  }
}

// Drawing helper functions (needed for the visualization functions)
export function strokeLine(context, x1, y1, x2, y2) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

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