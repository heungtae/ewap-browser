import { expect, it, vi } from "vitest";
import {
  AnalysisEngine,
  MemoryAnalysisBudget,
  type AnalystPort,
} from "../../../../../packages/analysis-engine/src/index.js";
import { fixture, result, reply } from "./support.js";
it("S34 explicit analyst delegation shares two-call budget and preserves first failure", async () => {
  const f = await fixture();
  const analyze = vi
    .fn<AnalystPort["analyze"]>()
    .mockRejectedValueOnce(new Error("ANALYSIS_HTTP_429"))
    .mockImplementation(async (input) => reply(input));
  const engine = new AnalysisEngine({
    data: f.port,
    analyst: { analyze },
    budget: new MemoryAnalysisBudget(f.request.taskId),
    current: () => true,
    now: f.now,
  });
  expect(await engine.run(f.request)).toMatchObject({
    status: "UNAVAILABLE",
    firstFailure: "ANALYSIS_HTTP_429",
  });
  expect(
    await engine.run({ ...f.request, attemptId: "attempt_two" }),
  ).toMatchObject({
    status: "SUPPORTED",
    counters: { calls: 2, firstFailure: "ANALYSIS_HTTP_429" },
  });
  expect(
    await engine.run({ ...f.request, attemptId: "attempt_three" }),
  ).toMatchObject({
    status: "UNAVAILABLE",
    code: "ANALYSIS_BUDGET_EXHAUSTED",
    firstFailure: "ANALYSIS_HTTP_429",
  });
  expect(analyze).toHaveBeenCalledTimes(2);
});
it("S34 a cancelled or stale task has zero analyst calls", async () => {
  const f = await fixture(),
    analyze = vi.fn<AnalystPort["analyze"]>();
  const abort = new AbortController();
  abort.abort();
  const engine = new AnalysisEngine({
    data: f.port,
    analyst: { analyze },
    budget: new MemoryAnalysisBudget(f.request.taskId),
    current: () => false,
    now: f.now,
  });
  expect(await engine.run(f.request)).toMatchObject({
    status: "UNAVAILABLE",
    code: "ANALYSIS_STALE",
  });
  expect(await engine.run(f.request, abort.signal)).toMatchObject({
    status: "UNAVAILABLE",
    code: "ANALYSIS_CANCELLED",
  });
  expect(analyze).not.toHaveBeenCalled();
});
it("S34 revoked consent or expired data during generation cannot be published", async () => {
  for (const revoked of [true, false]) {
    const f = await fixture();
    let allowed = true;
    f.port.authorized = async () => allowed;
    const engine = new AnalysisEngine({
      data: f.port,
      analyst: {
        analyze: async (input) => {
          if (revoked) allowed = false;
          else f.tick(100);
          return reply(input);
        },
      },
      budget: new MemoryAnalysisBudget(f.request.taskId),
      current: () => true,
      now: f.now,
    });
    expect(await engine.run(f.request)).toMatchObject({
      status: "UNAVAILABLE",
      code: revoked ? "ANALYSIS_DISCLOSURE_DENIED" : "ANALYSIS_DATASET_BINDING",
    });
  }
});
it("S34 cancellation interrupts a provider which ignores abort and late results cannot publish", async () => {
  const f = await fixture();
  const abort = new AbortController();
  const engine = new AnalysisEngine({
    data: f.port,
    analyst: { analyze: () => new Promise(() => {}) },
    budget: new MemoryAnalysisBudget(f.request.taskId),
    current: () => true,
    now: f.now,
  });
  const running = engine.run(f.request, abort.signal);
  setTimeout(() => abort.abort(), 20);
  expect(await running).toMatchObject({
    status: "UNAVAILABLE",
    code: "ANALYSIS_CANCELLED",
  });
});
it("S34 no analyst evaluation occurs merely by constructing task services", async () => {
  const f = await fixture(),
    analyze = vi.fn<AnalystPort["analyze"]>();
  new AnalysisEngine({
    data: f.port,
    analyst: { analyze },
    budget: new MemoryAnalysisBudget(f.request.taskId),
    current: () => true,
    now: f.now,
  });
  expect(analyze).not.toHaveBeenCalled();
});
it("S34 analyst ports cannot rewrite the engine's trusted evidence snapshot", async () => {
  const f = await fixture();
  const engine = new AnalysisEngine({
    data: f.port,
    analyst: {
      analyze: async (input) => {
        input.datasets[0]!.aggregates.find((fact) => fact.op === "sum")!.value =
          999;
        const r = result(input);
        r.findings[0]!.value = 999;
        return { result: r, usage: { inputTokens: 100, outputTokens: 200 } };
      },
    },
    budget: new MemoryAnalysisBudget(f.request.taskId),
    current: () => true,
    now: f.now,
  });
  expect(await engine.run(f.request)).toMatchObject({
    status: "UNAVAILABLE",
    code: "ANALYSIS_CONTRADICTORY_TOTAL",
  });
});
