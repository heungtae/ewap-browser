import { expect } from "vitest";
import {
  openDatabase,
  completed,
  request,
} from "../../../../../packages/codebase-repository/src/database.js";
import { Mg06Staging } from "../../../../../apps/chrome-extension/src/migration/mg06-staging.js";
import { diagnosticsNow, diagnosticsSource } from "./mg06-support.js";
export async function storageFixture() {
  const factory = new (await import("fake-indexeddb")).IDBFactory();
  const open = () => openDatabase(factory, "6".repeat(64));
  const db = await open();
  let now = diagnosticsNow;
  let frozen = true;
  const data = { ...diagnosticsSource(), unrelated: "PRIVATE_UNRELATED_KEY" };
  const port = {
    async assertFrozen(epoch: number) {
      if (epoch !== 1 || !frozen) throw new Error("FENCE_REVOKED");
    },
    async get(keys: string[]) {
      expect(keys).toEqual(["execution_diagnostics_v1"]);
      return structuredClone(data);
    },
  };
  return {
    db,
    open,
    port,
    data,
    now: () => now,
    staging: new Mg06Staging(db, port, () => now),
    advance(ms: number) {
      now += ms;
    },
    unfreeze() {
      frozen = false;
    },
  };
}
export async function storedRows(db: IDBDatabase) {
  const tx = db.transaction("migrationJournal", "readonly");
  const done = completed(tx);
  const values = await request(tx.objectStore("migrationJournal").getAll());
  await done;
  return values;
}
