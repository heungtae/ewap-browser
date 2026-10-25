import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { IDBFactory } from "fake-indexeddb";
import { waitFor } from "../../chrome-cdp-utils.mjs";
import {
  NativeBridge,
  FrameDecoder,
  encodeFrame,
  migrationTransport,
  migrationProfileGuard,
  policySource,
  Mg02Staging,
  openDatabase,
  MigrationJournal,
} from "../../../dist/s36/transport.mjs";
export async function fixture(seed = true) {
  const directory = await mkdtemp(`${tmpdir()}/s36-rpc-`),
    configPath = `${directory}/pairing.json`;
  const config = {
    installationId: randomUUID(),
    profileId: randomUUID(),
    extensionIds: ["a".repeat(32)],
    secret: randomBytes(32).toString("hex"),
    socketPath: `${directory}/agent.sock`,
  };
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  const profile = await migrationProfileGuard(
    config.installationId,
    config.profileId,
  );
  const data = policySource(),
    original = JSON.stringify(data);
  const source = {
    async get() {
      return structuredClone(data);
    },
    async assertFrozen(epoch) {
      if (epoch !== 1) throw new Error("SOURCE_NOT_FROZEN");
    },
  };
  const idb = await openDatabase(new IDBFactory(), profile),
    staging = new Mg02Staging(idb, source);
  const digest = await staging.sourceDigest(1),
    checkpoint = await staging.stage("wire", 1, digest);
  const dbPath = `${directory}/migration.sqlite`;
  if (seed) {
    const db = new DatabaseSync(dbPath);
    const journal = new MigrationJournal(db);
    const epoch = journal.fence();
    journal.write(undefined, {
      manifest: {
        migrationId: "wire",
        profileGuard: profile,
        sourceSchemas: "controlled-source",
        targetSchemas: "controlled-target",
        legacyRelease: "legacy",
        targetRelease: "target",
        sourceDigests: Object.fromEntries(
          ["MG01", "MG02", "MG03", "MG04", "MG05", "MG06"].map((unit) => [
            unit,
            digest,
          ]),
        ),
      },
      revision: 0,
      epoch,
      phase: "prepared",
      stores: {},
      acknowledgments: {},
    });
    db.close();
    const { chmod } = await import("node:fs/promises");
    await chmod(dbPath, 0o600);
  }
  let daemon, daemonClosed;
  const peers = [];
  async function start(legacy = false) {
    daemon = spawn(
      process.execPath,
      legacy
        ? [resolve("dist/s28/agent-server/launcher.cjs"), "daemon", configPath]
        : [resolve("scripts/s36/transport/daemon.mjs"), configPath],
      { stdio: "ignore" },
    );
    daemonClosed = new Promise((r) => daemon.once("close", r));
    await waitFor(
      () =>
        access(config.socketPath)
          .then(() => true)
          .catch(() => false),
      4000,
      "RPC_SOCKET",
    );
  }
  async function stop() {
    daemon.kill("SIGTERM");
    await daemonClosed;
  }
  function client(patch = {}) {
    const child = spawn(
      process.execPath,
      [
        resolve("dist/s28/agent-server/launcher.cjs"),
        "native",
        configPath,
        `chrome-extension://${config.extensionIds[0]}/`,
      ],
      { stdio: ["pipe", "pipe", "ignore"] },
    );
    const done = new Promise((r) => child.once("close", r));
    peers.push({ child, done });
    const messages = [],
      closed = [];
    const decoder = new FrameDecoder();
    child.stdout.on("data", (bytes) => {
      for (const value of decoder.push(bytes))
        for (const callback of messages) callback(value);
    });
    child.once("close", () => closed.forEach((callback) => callback()));
    const bridge = new NativeBridge(
      {
        postMessage: (value) => child.stdin.write(encodeFrame(value)),
        disconnect() {
          child.kill("SIGTERM");
        },
        onMessage: { addListener: (callback) => messages.push(callback) },
        onDisconnect: { addListener: (callback) => closed.push(callback) },
      },
      {
        installationId: config.installationId,
        profileId: config.profileId,
        extensionId: config.extensionIds[0],
        secret: config.secret,
        ...patch,
      },
    );
    return {
      bridge,
      rpc: migrationTransport(profile, (value) => bridge.request(value)),
    };
  }
  await start();
  return {
    directory,
    config,
    profile,
    staging,
    checkpoint,
    data,
    original,
    client,
    start,
    stop,
    dbPath,
    async close() {
      for (const p of peers) p.child.kill("SIGTERM");
      await Promise.all(peers.map((p) => p.done));
      await stop();
      idb.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
