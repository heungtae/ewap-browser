import { digestCanonical } from "../security/canonical.js";
import { fail, isPlainObject } from "../security/validation.js";
import type { Profile } from "./profile-types.js";

export type ProfileReplaySnapshot = {
  schema_version: 1;
  entries: Array<{ key: string; version: number; digest: string }>;
};
const replayDigest = /^[A-Za-z0-9_-]{43}$/;
const maxProfiles = 128;

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
    model_context: profile.model_context ?? null,
    tools: profile.tools ?? [],
    workflow: profile.workflow ?? null,
    authoritative_fields: profile.authoritative_fields ?? [],
    business_mcp: profile.business_mcp ?? [],
  });
};

export class ProfileReplayStore {
  private readonly highWater = new Map<
    string,
    { version: number; digest: string }
  >();
  public restore(value: unknown): void {
    if (
      !isPlainObject(value) ||
      value.schema_version !== 1 ||
      Object.keys(value).some(
        (key) => !["schema_version", "entries"].includes(key),
      ) ||
      !Array.isArray(value.entries) ||
      value.entries.length > maxProfiles
    )
      return fail("PROFILE_UNAVAILABLE");
    const next = new Map<string, { version: number; digest: string }>();
    for (const entry of value.entries) {
      if (
        !isPlainObject(entry) ||
        Object.keys(entry).some(
          (key) => !["key", "version", "digest"].includes(key),
        ) ||
        typeof entry.key !== "string" ||
        !replayDigest.test(entry.key) ||
        !Number.isSafeInteger(entry.version) ||
        (entry.version as number) < 1 ||
        typeof entry.digest !== "string" ||
        !replayDigest.test(entry.digest) ||
        next.has(entry.key)
      )
        return fail("PROFILE_UNAVAILABLE");
      next.set(entry.key, {
        version: entry.version as number,
        digest: entry.digest,
      });
    }
    this.highWater.clear();
    for (const [key, record] of next) this.highWater.set(key, record);
  }

  public snapshot(): ProfileReplaySnapshot {
    return {
      schema_version: 1,
      entries: [...this.highWater].map(([key, record]) => ({ key, ...record })),
    };
  }

  accept(
    deploymentId: string,
    profileId: string,
    version: number,
    digest: string,
  ): "ADVANCED" | "IDEMPOTENT_ACCEPTED" {
    if (!Number.isSafeInteger(version) || version < 1)
      return fail("PROFILE_UNAVAILABLE");
    const key = digestCanonical([deploymentId, profileId]);
    const current = this.highWater.get(key);
    if (!current || version > current.version) {
      if (!current && this.highWater.size >= maxProfiles)
        return fail("PROFILE_UNAVAILABLE");
      this.highWater.set(key, { version, digest });
      return "ADVANCED";
    }
    if (version === current.version && digest === current.digest)
      return "IDEMPOTENT_ACCEPTED";
    return fail("PROFILE_UNAVAILABLE");
  }
}
