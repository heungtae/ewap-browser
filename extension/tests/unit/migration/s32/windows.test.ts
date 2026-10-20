import { expect, it } from "vitest";
import { WindowAccumulator } from "../../../../../packages/collector/src/advanced/index.js";
import { source } from "./support.js";
const window = (cursor = "one") => ({
  cursor,
  revision: "revision",
  filterDigest: "a".repeat(64),
  fields: ["value"],
  total: 2,
  eof: false,
  rows: [{ key: "key1", index: 0, cells: ["same"] }],
});
it("S32 repeated text uses stable source keys and contiguous EOF coverage", async () => {
  const a = new WindowAccumulator(source(), "dataset", ["value"], Date.now());
  await a.add(window());
  await a.add({
    ...window("two"),
    eof: true,
    rows: [{ key: "key2", index: 1, cells: ["same"] }],
  });
  const data = await a.finish();
  expect(data.rows).toEqual([["same"], ["same"]]);
  expect(new Set(data.rowIds).size).toBe(2);
  expect(data.coverage.status).toBe("complete");
});
it("S32 missing keys, duplicate windows, missing EOF and recycled values stay partial", async () => {
  for (const mode of ["missing_key", "recycled", "duplicate", "missing_eof"]) {
    const a = new WindowAccumulator(source(), "dataset", ["value"], Date.now());
    await a.add(window());
    if (mode === "recycled")
      await a.add({
        ...window("two"),
        eof: true,
        rows: [{ key: "key1", index: 0, cells: ["changed"] }],
      });
    if (mode === "missing_key")
      await a.add({
        ...window("two"),
        eof: true,
        rows: [{ key: null, index: 1, cells: ["same"] }],
      });
    if (mode === "duplicate") await a.add(window());
    expect((await a.finish()).coverage.status).toBe("partial");
  }
});
it("S32 filter/total changes reject accumulation and restoration failure prevents completeness", async () => {
  const a = new WindowAccumulator(source(), "dataset", ["value"], Date.now());
  await a.add(window());
  await expect(a.add({ ...window("two"), total: 3 })).rejects.toThrow(
    "DATA_SOURCE_CHANGED",
  );
  await expect(
    a.add({ ...window("two"), filterDigest: "b".repeat(64) }),
  ).rejects.toThrow("DATA_SOURCE_CHANGED");
  await a.add({
    ...window("two"),
    eof: true,
    rows: [{ key: "key2", index: 1, cells: ["same"] }],
  });
  expect((await a.finish("dom", false)).coverage).toMatchObject({
    status: "partial",
    reasons: ["RESTORE_FAILED"],
  });
});
it("S32 row/window caps and truncated cells never imply full coverage", async () => {
  const a = new WindowAccumulator(source(), "dataset", ["value"], Date.now());
  await expect(
    a.add({
      ...window(),
      rows: Array.from({ length: 201 }, () => window().rows[0]!),
    }),
  ).rejects.toThrow("WINDOW_LIMIT");
  await a.add({
    ...window(),
    rows: [{ key: "key1", index: 0, cells: ["x".repeat(5000)] }],
  });
  expect((await a.finish()).coverage.reasons).toContain("CELL_TRUNCATED");
});
it("S32 an accumulator never relabels old rows with a mutated source context", async () => {
  const context = source();
  const a = new WindowAccumulator(context, "dataset", ["value"], Date.now());
  await a.add(window());
  context.source.routeEpoch++;
  expect((await a.finish()).context.source.routeEpoch).toBe(1);
});
