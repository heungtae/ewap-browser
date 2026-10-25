import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  providerSettings,
  migrationDigest,
} from "../../../dist/s36/transport.mjs";
import { fixture } from "../transport/support.mjs";
import { isolatedKeyring } from "../secrets/fixture.mjs";
export async function qualifyOsTransfer() {
  const keyring = await isolatedKeyring();
  let f;
  try {
    f = await fixture(true, providerSettings(), true, [
      "--settings-os-store",
      keyring.helper,
    ]);
    const digest = migrationDigest({
      provider_settings: f.data.provider_settings,
    });
    const checkpoint = await f
      .client()
      .settings.stage("wire", 1, digest, "os-store");
    await f.stop();
    await f.start();
    assert.deepEqual(
      await f.client().settings.validate("wire", 1, checkpoint, "os-store"),
      checkpoint,
    );
    await keyring.lock();
    await assert.rejects(
      f.client().settings.validate("wire", 1, checkpoint, "os-store"),
    );
    const db = new DatabaseSync(f.dbPath);
    assert.doesNotMatch(
      JSON.stringify(db.prepare("SELECT body FROM mg01_settings_stage").all()),
      /PRIVATE_API_CANARY|PRIVATE_HEADER_CANARY/,
    );
    assert.equal(
      db.prepare("SELECT admission FROM migration_fence").get().admission,
      0,
    );
    db.close();
  } finally {
    await f?.close();
    await keyring.close();
  }
}
