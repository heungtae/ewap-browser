import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { MigrationJournal } from "../../../dist/s36/transport.mjs";
export function verifyReadback(dbPath, joint) {
  const stored = new DatabaseSync(dbPath);
  assert.equal(
    stored.prepare("SELECT COUNT(*) AS n FROM mg01_settings_stage").get().n,
    1,
  );
  assert.equal(
    stored.prepare("SELECT admission FROM migration_fence").get().admission,
    0,
  );
  assert.doesNotMatch(
    JSON.stringify(
      stored.prepare("SELECT body FROM mg01_settings_stage").all(),
    ),
    /PRIVATE_API_CANARY|PRIVATE_HEADER_CANARY/,
  );
  if (joint) {
    const mirror = JSON.parse(
      stored.prepare("SELECT body FROM mg02_policy_mirror").get().body,
    );
    assert.equal(mirror.migrationId, "wire");
    assert.equal(mirror.epoch, 1);
    assert.equal(
      mirror.profileGuard,
      stored
        .prepare("SELECT profile_guard FROM migration_owner WHERE id=1")
        .get().profile_guard,
    );
    assert.doesNotMatch(
      JSON.stringify(mirror),
      /PRIVATE_API_CANARY|PRIVATE_HEADER_CANARY/,
    );
  }
  stored.close();
  const db = new DatabaseSync(dbPath);
  try {
    const journal = new MigrationJournal(db);
    assert.equal(journal.read().phase, "prepared");
    assert.equal(journal.state().namespace, "legacy");
  } finally {
    db.close();
  }
}
