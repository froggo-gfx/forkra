// Pure selection-aggregation and mixed-value helpers for the skeleton
// parameters panel. No persistence, no editSkeleton, no DOM: this module only
// reads skeleton data and reports what the panel should display. All edits go
// through skeleton-panel-edits.js -> editSkeleton (Global Constraints).

import {
  getSkeletonHandleOffset,
  getSkeletonPointHalfWidth,
  getSkeletonPointWidth,
} from "@fontra/core/skeleton-model.js";
import { parseSelection } from "@fontra/core/utils.ts";
import { getSkeletonPointAddress, parseSkeletonPointKey } from "./skeleton-editing.js";
import {
  parseEditableGeneratedHandleKey,
  parseEditableGeneratedPointKey,
} from "./skeleton-generated.js";
import { getSkeletonRibAddress, parseSkeletonRibKey } from "./skeleton-ribs.js";

function resolvePointAddress(skeletonData, contourId, pointId) {
  return getSkeletonPointAddress(skeletonData, Number(contourId), Number(pointId));
}

// Aggregate the current selection into skeleton points, ribs, generated
// points/handles and touched contours, all resolved against `skeletonData`
// (the display/edit layer). Addresses carry stable ids (used for edits) plus
// indices (used only for display).
export function collectSkeletonPanelSelection({ selection, skeletonData }) {
  const result = {
    points: [],
    ribs: [],
    generatedPoints: [],
    generatedHandles: [],
    contours: [],
  };
  if (!skeletonData) {
    return result;
  }
  const parsed = parseSelection([...(selection || [])]);
  const seenContours = new Set();

  const noteContour = (address) => {
    if (address && !seenContours.has(address.contour.id)) {
      seenContours.add(address.contour.id);
      result.contours.push({
        contourId: address.contour.id,
        contour: address.contour,
        contourIndex: address.contourIndex,
      });
    }
  };

  for (const item of parsed.skeletonPoint || []) {
    const { contourId, pointId } = parseSkeletonPointKey(item);
    const address = resolvePointAddress(skeletonData, contourId, pointId);
    if (!address) continue;
    result.points.push({
      contourId: address.contour.id,
      pointId: address.point.id,
      contour: address.contour,
      contourIndex: address.contourIndex,
      point: address.point,
      pointIndex: address.pointIndex,
    });
    noteContour(address);
  }

  for (const item of parsed.skeletonRib || []) {
    const { contourId, pointId, side } = parseSkeletonRibKey(`skeletonRib/${item}`);
    const address = getSkeletonRibAddress(skeletonData, contourId, pointId, side);
    if (!address) continue;
    result.ribs.push({
      contourId: address.contour.id,
      pointId: address.point.id,
      side,
      contour: address.contour,
      contourIndex: address.contourIndex,
      point: address.point,
      pointIndex: address.pointIndex,
    });
    noteContour(address);
  }

  for (const item of parsed.editableGeneratedPoint || []) {
    let parsedKey;
    try {
      parsedKey = parseEditableGeneratedPointKey(`editableGeneratedPoint/${item}`);
    } catch {
      continue;
    }
    const address = resolvePointAddress(
      skeletonData,
      parsedKey.contourId,
      parsedKey.pointId
    );
    if (!address) continue;
    result.generatedPoints.push({
      contourId: address.contour.id,
      pointId: address.point.id,
      side: parsedKey.side,
      contour: address.contour,
      point: address.point,
      pointIndex: address.pointIndex,
    });
    noteContour(address);
  }

  for (const item of parsed.editableGeneratedHandle || []) {
    let parsedKey;
    try {
      parsedKey = parseEditableGeneratedHandleKey(`editableGeneratedHandle/${item}`);
    } catch {
      continue;
    }
    const address = resolvePointAddress(
      skeletonData,
      parsedKey.contourId,
      parsedKey.pointId
    );
    if (!address) continue;
    result.generatedHandles.push({
      contourId: address.contour.id,
      pointId: address.point.id,
      side: parsedKey.side,
      role: parsedKey.role,
      contour: address.contour,
      point: address.point,
      pointIndex: address.pointIndex,
    });
    noteContour(address);
  }

  return result;
}

// The panel points that participate in width/cap/corner editing: explicitly
// selected skeleton points plus the points behind selected ribs.
export function collectWidthEditPoints(panelSelection) {
  const byKey = new Map();
  const add = (entry) => {
    const key = `${entry.contourId}/${entry.pointId}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        contourId: entry.contourId,
        pointId: entry.pointId,
        contour: entry.contour,
        point: entry.point,
      });
    }
  };
  for (const entry of panelSelection.points) add(entry);
  for (const entry of panelSelection.ribs) add(entry);
  return [...byKey.values()];
}

// Reduce a set of per-entry values into { value, mixed } (value is the shared
// value, or the first when mixed). `disabled` when the set is empty.
function reduceValues(values, { tolerance = 0 } = {}) {
  if (!values.length) {
    return { value: null, mixed: false, disabled: true, placeholder: null };
  }
  const first = values[0];
  const mixed = values.some((value) =>
    typeof value === "number" && typeof first === "number"
      ? Math.abs(value - first) > tolerance
      : value !== first
  );
  return {
    value: mixed ? null : first,
    mixed,
    disabled: false,
    placeholder: mixed ? "mixed" : null,
  };
}

function pointDefaultWidth(entry) {
  return entry.contour?.defaultWidth;
}

export function summarizeSkeletonPointWidths(selectedPoints) {
  const left = reduceValues(
    selectedPoints.map((entry) =>
      getSkeletonPointHalfWidth(entry.point, pointDefaultWidth(entry), "left")
    )
  );
  const right = reduceValues(
    selectedPoints.map((entry) =>
      getSkeletonPointHalfWidth(entry.point, pointDefaultWidth(entry), "right")
    )
  );
  const total = reduceValues(
    selectedPoints.map((entry) =>
      getSkeletonPointWidth(entry.point, pointDefaultWidth(entry))
    )
  );
  const distribution = reduceValues(
    selectedPoints.map((entry) =>
      pointDistribution(entry.point, pointDefaultWidth(entry))
    )
  );
  const linked = reduceValues(
    selectedPoints.map((entry) => entry.point?.width?.linked !== false)
  );
  return { left, right, total, distribution, linked };
}

// Distribution percent in [-100, 100]: negative favors the right side, positive
// the left. Matches setSkeletonPointWidthDistribution (skeleton-model.js).
export function pointDistribution(point, defaultWidth) {
  const left = getSkeletonPointHalfWidth(point, defaultWidth, "left");
  const right = getSkeletonPointHalfWidth(point, defaultWidth, "right");
  const total = left + right;
  if (total <= 0) {
    return 0;
  }
  return ((left - right) / total) * 100;
}

export function summarizeSkeletonContourSelection(contours) {
  return {
    singleSided: reduceValues(
      contours.map((entry) => entry.contour.singleSided ?? null)
    ),
    defaultWidth: reduceValues(contours.map((entry) => entry.contour.defaultWidth)),
  };
}

export function summarizeSkeletonCapSelection(selectedPoints) {
  return {
    capStyle: reduceValues(selectedPoints.map((entry) => entry.point.capStyle ?? null)),
    capRadiusRatio: reduceValues(
      selectedPoints.map((entry) => entry.point.capRadiusRatio ?? null)
    ),
    capTension: reduceValues(
      selectedPoints.map((entry) => entry.point.capTension ?? null)
    ),
    capAngle: reduceValues(selectedPoints.map((entry) => entry.point.capAngle ?? null)),
    capDistance: reduceValues(
      selectedPoints.map((entry) => entry.point.capDistance ?? null)
    ),
  };
}

export function summarizeSkeletonCornerSelection(selectedPoints, contours) {
  return {
    roundnessStrength: reduceValues(
      selectedPoints.map((entry) => entry.point.roundnessStrength ?? null)
    ),
    cornerAsymmetry: reduceValues(
      selectedPoints.map((entry) => entry.point.cornerAsymmetry ?? null)
    ),
    cornerTrimRatio: reduceValues(
      contours.map((entry) => entry.contour.cornerTrimRatio ?? null)
    ),
    cornerRadiusBoost: reduceValues(
      contours.map((entry) => entry.contour.cornerRadiusBoost ?? null)
    ),
  };
}

export function summarizeSkeletonRibSelection(selectedRibs) {
  return {
    editable: reduceValues(
      selectedRibs.map((entry) => entry.point?.editable?.[entry.side] === true)
    ),
    detached: reduceValues(
      selectedRibs.map(
        (entry) =>
          getSkeletonHandleOffset(entry.point, entry.side, "in").detached === true ||
          getSkeletonHandleOffset(entry.point, entry.side, "out").detached === true
      )
    ),
  };
}

// Snapshots power donor-style profile apply/revert: capture the exact canonical
// width objects keyed by contourId/pointId, restore them verbatim.
export function capturePointWidthSnapshot(selectedPoints) {
  const snapshot = new Map();
  for (const entry of selectedPoints) {
    const width = entry.point?.width;
    snapshot.set(`${entry.contourId}/${entry.pointId}`, {
      left: getSkeletonPointHalfWidth(entry.point, pointDefaultWidth(entry), "left"),
      right: getSkeletonPointHalfWidth(entry.point, pointDefaultWidth(entry), "right"),
      linked: width?.linked !== false,
    });
  }
  return snapshot;
}

export function applyPointWidthSnapshot(point, snapshot) {
  if (!snapshot) {
    return;
  }
  point.width = {
    left: Math.max(0, snapshot.left),
    right: Math.max(0, snapshot.right),
    linked: snapshot.linked !== false,
  };
}

// A compact, stable signature of everything the panel renders, so the panel can
// skip a rebuild when nothing relevant changed (Task 10).
export function makeSkeletonPanelStateSignature({
  glyphName,
  editingLayerNames,
  selection,
  sourceDefaultsSignature,
  panelSelection,
}) {
  const parts = [
    `g:${glyphName || ""}`,
    `L:${(editingLayerNames || []).join(",")}`,
    `s:${[...(selection || [])].sort().join(",")}`,
    `d:${sourceDefaultsSignature || ""}`,
  ];
  if (panelSelection) {
    for (const entry of panelSelection.points) {
      parts.push(
        `p:${entry.contourId}/${entry.pointId}:${JSON.stringify(entry.point.width)}:${JSON.stringify(entry.point.nudge)}:${entry.point.capStyle}:${entry.point.capRadiusRatio}:${entry.point.capTension}:${entry.point.capAngle}:${entry.point.capDistance}:${entry.point.roundnessStrength}:${entry.point.cornerAsymmetry}`
      );
    }
    for (const entry of panelSelection.contours) {
      parts.push(
        `c:${entry.contourId}:${entry.contour.singleSided}:${entry.contour.defaultWidth}:${entry.contour.cornerTrimRatio}:${entry.contour.cornerRadiusBoost}`
      );
    }
  }
  return parts.join("|");
}
