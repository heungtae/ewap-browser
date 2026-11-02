import type { Stored } from "./database.js";
// Index cursors keep both metadata scans and returned pages finite. The primary
// key is an opaque continuation, never execution or source authority.
export async function scanIndex(
  index: IDBIndex,
  kind: IDBValidKey,
  after: string | null,
  visit: (row: Stored) => Promise<boolean>,
  current: () => boolean,
  max = 256,
) {
  const query = index.openCursor(kind);
  return new Promise<{ cursor: string | null; partial: boolean }>(
    (resolve, reject) => {
      let examined = 0,
        last = after,
        stopped = false;
      query.onerror = () => reject(query.error);
      query.onsuccess = () => {
        const cursor = query.result;
        if (!cursor) {
          resolve({ cursor: null, partial: false });
          return;
        }
        if (stopped) {
          resolve({ cursor: last, partial: true });
          return;
        }
        if (!current()) {
          reject(Error("MANAGEMENT_EXPIRED"));
          return;
        }
        const primary = String(cursor.primaryKey);
        if (after !== null && primary <= after) {
          if (primary < after) cursor.continuePrimaryKey(kind, after);
          else cursor.continue();
          return;
        }
        if (examined >= max) {
          resolve({ cursor: last, partial: true });
          return;
        }
        last = primary;
        examined++;
        void visit(cursor.value as Stored).then((keepGoing) => {
          if (!current()) {
            reject(Error("MANAGEMENT_EXPIRED"));
            return;
          }
          if (!keepGoing) stopped = true;
          cursor.continue();
        }, reject);
      };
    },
  );
}
