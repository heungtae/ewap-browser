import { describe, expect, it, vi } from "vitest";
import {
  DecisionBudget,
  DecisionController,
  createFrame,
  type ControllerPort,
} from "../../../../../packages/task-engine/src/decisions/index.js";
import { NativeJevController } from "../../../../../packages/provider-adapters/src/jev/index.js";
import { frame, context, response } from "./support.js";
describe("S27-R04 controller role/budget isolation", () => {
  it("missing and disabled controllers have no network/GPT fallback", async () => {
    const budget = new DecisionBudget(),
      absent = new DecisionController(undefined, budget, () => context);
    expect((await absent.evaluate(frame(budget))).outcome).toBe(
      "CONTROLLER_UNAVAILABLE",
    );
    expect(budget.snapshot().calls).toBe(0);
    const fetcher = vi.fn<typeof fetch>();
    const port = new NativeJevController(
      {
        endpoint: "https://jev.fixture.test/v1/systemone",
        model: "jev-1.13.0",
        modelRevision: 1,
        enabled: false,
        apiKey: "",
      },
      fetcher,
    );
    const disabled = new DecisionController(port, budget, () => context);
    expect((await disabled.evaluate(frame(budget))).firstFailure).toBe(
      "CONTROLLER_DISABLED",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("429/retry share counters and retain first failure", async () => {
    const budget = new DecisionBudget(),
      evaluate = vi
        .fn<ControllerPort["evaluate"]>()
        .mockRejectedValueOnce(new Error("CONTROLLER_HTTP_429"))
        .mockImplementation(async (f) => response(f));
    const controller = new DecisionController(
      { evaluate },
      budget,
      () => context,
    );
    const first = await controller.evaluate(frame(budget));
    expect(first.firstFailure).toBe("CONTROLLER_HTTP_429");
    expect(first.counters.calls).toBe(1);
    expect(first.counters.outputTokens).toBe(1024);
    const retry = await controller.evaluate(frame(budget));
    expect(retry.outcome).toBe("SELECTED");
    expect(retry.firstFailure).toBe(first.firstFailure);
    expect(retry.counters.calls).toBe(2);
    expect((await controller.evaluate(frame(budget))).reason).toBe(
      "NO_PROGRESS",
    );
    expect(evaluate).toHaveBeenCalledTimes(2);
  });
  it("timeouts ignore late results and keep the consumed reservation", async () => {
    const budget = new DecisionBudget({ callMs: 5 });
    const controller = new DecisionController(
      { evaluate: () => new Promise(() => {}) },
      budget,
      () => context,
    );
    const result = await controller.evaluate(frame(budget));
    expect(result.reason).toBe("CONTROLLER_TIMEOUT");
    expect(result.counters.calls).toBe(1);
    expect(result.counters.inputTokens).toBeGreaterThan(0);
  });
  it("checks budget reservation before transport and forbids budget growth", async () => {
    const budget = new DecisionBudget({ inputTokens: 1 }),
      evaluate = vi.fn<ControllerPort["evaluate"]>();
    const controller = new DecisionController(
      { evaluate },
      budget,
      () => context,
    );
    expect((await controller.evaluate(frame(budget))).reason).toBe(
      "CONTROLLER_BUDGET_EXHAUSTED",
    );
    expect(evaluate).not.toHaveBeenCalled();
    expect(() => new DecisionBudget({ calls: 25 })).toThrow();
    const b = new DecisionBudget(),
      r = b.reserve(100);
    expect(() => r.settle({ input_tokens: 101, output_tokens: 1 })).toThrow();
  });
  it("overall deadline includes downtime and active use never resets across retry", () => {
    let now = 100;
    const budget = new DecisionBudget({ overallMs: 10 }, () => now);
    now += 11;
    expect(() => budget.reserve(1)).toThrow();
  });
  it("rejects cancellation, foreign task budget reuse and late revisions", async () => {
    let current = context;
    const budget = new DecisionBudget(),
      controller = new DecisionController(
        {
          evaluate: async (f) => {
            current = { ...context, planRevision: 2 };
            return response(f);
          },
        },
        budget,
        () => current,
      );
    expect((await controller.evaluate(frame(budget))).outcome).toBe("UNKNOWN");
    const cancelled = new AbortController();
    cancelled.abort();
    expect(
      (await controller.evaluate(frame(budget), cancelled.signal)).reason,
    ).toBe("STALE_OR_CANCELLED_FRAME");
    const { digest: _digest, ...payload } = frame(budget);
    const foreign = createFrame({
      ...payload,
      budgets: { ...payload.budgets, calls: 0 },
    });
    expect(
      (
        await new DecisionController(
          { evaluate: async (f) => response(f) },
          budget,
          () => context,
        ).evaluate(foreign)
      ).reason,
    ).toBe("BUDGET_SNAPSHOT_MISMATCH");
  });
});
