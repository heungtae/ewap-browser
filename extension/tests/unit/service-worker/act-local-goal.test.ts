import { describe, expect, it } from "vitest";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import { recordActExecution } from "../../../src/service-worker/act-execution-feedback.js";
import { isCompletionContract } from "../../../src/profile/profile-action-validation.js";
import { digestCanonical } from "../../../src/security/canonical.js";
import { makeS17Test } from "./s17-test-support.js";
import type { ActProposal } from "../../../src/service-worker/act-session-types.js";

describe("trusted full-request local goal", () => {
  it("P2 confirms a declared entire goal from actual control state without provider reasoning", async () => {
    const { session, dependencies, active } = makeS17Test();
    session.lastObservationScope = dependencies.pageScope(active);
    active.snapshot.nodes[0]!.state = { expanded: true };
    const completion = {
      version: 2,
      kind: "control_state",
      source: "trusted_profile",
      scope_policy: "same_scope",
      report_scope: "ui",
      expected_changes: [
        {
          ref_id: active.snapshot.nodes[0]!.ref_id,
          field: "expanded",
          expected: true,
        },
      ],
      goal_request_digest: digestCanonical(session.prompt),
    } as const;
    expect(isCompletionContract(completion)).toBe(true);
    recordActExecution(
      session,
      {
        id: "action",
        tool: "click_by_ref",
        toolCallId: "execute-call",
        targetName: "Run",
        definition: { completion },
      } as unknown as ActProposal,
      { ok: true },
    );
    expect(
      (await createActStepRunner(dependencies).runStep(session)).completion,
    ).toMatchObject({ goal_status: "completed", action_outcome: "VERIFIED" });
    expect(dependencies.provider.chat).not.toHaveBeenCalled();
  });
  it("P2 refuses browser or wrong-request full-goal declarations", () => {
    const base = {
      version: 2,
      kind: "navigation",
      source: "browser_derived",
      scope_policy: "navigation",
      report_scope: "navigation",
      goal_request_digest: digestCanonical("other request"),
    };
    expect(isCompletionContract(base)).toBe(false);
    const { session, dependencies, active } = makeS17Test();
    session.lastObservationScope = dependencies.pageScope(active);
    recordActExecution(
      session,
      {
        id: "action",
        tool: "navigate",
        toolCallId: "execute-call",
        targetName: "Run",
        definition: { completion: { ...base, source: "trusted_profile" } },
      } as unknown as ActProposal,
      { ok: true },
    );
    expect(session.localGoalProof).toBeUndefined();
  });
});
