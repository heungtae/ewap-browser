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
describe("S17 execution feedback", () => {
  it.each(["click_by_ref", "call_page_api", "navigate"] as const)(
    "returns %s results with fresh observation before goal success",
    async (tool) => {
      const { session, dependencies } = makeS17Test();
      session.messages.push({
        role: "assistant",
        content: "",
        tool_calls: [{ id: "execute-call", name: tool, arguments: "{}" }],
      });
      dependencies.provider.chat = async (input) => {
        const inventory = executionInventory(input.messages);
        expect(inventory.execution_evidence[0].outcome).toBe("VERIFIED");
        expect(
          input.messages.some(
            (message) =>
              message.role === "tool" &&
              message.tool_call_id === "execute-call",
          ),
        ).toBe(true);
        return {
          content: "",
          tool_calls: [
            {
              id: "goal-call",
              name: "report_goal_status",
              arguments: JSON.stringify({
                status: "completed",
                summary: "Report visible",
                observation_id: inventory.observation_id,
              }),
            },
          ],
        };
      };
      const runner = createActStepRunner(dependencies);
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
          continueWorkflow: runner.continueWorkflow,
          endSession: dependencies.endSession,
        },
        session,
        run,
        { ...proposal, tool } as ActProposal,
        { ok: true },
        { success: "Verified", failure: "Failed" },
      );
      expect(result.terminal).toBe("GOAL_VERIFIED");
      expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
    },
  );
  it.each(["FAILED", "UNKNOWN"] as const)(
    "never lets model prose override typed %s",
    async (outcome) => {
      const { session, dependencies } = makeS17Test();
      dependencies.provider.chat = async (input) => {
        const inventory = executionInventory(input.messages);
        expect(
          input.tools?.some((tool) => tool.function.name === "propose_click"),
        ).toBe(false);
        return {
          content: "Everything succeeded",
          tool_calls: [
            {
              id: "goal",
              name: "report_goal_status",
              arguments: JSON.stringify({
                status: "completed",
                summary: "Everything succeeded",
                observation_id: inventory.observation_id,
              }),
            },
          ],
        };
      };
      const run = dependencies.coordinator.runs.start(
        1,
        0,
        "epoch-abcdefghijklmnop",
        "act",
      );
      const runner = createActStepRunner(dependencies);
      const result = await completeActProposal(
        {
          publish: dependencies.publish,
          publishTerminal() {},
          continueWorkflow: runner.continueWorkflow,
          endSession: dependencies.endSession,
        },
        session,
        run,
        proposal,
        { ok: false, outcome, code: "POSTCONDITION_UNMET" },
        { success: "Verified", failure: "Failed" },
      );
      expect(result.terminal).toBe(outcome);
      expect(result.message).not.toContain("Everything succeeded");
    },
  );
  it("does not promote an ordinary final answer to goal completion", async () => {
    const { session, dependencies } = makeS17Test();
    session.executionEvidence = [
      {
        action_id: "action",
        dispatched: true,
        observed: true,
        verifier: "satisfied",
        outcome: "VERIFIED",
        navigation: false,
        alreadySatisfied: false,
      },
    ];
    dependencies.provider.chat = async () => ({
      content: "done",
      tool_calls: [],
    });
    expect(
      (await createActStepRunner(dependencies).runStep(session)).terminal,
    ).toBe("VERIFIED");
  });
  it("rejects stale observation after provider reasoning", async () => {
    const { session, dependencies, active } = makeS17Test();
    session.executionEvidence = [
      {
        action_id: "action",
        dispatched: true,
        observed: true,
        verifier: "satisfied",
        outcome: "VERIFIED",
        navigation: false,
        alreadySatisfied: false,
      },
    ];
    dependencies.provider.chat = async (input) => {
      const inventory = executionInventory(input.messages);
      active.snapshot.visible_text = "Changed while reasoning";
      return {
        content: "",
        tool_calls: [
          {
            id: "goal",
            name: "report_goal_status",
            arguments: JSON.stringify({
              status: "completed",
              summary: "Done",
              observation_id: inventory.observation_id,
            }),
          },
        ],
      };
    };
    expect(
      (await createActStepRunner(dependencies).runStep(session)).terminal,
    ).toBe("UNKNOWN");
  });
});
