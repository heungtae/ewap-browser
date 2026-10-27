import { migrationUnits } from "../../../../packages/shared/src/migration.js";
import {
  migrationCheckpointResultSchema,
  type MigrationCommand,
  type MigrationRequestContext,
} from "../../../../packages/shared/src/migration-rpc.js";
import type { Journal } from "../../../../packages/shared/src/migration-types.js";
import type { Sqlite } from "../tasks/database.js";
import { transaction } from "../tasks/database.js";
import { MigrationJournal, manifestDigest } from "./journal.js";
import { assertCheckpointReadback } from "./checkpoint-readback.js";
import { settingsDigest } from "./mg01-source.js";
type Command = Extract<
  MigrationCommand,
  {
    kind: "migration.checkpoints.publish" | "migration.checkpoints.read";
  }
>;
// Staging metadata only. Never validates browser stores, publishes owner ACKs or activates.
export function checkpointsRequest(
  db: Sqlite,
  profileGuard: string,
  command: Command,
  context?: MigrationRequestContext,
) {
  const journal = new MigrationJournal(db);
  const guard = (view: Journal) => {
    const state = journal.state();
    if (!context || context.signal.aborted || Date.now() >= context.deadline)
      throw new Error("MIGRATION_EXPIRED");
    if (
      command.profileGuard !== profileGuard ||
      view.manifest.profileGuard !== profileGuard ||
      state.admission !== 0 ||
      state.namespace !== "legacy" ||
      state.epoch !== command.epoch ||
      view.epoch !== command.epoch ||
      view.manifest.migrationId !== command.migrationId ||
      !["prepared", "copying"].includes(view.phase) ||
      Object.keys(view.acknowledgments).length !== 0
    )
      throw new Error("MIGRATION_CHECKPOINT_SCOPE");
  };
  const result = (view: Journal) =>
    migrationCheckpointResultSchema.parse({
      schema: "wca.migration-checkpoints/v1",
      profileGuard,
      migrationId: view.manifest.migrationId,
      epoch: view.epoch,
      revision: view.revision,
      phase: view.phase,
      stores: view.stores,
      manifestDigest: manifestDigest(view.manifest, view.stores),
    });
  if (command.kind === "migration.checkpoints.read")
    return transaction(db, () => {
      const view = journal.read();
      if (!view) throw new Error("MIGRATION_MISSING");
      guard(view);
      if (view.revision !== command.revision) throw new Error("MIGRATION_CAS");
      return result(view);
    });
  const view = journal.update((current) => {
    guard(current);
    for (const unit of migrationUnits) {
      if (
        command.sourceDigests[unit] !== current.manifest.sourceDigests[unit] ||
        command.stores[unit].sourceDigest !==
          current.manifest.sourceDigests[unit]
      )
        throw new Error("SOURCE_CHANGED");
      if (
        current.stores[unit] &&
        settingsDigest(current.stores[unit]) !==
          settingsDigest(command.stores[unit])
      )
        throw new Error("MIGRATION_CHECKPOINT_CONFLICT");
    }
    assertCheckpointReadback(db, { ...current, stores: command.stores });
    const same =
      current.phase === "copying" &&
      settingsDigest(current.stores) === settingsDigest(command.stores);
    if (current.revision !== command.revision) {
      if (same && current.revision === command.revision + 1) return current;
      throw new Error("MIGRATION_CAS");
    }
    if (same) return current;
    return {
      ...current,
      revision: current.revision + 1,
      phase: "copying",
      stores: command.stores,
    };
  });
  return result(view);
}
