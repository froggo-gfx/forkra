import {
  calculateNormalAtSkeletonPoint,
  getSkeletonData,
  getSkeletonPointHalfWidth,
  getSkeletonPointNudge,
  projectSkeletonRibPoint,
} from "@fontra/core/skeleton-model.js";

import {
  fillRoundNode,
  glyphSelector,
  registerVisualizationLayerDefinition,
  strokeLine,
} from "./visualization-layer-definitions.js";

function getSkeletonDataFromGlyph(positionedGlyph, model) {
  const editLayerName =
    model.sceneSettings?.editLayerName || positionedGlyph.glyph?.layerName;
  const layerGlyph =
    editLayerName && positionedGlyph.varGlyph?.glyph?.layers?.[editLayerName]?.glyph;
  return getSkeletonData(layerGlyph || positionedGlyph.glyph);
}

function getOnCurvePointIndices(contour) {
  const indices = [];
  for (let i = 0; i < contour.points.length; i++) {
    if (!contour.points[i].type) {
      indices.push(i);
    }
  }
  return indices;
}

function skeletonContourToPath2d(contour) {
  const path = new Path2D();
  const points = contour.points || [];
  const onCurveIndices = getOnCurvePointIndices(contour);
  if (!onCurveIndices.length) {
    return path;
  }

  const firstIndex = onCurveIndices[0];
  path.moveTo(points[firstIndex].x, points[firstIndex].y);

  let i = firstIndex + 1;
  const limit = contour.closed ? firstIndex + points.length + 1 : points.length;
  while (i < limit) {
    const point = points[i % points.length];
    if (!point.type) {
      path.lineTo(point.x, point.y);
      i += 1;
      continue;
    }

    const next = points[(i + 1) % points.length];
    const afterNext = points[(i + 2) % points.length];
    if (
      point.type === "cubic" &&
      next?.type === "cubic" &&
      afterNext &&
      !afterNext.type
    ) {
      path.bezierCurveTo(point.x, point.y, next.x, next.y, afterNext.x, afterNext.y);
      i += 3;
      continue;
    }
    if ((point.type === "quad" || point.type === "cubic") && next && !next.type) {
      path.quadraticCurveTo(point.x, point.y, next.x, next.y);
      i += 2;
      continue;
    }
    i += 1;
  }

  if (contour.closed) {
    path.closePath();
  }
  return path;
}

function getEditableSide(point, side) {
  if (point.editable && typeof point.editable === "object") {
    return point.editable[side] === true;
  }
  return point[`${side}Editable`] === true;
}

function getRibPoints(contour, pointIndex) {
  const point = contour.points[pointIndex];
  const normal = calculateNormalAtSkeletonPoint(contour, pointIndex);
  const defaultWidth = contour.defaultWidth;
  const leftHalfWidth = getSkeletonPointHalfWidth(point, defaultWidth, "left");
  const rightHalfWidth = getSkeletonPointHalfWidth(point, defaultWidth, "right");
  const isSingleSided =
    contour.singleSided === "left" || contour.singleSided === "right";

  if (isSingleSided) {
    const side = contour.singleSided;
    const totalWidth = leftHalfWidth + rightHalfWidth;
    const editable = getEditableSide(point, side);
    const nudge =
      editable && totalWidth >= 0.5
        ? getSkeletonPointNudge(point, side, defaultWidth)
        : 0;
    return {
      center: point,
      left:
        side === "left"
          ? projectSkeletonRibPoint(point, normal, totalWidth, "left", nudge)
          : point,
      leftEditable: side === "left" && editable,
      right:
        side === "right"
          ? projectSkeletonRibPoint(point, normal, totalWidth, "right", nudge)
          : point,
      rightEditable: side === "right" && editable,
    };
  }

  const leftEditable = getEditableSide(point, "left");
  const rightEditable = getEditableSide(point, "right");
  const leftNudge =
    leftEditable && leftHalfWidth >= 0.5
      ? getSkeletonPointNudge(point, "left", defaultWidth)
      : 0;
  const rightNudge =
    rightEditable && rightHalfWidth >= 0.5
      ? getSkeletonPointNudge(point, "right", defaultWidth)
      : 0;
  return {
    center: point,
    left: projectSkeletonRibPoint(point, normal, leftHalfWidth, "left", leftNudge),
    leftEditable,
    right: projectSkeletonRibPoint(point, normal, rightHalfWidth, "right", rightNudge),
    rightEditable,
  };
}

function drawDiamondNode(context, point, size, fill) {
  const half = size / 2;
  context.beginPath();
  context.moveTo(point.x, point.y - half);
  context.lineTo(point.x + half, point.y);
  context.lineTo(point.x, point.y + half);
  context.lineTo(point.x - half, point.y);
  context.closePath();
  if (fill) {
    context.fill();
  }
  context.stroke();
}

function fillSquareNode(context, point, size) {
  context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
}

function forEachSkeletonContour(positionedGlyph, model, callback) {
  const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, model);
  if (!skeletonData?.contours?.length) {
    return;
  }
  for (const contour of skeletonData.contours) {
    if (contour.points?.length) {
      callback(contour);
    }
  }
}

registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.width-shading",
  name: "Skeleton width shading",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 446,
  colors: {
    fillColor: "rgba(34, 121, 210, 0.12)",
  },
  colorsDarkMode: {
    fillColor: "rgba(95, 178, 255, 0.18)",
  },
  draw: (context, positionedGlyph, parameters, model) => {
    context.fillStyle = parameters.fillColor;
    forEachSkeletonContour(positionedGlyph, model, (contour) => {
      const onCurveIndices = getOnCurvePointIndices(contour);
      const segmentCount = contour.closed
        ? onCurveIndices.length
        : onCurveIndices.length - 1;
      for (let i = 0; i < segmentCount; i++) {
        const a = getRibPoints(contour, onCurveIndices[i]);
        const b = getRibPoints(
          contour,
          onCurveIndices[(i + 1) % onCurveIndices.length]
        );
        context.beginPath();
        context.moveTo(a.left.x, a.left.y);
        context.lineTo(b.left.x, b.left.y);
        context.lineTo(b.right.x, b.right.y);
        context.lineTo(a.right.x, a.right.y);
        context.closePath();
        context.fill();
      }
    });
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.ribs",
  name: "Skeleton ribs",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 452,
  screenParameters: {
    endpointSize: 5,
    strokeWidth: 1,
  },
  colors: {
    endpointColor: "rgba(34, 121, 210, 0.65)",
    strokeColor: "rgba(34, 121, 210, 0.45)",
  },
  colorsDarkMode: {
    endpointColor: "rgba(95, 178, 255, 0.75)",
    strokeColor: "rgba(95, 178, 255, 0.55)",
  },
  draw: (context, positionedGlyph, parameters, model) => {
    context.lineWidth = parameters.strokeWidth;
    context.strokeStyle = parameters.strokeColor;
    context.fillStyle = parameters.endpointColor;
    forEachSkeletonContour(positionedGlyph, model, (contour) => {
      for (const pointIndex of getOnCurvePointIndices(contour)) {
        const rib = getRibPoints(contour, pointIndex);
        strokeLine(context, rib.left.x, rib.left.y, rib.right.x, rib.right.y);
        fillRoundNode(context, rib.left, parameters.endpointSize);
        fillRoundNode(context, rib.right, parameters.endpointSize);
      }
    });
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.centerline",
  name: "Skeleton centerline",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 455,
  screenParameters: {
    strokeWidth: 1.5,
  },
  colors: {
    strokeColor: "#2279d2",
  },
  colorsDarkMode: {
    strokeColor: "#5fb2ff",
  },
  draw: (context, positionedGlyph, parameters, model) => {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = parameters.strokeWidth;
    context.strokeStyle = parameters.strokeColor;
    forEachSkeletonContour(positionedGlyph, model, (contour) => {
      context.stroke(skeletonContourToPath2d(contour));
    });
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.handles",
  name: "Skeleton handles",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 545,
  screenParameters: {
    strokeWidth: 1,
  },
  colors: {
    strokeColor: "rgba(34, 121, 210, 0.55)",
  },
  colorsDarkMode: {
    strokeColor: "rgba(95, 178, 255, 0.65)",
  },
  draw: (context, positionedGlyph, parameters, model) => {
    context.lineWidth = parameters.strokeWidth;
    context.strokeStyle = parameters.strokeColor;
    forEachSkeletonContour(positionedGlyph, model, (contour) => {
      const points = contour.points;
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        if (!point.type) {
          continue;
        }
        const previous = points[(i - 1 + points.length) % points.length];
        const next = points[(i + 1) % points.length];
        if (previous && !previous.type) {
          strokeLine(context, previous.x, previous.y, point.x, point.y);
        } else if (previous?.type && next && !next.type) {
          strokeLine(context, next.x, next.y, point.x, point.y);
        }
      }
    });
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.nodes",
  name: "Skeleton nodes",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 550,
  screenParameters: {
    cornerSize: 7,
    handleSize: 5,
    smoothSize: 7,
  },
  colors: {
    fillColor: "#2279d2",
  },
  colorsDarkMode: {
    fillColor: "#5fb2ff",
  },
  draw: (context, positionedGlyph, parameters, model) => {
    context.fillStyle = parameters.fillColor;
    forEachSkeletonContour(positionedGlyph, model, (contour) => {
      for (const point of contour.points) {
        if (point.type) {
          fillRoundNode(context, point, parameters.handleSize);
        } else if (point.smooth) {
          fillRoundNode(context, point, parameters.smoothSize);
        } else {
          fillSquareNode(context, point, parameters.cornerSize);
        }
      }
    });
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.insert-handles-preview",
  name: "Skeleton insert handles preview",
  selectionFunc: glyphSelector("editing"),
  zIndex: 565,
  screenParameters: {
    nodeSize: 5,
  },
  colors: {
    fillColor: "rgba(34, 121, 210, 0.6)",
  },
  colorsDarkMode: {
    fillColor: "rgba(95, 178, 255, 0.7)",
  },
  draw: (context, positionedGlyph, parameters, model) => {
    const preview = model.skeletonInsertHandles;
    if (!preview?.points?.length) {
      return;
    }
    context.fillStyle = parameters.fillColor;
    for (const point of preview.points) {
      fillRoundNode(context, point, parameters.nodeSize);
    }
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.editable-markers",
  name: "Skeleton editable markers",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 560,
  screenParameters: {
    pointSize: 11,
    strokeWidth: 2,
  },
  colors: {
    fillColor: "rgba(161, 73, 184, 0.22)",
    strokeColor: "rgba(161, 73, 184, 0.95)",
  },
  colorsDarkMode: {
    fillColor: "rgba(199, 119, 221, 0.28)",
    strokeColor: "rgba(199, 119, 221, 0.95)",
  },
  draw: (context, positionedGlyph, parameters, model) => {
    context.lineWidth = parameters.strokeWidth;
    context.strokeStyle = parameters.strokeColor;
    context.fillStyle = parameters.fillColor;
    forEachSkeletonContour(positionedGlyph, model, (contour) => {
      for (const pointIndex of getOnCurvePointIndices(contour)) {
        const rib = getRibPoints(contour, pointIndex);
        if (rib.leftEditable) {
          drawDiamondNode(context, rib.left, parameters.pointSize, true);
        }
        if (rib.rightEditable) {
          drawDiamondNode(context, rib.right, parameters.pointSize, true);
        }
      }
    });
  },
});
