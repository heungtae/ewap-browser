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
  it("given_all_urls_policy_when_matching_http_page_then_allowed", () =>
    expect(exactOrigin("https://github.com", ["<all_urls>"])).toBe(true));
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
  it("given_redacted_enterprise_correlation_when_serializing_then_accepts_it", () =>
    expect(
      serializeAudit({
        event: "policy",
        run_id: "run-1",
        origin: "https://portal.company.test",
        profile_id: "manufacturing",
        profile_version: 3,
        capability: "click",
        risk: "R2",
        decision: "ALLOW",
        stage: "authorized",
      }),
    ).toContain("portal.company.test"));
});
