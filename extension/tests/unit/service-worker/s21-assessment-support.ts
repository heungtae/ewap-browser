import { makeS17Test } from "./s17-test-support.js";
import { recordActExecution } from "../../../src/service-worker/act-execution-feedback.js";
import { assessPendingAction } from "../../../src/service-worker/act-action-assessment.js";
import type { ActProposal } from "../../../src/service-worker/act-session-types.js";
import type { ProviderMessage } from "../../../src/providers/types.js";
export const setupAssessment = (dispatch = "dispatched") => {
  const test = makeS17Test();
  const proposal: ActProposal = {
    id: "attempt-abcdefghijklmnop",
    tool: "click_by_ref",
    refId: test.active.snapshot.nodes[0]!.ref_id,
    targetName: "Run",
    approvalScope: "single_step",
    approvalReason: "Run",
    toolCallId: "mutation-call",
    definition: {
      tool: "click_by_ref",
      effect: "local-ui-only",
      risk: "R1",
      eligible_roles: ["button"],
      verifier: {
        kind: "semantic-state-transition",
        declaration_id: "click",
        pre_state_digest: "",
        required_changes: [],
      },
    },
  };
  test.session.assessmentBaseline = structuredClone(test.active);
  recordActExecution(test.session, proposal, {
    ok: false,
    outcome: "UNKNOWN",
    dispatch,
    code: "POSTCONDITION_UNVERIFIED",
  });
  test.active.snapshot.nodes[0]!.state = { expanded: true } as never;
  const run = test.dependencies.coordinator.runs.start(
    1,
    0,
    test.active.snapshot.document_epoch,
    "act",
  );
  test.session.runId = run.id;
  return {
    ...test,
    proposal,
    run,
    assess: () =>
      assessPendingAction(test.dependencies, test.session, run, test.active),
  };
};
export const packet = (messages: ProviderMessage[]) => {
  const message = [...messages]
    .reverse()
    .find((m) => m.content.startsWith("[UNTRUSTED_ACTION_EVIDENCE]"));
  return JSON.parse(message!.content.split("\n")[1]!) as {
    observation_id: string;
    attempt_id: string;
    evidence: { id: string; changed: boolean }[];
  };
};
export const assessmentResponse = (
  messages: ProviderMessage[],
  decision = "confirmed",
  ids?: string[],
) => {
  const observation = packet(messages);
  return {
    content: "",
    tool_calls: [
      {
        id: `assessment-${observation.observation_id}`,
        name: "assess_action_result",
        arguments: JSON.stringify({
          phase: "action",
          observation_id: observation.observation_id,
          attempt_id: observation.attempt_id,
          decision,
          facts: "The approved control now exposes its result.",
          rationale:
            "The changed related control satisfies this local UI step.",
          evidence_ids:
            ids ??
            observation.evidence.filter((e) => e.changed).map((e) => e.id),
        }),
      },
    ],
  };
};
