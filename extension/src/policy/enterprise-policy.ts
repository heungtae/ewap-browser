import type { Risk } from "../contracts/types.js";
import { fail, isPlainObject } from "../security/validation.js";
import type { Capability } from "./permission-manager.js";

export type EnterprisePolicyMode = "community" | "enterprise";
export type EnterpriseIdentity = {
  organization_id: string;
  user_id: string;
  device_id: string;
};
export type EnterprisePolicyRequest = {
  run_id: string;
  tab_id: number;
  document_epoch: string;
  origin: string;
  capability: Capability;
  risk: Risk;
  profile: { id: string; version: number };
};
export type EnterprisePolicyDecision = {
  decision: "ALLOW" | "DENY";
  managed_auto: boolean;
};
export type EnterprisePolicyConfig = {
  schema_version: 1;
  mode: EnterprisePolicyMode;
  pdp_url?: string;
};

const opaque = (value: unknown, maximum = 160): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maximum &&
  /^[A-Za-z0-9._-]+$/.test(value);

const maxDecisionBytes = 8 * 1_024;

const readDecision = async (response: Response): Promise<unknown> => {
  if (!response.body) return fail("ENTERPRISE_POLICY_UNAVAILABLE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxDecisionBytes) {
        await reader.cancel().catch(() => undefined);
        return fail("ENTERPRISE_POLICY_UNAVAILABLE");
      }
      chunks.push(part.value);
    }
  } catch {
    return fail("ENTERPRISE_POLICY_UNAVAILABLE");
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    return fail("ENTERPRISE_POLICY_UNAVAILABLE");
  }
};

export const validateEnterprisePolicyConfig = (
  value: unknown,
): EnterprisePolicyConfig => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some(
      (key) => !["schema_version", "mode", "pdp_url"].includes(key),
    ) ||
    value.schema_version !== 1 ||
    (value.mode !== "community" && value.mode !== "enterprise") ||
    (value.pdp_url !== undefined && typeof value.pdp_url !== "string")
  )
    return fail("ENTERPRISE_POLICY_UNAVAILABLE");
  if (value.mode === "community") {
    if (value.pdp_url !== undefined)
      return fail("ENTERPRISE_POLICY_UNAVAILABLE");
    return { schema_version: 1, mode: "community" };
  }
  let endpoint: URL;
  try {
    endpoint = new URL(value.pdp_url ?? "");
  } catch {
    return fail("ENTERPRISE_POLICY_UNAVAILABLE");
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    return fail("ENTERPRISE_POLICY_UNAVAILABLE");
  return {
    schema_version: 1,
    mode: "enterprise",
    pdp_url: endpoint.toString(),
  };
};

export class EnterprisePolicyClient {
  public constructor(
    private readonly config: EnterprisePolicyConfig,
    private readonly identity: () => Promise<EnterpriseIdentity | undefined>,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  public async authorize(
    request: EnterprisePolicyRequest,
  ): Promise<EnterprisePolicyDecision> {
    if (this.config.mode === "community")
      return { decision: "ALLOW", managed_auto: false };
    const identity = await this.identity().catch(() => undefined);
    if (
      !identity ||
      !opaque(identity.organization_id) ||
      !opaque(identity.user_id) ||
      !opaque(identity.device_id) ||
      !this.config.pdp_url
    )
      return fail("ENTERPRISE_POLICY_UNAVAILABLE");
    const response = await this.fetcher(this.config.pdp_url, {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schema_version: 1,
        identity: {
          organization_id: identity.organization_id,
          user_id: identity.user_id,
          device_id: identity.device_id,
        },
        request,
      }),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => fail("ENTERPRISE_POLICY_UNAVAILABLE"));
    if (
      !response.ok ||
      response.headers.get("content-type") !== "application/json"
    )
      return fail("ENTERPRISE_POLICY_UNAVAILABLE");
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > maxDecisionBytes)
      return fail("ENTERPRISE_POLICY_UNAVAILABLE");
    const result = await readDecision(response);
    if (
      !isPlainObject(result) ||
      Object.keys(result).some(
        (key) => !["decision", "managed_auto"].includes(key),
      ) ||
      (result.decision !== "ALLOW" && result.decision !== "DENY") ||
      result.managed_auto !== false
    )
      return fail("ENTERPRISE_POLICY_UNAVAILABLE");
    if (result.decision === "DENY") return fail("ENTERPRISE_POLICY_DENIED");
    return { decision: "ALLOW", managed_auto: false };
  }
}
