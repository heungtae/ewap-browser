import { key, request, stores, type Stored } from "./database.js";
import type { WriteRecord } from "./records.js";
export async function readAll(tx: IDBTransaction): Promise<WriteRecord[]> {
  const all: WriteRecord[] = [];
  for (const store of stores) {
    const rows = (await request(
      tx.objectStore(store).getAll(undefined, 200001),
    )) as Stored[];
    if (all.length + rows.length > 200000)
      throw new Error("CACHE_RECORD_LIMIT");
    for (const record of rows) all.push({ store, record });
  }
  return all;
}
export function enforceCapacity(
  tx: IDBTransaction,
  all: WriteRecord[],
  writes: WriteRecord[],
  capacity: number,
  now: number,
  activePage: string,
): void {
  if (
    !Number.isSafeInteger(capacity) ||
    capacity < 1 ||
    capacity > 100 * 1024 * 1024
  )
    throw new Error("CACHE_LIMIT");
  const replaced = new Set(writes.map((w) => key(w.store, w.record.key)));
  const retained = all.filter((w) => !replaced.has(key(w.store, w.record.key)));
  let size =
    8 * 1024 * 1024 +
    retained.reduce((n, w) => n + w.record.bytes, 0) +
    writes.reduce((n, w) => n + w.record.bytes, 0);
  const groups = new Map<string, WriteRecord[]>();
  for (const item of retained) {
    const group = key(item.record.partitionId, item.record.pageKey);
    const items = groups.get(group) ?? [];
    items.push(item);
    groups.set(group, items);
  }
  const candidates = [...groups.values()]
    .filter((items) =>
      items.every(
        (w) => w.record.pageKey !== activePage && w.record.pinUntil <= now,
      ),
    )
    .sort(
      (a, b) =>
        (a.every((w) => w.record.expiresAt <= now) ? 0 : 1) -
          (b.every((w) => w.record.expiresAt <= now) ? 0 : 1) ||
        a.reduce((n, w) => Math.min(n, w.record.time), Infinity) -
          b.reduce((n, w) => Math.min(n, w.record.time), Infinity),
    );
  for (const group of candidates) {
    if (size <= capacity) break;
    for (const item of group) {
      if (["migrationJournal", "dispatchLedger"].includes(item.store)) continue;
      tx.objectStore(item.store).delete(item.record.key);
      size -= item.record.bytes;
    }
  }
  // Immutable old snapshots may be discarded without deleting current facts or receipts.
  for (const item of retained
    .filter(
      (w) =>
        w.store === "versions" &&
        w.record.pageKey === activePage &&
        w.record.pinUntil <= now,
    )
    .sort((a, b) => a.record.time - b.record.time)) {
    if (size <= capacity) break;
    tx.objectStore(item.store).delete(item.record.key);
    size -= item.record.bytes;
  }
  if (size > capacity) throw new Error("CACHE_CAPACITY_PINNED_OR_ACTIVE");
}
