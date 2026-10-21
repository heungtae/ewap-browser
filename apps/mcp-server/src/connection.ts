import { connect, type Socket } from "node:net";
import { lstat } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import {
  privateDirectory,
  type BackendPort,
} from "@contextpilot/integration-adapters";
import {
  frame,
  Frames,
  IPC_VERSION,
  proof,
} from "@contextpilot/integration-adapters/ipc";
export const pairingSchema = z.strictObject({
  version: z.literal(IPC_VERSION),
  socketPath: z.string().min(1).max(4096),
  clientId: z.string().min(1).max(128),
  secret: z.string().min(32).max(4096),
});
export class BackendConnection implements BackendPort {
  private pending = new Map<
    number,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private sequence = 0;
  private constructor(private socket: Socket) {}
  static async open(raw: unknown): Promise<BackendConnection> {
    const config = pairingSchema.parse(raw);
    await privateDirectory(dirname(config.socketPath));
    const info = await lstat(config.socketPath);
    if (
      !info.isSocket() ||
      info.uid !== process.getuid?.() ||
      info.mode & 0o077
    )
      throw new Error("MCP_SOCKET_PRINCIPAL");
    const socket = connect(config.socketPath),
      client = new BackendConnection(socket),
      decoder = new Frames();
    return new Promise((resolve, reject) => {
      let stage = 0;
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("MCP_PAIRING_TIMEOUT"));
      }, 5000);
      const fail = () => {
        clearTimeout(timer);
        reject(new Error("MCP_BACKEND_DISCONNECTED"));
        client.rejectAll();
      };
      socket.on("error", fail);
      socket.on("close", fail);
      socket.on("data", (chunk) => {
        try {
          for (const value of decoder.push(chunk)) {
            if (stage === 0) {
              const challenge = z
                .strictObject({
                  version: z.literal(IPC_VERSION),
                  nonce: z.string().regex(/^[a-f0-9]{64}$/),
                })
                .parse(value);
              socket.write(
                frame({
                  version: IPC_VERSION,
                  clientId: config.clientId,
                  proof: proof(config.secret, config.clientId, challenge.nonce),
                }),
              );
              stage++;
            } else if (stage === 1) {
              z.strictObject({
                version: z.literal(IPC_VERSION),
                ready: z.literal(true),
              }).parse(value);
              stage++;
              clearTimeout(timer);
              resolve(client);
            } else {
              const result = z
                .object({
                  id: z.number().int(),
                  result: z.unknown().optional(),
                  error: z.string().optional(),
                })
                .parse(value);
              const pending = client.pending.get(result.id);
              if (!pending) throw new Error("MCP_UNEXPECTED_RESPONSE");
              clearTimeout(pending.timer);
              client.pending.delete(result.id);
              if (result.error)
                pending.reject(
                  new Error(
                    /^[A-Z][A-Z0-9_]{1,127}$/.test(result.error)
                      ? result.error
                      : "MCP_BACKEND_ERROR",
                  ),
                );
              else pending.resolve(result.result);
            }
          }
        } catch {
          socket.destroy();
          fail();
        }
      });
    });
  }
  private rejectAll(): void {
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error("MCP_BACKEND_DISCONNECTED"));
    }
    this.pending.clear();
  }
  async request(
    command: Parameters<BackendPort["request"]>[0],
  ): Promise<unknown> {
    if (
      this.socket.destroyed ||
      this.pending.size >= 32 ||
      this.sequence >= 4096
    )
      throw new Error("MCP_CONNECTION_UNAVAILABLE");
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.destroy();
        reject(new Error("MCP_REQUEST_TIMEOUT"));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.write(frame({ id, command }));
      } catch {
        this.socket.destroy();
        this.rejectAll();
      }
    });
  }
  close(): void {
    this.socket.destroy();
    this.rejectAll();
  }
}
