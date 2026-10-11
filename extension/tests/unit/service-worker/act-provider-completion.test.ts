import { describe, expect, it, vi } from "vitest";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import { makeS17Test, executionInventory } from "./s17-test-support.js";
import type { NormalizedProviderRequest } from "../../../src/providers/types.js";
import { digestCanonical } from "../../../src/security/canonical.js";
import { assessmentBudget } from "../../../src/service-worker/act-assessment-budget.js";

type Input = Pick<NormalizedProviderRequest, "messages" | "tools">;
const goalReport = (input: Input, call = 1, status = "completed") => ({
  content: "",
  tool_calls: [
    {
      id: `provider-goal-${call}`,
      name: "report_goal_status",
      arguments: JSON.stringify({
        status,
        summary: "The requested goal is visible.",
        observation_id: executionInventory(input.messages).observation_id,
      }),
    },
  ],
});
const setup = (outcome: "UNKNOWN" | "FAILED" = "UNKNOWN") => {
  const test = makeS17Test();
  test.session.feedbackOnly = true;
  test.session.requiredGoalActions = 2;
  test.session.executionEvidence = [
    {
      action_id: "provider-completion-action",
      dispatched: true,
      dispatch: "dispatched",
      observed: false,
      verifier: outcome === "FAILED" ? "failed" : "pending",
      outcome,
      raw_outcome: outcome,
      code:
        outcome === "FAILED"
          ? "TARGET_NOT_ACTIONABLE"
          : "NAVIGATION_UNVERIFIED",
      navigation: true,
      alreadySatisfied: false,
    },
  ];
  test.dependencies.provider.chat = vi.fn(async (input: Input) =>
    goalReport(input),
  );
  return test;
};
describe("ISS-20261011-004 provider decides final goal completion", () => {
  it.each(["UNKNOWN", "FAILED"] as const)(
    "does not interpret ordinary model prose as structured completion for %s",
    async (outcome) => {
      const { session, dependencies } = setup(outcome);
      dependencies.provider.chat = vi.fn(async () => ({
        content: "Everything completed",
        tool_calls: [],
      }));
      const result = await createActStepRunner(dependencies).runStep(session);
      expect(result.completion).toMatchObject({
        action_outcome: outcome,
        goal_status: "unknown",
      });
      expect(result.outcome).toBe(outcome);
    },
  );
  it.each(["UNKNOWN", "FAILED"] as const)(
    "accepts completed while retaining local %s action history and incomplete action counts",
    async (outcome) => {
      const { session, dependencies } = setup(outcome);
      const before = structuredClone(session.executionEvidence);
      const result = await createActStepRunner(dependencies).runStep(session);
      expect(result).toMatchObject({
        terminal: "GOAL_VERIFIED",
        outcome: "VERIFIED",
        completion: {
          action_outcome: outcome,
          goal_status: "completed",
          reason: "PROVIDER_COMPLETED",
        },
      });
      expect(result.code).toBeUndefined();
      expect(result.message).toContain("목표의 완료를 확인");
      expect(session.executionEvidence).toEqual(before);
      expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
      expect(dependencies.publish).toHaveBeenCalledWith(expect.any(String), {
        type: "activity_finished",
        stage: "COMPLETED",
      });
    },
  );
  it("accepts the reported pricing URL transition with evidence refs", async () => {
    const { session, dependencies, active } = setup();
    Object.assign(active, {
      url: "https://chatgpt.com/#pricing",
      navigationUrlDigest: digestCanonical("https://chatgpt.com/#pricing"),
    });
    session.executionEvidence![0]!.navigation_binding = {
      destination_digest: digestCanonical("https://chatgpt.com/ko-KR/pricing/"),
      source_document_epoch: "source-document",
      source_page_scope_epoch: "source-scope",
    };
    assessmentBudget(session);
    dependencies.provider.chat = vi.fn(async (input: Input) => {
      const report = goalReport(input);
      const projection = [...input.messages]
        .reverse()
        .find((message) =>
          message.content.startsWith("[UNTRUSTED_PAGE_PROJECTION]"),
        )!;
      const node = JSON.parse(projection.content.split("\n")[1]!).nodes[0];
      report.tool_calls[0]!.arguments = JSON.stringify({
        ...JSON.parse(report.tool_calls[0]!.arguments),
        evidence_refs: [node.model_ref],
      });
      return report;
    });
    const result = await createActStepRunner(dependencies).runStep(session);
    expect(result.completion).toMatchObject({
      goal_status: "completed",
      action_outcome: "UNKNOWN",
      reason: "PROVIDER_COMPLETED",
      assessment: { confirmation: "llm_evidence" },
    });
    expect(session.executionEvidence![0]!.raw_outcome).toBe("UNKNOWN");
    expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
  });
  it("rereads stale completed reports even without a navigation binding", async () => {
    const { session, dependencies, active } = setup();
    let calls = 0;
    dependencies.provider.chat = vi.fn(async (input: Input) => {
      if (++calls === 1) active.snapshot.visible_text = "New result";
      return goalReport(input, calls);
    });
    const result = await createActStepRunner(dependencies).runStep(session);
    expect(result.completion).toMatchObject({
      goal_status: "completed",
      reassessments: 1,
    });
    expect(calls).toBe(2);
    expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
  });
  it("rejects reports for an observation the provider was not given", async () => {
    const { session, dependencies } = setup();
    dependencies.provider.chat = vi.fn(async (input: Input) => {
      const report = goalReport(input);
      report.tool_calls[0]!.arguments = JSON.stringify({
        ...JSON.parse(report.tool_calls[0]!.arguments),
        observation_id: "another-observation",
      });
      return report;
    });
    await expect(
      createActStepRunner(dependencies).runStep(session),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
  });
  it.each(["UNKNOWN", "FAILED"] as const)(
    "preserves %s evidence when the provider reports unknown",
    async (outcome) => {
      const { session, dependencies } = setup(outcome);
      dependencies.provider.chat = vi.fn(async (input: Input) =>
        goalReport(input, 1, "unknown"),
      );
      const result = await createActStepRunner(dependencies).runStep(session);
      expect(result.completion).toMatchObject({
        action_outcome: outcome,
        goal_status: "unknown",
      });
      expect(result.outcome).toBe(outcome);
    },
  );
});
