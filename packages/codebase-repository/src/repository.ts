import {
  digest,
  snapshotSchema,
  type Snapshot,
} from "@contextpilot/codebase-schema";
import { commitGraph } from "./commit.js";
import { completed, key, request, stores, type Stored } from "./database.js";
export class CodebaseRepository {
  constructor(
    readonly database: IDBDatabase,
    readonly profileGuard: string,
    private now: () => number = Date.now,
    private capacity = 100 * 1024 * 1024,
  ) {
    if (
      !Number.isSafeInteger(capacity) ||
      capacity < 1 ||
      capacity > 100 * 1024 * 1024
    )
      throw new Error("CACHE_LIMIT");
  }
  commit(input: unknown, current: () => boolean = () => true) {
    return commitGraph(
      this.database,
      this.profileGuard,
      input,
      this.now(),
      this.capacity,
      current,
    );
  }
  async snapshot(
    partitionId: string,
    pageKey: string,
    revision?: number,
  ): Promise<Snapshot> {
    const tx = this.database.transaction(
      revision === undefined ? "pages" : "versions",
      "readonly",
    );
    const done = completed(tx);
    const row = (await request(
      tx
        .objectStore(revision === undefined ? "pages" : "versions")
        .get(
          key(
            partitionId,
            pageKey,
            revision === undefined ? "current" : String(revision),
          ),
        ),
    )) as Stored | undefined;
    await done;
    if (!row || row.expiresAt <= this.now())
      throw new Error("SNAPSHOT_UNAVAILABLE");
    const result = snapshotSchema.parse(row.value);
    const { digest: expected, ...body } = result;
    if (
      result.context.profileGuard !== this.profileGuard ||
      result.partitionId !== partitionId ||
      result.pageKey !== pageKey ||
      (await digest(body)) !== expected
    )
      throw new Error("PROJECTION_INTEGRITY");
    return result;
  }
  async pin(
    partitionId: string,
    pageKey: string,
    until: number,
  ): Promise<void> {
    const now = this.now();
    if (until <= now || until > now + 600_000) throw new Error("PIN_DEADLINE");
    const tx = this.database.transaction([...stores], "readwrite");
    const done = completed(tx);
    try {
      for (const store of stores) {
        const rows = (await request(
          tx.objectStore(store).index("pageKey").getAll(pageKey),
        )) as Stored[];
        for (const row of rows)
          if (row.partitionId === partitionId)
            tx.objectStore(store).put({ ...row, pinUntil: until });
      }
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
  async unpin(partitionId: string, pageKey: string): Promise<void> {
    const tx = this.database.transaction([...stores], "readwrite");
    const done = completed(tx);
    for (const store of stores) {
      const rows = (await request(
        tx.objectStore(store).index("pageKey").getAll(pageKey),
      )) as Stored[];
      for (const row of rows)
        if (row.partitionId === partitionId)
          tx.objectStore(store).put({ ...row, pinUntil: 0 });
    }
    await done;
  }
  async invalidatePartition(partitionId: string): Promise<void> {
    const tx = this.database.transaction([...stores], "readwrite");
    const done = completed(tx);
    for (const store of stores) {
      const rows = (await request(
        tx.objectStore(store).index("partitionId").getAll(partitionId),
      )) as Stored[];
      for (const row of rows) tx.objectStore(store).delete(row.key);
    }
    await done;
  }
}
