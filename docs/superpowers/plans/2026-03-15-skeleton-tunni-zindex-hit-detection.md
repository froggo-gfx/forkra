# Skeleton Tunni Lines Z-Index and Hit Detection Implementation Plan

> **For agentic workers:** REQUIRED: Use `subagent-driven-development` (if subagents are available) or `executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Skeleton Tunni Lines the topmost skeleton layer (z-index 570) and increase hit detection area to 2× visual size for easier selection.

**Architecture:** Two simple changes: (1) Update zIndex in the skeleton tunni layer definition from 548 to 570, (2) Modify the hit test call sites to pass `size * 2` instead of `size` for consistent 2× hit detection.

**Tech Stack:** JavaScript, Fontra visualization layer system, pointer tool event handling.

---

## Chunk 1: Z-Index and Hit Detection Changes

### Task 1: Update Skeleton Tunni Layer Z-Index

**Files:**
- Modify: `src-js/views-editor/src/skeleton-visualization-layers.js:1019`

- [ ] **Step 1: Change zIndex from 548 to 570**

In `skeleton-visualization-layers.js`, line 1019, change:
```javascript
zIndex: 548, // Between handles (545) and nodes (550)
```

To:
```javascript
zIndex: 570, // Topmost skeleton layer (above rib points at 560)
```

- [ ] **Step 2: Verify the change**

Run: Check the file to confirm the zIndex is now 570

Expected: Line 1019 shows `zIndex: 570`

- [ ] **Step 3: Commit**

```bash
git add src-js/views-editor/src/skeleton-visualization-layers.js
git commit -m "style: move skeleton tunni lines to topmost z-index (570)"
```

### Task 2: Update Hit Detection to Use 2× Size

**Files:**
- Modify: `src-js/views-editor/src/edit-tools-pointer.js:982,1441,1509`

**Context:** The hit test function `skeletonTunniHitTest` takes a `size` parameter. Currently, some call sites pass `size`, others pass `size * 2`. We want all Tunni point hit tests to use 2× the base size for easier selection.

- [ ] **Step 1: Update line 1509 to use 2× size**

In `edit-tools-pointer.js`, line 1509, change:
```javascript
const tunniHit = skeletonTunniHitTest(glyphPoint, size, skeletonData);
```

To:
```javascript
const tunniHit = skeletonTunniHitTest(glyphPoint, size * 2, skeletonData);
```

Note: Lines 982 and 1441 already use `size * 2`, so only line 1509 needs to be changed.

- [ ] **Step 2: Verify all three call sites use 2× size**

Run: `grep -n "skeletonTunniHitTest" src-js/views-editor/src/edit-tools-pointer.js`

Expected output shows:
- Line 982: `skeletonTunniHitTest(glyphPoint, size * 2, skeletonData, {`
- Line 1441: `skeletonTunniHitTest(glyphPoint, size * 2, skeletonData, {`
- Line 1509: `skeletonTunniHitTest(glyphPoint, size * 2, skeletonData);`

- [ ] **Step 3: Commit**

```bash
git add src-js/views-editor/src/edit-tools-pointer.js
git commit -m "feat: increase skeleton tunni hit detection area to 2×"
```

---

## Testing

### Task 3: Manual Testing in Browser

**Prerequisites:** Have a skeleton font file open in Fontra editor

- [ ] **Step 1: Start the development server**

```bash
npm run dev
```

Expected: Server starts, browser opens to Fontra editor

- [ ] **Step 2: Open a glyph with skeleton curves**

Navigate to a glyph that has skeleton curves with Tunni points visible

- [ ] **Step 3: Enable Skeleton Tunni Lines visualization**

In the visualization layers panel, enable "Skeleton Tunni Lines"

Expected: Tunni lines and points appear above skeleton curves (not obscured)

- [ ] **Step 4: Test hit detection**

Hover near (but not directly on) a Tunni point

Expected: Cursor changes to indicate clickable element when within ~10px of the 5px visual point

- [ ] **Step 5: Test dragging**

Click and drag a Tunni point

Expected: Tunni point drags smoothly without accidentally selecting skeleton segments underneath

- [ ] **Step 6: Test True Tunni point**

Hover near the orange diamond (true Tunni point)

Expected: Also has enlarged hit area (8px for 4px visual point)

---

## Verification

### Task 4: Run Build and Tests

- [ ] **Step 1: Run JavaScript build**

```bash
npm run bundle
```

Expected: Build completes without errors

- [ ] **Step 2: Run JavaScript tests**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 3: Final git status check**

```bash
git status
```

Expected: Shows 2 modified files, clean working directory

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `src-js/views-editor/src/skeleton-visualization-layers.js` | Line 1019: zIndex 548 → 570 |
| `src-js/views-editor/src/edit-tools-pointer.js` | Line 1509: `size` → `size * 2` |

---

## Visual Layer Ordering (After Changes)

```
570 - Skeleton Tunni Lines (NEW - topmost)
560 - Skeleton Rib Points
555 - Skeleton Selected Segments  
550 - Skeleton Nodes
548 - Skeleton Handles
...
500 - Glyph paths/outlines
```

## Hit Detection Sizes (After Changes)

| Element | Visual Size | Hit Detection |
|---------|-------------|---------------|
| Tunni Point (circle) | 5px | 10px radius |
| True Tunni Point (diamond) | 4px | 8px radius |
