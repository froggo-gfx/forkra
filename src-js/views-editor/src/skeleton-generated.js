import {
  getSkeletonData,
  getSkeletonHandleOffset,
  setSkeletonHandleOffset,
} from "@fontra/core/skeleton-model.js";
import { equalizeEditableGeneratedHandleOffsets } from "@fontra/core/skeleton-modifiers.js";
import { parseSelection } from "@fontra/core/utils.ts";
import {
  dotVector,
  mulVectorScalar,
  normalizeVector,
  subVectors,
  vectorLength,
} from "@fontra/core/vector.js";
import {
  createSkeletonRibTargetEntries,
  editSkeleton,
  makeEditSkeletonChange,
} from "./skeleton-editing.js";
import { getSkeletonRibAddress, makeSkeletonRibKey } from "./skeleton-ribs.js";

const EDITABLE_GENERATED_POINT_KEY_KIND = "editableGeneratedPoint";
const EDITABLE_GENERATED_HANDLE_KEY_KIND = "editableGeneratedHandle";
const VALID_GENERATED_SIDES = new Set(["left", "right"]);
const VALID_GENERATED_ROLES = new Set(["onCurve", "in", "out"]);
const VALID_HANDLE_ROLES = new Set(["in", "out"]);

export function makeEditableGeneratedPointKey(contourId, pointId, side) {
  assertGeneratedSide(side);
  assertNumericId(contourId, "contourId");
  assertNumericId(pointId, "pointId");
  return `${EDITABLE_GENERATED_POINT_KEY_KIND}/${contourId}/${pointId}/${side}`;
}

export function parseEditableGeneratedPointKey(key) {
  const parts = normalizeKeyParts(key, EDITABLE_GENERATED_POINT_KEY_KIND, 4);
  const [, contourId, pointId, side] = parts;
  assertGeneratedSide(side);
  assertNumericId(contourId, "contourId");
  assertNumericId(pointId, "pointId");
  return { contourId, pointId, side, role: "onCurve" };
}

export function makeEditableGeneratedHandleKey(contourId, pointId, side, role) {
  assertGeneratedSide(side);
  assertHandleRole(role);
  assertNumericId(contourId, "contourId");
  assertNumericId(pointId, "pointId");
  return `${EDITABLE_GENERATED_HANDLE_KEY_KIND}/${contourId}/${pointId}/${side}/${role}`;
}

export function parseEditableGeneratedHandleKey(key) {
  const parts = normalizeKeyParts(key, EDITABLE_GENERATED_HANDLE_KEY_KIND, 5);
  const [, contourId, pointId, side, role] = parts;
  assertGeneratedSide(side);
  assertHandleRole(role);
  assertNumericId(contourId, "contourId");
  assertNumericId(pointId, "pointId");
  return { contourId, pointId, side, role };
}

export function resolveGeneratedPointProvenance(skeletonData, path, pathPointIndex) {
  if (!skeletonData || !path || !Number.isInteger(pathPointIndex)) {
    return null;
  }
  let pathContourIndex;
  let contourPointIndex;
  try {
    [pathContourIndex, contourPointIndex] =
      path.getContourAndPointIndex(pathPointIndex);
  } catch {
    return null;
  }
  const generatedEntry = (skeletonData.generated || []).find(
    (entry) => entry?.pathContourIndex === pathContourIndex
  );
  const provenance = generatedEntry?.pointMap?.[contourPointIndex];
  if (!provenance || !VALID_GENERATED_ROLES.has(provenance.role)) {
    return null;
  }
  const contourId = provenance.skeletonContourId ?? generatedEntry.skeletonContourId;
  const pointId = provenance.skeletonPointId;
  if (!Number.isInteger(contourId) || !Number.isInteger(pointId)) {
    return null;
  }
  const contourIndex = (skeletonData.contours || []).findIndex(
    (contour) => contour.id === contourId
  );
  if (contourIndex < 0) {
    return null;
  }
  const contour = skeletonData.contours[contourIndex];
  const pointIndex = (contour.points || []).findIndex((point) => point.id === pointId);
  if (pointIndex < 0) {
    return null;
  }
  return {
    generatedEntry,
    pathContourIndex,
    pathPointIndex,
    contourId,
    pointId,
    side: provenance.side,
    role: provenance.role,
    contour,
    contourIndex,
    point: contour.points[pointIndex],
    pointIndex,
  };
}

export function resolveEditableGeneratedTarget(skeletonData, path, pathPointIndex) {
  const provenance = resolveGeneratedPointProvenance(
    skeletonData,
    path,
    pathPointIndex
  );
  if (!provenance || !VALID_GENERATED_SIDES.has(provenance.side)) {
    return null;
  }
  if (
    provenance.point?.type ||
    provenance.point?.editable?.[provenance.side] !== true
  ) {
    return null;
  }
  const kind =
    provenance.role === "onCurve"
      ? EDITABLE_GENERATED_POINT_KEY_KIND
      : EDITABLE_GENERATED_HANDLE_KEY_KIND;
  if (kind === EDITABLE_GENERATED_HANDLE_KEY_KIND) {
    assertHandleRole(provenance.role);
  }
  const selectionKey =
    kind === EDITABLE_GENERATED_POINT_KEY_KIND
      ? makeEditableGeneratedPointKey(
          provenance.contourId,
          provenance.pointId,
          provenance.side
        )
      : makeEditableGeneratedHandleKey(
          provenance.contourId,
          provenance.pointId,
          provenance.side,
          provenance.role
        );
  return {
    ...provenance,
    kind,
    selectionKey,
  };
}

export function findGeneratedPathAddress(skeletonData, contourId, pointId, side, role) {
  assertGeneratedSide(side);
  if (!VALID_GENERATED_ROLES.has(role)) {
    throw new Error(`invalid editable generated role: ${role}`);
  }
  const numericContourId = asStrictInteger(contourId);
  const numericPointId = asStrictInteger(pointId);
  if (numericContourId === null || numericPointId === null) {
    return null;
  }
  for (const generatedEntry of skeletonData?.generated || []) {
    if (generatedEntry?.skeletonContourId !== numericContourId) {
      continue;
    }
    const pointMap = generatedEntry.pointMap || [];
    for (
      let contourPointIndex = 0;
      contourPointIndex < pointMap.length;
      contourPointIndex++
    ) {
      const provenance = pointMap[contourPointIndex];
      if (
        provenance?.skeletonPointId === numericPointId &&
        provenance.side === side &&
        provenance.role === role
      ) {
        return {
          pathContourIndex: generatedEntry.pathContourIndex,
          contourPointIndex,
          pathPointIndex: contourPointIndex,
        };
      }
    }
  }
  return null;
}

export function createEditableGeneratedPointTargetEntries(
  layerGlyph,
  selection,
  behaviorName,
  options = {}
) {
  const referenceSkeletonData =
    options.referenceSkeletonData || getSkeletonData(layerGlyph);
  const ribSelection = new Set();
  for (const item of parseSelection([...selection]).editableGeneratedPoint || []) {
    const { contourId, pointId, side } = parseEditableGeneratedPointKey(item);
    const address = getSkeletonRibAddress(
      referenceSkeletonData,
      contourId,
      pointId,
      side
    );
    if (!address || address.point.editable?.[side] !== true) {
      continue;
    }
    if (
      !findGeneratedPathAddress(
        referenceSkeletonData,
        address.contour.id,
        address.point.id,
        side,
        "onCurve"
      )
    ) {
      continue;
    }
    ribSelection.add(makeSkeletonRibKey(address.contour.id, address.point.id, side));
  }
  if (!ribSelection.size) {
    return [];
  }
  return createSkeletonRibTargetEntries(layerGlyph, ribSelection, behaviorName, {
    ...options,
    referenceSkeletonData,
  });
}

export function getSkeletonHandleDirectionForPoint(contour, pointIndex, role) {
  assertHandleRole(role);
  const points = contour?.points || [];
  const point = points[pointIndex];
  if (!point || point.type) {
    return null;
  }
  const handleIndex =
    role === "in"
      ? getPreviousContourPointIndex(contour, pointIndex)
      : getNextContourPointIndex(contour, pointIndex);
  const handle = points[handleIndex];
  if (!handle?.type) {
    return null;
  }
  const direction = normalizeVector(subVectors(handle, point));
  return vectorLength(direction) ? direction : null;
}

export function createEditableGeneratedHandleTargetEntries(
  layerGlyph,
  selection,
  behaviorName,
  options = {}
) {
  const skeletonData = getSkeletonData(layerGlyph);
  if (!skeletonData) {
    return [];
  }
  const referenceSkeletonData = options.referenceSkeletonData || skeletonData;
  const selected = collectEditableGeneratedHandleSelection(
    selection,
    referenceSkeletonData,
    skeletonData
  );
  if (!selected.length) {
    return [];
  }

  const originalLayerGlyph = {
    ...layerGlyph,
    path: layerGlyph.path.copy(),
    customData: structuredClone(layerGlyph.customData || {}),
  };
  const executors = selected.map((address) => ({
    reference: {
      contourId: address.reference.contour.id,
      pointId: address.reference.point.id,
      side: address.reference.side,
      role: address.reference.role,
    },
    executor: createEditableGeneratedHandleExecutor(address.target, behaviorName),
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
            const target = resolveEditableGeneratedHandleAddressAcrossLayers(
              skeletonData,
              working,
              reference.contourId,
              reference.pointId,
              reference.side,
              reference.role
            );
            if (!target) {
              continue;
            }
            executor.applyDelta(target, delta);
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

export function toggleEditableGeneratedHandleDetached(layerGlyph, selection) {
  const skeletonData = getSkeletonData(layerGlyph);
  if (!skeletonData) {
    return null;
  }
  const handles = parseSelection([...selection]).editableGeneratedHandle || [];
  if (!handles.length) {
    return null;
  }
  const firstHandle = parseEditableGeneratedHandleKey(handles[0]);
  const current = resolveEditableGeneratedHandleAddressAcrossLayers(
    skeletonData,
    skeletonData,
    firstHandle.contourId,
    firstHandle.pointId,
    firstHandle.side,
    firstHandle.role
  );
  if (!current) {
    return null;
  }
  const currentOffset = getSkeletonHandleOffset(
    current.point,
    current.side,
    current.role
  );
  const detached = !currentOffset.detached;
  return editSkeleton(layerGlyph, (working) => {
    for (const item of handles) {
      const { contourId, pointId, side, role } = parseEditableGeneratedHandleKey(item);
      const target = resolveEditableGeneratedHandleAddressAcrossLayers(
        skeletonData,
        working,
        contourId,
        pointId,
        side,
        role
      );
      if (!target) {
        continue;
      }
      const offset = getSkeletonHandleOffset(target.point, side, role);
      setSkeletonHandleOffset(target.point, side, role, {
        ...offset,
        detached,
      });
    }
  });
}

function createEditableGeneratedHandleExecutor(address, behaviorName) {
  const originalOffset = getSkeletonHandleOffset(
    address.point,
    address.side,
    address.role
  );
  const direction = address.direction;
  const equalize = behaviorName?.startsWith("equalize") === true;
  const equalizeGeometry = equalize
    ? makeEditableGeneratedHandleEqualizeGeometry(address, originalOffset)
    : null;
  return {
    applyDelta(target, delta, { round = Math.round } = {}) {
      if (equalize && equalizeGeometry) {
        equalizeEditableGeneratedHandleOffsets(
          target.point,
          target.side,
          target.role,
          delta,
          equalizeGeometry,
          { round }
        );
        return;
      }
      setSkeletonHandleOffset(
        target.point,
        target.side,
        target.role,
        makeEditableGeneratedHandleOffset(originalOffset, direction, delta, round)
      );
    },
  };
}

function makeEditableGeneratedHandleOffset(
  originalOffset,
  direction,
  delta,
  round = Math.round
) {
  if (originalOffset.detached) {
    return {
      x: round(originalOffset.x + delta.x),
      y: round(originalOffset.y + delta.y),
      detached: true,
    };
  }
  const projectedDelta = dotVector(delta, direction);
  const offsetDelta = mulVectorScalar(direction, projectedDelta);
  return {
    x: round(originalOffset.x + offsetDelta.x),
    y: round(originalOffset.y + offsetDelta.y),
    detached: false,
  };
}

function makeEditableGeneratedHandleEqualizeGeometry(address, originalOffset) {
  const oppositeRole = address.role === "in" ? "out" : "in";
  const oppositeDirection = getSkeletonHandleDirectionForPoint(
    address.contour,
    address.pointIndex,
    oppositeRole
  );
  if (!oppositeDirection) {
    return null;
  }
  const oppositeOffset = getSkeletonHandleOffset(
    address.point,
    address.side,
    oppositeRole
  );
  return {
    draggedDirection: address.direction,
    oppositeDirection,
    detached: originalOffset.detached || oppositeOffset.detached,
    originalDraggedLength: vectorLength(originalOffset),
    originalOppositeLength: vectorLength(oppositeOffset),
  };
}

function collectEditableGeneratedHandleSelection(
  selection,
  referenceSkeletonData,
  targetSkeletonData
) {
  const selected = [];
  for (const item of parseSelection([...selection]).editableGeneratedHandle || []) {
    const { contourId, pointId, side, role } = parseEditableGeneratedHandleKey(item);
    const reference = resolveEditableGeneratedHandleAddressAcrossLayers(
      referenceSkeletonData,
      referenceSkeletonData,
      contourId,
      pointId,
      side,
      role
    );
    const target = resolveEditableGeneratedHandleAddressAcrossLayers(
      referenceSkeletonData,
      targetSkeletonData,
      contourId,
      pointId,
      side,
      role
    );
    if (!reference || !target) {
      continue;
    }
    if (
      !findGeneratedPathAddress(
        referenceSkeletonData,
        reference.contour.id,
        reference.point.id,
        side,
        role
      )
    ) {
      continue;
    }
    selected.push({ reference, target });
  }
  return selected;
}

function resolveEditableGeneratedHandleAddressAcrossLayers(
  referenceSkeletonData,
  targetSkeletonData,
  contourId,
  pointId,
  side,
  role
) {
  assertGeneratedSide(side);
  assertHandleRole(role);
  const reference = getSkeletonRibAddress(
    referenceSkeletonData,
    contourId,
    pointId,
    side
  );
  if (!reference || reference.point.editable?.[side] !== true) {
    return null;
  }
  const contour = targetSkeletonData?.contours?.[reference.contourIndex];
  const point = contour?.points?.[reference.pointIndex];
  if (!contour || !point || point.type || point.editable?.[side] !== true) {
    return null;
  }
  const direction = getSkeletonHandleDirectionForPoint(
    contour,
    reference.pointIndex,
    role
  );
  if (!direction) {
    return null;
  }
  return {
    contour,
    contourIndex: reference.contourIndex,
    point,
    pointIndex: reference.pointIndex,
    side,
    role,
    direction,
  };
}

function getPreviousContourPointIndex(contour, pointIndex) {
  if (pointIndex > 0) {
    return pointIndex - 1;
  }
  return contour?.closed ? (contour.points || []).length - 1 : -1;
}

function getNextContourPointIndex(contour, pointIndex) {
  if (pointIndex < (contour?.points || []).length - 1) {
    return pointIndex + 1;
  }
  return contour?.closed ? 0 : -1;
}

function normalizeKeyParts(key, kind, expectedLength) {
  let parts = `${key}`.split("/");
  if (parts[0] !== kind) {
    parts = [kind, ...parts];
  }
  if (parts.length !== expectedLength || parts[0] !== kind) {
    throw new Error(`invalid ${kind} key: ${key}`);
  }
  return parts;
}

function assertGeneratedSide(side) {
  if (!VALID_GENERATED_SIDES.has(side)) {
    throw new Error(`invalid editable generated side: ${side}`);
  }
}

function assertHandleRole(role) {
  if (!VALID_HANDLE_ROLES.has(role)) {
    throw new Error(`invalid editable generated handle role: ${role}`);
  }
}

function assertNumericId(value, name) {
  if (asStrictInteger(value) === null) {
    throw new Error(`invalid editable generated ${name}: ${value}`);
  }
}

function asStrictInteger(value) {
  if (Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) {
    return Number(value);
  }
  return null;
}
