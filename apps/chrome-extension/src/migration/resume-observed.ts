import { migrationJournalSchema } from "../../../../packages/shared/src/migration.js";
import {
  migrationResumeSnapshotSchema,
  type MigrationCommand,
} from "../../../../packages/shared/src/migration-rpc.js";
import type { Journal } from "../../../../packages/shared/src/migration-types.js";
import type { BrowserMigrationPort } from "../../../../packages/shared/src/migration-ports.js";
import { parseMigrationCommand } from "../../../../packages/policy-engine/src/migration-rpc.js";
import { migrationDigest } from "./migration-digest.js";
import { migrationTransport } from "./rpc.js";
import { settingsTransport } from "./settings-rpc.js";
import { checkpointTransport } from "./checkpoints-rpc.js";
import { observeMigrationOwner } from "./observed-owner.js";
import type { FrozenSource } from "./local-staging.js";
import type { StorageChanges } from "./source-watch.js";

// Caller supplies freshly established freeze/drain and explicit current pairing.
// Retained ACK metadata is never read or used to establish readiness.
export async function resumeObservedOwner(input: {
  view: Journal;
  owner: BrowserMigrationPort;
  local: FrozenSource;
  session: FrozenSource;
  events: StorageChanges;
  mode: "session-only" | "os-store";
  request: (command: MigrationCommand) => Promise<unknown>;
}) {
  const view = migrationJournalSchema.parse(input.view) as Journal;
  const profileGuard = view.manifest.profileGuard;
  if (
    !profileGuard ||
    input.owner.profileGuard !== profileGuard ||
    !["copying", "validated"].includes(view.phase)
  )
    throw new Error("MIGRATION_RESUME_SCOPE");
  const observed = await observeMigrationOwner(
    input.owner,
    input.local,
    input.session,
    input.events,
    view.epoch,
  );
  try {
    const scope = {
      migrationId: view.manifest.migrationId,
      epoch: view.epoch,
      revision: view.revision,
    };
    const digest = migrationDigest({
      manifest: view.manifest,
      stores: view.stores,
    });
    const rpc = migrationTransport(profileGuard, input.request);
    const settings = settingsTransport(
      profileGuard,
      observed.local,
      input.request,
    );
    const checkpoints = checkpointTransport(
      profileGuard,
      input.request,
      observed.owner,
      async (id, epoch, cp) => {
        await settings.validate(id, epoch, cp, input.mode);
        return true;
      },
    );
    const binding = async () => {
      const status = await rpc.status();
      if (
        status.namespace !== "legacy" ||
        status.admission !== false ||
        status.settingsMode !== input.mode ||
        status.epoch !== scope.epoch ||
        status.migration?.migrationId !== scope.migrationId ||
        status.migration.epoch !== scope.epoch ||
        status.migration.revision !== scope.revision ||
        status.migration.phase !== view.phase
      )
        throw new Error("MIGRATION_RESUME_SCOPE");
      const snapshot = migrationResumeSnapshotSchema.parse(
        await input.request(
          parseMigrationCommand({
            kind: "migration.resume.snapshot",
            profileGuard,
            ...scope,
            manifestDigest: digest,
          }),
        ),
      );
      if (
        snapshot.profileGuard !== profileGuard ||
        snapshot.migrationId !== scope.migrationId ||
        snapshot.epoch !== scope.epoch ||
        snapshot.revision !== scope.revision ||
        snapshot.phase !== view.phase ||
        snapshot.manifestDigest !== digest
      )
        throw new Error("MIGRATION_RESUME_SCOPE");
    };
    await binding();
    await checkpoints.validateStores(view.manifest, scope, view.stores);
    await rpc.checkResume(scope, observed.owner);
    await binding();
    await checkpoints.validateStores(view.manifest, scope, view.stores);
    await rpc.checkResume(scope, observed.owner);
    await binding();
    await observed.owner.assertFrozen(view.epoch);
    return { ...observed, scope, phase: view.phase };
  } catch (error) {
    observed.dispose();
    throw error;
  }
}
