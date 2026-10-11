import { describe, expect, it } from "vitest";
import { settledAssessmentTranscript } from "../../../src/service-worker/assessment-transcript.js";
import type { ProviderMessage } from "../../../src/providers/types.js";
describe("assessment transcript continuation", () => {
  const call = (id: string): ProviderMessage => ({
    role: "assistant",
    content: "",
    tool_calls: [{ id, name: "assess_action_result", arguments: "{}" }],
  });
  it("returns a rejected malformed assessment to its original call ID", () => {
    const messages = settledAssessmentTranscript([call("bad-call")]);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      role: "tool",
      tool_call_id: "bad-call",
    });
    expect(JSON.parse(messages[1]!.content)).toMatchObject({
      status: "FAILED",
      reason: "ASSESSMENT_NOT_ACCEPTED",
    });
  });
  it("preserves accepted results and fills each missing result before another assistant turn", () => {
    const accepted = {
      role: "tool" as const,
      tool_call_id: "first",
      content: "accepted",
    };
    const messages = settledAssessmentTranscript([
      call("first"),
      accepted,
      call("second"),
      call("third"),
    ]);
    expect(messages.map((m) => m.role)).toEqual([
      "assistant",
      "tool",
      "assistant",
      "tool",
      "assistant",
      "tool",
    ]);
    expect(messages[1]).toBe(accepted);
    expect(
      messages.filter((m) => m.role === "tool").map((m) => m.tool_call_id),
    ).toEqual(["first", "second", "third"]);
    expect(settledAssessmentTranscript(messages)).toEqual(messages);
  });
});
