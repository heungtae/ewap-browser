import { acceptResult, type AcceptedDecision } from "./accept-result.js";
import { DecisionBudget } from "./budget.js";
import { bytes, digest } from "./digest.js";
import { validateFrame } from "./frame.js";
import { nativeRequest } from "./questions.js";
import { type ControllerPort } from "./port.js";
import { type DecisionContext, type DecisionFrame } from "./schema.js";
export type ControllerOutcome = {
  decision?: AcceptedDecision;
  outcome: AcceptedDecision["outcome"] | "CONTROLLER_UNAVAILABLE";
  reason?: string;
  firstFailure?: string;
  counters: ReturnType<DecisionBudget["snapshot"]>;
};
export class DecisionController {
  private firstFailure: string | undefined;
  private readonly repeats = new Map<string, number>();
  private taskId: string | undefined;
  public constructor(
    private readonly port: ControllerPort | undefined,
    public readonly budget: DecisionBudget,
    private readonly current: () => DecisionContext,
  ) {}
  public async evaluate(
    input: DecisionFrame,
    signal?: AbortSignal,
  ): Promise<ControllerOutcome> {
    const finish = (
      outcome: ControllerOutcome["outcome"],
      reason?: string,
      decision?: AcceptedDecision,
    ): ControllerOutcome => ({
      outcome,
      ...(reason ? { reason } : {}),
      ...(decision ? { decision } : {}),
      ...(this.firstFailure ? { firstFailure: this.firstFailure } : {}),
      counters: this.budget.snapshot(),
    });
    let frame: DecisionFrame;
    try {
      frame = validateFrame(input);
    } catch {
      this.firstFailure ??= "INVALID_FRAME";
      return finish("UNKNOWN", "INVALID_FRAME");
    }
    this.taskId ??= frame.context.taskId;
    if (
      frame.context.taskId !== this.taskId ||
      digest(frame.context) !== digest(this.current()) ||
      signal?.aborted
    )
      return finish("UNKNOWN", "STALE_OR_CANCELLED_FRAME");
    if (!this.port) {
      this.firstFailure ??= "CONTROLLER_MISSING_OR_DISABLED";
      return finish("CONTROLLER_UNAVAILABLE", this.firstFailure);
    }
    if (digest(frame.budgets) !== digest(this.budget.snapshot()))
      return finish("UNKNOWN", "BUDGET_SNAPSHOT_MISMATCH");
    const signature = digest({
      context: frame.context,
      phase: frame.phase,
      candidateSet: frame.candidateSet,
      facts: frame.facts,
      stateComplete: frame.stateComplete,
    });
    const repeated = this.repeats.get(signature) ?? 0;
    if (repeated >= 2) return finish("UNKNOWN", "NO_PROGRESS");
    let reservation: ReturnType<DecisionBudget["reserve"]>;
    try {
      reservation = this.budget.reserve(bytes(nativeRequest(frame)));
    } catch {
      this.firstFailure ??= "CONTROLLER_BUDGET_EXHAUSTED";
      return finish("CONTROLLER_UNAVAILABLE", "CONTROLLER_BUDGET_EXHAUSTED");
    }
    this.repeats.set(signature, repeated + 1);
    const abort = new AbortController();
    const forward = () => abort.abort();
    signal?.addEventListener("abort", forward, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(new Error("CONTROLLER_TIMEOUT"));
        }, reservation.timeoutMs);
      });
      const cancellation = new Promise<never>((_resolve, reject) => {
        abort.signal.addEventListener(
          "abort",
          () =>
            reject(
              new Error(
                signal?.aborted ? "CONTROLLER_CANCELLED" : "CONTROLLER_TIMEOUT",
              ),
            ),
          { once: true },
        );
      });
      const result = await Promise.race([
        this.port.evaluate(frame, abort.signal),
        timeout,
        cancellation,
      ]);
      if (
        digest(frame.context) !== digest(this.current()) ||
        abort.signal.aborted
      )
        throw new Error("STALE_OR_CANCELLED_RESULT");
      const decision = acceptResult(frame, result);
      settled = true;
      reservation.settle(result.usage);
      if (decision.reason) this.firstFailure ??= decision.reason;
      return finish(decision.outcome, decision.reason, decision);
    } catch (error) {
      if (!settled) reservation.settle();
      const reason =
        error instanceof Error &&
        /^CONTROLLER_(TIMEOUT|CANCELLED|HTTP_\d{3}|DISABLED|TRANSPORT_FAILED|BUDGET_EXHAUSTED)$/.test(
          error.message,
        )
          ? error.message
          : "INVALID_OR_STALE_RESPONSE";
      this.firstFailure ??= reason;
      return finish(
        reason === "INVALID_OR_STALE_RESPONSE"
          ? "UNKNOWN"
          : "CONTROLLER_UNAVAILABLE",
        reason,
      );
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", forward);
    }
  }
}
