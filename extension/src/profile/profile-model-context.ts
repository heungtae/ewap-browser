import { fail, isPlainObject } from "../security/validation.js";
import type { ProfileModelContext } from "./profile-types.js";

const safeText = (value: unknown, maximum: number): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maximum &&
  ![...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  }) &&
  !/(?:https?:|javascript:|data:)/i.test(value);

const closedItems = (
  value: unknown,
  keys: readonly string[],
  limits: readonly number[],
): value is Record<string, string> =>
  isPlainObject(value) &&
  Object.keys(value).length === keys.length &&
  Object.keys(value).every((key) => keys.includes(key)) &&
  keys.every((key, index) => safeText(value[key], limits[index] ?? 0));

export const profileModelContext = (value: unknown): ProfileModelContext => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some(
      (key) =>
        !["title", "summary", "facts", "glossary", "limitations"].includes(key),
    ) ||
    !safeText(value.title, 160) ||
    !safeText(value.summary, 2_000) ||
    !Array.isArray(value.facts) ||
    !Array.isArray(value.glossary) ||
    !Array.isArray(value.limitations) ||
    value.facts.length > 64 ||
    value.glossary.length > 64 ||
    value.limitations.length > 64 ||
    value.facts.some(
      (item) => !closedItems(item, ["label", "value"], [160, 1_000]),
    ) ||
    value.glossary.some(
      (item) => !closedItems(item, ["term", "definition"], [160, 1_000]),
    ) ||
    value.limitations.some((item) => !safeText(item, 400)) ||
    new Set(value.facts.map((item) => item.label)).size !==
      value.facts.length ||
    new Set(value.glossary.map((item) => item.term)).size !==
      value.glossary.length ||
    new TextEncoder().encode(JSON.stringify(value)).length > 8_192
  )
    return fail("PROFILE_UNAVAILABLE");
  return value as ProfileModelContext;
};
