import { fail, isPlainObject } from "../security/validation.js";
import { validateWorkflowDeclaration } from "../contracts/workflow.js";
import type { MutationTool, Role } from "../contracts/types.js";
import {
  isSemanticVerifier,
  mutationTools,
  roles,
} from "./profile-action-validation.js";
import type {
  Profile,
  ProfileActionTool,
  ProfileContext,
} from "./profile-types.js";
export type {
  Profile,
  ProfileActionTool,
  ProfileContext,
  ProfileResolution,
} from "./profile-types.js";
export { definitionDigest, ProfileReplayStore } from "./profile-replay.js";

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
        value.eligible_roles.length !== 1) ||
      (value.tool === "select_option_by_ref" &&
        value.eligible_roles[0] !== "combobox") ||
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
export const verifyProfileClaims = (
  profile: Profile,
  context: ProfileContext,
): Profile => {
  if (!isPlainObject(profile)) return fail("PROFILE_UNAVAILABLE");
  const allowed = [
    "schema_version",
    "resolution",
    "iss",
    "aud",
    "resolver_request_nonce",
    "page_context_digest",
    "issued_at",
    "expires_at",
    "profile_id",
    "profile_version",
    "matcher",
    "fingerprint",
    "tools",
    "workflow",
    "business_mcp",
    "authoritative_fields",
  ];
  if (Object.keys(profile).some((key) => !allowed.includes(key)))
    return fail("PROFILE_UNAVAILABLE");
  const now = context.now ?? new Date();
  const issued = new Date(profile.issued_at);
  const expires = new Date(profile.expires_at);
  if (
    profile.schema_version !== 1 ||
    (profile.resolution !== "MATCHED" && profile.resolution !== "UNKNOWN") ||
    typeof profile.iss !== "string" ||
    !profile.iss ||
    typeof profile.aud !== "string" ||
    typeof profile.resolver_request_nonce !== "string" ||
    typeof profile.page_context_digest !== "string" ||
    !isPlainObject(profile.fingerprint) ||
    Object.keys(profile.fingerprint).some(
      (key) => key !== "alg" && key !== "value",
    ) ||
    typeof profile.fingerprint.value !== "string" ||
    profile.aud !== context.deploymentId ||
    profile.resolver_request_nonce !== context.nonce ||
    profile.page_context_digest !== context.pageContextDigest ||
    profile.fingerprint.alg !== "semantic-projection-fp-v1" ||
    profile.fingerprint.value !== context.fingerprint ||
    Number.isNaN(issued.valueOf()) ||
    Number.isNaN(expires.valueOf()) ||
    expires <= now ||
    issued.valueOf() > now.valueOf() + 300_000 ||
    expires <= issued ||
    expires.valueOf() - issued.valueOf() > 86_400_000 ||
    !context.path.startsWith("/") ||
    context.path.includes("?") ||
    context.path.includes("#")
  )
    fail("PROFILE_UNAVAILABLE");
  if (profile.resolution === "UNKNOWN") {
    if (
      profile.profile_id ||
      profile.profile_version ||
      profile.tools ||
      profile.workflow ||
      profile.matcher ||
      profile.business_mcp ||
      profile.authoritative_fields
    )
      fail("PROFILE_UNAVAILABLE");
    return profile;
  }
  const version = profile.profile_version;
  if (
    !profile.profile_id ||
    !Number.isInteger(version) ||
    version === undefined ||
    version < 1 ||
    !profile.matcher ||
    !isPlainObject(profile.matcher) ||
    Object.keys(profile.matcher).some(
      (key) => key !== "origin" && key !== "path_prefix",
    ) ||
    typeof profile.matcher.origin !== "string" ||
    typeof profile.matcher.path_prefix !== "string" ||
    !profile.matcher.path_prefix.startsWith("/") ||
    profile.matcher.path_prefix.includes("?") ||
    profile.matcher.path_prefix.includes("#") ||
    profile.matcher.origin !== context.origin ||
    !context.path.startsWith(profile.matcher.path_prefix) ||
    (profile.tools !== undefined && !Array.isArray(profile.tools)) ||
    (profile.workflow !== undefined && !isPlainObject(profile.workflow)) ||
    (profile.business_mcp !== undefined &&
      !Array.isArray(profile.business_mcp)) ||
    (profile.authoritative_fields !== undefined &&
      !Array.isArray(profile.authoritative_fields))
  )
    fail("PROFILE_UNAVAILABLE");
  profileActionTools(profile);
  if (profile.workflow !== undefined)
    validateWorkflowDeclaration(profile.workflow);
  return profile;
};
