import { describe, expect, it } from "vitest";
import {
  validateProviderBaseUrl,
  providerHttpHostPattern,
} from "../../../src/providers/provider-network-url.js";
import { ProviderRuntime } from "../../../src/providers/runtime.js";
import type { ProviderConfig } from "../../../src/providers/types.js";

const config: ProviderConfig = {
  plugin_id: "contextpilot.openai-compatible",
  plugin_version: "1.0.0",
  label: "local",
  base_url: "http://localhost:11434/v1",
  wire_api: "chat_completions",
  model: "fixture",
  api_key: "a-private-key",
  api_key_header: "authorization_bearer",
  headers: [{ name: "x-workspace", value: "a-private-header" }],
  timeout_ms: 1000,
  enabled: true,
};
const storage = () => {
  let values: Record<string, unknown> = {};
  return {
    async get(key: string) {
      return { [key]: values[key] };
    },
    async set(value: Record<string, unknown>) {
      values = { ...values, ...value };
    },
    snapshot() {
      return structuredClone(values);
    },
  };
};

describe("S4 provider settings and local network", () => {
  it("allows loopback HTTP and gated RFC1918 literals, rejects other HTTP targets", () => {
    expect(validateProviderBaseUrl("http://localhost:11434/v1").hostname).toBe(
      "localhost",
    );
    expect(validateProviderBaseUrl("http://127.0.0.1:11434/v1").hostname).toBe(
      "127.0.0.1",
    );
    expect(validateProviderBaseUrl("http://[::1]:11434/v1").hostname).toBe(
      "[::1]",
    );
    expect(
      providerHttpHostPattern(
        validateProviderBaseUrl("http://localhost:11434/v1"),
      ),
    ).toBe("http://localhost/*");
    expect(() =>
      validateProviderBaseUrl("http://192.168.1.20:11434/v1"),
    ).toThrow("INVALID_ARGUMENT");
    expect(
      validateProviderBaseUrl("http://192.168.1.20:11434/v1", true).hostname,
    ).toBe("192.168.1.20");
    for (const url of [
      "http://provider.example/v1",
      "http://8.8.8.8/v1",
      "http://localhost@evil.example/v1",
      "http://localhost/v1?token=x",
      "http://localhost/v1#fragment",
      "ftp://localhost/v1",
    ])
      expect(() => validateProviderBaseUrl(url, true)).toThrow(
        "INVALID_ARGUMENT",
      );
  });

  it("preserves legacy provider secrets when saving with the builtin identity", async () => {
    const area = storage();
    await area.set({
      provider_settings: {
        schema_version: 1,
        active_provider: "local",
        providers: { local: { ...config, plugin_id: "fixture.legacy" } },
      },
    });
    const runtime = new ProviderRuntime(area);
    await runtime.handle("PROVIDER_SAVE", {
      id: "local",
      config: {
        ...config,
        api_key: "",
        headers: [{ name: "x-workspace", value: "" }],
      },
    });
    expect(JSON.stringify(area.snapshot())).toContain("a-private-key");
    expect(JSON.stringify(area.snapshot())).toContain("a-private-header");
  });

  it("keeps a secret on a same-boundary blank write and never copies it to a new endpoint", async () => {
    const area = storage();
    const runtime = new ProviderRuntime(area);
    await runtime.handle("PROVIDER_SAVE", { id: "local", config });
    await runtime.handle("PROVIDER_SAVE", {
      id: "local",
      config: {
        ...config,
        model: "new-model",
        api_key: "",
        headers: [{ name: "x-workspace", value: "" }],
      },
    });
    expect(JSON.stringify(area.snapshot().provider_settings)).toContain(
      "a-private-key",
    );
    expect(JSON.stringify(area.snapshot().provider_settings)).toContain(
      "a-private-header",
    );
    await expect(
      runtime.handle("PROVIDER_SAVE", {
        id: "local",
        config: {
          ...config,
          base_url: "http://127.0.0.1:11434/v1",
          api_key: "",
          headers: [],
        },
      }),
    ).rejects.toThrow("INVALID_ARGUMENT");
    expect(JSON.stringify(area.snapshot().provider_settings)).toContain(
      "http://localhost:11434/v1",
    );
    await runtime.handle("PROVIDER_REMOVE", {
      id: "local",
      delete_secret: true,
    });
    expect(JSON.stringify(area.snapshot().provider_settings)).not.toContain(
      "a-private",
    );
  });

  it("ignores retired plugin metadata after restart and rejects plugin commands", async () => {
    const area = storage();
    await area.set({ provider_plugins: { malformed: true } });
    const runtime = new ProviderRuntime(area);
    await runtime.handle("PROVIDER_SAVE", { id: "local", config });
    const restarted = new ProviderRuntime(area);
    const listed = await restarted.handle("PROVIDER_LIST", undefined);
    expect(listed).not.toHaveProperty("plugins");
    expect(JSON.stringify(listed)).not.toContain("a-private");
    for (const kind of [
      "PLUGIN_INSTALL",
      "PLUGIN_SET_ENABLED",
      "PLUGIN_REMOVE",
    ])
      await expect(restarted.handle(kind, {})).rejects.toThrow(
        "INVALID_ARGUMENT",
      );
    await restarted.handle("PROVIDER_REMOVE", {
      id: "local",
      delete_secret: false,
    });
    expect(JSON.stringify(area.snapshot())).toContain("a-private-key");
    await expect(
      restarted.handle("PROVIDER_SET_ACTIVE", { id: "local" }),
    ).rejects.toThrow("PROVIDER_NOT_CONFIGURED");
  });
});
