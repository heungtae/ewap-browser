import { createHash } from "node:crypto";
import { fail } from "../security/validation.js";
export type CompatibilityEntry = {
  schema_version: 1;
  extension_version: string;
  host_version: string;
  fingerprint_alg: "semantic-projection-fp-v1";
  profile_key_ids: string[];
  policy_hash: string;
  host_hash: string;
};
export const sha256Hex = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
export const validateCompatibility = (
  entry: CompatibilityEntry,
  actual: Omit<CompatibilityEntry, "schema_version">,
): void => {
  if (
    entry.schema_version !== 1 ||
    entry.extension_version !== actual.extension_version ||
    entry.host_version !== actual.host_version ||
    entry.fingerprint_alg !== actual.fingerprint_alg ||
    entry.policy_hash !== actual.policy_hash ||
    entry.host_hash !== actual.host_hash ||
    [...entry.profile_key_ids].sort().join(",") !==
      [...actual.profile_key_ids].sort().join(",")
  )
    fail("PROFILE_UNAVAILABLE");
};
