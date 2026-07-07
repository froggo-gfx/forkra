import { parseSelection } from "@fontra/core/utils.ts";

export function getSkeletonModifierBehaviorName(event, modifiers = {}, targetKinds) {
  if (modifiers.fixedRibCompressMode && targetKinds.has("skeletonPoint")) {
    return "fixed-rib-compress";
  }
  if (modifiers.fixedRibMode && targetKinds.has("skeletonPoint")) {
    return "fixed-rib";
  }
  // X-drag equalize was deprecated 2026-07-07 (alt-drag covers equalize); the
  // "equalize"/"equalize-constrain" behaviors and their handlers remain for
  // programmatic use. See docs/superpowers/notes/2026-07-06-parity-bugs.md 1.7.
  return null;
}

export function getSelectionTargetKinds(selection) {
  const parsed = parseSelection([...selection]);
  const kinds = new Set();
  if (parsed.skeletonPoint?.length) {
    kinds.add("skeletonPoint");
  }
  if (parsed.skeletonRib?.length) {
    kinds.add("skeletonRib");
  }
  if (parsed.editableGeneratedPoint?.length) {
    kinds.add("editableGeneratedPoint");
  }
  if (parsed.editableGeneratedHandle?.length) {
    kinds.add("editableGeneratedHandle");
  }
  return kinds;
}

export function makeSkeletonModifierOptions(behaviorName, extra = {}) {
  return {
    ...extra,
    behaviorName,
    equalize: behaviorName?.startsWith("equalize") === true,
    fixedRib: behaviorName === "fixed-rib",
    fixedRibCompress: behaviorName === "fixed-rib-compress",
  };
}
