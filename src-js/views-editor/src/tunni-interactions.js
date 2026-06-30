import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector } from "@fontra/core/changes.js";
import {
  areTensionsEqualized,
  calculateControlHandlePoint,
  calculateEqualizedControlPoints,
  calculateTunniPoint,
  snapToGrid,
} from "@fontra/core/tunni-calculations.js";
import { assert } from "@fontra/core/utils.ts";
import { distance, normalizeVector, subVectors } from "@fontra/core/vector.js";

function applyTunniDragChanges(path, dragChanges, isTrueTunniPoint) {
  if (isTrueTunniPoint) {
    path.setPointPosition(
      dragChanges.onPoint1Index,
      dragChanges.newOnPoint1.x,
      dragChanges.newOnPoint1.y
    );
    path.setPointPosition(
      dragChanges.onPoint2Index,
      dragChanges.newOnPoint2.x,
      dragChanges.newOnPoint2.y
    );
    path.setPointPosition(
      dragChanges.controlPoint1Index,
      dragChanges.newControlPoint1.x,
      dragChanges.newControlPoint1.y
    );
    path.setPointPosition(
      dragChanges.controlPoint2Index,
      dragChanges.newControlPoint2.x,
      dragChanges.newControlPoint2.y
    );
  } else {
    path.setPointPosition(
      dragChanges.controlPoint1Index,
      dragChanges.newControlPoint1.x,
      dragChanges.newControlPoint1.y
    );
    path.setPointPosition(
      dragChanges.controlPoint2Index,
      dragChanges.newControlPoint2.x,
      dragChanges.newControlPoint2.y
    );
  }
}

export function tunniHoverResult(
  point,
  size,
  positionedGlyph,
  visualizationLayersSettings
) {
  const handleLayerOn = visualizationLayersSettings.model["fontra.tunni.handle"];
  const pointLayerOn = visualizationLayersSettings.model["fontra.tunni.point"];
  if (!handleLayerOn && !pointLayerOn) {
    return null;
  }
  const hit = tunniLayerHitTest(point, size, positionedGlyph);
  if (!hit) {
    return null;
  }
  if (hit.hitType === "true-tunni-point" && pointLayerOn) {
    return { cursor: "crosshair" };
  }
  if (hit.hitType === "tunni-point" && handleLayerOn) {
    return { cursor: "pointer" };
  }
  return null;
}

export async function handleTunniDrag({
  sceneController,
  eventStream,
  initialEvent,
  isTrueTunniPoint,
  tunniInitialState,
}) {
  if (!isTrueTunniPoint && initialEvent.ctrlKey && initialEvent.shiftKey) {
    await equalizeSegmentDistances(
      tunniInitialState.tunniPointHit.segment,
      tunniInitialState.originalSegmentPoints,
      sceneController.sceneModel,
      sceneController.sceneModel.getSelectedPositionedGlyph(),
      sceneController
    );
    return;
  }

  const gridSnap = sceneController.sceneSettings?.gridSnapEnabled;

  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    const layerInfo = Object.entries(
      sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
    ).map(([layerName, layerGlyph]) => ({
      layerGlyph,
      changePath: ["layers", layerName, "glyph"],
    }));
    assert(layerInfo.length >= 1, "no layer to edit");

    let accumulated = new ChangeCollector();
    let dragged = false;

    for await (const event of eventStream) {
      if (event.type === "mouseup") {
        break;
      }
      if (event.type !== "mousemove") {
        continue;
      }
      const dragChanges = isTrueTunniPoint
        ? handleTrueTunniPointMouseDrag(
            event,
            tunniInitialState,
            sceneController,
            gridSnap
          )
        : handleTunniPointMouseDrag(
            event,
            tunniInitialState,
            sceneController,
            gridSnap
          );
      if (!dragChanges) {
        continue;
      }
      dragged = true;

      let frame = new ChangeCollector();
      for (const { layerGlyph, changePath } of layerInfo) {
        const layerChanges = recordChanges(layerGlyph, (proxy) => {
          applyTunniDragChanges(proxy.path, dragChanges, isTrueTunniPoint);
        });
        frame = frame.concat(layerChanges.prefixed(changePath));
      }
      accumulated = accumulated.concat(frame);
      await sendIncrementalChange(frame.change, true);
    }

    if (!dragged || !accumulated.hasChange) {
      return;
    }

    return {
      changes: accumulated,
      undoLabel: isTrueTunniPoint
        ? "Move On-Curve Points via Tunni"
        : "Move Tunni Points",
      broadcast: true,
    };
  });
}
/**
 * Finds if a point is hitting a Tunni point within a given size margin
 * @param {Object} point - The point to check
 * @param {number} size - The size margin to check within
 * @param {Object} positionedGlyph - The positioned glyph containing the path
 * @param {Function} calculateControlHandlePoint - Function to calculate Tunni point from segment
 * @param {Function} distance - Function to calculate distance between two points
 * @returns {Object|null} Object with tunniPoint, segment, and segmentPoints if hit, null otherwise
 */
export function findTunniPointHit(
  point,
  size,
  positionedGlyph,
  calculateControlHandlePoint,
  distance
) {
  if (!positionedGlyph) {
    return null;
  }

  const path = positionedGlyph.glyph.path;

  // The point is already in the glyph coordinate system when passed from the pointer tool
  const glyphPoint = point;

  // Iterate through ALL contours and check if the point is near any Tunni point
  for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
    for (const segment of path.iterContourDecomposedSegments(contourIndex)) {
      // Process each segment in the contour
      if (segment.points.length === 4) {
        // Check if it's a cubic segment
        const pointTypes = segment.parentPointIndices.map(
          (index) => path.pointTypes[index]
        );

        if (pointTypes[1] === 2 && pointTypes[2] === 2) {
          // Both are cubic control points
          // Calculate both the true intersection point and the visual point (midpoint)
          const trueTunniPoint = calculateTunniPoint(segment.points);
          const visualTunniPoint = calculateControlHandlePoint(segment.points);

          // Check both the true intersection point and the visual point (midpoint)
          if (trueTunniPoint && distance(glyphPoint, trueTunniPoint) <= size) {
            return {
              tunniPoint: trueTunniPoint,
              segment: segment,
              segmentPoints: segment.points,
            };
          }

          if (visualTunniPoint && distance(glyphPoint, visualTunniPoint) <= size) {
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
 * @param {Function} findTunniPointHit - Function to find if point hits a Tunni point
 * @param {Function} equalizeSegmentDistances - Function to equalize distances in a segment
 */
export async function handleEqualizeDistances(
  point,
  size,
  sceneModel,
  findTunniPointHit,
  equalizeSegmentDistances
) {
  // First check if we clicked on an existing Tunni point
  const positionedGlyph = sceneModel.getSelectedPositionedGlyph();
  const hit = findTunniPointHit(
    point,
    size,
    positionedGlyph,
    calculateControlHandlePoint,
    distance
  );
  if (hit) {
    await equalizeSegmentDistances(
      hit.segment,
      hit.segmentPoints,
      sceneModel,
      positionedGlyph
    );
    return;
  }

  // If not, check if we clicked near a cubic segment
  const pathHit = sceneModel.pathHitAtPoint(point, size);
  if (pathHit.segment && pathHit.segment.points.length === 4) {
    // Check if it's a cubic segment (two off-curve points)
    const pointTypes = pathHit.segment.parentPointIndices.map(
      (index) => sceneModel.getSelectedPositionedGlyph().glyph.path.pointTypes[index]
    );

    if (pointTypes[1] === 2 && pointTypes[2] === 2) {
      // Both are cubic control points
      await equalizeSegmentDistances(
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
 * @param {Object} sceneModel - The scene model
 * @param {Object} positionedGlyph - The positioned glyph
 * @param {Object} sceneController - The scene controller to perform edits
 */
export async function equalizeSegmentDistances(
  segment,
  segmentPoints,
  sceneModel,
  positionedGlyph,
  sceneController
) {
  // Check if distances are already equalized
  if (areTensionsEqualized(segmentPoints)) {
    return;
  }

  // Calculate new control points with equalized distances using arithmetic mean
  const newControlPoints = calculateEqualizedControlPoints(segmentPoints);

  // Update the path with new control points using editLayersAndRecordChanges
  try {
    await sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      for (const layerGlyph of Object.values(layerGlyphs)) {
        const path = layerGlyph.path;

        // Validate that the path and segment indices exist
        if (!path || !segment?.parentPointIndices) {
          console.warn("Invalid path or segment indices", {
            path: !!path,
            parentPointIndices: segment?.parentPointIndices,
          });
          return "Equalize Control Point Distances"; // Return early but still provide undo label
        }

        // Find the indices of the control points within the segment
        // In a cubic segment, control points are typically at indices 1 and 2
        const controlPoint1Index = segment.parentPointIndices[1];
        const controlPoint2Index = segment.parentPointIndices[2];

        // Validate the control point indices
        if (controlPoint1Index === undefined || controlPoint2Index === undefined) {
          console.warn("Invalid control point indices", {
            controlPoint1Index: controlPoint1Index,
            controlPoint2Index: controlPoint2Index,
          });
          return "Equalize Control Point Distances"; // Return early but still provide undo label
        }

        const rounded1 = snapToGrid(newControlPoints[0]);
        const rounded2 = snapToGrid(newControlPoints[1]);

        // Update the control points in the path
        path.setPointPosition(controlPoint1Index, rounded1.x, rounded1.y);
        path.setPointPosition(controlPoint2Index, rounded2.x, rounded2.y);
      }
      return "Equalize Control Point Distances";
    });
  } catch (error) {
    console.error("Error equalizing control point distances:", error);
    throw error; // Re-throw the error so it can be handled upstream
  }
}

/**
 * Handles mouse down event when clicking on a Tunni point
 * @param {Object} event - Mouse event
 * @param {Object} sceneController - Scene controller for scene access
 * @param {Object} visualizationLayerSettings - To check if Tunni layer is active
 * @returns {Object} Initial state for drag operation (initial mouse pos, vectors, etc.)
 */
export function handleTunniPointMouseDown(
  event,
  sceneController,
  visualizationLayerSettings
) {
  // Check if any Tunni layer is active
  if (
    !visualizationLayerSettings.model["fontra.tunni.handle"] &&
    !visualizationLayerSettings.model["fontra.tunni.point"]
  ) {
    return null;
  }

  const point = sceneController.localPoint(event);
  const size = sceneController.mouseClickMargin;

  // Convert from scene coordinates to glyph coordinates
  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return null; // No positioned glyph, so no Tunni point interaction possible
  }

  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };

  // First check if we clicked on an existing Tunni point
  // Use the same hit testing function that's used for hover detection to ensure consistency
  const hit = tunniLayerHitTest(glyphPoint, size, positionedGlyph);
  if (!hit) {
    return null;
  }

  const segmentPoints = hit.segmentPoints;

  // Store initial positions
  const initialOnPoint1 = { ...segmentPoints[0] }; // p1
  const initialOffPoint1 = { ...segmentPoints[1] }; // p2
  const initialOffPoint2 = { ...segmentPoints[2] }; // p3
  const initialOnPoint2 = { ...segmentPoints[3] }; // p4

  // Calculate initial vectors from on-curve to off-curve points
  const initialVector1 = {
    x: initialOffPoint1.x - initialOnPoint1.x,
    y: initialOffPoint1.y - initialOnPoint1.y,
  };

  const initialVector2 = {
    x: initialOffPoint2.x - initialOnPoint2.x,
    y: initialOffPoint2.y - initialOnPoint2.y,
  };

  // Calculate unit vectors for movement direction
  const length1 = Math.sqrt(
    initialVector1.x * initialVector1.x + initialVector1.y * initialVector1.y
  );
  const length2 = Math.sqrt(
    initialVector2.x * initialVector2.x + initialVector2.y * initialVector2.y
  );

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

  // Calculate 45-degree vector (average of the two unit vectors)
  let fortyFiveVector = {
    x: (unitVector1.x + unitVector2.x) / 2,
    y: (unitVector1.y + unitVector2.y) / 2,
  };

  // Normalize the 45-degree vector
  const fortyFiveLength = Math.sqrt(
    fortyFiveVector.x * fortyFiveVector.x + fortyFiveVector.y * fortyFiveVector.y
  );
  if (fortyFiveLength > 0) {
    fortyFiveVector.x /= fortyFiveLength;
    fortyFiveVector.y /= fortyFiveLength;
  }

  // Store original control point positions for undo functionality
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

  // Return initial state for drag operation
  return {
    initialMousePosition: { ...glyphPoint }, // Make a copy to avoid reference issues
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
  // Check if we have the necessary data to process the drag
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

  // Convert from scene coordinates to glyph coordinates
  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return null; // No positioned glyph, so no Tunni point interaction possible
  }

  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };

  // Calculate mouse movement vector
  const mouseDelta = {
    x: glyphPoint.x - initialState.initialMousePosition.x,
    y: glyphPoint.y - initialState.initialMousePosition.y,
  };

  // Check if Alt key is pressed to disable equalizing distances
  // (proportional editing is now the default behavior)
  const equalizeDistances = !event.altKey;

  let newControlPoint1, newControlPoint2;

  if (equalizeDistances) {
    const projection =
      mouseDelta.x * initialState.fortyFiveVector.x +
      mouseDelta.y * initialState.fortyFiveVector.y;

    // forkra original: move both handles by the same projection.
    // newControlPoint1 = {
    //   x: initialState.initialOffPoint1.x + initialState.unitVector1.x * projection,
    //   y: initialState.initialOffPoint1.y + initialState.unitVector1.y * projection,
    // };
    // newControlPoint2 = {
    //   x: initialState.initialOffPoint2.x + initialState.unitVector2.x * projection,
    //   y: initialState.initialOffPoint2.y + initialState.unitVector2.y * projection,
    // };

    const trueTunni = calculateTunniPoint(initialState.originalSegmentPoints);
    const distToTunni1 = trueTunni
      ? distance(initialState.initialOnPoint1, trueTunni)
      : 0;
    const distToTunni2 = trueTunni
      ? distance(initialState.initialOnPoint2, trueTunni)
      : 0;
    if (trueTunni && distToTunni1 > 0 && distToTunni2 > 0) {
      const totalDist = distToTunni1 + distToTunni2;
      const k = (2 * projection) / totalDist;
      const move1 = k * distToTunni1;
      const move2 = k * distToTunni2;
      newControlPoint1 = {
        x: initialState.initialOffPoint1.x + initialState.unitVector1.x * move1,
        y: initialState.initialOffPoint1.y + initialState.unitVector1.y * move1,
      };
      newControlPoint2 = {
        x: initialState.initialOffPoint2.x + initialState.unitVector2.x * move2,
        y: initialState.initialOffPoint2.y + initialState.unitVector2.y * move2,
      };
    } else {
      newControlPoint1 = {
        x: initialState.initialOffPoint1.x + initialState.unitVector1.x * projection,
        y: initialState.initialOffPoint1.y + initialState.unitVector1.y * projection,
      };

      newControlPoint2 = {
        x: initialState.initialOffPoint2.x + initialState.unitVector2.x * projection,
        y: initialState.initialOffPoint2.y + initialState.unitVector2.y * projection,
      };
    }
  } else {
    // Non-proportional editing: Each control point moves independently along its own vector
    // Project mouse movement onto each control point's individual unit vector
    const projection1 =
      mouseDelta.x * initialState.unitVector1.x +
      mouseDelta.y * initialState.unitVector1.y;
    const projection2 =
      mouseDelta.x * initialState.unitVector2.x +
      mouseDelta.y * initialState.unitVector2.y;

    // Move each control point by its own projection amount
    newControlPoint1 = {
      x: initialState.initialOffPoint1.x + initialState.unitVector1.x * projection1,
      y: initialState.initialOffPoint1.y + initialState.unitVector1.y * projection1,
    };

    newControlPoint2 = {
      x: initialState.initialOffPoint2.x + initialState.unitVector2.x * projection2,
      y: initialState.initialOffPoint2.y + initialState.unitVector2.y * projection2,
    };
  }

  // Apply grid snapping if enabled
  if (gridSnapEnabled) {
    newControlPoint1 = snapToGrid(newControlPoint1);
    newControlPoint2 = snapToGrid(newControlPoint2);
  }

  // Return the changes instead of applying them
  return {
    controlPoint1Index: initialState.selectedSegment.parentPointIndices[1],
    controlPoint2Index: initialState.selectedSegment.parentPointIndices[2],
    newControlPoint1: newControlPoint1,
    newControlPoint2: newControlPoint2,
  };
}

/**
 * Handles mouse drag event to calculate control point changes based on Tunni point movement
 * @param {Object} event - Mouse event
 * @param {Object} initialState - Initial state from mouse down
 * @param {Object} sceneController - Scene controller for editing operations
 * @returns {Object} Object containing control point indices and new positions
 */
export function handleTunniPointMouseDrag(
  event,
  initialState,
  sceneController,
  gridSnapEnabled = false
) {
  // Calculate the changes for this mouse move event
  return calculateTunniPointDragChanges(
    event,
    initialState,
    sceneController,
    gridSnapEnabled
  );
}

/**
 * Handles mouse up event to return the final state for the Tunni point drag operation
 * @param {Object} initialState - Initial state from mouse down
 * @param {Object} sceneController - Scene controller for editing operations
 * @returns {Object} Object containing original control point indices and their final positions
 */
export function handleTunniPointMouseUp(initialState, sceneController) {
  // Check if we have the necessary data to process the mouse up event
  if (
    !initialState ||
    !initialState.selectedSegment ||
    !initialState.originalControlPoints
  ) {
    return null;
  }

  // Return the original control point information without applying changes
  // The actual changes will be applied in the pointer tool as a single atomic operation
  return {
    controlPoint1Index: initialState.originalControlPoints.controlPoint1Index,
    controlPoint2Index: initialState.originalControlPoints.controlPoint2Index,
    originalControlPoint1: initialState.originalControlPoints.originalControlPoint1,
    originalControlPoint2: initialState.originalControlPoints.originalControlPoint2,
  };
}

/**
 * Performs hit testing specifically for Tunni visualization layer elements
 * @param {Object} point - The point to check (x, y coordinates)
 * @param {number} size - The hit margin size
 * @param {Object} positionedGlyph - The positioned glyph to test against
 * @returns {Object|null} Hit result object if Tunni point is near the given point, null otherwise
 */
export function tunniLayerHitTest(point, size, positionedGlyph) {
  if (!positionedGlyph || !positionedGlyph.glyph || !positionedGlyph.glyph.path) {
    return null;
  }

  const path = positionedGlyph.glyph.path;

  // The point is already in the glyph coordinate system when passed from the pointer tool
  const glyphPoint = point;

  // Iterate through ALL contours and check if the point is near any Tunni point
  for (let contourIndex = 0; contourIndex < path.numContours; contourIndex++) {
    for (const segment of path.iterContourDecomposedSegments(contourIndex)) {
      // Process each segment in the contour
      if (segment.points.length === 4) {
        // Check if it's a cubic segment
        const pointTypes = segment.parentPointIndices.map(
          (index) => path.pointTypes[index]
        );

        if (pointTypes[1] === 2 && pointTypes[2] === 2) {
          // Both are cubic control points
          // Calculate the true Tunni point (intersection-based) for this segment
          const trueTunniPoint = calculateTunniPoint(segment.points);
          const visualTunniPoint = calculateControlHandlePoint(segment.points);

          // Check both the true intersection point and the visual point (midpoint)
          // This ensures we can hit both the actual intersection and the visual representation
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

  // If no Tunni point is found within the hit margin, return null
  return null;
}

/**
 * Handles mouse down event when clicking on a true Tunni point (intersection)
 * @param {Object} event - Mouse event
 * @param {Object} sceneController - Scene controller for scene access
 * @param {Object} visualizationLayerSettings - To check if Tunni layer is active
 * @returns {Object} Initial state for drag operation (initial mouse pos, vectors, etc.)
 */
export function handleTrueTunniPointMouseDown(
  event,
  sceneController,
  visualizationLayerSettings
) {
  // Check if any Tunni layer is active
  if (
    !visualizationLayerSettings.model["fontra.tunni.handle"] &&
    !visualizationLayerSettings.model["fontra.tunni.point"]
  ) {
    return null;
  }

  const point = sceneController.localPoint(event);
  const size = sceneController.mouseClickMargin;

  // Convert from scene coordinates to glyph coordinates
  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return null; // No positioned glyph, so no Tunni point interaction possible
  }

  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };

  // First check if we clicked on an existing true Tunni point
  // Use the same hit testing function that's used for hover detection to ensure consistency
  const hit = tunniLayerHitTest(glyphPoint, size, positionedGlyph);
  if (!hit || hit.hitType !== "true-tunni-point") {
    return null;
  }

  const segmentPoints = hit.segmentPoints;

  // Store initial positions
  const initialOnPoint1 = { ...segmentPoints[0] }; // p1 (on-curve)
  const initialOffPoint1 = { ...segmentPoints[1] }; // p2 (off-curve)
  const initialOffPoint2 = { ...segmentPoints[2] }; // p3 (off-curve)
  const initialOnPoint2 = { ...segmentPoints[3] }; // p4 (on-curve)

  // Calculate initial vectors from on-curve to off-curve points
  const initialVector1 = {
    x: initialOffPoint1.x - initialOnPoint1.x,
    y: initialOffPoint1.y - initialOnPoint1.y,
  };

  const initialVector2 = {
    x: initialOffPoint2.x - initialOnPoint2.x,
    y: initialOffPoint2.y - initialOnPoint2.y,
  };

  // Calculate unit vectors for movement direction
  const length1 = Math.sqrt(
    initialVector1.x * initialVector1.x + initialVector1.y * initialVector1.y
  );
  const length2 = Math.sqrt(
    initialVector2.x * initialVector2.x + initialVector2.y * initialVector2.y
  );

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

  // Store original control point positions (these should remain unchanged)
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

  // Return initial state for drag operation
  return {
    initialMousePosition: { ...glyphPoint }, // Make a copy to avoid reference issues
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
    hitType: "true-tunni-point", // Distinguish from current handle
  };
}

/**
 * Calculates new on-curve point positions based on true Tunni point movement during drag
 * @param {Object} event - Mouse event
 * @param {Object} initialState - Initial state from mouse down
 * @param {Object} sceneController - Scene controller for editing operations
 * @returns {Object} Object containing on-curve point indices and new positions
 */
export function calculateTrueTunniPointDragChanges(
  event,
  initialState,
  sceneController,
  gridSnapEnabled = false
) {
  // Check if we have the necessary data to process the drag
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

  // Convert from scene coordinates to glyph coordinates
  const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
  if (!positionedGlyph) {
    return null; // No positioned glyph, so no Tunni point interaction possible
  }

  const glyphPoint = {
    x: point.x - positionedGlyph.x,
    y: point.y - positionedGlyph.y,
  };

  // Calculate mouse movement vector
  const mouseDelta = {
    x: glyphPoint.x - initialState.initialMousePosition.x,
    y: glyphPoint.y - initialState.initialMousePosition.y,
  };

  // Check if Alt key is pressed to disable equalizing distances
  const equalizeDistances = !event.altKey;

  // Calculate how much to move the on-curve points along their fixed vectors
  // The movement should be based on the projection of mouse movement onto the fixed direction vectors
  const [p1, p2, p3, p4] = initialState.originalSegmentPoints;

  // Calculate unit vectors for the original directions (from on-curve to off-curve)
  const dir1 = normalizeVector(subVectors(p2, p1)); // direction from p1 to p2
  const dir2 = normalizeVector(subVectors(p3, p4)); // direction from p4 to p3 (reversed: from p4 to off-curve)

  // Project mouse movement onto the fixed direction vectors
  const projection1 = mouseDelta.x * dir1.x + mouseDelta.y * dir1.y;
  const projection2 = mouseDelta.x * dir2.x + mouseDelta.y * dir2.y;

  // For equalized distances, use the average of the projections
  let finalProjection1, finalProjection2;
  if (equalizeDistances) {
    const avgProjection = (projection1 + projection2) / 2;
    finalProjection1 = avgProjection;
    finalProjection2 = avgProjection;
  } else {
    finalProjection1 = projection1;
    finalProjection2 = projection2;
  }

  // Calculate new on-curve point positions by moving along the fixed direction vectors
  let newOnPoint1 = {
    x: initialState.initialOnPoint1.x + finalProjection1 * dir1.x,
    y: initialState.initialOnPoint1.y + finalProjection1 * dir1.y,
  };

  let newOnPoint2 = {
    x: initialState.initialOnPoint2.x + finalProjection2 * dir2.x,
    y: initialState.initialOnPoint2.y + finalProjection2 * dir2.y,
  };

  // Return the new on-curve points with original control points unchanged
  const newOnCurvePoints = [newOnPoint1, p2, p3, newOnPoint2];

  // Get the original on-curve point indices
  const onPoint1Index = initialState.selectedSegment.parentPointIndices[0];
  const onPoint2Index = initialState.selectedSegment.parentPointIndices[3];

  // Apply grid snapping if enabled
  if (gridSnapEnabled) {
    newOnPoint1 = snapToGrid(newOnPoint1);
    newOnPoint2 = snapToGrid(newOnPoint2);
  }

  // Return the changes instead of applying them
  return {
    onPoint1Index: onPoint1Index,
    onPoint2Index: onPoint2Index,
    newOnPoint1: newOnPoint1, // New position for initialOnPoint1
    newOnPoint2: newOnPoint2, // New position for initialOnPoint2
    // Keep control points unchanged
    controlPoint1Index: initialState.originalControlPoints.controlPoint1Index,
    controlPoint2Index: initialState.originalControlPoints.controlPoint2Index,
    newControlPoint1: initialState.initialOffPoint1, // Unchanged
    newControlPoint2: initialState.initialOffPoint2, // Unchanged
  };
}

/**
 * Handles mouse drag event to calculate on-curve point changes based on true Tunni point movement
 * @param {Object} event - Mouse event
 * @param {Object} initialState - Initial state from mouse down
 * @param {Object} sceneController - Scene controller for editing operations
 * @returns {Object} Object containing on-curve point indices and new positions
 */
export function handleTrueTunniPointMouseDrag(
  event,
  initialState,
  sceneController,
  gridSnapEnabled = false
) {
  // Calculate the changes for this mouse move event
  return calculateTrueTunniPointDragChanges(
    event,
    initialState,
    sceneController,
    gridSnapEnabled
  );
}

/**
 * Handles mouse up event to return the final state for the true Tunni point drag operation
 * @param {Object} initialState - Initial state from mouse down
 * @param {Object} sceneController - Scene controller for editing operations
 * @returns {Object} Object containing original on-curve point indices and their final positions
 */
export function handleTrueTunniPointMouseUp(initialState, sceneController) {
  // Check if we have the necessary data to process the mouse up event
  if (
    !initialState ||
    !initialState.selectedSegment ||
    !initialState.originalControlPoints
  ) {
    return null;
  }

  // Get the original on-curve point indices
  const onPoint1Index = initialState.selectedSegment.parentPointIndices[0];
  const onPoint2Index = initialState.selectedSegment.parentPointIndices[3];

  // Return the original control point information without applying changes
  // The actual changes will be applied in the pointer tool as a single atomic operation
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
