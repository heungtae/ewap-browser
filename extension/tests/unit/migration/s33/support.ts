import {
  admitOrchestration,
  reduceOrchestration,
  type Orchestration,
  type Transition,
} from "../../../../../packages/task-engine/src/orchestration/index.js";
export const context = {
  taskId: "task",
  taskRevision: 0,
  planRevision: 0,
  graphRevision: 1,
  evidenceRevision: 1,
  capabilityRevision: 1,
  cancellationGeneration: 0,
  mode: "act" as const,
  scopeId: "scope",
};
export const ready = { enabled: true, configured: true, qualified: true };
export const initial = () => admitOrchestration(context, ready, 1000, 0);
export const event = (
  state: Orchestration,
  next: Transition["next"],
  role: Transition["role"] = "jev",
): Transition => ({
  expectedRevision: state.context.taskRevision,
  next,
  role,
  evidenceRefs: ["observation"],
  progressDigest: String(state.context.taskRevision % 10).repeat(64),
});
export const step = (
  state: Orchestration,
  next: Transition["next"],
  role: Transition["role"] = "jev",
) => reduceOrchestration(state, event(state, next, role), 1);
export function planning() {
  let s = step(initial(), "intent_classification", "runtime");
  s = step(s, "codebase_discovery");
  return step(s, "planning");
}
export function receipt(status: "VERIFIED" | "UNKNOWN") {
  let s = planning();
  s = reduceOrchestration(
    s,
    { ...event(s, "tool_execution"), step: { id: "step", status } },
    1,
  );
  return reduceOrchestration(
    s,
    {
      ...event(s, "result_verification", "runtime"),
      step: { id: "step", status },
    },
    1,
  );
}
