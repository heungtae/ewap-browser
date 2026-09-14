import type { ErrorCode, Outcome } from "../contracts/core-types.js";
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
  ): RequestSnapshot | undefined;
  protected readonly controllers = new Map<string, AbortController>();
  protected readonly budget = new RequestBudget();
  public onTerminal:
    | ((tabId: number, outcome: Outcome, code?: ErrorCode) => void)
    | undefined;
  protected expire(id: string): void {
    const request = this.requests.get(id);
    if (request)
      this.finish(
        id,
        request.generation,
        request.dispatch_started ? "UNKNOWN" : "FAILED",
        "REQUEST_TIMEOUT",
      );
  }
  public async beforeDispatch(tabId: number): Promise<void> {
    const request = [...this.requests.values()].find(
      (r) => r.tab_id === tabId && r.state !== "TERMINAL",
    );
    if (!request) return;
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
    this.context(request.request_id).check();
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
    return {
      tabId: request.tab_id,
      ...(request.owner.includes(":")
        ? { documentEpoch: request.owner.split(":").slice(1).join(":") }
        : {}),
      signal: controller.signal,
      progress: (stage) => {
        if (request.state !== "TERMINAL") this.progress(request.tab_id, stage);
      },
      check: () => {
        if (request.state === "TERMINAL")
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
