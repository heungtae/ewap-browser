import type { ErrorCode, Mode, Outcome } from "../contracts/types.js";
import { opaqueId, uuid } from "../security/canonical.js";
import { fail } from "../security/validation.js";
import { ConfirmationStore } from "./confirmation.js";
import { ValueSlots } from "./value-slots.js";
export type RunPhase =
  | "READING"
  | "PROPOSING"
  | "PREFLIGHT"
  | "AWAITING_VALUE"
  | "AWAITING_CONFIRMATION"
  | "EXECUTING"
  | "VERIFYING"
  | "TERMINAL";
export type Run = {
  id: string;
  tabId: number;
  frameId: number;
  documentEpoch: string;
  mode: Mode;
  tabContext: string;
  phase: RunPhase;
  outcome?: Outcome;
  code?: ErrorCode;
};
export class RunCoordinator {
  private readonly active = new Map<number, Run>();
  public readonly values = new ValueSlots();
  public readonly confirmations = new ConfirmationStore();
  public start(
    tabId: number,
    frameId: number,
    documentEpoch: string,
    mode: Mode,
  ): Run {
    this.cancel(tabId);
    const run = {
      id: uuid(),
      tabId,
      frameId,
      documentEpoch,
      mode,
      tabContext: opaqueId(),
      phase: "READING" as const,
    };
    this.active.set(tabId, run);
    return run;
  }
  public get(tabId: number): Run | undefined {
    return this.active.get(tabId);
  }
  public byId(id: string): Run | undefined {
    return [...this.active.values()].find((run) => run.id === id);
  }
  public transition(runId: string, phase: Exclude<RunPhase, "TERMINAL">): Run {
    const run = this.find(runId);
    if (run.phase === "TERMINAL") return fail("INVALID_ARGUMENT");
    run.phase = phase;
    return run;
  }
  public terminal(runId: string, outcome: Outcome, code?: ErrorCode): Run {
    const run = this.find(runId);
    if (run.phase === "TERMINAL") return run;
    run.phase = "TERMINAL";
    run.outcome = outcome;
    if (code) run.code = code;
    this.values.clear();
    this.confirmations.clear();
    return run;
  }
  public cancel(tabId: number): void {
    const run = this.active.get(tabId);
    if (run && run.phase !== "TERMINAL") this.terminal(run.id, "CANCELLED");
  }
  public invalidateDocument(tabId: number, epoch: string): void {
    const run = this.active.get(tabId);
    if (run && run.documentEpoch !== epoch) this.terminal(run.id, "CANCELLED");
  }
  private find(id: string): Run {
    for (const run of this.active.values()) if (run.id === id) return run;
    return fail("INVALID_ARGUMENT");
  }
}
