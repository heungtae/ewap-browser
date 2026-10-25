import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  providerSettings,
  migrationDigest,
} from "../../../dist/s36/transport.mjs";
import { fixture } from "../transport/support.mjs";
import { rawCommand } from "./support.mjs";

test("actual MG01 credential transfer stages metadata only; session restart requires an explicit fresh copy", async () => {
  const f = await fixture(true, providerSettings());
  try {
    let { settings } = f.client();
    const digest = migrationDigest({
      provider_settings: f.data.provider_settings,
    });
    const checkpoint = await settings.stage("wire", 1, digest, "session-only");
    assert.equal(checkpoint.copied, 1);
    assert.equal(checkpoint.quarantined, 0);
    assert.deepEqual(
      await settings.validate("wire", 1, checkpoint, "session-only"),
      checkpoint,
    );
    await f.stop();
    await f.start();
    ({ settings } = f.client());
    await assert.rejects(
      settings.validate("wire", 1, checkpoint, "session-only"),
    );
    ({ settings } = f.client());
    assert.deepEqual(
      await settings.stage("wire", 1, digest, "session-only"),
      checkpoint,
    );
    assert.deepEqual(
      await settings.validate("wire", 1, checkpoint, "session-only"),
      checkpoint,
    );
    const db = new DatabaseSync(f.dbPath);
    const body = JSON.stringify(
      db.prepare("SELECT body FROM mg01_settings_stage").all(),
    );
    assert.doesNotMatch(body, /PRIVATE_API_CANARY|PRIVATE_HEADER_CANARY/);
    const value = JSON.parse(
      db.prepare("SELECT body FROM mg01_settings_stage").get().body,
    );
    assert.equal(value.conversion.records[0].enabled, false);
    assert.equal(value.conversion.records[0].ready, false);
    assert.equal(value.conversion.controllerFailure, "stop");
    assert.equal(
      db.prepare("SELECT admission FROM migration_fence").get().admission,
      0,
    );
    db.close();
    assert.equal(JSON.stringify(f.data), f.original);
  } finally {
    await f.close();
  }
});
test("settings mode is explicit and cannot silently downgrade OS-store requests", async () => {
  const f = await fixture(true, providerSettings());
  try {
    const client = f.client(),
      digest = migrationDigest({ provider_settings: f.data.provider_settings });
    await assert.rejects(
      client.settings.stage("wire", 1, digest, "os-store"),
      /MG01_TRANSFER_PREFLIGHT/,
    );
    await assert.rejects(
      f.client().bridge.request(rawCommand(f, { secretMode: "os-store" })),
    );
    const db = new DatabaseSync(f.dbPath);
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE name='mg01_settings_stage'",
        )
        .get().n,
      0,
    );
    db.close();
  } finally {
    await f.close();
  }
});
test("no settings capability exists without explicit backend composition", async () => {
  const f = await fixture(true, providerSettings(), false);
  try {
    const client = f.client();
    assert.equal((await client.rpc.status()).settingsMode, null);
    await assert.rejects(
      client.bridge.request(rawCommand(f)),
      /MIGRATION_UNAVAILABLE/,
    );
  } finally {
    await f.close();
  }
});
test("wrong snapshot, stale epoch and an unprepared backend never authorize credential copy", async () => {
  const f = await fixture(true, providerSettings());
  try {
    await assert.rejects(
      f
        .client()
        .bridge.request(rawCommand(f, { sourceDigest: "0".repeat(64) })),
    );
    await assert.rejects(
      f.client().bridge.request(rawCommand(f, { epoch: 2 })),
    );
    const db = new DatabaseSync(f.dbPath);
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE name='mg01_settings_stage'",
        )
        .get().n,
      0,
    );
    db.close();
  } finally {
    await f.close();
  }
  const empty = await fixture(false, providerSettings());
  try {
    await assert.rejects(empty.client().bridge.request(rawCommand(empty)));
  } finally {
    await empty.close();
  }
});
