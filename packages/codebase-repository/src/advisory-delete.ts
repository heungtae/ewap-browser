import { decodeAdvisoryHistory } from "./advisory-controls.js";
import { key, request, type Stored } from "./database.js";
import { stored, type WriteRecord } from "./records.js";
import { controlKey } from "./advisory-controls.js";
export async function deleteAdvisory(
  tx: IDBTransaction,
  row: Stored,
  now: number,
): Promise<WriteRecord[]> {
  const entity = row.value as { id: string };
  const history = (await request(
    tx
      .objectStore("migrationJournal")
      .index("scopeKind")
      .getAll([row.partitionId, row.pageKey, "advisory"], 200001),
  )) as Stored[];
  if (history.length > 200000) throw Error("CACHE_RECORD_LIMIT");
  const writes: WriteRecord[] = [];
  for (const record of history) {
    const parsed = decodeAdvisoryHistory(record.value);
    if (parsed.success && parsed.data.id === entity.id) {
      const digest = (record.value as { digest: string }).digest;
      writes.push({
        store: "migrationJournal",
        record: stored(
          record.key,
          row.partitionId,
          row.pageKey,
          "advisory_deleted_receipt",
          { digest, deleted: true },
          now,
        ),
      });
    }
  }
  writes.push({
    store: "migrationJournal",
    record: stored(
      key(row.partitionId, row.pageKey, `advisory_deleted_${entity.id}`),
      row.partitionId,
      row.pageKey,
      "advisory_deleted",
      { sourceRevision: Number(row.source) },
      now,
    ),
  });
  tx.objectStore("entities").delete(row.key);
  tx.objectStore("migrationJournal").delete(
    controlKey(row.partitionId, row.pageKey, entity.id),
  );
  return writes;
}
