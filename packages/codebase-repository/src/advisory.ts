import { advisoryRecordSchema, digest } from "@contextpilot/codebase-schema";
import { completed, key, request, stores, type Stored } from "./database.js";
import { stored } from "./records.js";
import { readAll, enforceCapacity } from "./capacity.js";
export async function writeAdvisory(
  db: IDBDatabase,
  input: unknown,
  now: number,
  capacity = 100 * 1024 * 1024,
): Promise<void> {
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
    if (!page) throw new Error("IMPORT_PAGE_UNAVAILABLE");
    const old = (await request(
      tx.objectStore("migrationJournal").get(journalKey),
    )) as Stored | undefined;
    if (old) {
      if ((old.value as { digest: string }).digest !== valueDigest)
        throw new Error("IMPORT_CONFLICT");
      await done;
      return;
    }
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
    enforceCapacity(tx, await readAll(tx), writes, capacity, now, e.pageKey);
    for (const w of writes) tx.objectStore(w.store).put(w.record);
    await done;
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
export async function readAdvisory(
  db: IDBDatabase,
  partition: string,
  page: string,
  limit: number,
  now: number,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 128)
    throw new Error("IMPORT_QUERY_LIMIT");
  const tx = db.transaction(
    ["entities", "migrationJournal", "pages"],
    "readonly",
  );
  const done = completed(tx);
  const current = (await request(
    tx.objectStore("pages").get(key(partition, page, "current")),
  )) as Stored | undefined;
  if (!current) {
    await done;
    throw new Error("IMPORT_PAGE_UNAVAILABLE");
  }
  const rows = (await request(
    tx
      .objectStore("entities")
      .index("scopeKind")
      .getAll([partition, page, "workflow"], limit),
  )) as Stored[];
  const history = (await request(
    tx
      .objectStore("migrationJournal")
      .index("scopeKind")
      .getAll([partition, page, "advisory"], 128),
  )) as Stored[];
  await done;
  return {
    entities: rows.filter((r) => r.expiresAt > now).map((r) => r.value),
    history: history.filter((r) => r.expiresAt > now).map((r) => r.value),
  };
}
