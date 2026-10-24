import { expect, it, vi } from "vitest";
import { openDatabase } from "../../../../../packages/codebase-repository/src/database.js";
import { Mg03Staging } from "../../../../../apps/chrome-extension/src/migration/mg03-staging.js";
import { savedSource } from "./mg03-support.js";
async function fixture() {
  const factory = new (await import("fake-indexeddb")).IDBFactory();
  const open = () => openDatabase(factory, "a".repeat(64));
  const db = await open();
  const source: Record<string, unknown> = {
    ...savedSource(),
    learned_page_profile_identity_key_v1: "NEVER_EXPORT_IDENTITY",
  };
  let frozen = true;
  let reads = 0;
  let mutateAt = 0;
  const requested: string[][] = [];
  const port = {
    async assertFrozen(epoch: number) {
      if (!frozen || epoch !== 1) throw new Error("NOT_FROZEN");
    },
    async get(keys: string[]) {
      requested.push(keys);
      reads++;
      if (mutateAt === reads) source.saved_workflows_v1 = { schema_version: 2 };
      return structuredClone(source);
    },
  };
  return {
    db,
    open,
    source,
    requested,
    port,
    staging: new Mg03Staging(db, port),
    unfreeze: () => {
      frozen = false;
    },
    mutateNextRead: () => {
      mutateAt = reads + 2;
    },
  };
}
it("atomically persists a source backup and readback-verified checkpoint across reopen/retry", async () => {
  const f = await fixture();
  const original = structuredClone(f.source);
  const hash = await f.staging.sourceDigest(1);
  const checkpoint = await f.staging.stage("migration-1", 1, hash);
  expect(checkpoint).toMatchObject({
    copied: 1,
    quarantined: 0,
    sourceCount: 1,
    sourceDigest: hash,
  });
  expect(f.source).toEqual(original);
  expect(JSON.stringify(await f.staging.read("migration-1"))).not.toContain(
    "NEVER_EXPORT_IDENTITY",
  );
  expect(f.requested.every((keys) => keys.length === 2)).toBe(true);
  f.db.close();
  const db = await f.open();
  try {
    const restarted = new Mg03Staging(db, f.port);
    expect(await restarted.stage("migration-1", 1, hash)).toEqual(checkpoint);
    expect(await restarted.validate("migration-1", 1, checkpoint)).toBe(true);
  } finally {
    db.close();
  }
});
it("rejects source drift between reads, leaving no checkpoint", async () => {
  const f = await fixture();
  try {
    const hash = await f.staging.sourceDigest(1);
    f.mutateNextRead();
    await expect(f.staging.stage("migration-1", 1, hash)).rejects.toThrow(
      "SOURCE_CHANGED",
    );
    expect(await f.staging.read("migration-1")).toBeUndefined();
  } finally {
    f.db.close();
  }
});
it("refuses unfrozen admission and invalid epochs", async () => {
  const f = await fixture();
  try {
    const hash = await f.staging.sourceDigest(1);
    f.unfreeze();
    await expect(f.staging.stage("migration-1", 1, hash)).rejects.toThrow(
      "NOT_FROZEN",
    );
    await expect(f.staging.stage("migration-1", 0, hash)).rejects.toThrow(
      "MG03_IDENTITY",
    );
  } finally {
    f.db.close();
  }
});
it("detects corrupted staging on retry and validation without replacing backups", async () => {
  const f = await fixture();
  try {
    const hash = await f.staging.sourceDigest(1);
    const checkpoint = await f.staging.stage("migration-1", 1, hash);
    const saved = (await f.staging.read("migration-1"))!;
    saved.conversion.records[0]!.executable = true as false;
    const tx = f.db.transaction("migrationJournal", "readwrite");
    tx.objectStore("migrationJournal").put(saved);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    expect(await f.staging.validate("migration-1", 1, checkpoint)).toBe(false);
    await expect(f.staging.stage("migration-1", 1, hash)).rejects.toThrow(
      "MG03_CONFLICT",
    );
    expect((await f.staging.read("migration-1"))?.snapshot).toEqual(
      saved.snapshot,
    );
  } finally {
    f.db.close();
  }
});

it("quota failure aborts the transaction and a later retry preserves original counts", async () => {
  const f = await fixture();
  try {
    const hash = await f.staging.sourceDigest(1);
    const { IDBObjectStore } = await import("fake-indexeddb");
    const add = vi
      .spyOn(IDBObjectStore.prototype, "add")
      .mockImplementationOnce(() => {
        throw new DOMException(
          "controlled quota failure",
          "QuotaExceededError",
        );
      });
    try {
      await expect(f.staging.stage("quota-retry", 1, hash)).rejects.toThrow(
        "controlled quota failure",
      );
    } finally {
      add.mockRestore();
    }
    expect(await f.staging.read("quota-retry")).toBeUndefined();
    expect(await f.staging.stage("quota-retry", 1, hash)).toMatchObject({
      copied: 1,
      quarantined: 0,
      sourceCount: 1,
    });
  } finally {
    f.db.close();
  }
});
it("concurrent same-ID staging converges to the same checkpoint without duplication", async () => {
  const f = await fixture();
  const other = await f.open();
  try {
    const hash = await f.staging.sourceDigest(1);
    const second = new Mg03Staging(other, f.port);
    const results = await Promise.all([
      f.staging.stage("race", 1, hash),
      second.stage("race", 1, hash),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect((await second.read("race"))?.conversion.records).toHaveLength(1);
  } finally {
    other.close();
    f.db.close();
  }
});
