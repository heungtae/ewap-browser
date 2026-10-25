import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  providerSettings,
  migrationDigest,
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
