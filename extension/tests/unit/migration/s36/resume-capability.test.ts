import { expect, it, vi } from "vitest";
import {
  NativeBridge,
  type NativePort,
} from "../../../../../apps/chrome-extension/src/bridge/native.js";
it("does not dispatch snapshot to a peer advertising only the older resume capability", async () => {
  let receive: (value: unknown) => void = () => {};
  const postMessage = vi.fn();
  const port: NativePort = {
    postMessage,
    disconnect() {},
    onMessage: {
      addListener(callback) {
        receive = callback;
      },
    },
    onDisconnect: { addListener() {} },
  };
  const bridge = new NativeBridge(port, {
    installationId: "install",
    profileId: "profile",
    extensionId: "a".repeat(32),
    secret: "b".repeat(64),
  });
  try {
    receive({ kind: "challenge", major: 1, minor: 0, nonce: "c".repeat(64) });
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({ kind: "hello" });
    receive({
      kind: "ready",
      connectionId: "10000000-0000-4000-8000-000000000001",
      connectionEpoch: 1,
      capabilities: ["heartbeat", "resumeEvents", "migration.resume"],
      taskReady: false,
    });
    await expect(
      bridge.request({ kind: "migration.resume.snapshot" }),
    ).rejects.toThrow("MIGRATION_UNAVAILABLE");
    expect(postMessage).toHaveBeenCalledTimes(1);
  } finally {
    bridge.close();
  }
});
