import { parseSelection, withSavedState } from "@fontra/core/utils.js";
import {
  getSkeletonData,
  calculateNormalAtSkeletonPoint,
  generateSampledOffsetPoints,
  getPointHalfWidth,
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
export function getSkeletonDataFromGlyph(positionedGlyph, model) {
  if (!positionedGlyph?.varGlyph?.glyph?.layers) {
    return null;
  }

  // Use editLayerName if explicitly set, otherwise fall back to the positioned glyph's layer
  // This handles the case where no layer has been explicitly selected in the UI yet
  const editLayerName =
    model.sceneSettings?.editLayerName || positionedGlyph.glyph?.layerName;
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
  zIndex: 452,
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
      const defaultWidth = contour.defaultWidth || 20;

      for (let i = 0; i < contour.points.length; i++) {
        const point = contour.points[i];

        // Only draw ribs at on-curve points
        if (point.type) continue;

        const normal = calculateNormalAtSkeletonPoint(contour, i);
        // Use per-point half-widths
        const leftHW = getPointHalfWidth(point, defaultWidth, "left");
        const rightHW = getPointHalfWidth(point, defaultWidth, "right");

        // Quantize to UPM grid (same as generated contour points)
        strokeLine(
          context,
          Math.round(point.x - normal.x * rightHW),
          Math.round(point.y - normal.y * rightHW),
          Math.round(point.x + normal.x * leftHW),
          Math.round(point.y + normal.y * leftHW)
        );
      }
    }
  },
});

/**
 * Draw a diamond node (for rib points)
 */
function strokeDiamondNode(context, pt, size) {
  const halfSize = size / 2;
  context.beginPath();
  context.moveTo(pt.x, pt.y - halfSize);
  context.lineTo(pt.x + halfSize, pt.y);
  context.lineTo(pt.x, pt.y + halfSize);
  context.lineTo(pt.x - halfSize, pt.y);
  context.closePath();
  context.stroke();
}

// Skeleton rib points layer (draggable width control points)
registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.rib.points",
  name: "Skeleton Rib Points",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 453,
  screenParameters: {
    pointSize: 10,
    strokeWidth: 2,
  },
  colors: {
    strokeColor: "rgba(220, 60, 120, 0.7)",
    hoveredColor: "rgba(220, 60, 120, 1.0)",
    selectedColor: "rgba(255, 64, 0, 0.9)",
  },
  colorsDarkMode: {
    strokeColor: "rgba(220, 100, 140, 0.7)",
    hoveredColor: "rgba(220, 100, 140, 1.0)",
    selectedColor: "rgba(255, 96, 64, 0.9)",
  },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, model);
    if (!skeletonData?.contours?.length) {
      return;
    }

    // Parse selection and hover state for rib points
    const { skeletonRibPoint: hoveredRibPoints } = parseSelection(model.hoverSelection);
    const { skeletonRibPoint: selectedRibPoints } = parseSelection(model.selection);

    context.lineWidth = parameters.strokeWidth;

    for (let contourIndex = 0; contourIndex < skeletonData.contours.length; contourIndex++) {
      const contour = skeletonData.contours[contourIndex];
      const defaultWidth = contour.defaultWidth || 20;

      for (let pointIndex = 0; pointIndex < contour.points.length; pointIndex++) {
        const point = contour.points[pointIndex];

        // Only draw rib points at on-curve points
        if (point.type) continue;

        const normal = calculateNormalAtSkeletonPoint(contour, pointIndex);
        const leftHW = getPointHalfWidth(point, defaultWidth, "left");
        const rightHW = getPointHalfWidth(point, defaultWidth, "right");

        // Calculate rib point positions (quantized to UPM grid like generated points)
        const leftRibPoint = {
          x: Math.round(point.x + normal.x * leftHW),
          y: Math.round(point.y + normal.y * leftHW),
        };
        const rightRibPoint = {
          x: Math.round(point.x - normal.x * rightHW),
          y: Math.round(point.y - normal.y * rightHW),
        };

        // Selection keys for this rib point pair
        const leftKey = `${contourIndex}/${pointIndex}/left`;
        const rightKey = `${contourIndex}/${pointIndex}/right`;

        // Draw left rib point
        if (selectedRibPoints?.has(leftKey)) {
          context.strokeStyle = parameters.selectedColor;
        } else if (hoveredRibPoints?.has(leftKey)) {
          context.strokeStyle = parameters.hoveredColor;
        } else {
          context.strokeStyle = parameters.strokeColor;
        }
        strokeDiamondNode(context, leftRibPoint, parameters.pointSize);

        // Draw right rib point
        if (selectedRibPoints?.has(rightKey)) {
          context.strokeStyle = parameters.selectedColor;
        } else if (hoveredRibPoints?.has(rightKey)) {
          context.strokeStyle = parameters.hoveredColor;
        } else {
          context.strokeStyle = parameters.strokeColor;
        }
        strokeDiamondNode(context, rightRibPoint, parameters.pointSize);
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

        // Determine which on-curve point this handle belongs to
        // by checking if the previous point is on-curve or off-curve
        const prevIdx = (i - 1 + numPoints) % numPoints;
        const nextIdx = (i + 1) % numPoints;
        const prevPoint = points[prevIdx];
        const nextPoint = points[nextIdx];

        // If previous point is on-curve, this handle belongs to it (outgoing handle)
        if (prevPoint && !prevPoint.type) {
          strokeLine(context, prevPoint.x, prevPoint.y, point.x, point.y);
        }
        // If previous point is off-curve and next is on-curve,
        // this handle belongs to the next on-curve (incoming handle)
        else if (prevPoint?.type && nextPoint && !nextPoint.type) {
          strokeLine(context, nextPoint.x, nextPoint.y, point.x, point.y);
        }
        // Fallback: find nearest on-curve
        else {
          // Find previous on-curve point
          let prevOnCurve = null;
          for (let j = 1; j < numPoints; j++) {
            const idx = (i - j + numPoints) % numPoints;
            if (!points[idx].type) {
              prevOnCurve = points[idx];
              break;
            }
          }
          if (prevOnCurve) {
            strokeLine(context, prevOnCurve.x, prevOnCurve.y, point.x, point.y);
          }
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

// Selected/hovered skeleton segments layer
registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.selected.segments",
  name: "Selected Skeleton Segments",
  selectionFunc: glyphSelector("editing"),
  zIndex: 448, // Just below centerline
  screenParameters: {
    strokeWidth: 4,
  },
  colors: {
    hoveredColor: "rgba(0, 191, 255, 0.5)",
    selectedColor: "rgba(255, 64, 0, 0.6)",
  },
  colorsDarkMode: {
    hoveredColor: "rgba(0, 191, 255, 0.5)",
    selectedColor: "rgba(255, 96, 64, 0.6)",
  },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, model);
    if (!skeletonData?.contours?.length) {
      return;
    }

    const { skeletonSegment: hoveredSkeletonSegments } = parseSelection(
      model.hoverSelection
    );
    const { skeletonSegment: selectedSkeletonSegments } = parseSelection(
      model.selection
    );

    if (!hoveredSkeletonSegments?.size && !selectedSkeletonSegments?.size) {
      return;
    }

    context.lineWidth = parameters.strokeWidth;
    context.lineCap = "round";
    context.lineJoin = "round";

    // Helper to draw a segment
    const drawSegment = (contour, segmentIdx, isClosing = false) => {
      const points = contour.points;

      // Find on-curve indices
      const onCurveIndices = [];
      for (let i = 0; i < points.length; i++) {
        if (!points[i].type) {
          onCurveIndices.push(i);
        }
      }

      if (segmentIdx >= onCurveIndices.length) return;

      let startIdx, endIdx;
      if (isClosing || segmentIdx === onCurveIndices.length - 1) {
        startIdx = onCurveIndices[onCurveIndices.length - 1];
        endIdx = onCurveIndices[0];
      } else {
        startIdx = onCurveIndices[segmentIdx];
        endIdx = onCurveIndices[segmentIdx + 1];
      }

      const startPoint = points[startIdx];
      const endPoint = points[endIdx];

      // Collect off-curve points
      const offCurves = [];
      if (isClosing || segmentIdx === onCurveIndices.length - 1) {
        for (let j = startIdx + 1; j < points.length; j++) {
          if (points[j].type) offCurves.push(points[j]);
        }
        for (let j = 0; j < endIdx; j++) {
          if (points[j].type) offCurves.push(points[j]);
        }
      } else {
        for (let j = startIdx + 1; j < endIdx; j++) {
          if (points[j].type) offCurves.push(points[j]);
        }
      }

      // Build path
      const path = new Path2D();
      path.moveTo(startPoint.x, startPoint.y);

      if (offCurves.length === 0) {
        path.lineTo(endPoint.x, endPoint.y);
      } else if (offCurves.length === 1) {
        path.quadraticCurveTo(offCurves[0].x, offCurves[0].y, endPoint.x, endPoint.y);
      } else if (offCurves.length === 2) {
        path.bezierCurveTo(
          offCurves[0].x,
          offCurves[0].y,
          offCurves[1].x,
          offCurves[1].y,
          endPoint.x,
          endPoint.y
        );
      }

      context.stroke(path);
    };

    // Draw selected segments
    if (selectedSkeletonSegments?.size) {
      context.strokeStyle = parameters.selectedColor;
      for (const selKey of selectedSkeletonSegments) {
        const [contourIdx, segmentIdx] = selKey.split("/").map(Number);
        const contour = skeletonData.contours[contourIdx];
        if (contour) {
          // Find on-curve count to check if this is closing segment
          const onCurveCount = contour.points.filter((p) => !p.type).length;
          const isClosing = contour.isClosed && segmentIdx === onCurveCount - 1;
          drawSegment(contour, segmentIdx, isClosing);
        }
      }
    }

    // Draw hovered segments (if not already selected)
    if (hoveredSkeletonSegments?.size) {
      context.strokeStyle = parameters.hoveredColor;
      for (const selKey of hoveredSkeletonSegments) {
        if (selectedSkeletonSegments?.has(selKey)) continue;
        const [contourIdx, segmentIdx] = selKey.split("/").map(Number);
        const contour = skeletonData.contours[contourIdx];
        if (contour) {
          const onCurveCount = contour.points.filter((p) => !p.type).length;
          const isClosing = contour.isClosed && segmentIdx === onCurveCount - 1;
          drawSegment(contour, segmentIdx, isClosing);
        }
      }
    }
  },
});

// Skeleton insert handles preview (shown when Alt+hovering over centerline)
registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.insert.handles",
  name: "Skeleton Insert Handles Preview",
  selectionFunc: glyphSelector("editing"),
  zIndex: 560,
  screenParameters: {
    handleRadius: 5,
    lineWidth: 1,
  },
  colors: {
    handleColor: "rgba(48, 128, 255, 0.5)",
    lineColor: "rgba(48, 128, 255, 0.3)",
  },
  colorsDarkMode: {
    handleColor: "rgba(80, 160, 255, 0.5)",
    lineColor: "rgba(80, 160, 255, 0.3)",
  },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const insertHandles = model.skeletonInsertHandles;
    if (!insertHandles?.points?.length) {
      return;
    }

    context.fillStyle = parameters.handleColor;
    context.strokeStyle = parameters.lineColor;
    context.lineWidth = parameters.lineWidth;

    // Draw lines from handles to their anchor points
    if (insertHandles.startPoint && insertHandles.points[0]) {
      strokeLine(
        context,
        insertHandles.startPoint.x,
        insertHandles.startPoint.y,
        insertHandles.points[0].x,
        insertHandles.points[0].y
      );
    }
    if (insertHandles.endPoint && insertHandles.points[1]) {
      strokeLine(
        context,
        insertHandles.endPoint.x,
        insertHandles.endPoint.y,
        insertHandles.points[1].x,
        insertHandles.points[1].y
      );
    }

    // Draw handle preview circles
    for (const point of insertHandles.points) {
      fillRoundNode(context, point, parameters.handleRadius);
    }
  },
});

// Sampled offset points layer (for debugging/comparison)
registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.sampled.offset",
  name: "Skeleton Sampled Offset Points",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 440, // Below centerline but visible
  screenParameters: {
    pointRadius: 2,
  },
  colors: {
    leftColor: "rgba(128, 128, 128, 0.5)",
    rightColor: "rgba(128, 128, 128, 0.5)",
  },
  colorsDarkMode: {
    leftColor: "rgba(180, 180, 180, 0.5)",
    rightColor: "rgba(180, 180, 180, 0.5)",
  },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, model);
    if (!skeletonData?.contours?.length) {
      return;
    }

    for (const contour of skeletonData.contours) {
      const sampledPoints = generateSampledOffsetPoints(contour);

      // Draw left side sampled points
      context.fillStyle = parameters.leftColor;
      for (const point of sampledPoints.left) {
        fillRoundNode(context, point, parameters.pointRadius);
      }

      // Draw right side sampled points
      context.fillStyle = parameters.rightColor;
      for (const point of sampledPoints.right) {
        fillRoundNode(context, point, parameters.pointRadius);
      }
    }
  },
});
