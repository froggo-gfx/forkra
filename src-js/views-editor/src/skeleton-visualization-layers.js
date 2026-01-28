import { parseSelection, withSavedState } from "@fontra/core/utils.js";
import {
  getSkeletonData,
  calculateNormalAtSkeletonPoint,
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
import {
  buildSegmentsFromSkeletonPoints,
  calculateSkeletonTunniPoint,
  calculateSkeletonTrueTunniPoint,
} from "./skeleton-tunni-calculations.js";

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
      const singleSided = contour.singleSided ?? false;
      const singleSidedDirection = contour.singleSidedDirection ?? "left";

      for (let i = 0; i < contour.points.length; i++) {
        const point = contour.points[i];

        // Only draw ribs at on-curve points
        if (point.type) continue;

        const normal = calculateNormalAtSkeletonPoint(contour, i);
        // Use per-point half-widths
        const leftHW = getPointHalfWidth(point, defaultWidth, "left");
        const rightHW = getPointHalfWidth(point, defaultWidth, "right");

        if (singleSided) {
          // Single-sided: line from skeleton point to contour edge
          const totalWidth = leftHW + rightHW;
          if (singleSidedDirection === "left") {
            strokeLine(
              context,
              Math.round(point.x),
              Math.round(point.y),
              Math.round(point.x + normal.x * totalWidth),
              Math.round(point.y + normal.y * totalWidth)
            );
          } else {
            strokeLine(
              context,
              Math.round(point.x),
              Math.round(point.y),
              Math.round(point.x - normal.x * totalWidth),
              Math.round(point.y - normal.y * totalWidth)
            );
          }
        } else {
          // Normal mode: line across both sides
          strokeLine(
            context,
            Math.round(point.x - normal.x * rightHW),
            Math.round(point.y - normal.y * rightHW),
            Math.round(point.x + normal.x * leftHW),
            Math.round(point.y + normal.y * leftHW)
          );
        }
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
    editablePointSize: 12,
    strokeWidth: 2,
  },
  colors: {
    strokeColor: "rgba(220, 60, 120, 0.7)",
    hoveredColor: "rgba(220, 60, 120, 1.0)",
    selectedColor: "rgba(255, 64, 0, 0.9)",
    // Editable rib points - more saturated purple
    editableStrokeColor: "rgba(160, 40, 180, 0.9)",
    editableHoveredColor: "rgba(160, 40, 180, 1.0)",
  },
  colorsDarkMode: {
    strokeColor: "rgba(220, 100, 140, 0.7)",
    hoveredColor: "rgba(220, 100, 140, 1.0)",
    selectedColor: "rgba(255, 96, 64, 0.9)",
    // Editable rib points - more saturated purple
    editableStrokeColor: "rgba(180, 80, 200, 0.9)",
    editableHoveredColor: "rgba(180, 80, 200, 1.0)",
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
      const singleSided = contour.singleSided ?? false;
      const singleSidedDirection = contour.singleSidedDirection ?? "left";

      for (let pointIndex = 0; pointIndex < contour.points.length; pointIndex++) {
        const point = contour.points[pointIndex];

        // Only draw rib points at on-curve points
        if (point.type) continue;

        const normal = calculateNormalAtSkeletonPoint(contour, pointIndex);
        const leftHW = getPointHalfWidth(point, defaultWidth, "left");
        const rightHW = getPointHalfWidth(point, defaultWidth, "right");

        // Selection keys for this rib point pair
        const leftKey = `${contourIndex}/${pointIndex}/left`;
        const rightKey = `${contourIndex}/${pointIndex}/right`;

        // Determine if each side is editable (per-side editable)
        const isLeftEditable = point.leftEditable === true;
        const isRightEditable = point.rightEditable === true;

        if (singleSided) {
          // Single-sided mode: only one rib point at total width
          const totalWidth = leftHW + rightHW;
          const tangent = { x: -normal.y, y: normal.x };
          let ribPoint, ribKey, isEditable;

          if (singleSidedDirection === "left") {
            // Only apply nudge if editable is true (matches generator behavior)
            const nudge = isLeftEditable ? (point.leftNudge || 0) : 0;
            ribPoint = {
              x: Math.round(point.x + normal.x * totalWidth + tangent.x * nudge),
              y: Math.round(point.y + normal.y * totalWidth + tangent.y * nudge),
            };
            ribKey = leftKey;
            isEditable = isLeftEditable;
          } else {
            // Only apply nudge if editable is true (matches generator behavior)
            const nudge = isRightEditable ? (point.rightNudge || 0) : 0;
            ribPoint = {
              x: Math.round(point.x - normal.x * totalWidth + tangent.x * nudge),
              y: Math.round(point.y - normal.y * totalWidth + tangent.y * nudge),
            };
            ribKey = rightKey;
            isEditable = isRightEditable;
          }

          const pointSize = isEditable ? parameters.editablePointSize : parameters.pointSize;
          if (selectedRibPoints?.has(ribKey)) {
            context.strokeStyle = parameters.selectedColor;
          } else if (hoveredRibPoints?.has(ribKey)) {
            context.strokeStyle = isEditable ? parameters.editableHoveredColor : parameters.hoveredColor;
          } else {
            context.strokeStyle = isEditable ? parameters.editableStrokeColor : parameters.strokeColor;
          }
          strokeDiamondNode(context, ribPoint, pointSize);
        } else {
          // Normal mode: two rib points
          // Only apply nudge offset if editable is true (matches generator behavior)
          const tangent = { x: -normal.y, y: normal.x };
          const leftNudge = isLeftEditable ? (point.leftNudge || 0) : 0;
          const rightNudge = isRightEditable ? (point.rightNudge || 0) : 0;

          const leftRibPoint = {
            x: Math.round(point.x + normal.x * leftHW + tangent.x * leftNudge),
            y: Math.round(point.y + normal.y * leftHW + tangent.y * leftNudge),
          };
          const rightRibPoint = {
            x: Math.round(point.x - normal.x * rightHW + tangent.x * rightNudge),
            y: Math.round(point.y - normal.y * rightHW + tangent.y * rightNudge),
          };

          // Draw left rib point
          const leftPointSize = isLeftEditable ? parameters.editablePointSize : parameters.pointSize;
          if (selectedRibPoints?.has(leftKey)) {
            context.strokeStyle = parameters.selectedColor;
          } else if (hoveredRibPoints?.has(leftKey)) {
            context.strokeStyle = isLeftEditable ? parameters.editableHoveredColor : parameters.hoveredColor;
          } else {
            context.strokeStyle = isLeftEditable ? parameters.editableStrokeColor : parameters.strokeColor;
          }
          strokeDiamondNode(context, leftRibPoint, leftPointSize);

          // Draw right rib point
          const rightPointSize = isRightEditable ? parameters.editablePointSize : parameters.pointSize;
          if (selectedRibPoints?.has(rightKey)) {
            context.strokeStyle = parameters.selectedColor;
          } else if (hoveredRibPoints?.has(rightKey)) {
            context.strokeStyle = isRightEditable ? parameters.editableHoveredColor : parameters.hoveredColor;
          } else {
            context.strokeStyle = isRightEditable ? parameters.editableStrokeColor : parameters.strokeColor;
          }
          strokeDiamondNode(context, rightRibPoint, rightPointSize);
        }
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

// ============================================================
// Skeleton Handle Labels - distance, angle, tension visualization
// ============================================================

const SKELETON_LABEL_FONT_SIZE = 6;
const SKELETON_LABEL_PADDING = 3;

/**
 * Calculate distance and angle between two points.
 * Angle is normalized to 0-90° relative to horizontal baseline.
 */
function calculateDistanceAndAngle(point1, point2) {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  const dist = Math.hypot(dx, dy);

  // Calculate angle from horizontal, normalized to 0-90°
  let angle = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
  if (angle > 90) {
    angle = 180 - angle;
  }

  return { distance: dist, angle };
}

/**
 * Calculate tension for a cubic bezier handle.
 * Tension = distance(onCurve, offCurve) / distance(onCurve, tunniPoint)
 */
function calculateTension(onCurveA, offCurveA, offCurveB, onCurveB) {
  // Calculate intersection of lines (onCurveA->offCurveA) and (onCurveB->offCurveB)
  const dx1 = offCurveA.x - onCurveA.x;
  const dy1 = offCurveA.y - onCurveA.y;
  const dx2 = offCurveB.x - onCurveB.x;
  const dy2 = offCurveB.y - onCurveB.y;

  const det = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(det) < 1e-10) {
    // Lines are parallel, use simple ratio
    const distA = Math.hypot(dx1, dy1);
    const distTotal = Math.hypot(onCurveB.x - onCurveA.x, onCurveB.y - onCurveA.y);
    return distTotal > 0 ? (distA / distTotal) * 2 : 0;
  }

  // Calculate tunni point (intersection)
  const dx3 = onCurveA.x - onCurveB.x;
  const dy3 = onCurveA.y - onCurveB.y;
  const t = (dy3 * dx2 - dx3 * dy2) / det;

  const tunniX = onCurveA.x + t * dx1;
  const tunniY = onCurveA.y + t * dy1;

  const distToOffCurve = Math.hypot(offCurveA.x - onCurveA.x, offCurveA.y - onCurveA.y);
  const distToTunni = Math.hypot(tunniX - onCurveA.x, tunniY - onCurveA.y);

  return distToTunni > 0 ? distToOffCurve / distToTunni : 0;
}

/**
 * Draw label text near a point (no background badge).
 */
function drawLabelText(context, point, text, offsetX, offsetY, parameters) {
  if (!text) return;

  const lines = text.split("\n");
  const lineHeight = SKELETON_LABEL_FONT_SIZE + 2;

  const x = point.x + offsetX;
  const y = point.y + offsetY;

  // Draw text directly (dark color, no background)
  context.save();
  context.fillStyle = parameters.textColor;
  context.font = `${SKELETON_LABEL_FONT_SIZE}px fontra-ui-regular, sans-serif`;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.scale(1, -1); // Flip for canvas coordinate system

  for (let i = 0; i < lines.length; i++) {
    const textY = -(y + (i - (lines.length - 1) / 2) * lineHeight);
    context.fillText(lines[i], x + SKELETON_LABEL_PADDING, textY);
  }
  context.restore();
}

// Skeleton handle labels layer
registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.handle.labels",
  name: "Skeleton Handle Labels",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: false,
  zIndex: 560,
  colors: {
    textColor: "rgba(40, 40, 80, 0.9)",
  },
  colorsDarkMode: {
    textColor: "rgba(200, 200, 240, 0.9)",
  },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, model);
    if (!skeletonData?.contours?.length) {
      return;
    }

    // Get visibility settings from model
    const showDistance = model.sceneSettings?.showSkeletonHandleDistance ?? true;
    const showTension = model.sceneSettings?.showSkeletonHandleTension ?? true;
    const showAngle = model.sceneSettings?.showSkeletonHandleAngle ?? true;

    // If nothing is enabled, skip
    if (!showDistance && !showTension && !showAngle) {
      return;
    }

    for (let contourIdx = 0; contourIdx < skeletonData.contours.length; contourIdx++) {
      const contour = skeletonData.contours[contourIdx];
      const points = contour.points;
      const numPoints = points.length;
      const isClosed = contour.isClosed;

      for (let i = 0; i < numPoints; i++) {
        const point = points[i];

        // Only process off-curve (handle) points
        if (!point.type) continue;

        // Find the connected on-curve point
        // Check previous and next points
        const prevIdx = (i - 1 + numPoints) % numPoints;
        const nextIdx = (i + 1) % numPoints;
        const prevPoint = points[prevIdx];
        const nextPoint = points[nextIdx];

        let onCurvePoint = null;
        let otherOffCurve = null;
        let otherOnCurve = null;

        // Determine which on-curve this handle belongs to
        if (prevPoint && !prevPoint.type) {
          // Previous point is on-curve - this is an outgoing handle
          onCurvePoint = prevPoint;
          // Look for the paired off-curve and next on-curve
          if (nextPoint?.type && points[(i + 2) % numPoints] && !points[(i + 2) % numPoints].type) {
            otherOffCurve = nextPoint;
            otherOnCurve = points[(i + 2) % numPoints];
          }
        } else if (nextPoint && !nextPoint.type) {
          // Next point is on-curve - this is an incoming handle
          onCurvePoint = nextPoint;
          // The paired off-curve is previous
          if (prevPoint?.type) {
            const prevPrevIdx = (i - 2 + numPoints) % numPoints;
            if (points[prevPrevIdx] && !points[prevPrevIdx].type) {
              otherOffCurve = prevPoint;
              otherOnCurve = points[prevPrevIdx];
            }
          }
        } else {
          // Fallback: find nearest on-curve
          for (let j = 1; j < numPoints; j++) {
            const idx = (i - j + numPoints) % numPoints;
            if (!points[idx].type) {
              onCurvePoint = points[idx];
              break;
            }
          }
        }

        if (!onCurvePoint) continue;

        // Calculate metrics
        const { distance, angle } = calculateDistanceAndAngle(onCurvePoint, point);

        // Build label text based on visibility settings
        const labelParts = [];

        if (showDistance) {
          labelParts.push(distance.toFixed(1));
        }

        // Calculate tension if we have a full cubic segment and tension is enabled
        if (showTension && otherOffCurve && otherOnCurve) {
          const tension = calculateTension(onCurvePoint, point, otherOffCurve, otherOnCurve);
          labelParts.push(tension.toFixed(2));
        }

        if (showAngle) {
          labelParts.push(`${angle.toFixed(1)}°`);
        }

        if (labelParts.length === 0) continue;

        const labelText = labelParts.join("\n");

        // Draw label text offset from the handle point
        drawLabelText(context, point, labelText, 10, 0, parameters);
      }
    }
  },
});

// ============================================================
// Skeleton Tunni Lines and Points visualization
// ============================================================

/**
 * Draw a filled diamond node.
 */
function fillDiamondNode(context, pt, size) {
  const halfSize = size / 2;
  context.beginPath();
  context.moveTo(pt.x, pt.y - halfSize);
  context.lineTo(pt.x + halfSize, pt.y);
  context.lineTo(pt.x, pt.y + halfSize);
  context.lineTo(pt.x - halfSize, pt.y);
  context.closePath();
  context.fill();
}

// Skeleton Tunni Lines and Points Layer
registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.tunni",
  name: "Skeleton Tunni Lines",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: false,
  zIndex: 548, // Between handles (545) and nodes (550)
  screenParameters: {
    strokeWidth: 1,
    dashPattern: [5, 5],
    tunniPointSize: 5,
    trueTunniPointSize: 4,
  },
  colors: {
    lineColor: "#0000FF80", // Semi-transparent blue
    tunniPointColor: "#0000FF", // Blue for midpoint
    trueTunniPointColor: "#FF8C00", // Orange for intersection
  },
  colorsDarkMode: {
    lineColor: "#00FFFF80", // Semi-transparent cyan
    tunniPointColor: "#00FFFF", // Cyan for midpoint
    trueTunniPointColor: "#FFA500", // Orange for intersection
  },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, model);
    if (!skeletonData?.contours?.length) {
      return;
    }

    // Draw Tunni lines and points for each contour
    for (const contour of skeletonData.contours) {
      const segments = buildSegmentsFromSkeletonPoints(contour.points, contour.isClosed);

      for (const segment of segments) {
        // Only draw for cubic segments (2 control points)
        if (segment.controlPoints.length !== 2) continue;

        const [cp1, cp2] = segment.controlPoints;
        const { startPoint, endPoint } = segment;

        // Draw dashed lines from on-curve to off-curve points
        context.strokeStyle = parameters.lineColor;
        context.lineWidth = parameters.strokeWidth;
        context.setLineDash(parameters.dashPattern);

        // Line from start on-curve to first control point
        strokeLine(context, startPoint.x, startPoint.y, cp1.x, cp1.y);

        // Line from end on-curve to second control point
        strokeLine(context, endPoint.x, endPoint.y, cp2.x, cp2.y);

        // Line between control points
        strokeLine(context, cp1.x, cp1.y, cp2.x, cp2.y);

        context.setLineDash([]);

        // Draw Tunni Point (midpoint) - blue circle
        const tunniPt = calculateSkeletonTunniPoint(segment);
        if (tunniPt) {
          context.fillStyle = parameters.tunniPointColor;
          fillRoundNode(context, tunniPt, parameters.tunniPointSize);
        }

        // Draw True Tunni Point (intersection) - orange diamond
        const trueTunniPt = calculateSkeletonTrueTunniPoint(segment);
        if (trueTunniPt) {
          context.fillStyle = parameters.trueTunniPointColor;
          fillDiamondNode(context, trueTunniPt, parameters.trueTunniPointSize);
        }
      }
    }
  },
});

