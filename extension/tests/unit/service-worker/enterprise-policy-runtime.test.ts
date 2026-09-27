import { describe, expect, it, vi } from "vitest";
import { createManagedEnterprisePolicy } from "../../../src/service-worker/enterprise-policy-runtime.js";
import type { BrowserChromeApi } from "../../../src/service-worker/browser-api.js";

const request = {
  run_id: "run",
  tab_id: 1,
  document_epoch: "epoch",
  origin: "https://portal.company.test",
  capability: "click" as const,
  risk: "R2" as const,
  profile: { id: "profile", version: 1 },
};

const chromeWith = (
  get: (key: string | null) => Promise<Record<string, unknown>>,
): BrowserChromeApi =>
  ({ storage: { managed: { get } } }) as unknown as BrowserChromeApi;

describe("managed Enterprise policy runtime", () => {
  it("uses_community_mode_only_when_the_managed_key_is_absent", async () => {
    const fetcher = vi.fn();
    const policy = createManagedEnterprisePolicy(
      chromeWith(async () => ({})),
      fetcher as typeof fetch,
    );
    await expect(policy.authorize(request)).resolves.toEqual({
      decision: "ALLOW",
      managed_auto: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects_a_present_malformed_managed_value_instead_of_downgrading", async () => {
    for (const value of [
      null,
      false,
      "",
      { schema_version: 1, mode: "enterprise" },
    ]) {
      const policy = createManagedEnterprisePolicy(
        chromeWith(async () => ({ enterprise_policy: value })),
      );
      await expect(policy.authorize(request)).rejects.toThrow(
        "ENTERPRISE_POLICY_UNAVAILABLE",
      );
    }
  });
  it("fails_closed_when_managed_storage_cannot_be_read", async () => {
    const policy = createManagedEnterprisePolicy(
      chromeWith(async () => {
        throw new Error("storage failed");
      }),
    );
    await expect(policy.authorize(request)).rejects.toThrow(
      "ENTERPRISE_POLICY_UNAVAILABLE",
    );
  });
  it("fails_closed_when_managed_storage_api_or_result_is_missing", async () => {
    for (const chrome of [
      undefined,
      { storage: { managed: {} } } as BrowserChromeApi,
      chromeWith(async () => undefined as unknown as Record<string, unknown>),
    ]) {
      const policy = createManagedEnterprisePolicy(chrome);
      await expect(policy.authorize(request)).rejects.toThrow(
        "ENTERPRISE_POLICY_UNAVAILABLE",
      );
    }
  });
});
