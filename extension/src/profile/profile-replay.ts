import { digestCanonical } from "../security/canonical.js";
import { fail } from "../security/validation.js";
import type { Profile } from "./profile-types.js";

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
