import { expect, it } from "vitest";
import { completed } from "../../../../../packages/codebase-repository/src/database.js";
import { diagnosticsTtl } from "../../../../../apps/chrome-extension/src/migration/mg06-convert.js";
import {
  storageFixture as fixture,
  storedRows as rows,
} from "./mg06-storage-fixture.js";
it("expires metadata physically and refuses to revive the same migration checkpoint", async () => {
  const f = await fixture();
  try {
    const hash = await f.staging.sourceDigest(1);
    const checkpoint = await f.staging.stage("expire", 1, hash);
    f.advance(diagnosticsTtl - 1000);
    expect(await f.staging.validate("expire", 1, checkpoint)).toBe(false);
    expect(await f.staging.read("expire")).toBeUndefined();
    expect(await rows(f.db)).toEqual([
      { key: JSON.stringify(["MG06", "expire"]), expired: true },
    ]);
    await expect(f.staging.stage("expire", 1, hash)).rejects.toThrow(
      "MG06_RETENTION_EXPIRED",
    );
  } finally {
    f.db.close();
  }
});
it("rejects a stored expiry extension instead of returning metadata beyond its original deadline", async () => {
  const f = await fixture();
  try {
    await f.staging.stage("expiry-tamper", 1, await f.staging.sourceDigest(1));
    const saved = (await f.staging.read("expiry-tamper"))!;
    saved.expiresAt += diagnosticsTtl;
    const tx = f.db.transaction("migrationJournal", "readwrite");
    const done = completed(tx);
    tx.objectStore("migrationJournal").put(saved);
    await done;
    await expect(f.staging.read("expiry-tamper")).rejects.toThrow(
      "MG06_METADATA_INVALID",
    );
  } finally {
    f.db.close();
  }
});
