import { groupByKeys, groupByProperties } from "@fontra/core/glyph-organizer.js";
import {
  CheckboxGroup,
  getGlyphSetsUIControllers,
  glyphSetsUIStyles,
} from "@fontra/core/glyphsets-ui.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import {
  filterLocation,
  getAxisOptionsMenuItems,
} from "@fontra/core/location-tools.js";
import { ObservableController } from "@fontra/core/observable-object.ts";
import { difference, symmetricDifference, union } from "@fontra/core/set-ops.js";
import { popupSelect } from "@fontra/core/ui-utils.js";
import { scheduleCalls, sleepAsync } from "@fontra/core/utils.ts";
import { DesignspaceLocation } from "@fontra/web-components/designspace-location.js";
import { GlyphSearchField } from "@fontra/web-components/glyph-search-field.js";
import { showMenu } from "@fontra/web-components/menu-panel.js";
import {
  Accordion,
  groupAccordionHeaderButtons,
  makeAccordionHeaderButton,
} from "@fontra/web-components/ui-accordion.js";

export class FontOverviewNavigation extends HTMLElement {
  constructor(fontOverviewController) {
    super();

    this.fontController = fontOverviewController.fontController;
    this.fontOverviewSettingsController =
      fontOverviewController.fontOverviewSettingsController;
    this.fontOverviewSettings = this.fontOverviewSettingsController.model;

    this.projectIdentifier = fontOverviewController.projectIdentifier;

    this._setupUI();
  }

  async _setupUI() {
    this.appendChild(
      new GlyphSearchField({
        settingsController: this.fontOverviewSettingsController,
        searchStringKey: "searchString",
      })
    );

    this.groupByCheckboxGroup = new CheckboxGroup(
      this.fontOverviewSettingsController,
      "groupByKeys"
    );

    [this.projectGlyphSets, this.myGlyphSets] = getGlyphSetsUIControllers(
      this.fontOverviewSettingsController,
      "panel-navigation-accordion"
    );

    const accordion = new Accordion();
    this.accordion = accordion;

    accordion.id = "panel-navigation-accordion";

    accordion.appendStyle(
      `
      #font-source-location-container {
        display: grid;
        gap: 0.5em;
      }
    ` + glyphSetsUIStyles
    );

    accordion.onItemOpenClose = (item, openClose) => {
      const setOp = openClose ? difference : union;
      this.fontOverviewSettingsController.setItem(
        "closedNavigationSections",
        setOp(this.fontOverviewSettings.closedNavigationSections, [item.id]),
        { sentFromUserClick: true }
      );
    };

    this.fontOverviewSettingsController.addKeyListener(
      "closedNavigationSections",
      (event) => {
        if (!event.senderInfo?.sentFromUserClick) {
          const diff = symmetricDifference(event.newValue, event.oldValue);
          for (const id of diff) {
            const item = accordion.items.find((item) => item.id == id);
            accordion.openCloseAccordionItem(item, !event.newValue.has(id));
          }
        }
      }
    );

    const accordionItems = [
      {
        label: "Source",
        id: "location",
        content: html.div({ id: "font-source-location-container" }, [
          await this._makeFontSourcePopup(),
        ]),
      },
      {
        label: "Axes",
        id: "font-axes",
        content: html.div({ id: "font-axes-container" }, [
          this._makeFontSourceSliders(false),
        ]),
        auxiliaryHeaderElement: groupAccordionHeaderButtons([
          makeAccordionHeaderButton({
            icon: "menu-2",
            id: "font-axes-view-options-button",
            tooltip: translate(
              "sidebar.designspace-navigation.font-axes-view-options-button.tooltip"
            ),
            onclick: (event) => this.showFontAxesViewOptionsMenu(event, false),
          }),
          makeAccordionHeaderButton({
            icon: "tool",
            tooltip: translate("sidebar.designspace-navigation.font-axes.edit"),
            onclick: (event) => {
              const url = new URL(window.location);
              url.pathname = url.pathname.replace(
                "/fontoverview.html",
                "/fontinfo.html"
              );
              url.hash = "#axes-panel";
              window.open(url.toString(), `fontra.fontinfo.${this.projectIdentifier}`);
            },
          }),
          makeAccordionHeaderButton({
            icon: "refresh",
            id: "reset-font-axes-button",
            tooltip: translate("sidebar.designspace-navigation.font-axes.reset"),
            onclick: (event) => this.resetFontAxesToDefault(),
          }),
        ]),
      },
      {
        label: "Hidden Axes",
        id: "hidden-font-axes",
        open: false,
        content: html.div({ id: "hidden-font-axes-container" }, [
          this._makeFontSourceSliders(true),
        ]),
        auxiliaryHeaderElement: groupAccordionHeaderButtons([
          makeAccordionHeaderButton({
            icon: "menu-2",
            id: "hidden-font-axes-view-options-button",
            tooltip: translate(
              "sidebar.designspace-navigation.font-axes-view-options-button.tooltip"
            ),
            onclick: (event) => this.showFontAxesViewOptionsMenu(event, true),
          }),
          makeAccordionHeaderButton({
            icon: "tool",
            tooltip: translate("sidebar.designspace-navigation.font-axes.edit"),
            onclick: (event) => {
              const url = new URL(window.location);
              url.pathname = url.pathname.replace(
                "/fontoverview.html",
                "/fontinfo.html"
              );
              url.hash = "#axes-panel";
              window.open(url.toString(), `fontra.fontinfo.${this.projectIdentifier}`);
            },
          }),
          makeAccordionHeaderButton({
            icon: "refresh",
            id: "reset-hidden-font-axes-button",
            tooltip: translate("sidebar.designspace-navigation.font-axes.reset"),
            onclick: (event) => this.resetHiddenFontAxesToDefault(),
          }),
        ]),
      },
      {
        label: "Group by", // TODO: translate
        id: "group-by",
        content: this.groupByCheckboxGroup.makeCheckboxUI(groupByProperties),
      },
      this.projectGlyphSets.accordionItem,
      this.myGlyphSets.accordionItem,
    ];

    accordionItems.forEach(
      (item) =>
        (item.open = !this.fontOverviewSettings.closedNavigationSections.has(item.id))
    );

    accordion.items = accordionItems;

    this.appendChild(
      html.div({ class: "font-overview-navigation-section" }, [accordion])
    );

    await sleepAsync(0);
    this._updateHiddenAxisSectionVisibility();
  }

  async _makeFontSourcePopup() {
    const fontSources = await this.fontController.getSources();
    const popupItems = [];

    const selectedSourceIdentifier = () =>
      this.fontController.fontSourcesInstancer.getSourceIdentifierForLocation(
        this.fontOverviewSettings.fontLocationSource
      );

    const updatePopupItems = () => {
      popupItems.splice(
        0,
        popupItems.length,
        ...this.fontController
          .getSortedSourceIdentifiers()
          .map((fontSourceIdentifier) => ({
            value: fontSourceIdentifier,
            label: fontSources[fontSourceIdentifier].name,
          }))
      );
    };

    updatePopupItems();

    const controller = new ObservableController({
      value: selectedSourceIdentifier(),
    });

    this.fontOverviewSettingsController.addKeyListener(
      "fontLocationSource",
      (event) => {
        if (!event.senderInfo?.sentFromInput) {
          controller.setItem("value", selectedSourceIdentifier(), {
            sentFromSourceLocationListener: true,
          });
        }
      }
    );

    controller.addKeyListener("value", (event) => {
      const fontSourceIdentifier = event.newValue;
      const sourceLocation = fontSources[fontSourceIdentifier]?.location;
      if (sourceLocation && !event.senderInfo?.sentFromSourceLocationListener) {
        this.fontOverviewSettingsController.setItem(
          "fontLocationSource",
          { ...sourceLocation },
          { sentFromInput: true }
        );
      }
    });

    this.fontController.addChangeListener(
      { sources: null },
      (change, isExternalChange) => {
        updatePopupItems();
        // Trigger *label* refresh. The *value* may not have changed, so we'll
        // briefly set it to null to ensure the listeners get triggered
        controller.model.value = null;
        controller.model.value = selectedSourceIdentifier();
      }
    );

    return popupSelect(controller, "value", popupItems);
  }

  _makeFontSourceSliders(forHiddenAxes = false) {
    const filteredAxes = () => {
      return this.fontController.axes.axes.filter(
        (axis) => !!axis.hidden === forHiddenAxes
      );
    };

    const locationElement = new DesignspaceLocation();

    let axes = filteredAxes();

    const locationKey = "fontLocationUser";

    locationElement.axes = axes;
    locationElement.values = filterLocation(
      this.fontOverviewSettings[locationKey],
      axes
    );

    this.fontOverviewSettingsController.addKeyListener(locationKey, (event) => {
      if (!event.senderInfo?.sentFromSliders) {
        locationElement.values = filterLocation(event.newValue, axes);
      }
    });

    locationElement.addEventListener(
      "locationChanged",
      scheduleCalls((event) => {
        this.fontOverviewSettingsController.setItem(
          locationKey,
          { ...this.fontOverviewSettings[locationKey], ...locationElement.values },
          { sentFromSliders: true }
        );
      })
    );

    this.fontController.addChangeListener(
      { axes: null },
      (change, isExternalChange) => {
        axes = filteredAxes();
        locationElement.axes = axes;
        locationElement.values = filterLocation(
          this.fontOverviewSettings[locationKey],
          axes
        );

        this._updateHiddenAxisSectionVisibility();
      }
    );

    return locationElement;
  }

  _updateHiddenAxisSectionVisibility() {
    const hiddenAxesAccordionItem = this.accordion.querySelector("#hidden-font-axes");
    hiddenAxesAccordionItem.hidden = !this.fontController.axes.axes.some(
      (axis) => axis.hidden
    );
  }

  showFontAxesViewOptionsMenu(event, forHiddenAxes) {
    const button = this.accordion.querySelector(
      forHiddenAxes
        ? "#hidden-font-axes-view-options-button"
        : "#font-axes-view-options-button"
    );
    const buttonRect = button.getBoundingClientRect();

    const menuItems = getAxisOptionsMenuItems(this.fontOverviewSettings, forHiddenAxes);

    showMenu(menuItems, { x: buttonRect.left, y: buttonRect.bottom });
  }

  resetFontAxesToDefault(event) {
    this.fontOverviewSettings.fontLocationUser = filterLocation(
      this.fontOverviewSettings.fontLocationUser,
      this.fontController.axes.axes.filter((axis) => axis.hidden)
    );
  }

  resetHiddenFontAxesToDefault(event) {
    this.fontOverviewSettings.fontLocationUser = filterLocation(
      this.fontOverviewSettings.fontLocationUser,
      this.fontController.axes.axes.filter((axis) => !axis.hidden)
    );
  }
}

customElements.define("font-overview-navigation", FontOverviewNavigation);
