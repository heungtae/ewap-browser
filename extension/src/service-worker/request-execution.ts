import type { ErrorCode, Outcome } from "../contracts/core-types.js";
import type { DiagnosticReason } from "./execution-diagnostics.js";
import type {
  RequestSnapshot,
  RequestStage,
} from "../contracts/request-types.js";
import { RequestStore } from "./request-store.js";
import { ContractError } from "../security/validation.js";
import type { RequestContext } from "./request-context.js";
import { RequestBudget } from "./request-budget.js";
export abstract class RequestExecution extends RequestStore {
  public validateDocument:
    | ((tabId: number, epoch: string) => boolean)
    | undefined;
  public activeContext(tabId: number): RequestContext | undefined {
    const request = [...this.requests.values()].find(
      (r) => r.tab_id === tabId && r.state !== "TERMINAL",
    );
    return request ? this.context(request.request_id) : undefined;
  }
  public abstract progress(tabId: number, stage: RequestStage): void;
  public abstract finish(
    id: string,
    generation: number,
    outcome: Outcome,
    code?: ErrorCode,
    reason?: DiagnosticReason,
  ): RequestSnapshot | undefined;
  protected readonly controllers = new Map<string, AbortController>();
  protected readonly budget = new RequestBudget();
  public onTerminal:
    | ((
        tabId: number,
        outcome: Outcome,
        code?: ErrorCode,
        requestId?: string,
      ) => void)
    | undefined;
  protected expire(id: string): void {
    const request = this.requests.get(id);
    if (request) {
      this.diagnostics?.timeout(id);
      this.finish(
        id,
        request.generation,
        request.dispatch_started ? "UNKNOWN" : "FAILED",
        "REQUEST_TIMEOUT",
        "request_timeout",
      );
    }
  }
  public async beforeDispatch(
    tabId: number,
    bound?: RequestContext,
  ): Promise<void> {
    bound?.check();
    const request = [...this.requests.values()].find(
      (r) => r.tab_id === tabId && r.state !== "TERMINAL",
    );
    if (!request || (bound && request.request_id !== bound.requestId))
      throw new ContractError("POLICY_DENIED");
    const context = bound ?? this.context(request.request_id);
    context.check();
    request.dispatch_started = true;
    this.progress(tabId, "DISPATCH");
    try {
      await this.flush();
    } catch {
      delete request.dispatch_started;
      this.finish(
        request.request_id,
        request.generation,
        "FAILED",
        "STORAGE_BOUNDARY_UNAVAILABLE",
      );
      throw new ContractError("STORAGE_BOUNDARY_UNAVAILABLE");
    }
    context.check();
    this.diagnostics?.stage(request.request_id, "act", "DISPATCH");
  }
  public context(id: string): RequestContext {
    const request = this.requests.get(id);
    if (!request) throw new ContractError("REQUEST_NOT_FOUND");
    let controller = this.controllers.get(id);
    if (!controller) {
      controller = new AbortController();
      this.controllers.set(id, controller);
    }
    const generation = request.generation;
    const owner = request.owner;
    return {
      requestId: id,
      generation,
      tabId: request.tab_id,
      ...(request.owner.includes(":")
        ? { documentEpoch: request.owner.split(":").slice(1).join(":") }
        : {}),
      signal: controller.signal,
      progress: (stage) => {
        if (
          request.state !== "TERMINAL" &&
          request.generation === generation &&
          this.requests.get(id) === request
        )
          this.progress(request.tab_id, stage);
      },
      check: () => {
        if (
          controller.signal.aborted ||
          this.requests.get(id) !== request ||
          request.generation !== generation ||
          request.owner !== owner ||
          request.state === "TERMINAL"
        )
          throw new ContractError("POLICY_DENIED");
        const epoch = request.owner.split(":").slice(1).join(":");
        if (
          epoch &&
          this.validateDocument &&
          !this.validateDocument(request.tab_id, epoch)
        ) {
          this.finish(
            id,
            request.generation,
            request.dispatch_started ? "UNKNOWN" : "FAILED",
            "PAGE_SCOPE_STALE",
          );
          throw new ContractError("PAGE_SCOPE_STALE");
        }
      },
    };
  }
}
