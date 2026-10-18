import { consumeAssessment } from "./act-assessment-budget.js";
import { modelDecision } from "./model-decision.js";
import {
  decisionQuestion,
  judgmentTask,
} from "../providers/decision-questions.js";
import { acceptedChoice } from "../providers/jev-response.js";
import { traceDecision } from "../diagnostics/method-trace.js";
import type { DecisionPhase, DecisionTask } from "../providers/jev-types.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { ActSession } from "./act-session-types.js";
export const actModelJudgment = async (
  dependencies: ActStepDependencies,
  session: ActSession,
  phase: DecisionPhase,
  state: Record<string, unknown>,
  criteria: Record<string, string>,
  deadline?: number,
  augment?: (task: DecisionTask) => void,
) => {
  if (!session.requestContext || !dependencies.provider.bindings)
    return undefined;
  const binding = await dependencies.provider.bindings.get(
    session.requestContext.signal,
  );
  if (!binding.decision || binding.failed) return undefined;
  if (phase === "element_assessment" || phase === "action_assessment") {
    const localDeadline = consumeAssessment(
      session,
      phase === "element_assessment" ? "element" : "action",
      String(state.attempt_id ?? state.observation_id),
    );
    deadline = Math.min(deadline ?? Infinity, localDeadline);
  }
  const task = judgmentTask(
    phase,
    {
      original_request: session.prompt,
      request_revision: session.requestContext.generation,
      ...state,
    },
    decisionQuestion(
      "Choose a grounded verdict for the current phase. Do not infer business effects, invent new arguments or retry actions.",
      criteria,
    ),
  );
  augment?.(task);
  const controller = new AbortController();
  const abort = () => controller.abort();
  session.requestContext.signal.addEventListener("abort", abort, {
    once: true,
  });
  const timer =
    deadline === undefined
      ? undefined
      : setTimeout(abort, Math.max(0, deadline - Date.now()));
  try {
    const judgment = await modelDecision({
      provider: dependencies.provider,
      context: session.requestContext,
      runId: session.runId,
      publish: dependencies.publish,
      preferences: dependencies.preferences,
      task,
      protectedData: true,
      signal: controller.signal,
    });
    const verdict = judgment ? acceptedChoice(judgment, "verdict") : undefined;
    traceDecision("act.model_judgment", {
      phase,
      reviewer_kind: judgment?.source ?? "unavailable",
      decision_id: judgment?.decision_id,
      verdict: verdict ?? "unavailable",
    });
    return verdict && judgment ? { verdict, judgment } : undefined;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    session.requestContext.signal.removeEventListener("abort", abort);
  }
};
