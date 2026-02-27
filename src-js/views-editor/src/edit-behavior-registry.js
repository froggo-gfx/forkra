// Adapter Contract (applies to all object kinds)
// - applyDelta(delta, context) does not touch persistence.
// - applyToLayer(layer, layerName) is the only method that writes canonical data.
// - applyToLayer returns { forward, rollback } change objects.
// - rollback must match the shape undo/redo expects (recordChanges-compatible).
//
// Contract type notes (conceptual):
// adapter.applyDelta(delta, context) -> void
// adapter.applyToLayer(layer, layerName) -> { forward, rollback }
// adapter.getRollback() -> rollback
export const ADAPTER_CONTRACT = {
  applyDelta: "does not touch persistence",
  applyToLayer: "writes canonical data and returns { forward, rollback }",
  rollbackShape: "matches undo/redo change objects (recordChanges-compatible)",
};

// Object registry (declarative only; no parsing logic).
// selectionKey must match parseSelection() formats exactly.
// Use selectionKey: null for non-selection drag targets (e.g., Tunni points).
export const OBJECT_KINDS = {
  regularPoint: {
    selectionKey: "point",
    supports: ["drag", "nudge"],
    persistent: true,
  },
  anchor: {
    selectionKey: "anchor",
    supports: ["drag", "nudge"],
    persistent: true,
  },
  guideline: {
    selectionKey: "guideline",
    supports: ["drag", "nudge"],
    persistent: true,
  },
  component: {
    selectionKey: "component",
    supports: [],
    persistent: true,
    outOfScope: true,
  },
  componentOrigin: {
    selectionKey: "componentOrigin",
    supports: [],
    persistent: false,
    outOfScope: true,
  },
  componentTCenter: {
    selectionKey: "componentTCenter",
    supports: [],
    persistent: false,
    outOfScope: true,
  },
  skeletonPoint: {
    selectionKey: "skeletonPoint",
    supports: ["drag", "nudge"],
    persistent: true,
  },
  skeletonHandle: {
    selectionKey: "skeletonHandle",
    supports: ["drag", "nudge"],
    persistent: true,
  },
  skeletonSegment: {
    selectionKey: "skeletonSegment",
    supports: [],
    selectionOnly: true,
  },
  skeletonRibPoint: {
    selectionKey: "skeletonRibPoint",
    supports: ["drag", "nudge"],
    persistent: false,
  },
  editableGeneratedPoint: {
    selectionKey: "editableGeneratedPoint",
    supports: ["drag", "nudge"],
    persistent: false,
  },
  measurePoint: {
    selectionKey: "measurePoint",
    supports: [],
    selectionOnly: true,
    outOfScope: true,
  },
  backgroundImage: {
    selectionKey: "backgroundImage",
    supports: [],
    persistent: true,
    outOfScope: true,
  },
  tunniPoint: {
    selectionKey: null,
    supports: ["drag"],
    persistent: false,
    nonSelection: true,
  },
};
