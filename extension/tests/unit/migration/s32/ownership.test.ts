import { expect, it } from "vitest";
import { openDatabase } from "../../../../../packages/codebase-repository/src/index.js";
import { IndexedDbCdpOwnership } from "../../../../../packages/browser-runtime/src/index.js";
it("S32 indexed ownership fences competing contexts and survives database reopen", async () => {
  const { IDBFactory } = await import("fake-indexeddb");
  const factory = new IDBFactory();
  const guard = "a".repeat(64);
  let db = await openDatabase(factory, guard);
  const owner = new IndexedDbCdpOwnership(db, "partition");
  await owner.mark(1, "runtime-one", "attaching");
  await expect(
    new IndexedDbCdpOwnership(db, "other-partition").mark(
      1,
      "runtime-two",
      "owned",
    ),
  ).rejects.toThrow("CDP_OWNERSHIP_CONFLICT");
  db.close();
  db = await openDatabase(factory, guard);
  const recovered = new IndexedDbCdpOwnership(db, "partition");
  expect(await recovered.available(1)).toBe(false);
  await expect(recovered.clear(1, "runtime-two")).rejects.toThrow(
    "CDP_OWNERSHIP_CONFLICT",
  );
  await recovered.clear(1, "runtime-one");
  expect(await recovered.available(1)).toBe(true);
  db.close();
});
