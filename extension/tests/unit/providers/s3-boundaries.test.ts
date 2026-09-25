import { describe, expect, it } from "vitest";
import { assertSafeRequestPlan } from "../../../src/providers/openai-compatible.js";
import { validatePluginManifest } from "../../../src/providers/manifest.js";
import { providerHeaders } from "../../../src/providers/provider-request.js";
import { ProviderRegistry } from "../../../src/providers/registry.js";
import { ProviderRuntime } from "../../../src/providers/runtime.js";
import type {
  ProviderConfig,
  ProviderPluginManifest,
  ProviderRequestPlan,
} from "../../../src/providers/types.js";

const manifest: ProviderPluginManifest = {
  schema_version: 1,
  plugin_id: "example.closed",
  plugin_version: "1.0.0",
  api_version: 1,
  label: "Closed fixture",
  adapter_id: "contextpilot.openai-compatible",
  wire_apis: ["responses"],
  auth_schemes: ["none"],
};
const config: ProviderConfig = {
  plugin_id: manifest.plugin_id,
  plugin_version: manifest.plugin_version,
  label: "fixture",
  base_url: "https://provider.fixture.test/v1",
  wire_api: "responses",
  model: "fixture",
  api_key: "",
  api_key_header: "none",
  headers: [],
  timeout_ms: 1000,
  enabled: true,
};

describe("S3 plugin and provider boundaries", () => {
  it("rejects manifest execution fields and unsupported version or URL", () => {
    for (const field of [
      "cdp_method",
      "selector",
      "coordinates",
      "execution_path",
      "oauth",
      "token_endpoint",
      "refresh_token",
      "entry",
    ])
      expect(() =>
        validatePluginManifest({ ...manifest, [field]: "x" }),
      ).toThrow("INVALID_ARGUMENT");
    expect(() =>
      validatePluginManifest({ ...manifest, api_version: 2 }),
    ).toThrow("INVALID_ARGUMENT");
    expect(() =>
      validatePluginManifest({
        ...manifest,
        default_base_url: "http://provider.fixture.test/v1",
      }),
    ).toThrow("INVALID_ARGUMENT");
  });

  it("keeps installed manifests immutable and enforces wire/auth subsets", () => {
    const registry = new ProviderRegistry();
    registry.install(manifest);
    expect(() => registry.install(manifest)).toThrow(
      "PROVIDER_PLUGIN_INCOMPATIBLE",
    );
    expect(() =>
      registry.install({
        ...manifest,
        plugin_id: "contextpilot.openai-compatible",
      }),
    ).toThrow("PROVIDER_PLUGIN_INCOMPATIBLE");
    expect(() => registry.resolveConfigured(config)).not.toThrow();
    expect(() =>
      registry.resolveConfigured({ ...config, wire_api: "chat_completions" }),
    ).toThrow("PROVIDER_PLUGIN_INCOMPATIBLE");
    expect(() =>
      registry.resolveConfigured({
        ...config,
        api_key_header: "authorization_bearer",
      }),
    ).toThrow("PROVIDER_PLUGIN_INCOMPATIBLE");
    expect(() => registry.resolve(manifest.plugin_id, "2.0.0")).toThrow(
      "PROVIDER_PLUGIN_INCOMPATIBLE",
    );
    registry.setEnabled(manifest.plugin_id, false);
    expect(() => registry.resolveConfigured(config)).toThrow(
      "PROVIDER_PLUGIN_NOT_FOUND",
    );
    expect(() =>
      registry.resolve("webbrain.openai-compatible", "1.0.0"),
    ).not.toThrow();
    const snapshot = registry
      .snapshot()
      .find((plugin) => plugin.manifest.plugin_id === manifest.plugin_id);
    snapshot?.manifest.auth_schemes.push("authorization_bearer");
    registry.setEnabled(manifest.plugin_id, true);
    expect(() =>
      registry.resolveConfigured({
        ...config,
        api_key_header: "authorization_bearer",
      }),
    ).toThrow("PROVIDER_PLUGIN_INCOMPATIBLE");
  });

  it("rejects header duplicates, blanks, control and auth collisions", () => {
    for (const headers of [
      [
        { name: "X-A", value: "one" },
        { name: "x-a", value: "two" },
      ],
      [{ name: "", value: "one" }],
      [{ name: "X-A", value: " " }],
      [{ name: "X-A", value: "one\r\ntwo" }],
      [{ name: "Authorization", value: "one" }],
      [{ name: " api-key", value: "one" }],
    ])
      expect(() => providerHeaders({ ...config, headers })).toThrow(
        "INVALID_ARGUMENT",
      );
    expect(() =>
      providerHeaders({
        ...config,
        api_key_header: "authorization_bearer",
        api_key: " ",
      }),
    ).toThrow("INVALID_ARGUMENT");
  });

  it("rejects request plan browser fields and unexpected output keys", () => {
    const base: ProviderRequestPlan = {
      path: "/responses",
      body: { model: "fixture", input: [], stream: true },
    };
    for (const field of [
      "cdp_method",
      "selector",
      "coordinates",
      "execution_path",
      "headers",
      "api_key",
    ])
      expect(() =>
        assertSafeRequestPlan({
          ...base,
          body: { ...base.body, [field]: "x" },
        }),
      ).toThrow("PROVIDER_PLUGIN_FAILED");
    expect(() =>
      assertSafeRequestPlan({
        ...base,
        direct_fetch: true,
      } as ProviderRequestPlan),
    ).toThrow("PROVIDER_PLUGIN_FAILED");
  });

  it("rejects incompatible provider save before writing secret state", async () => {
    let stored: Record<string, unknown> = {};
    const runtime = new ProviderRuntime({
      async get() {
        return stored;
      },
      async set(value) {
        stored = value;
      },
    });
    runtime.registry.install(manifest);
    await expect(
      runtime.handle("PROVIDER_SAVE", {
        id: "closed",
        config: { ...config, wire_api: "chat_completions" },
      }),
    ).rejects.toThrow("PROVIDER_PLUGIN_INCOMPATIBLE");
    expect(stored).toEqual({});
  });
});
