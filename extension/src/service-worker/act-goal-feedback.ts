import { isErrorCode } from "../contracts/error-codes.js";
import { digestCanonical } from "../security/canonical.js";
import {
  classifyOutcome,
  toLegacyOutcome,
} from "../page-act-harness/outcome.js";
import { isPlainObject, fail } from "../security/validation.js";
import { safeChatText } from "../state/tab-chat-session-store.js";
import { traceDecision } from "../diagnostics/method-trace.js";
import { assertRequestActive } from "./request-context.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { ActSession } from "./act-session-types.js";
import type { Run } from "../state/run-coordinator.js";
import type { ProviderToolCall } from "../providers/types.js";

export const finishGoalFeedback = async (opts: {
  dependencies: ActStepDependencies;
  session: ActSession;
  run: Run;
  response: { content: string; tool_calls: ProviderToolCall[] };
  observationId: string;
  observationDigest: string;
}): Promise<Record<string, unknown>> => {
  const { dependencies, session, run, response } = opts;
  assertRequestActive(session.requestContext);
  const active = await dependencies
    .readActive(undefined, session.tabId)
    .catch(() => undefined);
  assertRequestActive(session.requestContext);
  const bindingCurrent =
    active !== undefined &&
    active.tabId === session.tabId &&
    active.origin === session.origin &&
    active.snapshot.document_epoch === run.documentEpoch &&
    digestCanonical(active.snapshot) === opts.observationDigest;
  const call = response.tool_calls[0];
  let status: "completed" | "incomplete" | "unknown" = "unknown";
  let summary = response.content;
  if (call) {
    if (
      response.tool_calls.length !== 1 ||
      call.name !== "report_goal_status" ||
      !call.id ||
      session.messages.some(
        (message) =>
          message.role === "tool" && message.tool_call_id === call.id,
      )
    )
      return fail("INVALID_ARGUMENT");
    const value: unknown = JSON.parse(call.arguments);
    if (
      !isPlainObject(value) ||
      Object.keys(value).some(
        (key) => !["status", "summary", "observation_id"].includes(key),
      ) ||
      !["completed", "incomplete", "unknown"].includes(String(value.status)) ||
      typeof value.summary !== "string" ||
      !value.summary.trim() ||
      value.summary.length > 4000 ||
      value.observation_id !== opts.observationId
    )
      return fail("INVALID_ARGUMENT");
    status = value.status as "completed" | "incomplete" | "unknown";
    summary = value.summary;
  }
  const actions = session.executionEvidence ?? [];
  const required = session.plan?.input.steps.length ?? actions.length;
  const verified = actions.filter(
    (action) => action.verifier === "satisfied",
  ).length;
  const terminal = classifyOutcome({
    tool_calls_made: true,
    read_only: false,
    actions,
    binding_current: bindingCurrent,
    goal: {
      required_actions: required,
      verified_actions: session.plan
        ? Math.min(verified, session.plan.completedSteps)
        : verified,
      final_observation: bindingCurrent,
      goal_met: status === "completed",
    },
    ...(status === "incomplete" ? { remaining_work: true } : {}),
  });
  const outcome = toLegacyOutcome(terminal.kind);
  const labels = {
    ANSWER_ONLY: "답변만 완료했습니다.",
    VERIFIED: "동작 결과는 검증됐지만 전체 목표 완료는 확인되지 않았습니다.",
    GOAL_VERIFIED:
      "검증된 동작과 최신 관찰을 바탕으로 모델이 목표 완료를 확인했습니다.",
    FAILED: "동작 검증이 실패했습니다. 목표 완료로 처리하지 않습니다.",
    UNKNOWN:
      "동작 또는 최신 관찰을 확정하지 못했습니다. 목표 완료로 처리하지 않습니다.",
    INCOMPLETE: "검증된 동작 이후에도 목표에 남은 작업이 있습니다.",
  };
  // Typed failures always win; do not publish a model's conflicting success prose.
  const message = [
    labels[terminal.kind],
    terminal.kind === "FAILED" || terminal.kind === "UNKNOWN"
      ? ""
      : safeChatText(summary),
  ]
    .filter(Boolean)
    .join("\n");
  if (call)
    session.messages.push(
      {
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls,
      },
      {
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({
          terminal: terminal.kind,
          reason: terminal.reason,
          outcome,
        }),
      },
    );
  traceDecision("act.goal.feedback", {
    terminal: terminal.kind,
    reason: terminal.reason,
    action_count: actions.length,
    verified_actions: session.plan
      ? Math.min(verified, session.plan.completedSteps)
      : verified,
    observation_current: bindingCurrent,
    model_status: status,
  });
  const executionCode = actions.find(
    (action) => action.outcome !== "VERIFIED" && action.code,
  )?.code;
  const code = isErrorCode(executionCode) ? executionCode : undefined;
  dependencies.coordinator.runs.terminal(run.id, outcome, code);
  dependencies.publish(run.id, { type: "assistant_delta", text: message });
  dependencies.publish(run.id, {
    type: "activity_finished",
    stage: outcome === "VERIFIED" ? "COMPLETED" : "FAILED",
  });
  dependencies.publish(run.id, {
    type: "run_terminal",
    outcome,
    ...(code ? { code } : {}),
  });
  dependencies.endSession(session);
  return {
    ok: true,
    state: terminal.kind,
    terminal: terminal.kind,
    reason: terminal.reason,
    outcome,
    message,
    ...(code ? { code } : {}),
  };
};
