import { context, preferences, finiteFetcher } from "./s25-test-support.js";
import { describe, expect, it, vi } from "vitest";
import { dual, setup, task } from "../providers/s25-support.js";
import { modelDecision } from "../../../src/service-worker/model-decision.js";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import { setupAssessment } from "./s21-assessment-support.js";
import { makeS17Test } from "./s17-test-support.js";
import { createAskActIntentRouter } from "../../../src/service-worker/ask-act-intent-router.js";
describe("S25 Worker model decisions", () => {
  it("denied TypeSafe disclosure grants no network call even with a valid primary grant", async () => {
    const fetcher = finiteFetcher("read"),
      { runtime } = setup(fetcher);
    await dual(runtime);
    const publish = vi.fn();
    await expect(
      modelDecision({
        provider: runtime,
        context: context(),
        runId: "run-abcdefghijklmnop",
        publish,
        preferences: () => preferences("custom"),
        task,
        protectedData: true,
      }),
    ).resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
  it.each([
    "ACTION_REQUIRED",
    "SOURCE_READ_REQUIRED",
    "COMPONENT_READ_REQUIRED",
    "ANALYSIS_READ_REQUIRED",
    "QUESTION",
  ])(
    "routes %s natively using only the original request, with no fabricated tools",
    async (route) => {
      const fetcher = finiteFetcher(route),
        { runtime } = setup(fetcher);
      await dual(runtime);
      const test = makeS17Test();
      expect(
        await createAskActIntentRouter({ provider: runtime })(
          "Read scripts then execute Save",
          test.active,
          context(),
        ),
      ).toBe(route);
      const state = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).state;
      expect(state).not.toHaveProperty("projection");
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
  it("accepts direct goal judgment through fresh observation checks while keeping raw UNKNOWN and making no primary/tool calls", async () => {
    const fetcher = finiteFetcher("completed"),
      { runtime } = setup(fetcher);
    await dual(runtime);
    const test = makeS17Test();
    test.dependencies.provider = runtime;
    test.dependencies.preferences = () => preferences();
    test.session.requestContext = context();
    test.session.feedbackOnly = true;
    test.session.executionEvidence = [
      {
        action_id: "action-abcdefghijklmnop",
        dispatched: true,
        observed: false,
        verifier: "pending",
        outcome: "UNKNOWN",
        raw_outcome: "UNKNOWN",
        dispatch: "dispatched",
        navigation: false,
        alreadySatisfied: false,
      },
    ];
    const result = await createActStepRunner(test.dependencies).runStep(
      test.session,
    );
    expect(result.completion).toMatchObject({
      goal_status: "completed",
      action_outcome: "UNKNOWN",
    });
    expect(test.session.messages.flatMap((m) => m.tool_calls ?? [])).toEqual(
      [],
    );
    expect(test.dependencies.executeApprovedProposal).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("discards native completion when document changes during inference", async () => {
    const test = makeS17Test();
    const fetcher = finiteFetcher("completed", () => {
        test.active.snapshot.document_epoch = "different-abcdefghijklmnop";
      }),
      { runtime } = setup(fetcher);
    await dual(runtime);
    test.dependencies.provider = runtime;
    test.dependencies.preferences = () => preferences();
    test.session.requestContext = context();
    test.session.feedbackOnly = true;
    test.session.executionEvidence = [
      {
        action_id: "action",
        dispatched: true,
        observed: false,
        verifier: "pending",
        outcome: "UNKNOWN",
        navigation: false,
        alreadySatisfied: false,
      },
    ];
    const result = await createActStepRunner(test.dependencies).runStep(
      test.session,
    );
    expect(result.completion).toMatchObject({
      goal_status: "unknown",
      action_outcome: "UNKNOWN",
    });
    expect(test.dependencies.executeApprovedProposal).not.toHaveBeenCalled();
  });
  it("native local action judgment uses the shared evidence validator and preserves dispatch history", async () => {
    const test = setupAssessment();
    const fetcher = finiteFetcher("confirmed"),
      { runtime } = setup(fetcher);
    await dual(runtime);
    test.dependencies.provider = runtime;
    test.dependencies.preferences = () => preferences();
    test.session.requestContext = context();
    await test.assess();
    expect(test.session.executionEvidence![0]).toMatchObject({
      outcome: "VERIFIED",
      raw_outcome: "UNKNOWN",
      dispatch: "dispatched",
    });
    expect(test.session.messages.flatMap((m) => m.tool_calls ?? [])).toEqual(
      [],
    );
    expect(test.dependencies.executeApprovedProposal).not.toHaveBeenCalled();
    expect(test.session.assessmentBudget!.calls).toBeLessThanOrEqual(4);
  });
  it("unconfigured Jev performs no consent wait and no native activity", async () => {
    const { runtime } = setup();
    const { primary } = await import("../providers/s25-support.js");
    await runtime.handle("PROVIDER_SAVE", { id: "primary", config: primary });
    const publish = vi.fn();
    await expect(
      modelDecision({
        provider: runtime,
        context: context(),
        runId: "run",
        publish,
        task,
        protectedData: true,
      }),
    ).resolves.toBeUndefined();
    expect(publish).not.toHaveBeenCalled();
  });
});
