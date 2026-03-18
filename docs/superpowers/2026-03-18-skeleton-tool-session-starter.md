# Skeleton Tool Session Starter

## Purpose

This fork is focused on adding a skeleton-based drawing workflow to Fontra, on top of the existing contour-based editor and export pipeline.

At a high level:
- classic Fontra editing works with contour points and Bezier segments that directly define filled outlines
- the new skeleton tool introduces centerline-like skeletal contours whose points project outward along normals to generate real outline edges
- those generated edges form closed, fillable contours that still need to export cleanly to font formats such as `.otf` and `.ttf`

This document is meant as a fast resume point for later sessions. It is not the source of truth for implementation details; use the linked spec and plan for that.

## What Already Exists

The skeleton-tool work in this fork already includes:
- a dedicated skeletal point type
- math for skeleton curve creation and editing
- math for generating actual outline points from skeleton data
- stroke-width editing from both canvas interactions and the parameter panel
- tangent sliding for generated edge points via the editable flag
- arrow-key editing for edge points
- cap-style selection for skeletal open contours

The current active workstream is narrower than the whole skeleton feature set: round-cap generation for open skeleton contours.

## Current Problem

Round caps currently work by starting from a flat-cap projection, then creating additional projected cap points outside the terminal rib and rounding toward those projected points.

That implementation works, but it has one important weakness: switching between `flat` and `round` changes the overall terminal geometry in a way that is harder to predict than it should be. The side outline itself is not stable enough across cap modes.

The requirement for the redesign is to keep round caps much closer to the flat-cap-derived outline, so that the visual difference is mostly local to the cap corner rather than a broader reshaping of the terminal geometry.

## Approved Solution Direction

The approved redesign keeps the existing flat-cap outline as the base geometry, then rebuilds the round cap locally.

In practical terms:
- generate the left and right outline sides as usual
- treat the terminal geometry as if the cap were flat
- insert one new on-curve point into each terminal generated side segment
- for cubic terminal segments, use BezierJS segment splitting so the original segment shape stays the same while control handles are recalculated
- reuse the existing cap-radius-driven trim behavior to decide where those inserted points land
- rebuild the round cap between the inserted points and the cap endpoints instead of creating the old projected outer scaffold

The important invariant is that round mode still emits the added round-cap topology even in fragile cases; it should not silently fall back to flat-cap topology.

## Scope Boundaries

This workstream does change:
- open skeleton `round` cap generation
- the helper structure around cap construction inside the skeleton contour generator

This workstream does not change:
- `butt` and `square` caps
- closed skeleton contours
- schema, serialization, or parameter UI
- the broader skeleton-tool editing model outside round-cap generation

## Main Files

- Generator target: `src-js/fontra-core/src/skeleton-contour-generator.js`
- Spec: `docs/superpowers/specs/2026-03-18-skeleton-round-cap-redesign-design.md`
- Plan: `docs/superpowers/plans/2026-03-18-skeleton-round-cap-redesign.md`

## How To Resume

If a later session needs to continue this work:
- read this document first for scope
- read the spec next for the geometry contract and edge-case rules
- read the plan last for the implementation sequence and manual verification flow

The spec is the source of truth for behavior. The plan is the source of truth for execution order.
