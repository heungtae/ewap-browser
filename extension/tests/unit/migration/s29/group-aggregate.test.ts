import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  makeDataset,
  queryDataset,
} from "../../../../../packages/codebase-repository/src/index.js";

async function fixture(
  type: "number" | "unknown" = "number",
  mixed = false,
  overflow = false,
) {
  return makeDataset({
    schema: "wca.codebase/v1",
    kind: "dataset",
    id: "dataset_aggregate",
    partitionId: "partition_one",
    pageKey: "page_one",
    graphRevision: 1,
    fields: [
      { name: "kind", type: "string", unit: null },
      { name: "amount", type, unit: "ms" },
    ],
    rows: [
      ["a", overflow ? 1e308 : 1],
      ["a", overflow ? 1e308 : 3],
      ["b", null],
      ["b", mixed ? "4" : 4],
      ["b", null],
      ["c", -2],
      [null, null],
    ],
    rowIds: [
      "row_one",
      "row_two",
      "row_three",
      "row_four",
      "row_five",
      "row_six",
      "row_seven",
    ],
    coverage: {
      status: "complete",
      examined: 7,
      emitted: 7,
      omitted: 0,
      redactions: 0,
      total: 7,
      reasons: [],
      startedAt: 0,
      endedAt: 1,
      deadline: 2,
    },
    source: "static",
    evidenceIds: ["evidence_one"],
    observedAt: 1,
    expiresAt: 100,
  });
}
const base = { op: "group", fields: ["kind"], filters: [], limit: 10 };
it("computes per-group numeric aggregates with null and unit semantics", async () => {
  const data = await fixture();
  const before = structuredClone(data);
  const golden = JSON.parse(
    readFileSync("extension/tests/fixture/s29/group-aggregate.json", "utf8"),
  ) as { cases: { op: string; values: (number | null)[] }[] };
  for (const entry of golden.cases) {
    const result = await queryDataset(data, {
      ...base,
      aggregate: { op: entry.op, field: "amount" },
    });
    expect(result).toMatchObject({
      unit: "ms",
      precision:
        entry.op === "min" || entry.op === "max"
          ? "ieee754_comparison"
          : "ieee754_compensated_sum",
      totalGroups: 4,
      matchedRows: 7,
      coverage: data.coverage,
      groups: [
        { key: "a", count: 2, value: entry.values[0], nullsExcluded: 0 },
        { key: "b", count: 3, value: entry.values[1], nullsExcluded: 2 },
        { key: "c", count: 1, value: entry.values[2], nullsExcluded: 0 },
        { key: null, count: 1, value: entry.values[3], nullsExcluded: 1 },
      ],
    });
  }
  expect(data).toEqual(before);
  const { digest: _digest, ...body } = data;
  const decimals = await makeDataset({
    ...body,
    rows: [
      ["a", 0.1],
      ["a", 0.2],
      ["b", null],
      ["b", 4],
      ["b", null],
      ["a", 0.3],
      [null, null],
    ],
  });
  expect(
    await queryDataset(decimals, {
      ...base,
      limit: 1,
      aggregate: { op: "sum", field: "amount" },
    }),
  ).toMatchObject({ groups: [{ key: "a", count: 3, value: 0.6 }] });
});
it("applies filters before aggregation and reports truncated groups", async () => {
  const data = await fixture();
  const { digest: _digest, ...body } = data;
  const sample = await makeDataset({
    ...body,
    source: "level1_sample",
    coverage: {
      ...body.coverage,
      status: "partial",
      total: null,
      reasons: ["SAMPLE_ONLY"],
    },
  });
  expect(
    await queryDataset(sample, {
      ...base,
      limit: 1,
      filters: [
        {
          field: "amount",
          range: { lower: 0, lowerInclusive: true, upperInclusive: true },
        },
      ],
      aggregate: { op: "average", field: "amount" },
    }),
  ).toMatchObject({
    groups: [{ key: "a", count: 2, value: 2, nullsExcluded: 0 }],
    totalGroups: 2,
    truncated: true,
    matchedRows: 3,
    coverage: { status: "partial", total: null },
  });
});
it("rejects invalid aggregate bindings and floating-point overflow", async () => {
  const data = await fixture();
  await expect(
    queryDataset(await fixture("unknown"), {
      ...base,
      aggregate: { op: "sum", field: "amount" },
    }),
  ).rejects.toThrow("UNKNOWN_NUMERIC_TYPE");
  await expect(
    queryDataset(await fixture("number", true), {
      ...base,
      aggregate: { op: "sum", field: "amount" },
    }),
  ).rejects.toThrow("MIXED_NUMERIC_VALUES");
  await expect(
    queryDataset(data, { ...base, aggregate: { op: "sum", field: "missing" } }),
  ).rejects.toThrow("UNKNOWN_FIELD");
  await expect(
    queryDataset(data, {
      ...base,
      op: "count",
      fields: [],
      aggregate: { op: "sum", field: "amount" },
    }),
  ).rejects.toThrow("AGGREGATE_REQUIRES_GROUP");
  await expect(
    queryDataset(await fixture("number", false, true), {
      ...base,
      aggregate: { op: "sum", field: "amount" },
    }),
  ).rejects.toThrow("NUMERIC_OVERFLOW");
  expect(
    await queryDataset(await fixture("number", false, true), {
      ...base,
      limit: 1,
      aggregate: { op: "min", field: "amount" },
    }),
  ).toMatchObject({ groups: [{ key: "a", count: 2, value: 1e308 }] });
});
