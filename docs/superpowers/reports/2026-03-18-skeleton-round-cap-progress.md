# Skeleton Round Cap Redesign Progress Report

**Date:** 2026-03-18  
**Author:** Codex  
**Branch:** `test/cap-rounding-rewamp`

---

## Scope

This workstream is part of the broader skeleton-tool implementation in this fork.

The specific target here was open skeleton `round` cap generation:
- replace the old projected-point round-cap scaffold
- preserve flat-cap-derived side geometry more predictably
- insert new on-curve points into the generated outline itself
- keep the change local to the skeleton contour generator

Source-of-truth documents:
- Spec: `docs/superpowers/specs/2026-03-18-skeleton-round-cap-redesign-design.md`
- Plan: `docs/superpowers/plans/2026-03-18-skeleton-round-cap-redesign.md`
- Session starter: `docs/superpowers/2026-03-18-skeleton-tool-session-starter.md`

---

## What Was Implemented

All production changes so far are in:
- `src-js/fontra-core/src/skeleton-contour-generator.js`

Implemented pieces:
- round-cap frame helper for radius-factor and trim-distance derivation
- terminal-side split helper for inserting one on-curve point into the generated outline on each side
- support for both linear and cubic terminal generated segments
- emitted-side trimming helper for removing consumed reference endpoints from final emission
- round-cap reconstruction helper for rebuilding caps from inserted side points and inward-shifted cap endpoints
- merged-tip handling for maximum-radius and collapsed-endpoint cases
- open-outline assembly helper to replace the old inline array mutation path
- start-cap `round` branch migration to the new split-outline logic
- end-cap `round` branch migration to the new split-outline logic

Behavior preserved intentionally:
- `butt` and `square` cap paths
- closed contours
- non-cap side generation
- schema/UI/parameter model

---

## Manual Validation So Far

Initial manual testing showed the redesign was mostly working, but two implementation errors were found:

1. Extra generated off-curves were being emitted without valid on-curve ownership.
2. The terminal generated on-curves moved in the wrong direction with changing cap radius.

Those two issues were corrected by:
- trimming leftover terminal off-curves from the emitted side after removing the consumed reference endpoint
- inverting the trim-distance mapping so larger radius pulls the inserted side points farther inward toward the centerline

Current verification completed:
- `node --check src-js/fontra-core/src/skeleton-contour-generator.js`
- `npm run -s bundle`

Result:
- both commands pass
- webpack still reports only the existing asset-size warnings

---

## Git Checkpoints

Relevant commits for this workstream so far:

```text
542dbb315 refactor: add split-based round cap helper primitives
32708753b refactor: add round cap reconstruction and assembly helpers
b478266b1 feat: switch start round caps to split-outline geometry
9755e6253 feat: switch end round caps to split-outline geometry
```

This report commit records the current checkpoint after the first round of manual feedback-driven fixes.

---

## Current State

Working now:
- round caps are generated from split outline geometry instead of the old projected scaffold
- new inserted on-curves are placed on the generated outline
- start and end round caps both use the new helper path
- the two reported regressions above have been addressed

Not finished yet:
- there are still remaining issues in another aspect of round-cap behavior, identified during manual testing but not yet addressed in this checkpoint

This is a progress checkpoint, not a final completion report.

---

## Next Steps

1. Continue manual testing on the real project file.
2. Isolate the remaining round-cap issues precisely.
3. Patch those issues in `src-js/fontra-core/src/skeleton-contour-generator.js`.
4. Re-run syntax/build checks and another manual verification pass.
