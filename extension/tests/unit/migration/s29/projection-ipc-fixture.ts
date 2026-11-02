import { connect } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  NativeBridge,
  type NativePort,
} from "../../../../../apps/chrome-extension/src/bridge/native.js";
import {
  FrameDecoder,
  encodeFrame,
} from "../../../../../apps/agent-server/src/native/framing.js";
import {
  listenLocal,
  stopLocal,
} from "../../../../../apps/agent-server/src/ipc/server.js";
import { ProjectionHub } from "../../../../../apps/agent-server/src/codebase/projection-hub.js";
import { projectionFixture } from "./projection-fixture.js";
export async function projectionIpcFixture(
  rows = 3,
  padding = 0,
  enabled = true,
) {
  const f = await projectionFixture(rows, padding);
  const directory = await mkdtemp(`${tmpdir()}/s29-projection-`);
  const hub = new ProjectionHub(f.pairing);
  const server = await listenLocal(
    `${directory}/agent.sock`,
    { ...f.pairing, extensionIds: [f.pairing.extensionId] },
    undefined,
    undefined,
    hub,
  );
  const socket = connect(`${directory}/agent.sock`),
    decoder = new FrameDecoder();
  const receive: ((value: unknown) => void)[] = [],
    disconnect: (() => void)[] = [];
  let maxFrame = 0,
    chunks = 0;
  const closed = new Promise<void>((resolve) =>
    socket.once("close", () => {
      disconnect.forEach((fn) => fn());
      resolve();
    }),
  );
  socket.on("error", () => socket.destroy());
  socket.on("data", (data) => {
    for (const value of decoder.push(data)) receive.forEach((fn) => fn(value));
  });
  const port: NativePort = {
    postMessage(value) {
      const bytes = encodeFrame(value);
      maxFrame = Math.max(maxFrame, bytes.length - 4);
      if (
        (value as { payload?: { kind?: string } }).payload?.kind ===
        "transfer.chunk"
      )
        chunks++;
      socket.write(bytes);
    },
    disconnect: () => socket.destroy(),
    onMessage: {
      addListener: (fn) => {
        receive.push(fn);
      },
    },
    onDisconnect: {
      addListener: (fn) => {
        disconnect.push(fn);
      },
    },
  };
  const bridge = new NativeBridge(port, f.pairing, { codebase: enabled });
  await bridge.request({ kind: "capabilities" });
  const publish = () => bridge.publishProjection(f.read, f.admission);
  return {
    ...f,
    bridge,
    hub,
    publish,
    stats: () => ({ maxFrame, chunks }),
    async dispose() {
      bridge.close();
      await closed;
      await stopLocal(server);
      f.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
