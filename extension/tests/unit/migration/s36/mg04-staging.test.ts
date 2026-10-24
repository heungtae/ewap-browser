import { expect, it } from "vitest";
import {
  openDatabase,
  completed,
} from "../../../../../packages/codebase-repository/src/database.js";
import { Mg03Staging } from "../../../../../apps/chrome-extension/src/migration/mg03-staging.js";
import { Mg04Staging } from "../../../../../apps/chrome-extension/src/migration/mg04-staging.js";
import { historySource } from "./mg04-support.js";
import { savedSource } from "./mg03-support.js";
async function fixture() {
  const factory = new (await import("fake-indexeddb")).IDBFactory();
  const open = () => openDatabase(factory, "c".repeat(64));
  const db = await open();
  let frozen = true;
  const session = {
    ...historySource(),
    saved_workflows_v1: "UNRELATED_STORAGE",
  };
  const reads: string[][] = [];
  const guard = async (epoch: number) => {
    if (epoch !== 1 || !frozen) throw new Error("FENCE_REVOKED");
  };
  const port = {
    assertFrozen: guard,
    async get(keys: string[]) {
      reads.push(keys);
      return structuredClone(session);
    },
  };
  return {
    db,
    open,
    session,
    reads,
    port,
    history: new Mg04Staging(db, port),
    saved: new Mg03Staging(db, {
      assertFrozen: guard,
      async get() {
        return savedSource();
      },
    }),
    unfreeze() {
      frozen = false;
    },
  };
}
it("persists only session chat data in a separate unit namespace and reopens idempotently", async () => {
  const f = await fixture();
  const original = structuredClone(f.session);
  try {
    const hash = await f.history.sourceDigest(1);
    const checkpoint = await f.history.stage("shared-id", 1, hash);
    await f.saved.stage("shared-id", 1, await f.saved.sourceDigest(1));
    expect(
      (await f.history.read("shared-id"))?.conversion.records[0],
    ).toMatchObject({ historyOnly: true, executable: false });
    expect((await f.saved.read("shared-id"))?.conversion.schema).toBe(
      "wca.mg03-advisory/v1",
    );
    expect(
      f.reads.every((keys) => JSON.stringify(keys) === '["chat_session_v1"]'),
    ).toBe(true);
    expect(JSON.stringify(await f.history.read("shared-id"))).not.toContain(
      "UNRELATED_STORAGE",
    );
    f.db.close();
    const db = await f.open();
    try {
      const restarted = new Mg04Staging(db, f.port);
      expect(await restarted.stage("shared-id", 1, hash)).toEqual(checkpoint);
      expect(await restarted.validate("shared-id", 1, checkpoint)).toBe(true);
    } finally {
      db.close();
    }
    expect(f.session).toEqual(original);
  } finally {
    f.db.close();
  }
});
it("rejects altered migration identity even if snapshot and conversion digests still match", async () => {
  const f = await fixture();
  try {
    const checkpoint = await f.history.stage(
      "identity",
      1,
      await f.history.sourceDigest(1),
    );
    const saved = (await f.history.read("identity"))!;
    saved.migrationId = "other";
    const tx = f.db.transaction("migrationJournal", "readwrite");
    const done = completed(tx);
    tx.objectStore("migrationJournal").put(saved);
    await done;
    expect(await f.history.validate("identity", 1, checkpoint)).toBe(false);
    await expect(
      f.history.stage("identity", 1, checkpoint.sourceDigest),
    ).rejects.toThrow("MG04_CONFLICT");
  } finally {
    f.db.close();
  }
});
it("revoked source fence prevents history checkpoint admission", async () => {
  const f = await fixture();
  try {
    const hash = await f.history.sourceDigest(1);
    f.unfreeze();
    await expect(f.history.stage("late", 1, hash)).rejects.toThrow(
      "FENCE_REVOKED",
    );
    expect(await f.history.read("late")).toBeUndefined();
  } finally {
    f.db.close();
  }
});
