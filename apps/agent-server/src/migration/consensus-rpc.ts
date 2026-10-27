import { migrationUnits } from "../../../../packages/shared/src/migration.js";
import {
  migrationCheckpointsSchema,
  migrationConsensusResultSchema,
  type MigrationCommand,
  type MigrationRequestContext,
} from "../../../../packages/shared/src/migration-rpc.js";
import type { Journal } from "../../../../packages/shared/src/migration-types.js";
import { transaction, type Sqlite } from "../tasks/database.js";
import type { SecretStore } from "../settings/service.js";
import { MigrationJournal, manifestDigest } from "./journal.js";
import { assertCheckpointReadback } from "./checkpoint-readback.js";
import { settingsRequest } from "./settings-rpc.js";
type Command = Extract<
  MigrationCommand,
  { kind: "migration.consensus.validate" | "migration.consensus.acknowledge" }
>;
export async function consensusRequest(
  db: Sqlite,
  profileGuard: string,
  store: SecretStore,
  command: Command,
  context?: MigrationRequestContext,
) {
  const journal = new MigrationJournal(db);
  const guard = (view: Journal) => {
    if (!context || context.signal.aborted || Date.now() >= context.deadline)
      throw new Error("MIGRATION_EXPIRED");
    const state = journal.state(),
      digest = manifestDigest(view.manifest, view.stores);
    if (
      command.profileGuard !== profileGuard ||
      view.manifest.profileGuard !== profileGuard ||
      state.admission !== 0 ||
      state.namespace !== "legacy" ||
      state.epoch !== command.epoch ||
      view.epoch !== command.epoch ||
      view.manifest.migrationId !== command.migrationId ||
      !["copying", "validated"].includes(view.phase) ||
      command.manifestDigest !== digest
    )
      throw new Error("MIGRATION_CONSENSUS_SCOPE");
    migrationCheckpointsSchema.parse(view.stores);
    for (const unit of migrationUnits)
      if (
        command.sourceDigests[unit] !== view.manifest.sourceDigests[unit] ||
        view.stores[unit]!.sourceDigest !== command.sourceDigests[unit]
      )
        throw new Error("SOURCE_CHANGED");
    if (
      Object.values(view.acknowledgments).some((ack) => ack !== digest) ||
      (view.phase === "copying" && Object.keys(view.acknowledgments).length)
    )
      throw new Error("MIGRATION_ACK_MISMATCH");
    if (command.kind === "migration.consensus.acknowledge") {
      const ack = command.ack;
      if (
        view.phase !== "validated" ||
        ack.owner !== "extension" ||
        ack.profileGuard !== profileGuard ||
        ack.migrationId !== command.migrationId ||
        ack.epoch !== view.epoch ||
        ack.manifestDigest !== digest
      )
        throw new Error("MIGRATION_ACK_MISMATCH");
    }
    const duplicate =
      view.revision === command.revision + 1 &&
      view.phase === "validated" &&
      (command.kind === "migration.consensus.validate"
        ? Object.keys(view.acknowledgments).length === 0
        : view.acknowledgments.extension === digest &&
          view.acknowledgments.backend === digest);
    if (view.revision !== command.revision && !duplicate)
      throw new Error("MIGRATION_CAS");
    assertCheckpointReadback(db, view);
  };
  const initial = transaction(db, () => {
    const view = journal.read();
    if (!view) throw new Error("MIGRATION_MISSING");
    guard(view);
    return view;
  });
  // Read-only credential/source validation. Raw source lives only in this request.
  await settingsRequest(
    db,
    profileGuard,
    store,
    {
      kind: "migration.settings.validate",
      profileGuard,
      migrationId: command.migrationId,
      epoch: command.epoch,
      sourceDigest: command.sourceDigests.MG01,
      secretMode: command.secretMode,
      source: command.source,
      checkpoint: initial.stores.MG01!,
    },
    context,
  );
  const view = journal.update((current) => {
    guard(current);
    if (current.revision !== initial.revision) throw new Error("MIGRATION_CAS");
    if (command.kind === "migration.consensus.validate")
      return current.phase === "validated"
        ? current
        : {
            ...current,
            revision: current.revision + 1,
            phase: "validated",
          };
    const digest = manifestDigest(current.manifest, current.stores);
    if (
      current.acknowledgments.extension === digest &&
      current.acknowledgments.backend === digest
    )
      return current;
    return {
      ...current,
      revision: current.revision + 1,
      acknowledgments: { extension: digest, backend: digest },
    };
  });
  return migrationConsensusResultSchema.parse({
    schema: "wca.migration-consensus/v1",
    profileGuard,
    migrationId: view.manifest.migrationId,
    epoch: view.epoch,
    revision: view.revision,
    phase: view.phase,
    manifestDigest: manifestDigest(view.manifest, view.stores),
    stores: view.stores,
    acknowledgments: view.acknowledgments,
  });
}
