import { describe, expect, it } from "vitest";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import {
  storeSubmittedPlan,
  approveSubmittedPlan,
  assertApprovedPlan,
} from "../../../src/service-worker/act-plan-store.js";
import {
  makeS17Test,
  executionInventory,
  planArguments,
} from "./s17-test-support.js";
import type { ActProposal } from "../../../src/service-worker/act-session-types.js";

describe("S17 plan submission and approval", () => {
  it("offers inventory and submit_plan, reviews without executing or approving", async () => {
    const { session, dependencies } = makeS17Test();
    dependencies.provider.chat = async (input) => {
      expect(
        input.tools?.some((tool) => tool.function.name === "submit_plan"),
      ).toBe(true);
      const inventory = executionInventory(input.messages);
      expect(inventory.arbitrary_functions).toBe("UNSUPPORTED");
      expect(inventory.actions[0].input_schema).toBeDefined();
      return {
        content: "",
        tool_calls: [
          {
            id: "plan-call",
            name: "submit_plan",
            arguments: JSON.stringify(
              planArguments(
                inventory.request_revision,
                inventory.observation_id,
              ),
            ),
          },
        ],
      };
    };
    const result = await createActStepRunner(dependencies).runStep(session);
    expect(result.state).toBe("PLAN_REVIEW");
    expect(session.plan?.approved).toBe(false);
    expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
    expect(dependencies.publish).toHaveBeenCalledWith(
      session.runId,
      expect.objectContaining({
        type: "action_review_required",
        action: expect.objectContaining({ tool: "submit_plan" }),
      }),
    );
  });
  it("returns unsupported plan errors in the same conversation for bounded correction", async () => {
    const { session, dependencies } = makeS17Test();
    let turns = 0;
    dependencies.provider.chat = async (input) => {
      const inventory = executionInventory(input.messages);
      const args = planArguments(
        inventory.request_revision,
        inventory.observation_id,
      );
      if (turns++ === 0) args.steps[0]!.capability = "execute_javascript";
      else
        expect(
          input.messages.some(
            (message) =>
              message.role === "tool" &&
              message.content.includes("UNSUPPORTED_STEP"),
          ),
        ).toBe(true);
      return {
        content: "",
        tool_calls: [
          {
            id: `plan-${turns}`,
            name: "submit_plan",
            arguments: JSON.stringify(args),
          },
        ],
      };
    };
    expect(
      (await createActStepRunner(dependencies).runStep(session)).state,
    ).toBe("PLAN_REVIEW");
    expect(turns).toBe(2);
    expect(session.plan?.input.steps).toHaveLength(1);
    expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
  });
  it("requires current document/revision and rejects reused approval or a changed value", () => {
    const { session, active } = makeS17Test();
    const submit = () =>
      storeSubmittedPlan({
        session,
        call: {
          id: "plan-call",
          name: "submit_plan",
          arguments: JSON.stringify({
            ...planArguments(),
            steps: [{ ...planArguments().steps[0], user_input: "original" }],
          }),
        },
        revision: 1,
        documentEpoch: active.snapshot.document_epoch,
        capabilities: ["propose_click"],
        evidenceIds: ["evidence-abcdefghijklmnop"],
      });
    submit();
    expect(() => approveSubmittedPlan(session, "different-epoch", 1)).toThrow();
    expect(() =>
      approveSubmittedPlan(session, active.snapshot.document_epoch, 2),
    ).toThrow();
    approveSubmittedPlan(session, active.snapshot.document_epoch, 1);
    expect(() =>
      approveSubmittedPlan(session, active.snapshot.document_epoch, 1),
    ).toThrow();
    const proposal = { tool: "click_by_ref", value: "changed" } as ActProposal;
    expect(() =>
      assertApprovedPlan(session, proposal, active.snapshot.document_epoch, 1),
    ).toThrow();
    const firstRevision = session.plan!.revision;
    submit();
    expect(session.plan?.revision).toBe(firstRevision + 1);
    expect(session.plan?.approved).toBe(false);
    expect(() =>
      assertApprovedPlan(session, proposal, active.snapshot.document_epoch, 1),
    ).toThrow();
  });
  it("rejects fabricated evidence, malformed steps and cancelled requests", () => {
    const { session, active } = makeS17Test();
    const options = {
      session,
      call: {
        id: "plan-call",
        name: "submit_plan",
        arguments: JSON.stringify(planArguments()),
      },
      revision: 1,
      documentEpoch: active.snapshot.document_epoch,
      capabilities: ["propose_click"],
      evidenceIds: [] as string[],
    };
    expect(() => storeSubmittedPlan(options)).toThrow();
    options.evidenceIds.push("evidence-abcdefghijklmnop");
    options.call.arguments = JSON.stringify({
      ...planArguments(),
      steps: [{ intent: "Run", capability: "propose_click" }],
    });
    expect(() => storeSubmittedPlan(options)).toThrow();
    session.requestContext = {
      tabId: 1,
      signal: AbortSignal.abort(),
      check() {},
    };
    expect(() => storeSubmittedPlan(options)).toThrow();
    expect(session.plan).toBeUndefined();
  });
});
