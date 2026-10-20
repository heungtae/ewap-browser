import { canonical } from "@contextpilot/codebase-schema";
import {
  completed,
  key,
  request,
  type Stored,
} from "@contextpilot/codebase-repository";
import {
  receiptSchema,
  type DispatchJournal,
  type PreparedStep,
  type Receipt,
} from "@contextpilot/tool-registry";
interface Reservation {
  digest: string;
  receipt: Receipt | null;
}
export class IndexedDbDispatchJournal implements DispatchJournal {
  constructor(
    private db: IDBDatabase,
    private partitionId: string,
  ) {}
  async reserve(id: string, step: PreparedStep) {
    if (id !== `dispatch_${step.toolCallId}`)
      throw new Error("DISPATCH_CONFLICT");
    if (step.context.partitionId !== this.partitionId)
      throw new Error("LEDGER_SCOPE");
    const tx = this.db.transaction("dispatchLedger", "readwrite");
    const done = completed(tx);
    const store = tx.objectStore("dispatchLedger");
    const ledgerKey = key(this.partitionId, id);
    const old = (await request(store.get(ledgerKey))) as Stored | undefined;
    if (old) {
      await done;
      const value = old.value as Reservation;
      if (value.digest !== step.digest) throw new Error("DISPATCH_CONFLICT");
      return { fresh: false, receipt: value.receipt };
    }
    const value: Reservation = { digest: step.digest, receipt: null };
    store.add({
      key: ledgerKey,
      partitionId: this.partitionId,
      pageKey: "",
      kind: "dispatch",
      parentId: "",
      name: "",
      status: "reserved",
      source: "runtime",
      time: Date.now(),
      bytes: 0,
      pinUntil: Number.MAX_SAFE_INTEGER,
      expiresAt: Number.MAX_SAFE_INTEGER,
      value,
    } satisfies Stored);
    await done;
    return { fresh: true, receipt: null };
  }
  async settle(id: string, input: Receipt): Promise<void> {
    const receipt = receiptSchema.parse(input);
    if (receipt.dispatchId !== id || id !== `dispatch_${receipt.toolCallId}`)
      throw new Error("DISPATCH_CONFLICT");
    const tx = this.db.transaction("dispatchLedger", "readwrite");
    const done = completed(tx);
    const store = tx.objectStore("dispatchLedger");
    const old = (await request(store.get(key(this.partitionId, id)))) as
      | Stored
      | undefined;
    if (!old || (old.value as Reservation).digest !== receipt.preparedDigest) {
      await done;
      throw new Error("DISPATCH_CONFLICT");
    }
    const value = old.value as Reservation;
    if (value.receipt && canonical(value.receipt) !== canonical(receipt)) {
      await done;
      throw new Error("RECEIPT_CONFLICT");
    }
    store.put({ ...old, status: "settled", value: { ...value, receipt } });
    await done;
  }
}
