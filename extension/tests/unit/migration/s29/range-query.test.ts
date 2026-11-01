import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  makeDataset,
  queryDataset,
} from "../../../../../packages/codebase-repository/src/index.js";

async function dataset(type: "number" | "unknown" = "number", mixed = false) {
  return makeDataset({
    schema: "wca.codebase/v1",
    kind: "dataset",
    id: "dataset_range",
    partitionId: "partition_one",
    pageKey: "page_one",
    graphRevision: 1,
    fields: [
      { name: "value", type, unit: "ms" },
      { name: "group", type: "string", unit: null },
    ],
    rows: [
      [0, "a"],
      [1, "b"],
      [mixed ? "2" : 2, "a"],
      [null, "a"],
    ],
    rowIds: ["row_zero", "row_one", "row_two", "row_null"],
    coverage: {
      status: "complete",
      examined: 4,
      emitted: 4,
      omitted: 0,
      redactions: 0,
      total: 4,
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
const query = (range: unknown) => ({
  op: "project",
  fields: ["value"],
  limit: 10,
  filters: [{ field: "value", range }],
});
it("filters numeric ranges with explicit boundaries, null exclusion and dataset provenance", async () => {
  const input = await dataset();
  const golden = JSON.parse(
    readFileSync("extension/tests/fixture/s29/range-query.json", "utf8"),
  ) as {
    cases: {
      range: unknown;
      expected: { rows: number[][]; matchedRows: number; truncated: boolean };
    }[];
  };
  for (const entry of golden.cases)
    expect(await queryDataset(input, query(entry.range))).toMatchObject(
      entry.expected,
    );
  const result = await queryDataset(
    input,
    query({ lower: 0, upper: 2, lowerInclusive: false, upperInclusive: true }),
  );
  expect(result).toMatchObject({
    rows: [[1], [2]],
    matchedRows: 2,
    coverage: input.coverage,
    digest: input.digest,
    truncated: false,
  });
  expect(
    await queryDataset(
      input,
      query({ upper: 1, lowerInclusive: true, upperInclusive: false }),
    ),
  ).toMatchObject({ rows: [[0]] });
  expect(
    await queryDataset(
      input,
      query({
        lower: 1,
        upper: 1,
        lowerInclusive: false,
        upperInclusive: true,
      }),
    ),
  ).toMatchObject({ rows: [], matchedRows: 0 });
  expect(
    await queryDataset(input, {
      ...query({ lower: 1, lowerInclusive: true, upperInclusive: true }),
      op: "average",
    }),
  ).toMatchObject({ value: 1.5, unit: "ms", nullsExcluded: 0 });
  expect(
    await queryDataset(input, {
      ...query({ lower: 0, lowerInclusive: true, upperInclusive: true }),
      filters: [
        {
          field: "value",
          range: { lower: 0, lowerInclusive: true, upperInclusive: true },
        },
        { field: "group", equals: "a" },
      ],
      limit: 1,
    }),
  ).toMatchObject({ rows: [[0]], matchedRows: 2, truncated: true });
  const { digest: _digest, ...body } = input;
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
      ...query({ lower: 1, lowerInclusive: true, upperInclusive: true }),
      op: "count",
      fields: [],
    }),
  ).toMatchObject({ value: 2, coverage: { status: "partial", total: null } });
});
it("rejects missing or inverted bounds, non-finite values and undeclared numeric types", async () => {
  const input = await dataset();
  for (const range of [
    { lowerInclusive: true, upperInclusive: true },
    { lower: 3, upper: 2, lowerInclusive: true, upperInclusive: true },
    { lower: Infinity, lowerInclusive: true, upperInclusive: true },
    { lower: "1", lowerInclusive: true, upperInclusive: true },
  ])
    await expect(queryDataset(input, query(range))).rejects.toThrow();
  await expect(
    queryDataset(
      await dataset("unknown"),
      query({ lower: 1, lowerInclusive: true, upperInclusive: true }),
    ),
  ).rejects.toThrow("UNKNOWN_NUMERIC_TYPE");
  await expect(
    queryDataset(
      await dataset("number", true),
      query({ lower: 1, lowerInclusive: true, upperInclusive: true }),
    ),
  ).rejects.toThrow("MIXED_NUMERIC_VALUES");
});
