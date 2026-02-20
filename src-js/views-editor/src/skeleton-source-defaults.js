import { getFontraInternalSection, setFontraInternalSection } from "@fontra/core/fontra-internal-data.js";
import { FONTRA_INTERNAL_SECTIONS } from "@fontra/core/fontra-internal-schema.js";

const KEY_PATHS = new Map([
  ["fontra.skeleton.capitalBase", ["widthDefaults", "uppercase", "base"]],
  ["fontra.skeleton.capitalHorizontal", ["widthDefaults", "uppercase", "horizontal"]],
  ["fontra.skeleton.capitalContrast", ["widthDefaults", "uppercase", "contrast"]],
  ["fontra.skeleton.capitalDistribution", ["widthDefaults", "uppercase", "distribution"]],
  ["fontra.skeleton.lowercaseBase", ["widthDefaults", "lowercase", "base"]],
  ["fontra.skeleton.lowercaseHorizontal", ["widthDefaults", "lowercase", "horizontal"]],
  ["fontra.skeleton.lowercaseContrast", ["widthDefaults", "lowercase", "contrast"]],
  ["fontra.skeleton.lowercaseDistribution", ["widthDefaults", "lowercase", "distribution"]],
  ["fontra.skeleton.capRadiusRatio", ["capDefaults", "round", "radiusRatio"]],
  ["fontra.skeleton.capTension", ["capDefaults", "round", "tension"]],
  ["fontra.skeleton.capAngle", ["capDefaults", "square", "angle"]],
  ["fontra.skeleton.capDistance", ["capDefaults", "square", "distance"]],
  ["fontra.skeleton.customWidthsUppercase", ["widthProfiles", "uppercase"]],
  ["fontra.skeleton.customWidthsLowercase", ["widthProfiles", "lowercase"]],
  ["fontra.skeleton.customCapStylesSquare", ["capProfiles", "square"]],
  ["fontra.skeleton.customCapStylesRounded", ["capProfiles", "round"]],
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

function normalizeSkeletonDefaults(rawDefaults) {
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
  const defaults = normalizeSkeletonDefaults(
    getFontraInternalSection(source, FONTRA_INTERNAL_SECTIONS.SKELETON_DEFAULTS)
  );
  const value = getByPath(defaults, path);
  return value === undefined ? fallback : value;
}

export function setSourceSkeletonDefaultsValues(source, values) {
  if (!source || !values || typeof values !== "object") {
    return false;
  }
  const defaults = normalizeSkeletonDefaults(
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
  setFontraInternalSection(source, FONTRA_INTERNAL_SECTIONS.SKELETON_DEFAULTS, defaults);
  return true;
}
