import * as html from "@fontra/core/html-utils.js";
import SkeletonParametersPanel from "./panel-skeleton-parameters.js";

const FLOATING_CAP_PANEL_POSITION_KEY = "fontra-floating-cap-panel-position";
const FLOATING_CAP_PANEL_MARGIN = 16;

export default class FloatingCapPanel extends SkeletonParametersPanel {
  identifier = "floating-cap";

  floatingStyles = `
    :host {
      position: absolute;
      z-index: 30;
      display: block;
      pointer-events: auto;
    }

    .panel {
      height: auto;
      min-width: 18rem;
      max-width: 20rem;
      gap: 0;
      border-radius: 0.75rem;
      overflow: hidden;
      background: var(--ui-element-background-color);
      box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
      border: 1px solid color-mix(
        in srgb,
        var(--horizontal-rule-color) 85%,
        transparent
      );
    }

    .floating-cap-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.65rem 0.9rem;
      background: color-mix(
        in srgb,
        var(--ui-element-background-color) 88%,
        var(--foreground-color) 12%
      );
      border-bottom: 1px solid var(--horizontal-rule-color);
      cursor: grab;
      user-select: none;
      -webkit-user-select: none;
      font-family: "fontra-ui-regular";
      font-size: 0.92rem;
      font-weight: 600;
    }

    .floating-cap-header:active {
      cursor: grabbing;
    }

    .floating-cap-body {
      padding: 0.85rem 0.9rem 0.95rem;
      max-height: min(28rem, calc(100vh - 10rem));
      overflow: auto;
    }

    .floating-cap-hint {
      margin: 0 0 0.75rem;
      font-size: 0.8rem;
      line-height: 1.35;
      opacity: 0.75;
    }
  `;

  constructor(editorController) {
    super(editorController);
    this._appendStyle(this.floatingStyles);
    this.classList.add("cleanable-overlay");

    this.contentElement.innerHTML = "";
    this.headerElement = html.div({ class: "floating-cap-header" }, ["Cap Properties"]);
    this.hintElement = html.div(
      { class: "floating-cap-hint" },
      ["Select an open skeleton endpoint to edit cap settings."]
    );
    this.bodyElement = html.div({ class: "floating-cap-body" }, [this.hintElement, this.infoForm]);
    this.contentElement.append(this.headerElement, this.bodyElement);

    this._position = null;
    this._positionInitialized = false;
    this._resizeObserver = null;
    this._dragState = null;

    this._boundPointerMove = (event) => this._onHeaderPointerMove(event);
    this._boundPointerUp = (event) => this._onHeaderPointerUp(event);
    this.headerElement.addEventListener("pointerdown", (event) =>
      this._onHeaderPointerDown(event)
    );
  }

  connectedCallback() {
    this._resizeObserver = new ResizeObserver(() => this._scheduleClamp());
    const container = this._getFloatingContainer();
    if (container) {
      this._resizeObserver.observe(container);
    }
    requestAnimationFrame(() => {
      this._ensureInitialPosition();
      this.update();
    });
  }

  disconnectedCallback() {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._teardownPointerDrag();
  }

  async toggle(on, focus) {}

  async update() {
    if (!this._isDraggingSlider) {
      const signature = `${this._computeStateSignature()}|floating-cap`;
      if (signature === this._lastStateSignature) {
        this._scheduleClamp();
        return;
      }
      this._lastStateSignature = signature;
    }

    const selectedData = this._getSelectedSkeletonPoints();
    const capStyleState = this._getSelectedEndpointCapStyleState(selectedData);
    const capRadiusState = this._getSelectedEndpointCapParamState(
      selectedData,
      "capRadiusRatio",
      1 / 8
    );
    const capTensionState = this._getSelectedEndpointCapParamState(
      selectedData,
      "capTension",
      0.55
    );
    const capAngleState = this._getSelectedEndpointCapParamState(
      selectedData,
      "capAngle",
      0
    );
    const capDistanceState = this._getSelectedEndpointCapParamState(
      selectedData,
      "capDistance",
      0
    );
    const capValue = capStyleState.value || "flat";
    const formContents = [];

    const capOptions = [];
    if (capStyleState.mixed) {
      capOptions.push(html.option({ value: "", selected: true, disabled: true }, "mixed"));
    }
    capOptions.push(
      html.option(
        { value: "flat", selected: !capStyleState.mixed && capValue === "flat" },
        "Flat"
      ),
      html.option(
        { value: "square", selected: !capStyleState.mixed && capValue === "square" },
        "Square"
      ),
      html.option(
        { value: "round", selected: !capStyleState.mixed && capValue === "round" },
        "Round"
      )
    );

    const capStyleSelect = html.select(
      {
        id: "floating-cap-style-select",
        disabled: !capStyleState.canEdit,
        onchange: (event) => this._onCapStyleChange(event.target.value),
      },
      capOptions
    );

    formContents.push({
      type: "header",
      label: "Cap Style",
      auxiliaryElement: capStyleSelect,
    });

    if (!capStyleState.canEdit) {
      formContents.push({
        type: "text",
        key: "capSelectionHelp",
        label: "State",
        value: "Unavailable for the current selection",
      });
    }

    if (!capStyleState.mixed && capValue === "round") {
      const capRadiusValue = capRadiusState.value ?? 1 / 8;
      const capRadiusIndex = this._capRadiusIndexFromRatio(capRadiusValue);
      const capRadiusPosition = capRadiusIndex + 1;
      const defaultCapRadiusIndex = this._capRadiusIndexFromRatio(1 / 8);
      const capTensionPercent = Math.round((capTensionState.value ?? 0.55) * 100);

      formContents.push({
        type: "edit-number-slider",
        key: "capRadiusIndex",
        label: "Cap Radius",
        value: capRadiusState.mixed ? 0 : capRadiusPosition,
        minValue: 1,
        defaultValue: defaultCapRadiusIndex + 1,
        maxValue: 20,
        step: 1,
        disabled: !capRadiusState.canEdit,
      });
      formContents.push({
        type: "edit-number-slider",
        key: "capTension",
        label: "Cap Tension (%)",
        value: capTensionState.mixed ? 0 : capTensionPercent,
        minValue: 0,
        defaultValue: 55,
        maxValue: 100,
        step: 5,
        disabled: !capTensionState.canEdit,
      });
    }

    if (!capStyleState.mixed && capValue === "square") {
      formContents.push({
        type: "edit-number-slider",
        key: "capAngle",
        label: "Cap Angle (deg)",
        value: capAngleState.mixed ? 0 : Math.round(capAngleState.value ?? 0),
        minValue: -85,
        defaultValue: 0,
        maxValue: 85,
        step: 1,
        disabled: !capAngleState.canEdit,
      });
      formContents.push({
        type: "edit-number",
        key: "capDistance",
        label: "Cap Distance",
        value: capDistanceState.mixed ? null : Math.round(capDistanceState.value ?? 0),
        minValue: 0,
        integer: true,
        disabled: !capDistanceState.canEdit,
      });
    }

    this.infoForm.setFieldDescriptions(formContents);
    this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
      if (fieldItem.key === "capRadiusIndex") {
        this.pointParameters.capProfileSelection = "";
        this.pointParameters.capProfilePrevValues = null;
        this.pointParameters.capProfilePrevPoints = null;
        if (valueStream) {
          this._isDraggingSlider = true;
          try {
            const mappedStream = this._mapValueStream(valueStream, (streamValue) => {
              const index = Math.round(streamValue) - 1;
              return this._capRadiusRatioFromIndex(index);
            });
            await this._setCapParameterForSelectionStream("capRadiusRatio", mappedStream);
          } finally {
            this._isDraggingSlider = false;
            this._blurActiveFormElement();
          }
          this.update();
          return;
        }

        const index = Math.round(value) - 1;
        const ratio = this._capRadiusRatioFromIndex(index);
        await this._onCapRadiusChange(ratio);
        return;
      }

      if (fieldItem.key === "capTension") {
        this.pointParameters.capProfileSelection = "";
        this.pointParameters.capProfilePrevValues = null;
        this.pointParameters.capProfilePrevPoints = null;
        if (valueStream) {
          this._isDraggingSlider = true;
          try {
            const mappedStream = this._mapValueStream(valueStream, (streamValue) =>
              streamValue / 100
            );
            await this._setCapParameterForSelectionStream("capTension", mappedStream);
          } finally {
            this._isDraggingSlider = false;
            this._blurActiveFormElement();
          }
          this.update();
          return;
        }

        await this._onCapTensionChange(value);
        return;
      }

      if (fieldItem.key === "capAngle") {
        this.pointParameters.capProfileSelection = "";
        this.pointParameters.capProfilePrevValues = null;
        this.pointParameters.capProfilePrevPoints = null;
        if (valueStream) {
          this._isDraggingSlider = true;
          try {
            await this._setCapParameterForSelectionStream("capAngle", valueStream);
          } finally {
            this._isDraggingSlider = false;
            this._blurActiveFormElement();
          }
          this.update();
          return;
        }

        await this._setCapParameterForSelection("capAngle", value);
        this.update();
        return;
      }

      if (fieldItem.key === "capDistance") {
        this.pointParameters.capProfileSelection = "";
        this.pointParameters.capProfilePrevValues = null;
        this.pointParameters.capProfilePrevPoints = null;
        await this._setCapParameterForSelection("capDistance", value);
        this.update();
      }
    };
    this._scheduleClamp();
  }

  _getFloatingContainer() {
    return this.parentElement || document.querySelector(".main-container");
  }

  _ensureInitialPosition() {
    if (this._positionInitialized) {
      this._scheduleClamp();
      return;
    }
    this._positionInitialized = true;
    this._position = this._loadSavedPosition();
    if (!this._position) {
      this._position = this._getDefaultPosition();
    }
    this._applyPosition();
    this._clampPosition(true);
  }

  _getDefaultPosition() {
    const container = this._getFloatingContainer();
    if (!container) {
      return { x: FLOATING_CAP_PANEL_MARGIN, y: FLOATING_CAP_PANEL_MARGIN };
    }
    const width = this.offsetWidth || 320;
    const x = Math.max(
      FLOATING_CAP_PANEL_MARGIN,
      container.clientWidth - width - FLOATING_CAP_PANEL_MARGIN
    );
    return { x, y: FLOATING_CAP_PANEL_MARGIN };
  }

  _loadSavedPosition() {
    try {
      const rawValue = localStorage.getItem(FLOATING_CAP_PANEL_POSITION_KEY);
      if (!rawValue) {
        return null;
      }
      const parsed = JSON.parse(rawValue);
      if (!Number.isFinite(parsed?.x) || !Number.isFinite(parsed?.y)) {
        return null;
      }
      return { x: parsed.x, y: parsed.y };
    } catch {
      return null;
    }
  }

  _savePosition() {
    if (!this._position) {
      return;
    }
    localStorage.setItem(
      FLOATING_CAP_PANEL_POSITION_KEY,
      JSON.stringify({
        x: Math.round(this._position.x),
        y: Math.round(this._position.y),
      })
    );
  }

  _scheduleClamp() {
    requestAnimationFrame(() => this._clampPosition(false));
  }

  _clampPosition(savePosition) {
    const container = this._getFloatingContainer();
    if (!container || !this._position) {
      return;
    }
    const maxX = Math.max(0, container.clientWidth - this.offsetWidth);
    const maxY = Math.max(0, container.clientHeight - this.offsetHeight);
    this._position = {
      x: Math.min(Math.max(0, this._position.x), maxX),
      y: Math.min(Math.max(0, this._position.y), maxY),
    };
    this._applyPosition();
    if (savePosition) {
      this._savePosition();
    }
  }

  _applyPosition() {
    if (!this._position) {
      return;
    }
    this.style.left = `${Math.round(this._position.x)}px`;
    this.style.top = `${Math.round(this._position.y)}px`;
  }

  _onHeaderPointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    const container = this._getFloatingContainer();
    if (!container) {
      return;
    }
    const hostRect = this.getBoundingClientRect();
    this._dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - hostRect.left,
      offsetY: event.clientY - hostRect.top,
    };
    this.headerElement.setPointerCapture(event.pointerId);
    this.headerElement.addEventListener("pointermove", this._boundPointerMove);
    this.headerElement.addEventListener("pointerup", this._boundPointerUp, { once: true });
    this.headerElement.addEventListener("pointercancel", this._boundPointerUp, {
      once: true,
    });
    event.preventDefault();
  }

  _onHeaderPointerMove(event) {
    if (!this._dragState || event.pointerId !== this._dragState.pointerId) {
      return;
    }
    const container = this._getFloatingContainer();
    if (!container) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    this._position = {
      x: event.clientX - containerRect.left - this._dragState.offsetX,
      y: event.clientY - containerRect.top - this._dragState.offsetY,
    };
    this._clampPosition(false);
  }

  _onHeaderPointerUp(event) {
    if (!this._dragState || event.pointerId !== this._dragState.pointerId) {
      return;
    }
    this._teardownPointerDrag();
    this._clampPosition(true);
  }

  _teardownPointerDrag() {
    this._dragState = null;
    this.headerElement.removeEventListener("pointermove", this._boundPointerMove);
    this.headerElement.removeEventListener("pointerup", this._boundPointerUp);
    this.headerElement.removeEventListener("pointercancel", this._boundPointerUp);
  }
}

customElements.define("floating-cap-panel", FloatingCapPanel);
