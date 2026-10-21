import { createServer } from "node:net";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import {
  grantSchema,
  privateDirectory,
  safeCode,
  type Grant,
} from "../../../../packages/integration-adapters/src/index.js";
import {
  frame,
  Frames,
  proof,
  IPC_VERSION,
} from "../../../../packages/integration-adapters/src/ipc.js";
import type { McpBackend } from "./backend.js";
export interface Pairing {
  secret: string;
  grant: Grant;
}
const helloSchema = z.strictObject({
  version: z.literal(IPC_VERSION),
  clientId: z.string().min(1).max(128),
  proof: z.string().regex(/^[a-f0-9]{64}$/),
});
const requestSchema = z.strictObject({
  id: z.number().int().positive().max(4096),
  command: z.unknown(),
});
export async function listenMcp(
  path: string,
  lookup: (clientId: string) => Pairing | undefined,
  backend: McpBackend,
) {
  await privateDirectory(dirname(path));
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer((socket) => {
    if (sockets.size >= 16) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    const decoder = new Frames(),
      nonce = randomBytes(32).toString("hex");
    let principal: Grant | undefined,
      secret: string | undefined,
      sequence = 0;
    let queue = Promise.resolve(),
      queued = 0,
      closed = false;
    const authDeadline = Date.now() + 5000;
    const send = (value: unknown) => {
      if (socket.writableLength > 524288) throw new Error("MCP_BACKPRESSURE");
      socket.write(frame(value));
    };
    socket.setTimeout(5000, () => socket.destroy());
    send({ version: IPC_VERSION, nonce });
    const handle = async (input: unknown) => {
      if (closed) throw new Error("MCP_CONNECTION_CLOSED");
      if (!principal) {
        if (Date.now() >= authDeadline) throw new Error("MCP_AUTH_EXPIRED");
        const hello = helloSchema.parse(input),
          pairing = lookup(hello.clientId);
        if (
          !pairing ||
          pairing.secret.length < 32 ||
          !timingSafeEqual(
            Buffer.from(hello.proof, "hex"),
            Buffer.from(proof(pairing.secret, hello.clientId, nonce), "hex"),
          )
        )
          throw new Error("MCP_AUTH_DENIED");
        principal = grantSchema.parse(pairing.grant);
        secret = pairing.secret;
        if (
          principal.clientId !== hello.clientId ||
          Date.now() >= principal.expiresAt
        )
          throw new Error("MCP_AUTH_DENIED");
        socket.setTimeout(300000);
        send({ version: IPC_VERSION, ready: true });
        return;
      }
      const request = requestSchema.parse(input),
        pairing = lookup(principal.clientId);
      if (
        request.id !== ++sequence ||
        !pairing ||
        pairing.secret !== secret ||
        JSON.stringify(pairing.grant) !== JSON.stringify(principal) ||
        Date.now() >= principal.expiresAt
      )
        throw new Error("MCP_SESSION_STALE");
      try {
        const result = await backend.request(principal, request.command);
        const current = lookup(principal.clientId);
        if (
          !current ||
          current.secret !== secret ||
          JSON.stringify(current.grant) !== JSON.stringify(principal) ||
          Date.now() >= principal.expiresAt
        )
          throw new Error("MCP_SESSION_STALE");
        send({ id: request.id, result });
      } catch (error) {
        send({ id: request.id, error: safeCode(error) });
      }
    };
    socket.on("data", (chunk) => {
      try {
        for (const value of decoder.push(chunk)) {
          if (++queued > 32) throw new Error("MCP_BACKPRESSURE");
          queue = queue
            .then(() => handle(value))
            .then(() => {
              queued--;
            })
            .catch(() => {
              closed = true;
              socket.destroy();
            });
        }
      } catch {
        socket.destroy();
      }
    });
    socket.on("error", () => socket.destroy());
    socket.on("close", () => {
      closed = true;
      sockets.delete(socket);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, resolve);
  });
  await chmod(path, 0o600);
  return {
    server,
    close: async () => {
      sockets.forEach((socket) => socket.destroy());
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await unlink(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    },
  };
}
