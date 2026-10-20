import { expect, it } from "vitest";
import {
  buildGraph,
  importAdvisory,
} from "../../../../../packages/codebase-builder/src/index.js";
import {
  CodebaseRepository,
  openDatabase,
  makeDataset,
  writeDataset,
  readDataset,
  queryDataset,
  CodebaseReadService,
} from "../../../../../packages/codebase-repository/src/index.js";
import { batch } from "./support.js";
async function fixture() {
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
it("keeps immutable dataset chunks/provenance and explicit numeric/null semantics", async () => {
  const { db, data } = await fixture();
  try {
    await writeDataset(db, data, 1000);
    await writeDataset(db, data, 1000);
    const restored = await readDataset(
      db,
      data.partitionId,
      data.pageKey,
      data.id,
      1001,
    );
    expect(restored).toEqual(data);
    expect(
      await queryDataset(restored, {
        op: "average",
        fields: ["value"],
        filters: [],
        limit: 100,
      }),
    ).toMatchObject({ value: 1.5, nullsExcluded: 1, unit: "ms" });
    expect(
      await queryDataset(restored, {
        op: "count",
        fields: [],
        filters: [],
        limit: 1,
      }),
    ).toMatchObject({ value: 3 });
    await expect(
      queryDataset(restored, {
        op: "project",
        fields: ["value"],
        filters: [],
        limit: 1,
        sql: "DROP TABLE",
      }),
    ).rejects.toThrow();
    await expect(
      readDataset(db, data.partitionId, data.pageKey, data.id, 2000),
    ).rejects.toThrow("EXPIRED");
  } finally {
    db.close();
  }
});
it("rejects sample completeness, conflicting IDs, corrupted rows and changed graph references", async () => {
  const { db, repo, data, graph } = await fixture();
  try {
    await expect(
      makeDataset({ ...data, source: "level1_sample" }),
    ).rejects.toThrow();
    await writeDataset(db, data, 1000);
    await expect(
      writeDataset(db, { ...data, rows: [[5], [2], [null]] }, 1000),
    ).rejects.toThrow("DATASET_INTEGRITY");
    const next = await buildGraph(await batch(undefined, 2, 1), graph.entities);
    await repo.commit(next);
    await expect(
      readDataset(db, data.partitionId, data.pageKey, data.id, 1001),
    ).rejects.toThrow("DATASET_GRAPH_STALE");
  } finally {
    db.close();
  }
});
it("bounds revision-tagged search/inspection and excludes stale projections", async () => {
  const { db, repo, graph } = await fixture();
  try {
    const service = new CodebaseReadService(
      repo,
      graph.context.partitionId,
      graph.context.pageKey,
    );
    const found = await service.search({
      name: "Save",
      limit: 10,
      revision: 1,
    });
    expect(found.entities.length).toBeGreaterThan(0);
    await expect(
      service.search({ name: "Save", limit: 129, revision: 1 }),
    ).rejects.toThrow("QUERY_LIMIT");
    await expect(service.inspect(found.entities[0]!.id, 0)).rejects.toThrow(
      "PROJECTION_STALE",
    );
  } finally {
    db.close();
  }
});
it("imports only advisory procedure metadata and history, never stored grants/arguments/refs", async () => {
  const { db, graph } = await fixture();
  try {
    const imported = await importAdvisory(
      {
        source: "learned",
        sourceId: "legacy_workflow",
        title: "Search procedure",
        sourceRevision: 1,
        successfulAt: 100,
        steps: [
          { tool: "fill_by_ref", label: "Query" },
          { tool: "click_by_ref", label: "Search" },
        ],
      },
      graph.entities[0]!,
    );
    expect(imported.entity.status).toBe("advisory");
    expect(imported.entity.capability).toBeNull();
    expect(imported.history.sourceRevision).toBe(1);
    expect(JSON.stringify(imported)).not.toContain("execute");
  } finally {
    db.close();
  }
});
