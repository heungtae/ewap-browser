import type { Mode } from "../contracts/core-types.js";
import type { RequestSnapshot } from "../contracts/request-types.js";
import type { ExecutionDiagnostics } from "./execution-diagnostics.js";
import { ContractError } from "../security/validation.js";
import { digestCanonical } from "../security/canonical.js";
import { RequestPersistence } from "./request-persistence.js";
export type Request = RequestSnapshot & {
  mode: Mode;
  prompt: string;
  generation: number;
  owner: string;
  restored?: boolean;
  result?: Record<string, unknown>;
};

type Start = {
  request_id: string;
  tab_id: number;
  mode: Mode;
  prompt: string;
  owner?: string;
};

export const copy = (request: Request): RequestSnapshot =>
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
    ...(request.dispatch_started ? { dispatch_started: true } : {}),
  });

export class RequestStore {
  protected readonly requests = new Map<string, Request>();
  public constructor(
    protected readonly diagnostics?: ExecutionDiagnostics,
    private readonly persistence = new RequestPersistence(),
  ) {}

  public async restore(): Promise<void> {
    for (const saved of await this.persistence.restore()) {
      const request: Request = {
        ...saved,
        mode: "ask",
        prompt: "",
        generation: 1,
        restored: true,
      };
      if (request.state !== "TERMINAL") {
        request.state = "TERMINAL";
        request.outcome = request.dispatch_started ? "UNKNOWN" : "FAILED";
        request.code = "WORKER_RESTARTED";
        request.revision += 1;
        request.last_progress_at_ms = Date.now();
      }
      this.requests.set(request.request_id, request);
      this.diagnostics?.bind(
        request.request_id,
        request.tab_id,
        request.started_at_ms,
        true,
      );
      if (request.code === "WORKER_RESTARTED" && request.outcome)
        this.diagnostics?.restored(request.request_id, request.outcome);
    }
    await this.flush();
  }
  public flush(): Promise<void> {
    const now = Date.now();
    const terminal = [...this.requests.values()]
      .filter((r) => r.state === "TERMINAL")
      .sort((a, b) => b.last_progress_at_ms - a.last_progress_at_ms);
    for (const [index, request] of terminal.entries())
      if (index >= 50 || now - request.last_progress_at_ms > 30 * 60_000) {
        this.requests.delete(request.request_id);
        this.diagnostics?.clear(request.request_id, request.tab_id);
      }
    return this.persistence.save(
      [...this.requests.values()].map((r) => ({ ...copy(r), owner: r.owner })),
    );
  }

  public start(
    input: Start,
  ):
    | { kind: "accepted" | "existing"; snapshot: RequestSnapshot }
    | { kind: "conflict" } {
    const existing = this.requests.get(input.request_id);
    if (existing) {
      if (
        existing.tab_id !== input.tab_id ||
        existing.owner !== (input.owner ?? "") ||
        (!existing.restored &&
          (existing.mode !== input.mode || existing.prompt !== input.prompt))
      )
        return { kind: "conflict" };
      return { kind: "existing", snapshot: copy(existing) };
    }
    const now = Date.now();
    if (
      [...this.requests.values()].some(
        (request) =>
          request.tab_id === input.tab_id && request.state !== "TERMINAL",
      )
    )
      throw new ContractError("SESSION_STREAM_BUSY");
    const request: Request = {
      request_id: input.request_id,
      tab_id: input.tab_id,
      mode: input.mode,
      prompt: input.prompt,
      owner: input.owner ?? "",
      generation: 0,
      revision: 1,
      state: "ACCEPTED",
      stage: "ACCEPTED",
      started_at_ms: now,
      stage_started_at_ms: now,
      last_progress_at_ms: now,
    };
    this.requests.set(input.request_id, request);
    this.diagnostics?.accept(input.request_id, input.tab_id, now);
    return { kind: "accepted", snapshot: copy(request) };
  }

  /** A bundle can survive a document-owner change, but never a tab change. */
  public diagnosticSnapshot(
    requestId: string,
    tabId: number,
  ):
    | (RequestSnapshot & {
        mode: Mode;
        prompt_length: number;
        prompt_digest: string;
      })
    | undefined {
    const request = this.requests.get(requestId);
    if (!request || request.tab_id !== tabId) return;
    return {
      ...copy(request),
      mode: request.mode,
      prompt_length: request.prompt.length,
      prompt_digest: digestCanonical(request.prompt),
    };
  }
}
