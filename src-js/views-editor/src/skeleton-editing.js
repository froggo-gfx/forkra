import { recordChanges } from "@fontra/core/change-recorder.js";
import { applyChange } from "@fontra/core/changes.js";
import {
  generateFromSkeleton,
  outlineContourToPackedPath,
} from "@fontra/core/skeleton-generator.js";
import {
  getSkeletonData,
  normalizeSkeletonData,
  setSkeletonData,
} from "@fontra/core/skeleton-model.js";
import { parseSelection } from "@fontra/core/utils.ts";
import { VarPackedPath } from "@fontra/core/var-path.js";
import { EditBehaviorFactory } from "./edit-behavior.js";

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
  if (!original) {
    return;
  }

  const working = normalizeSkeletonData(structuredClone(original));
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

export function makeSkeletonPointTargetEntry(
  layer,
  selection,
  behaviorName,
  referenceSkeletonData = null
) {
  const skeletonData = getSkeletonData(layer);
  if (!skeletonData) return null;
  // Cross-layer addressing: selection ids are canonical in the edit layer;
  // resolve them into this layer by structural ordinal (Global Constraints).
  const reference = referenceSkeletonData || skeletonData;
  const selected = collectSkeletonPointSelection(selection, reference, skeletonData);
  if (!selected.length) return null;

  const originalLayerGlyph = cloneLayerGlyphForSkeletonEdit(layer);
  const synthetic = makeSyntheticSkeletonPathInstance(skeletonData, selected);
  const behaviorFactory = new EditBehaviorFactory(
    synthetic.instance,
    synthetic.selection
  );
  const syntheticBehavior = behaviorFactory.getBehavior(behaviorName);

  let rollbackChange = null;
  const makeChange = (method, argument) => {
    // 1. Run the regular point-behavior rules on the synthetic path. The
    //    behavior computes absolute coordinates from the captured originals,
    //    so applying its change to the synthetic instance per frame yields
    //    current-frame positions.
    applyChange(synthetic.instance, syntheticBehavior[method](argument));
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
      return makeChange("makeChangeForDelta", delta);
    },
    makeChangeForTransformation(transformation) {
      return makeChange("makeChangeForTransformation", transformation);
    },
  };
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
      selected.push({ contourId: address.contour.id, pointId: address.point.id });
    }
  }
  return selected;
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
