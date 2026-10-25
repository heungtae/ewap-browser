import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, validated } from "./fixture.mjs";
test("six real units validate and agree before qualification pointer commit; admission remains closed", async () => {
  const f = await fixture();
  try {
    const original = JSON.stringify(f.localData);
    const wired = await validated(f);
    assert.deepEqual(Object.keys(f.journal.read().stores).sort(), [
      "MG01",
      "MG02",
      "MG03",
      "MG04",
      "MG05",
      "MG06",
    ]);
    await assert.rejects(wired.run.commit(), /ACK_REQUIRED/);
    await wired.run.acknowledge();
    await wired.run.commit();
    assert.equal(f.journal.read().phase, "committed");
    assert.equal(f.journal.state().namespace, "target");
    assert.equal(f.journal.state().admission, 0);
    assert.equal(JSON.stringify(f.localData), original);
    assert.equal(f.counts().cancellations, 1);
    await wired.run.commit();
    assert.equal(f.counts().cancellations, 1);
    for (const table of [
      "migration_journal",
      "mg01_settings_stage",
      "mg02_policy_mirror",
    ])
      assert.doesNotMatch(
        JSON.stringify(f.db.prepare(`SELECT body FROM ${table}`).all()),
        /PRIVATE_API_CANARY|PRIVATE_HEADER_CANARY|CANARY_RAW_DIAGNOSTIC_MESSAGE|Original question/,
      );
  } finally {
    await f.close();
  }
});
test("restart resumes actual IDB/SQLite checkpoints, while lost session credentials fail readback", async () => {
  const f = await fixture();
  try {
    await validated(f);
    f.restartBackend();
    await f.restartBrowser();
    const resumed = f.wire();
    await resumed.run.prepare(f.input);
    await resumed.run.copy();
    f.credentials.clear();
    await assert.rejects(resumed.run.acknowledge(), /STAGING_INVALID/);
    assert.equal(f.journal.state().namespace, "legacy");
    await resumed.settings.stage(
      f.input.migrationId,
      f.journal.read().epoch,
      f.journal.read().manifest.sourceDigests.MG01,
    );
    await resumed.run.acknowledge();
    await resumed.run.commit();
    assert.equal(f.journal.read().phase, "committed");
    assert.equal(f.counts().cancellations, 1);
  } finally {
    await f.close();
  }
});
test("unknown dispatch and unresolved owned CDP block prepare before any settings checkpoint", async () => {
  for (const uncertain of [true, false]) {
    const f = await fixture(uncertain);
    try {
      if (!uncertain) f.cdpUnknown();
      await assert.rejects(f.wire().run.prepare(f.input), /DISPATCH_UNCERTAIN/);
      assert.equal(f.journal.read(), undefined);
      assert.equal(f.journal.state().namespace, "legacy");
      assert.equal(
        f.db.prepare("SELECT COUNT(*) AS n FROM mg01_settings_stage").get().n,
        0,
      );
      assert.equal(f.journal.state().admission, 0);
    } finally {
      await f.close();
    }
  }
});
test("rollback advances epoch and selects only the preserved legacy namespace without replay", async () => {
  const f = await fixture();
  try {
    const wired = await validated(f);
    await wired.run.acknowledge();
    await wired.run.commit();
    const epoch = f.journal.read().epoch;
    await wired.run.rollback();
    assert.equal(f.journal.read().phase, "rolled_back");
    assert.equal(f.journal.read().epoch, epoch + 1);
    assert.equal(f.journal.state().namespace, "legacy");
    assert.equal(f.journal.state().admission, 0);
    assert.equal(Object.keys(f.journal.read().stores).length, 6);
    assert.equal(f.counts().cancellations, 1);
  } finally {
    await f.close();
  }
});
