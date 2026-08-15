import { digestCanonical } from "../security/canonical.js";
import { fail, isPlainObject } from "../security/validation.js";
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
