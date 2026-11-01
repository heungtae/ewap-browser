import type { Context } from "../../../../packages/codebase-schema/src/index.js";
import {
  makeDataset,
  queryDataset,
  readDataset,
  writeDataset,
} from "../../../../packages/codebase-repository/src/index.js";

export async function runRange(db: IDBDatabase, context: Context) {
  const dataset = await makeDataset({
    schema: "wca.codebase/v1",
    kind: "dataset",
    id: "dataset_range_chrome",
    partitionId: context.partitionId,
    pageKey: context.pageKey,
    graphRevision: 4,
    fields: [{ name: "value", type: "number", unit: "ms" }],
    rows: [[0], [1], [2], [null]],
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
    evidenceIds: [],
    observedAt: 1000,
    expiresAt: 2000,
  });
  await writeDataset(db, dataset, 1000);
  const restored = await readDataset(
    db,
    dataset.partitionId,
    dataset.pageKey,
    dataset.id,
    1001,
  );
  const result = await queryDataset(restored, {
    op: "project",
    fields: ["value"],
    filters: [
      {
        field: "value",
        range: {
          lower: 0,
          upper: 2,
          lowerInclusive: false,
          upperInclusive: true,
        },
      },
    ],
    limit: 1,
  });
  if (
    !("rows" in result) ||
    JSON.stringify(result.rows) !== "[[1]]" ||
    result.matchedRows !== 2 ||
    result.truncated !== true ||
    result.digest !== dataset.digest
  )
    throw new Error("RANGE_QUERY_FAILED");
  const sorted = await queryDataset(restored, {
    op: "project",
    fields: ["value"],
    filters: [],
    sort: [{ field: "value", direction: "desc", nulls: "last" }],
    limit: 4,
  });
  if (
    !("rows" in sorted) ||
    JSON.stringify(sorted.rows) !== "[[2],[1],[0],[null]]"
  )
    throw new Error("SORT_QUERY_FAILED");
  const grouped = await queryDataset(restored, {
    op: "group",
    fields: ["value"],
    filters: [],
    limit: 2,
  });
  if (
    !("groups" in grouped) ||
    JSON.stringify(grouped.groups) !==
      '[{"key":0,"count":1},{"key":1,"count":1}]' ||
    grouped.totalGroups !== 4 ||
    !grouped.truncated
  )
    throw new Error("GROUP_QUERY_FAILED");
  return {
    realIndexedDb: true,
    matchedRows: result.matchedRows,
    truncated: result.truncated,
    sortVerified: true,
    groupVerified: true,
  };
}
