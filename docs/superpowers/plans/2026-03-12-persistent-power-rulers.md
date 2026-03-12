# Persistent Power Rulers Implementation Plan

> **For agentic workers:** REQUIRED: Use `subagent-driven-development` (if subagents are available) or `executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement persistent power rulers that store data in glyph customData for file-based persistence.

**Architecture:** 
- PowerRulerTool manages multiple rulers per glyph with one active ruler
- Rulers stored in glyph.customData["fontra.glyph.rulers"] for file persistence
- Sidebar panel provides UI for managing rulers (view, edit, delete)
- Static rulers rendered with reduced opacity, not draggable by pointer tool

**Tech Stack:** JavaScript (ES modules), Web Components, Fontra core APIs

---

## Chunk 1: File-based Persistence Layer

### Task 1: Update PowerRulerTool to use glyph customData

**Files:**
- Modify: `src-js/views-editor/src/edit-tools-power-ruler.js`
- Test: Manual testing in browser

- [ ] **Step 1: Add methods to load/save rulers from glyph customData**

Add these methods to PowerRulerTool class:

```javascript
async loadRulersFromGlyph(glyphName) {
  const varGlyph = await this.fontController.getGlyph(glyphName);
  if (!varGlyph) {
    return;
  }
  const rulersData = varGlyph.customData["fontra.glyph.rulers"];
  if (rulersData) {
    this.glyphRulers[glyphName] = rulersData;
    // Ensure active ruler is marked
    if (rulersData.activeRulerId && rulersData.rulers[rulersData.activeRulerId]) {
      rulersData.rulers[rulersData.activeRulerId].isActive = true;
    }
  }
  this._rulerCounter = Object.keys(rulersData?.rulers || {}).length;
}

async saveRulersToGlyph(glyphName, changeDescription) {
  const varGlyph = await this.fontController.getGlyph(glyphName);
  if (!varGlyph) {
    return;
  }
  
  const rulersData = this.glyphRulers[glyphName];
  if (!rulersData || !Object.keys(rulersData.rulers).length) {
    // No rulers, remove from customData if exists
    if (varGlyph.customData["fontra.glyph.rulers"]) {
      delete varGlyph.customData["fontra.glyph.rulers"];
    }
    return;
  }
  
  // Prepare data for storage (remove transient isActive flags)
  const storageData = {
    activeRulerId: rulersData.activeRulerId,
    rulers: {}
  };
  
  for (const [id, ruler] of Object.entries(rulersData.rulers)) {
    storageData.rulers[id] = {
      id: ruler.id,
      name: ruler.name,
      basePoint: ruler.basePoint,
      directionVector: ruler.directionVector,
      intersections: ruler.intersections,
      measurePoints: ruler.measurePoints
    };
  }
  
  varGlyph.customData["fontra.glyph.rulers"] = storageData;
  
  // Record the change
  await this.sceneController.editGlyphAndRecordChanges(glyphName, (glyph) => {
    glyph.customData["fontra.glyph.rulers"] = storageData;
    return changeDescription;
  });
}
```

- [ ] **Step 2: Update constructor to load rulers on glyph change**

Modify the `addCurrentGlyphChangeListener` callback:

```javascript
this.sceneController.addCurrentGlyphChangeListener(async (event) => {
  if (this.currentGlyphName) {
    await this.loadRulersFromGlyph(this.currentGlyphName);
  }
  this.recalc();
  this.notifyPanelOfRulerChange();
});
```

- [ ] **Step 3: Update createRuler to save to glyph**

Modify `createRuler` method to call `saveRulersToGlyph` after creating ruler:

```javascript
async createRuler(glyphName, basePoint, directionVector) {
  // ... existing code ...
  
  this.notifyPanelOfRulerChange();
  await this.saveRulersToGlyph(glyphName, "add power ruler");
  return rulerId;
}
```

- [ ] **Step 4: Update deleteRuler to save to glyph**

Modify `deleteRuler` method:

```javascript
async deleteRuler(glyphName, rulerId) {
  // ... existing code ...
  
  this.notifyPanelOfRulerChange();
  this.canvasController.requestUpdate();
  await this.saveRulersToGlyph(glyphName, "delete power ruler");
}
```

- [ ] **Step 5: Update updateRulerPosition to save to glyph**

Modify `updateRulerPosition` method to save after updating:

```javascript
async updateRulerPosition(glyphName, rulerId, basePoint, directionVector) {
  // ... existing code ...
  
  this.notifyPanelOfRulerChange();
  await this.saveRulersToGlyph(glyphName, "edit power ruler");
}
```

- [ ] **Step 6: Make createRuler, deleteRuler, updateRulerPosition async**

Update all callers of these methods to use `await`.

- [ ] **Step 7: Test persistence**

1. Start Fontra server: `fontra --launch filesystem /path/to/fonts`
2. Open a glyph in editor
3. Double-click to create a ruler
4. Reload the page
5. Verify ruler is still there
6. Close and reopen the font file
7. Verify ruler persists

---

## Chunk 2: Sidebar Panel

### Task 2: Create Panel Component

**Files:**
- Create: `src-js/views-editor/src/panel-power-rulers.js`
- Modify: `src-js/views-editor/src/editor.js`
- Test: Manual testing in browser

- [ ] **Step 1: Create panel-power-rulers.js**

Create new file with panel component:

```javascript
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { throttleCalls } from "@fontra/core/utils.js";
import { isNumeric } from "@fontra/core/utils.js";
import Panel from "./panel.js";

export default class PowerRulersPanel extends Panel {
  identifier = "power-rulers";
  iconPath = "/images/ruler.svg";

  static styles = `
    .power-rulers-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 0.5em;
    }
    
    .power-rulers-list {
      display: flex;
      flex-direction: column;
      gap: 0.5em;
      overflow: hidden auto;
    }
    
    .power-ruler-item {
      display: grid;
      grid-template-columns: auto auto 1fr auto;
      gap: 0.3em;
      align-items: center;
      padding: 0.3em;
      border-radius: 0.25em;
      background-color: var(--panel-background-color);
    }
    
    .power-ruler-item.active {
      background-color: var(--panel-background-color-hover);
      border: 1px solid var(--accent-color);
    }
    
    .power-ruler-item input[type="checkbox"] {
      margin: 0;
    }
    
    .power-ruler-item input[type="text"] {
      width: 100%;
      padding: 0.2em 0.4em;
      border: 1px solid var(--panel-border-color);
      border-radius: 0.2em;
      background-color: var(--text-input-background-color);
      color: var(--text-input-foreground-color);
      font-size: 0.9em;
    }
    
    .power-ruler-coords {
      display: flex;
      gap: 0.2em;
      align-items: center;
    }
    
    .power-ruler-coords input {
      width: 4em;
      padding: 0.2em 0.3em;
      border: 1px solid var(--panel-border-color);
      border-radius: 0.2em;
      background-color: var(--text-input-background-color);
      color: var(--text-input-foreground-color);
      font-size: 0.85em;
      text-align: right;
    }
    
    .power-ruler-coords label {
      font-size: 0.8em;
      color: var(--panel-foreground-color-secondary);
    }
    
    .power-ruler-delete-btn {
      background: none;
      border: none;
      color: var(--danger-color);
      cursor: pointer;
      padding: 0.2em 0.4em;
      border-radius: 0.2em;
      font-size: 1.2em;
    }
    
    .power-ruler-delete-btn:hover {
      background-color: var(--danger-color);
      color: white;
    }
    
    .power-ruler-add-btn {
      padding: 0.5em 1em;
      background-color: var(--accent-color);
      color: white;
      border: none;
      border-radius: 0.25em;
      cursor: pointer;
      font-size: 0.9em;
    }
    
    .power-ruler-add-btn:hover {
      background-color: var(--accent-color-hover);
    }
    
    .power-ruler-empty {
      text-align: center;
      color: var(--panel-foreground-color-secondary);
      padding: 1em;
      font-style: italic;
    }
    
    .power-ruler-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5em;
    }
    
    .power-ruler-header h3 {
      margin: 0;
      font-size: 1em;
    }
  `;

  constructor(editorController) {
    super(editorController);
    this.throttledUpdate = throttleCalls((senderID) => this.update(senderID), 100);
    this.sceneController = this.editorController.sceneController;
    this.powerRulerTool = this.editorController.tools["power-ruler-tool"];
    
    // Register this panel with the power ruler tool
    this.editorController.powerRulersPanel = this;
    
    this.sceneController.sceneSettingsController.addKeyListener(
      "selectedGlyphName",
      (event) => this.throttledUpdate()
    );
  }

  getContentElement() {
    return html.div(
      {
        class: "power-rulers-panel",
      },
      [
        html.div(
          {
            class: "panel-section panel-section--noscroll",
          },
          [
            html.div(
              { class: "power-ruler-header" },
              [
                html.h3({}, [translate("sidebar.power-rulers.title")]),
                html.button(
                  {
                    class: "power-ruler-add-btn",
                    onclick: (event) => this.addRuler(event),
                  },
                  [translate("sidebar.power-rulers.add")]
                ),
              ]
            ),
          ]
        ),
        html.div(
          {
            class: "panel-section panel-section--flex panel-section--scrollable",
          },
          [
            html.div({ class: "power-rulers-list", id: "power-rulers-list" }),
          ]
        ),
      ]
    );
  }

  async update() {
    const rulersList = this.contentElement.querySelector("#power-rulers-list");
    if (!rulersList) {
      return;
    }
    
    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    if (!glyphName) {
      rulersList.innerHTML = `<div class="power-ruler-empty">${translate("sidebar.power-rulers.no-glyph")}</div>`;
      return;
    }
    
    const rulers = this.powerRulerTool?.getAllRulers(glyphName) || [];
    const activeRulerId = this.powerRulerTool?.getActiveRulerId(glyphName);
    
    if (!rulers.length) {
      rulersList.innerHTML = `<div class="power-ruler-empty">${translate("sidebar.power-rulers.empty")}</div>`;
      return;
    }
    
    rulersList.innerHTML = "";
    
    for (const ruler of rulers) {
      const isActive = ruler.id === activeRulerId;
      const rulerElement = html.div(
        {
          class: `power-ruler-item ${isActive ? "active" : ""}`,
        },
        [
          html.input({
            type: "checkbox",
            checked: true,
            onchange: (event) => this.toggleRulerVisibility(ruler.id, event.target.checked),
          }),
          html.input({
            type: "text",
            value: ruler.name,
            onchange: (event) => this.updateRulerName(ruler.id, event.target.value),
            onclick: (event) => {
              // Activate ruler when clicking on name
              this.powerRulerTool?.setActiveRuler(glyphName, ruler.id);
              this.update();
            },
          }),
          html.div(
            { class: "power-ruler-coords" },
            [
              html.input({
                type: "number",
                value: Math.round(ruler.basePoint.x),
                step: "1",
                style: "width: 3.5em;",
                onchange: (event) => this.updateRulerCoords(
                  ruler.id, 
                  parseFloat(event.target.value), 
                  parseFloat(this.contentElement.querySelector(`[data-ruler-id="${ruler.id}"].power-ruler-y`).value)
                ),
              }),
              html.label({}, "X"),
              html.input({
                type: "number",
                value: Math.round(ruler.basePoint.y),
                step: "1",
                style: "width: 3.5em;",
                class: `power-ruler-y`,
                "data-ruler-id": ruler.id,
                onchange: (event) => this.updateRulerCoords(
                  ruler.id,
                  parseFloat(this.contentElement.querySelector(`[data-ruler-id="${ruler.id}"].power-ruler-x`).value),
                  parseFloat(event.target.value)
                ),
              }),
              html.label({}, "Y"),
              html.input({
                type: "number",
                value: Math.round(Math.atan2(ruler.directionVector.y, ruler.directionVector.x) * 180 / Math.PI),
                step: "1",
                style: "width: 3em;",
                onchange: (event) => this.updateRulerAngle(ruler.id, parseFloat(event.target.value)),
              }),
              html.label({}, "°"),
            ]
          ),
          html.button(
            {
              class: "power-ruler-delete-btn",
              onclick: (event) => this.deleteRuler(ruler.id),
              innerHTML: "×",
            },
            []
          ),
        ]
      );
      rulersList.appendChild(rulerElement);
    }
  }

  async addRuler(event) {
    // Create a default ruler at center of view
    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    if (!glyphName) {
      return;
    }
    
    const viewBox = this.editorController.canvasController.getViewBox();
    const centerX = (viewBox.xMin + viewBox.xMax) / 2;
    const centerY = (viewBox.yMin + viewBox.yMax) / 2;
    
    await this.powerRulerTool?.createRuler(glyphName, { x: centerX, y: centerY }, { x: 1, y: 0 });
    this.update();
  }

  async deleteRuler(rulerId) {
    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    if (!glyphName) {
      return;
    }
    await this.powerRulerTool?.deleteRuler(glyphName, rulerId);
    this.update();
  }

  async updateRulerName(rulerId, newName) {
    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    const data = this.powerRulerTool?.getRulerData(glyphName);
    if (data && data.rulers[rulerId]) {
      data.rulers[rulerId].name = newName;
      await this.powerRulerTool?.saveRulersToGlyph(glyphName, "rename power ruler");
    }
  }

  async updateRulerCoords(rulerId, newX, newY) {
    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    const data = this.powerRulerTool?.getRulerData(glyphName);
    if (data && data.rulers[rulerId]) {
      const ruler = data.rulers[rulerId];
      ruler.basePoint = { x: newX, y: newY };
      // Recalculate intersections
      const glyphController = this.sceneModel._getSelectedStaticGlyphController();
      if (glyphController) {
        const extraLines = this.powerRulerTool?.computeSideBearingLines(glyphController);
        const updated = this.powerRulerTool?.recalcRulerFromLine(
          glyphController,
          ruler.basePoint,
          ruler.directionVector,
          extraLines,
          ruler.id === data.activeRulerId
        );
        ruler.intersections = updated.intersections;
        ruler.measurePoints = updated.measurePoints;
      }
      await this.powerRulerTool?.saveRulersToGlyph(glyphName, "edit power ruler position");
      this.editorController.canvasController.requestUpdate();
    }
  }

  async updateRulerAngle(rulerId, angleDegrees) {
    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    const data = this.powerRulerTool?.getRulerData(glyphName);
    if (data && data.rulers[rulerId]) {
      const ruler = data.rulers[rulerId];
      const angleRad = angleDegrees * Math.PI / 180;
      ruler.directionVector = {
        x: Math.cos(angleRad),
        y: Math.sin(angleRad)
      };
      // Recalculate intersections
      const glyphController = this.sceneModel._getSelectedStaticGlyphController();
      if (glyphController) {
        const extraLines = this.powerRulerTool?.computeSideBearingLines(glyphController);
        const updated = this.powerRulerTool?.recalcRulerFromLine(
          glyphController,
          ruler.basePoint,
          ruler.directionVector,
          extraLines,
          ruler.id === data.activeRulerId
        );
        ruler.intersections = updated.intersections;
        ruler.measurePoints = updated.measurePoints;
      }
      await this.powerRulerTool?.saveRulersToGlyph(glyphName, "edit power ruler angle");
      this.editorController.canvasController.requestUpdate();
    }
  }

  toggleRulerVisibility(rulerId, visible) {
    // For now, visibility is just a visual toggle
    // Could be implemented by filtering in draw() method
    console.log("Toggle visibility for ruler", rulerId, visible);
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
    }
  }
}

customElements.define("panel-power-rulers", PowerRulersPanel);
```

- [ ] **Step 2: Register panel in editor.js**

Find the panel definitions in `editor.js` and add:

```javascript
import PowerRulersPanel from "./panel-power-rulers.js";

// In panelDefinitions object:
"power-rulers": {
  panel: PowerRulersPanel,
  identifier: "power-rulers",
  icon: "/images/ruler.svg",
  label: "sidebar.power-rulers.title",
},
```

- [ ] **Step 3: Add sceneModel reference to PowerRulersPanel**

Add this line in the `updateRulerCoords` and `updateRulerAngle` methods:
```javascript
const sceneModel = this.editorController.sceneController.sceneModel;
```

- [ ] **Step 4: Test panel**

1. Start Fontra server
2. Open a glyph
3. Open Power Rulers panel from sidebar
4. Click "Add" button - should create a ruler
5. Edit X/Y/Angle values - ruler should update
6. Click delete - ruler should be removed
7. Reload page - rulers should persist

---

## Chunk 3: Localization

### Task 3: Add Localization Strings

**Files:**
- Modify: `src-js/fontra-core/assets/lang/en.js`
- Test: Verify panel displays correct text

- [ ] **Step 1: Add power rulers localization strings**

Add to `src-js/fontra-core/assets/lang/en.js`:

```javascript
"sidebar.power-rulers.title": "Power Rulers",
"sidebar.power-rulers.add": "Add Ruler",
"sidebar.power-rulers.empty": "No rulers yet. Double-click in the canvas to create one.",
"sidebar.power-rulers.no-glyph": "Open a glyph to manage rulers",
"sidebar.power-rulers.ruler-name": "Ruler %0",
```

- [ ] **Step 2: Test localization**

Verify all panel text displays correctly in English.

---

## Chunk 4: Testing & Polish

### Task 4: End-to-End Testing

**Files:**
- Test: Manual testing

- [ ] **Step 1: Test ruler creation**

1. Open glyph in editor
2. Double-click in canvas (not on glyph)
3. Verify ruler appears
4. Double-click again
5. Verify second ruler appears, first becomes static (dimmer line)
6. Verify both rulers show in panel

- [ ] **Step 2: Test ruler editing via panel**

1. Select a ruler in panel (click name)
2. Change X coordinate
3. Verify ruler moves in canvas
4. Change Y coordinate
5. Verify ruler moves
6. Change angle
7. Verify ruler rotates

- [ ] **Step 3: Test ruler deletion**

1. Click delete button on a ruler
2. Verify ruler disappears from canvas
3. Verify ruler removed from panel
4. Press Backspace with active ruler
5. Verify active ruler is deleted

- [ ] **Step 4: Test persistence**

1. Create multiple rulers
2. Reload page (F5)
3. Verify all rulers are still there
4. Close browser
5. Reopen Fontra
6. Verify rulers persist

- [ ] **Step 5: Test file sharing**

1. Create rulers in a glyph
2. Save/close font
3. Open font file in text editor
4. Verify rulers are in the file (in customData)
5. Copy font to different location
6. Open in Fontra
7. Verify rulers are present

- [ ] **Step 6: Test undo/redo**

1. Create a ruler
2. Press Ctrl+Z
3. Verify ruler is removed
4. Press Ctrl+Y
5. Verify ruler reappears
6. Edit ruler position
7. Undo - verify position reverts

- [ ] **Step 7: Visual polish**

1. Verify static ruler lines are dimmer (40% opacity)
2. Verify markers and labels are full opacity on all rulers
3. Verify active ruler has full opacity line
4. Check in both light and dark themes

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src-js/views-editor/src/edit-tools-power-ruler.js` | Modify | Core ruler logic, customData persistence |
| `src-js/views-editor/src/panel-power-rulers.js` | Create | Sidebar panel UI |
| `src-js/views-editor/src/editor.js` | Modify | Register panel |
| `src-js/fontra-core/assets/lang/en.js` | Modify | Localization strings |

---

## Testing Commands

```bash
# Start Fontra server
fontra --launch filesystem /path/to/test/fonts

# Run JavaScript tests (if unit tests are added)
npm test

# Run Python tests (ensure backends still work)
pytest test-py/
```

---

## Known Limitations (for future enhancement)

1. Static rulers are not draggable with pointer tool (by design for this iteration)
2. No ruler visibility toggle implementation yet (checkbox in panel is placeholder)
3. No ruler reordering in panel
4. No keyboard shortcuts for ruler management (except Backspace to delete)
