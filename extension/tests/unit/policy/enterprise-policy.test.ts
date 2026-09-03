import { describe, expect, it } from "vitest";
import {
  EnterprisePolicyClient,
  validateEnterprisePolicyConfig,
} from "../../../src/policy/enterprise-policy.js";

const request = {
  run_id: "run",
  tab_id: 1,
  document_epoch: "epoch",
  origin: "https://portal.company.test",
  capability: "click" as const,
  risk: "R2" as const,
  profile: { id: "profile", version: 1 },
};

describe("Enterprise policy client", () => {
  it("given_community_mode_when_authorizing_then_preserves_local_flow", async () => {
    const client = new EnterprisePolicyClient(
      validateEnterprisePolicyConfig({ schema_version: 1, mode: "community" }),
      async () => undefined,
    );
    await expect(client.authorize(request)).resolves.toEqual({
      decision: "ALLOW",
      managed_auto: false,
    });
  });
  it("given_enterprise_identity_or_pdp_outage_when_authorizing_write_then_fails_closed", async () => {
    const client = new EnterprisePolicyClient(
      validateEnterprisePolicyConfig({
        schema_version: 1,
        mode: "enterprise",
        pdp_url: "https://pdp.company.test/decide",
      }),
      async () => undefined,
    );
    await expect(client.authorize(request)).rejects.toThrow(
      "ENTERPRISE_POLICY_UNAVAILABLE",
    );
  });
});
