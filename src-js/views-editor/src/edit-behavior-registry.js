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
  editableGeneratedHandle: {
    selectionKey: null,
    supports: ["drag"],
    persistent: false,
    nonSelection: true,
  },
  regularEqualizeHandle: {
    selectionKey: null,
    supports: ["drag"],
    persistent: false,
    nonSelection: true,
  },
  mixedSelection: {
    selectionKey: null,
    supports: ["drag"],
    persistent: false,
    nonSelection: true,
  },
  skeletonTunniPoint: {
    selectionKey: null,
    supports: ["drag"],
    persistent: false,
    nonSelection: true,
  },
};

// Centralized modifier mapping for drag and nudge actions.
// Returns a base preset plus any active override modes.
export function resolveBehaviorPreset(_objectKind, action, modifiers) {
  const {
    shiftKey,
    altKey,
    ctrlKey,
    metaKey,
    equalizeMode,
    tangentRibMode,
    fixedRibMode,
    fixedRibCompressMode,
  } = modifiers || {};

  const result = {
    preset: null,
    overrides: [],
  };

  if (action === "drag") {
    const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
    result.preset = behaviorNames[(shiftKey ? 1 : 0) + (altKey ? 2 : 0)];
  }
  if (action === "nudge") {
    result.preset = altKey ? "alternate" : "default";
  }

  if (equalizeMode) {
    result.overrides.push("equalize");
  }
  if (tangentRibMode) {
    result.overrides.push("rib-tangent");
  }
  if (fixedRibMode) {
    result.overrides.push("rib-fixed");
  }
  if (fixedRibCompressMode) {
    result.overrides.push("rib-fixed-compress");
  }

  if (action === "nudge" && shiftKey) {
    if (ctrlKey || metaKey) {
      result.overrides.push("nudge-scale-100");
    } else {
      result.overrides.push("nudge-scale-10");
    }
  }

  return result;
}

// Drag routing map (Phase 3.3): rowId + objectKind -> routing value.
export const DRAG_ROUTING_MAP = {
  R1: {
    regularPoint: "CL",
    anchor: "CL",
    guideline: "CL",
    component: "CL",
    componentOrigin: "CL",
    componentTCenter: "CL",
    skeletonPoint: "CL",
    skeletonHandle: "NA",
    skeletonRibPoint: "CL",
    editableGeneratedPoint: "CL",
    editableGeneratedHandle: "CL",
    mixedSelection: "CL",
    tunniPoint: "CL",
    skeletonTunniPoint: "CL",
  },
  R2: {
    regularPoint: "CL",
    anchor: "CL",
    guideline: "CL",
    component: "CL",
    componentOrigin: "CL",
    componentTCenter: "CL",
    skeletonPoint: "CL",
    skeletonHandle: "NA",
    skeletonRibPoint: "NA",
    editableGeneratedPoint: "NA",
    editableGeneratedHandle: "NA",
    mixedSelection: "CL",
    tunniPoint: "NA",
    skeletonTunniPoint: "NA",
  },
  R3: {
    regularPoint: "CL",
    anchor: "NA",
    guideline: "NA",
    component: "CL",
    componentOrigin: "CL",
    componentTCenter: "CL",
    skeletonPoint: "CL",
    skeletonHandle: "NA",
    skeletonRibPoint: "CL",
    editableGeneratedPoint: "CL",
    editableGeneratedHandle: "NA",
    mixedSelection: "CL",
    tunniPoint: "NA",
    skeletonTunniPoint: "NA",
  },
  R4: {
    regularPoint: "NA",
    anchor: "CL",
    guideline: "CL",
    component: "NA",
    componentOrigin: "NA",
    componentTCenter: "NA",
    skeletonPoint: "CL",
    skeletonHandle: "NA",
    skeletonRibPoint: "NA",
    editableGeneratedPoint: "NA",
    editableGeneratedHandle: "NA",
    mixedSelection: "CL",
    tunniPoint: "NA",
    skeletonTunniPoint: "NA",
  },
  R5: {
    regularPoint: "CL",
    regularEqualizeHandle: "CL",
    anchor: "NA",
    guideline: "NA",
    component: "NA",
    componentOrigin: "NA",
    componentTCenter: "NA",
    skeletonPoint: "NA",
    skeletonHandle: "CL",
    skeletonRibPoint: "NA",
    editableGeneratedPoint: "NA",
    editableGeneratedHandle: "NA",
    mixedSelection: "CL",
    tunniPoint: "NA",
    skeletonTunniPoint: "NA",
  },
  R6: {
    regularPoint: "CL",
    regularEqualizeHandle: "CL",
    anchor: "NA",
    guideline: "NA",
    component: "NA",
    componentOrigin: "NA",
    componentTCenter: "NA",
    skeletonPoint: "NA",
    skeletonHandle: "CL",
    skeletonRibPoint: "NA",
    editableGeneratedPoint: "NA",
    editableGeneratedHandle: "NA",
    mixedSelection: "CL",
    tunniPoint: "NA",
    skeletonTunniPoint: "NA",
  },
  R7: {
    regularPoint: "NA",
    anchor: "NA",
    guideline: "NA",
    component: "NA",
    componentOrigin: "NA",
    componentTCenter: "NA",
    skeletonPoint: "NA",
    skeletonHandle: "NA",
    skeletonRibPoint: "CL",
    editableGeneratedPoint: "CL",
    editableGeneratedHandle: "NA",
    mixedSelection: "NA",
    tunniPoint: "NA",
    skeletonTunniPoint: "NA",
  },
  R8: {
    regularPoint: "NA",
    anchor: "NA",
    guideline: "NA",
    component: "NA",
    componentOrigin: "NA",
    componentTCenter: "NA",
    skeletonPoint: "CL",
    skeletonHandle: "NA",
    skeletonRibPoint: "NA",
    editableGeneratedPoint: "NA",
    editableGeneratedHandle: "NA",
    mixedSelection: "CL",
    tunniPoint: "NA",
    skeletonTunniPoint: "NA",
  },
  R9: {
    regularPoint: "NA",
    anchor: "NA",
    guideline: "NA",
    component: "NA",
    componentOrigin: "NA",
    componentTCenter: "NA",
    skeletonPoint: "CL",
    skeletonHandle: "NA",
    skeletonRibPoint: "NA",
    editableGeneratedPoint: "NA",
    editableGeneratedHandle: "NA",
    mixedSelection: "CL",
    tunniPoint: "NA",
    skeletonTunniPoint: "NA",
  },
};

export function getDragRowId(modifiers) {
  const {
    shiftKey,
    altKey,
    equalizeMode,
    tangentRibMode,
    fixedRibMode,
    fixedRibCompressMode,
  } = modifiers || {};

  if (tangentRibMode) return "R7";
  if (fixedRibCompressMode) return "R9";
  if (fixedRibMode) return "R8";
  if (equalizeMode) return shiftKey ? "R6" : "R5";
  if (shiftKey && altKey) return "R4";
  if (altKey) return "R3";
  if (shiftKey) return "R2";
  return "R1";
}
