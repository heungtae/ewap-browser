import { parseMigrationCommand } from "../../../../packages/policy-engine/src/migration-rpc.js";
import {
  migrationSettingsAckSchema,
  migrationStatusSchema,
  type MigrationCommand,
} from "../../../../packages/shared/src/migration-rpc.js";
import type { Checkpoint } from "../../../../packages/shared/src/migration-types.js";
import type { FrozenSource } from "./local-staging.js";
import { migrationDigest } from "./migration-digest.js";
export function settingsTransport(
  profileGuard: string,
  source: FrozenSource,
  request: (command: MigrationCommand) => Promise<unknown>,
) {
  async function call(
    kind: "migration.settings.stage" | "migration.settings.validate",
    migrationId: string,
    epoch: number,
    sourceDigest: string,
    secretMode: "session-only" | "os-store",
    expected?: Checkpoint,
  ) {
    const capture = async () => {
      await source.assertFrozen(epoch);
      const raw = await source.get(["provider_settings"]);
      await source.assertFrozen(epoch);
      if (
        migrationDigest({ provider_settings: raw.provider_settings }) !==
        sourceDigest
      )
        throw new Error("SOURCE_CHANGED");
      return raw.provider_settings;
    };
    await source.assertFrozen(epoch);
    const status = migrationStatusSchema.parse(
      await request({ kind: "migration.status", profileGuard }),
    );
    if (
      status.profileGuard !== profileGuard ||
      status.settingsMode !== secretMode ||
      status.epoch !== epoch ||
      status.migration?.epoch !== epoch ||
      status.migration?.migrationId !== migrationId
    )
      throw new Error("MG01_TRANSFER_PREFLIGHT");
    const raw = await capture();
    const command = parseMigrationCommand({
      kind,
      profileGuard,
      migrationId,
      epoch,
      sourceDigest,
      secretMode,
      source: raw,
      ...(expected ? { checkpoint: expected } : {}),
    });
    const ack = migrationSettingsAckSchema.parse(await request(command));
    if (
      ack.profileGuard !== profileGuard ||
      ack.migrationId !== migrationId ||
      ack.epoch !== epoch ||
      ack.secretMode !== secretMode ||
      ack.checkpoint.sourceDigest !== sourceDigest ||
      (expected &&
        migrationDigest(ack.checkpoint) !== migrationDigest(expected))
    )
      throw new Error("MG01_ACK_MISMATCH");
    await capture();
    return ack.checkpoint;
  }
  return {
    stage: (
      id: string,
      epoch: number,
      digest: string,
      mode: "session-only" | "os-store",
    ) => call("migration.settings.stage", id, epoch, digest, mode),
    validate: (
      id: string,
      epoch: number,
      checkpoint: Checkpoint,
      mode: "session-only" | "os-store",
    ) =>
      call(
        "migration.settings.validate",
        id,
        epoch,
        checkpoint.sourceDigest,
        mode,
        checkpoint,
      ),
  };
}
