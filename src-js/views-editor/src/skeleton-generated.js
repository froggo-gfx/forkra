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
