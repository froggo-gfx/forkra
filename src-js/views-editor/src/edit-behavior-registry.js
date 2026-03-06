// Adapter routing reference:
// See `src-js/views-editor/src/edit-behavior-adapters.js`.
// Registry stays declarative and does not define adapter execution semantics.

// Object registry (declarative only; no parsing logic).
// selectionKey must match parseSelection() key names for selection-based kinds.
// Use selectionKey: null for non-selection object kinds (e.g., Tunni points).
// In-scope unified-behavior kinds: regularPoint, anchor, guideline, skeletonPoint,
// skeletonHandle (legacy off-curve alias), skeletonRibPoint, editableGeneratedPoint,
// editableGeneratedHandle.
export const OBJECT_KINDS = {
  regularPoint: {
    selectionKey: "point",
    supports: ["drag", "nudge"],
    persistent: true,
    inScope: true,
  },
  anchor: {
    selectionKey: "anchor",
    supports: ["drag", "nudge"],
    persistent: true,
    inScope: true,
  },
  guideline: {
    selectionKey: "guideline",
    supports: ["drag", "nudge"],
    persistent: true,
    inScope: true,
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
    inScope: true,
  },
  skeletonHandle: {
    selectionKey: "skeletonHandle",
    supports: ["drag", "nudge"],
    persistent: true,
    inScope: true,
    legacyAliasFor: "skeleton off-curve point",
  },
  skeletonSegment: {
    selectionKey: "skeletonSegment",
    supports: [],
    selectionOnly: true,
  },
  skeletonRibPoint: {
    selectionKey: "skeletonRibPoint",
    supports: ["drag", "nudge"],
    persistent: true,
    inScope: true,
  },
  editableGeneratedPoint: {
    selectionKey: "editableGeneratedPoint",
    supports: ["drag", "nudge"],
    persistent: true,
    inScope: true,
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
    supports: ["drag", "nudge"],
    persistent: true,
    nonSelection: true,
    inScope: true,
  },
  mixedSelection: {
    selectionKey: null,
    supports: ["drag", "nudge"],
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
    regularPoint: "CA",
    anchor: "CA",
    guideline: "CA",
    component: "CL",
    componentOrigin: "CL",
    componentTCenter: "CL",
    skeletonPoint: "CA",
    skeletonHandle: "NA",
    skeletonRibPoint: "CA",
    editableGeneratedPoint: "CA",
    editableGeneratedHandle: "CA",
    mixedSelection: "CL",
    tunniPoint: "CL",
    skeletonTunniPoint: "CL",
  },
  R2: {
    regularPoint: "CA",
    anchor: "CA",
    guideline: "CA",
    component: "CL",
    componentOrigin: "CL",
    componentTCenter: "CL",
    skeletonPoint: "CA",
    skeletonHandle: "NA",
    skeletonRibPoint: "NA",
    editableGeneratedPoint: "NA",
    editableGeneratedHandle: "NA",
    mixedSelection: "CL",
    tunniPoint: "NA",
    skeletonTunniPoint: "NA",
  },
  R3: {
    regularPoint: "CA",
    anchor: "NA",
    guideline: "NA",
    component: "CL",
    componentOrigin: "CL",
    componentTCenter: "CL",
    skeletonPoint: "CA",
    skeletonHandle: "NA",
    skeletonRibPoint: "CA",
    editableGeneratedPoint: "CA",
    editableGeneratedHandle: "NA",
    mixedSelection: "CL",
    tunniPoint: "NA",
    skeletonTunniPoint: "NA",
  },
  R4: {
    regularPoint: "NA",
    anchor: "CA",
    guideline: "CA",
    component: "NA",
    componentOrigin: "NA",
    componentTCenter: "NA",
    skeletonPoint: "CA",
    skeletonHandle: "NA",
    skeletonRibPoint: "NA",
    editableGeneratedPoint: "NA",
    editableGeneratedHandle: "NA",
    mixedSelection: "CL",
    tunniPoint: "NA",
    skeletonTunniPoint: "NA",
  },
  R5: {
    regularPoint: "CA",
    anchor: "NA",
    guideline: "NA",
    component: "NA",
    componentOrigin: "NA",
    componentTCenter: "NA",
    skeletonPoint: "NA",
    skeletonHandle: "CA",
    skeletonRibPoint: "NA",
    editableGeneratedPoint: "NA",
    editableGeneratedHandle: "NA",
    mixedSelection: "CL",
    tunniPoint: "NA",
    skeletonTunniPoint: "NA",
  },
  R6: {
    regularPoint: "CA",
    anchor: "NA",
    guideline: "NA",
    component: "NA",
    componentOrigin: "NA",
    componentTCenter: "NA",
    skeletonPoint: "NA",
    skeletonHandle: "CA",
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
    skeletonRibPoint: "CA",
    editableGeneratedPoint: "CA",
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
    skeletonPoint: "CA",
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
    skeletonPoint: "CA",
    skeletonHandle: "NA",
    skeletonRibPoint: "NA",
    editableGeneratedPoint: "NA",
    editableGeneratedHandle: "NA",
    mixedSelection: "CL",
    tunniPoint: "NA",
    skeletonTunniPoint: "NA",
  },
};

// Nudge routing map (Phase 4.3): rowId + objectKind -> routing value.
export const NUDGE_ROUTING_MAP = {
  R10: {
    regularPoint: "CA",
    anchor: "CA",
    guideline: "CA",
    skeletonPoint: "CA",
    skeletonHandle: "NA",
    skeletonRibPoint: "CA",
    editableGeneratedPoint: "CA",
    editableGeneratedHandle: "CA",
    mixedSelection: "CL",
  },
  R11: {
    regularPoint: "CA",
    anchor: "CA",
    guideline: "CA",
    skeletonPoint: "CA",
    skeletonHandle: "NA",
    skeletonRibPoint: "CA",
    editableGeneratedPoint: "CA",
    editableGeneratedHandle: "CA",
    mixedSelection: "CL",
  },
  R13: {
    regularPoint: "CA",
    anchor: "NA",
    guideline: "NA",
    skeletonPoint: "NA",
    skeletonHandle: "CA",
    skeletonRibPoint: "NA",
    editableGeneratedPoint: "NA",
    editableGeneratedHandle: "CA",
  },
  R14: {
    regularPoint: "CA",
    anchor: "NA",
    guideline: "NA",
    skeletonPoint: "NA",
    skeletonHandle: "CA",
    skeletonRibPoint: "NA",
    editableGeneratedPoint: "NA",
    editableGeneratedHandle: "CA",
  },
  R16: {
    regularPoint: "NA",
    anchor: "NA",
    guideline: "NA",
    skeletonPoint: "CA",
    skeletonHandle: "NA",
    skeletonRibPoint: "NA",
    editableGeneratedPoint: "NA",
    editableGeneratedHandle: "NA",
  },
  R17: {
    regularPoint: "NA",
    anchor: "NA",
    guideline: "NA",
    skeletonPoint: "CA",
    skeletonHandle: "NA",
    skeletonRibPoint: "NA",
    editableGeneratedPoint: "NA",
    editableGeneratedHandle: "NA",
  },
  R18: {
    regularPoint: "NA",
    anchor: "NA",
    guideline: "NA",
    skeletonPoint: "NA",
    skeletonHandle: "NA",
    skeletonRibPoint: "CA",
    editableGeneratedPoint: "NA",
    editableGeneratedHandle: "NA",
  },
  R19: {
    regularPoint: "NA",
    anchor: "NA",
    guideline: "NA",
    skeletonPoint: "NA",
    skeletonHandle: "NA",
    skeletonRibPoint: "CA",
    editableGeneratedPoint: "NA",
    editableGeneratedHandle: "NA",
  },
  R20: {
    regularPoint: "CA",
    anchor: "CA",
    guideline: "CA",
    skeletonPoint: "CA",
    skeletonHandle: "NA",
    skeletonRibPoint: "CA",
    editableGeneratedPoint: "CA",
    editableGeneratedHandle: "CA",
    mixedSelection: "CL",
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

export function getNudgeRowId(modifiers) {
  const {
    shiftKey,
    altKey,
    equalizeMode,
    tangentRibMode,
    fixedRibMode,
    fixedRibCompressMode,
  } = modifiers || {};

  if (tangentRibMode) return shiftKey ? "R19" : "R18";
  if (fixedRibCompressMode) return "R17";
  if (fixedRibMode) return "R16";
  if (equalizeMode) return shiftKey ? "R14" : "R13";
  if (altKey) return "R20";
  if (shiftKey) return "R11";
  return "R10";
}
