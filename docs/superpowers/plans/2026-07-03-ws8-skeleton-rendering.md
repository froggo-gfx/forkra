# WS-8 — Skeleton Read-Only Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render existing skeleton data in the editor as read-only visualization layers: centerlines, handles, nodes, ribs, width shading, and editable rib markers.

**Architecture:** Add a focused `views-editor` side-effect module that registers skeleton visualization layers through the existing declarative layer registry, then import it from `editor.js` beside the Letterspacer layer module. Rendering consumes the WS-6 `skeleton-model.js` helpers from `fontra-core`; it does not add hit testing, pointer-tool routing, editing commands, drawing tools, panels, or path mutation.

**Tech Stack:** ES modules under `src-js/views-editor/src`, `@fontra/core/skeleton-model.js`, existing canvas visualization layer registry, a tiny `.fontra` fixture under `test-common/fonts`, webpack bundle verification, manual editor validation.

---

## Global Constraints

- **Branch:** implement on `refactor-simple/ws8-skeleton-rendering`, cut after WS-6 and WS-7 are merged. WS-8 assumes `src-js/fontra-core/src/skeleton-model.js` exists from WS-6.
- **Donor is read-only:** `./skeleton/` stays pinned at `fd76d3abe`. Read from `skeleton/src-js/views-editor/src/skeleton-visualization-layers.js`; do not run `git -C skeleton checkout` or `git -C skeleton switch`.
- **Scope:** read-only rendering only. Do not create scene-model hit tests, pointer-tool hit routing, skeleton editing operations, a skeleton drawing tool, panel UI, generator path mutation, or selection state.
- **Core geometry source:** use `@fontra/core/skeleton-model.js` for `getSkeletonData`, `calculateNormalAtSkeletonPoint`, `getSkeletonPointHalfWidth`, `getSkeletonPointNudge`, and `projectSkeletonRibPoint`. Do not duplicate default-width constants in `views-editor`.
- **Layer convention:** register layers through `registerVisualizationLayerDefinition()` and load them via a side-effect import from `src-js/views-editor/src/editor.js`.
- **No editor test harness:** verification uses `node --check`, `npm run bundle`, rail greps, and the manual matrix in Task 5.

---

## Verified Current Context

- `src-js/views-editor/src/visualization-layer-definitions.js` exports `registerVisualizationLayerDefinition`, `glyphSelector`, `strokeLine`, `fillRoundNode`, `fillSquareNode`, and related node helpers.
- `src-js/views-editor/src/visualization-layer-letterspacer.js` is the current side-effect module pattern for a visualization layer outside `visualization-layer-definitions.js`.
- `src-js/views-editor/src/editor.js:89` imports `./visualization-layer-letterspacer.js`; WS-8 should add `import "./visualization-layer-skeleton.js";` next to it.
- `src-js/views-editor/src/visualization-layers.js` draws registered layers by calling `layer.selectionFunc(visContext, layer)`, translating the canvas to each positioned glyph, and invoking `layer.draw(context, item, parameters, model, controller)`.
- Donor `skeleton/src-js/views-editor/src/skeleton-visualization-layers.js` contains separate read/write-era layers for:
  - `fontra.skeleton.centerline`
  - `fontra.skeleton.ribs`
  - `fontra.skeleton.rib.points`
  - `fontra.skeleton.nodes`
  - `fontra.skeleton.handles`
  - selection, insert handle, labels, and Tunni layers that are outside WS-8.
- `src-js/views-editor/package.json` has no real test script; root `package.json` has `npm run bundle`.

---

## File Structure

```
src-js/views-editor/src/
  visualization-layer-skeleton.js       [CREATE] read-only skeleton layer registration and canvas helpers
  editor.js                             [MODIFY] side-effect import for skeleton layer definitions

test-common/fonts/SkeletonRendering.fontra/
  font-data.json                        [CREATE] minimal font metadata with one default source/layer
  glyph-info.csv                        [CREATE] glyph map for the demo glyph
  glyphs/skeletondemo.json              [CREATE] glyph layer carrying WS-6 skeleton custom data
```

---

## Task 1: Create the Skeleton Rendering Fixture Font

**Files:**
- Create: `test-common/fonts/SkeletonRendering.fontra/font-data.json`
- Create: `test-common/fonts/SkeletonRendering.fontra/glyph-info.csv`
- Create: `test-common/fonts/SkeletonRendering.fontra/glyphs/skeletondemo.json`

**Interfaces:**
- Produces a manual-test font that opens in the editor.
- The single glyph layer stores skeleton data in `glyph.layers.default.glyph.customData["fontra.internal"].skeleton`, matching the WS-6 storage contract.
- Includes open, closed, cubic, asymmetric, single-sided, and editable-width examples in one glyph.

- [ ] **Step 1: Create the fixture directory**

Run:

```bash
New-Item -ItemType Directory -Force test-common/fonts/SkeletonRendering.fontra/glyphs
```

Expected: PowerShell creates the fixture directory or reports it already exists.

- [ ] **Step 2: Create `font-data.json`**

Create `test-common/fonts/SkeletonRendering.fontra/font-data.json`:

```json
{
  "axes": {
    "axes": []
  },
  "fontInfo": {
    "familyName": "SkeletonRendering",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "sources": {
    "default": {
      "lineMetricsHorizontalLayout": {
        "ascender": {
          "value": 800,
          "zone": 16
        },
        "baseline": {
          "value": 0,
          "zone": -16
        },
        "descender": {
          "value": -200,
          "zone": -16
        },
        "xHeight": {
          "value": 500,
          "zone": 16
        }
      },
      "location": {},
      "name": "Default"
    }
  },
  "unitsPerEm": 1000
}
```

- [ ] **Step 3: Create `glyph-info.csv`**

Create `test-common/fonts/SkeletonRendering.fontra/glyph-info.csv`:

```csv
glyph name;code points
skeletondemo;U+E000
```

- [ ] **Step 4: Create the demo glyph**

Create `test-common/fonts/SkeletonRendering.fontra/glyphs/skeletondemo.json`:

```json
{
  "layers": {
    "default": {
      "glyph": {
        "customData": {
          "fontra.internal": {
            "skeleton": {
              "contours": [
                {
                  "closed": false,
                  "defaultWidth": 70,
                  "id": 1,
                  "points": [
                    {
                      "capStyle": "round",
                      "id": 2,
                      "smooth": true,
                      "type": null,
                      "width": {
                        "linked": true,
                        "left": 35,
                        "right": 35
                      },
                      "x": 80,
                      "y": 120
                    },
                    {
                      "id": 3,
                      "type": "cubic",
                      "x": 160,
                      "y": 360
                    },
                    {
                      "id": 4,
                      "type": "cubic",
                      "x": 320,
                      "y": 360
                    },
                    {
                      "capStyle": "round",
                      "id": 5,
                      "smooth": true,
                      "type": null,
                      "width": {
                        "linked": false,
                        "left": 52,
                        "right": 24
                      },
                      "x": 420,
                      "y": 120
                    }
                  ],
                  "singleSided": null
                },
                {
                  "closed": true,
                  "defaultWidth": 54,
                  "id": 6,
                  "points": [
                    {
                      "id": 7,
                      "smooth": false,
                      "type": null,
                      "width": {
                        "linked": true,
                        "left": 27,
                        "right": 27
                      },
                      "x": 520,
                      "y": 130
                    },
                    {
                      "editable": {
                        "left": true,
                        "right": false
                      },
                      "id": 8,
                      "smooth": false,
                      "type": null,
                      "width": {
                        "linked": false,
                        "left": 46,
                        "right": 18
                      },
                      "x": 720,
                      "y": 130
                    },
                    {
                      "editable": {
                        "left": true,
                        "right": true
                      },
                      "id": 9,
                      "smooth": false,
                      "type": null,
                      "width": {
                        "linked": false,
                        "left": 34,
                        "right": 44
                      },
                      "x": 620,
                      "y": 330
                    }
                  ],
                  "singleSided": null
                },
                {
                  "closed": false,
                  "defaultWidth": 60,
                  "id": 10,
                  "points": [
                    {
                      "editable": {
                        "left": true,
                        "right": false
                      },
                      "id": 11,
                      "smooth": true,
                      "type": null,
                      "width": {
                        "linked": true,
                        "left": 30,
                        "right": 30
                      },
                      "x": 130,
                      "y": 500
                    },
                    {
                      "editable": {
                        "left": true,
                        "right": false
                      },
                      "id": 12,
                      "smooth": true,
                      "type": null,
                      "width": {
                        "linked": true,
                        "left": 30,
                        "right": 30
                      },
                      "x": 380,
                      "y": 690
                    }
                  ],
                  "singleSided": "left"
                }
              ],
              "generated": [],
              "nextId": 13,
              "version": 1
            }
          }
        },
        "path": {
          "contours": []
        },
        "xAdvance": 820
      }
    }
  },
  "name": "skeletondemo",
  "sources": [
    {
      "layerName": "default",
      "locationBase": "default",
      "name": ""
    }
  ]
}
```

- [ ] **Step 5: Format the fixture JSON**

Run:

```bash
npx prettier --write test-common/fonts/SkeletonRendering.fontra/font-data.json test-common/fonts/SkeletonRendering.fontra/glyphs/skeletondemo.json
```

Expected: prettier reports both JSON files.

- [ ] **Step 6: Commit**

```bash
git add test-common/fonts/SkeletonRendering.fontra/font-data.json test-common/fonts/SkeletonRendering.fontra/glyph-info.csv test-common/fonts/SkeletonRendering.fontra/glyphs/skeletondemo.json
git commit -m "test(skeleton): add rendering fixture font"
```

---

## Task 2: Add the Read-Only Skeleton Visualization Module

**Files:**
- Create: `src-js/views-editor/src/visualization-layer-skeleton.js`

**Interfaces:**
- Consumes WS-6 exports from `@fontra/core/skeleton-model.js`:
  - `calculateNormalAtSkeletonPoint(contour, pointIndexOrPointId)`
  - `getSkeletonData(layerOrCustomData)`
  - `getSkeletonPointHalfWidth(point, defaultWidth, side)`
  - `getSkeletonPointNudge(point, side, defaultWidth)`
  - `projectSkeletonRibPoint(point, normal, halfWidth, side, nudge = 0)`
- Registers these layer identifiers:
  - `fontra.skeleton.width-shading`
  - `fontra.skeleton.ribs`
  - `fontra.skeleton.centerline`
  - `fontra.skeleton.handles`
  - `fontra.skeleton.nodes`
  - `fontra.skeleton.editable-markers`

- [ ] **Step 1: Create `visualization-layer-skeleton.js`**

Create `src-js/views-editor/src/visualization-layer-skeleton.js`:

```javascript
import {
  calculateNormalAtSkeletonPoint,
  getSkeletonData,
  getSkeletonPointHalfWidth,
  getSkeletonPointNudge,
  projectSkeletonRibPoint,
} from "@fontra/core/skeleton-model.js";

import {
  fillRoundNode,
  fillSquareNode,
  glyphSelector,
  registerVisualizationLayerDefinition,
  strokeLine,
} from "./visualization-layer-definitions.js";

function getSkeletonDataFromGlyph(positionedGlyph, model) {
  const editLayerName =
    model.sceneSettings?.editLayerName || positionedGlyph.glyph?.layerName;
  const layerGlyph =
    editLayerName && positionedGlyph.varGlyph?.glyph?.layers?.[editLayerName]?.glyph;
  return getSkeletonData(layerGlyph || positionedGlyph.glyph);
}

function getOnCurvePointIndices(contour) {
  const indices = [];
  for (let i = 0; i < contour.points.length; i++) {
    if (!contour.points[i].type) {
      indices.push(i);
    }
  }
  return indices;
}

function skeletonContourToPath2d(contour) {
  const path = new Path2D();
  const points = contour.points || [];
  const onCurveIndices = getOnCurvePointIndices(contour);
  if (!onCurveIndices.length) {
    return path;
  }

  const firstIndex = onCurveIndices[0];
  path.moveTo(points[firstIndex].x, points[firstIndex].y);

  let i = firstIndex + 1;
  const limit = contour.closed ? firstIndex + points.length + 1 : points.length;
  while (i < limit) {
    const point = points[i % points.length];
    if (!point.type) {
      path.lineTo(point.x, point.y);
      i += 1;
      continue;
    }

    const next = points[(i + 1) % points.length];
    const afterNext = points[(i + 2) % points.length];
    if (point.type === "cubic" && next?.type === "cubic" && afterNext && !afterNext.type) {
      path.bezierCurveTo(point.x, point.y, next.x, next.y, afterNext.x, afterNext.y);
      i += 3;
      continue;
    }
    if ((point.type === "quad" || point.type === "cubic") && next && !next.type) {
      path.quadraticCurveTo(point.x, point.y, next.x, next.y);
      i += 2;
      continue;
    }
    i += 1;
  }

  if (contour.closed) {
    path.closePath();
  }
  return path;
}

function getEditableSide(point, side) {
  if (point.editable && typeof point.editable === "object") {
    return point.editable[side] === true;
  }
  return point[`${side}Editable`] === true;
}

function getRibPoints(contour, pointIndex) {
  const point = contour.points[pointIndex];
  const normal = calculateNormalAtSkeletonPoint(contour, pointIndex);
  const defaultWidth = contour.defaultWidth;
  const leftHalfWidth = getSkeletonPointHalfWidth(point, defaultWidth, "left");
  const rightHalfWidth = getSkeletonPointHalfWidth(point, defaultWidth, "right");
  const isSingleSided = contour.singleSided === "left" || contour.singleSided === "right";

  if (isSingleSided) {
    const side = contour.singleSided;
    const totalWidth = leftHalfWidth + rightHalfWidth;
    const editable = getEditableSide(point, side);
    const nudge =
      editable && totalWidth >= 0.5
        ? getSkeletonPointNudge(point, side, defaultWidth)
        : 0;
    return {
      center: point,
      left: side === "left" ? projectSkeletonRibPoint(point, normal, totalWidth, "left", nudge) : point,
      leftEditable: side === "left" && editable,
      right: side === "right" ? projectSkeletonRibPoint(point, normal, totalWidth, "right", nudge) : point,
      rightEditable: side === "right" && editable,
    };
  }

  const leftEditable = getEditableSide(point, "left");
  const rightEditable = getEditableSide(point, "right");
  const leftNudge =
    leftEditable && leftHalfWidth >= 0.5
      ? getSkeletonPointNudge(point, "left", defaultWidth)
      : 0;
  const rightNudge =
    rightEditable && rightHalfWidth >= 0.5
      ? getSkeletonPointNudge(point, "right", defaultWidth)
      : 0;
  return {
    center: point,
    left: projectSkeletonRibPoint(point, normal, leftHalfWidth, "left", leftNudge),
    leftEditable,
    right: projectSkeletonRibPoint(point, normal, rightHalfWidth, "right", rightNudge),
    rightEditable,
  };
}

function drawDiamondNode(context, point, size, fill) {
  const half = size / 2;
  context.beginPath();
  context.moveTo(point.x, point.y - half);
  context.lineTo(point.x + half, point.y);
  context.lineTo(point.x, point.y + half);
  context.lineTo(point.x - half, point.y);
  context.closePath();
  if (fill) {
    context.fill();
  }
  context.stroke();
}

function forEachSkeletonContour(positionedGlyph, model, callback) {
  const skeletonData = getSkeletonDataFromGlyph(positionedGlyph, model);
  if (!skeletonData?.contours?.length) {
    return;
  }
  for (const contour of skeletonData.contours) {
    if (contour.points?.length) {
      callback(contour);
    }
  }
}

registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.width-shading",
  name: "Skeleton width shading",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 446,
  colors: {
    fillColor: "rgba(34, 121, 210, 0.12)",
  },
  colorsDarkMode: {
    fillColor: "rgba(95, 178, 255, 0.18)",
  },
  draw: (context, positionedGlyph, parameters, model) => {
    context.fillStyle = parameters.fillColor;
    forEachSkeletonContour(positionedGlyph, model, (contour) => {
      const onCurveIndices = getOnCurvePointIndices(contour);
      const segmentCount = contour.closed ? onCurveIndices.length : onCurveIndices.length - 1;
      for (let i = 0; i < segmentCount; i++) {
        const a = getRibPoints(contour, onCurveIndices[i]);
        const b = getRibPoints(contour, onCurveIndices[(i + 1) % onCurveIndices.length]);
        context.beginPath();
        context.moveTo(a.left.x, a.left.y);
        context.lineTo(b.left.x, b.left.y);
        context.lineTo(b.right.x, b.right.y);
        context.lineTo(a.right.x, a.right.y);
        context.closePath();
        context.fill();
      }
    });
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.ribs",
  name: "Skeleton ribs",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 452,
  screenParameters: {
    endpointSize: 5,
    strokeWidth: 1,
  },
  colors: {
    endpointColor: "rgba(34, 121, 210, 0.65)",
    strokeColor: "rgba(34, 121, 210, 0.45)",
  },
  colorsDarkMode: {
    endpointColor: "rgba(95, 178, 255, 0.75)",
    strokeColor: "rgba(95, 178, 255, 0.55)",
  },
  draw: (context, positionedGlyph, parameters, model) => {
    context.lineWidth = parameters.strokeWidth;
    context.strokeStyle = parameters.strokeColor;
    context.fillStyle = parameters.endpointColor;
    forEachSkeletonContour(positionedGlyph, model, (contour) => {
      for (const pointIndex of getOnCurvePointIndices(contour)) {
        const rib = getRibPoints(contour, pointIndex);
        strokeLine(context, rib.left.x, rib.left.y, rib.right.x, rib.right.y);
        fillRoundNode(context, rib.left, parameters.endpointSize);
        fillRoundNode(context, rib.right, parameters.endpointSize);
      }
    });
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.centerline",
  name: "Skeleton centerline",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 455,
  screenParameters: {
    strokeWidth: 1.5,
  },
  colors: {
    strokeColor: "#2279d2",
  },
  colorsDarkMode: {
    strokeColor: "#5fb2ff",
  },
  draw: (context, positionedGlyph, parameters, model) => {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = parameters.strokeWidth;
    context.strokeStyle = parameters.strokeColor;
    forEachSkeletonContour(positionedGlyph, model, (contour) => {
      context.stroke(skeletonContourToPath2d(contour));
    });
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.handles",
  name: "Skeleton handles",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 545,
  screenParameters: {
    strokeWidth: 1,
  },
  colors: {
    strokeColor: "rgba(34, 121, 210, 0.55)",
  },
  colorsDarkMode: {
    strokeColor: "rgba(95, 178, 255, 0.65)",
  },
  draw: (context, positionedGlyph, parameters, model) => {
    context.lineWidth = parameters.strokeWidth;
    context.strokeStyle = parameters.strokeColor;
    forEachSkeletonContour(positionedGlyph, model, (contour) => {
      const points = contour.points;
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        if (!point.type) {
          continue;
        }
        const previous = points[(i - 1 + points.length) % points.length];
        const next = points[(i + 1) % points.length];
        if (previous && !previous.type) {
          strokeLine(context, previous.x, previous.y, point.x, point.y);
        } else if (previous?.type && next && !next.type) {
          strokeLine(context, next.x, next.y, point.x, point.y);
        }
      }
    });
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.nodes",
  name: "Skeleton nodes",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 550,
  screenParameters: {
    cornerSize: 7,
    handleSize: 5,
    smoothSize: 7,
  },
  colors: {
    fillColor: "#2279d2",
  },
  colorsDarkMode: {
    fillColor: "#5fb2ff",
  },
  draw: (context, positionedGlyph, parameters, model) => {
    context.fillStyle = parameters.fillColor;
    forEachSkeletonContour(positionedGlyph, model, (contour) => {
      for (const point of contour.points) {
        if (point.type) {
          fillRoundNode(context, point, parameters.handleSize);
        } else if (point.smooth) {
          fillRoundNode(context, point, parameters.smoothSize);
        } else {
          fillSquareNode(context, point, parameters.cornerSize);
        }
      }
    });
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.skeleton.editable-markers",
  name: "Skeleton editable markers",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 560,
  screenParameters: {
    pointSize: 11,
    strokeWidth: 2,
  },
  colors: {
    fillColor: "rgba(161, 73, 184, 0.22)",
    strokeColor: "rgba(161, 73, 184, 0.95)",
  },
  colorsDarkMode: {
    fillColor: "rgba(199, 119, 221, 0.28)",
    strokeColor: "rgba(199, 119, 221, 0.95)",
  },
  draw: (context, positionedGlyph, parameters, model) => {
    context.lineWidth = parameters.strokeWidth;
    context.strokeStyle = parameters.strokeColor;
    context.fillStyle = parameters.fillColor;
    forEachSkeletonContour(positionedGlyph, model, (contour) => {
      for (const pointIndex of getOnCurvePointIndices(contour)) {
        const rib = getRibPoints(contour, pointIndex);
        if (rib.leftEditable) {
          drawDiamondNode(context, rib.left, parameters.pointSize, true);
        }
        if (rib.rightEditable) {
          drawDiamondNode(context, rib.right, parameters.pointSize, true);
        }
      }
    });
  },
});
```

- [ ] **Step 2: Syntax-check the module**

Run:

```bash
node --check src-js/views-editor/src/visualization-layer-skeleton.js
```

Expected: no output and exit code 0.

- [ ] **Step 3: Format the module**

Run:

```bash
npx prettier --write src-js/views-editor/src/visualization-layer-skeleton.js
```

Expected: prettier reports the skeleton visualization file.

- [ ] **Step 4: Commit**

```bash
git add src-js/views-editor/src/visualization-layer-skeleton.js
git commit -m "feat(skeleton): add read-only visualization layers"
```

---

## Task 3: Register the Skeleton Visualization Module

**Files:**
- Modify: `src-js/views-editor/src/editor.js`

**Interfaces:**
- Ensures skeleton layer definitions are registered before the editor builds visualization layer settings.
- Keeps registration declarative; no direct editor-controller code should know skeleton rendering internals.

- [ ] **Step 1: Add the side-effect import**

In `src-js/views-editor/src/editor.js`, replace:

```javascript
import "./visualization-layer-letterspacer.js";
```

with:

```javascript
import "./visualization-layer-letterspacer.js";
import "./visualization-layer-skeleton.js";
```

- [ ] **Step 2: Syntax-check the edited entry module**

Run:

```bash
node --check src-js/views-editor/src/editor.js
```

Expected: no output and exit code 0.

- [ ] **Step 3: Format the edited module**

Run:

```bash
npx prettier --write src-js/views-editor/src/editor.js
```

Expected: prettier reports `src-js/views-editor/src/editor.js`.

- [ ] **Step 4: Commit**

```bash
git add src-js/views-editor/src/editor.js
git commit -m "feat(skeleton): register rendering layers in editor"
```

---

## Task 4: Bundle and Rail Checks

**Files:**
- Verify: `src-js/views-editor/src/visualization-layer-skeleton.js`
- Verify: `src-js/views-editor/src/editor.js`
- Verify: `test-common/fonts/SkeletonRendering.fontra/**`

- [ ] **Step 1: Run syntax checks**

Run:

```bash
node --check src-js/views-editor/src/visualization-layer-skeleton.js
node --check src-js/views-editor/src/editor.js
```

Expected: both commands exit 0 with no output.

- [ ] **Step 2: Run the production bundle**

Run from the repository root:

```bash
npm run bundle
```

Expected: webpack exits 0. The bundle must resolve `@fontra/core/skeleton-model.js` and include `visualization-layer-skeleton.js`.

- [ ] **Step 3: Confirm no out-of-scope editor plumbing was added**

Run:

```bash
rg -n "skeleton.*hit|hit.*skeleton|skeletonInsert|editSkeleton|drawSkeleton|SkeletonTool|skeleton panel|regenerateSkeleton|generateFromSkeleton" src-js/views-editor/src
```

Expected: matches only in `src-js/views-editor/src/visualization-layer-skeleton.js` for rendering identifiers, or no matches for out-of-scope terms. There must be no pointer-tool, scene-model, panel, or drawing-tool skeleton implementation.

- [ ] **Step 4: Confirm no donor runtime import exists**

Run:

```bash
rg -n "skeleton/src-js|\\.\\./\\.\\./\\.\\./skeleton|from .*skeleton-contour-generator" src-js/views-editor/src src-js/fontra-core/src
```

Expected: no matches in runtime source files.

- [ ] **Step 5: Confirm layer identifiers are unique**

Run:

```bash
rg -n "fontra\\.skeleton\\.(width-shading|ribs|centerline|handles|nodes|editable-markers)" src-js/views-editor/src
```

Expected: one registration for each identifier, all in `src-js/views-editor/src/visualization-layer-skeleton.js`.

- [ ] **Step 6: Commit verification-only formatting drift if prettier changed files**

Run:

```bash
git status --short
```

Expected: no unstaged changes from checks. If prettier changed a tracked WS-8 file, run:

```bash
git add src-js/views-editor/src/visualization-layer-skeleton.js src-js/views-editor/src/editor.js test-common/fonts/SkeletonRendering.fontra/font-data.json test-common/fonts/SkeletonRendering.fontra/glyphs/skeletondemo.json
git commit -m "style(skeleton): format rendering artifacts"
```

Skip this commit when `git status --short` shows no WS-8 formatting changes.

---

## Task 5: Manual Editor Verification Matrix

**Files:**
- Verify manually: `test-common/fonts/SkeletonRendering.fontra`
- Verify manually: `src-js/views-editor/src/visualization-layer-skeleton.js`

- [ ] **Step 1: Start a local editor build if one is not already running**

Run:

```bash
npm run bundle-watch
```

Expected: webpack watch starts and reports a successful compile. Keep this process running while manually testing.

- [ ] **Step 2: Open the fixture font**

Open `test-common/fonts/SkeletonRendering.fontra` in the local Fontra project manager, then open glyph `skeletondemo` and enter glyph editing mode.

Expected: the glyph outline itself is empty, but skeleton visual layers appear on the editing canvas.

- [ ] **Step 3: Verify default visible rendering**

Check these visible elements:

```text
centerline: blue open cubic, closed triangle, and single-sided stroke are visible
handles: cubic off-curve handles in the open contour have handle lines
nodes: on-curve smooth points are round, on-curve corner points are square, off-curve points are smaller round dots
ribs: width indicators cross every on-curve point
width shading: translucent fill connects rib endpoints between neighboring on-curve points
editable markers: purple diamond markers appear only on rib endpoints marked editable in the fixture data
```

Expected: all six visual categories are visible; no pointer hover or selection behavior is required.

- [ ] **Step 4: Verify layer toggles**

Use the existing visualization layer settings UI and toggle these layers off and on:

```text
Skeleton width shading
Skeleton ribs
Skeleton centerline
Skeleton handles
Skeleton nodes
Skeleton editable markers
```

Expected: each toggle affects only its named visual category. Turning every skeleton layer off removes all skeleton visuals without affecting standard glyph editor overlays.

- [ ] **Step 5: Verify dark theme colors**

Switch the editor to dark theme and re-open or refresh the fixture glyph if needed.

Expected: skeleton centerlines/ribs/nodes remain legible; width shading stays translucent; editable markers remain visually distinct from non-editable rib endpoints.

- [ ] **Step 6: Verify read-only behavior**

With the pointer, click and drag skeleton centerlines, nodes, ribs, rib endpoints, and editable markers.

Expected: no skeleton-specific selection state appears, no skeleton geometry changes, no path contours are created, and existing pointer behavior remains limited to the empty glyph/path editor behavior.

- [ ] **Step 7: Stop the watch process**

Stop `npm run bundle-watch` with `Ctrl+C`.

Expected: no running watch process remains.

---

## Task 6: Final Verification and Completion Commit

**Files:**
- Verify all WS-8 files.

- [ ] **Step 1: Run final formatting**

Run:

```bash
npx prettier --write src-js/views-editor/src/visualization-layer-skeleton.js src-js/views-editor/src/editor.js test-common/fonts/SkeletonRendering.fontra/font-data.json test-common/fonts/SkeletonRendering.fontra/glyphs/skeletondemo.json
```

Expected: prettier reports the listed files.

- [ ] **Step 2: Run final checks**

Run:

```bash
node --check src-js/views-editor/src/visualization-layer-skeleton.js
node --check src-js/views-editor/src/editor.js
npm run bundle
rg -n "skeleton.*hit|hit.*skeleton|skeletonInsert|editSkeleton|drawSkeleton|SkeletonTool|skeleton panel|regenerateSkeleton|generateFromSkeleton" src-js/views-editor/src
rg -n "skeleton/src-js|\\.\\./\\.\\./\\.\\./skeleton|from .*skeleton-contour-generator" src-js/views-editor/src src-js/fontra-core/src
```

Expected:

```text
node --check commands exit 0
npm run bundle exits 0
out-of-scope rail grep has no pointer-tool, scene-model, panel, drawing-tool, path-mutation, or generator-call matches
donor runtime import grep has no matches
```

- [ ] **Step 3: Review the diff**

Run:

```bash
git diff -- src-js/views-editor/src/visualization-layer-skeleton.js src-js/views-editor/src/editor.js test-common/fonts/SkeletonRendering.fontra
git status --short
```

Expected: diff includes only WS-8 rendering module, editor registration, and fixture font. Status should not contain unrelated tracked changes from this task.

- [ ] **Step 4: Commit remaining WS-8 changes**

If `git status --short` shows uncommitted WS-8 files, run:

```bash
git add src-js/views-editor/src/visualization-layer-skeleton.js src-js/views-editor/src/editor.js test-common/fonts/SkeletonRendering.fontra/font-data.json test-common/fonts/SkeletonRendering.fontra/glyph-info.csv test-common/fonts/SkeletonRendering.fontra/glyphs/skeletondemo.json
git commit -m "feat(skeleton): render skeleton data read-only"
```

Expected: commit succeeds. If prior task commits already included all WS-8 changes, skip this step and record the existing WS-8 commit hashes in the implementation notes.

---

## Acceptance Criteria

- `test-common/fonts/SkeletonRendering.fontra` opens and glyph `skeletondemo` enters editing mode.
- Existing skeleton data in the editing layer renders without requiring a skeleton tool, panel, pointer hit test, or editing operation.
- The editor registers these user-switchable layers: `fontra.skeleton.width-shading`, `fontra.skeleton.ribs`, `fontra.skeleton.centerline`, `fontra.skeleton.handles`, `fontra.skeleton.nodes`, and `fontra.skeleton.editable-markers`.
- Centerlines, handles, on/off-curve nodes, rib endpoints, width shading, and editable-point markers are independently visible and toggleable.
- Dragging or clicking skeleton visuals does not mutate skeleton data or path contours.
- `npm run bundle` passes from the repository root.
- Rail greps confirm no pointer hit testing, scene-model skeleton selection, skeleton editing, drawing tool, panel UI, generator mutation, or donor runtime imports were introduced.
