import { distance, subVectors, normalizeVector } from "@fontra/core/vector.js";
import { getSkeletonData } from "@fontra/core/skeleton-contour-generator.js";
import {
  snapToGrid,
  calculateTunniPoint,
  calculateTrueTunniPoint,
  calculateEqualizedControlPoints,
  areDistancesEqualized,
} from "@fontra/core/tunni-calculations.js";

function getSkeletonGeneratedContourIndexSet(positionedGlyph, editLayerName) {
  const layerName = editLayerName || positionedGlyph?.glyph?.layerName;
  const layer = positionedGlyph?.varGlyph?.glyph?.layers?.[layerName];
  const indices = getSkeletonData(layer)?.generatedContourIndices || [];
  return new Set(indices);
}

/**
 * Finds if a point is hitting a Tunni point within a given size margin
 * @param {Object} point - The point to check
 * @param {number} size - The size margin to check within
 * @param {Object} positionedGlyph - The positioned glyph containing the path
 * @param {Function} calculateTunniPointFn - Function to calculate Tunni point from segment
 * @param {Function} distanceFn - Function to calculate distance between two points
 * @returns {Object|null} Object with tunniPoint, segment, and segmentPoints if hit, null otherwise
 */
export function findTunniPointHit(
  point,
  size,
  positionedGlyph,
  calculateTunniPointFn,
  distanceFn,
  options = {}
) {
  if (!positionedGlyph) {
    return null;
  }

  const path = positionedGlyph.glyph.path;
  const generatedContourIndices = getSkeletonGeneratedContourIndexSet(
    positionedGlyph,
    options.editLayerName
  );

  const glyphPoint = point;

  for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
    if (generatedContourIndices.has(contourIndex)) {
      continue;
    }
    for (const segment of path.iterContourDecomposedSegments(contourIndex)) {
      if (segment.points.length === 4) {
        const pointTypes = segment.parentPointIndices.map(
          (index) => path.pointTypes[index]
        );

        if (pointTypes[1] === 2 && pointTypes[2] === 2) {
          const trueTunniPoint = calculateTrueTunniPoint(segment.points);
          const visualTunniPoint = calculateTunniPointFn(segment.points);

          if (trueTunniPoint && distanceFn(glyphPoint, trueTunniPoint) <= size) {
            return {
              tunniPoint: trueTunniPoint,
              segment: segment,
              segmentPoints: segment.points,
            };
          }

          if (visualTunniPoint && distanceFn(glyphPoint, visualTunniPoint) <= size) {
            return {
              tunniPoint: visualTunniPoint,
              segment: segment,
              segmentPoints: segment.points,
            };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Equalizes the distances of control points in a segment using arithmetic mean
 * @param {Object} point - The point where the mouse was clicked
 * @param {number} size - The click margin size
 * @param {Object} sceneModel - The scene model to access positioned glyph
 * @param {Function} findTunniPointHitFn - Function to find if point hits a Tunni point
 * @param {Function} equalizeSegmentDistancesFn - Function to equalize distances in a segment
 */
export async function handleEqualizeDistances(
  point,
  size,
  sceneModel,
  findTunniPointHitFn,
  equalizeSegmentDistancesFn
) {
  const positionedGlyph = sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph?.glyph?.path) {
    return;
  }
  const hit = findTunniPointHitFn(
    point,
    size,
    positionedGlyph,
    calculateTunniPoint,
    distance,
    {
      editLayerName: sceneModel.sceneSettings?.editLayerName,
    }
  );
  if (hit) {
    await equalizeSegmentDistancesFn(hit.segment, hit.segmentPoints, sceneModel, positionedGlyph);
    return;
  }

  const pathHit = sceneModel.pathHitAtPoint(point, size);
  const generatedContourIndices = getSkeletonGeneratedContourIndexSet(
    positionedGlyph,
    sceneModel.sceneSettings?.editLayerName
  );
  if (pathHit.segment?.parentPointIndices?.length) {
    const [hitContourIndex] = positionedGlyph.glyph.path.getContourAndPointIndex(
      pathHit.segment.parentPointIndices[0]
    );
    if (generatedContourIndices.has(hitContourIndex)) {
      return;
    }
  }
  if (pathHit.segment && pathHit.segment.points.length === 4) {
    const pointTypes = pathHit.segment.parentPointIndices.map(
      (index) => sceneModel.getSelectedPositionedGlyph().glyph.path.pointTypes[index]
    );

    if (pointTypes[1] === 2 && pointTypes[2] === 2) {
      await equalizeSegmentDistancesFn(
        pathHit.segment,
        pathHit.segment.points,
        sceneModel,
        positionedGlyph
      );
    }
  }
}

/**
 * Equalize the distances of control points in a segment using arithmetic mean
 * @param {Object} segment - The segment to modify
 * @param {Array} segmentPoints - Array of 4 points: [start, control1, control2, end]
 * @param {Object} sceneController - The scene controller to perform edits
 */
export async function equalizeSegmentDistances(
  segment,
  segmentPoints,
  sceneModel,
  positionedGlyph,
  sceneController
) {
  if (areDistancesEqualized(segmentPoints)) {
    return;
  }

  const newControlPoints = calculateEqualizedControlPoints(segmentPoints);

  try {
    await sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      for (const layerGlyph of Object.values(layerGlyphs)) {
        const path = layerGlyph.path;

        if (!path || !segment?.parentPointIndices) {
          return "Equalize Control Point Distances";
        }

        const controlPoint1Index = segment.parentPointIndices[1];
        const controlPoint2Index = segment.parentPointIndices[2];

        if (controlPoint1Index === undefined || controlPoint2Index === undefined) {
          return "Equalize Control Point Distances";
        }

        path.setPointPosition(controlPoint1Index, newControlPoints[0].x, newControlPoints[0].y);
        path.setPointPosition(controlPoint2Index, newControlPoints[1].x, newControlPoints[1].y);
      }
      return "Equalize Control Point Distances";
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Quantize the control points (handles) of a cubic segment to integer grid positions.
 * @param {Object} segment - The segment containing parent point indices
 * @param {Object} sceneController - Scene controller to perform edits
 */
export async function quantizeSegmentControlPoints(segment, sceneController) {
  try {
    await sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      let changed = false;
      for (const layerGlyph of Object.values(layerGlyphs)) {
        const path = layerGlyph.path;
        if (!path || !segment?.parentPointIndices) {
          continue;
        }

        const controlPoint1Index = segment.parentPointIndices[1];
        const controlPoint2Index = segment.parentPointIndices[2];
        if (controlPoint1Index === undefined || controlPoint2Index === undefined) {
          continue;
        }

        const cp1 = path.getPoint(controlPoint1Index);
        const cp2 = path.getPoint(controlPoint2Index);
        if (!cp1 || !cp2) {
          continue;
        }

        const q1 = snapToGrid(cp1);
        const q2 = snapToGrid(cp2);

        if (cp1.x !== q1.x || cp1.y !== q1.y) {
          path.setPointPosition(controlPoint1Index, q1.x, q1.y);
          changed = true;
        }
        if (cp2.x !== q2.x || cp2.y !== q2.y) {
          path.setPointPosition(controlPoint2Index, q2.x, q2.y);
          changed = true;
        }
      }
      return changed ? "Quantize Tunni Control Points" : undefined;
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Equalize control point distances first, then quantize both control points to grid.
 * Runs as a single recorded edit.
 * @param {Object} segment - The segment containing parent point indices
 * @param {Array} segmentPoints - Array of 4 points: [start, control1, control2, end]
 * @param {Object} sceneController - Scene controller to perform edits
 */
export async function equalizeThenQuantizeSegmentControlPoints(
  segment,
  segmentPoints,
  sceneController
) {
  try {
    const equalizedControlPoints = calculateEqualizedControlPoints(segmentPoints);
    const quantizedControlPoints = [
      snapToGrid(equalizedControlPoints[0]),
      snapToGrid(equalizedControlPoints[1]),
    ];

    await sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      let changed = false;
      for (const layerGlyph of Object.values(layerGlyphs)) {
        const path = layerGlyph.path;
        if (!path || !segment?.parentPointIndices) {
          continue;
        }

        const controlPoint1Index = segment.parentPointIndices[1];
        const controlPoint2Index = segment.parentPointIndices[2];
        if (controlPoint1Index === undefined || controlPoint2Index === undefined) {
          continue;
        }

        const cp1 = path.getPoint(controlPoint1Index);
        const cp2 = path.getPoint(controlPoint2Index);
        if (!cp1 || !cp2) {
          continue;
        }

        const q1 = quantizedControlPoints[0];
        const q2 = quantizedControlPoints[1];

        if (cp1.x !== q1.x || cp1.y !== q1.y) {
          path.setPointPosition(controlPoint1Index, q1.x, q1.y);
          changed = true;
        }
        if (cp2.x !== q2.x || cp2.y !== q2.y) {
          path.setPointPosition(controlPoint2Index, q2.x, q2.y);
          changed = true;
        }
      }

      return changed ? "Equalize and Quantize Tunni Control Points" : undefined;
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Handles mouse down event when clicking on a Tunni point
 * @param {Object} event - Mouse event
 * @param {Object} sceneController - Scene controller for scene access
 * @param {Object} visualizationLayerSettings - To check if Tunni layer is active
 * @returns {Object} Initial state for drag operation (initial mouse pos, vectors, etc.)
 */
export function handleTunniPointMouseDown(event, sceneController, visualizationLayerSettings) {
  if (
    !visualizationLayerSettings.model["fontra.tunni.combined"] &&
    !visualizationLayerSettings.model["fontra.tunni.actual.points"]
  ) {
    return null;
  }

  const point = sceneController.localPoint(event);
  const size = sceneController.mouseClickMargin;

  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return null;
  }

  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };

  const hit = tunniLayerHitTest(glyphPoint, size, positionedGlyph, {
    editLayerName: sceneController.sceneModel?.sceneSettings?.editLayerName,
  });
  if (!hit) {
    return null;
  }

  const segmentPoints = hit.segmentPoints;

  const initialOnPoint1 = { ...segmentPoints[0] };
  const initialOffPoint1 = { ...segmentPoints[1] };
  const initialOffPoint2 = { ...segmentPoints[2] };
  const initialOnPoint2 = { ...segmentPoints[3] };

  const initialVector1 = {
    x: initialOffPoint1.x - initialOnPoint1.x,
    y: initialOffPoint1.y - initialOnPoint1.y,
  };

  const initialVector2 = {
    x: initialOffPoint2.x - initialOnPoint2.x,
    y: initialOffPoint2.y - initialOnPoint2.y,
  };

  const length1 = Math.sqrt(initialVector1.x * initialVector1.x + initialVector1.y * initialVector1.y);
  const length2 = Math.sqrt(initialVector2.x * initialVector2.x + initialVector2.y * initialVector2.y);

  const unitVector1 =
    length1 > 0
      ? {
          x: initialVector1.x / length1,
          y: initialVector1.y / length1,
        }
      : { x: 1, y: 0 };

  const unitVector2 =
    length2 > 0
      ? {
          x: initialVector2.x / length2,
          y: initialVector2.y / length2,
        }
      : { x: 1, y: 0 };

  let fortyFiveVector = {
    x: (unitVector1.x + unitVector2.x) / 2,
    y: (unitVector1.y + unitVector2.y) / 2,
  };

  const fortyFiveLength = Math.sqrt(
    fortyFiveVector.x * fortyFiveVector.x + fortyFiveVector.y * fortyFiveVector.y
  );
  if (fortyFiveLength > 0) {
    fortyFiveVector.x /= fortyFiveLength;
    fortyFiveVector.y /= fortyFiveLength;
  }

  let originalControlPoints = null;
  if (positionedGlyph && positionedGlyph.glyph && positionedGlyph.glyph.path) {
    const path = positionedGlyph.glyph.path;
    const controlPoint1Index = hit.segment.parentPointIndices[1];
    const controlPoint2Index = hit.segment.parentPointIndices[2];
    if (controlPoint1Index !== undefined && controlPoint2Index !== undefined) {
      originalControlPoints = {
        controlPoint1Index: controlPoint1Index,
        controlPoint2Index: controlPoint2Index,
        originalControlPoint1: { ...path.getPoint(controlPoint1Index) },
        originalControlPoint2: { ...path.getPoint(controlPoint2Index) },
      };
    }
  }

  return {
    initialMousePosition: { ...glyphPoint },
    initialOnPoint1,
    initialOffPoint1,
    initialOffPoint2,
    initialOnPoint2,
    initialVector1,
    initialVector2,
    unitVector1,
    unitVector2,
    fortyFiveVector,
    selectedSegment: hit.segment,
    originalSegmentPoints: [...segmentPoints],
    originalControlPoints,
    tunniPointHit: hit,
  };
}

/**
 * Calculates new control points based on Tunni point movement during drag
 * @param {Object} event - Mouse event
 * @param {Object} initialState - Initial state from mouse down
 * @param {Object} sceneController - Scene controller for editing operations
 * @returns {Object} Object containing control point indices and new positions
 */
export function calculateTunniPointDragChanges(
  event,
  initialState,
  sceneController,
  gridSnapEnabled = false
) {
  if (
    !initialState ||
    !initialState.initialMousePosition ||
    !initialState.initialOffPoint1 ||
    !initialState.initialOffPoint2 ||
    !initialState.selectedSegment ||
    !initialState.originalSegmentPoints
  ) {
    return null;
  }

  const point = sceneController.localPoint(event);

  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return null;
  }

  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };

  const mouseDelta = {
    x: glyphPoint.x - initialState.initialMousePosition.x,
    y: glyphPoint.y - initialState.initialMousePosition.y,
  };

  const equalizeDistances = !event.altKey;

  let newControlPoint1;
  let newControlPoint2;

  if (equalizeDistances) {
    const projection =
      mouseDelta.x * initialState.fortyFiveVector.x +
      mouseDelta.y * initialState.fortyFiveVector.y;

    newControlPoint1 = {
      x: initialState.initialOffPoint1.x + initialState.unitVector1.x * projection,
      y: initialState.initialOffPoint1.y + initialState.unitVector1.y * projection,
    };

    newControlPoint2 = {
      x: initialState.initialOffPoint2.x + initialState.unitVector2.x * projection,
      y: initialState.initialOffPoint2.y + initialState.unitVector2.y * projection,
    };
  } else {
    const projection1 =
      mouseDelta.x * initialState.unitVector1.x + mouseDelta.y * initialState.unitVector1.y;
    const projection2 =
      mouseDelta.x * initialState.unitVector2.x + mouseDelta.y * initialState.unitVector2.y;

    newControlPoint1 = {
      x: initialState.initialOffPoint1.x + initialState.unitVector1.x * projection1,
      y: initialState.initialOffPoint1.y + initialState.unitVector1.y * projection1,
    };

    newControlPoint2 = {
      x: initialState.initialOffPoint2.x + initialState.unitVector2.x * projection2,
      y: initialState.initialOffPoint2.y + initialState.unitVector2.y * projection2,
    };
  }

  if (gridSnapEnabled) {
    newControlPoint1 = snapToGrid(newControlPoint1);
    newControlPoint2 = snapToGrid(newControlPoint2);
  }

  return {
    controlPoint1Index: initialState.selectedSegment.parentPointIndices[1],
    controlPoint2Index: initialState.selectedSegment.parentPointIndices[2],
    newControlPoint1: newControlPoint1,
    newControlPoint2: newControlPoint2,
  };
}

export function handleTunniPointMouseDrag(
  event,
  initialState,
  sceneController,
  gridSnapEnabled = false
) {
  return calculateTunniPointDragChanges(
    event,
    initialState,
    sceneController,
    gridSnapEnabled
  );
}

export function handleTunniPointMouseUp(initialState, sceneController) {
  if (!initialState || !initialState.selectedSegment || !initialState.originalControlPoints) {
    return null;
  }

  return {
    controlPoint1Index: initialState.originalControlPoints.controlPoint1Index,
    controlPoint2Index: initialState.originalControlPoints.controlPoint2Index,
    originalControlPoint1: initialState.originalControlPoints.originalControlPoint1,
    originalControlPoint2: initialState.originalControlPoints.originalControlPoint2,
  };
}

export function tunniLayerHitTest(point, size, positionedGlyph, options = {}) {
  if (!positionedGlyph || !positionedGlyph.glyph || !positionedGlyph.glyph.path) {
    return null;
  }

  const path = positionedGlyph.glyph.path;
  const generatedContourIndices = getSkeletonGeneratedContourIndexSet(
    positionedGlyph,
    options.editLayerName
  );

  const glyphPoint = point;

  for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
    if (generatedContourIndices.has(contourIndex)) {
      continue;
    }
    for (const segment of path.iterContourDecomposedSegments(contourIndex)) {
      if (segment.points.length === 4) {
        const pointTypes = segment.parentPointIndices.map(
          (index) => path.pointTypes[index]
        );

        if (pointTypes[1] === 2 && pointTypes[2] === 2) {
          const trueTunniPoint = calculateTrueTunniPoint(segment.points);
          const visualTunniPoint = calculateTunniPoint(segment.points);

          if (trueTunniPoint && distance(glyphPoint, trueTunniPoint) <= size) {
            return {
              tunniPoint: trueTunniPoint,
              segment: segment,
              segmentPoints: segment.points,
              contourIndex: contourIndex,
              hitType: "true-tunni-point",
            };
          }

          if (visualTunniPoint && distance(glyphPoint, visualTunniPoint) <= size) {
            return {
              tunniPoint: visualTunniPoint,
              segment: segment,
              segmentPoints: segment.points,
              contourIndex: contourIndex,
              hitType: "tunni-point",
            };
          }
        }
      }
    }
  }

  return null;
}

export function handleTrueTunniPointMouseDown(event, sceneController, visualizationLayerSettings) {
  if (
    !visualizationLayerSettings.model["fontra.tunni.combined"] &&
    !visualizationLayerSettings.model["fontra.tunni.actual.points"]
  ) {
    return null;
  }

  const point = sceneController.localPoint(event);
  const size = sceneController.mouseClickMargin;

  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return null;
  }

  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };

  const hit = tunniLayerHitTest(glyphPoint, size, positionedGlyph, {
    editLayerName: sceneController.sceneModel?.sceneSettings?.editLayerName,
  });
  if (!hit || hit.hitType !== "true-tunni-point") {
    return null;
  }

  const segmentPoints = hit.segmentPoints;

  const initialOnPoint1 = { ...segmentPoints[0] };
  const initialOffPoint1 = { ...segmentPoints[1] };
  const initialOffPoint2 = { ...segmentPoints[2] };
  const initialOnPoint2 = { ...segmentPoints[3] };

  const initialVector1 = {
    x: initialOffPoint1.x - initialOnPoint1.x,
    y: initialOffPoint1.y - initialOnPoint1.y,
  };

  const initialVector2 = {
    x: initialOffPoint2.x - initialOnPoint2.x,
    y: initialOffPoint2.y - initialOnPoint2.y,
  };

  const length1 = Math.sqrt(initialVector1.x * initialVector1.x + initialVector1.y * initialVector1.y);
  const length2 = Math.sqrt(initialVector2.x * initialVector2.x + initialVector2.y * initialVector2.y);

  const unitVector1 =
    length1 > 0
      ? {
          x: initialVector1.x / length1,
          y: initialVector1.y / length1,
        }
      : { x: 1, y: 0 };

  const unitVector2 =
    length2 > 0
      ? {
          x: initialVector2.x / length2,
          y: initialVector2.y / length2,
        }
      : { x: 1, y: 0 };

  let originalControlPoints = null;
  if (positionedGlyph && positionedGlyph.glyph && positionedGlyph.glyph.path) {
    const path = positionedGlyph.glyph.path;
    const controlPoint1Index = hit.segment.parentPointIndices[1];
    const controlPoint2Index = hit.segment.parentPointIndices[2];
    if (controlPoint1Index !== undefined && controlPoint2Index !== undefined) {
      originalControlPoints = {
        controlPoint1Index: controlPoint1Index,
        controlPoint2Index: controlPoint2Index,
        originalControlPoint1: { ...path.getPoint(controlPoint1Index) },
        originalControlPoint2: { ...path.getPoint(controlPoint2Index) },
      };
    }
  }

  return {
    initialMousePosition: { ...glyphPoint },
    initialOnPoint1,
    initialOffPoint1,
    initialOffPoint2,
    initialOnPoint2,
    initialVector1,
    initialVector2,
    unitVector1,
    unitVector2,
    selectedSegment: hit.segment,
    originalSegmentPoints: [...segmentPoints],
    originalControlPoints,
    tunniPointHit: hit,
    hitType: "true-tunni-point",
  };
}

export function calculateTrueTunniPointDragChanges(
  event,
  initialState,
  sceneController,
  gridSnapEnabled = false
) {
  if (
    !initialState ||
    !initialState.initialMousePosition ||
    !initialState.initialOnPoint1 ||
    !initialState.initialOnPoint2 ||
    !initialState.selectedSegment ||
    !initialState.originalSegmentPoints
  ) {
    return null;
  }

  const point = sceneController.localPoint(event);

  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return null;
  }

  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };

  const mouseDelta = {
    x: glyphPoint.x - initialState.initialMousePosition.x,
    y: glyphPoint.y - initialState.initialMousePosition.y,
  };

  const equalizeDistances = !event.altKey;

  const [p1, p2, p3, p4] = initialState.originalSegmentPoints;

  const dir1 = normalizeVector(subVectors(p2, p1));
  const dir2 = normalizeVector(subVectors(p3, p4));

  const projection1 = mouseDelta.x * dir1.x + mouseDelta.y * dir1.y;
  const projection2 = mouseDelta.x * dir2.x + mouseDelta.y * dir2.y;

  let finalProjection1;
  let finalProjection2;
  if (equalizeDistances) {
    const avgProjection = (projection1 + projection2) / 2;
    finalProjection1 = avgProjection;
    finalProjection2 = avgProjection;
  } else {
    finalProjection1 = projection1;
    finalProjection2 = projection2;
  }

  let newOnPoint1 = {
    x: initialState.initialOnPoint1.x + finalProjection1 * dir1.x,
    y: initialState.initialOnPoint1.y + finalProjection1 * dir1.y,
  };

  let newOnPoint2 = {
    x: initialState.initialOnPoint2.x + finalProjection2 * dir2.x,
    y: initialState.initialOnPoint2.y + finalProjection2 * dir2.y,
  };

  const onPoint1Index = initialState.selectedSegment.parentPointIndices[0];
  const onPoint2Index = initialState.selectedSegment.parentPointIndices[3];

  if (gridSnapEnabled) {
    newOnPoint1 = snapToGrid(newOnPoint1);
    newOnPoint2 = snapToGrid(newOnPoint2);
  }

  return {
    onPoint1Index: onPoint1Index,
    onPoint2Index: onPoint2Index,
    newOnPoint1: newOnPoint1,
    newOnPoint2: newOnPoint2,
    controlPoint1Index: initialState.originalControlPoints.controlPoint1Index,
    controlPoint2Index: initialState.originalControlPoints.controlPoint2Index,
    newControlPoint1: initialState.initialOffPoint1,
    newControlPoint2: initialState.initialOffPoint2,
  };
}

export function handleTrueTunniPointMouseDrag(
  event,
  initialState,
  sceneController,
  gridSnapEnabled = false
) {
  return calculateTrueTunniPointDragChanges(
    event,
    initialState,
    sceneController,
    gridSnapEnabled
  );
}

export function handleTrueTunniPointMouseUp(initialState, sceneController) {
  if (!initialState || !initialState.selectedSegment || !initialState.originalControlPoints) {
    return null;
  }

  const onPoint1Index = initialState.selectedSegment.parentPointIndices[0];
  const onPoint2Index = initialState.selectedSegment.parentPointIndices[3];

  return {
    onPoint1Index: onPoint1Index,
    onPoint2Index: onPoint2Index,
    originalOnPoint1: initialState.initialOnPoint1,
    originalOnPoint2: initialState.initialOnPoint2,
    controlPoint1Index: initialState.originalControlPoints.controlPoint1Index,
    controlPoint2Index: initialState.originalControlPoints.controlPoint2Index,
    originalControlPoint1: initialState.originalControlPoints.originalControlPoint1,
    originalControlPoint2: initialState.originalControlPoints.originalControlPoint2,
  };
}
