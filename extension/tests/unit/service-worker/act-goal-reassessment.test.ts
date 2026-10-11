import { describe, expect, it, vi } from "vitest";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import { makeS17Test, executionInventory } from "./s17-test-support.js";
import type { NormalizedProviderRequest } from "../../../src/providers/types.js";

const setup = () => {
  const test = makeS17Test();
  test.session.executionEvidence = [
    {
      action_id: "action",
      dispatched: true,
      observed: true,
      verifier: "satisfied",
      outcome: "VERIFIED",
      navigation: true,
      alreadySatisfied: false,
    },
  ];
  return test;
};
const report = (
  input: Pick<NormalizedProviderRequest, "messages" | "tools">,
  call: number,
  status = "completed",
  refs?: string[],
) => ({
  content: "",
  tool_calls: [
    {
      id: `goal-${call}`,
      name: "report_goal_status",
      arguments: JSON.stringify({
        status,
        summary: "Pricing shown",
        observation_id: executionInventory(input.messages).observation_id,
        ...(refs ? { evidence_refs: refs } : {}),
      }),
    },
  ],
});
describe("Act goal observation reassessment", () => {
  it("R01 discards incomplete shell report, rereads pricing and completes without mutation", async () => {
    const { session, dependencies, active } = setup();
    let calls = 0;
    const ids: string[] = [];
    dependencies.provider.chat = vi.fn(
      async (input: Pick<NormalizedProviderRequest, "messages" | "tools">) => {
        ids.push(executionInventory(input.messages).observation_id);
        if (++calls === 1) {
          active.snapshot.visible_text = "Pricing plans";
          return report(input, calls, "incomplete");
        }
        expect(input.tools!.map((t) => t.function.name)).toEqual([
          "report_goal_status",
        ]);
        expect(
          input.messages.some(
            (m) =>
              m.role === "tool" &&
              m.tool_call_id === "goal-1" &&
              m.content.includes("OBSERVATION_CHANGED"),
          ),
        ).toBe(true);
        return report(input, calls);
      },
    );
    const result = await createActStepRunner(dependencies).runStep(session);
    expect(result.terminal).toBe("GOAL_VERIFIED");
    expect(result.completion).toMatchObject({
      action_outcome: "VERIFIED",
      goal_status: "completed",
      reassessments: 1,
    });
    expect(new Set(ids).size).toBe(2);
    expect(session.executionEvidence).toHaveLength(1);
    expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
  });
  it("R03/R10 bounds continuously changing result to two read-only retries", async () => {
    const { session, dependencies, active } = setup();
    let calls = 0;
    dependencies.provider.chat = vi.fn(
      async (input: Pick<NormalizedProviderRequest, "messages" | "tools">) => {
        active.snapshot.visible_text = `Version ${++calls}`;
        return report(input, calls);
      },
    );
    const result = await createActStepRunner(dependencies).runStep(session);
    expect(calls).toBe(3);
    expect(result.code).toBe("GOAL_UNVERIFIED");
    expect(result.completion).toMatchObject({
      action_outcome: "VERIFIED",
      goal_status: "unknown",
      reason: "REASSESSMENT_LIMIT",
      reassessments: 2,
    });
    expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
  });
  it("R10 preserves verified execution when the reassessment provider fails", async () => {
    const { session, dependencies, active } = setup();
    let calls = 0;
    dependencies.provider.chat = vi.fn(
      async (input: Pick<NormalizedProviderRequest, "messages" | "tools">) => {
        if (++calls > 1) throw new Error("provider secret payload");
        active.snapshot.visible_text = "Pricing";
        return report(input, calls);
      },
    );
    const result = await createActStepRunner(dependencies).runStep(session);
    expect(result.completion).toMatchObject({
      action_outcome: "VERIFIED",
      reason: "PROVIDER_FAILED",
      goal_status: "unknown",
    });
    expect(JSON.stringify(result)).not.toContain("secret payload");
  });
  it.each(["tab", "origin", "document", "path"])(
    "R09 rejects unexpected %s changes before retry",
    async (change) => {
      const { session, dependencies, active } = setup();
      dependencies.provider.chat = vi.fn(
        async (
          input: Pick<NormalizedProviderRequest, "messages" | "tools">,
        ) => {
          const result = report(input, 1);
          if (change === "tab") active.tabId = 2;
          if (change === "origin") active.origin = "https://other.test";
          if (change === "document")
            active.snapshot.document_epoch = "epoch-replacement12345";
          if (change === "path") active.path = "/other";
          return result;
        },
      );
      const result = await createActStepRunner(dependencies).runStep(session);
      expect(result.completion).toMatchObject({
        action_outcome: "VERIFIED",
        goal_status: "unknown",
        reason: "BINDING_CHANGED",
      });
      expect(dependencies.provider.chat).toHaveBeenCalledTimes(1);
    },
  );
  it("R08 preserves typed failure even when observation changes", async () => {
    const { session, dependencies, active } = setup();
    session.feedbackOnly = true;
    Object.assign(session.executionEvidence![0]!, {
      outcome: "FAILED",
      verifier: "failed",
      observed: false,
      code: "TARGET_NOT_ACTIONABLE",
    });
    dependencies.provider.chat = async (
      input: Pick<NormalizedProviderRequest, "messages" | "tools">,
    ) => {
      active.snapshot.visible_text = "Changed";
      return report(input, 1);
    };
    const result = await createActStepRunner(dependencies).runStep(session);
    expect(result.terminal).toBe("FAILED");
    expect(result.code).toBe("TARGET_NOT_ACTIONABLE");
    expect(result.completion).toMatchObject({
      action_outcome: "FAILED",
      reason: "VERIFIER_FAILED",
    });
  });
  it("R05 retains action success without promoting an unmet original goal", async () => {
    const { session, dependencies } = setup();
    dependencies.provider.chat = async (
      input: Pick<NormalizedProviderRequest, "messages" | "tools">,
    ) => report(input, 1, "incomplete");
    const result = await createActStepRunner(dependencies).runStep(session);
    expect(result.completion).toMatchObject({
      action_outcome: "VERIFIED",
      goal_status: "incomplete",
    });
    expect(result.code).toBe("GOAL_INCOMPLETE");
  });
});
