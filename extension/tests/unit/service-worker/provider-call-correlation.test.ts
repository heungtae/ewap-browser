import { describe, expect, it } from "vitest";
import {
  createProviderCallTrace,
  inheritProviderCallTrace,
  providerCallId,
  traceProviderHandling,
  traceProviderRequest,
  traceProviderResponse,
} from "../../../src/providers/provider-call-diagnostics.js";
import type {
  ProviderChatResponse,
  ProviderConfig,
} from "../../../src/providers/types.js";
import {
  methodTraceSnapshot,
  setMethodTraceLevel,
} from "../../../src/diagnostics/method-trace.js";
import { runHarnessReadTurns } from "../../../src/service-worker/act-harness-turns.js";

const config: ProviderConfig = {
  plugin_id: "contextpilot.openai-compatible",
  plugin_version: "1.0.0",
  label: "fixture",
  base_url: "https://private-endpoint.example/v1",
  wire_api: "responses",
  model: "fixture",
  api_key: "PRIVATE_API_CREDENTIAL",
  api_key_header: "authorization_bearer",
  headers: [],
  timeout_ms: 1000,
  enabled: true,
};
const read = {
  id: "read-call-aaaaaaaaaaaa",
  name: "read_page",
  arguments: "{}",
};
const proposal = {
  id: "proposal-call-aaaaaaaaaaaa",
  name: "propose_set_checked",
  arguments: JSON.stringify({ target: "PRIVATE_ARGUMENT_SENTINEL" }),
};

describe("ISS-20261018-003 provider call correlation", () => {
  it.each(["proposal", "answer", "mixed"] as const)(
    "keeps the final %s response linked through the harness and Act projection",
    async (kind) => {
      setMethodTraceLevel("debug");
      const first = createProviderCallTrace(config);
      const final = createProviderCallTrace(config);
      const responses: ProviderChatResponse[] = [
        { content: "", tool_calls: [read] },
        {
          content: kind === "answer" ? "PRIVATE_RESPONSE_SENTINEL" : "",
          tool_calls: kind === "answer" ? [] : [proposal],
        },
      ];
      if (kind === "mixed")
        responses.splice(0, 2, { content: "", tool_calls: [read, proposal] });
      let index = 0;
      const executed: string[] = [];
      const loop = await runHarnessReadTurns({
        chat: async () => {
          const response = responses[index]!;
          const trace = index === responses.length - 1 ? final : first;
          index++;
          traceProviderRequest(trace, {
            wire_api: "responses",
            model: config.model,
            messages: [{ role: "user", content: "PRIVATE_PROMPT_SENTINEL" }],
            stream: false,
          });
          traceProviderResponse(trace, response);
          return response;
        },
        messages: [],
        offeredTools: [],
        readNames: ["read_page"],
        executeRead: async (call) => {
          executed.push(call.name);
          return { status: "AVAILABLE" };
        },
        serialise: JSON.stringify,
        expectedRevision: 1,
      });
      const projected = inheritProviderCallTrace(loop, {
        content: loop.content,
        tool_calls: loop.calls,
      });
      expect(providerCallId(projected)).toBe(final.provider_call_id);
      expect(executed).toEqual(["read_page"]);
      traceProviderHandling(projected, {
        outcome: "review_blocked_further_work_required",
        reviewer_kind: "primary_answer_review_fallback",
      });
      const records = methodTraceSnapshot("panel").records.filter((record) =>
        record.method.endsWith(`:${final.provider_call_id}`),
      );
      const logged = JSON.stringify(records);
      expect(logged).toContain("provider.call.requested:");
      expect(logged).toContain("provider.call.parsed_response:");
      expect(logged).toContain("review_blocked_further_work_required");
      expect(logged).toContain("primary_answer_review_fallback");
      expect(logged).not.toMatch(/PRIVATE_|private-endpoint/);
      expect(projected).toEqual({
        content: loop.content,
        tool_calls: loop.calls,
      });
    },
  );

  it("does not invent a provider ID for an unbound response", () => {
    const projected = inheritProviderCallTrace(
      {},
      { content: "", tool_calls: [] },
    );
    expect(providerCallId(projected)).toBeUndefined();
  });
});
