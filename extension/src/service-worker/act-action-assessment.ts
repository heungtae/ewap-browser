import { readAdditionalAction } from "./act-assessment-read.js";
import { assessmentChat } from "./act-assessment-provider.js";
import { assessCurrentState } from "./act-current-state-assessment.js";
import { checkingCompletion } from "./act-goal-finalizer.js";
import {
  acceptActionAssessment,
  actionAssessmentMessages,
  actionAssessmentDecision,
} from "./act-assessment-result.js";
import { goalBindingCurrent } from "./act-goal-observation.js";
import { ContractError, isPlainObject } from "../security/validation.js";
import { withDeadline } from "../security/deadline.js";
import { parseActAssessment } from "../contracts/act-assessment.js";
import { traceDecision } from "../diagnostics/method-trace.js";
import { assertRequestActive } from "./request-context.js";
import {
  actionAssessmentTool,
  controlObservationTool,
} from "./act-assessment-schema.js";
import { consumeAssessment } from "./act-assessment-budget.js";
import { actionObservation } from "./act-assessment-observation.js";
import type { ActSession } from "./act-session-types.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { Run } from "../state/run-coordinator.js";
import type { ActivePage } from "./page-context-runtime.js";

export const assessPendingAction = async (
  dependencies: ActStepDependencies,
  session: ActSession,
  run: Run,
  active: ActivePage,
): Promise<void> => {
  const proposal = session.pendingAssessment;
  const evidence = session.executionEvidence?.at(-1);
  if (!proposal || !evidence) return;

  if (
    proposal.tool === "call_page_api" ||
    proposal.tool === "navigate" ||
    !session.assessmentBaseline ||
    proposal.definition?.effect !== "local-ui-only" ||
    proposal.definition.risk !== "R1" ||
    proposal.definition.completion?.kind === "render_result" ||
    evidence.outcome !== "UNKNOWN" ||
    evidence.raw_outcome === "FAILED" ||
    (evidence.code !== undefined &&
      ![
        "POSTCONDITION_UNVERIFIED",
        "TARGET_STALE",
        "TARGET_NOT_ACTIONABLE",
      ].includes(evidence.code))
  ) {
    delete session.pendingAssessment;
    return;
  }
  const baseline = session.assessmentBaseline;
  const baselineScope = structuredClone(
    session.assessmentBaselineScope ?? dependencies.pageScope(baseline),
  );
  if (!goalBindingCurrent(dependencies, session, active, baselineScope)) {
    delete session.pendingAssessment;
    return;
  }
  // Unknown dispatch never creates execution proof. Only an exact state-setting
  // primitive may establish the current requested state independently.
  if (evidence.dispatch !== "dispatched") {
    assessCurrentState(session, proposal, evidence, baseline, active);
    delete session.pendingAssessment;
    return;
  }
  const check = () => {
    assertRequestActive(session.requestContext);
    if (
      session.runId !== run.id ||
      dependencies.coordinator.runs.byId(run.id)?.phase === "TERMINAL"
    )
      throw new ContractError("POLICY_DENIED");
  };
  const messages = actionAssessmentMessages(session);
  const transcriptStart = messages.length;
  dependencies.publish(run.id, {
    type: "activity_progress",
    stage: "VERIFYING_RESULT",
    completion: checkingCompletion(session),
  });
  try {
    for (let round = 0; round < 2; round++) {
      check();
      const deadline = consumeAssessment(
        session,
        "action",
        evidence.logical_step_id ?? proposal.id,
      );
      if (!goalBindingCurrent(dependencies, session, active, baselineScope))
        break;
      const observation = actionObservation(dependencies, session, run, active);
      messages.push({
        role: "user",
        content: `[UNTRUSTED_ACTION_EVIDENCE]\n${dependencies.serialise(observation.packet)}\n[/UNTRUSTED_ACTION_EVIDENCE]`,
      });
      const response = await assessmentChat(
        dependencies,
        session,
        messages,
        [
          actionAssessmentTool(
            observation.packet.observation_id,
            proposal.id,
            observation.evidenceIds,
          ),
          controlObservationTool,
        ],
        deadline,
      );
      check();
      const call = response.tool_calls[0];
      if (
        response.tool_calls.length !== 1 ||
        !call?.id ||
        messages.some((m) => m.tool_call_id === call.id)
      )
        throw new ContractError("INVALID_ARGUMENT");
      messages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls,
      });
      if (call.name === "read_control_observation") {
        const args: unknown = JSON.parse(call.arguments);
        if (!isPlainObject(args) || Object.keys(args).length)
          throw new ContractError("INVALID_ARGUMENT");
        active = await readAdditionalAction(dependencies, session, proposal.id);
        check();
        const fresh = actionObservation(dependencies, session, run, active);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: dependencies.serialise(fresh.packet),
        });
        continue;
      }
      if (call.name !== "assess_action_result")
        throw new ContractError("INVALID_ARGUMENT");
      const assessment = parseActAssessment(
        call.arguments,
        observation.packet.observation_id,
        proposal.id,
        observation.evidenceIds,
      );
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({ decision: assessment.decision }),
      });
      if (assessment.decision === "need_more_data") {
        active = await readAdditionalAction(dependencies, session, proposal.id);
        continue;
      }
      const latest = await withDeadline(
        dependencies.readActive(undefined, session.tabId),
        Math.max(0, deadline - Date.now()),
        "REQUEST_TIMEOUT",
      );
      check();
      const accepted =
        assessment.decision === "confirmed" &&
        observation.current(latest, assessment.evidence_ids);
      if (accepted) {
        acceptActionAssessment(session, evidence, assessment);
      }
      messages[messages.length - 1]!.content = actionAssessmentDecision(
        session,
        evidence,
        assessment,
        accepted,
      );
      const changed = !observation.current(latest, observation.allEvidenceIds);
      if (!accepted && (assessment.decision === "confirmed" || changed)) {
        active = latest;
        continue;
      }
      break;
    }
  } catch (error) {
    check();
    traceDecision("act.assessment.unavailable", {
      code: error instanceof ContractError ? error.code : "PROVIDER_FAILED",
    });
  } finally {
    session.messages.push(
      ...messages
        .slice(transcriptStart)
        .filter(
          (message) => message.role === "assistant" || message.role === "tool",
        ),
    );
    delete session.pendingAssessment;
  }
};
