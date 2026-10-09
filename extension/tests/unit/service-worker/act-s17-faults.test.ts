import { describe, expect, it } from "vitest";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import { recordActExecution } from "../../../src/service-worker/act-execution-feedback.js";
import { makeS17Test, executionInventory } from "./s17-test-support.js";
import type { ActProposal } from "../../../src/service-worker/act-session-types.js";
const proposal = {
  id: "proposal-abcdefghijklmnop",
  tool: "click_by_ref",
  targetName: "Run",
  toolCallId: "execute-call",
} as ActProposal;
const verified = {
  action_id: "action",
  dispatched: true,
  observed: true,
  verifier: "satisfied" as const,
  outcome: "VERIFIED" as const,
  navigation: false,
  alreadySatisfied: false,
};

describe("S17 fault and terminal boundaries", () => {
  it("preserves failed feedback with harness capability declarations", async () => {
    const { session, dependencies } = makeS17Test();
    session.harnessCapabilities = {
      request_revision: 1,
      read_tools: [],
      propose_tools: ["propose_click"],
      entry_roles: ["button"],
    };
    recordActExecution(session, proposal, {
      ok: false,
      outcome: "UNKNOWN",
      code: "POSTCONDITION_UNMET",
    });
    dependencies.provider.chat = async () => ({
      content: "success",
      tool_calls: [],
    });
    expect(
      (await createActStepRunner(dependencies).runStep(session)).terminal,
    ).toBe("UNKNOWN");
  });
  it("returns the final declared workflow result to the model", async () => {
    const { session, dependencies } = makeS17Test();
    const step = {
      id: "last",
      tool: "click_by_ref" as const,
      target: { role: "button" as const, name: "Run" },
    };
    session.workflow = {
      declaration: {
        schema_version: 1,
        id: "workflow",
        title: "Report",
        steps: [step],
      },
      step,
      count: 0,
    };
    session.executionEvidence = [verified];
    dependencies.provider.chat = async (input) => {
      expect(
        input.messages.some((message) =>
          message.content.includes("workflow has no remaining steps"),
        ),
      ).toBe(true);
      const inventory = executionInventory(input.messages);
      return {
        content: "",
        tool_calls: [
          {
            id: "goal",
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
    expect(
      (
        await createActStepRunner(dependencies).continueWorkflow(
          session,
          proposal,
        )
      ).terminal,
    ).toBe("GOAL_VERIFIED");
  });
  it("invalidates old plan and API refs when observing an approved new document", async () => {
    const { session, dependencies, active } = makeS17Test();
    const oldRun = dependencies.coordinator.runs.start(
      1,
      0,
      active.snapshot.document_epoch,
      "act",
    );
    session.runId = oldRun.id;
    dependencies.coordinator.runs.terminal(oldRun.id, "VERIFIED");
    session.navigationFeedback = true;
    session.continueAfterApproval = true;
    session.pageApiActions = [];
    session.executionEvidence = [verified];
    active.snapshot.document_epoch = "new-epoch-abcdefghijklmnop";
    dependencies.provider.chat = async (input) => {
      expect(session.continueAfterApproval).toBeUndefined();
      expect(executionInventory(input.messages).document_epoch).toBe(
        active.snapshot.document_epoch,
      );
      return { content: "done", tool_calls: [] };
    };
    expect(
      (await createActStepRunner(dependencies).runStep(session)).terminal,
    ).toBe("VERIFIED");
  });
  it.each(["origin", "tab", "observation"])(
    "reports UNKNOWN when safe %s feedback is unavailable",
    async (mode) => {
      const { session, dependencies, active } = makeS17Test();
      const oldRun = dependencies.coordinator.runs.start(
        1,
        0,
        active.snapshot.document_epoch,
        "act",
      );
      dependencies.coordinator.runs.terminal(oldRun.id, "VERIFIED");
      session.runId = oldRun.id;
      session.navigationFeedback = true;
      session.executionEvidence = [verified];
      session.lastObservationScope = dependencies.pageScope(active);
      if (mode === "origin") active.origin = "https://other.test";
      if (mode === "tab") active.tabId = 2;
      if (mode === "observation")
        dependencies.readActive = async () => {
          throw Error("timeout");
        };
      expect(
        (await createActStepRunner(dependencies).runStep(session)).terminal,
      ).toBe("UNKNOWN");
      expect(dependencies.provider.chat).not.toHaveBeenCalled();
      expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
      expect(dependencies.endSession).toHaveBeenCalledWith(session);
    },
  );
  it("rejects a fabricated observation ID", async () => {
    const { session, dependencies } = makeS17Test();
    session.executionEvidence = [verified];
    dependencies.provider.chat = async () => ({
      content: "",
      tool_calls: [
        {
          id: "goal",
          name: "report_goal_status",
          arguments: JSON.stringify({
            status: "completed",
            summary: "Done",
            observation_id: "invented",
          }),
        },
      ],
    });
    await expect(
      createActStepRunner(dependencies).runStep(session),
    ).rejects.toThrow();
    expect(dependencies.endSession).toHaveBeenCalledWith(session);
  });
  it("records incomplete goals separately from action verification and budgets", async () => {
    const { session, dependencies } = makeS17Test();
    session.executionEvidence = [verified];
    dependencies.provider.chat = async (input) => ({
      content: "",
      tool_calls: [
        {
          id: "goal",
          name: "report_goal_status",
          arguments: JSON.stringify({
            status: "incomplete",
            summary: "More work remains",
            observation_id: executionInventory(input.messages).observation_id,
          }),
        },
      ],
    });
    expect(
      await createActStepRunner(dependencies).runStep(session),
    ).toMatchObject({
      terminal: "INCOMPLETE",
      reason: "GOAL_UNMET",
      code: "GOAL_INCOMPLETE",
      outcome: "UNKNOWN",
    });
  });
});
