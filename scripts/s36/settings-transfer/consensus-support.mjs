import { DatabaseSync } from "node:sqlite";
import { fixture } from "../transport/support.mjs";
import {
  providerSettings,
  MigrationJournal,
  migrationDigest,
  parseMigrationCommand,
  consensusTransport,
  migrationEndpoint,
  SessionSecrets,
} from "../../../dist/s36/transport.mjs";
export async function preparedConsensus() {
  const f = await fixture(true, providerSettings());
  const db = new DatabaseSync(f.dbPath),
    journal = new MigrationJournal(db);
  try {
    const initial = journal.read(),
      c = f.client();
    const mg01 = await c.settings.stage(
      "wire",
      1,
      initial.manifest.sourceDigests.MG01,
      "session-only",
    );
    await f.staging.mirror("wire", 1, f.profile, c.rpc.port);
    // Native-only metadata fixtures; real Chrome supplies all six actual stores separately.
    const stores = Object.fromEntries(
      Object.keys(initial.manifest.sourceDigests).map((unit) => [
        unit,
        unit === "MG01" ? mg01 : f.checkpoint,
      ]),
    );
    await f.client().bridge.request(
      parseMigrationCommand({
        kind: "migration.checkpoints.publish",
        profileGuard: f.profile,
        migrationId: "wire",
        epoch: 1,
        revision: 0,
        sourceDigests: initial.manifest.sourceDigests,
        stores,
      }),
    );
    const digest = migrationDigest({ manifest: initial.manifest, stores });
    const ack = {
      schema: "wca.migration-ack/v1",
      owner: "extension",
      profileGuard: f.profile,
      migrationId: "wire",
      epoch: 1,
      manifestDigest: digest,
    };
    const source = {
      async get() {
        return structuredClone(f.data);
      },
      async assertFrozen() {},
    };
    const browser = {
      profileGuard: f.profile,
      async assertFrozen() {},
      async sourceDigest(unit) {
        return initial.manifest.sourceDigests[unit];
      },
      async validate() {
        return true;
      },
      async acknowledge() {
        return ack;
      },
      async verifyAcknowledgment() {
        return true;
      },
    };
    const command = (kind = "migration.consensus.validate", patch = {}) =>
      parseMigrationCommand({
        kind,
        profileGuard: f.profile,
        migrationId: "wire",
        epoch: 1,
        revision: journal.read().revision,
        sourceDigests: initial.manifest.sourceDigests,
        manifestDigest: digest,
        secretMode: "session-only",
        source: f.data.provider_settings,
        ...(kind === "migration.consensus.acknowledge" ? { ack } : {}),
        ...patch,
      });
    const client = () => {
      const native = f.client();
      return consensusTransport(
        f.profile,
        (value) => native.bridge.request(value),
        browser,
        source,
        "session-only",
      );
    };
    const direct = async () => {
      const store = new SessionSecrets(),
        endpoint = await migrationEndpoint(db, f.config, store);
      await endpoint(
        parseMigrationCommand({
          kind: "migration.settings.stage",
          profileGuard: f.profile,
          migrationId: "wire",
          epoch: 1,
          sourceDigest: initial.manifest.sourceDigests.MG01,
          secretMode: "session-only",
          source: f.data.provider_settings,
        }),
        { deadline: Date.now() + 10000, signal: new AbortController().signal },
      );
      return { store, endpoint };
    };
    return {
      f,
      db,
      journal,
      command,
      client,
      ack,
      digest,
      direct,
      async close() {
        db.close();
        await f.close();
      },
    };
  } catch (error) {
    db.close();
    await f.close();
    throw error;
  }
}
