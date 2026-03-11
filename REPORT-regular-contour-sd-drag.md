# Regular Contour S/D Drag Report

## Summary

Regular contour `S`/`D` drag was implemented as a separate adapter-side path rebuild, not as a reuse of skeleton fixed-rib drag and not through the generic regular point behavior executor.

The shipped behavior now follows these rules:

- `S` and `D` act as the same regular-contour mode
- one shared scalar is derived from the clicked point drag
- each selected regular on-curve moves along its own local normal
- smooth single-handle points preserve their smooth collinearity rule
- smooth two-handle points preserve their original handle axis
- handle lengths are adjusted to preserve tension better than simple length freezing

## Implementation Notes

- The live adapter path rebuilds from a session-start `originalPath` on every drag frame.
- This avoids compounding errors from repeatedly applying full drag deltas to already-mutated contour data.
- Regular `S`/`D` stays separate from skeleton fixed-rib semantics even though the hotkeys are shared.

## Normal Derivation

- Points with handles use handle-owned direction data.
- Points without handles now derive normals only from selected adjacent straight segments.
- If no qualifying selected adjacent line segments exist, no no-handle normal is inferred for that point.

This keeps no-handle behavior local to the actual selected contour context instead of inventing a contour-wide point normal.

## Tension / Angle Behavior

- Single-handle smooth points preserve a span ratio against the opposite on-curve.
- Two-handle cubic smooth points preserve their original handle axis and rebuild lengths using existing tension helpers.
- Non-smooth handled points translate attached handles with the anchor delta.

## Remaining Gap

There is still one uncovered case:

- dragging a single selected no-handle point when there is not enough qualifying adjacent selected line-segment context

That case is not properly defined by the current rule set. At the moment, the implemented no-handle logic intentionally depends on selected adjacent line segments. This works well for local selected-segment edits, but it leaves the single isolated no-handle point scenario without a meaningful normal source.

This should be treated as an explicit follow-up task rather than silently patched with a guessed fallback.

## Recommended Follow-Up

- Define the expected behavior for an isolated single no-handle point under regular `S`/`D` drag.
- Decide whether that case should:
  - be unsupported
  - infer a normal from unselected adjacent segments
  - or use a different local rule entirely
