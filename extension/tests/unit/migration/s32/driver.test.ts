import { expect, it } from "vitest";
import {
  collectWindows,
  WindowAccumulator,
  CollectorBudget,
  type WindowDriver,
} from "../../../../../packages/collector/src/advanced/index.js";
import type { Receipt } from "../../../../../packages/tool-registry/src/index.js";
import { source } from "./support.js";
function fixture() {
  const budget = new CollectorBudget({
    deadline: Date.now() + 60000,
    now: Date.now,
    current: () => true,
    signal: new AbortController().signal,
  });
  const accumulator = new WindowAccumulator(
    source(),
    "dataset",
    ["value"],
    Date.now(),
  );
  let next = 0,
    restores = 0,
    index = 0;
  const receipt: Receipt = {
    schema: "wca.tool/v1",
    kind: "receipt",
    toolCallId: "call",
    tool: "web.scroll",
    stepId: "step",
    preparedDigest: "a".repeat(64),
    dispatchId: "dispatch_call",
    dispatch: "dispatched",
    commands: 1,
    verification: "passed",
    evidenceDigest: "a".repeat(64),
    error: null,
    noOp: false,
    goalVerified: false,
  };
  const driver: WindowDriver = {
    page: "page",
    target: "target",
    mode: "act",
    current: () => true,
    async read() {
      return {
        cursor: String(index),
        revision: "one",
        filterDigest: "a".repeat(64),
        fields: ["value"],
        total: 2,
        eof: index === 1,
        rows: [{ key: String(index), index, cells: ["same"] }],
      };
    },
    movement: {
      authorized: () => true,
      async next() {
        next++;
        index++;
        return receipt;
      },
      async restore() {
        restores++;
        return receipt;
      },
    },
  };
  return {
    budget,
    accumulator,
    driver,
    counts: () => ({ next, restores }),
    receipt,
  };
}
it("S32 Ask never invokes movement and reports partial viewport coverage", async () => {
  const f = fixture();
  f.driver.mode = "ask";
  const data = await collectWindows(f.driver, f.accumulator, f.budget);
  expect(data.coverage).toMatchObject({
    status: "partial",
    reasons: expect.arrayContaining(["ACT_REQUIRED"]),
  });
  expect(f.counts()).toEqual({ next: 0, restores: 0 });
});
it("S32 controlled authorized movement verifies each receipt and restores exactly once", async () => {
  const f = fixture();
  const data = await collectWindows(f.driver, f.accumulator, f.budget);
  expect(data.coverage).toMatchObject({ status: "complete", restored: true });
  expect(f.counts()).toEqual({ next: 1, restores: 1 });
});
it("S32 unknown movement never retries and failed restoration cannot report complete", async () => {
  const f = fixture();
  f.driver.movement!.next = async () => ({
    ...f.receipt,
    dispatch: "unknown",
    verification: "unknown",
  });
  const uncertain = await collectWindows(f.driver, f.accumulator, f.budget);
  expect(uncertain.coverage.reasons).toContain("MOVEMENT_UNKNOWN");
  expect(f.counts().restores).toBe(0);
  const g = fixture();
  g.driver.movement!.restore = async () => {
    throw new Error("RESTORE_FAILED");
  };
  const failed = await collectWindows(g.driver, g.accumulator, g.budget);
  expect(failed.coverage).toMatchObject({
    status: "partial",
    restored: false,
    reasons: expect.arrayContaining(["RESTORE_FAILED"]),
  });
});
