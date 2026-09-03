import { serializeAudit, type AuditEvent } from "../security/audit.js";
import type { BrowserChromeApi } from "./browser-api.js";

type Config = { schema_version: 1; endpoint: string };

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
  async emit(event: AuditEvent): Promise<void> {
    const stored = await chrome?.storage.managed.get?.("runtime_evidence");
    const destination = config(stored?.runtime_evidence);
    if (!destination) return;
    await fetcher(destination.endpoint, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: serializeAudit(event),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined);
  },
});
