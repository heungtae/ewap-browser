import type { ErrorCode, Outcome } from "../contracts/core-types.js";
import { DiagnosticsStorage } from "./diagnostics-storage.js";
import {
  validDiagnostic,
  diagnosticStages,
} from "../contracts/diagnostics-validation.js";

import type {
  DiagnosticsLevel,
  DiagnosticComponent,
  DiagnosticEvent,
  DiagnosticRecord,
} from "../contracts/diagnostic-types.js";
export type {
  DiagnosticsLevel,
  DiagnosticRecord,
} from "../contracts/diagnostic-types.js";

type RequestInfo = { tabId: number; startedAt: number; terminal: boolean };
const maxRecords = 2_000;
const maxRequestRecords = 300;
const ttlMs = 30 * 60_000;
/**
 * A deliberately closed, local-only trace. Its API only accepts allowlisted
 * fields so prompts, URL data, provider payloads, and exception messages have
 * no path into storage or the developer console.
 */
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
    this.add(requestId, "panel", "request.accepted", "info", "ACCEPTED");
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

  public actForTab(tabId: number, stage: string, finished = false): void {
    const requestId = [...this.requests.entries()].find(
      ([, request]) => request.tabId === tabId && !request.terminal,
    )?.[0];
    if (requestId) this.stage(requestId, "act", stage, finished);
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
    this.prune(Date.now());
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

  public setLevel(level: DiagnosticsLevel): DiagnosticsLevel {
    this.level = level;
    this.debugUntil = level === "debug" ? Date.now() + ttlMs : 0;
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
    level: DiagnosticRecord["level"],
    stage?: string,
    outcome?: Outcome,
    code?: ErrorCode,
  ): void {
    this.prune(Date.now());
    if (this.level === "off") return;
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
    if (this.level === "debug") console.info("[ContextPilot][trace]", record);
    this.persist(event === "request.terminal");
  }
}
