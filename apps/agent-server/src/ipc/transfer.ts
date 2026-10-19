import { createHash } from "node:crypto";
const hash = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
export interface TransferSpec {
  id: string;
  count: number;
  bytes: number;
  digest: string;
  deadline: number;
}
export class ChunkTransfer {
  private chunks: Buffer[] = [];
  private bytes = 0;
  private pending = new Set<number>();
  private closed = false;
  constructor(
    readonly spec: TransferSpec,
    now: number,
  ) {
    if (
      !/^[a-zA-Z0-9-]{1,128}$/.test(spec.id) ||
      !Number.isSafeInteger(spec.count) ||
      spec.count < 1 ||
      spec.count > 256 ||
      !Number.isSafeInteger(spec.bytes) ||
      spec.bytes < 1 ||
      spec.bytes > 8 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(spec.digest) ||
      spec.deadline <= now ||
      spec.deadline > now + 30_000
    )
      throw new Error("TRANSFER_LIMIT");
  }
  private check(now: number) {
    if (this.closed || now >= this.spec.deadline) {
      this.cancel();
      throw new Error("TRANSFER_CLOSED");
    }
  }
  receive(index: number, bytes: Buffer, now: number): void {
    this.check(now);
    if (
      index !== this.chunks.length ||
      index >= this.spec.count ||
      !bytes.length ||
      bytes.length > 128 * 1024 ||
      this.pending.size >= 4 ||
      this.bytes + bytes.length > this.spec.bytes
    ) {
      this.cancel();
      throw new Error("TRANSFER_INTEGRITY");
    }
    this.chunks.push(Buffer.from(bytes));
    this.pending.add(index);
    this.bytes += bytes.length;
  }
  ack(index: number, now: number): void {
    this.check(now);
    if (!this.pending.delete(index)) {
      this.cancel();
      throw new Error("TRANSFER_ACK");
    }
  }
  complete(now: number): Buffer {
    this.check(now);
    if (
      this.pending.size ||
      this.chunks.length !== this.spec.count ||
      this.bytes !== this.spec.bytes
    ) {
      this.cancel();
      throw new Error("TRANSFER_INCOMPLETE");
    }
    const result = Buffer.concat(this.chunks);
    if (hash(result) !== this.spec.digest) {
      this.cancel();
      throw new Error("TRANSFER_DIGEST");
    }
    this.cancel();
    return result;
  }
  cancel(): void {
    this.closed = true;
    this.chunks = [];
    this.pending.clear();
    this.bytes = 0;
  }
}
