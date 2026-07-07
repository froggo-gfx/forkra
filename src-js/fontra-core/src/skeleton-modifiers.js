import {
  calculateNormalAtSkeletonPoint,
  getSkeletonHandleOffset,
  getSkeletonPointHalfWidth,
  setSkeletonHandleOffset,
  setSkeletonPointSideWidth,
} from "./skeleton-model.js";
import { dotVector, normalizeVector, subVectors, vectorLength } from "./vector.js";

export function applyFixedRibDelta(
  originalSkeletonData,
  workingSkeletonData,
  selectedPointKeys,
  clickedPointKey,
  delta,
  { compress = false, scaleControlPoints = true, round = Math.round } = {}
) {
  const clicked = parseSkeletonPointKey(clickedPointKey);
  if (!clicked || !selectedPointKeys?.size) {
    return false;
  }
  const clickedAddress = getSkeletonPointAddress(
    originalSkeletonData,
    clicked.contourId,
    clicked.pointId
  );
  if (!clickedAddress || clickedAddress.point.type) {
    return false;
  }

  const clickedNormal = calculateNormalAtSkeletonPoint(
    clickedAddress.contour,
    clickedAddress.pointIndex
  );
  const normalLength = Math.hypot(clickedNormal.x, clickedNormal.y);
  if (!(normalLength > 1e-6)) {
    return false;
  }
  const projectedDelta = delta.x * clickedNormal.x + delta.y * clickedNormal.y;
  const selected = collectSelectedPointKeys(selectedPointKeys);
  let changed = false;

  for (const [contourId, pointIds] of selected) {
    const originalContourAddress = getSkeletonContourAddress(
      originalSkeletonData,
      contourId
    );
    const workingContourAddress = getSkeletonContourAddress(
      workingSkeletonData,
      contourId
    );
    if (!originalContourAddress || !workingContourAddress) {
      continue;
    }
    const originalContour = originalContourAddress.contour;
    const workingContour = workingContourAddress.contour;
    const anchorSide = getFixedRibAnchorSide(originalContour, projectedDelta, compress);
    const pointDeltas = new Map();
    for (const pointId of pointIds) {
      const originalPointIndex = originalContour.points.findIndex(
        (point) => point.id === pointId
      );
      const originalPoint = originalContour.points[originalPointIndex];
      const workingPoint = workingContour.points?.[originalPointIndex];
      if (!originalPoint || !workingPoint || originalPoint.type) {
        continue;
      }
      const normal = calculateNormalAtSkeletonPoint(
        originalContour,
        originalPointIndex
      );
      const pointDelta = {
        x: normal.x * projectedDelta,
        y: normal.y * projectedDelta,
      };
      pointDeltas.set(originalPointIndex, pointDelta);
      workingPoint.x = round(originalPoint.x + pointDelta.x);
      workingPoint.y = round(originalPoint.y + pointDelta.y);
      applyFixedRibWidthDelta(
        workingPoint,
        originalPoint,
        originalContour.defaultWidth,
        anchorSide,
        projectedDelta,
        round
      );
      changed = true;
    }
    if (scaleControlPoints && pointDeltas.size) {
      moveControlPointsWithFixedRibSegments(
        originalContour,
        workingContour,
        pointDeltas,
        round
      );
    }
  }
  return changed;
}

function moveControlPointsWithFixedRibSegments(
  originalContour,
  workingContour,
  pointDeltas,
  round
) {
  const points = originalContour.points || [];
  const onCurveIndices = points
    .map((point, index) => (point?.type ? null : index))
    .filter((index) => index !== null);
  const segmentCount = originalContour.closed
    ? onCurveIndices.length
    : onCurveIndices.length - 1;
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
    const startIndex = onCurveIndices[segmentIndex];
    const endIndex = onCurveIndices[(segmentIndex + 1) % onCurveIndices.length];
    const startDelta = pointDeltas.get(startIndex);
    const endDelta = pointDeltas.get(endIndex);
    if (!startDelta && !endDelta) {
      continue;
    }
    const controlIndices = getControlPointIndicesBetween(
      points,
      startIndex,
      endIndex,
      originalContour.closed
    );
    for (let i = 0; i < controlIndices.length; i++) {
      const controlIndex = controlIndices[i];
      const originalPoint = points[controlIndex];
      const workingPoint = workingContour.points?.[controlIndex];
      if (!originalPoint || !workingPoint) {
        continue;
      }
      const t = controlIndices.length === 1 ? 0.5 : i / (controlIndices.length - 1);
      const dx = interpolateDelta(startDelta?.x || 0, endDelta?.x || 0, t);
      const dy = interpolateDelta(startDelta?.y || 0, endDelta?.y || 0, t);
      workingPoint.x = round(originalPoint.x + dx);
      workingPoint.y = round(originalPoint.y + dy);
    }
  }
}

function getControlPointIndicesBetween(points, startIndex, endIndex, closed) {
  const indices = [];
  let index = startIndex + 1;
  while (index !== endIndex) {
    if (index >= points.length) {
      if (!closed) {
        break;
      }
      index = 0;
      if (index === endIndex) {
        break;
      }
    }
    if (points[index]?.type) {
      indices.push(index);
    }
    index++;
  }
  return indices;
}

function interpolateDelta(a, b, t) {
  return a + (b - a) * t;
}

export function getSkeletonHandleEqualizeInfo(contour, pointIdOrIndex) {
  const points = contour?.points || [];
  const handleIndex = resolvePointIndex(contour, pointIdOrIndex);
  const handle = points[handleIndex];
  if (!handle?.type) {
    return null;
  }
  const previousIndex = getPreviousPointIndex(contour, handleIndex);
  const nextIndex = getNextPointIndex(contour, handleIndex);
  const previous = points[previousIndex];
  const next = points[nextIndex];
  let smoothIndex;
  let oppositeIndex;
  if (previous && !previous.type && previous.smooth) {
    smoothIndex = previousIndex;
    oppositeIndex = getNextPointIndex(contour, handleIndex);
  } else if (next && !next.type && next.smooth) {
    smoothIndex = nextIndex;
    oppositeIndex = getPreviousPointIndex(contour, handleIndex);
  } else {
    return null;
  }
  const smoothPoint = points[smoothIndex];
  const oppositePoint = points[oppositeIndex];
  if (!smoothPoint || !oppositePoint?.type) {
    return null;
  }
  return {
    smoothPointId: smoothPoint.id,
    oppositePointId: oppositePoint.id,
    smoothIndex,
    oppositeIndex,
  };
}

export function equalizeSkeletonHandleToPoint(
  contour,
  pointId,
  currentPoint,
  { constrain = false, round = Math.round } = {}
) {
  const handleIndex = resolvePointIndex(contour, pointId);
  const handle = contour?.points?.[handleIndex];
  const info = getSkeletonHandleEqualizeInfo(contour, handleIndex);
  if (!handle || !info) {
    return false;
  }
  const smooth = contour.points[info.smoothIndex];
  const vector = constrainVector(
    {
      x: currentPoint.x - smooth.x,
      y: currentPoint.y - smooth.y,
    },
    constrain
  );
  handle.x = round(smooth.x + vector.x);
  handle.y = round(smooth.y + vector.y);
  const opposite = contour.points[info.oppositeIndex];
  opposite.x = round(smooth.x - vector.x);
  opposite.y = round(smooth.y - vector.y);
  return true;
}

export function equalizeSkeletonHandleFromDelta(
  contour,
  pointId,
  delta,
  { constrain = false, round = Math.round } = {}
) {
  const handleIndex = resolvePointIndex(contour, pointId);
  const handle = contour?.points?.[handleIndex];
  const info = getSkeletonHandleEqualizeInfo(contour, handleIndex);
  if (!handle || !info) {
    return false;
  }
  const movedPoint = {
    x: handle.x + delta.x,
    y: handle.y + delta.y,
  };
  if (constrain) {
    return equalizeSkeletonHandleToPoint(contour, handleIndex, movedPoint, {
      constrain,
      round,
    });
  }
  const smooth = contour.points[info.smoothIndex];
  handle.x = round(movedPoint.x);
  handle.y = round(movedPoint.y);
  const draggedVector = {
    x: handle.x - smooth.x,
    y: handle.y - smooth.y,
  };
  const draggedLength = vectorLength(draggedVector);
  const opposite = contour.points[info.oppositeIndex];
  const oppositeVector = {
    x: opposite.x - smooth.x,
    y: opposite.y - smooth.y,
  };
  const oppositeDirection = normalizeVector(oppositeVector);
  if (!vectorLength(oppositeDirection)) {
    opposite.x = round(smooth.x - draggedVector.x);
    opposite.y = round(smooth.y - draggedVector.y);
  } else {
    opposite.x = round(smooth.x + oppositeDirection.x * draggedLength);
    opposite.y = round(smooth.y + oppositeDirection.y * draggedLength);
  }
  return true;
}

// Equalize the two generated handles of one rib side around the rib point
// (parity with the skeleton-point handle equalize around a smooth point): the
// dragged handle moves (projected along the skeleton handle direction, or
// freely when detached) and the opposite handle takes the SAME distance from
// the rib point along its own direction. Works in absolute positions from
// `geometry` (captured from the pre-drag path) — offsets alone can't
// equalize, because the on-canvas handle length is |base + offset| and the
// two bases differ.
export function equalizeEditableGeneratedHandleOffsets(
  point,
  side,
  role,
  delta,
  geometry,
  { round = Math.round } = {}
) {
  const oppositeRole = role === "in" ? "out" : "in";
  const { ribPos, draggedPos, oppositePos, draggedBase, oppositeBase } = geometry;
  if (!ribPos || !draggedPos || !oppositePos || !draggedBase || !oppositeBase) {
    return false;
  }
  let moved;
  if (geometry.draggedDetached === true) {
    moved = { x: draggedPos.x + delta.x, y: draggedPos.y + delta.y };
  } else {
    const draggedDirection = normalizeVector(
      geometry.draggedDirection || { x: 0, y: 0 }
    );
    if (!vectorLength(draggedDirection)) {
      return false;
    }
    const projected = dotVector(delta, draggedDirection);
    moved = {
      x: draggedPos.x + draggedDirection.x * projected,
      y: draggedPos.y + draggedDirection.y * projected,
    };
  }
  const length = vectorLength(subVectors(moved, ribPos));
  const oppositeDirection = normalizeVector(subVectors(oppositePos, ribPos));
  if (!vectorLength(oppositeDirection)) {
    return false;
  }
  const newOpposite = {
    x: ribPos.x + oppositeDirection.x * length,
    y: ribPos.y + oppositeDirection.y * length,
  };
  setSkeletonHandleOffset(point, side, role, {
    x: round(moved.x - draggedBase.x),
    y: round(moved.y - draggedBase.y),
    detached: geometry.draggedDetached === true,
  });
  setSkeletonHandleOffset(point, side, oppositeRole, {
    x: round(newOpposite.x - oppositeBase.x),
    y: round(newOpposite.y - oppositeBase.y),
    detached: geometry.oppositeDetached === true,
  });
  return true;
}

function resolvePointIndex(contour, pointIdOrIndex) {
  const points = contour?.points || [];
  if (
    Number.isInteger(pointIdOrIndex) &&
    pointIdOrIndex >= 0 &&
    pointIdOrIndex < points.length
  ) {
    return pointIdOrIndex;
  }
  return points.findIndex((point) => point.id === pointIdOrIndex);
}

function getPreviousPointIndex(contour, pointIndex) {
  if (pointIndex > 0) {
    return pointIndex - 1;
  }
  return contour?.closed ? (contour.points || []).length - 1 : -1;
}

function getNextPointIndex(contour, pointIndex) {
  if (pointIndex < (contour?.points || []).length - 1) {
    return pointIndex + 1;
  }
  return contour?.closed ? 0 : -1;
}

function constrainVector(vector, constrain) {
  if (!constrain) {
    return vector;
  }
  const length = vectorLength(vector);
  if (!length) {
    return vector;
  }
  const angle = Math.atan2(vector.y, vector.x);
  const step = Math.PI / 4;
  const constrainedAngle = Math.round(angle / step) * step;
  return {
    x: Math.cos(constrainedAngle) * length,
    y: Math.sin(constrainedAngle) * length,
  };
}

function applyFixedRibWidthDelta(
  workingPoint,
  originalPoint,
  defaultWidth,
  anchorSide,
  projectedDelta,
  round
) {
  const linked = originalPoint.width?.linked !== false;
  const side = anchorSide;
  const originalHalfWidth = getSkeletonPointHalfWidth(
    originalPoint,
    defaultWidth,
    side
  );
  const widthDelta = anchorSide === "left" ? -projectedDelta : projectedDelta;
  setSkeletonPointSideWidth(
    workingPoint,
    defaultWidth,
    side,
    Math.max(1, originalHalfWidth + widthDelta),
    { linked, round }
  );
}

function getFixedRibAnchorSide(contour, projectedDelta, compress) {
  if (contour.singleSided === "left" || contour.singleSided === "right") {
    return contour.singleSided;
  }
  if (compress) {
    return projectedDelta >= 0 ? "left" : "right";
  }
  return projectedDelta >= 0 ? "right" : "left";
}

function collectSelectedPointKeys(selectedPointKeys) {
  const selected = new Map();
  for (const key of selectedPointKeys) {
    const parsed = parseSkeletonPointKey(key);
    if (!parsed) {
      continue;
    }
    if (!selected.has(parsed.contourId)) {
      selected.set(parsed.contourId, new Set());
    }
    selected.get(parsed.contourId).add(parsed.pointId);
  }
  return selected;
}

function getSkeletonContourAddress(skeletonData, contourId) {
  const contourIndex = (skeletonData?.contours || []).findIndex(
    (contour) => contour.id === contourId
  );
  if (contourIndex < 0) {
    return null;
  }
  return { contour: skeletonData.contours[contourIndex], contourIndex };
}

function getSkeletonPointAddress(skeletonData, contourId, pointId) {
  const contourAddress = getSkeletonContourAddress(skeletonData, contourId);
  if (!contourAddress) {
    return null;
  }
  const pointIndex = (contourAddress.contour.points || []).findIndex(
    (point) => point.id === pointId
  );
  if (pointIndex < 0) {
    return null;
  }
  return {
    ...contourAddress,
    point: contourAddress.contour.points[pointIndex],
    pointIndex,
  };
}

function parseSkeletonPointKey(key) {
  if (!key) {
    return null;
  }
  const parts = `${key}`.split("/");
  if (parts[0] === "skeletonPoint") {
    parts.shift();
  }
  if (parts.length !== 2) {
    return null;
  }
  const contourId = Number(parts[0]);
  const pointId = Number(parts[1]);
  if (!Number.isInteger(contourId) || !Number.isInteger(pointId)) {
    return null;
  }
  return { contourId, pointId };
}
