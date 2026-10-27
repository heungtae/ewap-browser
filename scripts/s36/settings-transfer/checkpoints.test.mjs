import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { fixture } from "../transport/support.mjs";
import {
  providerSettings,
  MigrationJournal,
  migrationEndpoint,
  checkpointTransport,
  parseMigrationCommand,
} from "../../../dist/s36/transport.mjs";
async function prepared() {
  const f = await fixture(true, providerSettings());
  try {
    const client = f.client();
    const db = new DatabaseSync(f.dbPath),
      journal = new MigrationJournal(db),
      initial = journal.read();
    db.close();
    const mg01 = await client.settings.stage(
      "wire",
      1,
      initial.manifest.sourceDigests.MG01,
      "session-only",
    );
    await f.staging.mirror("wire", 1, f.profile, client.rpc.port);
    // MG03–MG06 are metadata placeholders here; actual stores are checked by Chrome separately.
    const stores = Object.fromEntries(
      Object.keys(initial.manifest.sourceDigests).map((unit) => [
        unit,
        unit === "MG01" ? mg01 : f.checkpoint,
      ]),
    );
    const command = parseMigrationCommand({
      kind: "migration.checkpoints.publish",
      profileGuard: f.profile,
      migrationId: "wire",
      epoch: 1,
      revision: 0,
      sourceDigests: initial.manifest.sourceDigests,
      stores,
    });
    const candidate = { ...initial, revision: 1, phase: "validated", stores };
    const source = {
      profileGuard: f.profile,
      async assertFrozen() {},
      async sourceDigest(unit) {
        return initial.manifest.sourceDigests[unit];
      },
      async validate() {
        return true;
      },
    };
    const connect = () => {
      const c = f.client();
      return checkpointTransport(
        f.profile,
        (value) => c.bridge.request(value),
        source,
        async (id, epoch, cp) => {
          await c.settings.validate(id, epoch, cp, "session-only");
          return true;
        },
      );
    };
    return { f, command, candidate, connect, initial };
  } catch (error) {
    await f.close();
    throw error;
  }
}
test("all-six checkpoints persist through actual native IPC; duplicate/lost-response retry does not advance revision or ACK", async () => {
  const { f, command, candidate, connect } = await prepared();
  try {
    const saved = await connect().publish(candidate, 0);
    assert.equal(saved.phase, "copying");
    assert.equal(saved.revision, 1);
    assert.deepEqual(saved.stores, command.stores);
    assert.deepEqual(await connect().publish(candidate, 0), saved);
    assert.deepEqual(await connect().publish(candidate, 1), saved);
    await f.stop();
    await f.start();
    // Session credentials disappear; raw metadata read is not readiness, the guarded client refuses it.
    const scope = { migrationId: "wire", epoch: 1, revision: 1 };
    const read = {
      kind: "migration.checkpoints.read",
      profileGuard: f.profile,
      ...scope,
    };
    assert.deepEqual(await f.client().bridge.request(read), saved);
    await assert.rejects(connect().read(candidate.manifest, scope));
    await f
      .client()
      .settings.stage("wire", 1, command.sourceDigests.MG01, "session-only");
    assert.deepEqual(await connect().read(candidate.manifest, scope), saved);
    const db = new DatabaseSync(f.dbPath),
      journal = new MigrationJournal(db);
    assert.equal(journal.read().revision, 1);
    assert.deepEqual(journal.read().acknowledgments, {});
    assert.equal(journal.state().namespace, "legacy");
    assert.equal(journal.state().admission, 0);
    assert.doesNotMatch(
      JSON.stringify(journal.read()),
      /PRIVATE_API_CANARY|PRIVATE_HEADER_CANARY/,
    );
    db.close();
  } finally {
    await f.close();
  }
});
test("invalid metadata, stale scopes, mismatched native stages and expired requests never publish checkpoints", async () => {
  const { f, command } = await prepared();
  const db = new DatabaseSync(f.dbPath),
    journal = new MigrationJournal(db),
    before = JSON.stringify(journal.read());
  try {
    for (const patch of [
      { profileGuard: "0".repeat(64) },
      { migrationId: "other" },
      { epoch: 2 },
      { revision: 2 },
      { raw: "PRIVATE_CANARY" },
      { stores: { ...command.stores, MG06: undefined } },
      { sourceDigests: { ...command.sourceDigests, MG04: "0".repeat(64) } },
    ])
      await assert.rejects(f.client().bridge.request({ ...command, ...patch }));
    for (const unit of Object.keys(command.stores)) {
      const stores = structuredClone(command.stores);
      stores[unit].sourceDigest = "0".repeat(64);
      await assert.rejects(f.client().bridge.request({ ...command, stores }));
    }
    for (const unit of ["MG01", "MG02"]) {
      const stores = structuredClone(command.stores);
      stores[unit].targetDigest = "0".repeat(64);
      await assert.rejects(f.client().bridge.request({ ...command, stores }));
    }
    const endpoint = await migrationEndpoint(db, f.config);
    for (const context of [
      undefined,
      { deadline: Date.now() - 1, signal: new AbortController().signal },
      { deadline: Date.now() + 1000, signal: AbortSignal.abort() },
    ])
      await assert.rejects(endpoint(command, context), /MIGRATION_EXPIRED/);
    assert.equal(JSON.stringify(journal.read()), before);
    assert.equal(journal.state().namespace, "legacy");
  } finally {
    db.close();
    await f.close();
  }
});
test("conflicting checkpoints, stale reads, terminal phases and changed fences preserve prior publication", async () => {
  const { f, command } = await prepared();
  const db = new DatabaseSync(f.dbPath),
    journal = new MigrationJournal(db);
  try {
    await f.client().bridge.request(command);
    const saved = journal.read();
    const stores = structuredClone(command.stores);
    stores.MG06.targetDigest = "0".repeat(64);
    await assert.rejects(f.client().bridge.request({ ...command, stores }));
    await assert.rejects(
      f.client().bridge.request({
        kind: "migration.checkpoints.read",
        profileGuard: f.profile,
        migrationId: "wire",
        epoch: 1,
        revision: 0,
      }),
    );
    assert.deepEqual(journal.read(), saved);
    for (const phase of ["validated", "committed", "rolled_back"]) {
      const current = journal.read();
      journal.write(current.revision, {
        ...current,
        revision: current.revision + 1,
        phase,
      });
      const snapshot = JSON.stringify(journal.read());
      await assert.rejects(
        f
          .client()
          .bridge.request({ ...command, revision: journal.read().revision }),
      );
      assert.equal(JSON.stringify(journal.read()), snapshot);
    }
    journal.fence();
    await assert.rejects(f.client().bridge.request(command));
    assert.equal(journal.state().admission, 0);
  } finally {
    db.close();
    await f.close();
  }
});
