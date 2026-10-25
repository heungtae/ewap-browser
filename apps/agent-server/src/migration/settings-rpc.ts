import {
  migrationSettingsAckSchema,
  type MigrationCommand,
  type MigrationRequestContext,
} from "../../../../packages/shared/src/migration-rpc.js";
import type { SecretStore } from "../settings/service.js";
import type { Sqlite } from "../tasks/database.js";
import { MigrationJournal } from "./journal.js";
import { Mg01SettingsMigration } from "./mg01-settings.js";
import { SqliteMg01Journal } from "./mg01-journal.js";
type Command = Extract<
  MigrationCommand,
  { kind: "migration.settings.stage" | "migration.settings.validate" }
>;
export async function settingsRequest(
  db: Sqlite,
  profileGuard: string,
  store: SecretStore,
  command: Command,
  context?: MigrationRequestContext,
) {
  if (command.secretMode !== store.mode) throw new Error("MG01_SECRET_MODE");
  const journal = new MigrationJournal(db);
  const guard = async (epoch: number) => {
    if (!context || context.signal.aborted || Date.now() >= context.deadline)
      throw new Error("MG01_REQUEST_EXPIRED");
    const view = journal.read(),
      state = journal.state();
    if (
      !view ||
      state.admission !== 0 ||
      state.epoch !== epoch ||
      view.epoch !== epoch ||
      view.manifest.profileGuard !== profileGuard ||
      view.manifest.migrationId !== command.migrationId ||
      view.manifest.sourceDigests.MG01 !== command.sourceDigest ||
      !(
        command.kind === "migration.settings.validate"
          ? ["prepared", "copying", "validated", "committed"]
          : ["prepared", "copying", "validated"]
      ).includes(view.phase)
    )
      throw new Error("MG01_TRANSFER_SCOPE");
  };
  await guard(command.epoch);
  // Request-scoped source only: no raw snapshot or values are kept in a journal/map.
  const service = new Mg01SettingsMigration(
    new SqliteMg01Journal(db),
    {
      assertFrozen: guard,
      async readProviderSettings() {
        return command.source;
      },
    },
    profileGuard,
    store,
  );
  const checkpoint =
    command.kind === "migration.settings.stage"
      ? await service.stage(
          command.migrationId,
          command.epoch,
          command.sourceDigest,
        )
      : command.checkpoint;
  if (!(await service.validate(command.migrationId, command.epoch, checkpoint)))
    throw new Error("MG01_TRANSFER_READBACK");
  await guard(command.epoch);
  return migrationSettingsAckSchema.parse({
    schema: "wca.mg01-ack/v1",
    profileGuard,
    migrationId: command.migrationId,
    epoch: command.epoch,
    secretMode: store.mode,
    checkpoint,
    verified: true,
  });
}
