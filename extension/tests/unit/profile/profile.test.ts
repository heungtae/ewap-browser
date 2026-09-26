import { describe, expect, it } from "vitest";
import {
  profileActionTools,
  ProfileReplayStore,
  verifyProfileClaims,
  type Profile,
} from "../../../src/profile/profile.js";
const profile: Profile = {
  schema_version: 1,
  resolution: "MATCHED",
  iss: "resolver",
  aud: "dev",
  resolver_request_nonce: "nonce",
  page_context_digest: "digest",
  issued_at: "2026-08-15T00:00:00Z",
  expires_at: "2026-08-15T01:00:00Z",
  profile_id: "profile",
  profile_version: 1,
  matcher: { origin: "https://fixture.company.test", path_prefix: "/" },
  fingerprint: { alg: "semantic-projection-fp-v1", value: "fp" },
  tools: [],
  business_mcp: [],
  authoritative_fields: [],
};
describe("profile claims", () => {
  it("given_matching_profile_when_verifying_then_accepted", () =>
    expect(
      verifyProfileClaims(profile, {
        deploymentId: "dev",
        nonce: "nonce",
        pageContextDigest: "digest",
        origin: "https://fixture.company.test",
        path: "/case",
        fingerprint: "fp",
        now: new Date("2026-08-15T00:10:00Z"),
      }),
    ).toBe(profile));
  it("binds_path_prefix_to_segments_and_rejects_unsafe_versions", () => {
    const context = {
      deploymentId: "dev",
      nonce: "nonce",
      pageContextDigest: "digest",
      origin: "https://fixture.company.test",
      path: "/case/123",
      fingerprint: "fp",
      now: new Date("2026-08-15T00:10:00Z"),
    };
    const matched = {
      ...profile,
      matcher: { ...profile.matcher!, path_prefix: "/case" },
    };
    expect(verifyProfileClaims(matched, context)).toBe(matched);
    expect(() =>
      verifyProfileClaims(matched, { ...context, path: "/cases" }),
    ).toThrow("PROFILE_UNAVAILABLE");
    expect(() =>
      verifyProfileClaims(
        { ...matched, profile_version: Number.MAX_SAFE_INTEGER + 1 },
        context,
      ),
    ).toThrow("PROFILE_UNAVAILABLE");
  });
  it("given_same_version_different_definition_when_replaying_then_denied", () => {
    const store = new ProfileReplayStore();
    store.accept("dev", "p", 1, "a");
    expect(() => store.accept("dev", "p", 1, "b")).toThrow(
      "PROFILE_UNAVAILABLE",
    );
  });
  it("given_unknown_claim_when_verifying_then_fails_closed", () => {
    expect(() =>
      verifyProfileClaims(
        { ...profile, extension_override: true } as typeof profile,
        {
          deploymentId: "dev",
          nonce: "nonce",
          pageContextDigest: "digest",
          origin: "https://fixture.company.test",
          path: "/case",
          fingerprint: "fp",
          now: new Date("2026-08-15T00:10:00Z"),
        },
      ),
    ).toThrow("PROFILE_UNAVAILABLE");
  });
  it("given_closed_profile_action_definition_when_reading_then_returns_it", () => {
    const tools = profileActionTools({
      ...profile,
      tools: [
        {
          tool: "click_by_ref",
          effect: "local-ui-only",
          risk: "R1",
          eligible_roles: ["button"],
          verifier: {
            kind: "semantic-state-transition",
            declaration_id: "save-v1",
            pre_state_digest: "state",
            required_changes: [],
          },
        },
      ],
    });
    expect(tools).toMatchObject([{ tool: "click_by_ref", risk: "R1" }]);
  });
  it("given_profile_tab_or_menu_action_when_reading_then_returns_it", () => {
    const action = {
      effect: "local-ui-only" as const,
      risk: "R1" as const,
      verifier: {
        kind: "semantic-state-transition" as const,
        declaration_id: "menu-v1",
        pre_state_digest: "state",
        required_changes: [],
      },
    };
    expect(
      profileActionTools({
        ...profile,
        tools: [{ ...action, tool: "click_by_ref", eligible_roles: ["tab"] }],
      }),
    ).toMatchObject([{ eligible_roles: ["tab"] }]);
    expect(
      profileActionTools({
        ...profile,
        tools: [
          { ...action, tool: "click_by_ref", eligible_roles: ["menuitem"] },
        ],
      }),
    ).toMatchObject([{ eligible_roles: ["menuitem"] }]);
  });
  it("accepts_a_closed_v2_control_completion_contract", () => {
    expect(
      profileActionTools({
        ...profile,
        tools: [
          {
            tool: "click_by_ref",
            effect: "local-ui-only",
            risk: "R1",
            eligible_roles: ["button"],
            verifier: {
              kind: "semantic-state-transition",
              declaration_id: "open-v2",
              pre_state_digest: "state",
              required_changes: [],
            },
            completion: {
              version: 2,
              kind: "control_state",
              source: "trusted_profile",
              scope_policy: "same_scope",
              report_scope: "ui",
              expected_changes: [
                { ref_id: "$target", field: "expanded", expected: true },
              ],
            },
          },
        ],
      }),
    ).toMatchObject([{ completion: { version: 2, kind: "control_state" } }]);
  });
  it("given_unbounded_profile_action_definition_when_verifying_then_fails_closed", () => {
    expect(() =>
      verifyProfileClaims(
        {
          ...profile,
          tools: [
            {
              tool: "click_by_ref",
              effect: "local-ui-only",
              risk: "R1",
              eligible_roles: ["button"],
              verifier: { kind: "anything" },
            },
          ],
        },
        {
          deploymentId: "dev",
          nonce: "nonce",
          pageContextDigest: "digest",
          origin: "https://fixture.company.test",
          path: "/case",
          fingerprint: "fp",
          now: new Date("2026-08-15T00:10:00Z"),
        },
      ),
    ).toThrow("PROFILE_UNAVAILABLE");
  });
});
