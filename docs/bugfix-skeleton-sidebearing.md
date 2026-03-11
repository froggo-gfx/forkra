# Bug Fix: Skeleton Not Moving With Sidebearing Changes

## The Problem

When you change the left sidebearing of a glyph that contains skeleton data, the skeleton stays in place while the generated contours move. This creates a visual desync where the skeleton centerline no longer matches its generated outline.

### How to reproduce

1. Open a glyph that has skeleton data (created with the Skeleton Pen Tool)
2. Go to the Glyph Info panel and change the left sidebearing value
3. Or use the Sidebearing Tool to drag the left sidebearing on canvas
4. Observe: the generated outline moves, but the skeleton centerline stays put

### Why this is bad

The skeleton is the "source of truth" for the generated contours. If you move the generated contours but not the skeleton, and then make any edit to the skeleton (move a point, change width), the contours will regenerate from the unmoved skeleton position. Your sidebearing change is effectively lost.

---

## How I Understood The Problem

### Step 1: Understanding the architecture

First, I needed to understand how skeleton data is stored. By searching for `fontra.skeleton` in the codebase, I found:

- Skeleton data lives in `Layer.customData["fontra.skeleton"]`
- It's completely separate from the glyph's `path` (the actual outline)
- The structure looks like this:

```javascript
{
  version: 1,
  contours: [
    {
      isClosed: boolean,
      points: [
        { x, y, type, smooth, width, leftWidth, rightWidth },
        ...
      ],
      defaultWidth: number,
      capStyle: "butt" | "round" | "square"
    }
  ],
  generatedContourIndices: [...]
}
```

The skeleton points have absolute X/Y coordinates, just like regular path points.

### Step 2: Finding where sidebearing changes happen

I searched for `sidebearing`, `leftMargin`, `rightMargin`, and `moveWithReference` to find the code that handles sidebearing edits. I found two places:

**Place 1: `panel-selection-info.js` (Glyph Info panel)**

Lines 250-262 define a custom `setValue` function for the left margin field:

```javascript
setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
  const translationX = maybeClampValue(
    value - layerGlyphController.leftMargin,
    -layerGlyph.xAdvance,
    undefined
  );
  // Move all path X coordinates
  for (const i of range(0, layerGlyph.path.coordinates.length, 2)) {
    layerGlyph.path.coordinates[i] += translationX;
  }
  // Move all components
  for (const compo of layerGlyph.components) {
    compo.transformation.translateX += translationX;
  }
  layerGlyph.xAdvance += translationX;
},
```

This code moves `path.coordinates` and `components`, but has no idea that `customData["fontra.skeleton"]` exists.

**Place 2: `edit-tools-metrics.js` (Sidebearing Tool on canvas)**

Lines 721-733 handle dragging the left sidebearing:

```javascript
case "L": {
  const clampedDeltaX = Math.min(leftDeltaX, initialValues[glyphName].xAdvance);
  layerGlyph.xAdvance = initialValues[glyphName].xAdvance - clampedDeltaX;
  layerGlyph.moveWithReference(
    initialValues[glyphName].reference,
    -clampedDeltaX,
    0
  );
  break;
}
```

This uses `moveWithReference()`, so I looked at that method in `var-glyph.js`:

```javascript
moveWithReference(reference, dx, dy) {
  if (reference.path.x !== undefined) {
    this.path.moveAllWithFirstPoint(reference.path.x + dx, reference.path.y + dy);
  }
  for (const [{ x, y }, compo] of zip(reference.components, this.components)) {
    compo.transformation.translateX = x + dx;
    compo.transformation.translateY = y + dy;
  }
  for (const [{ x, y }, anchor] of zip(reference.anchors, this.anchors)) {
    anchor.x = x + dx;
    anchor.y = y + dy;
  }
  for (const [{ x, y }, guideline] of zip(reference.guidelines, this.guidelines)) {
    guideline.x = x + dx;
    guideline.y = y + dy;
  }
  if (reference.backgroundImage.x !== undefined) {
    this.backgroundImage.transformation.translateX = reference.backgroundImage.x + dx;
    this.backgroundImage.transformation.translateY = reference.backgroundImage.y + dy;
  }
}
```

This method moves: path, components, anchors, guidelines, backgroundImage. It does NOT touch `customData`. The method operates on `StaticGlyph`, which doesn't even have access to `Layer.customData`.

### Step 3: Understanding the change recording system

Before writing the fix, I needed to understand how undo/redo works. The codebase uses `recordChanges()` which wraps objects in a Proxy to track mutations.

Key insight: if you mutate a nested object directly, the Proxy won't see the change unless you access it through the proxy chain. The safest approach is to clone the object, modify the clone, and assign the whole thing back:

```javascript
// This gets tracked properly:
const newData = JSON.parse(JSON.stringify(oldData));
modifyData(newData);
layer.customData["fontra.skeleton"] = newData;

// This might not get tracked:
layer.customData["fontra.skeleton"].contours[0].points[0].x += 10;
```

---

## The Solution

### Overview

Add skeleton movement in both places where sidebearing changes happen:
1. `panel-selection-info.js` - for Glyph Info panel edits
2. `edit-tools-metrics.js` - for Sidebearing Tool drags

Also create a utility function to avoid code duplication.

### Change 1: Add utility function

**File:** `src-js/fontra-core/src/skeleton-contour-generator.js`

```javascript
/**
 * Move all skeleton points by dx, dy.
 * Modifies the skeletonData object in place.
 * @param {Object} skeletonData - The skeleton data object
 * @param {number} dx - X offset
 * @param {number} dy - Y offset
 */
export function moveSkeletonData(skeletonData, dx, dy) {
  if (!skeletonData?.contours) return;

  for (const contour of skeletonData.contours) {
    if (!contour.points) continue;
    for (const point of contour.points) {
      point.x += dx;
      point.y += dy;
    }
  }
}
```

This function modifies the skeleton in place. The caller is responsible for cloning if needed.

### Change 2: Fix Glyph Info panel

**File:** `src-js/views-editor/src/panel-selection-info.js`

First problem: the `setValue` function doesn't have access to the `Layer` object. It only receives `layerGlyph` (which is `Layer.glyph`, a `StaticGlyph`). But skeleton data is in `Layer.customData`.

Solution: pass the full `Layer` object as an additional parameter.

**Step 2a:** Modify the call site in `applyNewValue()`:

```javascript
// Before:
setFieldValue(
  layers[layerName].glyph,
  layerGlyphController,
  fieldItem,
  newValue
);

// After:
setFieldValue(
  layers[layerName].glyph,
  layerGlyphController,
  fieldItem,
  newValue,
  layers[layerName]  // pass the full Layer
);
```

**Step 2b:** Update the `setValue` function for leftMargin:

```javascript
setValue: (layerGlyph, layerGlyphController, fieldItem, value, layer) => {
  const translationX = maybeClampValue(
    value - layerGlyphController.leftMargin,
    -layerGlyph.xAdvance,
    undefined
  );
  for (const i of range(0, layerGlyph.path.coordinates.length, 2)) {
    layerGlyph.path.coordinates[i] += translationX;
  }
  for (const compo of layerGlyph.components) {
    compo.transformation.translateX += translationX;
  }
  // NEW: Move skeleton data if present
  const skeletonData = layer?.customData?.["fontra.skeleton"];
  if (skeletonData) {
    const newSkeletonData = JSON.parse(JSON.stringify(skeletonData));
    moveSkeletonData(newSkeletonData, translationX, 0);
    layer.customData["fontra.skeleton"] = newSkeletonData;
  }
  layerGlyph.xAdvance += translationX;
},
```

### Change 3: Fix Sidebearing Tool

**File:** `src-js/views-editor/src/edit-tools-metrics.js`

The Sidebearing Tool supports continuous dragging. During a drag, `editContinuous()` is called repeatedly with different delta values. Each iteration needs to apply the delta from the *original* position, not from the current position. That's why `initialValues` stores the original `xAdvance` and `reference`.

We need to do the same for skeleton: store the original skeleton and apply the delta from that.

**Step 3a:** Store original skeleton in `initialValues`:

```javascript
for (const { glyphName, layerName } of this.sidebearingSelectors) {
  const varGlyphController = await this.fontController.getGlyph(glyphName);
  const varGlyph = varGlyphController.glyph;
  font.glyphs[glyphName] = varGlyph;
  const layer = varGlyph.layers[layerName];
  const layerGlyph = layer.glyph;
  initialValues[glyphName] = {
    xAdvance: layerGlyph.xAdvance,
    reference: layerGlyph.getMoveReference(),
    // NEW: Clone skeleton for restoration during continuous editing
    skeletonData: layer?.customData?.["fontra.skeleton"]
      ? JSON.parse(JSON.stringify(layer.customData["fontra.skeleton"]))
      : null,
  };
}
```

**Step 3b:** Move skeleton in case "L" (left sidebearing):

```javascript
case "L": {
  const clampedDeltaX = Math.min(
    leftDeltaX,
    initialValues[glyphName].xAdvance
  );
  layerGlyph.xAdvance = initialValues[glyphName].xAdvance - clampedDeltaX;
  layerGlyph.moveWithReference(
    initialValues[glyphName].reference,
    -clampedDeltaX,
    0
  );
  // NEW: Move skeleton data
  const layer = varGlyph.layers[layerName];
  if (initialValues[glyphName].skeletonData) {
    const newSkeletonData = JSON.parse(
      JSON.stringify(initialValues[glyphName].skeletonData)
    );
    moveSkeletonData(newSkeletonData, -clampedDeltaX, 0);
    layer.customData["fontra.skeleton"] = newSkeletonData;
  }
  break;
}
```

**Step 3c:** Move skeleton in case "LR" (shape - moving the glyph center):

```javascript
case "LR": {
  let clampedDeltaX = 2 * rightDeltaX;
  if (event.altKey) {
    clampedDeltaX = Math.max(
      2 * rightDeltaX,
      -initialValues[glyphName].xAdvance
    );
    layerGlyph.xAdvance = initialValues[glyphName].xAdvance + clampedDeltaX;
  } else {
    layerGlyph.xAdvance = initialValues[glyphName].xAdvance;
  }
  layerGlyph.moveWithReference(
    initialValues[glyphName].reference,
    clampedDeltaX / 2,
    0
  );
  // NEW: Move skeleton data
  const layer = varGlyph.layers[layerName];
  if (initialValues[glyphName].skeletonData) {
    const newSkeletonData = JSON.parse(
      JSON.stringify(initialValues[glyphName].skeletonData)
    );
    moveSkeletonData(newSkeletonData, clampedDeltaX / 2, 0);
    layer.customData["fontra.skeleton"] = newSkeletonData;
  }
  break;
}
```

**Note:** Case "R" (right sidebearing) doesn't need skeleton movement because it only changes `xAdvance` without moving the contours.

---

## Why This Approach

### Why clone instead of mutate in place?

The `recordChanges()` system tracks changes by watching property assignments on Proxy objects. When you do `layer.customData["fontra.skeleton"] = newData`, that assignment is captured. If you instead mutate deeply nested properties, those changes might not be tracked properly, breaking undo/redo.

### Why not modify `moveWithReference()`?

`moveWithReference()` is a method on `StaticGlyph`. The `StaticGlyph` class doesn't have access to `Layer.customData` - that's one level up in the object hierarchy. Modifying `moveWithReference()` would require changing its signature and all call sites, which is more invasive.

### Why store the original skeleton in `initialValues`?

During continuous dragging, the same `editContinuous()` loop runs many times. Each iteration applies a delta from the *original* position. If we didn't store the original skeleton, we'd be applying deltas on top of already-moved skeletons, causing the skeleton to "drift" further with each drag update.

---

## Files Changed

1. `src-js/fontra-core/src/skeleton-contour-generator.js` (+19 lines)
   - Added `moveSkeletonData()` function

2. `src-js/views-editor/src/panel-selection-info.js` (+10 lines, -2 lines)
   - Added import for `moveSkeletonData`
   - Added `layer` parameter to `setValue` for leftMargin
   - Added skeleton movement logic
   - Updated `setFieldValue()` call to pass layer

3. `src-js/views-editor/src/edit-tools-metrics.js` (+25 lines, -1 line)
   - Added import for `moveSkeletonData`
   - Store skeleton in `initialValues`
   - Move skeleton in case "L" and case "LR"
