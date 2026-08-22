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
