import type { ErrorCode, Outcome } from "../contracts/core-types.js";
import { isErrorCode } from "../contracts/error-codes.js";
import { copy, type Request } from "./request-store.js";
import { RequestExecution } from "./request-execution.js";
import type { DiagnosticReason } from "./execution-diagnostics.js";

import type {
  RequestSnapshot,
  RequestState,
  RequestStage,
} from "../contracts/request-types.js";
export type { RequestSnapshot } from "../contracts/request-types.js";

export class ChatRequestLifecycle extends RequestExecution {
  public startRun(requestId: string): number | undefined {
    const request = this.requests.get(requestId);
    if (!request || request.state !== "ACCEPTED") return;
    this.transition(request, "RUNNING", "ACCEPTED");
    this.diagnostics?.stage(requestId, "router", "PREPARING_PAGE");
    this.budget.start(requestId, () => this.expire(requestId));
    return request.generation;
  }

  public finish(
    requestId: string,
    generation: number,
    outcome: Outcome,
    code?: ErrorCode,
    reason: DiagnosticReason = "request_settled",
  ): RequestSnapshot | undefined {
    const request = this.requests.get(requestId);
    if (
      !request ||
      request.generation !== generation ||
      request.state === "TERMINAL"
    )
      return;
    this.transition(request, "TERMINAL", "TERMINAL");
    if (
      request.dispatch_started &&
      (outcome === "FAILED" || outcome === "CANCELLED")
    )
      outcome = "UNKNOWN";
    request.outcome = outcome;
    if (code) request.code = code;
    this.diagnostics?.terminal(requestId, outcome, code, reason);
    this.controllers.get(requestId)?.abort();
    this.controllers.delete(requestId);
    this.budget.stop(requestId);
    this.onTerminal?.(request.tab_id, outcome, code);
    void this.flush().catch(() => undefined);
    return copy(request);
  }

  public status(
    requestId: string,
    tabId: number,
    owner = "",
  ): RequestSnapshot | undefined {
    const request = this.requests.get(requestId);
    if (request?.tab_id !== tabId || request.owner !== owner) {
      if (request?.tab_id === tabId)
        this.diagnostics?.statusRejected(requestId);
      return;
    }
    this.diagnostics?.status(requestId, request.stage);
    return copy(request);
  }

  public result(requestId: string): Record<string, unknown> | undefined {
    return this.requests.get(requestId)?.result;
  }
  public settled(
    requestId: string,
    generation: number,
    result: Record<string, unknown>,
  ): void {
    const request = this.requests.get(requestId);
    if (
      !request ||
      request.generation !== generation ||
      request.state === "TERMINAL"
    )
      return;
    if (
      result.ok &&
      (result.state === "WORKFLOW_CANDIDATES" ||
        request.state === "WAITING_USER")
    ) {
      request.result = result;
      this.transition(
        request,
        "WAITING_USER",
        result.state === "WORKFLOW_CANDIDATES"
          ? "SELECTION_REQUIRED"
          : "AWAITING_REVIEW",
      );
      return;
    }
    this.finish(
      requestId,
      generation,
      result.ok
        ? "VERIFIED"
        : result.outcome === "UNKNOWN"
          ? "UNKNOWN"
          : "FAILED",
      isErrorCode(result.code) ? result.code : undefined,
    );
  }
  public endTab(tabId: number, outcome: Outcome, code?: ErrorCode): void {
    const request = [...this.requests.values()].find(
      (item) => item.tab_id === tabId && item.state !== "TERMINAL",
    );
    if (request)
      this.finish(
        request.request_id,
        request.generation,
        outcome,
        code,
        "chat_run_terminal",
      );
  }

  public progress(tabId: number, stage: RequestStage): void {
    const request = [...this.requests.values()].find(
      (candidate) =>
        candidate.tab_id === tabId && candidate.state !== "TERMINAL",
    );
    if (!request) return;
    if (request.stage !== stage)
      this.diagnostics?.stage(
        request.request_id,
        stage === "PROVIDER_BODY" ? "provider" : "router",
        stage,
      );
    this.transition(
      request,
      stage === "AWAITING_REVIEW" || stage === "SELECTION_REQUIRED"
        ? "WAITING_USER"
        : "RUNNING",
      stage,
    );
  }

  public cancel(
    requestId: string,
    tabId: number,
    owner = "",
    reason: DiagnosticReason = "panel_stop",
    outcome: Outcome = "CANCELLED",
    code?: ErrorCode,
  ): RequestSnapshot | undefined {
    const request = this.requests.get(requestId);
    if (request?.owner !== owner) return;
    if (!request || request.tab_id !== tabId || request.state === "TERMINAL")
      return request?.tab_id === tabId ? copy(request) : undefined;
    request.generation += 1;
    this.transition(request, "TERMINAL", "TERMINAL");
    request.outcome = request.dispatch_started ? "UNKNOWN" : outcome;
    if (code) request.code = code;
    this.controllers.get(requestId)?.abort();
    this.controllers.delete(requestId);
    this.budget.stop(requestId);
    this.onTerminal?.(request.tab_id, request.outcome, code);
    this.diagnostics?.terminal(requestId, request.outcome, code, reason);
    void this.flush().catch(() => undefined);
    return copy(request);
  }

  private transition(
    request: Request,
    state: RequestState,
    stage: RequestStage,
  ): void {
    const now = Date.now();
    request.revision += 1;
    request.state = state;
    if (request.stage !== stage) request.stage_started_at_ms = now;
    request.stage = stage;
    request.last_progress_at_ms = now;
    this.budget.stage(request.request_id, state === "WAITING_USER", () =>
      this.expire(request.request_id),
    );
    void this.flush().catch(() => undefined);
  }
}
