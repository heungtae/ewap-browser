import { primaryAnswerReview } from "./primary-answer-review.js";
import type { ProviderMessage } from "../providers/types.js";
import { modelDecision } from "./model-decision.js";
import {
  decisionQuestion,
  judgmentTask,
} from "../providers/decision-questions.js";
import { acceptedChoice } from "../providers/jev-response.js";
import type { AskChatDependencies } from "./ask-chat-dependencies.js";
import type { RequestContext } from "./request-context.js";
const options = (
  dependencies: Pick<
    AskChatDependencies,
    "provider" | "publish" | "preferences"
  >,
  runId: string,
  context?: RequestContext,
) => ({
  provider: dependencies.provider,
  publish: dependencies.publish,
  preferences: dependencies.preferences,
  runId,
  context,
  protectedData: true,
});
export const decideAskAnswer = async (
  dependencies: AskChatDependencies,
  runId: string,
  prompt: string,
  projection: unknown,
  context?: RequestContext,
): Promise<string | undefined> => {
  const classification = await modelDecision({
    ...options(dependencies, runId, context),
    protectedData: false,
    task: judgmentTask(
      "intent",
      {
        original_request: prompt,
        mode: "ask",
        capability: "visible_page_judgment_or_primary_answer",
      },
      decisionQuestion(
        "Classify the required answer format using only the original request.",
        {
          finite:
            "The user explicitly requests a single yes/no judgment of visible page facts, with no explanation, actions, calculations or other work.",
          generation:
            "Prose, explanation, analysis, counts, code, plans, actions or any other work is requested, or the format is uncertain.",
        },
      ),
    ),
  });
  if (
    !classification ||
    acceptedChoice(classification, "verdict") !== "finite"
  ) {
    if (classification)
      dependencies.publish(runId, {
        type: "provider_activity",
        provider_role: "primary",
        stage: "DELEGATING",
        phase: "intent",
      });
    return undefined;
  }
  const task = judgmentTask(
    "candidate_selection",
    { original_request: prompt, projection, coverage: "visible_page_only" },
    decisionQuestion(
      "Answer only an explicitly requested yes/no judgment grounded in supplied visible page evidence. An analysis, summary, explanation, calculation or action needs primary.",
      {
        yes: "The explicitly requested atomic proposition is established by supplied evidence.",
        no: "The supplied evidence establishes the opposite of the explicitly requested atomic proposition.",
        unknown:
          "The atomic proposition cannot be established from the supplied evidence.",
      },
    ),
  );
  task.questions.answer_kind = decisionQuestion(
    "What answer format did the user request?",
    {
      finite:
        "The original user request explicitly asks for a single yes/no judgment from visible facts, with no explanation, actions or other work.",
      generation:
        "The user requests prose, analysis, counts, code, plans, explanation, actions or any other work, or intent is uncertain.",
    },
  );
  const judgment = await modelDecision({
    ...options(dependencies, runId, context),
    task,
  });
  if (!judgment || acceptedChoice(judgment, "answer_kind") !== "finite")
    return undefined;
  const verdict = acceptedChoice(judgment, "verdict");
  return verdict === "yes"
    ? "현재 제공된 자료에서는 그렇습니다."
    : verdict === "no"
      ? "현재 제공된 자료에서는 그렇지 않습니다."
      : verdict === "unknown"
        ? "현재 제공된 자료로는 판단할 수 없습니다."
        : undefined;
};
export const reviewAskAnswer = async (
  dependencies: Pick<
    AskChatDependencies,
    "provider" | "publish" | "preferences"
  >,
  runId: string,
  prompt: string,
  answer: string,
  context?: RequestContext,
  thread?: ProviderMessage[],
): Promise<boolean> => {
  if (!context || !dependencies.provider.bindings) return true;
  const binding = await dependencies.provider.bindings.get(context.signal);
  if (!binding.decision || binding.failed) return true;
  const judgment = await modelDecision({
    ...options(dependencies, runId, context),
    task: judgmentTask(
      "result_acceptance",
      {
        original_request: prompt,
        prepared_answer: answer,
        coverage: "answer_only_no_full_content_audit",
      },
      decisionQuestion(
        "Select whether to publish the prepared answer or delegate further read-only work. This evaluates relevance, not a full-content factual audit.",
        {
          accept:
            "The prepared answer addresses the original request and states its evidence limits.",
          further_work:
            "The answer omits required work or makes unsupported completion/coverage claims; primary should investigate.",
          unknown: "Further reasoning or clarification is needed.",
        },
      ),
    ),
  });
  const verdict = judgment ? acceptedChoice(judgment, "verdict") : undefined;
  if (verdict === "accept") return true;
  if (verdict === "further_work") return false;
  return primaryAnswerReview(
    dependencies.provider,
    prompt,
    answer,
    runId,
    dependencies.publish,
    context,
    thread,
  );
};
