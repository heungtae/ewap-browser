import {
  buildGraph,
  importAdvisory,
} from "../../../../../packages/codebase-builder/src/index.js";
import {
  CodebaseRepository,
  openDatabase,
  writeAdvisory,
  AdvisoryManager,
  readAdvisory,
} from "../../../../../packages/codebase-repository/src/index.js";
import { batch } from "./support.js";
export async function managementFixture() {
  const graph = await buildGraph(await batch());
  const db = await openDatabase(
    new (await import("fake-indexeddb")).IDBFactory(),
    graph.context.profileGuard,
  );
  const repository = new CodebaseRepository(
    db,
    graph.context.profileGuard,
    () => 1000,
  );
  await repository.commit(graph);
  const input = {
    source: "learned" as const,
    sourceId: "legacy_profile",
    title: "Successful search",
    sourceRevision: 1,
    successfulAt: 999,
    steps: [{ tool: "fill_by_ref", label: "Query" }],
  };
  const learned = await importAdvisory(input, graph.entities[0]!);
  await writeAdvisory(db, learned, 1000);
  const recorded = await importAdvisory(
    {
      ...input,
      source: "recorded",
      sourceId: "saved_workflow",
      title: "Saved workflow",
    },
    graph.entities[0]!,
  );
  await writeAdvisory(db, recorded, 1000);
  const scope = {
    partitionId: graph.context.partitionId,
    pageKey: graph.context.pageKey,
  };
  const manager = new AdvisoryManager(
    db,
    graph.context.profileGuard,
    () => 1001,
  );
  const read = () =>
    readAdvisory(db, scope.partitionId, scope.pageKey, 128, 1001);
  return {
    db,
    graph,
    scope,
    input,
    learned,
    recorded,
    manager,
    repository,
    read,
  };
}
