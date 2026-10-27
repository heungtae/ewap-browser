import { settingsRequest } from "./settings-rpc.js";
import { checkpointsRequest } from "./checkpoints-rpc.js";
import type { SecretStore } from "../settings/service.js";
import { parseMigrationCommand } from "../../../../packages/policy-engine/src/migration-rpc.js";
import {
  migrationProfileGuard,
  migrationStatusSchema,
  migrationResumeResultSchema,
  type MigrationRequestContext,
} from "../../../../packages/shared/src/migration-rpc.js";
import type { Sqlite } from "../tasks/database.js";
import type { Pairing } from "../ipc/auth.js";
import { transaction } from "../tasks/database.js";
import { MigrationJournal } from "./journal.js";
import { SqlitePolicyMirror } from "./mg02-mirror.js";
import { migrationUnits } from "../../../../packages/shared/src/migration.js";
export async function migrationEndpoint(
  db: Sqlite,
  pairing: Pick<Pairing, "installationId" | "profileId">,
  settings?: SecretStore,
) {
  const profileGuard = await migrationProfileGuard(
    pairing.installationId,
    pairing.profileId,
  );
  const journal = new MigrationJournal(db);
  transaction(db, () => {
    const prior = journal.read();
    if (prior && prior.manifest.profileGuard !== profileGuard)
      throw new Error("MIGRATION_PROFILE");
    db.exec(
      "CREATE TABLE IF NOT EXISTS migration_owner (id INTEGER PRIMARY KEY CHECK(id=1), profile_guard TEXT NOT NULL)",
    );
    const old = db
      .prepare("SELECT profile_guard FROM migration_owner WHERE id=1")
      .get();
    if (old && old.profile_guard !== profileGuard)
      throw new Error("MIGRATION_PROFILE");
    if (!old)
      db.prepare("INSERT INTO migration_owner VALUES (1,?)").run(profileGuard);
  });
  const mirror = new SqlitePolicyMirror(db, profileGuard);
  const handle = async (raw: unknown, context?: MigrationRequestContext) => {
    const command = parseMigrationCommand(raw);
    if (command.profileGuard !== profileGuard)
      throw new Error("MIGRATION_PROFILE");
    const view = journal.read(),
      state = journal.state();
    if (
      state.admission !== 0 ||
      (view && view.manifest.profileGuard !== profileGuard)
    )
      throw new Error("MIGRATION_FENCE");
    if (
      command.kind === "migration.checkpoints.publish" ||
      command.kind === "migration.checkpoints.read"
    )
      return checkpointsRequest(db, profileGuard, command, context);
    if (command.kind === "migration.resume.check") {
      return transaction(db, () => {
        const view = journal.read(),
          state = journal.state();
        if (
          !context ||
          context.signal.aborted ||
          Date.now() >= context.deadline
        )
          throw new Error("MIGRATION_EXPIRED");
        if (
          !view ||
          state.admission !== 0 ||
          view.manifest.profileGuard !== profileGuard ||
          state.namespace !== "legacy" ||
          !["prepared", "copying", "validated"].includes(view.phase) ||
          view.manifest.migrationId !== command.migrationId ||
          view.epoch !== command.epoch ||
          state.epoch !== command.epoch ||
          view.revision !== command.revision
        )
          throw new Error("MIGRATION_RESUME_SCOPE");
        for (const unit of migrationUnits)
          if (command.sourceDigests[unit] !== view.manifest.sourceDigests[unit])
            throw new Error("SOURCE_CHANGED");
        // Observation only. Never publish an owner ACK or change journal/admission.
        return migrationResumeResultSchema.parse({
          schema: "wca.migration-resume-check/v1",
          profileGuard,
          migrationId: command.migrationId,
          epoch: view.epoch,
          revision: view.revision,
          phase: view.phase,
          sourceMatched: true,
        });
      });
    }
    if (command.kind === "migration.status")
      return migrationStatusSchema.parse({
        schema: "wca.migration-status/v1",
        profileGuard,
        epoch: state.epoch,
        admission: false,
        settingsMode: settings?.mode ?? null,
        namespace: state.namespace,
        migration: view
          ? {
              migrationId: view.manifest.migrationId,
              revision: view.revision,
              epoch: view.epoch,
              phase: view.phase,
            }
          : null,
      });
    if (
      command.kind === "migration.settings.stage" ||
      command.kind === "migration.settings.validate"
    ) {
      if (!settings) throw new Error("MIGRATION_SETTINGS_UNAVAILABLE");
      return settingsRequest(db, profileGuard, settings, command, context);
    }
    const epoch =
      command.kind === "migration.policy.put"
        ? command.value.epoch
        : command.epoch;
    const id =
      command.kind === "migration.policy.put"
        ? command.value.migrationId
        : command.migrationId;
    if (
      !view ||
      !(
        command.kind === "migration.policy.read"
          ? ["prepared", "copying", "validated", "committed"]
          : ["prepared", "copying", "validated"]
      ).includes(view.phase) ||
      view.epoch !== epoch ||
      state.epoch !== epoch ||
      view.manifest.migrationId !== id
    )
      throw new Error("MIGRATION_FENCE");
    if (command.kind === "migration.policy.put") {
      if (
        command.value.profileGuard !== profileGuard ||
        command.value.checkpoint.sourceDigest !==
          view.manifest.sourceDigests.MG02
      )
        throw new Error("MIGRATION_SOURCE");
      return mirror.put(command.value);
    }
    return (await mirror.read(profileGuard, id, epoch)) ?? null;
  };
  return Object.assign(handle, settings ? { settingsMode: settings.mode } : {});
}
