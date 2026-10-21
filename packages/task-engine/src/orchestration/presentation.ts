import { isTerminal, type Orchestration } from "./contracts.js";
export class OrchestrationHistory {
  private tasks = new Map<string, Orchestration>();
  accept(state: Orchestration): boolean {
    const old = this.tasks.get(state.context.taskId);
    if (old && state.context.taskRevision <= old.context.taskRevision)
      return false;
    if (old && isTerminal(old.phase)) throw new Error("TASK_TERMINAL");
    this.tasks.set(state.context.taskId, structuredClone(state));
    return true;
  }
  view(taskId: string) {
    const state = this.tasks.get(taskId);
    if (!state) return null;
    return {
      taskId,
      revision: state.context.taskRevision,
      phase: state.phase,
      outcome: state.outcome,
      firstFailure: state.firstFailure,
      waitingFor:
        state.phase === "approval_pending"
          ? "approval"
          : state.phase === "waiting_input"
            ? "input"
            : null,
      verifiedSteps: [...state.verifiedSteps],
      dispatchUnknown:
        state.ambiguousSteps.length > 0 ||
        (state.phase === "suspended" && state.resumePhase === "tool_execution"),
      terminal: isTerminal(state.phase),
    };
  }
}
