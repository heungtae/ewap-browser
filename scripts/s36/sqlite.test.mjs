import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MigrationJournal,
  manifestDigest,
  units,
} from "../../dist/s36/migration.mjs";
test("durable fencing, CAS, dual acknowledgment and rollback namespace", () => {
  const dir = mkdtempSync(join(tmpdir(), "s36-"));
  const path = join(dir, "migration.sqlite");
  let db = new DatabaseSync(path);
  try {
    let store = new MigrationJournal(db);
    const epoch = store.fence();
    const manifest = {
      migrationId: "m36",
      sourceSchemas: "v1",
      targetSchemas: "v2",
      sourceDigests: Object.fromEntries(
        units.map((unit) => [unit, "a".repeat(64)]),
      ),
      legacyRelease: "old",
      targetRelease: "new",
    };
    const journal = {
      manifest,
      epoch,
      revision: 0,
      phase: "prepared",
      stores: {},
      acknowledgments: {},
    };
    store.write(undefined, journal);
    db.close();
    db = new DatabaseSync(path);
    store = new MigrationJournal(db);
    assert.deepEqual(store.read(), journal);
    assert.equal(store.state().admission, 0);
    assert.throws(() => store.activate(journal, "target"), /ACK_REQUIRED/);
    const complete = {
      ...journal,
      revision: 1,
      phase: "validated",
      stores: Object.fromEntries(
        units.map((unit) => [
          unit,
          {
            sourceDigest: "a".repeat(64),
            targetDigest: "b".repeat(64),
            sourceCount: 1,
            copied: 1,
            quarantined: 0,
          },
        ]),
      ),
    };
    const digest = manifestDigest(manifest, complete.stores);
    complete.acknowledgments = { extension: digest, backend: digest };
    store.write(0, complete);
    store.activate(complete, "target");
    assert.equal(store.state().namespace, "target");
    assert.equal(store.state().admission, 0);
    const other = new DatabaseSync(path);
    try {
      const competitor = new MigrationJournal(other);
      competitor.fence();
      assert.throws(
        () => store.write(1, { ...complete, revision: 2 }),
        /MIGRATION_CAS/,
      );
      assert.throws(() => store.activate(complete, "target"), /MIGRATION_CAS/);
      const rollback = {
        ...complete,
        epoch: competitor.state().epoch,
        revision: 2,
        acknowledgments: {},
      };
      competitor.write(1, rollback);
      competitor.activate(rollback, "legacy");
      assert.equal(competitor.state().namespace, "legacy");
      assert.equal(Object.keys(competitor.read().stores).length, 6);
    } finally {
      other.close();
    }
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
