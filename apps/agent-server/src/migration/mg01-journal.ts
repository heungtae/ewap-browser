import { transaction, type Sqlite } from "../tasks/database.js";
import { mg01StageSchema, type Mg01Stage } from "./mg01-types.js";
import { settingsDigest } from "./mg01-source.js";
export interface Mg01Persistence {
  load(profileGuard: string, migrationId: string): Mg01Stage | undefined;
  assertEpoch(epoch: number): void;
  save(stage: Mg01Stage): void;
}
export class SqliteMg01Journal implements Mg01Persistence {
  constructor(private readonly db: Sqlite) {
    db.exec(`CREATE TABLE IF NOT EXISTS mg01_settings_stage
      (profile_guard TEXT NOT NULL, migration_id TEXT NOT NULL, body TEXT NOT NULL,
       PRIMARY KEY(profile_guard,migration_id));`);
  }
  assertEpoch(epoch: number) {
    let row: Record<string, unknown> | undefined;
    try {
      row = this.db
        .prepare("SELECT epoch,admission FROM migration_fence WHERE id=1")
        .get();
    } catch {
      throw new Error("MG01_FENCE_REQUIRED");
    }
    if (!row || row.epoch !== epoch || row.admission !== 0)
      throw new Error("MG01_FENCE_REQUIRED");
  }
  load(profileGuard: string, migrationId: string): Mg01Stage | undefined {
    const row = this.db
      .prepare(
        "SELECT body FROM mg01_settings_stage WHERE profile_guard=? AND migration_id=?",
      )
      .get(profileGuard, migrationId);
    if (!row) return undefined;
    try {
      const stage = mg01StageSchema.parse(JSON.parse(String(row.body)));
      if (
        stage.profileGuard !== profileGuard ||
        stage.migrationId !== migrationId ||
        stage.checkpoint.targetDigest !== settingsDigest(stage.conversion) ||
        stage.checkpoint.copied !== stage.conversion.records.length ||
        stage.checkpoint.quarantined !== stage.conversion.quarantine.length ||
        stage.checkpoint.sourceCount !== stage.conversion.sourceCount
      )
        throw new Error();
      return stage;
    } catch {
      throw new Error("MG01_JOURNAL_INVALID");
    }
  }
  save(input: Mg01Stage) {
    const stage = mg01StageSchema.parse(input);
    transaction(this.db, () => {
      this.assertEpoch(stage.epoch);
      const old = this.load(stage.profileGuard, stage.migrationId);
      if (old) {
        if (settingsDigest(old) !== settingsDigest(stage))
          throw new Error("MG01_CONFLICT");
      } else
        this.db
          .prepare("INSERT INTO mg01_settings_stage VALUES (?,?,?)")
          .run(stage.profileGuard, stage.migrationId, JSON.stringify(stage));
    });
  }
}
