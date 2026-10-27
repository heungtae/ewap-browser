import { createServer, type Server, type Socket } from "node:net";
import { chmod, lstat, mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { FrameDecoder, encodeFrame } from "../native/framing.js";
import { Handshake, type Pairing } from "./auth.js";
import { Session } from "./session.js";
import { ConnectionTransfers } from "./transfers.js";
import { capabilityHealth } from "../settings/health.js";
import type { MigrationRequestContext } from "../../../../packages/shared/src/migration-rpc.js";
import { EventReplay } from "./replay.js";
const peers = new WeakMap<Server, Set<Socket>>();
const paths = new WeakMap<Server, string>();
export async function stopLocal(server: Server): Promise<void> {
  for (const socket of peers.get(server) ?? []) socket.destroy();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  const path = paths.get(server);
  if (path)
    await unlink(path).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
}
export async function listenLocal(
  path: string,
  pairing: Pairing,
  migration?: ((
    command: unknown,
    context: MigrationRequestContext,
  ) => Promise<unknown>) & {
    settingsMode?: "session-only" | "os-store";
  },
): Promise<Server> {
  if (process.platform === "win32") throw new Error("WINDOWS_ACL_UNQUALIFIED");
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    info.uid !== process.getuid?.() ||
    info.mode & 0o077
  )
    throw new Error("IPC_PRINCIPAL");
  // Do not unlink an existing endpoint: another daemon may own it.
  let epoch = 0;
  const replay = new EventReplay();
  const connections = new Set<Socket>();
  const server = createServer((socket) => {
    if (connections.size >= 16) {
      socket.destroy();
      return;
    }
    connections.add(socket);
    const decoder = new FrameDecoder();
    const transfers = new ConnectionTransfers();
    const handshake = new Handshake(pairing, Date.now() + 5000);
    let session: Session | undefined;
    socket.setTimeout(5000, () => socket.destroy());
    const send = (value: unknown) => {
      if (socket.writableLength > 512 * 1024) throw new Error("BACKPRESSURE");
      socket.write(encodeFrame(value));
    };
    send({ kind: "challenge", nonce: handshake.nonce, major: 1, minor: 0 });
    let queued = 0;
    let serial = Promise.resolve();
    const processFrame = async (input: unknown) => {
      if (socket.destroyed) return;
      if (!session) {
        handshake.accept(input, Date.now());
        session = new Session(pairing, ++epoch);
        socket.setTimeout(30_000);
        send({
          kind: "ready",
          connectionId: session.connectionId,
          connectionEpoch: session.connectionEpoch,
          capabilities: migration
            ? [
                "heartbeat",
                "resumeEvents",
                "migration.status",
                "migration.policy",
                "migration.resume",
                ...(migration.settingsMode ? ["migration.settings"] : []),
              ]
            : ["heartbeat", "resumeEvents"],
          taskReady: false,
        });
      } else {
        const command = session.accept(input, Date.now());
        let result: unknown;
        if (command.kind.startsWith("migration.")) {
          if (!migration) throw new Error("MIGRATION_UNAVAILABLE");
          const abort = new AbortController();
          const disconnect = () => abort.abort();
          const timer = setTimeout(
            disconnect,
            Math.max(0, session.deadline - Date.now()),
          );
          timer.unref();
          socket.once("close", disconnect);
          try {
            result = await migration(command, {
              deadline: session.deadline,
              signal: abort.signal,
            });
            if (
              abort.signal.aborted ||
              Date.now() >= session.deadline ||
              socket.destroyed
            )
              throw new Error("MIGRATION_EXPIRED");
          } finally {
            clearTimeout(timer);
            socket.removeListener("close", disconnect);
          }
        } else if (command.kind.startsWith("transfer."))
          result = transfers.handle(command, Date.now());
        else if (command.kind === "resumeEvents")
          result = replay.resume(command.afterSequence);
        else if (command.kind === "capabilities")
          result = {
            taskReady: false,
            browserReady: session.browserAvailable(),
            health: capabilityHealth({
              hostInstalled: true,
              executableValid: true,
              protocolMajor: 1,
              paired: true,
              durableSecrets: false,
            }),
          };
        else if (command.kind === "heartbeat") result = { kind: "heartbeat" };
        else
          result = replay.append(
            session.browserAvailable()
              ? "browser.connected"
              : "browser.waiting",
          );
        send({ messageId: session.messageId, result });
      }
    };
    socket.on("data", (bytes) => {
      try {
        for (const input of decoder.push(bytes)) {
          if (++queued > 16) throw new Error("IPC_QUEUE_LIMIT");
          serial = serial
            .then(() => processFrame(input))
            .catch(() => {
              socket.destroy();
            })
            .finally(() => {
              queued--;
            });
        }
      } catch {
        socket.destroy();
      }
    });
    socket.on("error", () => socket.destroy());
    socket.on("close", () => {
      session?.disconnect();
      transfers.cancel();
      connections.delete(socket);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  await chmod(path, 0o600);
  peers.set(server, connections);
  paths.set(server, path);
  return server;
}
