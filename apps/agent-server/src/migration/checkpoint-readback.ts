import { mg02MirrorSchema } from "../../../../packages/policy-engine/src/migration-contract.js";
import type { Journal } from "../../../../packages/shared/src/migration-types.js";
import type { Sqlite } from "../tasks/database.js";
import { SqliteMg01Journal } from "./mg01-journal.js";
import { settingsDigest } from "./mg01-source.js";
export function assertCheckpointReadback(db: Sqlite, view: Journal) {
  const profile = view.manifest.profileGuard!,
    id = view.manifest.migrationId;
  const mg01 = new SqliteMg01Journal(db).load(profile, id);
  const row = db
    .prepare(
      "SELECT body FROM mg02_policy_mirror WHERE profile_guard=? AND migration_id=?",
    )
    .get(profile, id);
  const mg02 = row
    ? mg02MirrorSchema.parse(JSON.parse(String(row.body)))
    : undefined;
  if (
    !mg01 ||
    mg01.epoch !== view.epoch ||
    settingsDigest(mg01.checkpoint) !== settingsDigest(view.stores.MG01) ||
    !mg02 ||
    mg02.profileGuard !== profile ||
    mg02.migrationId !== id ||
    mg02.epoch !== view.epoch ||
    settingsDigest(mg02.conversion) !== mg02.checkpoint.targetDigest ||
    settingsDigest(mg02.checkpoint) !== settingsDigest(view.stores.MG02)
  )
    throw new Error("MIGRATION_CHECKPOINT_READBACK");
}
