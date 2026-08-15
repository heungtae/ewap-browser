import type { ErrorCode, ModelSemanticSnapshot } from "../contracts/types.js";
import { uuid } from "../security/canonical.js";
import { fail, isPlainObject } from "../security/validation.js";
export type HostRequest = {
  schema_version: 1;
  request_id: string;
  kind:
    | "ASK_INTERPRETATION"
    | "ACTION_PROPOSAL"
    | "BIND_SESSION"
    | "ISSUE_CONFIRMATION"
    | "VERIFY_CONFIRMATION"
    | "PROFILE_REPLAY_CAS";
  deployment_id: string;
  run_id: string;
  allowed_tools: string[];
  snapshot?: ModelSemanticSnapshot;
  cancel_after_ms: number;
};
export type HostResponse = {
  request_id: string;
  kind: string;
  result?: unknown;
  error_code?: ErrorCode;
};
export interface NativePort {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage(listener: (message: unknown) => void): void;
  onDisconnect(listener: () => void): void;
}
export class NativeClient {
  private readonly pending = new Map<
    string,
    { resolve: (value: HostResponse) => void; reject: (reason: Error) => void }
  >();
  public constructor(
    private readonly port: NativePort,
    private readonly deploymentId: string,
  ) {
    port.onMessage((value) => this.receive(value));
    port.onDisconnect(() => this.close());
  }
  public request(
    kind: HostRequest["kind"],
    runId: string,
    allowedTools: string[],
    snapshot?: ModelSemanticSnapshot,
  ): Promise<HostResponse> {
    if (
      !allowedTools.every((tool) => typeof tool === "string") ||
      (snapshot && containsForbiddenBoundaryKey(snapshot))
    )
      return fail("INVALID_ARGUMENT");
    const request: HostRequest = {
      schema_version: 1,
      request_id: uuid(),
      kind,
      deployment_id: this.deploymentId,
      run_id: runId,
      allowed_tools: allowedTools,
      ...(snapshot ? { snapshot } : {}),
      cancel_after_ms: 30_000,
    };
    return new Promise((resolve, reject) => {
      this.pending.set(request.request_id, { resolve, reject });
      this.port.postMessage(request);
    });
  }
  public cancel(requestId: string): void {
    const pending = this.pending.get(requestId);
    if (pending) {
      this.pending.delete(requestId);
      pending.reject(new Error("TRANSPORT_FAILED"));
      this.port.postMessage({
        schema_version: 1,
        kind: "CANCEL_REQUEST",
        request_id: requestId,
      });
    }
  }
  private receive(value: unknown): void {
    if (
      !isPlainObject(value) ||
      typeof value.request_id !== "string" ||
      typeof value.kind !== "string" ||
      "ref_id" in value ||
      "mapping" in value
    )
      return;
    const pending = this.pending.get(value.request_id);
    if (!pending) return;
    this.pending.delete(value.request_id);
    pending.resolve(value as HostResponse);
  }
  private close(): void {
    for (const pending of this.pending.values())
      pending.reject(new Error("TRANSPORT_FAILED"));
    this.pending.clear();
  }
  public static noConfig(): never {
    return fail("AI_HUB_NOT_CONFIGURED");
  }
}
const forbiddenBoundaryKeys = new Set([
  "ref_id",
  "mapping",
  "value",
  "value_digest",
  "url",
  "path",
]);
const containsForbiddenBoundaryKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsForbiddenBoundaryKey);
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(
    ([key, nested]) =>
      forbiddenBoundaryKeys.has(key) || containsForbiddenBoundaryKey(nested),
  );
};
