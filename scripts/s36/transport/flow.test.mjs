import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  migrationEndpoint,
  MigrationJournal,
} from "../../../dist/s36/transport.mjs";
import { fixture } from "./support.mjs";
test("actual native subprocess and authenticated daemon mirror real MG02 staging, then persist across restart", async () => {
  const f = await fixture();
  try {
    let { rpc, bridge } = f.client();
    const before = await rpc.status();
    assert.equal(before.admission, false);
    assert.equal(before.epoch, 1);
    await f.staging.mirror("wire", 1, f.profile, rpc.port);
    assert.equal(
      await f.staging.validateMirror("wire", 1, f.profile, rpc.port),
      true,
    );
    const [status, ack] = await Promise.all([
      rpc.status(),
      rpc.port.read(f.profile, "wire", 1),
    ]);
    assert.equal(status.migration.migrationId, "wire");
    assert.equal(ack.migrationId, "wire");
    bridge.close();
    await f.stop();
    await f.start();
    ({ rpc } = f.client());
    assert.deepEqual(await rpc.port.read(f.profile, "wire", 1), ack);
    assert.equal(
      await f.staging.validateMirror("wire", 1, f.profile, rpc.port),
      true,
    );
    assert.equal(JSON.stringify(f.data), f.original);
    const db = new DatabaseSync(f.dbPath);
    const rows = JSON.stringify(
      db.prepare("SELECT body FROM mg02_policy_mirror").all(),
    );
    assert.doesNotMatch(rows, new RegExp(f.config.secret));
    assert.equal(
      db.prepare("SELECT admission FROM migration_fence").get().admission,
      0,
    );
    db.close();
  } finally {
    await f.close();
  }
});
test("unauthenticated and wrong-profile calls cannot mutate SQLite", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.client({ secret: "0".repeat(64) }).rpc.status());
    await assert.rejects(
      f.client().bridge.request({
        kind: "migration.status",
        profileGuard: "0".repeat(64),
      }),
    );
    const { rpc } = f.client();
    assert.equal((await rpc.status()).migration.phase, "prepared");
    const db = new DatabaseSync(f.dbPath);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM mg02_policy_mirror").get().n,
      0,
    );
    db.close();
  } finally {
    await f.close();
  }
});
test("remote mirroring cannot create a fence or prepare a migration", async () => {
  const f = await fixture(false);
  try {
    const { rpc } = f.client();
    assert.equal((await rpc.status()).epoch, 0);
    await assert.rejects(f.staging.mirror("wire", 1, f.profile, rpc.port));
    const db = new DatabaseSync(f.dbPath);
    assert.equal(
      db.prepare("SELECT epoch FROM migration_fence").get().epoch,
      0,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM migration_journal").get().n,
      0,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM mg02_policy_mirror").get().n,
      0,
    );
    db.close();
  } finally {
    await f.close();
  }
});
test("stale epoch and unknown migration IDs close the request without publishing agreement", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.client().rpc.port.read(f.profile, "wire", 2));
    await assert.rejects(f.client().rpc.port.read(f.profile, "other", 1));
    assert.equal((await f.client().rpc.status()).admission, false);
  } finally {
    await f.close();
  }
});

test("a persisted DB owner cannot be rebound to another paired profile", async () => {
  const f = await fixture();
  try {
    await f.client().rpc.status();
    const db = new DatabaseSync(f.dbPath);
    await assert.rejects(
      migrationEndpoint(db, {
        installationId: f.config.installationId,
        profileId: "different",
      }),
      /MIGRATION_PROFILE/,
    );
    assert.equal(
      db.prepare("SELECT profile_guard FROM migration_owner").get()
        .profile_guard,
      f.profile,
    );
    db.close();
  } finally {
    await f.close();
  }
});
test("an ordinary bridge does not advertise or accept migration RPC", async () => {
  const f = await fixture();
  try {
    await f.stop();
    await f.start(true);
    await assert.rejects(f.client().rpc.status(), /MIGRATION_UNAVAILABLE/);
    const db = new DatabaseSync(f.dbPath);
    assert.equal(
      db.prepare("SELECT admission FROM migration_fence").get().admission,
      0,
    );
    db.close();
  } finally {
    await f.close();
  }
});

test("committed target keeps ACK readback available while rejecting further puts", async () => {
  const f = await fixture();
  try {
    const { rpc } = f.client();
    await f.staging.mirror("wire", 1, f.profile, rpc.port);
    const db = new DatabaseSync(f.dbPath),
      journal = new MigrationJournal(db),
      old = journal.read();
    // Phase gate fixture only: other unit checkpoints are placeholders, not six-unit completion evidence.
    journal.write(old.revision, {
      ...old,
      revision: old.revision + 1,
      phase: "committed",
      stores: Object.fromEntries(
        ["MG01", "MG02", "MG03", "MG04", "MG05", "MG06"].map((unit) => [
          unit,
          f.checkpoint,
        ]),
      ),
    });
    db.close();
    assert.equal(
      await f.staging.validateMirror("wire", 1, f.profile, rpc.port),
      true,
    );
    await assert.rejects(f.staging.mirror("wire", 1, f.profile, rpc.port));
  } finally {
    await f.close();
  }
});
