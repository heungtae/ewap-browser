import type { ErrorCode, Outcome } from "../contracts/core-types.js";
import { DiagnosticsStorage } from "./diagnostics-storage.js";
import {
  validDiagnostic,
  diagnosticStages,
} from "../contracts/diagnostics-validation.js";

import type {
  DiagnosticReason,
  DiagnosticsLevel,
  DiagnosticRecordLevel,
  DiagnosticComponent,
  DiagnosticEvent,
  DiagnosticRecord,
} from "../contracts/diagnostic-types.js";
export type {
  DiagnosticReason,
  DiagnosticsLevel,
  DiagnosticRecord,
} from "../contracts/diagnostic-types.js";

type RequestInfo = { tabId: number; startedAt: number; terminal: boolean };
const maxRecords = 2_000;
const maxRequestRecords = 300;
const ttlMs = 30 * 60_000;
const levelRank: Record<DiagnosticsLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};
const diagnosticMessage = (
  event: DiagnosticEvent,
  stage?: string,
  outcome?: Outcome,
  code?: ErrorCode,
  reason?: DiagnosticReason,
): string =>
  [
    `Processed ${event}`,
    stage ? `at stage ${stage}` : undefined,
    outcome ? `with outcome ${outcome}` : undefined,
    code ? `(code: ${code})` : undefined,
    reason ? `(reason: ${reason})` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
/** Local execution trace with one conventional, human-readable message per event. */
export class ExecutionDiagnostics extends DiagnosticsStorage {
  private readonly requests = new Map<string, RequestInfo>();
  private readonly workerInstanceId = crypto.randomUUID();
  public bind(
    requestId: string,
    tabId: number,
    startedAt: number,
    terminal = false,
  ): void {
    this.requests.set(requestId, { tabId, startedAt, terminal });
  }

  public accept(requestId: string, tabId: number, startedAt: number): void {
    this.requests.set(requestId, { tabId, startedAt, terminal: false });
    this.add(requestId, "panel", "request.accepted", "debug", "ACCEPTED");
  }

  public stage(
    requestId: string,
    component: DiagnosticComponent,
    stage: string,
    finished = false,
  ): void {
    if (!diagnosticStages.includes(stage)) return;
    this.add(
      requestId,
      component,
      finished ? "stage.finished" : "stage.started",
      "debug",
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

  public actForTab(tabId: number, stage: string, finished = false): void {
    const requestId = [...this.requests.entries()].find(
      ([, request]) => request.tabId === tabId && !request.terminal,
    )?.[0];
    if (requestId) this.stage(requestId, "act", stage, finished);
  }

  public status(requestId: string, stage: string): void {
    this.add(requestId, "panel", "request.status", "trace", stage);
  }

  public statusRejected(requestId: string): void {
    this.add(
      requestId,
      "panel",
      "request.status_rejected",
      "error",
      undefined,
      undefined,
      "REQUEST_NOT_FOUND",
      "panel_context_changed",
    );
  }

  public restored(requestId: string, outcome: Outcome): void {
    this.add(
      requestId,
      "storage",
      "request.restored",
      "error",
      "TERMINAL",
      outcome,
      "WORKER_RESTARTED",
      "worker_restarted",
    );
  }

  public cancelRequested(requestId: string): void {
    this.add(
      requestId,
      "panel",
      "request.cancel_requested",
      "trace",
      undefined,
      undefined,
      undefined,
      "panel_stop",
    );
  }

  public timeout(requestId: string): void {
    this.add(
      requestId,
      "router",
      "request.timeout",
      "error",
      undefined,
      undefined,
      "REQUEST_TIMEOUT",
      "request_timeout",
    );
  }

  public terminal(
    requestId: string,
    outcome: Outcome,
    code?: ErrorCode,
    reason: DiagnosticReason = "request_settled",
  ): void {
    const request = this.requests.get(requestId);
    if (request) request.terminal = true;
    this.add(
      requestId,
      "router",
      "request.terminal",
      outcome === "VERIFIED"
        ? "info"
        : outcome === "CANCELLED"
          ? "warn"
          : "error",
      "TERMINAL",
      outcome,
      code,
      reason,
    );
  }

  public list(requestId: string, tabId: number, after: number, limit: number) {
    this.prune(Date.now());
    if (requestId === "__all__") {
      const records = this.records
        .filter((record) => record.sequence > after)
        .slice(0, limit);
      return {
        records,
        next_sequence: records.at(-1)?.sequence ?? after,
        dropped_count: this.droppedCount,
        level: this.level,
        storage_failed: this.storageFailed,
      };
    }
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
      storage_failed: this.storageFailed,
    };
  }

  /** Export-only view: records are still limited to the bound tab. */
  public listForTab(tabId: number): {
    records: DiagnosticRecord[];
    dropped_count: number;
    level: DiagnosticsLevel;
    storage_failed: boolean;
  } {
    this.prune(Date.now());
    return {
      records: this.records.filter(
        (record) => this.requests.get(record.request_id)?.tabId === tabId,
      ),
      dropped_count: this.droppedCount,
      level: this.level,
      storage_failed: this.storageFailed,
    };
  }

  public getWorkerInstanceId(): string {
    return this.workerInstanceId;
  }

  public setLevel(level: DiagnosticsLevel): DiagnosticsLevel {
    this.level = level;
    this.debugUntil = level === "trace" ? Date.now() + ttlMs : 0;
    if (level !== "trace") this.retainAtLevel();
    this.persist(true);
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
    level: DiagnosticRecordLevel,
    stage?: string,
    outcome?: Outcome,
    code?: ErrorCode,
    reason?: DiagnosticReason,
  ): void {
    this.prune(Date.now());
    if (levelRank[level] > levelRank[this.level]) return;
    const request = this.requests.get(requestId);
    if (!request) return;
    this.prune(Date.now());
    const perRequest = this.records.filter(
      (record) => record.request_id === requestId,
    ).length;
    if (this.records.length >= maxRecords || perRequest >= maxRequestRecords) {
      this.droppedCount += 1;
      const index =
        perRequest >= maxRequestRecords
          ? this.records.findIndex((r) => r.request_id === requestId)
          : 0;
      this.records.splice(index, 1);
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
      ...(reason ? { reason } : {}),
      message: diagnosticMessage(event, stage, outcome, code, reason),
      elapsed_ms: Math.max(0, Date.now() - request.startedAt),
    };
    if (!validDiagnostic(record)) return;
    this.records.push(record);
    while (
      new TextEncoder().encode(JSON.stringify(this.records)).length > 900_000
    ) {
      this.records.shift();
      this.droppedCount += 1;
    }
    if (this.level === "trace") console.info("[ContextPilot][trace]", record);
    this.persist(event === "request.terminal");
  }
}
