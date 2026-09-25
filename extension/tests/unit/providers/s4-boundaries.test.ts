import { describe, expect, it } from "vitest";
import {
  validateProviderBaseUrl,
  providerHttpHostPattern,
} from "../../../src/providers/provider-network-url.js";
import { ProviderRuntime } from "../../../src/providers/runtime.js";
import { BUILTIN_OPENAI_COMPATIBLE } from "../../../src/providers/registry.js";
import type {
  ProviderConfig,
  ProviderPluginManifest,
} from "../../../src/providers/types.js";

const plugin: ProviderPluginManifest = {
  ...BUILTIN_OPENAI_COMPATIBLE,
  plugin_id: "fixture.local-provider",
  label: "Fixture local provider",
};
const config: ProviderConfig = {
  plugin_id: plugin.plugin_id,
  plugin_version: plugin.plugin_version,
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

  it("persists secret-free plugin manifest and lifecycle across worker restart", async () => {
    const area = storage();
    const runtime = new ProviderRuntime(area);
    await runtime.handle("PLUGIN_INSTALL", plugin);
    await runtime.handle("PROVIDER_SAVE", { id: "local", config });
    expect(JSON.stringify(area.snapshot().provider_plugins)).not.toContain(
      "a-private",
    );
    expect(
      JSON.stringify(await runtime.handle("PROVIDER_EXPORT", undefined)),
    ).not.toContain("a-private");
    const restarted = new ProviderRuntime(area);
    const listed = await restarted.handle("PROVIDER_LIST", undefined);
    expect(
      (listed.plugins as Array<{ manifest: { plugin_id: string } }>).some(
        (item) => item.manifest.plugin_id === plugin.plugin_id,
      ),
    ).toBe(true);
    expect(JSON.stringify(listed)).not.toContain("a-private");
    await restarted.handle("PLUGIN_SET_ENABLED", {
      plugin_id: plugin.plugin_id,
      enabled: false,
    });
    await expect(
      restarted.handle("PROVIDER_SET_ACTIVE", { id: "local" }),
    ).rejects.toThrow("PROVIDER_NOT_CONFIGURED");
    await restarted.handle("PLUGIN_SET_ENABLED", {
      plugin_id: plugin.plugin_id,
      enabled: true,
    });
    await restarted.handle("PROVIDER_SET_ACTIVE", { id: "local" });
    await restarted.handle("PLUGIN_REMOVE", {
      plugin_id: plugin.plugin_id,
      delete_linked_secrets: false,
    });
    expect(JSON.stringify(area.snapshot().provider_settings)).toContain(
      "a-private-key",
    );
    const afterRemove = new ProviderRuntime(area);
    await expect(
      afterRemove.handle("PROVIDER_SET_ACTIVE", { id: "local" }),
    ).rejects.toThrow("PROVIDER_NOT_CONFIGURED");
  });

  it("keeps a secret on a same-boundary blank write and never copies it to a new endpoint", async () => {
    const area = storage();
    const runtime = new ProviderRuntime(area);
    await runtime.handle("PLUGIN_INSTALL", plugin);
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

  it("rejects plugin manifests with execution or account fields", async () => {
    const runtime = new ProviderRuntime(storage());
    for (const field of [
      "entry",
      "cdp_method",
      "token_endpoint",
      "oauth",
      "account_endpoint",
    ])
      await expect(
        runtime.handle("PLUGIN_INSTALL", { ...plugin, [field]: "x" }),
      ).rejects.toThrow("INVALID_ARGUMENT");
  });
  it("rejects tampered persistent plugin metadata before serving provider commands", async () => {
    const area = storage();
    await area.set({
      provider_plugins: {
        schema_version: 1,
        builtin_enabled: true,
        plugins: [],
        api_key: "leak",
      },
    });
    const runtime = new ProviderRuntime(area);
    await expect(runtime.handle("PROVIDER_LIST", undefined)).rejects.toThrow(
      "PROVIDER_PLUGIN_INCOMPATIBLE",
    );
  });
});
