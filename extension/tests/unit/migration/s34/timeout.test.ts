import { expect, it, vi } from "vitest";
import {
  AnalysisEngine,
  MemoryAnalysisBudget,
} from "../../../../../packages/analysis-engine/src/index.js";
import {
  boundedBody,
  completedResponse,
} from "../../../../../packages/provider-adapters/src/responses/body.js";
import { fixture } from "./support.js";
it("S34 deadline timeout bounds a resolver that ignores cancellation", async () => {
  const f = await fixture();
  const read = vi.fn().mockImplementation(() => new Promise(() => {}));
  const analyze = vi.fn();
  const engine = new AnalysisEngine({
    data: { ...f.port, read },
    analyst: { analyze },
    budget: new MemoryAnalysisBudget(f.request.taskId),
    current: () => true,
    now: f.now,
  });
  const running = engine.run({ ...f.request, deadline: f.now() + 20 });
  expect(await running).toMatchObject({
    status: "UNAVAILABLE",
    code: "ANALYSIS_TIMEOUT",
  });
  expect(analyze).not.toHaveBeenCalled();
});
it("S34 pending response reads terminate on cancellation", async () => {
  const abort = new AbortController();
  const stream = new ReadableStream<Uint8Array>({ start() {} });
  const reading = boundedBody(new Response(stream), abort.signal);
  abort.abort();
  await expect(reading).rejects.toThrow("ANALYSIS_CANCELLED");
});
it("S34 rejects out-of-order SSE and tool delta events before any result is published", () => {
  const block = (sequence_number: number, type = "response.created") =>
    `data: ${JSON.stringify({ type, sequence_number })}\n\n`;
  expect(() => completedResponse(block(1) + block(0), true)).toThrow(
    "ANALYSIS_STREAM_INVALID",
  );
  expect(() =>
    completedResponse(block(0, "response.function_call_arguments.delta"), true),
  ).toThrow("ANALYSIS_STREAM_INVALID");
});
it("S34 token reservations are bounded across failed calls and reported usage is reconciled", async () => {
  const budget = new MemoryAnalysisBudget("task");
  const first = await budget.reserve("task", 100);
  expect(first).toMatchObject({ inputReserved: 24000, outputReserved: 4000 });
  await expect(
    budget.settle("task", { inputTokens: 24001, outputTokens: 1 }),
  ).rejects.toThrow("ANALYSIS_USAGE_LIMIT");
  expect(
    await budget.settle("task", { inputTokens: 100, outputTokens: 200 }),
  ).toMatchObject({ inputUsed: 100, outputUsed: 200, settled: 1 });
  const second = await budget.reserve("task", 100);
  expect(second).toMatchObject({ inputReserved: 48000, outputReserved: 8000 });
  await expect(budget.reserve("task", 1)).rejects.toThrow(
    "ANALYSIS_BUDGET_EXHAUSTED",
  );
});
