import { test } from "node:test";
import assert from "node:assert/strict";
import { preparedConsensus } from "./consensus-support.mjs";
import { fixture } from "../transport/support.mjs";
test("consensus is unavailable without explicit settings-store composition", async () => {
  const p = await preparedConsensus(),
    f = await fixture(true, undefined, false);
  try {
    await assert.rejects(
      f.client().bridge.request(p.command()),
      /MIGRATION_UNAVAILABLE/,
    );
  } finally {
    await f.close();
    await p.close();
  }
});
test("actual native validation and both-owner ACK persist once; restart requires fresh credentials and never activates", async () => {
  const p = await preparedConsensus();
  try {
    const validated = await p.client().validate(p.journal.read());
    assert.equal(validated.revision, 2);
    assert.equal(validated.phase, "validated");
    assert.deepEqual(validated.acknowledgments, {});
    const validateRetry = p.command("migration.consensus.validate", {
      revision: 1,
    });
    assert.equal(
      (await p.f.client().bridge.request(validateRetry)).revision,
      2,
    );
    const ackRetry = p.command("migration.consensus.acknowledge");
    const agreed = await p.client().acknowledge(validated);
    assert.equal(agreed.revision, 3);
    assert.deepEqual(agreed.acknowledgments, {
      extension: p.digest,
      backend: p.digest,
    });
    assert.equal((await p.f.client().bridge.request(ackRetry)).revision, 3);
    await p.f.stop();
    await p.f.start();
    await assert.rejects(p.client().validate(p.journal.read()));
    assert.deepEqual(p.journal.read().acknowledgments, agreed.acknowledgments);
    await p.f
      .client()
      .settings.stage(
        "wire",
        1,
        agreed.manifest.sourceDigests.MG01,
        "session-only",
      );
    assert.equal((await p.client().validate(p.journal.read())).revision, 3);
    assert.equal((await p.client().acknowledge(p.journal.read())).revision, 3);
    assert.equal(p.journal.state().namespace, "legacy");
    assert.equal(p.journal.state().admission, 0);
    assert.doesNotMatch(
      JSON.stringify(p.journal.read()),
      /PRIVATE_API_CANARY|PRIVATE_HEADER_CANARY/,
    );
  } finally {
    await p.close();
  }
});
test("wrong scope, sources, mode and browser ACK cannot validate or create agreement", async () => {
  const p = await preparedConsensus();
  try {
    const before = JSON.stringify(p.journal.read());
    for (const patch of [
      { profileGuard: "0".repeat(64) },
      { migrationId: "other" },
      { epoch: 2 },
      { revision: 0 },
      { manifestDigest: "0".repeat(64) },
      { secretMode: "os-store" },
    ])
      await assert.rejects(
        p.f
          .client()
          .bridge.request(p.command("migration.consensus.validate", patch)),
      );
    for (const unit of Object.keys(p.command().sourceDigests))
      await assert.rejects(
        p.f.client().bridge.request(
          p.command("migration.consensus.validate", {
            sourceDigests: {
              ...p.command().sourceDigests,
              [unit]: "0".repeat(64),
            },
          }),
        ),
      );
    await assert.rejects(
      p.f.client().bridge.request(p.command("migration.consensus.acknowledge")),
    );
    assert.equal(JSON.stringify(p.journal.read()), before);
    await p.client().validate(p.journal.read());
    const validated = JSON.stringify(p.journal.read());
    for (const patch of [
      { profileGuard: "0".repeat(64) },
      { migrationId: "other" },
      { epoch: 2 },
      { manifestDigest: "0".repeat(64) },
    ])
      await assert.rejects(
        p.f.client().bridge.request(
          p.command("migration.consensus.acknowledge", {
            ack: { ...p.ack, ...patch },
          }),
        ),
      );
    assert.equal(JSON.stringify(p.journal.read()), validated);
  } finally {
    await p.close();
  }
});
test("missing context, damaged backend mirror and terminal journal leave validation closed", async () => {
  const p = await preparedConsensus();
  try {
    const { endpoint } = await p.direct(),
      before = JSON.stringify(p.journal.read());
    for (const context of [
      undefined,
      { deadline: Date.now() - 1, signal: new AbortController().signal },
      { deadline: Date.now() + 1000, signal: AbortSignal.abort() },
    ])
      await assert.rejects(endpoint(p.command(), context), /MIGRATION_EXPIRED/);
    p.db.exec("DELETE FROM mg02_policy_mirror");
    await assert.rejects(p.f.client().bridge.request(p.command()));
    assert.equal(JSON.stringify(p.journal.read()), before);
    const current = p.journal.read();
    p.journal.write(current.revision, {
      ...current,
      revision: current.revision + 1,
      phase: "rolled_back",
    });
    const terminal = JSON.stringify(p.journal.read());
    await assert.rejects(p.f.client().bridge.request(p.command()));
    assert.equal(JSON.stringify(p.journal.read()), terminal);
  } finally {
    await p.close();
  }
});
