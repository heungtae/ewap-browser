import { migrationJournalSchema } from "../../../../packages/shared/src/migration.js";
import { createHash } from "node:crypto";
import { transaction, type Sqlite } from "../tasks/database.js";
import type { Journal, Manifest } from "./coordinator.js";
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function manifestDigest(manifest: Manifest, stores: Journal["stores"]) {
  return createHash("sha256")
    .update(canonical({ manifest, stores }))
    .digest("hex");
}
// Qualification storage only: never opens product admission or rewrites source records.
export class MigrationJournal {
  constructor(private readonly db: Sqlite) {
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS migration_journal (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS migration_fence (id INTEGER PRIMARY KEY CHECK(id=1), epoch INTEGER NOT NULL, namespace TEXT NOT NULL, admission INTEGER NOT NULL CHECK(admission=0));
      INSERT OR IGNORE INTO migration_fence VALUES (1,0,'legacy',0);`);
  }
  read(): Journal | undefined {
    const row = this.db
      .prepare("SELECT body FROM migration_journal WHERE id=1")
      .get();
    if (!row) return undefined;
    try {
      return migrationJournalSchema.parse(
        JSON.parse(String(row.body)),
      ) as Journal;
    } catch {
      throw new Error("MIGRATION_JOURNAL_INVALID");
    }
  }
  fence(): number {
    return transaction(this.db, () => {
      this.db.exec(
        "UPDATE migration_fence SET epoch=epoch+1,admission=0 WHERE id=1",
      );
      return Number(this.state().epoch);
    });
  }
  state() {
    const row = this.db
      .prepare("SELECT * FROM migration_fence WHERE id=1")
      .get();
    if (!row) throw new Error("FENCE_MISSING");
    return row;
  }
  write(expected: number | undefined, next: Journal) {
    transaction(this.db, () => this.replace(expected, next));
  }
  update(transform: (current: Journal) => Journal): Journal {
    return transaction(this.db, () => {
      const current = this.read();
      if (!current) throw new Error("MIGRATION_MISSING");
      const next = transform(current);
      if (next !== current) this.replace(current.revision, next);
      return next;
    });
  }
  private replace(expected: number | undefined, next: Journal) {
    if (!migrationJournalSchema.safeParse(next).success)
      throw new Error("MIGRATION_JOURNAL_INVALID");
    const current = this.read();
    if (
      current?.revision !== expected ||
      next.epoch !== this.state().epoch ||
      next.revision !== (expected === undefined ? 0 : expected + 1)
    )
      throw new Error("MIGRATION_CAS");
    if (
      current &&
      manifestDigest(current.manifest, {}) !== manifestDigest(next.manifest, {})
    )
      throw new Error("MIGRATION_CONFLICT");
    this.db
      .prepare("INSERT OR REPLACE INTO migration_journal VALUES (1,?)")
      .run(JSON.stringify(next));
  }
  activate(journal: Journal, namespace: "legacy" | "target") {
    transaction(this.db, () => {
      const current = this.read();
      if (
        !current ||
        current.revision !== journal.revision ||
        current.epoch !== this.state().epoch ||
        canonical(current) !== canonical(journal)
      )
        throw new Error("MIGRATION_CAS");
      const digest = manifestDigest(current.manifest, current.stores);
      if (
        namespace === "target" &&
        (current.phase !== "validated" ||
          current.acknowledgments.backend !== digest ||
          current.acknowledgments.extension !== digest ||
          Object.keys(current.stores).length !== 6)
      )
        throw new Error("ACK_REQUIRED");
      this.db
        .prepare(
          "UPDATE migration_fence SET namespace=?,admission=0 WHERE id=1",
        )
        .run(namespace);
    });
  }
}
