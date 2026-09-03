import {
  EnterprisePolicyClient,
  validateEnterprisePolicyConfig,
  type EnterpriseIdentity,
  type EnterprisePolicyDecision,
  type EnterprisePolicyRequest,
} from "../policy/enterprise-policy.js";
import type { BrowserChromeApi } from "./browser-api.js";

const identity = (value: unknown): EnterpriseIdentity | undefined => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !["organization_id", "user_id", "device_id"].includes(key),
    )
  )
    return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.organization_id !== "string" ||
    typeof record.user_id !== "string" ||
    typeof record.device_id !== "string"
  )
    return undefined;
  return {
    organization_id: record.organization_id,
    user_id: record.user_id,
    device_id: record.device_id,
  };
};

export const createManagedEnterprisePolicy = (
  chrome: BrowserChromeApi | undefined,
  fetcher: typeof fetch = fetch,
) => ({
  async authorize(
    request: EnterprisePolicyRequest,
  ): Promise<EnterprisePolicyDecision> {
    const stored = await chrome?.storage.managed.get?.("enterprise_policy");
    const config = stored?.enterprise_policy
      ? validateEnterprisePolicyConfig(stored.enterprise_policy)
      : { schema_version: 1 as const, mode: "community" as const };
    const client = new EnterprisePolicyClient(
      config,
      async () => {
        const current = await chrome?.storage.managed.get?.(
          "enterprise_identity",
        );
        return identity(current?.enterprise_identity);
      },
      fetcher,
    );
    return client.authorize(request);
  },
});
