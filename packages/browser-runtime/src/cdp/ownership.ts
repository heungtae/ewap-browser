import {
  completed,
  key,
  request,
  type Stored,
} from "@contextpilot/codebase-repository";
import type { CdpOwnership } from "./types.js";
export class IndexedDbCdpOwnership implements CdpOwnership {
  constructor(
    private db: IDBDatabase,
    private partitionId: string,
  ) {}
  async available(tabId: number) {
    const tx = this.db.transaction("migrationJournal", "readonly");
    const done = completed(tx);
    const row = await request(
      tx.objectStore("migrationJournal").get(key("cdp_ownership", tabId)),
    );
    await done;
    return !row;
  }
  async mark(
    tabId: number,
    owner: string,
    state: "attaching" | "owned" | "quarantined",
  ) {
    const tx = this.db.transaction("migrationJournal", "readwrite");
    const done = completed(tx);
    const store = tx.objectStore("migrationJournal");
    const k = key("cdp_ownership", tabId);
    const old = (await request(store.get(k))) as Stored | undefined;
    if (old && old.parentId !== owner) {
      await done;
      throw new Error("CDP_OWNERSHIP_CONFLICT");
    }
    store.put({
      key: k,
      partitionId: this.partitionId,
      pageKey: "",
      kind: "cdp_ownership",
      parentId: owner,
      name: "",
      status: state,
      source: "runtime",
      time: Date.now(),
      bytes: 0,
      pinUntil: Number.MAX_SAFE_INTEGER,
      expiresAt: Number.MAX_SAFE_INTEGER,
      value: null,
    } satisfies Stored);
    await done;
  }
  async clear(tabId: number, owner: string) {
    const tx = this.db.transaction("migrationJournal", "readwrite");
    const done = completed(tx);
    const store = tx.objectStore("migrationJournal");
    const k = key("cdp_ownership", tabId);
    const old = (await request(store.get(k))) as Stored | undefined;
    if (old && old.parentId !== owner) {
      await done;
      throw new Error("CDP_OWNERSHIP_CONFLICT");
    }
    store.delete(k);
    await done;
  }
}
