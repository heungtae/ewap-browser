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
      serializeAudit({
        event: "policy",
        run_id: "run-1",
        decision: "ALLOW",
        value: "secret",
      } as never),
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
  it("rejects_raw_or_unrecognized_audit_values_even_when_the_key_is_allowed", () => {
    const base = { event: "terminal", run_id: "run-1", outcome: "UNKNOWN" };
    for (const extra of [
      { run_id: "https://secret.company.test/path?token=abc" },
      { profile_id: "private page text" },
      { origin: "https://portal.company.test/path?token=abc" },
      { code: "password-from-page" },
      { outcome: "SUCCESS" },
      { tool: "click_by_ref" },
    ]) {
      expect(() => serializeAudit({ ...base, ...extra } as never)).toThrow(
        "INVALID_ARGUMENT",
      );
    }
  });
  it("preserves_unknown_terminal_and_closed_error_code_without_raw_data", () => {
    const body = serializeAudit({
      event: "terminal",
      run_id: "run-1",
      outcome: "UNKNOWN",
      code: "POSTCONDITION_UNVERIFIED",
    });
    expect(JSON.parse(body)).toEqual({
      event: "terminal",
      run_id: "run-1",
      outcome: "UNKNOWN",
      code: "POSTCONDITION_UNVERIFIED",
    });
  });
});
