import {
  migrationJournalSchema,
  migrationManifestSchema,
  migrationUnits,
} from "../../../../packages/shared/src/migration.js";
import {
  migrationCheckpointsSchema,
  migrationCheckpointResultSchema,
  migrationResumeScopeSchema,
  type MigrationCommand,
} from "../../../../packages/shared/src/migration-rpc.js";
import type {
  Journal,
  Manifest,
  Checkpoint,
} from "../../../../packages/shared/src/migration-types.js";
import type { BrowserMigrationPort } from "../../../../packages/shared/src/migration-ports.js";
import { parseMigrationCommand } from "../../../../packages/policy-engine/src/migration-rpc.js";
import { migrationDigest } from "./migration-digest.js";
type Scope = { migrationId: string; epoch: number; revision: number };
export function checkpointTransport(
  profileGuard: string,
  request: (value: MigrationCommand) => Promise<unknown>,
  browser: BrowserMigrationPort,
  validateSettings: (
    id: string,
    epoch: number,
    checkpoint: Checkpoint,
  ) => Promise<boolean>,
) {
  const scope = (raw: Scope) =>
    migrationResumeScopeSchema.parse({
      profileGuard,
      migrationId: raw.migrationId,
      epoch: raw.epoch,
      revision: raw.revision,
    });
  const manifestFor = (raw: Manifest, id: string) => {
    const manifest = migrationManifestSchema.parse(raw) as Manifest;
    if (
      browser.profileGuard !== profileGuard ||
      manifest.profileGuard !== profileGuard ||
      manifest.migrationId !== id
    )
      throw new Error("MIGRATION_CHECKPOINT_SCOPE");
    return manifest;
  };
  const validate = async (manifest: Manifest, current: Scope, raw: unknown) => {
    const stores = migrationCheckpointsSchema.parse(raw);
    await browser.assertFrozen(current.epoch);
    for (const unit of migrationUnits) {
      const checkpoint = stores[unit];
      if (
        checkpoint.sourceDigest !== manifest.sourceDigests[unit] ||
        (await browser.sourceDigest(unit, current.epoch)) !==
          checkpoint.sourceDigest ||
        !(unit === "MG01"
          ? await validateSettings(
              current.migrationId,
              current.epoch,
              checkpoint,
            )
          : await browser.validate(
              unit,
              current.migrationId,
              current.epoch,
              checkpoint,
            ))
      )
        throw new Error("MIGRATION_CHECKPOINT_READBACK");
    }
    await browser.assertFrozen(current.epoch);
    return stores;
  };
  const decode = (
    raw: unknown,
    manifest: Manifest,
    current: Scope,
    revisions: readonly number[],
  ) => {
    const result = migrationCheckpointResultSchema.parse(raw);
    if (
      result.profileGuard !== profileGuard ||
      result.migrationId !== current.migrationId ||
      result.epoch !== current.epoch ||
      !revisions.includes(result.revision) ||
      result.manifestDigest !==
        migrationDigest({ manifest, stores: result.stores })
    )
      throw new Error("MIGRATION_CHECKPOINT_SCOPE");
    return result;
  };
  return {
    async publish(raw: Journal, expectedRevision: number) {
      const candidate = migrationJournalSchema.parse(raw) as Journal;
      if (
        candidate.phase !== "validated" ||
        Object.keys(candidate.acknowledgments).length
      )
        throw new Error("MIGRATION_CHECKPOINT_SCOPE");
      const current = scope({
        migrationId: candidate.manifest.migrationId,
        epoch: candidate.epoch,
        revision: expectedRevision,
      });
      const manifest = manifestFor(candidate.manifest, current.migrationId);
      const stores = await validate(manifest, current, candidate.stores);
      const result = decode(
        await request(
          parseMigrationCommand({
            kind: "migration.checkpoints.publish",
            ...current,
            sourceDigests: manifest.sourceDigests,
            stores,
          }),
        ),
        manifest,
        current,
        [expectedRevision, expectedRevision + 1],
      );
      if (migrationDigest(result.stores) !== migrationDigest(stores))
        throw new Error("MIGRATION_CHECKPOINT_SCOPE");
      await validate(manifest, current, result.stores);
      return result;
    },
    async read(raw: Manifest, input: Scope) {
      const current = scope(input),
        manifest = manifestFor(raw, current.migrationId);
      await browser.assertFrozen(current.epoch);
      const result = decode(
        await request(
          parseMigrationCommand({
            kind: "migration.checkpoints.read",
            ...current,
          }),
        ),
        manifest,
        current,
        [current.revision],
      );
      await validate(manifest, current, result.stores);
      return result;
    },
  };
}
