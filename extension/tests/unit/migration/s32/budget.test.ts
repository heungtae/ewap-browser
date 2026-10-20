import { expect, it, vi } from "vitest";
import {
  CollectorBudget,
  transientVisual,
} from "../../../../../packages/collector/src/advanced/index.js";
function budget() {
  return new CollectorBudget({
    deadline: Date.now() + 60000,
    now: Date.now,
    current: () => true,
    signal: new AbortController().signal,
  });
}
it("S32 collection unit timeout closes late reads and consumes its unit", async () => {
  vi.useFakeTimers();
  try {
    const b = budget();
    const result = b.run("page", "target", () => new Promise(() => {}));
    const failure = expect(result).rejects.toThrow("UNIT_TIMEOUT");
    await vi.advanceTimersByTimeAsync(10000);
    await failure;
    expect(b.snapshot()).toMatchObject({ units: 1, active: 0 });
  } finally {
    vi.useRealTimers();
  }
});
it("S32 collector unit and distinct-target caps are shared across reads", async () => {
  const b = budget();
  for (let i = 0; i < 64; i++) await b.run("page", "target", async () => i);
  await expect(b.run("page", "target", async () => 0)).rejects.toThrow(
    "COLLECTOR_BUDGET",
  );
  const c = budget();
  for (let i = 0; i < 16; i++) await c.run("page", String(i), async () => i);
  await expect(c.run("page", "excess", async () => 0)).rejects.toThrow(
    "COLLECTOR_BUDGET",
  );
});
it("S32 denied/unmaskable visuals never reach interpretation and buffers are disposed", async () => {
  const data = new Uint8Array([1, 2, 3]);
  let disposed = false,
    interpreted = false;
  await expect(
    transientVisual(
      {
        consent() {},
        async capture() {
          return {
            data,
            dispose() {
              disposed = true;
            },
          };
        },
        async mask() {
          return null;
        },
        async interpret() {
          interpreted = true;
          return "x";
        },
      },
      new AbortController().signal,
      budget(),
    ),
  ).rejects.toThrow("SCREENSHOT_UNMASKABLE");
  expect(disposed).toBe(true);
  expect(interpreted).toBe(false);
  expect([...data]).toEqual([0, 0, 0]);
});
it("S32 visual results remain inferred and the two-capture budget cannot reset per read", async () => {
  const b = budget();
  const ports = {
    consent() {},
    async capture() {
      return { data: new Uint8Array([1]), dispose() {} };
    },
    async mask() {
      return new Uint8Array([0]);
    },
    async interpret() {
      return "trend";
    },
  };
  expect(
    await transientVisual(ports, new AbortController().signal, b),
  ).toMatchObject({
    provenance: "visual_inferred",
    executable: false,
    coverage: "partial",
  });
  await transientVisual(ports, new AbortController().signal, b);
  await expect(
    transientVisual(ports, new AbortController().signal, b),
  ).rejects.toThrow("SCREENSHOT_COUNT_LIMIT");
});
it("S32 a blocked event loop cannot accept a late result before its timeout callback runs", async () => {
  let now = 0;
  const b = new CollectorBudget({
    deadline: 60000,
    now: () => now,
    current: () => true,
    signal: new AbortController().signal,
  });
  await expect(
    b.run("page", "target", async () => {
      now = 10001;
      return "late";
    }),
  ).rejects.toThrow("UNIT_TIMEOUT");
  expect(b.snapshot()).toMatchObject({ units: 1, active: 0 });
});
