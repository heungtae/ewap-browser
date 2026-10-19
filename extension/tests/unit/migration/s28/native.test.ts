import { build } from "esbuild";
import { expect, it } from "vitest";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listenLocal } from "../../../../../apps/agent-server/src/ipc/server.js";
import {
  NativeBridge,
  type NativePort,
} from "../../../../../apps/chrome-extension/src/bridge/native.js";
import {
  FrameDecoder,
  encodeFrame,
} from "../../../../../apps/agent-server/src/native/framing.js";
it("crosses browser adapter → real native subprocess → authenticated daemon", async () => {
  const directory = await mkdtemp(join(tmpdir(), "s28-native-"));
  const pairing = {
    installationId: randomUUID(),
    profileId: randomUUID(),
    extensionIds: ["a".repeat(32)],
    secret: randomBytes(32).toString("hex"),
    socketPath: join(directory, "agent.sock"),
  };
  const configPath = join(directory, "pairing.json");
  const launcher = join(directory, "launcher.cjs");
  await build({
    entryPoints: ["apps/agent-server/src/native/launcher.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    outfile: launcher,
  });
  await writeFile(configPath, JSON.stringify(pairing), { mode: 0o600 });
  const server = await listenLocal(pairing.socketPath, pairing);
  const child = spawn(
    process.execPath,
    [
      launcher,
      "native",
      configPath,
      `chrome-extension://${pairing.extensionIds[0]}/`,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const decoder = new FrameDecoder();
  const messages: ((value: unknown) => void)[] = [];
  const disconnects: (() => void)[] = [];
  const closed = new Promise<void>((resolveClosed) =>
    child.once("close", () => {
      disconnects.forEach((fn) => fn());
      resolveClosed();
    }),
  );
  child.stdout.on("data", (bytes) => {
    for (const value of decoder.push(bytes))
      messages.forEach((fn) => fn(value));
  });
  const port: NativePort = {
    postMessage: (value) => {
      child.stdin.write(encodeFrame(value));
    },
    disconnect: () => {
      child.stdin.end();
    },
    onMessage: {
      addListener: (fn) => {
        messages.push(fn);
      },
    },
    onDisconnect: {
      addListener: (fn) => {
        disconnects.push(fn);
      },
    },
  };
  const bridge = new NativeBridge(port, {
    ...pairing,
    extensionId: pairing.extensionIds[0]!,
  });
  try {
    expect(await bridge.request({ kind: "capabilities" })).toMatchObject({
      taskReady: false,
      browserReady: false,
    });
    expect(
      await bridge.request({ kind: "resumeEvents", afterSequence: 0 }),
    ).toMatchObject({ cursor: 0, resync: false, events: [] });
    bridge.close();
    await expect(bridge.request({ kind: "capabilities" })).rejects.toThrow(
      "BACKEND_UNAVAILABLE",
    );
  } finally {
    bridge.close();
    child.kill("SIGTERM");
    await closed;
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { force: true, recursive: true });
  }
});
