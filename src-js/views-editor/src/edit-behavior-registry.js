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
