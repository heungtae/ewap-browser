import { fail, isPlainObject } from "../security/validation.js";
import type { PageApiAction, PageApiAdapter } from "./page-api-types.js";

const id = (value: unknown, max = 64): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= max &&
  /^[A-Za-z0-9_-]+$/.test(value);

export const validatePageApiAction = (value: unknown): PageApiAction => {
  const labels =
    isPlainObject(value) && isPlainObject(value.option_labels)
      ? value.option_labels
      : undefined;
  if (
    !isPlainObject(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "action_id",
          "label",
          "description",
          "effect",
          "risk",
          "option_ids",
          "option_labels",
          "completion",
        ].includes(key),
    ) ||
    !id(value.action_id) ||
    typeof value.label !== "string" ||
    value.label.length === 0 ||
    value.label.length > 160 ||
    typeof value.description !== "string" ||
    value.description.length === 0 ||
    value.description.length > 240 ||
    value.effect !== "local-ui-only" ||
    value.risk !== "R1" ||
    !Array.isArray(value.option_ids) ||
    value.option_ids.length < 1 ||
    value.option_ids.length > 128 ||
    value.option_ids.some((option) => !id(option)) ||
    new Set(value.option_ids).size !== value.option_ids.length ||
    !labels ||
    Object.keys(labels).length !== value.option_ids.length ||
    value.option_ids.some(
      (option) =>
        typeof labels[option] !== "string" ||
        (labels[option] as string).length === 0 ||
        (labels[option] as string).length > 160,
    ) ||
    !isPlainObject(value.completion) ||
    Object.keys(value.completion).some(
      (key) => !["control_name", "option_name"].includes(key),
    ) ||
    typeof value.completion.control_name !== "string" ||
    typeof value.completion.option_name !== "string" ||
    value.completion.control_name.length === 0 ||
    value.completion.option_name.length === 0
  )
    return fail("PAGE_API_CONTRACT_INVALID");
  return value as PageApiAction;
};

export const validatePageApiAdapter = (
  value: PageApiAdapter,
): PageApiAdapter => {
  if (
    !id(value.adapter_id) ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    !Array.isArray(value.origins) ||
    value.origins.length === 0 ||
    value.origins.some((origin) => {
      try {
        const url = new URL(origin);
        return (
          url.origin !== origin ||
          url.protocol !== "https:" ||
          url.pathname !== "/" ||
          url.search ||
          url.hash
        );
      } catch {
        return true;
      }
    }) ||
    value.actions.length === 0 ||
    value.actions.length > 16 ||
    new Set(value.actions.map((action) => action.action_id)).size !==
      value.actions.length
  )
    return fail("PAGE_API_CONTRACT_INVALID");
  value.actions.forEach(validatePageApiAction);
  return value;
};
