import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  providerSettings,
  migrationDigest,
  MigrationJournal,
  migrationEndpoint,
} from "../../../dist/s36/transport.mjs";
import { fixture } from "../transport/support.mjs";
import { rawCommand } from "./support.mjs";
test(
  "disconnect during secret read prevents subsequent writes and final checkpoint publication",
  { timeout: 8000 },
  async () => {
    const f = await fixture(true, providerSettings());
    const { migrationEndpoint, listenLocal, stopLocal } = await import(
      "../../../dist/s36/transport.mjs"
    );
    let server, db, releaseRead;
    try {
      await f.stop();
      db = new DatabaseSync(f.dbPath);
      let readStarted,
        finished,
        context,
        writes = 0;
      const started = new Promise((resolve) => {
        readStarted = resolve;
      });
      const readGate = new Promise((resolve) => {
        releaseRead = resolve;
      });
      const handled = new Promise((resolve) => {
        finished = resolve;
      });
      const store = {
        mode: "session-only",
        async read() {
          readStarted();
          await readGate;
          return undefined;
        },
        async write() {
          writes++;
        },
      };
      const endpoint = await migrationEndpoint(db, f.config, store);
      const handler = Object.assign(
        async (command, scope) => {
          if (!command.kind.startsWith("migration.settings."))
            return endpoint(command, scope);
          context = scope;
          try {
            return await endpoint(command, scope);
          } finally {
            finished();
          }
        },
        { settingsMode: "session-only" },
      );
      server = await listenLocal(f.config.socketPath, f.config, handler);
      const client = f.client();
      const rejected = assert.rejects(
        client.settings.stage(
          "wire",
          1,
          rawCommand(f).sourceDigest,
          "session-only",
        ),
      );
      await started;
      const aborted = new Promise((resolve) =>
        context.signal.addEventListener("abort", resolve, { once: true }),
      );
      client.bridge.close();
      await rejected;
      await aborted;
      releaseRead();
      await handled;
      assert.equal(writes, 0);
      assert.equal(
        db.prepare("SELECT COUNT(*) AS n FROM mg01_settings_stage").get().n,
        0,
      );
    } finally {
      releaseRead?.();
      if (server) await stopLocal(server);
      db?.close();
      await f.close();
    }
  },
);

test("valid v1 provider settings use the same authenticated conversion/readback path", async () => {
  const current = providerSettings();
  const source = {
    schema_version: 1,
    active_provider: "primary",
    providers: { primary: current.providers.primary.config },
  };
  const f = await fixture(true, source);
  try {
    const client = f.client();
    const digest = migrationDigest({ provider_settings: source });
    const checkpoint = await client.settings.stage(
      "wire",
      1,
      digest,
      "session-only",
    );
    assert.equal(checkpoint.copied, 1);
    assert.deepEqual(
      await client.settings.validate("wire", 1, checkpoint, "session-only"),
      checkpoint,
    );
  } finally {
    await f.close();
  }
});
test("native resume check binds all six source digests, survives daemon restart and never mutates migration", async () => {
  const f = await fixture();
  const db = new DatabaseSync(f.dbPath),
    journal = new MigrationJournal(db);
  try {
    const view = journal.read(),
      before = JSON.stringify(view),
      fence = JSON.stringify(journal.state());
    const scope = { migrationId: "wire", epoch: 1, revision: view.revision };
    const source = {
      profileGuard: f.profile,
      async assertFrozen() {},
      async sourceDigest(unit) {
        return view.manifest.sourceDigests[unit];
      },
    };
    const client = f.client();
    assert.equal(
      (await client.rpc.checkResume(scope, source)).sourceMatched,
      true,
    );
    client.bridge.close();
    await f.stop();
    await f.start();
    assert.equal(
      (await f.client().rpc.checkResume(scope, source)).phase,
      "prepared",
    );
    for (const unit of Object.keys(view.manifest.sourceDigests)) {
      await assert.rejects(
        f.client().rpc.checkResume(scope, {
          ...source,
          async sourceDigest(current) {
            return current === unit
              ? "0".repeat(64)
              : source.sourceDigest(current);
          },
        }),
      );
    }
    for (const patch of [
      { migrationId: "other" },
      { epoch: 2 },
      { revision: 1 },
    ])
      await assert.rejects(
        f.client().rpc.checkResume({ ...scope, ...patch }, source),
      );
    await assert.rejects(
      f.client({ secret: "0".repeat(64) }).rpc.checkResume(scope, source),
    );
    const endpoint = await migrationEndpoint(db, f.config);
    const command = {
      ...scope,
      kind: "migration.resume.check",
      profileGuard: f.profile,
      sourceDigests: view.manifest.sourceDigests,
    };
    for (const context of [
      undefined,
      { deadline: Date.now() - 1, signal: new AbortController().signal },
      { deadline: Date.now() + 1000, signal: AbortSignal.abort() },
    ])
      await assert.rejects(endpoint(command, context), /MIGRATION_EXPIRED/);
    assert.equal(JSON.stringify(journal.read()), before);
    assert.equal(JSON.stringify(journal.state()), fence);
    await f.stop();
    await f.start(true);
    await assert.rejects(
      f.client().rpc.checkResume(scope, source),
      /MIGRATION_UNAVAILABLE/,
    );
  } finally {
    db.close();
    await f.close();
  }
});
