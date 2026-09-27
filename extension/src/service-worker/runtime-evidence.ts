import { serializeAudit, type AuditEvent } from "../security/audit.js";
import { isPlainObject } from "../security/validation.js";
import type { BrowserChromeApi } from "./browser-api.js";

type Config = { schema_version: 1; endpoint: string };
export type EvidenceDelivery = "SENT" | "SKIPPED" | "FAILED";

const config = (value: unknown): Config | undefined => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !["schema_version", "endpoint"].includes(key),
    ) ||
    (value as { schema_version?: unknown }).schema_version !== 1 ||
    typeof (value as { endpoint?: unknown }).endpoint !== "string"
  )
    return undefined;
  try {
    const endpoint = new URL((value as { endpoint: string }).endpoint);
    return endpoint.protocol === "https:" &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash
      ? { schema_version: 1, endpoint: endpoint.toString() }
      : undefined;
  } catch {
    return undefined;
  }
};

export const createRuntimeEvidenceSink = (
  chrome: BrowserChromeApi | undefined,
  fetcher: typeof fetch = fetch,
) => ({
  async emit(event: AuditEvent): Promise<EvidenceDelivery> {
    let body: string;
    try {
      body = serializeAudit(event);
    } catch {
      return "FAILED";
    }
    const managed = chrome?.storage.managed;
    if (!managed?.get) return "SKIPPED";
    let stored: Record<string, unknown>;
    try {
      stored = await managed.get("runtime_evidence");
    } catch {
      return "FAILED";
    }
    if (!isPlainObject(stored)) return "FAILED";
    if (!Object.prototype.hasOwnProperty.call(stored, "runtime_evidence"))
      return "SKIPPED";
    const destination = config(stored.runtime_evidence);
    if (!destination) return "FAILED";
    try {
      const response = await fetcher(destination.endpoint, {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok ? "SENT" : "FAILED";
    } catch {
      return "FAILED";
    }
  },
});
