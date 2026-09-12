import type { ErrorCode, Mode, Outcome } from "../contracts/core-types.js";

export type RequestStage = "ACCEPTED" | "PROVIDER_CONNECT" | "TERMINAL";
export type RequestState = "ACCEPTED" | "RUNNING" | "TERMINAL";

export type RequestSnapshot = {
  request_id: string;
  revision: number;
  state: RequestState;
  stage: RequestStage;
  tab_id: number;
  started_at_ms: number;
  stage_started_at_ms: number;
  last_progress_at_ms: number;
  outcome?: Outcome;
  code?: ErrorCode;
};

type Request = RequestSnapshot & {
  mode: Mode;
  prompt: string;
  generation: number;
};

type Start = {
  request_id: string;
  tab_id: number;
  mode: Mode;
  prompt: string;
};

const copy = (request: Request): RequestSnapshot =>
  structuredClone({
    request_id: request.request_id,
    revision: request.revision,
    state: request.state,
    stage: request.stage,
    tab_id: request.tab_id,
    started_at_ms: request.started_at_ms,
    stage_started_at_ms: request.stage_started_at_ms,
    last_progress_at_ms: request.last_progress_at_ms,
    ...(request.outcome ? { outcome: request.outcome } : {}),
    ...(request.code ? { code: request.code } : {}),
  });

export class ChatRequestLifecycle {
  private readonly requests = new Map<string, Request>();

  public start(
    input: Start,
  ):
    | { kind: "accepted" | "existing"; snapshot: RequestSnapshot }
    | { kind: "conflict" } {
    const existing = this.requests.get(input.request_id);
    if (existing) {
      if (
        existing.tab_id !== input.tab_id ||
        existing.mode !== input.mode ||
        existing.prompt !== input.prompt
      )
        return { kind: "conflict" };
      return { kind: "existing", snapshot: copy(existing) };
    }
    const now = Date.now();
    const request: Request = {
      request_id: input.request_id,
      tab_id: input.tab_id,
      mode: input.mode,
      prompt: input.prompt,
      generation: 0,
      revision: 1,
      state: "ACCEPTED",
      stage: "ACCEPTED",
      started_at_ms: now,
      stage_started_at_ms: now,
      last_progress_at_ms: now,
    };
    this.requests.set(input.request_id, request);
    return { kind: "accepted", snapshot: copy(request) };
  }

  public startRun(requestId: string): number | undefined {
    const request = this.requests.get(requestId);
    if (!request || request.state !== "ACCEPTED") return;
    this.transition(request, "RUNNING", "PROVIDER_CONNECT");
    return request.generation;
  }

  public finish(
    requestId: string,
    generation: number,
    outcome: Outcome,
    code?: ErrorCode,
  ): RequestSnapshot | undefined {
    const request = this.requests.get(requestId);
    if (
      !request ||
      request.generation !== generation ||
      request.state === "TERMINAL"
    )
      return;
    this.transition(request, "TERMINAL", "TERMINAL");
    request.outcome = outcome;
    if (code) request.code = code;
    return copy(request);
  }

  public status(requestId: string, tabId: number): RequestSnapshot | undefined {
    const request = this.requests.get(requestId);
    return request?.tab_id === tabId ? copy(request) : undefined;
  }

  public cancel(requestId: string, tabId: number): RequestSnapshot | undefined {
    const request = this.requests.get(requestId);
    if (!request || request.tab_id !== tabId || request.state === "TERMINAL")
      return request?.tab_id === tabId ? copy(request) : undefined;
    request.generation += 1;
    this.transition(request, "TERMINAL", "TERMINAL");
    request.outcome = "CANCELLED";
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
    request.stage = stage;
    request.stage_started_at_ms = now;
    request.last_progress_at_ms = now;
  }
}
