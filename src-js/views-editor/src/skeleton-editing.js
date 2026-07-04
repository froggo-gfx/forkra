import { recordChanges } from "@fontra/core/change-recorder.js";
import { applyChange } from "@fontra/core/changes.js";
import {
  generateFromSkeleton,
  outlineContourToPackedPath,
} from "@fontra/core/skeleton-generator.js";
import {
  getSkeletonData,
  makeEmptySkeletonData,
  normalizeSkeletonData,
  setSkeletonData,
} from "@fontra/core/skeleton-model.js";
import {
  applyFixedRibDelta,
  equalizeSkeletonHandleFromDelta,
  equalizeSkeletonHandleToPoint,
  getSkeletonHandleEqualizeInfo,
} from "@fontra/core/skeleton-modifiers.js";
import { parseSelection } from "@fontra/core/utils.ts";
import { VarPackedPath } from "@fontra/core/var-path.js";
import { EditBehaviorFactory } from "./edit-behavior.js";
import {
  applySkeletonRibExecutorResult,
  createSkeletonRibExecutor,
  getSkeletonRibAddress,
  parseSkeletonRibKey,
} from "./skeleton-ribs.js";

export function makeSkeletonPointKey(contourId, pointId) {
  return `skeletonPoint/${contourId}/${pointId}`;
}

export function parseSkeletonPointKey(key) {
  // Accepts "skeletonPoint/3/5" (full key) and "3/5" (parseSelection remainder)
  const parts = `${key}`.split("/");
  if (parts[0] === "skeletonPoint") {
    parts.shift();
  }
  const [contourId, pointId] = parts.map(Number);
  return { contourId, pointId };
}

export function getSkeletonPointAddress(skeletonData, contourId, pointId) {
  for (
    let contourIndex = 0;
    contourIndex < (skeletonData?.contours || []).length;
    contourIndex++
  ) {
    const contour = skeletonData.contours[contourIndex];
    if (contour.id !== contourId) continue;
    const pointIndex = contour.points.findIndex((point) => point.id === pointId);
    if (pointIndex < 0) return null;
    return { contour, contourIndex, point: contour.points[pointIndex], pointIndex };
  }
  return null;
}

// Cross-layer addressing (see Global Constraints): selection ids are canonical
// in the edit layer only. Other editable layers resolve the same point by
// structural ordinal (contour position, point position). Returns null when the
// target layer's structure is incompatible; callers skip that layer.
export function resolveSkeletonAddressAcrossLayers(
  referenceSkeletonData,
  targetSkeletonData,
  contourId,
  pointId
) {
  const reference = getSkeletonPointAddress(referenceSkeletonData, contourId, pointId);
  if (!reference) {
    return null;
  }
  if (referenceSkeletonData === targetSkeletonData) {
    return reference;
  }
  const contour = targetSkeletonData?.contours?.[reference.contourIndex];
  const point = contour?.points?.[reference.pointIndex];
  if (!contour || !point || !point.type !== !reference.point.type) {
    return null;
  }
  return {
    contour,
    contourIndex: reference.contourIndex,
    point,
    pointIndex: reference.pointIndex,
  };
}

export function editSkeleton(layerGlyph, mutate, options = {}) {
  return recordChanges(layerGlyph, (layerGlyphProxy) => {
    applySkeletonMutation(layerGlyphProxy, mutate, options);
  });
}

export function makeEditSkeletonChange(layerGlyph, mutate, options = {}) {
  const scratch = cloneLayerGlyphForSkeletonEdit(layerGlyph);
  return editSkeleton(scratch, mutate, options);
}

function applySkeletonMutation(layerGlyph, mutate, options = {}) {
  const original = getSkeletonData(layerGlyph);
  if (!original && !options.createIfMissing) {
    return;
  }

  const working = normalizeSkeletonData(
    structuredClone(original || makeEmptySkeletonData())
  );
  mutate(working);
  const generated = generateFromSkeleton(working);
  replaceGeneratedSkeletonContours(layerGlyph, working, generated);
  setSkeletonData(layerGlyph, working);
}

export function cloneLayerGlyphForSkeletonEdit(layerGlyph) {
  return {
    ...layerGlyph,
    path: layerGlyph.path.copy(),
    customData: structuredClone(layerGlyph.customData || {}),
  };
}

export function replaceGeneratedSkeletonContours(layerGlyph, skeletonData, generated) {
  const previous = (skeletonData.generated || []).filter(
    (entry) =>
      Number.isInteger(entry.pathContourIndex) &&
      entry.pathContourIndex >= 0 &&
      entry.pathContourIndex < layerGlyph.path.numContours
  );

  if (canUpdateGeneratedContoursInPlace(layerGlyph.path, previous, generated)) {
    // Steady state (every width/nudge/coordinate drag): write point coordinates
    // in place. pathContourIndex stays stable, per-frame change objects contain
    // only "=xy" point updates, and contour order stays identical across
    // designspace sources (interpolation compatibility).
    skeletonData.generated = previous.map((entry, i) => {
      const pathContourIndex = entry.pathContourIndex;
      const contour = generated.contours[i];
      for (const [j, point] of contour.points.entries()) {
        const pointIndex = layerGlyph.path.getAbsolutePointIndex(pathContourIndex, j);
        layerGlyph.path.setPointPosition(pointIndex, point.x, point.y);
      }
      return {
        skeletonContourId: generated.provenance[i].skeletonContourId,
        pathContourIndex,
        pointMap: generated.provenance[i].pointMap,
      };
    });
    return;
  }

  // Topology changed: structural replace at stable positions. Delete the old
  // generated contours (descending), then insert the new ones contiguously at
  // the position the first old one occupied (append when none existed).
  // Generated contours must never migrate to the end of the path: change
  // objects are built against the drag-start state, and positional
  // deleteContour/insertContour ops only stay valid across frames when the
  // generated block keeps its position.
  const previousIndices = previous
    .map((entry) => entry.pathContourIndex)
    .sort((a, b) => b - a);
  for (const pathContourIndex of previousIndices) {
    layerGlyph.path.deleteContour(pathContourIndex);
  }
  const insertBase = previousIndices.length
    ? Math.min(...previousIndices)
    : layerGlyph.path.numContours;
  skeletonData.generated = generated.contours.map((contour, i) => {
    const pathContourIndex = insertBase + i;
    layerGlyph.path.insertContour(
      pathContourIndex,
      outlineContourToPackedPath(contour)
    );
    return {
      skeletonContourId: generated.provenance[i].skeletonContourId,
      pathContourIndex,
      pointMap: generated.provenance[i].pointMap,
    };
  });
}

function canUpdateGeneratedContoursInPlace(path, previousEntries, generated) {
  if (previousEntries.length !== generated.contours.length) {
    return false;
  }
  return previousEntries.every((entry, i) => {
    const contour = generated.contours[i];
    if (path.getNumPointsOfContour(entry.pathContourIndex) !== contour.points.length) {
      return false;
    }
    const existing = path.getUnpackedContour(entry.pathContourIndex);
    if (existing.isClosed !== (contour.isClosed === true)) {
      return false;
    }
    return contour.points.every(
      (point, j) =>
        (existing.points[j].type || null) === (point.type || null) &&
        (existing.points[j].smooth === true) === (point.smooth === true)
    );
  });
}

export function hasSkeletonPointSelection(selection) {
  return !!parseSelection([...selection]).skeletonPoint?.length;
}

// Toggle (or force) the `smooth` flag of the selected on-curve skeleton points.
// Off-curve handles are ignored. Returns the ChangeCollector from editSkeleton.
export function toggleSkeletonSmooth(layer, selection, forceValue = null) {
  const skeletonData = getSkeletonData(layer);
  if (!skeletonData) return null;
  const { skeletonPoint } = parseSelection([...selection]);
  const keys = skeletonPoint || [];
  if (!keys.length) return null;

  return editSkeleton(layer, (working) => {
    // Determine the new value from the current state of the first togglable
    // on-curve point, so all selected points flip together (matches toggleSmooth).
    let newValue = forceValue;
    for (const item of keys) {
      const { contourId, pointId } = parseSkeletonPointKey(item);
      const address = getSkeletonPointAddress(working, contourId, pointId);
      if (!address || address.point.type) continue;
      if (newValue === null) {
        newValue = !address.point.smooth;
      }
      address.point.smooth = newValue;
    }
  });
}

// Shift generated-contour path indices when a non-skeleton structural path edit
// inserts or deletes contours before the generated block. Keeps
// skeleton.generated[*].pathContourIndex valid without geometric recovery.
export function shiftGeneratedContourIndices(skeletonData, startIndex, delta) {
  for (const entry of skeletonData?.generated || []) {
    if (entry.pathContourIndex >= startIndex) {
      entry.pathContourIndex += delta;
    }
  }
}

// Records a generated-contour-index shift on a (proxied) layer glyph so it lands
// in the surrounding editGlyph change. No-op when the layer has no generated
// contours. Call after a non-skeleton structural path edit inserts/deletes
// contours before the generated block.
export function recordSkeletonContourIndexShift(layerGlyph, startIndex, delta) {
  const skeletonData = getSkeletonData(layerGlyph);
  if (!skeletonData?.generated?.length || !delta) {
    return;
  }
  const updated = structuredClone(skeletonData);
  shiftGeneratedContourIndices(updated, startIndex, delta);
  setSkeletonData(layerGlyph, updated);
}

// Bounding box of the selected skeleton points in glyph space, or undefined.
export function getSkeletonSelectionBounds(layer, selection) {
  const skeletonData = getSkeletonData(layer);
  if (!skeletonData) return undefined;
  const { skeletonPoint } = parseSelection([...selection]);
  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  for (const item of skeletonPoint || []) {
    const { contourId, pointId } = parseSkeletonPointKey(item);
    const address = getSkeletonPointAddress(skeletonData, contourId, pointId);
    if (!address) continue;
    const { x, y } = address.point;
    xMin = Math.min(xMin, x);
    yMin = Math.min(yMin, y);
    xMax = Math.max(xMax, x);
    yMax = Math.max(yMax, y);
  }
  if (xMin > xMax) return undefined;
  return { xMin, yMin, xMax, yMax };
}

export function makeSkeletonPointTargetEntry(
  layer,
  selection,
  behaviorName,
  referenceSkeletonData = null,
  options = {}
) {
  const skeletonData = getSkeletonData(layer);
  if (!skeletonData) return null;
  // Cross-layer addressing: selection ids are canonical in the edit layer;
  // resolve them into this layer by structural ordinal (Global Constraints).
  const reference = referenceSkeletonData || skeletonData;
  const selected = collectSkeletonPointSelection(selection, reference, skeletonData);
  if (!selected.length) return null;

  if (behaviorName === "fixed-rib" || behaviorName === "fixed-rib-compress") {
    return makeFixedRibSkeletonPointTargetEntry(
      layer,
      skeletonData,
      reference,
      selected,
      behaviorName,
      options
    );
  }

  if (behaviorName === "equalize" || behaviorName === "equalize-constrain") {
    return makeEqualizeSkeletonHandleTargetEntry(
      layer,
      skeletonData,
      reference,
      selected,
      behaviorName
    );
  }

  const originalLayerGlyph = cloneLayerGlyphForSkeletonEdit(layer);
  const synthetic = makeSyntheticSkeletonPathInstance(skeletonData, selected);
  // Separate factories for delta vs transform: EditBehaviorFactory caches
  // behaviors under behaviorName regardless of doFullTransform, so sharing one
  // factory would hand back the delta behavior for the transform path too.
  const deltaFactory = new EditBehaviorFactory(synthetic.instance, synthetic.selection);
  const transformFactory = new EditBehaviorFactory(
    synthetic.instance,
    synthetic.selection
  );
  const syntheticDeltaBehavior = deltaFactory.getBehavior(behaviorName);
  const syntheticTransformBehavior =
    transformFactory.getTransformBehavior(behaviorName);

  let rollbackChange = null;
  const makeChange = (behavior, method, argument) => {
    // 1. Run the regular point-behavior rules on the synthetic path. The
    //    behavior computes absolute coordinates from the captured originals,
    //    so applying its change to the synthetic instance per frame yields
    //    current-frame positions.
    applyChange(synthetic.instance, behavior[method](argument));
    // 2. Copy EVERY mapped point position back onto the skeleton working copy
    //    (not only selected points — the rules move unselected neighbors too).
    const changes = makeEditSkeletonChange(originalLayerGlyph, (working) => {
      for (const [pointIndex, address] of synthetic.pointAddresses) {
        const target = resolveSkeletonAddressAcrossLayers(
          skeletonData,
          working,
          address.contourId,
          address.pointId
        );
        if (!target) continue;
        const [x, y] = synthetic.instance.path.getPointPosition(pointIndex);
        target.point.x = x;
        target.point.y = y;
      }
    });
    rollbackChange = changes.rollbackChange;
    return changes.change;
  };

  return {
    get rollbackChange() {
      return rollbackChange;
    },
    makeChangeForDelta(delta) {
      return makeChange(syntheticDeltaBehavior, "makeChangeForDelta", delta);
    },
    makeChangeForTransformation(transformation) {
      return makeChange(
        syntheticTransformBehavior,
        "makeChangeForTransformation",
        transformation
      );
    },
  };
}

function makeFixedRibSkeletonPointTargetEntry(
  layer,
  skeletonData,
  referenceSkeletonData,
  selected,
  behaviorName,
  options
) {
  const originalLayerGlyph = cloneLayerGlyphForSkeletonEdit(layer);
  const selectedPointKeys = new Set(
    selected.map((item) => makeSkeletonPointKey(item.contourId, item.pointId))
  );
  const clickedPointKey =
    resolveClickedSkeletonPointKey(
      skeletonData,
      referenceSkeletonData,
      options.clickedSkeletonPointKey
    ) || selectedPointKeys.values().next().value;
  let rollbackChange = null;
  return {
    get rollbackChange() {
      return rollbackChange;
    },
    makeChangeForDelta(delta) {
      const changes = makeEditSkeletonChange(originalLayerGlyph, (working) => {
        applyFixedRibDelta(
          skeletonData,
          working,
          selectedPointKeys,
          clickedPointKey,
          delta,
          {
            compress: behaviorName === "fixed-rib-compress",
            scaleControlPoints: true,
          }
        );
      });
      rollbackChange = changes.rollbackChange;
      return changes.change;
    },
    makeChangeForTransformation() {
      return null;
    },
  };
}

function makeEqualizeSkeletonHandleTargetEntry(
  layer,
  skeletonData,
  referenceSkeletonData,
  selected,
  behaviorName
) {
  const originalLayerGlyph = cloneLayerGlyphForSkeletonEdit(layer);
  const handles = selected
    .map((item) => {
      const reference = getSkeletonPointAddress(
        referenceSkeletonData,
        item.referenceContourId,
        item.referencePointId
      );
      const target = reference
        ? skeletonData === referenceSkeletonData
          ? reference
          : {
              contour: skeletonData?.contours?.[reference.contourIndex],
              contourIndex: reference.contourIndex,
              point:
                skeletonData?.contours?.[reference.contourIndex]?.points?.[
                  reference.pointIndex
                ],
              pointIndex: reference.pointIndex,
            }
        : null;
      if (
        !reference?.point?.type ||
        !target?.point?.type ||
        target.point.type !== reference.point.type ||
        !getSkeletonHandleEqualizeInfo(reference.contour, reference.pointIndex)
      ) {
        return null;
      }
      return {
        contourId: target.contour.id,
        pointId: target.point.id,
        originalPoint: { x: target.point.x, y: target.point.y },
      };
    })
    .filter((item) => item);
  if (!handles.length) {
    return null;
  }
  const constrain = behaviorName === "equalize-constrain";
  let rollbackChange = null;
  return {
    get rollbackChange() {
      return rollbackChange;
    },
    makeChangeForDelta(delta) {
      const changes = makeEditSkeletonChange(originalLayerGlyph, (working) => {
        for (const handle of handles) {
          const target = resolveSkeletonAddressAcrossLayers(
            skeletonData,
            working,
            handle.contourId,
            handle.pointId
          );
          if (!target) {
            continue;
          }
          if (constrain) {
            equalizeSkeletonHandleToPoint(
              target.contour,
              target.pointIndex,
              {
                x: handle.originalPoint.x + delta.x,
                y: handle.originalPoint.y + delta.y,
              },
              { constrain: true }
            );
          } else {
            equalizeSkeletonHandleFromDelta(target.contour, target.pointIndex, delta);
          }
        }
      });
      rollbackChange = changes.rollbackChange;
      return changes.change;
    },
    makeChangeForTransformation() {
      return null;
    },
  };
}

export function createSkeletonRibTargetEntries(
  layer,
  selection,
  behaviorName,
  { referenceSkeletonData = null, constrainMode = null } = {}
) {
  const skeletonData = getSkeletonData(layer);
  if (!skeletonData) {
    return [];
  }
  const reference = referenceSkeletonData || skeletonData;
  const selected = collectSkeletonRibSelection(selection, reference, skeletonData);
  if (!selected.length) {
    return [];
  }

  const originalLayerGlyph = cloneLayerGlyphForSkeletonEdit(layer);
  const executors = selected.map((address) => ({
    reference: {
      contourId: address.reference.contour.id,
      pointId: address.reference.point.id,
      side: address.reference.side,
    },
    executor: createSkeletonRibExecutor(address.target, behaviorName),
  }));

  let rollbackChange = null;
  return [
    {
      get rollbackChange() {
        return rollbackChange;
      },
      makeChangeForDelta(delta) {
        const changes = makeEditSkeletonChange(originalLayerGlyph, (working) => {
          for (const { reference, executor } of executors) {
            const target = resolveSkeletonRibAddressAcrossLayers(
              skeletonData,
              working,
              reference.contourId,
              reference.pointId,
              reference.side
            );
            if (!target) {
              continue;
            }
            const result = executor.applyDelta(delta, { constrainMode });
            applySkeletonRibExecutorResult(target, result);
          }
        });
        rollbackChange = changes.rollbackChange;
        return changes.change;
      },
      makeChangeForTransformation() {
        return null;
      },
    },
  ];
}

function collectSkeletonPointSelection(
  selection,
  referenceSkeletonData,
  targetSkeletonData
) {
  const { skeletonPoint } = parseSelection([...selection]);
  const selected = [];
  for (const item of skeletonPoint || []) {
    const { contourId, pointId } = parseSkeletonPointKey(item);
    const address = resolveSkeletonAddressAcrossLayers(
      referenceSkeletonData,
      targetSkeletonData,
      contourId,
      pointId
    );
    if (address) {
      selected.push({
        contourId: address.contour.id,
        pointId: address.point.id,
        referenceContourId: contourId,
        referencePointId: pointId,
      });
    }
  }
  return selected;
}

function resolveClickedSkeletonPointKey(
  targetSkeletonData,
  referenceSkeletonData,
  clickedSkeletonPointKey
) {
  if (!clickedSkeletonPointKey) {
    return null;
  }
  const { contourId, pointId } = parseSkeletonPointKey(clickedSkeletonPointKey);
  const reference = getSkeletonPointAddress(referenceSkeletonData, contourId, pointId);
  if (!reference) {
    return null;
  }
  const contour = targetSkeletonData?.contours?.[reference.contourIndex];
  const point = contour?.points?.[reference.pointIndex];
  if (!contour || !point || point.type) {
    return null;
  }
  return makeSkeletonPointKey(contour.id, point.id);
}

function collectSkeletonRibSelection(
  selection,
  referenceSkeletonData,
  targetSkeletonData
) {
  const { skeletonRib } = parseSelection([...selection]);
  const selected = [];
  for (const item of skeletonRib || []) {
    const { contourId, pointId, side } = parseSkeletonRibKey(`skeletonRib/${item}`);
    const reference = getSkeletonRibAddress(
      referenceSkeletonData,
      contourId,
      pointId,
      side
    );
    const target = resolveSkeletonRibAddressAcrossLayers(
      referenceSkeletonData,
      targetSkeletonData,
      contourId,
      pointId,
      side
    );
    if (reference && target) {
      selected.push({ reference, target });
    }
  }
  return selected;
}

function resolveSkeletonRibAddressAcrossLayers(
  referenceSkeletonData,
  targetSkeletonData,
  contourId,
  pointId,
  side
) {
  const reference = getSkeletonRibAddress(
    referenceSkeletonData,
    contourId,
    pointId,
    side
  );
  if (!reference) {
    return null;
  }
  if (referenceSkeletonData === targetSkeletonData) {
    return reference;
  }
  const contour = targetSkeletonData?.contours?.[reference.contourIndex];
  const point = contour?.points?.[reference.pointIndex];
  if (!contour || !point || point.type) {
    return null;
  }
  return getSkeletonRibAddress(targetSkeletonData, contour.id, point.id, side);
}

function makeSyntheticSkeletonPathInstance(skeletonData, selected) {
  const path = new VarPackedPath();
  const pointAddresses = new Map(); // absolute path point index -> { contourId, pointId }
  const selection = new Set();
  const selectedKeys = new Set(
    selected.map((item) => `${item.contourId}/${item.pointId}`)
  );
  let pointIndex = 0;
  for (const contour of skeletonData.contours) {
    path.appendUnpackedContour({
      points: contour.points.map((point) => ({
        x: point.x,
        y: point.y,
        ...(point.type ? { type: point.type } : {}),
        ...(point.smooth ? { smooth: true } : {}),
      })),
      isClosed: contour.closed,
    });
    for (const point of contour.points) {
      pointAddresses.set(pointIndex, { contourId: contour.id, pointId: point.id });
      if (selectedKeys.has(`${contour.id}/${point.id}`)) {
        selection.add(`point/${pointIndex}`);
      }
      pointIndex++;
    }
  }
  return {
    instance: { path, components: [], anchors: [], guidelines: [] },
    selection,
    pointAddresses,
  };
}
