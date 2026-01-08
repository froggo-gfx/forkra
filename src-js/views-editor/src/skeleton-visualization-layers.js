import { parseSelection, withSavedState } from "@fontra/core/utils.js";
import {
  getSkeletonData,
  calculateNormalAtSkeletonPoint,
} from "@fontra/core/skeleton-contour-generator.js";
import {
  registerVisualizationLayerDefinition,
  glyphSelector,
  strokeLine,
  strokeRoundNode,
  strokeSquareNode,
  fillRoundNode,
  fillSquareNode,
} from "./visualization-layer-definitions.js";

/**
 * Get skeleton data from a positioned glyph's editing layer.
 */
function getSkeletonDataFromGlyph(positionedGlyph, model) {
  if (!positionedGlyph?.varGlyph?.glyph?.layers) {
    return null;
  }

  const editLayerName = model.sceneSettings?.editLayerName;
  if (!editLayerName) {
    return null;
  }

  const layer = positionedGlyph.varGlyph.glyph.layers[editLayerName];
  if (!layer) {
    return null;
  }

  return getSkeletonData(layer);
}

/**
 * Draw a skeleton contour's centerline as a Path2D.
 */
function skeletonContourToPath2d(skeletonContour) {
  const path = new Path2D();
  const { points, isClosed } = skeletonContour;

  if (points.length < 2) {
    return path;
  }

  // Find first on-curve point
  let firstOnCurveIndex = -1;
  for (let i = 0; i < points.length; i++) {
    if (!points[i].type) {
      firstOnCurveIndex = i;
      break;
    }
  }

  if (firstOnCurveIndex === -1) {
    return path;
  }

  const firstPoint = points[firstOnCurveIndex];
  path.moveTo(firstPoint.x, firstPoint.y);

  // Iterate through points building curve
  let i = firstOnCurveIndex + 1;
  const numPoints = points.length;
  const endIndex = isClosed ? firstOnCurveIndex + numPoints : numPoints;

  while (i < endIndex) {
    const idx = i % numPoints;
    const point = points[idx];

    if (!point.type) {
      // On-curve point - line to
      path.lineTo(point.x, point.y);
      i++;
    } else if (point.type === "cubic") {
      // Cubic bezier - need 2 off-curve points + 1 on-curve
      const cp1 = point;
      const cp2Idx = (i + 1) % numPoints;
      const endIdx = (i + 2) % numPoints;

      if (points[cp2Idx]?.type === "cubic" && !points[endIdx]?.type) {
        path.bezierCurveTo(
          cp1.x,
          cp1.y,
          points[cp2Idx].x,
          points[cp2Idx].y,
          points[endIdx].x,
          points[endIdx].y
        );
        i += 3;
      } else if (!points[cp2Idx]?.type) {
        // Single cubic control point - treat as quadratic
        path.quadraticCurveTo(cp1.x, cp1.y, points[cp2Idx].x, points[cp2Idx].y);
        i += 2;
      } else {
        i++;
      }
    } else if (point.type === "quad") {
      // Quadratic bezier
      const nextIdx = (i + 1) % numPoints;
      if (!points[nextIdx]?.type) {
        path.quadraticCurveTo(point.x, point.y, points[nextIdx].x, points[nextIdx].y);
        i += 2;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  if (isClosed) {
    path.closePath();
  }

  return path;
}

// Skeleton centerline layer
registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.centerline",
  name: "Skeleton Centerline",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 450,
  screenParameters: { strokeWidth: 1.5 },
  colors: { strokeColor: "#0080FF" },
  colorsDarkMode: { strokeColor: "#00BFFF" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, model);
    if (!skeletonData?.contours?.length) {
      return;
    }

    context.strokeStyle = parameters.strokeColor;
    context.lineWidth = parameters.strokeWidth;
    context.lineCap = "round";
    context.lineJoin = "round";

    for (const contour of skeletonData.contours) {
      const path2d = skeletonContourToPath2d(contour);
      context.stroke(path2d);
    }
  },
});

// Skeleton ribs (width indicators) layer
registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.ribs",
  name: "Skeleton Width Ribs",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 455,
  screenParameters: { strokeWidth: 1 },
  colors: { strokeColor: "rgba(0, 128, 255, 0.4)" },
  colorsDarkMode: { strokeColor: "rgba(0, 191, 255, 0.4)" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, model);
    if (!skeletonData?.contours?.length) {
      return;
    }

    context.strokeStyle = parameters.strokeColor;
    context.lineWidth = parameters.strokeWidth;

    for (const contour of skeletonData.contours) {
      const width = contour.defaultWidth || 20;
      const halfWidth = width / 2;

      for (let i = 0; i < contour.points.length; i++) {
        const point = contour.points[i];

        // Only draw ribs at on-curve points
        if (point.type) continue;

        const normal = calculateNormalAtSkeletonPoint(contour, i);

        strokeLine(
          context,
          point.x - normal.x * halfWidth,
          point.y - normal.y * halfWidth,
          point.x + normal.x * halfWidth,
          point.y + normal.y * halfWidth
        );
      }
    }
  },
});

// Skeleton nodes layer
registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.nodes",
  name: "Skeleton Nodes",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 550,
  screenParameters: {
    cornerSize: 7,
    smoothSize: 7,
    handleSize: 5,
  },
  colors: { fillColor: "#0080FF" },
  colorsDarkMode: { fillColor: "#00BFFF" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, model);
    if (!skeletonData?.contours?.length) {
      return;
    }

    context.fillStyle = parameters.fillColor;

    for (const contour of skeletonData.contours) {
      for (const point of contour.points) {
        if (!point.type && !point.smooth) {
          // Corner on-curve point - square
          fillSquareNode(context, point, parameters.cornerSize);
        } else if (!point.type) {
          // Smooth on-curve point - circle
          fillRoundNode(context, point, parameters.smoothSize);
        } else {
          // Off-curve handle - smaller circle
          fillRoundNode(context, point, parameters.handleSize);
        }
      }
    }
  },
});

// Skeleton handles (lines from on-curve to off-curve)
registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.handles",
  name: "Skeleton Handles",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 545,
  screenParameters: { strokeWidth: 1 },
  colors: { strokeColor: "rgba(0, 128, 255, 0.6)" },
  colorsDarkMode: { strokeColor: "rgba(0, 191, 255, 0.6)" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, model);
    if (!skeletonData?.contours?.length) {
      return;
    }

    context.strokeStyle = parameters.strokeColor;
    context.lineWidth = parameters.strokeWidth;

    for (const contour of skeletonData.contours) {
      const points = contour.points;
      const numPoints = points.length;

      for (let i = 0; i < numPoints; i++) {
        const point = points[i];

        // Skip on-curve points
        if (!point.type) continue;

        // Find previous on-curve point
        let prevOnCurve = null;
        for (let j = 1; j < numPoints; j++) {
          const idx = (i - j + numPoints) % numPoints;
          if (!points[idx].type) {
            prevOnCurve = points[idx];
            break;
          }
        }

        // Draw line from this off-curve to previous on-curve
        if (prevOnCurve) {
          strokeLine(context, prevOnCurve.x, prevOnCurve.y, point.x, point.y);
        }
      }
    }
  },
});

// Selected skeleton nodes layer
registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.selected.nodes",
  name: "Selected Skeleton Nodes",
  selectionFunc: glyphSelector("editing"),
  zIndex: 555,
  screenParameters: {
    cornerSize: 8,
    smoothSize: 8,
    handleSize: 6,
    strokeWidth: 1.5,
    underlayOffset: 2,
  },
  colors: {
    hoveredColor: "#00BFFF",
    selectedColor: "#FF4000",
    underColor: "rgba(255, 255, 255, 0.9)",
  },
  colorsDarkMode: {
    hoveredColor: "#00BFFF",
    selectedColor: "#FF6040",
    underColor: "rgba(0, 0, 0, 0.6)",
  },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, model);
    if (!skeletonData?.contours?.length) {
      return;
    }

    const { skeletonPoint: hoveredSkeletonPoints } = parseSelection(model.hoverSelection);
    const { skeletonPoint: selectedSkeletonPoints } = parseSelection(model.selection);

    if (!hoveredSkeletonPoints?.size && !selectedSkeletonPoints?.size) {
      return;
    }

    // Draw selected nodes
    if (selectedSkeletonPoints?.size) {
      for (const contour of skeletonData.contours) {
        for (let i = 0; i < contour.points.length; i++) {
          const point = contour.points[i];
          // Selection key format: "contourIndex/pointIndex"
          const selectionKey = `${skeletonData.contours.indexOf(contour)}/${i}`;

          if (selectedSkeletonPoints.has(selectionKey)) {
            // Draw underlay
            context.fillStyle = parameters.underColor;
            const size = point.type
              ? parameters.handleSize + parameters.underlayOffset
              : parameters.cornerSize + parameters.underlayOffset;
            fillRoundNode(context, point, size);

            // Draw selected node
            context.fillStyle = parameters.selectedColor;
            if (!point.type && !point.smooth) {
              fillSquareNode(context, point, parameters.cornerSize);
            } else if (!point.type) {
              fillRoundNode(context, point, parameters.smoothSize);
            } else {
              fillRoundNode(context, point, parameters.handleSize);
            }
          }
        }
      }
    }

    // Draw hovered nodes
    if (hoveredSkeletonPoints?.size) {
      for (const contour of skeletonData.contours) {
        for (let i = 0; i < contour.points.length; i++) {
          const point = contour.points[i];
          const selectionKey = `${skeletonData.contours.indexOf(contour)}/${i}`;

          if (
            hoveredSkeletonPoints.has(selectionKey) &&
            !selectedSkeletonPoints?.has(selectionKey)
          ) {
            context.strokeStyle = parameters.hoveredColor;
            context.lineWidth = parameters.strokeWidth;

            if (!point.type && !point.smooth) {
              strokeSquareNode(context, point, parameters.cornerSize);
            } else if (!point.type) {
              strokeRoundNode(context, point, parameters.smoothSize);
            } else {
              strokeRoundNode(context, point, parameters.handleSize);
            }
          }
        }
      }
    }
  },
});
