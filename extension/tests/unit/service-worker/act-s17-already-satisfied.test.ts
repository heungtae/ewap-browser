import { describe, expect, it } from "vitest";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import { completeActProposal } from "../../../src/service-worker/act-proposal-completion.js";
import type { ActProposal } from "../../../src/service-worker/act-session-types.js";
import { makeS17Test, executionInventory } from "./s17-test-support.js";

const proposal = {
  id: "proposal-abcdefghijklmnop",
  tool: "click_by_ref",
  targetName: "Run",
  toolCallId: "execute-call",
  approvalScope: "single_step",
} as ActProposal;
describe("S17 already-satisfied feedback", () => {
  it("verifies already-satisfied state without claiming a dispatched mutation", async () => {
    const { session, dependencies } = makeS17Test();
    dependencies.provider.chat = async (input) => ({
      content: "",
      tool_calls: [
        {
          id: "goal",
          name: "report_goal_status",
          arguments: JSON.stringify({
            status: "completed",
            summary: "Already selected",
            observation_id: executionInventory(input.messages).observation_id,
          }),
        },
      ],
    });
    const run = dependencies.coordinator.runs.start(
      1,
      0,
      "epoch-abcdefghijklmnop",
      "act",
    );
    const result = await completeActProposal(
      {
        publish: dependencies.publish,
        publishTerminal() {},
        continueWorkflow: createActStepRunner(dependencies).continueWorkflow,
        endSession: dependencies.endSession,
      },
      session,
      run,
      { ...proposal, tool: "call_page_api" } as ActProposal,
      { ok: true, outcome: "ALREADY_SATISFIED" },
      { success: "Already", failure: "Failed" },
    );
    expect(result.terminal).toBe("GOAL_VERIFIED");
    expect(session.executionEvidence?.[0]?.dispatched).toBe(false);
  });
});
