import { describe, expect, it } from "vitest";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import { makeS17Test, executionInventory } from "./s17-test-support.js";

describe("page method goal reports", () => {
  it("asks for a structured report after a plain answer without reoffering mutations", async () => {
    const { session, dependencies } = makeS17Test();
    session.executionEvidence = [
      {
        action_id: "method",
        dispatched: true,
        dispatch: "dispatched",
        page_method_invocation: "returned",
        observed: false,
        verifier: "pending",
        outcome: "UNKNOWN",
        navigation: false,
        alreadySatisfied: false,
      },
    ];
    let turns = 0;
    dependencies.provider.chat = async (input) => {
      if (turns++ === 0)
        return { content: "The computed value is seven.", tool_calls: [] };
      expect(input.tools?.map((tool) => tool.function.name)).toEqual([
        "report_goal_status",
      ]);
      return {
        content: "",
        tool_calls: [
          {
            id: "goal",
            name: "report_goal_status",
            arguments: JSON.stringify({
              status: "completed",
              summary: "Returned computation",
              observation_id: executionInventory(input.messages).observation_id,
            }),
          },
        ],
      };
    };
    const result = await createActStepRunner(dependencies).runStep(session);
    expect(result.terminal).toBe("GOAL_VERIFIED");
    expect(result.completion).toMatchObject({
      action_outcome: "UNKNOWN",
      goal_status: "completed",
    });
    expect(turns).toBe(2);
    expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
  });
});
