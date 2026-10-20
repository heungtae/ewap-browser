import { expect, it } from "vitest";
import { setup } from "../../../fixture/s30/setup.js";
import { source } from "./support.js";
import {
  CollectorBudget,
  evidence,
  type AdvancedEvidence,
} from "../../../../../packages/collector/src/advanced/index.js";
import {
  installAdvancedTools,
  type AdvancedTarget,
} from "../../../../../apps/chrome-extension/src/collectors/advanced-tools.js";
async function fixture() {
  const f = await setup();
  f.context.mode = "ask";
  const budget = new CollectorBudget({
    deadline: Date.now() + 60000,
    now: Date.now,
    current: () => true,
    signal: new AbortController().signal,
  });
  const ref = { ...f.target, kind: "entity" as const };
  const target: AdvancedTarget = {
    ref,
    context: f.context,
    source: source(),
    current: () => true,
    async table() {
      const now = Date.now();
      return evidence({
        schema: "wca.collector/v1",
        id: "data",
        context: source(),
        kind: "table",
        provenance: "registered",
        fields: ["value"],
        rows: [["same"]],
        rowIds: ["row_one"],
        coverage: {
          status: "complete",
          reasons: [],
          total: 1,
          windows: 1,
          restored: null,
        },
        observedAt: now,
        expiresAt: now + 10000,
        executable: false,
      });
    },
  };
  return { ...f, budget, ref, target };
}
it("S32 tools are absent without actual ports and Ask sees only installed readers", async () => {
  const f = await fixture();
  expect(installAdvancedTools(f.registry, [], f.budget)).toEqual([]);
  expect(f.registry.get("web.get_table_data")).toBeUndefined();
  expect(installAdvancedTools(f.registry, [f.target], f.budget)).toEqual([
    "web.get_table_data",
  ]);
  expect(
    (
      await f.registry.snapshot(
        f.context,
        new Set(["web.get_table_data", "web.fill"]),
      )
    ).tools.map((t) => t.tool),
  ).toEqual(["web.get_table_data"]);
});
it("S32 same-call verification rejects changed input, forged evidence and stale bindings", async () => {
  const f = await fixture();
  installAdvancedTools(f.registry, [f.target], f.budget);
  const handler = f.registry.get("web.get_table_data")!;
  const input = { target: f.ref, coverage: "complete", cursor: null };
  const result = await handler.execute(input, f.context);
  expect(await handler.verify(input, f.context, result)).toBe(true);
  expect(
    await handler.verify({ ...input, cursor: "other" }, f.context, result),
  ).toBe(false);
  expect(
    await handler.verify(input, f.context, {
      ...result,
      data: { ...(result.data as AdvancedEvidence), rows: [["forged"]] },
    }),
  ).toBe(false);
  f.context.routeEpoch++;
  await expect(handler.execute(input, f.context)).rejects.toThrow(
    "COLLECTOR_TARGET_STALE",
  );
});
it("S32 output cap yields honest partial evidence and charges full collected bytes", async () => {
  const f = await fixture();
  const original = f.target.table!;
  f.target.table = async (...args) => {
    const { digest: _digest, ...body } = await original(...args);
    return evidence({
      ...body,
      rows: Array.from({ length: 100 }, () => ["x".repeat(4000)]),
      rowIds: Array.from({ length: 100 }, (_, i) => `row_${i}`),
      coverage: { ...body.coverage, total: 100 },
    });
  };
  installAdvancedTools(f.registry, [f.target], f.budget);
  const result = await f.registry
    .get("web.get_table_data")!
    .execute({ target: f.ref, coverage: "complete", cursor: null }, f.context);
  const data = result.data as AdvancedEvidence;
  expect(data.coverage).toMatchObject({
    status: "partial",
    total: 100,
    reasons: ["BYTE_LIMIT"],
  });
  expect(data.rows.length).toBeLessThan(100);
  expect(f.budget.snapshot().bytes).toBeGreaterThan(400000);
});
