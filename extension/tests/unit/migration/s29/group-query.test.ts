import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  makeDataset,
  queryDataset,
} from "../../../../../packages/codebase-repository/src/index.js";

async function fixture(type: "string" | "unknown" = "string", mixed = false) {
  return makeDataset({
    schema: "wca.codebase/v1",
    kind: "dataset",
    id: "dataset_group",
    partitionId: "partition_one",
    pageKey: "page_one",
    graphRevision: 1,
    fields: [
      { name: "kind", type, unit: null },
      { name: "active", type: "boolean", unit: null },
      { name: "score", type: "number", unit: "ms" },
    ],
    rows: [
      ["a", true, 0],
      ["b", false, 2],
      [null, true, null],
      [mixed ? 1 : "a", null, -0],
      ["b", true, 2],
    ],
    rowIds: ["row_one", "row_two", "row_three", "row_four", "row_five"],
    coverage: {
      status: "complete",
      examined: 5,
      emitted: 5,
      omitted: 0,
      redactions: 0,
      total: 5,
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
const query = { op: "group", fields: ["kind"], filters: [], limit: 10 };
it("groups typed values and nulls in first-seen order with stable provenance", async () => {
  const data = await fixture();
  const before = structuredClone(data);
  const golden = JSON.parse(
    readFileSync("extension/tests/fixture/s29/group-query.json", "utf8"),
  ) as { cases: { field: string; expected: object[] }[] };
  for (const entry of golden.cases)
    expect(
      await queryDataset(data, { ...query, fields: [entry.field] }),
    ).toMatchObject({
      groups: entry.expected,
      totalGroups: 3,
      matchedRows: 5,
      coverage: data.coverage,
      digest: data.digest,
      truncated: false,
    });
  expect(data).toEqual(before);
});
it("applies filters before grouping, limits groups and retains partial coverage", async () => {
  const original = await fixture();
  const { digest: _digest, ...body } = original;
  const data = await makeDataset({
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
    await queryDataset(data, {
      ...query,
      filters: [
        {
          field: "score",
          range: { lower: 0, lowerInclusive: true, upperInclusive: true },
        },
      ],
      limit: 1,
    }),
  ).toMatchObject({
    groups: [{ key: "a", count: 2 }],
    totalGroups: 2,
    matchedRows: 4,
    truncated: true,
    coverage: { status: "partial", total: null },
  });
});
it("rejects unsupported field shape, unknown types, mixed values and group sorting", async () => {
  const data = await fixture();
  await expect(queryDataset(data, { ...query, fields: [] })).rejects.toThrow(
    "ONE_GROUP_FIELD_REQUIRED",
  );
  await expect(
    queryDataset(data, { ...query, fields: ["missing"] }),
  ).rejects.toThrow("UNKNOWN_FIELD");
  await expect(queryDataset(await fixture("unknown"), query)).rejects.toThrow(
    "GROUP_TYPE_UNAVAILABLE",
  );
  await expect(
    queryDataset(await fixture("string", true), query),
  ).rejects.toThrow("GROUP_TYPE_MISMATCH");
  await expect(
    queryDataset(data, {
      ...query,
      sort: [{ field: "kind", direction: "asc", nulls: "last" }],
    }),
  ).rejects.toThrow("SORT_REQUIRES_PROJECT");
});
