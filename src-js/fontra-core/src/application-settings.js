import { ObservableController } from "./observable-object.js";

export const applicationSettingsController = new ObservableController({
  clipboardFormat: "glif",
  rectSelectLiveModifierKeys: false,
  glyphSourcesSortOptions: "by-axis-value",
  alwaysShowGlobalAxesInComponentLocation: false,
  sortComponentLocationGlyphAxes: true,
  speedPunkPeakHeightUpm: 24,
  speedPunkSharpness: 1,
  speedPunkOpacity: 0.5,
});

applicationSettingsController.synchronizeWithLocalStorage(
  "fontra-application-settings-"
);
