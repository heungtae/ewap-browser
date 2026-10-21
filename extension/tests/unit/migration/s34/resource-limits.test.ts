import { expect, it, vi } from "vitest";
import { ResponsesAnalyst } from "../../../../../packages/provider-adapters/src/responses/client.js";
import { digest } from "../../../../../packages/codebase-schema/src/digest.js";
import { config, fixture, result } from "./support.js";
const approved = async () => {};

it("S34 refuses requests exceeding conservative token reservations before fetch", async () => {
  const f = await fixture(),
    input = await f.input();
  input.datasets[0]!.rows = Array.from({ length: 6 }, () => ["a".repeat(4096)]);
  input.datasets[0]!.rowIds = Array.from({ length: 6 }, (_v, i) => `row_${i}`);
  const { inputDigest: _old, ...payload } = input;
  input.inputDigest = await digest(payload);
  const fetcher = vi.fn<typeof fetch>();
  await expect(
    new ResponsesAnalyst(config, async () => "fixture-key", fetcher).analyze(
      input,
      new AbortController().signal,
      approved,
    ),
  ).rejects.toThrow("ANALYSIS_TOKEN_RESERVATION");
  expect(fetcher).not.toHaveBeenCalled();
});
it("S34 applies the output cap to UTF-8 bytes as well as character count", async () => {
  const f = await fixture(),
    input = await f.input(),
    r = result(input);
  r.summary = "가".repeat(2800);
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      status: "completed",
      model: config.model,
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: JSON.stringify(r) }],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 3000 },
    }),
  );
  await expect(
    new ResponsesAnalyst(config, async () => "fixture-key", fetcher).analyze(
      input,
      new AbortController().signal,
      approved,
    ),
  ).rejects.toThrow("ANALYSIS_OUTPUT_LIMIT");
});
it("S34 transport rechecks its egress grant immediately before fetch", async () => {
  const f = await fixture(),
    input = await f.input(),
    fetcher = vi.fn<typeof fetch>();
  await expect(
    new ResponsesAnalyst(config, async () => "fixture-key", fetcher).analyze(
      input,
      new AbortController().signal,
      async () => {
        throw Error("ANALYSIS_DISCLOSURE_DENIED");
      },
    ),
  ).rejects.toThrow("ANALYSIS_DISCLOSURE_DENIED");
  expect(fetcher).not.toHaveBeenCalled();
});
it("S34 transport errors expose a stable code without provider or credential details", async () => {
  const f = await fixture(),
    input = await f.input();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new TypeError("private provider transport message"));
  await expect(
    new ResponsesAnalyst(config, async () => "fixture-key", fetcher).analyze(
      input,
      new AbortController().signal,
      approved,
    ),
  ).rejects.toThrow(/^ANALYSIS_TRANSPORT_FAILED$/);
});
