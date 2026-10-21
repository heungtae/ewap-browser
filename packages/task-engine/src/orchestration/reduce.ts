import { digest } from "../decisions/digest.js";
import {
  isTerminal,
  type Orchestration,
  type Phase,
  type Transition,
} from "./contracts.js";
const routes: Partial<Record<Phase, Phase[]>> = {
  admission: ["intent_classification"],
  intent_classification: ["codebase_discovery", "waiting_input"],
  codebase_discovery: ["planning"],
  planning: ["approval_pending", "tool_execution", "analysis", "waiting_input"],
  approval_pending: ["planning", "tool_execution"],
  waiting_input: ["planning", "tool_execution"],
  tool_execution: ["result_verification"],
  result_verification: ["planning", "analysis", "result_acceptance"],
  analysis: ["result_acceptance", "planning"],
  result_acceptance: ["completed"],
};
function authority(state: Orchestration, event: Transition): void {
  const role = event.role;
  const runtime = ["suspended", "failed", "cancelled", "completed"];
  if (runtime.includes(event.next)) {
    if (role !== "runtime") throw new Error("TRANSITION_AUTHORITY");
  } else if (
    state.phase === "suspended" ||
    state.phase === "admission" ||
    state.phase === "tool_execution"
  ) {
    if (role !== "runtime") throw new Error("TRANSITION_AUTHORITY");
  } else if (["approval_pending", "waiting_input"].includes(state.phase)) {
    if (role !== "user") throw new Error("TRANSITION_AUTHORITY");
  } else if (state.phase === "analysis") {
    if (role !== "analyst") throw new Error("TRANSITION_AUTHORITY");
  } else if (role !== "jev") throw new Error("TRANSITION_AUTHORITY");
}
export function reduceOrchestration(
  input: Orchestration,
  event: Transition,
  now: number,
): Orchestration {
  if (isTerminal(input.phase)) throw new Error("TASK_TERMINAL");
  if (event.expectedRevision !== input.context.taskRevision)
    throw new Error("REVISION_CONFLICT");
  if (
    !Number.isSafeInteger(now) ||
    (now >= input.deadline && !["failed", "cancelled"].includes(event.next))
  )
    throw new Error("TASK_EXPIRED");
  if (
    !/^[a-f0-9]{64}$/.test(event.progressDigest) ||
    event.evidenceRefs.length > 128
  )
    throw new Error("EVIDENCE_INVALID");
  authority(input, event);
  const interruption = ["suspended", "failed", "cancelled"].includes(
    event.next,
  );
  const recovering = input.phase === "suspended";
  if (
    !interruption &&
    !(recovering
      ? event.next === input.resumePhase
      : routes[input.phase]?.includes(event.next))
  )
    throw new Error("ILLEGAL_TRANSITION");
  if (recovering && event.next === "tool_execution")
    throw new Error("DISPATCH_RECONCILIATION_REQUIRED");
  if (
    event.next === "tool_execution" &&
    (input.ambiguousSteps.length ||
      !event.step ||
      input.verifiedSteps.includes(event.step.id))
  )
    throw new Error("DISPATCH_REPLAY_FORBIDDEN");
  if (
    input.phase === "tool_execution" &&
    !interruption &&
    (!event.step || event.step.id !== input.activeStep)
  )
    throw new Error("RECEIPT_REQUIRED");
  if (event.next === "completed") {
    const a = event.acceptance;
    if (
      !a ||
      digest(a.context) !== digest(input.context) ||
      !a.requested.length ||
      new Set(a.requested).size !== a.requested.length ||
      !a.requested.every((id) => a.verified.includes(id)) ||
      (a.analysisRequired && !a.analysisAccepted) ||
      input.ambiguousSteps.length ||
      !event.evidenceRefs.length
    )
      throw new Error("GOAL_NOT_VERIFIED");
  }
  const state = structuredClone(input);
  state.turns++;
  state.noProgress =
    input.progressDigest === event.progressDigest ? input.noProgress + 1 : 0;
  if (!interruption && (state.turns > 64 || state.noProgress >= 3))
    throw new Error("NO_PROGRESS");
  state.progressDigest = event.progressDigest;
  if (event.next === "suspended" && !recovering)
    state.resumePhase = input.phase;
  if (recovering && !interruption) state.resumePhase = null;
  if (input.phase === "tool_execution" && event.step) {
    const list =
      event.step.status === "VERIFIED"
        ? state.verifiedSteps
        : event.step.status === "UNKNOWN"
          ? state.ambiguousSteps
          : null;
    if (list && !list.includes(event.step.id)) list.push(event.step.id);
  }
  if (event.reason) state.firstFailure ??= event.reason;
  if (event.next === "tool_execution") state.activeStep = event.step!.id;
  if (input.phase === "tool_execution" && !interruption)
    state.activeStep = null;
  state.phase = event.next;
  if (event.next === "completed") state.outcome = "VERIFIED";
  if (event.next === "failed")
    state.outcome = state.ambiguousSteps.length ? "UNKNOWN" : "INCOMPLETE";
  if (event.next === "cancelled") state.outcome = "CANCELLED";
  state.context.taskRevision++;
  return state;
}
