import { DatabaseSync } from "node:sqlite";
import { IDBFactory } from "fake-indexeddb";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Mg02Staging,
  SqlitePolicyMirror,
  MigrationJournal,
  openDatabase,
} from "../../dist/s36/mg02.mjs";
async function setup() {
  const directory = mkdtempSync(join(tmpdir(), "s36-mg02-"));
  const path = join(directory, "policy.sqlite");
  const db = new DatabaseSync(path);
  const journal = new MigrationJournal(db);
  journal.fence();
  const profile = "3".repeat(64);
  const browser = await openDatabase(new IDBFactory(), profile);
  const data = {
    contextpilot_permissions: [
      {
        capability: "type",
        host: "example.test",
        action: "deny",
        duration: "always",
      },
    ],
    agent_preferences: {
      invalid_legacy_payload: "PRIVATE_POLICY_SOURCE_CANARY",
    },
  };
  const original = JSON.stringify(data);
  const source = {
    async get() {
      return structuredClone(data);
    },
    async assertFrozen(epoch) {
      assert.equal(journal.state().epoch, epoch);
    },
  };
  return {
    directory,
    path,
    db,
    journal,
    profile,
    browser,
    data,
    original,
    source,
    staging: new Mg02Staging(browser, source),
    mirror: new SqlitePolicyMirror(db, profile),
  };
}
test("real SQLite mirror restart and extension ACK preserve revision/digest while raw backup stays browser-local", async () => {
  const f = await setup();
  let db = f.db;
  try {
    const hash = await f.staging.sourceDigest(1);
    await f.staging.stage("policy", 1, hash);
    await f.staging.mirror("policy", 1, f.profile, f.mirror);
    assert.equal(
      await f.staging.validateMirror("policy", 1, f.profile, f.mirror),
      true,
    );
    const body = String(
      db.prepare("SELECT body FROM mg02_policy_mirror").get().body,
    );
    assert.doesNotMatch(body, /PRIVATE_POLICY_SOURCE_CANARY|snapshot/);
    assert.equal(JSON.parse(body).conversion.blocked, true);
    db.close();
    db = new DatabaseSync(f.path);
    const restarted = new SqlitePolicyMirror(db, f.profile);
    const reopened = new Mg02Staging(f.browser, {
      ...f.source,
      async assertFrozen(epoch) {
        assert.equal(new MigrationJournal(db).state().epoch, epoch);
      },
    });
    assert.equal(
      await reopened.validateMirror("policy", 1, f.profile, restarted),
      true,
    );
    assert.deepEqual(
      await reopened.mirror("policy", 1, f.profile, restarted),
      await restarted.read(f.profile, "policy", 1),
    );
    assert.equal(JSON.stringify(f.data), f.original);
    assert.equal(new MigrationJournal(db).state().admission, 0);
    assert.equal(new MigrationJournal(db).state().namespace, "legacy");
  } finally {
    f.browser.close();
    db.close();
    rmSync(f.directory, { recursive: true, force: true });
  }
});
test("backend-only commit after a disconnect is reconciled, with stale/cross-profile mirrors rejected", async () => {
  const f = await setup();
  const other = new DatabaseSync(f.path);
  try {
    await f.staging.stage("lost", 1, await f.staging.sourceDigest(1));
    const disconnect = {
      read: f.mirror.read.bind(f.mirror),
      async put(value) {
        await f.mirror.put(value);
        throw new Error("DISCONNECTED");
      },
    };
    await assert.rejects(
      f.staging.mirror("lost", 1, f.profile, disconnect),
      /DISCONNECTED/,
    );
    assert.equal(
      await f.staging.validateMirror("lost", 1, f.profile, f.mirror),
      false,
    );
    await f.staging.mirror("lost", 1, f.profile, f.mirror);
    assert.equal(
      await f.staging.validateMirror("lost", 1, f.profile, f.mirror),
      true,
    );
    const stored = JSON.parse(
      String(f.db.prepare("SELECT body FROM mg02_policy_mirror").get().body),
    );
    await assert.rejects(
      f.mirror.put({ ...stored, profileGuard: "b".repeat(64) }),
      /MG02_PROFILE/,
    );
    await assert.rejects(
      f.mirror.put({
        ...stored,
        checkpoint: { ...stored.checkpoint, targetDigest: "b".repeat(64) },
      }),
      /MG02_MIRROR_INVALID/,
    );
    await assert.rejects(
      f.mirror.put({
        ...stored,
        checkpoint: { ...stored.checkpoint, sourceDigest: "c".repeat(64) },
      }),
      /MG02_MIRROR_CONFLICT/,
    );
    new MigrationJournal(other).fence();
    await assert.rejects(
      f.mirror.read(f.profile, "lost", 1),
      /MG02_FENCE_REQUIRED/,
    );
    await assert.rejects(
      f.mirror.read(f.profile, "lost", 2),
      /MG02_MIRROR_STALE/,
    );
    assert.equal(new MigrationJournal(other).state().admission, 0);
  } finally {
    other.close();
    f.browser.close();
    f.db.close();
    rmSync(f.directory, { recursive: true, force: true });
  }
});
