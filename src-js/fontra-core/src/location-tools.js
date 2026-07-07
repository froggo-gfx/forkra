/*
 * Automatic location space conversion for settings objects; shared between
 * the font overview and the glyph editor
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
