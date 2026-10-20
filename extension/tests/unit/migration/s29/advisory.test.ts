import { expect, it } from "vitest";
import {
  buildGraph,
  importAdvisory,
} from "../../../../../packages/codebase-builder/src/index.js";
import {
  CodebaseRepository,
  openDatabase,
  writeAdvisory,
  readAdvisory,
} from "../../../../../packages/codebase-repository/src/index.js";
import { batch } from "./support.js";
it("imports procedure/history transactionally, retains legacy source, rejects authority and conflicting revisions", async () => {
  const graph = await buildGraph(await batch());
  const db = await openDatabase(
    new (await import("fake-indexeddb")).IDBFactory(),
    graph.context.profileGuard,
  );
  try {
    await new CodebaseRepository(
      db,
      graph.context.profileGuard,
      () => 1000,
    ).commit(graph);
    const source = {
      source: "learned" as const,
      sourceId: "source_one",
      sourceRevision: 1,
      successfulAt: 999,
      title: "Query procedure",
      steps: [{ tool: "fill_by_ref", label: "Query" }],
    };
    const before = JSON.stringify(source);
    const imported = await importAdvisory(source, graph.entities[0]!);
    await writeAdvisory(db, imported, 1000);
    await writeAdvisory(db, imported, 1000);
    const read = await readAdvisory(
      db,
      graph.context.partitionId,
      graph.context.pageKey,
      10,
      1001,
    );
    expect(read.entities).toHaveLength(1);
    expect(read.history).toHaveLength(1);
    expect(JSON.stringify(source)).toBe(before);
    await expect(
      writeAdvisory(
        db,
        {
          ...imported,
          entity: { ...imported.entity, grant: "historical-token" },
        },
        1000,
      ),
    ).rejects.toThrow();
    const conflicting = await importAdvisory(
      { ...source, title: "Other" },
      graph.entities[0]!,
    );
    await expect(writeAdvisory(db, conflicting, 1000)).rejects.toThrow(
      "IMPORT_CONFLICT",
    );
    await expect(
      importAdvisory(
        { ...source, steps: [{ tool: "execute_javascript", label: "unsafe" }] },
        graph.entities[0]!,
      ),
    ).rejects.toThrow();
  } finally {
    db.close();
  }
});
