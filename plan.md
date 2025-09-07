# less loop more zoop   
Nice — this is a great, well-scoped feature. Below I give a detailed, developer-ready plan that maps your 4 user-steps to 4 implementation steps. Each step is self-contained (the app must work after each step), lists exactly which files to edit, describes the functions to add/change (including method signatures and pseudocode), the UI/keybinding work, rendering/selection effects, and suggested tests. I also point to the existing files you’ll hook into so you can implement with minimal surprises.   
I relied on the `scene-controller` and `path-functions` code already in the repo as the primary integration points; you’ll be editing them plus a few visualization/model files. (I cite the relevant files where I reference existing functions you should reuse.)   
 --- 
# High-level approach (one-sentence)   
Create three new editor actions (hotkeys) that (1) expand two selected on-curve terminal nodes by inserting outward on-curve nodes (n1a, n2a) and connecting them to their mothers with straight segments and a chord, (2) compute and display non-interactable virtual intersection points (n1v, n2v) where the chord crosses the two stalk segments, and (3) realize those virtual intersections into real points (insert into the glyph) while removing the original terminals. At step 3 add a **render override** so the glyph fill is computed as if the chord + virtual points were used (without changing the glyph data) — then step 4 makes the change permanent.   
 --- 
# Key places in the codebase (where you’ll add/edit)   
- Core path helpers: `src-js/fontra-core/src/path-functions.js` — add computational helpers: expand/compute/realize.   
- Editor controller (hotkeys / glue): `src-js/views-editor/src/scene-controller.js` — register actions and call path helpers within `editGlyph(...)` where required.   
- Scene model: `src-js/views-editor/src/scene-model.js` — add transient state for virtual points / render override. (SceneController creates/updates this model; visualization will read it.)   
- Visualization: `src-js/views-editor/src/visualization-layers.js` (and/or `visualization-layer-definitions.js`) — draw virtual points and respect render override for fills.   
- Tests: `src-js/fontra-core/tests/test-path-functions.js` — add unit tests for the new path-functions helpers.   
 --- 
   

## STEP 1 — (User): Select two on-curve nodes → press hotkey → insert outward on-curve nodes n1a and n2a and connect them with a straight chord.   
### Goal (what to ship here)   
- A single hotkey (e.g. `Ctrl+Alt+E` — we’ll register it as an action you can rebind) that:   
    - Validates exactly two selected points are allowed (both on-curve, each has exactly one handle on the stalk side).   
    - Inserts two **new on-curve** points ( `n1a`, `n2a`) at positions computed by projecting along each node’s handle direction *outside* the glyph.   
    - Inserts those new points *immediately adjacent* after their mother nodes so the mother → n?a segment is a straight line segment.   
    - Creates and tags the chord: the straight segment between the two new points (just two on-curve points in whatever contours they belong to).   
    - Updates selection to the two new `n1a`, `n2a`.   
    - Works with undo/redo.   
   
### Files to edit   
- `src-js/views-editor/src/scene-controller.js` — add/register action and handler that calls editGlyph and updates selection.   
- `src-js/fontra-core/src/path-functions.js` — add functions:   
    - `expandTerminals(path, selectedPointAbsoluteIndices, options)` → returns `{ newPointIndices: [n1aIndex, n2aIndex], createdAttrsInfo }`.   
    - small helpers used by `expandTerminals`: `getPrimaryHandleDirection(path, pointIndex)`, `computeExpansionPoint(anchor, handleVec, fallbackDistance)`.   
    - optionally, utility `tagPointAttr(path, pointIndex, key, value)` to label expanded points.   
    - Reuse `path.insertPoint(...)` and existing vector utilities.   
   
### Implementation sketch (pseudocode / notes) 
Step A. Check if two nodes selected are eligeble for expansion: two on-curve points must have no off-curve points between them and have one the handle in derction of the other neighboring nodes. Create a console message that says "Eligeble"

Step B. Inside SceneController:   
```
registerAction({ id: "expand-terminals", title: "Expand terminals (create chord)", defaultKey: "Ctrl+Alt+E", handler: async () => {
  const parsed = parseSelection(this.selection); // exists in utils; gives point indices
  const pointIds = parsed.point; // e.g. ["point/23", "point/56"]
  if (pointIds.length !== 2) { message("Select exactly 2 points"); return; }
  await this.editGlyph(async (sendIncrementalChange, glyph) => {
     const layerInfo = this.getEditingLayerFromGlyphLayers(glyph.layers);
     for (each layerGlyph) {
        const ret = expandTerminals(layerGlyph.path, [absIdx1, absIdx2], { offsetFactor: 1.5 });
        // apply changes are done in expandTerminals directly via path mutators
     }
     // return change description & new selection set
  });
} });


```
Inside `path-functions.js`:   
```
export function expandTerminals(path, absPointIndices, {offsetFactor=1.5, minDist=20} = {}) {
  // Validate both points are on-curve; check their neighboring off-curve handles
  // find handle vector (either preceding off-curve or following off-curve)
  // compute new position: anchor + normalize(handleVec) * Math.max(handleLen*offsetFactor, minDist)
  // Insert new on-curve point directly after the anchor in that contour: path.insertPoint(contourIndex, insertAfter, newPoint)
  // Tag both new points with attrs: point.attrs = { 'fontra.chord.expanded': { mother: originalAbsoluteIndex } }
  // Return absolute indices of new points.
}


```
### Behavior details / validation   
- If validation fails (not on-curve, both handles present, points in different glyph layers, or points not suitable terminals), show `message(...)` and abort.   
- Insertions happen inside `editGlyph` so undo/redo works.   
   
### Tests / verification   
- Unit test: call `expandTerminals` with a simple glyph path (a terminal with a single handle) and assert inserted points exist, are on-curve, and are placed roughly in handle direction. Add to `test-path-functions.js`.   
 --- 