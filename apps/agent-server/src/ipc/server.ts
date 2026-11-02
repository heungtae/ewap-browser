import { createServer, type Server, type Socket } from "node:net";
import { chmod, lstat, mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { FrameDecoder, encodeFrame } from "../native/framing.js";
import { Handshake, type Pairing } from "./auth.js";
import { Session } from "./session.js";
import { ConnectionTransfers } from "./transfers.js";
import { dispatchCommand, type MigrationHandler } from "./dispatch.js";
import type { ProviderSettingsService } from "../settings/provider-service.js";
import type { ProjectionHub } from "../codebase/projection-hub.js";
import type { ProjectionChannel } from "../codebase/projection-channel.js";
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
  migration?: MigrationHandler,
  settings?: ProviderSettingsService,
  projections?: ProjectionHub,
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
  const replay = new EventReplay(256, true);
  const connections = new Set<Socket>();
  const server = createServer((socket) => {
    if (connections.size >= 16) {
      socket.destroy();
      return;
    }
    connections.add(socket);
    const decoder = new FrameDecoder();
    let codebase: ProjectionChannel | undefined;
    const transfers = new ConnectionTransfers((spec, bytes) => {
      if (codebase?.expects(spec.id)) codebase.complete(spec.id, bytes);
    });
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
        const hello = handshake.accept(input, Date.now());
        session = new Session(pairing, ++epoch);
        if (projections && hello.capabilities?.includes("codebase.read"))
          codebase = projections.connect(session, send);
        socket.setTimeout(30_000);
        send({
          kind: "ready",
          connectionId: session.connectionId,
          connectionEpoch: session.connectionEpoch,
          capabilities: [
            ...(migration
              ? [
                  "heartbeat",
                  "resumeEvents",
                  "migration.status",
                  "migration.policy",
                  "migration.resume",
                  "migration.resumeSnapshot",
                  "migration.checkpoints",
                  ...(migration.settingsMode
                    ? ["migration.settings", "migration.consensus"]
                    : []),
                ]
              : ["heartbeat", "resumeEvents"]),
            ...(settings ? ["settings"] : []),
            ...(codebase ? ["codebase.read"] : []),
          ],
          taskReady: false,
        });
      } else {
        const command = session.accept(input, Date.now());
        const result = await dispatchCommand(command, {
          session,
          socket,
          replay,
          transfers,
          migration,
          settings,
          codebase,
        });
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
      if (session) projections?.disconnect(session.connectionId);
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
