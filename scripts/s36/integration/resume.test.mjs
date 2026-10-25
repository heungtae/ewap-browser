import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, validated } from "./fixture.mjs";
test("resume prepare rejects lost session sources without returning a historical validated result", async () => {
  const f = await fixture();
  try {
    await validated(f);
    const original = JSON.stringify(f.journal.read()),
      fence = JSON.stringify(f.journal.state());
    delete f.sessionData.chat_session_v1;
    await assert.rejects(f.wire().run.prepare(f.input), /SOURCE_CHANGED/);
    assert.equal(JSON.stringify(f.journal.read()), original);
    assert.equal(JSON.stringify(f.journal.state()), fence);
  } finally {
    await f.close();
  }
});

for (const unit of ["MG01", "MG02", "MG03", "MG05", "MG06"]) {
  test(`resume prepare checks ${unit} source without rewriting prior checkpoints`, async () => {
    const f = await fixture();
    try {
      await validated(f);
      const original = JSON.stringify(f.journal.read()),
        state = JSON.stringify(f.journal.state());
      if (unit === "MG01") f.localData.provider_settings = {};
      if (unit === "MG02") f.localData.contextpilot_permissions = [];
      if (unit === "MG03") delete f.localData.saved_workflows_v1;
      if (unit === "MG05") delete f.legacy.data.execution_requests_v1;
      if (unit === "MG06") delete f.sessionData.execution_diagnostics_v1;
      await assert.rejects(f.wire().run.prepare(f.input), /SOURCE_CHANGED/);
      assert.equal(JSON.stringify(f.journal.read()), original);
      assert.equal(JSON.stringify(f.journal.state()), state);
    } finally {
      await f.close();
    }
  });
}
for (const phase of ["prepared", "copying"]) {
  test(`${phase} restart rejects drift without advancing migration`, async () => {
    const f = await fixture();
    try {
      await f.wire().run.prepare(f.input);
      if (phase === "copying") {
        const current = f.journal.read();
        f.journal.write(current.revision, {
          ...current,
          phase,
          revision: current.revision + 1,
        });
      }
      const before = JSON.stringify(f.journal.read());
      delete f.sessionData.chat_session_v1;
      await assert.rejects(f.wire().run.prepare(f.input), /SOURCE_CHANGED/);
      assert.equal(JSON.stringify(f.journal.read()), before);
      assert.equal(f.journal.state().namespace, "legacy");
      assert.equal(f.journal.state().admission, 0);
    } finally {
      await f.close();
    }
  });
}
for (const race of ["fence", "revision"]) {
  test(`resume prepare detects ${race} change during final source observation`, async () => {
    const f = await fixture();
    try {
      await validated(f);
      const wired = f.wire(),
        original = f.journal.read();
      const read = wired.port.snapshotDigest.bind(wired.port);
      wired.port.snapshotDigest = async (unit) => {
        const digest = await read(unit);
        if (unit === "MG06") {
          if (race === "fence") f.journal.fence();
          else
            f.journal.write(original.revision, {
              ...original,
              revision: original.revision + 1,
            });
        }
        return digest;
      };
      await assert.rejects(
        wired.run.prepare(f.input),
        race === "fence" ? /MIGRATION_FENCE/ : /MIGRATION_CAS/,
      );
      assert.equal(
        f.journal.read().revision,
        original.revision + (race === "revision" ? 1 : 0),
      );
      assert.equal(f.journal.state().admission, 0);
      assert.deepEqual(
        f.journal.read().acknowledgments,
        original.acknowledgments,
      );
    } finally {
      await f.close();
    }
  });
}
test("terminal journal observation does not recopy or reinterpret post-completion source edits", async () => {
  const f = await fixture();
  try {
    const wired = await validated(f);
    await wired.run.acknowledge();
    await wired.run.commit();
    f.localData.provider_settings = {};
    const committed = JSON.stringify(f.journal.read());
    assert.equal((await wired.run.prepare(f.input)).phase, "committed");
    assert.equal(JSON.stringify(f.journal.read()), committed);
    await wired.run.rollback();
    const rolledBack = JSON.stringify(f.journal.read());
    assert.equal((await wired.run.prepare(f.input)).phase, "rolled_back");
    assert.equal(JSON.stringify(f.journal.read()), rolledBack);
    assert.equal(f.counts().cancellations, 1);
  } finally {
    await f.close();
  }
});
