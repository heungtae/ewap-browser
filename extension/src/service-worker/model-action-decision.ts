import { actModelJudgment } from "./act-model-judgment.js";
import { validateActAssessmentValue } from "../contracts/act-assessment.js";
import {
  acceptActionAssessment,
  actionAssessmentDecision,
} from "./act-assessment-result.js";
import { withDeadline } from "../security/deadline.js";
import type { actionObservation } from "./act-assessment-observation.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { ActSession } from "./act-session-types.js";
import type { ActExecutionEvidence } from "./act-execution-feedback.js";
export const modelActionDecision = async (
  dependencies: ActStepDependencies,
  session: ActSession,
  observation: ReturnType<typeof actionObservation>,
  evidence: ActExecutionEvidence,
  deadline: number,
  check: () => void,
) => {
  const packet = observation.packet;
  const result = await actModelJudgment(
    dependencies,
    session,
    "action_assessment",
    {
      observation_id: packet.observation_id,
      attempt_id: packet.attempt_id,
      action: packet.action,
      evidence: packet.evidence,
      coverage: packet.coverage,
      execution: {
        outcome: evidence.outcome,
        raw_outcome: evidence.raw_outcome,
        dispatch: evidence.dispatch,
      },
    },
    {
      confirmed:
        "Changed, related and complete current evidence establishes the approved local UI result, with no business-effect claim.",
      not_completed:
        "Current evidence establishes that the approved local UI result was not achieved.",
      unknown: "The supplied evidence cannot establish the local UI result.",
      primary: "More investigation or extended reasoning is required.",
    },
    deadline,
  );
  if (
    !result ||
    !["confirmed", "not_completed", "unknown"].includes(result.verdict)
  )
    return undefined;
  const assessment = validateActAssessmentValue(
    {
      phase: "action",
      observation_id: packet.observation_id,
      attempt_id: packet.attempt_id,
      decision: result.verdict,
      facts: "승인된 로컬 UI 동작의 현재 관측 자료입니다.",
      rationale: "변경된 현재 자료에 결속된 판단입니다.",
      evidence_ids:
        result.verdict === "confirmed"
          ? observation.evidenceIds.slice(0, 8)
          : [],
    },
    packet.observation_id,
    packet.attempt_id,
    observation.evidenceIds,
  );
  const latest = await withDeadline(
    dependencies.readActive(undefined, session.tabId),
    Math.max(0, deadline - Date.now()),
    "REQUEST_TIMEOUT",
  );
  check();
  const accepted =
    assessment.decision === "confirmed" &&
    observation.current(latest, assessment.evidence_ids);
  if (accepted) acceptActionAssessment(session, evidence, assessment);
  session.messages.push({
    role: "user",
    content: `[UNTRUSTED_ACTION_ASSESSMENT]\n${actionAssessmentDecision(session, evidence, assessment, accepted)}\n[/UNTRUSTED_ACTION_ASSESSMENT]`,
  });
  return {
    changed:
      !accepted &&
      (assessment.decision === "confirmed" ||
        !observation.current(latest, observation.allEvidenceIds)),
    latest,
  };
};
