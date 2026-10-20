import { expect, it } from "vitest";
import { buildGraph } from "../../../../../packages/codebase-builder/src/index.js";
import {
  CodebaseRepository,
  openDatabase,
  completed,
  stores,
} from "../../../../../packages/codebase-repository/src/index.js";
import { readAll } from "../../../../../packages/codebase-repository/src/capacity.js";
import { batch, context } from "./support.js";
it("evicts whole unpinned pages, retains journals and refuses to evict pinned evidence", async () => {
  const first = await buildGraph(await batch());
  const second = await buildGraph(
    await batch(undefined, 2, 0, {
      context: await context(2, "https://fixture.test/second"),
    }),
  );
  const factory = new (await import("fake-indexeddb")).IDBFactory();
  const db = await openDatabase(factory, first.context.profileGuard);
  try {
    const full = new CodebaseRepository(
      db,
      first.context.profileGuard,
      () => 1000,
    );
    await full.commit(first);
    const tx = db.transaction([...stores], "readonly");
    const done = completed(tx);
    const all = await readAll(tx);
    await done;
    const one = all.reduce((n, w) => n + w.record.bytes, 0);
    const journal = all
      .filter((w) => w.store === "migrationJournal")
      .reduce((n, w) => n + w.record.bytes, 0);
    const capacity = 8 * 1024 * 1024 + one + journal + 512;
    const small = new CodebaseRepository(
      db,
      first.context.profileGuard,
      () => 1000,
      capacity,
    );
    await full.pin(first.context.partitionId, first.context.pageKey, 2000);
    await expect(small.commit(second)).rejects.toThrow("CACHE_CAPACITY");
    expect(
      (await full.snapshot(first.context.partitionId, first.context.pageKey))
        .revision,
    ).toBe(1);
    await full.unpin(first.context.partitionId, first.context.pageKey);
    await small.commit(second);
    await expect(
      full.snapshot(first.context.partitionId, first.context.pageKey),
    ).rejects.toThrow("SNAPSHOT_UNAVAILABLE");
    expect((await full.commit(first)).duplicate).toBe(true);
  } finally {
    db.close();
  }
});
