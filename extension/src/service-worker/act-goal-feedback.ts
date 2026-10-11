import { withDeadline } from "../security/deadline.js";
import type { PageScope } from "../state/tab-chat-session-store.js";
import type {
  ProviderChatResponse,
  ProviderMessage,
} from "../providers/types.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { ActSession } from "./act-session-types.js";
import type { Run } from "../state/run-coordinator.js";
import type { ActivePage } from "./page-context-runtime.js";
import { assertRequestActive } from "./request-context.js";
import { parseGoalReport } from "./act-goal-report.js";
import {
  finaliseGoal,
  actionOutcome,
  checkingCompletion,
} from "./act-goal-finalizer.js";
import {
  goalBindingCurrent,
  goalObservationDigest,
  goalEvidenceCurrent,
  observeStableGoal,
} from "./act-goal-observation.js";
import { reassessGoal } from "./act-goal-reassessment.js";
import { ContractError } from "../security/validation.js";
import { confirmNavigation } from "./act-navigation-confirmation.js";

export const finishGoalFeedback = async (opts: {
  dependencies: ActStepDependencies;
  session: ActSession;
  run: Run;
  response: ProviderChatResponse;
  observationId: string;
  observation: ActivePage;
  observationScope: PageScope;
  modelRefs: string[];
  messages: ProviderMessage[];
}): Promise<Record<string, unknown>> => {
  const { dependencies, session, run } = opts;
  let response = opts.response,
    observationId = opts.observationId;
  let observation = structuredClone(opts.observation),
    refs = opts.modelRefs;
  const scope = opts.observationScope;
  const deadline = Date.now() + 15_000;
  const check = () => {
    assertRequestActive(session.requestContext);
    if (dependencies.coordinator.runs.byId(run.id)?.phase === "TERMINAL")
      throw new ContractError("POLICY_DENIED");
  };
  for (let reassessments = 0; ; reassessments++) {
    check();
    const eligibleRefs = observation.snapshot.nodes.flatMap((node, index) =>
      node.visible ? [refs[index]!] : [],
    );
    const report = parseGoalReport(
      response,
      session,
      observationId,
      refs,
      eligibleRefs,
    );
    const active = await withDeadline(
      dependencies.readActive(undefined, session.tabId),
      Math.max(0, deadline - Date.now()),
      "REQUEST_TIMEOUT",
    ).catch(() => undefined);
    check();
    const bound =
      !!active && goalBindingCurrent(dependencies, session, active, scope);
    const current =
      bound &&
      !active.snapshot.truncated &&
      (goalObservationDigest(active.snapshot) ===
        goalObservationDigest(observation.snapshot) ||
        (report.status === "completed" &&
          goalEvidenceCurrent(
            observation.snapshot,
            active.snapshot,
            report.indexes,
          )));
    const finish = (reason?: Parameters<typeof finaliseGoal>[0]["reason"]) =>
      finaliseGoal({
        dependencies,
        session,
        run,
        status: report.status,
        summary: report.summary,
        current: Boolean(current),
        reassessments,
        ...(reason ? { reason } : {}),
      });
    if (active && bound && current)
      confirmNavigation(session, active, scope, report, current);
    if (
      actionOutcome(session) !== "VERIFIED" &&
      report.status !== "completed" &&
      (!session.executionEvidence?.at(-1)?.navigation_binding || current)
    )
      return finish();
    if (!bound)
      return finish(
        Date.now() >= deadline
          ? "REASSESSMENT_LIMIT"
          : active
            ? "BINDING_CHANGED"
            : "OBSERVATION_UNAVAILABLE",
      );
    const missingReport =
      response.tool_calls.length === 0 && report.status === "unknown";
    if (current && !missingReport) {
      if (response.tool_calls[0])
        session.messages.push(
          {
            role: "assistant",
            content: response.content,
            tool_calls: response.tool_calls,
          },
          {
            role: "tool",
            tool_call_id: response.tool_calls[0].id,
            content: JSON.stringify({ status: report.status }),
          },
        );
      return finish();
    }
    if (reassessments >= 2 || Date.now() >= deadline)
      return finish("REASSESSMENT_LIMIT");
    dependencies.publish(run.id, {
      type: "activity_progress",
      stage: "VERIFYING_RESULT",
      completion: checkingCompletion(session, reassessments + 1),
    });
    const stable = await observeStableGoal(
      dependencies,
      session,
      active,
      scope,
      deadline,
    );
    check();
    if (!stable.active) return finish(stable.reason);
    observation = structuredClone(stable.active);
    try {
      const next = await reassessGoal({
        ...opts,
        response,
        observation,
        deadline,
        check,
      });
      response = next.response;
      refs = next.refs;
      observationId = next.observationId;
    } catch (error) {
      check();
      if (error instanceof ContractError && error.code === "INVALID_ARGUMENT")
        throw error;
      return finaliseGoal({
        dependencies,
        session,
        run,
        status: "unknown",
        summary: "",
        current: false,
        reassessments: reassessments + 1,
        reason:
          Date.now() >= deadline ? "REASSESSMENT_LIMIT" : "PROVIDER_FAILED",
      });
    }
  }
};
