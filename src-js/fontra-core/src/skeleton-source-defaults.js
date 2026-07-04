import {
  getFontraInternalSection,
  setFontraInternalSection,
} from "./fontra-internal-data.js";
import { FONTRA_INTERNAL_SECTIONS } from "./fontra-internal-schema.js";
import { getGlyphInfoFromGlyphName } from "./glyph-data.js";
import { splitGlyphNameExtension } from "./utils.ts";

export const SKELETON_SOURCE_DEFAULT_KEYS = Object.freeze({
  WIDTH_CAPITAL_BASE: "widthCapitalBase",
  WIDTH_CAPITAL_HORIZONTAL: "widthCapitalHorizontal",
  WIDTH_CAPITAL_CONTRAST: "widthCapitalContrast",
  WIDTH_CAPITAL_DISTRIBUTION: "widthCapitalDistribution",
  WIDTH_LOWERCASE_BASE: "widthLowercaseBase",
  WIDTH_LOWERCASE_HORIZONTAL: "widthLowercaseHorizontal",
  WIDTH_LOWERCASE_CONTRAST: "widthLowercaseContrast",
  WIDTH_LOWERCASE_DISTRIBUTION: "widthLowercaseDistribution",
  CAP_RADIUS_RATIO: "capRadiusRatio",
  CAP_TENSION: "capTension",
  CAP_ANGLE: "capAngle",
  CAP_DISTANCE: "capDistance",
  CUSTOM_WIDTHS_UPPERCASE: "customWidthsUppercase",
  CUSTOM_WIDTHS_LOWERCASE: "customWidthsLowercase",
  CUSTOM_CAP_SQUARE: "customCapSquare",
  CUSTOM_CAP_ROUNDED: "customCapRounded",
});

export const SKELETON_SOURCE_DEFAULT_FALLBACKS = Object.freeze({
  [SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_CAPITAL_BASE]: 60,
  [SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_CAPITAL_HORIZONTAL]: 50,
  [SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_CAPITAL_CONTRAST]: 40,
  [SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_CAPITAL_DISTRIBUTION]: 0,
  [SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_LOWERCASE_BASE]: 60,
  [SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_LOWERCASE_HORIZONTAL]: 50,
  [SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_LOWERCASE_CONTRAST]: 40,
  [SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_LOWERCASE_DISTRIBUTION]: 0,
  [SKELETON_SOURCE_DEFAULT_KEYS.CAP_RADIUS_RATIO]: 1 / 8,
  [SKELETON_SOURCE_DEFAULT_KEYS.CAP_TENSION]: 0.55,
  [SKELETON_SOURCE_DEFAULT_KEYS.CAP_ANGLE]: 0,
  [SKELETON_SOURCE_DEFAULT_KEYS.CAP_DISTANCE]: 0,
  [SKELETON_SOURCE_DEFAULT_KEYS.CUSTOM_WIDTHS_UPPERCASE]: [],
  [SKELETON_SOURCE_DEFAULT_KEYS.CUSTOM_WIDTHS_LOWERCASE]: [],
  [SKELETON_SOURCE_DEFAULT_KEYS.CUSTOM_CAP_SQUARE]: [],
  [SKELETON_SOURCE_DEFAULT_KEYS.CUSTOM_CAP_ROUNDED]: [],
});

const KEY_PATHS = new Map([
  [
    SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_CAPITAL_BASE,
    ["widthDefaults", "uppercase", "base"],
  ],
  [
    SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_CAPITAL_HORIZONTAL,
    ["widthDefaults", "uppercase", "horizontal"],
  ],
  [
    SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_CAPITAL_CONTRAST,
    ["widthDefaults", "uppercase", "contrast"],
  ],
  [
    SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_CAPITAL_DISTRIBUTION,
    ["widthDefaults", "uppercase", "distribution"],
  ],
  [
    SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_LOWERCASE_BASE,
    ["widthDefaults", "lowercase", "base"],
  ],
  [
    SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_LOWERCASE_HORIZONTAL,
    ["widthDefaults", "lowercase", "horizontal"],
  ],
  [
    SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_LOWERCASE_CONTRAST,
    ["widthDefaults", "lowercase", "contrast"],
  ],
  [
    SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_LOWERCASE_DISTRIBUTION,
    ["widthDefaults", "lowercase", "distribution"],
  ],
  [
    SKELETON_SOURCE_DEFAULT_KEYS.CAP_RADIUS_RATIO,
    ["capDefaults", "round", "radiusRatio"],
  ],
  [SKELETON_SOURCE_DEFAULT_KEYS.CAP_TENSION, ["capDefaults", "round", "tension"]],
  [SKELETON_SOURCE_DEFAULT_KEYS.CAP_ANGLE, ["capDefaults", "square", "angle"]],
  [SKELETON_SOURCE_DEFAULT_KEYS.CAP_DISTANCE, ["capDefaults", "square", "distance"]],
  [
    SKELETON_SOURCE_DEFAULT_KEYS.CUSTOM_WIDTHS_UPPERCASE,
    ["widthProfiles", "uppercase"],
  ],
  [
    SKELETON_SOURCE_DEFAULT_KEYS.CUSTOM_WIDTHS_LOWERCASE,
    ["widthProfiles", "lowercase"],
  ],
  [SKELETON_SOURCE_DEFAULT_KEYS.CUSTOM_CAP_SQUARE, ["capProfiles", "square"]],
  [SKELETON_SOURCE_DEFAULT_KEYS.CUSTOM_CAP_ROUNDED, ["capProfiles", "round"]],
]);

function cloneValue(value) {
  if (value === undefined || value === null || typeof value !== "object") {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function ensureObject(parent, key) {
  if (!parent[key] || typeof parent[key] !== "object" || Array.isArray(parent[key])) {
    parent[key] = {};
  }
  return parent[key];
}

function ensureArray(parent, key) {
  if (!Array.isArray(parent[key])) {
    parent[key] = [];
  }
  return parent[key];
}

export function normalizeSkeletonSourceDefaults(rawDefaults) {
  const defaults = cloneValue(rawDefaults) || {};
  const widthDefaults = ensureObject(defaults, "widthDefaults");
  ensureObject(widthDefaults, "uppercase");
  ensureObject(widthDefaults, "lowercase");
  const capDefaults = ensureObject(defaults, "capDefaults");
  ensureObject(capDefaults, "square");
  ensureObject(capDefaults, "round");
  const widthProfiles = ensureObject(defaults, "widthProfiles");
  ensureArray(widthProfiles, "uppercase");
  ensureArray(widthProfiles, "lowercase");
  const capProfiles = ensureObject(defaults, "capProfiles");
  ensureArray(capProfiles, "square");
  ensureArray(capProfiles, "round");
  return defaults;
}

function getByPath(root, path) {
  let current = root;
  for (const segment of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function setByPath(root, path, value) {
  const lastIndex = path.length - 1;
  let current = root;
  for (let i = 0; i < lastIndex; i++) {
    current = ensureObject(current, path[i]);
  }
  current[path[lastIndex]] = cloneValue(value);
}

export function getSourceSkeletonDefaultsValue(source, key, fallback) {
  const path = KEY_PATHS.get(key);
  if (!path) {
    return fallback;
  }
  const defaults = normalizeSkeletonSourceDefaults(
    getFontraInternalSection(source, FONTRA_INTERNAL_SECTIONS.SKELETON_DEFAULTS)
  );
  const value = getByPath(defaults, path);
  return value === undefined ? fallback : value;
}

export function setSourceSkeletonDefaultsValues(source, values) {
  if (!source || !values || typeof values !== "object") {
    return false;
  }
  const defaults = normalizeSkeletonSourceDefaults(
    getFontraInternalSection(source, FONTRA_INTERNAL_SECTIONS.SKELETON_DEFAULTS)
  );
  let hasKnownKeys = false;
  for (const [key, value] of Object.entries(values)) {
    const path = KEY_PATHS.get(key);
    if (!path) {
      continue;
    }
    setByPath(defaults, path, value);
    hasKnownKeys = true;
  }
  if (!hasKnownKeys) {
    return false;
  }
  setFontraInternalSection(
    source,
    FONTRA_INTERNAL_SECTIONS.SKELETON_DEFAULTS,
    defaults
  );
  return true;
}

/**
 * Determine whether a glyph name is lowercase or uppercase, resolving through
 * the base glyph name (suffixes such as ".alt" are stripped).
 * @param {string} glyphName
 * @returns {"lowercase" | "uppercase"}
 */
export function getSkeletonGlyphCase(glyphName) {
  if (!glyphName) {
    return "uppercase";
  }
  let info = getGlyphInfoFromGlyphName(glyphName);
  if (!info) {
    const [baseGlyphName] = splitGlyphNameExtension(glyphName);
    if (baseGlyphName && baseGlyphName !== glyphName) {
      info = getGlyphInfoFromGlyphName(baseGlyphName);
    }
  }
  return info?.case === "lower" ? "lowercase" : "uppercase";
}

/**
 * Get the source-default base-width key for a glyph name's case.
 * @param {string} glyphName
 * @returns {string} one of SKELETON_SOURCE_DEFAULT_KEYS
 */
export function getDefaultSkeletonWidthKeyForGlyphName(glyphName) {
  return getSkeletonGlyphCase(glyphName) === "lowercase"
    ? SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_LOWERCASE_BASE
    : SKELETON_SOURCE_DEFAULT_KEYS.WIDTH_CAPITAL_BASE;
}
