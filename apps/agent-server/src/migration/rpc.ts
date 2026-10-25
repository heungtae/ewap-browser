import { parseMigrationCommand } from "../../../../packages/policy-engine/src/migration-rpc.js";
import {
  migrationProfileGuard,
  migrationStatusSchema,
} from "../../../../packages/shared/src/migration-rpc.js";
import type { Sqlite } from "../tasks/database.js";
import type { Pairing } from "../ipc/auth.js";
import { transaction } from "../tasks/database.js";
import { MigrationJournal } from "./journal.js";
import { SqlitePolicyMirror } from "./mg02-mirror.js";
export async function migrationEndpoint(
  db: Sqlite,
  pairing: Pick<Pairing, "installationId" | "profileId">,
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
  return async (raw: unknown) => {
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
    if (command.kind === "migration.status")
      return migrationStatusSchema.parse({
        schema: "wca.migration-status/v1",
        profileGuard,
        epoch: state.epoch,
        admission: false,
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
}
