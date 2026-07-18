// editSkeleton-backed edit operations for the skeleton parameters panel. This
// module is the panel's ONLY write path: every function folds one editSkeleton
// mutation across all editable layers into a single undo item. It never calls
// setSkeletonData/regenerateSkeletonContours directly and never recovers
// generated geometry (Global Constraints).

import { ChangeCollector } from "@fontra/core/changes.js";
import { generateFromSkeleton } from "@fontra/core/skeleton-generator.js";
import {
  getSkeletonData,
  getSkeletonHandleOffset,
  resetSkeletonEditableRib,
  resetSkeletonEditableRibHandles,
  setSkeletonCapParameters,
  setSkeletonContourDefaultWidth,
  setSkeletonContourSingleSided,
  setSkeletonCornerParameters,
  setSkeletonData,
  setSkeletonHandleDetached,
  setSkeletonHandleOffset,
  setSkeletonPointSideWidth,
  setSkeletonPointTotalWidth,
  setSkeletonPointWidthDistribution,
  setSkeletonPointWidthLinked,
} from "@fontra/core/skeleton-model.js";
import {
  editSkeleton,
  resolveSkeletonAddressAcrossLayers,
} from "./skeleton-editing.js";
import { findGeneratedPathAddress } from "./skeleton-generated.js";
import { skeletonContourEndpointIndices } from "./skeleton-panel-model.js";

// Sender identity for every edit made through this module. The skeleton
// parameters panel filters glyphChanged events by it: its own edits already
// rebuild the form in _onFieldChange, and the async echo arriving after the
// suppression window would otherwise trigger a second rebuild that replaces
// the slider input the user is still interacting with.
export const SKELETON_PANEL_SENDER = { senderID: "skeleton-panel-edits" };

// Resolve a target skeleton contour in `target` layer from a reference-layer
// contour id, by structural ordinal (cross-layer addressing, WS-9). Returns the
// target contour or null when the structure is incompatible.
function resolveContourAcrossLayers(reference, target, contourId) {
  const contourIndex = (reference?.contours || []).findIndex(
    (contour) => contour.id === contourId
  );
  if (contourIndex < 0) {
    return null;
  }
  if (reference === target) {
    return reference.contours[contourIndex];
  }
  return target?.contours?.[contourIndex] || null;
}

// The generic loop: run `applyToLayer(working, referenceSkeletonData, isEditLayer)`
// on every editable layer's working skeleton, combine the per-layer changes into
// one undo item. Mirrors edit-tools-skeleton.js `_editSkeletonAcrossLayers`.
export async function runSkeletonPanelEdit(sceneController, undoLabel, applyToLayer) {
  return await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    const editingLayers = sceneController.getEditingLayerFromGlyphLayers(glyph.layers);
    const entries = Object.entries(editingLayers);
    if (!entries.length) {
      return;
    }
    const editLayerName = sceneController.sceneSettings?.editLayerName;
    const editLayerGlyph = editingLayers[editLayerName] || entries[0][1];
    const referenceSkeletonData = getSkeletonData(editLayerGlyph);

    const allChanges = [];
    for (const [layerName, layerGlyph] of entries) {
      const isEditLayer = layerGlyph === editLayerGlyph;
      const changes = editSkeleton(layerGlyph, (working) => {
        applyToLayer(working, referenceSkeletonData, isEditLayer);
      });
      allChanges.push(changes.prefixed(["layers", layerName, "glyph"]));
    }

    const combined = new ChangeCollector().concat(...allChanges);
    await sendIncrementalChange(combined.change);
    return { changes: combined, undoLabel, broadcast: true };
  }, SKELETON_PANEL_SENDER);
}

// Core point-editing helper: for every selected point address, resolve it into
// the current layer (by stable id in the edit layer, structural ordinal
// elsewhere) and run `mutator(point, resolvedAddress, { contour })`.
export async function editSelectedSkeletonPoints(
  sceneController,
  selectionAddresses,
  mutator,
  undoLabel
) {
  if (!selectionAddresses.length) {
    return null;
  }
  return await runSkeletonPanelEdit(
    sceneController,
    undoLabel,
    (working, reference) => {
      for (const address of selectionAddresses) {
        const resolved = resolveSkeletonAddressAcrossLayers(
          reference,
          working,
          address.contourId,
          address.pointId
        );
        if (!resolved || resolved.point.type) {
          continue;
        }
        mutator(resolved.point, address, {
          contour: resolved.contour,
          defaultWidth: resolved.contour.defaultWidth,
        });
      }
    }
  );
}

// Core contour-editing helper.
export async function editSelectedSkeletonContours(
  sceneController,
  contourAddresses,
  mutator,
  undoLabel
) {
  if (!contourAddresses.length) {
    return null;
  }
  return await runSkeletonPanelEdit(
    sceneController,
    undoLabel,
    (working, reference) => {
      for (const address of contourAddresses) {
        const contour = resolveContourAcrossLayers(
          reference,
          working,
          address.contourId
        );
        if (!contour) {
          continue;
        }
        mutator(contour, address);
      }
    }
  );
}

// ---- Point width operations -------------------------------------------------

export async function setPanelPointSideWidth(
  sceneController,
  pointAddresses,
  side,
  value,
  undoLabel
) {
  return editSelectedSkeletonPoints(
    sceneController,
    pointAddresses,
    (point, _address, { defaultWidth }) => {
      setSkeletonPointSideWidth(point, defaultWidth, side, value, {
        linked: point?.width?.linked !== false,
      });
    },
    undoLabel
  );
}

export async function setPanelPointTotalWidth(
  sceneController,
  pointAddresses,
  value,
  undoLabel
) {
  return editSelectedSkeletonPoints(
    sceneController,
    pointAddresses,
    (point, _address, { defaultWidth }) => {
      setSkeletonPointTotalWidth(point, defaultWidth, value);
    },
    undoLabel
  );
}

export async function setPanelPointDistribution(
  sceneController,
  pointAddresses,
  value,
  undoLabel
) {
  return editSelectedSkeletonPoints(
    sceneController,
    pointAddresses,
    (point, _address, { defaultWidth }) => {
      setSkeletonPointWidthDistribution(point, defaultWidth, value);
    },
    undoLabel
  );
}

// Streaming variant of setPanelPointDistribution: applies slider values to the
// canvas as they arrive (throttled), while producing exactly ONE undo record
// spanning the whole drag. Every tick restores the pre-drag layer state and
// re-applies from there, so the last recorded change IS original -> final.
// Stream a slider's values onto the selected points in realtime: snapshot the
// layers, then per throttled tick restore the snapshot and re-apply the
// current value, so the drag lands as ONE undo record (1.2.2 recipe).
export async function setPanelPointValuesStream(
  sceneController,
  pointAddresses,
  valueStream,
  applyToPoint,
  undoLabel
) {
  if (!pointAddresses.length) {
    return null;
  }
  const THROTTLE_MS = 32;
  return await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    const editingLayers = sceneController.getEditingLayerFromGlyphLayers(glyph.layers);
    const entries = Object.entries(editingLayers);
    if (!entries.length) {
      return;
    }
    const editLayerName = sceneController.sceneSettings?.editLayerName;
    const editLayerGlyph = editingLayers[editLayerName] || entries[0][1];
    const referenceSkeletonData = getSkeletonData(editLayerGlyph);

    const originals = entries.map(([layerName, layerGlyph]) => ({
      layerName,
      layerGlyph,
      path: layerGlyph.path.copy(),
      skeleton: structuredClone(getSkeletonData(layerGlyph)),
    }));

    const restoreOriginals = () => {
      for (const original of originals) {
        original.layerGlyph.path = original.path.copy();
        setSkeletonData(original.layerGlyph, structuredClone(original.skeleton));
      }
    };

    const applyValue = (value) => {
      const allChanges = [];
      for (const [layerName, layerGlyph] of entries) {
        const changes = editSkeleton(layerGlyph, (working) => {
          for (const address of pointAddresses) {
            const resolved = resolveSkeletonAddressAcrossLayers(
              referenceSkeletonData,
              working,
              address.contourId,
              address.pointId
            );
            if (!resolved || resolved.point.type) {
              continue;
            }
            applyToPoint(resolved.point, resolved.contour, value);
          }
        });
        allChanges.push(changes.prefixed(["layers", layerName, "glyph"]));
      }
      return new ChangeCollector().concat(...allChanges);
    };

    let lastValue = null;
    let lastApplied = null;
    let lastCollector = null;
    let lastTime = 0;
    for await (const value of valueStream) {
      lastValue = value;
      const now = Date.now();
      if (now - lastTime < THROTTLE_MS) {
        continue;
      }
      lastTime = now;
      restoreOriginals();
      lastCollector = applyValue(value);
      lastApplied = value;
      await sendIncrementalChange(lastCollector.change, true);
    }

    if (lastValue === null) {
      return;
    }
    if (lastApplied !== lastValue || !lastCollector) {
      restoreOriginals();
      lastCollector = applyValue(lastValue);
    }
    await sendIncrementalChange(lastCollector.change);
    return { changes: lastCollector, undoLabel, broadcast: true };
  }, SKELETON_PANEL_SENDER);
}

export async function setPanelPointDistributionStream(
  sceneController,
  pointAddresses,
  valueStream,
  undoLabel
) {
  return setPanelPointValuesStream(
    sceneController,
    pointAddresses,
    valueStream,
    (point, contour, value) => {
      setSkeletonPointWidthDistribution(point, contour.defaultWidth, value);
    },
    undoLabel
  );
}

export async function setPanelPointLinked(
  sceneController,
  pointAddresses,
  linked,
  undoLabel
) {
  return editSelectedSkeletonPoints(
    sceneController,
    pointAddresses,
    (point) => {
      setSkeletonPointWidthLinked(point, linked);
    },
    undoLabel
  );
}

// Scale effective widths by `factor`, keeping a minimum total width of 2.
export async function scalePanelPointWidth(
  sceneController,
  pointAddresses,
  factor,
  undoLabel
) {
  return editSelectedSkeletonPoints(
    sceneController,
    pointAddresses,
    (point, _address, { defaultWidth }) => {
      const width = point.width || {};
      const left = Math.max(0, (width.left ?? defaultWidth / 2) * factor);
      const right = Math.max(0, (width.right ?? defaultWidth / 2) * factor);
      const total = Math.max(2, left + right);
      const scale = left + right > 0 ? total / (left + right) : 1;
      point.width = {
        left: Math.round(left * scale),
        right: Math.round(right * scale),
        linked: width.linked !== false,
      };
    },
    undoLabel
  );
}

// Apply a width snapshot (profile revert), restoring exact canonical widths.
export async function applyPanelPointWidthSnapshot(
  sceneController,
  pointAddresses,
  snapshot,
  undoLabel
) {
  return editSelectedSkeletonPoints(
    sceneController,
    pointAddresses,
    (point, address) => {
      const entry = snapshot.get(`${address.contourId}/${address.pointId}`);
      if (!entry) {
        return;
      }
      point.width = {
        left: Math.max(0, entry.left),
        right: Math.max(0, entry.right),
        linked: entry.linked !== false,
      };
    },
    undoLabel
  );
}

// ---- Contour operations -----------------------------------------------------

export async function setPanelContourSingleSided(
  sceneController,
  contourAddresses,
  sideOrNull,
  undoLabel
) {
  return editSelectedSkeletonContours(
    sceneController,
    contourAddresses,
    (contour) => {
      setSkeletonContourSingleSided(contour, sideOrNull);
    },
    undoLabel
  );
}

export async function setPanelContourDefaultWidth(
  sceneController,
  contourAddresses,
  value,
  undoLabel
) {
  return editSelectedSkeletonContours(
    sceneController,
    contourAddresses,
    (contour) => {
      setSkeletonContourDefaultWidth(contour, value);
    },
    undoLabel
  );
}

// ---- Cap and corner operations ----------------------------------------------

export async function setPanelCapParameters(
  sceneController,
  pointAddresses,
  values,
  undoLabel
) {
  return editSelectedSkeletonPoints(
    sceneController,
    pointAddresses,
    (point) => {
      setSkeletonCapParameters(point, values);
    },
    undoLabel
  );
}

// Set the cap style on selected open-contour endpoints. Non-endpoint points
// are skipped per layer (cross-layer structures may differ). Round caps clear
// editable rib state on both sides (donor parity: round cap endpoints must
// not keep editable ribs).
export async function setPanelCapStyle(
  sceneController,
  pointAddresses,
  capStyle,
  undoLabel,
  presetValues = null
) {
  const presetFields =
    capStyle === "round"
      ? ["capRadiusRatio", "capTension"]
      : capStyle === "square"
        ? ["capAngle", "capDistance"]
        : [];
  return editSelectedSkeletonPoints(
    sceneController,
    pointAddresses,
    (point, _address, { contour }) => {
      const endpoints = skeletonContourEndpointIndices(contour);
      if (!endpoints) {
        return;
      }
      const pointIndex = contour.points.indexOf(point);
      if (pointIndex !== endpoints.first && pointIndex !== endpoints.last) {
        return;
      }
      setSkeletonCapParameters(point, { capStyle });
      // Master cap presets ("Default caps") seed the style's parameters when
      // the point doesn't carry explicit values yet (donor "Base" profile)
      const seeded = {};
      for (const field of presetFields) {
        if (!Number.isFinite(point[field]) && Number.isFinite(presetValues?.[field])) {
          seeded[field] = presetValues[field];
        }
      }
      if (Object.keys(seeded).length) {
        setSkeletonCapParameters(point, seeded);
      }
      if (capStyle === "round") {
        resetSkeletonEditableRib(point, "left");
        resetSkeletonEditableRib(point, "right");
      }
    },
    undoLabel
  );
}

export async function setPanelCornerParameters(
  sceneController,
  pointAddresses,
  values,
  undoLabel
) {
  return editSelectedSkeletonPoints(
    sceneController,
    pointAddresses,
    (point) => {
      setSkeletonCornerParameters(point, values);
    },
    undoLabel
  );
}

// ---- Rib / editable-generated handle operations -----------------------------

export async function resetPanelRibs(
  sceneController,
  ribAddresses,
  { handlesOnly = false } = {},
  undoLabel
) {
  return editSelectedSkeletonPoints(
    sceneController,
    ribAddresses,
    (point, address) => {
      if (handlesOnly) {
        resetSkeletonEditableRibHandles(point, address.side);
      } else {
        resetSkeletonEditableRib(point, address.side);
      }
    },
    undoLabel
  );
}

// Position of a generated point in raw generator output (pre-packing), found
// by side-bearing provenance.
function findGeneratedOutputPosition(generated, contourId, pointId, side, role) {
  for (const entry of generated.provenance || []) {
    if (entry.skeletonContourId !== contourId) {
      continue;
    }
    const pointMap = entry.pointMap || [];
    for (let i = 0; i < pointMap.length; i++) {
      const provenance = pointMap[i];
      if (
        provenance?.skeletonPointId === pointId &&
        provenance.side === side &&
        provenance.role === role
      ) {
        return generated.contours[entry.generatedContourIndex]?.points?.[i] || null;
      }
    }
  }
  return null;
}

// Compute position-preserving offset conversions for a detach toggle (donor
// parity): detaching rewrites each handle offset into rib-point space
// (offset = handle − rib point); re-attaching rewrites it into control-point
// space (offset = handle − base handle, where the base comes from
// regenerating with that side's offsets cleared). Either way the handle must
// not move on canvas when the checkbox is toggled.
export function computeRibDetachConversions(
  layerGlyph,
  referenceSkeletonData,
  ribAddresses,
  detached
) {
  const skeletonData = getSkeletonData(layerGlyph);
  const conversions = [];
  for (const address of ribAddresses) {
    const resolved = resolveSkeletonAddressAcrossLayers(
      referenceSkeletonData,
      skeletonData,
      address.contourId,
      address.pointId
    );
    if (
      !resolved ||
      resolved.point.type ||
      resolved.point.editable?.[address.side] !== true
    ) {
      continue;
    }
    const positions = {};
    for (const role of ["in", "out", "onCurve"]) {
      const pathAddress = findGeneratedPathAddress(
        skeletonData,
        resolved.contour.id,
        resolved.point.id,
        address.side,
        role
      );
      if (!pathAddress) {
        continue;
      }
      try {
        positions[role] = layerGlyph.path.getPoint(
          layerGlyph.path.getAbsolutePointIndex(
            pathAddress.pathContourIndex,
            pathAddress.contourPointIndex
          )
        );
      } catch {
        continue;
      }
    }
    if (!positions.onCurve || (!positions.in && !positions.out)) {
      continue;
    }

    let basePositions = null;
    if (!detached) {
      // Re-attaching: base = regeneration WITHOUT this side's offsets.
      const scratch = structuredClone(skeletonData);
      const scratchPoint =
        scratch.contours[resolved.contourIndex]?.points?.[resolved.pointIndex];
      if (!scratchPoint) {
        continue;
      }
      scratchPoint.handleOffsets = {
        ...scratchPoint.handleOffsets,
        [`${address.side}In`]: { x: 0, y: 0, detached: false },
        [`${address.side}Out`]: { x: 0, y: 0, detached: false },
      };
      const generated = generateFromSkeleton(scratch);
      basePositions = {
        in: findGeneratedOutputPosition(
          generated,
          resolved.contour.id,
          resolved.point.id,
          address.side,
          "in"
        ),
        out: findGeneratedOutputPosition(
          generated,
          resolved.contour.id,
          resolved.point.id,
          address.side,
          "out"
        ),
      };
    }

    const offsets = {};
    for (const role of ["in", "out"]) {
      const handlePos = positions[role];
      if (!handlePos) {
        continue;
      }
      const base = detached ? positions.onCurve : basePositions?.[role];
      if (!base) {
        continue;
      }
      offsets[role] = {
        x: Math.round(handlePos.x - base.x),
        y: Math.round(handlePos.y - base.y),
      };
    }
    conversions.push({
      contourId: address.contourId,
      pointId: address.pointId,
      side: address.side,
      offsets,
    });
  }
  return conversions;
}

// Detach the handle offsets of the selected rib sides from the skeleton
// (absolute positioning relative to the rib point) or re-attach them
// (relative to the generated base handles). Position-preserving in both
// directions.
export async function setPanelRibDetached(
  sceneController,
  ribAddresses,
  detached,
  undoLabel
) {
  if (!ribAddresses.length) {
    return null;
  }
  return await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    const editingLayers = sceneController.getEditingLayerFromGlyphLayers(glyph.layers);
    const entries = Object.entries(editingLayers);
    if (!entries.length) {
      return;
    }
    const editLayerName = sceneController.sceneSettings?.editLayerName;
    const editLayerGlyph = editingLayers[editLayerName] || entries[0][1];
    const referenceSkeletonData = getSkeletonData(editLayerGlyph);

    const allChanges = [];
    for (const [layerName, layerGlyph] of entries) {
      const conversions = computeRibDetachConversions(
        layerGlyph,
        referenceSkeletonData,
        ribAddresses,
        detached
      );
      const changes = editSkeleton(layerGlyph, (working) => {
        for (const conversion of conversions) {
          const resolved = resolveSkeletonAddressAcrossLayers(
            referenceSkeletonData,
            working,
            conversion.contourId,
            conversion.pointId
          );
          if (!resolved || resolved.point.type) {
            continue;
          }
          for (const [role, offset] of Object.entries(conversion.offsets)) {
            const existing = getSkeletonHandleOffset(
              resolved.point,
              conversion.side,
              role
            );
            setSkeletonHandleOffset(resolved.point, conversion.side, role, {
              ...existing,
              x: offset.x,
              y: offset.y,
            });
          }
          // Direct flag write LAST: it both sets and clears `detached`.
          setSkeletonHandleDetached(resolved.point, conversion.side, detached);
        }
      });
      allChanges.push(changes.prefixed(["layers", layerName, "glyph"]));
    }

    const combined = new ChangeCollector().concat(...allChanges);
    await sendIncrementalChange(combined.change);
    return { changes: combined, undoLabel, broadcast: true };
  });
}

export async function setPanelRibEditable(
  sceneController,
  ribAddresses,
  editable,
  undoLabel
) {
  return editSelectedSkeletonPoints(
    sceneController,
    ribAddresses,
    (point, address) => {
      if (editable) {
        point.editable = { ...(point.editable || {}), [address.side]: true };
      } else {
        resetSkeletonEditableRib(point, address.side);
      }
    },
    undoLabel
  );
}
