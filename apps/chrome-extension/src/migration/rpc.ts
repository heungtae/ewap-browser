import { parseMigrationCommand } from "../../../../packages/policy-engine/src/migration-rpc.js";
import {
  mg02AckSchema,
  type PolicyMirrorPort,
} from "../../../../packages/policy-engine/src/migration-contract.js";
import {
  migrationStatusSchema,
  migrationResumeScopeSchema,
  migrationResumeResultSchema,
  type MigrationCommand,
} from "../../../../packages/shared/src/migration-rpc.js";
import { migrationDigest } from "./migration-digest.js";
import { migrationUnits } from "../../../../packages/shared/src/migration.js";
import type { BrowserMigrationPort } from "../../../../packages/shared/src/migration-ports.js";
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
    async checkResume(
      raw: { migrationId: string; epoch: number; revision: number },
      source: Pick<
        BrowserMigrationPort,
        "profileGuard" | "assertFrozen" | "sourceDigest"
      >,
    ) {
      if (source.profileGuard !== profileGuard)
        throw new Error("MIGRATION_PROFILE");
      const scope = migrationResumeScopeSchema.parse({
        profileGuard,
        migrationId: raw.migrationId,
        epoch: raw.epoch,
        revision: raw.revision,
      });
      const observe = async () => {
        await source.assertFrozen(scope.epoch);
        const digests = {} as Record<(typeof migrationUnits)[number], string>;
        for (const unit of migrationUnits)
          digests[unit] = await source.sourceDigest(unit, scope.epoch);
        await source.assertFrozen(scope.epoch);
        return digests;
      };
      const sourceDigests = await observe();
      const result = migrationResumeResultSchema.parse(
        await call({
          kind: "migration.resume.check",
          ...scope,
          sourceDigests,
        }),
      );
      if (
        result.profileGuard !== profileGuard ||
        result.migrationId !== scope.migrationId ||
        result.epoch !== scope.epoch ||
        result.revision !== scope.revision
      )
        throw new Error("MIGRATION_RESUME_SCOPE");
      const current = await observe();
      if (migrationUnits.some((unit) => current[unit] !== sourceDigests[unit]))
        throw new Error("SOURCE_CHANGED");
      return result;
    },
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
