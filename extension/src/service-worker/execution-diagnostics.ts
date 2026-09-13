import type { ErrorCode, Outcome } from "../contracts/core-types.js";
import type { BrowserStorage } from "./browser-api.js";

export type DiagnosticsLevel = "off" | "basic" | "debug";
export type DiagnosticComponent =
  | "panel"
  | "router"
  | "page"
  | "profile"
  | "workflow"
  | "provider"
  | "act"
  | "transport"
  | "storage";
export type DiagnosticEvent =
  | "request.accepted"
  | "stage.started"
  | "stage.finished"
  | "request.terminal";
export type DiagnosticRecord = {
  schema_version: 1;
  sequence: number;
  timestamp_ms: number;
  worker_instance_id: string;
  request_id: string;
  component: DiagnosticComponent;
  event: DiagnosticEvent;
  level: "info" | "warn" | "error" | "debug";
  stage?: string;
  outcome?: Outcome;
  code?: ErrorCode;
  elapsed_ms?: number;
};

type RequestInfo = { tabId: number; startedAt: number; terminal: boolean };
type Persisted = {
  level: DiagnosticsLevel;
  records: DiagnosticRecord[];
  dropped_count: number;
};

const storageKey = "execution_diagnostics_v1";
const maxRecords = 2_000;
const maxRequestRecords = 300;
const ttlMs = 30 * 60_000;

/**
 * A deliberately closed, local-only trace. Its API only accepts allowlisted
 * fields so prompts, URL data, provider payloads, and exception messages have
 * no path into storage or the developer console.
 */
export class ExecutionDiagnostics {
  private level: DiagnosticsLevel = "basic";
  private sequence = 0;
  private droppedCount = 0;
  private readonly records: DiagnosticRecord[] = [];
  private readonly requests = new Map<string, RequestInfo>();
  private readonly workerInstanceId = crypto.randomUUID();

  public constructor(private readonly storage?: BrowserStorage) {}

  public accept(requestId: string, tabId: number, startedAt: number): void {
    this.requests.set(requestId, { tabId, startedAt, terminal: false });
    this.add(requestId, "panel", "request.accepted", "info", "ACCEPTED");
  }

  public stage(
    requestId: string,
    component: DiagnosticComponent,
    stage: string,
    finished = false,
  ): void {
    this.add(
      requestId,
      component,
      finished ? "stage.finished" : "stage.started",
      "info",
      stage,
    );
  }

  public activity(tabId: number, stage: string, finished = false): void {
    const requestId = [...this.requests.entries()].find(
      ([, request]) => request.tabId === tabId && !request.terminal,
    )?.[0];
    if (!requestId) return;
    const component: DiagnosticComponent =
      stage === "RESOLVING_PROFILE"
        ? "profile"
        : stage === "DISCOVERING_WORKFLOWS"
          ? "workflow"
          : stage === "CONTACTING_PROVIDER"
            ? "provider"
            : "page";
    this.stage(requestId, component, stage, finished);
  }

  public terminal(requestId: string, outcome: Outcome, code?: ErrorCode): void {
    const request = this.requests.get(requestId);
    if (request) request.terminal = true;
    this.add(
      requestId,
      "router",
      "request.terminal",
      outcome === "VERIFIED" ? "info" : "error",
      "TERMINAL",
      outcome,
      code,
    );
  }

  public list(requestId: string, tabId: number, after: number, limit: number) {
    const request = this.requests.get(requestId);
    if (!request || request.tabId !== tabId) return;
    const records = this.records
      .filter(
        (record) => record.request_id === requestId && record.sequence > after,
      )
      .slice(0, limit);
    return {
      records,
      next_sequence: records.at(-1)?.sequence ?? after,
      dropped_count: this.droppedCount,
      level: this.level,
    };
  }

  public setLevel(level: DiagnosticsLevel): DiagnosticsLevel {
    this.level = level;
    this.persist();
    return this.level;
  }

  public clear(requestId: string, tabId: number): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.tabId !== tabId) return false;
    for (let index = this.records.length - 1; index >= 0; index -= 1)
      if (this.records[index]?.request_id === requestId)
        this.records.splice(index, 1);
    this.persist();
    return true;
  }

  private add(
    requestId: string,
    component: DiagnosticComponent,
    event: DiagnosticEvent,
    level: DiagnosticRecord["level"],
    stage?: string,
    outcome?: Outcome,
    code?: ErrorCode,
  ): void {
    if (this.level === "off") return;
    const request = this.requests.get(requestId);
    if (!request) return;
    this.prune(Date.now());
    const perRequest = this.records.filter(
      (record) => record.request_id === requestId,
    ).length;
    if (this.records.length >= maxRecords || perRequest >= maxRequestRecords) {
      this.droppedCount += 1;
      return;
    }
    const record: DiagnosticRecord = {
      schema_version: 1,
      sequence: ++this.sequence,
      timestamp_ms: Date.now(),
      worker_instance_id: this.workerInstanceId,
      request_id: requestId,
      component,
      event,
      level,
      ...(stage ? { stage } : {}),
      ...(outcome ? { outcome } : {}),
      ...(code ? { code } : {}),
      elapsed_ms: Math.max(0, Date.now() - request.startedAt),
    };
    this.records.push(record);
    if (this.level === "debug") console.info("[ContextPilot][trace]", record);
    this.persist();
  }

  private prune(now: number): void {
    while (this.records[0] && now - this.records[0].timestamp_ms > ttlMs)
      this.records.shift();
  }

  private persist(): void {
    const value: Persisted = {
      level: this.level,
      records: this.records,
      dropped_count: this.droppedCount,
    };
    void this.storage?.session
      .set?.({ [storageKey]: value })
      .catch(() => undefined);
  }
}
