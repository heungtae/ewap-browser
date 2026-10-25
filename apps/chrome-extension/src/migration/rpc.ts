import { parseMigrationCommand } from "../../../../packages/policy-engine/src/migration-rpc.js";
import {
  mg02AckSchema,
  type PolicyMirrorPort,
} from "../../../../packages/policy-engine/src/migration-contract.js";
import {
  migrationStatusSchema,
  type MigrationCommand,
} from "../../../../packages/shared/src/migration-rpc.js";
import { migrationDigest } from "./migration-digest.js";
export function migrationTransport(
  profileGuard: string,
  request: (value: MigrationCommand) => Promise<unknown>,
) {
  const call = (value: MigrationCommand) =>
    request(parseMigrationCommand(value));
  const port: PolicyMirrorPort = {
    async put(value) {
      if (value.profileGuard !== profileGuard)
        throw new Error("MIGRATION_PROFILE");
      const ack = mg02AckSchema.parse(
        await call({ kind: "migration.policy.put", profileGuard, value }),
      );
      if (
        ack.profileGuard !== profileGuard ||
        ack.migrationId !== value.migrationId ||
        ack.epoch !== value.epoch ||
        ack.policyRevision !== value.policyRevision ||
        ack.manifestDigest !== migrationDigest(value)
      )
        throw new Error("MIGRATION_ACK_MISMATCH");
      return ack;
    },
    async read(profile, migrationId, epoch) {
      if (profile !== profileGuard) throw new Error("MIGRATION_PROFILE");
      const value = await call({
        kind: "migration.policy.read",
        profileGuard,
        migrationId,
        epoch,
      });
      if (value === null) return undefined;
      const ack = mg02AckSchema.parse(value);
      if (
        ack.profileGuard !== profile ||
        ack.migrationId !== migrationId ||
        ack.epoch !== epoch
      )
        throw new Error("MIGRATION_ACK_MISMATCH");
      return ack;
    },
  };
  return {
    port,
    async status() {
      const value = migrationStatusSchema.parse(
        await call({ kind: "migration.status", profileGuard }),
      );
      if (value.profileGuard !== profileGuard)
        throw new Error("MIGRATION_PROFILE");
      return value;
    },
  };
}
