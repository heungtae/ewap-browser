export const stores = [
  "partitions",
  "pages",
  "entities",
  "edges",
  "evidence",
  "datasets",
  "datasetChunks",
  "versions",
  "tombstones",
  "dispatchLedger",
  "migrationJournal",
] as const;
export type StoreName = (typeof stores)[number];
export interface Stored {
  key: string;
  partitionId: string;
  pageKey: string;
  kind: string;
  parentId: string;
  name: string;
  status: string;
  source: string;
  time: number;
  bytes: number;
  pinUntil: number;
  expiresAt: number;
  value: unknown;
}
export async function openDatabase(
  factory: IDBFactory,
  profileGuard: string,
): Promise<IDBDatabase> {
  if (!/^[a-f0-9]{64}$/.test(profileGuard)) throw new Error("INVALID_PROFILE");
  return new Promise((resolve, reject) => {
    const request = factory.open(`contextpilot-codebase-v1-${profileGuard}`, 1);
    request.onupgradeneeded = () => {
      for (const name of stores) {
        const s = request.result.createObjectStore(name, { keyPath: "key" });
        s.createIndex("scopeKind", ["partitionId", "pageKey", "kind"]);
        for (const key of [
          "partitionId",
          "pageKey",
          "kind",
          "parentId",
          "name",
          "status",
          "source",
          "time",
          "expiresAt",
        ])
          s.createIndex(key, key);
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("REPOSITORY_BLOCKED"));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
export function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
export function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("TRANSACTION_ABORTED"));
    tx.onerror = () => undefined;
  });
}
export function key(...parts: (string | number)[]): string {
  return JSON.stringify(parts);
}
