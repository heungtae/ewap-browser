import type { MutationTool, Role } from "../contracts/types.js";
import { fail, isPlainObject } from "../security/validation.js";
import {
  isSemanticVerifier,
  mutationTools,
  roles,
} from "./profile-action-validation.js";
import type { Profile, ProfileActionTool } from "./profile-types.js";

export const profileActionTools = (profile: Profile): ProfileActionTool[] => {
  if (!Array.isArray(profile.tools)) return [];
  const definitions: ProfileActionTool[] = [];
  for (const value of profile.tools) {
    if (
      !isPlainObject(value) ||
      Object.keys(value).some(
        (key) =>
          ![
            "tool",
            "effect",
            "risk",
            "eligible_roles",
            "verifier",
            "option_values",
          ].includes(key),
      ) ||
      typeof value.tool !== "string" ||
      !mutationTools.has(value.tool as MutationTool) ||
      (value.effect !== "local-ui-only" && value.effect !== "server-side") ||
      (value.risk !== "R1" && value.risk !== "R2") ||
      !Array.isArray(value.eligible_roles) ||
      value.eligible_roles.length === 0 ||
      value.eligible_roles.some(
        (role) => typeof role !== "string" || !roles.has(role as Role),
      ) ||
      new Set(value.eligible_roles).size !== value.eligible_roles.length ||
      !isSemanticVerifier(value.verifier) ||
      (value.option_values !== undefined &&
        (!Array.isArray(value.option_values) ||
          value.option_values.length === 0 ||
          value.option_values.length > 128 ||
          value.option_values.some(
            (option) =>
              typeof option !== "string" ||
              option.length === 0 ||
              option.length > 160,
          ) ||
          new Set(value.option_values).size !== value.option_values.length)) ||
      (value.tool === "select_option_by_ref" &&
        (value.eligible_roles.length !== 1 ||
          value.eligible_roles[0] !== "combobox")) ||
      (value.tool === "set_text_by_ref" &&
        (value.eligible_roles.length !== 1 ||
          value.eligible_roles[0] !== "textbox")) ||
      (value.tool === "click_by_ref" &&
        (value.eligible_roles.length !== 1 ||
          !["button", "tab", "menuitem"].includes(
            value.eligible_roles[0] ?? "",
          ))) ||
      (value.tool === "navigate" &&
        (value.eligible_roles.length !== 1 ||
          value.eligible_roles[0] !== "link")) ||
      (value.tool === "set_checked_by_ref" &&
        (value.eligible_roles.length !== 1 ||
          !["checkbox", "radio"].includes(value.eligible_roles[0] ?? ""))) ||
      (value.tool === "press_key_by_ref" &&
        value.eligible_roles.some(
          (role) =>
            !["button", "textbox", "combobox", "tab", "menuitem"].includes(
              role,
            ),
        )) ||
      (value.tool !== "select_option_by_ref" &&
        value.option_values !== undefined)
    )
      return fail("PROFILE_UNAVAILABLE");
    definitions.push({
      tool: value.tool as MutationTool,
      effect: value.effect,
      risk: value.risk,
      eligible_roles: value.eligible_roles as Role[],
      verifier: value.verifier,
      ...(value.option_values
        ? { option_values: value.option_values as string[] }
        : {}),
    });
  }
  if (
    new Set(definitions.map((definition) => definition.tool)).size !==
    definitions.length
  )
    return fail("PROFILE_UNAVAILABLE");
  return definitions;
};
