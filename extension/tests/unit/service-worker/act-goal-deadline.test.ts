import { afterEach, describe, expect, it, vi } from "vitest";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import { makeS17Test, executionInventory } from "./s17-test-support.js";

afterEach(() => vi.useRealTimers());
const prepare = () => {
  const test = makeS17Test();
  test.session.executionEvidence = [
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
  return test;
};
describe("goal recheck cancellation and deadline", () => {
  it("R10 aborts a hanging retry at 15 seconds and preserves verified action", async () => {
    vi.useFakeTimers();
    const { session, dependencies, active } = prepare();
    let calls = 0,
      retrySignal: AbortSignal | undefined;
    dependencies.provider.chat = async (input, context) => {
      if (++calls > 1) {
        retrySignal = context?.signal;
        return new Promise(() => {});
      }
      active.snapshot.visible_text = "Changed";
      return {
        content: "",
        tool_calls: [
          {
            id: "goal-first",
            name: "report_goal_status",
            arguments: JSON.stringify({
              status: "completed",
              summary: "Done",
              observation_id: executionInventory(input.messages).observation_id,
            }),
          },
        ],
      };
    };
    const pending = createActStepRunner(dependencies).runStep(session);
    await vi.advanceTimersByTimeAsync(15_001);
    const result = await pending;
    expect(calls).toBe(2);
    expect(retrySignal?.aborted).toBe(true);
    expect(result.completion).toMatchObject({
      action_outcome: "VERIFIED",
      goal_status: "unknown",
      reason: "REASSESSMENT_LIMIT",
    });
    expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
  });
  it("R09 cancels reassessment and never publishes late success", async () => {
    vi.useFakeTimers();
    const { session, dependencies, active } = prepare();
    const controller = new AbortController();
    session.requestContext = {
      tabId: 1,
      signal: controller.signal,
      check() {},
    };
    let calls = 0;
    dependencies.provider.chat = async (input) => {
      if (++calls > 1) return new Promise(() => {});
      active.snapshot.visible_text = "Changed";
      return {
        content: "",
        tool_calls: [
          {
            id: "goal-first",
            name: "report_goal_status",
            arguments: JSON.stringify({
              status: "completed",
              summary: "Done",
              observation_id: executionInventory(input.messages).observation_id,
            }),
          },
        ],
      };
    };
    const pending = createActStepRunner(dependencies).runStep(session);
    const rejected = expect(pending).rejects.toMatchObject({
      code: "POLICY_DENIED",
    });
    await vi.advanceTimersByTimeAsync(250);
    controller.abort();
    await rejected;
    expect(dependencies.publish).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "run_terminal",
        completion: expect.objectContaining({ goal_status: "completed" }),
      }),
    );
  });
});
