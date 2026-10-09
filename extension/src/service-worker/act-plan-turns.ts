import { storeSubmittedPlan } from "./act-plan-store.js";
import { safeChatText } from "../state/tab-chat-session-store.js";
import { assertRequestActive } from "./request-context.js";
import { fail } from "../security/validation.js";
import type {
  ProviderMessage,
  ProviderToolCall,
  ProviderToolDefinition,
} from "../providers/types.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { ActSession } from "./act-session-types.js";
import type { ActivePage } from "./page-context-runtime.js";
import type { Run } from "../state/run-coordinator.js";
type Response = { content: string; tool_calls: ProviderToolCall[] };
export const runPlanSubmissionTurns = async (opts: {
  dependencies: ActStepDependencies;
  session: ActSession;
  active: ActivePage;
  run: Run;
  requestRevision: number;
  observationId: string;
  actionTools: ProviderToolDefinition[];
  tools: ProviderToolDefinition[];
  messages: ProviderMessage[];
  response: Response;
  chatOnce(tools: ProviderToolDefinition[]): Promise<Response>;
}): Promise<{ review: Record<string, unknown> } | { response: Response }> => {
  const {
    dependencies,
    session,
    active,
    run,
    requestRevision,
    observationId,
    actionTools,
    tools,
    messages,
    chatOnce,
  } = opts;
  let response = opts.response;
  for (
    let attempt = 0;
    response.tool_calls.length === 1 &&
    response.tool_calls[0]?.name === "submit_plan";
    attempt++
  ) {
    const call = response.tool_calls[0];
    let plan;
    try {
      if (
        !call.id ||
        session.messages.some(
          (message) =>
            message.role === "tool" && message.tool_call_id === call.id,
        )
      )
        throw new Error("DUPLICATE_CALL_ID");
      plan = storeSubmittedPlan({
        session,
        call,
        revision: requestRevision,
        documentEpoch: active.snapshot.document_epoch,
        capabilities: actionTools
          .filter((tool) => tool.function.name !== "request_clarification")
          .map((tool) => tool.function.name),
        evidenceIds: [observationId],
      });
    } catch (error) {
      if (attempt >= 1) throw fail("INVALID_ARGUMENT");
      const echo: ProviderMessage = {
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls,
      };
      const result: ProviderMessage = {
        role: "tool",
        tool_call_id: call.id,
        content: `[UNTRUSTED_TOOL_RESULT]\n${JSON.stringify({ status: "FAILED", code: error instanceof Error ? error.message : "INVALID_ARGUMENT", hint: "Correct the plan using the current evidence ID and exactly the supported action capability enum. Read tools, approvals, local verification and report_goal_status are not executable action steps; put their observation/verification requirements in the action postcondition. Preserve the original user goal and explain changes in origin_diff. No steps were executed or silently removed." })}\n[/UNTRUSTED_TOOL_RESULT]`,
      };
      session.messages.push(echo, result);
      messages.push(echo, result);
      response = await chatOnce(tools);
      assertRequestActive(session.requestContext);
      continue;
    }
    const fresh = await dependencies.readActive(undefined, session.tabId);
    assertRequestActive(session.requestContext);
    if (
      fresh.origin !== active.origin ||
      fresh.tabId !== active.tabId ||
      fresh.snapshot.document_epoch !== active.snapshot.document_epoch
    )
      throw fail("PAGE_SCOPE_STALE");
    session.messages.push({
      role: "assistant",
      content: response.content,
      tool_calls: response.tool_calls,
    });
    dependencies.coordinator.runs.transition(run.id, "PROPOSING");
    dependencies.publish(run.id, {
      type: "assistant_delta",
      text: `계획: ${plan.input.goal}\n근거 범위: ${plan.input.coverage_note}\n출처: ${plan.input.provenance}\n${plan.input.origin_diff ?? ""}\n${plan.input.steps.map((step, index) => `${index + 1}. ${step.intent} [${step.capability}]\n입력: ${step.user_input ?? "없음"}\n부작용: ${(step.side_effects ?? []).join(", ") || "미기재"}\n검증: ${step.postcondition}`).join("\n")}\n계획 승인 후에도 각 동작의 승인과 권한 확인이 필요합니다.`,
    });
    dependencies.publish(run.id, {
      type: "action_review_required",
      action: {
        session_id: session.id,
        proposal_id: plan.reviewId,
        tool: "submit_plan",
        target_name: safeChatText(plan.input.goal),
        approval_scope: "single_step",
        approval_reason: `계획 revision ${plan.revision} 검토. 이 승인은 동작을 실행하지 않습니다.`,
        origin: session.origin,
      },
    });
    dependencies.publish(run.id, {
      type: "activity_finished",
      stage: "AWAITING_REVIEW",
    });
    return {
      review: {
        ok: true,
        state: "PLAN_REVIEW",
        session_id: session.id,
        proposal_id: plan.reviewId,
        plan_id: plan.input.plan_id,
        plan_revision: plan.revision,
      },
    };
  }
  return { response };
};
