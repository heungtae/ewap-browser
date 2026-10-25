import { canonicalJson } from "../../../../extension/src/security/canonical.js";
import {
  request,
  completed,
} from "../../../../packages/codebase-repository/src/database.js";
import {
  migrationOwnerAckSchema,
  type MigrationOwnerAck,
} from "../../../../packages/shared/src/migration.js";
export class MigrationOwnerAcks {
  constructor(private readonly db: IDBDatabase) {}
  async read(id: string): Promise<MigrationOwnerAck | undefined> {
    const tx = this.db.transaction("migrationJournal", "readonly");
    const done = completed(tx);
    const row = await request(
      tx
        .objectStore("migrationJournal")
        .get(JSON.stringify(["S36-owner-ack", id])),
    );
    await done;
    if (!row) return undefined;
    const parsed = migrationOwnerAckSchema.safeParse(row.ack);
    if (!parsed.success) throw new Error("MIGRATION_ACK_INVALID");
    return parsed.data;
  }
  async save(ack: MigrationOwnerAck) {
    const value = migrationOwnerAckSchema.parse(ack);
    const tx = this.db.transaction("migrationJournal", "readwrite");
    const done = completed(tx);
    try {
      const key = JSON.stringify(["S36-owner-ack", value.migrationId]);
      const store = tx.objectStore("migrationJournal");
      const old = await request(store.get(key));
      if (old && canonicalJson(old.ack) !== canonicalJson(value))
        throw new Error("MIGRATION_ACK_CONFLICT");
      if (!old) store.add({ key, ack: value });
      await done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Already complete. */
      }
      await done.catch(() => undefined);
      throw error;
    }
  }
}
