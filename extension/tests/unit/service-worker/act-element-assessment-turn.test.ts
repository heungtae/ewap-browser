import { describe, expect, it, vi } from "vitest";
import { runElementAssessment } from "../../../src/service-worker/act-element-assessment-turn.js";
import { makeS17Test } from "./s17-test-support.js";
import type { NormalizedProviderRequest } from "../../../src/providers/types.js";

describe("S21 element interpretation continuation", () => {
  it("returns a bounded read with the same call ID then proposes through offered capability", async () => {
    const { dependencies, session } = makeS17Test();
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "propose_click",
          description: "Click",
          parameters: { type: "object" },
        },
      },
    ];
    let rounds = 0;
    dependencies.provider.chat = vi.fn(
      async (input: Pick<NormalizedProviderRequest, "messages" | "tools">) => {
        if (++rounds === 1)
          return {
            content: "",
            tool_calls: [
              {
                id: "read-call-abcdefghijkl",
                name: "read_control_observation",
                arguments: "{}",
              },
            ],
          };
        const result = input.messages.find(
          (m) =>
            m.role === "tool" && m.tool_call_id === "read-call-abcdefghijkl",
        );
        expect(result?.content).toContain("UNTRUSTED_CONTROL_OBSERVATION");
        expect(input.tools?.map((t) => t.function.name)).toEqual([
          "assess_element",
          "read_control_observation",
        ]);
        const schema = input.tools![0]!.function.parameters
          .properties as Record<string, { enum: string[] }>;
        const id = schema.observation_id!.enum[0];
        return {
          content: "",
          tool_calls: [
            {
              id: "assessment-call-abcdefgh",
              name: "assess_element",
              arguments: JSON.stringify({
                phase: "element",
                observation_id: id,
                decision: "propose_action",
                rationale: "Supported native control",
                expected_observation: "Panel opens",
                evidence_ids: [id],
                action: { name: "propose_click", arguments: {} },
              }),
            },
          ],
        };
      },
    );
    const refresh = vi.fn(async () => ({
      projection: { coverage: "bounded" },
      tools,
    }));
    const result = await runElementAssessment({
      dependencies,
      session,
      messages: [{ role: "user", content: session.prompt }],
      tools,
      observationId: "old-observation",
      stepId: "step",
      refresh,
    });
    expect(result.observationId).not.toBe("old-observation");
    expect(result.response.tool_calls[0]?.name).toBe("assess_element");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(session.assessmentBudget).toMatchObject({ calls: 2, reads: 1 });
    expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
  });
  it("unknown and malformed or unoffered proposals create no mutation authority", async () => {
    const { dependencies, session } = makeS17Test();
    dependencies.provider.chat = vi.fn(async () => ({
      content: "",
      tool_calls: [
        { id: "bad-call-abcdefghijkl", name: "propose_click", arguments: "{}" },
      ],
    }));
    await expect(
      runElementAssessment({
        dependencies,
        session,
        messages: [],
        tools: [],
        observationId: "observation",
        stepId: "step",
        refresh: async () => ({ projection: {}, tools: [] }),
      }),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
  });
});
