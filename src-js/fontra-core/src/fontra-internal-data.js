import { deepCopyObject } from "./utils.js";
import {
  FONTRA_INTERNAL_KEY,
  FONTRA_INTERNAL_SCHEMA_VERSION,
} from "./fontra-internal-schema.js";

export function getFontraInternal(entity) {
  return entity?.customData?.[FONTRA_INTERNAL_KEY] || null;
}

export function ensureFontraInternal(entity) {
  entity.customData ||= {};
  const internal = entity.customData[FONTRA_INTERNAL_KEY];
  if (!internal || typeof internal !== "object" || Array.isArray(internal)) {
    entity.customData[FONTRA_INTERNAL_KEY] = {
      schemaVersion: FONTRA_INTERNAL_SCHEMA_VERSION,
    };
  } else if (internal.schemaVersion === undefined) {
    internal.schemaVersion = FONTRA_INTERNAL_SCHEMA_VERSION;
  }
  return entity.customData[FONTRA_INTERNAL_KEY];
}

export function getFontraInternalSection(entity, section) {
  const internal = getFontraInternal(entity);
  return internal?.[section];
}

export function setFontraInternalSection(entity, section, value) {
  const internal = ensureFontraInternal(entity);
  if (value === undefined) {
    delete internal[section];
  } else {
    internal[section] = deepCopyObject(value);
  }
  return internal;
}

export function deleteFontraInternalSection(entity, section) {
  const internal = getFontraInternal(entity);
  if (!internal) {
    return;
  }
  delete internal[section];
}
