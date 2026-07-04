import {
  calculateNormalAtSkeletonPoint,
  getSkeletonPointHalfWidth,
  setSkeletonPointSideWidth,
} from "./skeleton-model.js";

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
