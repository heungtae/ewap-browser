import { MAX_FRAME_BYTES } from "@contextpilot/shared/bridge";
export function encodeFrame(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value));
  if (!body.length || body.length > MAX_FRAME_BYTES)
    throw new Error("FRAME_SIZE");
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length);
  return Buffer.concat([head, body]);
}
export class FrameDecoder {
  private header = Buffer.alloc(0);
  private body = Buffer.alloc(0);
  private expected = 0;
  private failed = false;
  push(chunk: Buffer): unknown[] {
    if (this.failed) throw new Error("FRAME_CLOSED");
    const result: unknown[] = [];
    try {
      let offset = 0;
      while (offset < chunk.length) {
        if (!this.expected) {
          const take = Math.min(4 - this.header.length, chunk.length - offset);
          this.header = Buffer.concat([
            this.header,
            chunk.subarray(offset, offset + take),
          ]);
          offset += take;
          if (this.header.length !== 4) continue;
          this.expected = this.header.readUInt32LE();
          this.header = Buffer.alloc(0);
          if (!this.expected || this.expected > MAX_FRAME_BYTES)
            throw new Error("FRAME_SIZE");
        }
        const take = Math.min(
          this.expected - this.body.length,
          chunk.length - offset,
        );
        this.body = Buffer.concat([
          this.body,
          chunk.subarray(offset, offset + take),
        ]);
        offset += take;
        if (this.body.length === this.expected) {
          const text = new TextDecoder("utf-8", { fatal: true }).decode(
            this.body,
          );
          result.push(JSON.parse(text) as unknown);
          this.body = Buffer.alloc(0);
          this.expected = 0;
        }
      }
      return result;
    } catch (error) {
      this.failed = true;
      this.body = Buffer.alloc(0);
      throw error;
    }
  }
  end(): void {
    if (this.expected || this.header.length) throw new Error("FRAME_TRUNCATED");
  }
}
