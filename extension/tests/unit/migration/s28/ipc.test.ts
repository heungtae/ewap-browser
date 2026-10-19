import { afterEach, expect, it } from "vitest";
import { connect, type Socket, type Server } from "node:net";
import { mkdtemp, chmod, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listenLocal } from "../../../../../apps/agent-server/src/ipc/server.js";
import {
  proof,
  type Pairing,
} from "../../../../../apps/agent-server/src/ipc/auth.js";
import { digest } from "../../../../../apps/agent-server/src/ipc/session.js";
import {
  FrameDecoder,
  encodeFrame,
} from "../../../../../apps/agent-server/src/native/framing.js";
const sockets: Socket[] = [];
const servers: Server[] = [];
const directories: string[] = [];
afterEach(async () => {
  sockets.forEach((s) => s.destroy());
  await Promise.all(
    servers
      .splice(0)
      .map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  );
  await Promise.all(
    directories.splice(0).map((d) => rm(d, { force: true, recursive: true })),
  );
});
const pairing: Pairing = {
  installationId: "installation",
  profileId: "profile",
  extensionIds: ["a".repeat(32)],
  secret: "b".repeat(64),
};
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "s28-ipc-"));
  directories.push(dir);
  const path = join(dir, "agent.sock");
  const server = await listenLocal(path, pairing);
  servers.push(server);
  const socket = connect(path);
  sockets.push(socket);
  const decoder = new FrameDecoder();
  const queue: unknown[] = [];
  let waiting: ((value: unknown) => void) | undefined;
  socket.on("data", (bytes) => {
    for (const message of decoder.push(bytes)) {
      if (waiting) {
        const next = waiting;
        waiting = undefined;
        next(message);
      } else queue.push(message);
    }
  });
  const next = async (): Promise<Record<string, unknown>> => {
    if (queue.length) return queue.shift() as Record<string, unknown>;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("IPC_TEST_TIMEOUT")),
        1000,
      );
      waiting = (value) => {
        clearTimeout(timer);
        resolve(value as Record<string, unknown>);
      };
    });
  };
  return { dir, path, socket, next };
}
it("authenticates over a real private Unix socket before commands and resumes by cursor", async () => {
  const t = await setup();
  expect((await stat(t.path)).mode & 0o777).toBe(0o600);
  const challenge = await t.next();
  const nonce = String(challenge.nonce);
  t.socket.write(
    encodeFrame({
      kind: "hello",
      major: 1,
      minor: 0,
      installationId: pairing.installationId,
      profileId: pairing.profileId,
      extensionId: pairing.extensionIds[0],
      nonce,
      proof: proof(pairing, nonce, pairing.extensionIds[0]!),
    }),
  );
  const ready = await t.next();
  expect(ready.kind).toBe("ready");
  const send = async (messageId: string, payload: unknown) => {
    const now = Date.now();
    t.socket.write(
      encodeFrame({
        major: 1,
        minor: 0,
        messageId,
        connectionId: ready.connectionId,
        connectionEpoch: ready.connectionEpoch,
        installationId: pairing.installationId,
        profileId: pairing.profileId,
        sender: "extension",
        sentAt: now,
        deadline: now + 1000,
        payloadDigest: digest(payload),
        payload,
      }),
    );
    return t.next();
  };
  expect(
    await send("connected", { kind: "browser.connected", generation: 1 }),
  ).toMatchObject({ messageId: "connected" });
  const resumed = await send("resume", {
    kind: "resumeEvents",
    afterSequence: 0,
  });
  expect(resumed).toMatchObject({
    result: {
      cursor: 1,
      resync: false,
      events: [{ kind: "browser.connected" }],
    },
  });
  await send("disconnect", { kind: "browser.disconnected" });
  expect(await send("caps", { kind: "capabilities" })).toMatchObject({
    result: { taskReady: false, browserReady: false },
  });
});
it("closes an unauthenticated command before state access", async () => {
  const t = await setup();
  await t.next();
  const closed = new Promise<void>((resolve) =>
    t.socket.once("close", () => resolve()),
  );
  t.socket.write(encodeFrame({ kind: "browser.connected", generation: 1 }));
  await closed;
  expect(t.socket.destroyed).toBe(true);
});
it("refuses a directory accessible by another user", async () => {
  const dir = await mkdtemp(join(tmpdir(), "s28-acl-"));
  directories.push(dir);
  await chmod(dir, 0o755);
  await expect(listenLocal(join(dir, "agent.sock"), pairing)).rejects.toThrow(
    "IPC_PRINCIPAL",
  );
});
