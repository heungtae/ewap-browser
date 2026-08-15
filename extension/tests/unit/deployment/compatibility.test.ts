import { describe, expect, it } from "vitest";
import {
  sha256Hex,
  validateCompatibility,
} from "../../../src/deployment/compatibility.js";

const entry = {
  schema_version: 1 as const,
  extension_version: "0.1.0",
  host_version: "0.1.0",
  fingerprint_alg: "semantic-projection-fp-v1" as const,
  profile_key_ids: ["k2", "k1"],
  policy_hash: "policy",
  host_hash: "host",
};
describe("release compatibility", () => {
  it("given_same_hashes_and_key_set_when_validating_then_accepts", () => {
    expect(() =>
      validateCompatibility(entry, { ...entry, profile_key_ids: ["k1", "k2"] }),
    ).not.toThrow();
  });
  it("given_host_hash_mismatch_when_validating_then_fails_closed", () => {
    expect(() =>
      validateCompatibility(entry, { ...entry, host_hash: "different" }),
    ).toThrow("PROFILE_UNAVAILABLE");
  });
  it("given_package_bytes_when_hashing_then_sha256_is_deterministic", () => {
    expect(sha256Hex(new TextEncoder().encode("company artifact"))).toBe(
      "abfc3477bb90735fbaaf4d1b7237450000696d93a816ae68a2206f6bb8547220",
    );
  });
});
