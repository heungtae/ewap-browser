import { describe, expect, it } from "vitest";
import {
  exactOrigin,
  validatePolicyBundle,
} from "../../../src/security/origin-matcher.js";
import { serializeAudit } from "../../../src/security/audit.js";
describe("security boundaries", () => {
  it("given_localhost_when_matching_then_denied", () =>
    expect(
      exactOrigin("https://localhost", ["https://fixture.company.test"]),
    ).toBe(false));
  it("given_egress_outside_permission_when_validating_then_denied", () =>
    expect(() =>
      validatePolicyBundle({
        permission_origins: ["https://fixture.company.test"],
        page_read_origins: [],
        profile_resolver_origins: ["https://resolver.company.test"],
        llm_egress_origins: [],
      }),
    ).toThrow("ORIGIN_NOT_ALLOWED"));
  it("given_raw_value_key_when_serializing_audit_then_denied", () =>
    expect(() =>
      serializeAudit({ event: "policy", value: "secret" } as never),
    ).toThrow("INVALID_ARGUMENT"));
});
