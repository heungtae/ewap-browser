import { describe, expect, it } from "vitest";
import { createOffscreenProviderBridge } from "../../../src/service-worker/offscreen-provider-bridge.js";
import type { BrowserChromeApi } from "../../../src/service-worker/browser-api.js";

describe("offscreen provider bridge", () => {
  it("waits for the offscreen message listener before forwarding a provider request", async () => {
    const messages: unknown[] = [];
    let created = false;
    const chrome = {
      offscreen: {
        hasDocument: async () => false,
        createDocument: async () => {
          created = true;
        },
      },
      runtime: {
        id: "extension-id",
        getURL: (path: string) => `chrome-extension://extension-id/${path}`,
        sendMessage: async (message: unknown) => {
          messages.push(message);
          if (
            (message as { kind?: unknown }).kind ===
            "OFFSCREEN_PROVIDER_READY_CHECK"
          )
            return { kind: "OFFSCREEN_PROVIDER_READY" };
          return {
            ok: true,
            stream: false,
            status: 200,
            content_type: "application/json",
            body: "{}",
          };
        },
        onMessage: { addListener: () => undefined },
        onConnect: { addListener: () => undefined },
      },
    } as unknown as BrowserChromeApi;
    const bridge = createOffscreenProviderBridge(chrome, () => "a".repeat(22));

    await expect(
      bridge.fetch("https://provider.example/v1/models", { method: "GET" }),
    ).resolves.toMatchObject({ status: 200 });

    expect(created).toBe(true);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ kind: "OFFSCREEN_PROVIDER_READY_CHECK" });
    expect(messages[1]).toMatchObject({ kind: "OFFSCREEN_FETCH" });
  });

  it("retries the readiness check when document creation finishes before its listener", async () => {
    let readinessChecks = 0;
    const messages: unknown[] = [];
    const chrome = {
      offscreen: {
        hasDocument: async () => true,
        createDocument: async () => undefined,
      },
      runtime: {
        id: "extension-id",
        getURL: (path: string) => `chrome-extension://extension-id/${path}`,
        sendMessage: async (message: unknown) => {
          messages.push(message);
          if (
            (message as { kind?: unknown }).kind ===
            "OFFSCREEN_PROVIDER_READY_CHECK"
          ) {
            readinessChecks += 1;
            return readinessChecks === 1
              ? undefined
              : { kind: "OFFSCREEN_PROVIDER_READY" };
          }
          return { ok: true, stream: false, status: 200, body: "{}" };
        },
        onMessage: { addListener: () => undefined },
        onConnect: { addListener: () => undefined },
      },
    } as unknown as BrowserChromeApi;
    const bridge = createOffscreenProviderBridge(chrome, () => "a".repeat(22));

    await bridge.fetch("https://provider.example/v1/models", { method: "GET" });

    expect(readinessChecks).toBe(2);
    expect(messages[2]).toMatchObject({ kind: "OFFSCREEN_FETCH" });
  });

  it("preserves the offscreen network diagnostic instead of replacing it", async () => {
    const chrome = {
      offscreen: {
        hasDocument: async () => true,
        createDocument: async () => undefined,
      },
      runtime: {
        id: "extension-id",
        getURL: (path: string) => `chrome-extension://extension-id/${path}`,
        sendMessage: async (message: unknown) =>
          (message as { kind?: unknown }).kind ===
          "OFFSCREEN_PROVIDER_READY_CHECK"
            ? { kind: "OFFSCREEN_PROVIDER_READY" }
            : {
                ok: false,
                detail: "browser network request failed (check TLS, proxy, VPN, DNS, redirect, or network policy)",
              },
        onMessage: { addListener: () => undefined },
        onConnect: { addListener: () => undefined },
      },
    } as unknown as BrowserChromeApi;
    const bridge = createOffscreenProviderBridge(chrome, () => "a".repeat(22));

    await expect(
      bridge.fetch("https://provider.example/v1/models", { method: "GET" }),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      detail:
        "browser network request failed (check TLS, proxy, VPN, DNS, redirect, or network policy)",
    });
  });
});
