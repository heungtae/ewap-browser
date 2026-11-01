import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  makeDataset,
  queryDataset,
} from "../../../../../packages/codebase-repository/src/index.js";

async function fixture(type: "number" | "unknown" = "number", mixed = false) {
  return makeDataset({
    schema: "wca.codebase/v1",
    kind: "dataset",
    id: "dataset_sort",
    partitionId: "partition_one",
    pageKey: "page_one",
    graphRevision: 1,
    fields: [
      { name: "score", type, unit: "ms" },
      { name: "name", type: "string", unit: null },
      { name: "enabled", type: "boolean", unit: null },
      { name: "label", type: "string", unit: null },
    ],
    rows: [
      [2, "b", true, "first"],
      [null, "x", false, "second"],
      [1, "a", true, "third"],
      [2, "a", false, "fourth"],
      [mixed ? "2" : 2, "a", true, "fifth"],
    ],
    rowIds: ["row_first", "row_second", "row_third", "row_fourth", "row_fifth"],
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
const base = { op: "project", fields: ["label"], filters: [], limit: 10 };
it("sorts typed values with explicit null placement and stable ties", async () => {
  const data = await fixture();
  const before = structuredClone(data);
  const golden = JSON.parse(
    readFileSync("extension/tests/fixture/s29/sort-query.json", "utf8"),
  ) as { cases: { sort: unknown; expected: string[][] }[] };
  for (const entry of golden.cases)
    expect(
      await queryDataset(data, { ...base, sort: entry.sort }),
    ).toMatchObject({
      rows: entry.expected,
      matchedRows: 5,
      coverage: data.coverage,
    });
  expect(
    await queryDataset(data, {
      ...base,
      limit: 2,
      sort: [{ field: "score", direction: "asc", nulls: "last" }],
    }),
  ).toMatchObject({
    rows: [["third"], ["first"]],
    matchedRows: 5,
    truncated: true,
  });
  expect(data).toEqual(before);
  expect(
    await queryDataset(data, {
      ...base,
      filters: [
        {
          field: "score",
          range: { lower: 2, lowerInclusive: true, upperInclusive: true },
        },
      ],
      sort: [{ field: "name", direction: "asc", nulls: "last" }],
    }),
  ).toMatchObject({ rows: [["fourth"], ["fifth"], ["first"]], matchedRows: 3 });
  const { digest: _digest, ...body } = data;
  const names = ["é", "한", "Z", "a", "A"];
  const unicode = await makeDataset({
    ...body,
    rows: body.rows.map((row, index) => [
      row[0]!,
      names[index]!,
      row[2]!,
      row[3]!,
    ]),
  });
  expect(
    await queryDataset(unicode, {
      ...base,
      fields: ["name"],
      sort: [{ field: "name", direction: "asc", nulls: "last" }],
    }),
  ).toMatchObject({ rows: [["A"], ["Z"], ["a"], ["é"], ["한"]] });
});
it("rejects duplicate, unknown and mixed sort keys and sort on aggregates", async () => {
  const data = await fixture();
  const order = { field: "score", direction: "asc", nulls: "last" };
  await expect(
    queryDataset(data, { ...base, sort: [order, order] }),
  ).rejects.toThrow("DUPLICATE_SORT_FIELD");
  await expect(
    queryDataset(data, { ...base, sort: [{ ...order, field: "missing" }] }),
  ).rejects.toThrow("UNKNOWN_FIELD");
  await expect(
    queryDataset(await fixture("unknown"), { ...base, sort: [order] }),
  ).rejects.toThrow("SORT_TYPE_UNAVAILABLE");
  await expect(
    queryDataset(await fixture("number", true), { ...base, sort: [order] }),
  ).rejects.toThrow("SORT_TYPE_MISMATCH");
  await expect(
    queryDataset(data, { ...base, op: "count", fields: [], sort: [order] }),
  ).rejects.toThrow("SORT_REQUIRES_PROJECT");
});
