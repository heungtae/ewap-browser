import {
  snapshotSchema,
  type AdvisoryItem,
} from "@contextpilot/codebase-schema";
import {
  decodeAdvisoryHistory,
  catalog,
  control,
} from "./advisory-controls.js";
import { completed, key, request, type Stored } from "./database.js";
import { advisoryItem } from "./advisory-page.js";
import { scanIndex } from "./management-scan.js";
export async function readAdvisory(
  db: IDBDatabase,
  partition: string,
  page: string,
  limit: number,
  now: number,
  after: string | null = null,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 128)
    throw new Error("IMPORT_QUERY_LIMIT");
  const tx = db.transaction(
    ["entities", "migrationJournal", "pages"],
    "readonly",
  );
  const done = completed(tx);
  const deadline = Date.now() + 10000;
  try {
    const current = (await request(
      tx.objectStore("pages").get(key(partition, page, "current")),
    )) as Stored | undefined;
    if (!current || current.expiresAt <= now) {
      await done;
      throw new Error("IMPORT_PAGE_UNAVAILABLE");
    }
    const history = (await request(
      tx
        .objectStore("migrationJournal")
        .index("scopeKind")
        .getAll([partition, page, "advisory"], 129),
    )) as Stored[];
    const state = await catalog(tx),
      profile = await control(tx, partition, page);
    const pageSnapshot = snapshotSchema.parse(current.value);
    const selected: Stored[] = [];
    const management: AdvisoryItem[] = [];
    const scan = await scanIndex(
      tx.objectStore("entities").index("scopeKind"),
      [partition, page, "workflow"],
      after,
      async (row) => {
        if (row.expiresAt <= now) return true;
        const item = await advisoryItem(tx, row);
        if (!item) return true;
        const flags = await control(tx, partition, page, item.id);
        if (
          !item.enabled ||
          (item.source === "learned" &&
            (!state.enabled ||
              profile.enabled === false ||
              (profile.rediscoverRevision !== undefined &&
                pageSnapshot.revision <= profile.rediscoverRevision))) ||
          (flags.rediscoverRevision !== undefined &&
            item.sourceRevision <= flags.rediscoverRevision)
        )
          return true;
        selected.push(row);
        management.push(item);
        return selected.length < limit;
      },
      () => Date.now() < deadline,
    );
    await done;
    return {
      entities: selected.map((row) => row.value),
      management,
      ...scan,
      historyPartial: history.length > 128,
      history: history
        .slice(0, 128)
        .filter(
          (row) =>
            row.expiresAt > now && decodeAdvisoryHistory(row.value).success,
        )
        .map((row) => row.value),
    };
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* already settled */
    }
    await done.catch(() => undefined);
    throw error;
  }
}
