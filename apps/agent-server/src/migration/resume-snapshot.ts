import {
  migrationResumeSnapshotSchema,
  type MigrationCommand,
  type MigrationRequestContext,
} from "../../../../packages/shared/src/migration-rpc.js";
import type { Sqlite } from "../tasks/database.js";
import { transaction } from "../tasks/database.js";
import { MigrationJournal, manifestDigest } from "./journal.js";
type Command = Extract<MigrationCommand, { kind: "migration.resume.snapshot" }>;
// Read-only binding to persisted metadata; never returns historical ACKs.
export function resumeSnapshot(
  db: Sqlite,
  profileGuard: string,
  command: Command,
  context?: MigrationRequestContext,
) {
  const journal = new MigrationJournal(db);
  return transaction(db, () => {
    if (!context || context.signal.aborted || Date.now() >= context.deadline)
      throw new Error("MIGRATION_EXPIRED");
    const view = journal.read(),
      state = journal.state();
    if (
      !view ||
      command.profileGuard !== profileGuard ||
      view.manifest.profileGuard !== profileGuard ||
      state.admission !== 0 ||
      state.namespace !== "legacy" ||
      state.epoch !== command.epoch ||
      view.epoch !== command.epoch ||
      view.revision !== command.revision ||
      view.manifest.migrationId !== command.migrationId ||
      !["copying", "validated"].includes(view.phase) ||
      manifestDigest(view.manifest, view.stores) !== command.manifestDigest
    )
      throw new Error("MIGRATION_RESUME_SNAPSHOT_SCOPE");
    return migrationResumeSnapshotSchema.parse({
      schema: "wca.migration-resume-snapshot/v1",
      profileGuard,
      migrationId: command.migrationId,
      epoch: view.epoch,
      revision: view.revision,
      phase: view.phase,
      manifestDigest: command.manifestDigest,
    });
  });
}
