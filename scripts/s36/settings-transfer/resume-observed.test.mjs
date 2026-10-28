import { test } from "node:test";
import assert from "node:assert/strict";
import { preparedConsensus } from "./consensus-support.mjs";
import {
  resumeObservedOwner,
  parseMigrationCommand,
} from "../../../dist/s36/transport.mjs";
const events = () => {
  const listeners = new Set();
  return {
    listeners,
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn),
  };
};
test("actual native snapshot and six-source readback rebind without reading stored ACK or changing the journal", async () => {
  const p = await preparedConsensus();
  try {
    const original = JSON.stringify(p.journal.read()),
      sourceEvents = events();
    const owner = {
      ...p.browser,
      async acknowledge() {
        throw new Error("HISTORICAL_ACK_USED");
      },
      async verifyAcknowledgment() {
        throw new Error("HISTORICAL_ACK_USED");
      },
    };
    const bind = () => {
      const c = p.f.client();
      return resumeObservedOwner({
        view: p.journal.read(),
        owner,
        local: p.source,
        session: p.source,
        events: sourceEvents,
        mode: "session-only",
        request: (value) => c.bridge.request(value),
      });
    };
    const first = await bind();
    assert.equal(first.phase, "copying");
    first.dispose();
    assert.equal(sourceEvents.listeners.size, 0);
    assert.equal(JSON.stringify(p.journal.read()), original);
    await p.f.stop();
    await p.f.start();
    await assert.rejects(bind());
    assert.equal(sourceEvents.listeners.size, 0);
    await p.f
      .client()
      .settings.stage(
        "wire",
        1,
        p.journal.read().manifest.sourceDigests.MG01,
        "session-only",
      );
    const resumed = await bind();
    resumed.dispose();
    assert.equal(JSON.stringify(p.journal.read()), original);
    assert.equal(p.journal.state().namespace, "legacy");
    assert.equal(p.journal.state().admission, 0);
  } finally {
    await p.close();
  }
});
test("snapshot rejects stale scope or mismatched manifest/store digest without exposing ACKs", async () => {
  const p = await preparedConsensus();
  try {
    const command = parseMigrationCommand({
      kind: "migration.resume.snapshot",
      profileGuard: p.f.profile,
      migrationId: "wire",
      epoch: 1,
      revision: 1,
      manifestDigest: p.digest,
    });
    const result = await p.f.client().bridge.request(command);
    assert.equal(result.phase, "copying");
    assert.equal(result.manifestDigest, p.digest);
    assert.equal(Object.hasOwn(result, "acknowledgments"), false);
    for (const patch of [
      { profileGuard: "0".repeat(64) },
      { migrationId: "other" },
      { epoch: 2 },
      { revision: 0 },
      { manifestDigest: "0".repeat(64) },
    ])
      await assert.rejects(
        p.f
          .client()
          .bridge.request(parseMigrationCommand({ ...command, ...patch })),
      );
    const { endpoint } = await p.direct();
    for (const context of [
      undefined,
      { deadline: Date.now() - 1, signal: new AbortController().signal },
      { deadline: Date.now() + 1000, signal: AbortSignal.abort() },
    ])
      await assert.rejects(endpoint(command, context), /MIGRATION_EXPIRED/);
    assert.equal(p.journal.read().revision, 1);
    assert.deepEqual(p.journal.read().acknowledgments, {});
  } finally {
    await p.close();
  }
});
test("validated historical backend ACK metadata is never returned or used for rebind", async () => {
  const p = await preparedConsensus();
  try {
    const before = p.journal.read();
    p.journal.write(before.revision, {
      ...before,
      revision: before.revision + 1,
      phase: "validated",
      acknowledgments: { extension: p.digest, backend: p.digest },
    });
    const view = p.journal.read(),
      c = p.f.client(),
      sourceEvents = events();
    const command = parseMigrationCommand({
      kind: "migration.resume.snapshot",
      profileGuard: p.f.profile,
      migrationId: "wire",
      epoch: 1,
      revision: view.revision,
      manifestDigest: p.digest,
    });
    const result = await c.bridge.request(command);
    assert.equal(result.phase, "validated");
    assert.equal(Object.hasOwn(result, "acknowledgments"), false);
    const owner = {
      ...p.browser,
      async acknowledge() {
        throw new Error("HISTORICAL_ACK_USED");
      },
      async verifyAcknowledgment() {
        throw new Error("HISTORICAL_ACK_USED");
      },
    };
    const rebound = await resumeObservedOwner({
      view,
      owner,
      local: p.source,
      session: p.source,
      events: sourceEvents,
      mode: "session-only",
      request: (value) => c.bridge.request(value),
    });
    rebound.dispose();
    assert.deepEqual(p.journal.read(), view);
    assert.equal(sourceEvents.listeners.size, 0);
  } finally {
    await p.close();
  }
});
