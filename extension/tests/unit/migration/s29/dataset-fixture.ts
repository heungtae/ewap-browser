import { buildGraph } from "../../../../../packages/codebase-builder/src/index.js";
import {
  CodebaseRepository,
  openDatabase,
  makeDataset,
} from "../../../../../packages/codebase-repository/src/index.js";
import { batch } from "./support.js";
export async function fixture() {
  const graph = await buildGraph(await batch());
  const db = await openDatabase(
    new (await import("fake-indexeddb")).IDBFactory(),
    graph.context.profileGuard,
  );
  const repo = new CodebaseRepository(
    db,
    graph.context.profileGuard,
    () => 1000,
  );
  await repo.commit(graph);
  const data = await makeDataset({
    schema: "wca.codebase/v1",
    kind: "dataset",
    id: "dataset_one",
    partitionId: graph.context.partitionId,
    pageKey: graph.context.pageKey,
    graphRevision: 1,
    fields: [{ name: "value", type: "number", unit: "ms" }],
    rows: [[1], [2], [null]],
    rowIds: ["row_one", "row_two", "row_three"],
    source: "static",
    evidenceIds: graph.evidence.map((e) => e.id),
    observedAt: 1000,
    expiresAt: 2000,
    coverage: { ...graph.coverage, total: 3, examined: 3, emitted: 3 },
  });
  return { graph, db, repo, data };
}
