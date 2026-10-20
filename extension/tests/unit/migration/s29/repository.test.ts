import { expect, it } from "vitest";
import { buildGraph } from "../../../../../packages/codebase-builder/src/index.js";
import {
  CodebaseRepository,
  openDatabase,
} from "../../../../../packages/codebase-repository/src/index.js";
import { batch, observation } from "./support.js";
async function setup(capacity = 100 * 1024 * 1024) {
  const delta = await buildGraph(await batch());
  const db = await openDatabase(
    new (await import("fake-indexeddb")).IDBFactory(),
    delta.context.profileGuard,
  );
  const repo = new CodebaseRepository(
    db,
    delta.context.profileGuard,
    () => 1000,
    capacity,
  );
  return { delta, db, repo };
}
it("commits atomically, identical retry returns original result, conflicting ID rejects", async () => {
  const { delta, db, repo } = await setup();
  try {
    const committed = await repo.commit(delta);
    expect(committed.revision).toBe(1);
    expect((await repo.commit(delta)).duplicate).toBe(true);
    const other = await buildGraph(
      await batch([observation({ name: "Different" })]),
    );
    await expect(repo.commit(other)).rejects.toThrow("BATCH_CONFLICT");
    expect(
      (await repo.snapshot(delta.context.partitionId, delta.context.pageKey))
        .revision,
    ).toBe(1);
  } finally {
    db.close();
  }
});
it("separate connections serialize CAS so only one concurrent writer wins", async () => {
  const factory = new (await import("fake-indexeddb")).IDBFactory();
  const first = await buildGraph(await batch());
  const db1 = await openDatabase(factory, first.context.profileGuard);
  const db2 = await openDatabase(factory, first.context.profileGuard);
  try {
    const one = new CodebaseRepository(db1, first.context.profileGuard);
    const two = new CodebaseRepository(db2, first.context.profileGuard);
    const second = await buildGraph(await batch(undefined, 2, 0));
    const result = await Promise.allSettled([
      one.commit(first),
      two.commit(second),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
  } finally {
    db1.close();
    db2.close();
  }
});
it("quota failure preserves committed revision and all historical snapshots", async () => {
  const { delta, db, repo } = await setup();
  try {
    await repo.commit(delta);
    const next = await buildGraph(await batch(undefined, 2, 1), delta.entities);
    const capped = new CodebaseRepository(
      db,
      delta.context.profileGuard,
      () => 1000,
      1,
    );
    await expect(capped.commit(next)).rejects.toThrow("CACHE_CAPACITY");
    expect(
      (await repo.snapshot(delta.context.partitionId, delta.context.pageKey))
        .revision,
    ).toBe(1);
    expect(
      (await repo.snapshot(delta.context.partitionId, delta.context.pageKey, 1))
        .revision,
    ).toBe(1);
  } finally {
    db.close();
  }
});
it("rejects stale source epochs and profile mismatch without modifying graph", async () => {
  const { delta, db, repo } = await setup();
  try {
    await repo.commit(delta);
    const sameEpoch = await buildGraph(
      await batch(undefined, 1, 1, { batchId: "batch_stale" }),
      delta.entities,
    );
    await expect(repo.commit(sameEpoch)).rejects.toThrow("SOURCE_STALE");
    const wrong = new CodebaseRepository(db, "b".repeat(64));
    await expect(wrong.commit(delta)).rejects.toThrow("PROFILE_MISMATCH");
  } finally {
    db.close();
  }
});
it("deletion revokes projections and invalid pins cannot last beyond task deadline", async () => {
  const { delta, db, repo } = await setup();
  try {
    await repo.commit(delta);
    await expect(
      repo.pin(delta.context.partitionId, delta.context.pageKey, 601001),
    ).rejects.toThrow("PIN_DEADLINE");
    await repo.pin(delta.context.partitionId, delta.context.pageKey, 2000);
    await repo.unpin(delta.context.partitionId, delta.context.pageKey);
    await repo.invalidatePartition(delta.context.partitionId);
    await expect(
      repo.snapshot(delta.context.partitionId, delta.context.pageKey),
    ).rejects.toThrow("SNAPSHOT_UNAVAILABLE");
  } finally {
    db.close();
  }
});
it("late cancellation fence aborts before writing facts", async () => {
  const { delta, db, repo } = await setup();
  try {
    await expect(repo.commit(delta, () => false)).rejects.toThrow("LATE_DELTA");
    await expect(
      repo.snapshot(delta.context.partitionId, delta.context.pageKey),
    ).rejects.toThrow("SNAPSHOT_UNAVAILABLE");
  } finally {
    db.close();
  }
});
