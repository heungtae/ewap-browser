import type { NormalizedProviderRequest } from "../../../src/providers/types.js";
import { describe, expect, it, vi } from "vitest";
import {
  setupAssessment,
  assessmentResponse,
  packet,
} from "./s21-assessment-support.js";

describe("S21 read-only action assessment", () => {
  it("confirms related fresh local UI evidence while preserving raw unknown receipt and code", async () => {
    const test = setupAssessment();
    test.dependencies.provider.chat = vi.fn(
      async (input: Pick<NormalizedProviderRequest, "messages" | "tools">) => {
        expect(input.tools?.map((tool) => tool.function.name)).toEqual([
          "assess_action_result",
          "read_control_observation",
        ]);
        expect(packet(input.messages).evidence[0]?.changed).toBe(true);
        return assessmentResponse(input.messages);
      },
    );
    await test.assess();
    expect(test.session.executionEvidence?.[0]).toMatchObject({
      outcome: "VERIFIED",
      raw_outcome: "UNKNOWN",
      dispatch: "dispatched",
      confirmation: "llm_evidence",
      code: "POSTCONDITION_UNVERIFIED",
    });
    expect(test.session.feedbackOnly).toBeUndefined();
    expect(test.dependencies.executeApprovedProposal).not.toHaveBeenCalled();
  });
  it.each(["not_dispatched", "unknown"])(
    "never promotes %s click dispatch or offers a mutation",
    async (dispatch) => {
      const test = setupAssessment(dispatch);
      await test.assess();
      expect(test.dependencies.provider.chat).not.toHaveBeenCalled();
      expect(test.session.executionEvidence?.[0]?.outcome).toBe("UNKNOWN");
    },
  );
  it.each(["foreign", "empty", "confidence", "stale", "truncated", "scope"])(
    "rejects %s completion evidence",
    async (kind) => {
      const test = setupAssessment();
      test.dependencies.provider.chat = vi.fn(
        async (
          input: Pick<NormalizedProviderRequest, "messages" | "tools">,
        ) => {
          const response = assessmentResponse(
            input.messages,
            "confirmed",
            kind === "empty"
              ? []
              : kind === "foreign"
                ? ["foreign"]
                : undefined,
          );
          if (kind === "confidence") {
            const args = JSON.parse(response.tool_calls[0]!.arguments);
            args.confidence = 1;
            response.tool_calls[0]!.arguments = JSON.stringify(args);
          }
          if (kind === "stale") test.active.snapshot.nodes[0]!.state = {};
          if (kind === "truncated")
            Object.assign(test.active.snapshot, { truncated: true });
          if (kind === "scope")
            test.active.snapshot.document_epoch = "new-document-abcdefghijkl";
          return response;
        },
      );
      await test.assess();
      expect(test.session.executionEvidence?.[0]?.outcome).toBe("UNKNOWN");
      expect(test.dependencies.executeApprovedProposal).not.toHaveBeenCalled();
      expect(test.session.assessmentBudget!.calls).toBeLessThanOrEqual(2);
    },
  );
  it("returns bounded current DOM read under the same tool call ID then accepts fresh evidence", async () => {
    const test = setupAssessment();
    let calls = 0;
    test.dependencies.provider.chat = vi.fn(
      async (input: Pick<NormalizedProviderRequest, "messages" | "tools">) => {
        if (++calls === 1)
          return {
            content: "",
            tool_calls: [
              {
                id: "read-call",
                name: "read_control_observation",
                arguments: "{}",
              },
            ],
          };
        expect(
          input.messages.some(
            (m) =>
              m.role === "tool" &&
              m.tool_call_id === "read-call" &&
              m.content.includes("observation_id"),
          ),
        ).toBe(true);
        return assessmentResponse(input.messages);
      },
    );
    await test.assess();
    expect(test.session.assessmentBudget).toMatchObject({ calls: 2, reads: 1 });
    expect(test.session.executionEvidence?.[0]?.outcome).toBe("VERIFIED");
  });
  it("reassesses a negative answer when the UI changes during provider inference", async () => {
    const test = setupAssessment();
    test.active.snapshot.nodes[0]!.state = {};
    let calls = 0;
    test.dependencies.provider.chat = vi.fn(
      async (input: Pick<NormalizedProviderRequest, "messages" | "tools">) => {
        if (++calls === 1) {
          test.active.snapshot.nodes[0]!.state = { expanded: true };
          return assessmentResponse(input.messages, "not_completed", []);
        }
        return assessmentResponse(input.messages);
      },
    );
    await test.assess();
    expect(calls).toBe(2);
    expect(test.session.executionEvidence![0]!.confirmation).toBe(
      "llm_evidence",
    );
    expect(test.dependencies.executeApprovedProposal).not.toHaveBeenCalled();
  });
  it("does not accept checked confirmation against an explicit conflicting current state", async () => {
    const test = setupAssessment();
    Object.assign(test.proposal, {
      tool: "set_checked_by_ref",
      argument: { checked: true },
    });
    test.active.snapshot.nodes[0]!.state = { checked: false };
    test.dependencies.provider.chat = vi.fn(
      async (input: Pick<NormalizedProviderRequest, "messages" | "tools">) =>
        assessmentResponse(input.messages, "confirmed", [
          packet(input.messages).evidence[0]!.id,
        ]),
    );
    await test.assess();
    expect(test.session.executionEvidence![0]!.outcome).toBe("UNKNOWN");
    expect(test.dependencies.executeApprovedProposal).not.toHaveBeenCalled();
  });
  it("Stop discards a late provider assessment", async () => {
    const test = setupAssessment();
    const controller = new AbortController();
    test.session.requestContext = {
      tabId: 1,
      signal: controller.signal,
      check() {},
    };
    test.dependencies.provider.chat = vi.fn(
      async (input: Pick<NormalizedProviderRequest, "messages" | "tools">) => {
        controller.abort();
        return assessmentResponse(input.messages);
      },
    );
    await expect(test.assess()).rejects.toMatchObject({
      code: "POLICY_DENIED",
    });
    expect(test.session.executionEvidence?.[0]?.outcome).toBe("UNKNOWN");
  });
  it("provider failure preserves original action evidence without page error disclosure", async () => {
    const test = setupAssessment();
    test.dependencies.provider.chat = vi.fn(async () => {
      throw Error("secret raw body");
    });
    await test.assess();
    expect(JSON.stringify(test.session.messages)).not.toContain(
      "secret raw body",
    );
    expect(test.session.executionEvidence?.[0]?.raw_outcome).toBe("UNKNOWN");
  });
  it("a normal verified action adds no assessment provider call", async () => {
    const test = setupAssessment();
    test.session.executionEvidence![0]!.outcome = "VERIFIED";
    await test.assess();
    expect(test.dependencies.provider.chat).not.toHaveBeenCalled();
    expect(test.session.assessmentBudget).toBeUndefined();
  });
});
