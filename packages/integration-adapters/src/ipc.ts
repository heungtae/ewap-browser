import { createHmac } from "node:crypto";
export const IPC_VERSION = "wca.mcp-ipc/v1";
export const MAX_BYTES = 262144;
export function proof(secret: string, clientId: string, nonce: string): string {
  return createHmac("sha256", secret)
    .update(JSON.stringify([IPC_VERSION, clientId, nonce]))
    .digest("hex");
}
export function frame(input: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(input));
  if (!body.length || body.length > MAX_BYTES)
    throw new Error("MCP_FRAME_LIMIT");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}
export class Frames {
  private buffer = Buffer.alloc(0);
  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: unknown[] = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE();
      if (!length || length > MAX_BYTES) throw new Error("MCP_FRAME_LIMIT");
      if (this.buffer.length < length + 4) break;
      messages.push(
        JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            this.buffer.subarray(4, length + 4),
          ),
        ),
      );
      this.buffer = this.buffer.subarray(length + 4);
      if (messages.length > 64) throw new Error("MCP_FRAME_LIMIT");
    }
    if (this.buffer.length > MAX_BYTES + 4) throw new Error("MCP_FRAME_LIMIT");
    return messages;
  }
}
