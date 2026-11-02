import { expect, it, vi } from "vitest";
import { CodebaseReadService } from "../../../../../packages/codebase-repository/src/index.js";
import { fixture } from "./dataset-fixture.js";
it("does not release a catalog after its caller binding is revoked during IndexedDB read", async () => {
  const { db, repo, graph } = await fixture();
  try {
    let live = true;
    const original = repo.snapshot.bind(repo);
    vi.spyOn(repo, "snapshot").mockImplementation(async (...args) => {
      const value = await original(...args);
      live = false;
      return value;
    });
    const read = new CodebaseReadService(
      repo,
      graph.context.partitionId,
      graph.context.pageKey,
      () => live,
    );
    await expect(read.catalog()).rejects.toThrow("PROJECTION_STALE");
  } finally {
    db.close();
  }
});
