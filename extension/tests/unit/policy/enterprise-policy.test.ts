import { describe, expect, it, vi } from "vitest";
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
const config = validateEnterprisePolicyConfig({
  schema_version: 1,
  mode: "enterprise",
  pdp_url: "https://pdp.company.test/decide",
});
const identity = {
  organization_id: "org",
  user_id: "user",
  device_id: "device",
};
const decision = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });

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
    const client = new EnterprisePolicyClient(config, async () => undefined);
    await expect(client.authorize(request)).rejects.toThrow(
      "ENTERPRISE_POLICY_UNAVAILABLE",
    );
  });
  it("sends_only_named_identity_fields_without_browser_credentials_or_cache", async () => {
    const fetcher = vi.fn(async () =>
      decision({ decision: "ALLOW", managed_auto: false }),
    );
    const client = new EnterprisePolicyClient(
      config,
      async () => ({ ...identity, secret: "never-send" }) as typeof identity,
      fetcher as typeof fetch,
    );
    await expect(client.authorize(request)).resolves.toEqual({
      decision: "ALLOW",
      managed_auto: false,
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://pdp.company.test/decide");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      schema_version: 1,
      identity,
      request,
    });
  });
  it("rejects_deny_outage_and_unimplemented_auto_or_approval_decisions", async () => {
    for (const [response, error] of [
      [
        decision({ decision: "DENY", managed_auto: false }),
        "ENTERPRISE_POLICY_DENIED",
      ],
      [
        decision({ decision: "ALLOW", managed_auto: true }),
        "ENTERPRISE_POLICY_UNAVAILABLE",
      ],
      [
        decision({
          decision: "ALLOW",
          managed_auto: false,
          approval_token: "opaque",
        }),
        "ENTERPRISE_POLICY_UNAVAILABLE",
      ],
      [
        new Response("offline", {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
        "ENTERPRISE_POLICY_UNAVAILABLE",
      ],
      [decision({ decision: "ALLOW" }), "ENTERPRISE_POLICY_UNAVAILABLE"],
    ] as const) {
      const client = new EnterprisePolicyClient(
        config,
        async () => identity,
        async () => response,
      );
      await expect(client.authorize(request)).rejects.toThrow(error);
    }
  });
  it("rejects_oversized_or_invalid_pdp_bodies_before_using_the_decision", async () => {
    for (const response of [
      decision({
        decision: "ALLOW",
        managed_auto: false,
        padding: "x".repeat(9_000),
      }),
      new Response("{", { headers: { "content-type": "application/json" } }),
      new Response("{}", { headers: { "content-type": "text/plain" } }),
    ]) {
      const client = new EnterprisePolicyClient(
        config,
        async () => identity,
        async () => response,
      );
      await expect(client.authorize(request)).rejects.toThrow(
        "ENTERPRISE_POLICY_UNAVAILABLE",
      );
    }
  });
  it("rejects_malformed_managed_endpoint_configuration", () => {
    expect(() =>
      validateEnterprisePolicyConfig({
        schema_version: 1,
        mode: "community",
        pdp_url: "https://pdp.company.test/decide",
      }),
    ).toThrow("ENTERPRISE_POLICY_UNAVAILABLE");
    for (const pdp_url of [
      "http://pdp.company.test/decide",
      "https://user@pdp.company.test/decide",
      "https://pdp.company.test/decide?secret=x",
    ]) {
      expect(() =>
        validateEnterprisePolicyConfig({
          schema_version: 1,
          mode: "enterprise",
          pdp_url,
        }),
      ).toThrow("ENTERPRISE_POLICY_UNAVAILABLE");
    }
  });
});
