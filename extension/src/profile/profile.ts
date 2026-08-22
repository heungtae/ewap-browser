import { digestCanonical } from "../security/canonical.js";
import { fail, isPlainObject } from "../security/validation.js";
import type {
  MutationTool,
  Risk,
  Role,
  VerifierPredicate,
} from "../contracts/types.js";
export type ProfileResolution = "MATCHED" | "UNKNOWN";
export type Profile = {
  schema_version: 1;
  resolution: ProfileResolution;
  iss: string;
  aud: string;
  resolver_request_nonce: string;
  page_context_digest: string;
  issued_at: string;
  expires_at: string;
  profile_id?: string;
  profile_version?: number;
  matcher?: { origin: string; path_prefix: string };
  fingerprint: { alg: "semantic-projection-fp-v1"; value: string };
  tools?: unknown[];
  business_mcp?: unknown[];
  authoritative_fields?: unknown[];
};
export type ProfileContext = {
  deploymentId: string;
  nonce: string;
  pageContextDigest: string;
  origin: string;
  path: string;
  fingerprint: string;
  now?: Date;
};
export type ProfileActionTool = {
  tool: MutationTool;
  effect: "local-ui-only" | "server-side";
  risk: Extract<Risk, "R1" | "R2">;
  eligible_roles: readonly Role[];
  verifier: Extract<VerifierPredicate, { kind: "semantic-state-transition" }>;
  option_values?: readonly string[];
};

const mutationTools = new Set<MutationTool>([
  "set_text_by_ref",
  "select_option_by_ref",
  "set_checked_by_ref",
  "click_by_ref",
  "press_key_by_ref",
]);
const roles = new Set<Role>([
  "button",
  "checkbox",
  "combobox",
  "heading",
  "link",
  "option",
  "radio",
  "textbox",
  "listbox",
  "tab",
  "menuitem",
  "dialog",
  "alert",
  "status",
  "navigation",
  "main",
  "form",
]);
const isStatePredicate = (value: unknown): boolean =>
  isPlainObject(value) &&
  Object.keys(value).every((key) =>
    ["ref_id", "field", "expected"].includes(key),
  ) &&
  typeof value.ref_id === "string" &&
  ["checked", "selected", "disabled", "expanded"].includes(
    value.field as string,
  ) &&
  typeof value.expected === "boolean";
const isSemanticVerifier = (
  value: unknown,
): value is Extract<VerifierPredicate, { kind: "semantic-state-transition" }> =>
  isPlainObject(value) &&
  Object.keys(value).every((key) =>
    ["kind", "declaration_id", "pre_state_digest", "required_changes"].includes(
      key,
    ),
  ) &&
  value.kind === "semantic-state-transition" &&
  typeof value.declaration_id === "string" &&
  value.declaration_id.length > 0 &&
  typeof value.pre_state_digest === "string" &&
  Array.isArray(value.required_changes) &&
  value.required_changes.every(isStatePredicate);

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
          value.eligible_roles[0] !== "button")) ||
      (value.tool === "set_checked_by_ref" &&
        (value.eligible_roles.length !== 1 ||
          value.eligible_roles[0] !== "checkbox")) ||
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
    (profile.business_mcp !== undefined &&
      !Array.isArray(profile.business_mcp)) ||
    (profile.authoritative_fields !== undefined &&
      !Array.isArray(profile.authoritative_fields))
  )
    fail("PROFILE_UNAVAILABLE");
  profileActionTools(profile);
  return profile;
};
export const definitionDigest = (profile: Profile): string => {
  if (
    profile.resolution !== "MATCHED" ||
    !profile.profile_id ||
    !profile.profile_version ||
    !profile.matcher
  )
    return fail("PROFILE_UNAVAILABLE");
  return digestCanonical({
    schema_version: profile.schema_version,
    profile_id: profile.profile_id,
    profile_version: profile.profile_version,
    matcher: profile.matcher,
    fingerprint: profile.fingerprint,
    tools: profile.tools ?? [],
    authoritative_fields: profile.authoritative_fields ?? [],
    business_mcp: profile.business_mcp ?? [],
  });
};
export class ProfileReplayStore {
  private readonly highWater = new Map<
    string,
    { version: number; digest: string }
  >();
  accept(
    deploymentId: string,
    profileId: string,
    version: number,
    digest: string,
  ): "ADVANCED" | "IDEMPOTENT_ACCEPTED" {
    const key = `${deploymentId}:${profileId}`;
    const current = this.highWater.get(key);
    if (!current || version > current.version) {
      this.highWater.set(key, { version, digest });
      return "ADVANCED";
    }
    if (version === current.version && digest === current.digest)
      return "IDEMPOTENT_ACCEPTED";
    return fail("PROFILE_UNAVAILABLE");
  }
}
