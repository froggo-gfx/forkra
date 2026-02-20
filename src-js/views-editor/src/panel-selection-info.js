import { applicationSettingsController } from "@fontra/core/application-settings.js";
import { recordChanges } from "@fontra/core/change-recorder.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { rectFromPoints, rectSize, unionRect } from "@fontra/core/rectangle.js";
import { compute, nameCapture } from "@fontra/core/simple-compute.js";
import { getDecomposedIdentity } from "@fontra/core/transform.js";
import {
  assert,
  enumerate,
  getCharFromCodePoint,
  makeUPlusStringFromCodePoint,
  parseSelection,
  range,
  rgbaToHex,
  round,
  splitGlyphNameExtension,
  throttleCalls,
} from "@fontra/core/utils.js";
import { showMenu } from "@fontra/web-components/menu-panel.js";
import { dialog } from "@fontra/web-components/modal-dialog.js";
import { Form } from "@fontra/web-components/ui-form.js";
import { clearRepresentationCache } from "@fontra/core/representation-cache.js";
import {
  getSkeletonData,
  moveSkeletonData,
  setSkeletonData,
} from "@fontra/core/skeleton-contour-generator.js";
import LetterspacerPanel from "./panel-letterspacer.js";
import Panel from "./panel.js";
import {
  getSourceSkeletonDefaultsValue,
  setSourceSkeletonDefaultsValues,
} from "./skeleton-source-defaults.js";

const SKELETON_WIDTH_CAPITAL_BASE_KEY = "fontra.skeleton.capitalBase";
const SKELETON_WIDTH_CAPITAL_HORIZONTAL_KEY = "fontra.skeleton.capitalHorizontal";
const SKELETON_WIDTH_CAPITAL_CONTRAST_KEY = "fontra.skeleton.capitalContrast";
const SKELETON_WIDTH_CAPITAL_DISTRIBUTION_KEY = "fontra.skeleton.capitalDistribution";
const SKELETON_WIDTH_LOWERCASE_BASE_KEY = "fontra.skeleton.lowercaseBase";
const SKELETON_WIDTH_LOWERCASE_HORIZONTAL_KEY = "fontra.skeleton.lowercaseHorizontal";
const SKELETON_WIDTH_LOWERCASE_CONTRAST_KEY = "fontra.skeleton.lowercaseContrast";
const SKELETON_WIDTH_LOWERCASE_DISTRIBUTION_KEY = "fontra.skeleton.lowercaseDistribution";

const SKELETON_CAP_RADIUS_RATIO_KEY = "fontra.skeleton.capRadiusRatio";
const SKELETON_CAP_TENSION_KEY = "fontra.skeleton.capTension";
const SKELETON_CAP_ANGLE_KEY = "fontra.skeleton.capAngle";
const SKELETON_CAP_DISTANCE_KEY = "fontra.skeleton.capDistance";
const SKELETON_CUSTOM_WIDTHS_UPPERCASE_KEY = "fontra.skeleton.customWidthsUppercase";
const SKELETON_CUSTOM_WIDTHS_LOWERCASE_KEY = "fontra.skeleton.customWidthsLowercase";
const SKELETON_CUSTOM_CAP_SQUARE_KEY = "fontra.skeleton.customCapStylesSquare";
const SKELETON_CUSTOM_CAP_ROUNDED_KEY = "fontra.skeleton.customCapStylesRounded";
const SIDEBEARING_VARIABLES_KEY = "fontra.sidebearingVars";

const DEFAULT_WIDTH_CAPITAL_BASE = 60;
const DEFAULT_WIDTH_CAPITAL_HORIZONTAL = 50;
const DEFAULT_WIDTH_CAPITAL_CONTRAST = 40;
const DEFAULT_WIDTH_LOWERCASE_BASE = 60;
const DEFAULT_WIDTH_LOWERCASE_HORIZONTAL = 50;
const DEFAULT_WIDTH_LOWERCASE_CONTRAST = 40;
const DEFAULT_DISTRIBUTION = 0;

const DEFAULT_CAP_RADIUS_RATIO = 1 / 8;
const DEFAULT_CAP_TENSION = 0.55;
const DEFAULT_CAP_ANGLE = 0;
const DEFAULT_CAP_DISTANCE = 0;
const CAP_RADIUS_MIN = 1 / 128;
const CAP_RADIUS_MAX = 1 / 4;
const CAP_ANGLE_MIN = -85;
const CAP_ANGLE_MAX = 85;
const DISTRIBUTION_MIN = -100;
const DISTRIBUTION_MAX = 100;

export default class SelectionInfoPanel extends Panel {
  identifier = "selection-info";
  iconPath = "/images/info.svg";

  constructor(editorController) {
    super(editorController);
    this.throttledUpdate = throttleCalls((senderID) => this.update(senderID), 100);
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;
    this._customDeleteConfirm = { key: null };
    this.letterspacerPanel = new LetterspacerPanel(editorController);
    if (this.letterspacerHost) {
      this.letterspacerHost.appendChild(this.letterspacerPanel);
    }

    this.sceneController.sceneSettingsController.addKeyListener(
      [
        "selectedGlyphName",
        "selection",
        "fontLocationSourceMapped",
        "glyphLocation",
        "editLayerName",
      ],
      (event) => this.throttledUpdate()
    );

    this.sceneController.sceneSettingsController.addKeyListener(
      "positionedLines",
      (event) => {
        if (!this.haveInstance) {
          this.update(event.senderInfo?.senderID);
        }
      }
    );

    this.sceneController.addCurrentGlyphChangeListener((event) => {
      this.throttledUpdate(event.senderID);
    });

    this.sceneController.addEventListener("glyphEditCannotEditReadOnly", async () => {
      this.update();
    });

    this.sceneController.addEventListener("glyphEditLocationNotAtSource", async () => {
      this.update();
    });

    applicationSettingsController.addKeyListener(
      ["alwaysShowGlobalAxesInComponentLocation", "sortComponentLocationGlyphAxes"],
      (event) => this.update()
    );
  }

  getContentElement() {
    this.infoForm = new Form();
    this.letterspacerHost = html.div({});
    return html.div(
      {
        class: "panel",
      },
      [
        html.div(
          { class: "panel-section panel-section--flex panel-section--scrollable" },
          [
            html.div(
              { style: "display: flex; flex-direction: column; gap: 0.75em;" },
              [this.infoForm]
            ),
          ]
        ),
        html.div(
          { class: "panel-section panel-section--checkbox" },
          this.getBehaviorElements()
        ),
      ]
    );
  }

  async toggle(on, focus) {
    if (on) {
      // Ensure the Selection Info form is fully rebuilt before nested
      // Letterspacer panel runs its own visibility-gated update.
      await this.update();
    }
    if (this.letterspacerPanel?.toggle) {
      await this.letterspacerPanel.toggle(on, focus);
    }
  }

  getBehaviorElements() {
    const storageKey = "fontra.selection-info.absolute-value-changes";
    this.multiEditChangesAreAbsolute = localStorage.getItem(storageKey) === "true";
    return [
      html.input({
        type: "checkbox",
        id: "behavior-checkbox",
        checked: this.multiEditChangesAreAbsolute,
        onchange: (event) => {
          this.multiEditChangesAreAbsolute = event.target.checked;
          localStorage.setItem(storageKey, event.target.checked);
        },
      }),
      html.label(
        { for: "behavior-checkbox" },
        translate("sidebar.selection-info.multi-source")
      ),
    ];
  }

  _getSourceCustomDataValue(key, fallback) {
    const sourceIdentifier = this.sceneController.editingLayerNames?.[0];
    if (!sourceIdentifier) return fallback;
    const source = this.fontController.sources[sourceIdentifier];
    return getSourceSkeletonDefaultsValue(source, key, fallback);
  }

  async _setSourceCustomDataValue(key, value) {
    const sourceIdentifier = this.sceneController.editingLayerNames?.[0];
    if (!sourceIdentifier) return;

    const root = { sources: this.fontController.sources };
    const changes = recordChanges(root, (r) => {
      setSourceSkeletonDefaultsValues(r.sources[sourceIdentifier], { [key]: value });
    });

    if (changes.hasChange) {
      await this.fontController.postChange(
        changes.change,
        changes.rollbackChange,
        "Set skeleton defaults"
      );
    }
  }

  _getSourceCustomWidthList(key) {
    const list = this._getSourceCustomDataValue(key, []);
    if (!Array.isArray(list)) {
      return [];
    }
    return list
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const name = typeof item.name === "string" ? item.name : "";
        const value = Number(item.value);
        return {
          name,
          value: Number.isFinite(value) ? value : 0,
        };
      });
  }

  async _setSourceCustomWidthList(key, list) {
    const sourceIdentifier = this.sceneController.editingLayerNames?.[0];
    if (!sourceIdentifier) return;

    const sanitized = (Array.isArray(list) ? list : []).map((item) => {
      const name = typeof item?.name === "string" ? item.name : String(item?.name ?? "");
      const value = Number(item?.value);
      return { name, value: Number.isFinite(value) ? value : 0 };
    });

    const root = { sources: this.fontController.sources };
    const changes = recordChanges(root, (r) => {
      setSourceSkeletonDefaultsValues(r.sources[sourceIdentifier], { [key]: sanitized });
    });

    if (changes.hasChange) {
      await this.fontController.postChange(
        changes.change,
        changes.rollbackChange,
        "Set skeleton defaults"
      );
    }
  }

  _getSourceCustomCapSquareList() {
    const list = this._getSourceCustomDataValue(SKELETON_CUSTOM_CAP_SQUARE_KEY, []);
    if (!Array.isArray(list)) {
      return [];
    }
    return list
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const name = typeof item.name === "string" ? item.name : "";
        const angleRaw =
          Number.isFinite(Number(item.angle)) ? Number(item.angle) : Number(item.value);
        const distanceRaw =
          Number.isFinite(Number(item.distance)) ? Number(item.distance) : 0;
        return {
          name,
          angle: Number.isFinite(angleRaw) ? angleRaw : 0,
          distance: Number.isFinite(distanceRaw) ? distanceRaw : 0,
        };
      });
  }

  async _setSourceCustomCapSquareList(list) {
    const sourceIdentifier = this.sceneController.editingLayerNames?.[0];
    if (!sourceIdentifier) return;

    const sanitized = (Array.isArray(list) ? list : []).map((item) => {
      const name = typeof item?.name === "string" ? item.name : String(item?.name ?? "");
      const angle = Number(item?.angle);
      const distance = Number(item?.distance);
      return {
        name,
        angle: Number.isFinite(angle) ? angle : 0,
        distance: Number.isFinite(distance) ? distance : 0,
      };
    });

    const root = { sources: this.fontController.sources };
    const changes = recordChanges(root, (r) => {
      setSourceSkeletonDefaultsValues(r.sources[sourceIdentifier], {
        [SKELETON_CUSTOM_CAP_SQUARE_KEY]: sanitized,
      });
    });

    if (changes.hasChange) {
      await this.fontController.postChange(
        changes.change,
        changes.rollbackChange,
        "Set skeleton defaults"
      );
    }
  }

  _getSourceCustomCapRoundedList() {
    const list = this._getSourceCustomDataValue(SKELETON_CUSTOM_CAP_ROUNDED_KEY, []);
    if (!Array.isArray(list)) {
      return [];
    }
    return list
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const name = typeof item.name === "string" ? item.name : "";
        let radiusRaw =
          Number.isFinite(Number(item.radius)) ? Number(item.radius) : Number(item.value);
        if (!Number.isFinite(radiusRaw)) {
          radiusRaw = DEFAULT_CAP_RADIUS_RATIO;
        }
        let tensionRaw = Number(item.tension);
        if (!Number.isFinite(tensionRaw)) {
          tensionRaw = DEFAULT_CAP_TENSION;
        }
        if (tensionRaw > 1) {
          tensionRaw = tensionRaw / 100;
        }
        return {
          name,
          radius: Number.isFinite(radiusRaw) ? radiusRaw : DEFAULT_CAP_RADIUS_RATIO,
          tension: Number.isFinite(tensionRaw) ? tensionRaw : DEFAULT_CAP_TENSION,
        };
      });
  }

  async _setSourceCustomCapRoundedList(list) {
    const sourceIdentifier = this.sceneController.editingLayerNames?.[0];
    if (!sourceIdentifier) return;

    const sanitized = (Array.isArray(list) ? list : []).map((item) => {
      const name = typeof item?.name === "string" ? item.name : String(item?.name ?? "");
      let radius = Number(item?.radius);
      let tension = Number(item?.tension);
      if (!Number.isFinite(radius)) {
        radius = DEFAULT_CAP_RADIUS_RATIO;
      }
      if (!Number.isFinite(tension)) {
        tension = DEFAULT_CAP_TENSION;
      }
      if (tension > 1) {
        tension = tension / 100;
      }
      return { name, radius, tension };
    });

    const root = { sources: this.fontController.sources };
    const changes = recordChanges(root, (r) => {
      setSourceSkeletonDefaultsValues(r.sources[sourceIdentifier], {
        [SKELETON_CUSTOM_CAP_ROUNDED_KEY]: sanitized,
      });
    });

    if (changes.hasChange) {
      await this.fontController.postChange(
        changes.change,
        changes.rollbackChange,
        "Set skeleton defaults"
      );
    }
  }

  _makeDefaultCustomName(existingList) {
    let maxIndex = 0;
    for (const item of existingList || []) {
      const name = typeof item?.name === "string" ? item.name : "";
      const match = /^Custom\s+(\d+)$/i.exec(name);
      if (match) {
        const value = Number.parseInt(match[1], 10);
        if (Number.isFinite(value)) {
          maxIndex = Math.max(maxIndex, value);
        }
      }
    }
    const nextIndex = maxIndex > 0 ? maxIndex + 1 : (existingList?.length || 0) + 1;
    return `Custom ${nextIndex}`;
  }

  _clampNumber(value, minValue, maxValue) {
    if (!Number.isFinite(value)) return minValue;
    return Math.max(minValue, Math.min(maxValue, value));
  }

  _applyLeftMargin(layerGlyph, layerGlyphController, value, layer) {
    clearRepresentationCache(layerGlyphController);
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
    const skeletonData = getSkeletonData(layer);
    if (skeletonData) {
      const newSkeletonData = JSON.parse(JSON.stringify(skeletonData));
      moveSkeletonData(newSkeletonData, translationX, 0);
      setSkeletonData(layer, newSkeletonData);
    }
    layerGlyph.xAdvance += translationX;
  }

  _applyRightMargin(layerGlyph, layerGlyphController, value) {
    clearRepresentationCache(layerGlyphController);
    const translationX = maybeClampValue(
      value - layerGlyphController.rightMargin,
      -layerGlyph.xAdvance,
      undefined
    );
    layerGlyph.xAdvance += translationX;
  }

  _getPendingSidebearingVariables() {
    if (!this.infoForm || !this.fontController?.glyphMap) {
      return {};
    }
    const pending = {};
    if (this.infoForm.hasKey('["leftMargin"]')) {
      const expression = this.infoForm.getValue('["leftMargin"]');
      const parsed = parseSidebearingVariableRef(
        expression,
        "leftMargin",
        this.fontController.glyphMap
      );
      if (parsed) {
        pending.left = { glyph: parsed.glyph, side: parsed.side };
      }
    }
    if (this.infoForm.hasKey('["rightMargin"]')) {
      const expression = this.infoForm.getValue('["rightMargin"]');
      const parsed = parseSidebearingVariableRef(
        expression,
        "rightMargin",
        this.fontController.glyphMap
      );
      if (parsed) {
        pending.right = { glyph: parsed.glyph, side: parsed.side };
      }
    }
    return pending;
  }

  async _updateSidebearingVariables(glyphName, varGlyphController) {
    if (!glyphName || !varGlyphController) {
      return;
    }
    const { locations } = this._getEditingLocations(varGlyphController);
    const getGlyphFunc = this.fontController.getGlyph.bind(this.fontController);
    const pendingVars = this._getPendingSidebearingVariables();
    const updatesByLayer = {};
    for (const [layerName, location] of Object.entries(locations)) {
      const layer = varGlyphController.glyph.layers?.[layerName];
      const vars = { ...(layer?.customData?.[SIDEBEARING_VARIABLES_KEY] || {}) };
      if (pendingVars.left) {
        vars.left = { ...(vars.left || {}), ...pendingVars.left };
      }
      if (pendingVars.right) {
        vars.right = { ...(vars.right || {}), ...pendingVars.right };
      }
      if (!vars.left && !vars.right) continue;
      const updates = {};
      for (const sideKey of ["left", "right"]) {
        const entry = vars[sideKey];
        if (!entry?.glyph || !entry.side) {
          continue;
        }
        const metricProperty = entry.side === "left" ? "leftMargin" : "rightMargin";
        const referencedGlyph = await this.fontController.getGlyph(entry.glyph);
        if (!referencedGlyph) {
          continue;
        }
        const instanceController = await referencedGlyph.instantiateController(
          location,
          layerName,
          getGlyphFunc
        );
        const newValue = instanceController?.[metricProperty];
        if (newValue == undefined) {
          continue;
        }
        updates[sideKey] = { ...entry, value: newValue };
      }
      if (Object.keys(updates).length) {
        updatesByLayer[layerName] = updates;
      }
    }
    if (!Object.keys(updatesByLayer).length) {
      return;
    }

    const layerControllers = {};
    for (const [layerName, layerGlyph] of Object.entries(
      this.sceneController.getEditingLayerFromGlyphLayers(
        varGlyphController.glyph.layers
      )
    )) {
      const layerGlyphController = await this.fontController.getLayerGlyphController(
        glyphName,
        layerName,
        varGlyphController.getSourceIndexForLayerName(layerName)
      );
      layerControllers[layerName] = layerGlyphController;
    }

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const changes = recordChanges(glyph, (g) => {
        for (const [layerName, updates] of Object.entries(updatesByLayer)) {
          const layer = g.layers[layerName];
          if (!layer) continue;
          const layerGlyph = layer.glyph;
          const layerGlyphController = layerControllers[layerName];
          if (!layerGlyphController) continue;
          if (updates.left) {
            this._applyLeftMargin(layerGlyph, layerGlyphController, updates.left.value, layer);
          }
          if (updates.right) {
            this._applyRightMargin(layerGlyph, layerGlyphController, updates.right.value);
          }
          const customData = layer.customData || (layer.customData = {});
          const vars = { ...(customData[SIDEBEARING_VARIABLES_KEY] || {}) };
          if (updates.left) {
            vars.left = updates.left;
          }
          if (updates.right) {
            vars.right = updates.right;
          }
          customData[SIDEBEARING_VARIABLES_KEY] = vars;
        }
      });
      return {
        changes: changes,
        undoLabel: "update sidebearings",
        broadcast: true,
      };
    });

    await this.update();
  }

  async update(senderInfo) {
    const activeElement = document.activeElement;
    const isEditingField =
      activeElement &&
      this.infoForm?.contentElement &&
      this.infoForm.contentElement.contains(activeElement);
    if (
      senderInfo?.senderID === this &&
      ((senderInfo?.fieldKeyPath?.length !== 3 &&
        senderInfo?.fieldKeyPath?.[0] !== "component" &&
        senderInfo?.fieldKeyPath?.[2] !== "name") ||
        senderInfo?.fieldKeyPath?.[0] === "backgroundImage")
    ) {
      // Don't rebuild, just update the Dimensions field
      await this.updateDimensions();
      return;
    }
    if (senderInfo?.senderID === this && isEditingField) {
      // Avoid rebuilding while the user is actively editing a field.
      await this.updateDimensions();
      return;
    }
    if (!this.infoForm.contentElement.offsetParent) {
      // If the info form is not visible, do nothing
      return;
    }

    await this.fontController.ensureInitialized;

    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    const glyphController = await this.sceneController.sceneModel.getGlyphInstance(
      glyphName,
      this.sceneController.sceneSettings.editLayerName
    );
    let codePoints = this.fontController.glyphMap?.[glyphName] || [];

    const instance = glyphController?.instance;
    this.haveInstance = !!instance;

      const selectedGlyphInfo = this.sceneController.sceneModel.getSelectedGlyphInfo();
      const varGlyphController =
        await this.sceneController.sceneModel.getSelectedVariableGlyphController();
      const glyphLocked = !!varGlyphController?.glyph.customData["fontra.glyph.locked"];
      const editLayerName = this.sceneController.editingLayerNames?.[0];
      const editLayer = editLayerName
        ? varGlyphController?.glyph?.layers?.[editLayerName]
        : null;
      const sidebearingVars = editLayer?.customData?.[SIDEBEARING_VARIABLES_KEY];
      const leftSidebearingDisplay = formatSidebearingVariableDisplay(
        sidebearingVars?.left,
        "left",
        1
      );
      const rightSidebearingDisplay = formatSidebearingVariableDisplay(
        sidebearingVars?.right,
        "right",
        1
      );
      const hasSidebearingVars = !!sidebearingVars?.left || !!sidebearingVars?.right;

    if (
      selectedGlyphInfo?.isUndefined &&
      selectedGlyphInfo.character &&
      !codePoints.length
    ) {
      // Glyph does not yet exist in the font, but we can grab the unicode from
      // selectedGlyphInfo.character anyway
      codePoints = [selectedGlyphInfo.character.codePointAt(0)];
    }

    const codePointsStr = makeCodePointsString(codePoints);
    let baseCodePointsStr;
    if (glyphName && !codePoints.length) {
      const [baseGlyphName, _] = splitGlyphNameExtension(glyphName);
      baseCodePointsStr = makeCodePointsString(
        this.fontController.glyphMap?.[baseGlyphName]
      );
    }

    const kerningController = await this.fontController.getKerningController("kern");

    const formContents = [];
    if (glyphName) {
      formContents.push({
        type: "header",
        label: translate("sidebar.selection-info.title"),
        auxiliaryElement: html.createDomElement("icon-button", {
          "id": "glyphLocking",
          "style": `width: 1.3em; height: 1.3em;`,
          "src":
            glyphLocked || this.fontController.readOnly
              ? "/tabler-icons/lock.svg"
              : "/tabler-icons/lock-open-2.svg",
          "onclick": (event) => this._toggleGlyphLock(varGlyphController.glyph),
          "data-tooltip": translate(
            this.fontController.readOnly
              ? "sidebar.selection-info.glyph-locking.tooltip.read-only"
              : glyphLocked
              ? "sidebar.selection-info.glyph-locking.tooltip.unlock"
              : "sidebar.selection-info.glyph-locking.tooltip.lock"
          ),
          "data-tooltipposition": "left",
        }),
      });
      formContents.push({
        key: "glyphName",
        type: "text",
        label: translate("sidebar.selection-info.glyph-name"),
        value: glyphName,
      });
      formContents.push({
        key: "unicodes",
        type: "text",
        label: translate("sidebar.selection-info.unicode"),
        value: codePointsStr,
      });
      if (baseCodePointsStr) {
        formContents.push({
          key: "baseUnicodes",
          type: "text",
          label: translate("sidebar.selection-info.base-unicode"),
          value: baseCodePointsStr,
        });
      }

      if (instance) {
        formContents.push({
          type: "edit-number",
          key: '["xAdvance"]',
          label: translate("sidebar.selection-info.advance-width"),
          value: instance.xAdvance,
          numDigits: 1,
          evaluateExpression: async (expression) =>
            await this._evaluateMetricsExpression(
              expression,
              varGlyphController,
              "xAdvance"
            ),
          minValue: 0,
        });
        formContents.push({
          type: "edit-number-x-y",
          key: '["sidebearings"]',
          label: translate("sidebar.selection-info.sidebearings"),
            fieldX: {
              key: '["leftMargin"]',
              value: glyphController.leftMargin,
              numDigits: 1,
              disabled: glyphController.leftMargin == undefined,
              displayValue: leftSidebearingDisplay || undefined,
              sidebearingVarSide: "left",
              evaluateExpression: async (expression) =>
                await this._evaluateMetricsExpression(
                  expression,
                  varGlyphController,
                  "leftMargin"
                ),
              getValue: (layerGlyph, layerGlyphController, fieldItem) => {
                return layerGlyphController.leftMargin;
              },
              setValue: (layerGlyph, layerGlyphController, fieldItem, value, layer) => {
                this._applyLeftMargin(layerGlyph, layerGlyphController, value, layer);
              },
            },
            fieldY: {
              key: '["rightMargin"]',
              value: glyphController.rightMargin,
              numDigits: 1,
              evaluateExpression: async (expression) =>
                await this._evaluateMetricsExpression(
                  expression,
                  varGlyphController,
                  "rightMargin"
                ),
              disabled: glyphController.rightMargin == undefined,
              displayValue: rightSidebearingDisplay || undefined,
              sidebearingVarSide: "right",
              getValue: (layerGlyph, layerGlyphController, fieldItem) => {
                return layerGlyphController.rightMargin;
              },
              setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
                this._applyRightMargin(layerGlyph, layerGlyphController, value);
              },
            },
          });
          if (hasSidebearingVars) {
            const updateButton = html.createDomElement("button", {
              "class": "ui-form-sidebearing-update",
              "style":
                "padding: 0.2rem 0.6rem; font-size: 0.85em; cursor: pointer; max-width: 8rem;",
              "disabled": glyphLocked || this.fontController.readOnly ? "disabled" : undefined,
              "onclick": async (event) => {
                await this._updateSidebearingVariables(glyphName, varGlyphController);
              },
            }, ["Update"]);
            formContents.push({
              type: "single-icon",
              element: html.div({ class: "ui-form-center" }, [updateButton]),
            });
          }
        formContents.push({
          type: "edit-text-double",
          key: '["kern-l-r"]',
          label: translate("sidebar.selection-info.kern-group-l-r"),
          field1: {
            key: '["kernLeft"]',
            value: kerningController.rightPairGroupMapping[glyphName] || "",
            setValuePlain: (fieldItem, value) => {
              kerningController.editGroupSide2(glyphName, value.trim());
            },
          },
          field2: {
            key: '["kernRight"]',
            value: kerningController.leftPairGroupMapping[glyphName] || "",
            setValuePlain: (fieldItem, value) => {
              kerningController.editGroupSide1(glyphName, value.trim());
            },
          },
        });
      }
    }

    const { pointIndices, componentIndices, backgroundImageIndices } =
      this._getSelection();

    if (glyphController) {
      formContents.push(
        ...this._setupDimensionsInfo(glyphController, pointIndices, componentIndices)
      );
    }

    // Add the letterspacer panel after dimensions and before skeleton defaults
    formContents.push({
      type: "single-icon",
      element: this.letterspacerHost
    });

    for (const index of backgroundImageIndices) {
      assert(index === 0, "only a single bg image is supported");

      const backgroundImage = instance?.backgroundImage;
      if (!backgroundImage) {
        continue;
      }

      const backgroundImageKey = (...path) =>
        JSON.stringify(["backgroundImage", ...path]);

      formContents.push({ type: "divider" });
      formContents.push({
        type: "header",
        label: translate("sidebar.user-settings.glyph.background-image"),
        auxiliaryElement: html.createDomElement("icon-button", {
          "style": `width: 1.3em;`,
          "src": "/tabler-icons/refresh.svg",
          "onclick": (event) => this._resetTransformationForBackgroundImage(),
          "data-tooltip": translate(
            "sidebar.selection-info.component.reset-transformation"
          ),
          "data-tooltipposition": "left",
        }),
      });

      formContents.push({
        type: "color-picker",
        key: backgroundImageKey("color"),
        label: translate("background-image.labels.colorize"),
        continuousDelay: 150,
        allowNoColor: true,
        value: backgroundImage.color,
        parseColor: (value) => {
          const matches = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
          const channels = matches.slice(1, 4).map((ch) => parseInt(ch, 16) / 255);
          return { red: channels[0], green: channels[1], blue: channels[2] };
        },
        formatColor: (value) =>
          value ? rgbaToHex([value.red, value.green, value.blue]) : "#000000",
      });

      formContents.push({
        type: "edit-number-slider",
        key: backgroundImageKey("opacity"),
        label: translate("background-image.labels.opacity"),
        value: backgroundImage.opacity,
        minValue: 0,
        defaultValue: 1.0,
        maxValue: 1.0,
      });

      formContents.push({ type: "line-spacer" });

      addTransformationItems(
        formContents,
        backgroundImageKey,
        backgroundImage.transformation
      );
    }

      for (const index of componentIndices) {
        if (!instance) {
          break;
        }
      const component = instance.components[index];
      if (!component) {
        // Invalid selection
        continue;
      }
      const componentKey = (...path) => JSON.stringify(["components", index, ...path]);

      formContents.push({ type: "divider" });
      formContents.push({
        type: "header",
        label: translate("sidebar.selection-info.component", index),
      });
      formContents.push({
        type: "edit-text",
        key: componentKey("name"),
        label: translate("sidebar.selection-info.component.base-glyph"),
        value: component.name,
      });
      formContents.push({
        type: "header",
        label: translate("sidebar.selection-info.component.transformation"),
        auxiliaryElement: html.createDomElement("icon-button", {
          "style": `width: 1.3em;`,
          "src": "/tabler-icons/refresh.svg",
          "onclick": (event) => this._resetTransformationForComponent(index),
          "data-tooltip": translate(
            "sidebar.selection-info.component.reset-transformation"
          ),
          "data-tooltipposition": "left",
        }),
      });

      addTransformationItems(formContents, componentKey, component.transformation);

      const baseGlyph = await this.fontController.getGlyph(component.name);

          if (baseGlyph) {
            const showGlobalAxes =
              this.sceneController.applicationSettings
                .alwaysShowGlobalAxesInComponentLocation;

        const fontAxisNames = baseGlyph.continuousFontAxisNames;
        const selectedFontAxisNames = [...fontAxisNames].filter(
          (axisName) =>
            showGlobalAxes ||
            Object.values(varGlyphController.layers).some((layer) =>
              layer.glyph.components[index]?.location.hasOwnProperty(axisName)
            )
        );

        const glyphAxisNames = [...baseGlyph.glyphAxisNames];
        if (this.sceneController.applicationSettings.sortComponentLocationGlyphAxes) {
          glyphAxisNames.sort((a, b) => {
            const firstCharAIsUpper = a[0] === a[0].toUpperCase();
            const firstCharBIsUpper = b[0] === b[0].toUpperCase();
            if (firstCharAIsUpper != firstCharBIsUpper) {
              return firstCharBIsUpper ? -1 : 1;
            } else {
              return a < b ? -1 : +1;
            }
          });
        }

        const axisNames = [...selectedFontAxisNames, ...glyphAxisNames];

        const locationItems = [];

        // TODO: this needs more thinking, as the axes of *nested* components may also
        // be of interest. We would then need to be able to *add* such a value to
        // component.location. This could work somewhat similar to showing global axes.
        // Given we have no direct use case, we'll leave this for now.

        const combinedAxes = Object.fromEntries(
          baseGlyph.combinedAxes.map((axis) => [axis.name, axis])
        );

        for (const axisName of axisNames) {
          const isGlobalAxis = fontAxisNames.has(axisName);
          const axis = combinedAxes[axisName];
          const value = component.location[axis.name];
          const currentGlobalAxisLocationValue =
            this.sceneController.sceneSettingsController.model.fontLocationSourceMapped[
              axisName
            ] ?? axis.defaultValue;

          locationItems.push({
            type: "edit-number-slider",
            key: componentKey("location", axis.name),
            label: axis.name,
            value: value,
            minValue: axis.minValue,
            defaultValue: axis.defaultValue,
            maxValue: axis.maxValue,
            hasCheckBox: isGlobalAxis,
            fallbackValue: isGlobalAxis ? currentGlobalAxisLocationValue : undefined,
          });
        }

        if (locationItems.length || true) {
          formContents.push({
            type: "header",
            label: "Location",
            auxiliaryElement: html.div(
              {
                style: `width: auto; display: flex; flex-direction: row; gap: 0.15em;`,
              },
              [
                html.createDomElement("icon-button", {
                  "id": "component-axis-options-button",
                  "style": `width: 1.3em;`,
                  "src": "/tabler-icons/menu-2.svg",
                  "onclick": (event) => this.showComponentAxesOptionsMenu(event),
                  "data-tooltip": translate(
                    "sidebar.designspace-navigation.font-axes-view-options-button.tooltip"
                  ),
                  "data-tooltipposition": "left",
                }),
                html.createDomElement("icon-button", {
                  "style": `width: 1.3em;`,
                  "src": "/tabler-icons/refresh.svg",
                  "onclick": (event) => this._resetAxisValuesForComponent(index),
                  "data-tooltip": translate(
                    "sidebar.selection-info.component.reset-axis-values"
                  ),
                  "data-tooltipposition": "left",
                }),
              ]
            ),
          });
            formContents.push(...locationItems);
          }
        }
      }

    const canEditSource = !!this.sceneController.editingLayerNames?.[0];
    const setSourceValue = async (key, value) => {
      await this._setSourceCustomDataValue(key, value);
      await this.update();
    };
    const addCustomWidthRows = (customKey, keyPrefix) => {
      const list = this._getSourceCustomWidthList(customKey);
      const pendingKey = this._customDeleteConfirm?.key;
      if (pendingKey && pendingKey.startsWith(`${customKey}:`)) {
        const pendingIndex = Number.parseInt(pendingKey.split(":")[1], 10);
        if (!Number.isFinite(pendingIndex) || pendingIndex >= list.length) {
          this._customDeleteConfirm = { key: null };
        }
      }
      list.forEach((item, index) => {
        const nameKey = `${keyPrefix}-name-${index}`;
        const valueKey = `${keyPrefix}-value-${index}`;
        const rowId = `${customKey}:${index}`;
        const isConfirming = this._customDeleteConfirm?.key === rowId;
        const deleteButton = html.createDomElement("icon-button", {
          "class": "skeleton-custom-delete",
          "src": isConfirming ? "/tabler-icons/x.svg" : "/tabler-icons/trash.svg",
          "style": "width: 1.1em; height: 1.1em;",
          "data-tooltip": isConfirming ? "Confirm delete" : "Delete",
          "data-tooltipposition": "left",
          "disabled": !canEditSource,
          "onclick": async () => {
            if (!canEditSource) {
              return;
            }
            if (this._customDeleteConfirm?.key !== rowId) {
              this._customDeleteConfirm = { key: rowId };
              await this.update();
              return;
            }
            const next = this._getSourceCustomWidthList(customKey);
            if (!next[index]) return;
            next.splice(index, 1);
            this._customDeleteConfirm = { key: null };
            await this._setSourceCustomWidthList(customKey, next);
            await this.update();
          },
        });
        formContents.push({
          type: "edit-name-number",
          fieldName: {
            type: "edit-text",
            key: nameKey,
            value: item.name ?? "",
            disabled: !canEditSource,
            setValuePlain: async (_fieldItem, rawValue) => {
              this._customDeleteConfirm = { key: null };
              const next = this._getSourceCustomWidthList(customKey);
              if (!next[index]) return;
              next[index] = { ...next[index], name: String(rawValue ?? "") };
              await this._setSourceCustomWidthList(customKey, next);
              await this.update();
            },
          },
          fieldValue: {
            type: "edit-number",
            key: valueKey,
            value: Number.isFinite(item.value) ? item.value : 0,
            disabled: !canEditSource,
            setValuePlain: async (_fieldItem, rawValue) => {
              this._customDeleteConfirm = { key: null };
              const next = this._getSourceCustomWidthList(customKey);
              if (!next[index]) return;
              const numeric = Number(rawValue);
              next[index] = {
                ...next[index],
                value: Number.isFinite(numeric) ? numeric : 0,
              };
              await this._setSourceCustomWidthList(customKey, next);
              await this.update();
            },
          },
          deleteElement: deleteButton,
        });
      });

      formContents.push({
        type: "single-icon",
        element: html.div(
          { style: "display: flex; justify-content: flex-start;" },
          [
            html.button(
              {
                type: "button",
                style: "padding: 2px 6px; font-size: 11px;",
                disabled: !canEditSource,
                onclick: async () => {
                  this._customDeleteConfirm = { key: null };
                  const next = this._getSourceCustomWidthList(customKey);
                  next.push({ name: this._makeDefaultCustomName(next), value: 0 });
                  await this._setSourceCustomWidthList(customKey, next);
                  await this.update();
                },
              },
              "Add"
            ),
          ]
        ),
      });
    };

    const addCustomCapSquareRows = (keyPrefix) => {
      const list = this._getSourceCustomCapSquareList();
      const customKey = SKELETON_CUSTOM_CAP_SQUARE_KEY;
      const pendingKey = this._customDeleteConfirm?.key;
      if (pendingKey && pendingKey.startsWith(`${customKey}:`)) {
        const pendingIndex = Number.parseInt(pendingKey.split(":")[1], 10);
        if (!Number.isFinite(pendingIndex) || pendingIndex >= list.length) {
          this._customDeleteConfirm = { key: null };
        }
      }
      list.forEach((item, index) => {
        const nameKey = `${keyPrefix}-name-${index}`;
        const angleKey = `${keyPrefix}-angle-${index}`;
        const distanceKey = `${keyPrefix}-distance-${index}`;
        const rowId = `${customKey}:${index}`;
        const isConfirming = this._customDeleteConfirm?.key === rowId;
        const deleteButton = html.createDomElement("icon-button", {
          "class": "skeleton-custom-delete",
          "src": isConfirming ? "/tabler-icons/x.svg" : "/tabler-icons/trash.svg",
          "style": "width: 1.1em; height: 1.1em;",
          "data-tooltip": isConfirming ? "Confirm delete" : "Delete",
          "data-tooltipposition": "left",
          "disabled": !canEditSource,
          "onclick": async () => {
            if (!canEditSource) {
              return;
            }
            if (this._customDeleteConfirm?.key !== rowId) {
              this._customDeleteConfirm = { key: rowId };
              await this.update();
              return;
            }
            const next = this._getSourceCustomCapSquareList();
            if (!next[index]) return;
            next.splice(index, 1);
            this._customDeleteConfirm = { key: null };
            await this._setSourceCustomCapSquareList(next);
            await this.update();
          },
        });
        formContents.push({
          type: "edit-name-number-pair",
          fieldName: {
            type: "edit-text",
            key: nameKey,
            value: item.name ?? "",
            disabled: !canEditSource,
            setValuePlain: async (_fieldItem, rawValue) => {
              this._customDeleteConfirm = { key: null };
              const next = this._getSourceCustomCapSquareList();
              if (!next[index]) return;
              next[index] = { ...next[index], name: String(rawValue ?? "") };
              await this._setSourceCustomCapSquareList(next);
              await this.update();
            },
          },
          fieldValue1: {
            type: "edit-number",
            key: angleKey,
            value: Number.isFinite(item.angle) ? item.angle : 0,
            minValue: CAP_ANGLE_MIN,
            maxValue: CAP_ANGLE_MAX,
            disabled: !canEditSource,
            setValuePlain: async (_fieldItem, rawValue) => {
              this._customDeleteConfirm = { key: null };
              const next = this._getSourceCustomCapSquareList();
              if (!next[index]) return;
              const numeric = this._clampNumber(
                Number(rawValue),
                CAP_ANGLE_MIN,
                CAP_ANGLE_MAX
              );
              next[index] = { ...next[index], angle: numeric };
              await this._setSourceCustomCapSquareList(next);
              await this.update();
            },
          },
          fieldValue2: {
            type: "edit-number",
            key: distanceKey,
            value: Number.isFinite(item.distance) ? item.distance : 0,
            minValue: 0,
            disabled: !canEditSource,
            setValuePlain: async (_fieldItem, rawValue) => {
              this._customDeleteConfirm = { key: null };
              const next = this._getSourceCustomCapSquareList();
              if (!next[index]) return;
              const numeric = this._clampNumber(Number(rawValue), 0, Number.MAX_SAFE_INTEGER);
              next[index] = { ...next[index], distance: numeric };
              await this._setSourceCustomCapSquareList(next);
              await this.update();
            },
          },
          deleteElement: deleteButton,
        });
      });

      formContents.push({
        type: "single-icon",
        element: html.div(
          { style: "display: flex; justify-content: flex-start;" },
          [
            html.button(
              {
                type: "button",
                style: "padding: 2px 6px; font-size: 11px;",
                disabled: !canEditSource,
                onclick: async () => {
                  this._customDeleteConfirm = { key: null };
                  const next = this._getSourceCustomCapSquareList();
                  next.push({
                    name: this._makeDefaultCustomName(next),
                    angle: DEFAULT_CAP_ANGLE,
                    distance: DEFAULT_CAP_DISTANCE,
                  });
                  await this._setSourceCustomCapSquareList(next);
                  await this.update();
                },
              },
              "Add"
            ),
          ]
        ),
      });
    };

    const addCustomCapRoundedRows = (keyPrefix) => {
      const list = this._getSourceCustomCapRoundedList();
      const customKey = SKELETON_CUSTOM_CAP_ROUNDED_KEY;
      const pendingKey = this._customDeleteConfirm?.key;
      if (pendingKey && pendingKey.startsWith(`${customKey}:`)) {
        const pendingIndex = Number.parseInt(pendingKey.split(":")[1], 10);
        if (!Number.isFinite(pendingIndex) || pendingIndex >= list.length) {
          this._customDeleteConfirm = { key: null };
        }
      }
      list.forEach((item, index) => {
        const nameKey = `${keyPrefix}-name-${index}`;
        const radiusKey = `${keyPrefix}-radius-${index}`;
        const tensionKey = `${keyPrefix}-tension-${index}`;
        const rowId = `${customKey}:${index}`;
        const isConfirming = this._customDeleteConfirm?.key === rowId;
        const deleteButton = html.createDomElement("icon-button", {
          "class": "skeleton-custom-delete",
          "src": isConfirming ? "/tabler-icons/x.svg" : "/tabler-icons/trash.svg",
          "style": "width: 1.1em; height: 1.1em;",
          "data-tooltip": isConfirming ? "Confirm delete" : "Delete",
          "data-tooltipposition": "left",
          "disabled": !canEditSource,
          "onclick": async () => {
            if (!canEditSource) {
              return;
            }
            if (this._customDeleteConfirm?.key !== rowId) {
              this._customDeleteConfirm = { key: rowId };
              await this.update();
              return;
            }
            const next = this._getSourceCustomCapRoundedList();
            if (!next[index]) return;
            next.splice(index, 1);
            this._customDeleteConfirm = { key: null };
            await this._setSourceCustomCapRoundedList(next);
            await this.update();
          },
        });
        formContents.push({
          type: "edit-name-number-pair",
          fieldName: {
            type: "edit-text",
            key: nameKey,
            value: item.name ?? "",
            disabled: !canEditSource,
            setValuePlain: async (_fieldItem, rawValue) => {
              this._customDeleteConfirm = { key: null };
              const next = this._getSourceCustomCapRoundedList();
              if (!next[index]) return;
              next[index] = { ...next[index], name: String(rawValue ?? "") };
              await this._setSourceCustomCapRoundedList(next);
              await this.update();
            },
          },
          fieldValue1: {
            type: "edit-number",
            key: radiusKey,
            value: Number.isFinite(item.radius) ? item.radius : DEFAULT_CAP_RADIUS_RATIO,
            numDigits: 4,
            minValue: CAP_RADIUS_MIN,
            maxValue: CAP_RADIUS_MAX,
            disabled: !canEditSource,
            setValuePlain: async (_fieldItem, rawValue) => {
              this._customDeleteConfirm = { key: null };
              const next = this._getSourceCustomCapRoundedList();
              if (!next[index]) return;
              const numeric = this._clampNumber(
                Number(rawValue),
                CAP_RADIUS_MIN,
                CAP_RADIUS_MAX
              );
              next[index] = { ...next[index], radius: numeric };
              await this._setSourceCustomCapRoundedList(next);
              await this.update();
            },
          },
          fieldValue2: {
            type: "edit-number",
            key: tensionKey,
            value: Math.round((Number.isFinite(item.tension) ? item.tension : 0) * 100),
            minValue: 0,
            maxValue: 100,
            disabled: !canEditSource,
            setValuePlain: async (_fieldItem, rawValue) => {
              this._customDeleteConfirm = { key: null };
              const next = this._getSourceCustomCapRoundedList();
              if (!next[index]) return;
              const percent = this._clampNumber(Number(rawValue), 0, 100);
              next[index] = { ...next[index], tension: percent / 100 };
              await this._setSourceCustomCapRoundedList(next);
              await this.update();
            },
          },
          deleteElement: deleteButton,
        });
      });

      formContents.push({
        type: "single-icon",
        element: html.div(
          { style: "display: flex; justify-content: flex-start;" },
          [
            html.button(
              {
                type: "button",
                style: "padding: 2px 6px; font-size: 11px;",
                disabled: !canEditSource,
                onclick: async () => {
                  this._customDeleteConfirm = { key: null };
                  const next = this._getSourceCustomCapRoundedList();
                  next.push({
                    name: this._makeDefaultCustomName(next),
                    radius: DEFAULT_CAP_RADIUS_RATIO,
                    tension: DEFAULT_CAP_TENSION,
                  });
                  await this._setSourceCustomCapRoundedList(next);
                  await this.update();
                },
              },
              "Add"
            ),
          ]
        ),
      });
    };

    formContents.push({ type: "divider" });
    formContents.push({
      type: "header",
        label: "Skeleton Defaults",
      });

      formContents.push({
        type: "header",
        label: "Widths: Uppercase",
      });
      formContents.push({
        type: "edit-number",
        key: "skeletonCapitalBase",
        label: "Base",
        value: this._getSourceCustomDataValue(
          SKELETON_WIDTH_CAPITAL_BASE_KEY,
          DEFAULT_WIDTH_CAPITAL_BASE
        ),
        minValue: 1,
        disabled: !canEditSource,
        setValuePlain: async (_fieldItem, rawValue) => {
          const value = this._clampNumber(Number(rawValue), 1, Number.MAX_SAFE_INTEGER);
          await setSourceValue(SKELETON_WIDTH_CAPITAL_BASE_KEY, value);
        },
      });
      formContents.push({
        type: "edit-number",
        key: "skeletonCapitalHorizontal",
        label: "Horizontal",
        value: this._getSourceCustomDataValue(
          SKELETON_WIDTH_CAPITAL_HORIZONTAL_KEY,
          DEFAULT_WIDTH_CAPITAL_HORIZONTAL
        ),
        minValue: 1,
        disabled: !canEditSource,
        setValuePlain: async (_fieldItem, rawValue) => {
          const value = this._clampNumber(Number(rawValue), 1, Number.MAX_SAFE_INTEGER);
          await setSourceValue(SKELETON_WIDTH_CAPITAL_HORIZONTAL_KEY, value);
        },
      });
      formContents.push({
        type: "edit-number",
        key: "skeletonCapitalContrast",
        label: "Contrast",
        value: this._getSourceCustomDataValue(
          SKELETON_WIDTH_CAPITAL_CONTRAST_KEY,
          DEFAULT_WIDTH_CAPITAL_CONTRAST
        ),
        minValue: 1,
        disabled: !canEditSource,
        setValuePlain: async (_fieldItem, rawValue) => {
          const value = this._clampNumber(Number(rawValue), 1, Number.MAX_SAFE_INTEGER);
          await setSourceValue(SKELETON_WIDTH_CAPITAL_CONTRAST_KEY, value);
        },
      });
        addCustomWidthRows(
          SKELETON_CUSTOM_WIDTHS_UPPERCASE_KEY,
          "skeletonCustomUppercase"
        );

        formContents.push({
          type: "header",
          label: "Widths: Lowercase",
        });
      formContents.push({
        type: "edit-number",
        key: "skeletonLowercaseBase",
        label: "Base",
        value: this._getSourceCustomDataValue(
          SKELETON_WIDTH_LOWERCASE_BASE_KEY,
          DEFAULT_WIDTH_LOWERCASE_BASE
        ),
        minValue: 1,
        disabled: !canEditSource,
        setValuePlain: async (_fieldItem, rawValue) => {
          const value = this._clampNumber(Number(rawValue), 1, Number.MAX_SAFE_INTEGER);
          await setSourceValue(SKELETON_WIDTH_LOWERCASE_BASE_KEY, value);
        },
      });
      formContents.push({
        type: "edit-number",
        key: "skeletonLowercaseHorizontal",
        label: "Horizontal",
        value: this._getSourceCustomDataValue(
          SKELETON_WIDTH_LOWERCASE_HORIZONTAL_KEY,
          DEFAULT_WIDTH_LOWERCASE_HORIZONTAL
        ),
        minValue: 1,
        disabled: !canEditSource,
        setValuePlain: async (_fieldItem, rawValue) => {
          const value = this._clampNumber(Number(rawValue), 1, Number.MAX_SAFE_INTEGER);
          await setSourceValue(SKELETON_WIDTH_LOWERCASE_HORIZONTAL_KEY, value);
        },
      });
      formContents.push({
        type: "edit-number",
        key: "skeletonLowercaseContrast",
        label: "Contrast",
        value: this._getSourceCustomDataValue(
          SKELETON_WIDTH_LOWERCASE_CONTRAST_KEY,
          DEFAULT_WIDTH_LOWERCASE_CONTRAST
        ),
        minValue: 1,
        disabled: !canEditSource,
        setValuePlain: async (_fieldItem, rawValue) => {
          const value = this._clampNumber(Number(rawValue), 1, Number.MAX_SAFE_INTEGER);
          await setSourceValue(SKELETON_WIDTH_LOWERCASE_CONTRAST_KEY, value);
        },
      });
        addCustomWidthRows(
          SKELETON_CUSTOM_WIDTHS_LOWERCASE_KEY,
          "skeletonCustomLowercase"
        );

        formContents.push({
          type: "header",
          label: "Cap Styles: Square",
        });
        formContents.push({
          type: "cap-table-header",
          label: "",
          col1: "Angle",
          col2: "Distance",
        });
        formContents.push({
          type: "cap-table-row",
          label: "base",
          fieldValue1: {
            type: "edit-number",
            key: "skeletonCapAngle",
            value: this._getSourceCustomDataValue(
              SKELETON_CAP_ANGLE_KEY,
              DEFAULT_CAP_ANGLE
            ),
            minValue: CAP_ANGLE_MIN,
            maxValue: CAP_ANGLE_MAX,
            disabled: !canEditSource,
            setValuePlain: async (_fieldItem, rawValue) => {
              const value = this._clampNumber(
                Number(rawValue),
                CAP_ANGLE_MIN,
                CAP_ANGLE_MAX
              );
              await setSourceValue(SKELETON_CAP_ANGLE_KEY, value);
            },
          },
          fieldValue2: {
            type: "edit-number",
            key: "skeletonCapDistance",
            value: this._getSourceCustomDataValue(
              SKELETON_CAP_DISTANCE_KEY,
              DEFAULT_CAP_DISTANCE
            ),
            minValue: 0,
            disabled: !canEditSource,
            setValuePlain: async (_fieldItem, rawValue) => {
              const value = this._clampNumber(Number(rawValue), 0, Number.MAX_SAFE_INTEGER);
              await setSourceValue(SKELETON_CAP_DISTANCE_KEY, value);
            },
          },
        });
        addCustomCapSquareRows("skeletonCustomCapSquare");

          formContents.push({
            type: "header",
            label: "Cap Styles: Rounded",
          });
        formContents.push({
          type: "cap-table-header",
          label: "",
          col1: "Radius",
          col2: "Tension",
        });
        formContents.push({
          type: "cap-table-row",
          label: "base",
          fieldValue1: {
            type: "edit-number",
            key: "skeletonCapRadiusRatio",
            value: this._getSourceCustomDataValue(
              SKELETON_CAP_RADIUS_RATIO_KEY,
              DEFAULT_CAP_RADIUS_RATIO
            ),
            numDigits: 4,
            minValue: CAP_RADIUS_MIN,
            maxValue: CAP_RADIUS_MAX,
            disabled: !canEditSource,
            setValuePlain: async (_fieldItem, rawValue) => {
              const value = this._clampNumber(
                Number(rawValue),
                CAP_RADIUS_MIN,
                CAP_RADIUS_MAX
              );
              await setSourceValue(SKELETON_CAP_RADIUS_RATIO_KEY, value);
            },
          },
          fieldValue2: {
            type: "edit-number",
            key: "skeletonCapTension",
            value: Math.round(
              this._getSourceCustomDataValue(
                SKELETON_CAP_TENSION_KEY,
                DEFAULT_CAP_TENSION
              ) * 100
            ),
            minValue: 0,
            maxValue: 100,
            disabled: !canEditSource,
            setValuePlain: async (_fieldItem, rawValue) => {
              const percent = this._clampNumber(Number(rawValue), 0, 100);
              await setSourceValue(SKELETON_CAP_TENSION_KEY, percent / 100);
            },
          },
        });
        addCustomCapRoundedRows("skeletonCustomCapRounded");

    this._formFieldsByKey = {};
    for (const field of formContents) {
      if (field.fieldX) {
        this._formFieldsByKey[field.fieldX.key] = field.fieldX;
        this._formFieldsByKey[field.fieldY.key] = field.fieldY;
        continue;
      }
      if (field.fieldName && field.fieldValue) {
        this._formFieldsByKey[field.fieldName.key] = field.fieldName;
        this._formFieldsByKey[field.fieldValue.key] = field.fieldValue;
        continue;
      }
      if (field.fieldName && field.fieldValue1 && field.fieldValue2) {
        this._formFieldsByKey[field.fieldName.key] = field.fieldName;
        this._formFieldsByKey[field.fieldValue1.key] = field.fieldValue1;
        this._formFieldsByKey[field.fieldValue2.key] = field.fieldValue2;
        continue;
      }
      if (field.fieldValue1 && field.fieldValue2) {
        this._formFieldsByKey[field.fieldValue1.key] = field.fieldValue1;
        this._formFieldsByKey[field.fieldValue2.key] = field.fieldValue2;
        continue;
      }
      if (field.key) {
        this._formFieldsByKey[field.key] = field;
      }
    }

    if (!formContents.length) {
      this.infoForm.setFieldDescriptions([
        { type: "text", value: translate("selection.none") },
      ]);
    } else {
      this.infoForm.setFieldDescriptions(formContents);
      if (glyphController) {
        await this._setupSelectionInfoHandlers(glyphName);
      }
    }
  }

  showComponentAxesOptionsMenu(event) {
    const menuItems = [
      {
        title: translate("Show global axes"),
        callback: () => {
          this.sceneController.applicationSettings.alwaysShowGlobalAxesInComponentLocation =
            !this.sceneController.applicationSettings
              .alwaysShowGlobalAxesInComponentLocation;
        },
        checked:
          this.sceneController.applicationSettings
            .alwaysShowGlobalAxesInComponentLocation,
      },
      {
        title: translate("Sort glyph axes"),
        callback: () => {
          this.sceneController.applicationSettings.sortComponentLocationGlyphAxes =
            !this.sceneController.applicationSettings.sortComponentLocationGlyphAxes;
        },
        checked:
          this.sceneController.applicationSettings.sortComponentLocationGlyphAxes,
      },
    ];

    const button = this.infoForm.shadowRoot.querySelector(
      "#component-axis-options-button"
    );
    const buttonRect = button.getBoundingClientRect();
    showMenu(menuItems, { x: buttonRect.right, y: buttonRect.bottom });
  }

  async _toggleGlyphLock(varGlyph) {
    if (varGlyph.customData["fontra.glyph.locked"]) {
      const result = await dialog(
        translate("sidebar.selection-info.dialog.unlock-glyph.title", varGlyph.name),
        "",
        [
          { title: translate("dialog.cancel"), isCancelButton: true },
          { title: translate("dialog.yes"), isDefaultButton: true, resultValue: "ok" },
        ]
      );

      if (!result) {
        // User cancelled
        return;
      }
    }

    const iconElement = this.infoForm.shadowRoot.querySelectorAll("#glyphLocking")[0];
    iconElement.src = varGlyph.customData["fontra.glyph.locked"]
      ? "/tabler-icons/lock-open-2.svg"
      : "/tabler-icons/lock.svg";

    await this.sceneController.editGlyphAndRecordChanges(
      (glyph) => {
        if (glyph.customData["fontra.glyph.locked"]) {
          delete glyph.customData["fontra.glyph.locked"];
        } else {
          glyph.customData["fontra.glyph.locked"] = true;
        }
        return glyph.customData["fontra.glyph.locked"]
          ? translate("sidebar.selection-info.glyph-locking.tooltip.lock")
          : translate("sidebar.selection-info.glyph-locking.tooltip.unlock");
      },
      undefined,
      undefined,
      true // ignoreGlyphLock
    );
  }

  async _resetTransformationForComponent(componentIndex) {
    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
        glyph.layers
      );

      for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
        layerGlyph.components[componentIndex].transformation = getDecomposedIdentity();
      }
      return translate("sidebar.selection-info.component.reset-transformation");
    });
  }

  async _resetTransformationForBackgroundImage() {
    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
        glyph.layers
      );

      for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
        if (layerGlyph.backgroundImage) {
          layerGlyph.backgroundImage.transformation = getDecomposedIdentity();
        }
      }
      return translate("sidebar.selection-info.component.reset-transformation");
    });
  }

  async _resetAxisValuesForComponent(componentIndex) {
    const glyphController =
      await this.sceneController.sceneModel.getSelectedStaticGlyphController();
    const compo = glyphController.instance.components[componentIndex];
    const baseGlyph = await this.fontController.getGlyph(compo.name);
    if (!baseGlyph) {
      return;
    }

    const defaultValues = baseGlyph.combinedAxes.map((axis) => [
      axis.name,
      axis.defaultValue,
    ]);

    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
        glyph.layers
      );

      for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
        const compo = layerGlyph.components[componentIndex];
        for (const [axisName, axisValue] of defaultValues) {
          if (axisName in compo.location) {
            compo.location[axisName] = axisValue;
          }
        }
      }
      return translate("sidebar.selection-info.component.reset-axis-values");
    });
  }

  _setupDimensionsInfo(glyphController, pointIndices, componentIndices) {
    const dimensionsString = this._getDimensionsString(
      glyphController,
      pointIndices,
      componentIndices
    );
    const formContents = [];
    if (dimensionsString) {
      formContents.push({ type: "divider" });
      formContents.push({
        key: "dimensions",
        type: "text",
        label: translate("sidebar.selection-info.dimensions"),
        value: dimensionsString,
      });
    }
    return formContents;
  }

  async updateDimensions() {
    const glyphController =
      await this.sceneController.sceneModel.getSelectedStaticGlyphController();
    const { pointIndices, componentIndices } = this._getSelection();
    const dimensionsString = this._getDimensionsString(
      glyphController,
      pointIndices,
      componentIndices
    );
    if (this.infoForm.hasKey("dimensions")) {
      this.infoForm.setValue("dimensions", dimensionsString);
    }
  }

  _getSelection() {
    const { point, component, componentOrigin, componentTCenter, backgroundImage } =
      parseSelection(this.sceneController.selection);

    const componentIndices = [
      ...new Set([
        ...(component || []),
        ...(componentOrigin || []),
        ...(componentTCenter || []),
      ]),
    ].sort((a, b) => a - b);
    return {
      pointIndices: point || [],
      componentIndices,
      backgroundImageIndices: backgroundImage || [],
    };
  }

  _getDimensionsString(glyphController, pointIndices, componentIndices) {
    const selectionRects = [];
    if (pointIndices.length) {
      const instance = glyphController.instance;
      const selRect = rectFromPoints(
        pointIndices.map((i) => instance.path.getPoint(i)).filter((point) => !!point)
      );
      if (selRect) {
        selectionRects.push(selRect);
      }
    }
    for (const componentIndex of componentIndices) {
      const component = glyphController.components[componentIndex];
      if (!component || !component.controlBounds) {
        continue;
      }
      selectionRects.push(component.bounds);
    }
    if (!selectionRects.length && glyphController?.controlBounds) {
      selectionRects.push(glyphController.bounds);
    }
    if (selectionRects.length) {
      const selectionBounds = unionRect(...selectionRects);
      let { width, height } = rectSize(selectionBounds);
      width = round(width, 1);
      height = round(height, 1);
      return `↔ ${width} ↕ ${height}`;
    }
  }

  async _setupSelectionInfoHandlers(glyphName) {
    const varGlyph = await this.fontController.getGlyph(glyphName);

    this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
      if (fieldItem.setValuePlain) {
        assert(!valueStream, "unexpected valueStream");
        const result = fieldItem.setValuePlain(fieldItem, value);
        if (result && typeof result.then === "function") {
          await result;
        }
      } else {
        await this._onFieldChangeForGlyph(
          glyphName,
          varGlyph,
          fieldItem,
          value,
          valueStream
        );
      }
    };
  }

  async _onFieldChangeForGlyph(glyphName, varGlyph, fieldItem, value, valueStream) {
    const changePath = JSON.parse(fieldItem.key);
    const senderInfo = { senderID: this, fieldKeyPath: changePath };

    const getFieldValue = fieldItem.getValue || defaultGetFieldValue;
    const setFieldValue = fieldItem.setValue || defaultSetFieldValue;
    const deleteFieldValue = fieldItem.deleteValue || defaultDeleteFieldValue;

    await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const layerInfo = [];
      for (const [layerName, layerGlyph] of Object.entries(
        this.sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      )) {
        const layerGlyphController = await this.fontController.getLayerGlyphController(
          glyphName,
          layerName,
          varGlyph.getSourceIndexForLayerName(layerName)
        );
        layerInfo.push({
          layerName,
          layerGlyph,
          layerGlyphController,
          orgValue: getFieldValue(layerGlyph, layerGlyphController, fieldItem),
        });
      }

      let changes;

      if (valueStream) {
        // Continuous changes (eg. slider drag)
        for await (const value of valueStream) {
          for (const { layerGlyph, layerGlyphController, orgValue } of layerInfo) {
            if (orgValue !== undefined) {
              setFieldValue(layerGlyph, layerGlyphController, fieldItem, orgValue); // Ensure getting the correct undo change
            } else {
              deleteFieldValue(layerGlyph, layerGlyphController, fieldItem);
            }
          }
          changes = applyNewValue(
            glyph,
            layerInfo,
            value,
            fieldItem,
            this.multiEditChangesAreAbsolute
          );
          await sendIncrementalChange(changes.change, true); // true: "may drop"
        }
      } else {
        // Simple, atomic change
        changes = applyNewValue(
          glyph,
          layerInfo,
          value,
          fieldItem,
          this.multiEditChangesAreAbsolute
        );
      }

      const undoLabel =
        changePath.length == 1
          ? `${changePath.at(-1)}`
          : `${changePath.at(-2)}.${changePath.at(-1)}`;
      return {
        changes: changes,
        undoLabel: undoLabel,
        broadcast: true,
      };
    }, senderInfo);

    if (["xAdvance", "leftMargin", "rightMargin"].includes(changePath[0])) {
      this._updateGlyphMetrics(glyphName, changePath[0]);
    }
    if (fieldItem.sidebearingVarSide) {
      await this.update();
    }
  }

  async _updateGlyphMetrics(glyphName, changedKey) {
    const keyMap = {
      xAdvance: "rightMargin",
      leftMargin: "xAdvance",
      rightMargin: "xAdvance",
    };
    const glyphController = await this.sceneController.sceneModel.getGlyphInstance(
      glyphName,
      this.sceneController.sceneSettings.editLayerName
    );

    const keyToUpdata = keyMap[changedKey];
    const fieldKey = JSON.stringify([keyToUpdata]);
    this.infoForm.setValue(fieldKey, glyphController[keyToUpdata]);
  }

  async _evaluateMetricsExpression(expression, varGlyphController, metricProperty) {
    const sidebearingOpposites = {
      leftMargin: "rightMargin",
      rightMargin: "leftMargin",
    };
    const rawExpression = typeof expression === "string" ? expression : "";
    const strippedExpression = stripDisplaySuffix(rawExpression);
    let value = Number(strippedExpression);
    if (!isNaN(value)) {
      return value;
    }

    const { names, namespace } = nameCapture(
      this.fontController.glyphMap,
      (nameObject, name) =>
        nameObject[name] ||
        (sidebearingOpposites[metricProperty] &&
          name.endsWith("!") &&
          nameObject[name.slice(0, -1)])
          ? 1
          : undefined
    );

    try {
      const dummyResult = compute(strippedExpression, undefined, namespace);
    } catch (e) {
      return { error: e.message };
    }

    const { mainLayerName, locations } = this._getEditingLocations(varGlyphController);

    const layerVariables = {};
    for (const name of names) {
      const referencedGlyphName = name.endsWith("!") ? name.slice(0, -1) : name;
      const referencedGlyph = await this.fontController.getGlyph(referencedGlyphName);
      for (const [layerName, location] of Object.entries(locations)) {
        const getGlyphFunc = this.fontController.getGlyph.bind(this.fontController);
        const instanceController = await referencedGlyph.instantiateController(
          location,
          layerName,
          getGlyphFunc
        );
        if (!layerVariables[layerName]) {
          layerVariables[layerName] = {};
        }
        layerVariables[layerName][referencedGlyphName] =
          instanceController[metricProperty];
        if (name.endsWith("!") && sidebearingOpposites[metricProperty]) {
          layerVariables[layerName][referencedGlyphName + "!"] =
            instanceController[sidebearingOpposites[metricProperty]];
        }
      }
    }

    const result = {
      getValue: (layerName) => {
        try {
          return ensureFiniteNumber(
            compute(strippedExpression, undefined, layerVariables[layerName])
          );
        } catch (e) {
          console.error(e);
        }
        return 0;
      },
      value: ensureFiniteNumber(
        compute(strippedExpression, undefined, layerVariables[mainLayerName])
      ),
    };
    if (sidebearingOpposites[metricProperty]) {
      const parsed = parseSidebearingVariableRef(
        strippedExpression,
        metricProperty,
        this.fontController.glyphMap
      );
      if (parsed) {
        result.variableRef = { glyph: parsed.glyph, side: parsed.side };
        result.displayName = parsed.displayName;
      }
    }
    return result;
  }

  _getEditingLocations(varGlyphController) {
    const layerNames = new Set(this.sceneController.editingLayerNames);
    const locations = {};
    for (const [sourceIndex, source] of enumerate(varGlyphController.sources)) {
      if (layerNames.has(source.layerName) && !locations[source.layerName]) {
        locations[source.layerName] = varGlyphController.getSourceLocation(source);
      }
    }
    return { mainLayerName: this.sceneController.editingLayerNames[0], locations };
  }
}

function addTransformationItems(formContents, keyFunc, transformation) {
  formContents.push({
    type: "edit-number-x-y",
    label: translate("sidebar.selection-info.component.translate"),
    fieldX: {
      key: keyFunc("transformation", "translateX"),
      value: transformation.translateX,
    },
    fieldY: {
      key: keyFunc("transformation", "translateY"),
      value: transformation.translateY,
    },
  });

  formContents.push({
    type: "edit-angle",
    key: keyFunc("transformation", "rotation"),
    label: translate("sidebar.selection-info.component.rotation"),
    value: transformation.rotation,
  });

  formContents.push({
    type: "edit-number-x-y",
    label: translate("sidebar.selection-info.component.scale"),
    fieldX: {
      key: keyFunc("transformation", "scaleX"),
      value: transformation.scaleX,
    },
    fieldY: {
      key: keyFunc("transformation", "scaleY"),
      value: transformation.scaleY,
    },
  });

  formContents.push({
    type: "edit-number-x-y",
    label: translate("sidebar.selection-info.component.skew"),
    fieldX: {
      key: keyFunc("transformation", "skewX"),
      value: transformation.skewX,
    },
    fieldY: {
      key: keyFunc("transformation", "skewY"),
      value: transformation.skewY,
    },
  });

  formContents.push({
    type: "edit-number-x-y",
    label: translate("sidebar.selection-info.component.center"),
    fieldX: {
      key: keyFunc("transformation", "tCenterX"),
      value: transformation.tCenterX,
    },
    fieldY: {
      key: keyFunc("transformation", "tCenterY"),
      value: transformation.tCenterY,
    },
  });
}

function defaultGetFieldValue(glyph, glyphController, fieldItem) {
  const changePath = JSON.parse(fieldItem.key);
  return getNestedValue(glyph, changePath);
}

function defaultSetFieldValue(glyph, glyphController, fieldItem, value) {
  const changePath = JSON.parse(fieldItem.key);
  return setNestedValue(glyph, changePath, value);
}

function defaultDeleteFieldValue(glyph, glyphController, fieldItem) {
  const changePath = JSON.parse(fieldItem.key);
  return deleteNestedValue(glyph, changePath);
}

function getNestedValue(subject, path) {
  for (const pathElement of path) {
    if (subject === undefined) {
      throw new Error(`assert -- invalid change path: ${path}`);
    }
    subject = subject[pathElement];
  }
  return subject;
}

function setNestedValue(subject, path, value) {
  const key = path.slice(-1)[0];
  path = path.slice(0, -1);
  subject = getNestedValue(subject, path);
  subject[key] = value;
}

function deleteNestedValue(subject, path) {
  const key = path.slice(-1)[0];
  path = path.slice(0, -1);
  subject = getNestedValue(subject, path);
  delete subject[key];
}

function applyNewValue(glyph, layerInfo, value, fieldItem, absolute) {
  const setFieldValue = fieldItem.setValue || defaultSetFieldValue;
  const deleteFieldValue = fieldItem.deleteValue || defaultDeleteFieldValue;
  const sidebearingVarSide = fieldItem.sidebearingVarSide;
  const variableRef =
    value && typeof value === "object" && value.variableRef ? value.variableRef : null;
  const hasVariableRef = !!(sidebearingVarSide && variableRef);

  const primaryOrgValue = layerInfo[0].orgValue;
  const isNumber = typeof primaryOrgValue === "number";
  const delta =
    isNumber && !absolute && !value?.getValue ? value - primaryOrgValue : null;
  return recordChanges(glyph, (glyph) => {
    const layers = glyph.layers;
    for (const { layerName, layerGlyphController, orgValue } of layerInfo) {
      if (value == null) {
        deleteFieldValue(layers[layerName].glyph, layerGlyphController, fieldItem);
      } else {
        const layerValue = value?.getValue ? value.getValue(layerName) : value;

        let newValue =
          delta === null || orgValue === undefined ? layerValue : orgValue + delta;

        if (isNumber) {
          newValue = maybeClampValue(newValue, fieldItem.minValue, fieldItem.maxValue);
        }
        setFieldValue(
          layers[layerName].glyph,
          layerGlyphController,
          fieldItem,
          newValue,
          layers[layerName]
        );
      }
      if (sidebearingVarSide) {
        const layer = layers[layerName];
        if (!layer) {
          continue;
        }
        const customData = layer.customData || (layer.customData = {});
        const existingVars = customData[SIDEBEARING_VARIABLES_KEY];
        if (hasVariableRef) {
          const layerValue = value?.getValue ? value.getValue(layerName) : value;
          const vars = { ...(existingVars || {}) };
          vars[sidebearingVarSide] = {
            glyph: variableRef.glyph,
            side: variableRef.side,
            value: layerValue,
          };
          customData[SIDEBEARING_VARIABLES_KEY] = vars;
        } else if (existingVars?.[sidebearingVarSide]) {
          const vars = { ...existingVars };
          delete vars[sidebearingVarSide];
          if (!vars.left && !vars.right) {
            delete customData[SIDEBEARING_VARIABLES_KEY];
          } else {
            customData[SIDEBEARING_VARIABLES_KEY] = vars;
          }
        }
      }
    }
  });
}

function maybeClampValue(value, min, max) {
  if (min !== undefined) {
    value = Math.max(value, min);
  }
  if (max !== undefined) {
    value = Math.min(value, max);
  }
  return value;
}

function maybeRoundToString(value, digits) {
  return value == undefined
    ? ""
    : digits == undefined
      ? String(value)
      : String(round(value, digits));
}

function stripDisplaySuffix(expression) {
  if (typeof expression !== "string") return "";
  const trimmed = expression.trim();
  const match = trimmed.match(/^(.*?)(?:\s*\(\s*-?\d+(?:\.\d+)?\s*\)\s*)$/);
  return match ? match[1].trim() : trimmed;
}

function formatSidebearingVariableDisplay(entry, fieldSide, numDigits) {
  if (!entry?.glyph) return null;
  const displayName =
    entry.side && entry.side !== fieldSide ? `${entry.glyph}!` : entry.glyph;
  const valueString = Number.isFinite(entry.value)
    ? maybeRoundToString(entry.value, numDigits)
    : "";
  return valueString ? `${displayName} (${valueString})` : displayName;
}

function parseSidebearingVariableRef(expression, metricProperty, glyphMap) {
  const opposites = { leftMargin: "rightMargin", rightMargin: "leftMargin" };
  const opposite = opposites[metricProperty];
  if (!opposite || !glyphMap) {
    return null;
  }
  const stripped = stripDisplaySuffix(expression);
  const trimmed = stripped.trim();
  if (!trimmed) {
    return null;
  }
  const hasBang = trimmed.endsWith("!");
  const glyphName = hasBang ? trimmed.slice(0, -1) : trimmed;
  if (!glyphName || glyphMap[glyphName] === undefined) {
    return null;
  }
  if (trimmed !== (hasBang ? glyphName + "!" : glyphName)) {
    return null;
  }
  const metricForRef = hasBang ? opposite : metricProperty;
  return {
    glyph: glyphName,
    side: metricForRef === "leftMargin" ? "left" : "right",
    displayName: trimmed,
  };
}

function makeCodePointsString(codePoints) {
  return (codePoints || [])
    .map(
      (code) =>
        `${makeUPlusStringFromCodePoint(code)}\u00A0(${getCharFromCodePoint(code)})`
    )
    .join(" ");
}

function ensureFiniteNumber(value, fallback = 0) {
  if (isNaN(value) || Math.abs(value) === Infinity) {
    console.log(`bad expression result: ${value}, fall back to 0`);
    value = fallback;
  }
  return value;
}

customElements.define("panel-selection-info", SelectionInfoPanel);
