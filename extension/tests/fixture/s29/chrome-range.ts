import type { Context } from "../../../../packages/codebase-schema/src/index.js";
import {
  CodebaseReadService,
  CodebaseRepository,
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
  const { digest: _digest, ...body } = dataset;
  const aggregateDataset = await makeDataset({
    ...body,
    id: "dataset_aggregate_chrome",
    fields: [
      { name: "kind", type: "string", unit: null },
      { name: "amount", type: "number", unit: "ms" },
    ],
    rows: [
      ["a", 1],
      ["a", 3],
      ["b", null],
      ["b", 4],
    ],
  });
  await writeDataset(db, aggregateDataset, 1000);
  const aggregateRestored = await readDataset(
    db,
    aggregateDataset.partitionId,
    aggregateDataset.pageKey,
    aggregateDataset.id,
    1001,
  );
  const aggregate = await queryDataset(aggregateRestored, {
    op: "group",
    fields: ["kind"],
    filters: [],
    aggregate: { op: "sum", field: "amount" },
    limit: 4,
  });
  if (
    !("groups" in aggregate) ||
    !("unit" in aggregate) ||
    JSON.stringify(aggregate.groups) !==
      '[{"key":"a","count":2,"value":4,"nullsExcluded":0},{"key":"b","count":2,"value":4,"nullsExcluded":1}]' ||
    aggregate.unit !== "ms"
  )
    throw new Error("GROUP_AGGREGATE_FAILED");
  const service = new CodebaseReadService(
    new CodebaseRepository(db, context.profileGuard, () => 1001),
    context.partitionId,
    context.pageKey,
  );
  const bound = await service.query(aggregateDataset.id, 4, {
    op: "sum",
    fields: ["amount"],
    filters: [],
    limit: 4,
  });
  if (!("value" in bound) || bound.value !== 8 || bound.graphRevision !== 4)
    throw new Error("BOUND_QUERY_FAILED");
  return {
    boundReadServiceVerified: true,
    realIndexedDb: true,
    matchedRows: result.matchedRows,
    truncated: result.truncated,
    sortVerified: true,
    groupVerified: true,
    groupedSumVerified: true,
  };
}
