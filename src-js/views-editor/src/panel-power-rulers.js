import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { throttleCalls } from "@fontra/core/utils.js";
import Panel from "./panel.js";

export default class PowerRulersPanel extends Panel {
  identifier = "power-rulers";
  iconPath = "/tabler-icons/ruler.svg";

  static styles = `
    .panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 0.5em;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5em 1em;
      border-bottom: 1px solid var(--border-color);
    }

    .panel-title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
    }

    .add-ruler-button {
      background-color: var(--button-background-color);
      color: var(--button-foreground-color);
      border: none;
      border-radius: 0.25em;
      padding: 0.4em 0.8em;
      font-size: 0.9rem;
      cursor: pointer;
    }

    .add-ruler-button:hover {
      background-color: var(--button-hover-background-color);
    }

    .rulers-list {
      flex: 1;
      overflow: auto;
      padding: 0.5em 1em;
    }

    .ruler-item {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 0.5em;
      align-items: center;
      padding: 0.5em 0;
      border-bottom: 1px solid var(--border-color);
    }

    .ruler-item:last-child {
      border-bottom: none;
    }

    .ruler-checkbox {
      justify-self: center;
    }

    .ruler-info {
      display: flex;
      flex-direction: column;
      gap: 0.3em;
    }

    .ruler-name-input {
      background-color: var(--text-input-background-color);
      color: var(--text-input-foreground-color);
      border: 0.5px solid lightgray;
      border-radius: 0.25em;
      padding: 0.2em 0.5em;
      font-size: 0.9rem;
      width: 100%;
    }

    .ruler-coords {
      display: grid;
      grid-template-columns: auto auto auto;
      gap: 0.3em;
      align-items: center;
      font-size: 0.85rem;
    }

    .ruler-coords input {
      background-color: var(--text-input-background-color);
      color: var(--text-input-foreground-color);
      border: 0.5px solid lightgray;
      border-radius: 0.25em;
      padding: 0.2em 0.3em;
      width: 4em;
      font-size: 0.85rem;
    }

    .ruler-coords label {
      color: var(--label-color);
      font-size: 0.8rem;
    }

    .delete-ruler-button {
      background-color: transparent;
      color: var(--danger-color);
      border: 1px solid var(--danger-color);
      border-radius: 0.25em;
      padding: 0.3em 0.5em;
      font-size: 0.85rem;
      cursor: pointer;
    }

    .delete-ruler-button:hover {
      background-color: var(--danger-color);
      color: white;
    }

    .empty-message {
      color: var(--label-color);
      font-style: italic;
      padding: 1em;
      text-align: center;
    }

    .no-glyph-message {
      color: var(--label-color);
      font-style: italic;
      padding: 1em;
      text-align: center;
    }
  `;

  constructor(editorController) {
    super(editorController);
    this.throttledUpdate = throttleCalls(() => this.update(), 100);
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;
    this.powerRulerTool = this.editorController.powerRulerTool;

    this.sceneController.sceneSettingsController.addKeyListener(
      "selectedGlyphName",
      () => this.throttledUpdate()
    );

    this.sceneController.addCurrentGlyphChangeListener(() => {
      this.throttledUpdate();
    });
  }

  getContentElement() {
    return html.div(
      {
        class: "panel",
      },
      [
        html.div(
          { class: "panel-header" },
          [
            html.div(
              { class: "panel-title" },
              [translate("sidebar.power-rulers.title")]
            ),
            html.button(
              {
                class: "add-ruler-button",
                onclick: () => this.addRuler(),
              },
              [translate("sidebar.power-rulers.add")]
            ),
          ]
        ),
        html.div(
          {
            class: "rulers-list",
            id: "rulers-list",
          },
          []
        ),
      ]
    );
  }

  async update() {
    const rulersListElement = this.contentElement.querySelector("#rulers-list");
    if (!rulersListElement) {
      return;
    }

    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    if (!glyphName) {
      rulersListElement.innerHTML = `<div class="no-glyph-message">${translate(
        "sidebar.power-rulers.no-glyph"
      )}</div>`;
      return;
    }

    const rulers = this.powerRulerTool?.getAllRulers(glyphName) || [];
    const activeRulerId = this.powerRulerTool?.getActiveRulerId(glyphName);

    if (!rulers.length) {
      rulersListElement.innerHTML = `<div class="empty-message">${translate(
        "sidebar.power-rulers.empty"
      )}</div>`;
      return;
    }

    rulersListElement.innerHTML = "";
    for (const ruler of rulers) {
      const rulerElement = this.createRulerElement(ruler, ruler.id === activeRulerId);
      rulersListElement.appendChild(rulerElement);
    }
  }

  createRulerElement(ruler, isActive) {
    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    const angle = this.calculateAngle(ruler.directionVector);

    const rulerItem = html.div(
      {
        class: "ruler-item",
      },
      [
        html.input({
          type: "checkbox",
          class: "ruler-checkbox",
          checked: isActive,
          onchange: (event) => this.setActiveRuler(glyphName, ruler.id, event.target.checked),
        }),
        html.div(
          { class: "ruler-info" },
          [
            html.input({
              type: "text",
              class: "ruler-name-input",
              value: ruler.name || "",
              placeholder: translate("sidebar.power-rulers.ruler-name"),
              onchange: (event) => this.updateRulerName(glyphName, ruler.id, event.target.value),
            }),
            html.div(
              { class: "ruler-coords" },
              [
                html.div({}, [
                  html.label({}, ["X:"]),
                  html.input({
                    type: "number",
                    value: Math.round(ruler.basePoint.x),
                    onchange: (event) =>
                      this.updateRulerPosition(glyphName, ruler.id, event),
                  }),
                ]),
                html.div({}, [
                  html.label({}, ["Y:"]),
                  html.input({
                    type: "number",
                    value: Math.round(ruler.basePoint.y),
                    onchange: (event) =>
                      this.updateRulerPosition(glyphName, ruler.id, event),
                  }),
                ]),
                html.div({}, [
                  html.label({}, ["°:"]),
                  html.input({
                    type: "number",
                    value: Math.round(angle),
                    onchange: (event) =>
                      this.updateRulerAngle(glyphName, ruler.id, event),
                  }),
                ]),
              ]
            ),
          ]
        ),
        html.button(
          {
            class: "delete-ruler-button",
            onclick: () => this.deleteRuler(glyphName, ruler.id),
          },
          ["×"]
        ),
      ]
    );

    return rulerItem;
  }

  calculateAngle(directionVector) {
    // Calculate angle in degrees from direction vector
    // 0° = pointing right, 90° = pointing up
    const angleRad = Math.atan2(-directionVector.y, directionVector.x);
    let angleDeg = (angleRad * 180) / Math.PI;
    if (angleDeg < 0) {
      angleDeg += 360;
    }
    return angleDeg;
  }

  async addRuler() {
    // Create a ruler at the center of the current view
    const viewBox = this.sceneController.sceneSettings.viewBox;
    if (!viewBox) {
      return;
    }

    const centerX = (viewBox.xMin + viewBox.xMax) / 2;
    const centerY = (viewBox.yMin + viewBox.yMax) / 2;

    const basePoint = { x: centerX, y: centerY };
    const directionVector = { x: 1, y: 0 }; // Default: horizontal

    await this.powerRulerTool?.createRuler(
      this.sceneController.sceneSettings.selectedGlyphName,
      basePoint,
      directionVector
    );
  }

  setActiveRuler(glyphName, rulerId, isActive) {
    if (isActive) {
      this.powerRulerTool?.setActiveRuler(glyphName, rulerId);
    }
  }

  async updateRulerName(glyphName, rulerId, newName) {
    const ruler = this.powerRulerTool
      ?.getRulerData(glyphName)
      ?.rulers?.[rulerId];
    if (ruler) {
      ruler.name = newName;
      await this.powerRulerTool?.saveRulersToGlyph(
        glyphName,
        "edit power ruler name"
      );
    }
  }

  async updateRulerPosition(glyphName, rulerId, event) {
    const ruler = this.powerRulerTool
      ?.getRulerData(glyphName)
      ?.rulers?.[rulerId];
    if (!ruler) {
      return;
    }

    const newX = parseFloat(event.target.parentElement.parentElement.querySelector(
      'input[type="number"]:nth-of-type(1)'
    ).value);
    const newY = parseFloat(event.target.parentElement.parentElement.querySelector(
      'input[type="number"]:nth-of-type(3)'
    ).value);

    // Keep the same angle, just update position
    const basePoint = { x: newX, y: newY };
    await this.powerRulerTool?.updateRulerPosition(
      glyphName,
      rulerId,
      basePoint,
      ruler.directionVector
    );
  }

  async updateRulerAngle(glyphName, rulerId, event) {
    const ruler = this.powerRulerTool
      ?.getRulerData(glyphName)
      ?.rulers?.[rulerId];
    if (!ruler) {
      return;
    }

    const angleDeg = parseFloat(event.target.value);
    const angleRad = (angleDeg * Math.PI) / 180;
    const directionVector = {
      x: Math.cos(angleRad),
      y: -Math.sin(angleRad), // Negative because Y is inverted in canvas
    };

    await this.powerRulerTool?.updateRulerPosition(
      glyphName,
      rulerId,
      ruler.basePoint,
      directionVector
    );
  }

  async deleteRuler(glyphName, rulerId) {
    await this.powerRulerTool?.deleteRuler(glyphName, rulerId);
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
      if (focus) {
        setTimeout(() => {
          const addButton = this.contentElement.querySelector(".add-ruler-button");
          if (addButton) {
            addButton.focus();
          }
        }, 200);
      }
    }
  }
}

customElements.define("panel-power-rulers", PowerRulersPanel);
