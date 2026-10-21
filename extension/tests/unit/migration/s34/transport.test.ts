import { expect, it, vi } from "vitest";
import { ResponsesAnalyst } from "../../../../../packages/provider-adapters/src/responses/client.js";
import { digest } from "../../../../../packages/codebase-schema/src/digest.js";
import { config, fixture, result } from "./support.js";
function response(content: unknown, overrides = {}) {
  return {
    status: "completed",
    model: config.model,
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: JSON.stringify(content) }],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 200 },
    ...overrides,
  };
}
const approved = async () => {};

it("S34 uses pinned Responses structured output with no browser/tool or storage authority", async () => {
  const f = await fixture(),
    input = await f.input();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(response(result(input))));
  const analyst = new ResponsesAnalyst(
    config,
    async () => "fixture-key",
    fetcher,
  );
  expect(
    await analyst.analyze(input, new AbortController().signal, approved),
  ).toMatchObject({
    result: result(input),
    usage: { inputTokens: 100, outputTokens: 200 },
  });
  const init = fetcher.mock.calls[0]![1]!;
  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  expect(body).toMatchObject({
    model: config.model,
    store: false,
    text: { format: { type: "json_schema", strict: true } },
  });
  expect(body).not.toHaveProperty("tools");
  expect(body).not.toHaveProperty("previous_response_id");
  expect(init.redirect).toBe("error");
});
it.each([
  "status",
  "model",
  "tool",
  "usage",
  "http",
  "schema",
  "oversize",
  "refusal",
])("S34 rejects %s provider responses", async (kind) => {
  const f = await fixture(),
    input = await f.input();
  const body = response(result(input), {
    ...(kind === "status" ? { status: "incomplete" } : {}),
    ...(kind === "model" ? { model: "different-model" } : {}),
    ...(kind === "tool"
      ? {
          output: [
            { type: "function_call", name: "web__click", arguments: "{}" },
          ],
        }
      : {}),
    ...(kind === "usage"
      ? { usage: { input_tokens: 100, output_tokens: 100000 } }
      : {}),
    ...(kind === "refusal"
      ? {
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "refusal", refusal: "no" }],
            },
          ],
        }
      : {}),
  });
  const res =
    kind === "http"
      ? new Response("private-server-error", { status: 429 })
      : kind === "schema"
        ? Response.json({})
        : kind === "oversize"
          ? new Response("a".repeat(262145), {
              headers: { "content-type": "application/json" },
            })
          : Response.json(body);
  const analyst = new ResponsesAnalyst(
    config,
    async () => "fixture-key",
    vi.fn<typeof fetch>().mockResolvedValue(res),
  );
  await expect(
    analyst.analyze(input, new AbortController().signal, approved),
  ).rejects.toThrow();
});
it("S34 accepts one completed bounded SSE response and rejects truncation or mixed streams", async () => {
  const f = await fixture(),
    input = await f.input();
  const streamConfig = { ...config, stream: true };
  input.configDigest = await digest(streamConfig);
  const { inputDigest: _old, ...payload } = input;
  input.inputDigest = await digest(payload);
  const r = result(input),
    text = JSON.stringify(r);
  const blocks = [
    { type: "response.output_text.delta", sequence_number: 0, delta: text },
    { type: "response.completed", sequence_number: 1, response: response(r) },
  ]
    .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join("");
  for (const [body, valid] of [
    [blocks, true],
    [blocks.slice(0, -3), false],
    [blocks + blocks, false],
  ] as const) {
    const analyst = new ResponsesAnalyst(
      streamConfig,
      async () => "fixture-key",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(body, {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );
    if (valid)
      expect(
        await analyst.analyze(input, new AbortController().signal, approved),
      ).toMatchObject({ result: r });
    else
      await expect(
        analyst.analyze(input, new AbortController().signal, approved),
      ).rejects.toThrow();
  }
});
it("S34 disabled, changed config and cancelled requests never call fetch", async () => {
  const f = await fixture(),
    input = await f.input(),
    fetcher = vi.fn<typeof fetch>();
  const abort = new AbortController();
  abort.abort();
  await expect(
    new ResponsesAnalyst(config, async () => "fixture-key", fetcher).analyze(
      input,
      abort.signal,
      approved,
    ),
  ).rejects.toThrow("ANALYSIS_CANCELLED");
  await expect(
    new ResponsesAnalyst(
      { ...config, enabled: false },
      async () => "fixture-key",
      fetcher,
    ).analyze(input, new AbortController().signal, approved),
  ).rejects.toThrow("ANALYSIS_DISABLED");
  await expect(
    new ResponsesAnalyst(
      { ...config, revision: 2 },
      async () => "fixture-key",
      fetcher,
    ).analyze(input, new AbortController().signal, approved),
  ).rejects.toThrow("ANALYSIS_CONFIG_CHANGED");
  expect(fetcher).not.toHaveBeenCalled();
});
