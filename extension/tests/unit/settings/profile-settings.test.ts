import { describe, expect, it } from "vitest";
import { validateProfileResolverSettings } from "../../../src/settings/profile-settings.js";

const valid = {
  schema_version: 1,
  deployment_id: "dev",
  url: "https://resolver.company.test/profile",
  allowed_origins: ["https://resolver.company.test"],
  key_ring: { k1: "-----BEGIN PUBLIC KEY-----\nkey\n-----END PUBLIC KEY-----" },
};
describe("profile resolver settings", () => {
  it("given_valid_https_resolver_when_validating_then_accepted", () => {
    expect(validateProfileResolverSettings(valid).deployment_id).toBe("dev");
  });
  it("given_http_or_missing_public_key_when_validating_then_rejected", () => {
    expect(() =>
      validateProfileResolverSettings({
        ...valid,
        url: "http://resolver.company.test",
      }),
    ).toThrow("INVALID_ARGUMENT");
    expect(() =>
      validateProfileResolverSettings({ ...valid, key_ring: {} }),
    ).toThrow("INVALID_ARGUMENT");
  });
});
