import type { RequestSnapshot } from "../contracts/request-types.js";
import { isPlainObject } from "../security/validation.js";
import { isErrorCode } from "../contracts/error-codes.js";

export type StoredRequest = RequestSnapshot & { owner: string };
export type RequestStorage = {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
};
const key = "execution_requests_v1";
const ttl = 30 * 60_000;
const keys = [
  "request_id",
  "revision",
  "state",
  "stage",
  "tab_id",
  "started_at_ms",
  "stage_started_at_ms",
  "last_progress_at_ms",
  "outcome",
  "code",
  "owner",
  "dispatch_started",
];
export class RequestPersistence {
  private queue = Promise.resolve();
  public constructor(private readonly storage?: RequestStorage) {}
  public async restore(): Promise<StoredRequest[]> {
    const value = (await this.storage?.get(key))?.[key];
    if (!Array.isArray(value)) return [];
    return value
      .filter((row): row is StoredRequest => {
        if (
          !isPlainObject(row) ||
          Object.keys(row).some((field) => !keys.includes(field))
        )
          return false;
        return (
          typeof row.request_id === "string" &&
          /^[0-9a-f-]{36}$/i.test(row.request_id) &&
          typeof row.owner === "string" &&
          row.owner.length <= 256 &&
          typeof row.revision === "number" &&
          Number.isInteger(row.revision) &&
          typeof row.tab_id === "number" &&
          Number.isInteger(row.tab_id) &&
          ["ACCEPTED", "RUNNING", "WAITING_USER", "TERMINAL"].includes(
            String(row.state),
          ) &&
          [
            "ACCEPTED",
            "PREPARING_PAGE",
            "RESOLVING_PROFILE",
            "DISCOVERING_WORKFLOWS",
            "CONTACTING_PROVIDER",
            "AWAITING_REVIEW",
            "SELECTION_REQUIRED",
            "COMPLETED",
            "PROVIDER_BODY",
            "DISPATCH",
            "VERIFY",
            "FAILED",
            "TERMINAL",
          ].includes(String(row.stage)) &&
          [
            row.started_at_ms,
            row.stage_started_at_ms,
            row.last_progress_at_ms,
          ].every(
            (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
          ) &&
          (row.outcome === undefined ||
            ["VERIFIED", "FAILED", "UNKNOWN", "CANCELLED"].includes(
              String(row.outcome),
            )) &&
          (row.code === undefined || isErrorCode(row.code)) &&
          (row.dispatch_started === undefined ||
            row.dispatch_started === true) &&
          (row.state !== "TERMINAL" ||
            Date.now() - (row.last_progress_at_ms as number) < ttl)
        );
      })
      .slice(-100);
  }
  public save(requests: StoredRequest[]): Promise<void> {
    const value = structuredClone(requests);
    const next = this.queue
      .catch(() => undefined)
      .then(() => this.storage?.set({ [key]: value }));
    this.queue = next.then(() => undefined);
    return this.queue;
  }
}
