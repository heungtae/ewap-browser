import { expect, it, vi } from "vitest";
import { createOffscreenProviderBridge } from "../../../src/service-worker/offscreen-provider-bridge.js";
import type {
  BrowserChromeApi,
  BrowserPort,
} from "../../../src/service-worker/browser-api.js";

const setup = (response: () => Promise<unknown>) => {
  const createDocument = vi.fn(async () => undefined);
  const sendMessage = vi.fn(async (message: { kind: string }) =>
    message.kind === "OFFSCREEN_PROVIDER_READY_CHECK"
      ? { kind: "OFFSCREEN_PROVIDER_READY" }
      : response(),
  );
  const bridge = createOffscreenProviderBridge(
    {
      offscreen: { hasDocument: async () => false, createDocument },
      runtime: {
        id: "extension-id",
        getURL: (path: string) => `chrome-extension://extension-id/${path}`,
        sendMessage,
      },
    } as unknown as BrowserChromeApi,
    () => "a".repeat(22),
  );
  return { bridge, createDocument, sendMessage };
};

it("recreates an offscreen document removed between two requests", async () => {
  const { bridge, createDocument } = setup(async () => ({
    ok: true,
    status: 200,
    body: "{}",
  }));
  await bridge.fetch("https://provider.example/models", { method: "GET" });
  await bridge.fetch("https://provider.example/models", { method: "GET" });
  expect(createDocument).toHaveBeenCalledTimes(2);
});

it("aborts a request that never returns headers and rejects a late port", async () => {
  const { bridge, sendMessage } = setup(() => new Promise(() => undefined));
  const controller = new AbortController();
  const pending = bridge.fetch("https://provider.example/models", {
    method: "GET",
    signal: controller.signal,
  });
  await vi.waitFor(() =>
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "OFFSCREEN_FETCH" }),
    ),
  );
  const rejected = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  controller.abort();
  await rejected;
  const disconnect = vi.fn();
  bridge.handlePort({
    name: `contextpilot-provider:${"a".repeat(22)}`,
    sender: {
      id: "extension-id",
      url: "chrome-extension://extension-id/offscreen/index.html",
    },
    disconnect,
  } as unknown as BrowserPort);
  expect(disconnect).toHaveBeenCalledOnce();
});

it("aborts a stalled response body and disconnects its network port", async () => {
  const { bridge } = setup(async () => ({
    ok: true,
    status: 200,
    stream: true,
  }));
  const controller = new AbortController();
  const response = await bridge.fetch("https://provider.example/models", {
    method: "GET",
    signal: controller.signal,
  });
  const disconnect = vi.fn();
  bridge.handlePort({
    name: `contextpilot-provider:${"a".repeat(22)}`,
    sender: {
      id: "extension-id",
      url: "chrome-extension://extension-id/offscreen/index.html",
    },
    onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: vi.fn() },
    disconnect,
  } as unknown as BrowserPort);
  const rejected = expect(response.text()).rejects.toMatchObject({
    name: "AbortError",
  });
  controller.abort();
  await rejected;
  expect(disconnect).toHaveBeenCalledOnce();
});
