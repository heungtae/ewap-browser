import { fail, isPlainObject } from "../security/validation.js";
import { validateWorkflowDeclaration } from "../contracts/workflow.js";
import { profileModelContext } from "./profile-model-context.js";
import { businessMcpBindings } from "./mcp-binding.js";
import { profileActionTools } from "./profile-action-tools.js";
export { profileActionTools } from "./profile-action-tools.js";
import type {
  Profile,
  ProfileContext,
} from "./profile-types.js";
export type {
  Profile,
  ProfileActionTool,
  ProfileContext,
  ProfileResolution,
} from "./profile-types.js";
export { definitionDigest, ProfileReplayStore } from "./profile-replay.js";

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
    "model_context",
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
      profile.model_context ||
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
    (profile.model_context !== undefined &&
      !isPlainObject(profile.model_context)) ||
    (profile.business_mcp !== undefined &&
      !Array.isArray(profile.business_mcp)) ||
    (profile.authoritative_fields !== undefined &&
      !Array.isArray(profile.authoritative_fields))
  )
    fail("PROFILE_UNAVAILABLE");
  profileActionTools(profile);
  if (profile.model_context !== undefined)
    profileModelContext(profile.model_context);
  if (profile.business_mcp !== undefined)
    businessMcpBindings(profile.business_mcp);
  if (profile.workflow !== undefined)
    validateWorkflowDeclaration(profile.workflow);
  return profile;
};
