// Composer entry points (uniform orchestration).
// These are scaffolding only in Phase 1. No persistence or per-kind branching.

/**
 * Orchestrate drag edits through the behavior pipeline.
 * Required context fields:
 * - sceneController
 * - selection
 * - initialEvent
 * - eventStream
 * - glyph
 * - sendIncrementalChange
 * - scalingEditBehavior
 * - equalizeMode
 * - positionedGlyph
 * - initialClickedPointIndex
 * @returns {Promise<{ undoLabel, changes, broadcast }>}
 */
export async function runDragOrchestration(_context) {
  return null;
}

/**
 * Orchestrate nudge edits through the behavior pipeline.
 * Required context fields:
 * - sceneController
 * - selection
 * - glyph
 * - sendIncrementalChange
 * - scalingEditBehavior
 * - equalizeMode
 * - positionedGlyph
 * - initialClickedPointIndex
 * @returns {Promise<{ undoLabel, changes, broadcast }>}
 */
export async function runNudgeOrchestration(_context) {
  return null;
}
