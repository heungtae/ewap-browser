import { advisoryRecordSchema, digest } from "@contextpilot/codebase-schema";
import { completed, key, request, stores, type Stored } from "./database.js";
import { stored } from "./records.js";
import { catalog, catalogRecord, importAllowed } from "./advisory-controls.js";
import { readAll, enforceCapacity } from "./capacity.js";
export async function writeAdvisory(
  db: IDBDatabase,
  input: unknown,
  now: number,
  capacity = 100 * 1024 * 1024,
): Promise<"IMPORTED" | "DUPLICATE" | "DELETED"> {
  const item = advisoryRecordSchema.parse(input);
  const e = item.entity;
  const valueDigest = await digest(item);
  const journalKey = key(
    e.partitionId,
    e.pageKey,
    `advisory_${e.id}_${item.history.sourceRevision}`,
  );
  const tx = db.transaction([...stores], "readwrite");
  const done = completed(tx);
  try {
    const page = (await request(
      tx.objectStore("pages").get(key(e.partitionId, e.pageKey, "current")),
    )) as Stored | undefined;
    if (!page || page.expiresAt <= now)
      throw new Error("IMPORT_PAGE_UNAVAILABLE");
    const old = (await request(
      tx.objectStore("migrationJournal").get(journalKey),
    )) as Stored | undefined;
    if (old) {
      if ((old.value as { digest: string }).digest !== valueDigest)
        throw new Error("IMPORT_CONFLICT");
      await done;
      return old.kind === "advisory_deleted_receipt" ? "DELETED" : "DUPLICATE";
    }
    await importAllowed(
      tx,
      e.partitionId,
      e.pageKey,
      e.id,
      item.history.source,
    );
    const deleted = (await request(
      tx
        .objectStore("migrationJournal")
        .get(key(e.partitionId, e.pageKey, `advisory_deleted_${e.id}`)),
    )) as Stored | undefined;
    if (
      deleted &&
      item.history.sourceRevision <=
        Number((deleted.value as { sourceRevision: number }).sourceRevision)
    )
      throw Error("IMPORT_REVISION_STALE");
    const state = await catalog(tx);
    const existing = (await request(
      tx.objectStore("entities").get(key(e.partitionId, e.pageKey, e.id)),
    )) as Stored | undefined;
    if (existing && Number(existing.source) > item.history.sourceRevision)
      throw new Error("IMPORT_REVISION_STALE");
    const writes = [
      {
        store: "entities" as const,
        record: stored(
          key(e.partitionId, e.pageKey, e.id),
          e.partitionId,
          e.pageKey,
          "workflow",
          e,
          now,
        ),
      },
      {
        store: "migrationJournal" as const,
        record: stored(
          journalKey,
          e.partitionId,
          e.pageKey,
          "advisory",
          { digest: valueDigest, ...item.history },
          now,
        ),
      },
    ];
    writes[0]!.record.source = String(item.history.sourceRevision);
    writes.push({
      store: "migrationJournal",
      record: catalogRecord({ ...state, revision: state.revision + 1 }, now),
    });
    enforceCapacity(tx, await readAll(tx), writes, capacity, now, e.pageKey);
    for (const w of writes) tx.objectStore(w.store).put(w.record);
    await done;
    return "IMPORTED";
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* transaction already settled */
    }
    await done.catch(() => undefined);
    throw error;
  }
}
export { readAdvisory } from "./advisory-read.js";
