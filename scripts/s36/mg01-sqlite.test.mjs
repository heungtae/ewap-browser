import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Mg01SettingsMigration,
  SqliteMg01Journal,
  MigrationJournal,
  SessionSecrets,
} from "../../dist/s36/mg01.mjs";
function rawSettings() {
  return {
    schema_version: 2,
    revision: 1,
    active_provider: "primary",
    routing: { mode: "single", pre_dispatch_failure: "primary" },
    providers: {
      primary: {
        kind: "openai_compatible",
        config: {
          plugin_id: "contextpilot.openai-compatible",
          plugin_version: "1.0.0",
          label: "Fixture provider",
          base_url: "https://fixture.example.test/v1",
          wire_api: "responses",
          model: "gpt-test",
          api_key: "SQLITE_PRIVATE_API_CANARY",
          api_key_header: "authorization_bearer",
          headers: [{ name: "x-token", value: "SQLITE_PRIVATE_HEADER_CANARY" }],
          timeout_ms: 10000,
          enabled: true,
        },
      },
    },
  };
}
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "s36-mg01-"));
  const path = join(directory, "settings.sqlite");
  const db = new DatabaseSync(path);
  const fence = new MigrationJournal(db);
  fence.fence();
  const data = rawSettings();
  const before = JSON.stringify(data);
  const secrets = new SessionSecrets();
  const source = {
    async assertFrozen(epoch) {
      assert.equal(fence.state().epoch, epoch);
    },
    async readProviderSettings() {
      return structuredClone(data);
    },
  };
  return {
    directory,
    path,
    db,
    fence,
    data,
    before,
    secrets,
    source,
    profile: "a".repeat(64),
  };
}
test("real SQLite restart retains only public settings/references and revalidates session-only secrets", async () => {
  const f = setup();
  let db = f.db;
  try {
    let journal = new SqliteMg01Journal(db);
    let migration = new Mg01SettingsMigration(
      journal,
      f.source,
      f.profile,
      f.secrets,
    );
    const digest = await migration.sourceDigest(1);
    const checkpoint = await migration.stage("restart", 1, digest);
    assert.equal(checkpoint.copied, 1);
    assert.equal(await migration.validate("restart", 1, checkpoint), true);
    const body = JSON.stringify(journal.load(f.profile, "restart"));
    assert.doesNotMatch(body, /SQLITE_PRIVATE|api_key|archive/);
    assert.equal(
      journal.load(f.profile, "restart").conversion.secretMode,
      "session-only",
    );
    db.close();
    db = new DatabaseSync(f.path);
    journal = new SqliteMg01Journal(db);
    // Source witness now uses the reopened connection too.
    const source = {
      ...f.source,
      async assertFrozen(epoch) {
        assert.equal(new MigrationJournal(db).state().epoch, epoch);
      },
    };
    migration = new Mg01SettingsMigration(
      journal,
      source,
      f.profile,
      f.secrets,
    );
    assert.deepEqual(await migration.stage("restart", 1, digest), checkpoint);
    f.secrets.clear();
    assert.equal(await migration.validate("restart", 1, checkpoint), false);
    assert.deepEqual(await migration.stage("restart", 1, digest), checkpoint);
    assert.equal(JSON.stringify(f.data), f.before);
    for (const file of [f.path, `${f.path}-wal`])
      if (existsSync(file))
        assert.doesNotMatch(
          readFileSync(file).toString("latin1"),
          /SQLITE_PRIVATE_API_CANARY|SQLITE_PRIVATE_HEADER_CANARY/,
        );
    assert.equal(new MigrationJournal(db).state().admission, 0);
    assert.equal(new MigrationJournal(db).state().namespace, "legacy");
  } finally {
    db.close();
    rmSync(f.directory, { recursive: true, force: true });
  }
});
test("a concurrent backend epoch change during secret transfer prevents SQL checkpoint publication", async () => {
  const f = setup();
  const other = new DatabaseSync(f.path);
  const remote = new MigrationJournal(other);
  try {
    const journal = new SqliteMg01Journal(f.db);
    let advanced = false;
    const store = {
      mode: "session-only",
      read: (id) => f.secrets.read(id),
      async write(id, value) {
        await f.secrets.write(id, value);
        if (!advanced) {
          remote.fence();
          advanced = true;
        }
      },
    };
    const migration = new Mg01SettingsMigration(
      journal,
      f.source,
      f.profile,
      store,
    );
    const digest = await migration.sourceDigest(1);
    await assert.rejects(
      migration.stage("fenced", 1, digest),
      /MG01_FENCE_REQUIRED/,
    );
    assert.equal(journal.load(f.profile, "fenced"), undefined);
    assert.equal(JSON.stringify(f.data), f.before);
    assert.equal(remote.state().namespace, "legacy");
    assert.equal(remote.state().admission, 0);
  } finally {
    other.close();
    f.db.close();
    rmSync(f.directory, { recursive: true, force: true });
  }
});
