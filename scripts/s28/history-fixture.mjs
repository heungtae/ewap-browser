import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { connect } from "node:net";
import {
  TaskStore,
  TaskHistoryService,
  Session,
  NativeBridge,
  FrameDecoder,
  encodeFrame,
  listenLocal,
  stopLocal,
} from "../../dist/s28/history.mjs";
export async function fixture() {
  const root = await mkdtemp(`${tmpdir()}/s28-history-`),
    path = `${root}/tasks.sqlite`;
  let db = new DatabaseSync(path),
    tasks = new TaskStore(db);
  const pairing = {
    installationId: randomUUID(),
    profileId: randomUUID(),
    extensionId: "a".repeat(32),
    secret: "b".repeat(64),
  };
  const serverPairing = {
    ...pairing,
    extensionIds: [pairing.extensionId, "c".repeat(32)],
  };
  const task = tasks.admit({
    requestId: "history_fixture",
    digest: "d".repeat(64),
    profileId: pairing.profileId,
    owner: "trusted_owner",
    tabId: 1,
    mode: "act",
    deadline: Date.now() + 60000,
    activeLimit: 30000,
    attemptLimit: 64,
  });
  let checks = 0;
  const service = () =>
    new TaskHistoryService(tasks, (principal, taskId) => {
      checks++;
      return taskId === task.id &&
        principal.installationId === pairing.installationId &&
        principal.profileId === pairing.profileId &&
        principal.extensionId === pairing.extensionId
        ? "trusted_owner"
        : null;
    });
  let endpoint = service(),
    server;
  const session = new Session(serverPairing, 1, pairing.extensionId);
  const peers = [];
  return {
    root,
    pairing,
    serverPairing,
    task,
    session,
    get db() {
      return db;
    },
    get tasks() {
      return tasks;
    },
    get endpoint() {
      return endpoint;
    },
    get checks() {
      return checks;
    },
    async start() {
      server = await listenLocal(
        `${root}/agent.sock`,
        serverPairing,
        undefined,
        undefined,
        undefined,
        endpoint,
      );
    },
    async peer(extensionId = pairing.extensionId, history = true) {
      const socket = connect(`${root}/agent.sock`),
        decoder = new FrameDecoder(),
        receive = [],
        disconnect = [];
      socket.on("data", (bytes) => {
        for (const value of decoder.push(bytes))
          receive.forEach((fn) => fn(value));
      });
      socket.on("error", () => socket.destroy());
      const closed = new Promise((r) =>
        socket.once("close", () => {
          disconnect.forEach((fn) => fn());
          r();
        }),
      );
      const bridge = new NativeBridge(
        {
          postMessage: (value) => socket.write(encodeFrame(value)),
          disconnect: () => socket.destroy(),
          onMessage: { addListener: (fn) => receive.push(fn) },
          onDisconnect: { addListener: (fn) => disconnect.push(fn) },
        },
        { ...pairing, extensionId },
        { history },
      );
      peers.push({ bridge, closed });
      await bridge.request({ kind: "capabilities" });
      return bridge;
    },
    append(count) {
      db.exec("BEGIN IMMEDIATE");
      try {
        for (let i = 0; i < count; i++) {
          task.revision++;
          task.phase = "running";
          tasks.save(task);
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    restartStore() {
      db.close();
      db = new DatabaseSync(path);
      tasks = new TaskStore(db);
      endpoint = service();
    },
    async close() {
      for (const { bridge, closed } of peers) {
        bridge.close();
        await closed;
      }
      if (server) await stopLocal(server);
      db.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
