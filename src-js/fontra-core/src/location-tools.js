import { translate } from "@fontra/core/localization.js";

/*
 * Automatic location space conversion for settings objects and other location logic
 * that is shared between the font overview and the glyph editor.
 */

export function setupLocationDependencies(fontController, settingsController) {
  // Set up the dependencies between fontLocationUser, fontLocationSource and
  // fontLocationSourceMapped

  const settings = settingsController.model;

  const locationDependencies = [
    [
      "fontLocationUser",
      "fontLocationSource",
      "mapUserLocationToSourceLocation",
      false,
    ],
    [
      "fontLocationSource",
      "fontLocationUser",
      "mapSourceLocationToUserLocation",
      false,
    ],
    [
      "fontLocationSource",
      "fontLocationSourceMapped",
      "mapSourceLocationToMappedSourceLocation",
      true,
    ],
    [
      "fontLocationSourceMapped",
      "fontLocationSource",
      "mapMappedSourceLocationToSourceLocation",
      true,
    ],
  ];

  for (const [
    sourceKey,
    destinationKey,
    mapMethodName,
    maySkip,
  ] of locationDependencies) {
    const mapMethod = fontController[mapMethodName].bind(fontController);

    settingsController.addKeyListener(
      sourceKey,
      (event) => {
        if (event.senderInfo?.senderStack?.includes(destinationKey)) {
          return;
        }

        const mapFunc =
          maySkip && settings.fontAxesSkipMapping ? (loc) => loc : mapMethod;

        settingsController.setItem(destinationKey, mapFunc(event.newValue), {
          senderStack: (event.senderInfo?.senderStack || []).concat([
            sourceKey,
            destinationKey,
          ]),
        });
      },
      true
    );
  }

  // Trigger recalculating the mapped location
  settingsController.addKeyListener("fontAxesSkipMapping", (event) => {
    settings.fontLocationSource = {
      ...settings.fontLocationSource,
    };
  });

  fontController.addChangeListener({ axes: null }, (change, isExternalChange) => {
    // the CrossAxisMapping may have changed, force to re-sync the location
    settings.fontLocationSource = {
      ...settings.fontLocationSource,
    };
  });
}

export function filterLocation(location, axes) {
  const filteredLocation = {};

  for (const axis of axes) {
    const value = location[axis.name];
    if (value !== undefined) {
      filteredLocation[axis.name] = value;
    }
  }

  return filteredLocation;
}

export const ShowLocationSettings = Object.freeze({
  DontShowEffectiveLocation: 0,
  ShowEffectiveLocation: 1,
  OnlyShowEffectiveLocation: 2,
});

export function getAxisOptionsMenuItems(settings, forHiddenAxes) {
  const effectiveLocationKey = forHiddenAxes
    ? "hiddenFontAxesShowEffectiveLocation"
    : "fontAxesShowEffectiveLocation";
  const menuItems = [
    {
      title: translate(
        "sidebar.designspace-navigation.font-axes-view-options-menu.apply-single-axis-mapping"
      ),
      callback: () => {
        settings.fontAxesUseSourceCoordinates = !settings.fontAxesUseSourceCoordinates;
      },
      checked: !settings.fontAxesUseSourceCoordinates,
    },
    {
      title: translate(
        "sidebar.designspace-navigation.font-axes-view-options-menu.apply-cross-axis-mapping"
      ),
      callback: () => {
        settings.fontAxesSkipMapping = !settings.fontAxesSkipMapping;
      },
      checked: !settings.fontAxesSkipMapping,
    },
    { title: "-" },
    {
      title: translate(
        "sidebar.designspace-navigation.font-axes-view-options-menu.show-effective-location"
      ),
      callback: () => {
        settings[effectiveLocationKey] =
          settings[effectiveLocationKey] == ShowLocationSettings.ShowEffectiveLocation
            ? ShowLocationSettings.DontShowEffectiveLocation
            : ShowLocationSettings.ShowEffectiveLocation;
      },
      checked:
        settings[effectiveLocationKey] == ShowLocationSettings.ShowEffectiveLocation,
    },
  ];

  if (forHiddenAxes) {
    menuItems.push({
      title: translate(
        "sidebar.designspace-navigation.font-axes-view-options-menu.show-only-effective-location"
      ),
      callback: () => {
        settings[effectiveLocationKey] =
          settings[effectiveLocationKey] ==
          ShowLocationSettings.OnlyShowEffectiveLocation
            ? ShowLocationSettings.DontShowEffectiveLocation
            : ShowLocationSettings.OnlyShowEffectiveLocation;
      },
      checked:
        settings[effectiveLocationKey] ==
        ShowLocationSettings.OnlyShowEffectiveLocation,
    });
  }

  return menuItems;
}
