import { expect, it } from "vitest";
import { connect } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listenLocal,
  stopLocal,
} from "../../../../../apps/agent-server/src/ipc/server.js";
import { proof } from "../../../../../apps/agent-server/src/ipc/auth.js";
import { digest } from "../../../../../apps/agent-server/src/ipc/session.js";
import {
  FrameDecoder,
  encodeFrame,
} from "../../../../../apps/agent-server/src/native/framing.js";

it("closes an authenticated socket that reconnects a stale browser generation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "s28-generation-"));
  const pairing = {
    installationId: "install",
    profileId: "profile",
    extensionIds: ["a".repeat(32)],
    secret: "b".repeat(64),
  };
  const path = join(directory, "agent.sock");
  const server = await listenLocal(path, pairing);
  const socket = connect(path);
  const decoder = new FrameDecoder();
  const queue: Record<string, unknown>[] = [];
  let waiting: ((value: Record<string, unknown>) => void) | undefined;
  socket.on("data", (bytes) => {
    for (const raw of decoder.push(bytes)) {
      const value = raw as Record<string, unknown>;
      if (waiting) {
        const resolve = waiting;
        waiting = undefined;
        resolve(value);
      } else queue.push(value);
    }
  });
  const next = () =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const value = queue.shift();
      if (value) return resolve(value);
      const timer = setTimeout(
        () => reject(new Error("IPC_TEST_TIMEOUT")),
        2000,
      );
      waiting = (item) => {
        clearTimeout(timer);
        resolve(item);
      };
    });
  try {
    const challenge = await next();
    const nonce = String(challenge.nonce);
    socket.write(
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
    const ready = await next();
    const send = (messageId: string, payload: unknown) => {
      const now = Date.now();
      socket.write(
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
          deadline: now + 2000,
          payloadDigest: digest(payload),
          payload,
        }),
      );
    };
    send("first", { kind: "browser.connected", generation: 2 });
    await next();
    send("disconnect", { kind: "browser.disconnected" });
    await next();
    const closed = new Promise<void>((resolve) =>
      socket.once("close", resolve),
    );
    send("stale", { kind: "browser.connected", generation: 2 });
    await closed;
    expect(socket.destroyed).toBe(true);
  } finally {
    socket.destroy();
    await stopLocal(server);
    await rm(directory, { recursive: true, force: true });
  }
});
