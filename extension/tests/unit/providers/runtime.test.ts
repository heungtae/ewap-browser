import { describe, expect, it } from "vitest";
import { ProviderRuntime } from "../../../src/providers/runtime.js";
import type { ProviderConfig } from "../../../src/providers/types.js";

const config: ProviderConfig = {
  plugin_id: "contextpilot.openai-compatible",
  plugin_version: "1.0.0",
  label: "fixture",
  base_url: "http://127.0.0.1:8080/v1",
  wire_api: "chat_completions",
  model: "fixture",
  api_key: "secret",
  api_key_header: "authorization_bearer",
  headers: [],
  timeout_ms: 1000,
  enabled: true,
};

describe("provider runtime", () => {
  it("given_provider_save_when_listing_then_secret_is_not_returned", async () => {
    let stored: Record<string, unknown> = {};
    const runtime = new ProviderRuntime({
      async get() {
        return stored;
      },
      async set(value) {
        stored = value;
      },
    });
    await expect(
      runtime.handle("PROVIDER_SAVE", { id: "local", config }),
    ).resolves.toMatchObject({ ok: true });
    const listed = await runtime.handle("PROVIDER_LIST", undefined);
    expect(JSON.stringify(listed)).not.toContain("secret");
  });

  it("given_unknown_runtime_message_then_fails_closed", async () => {
    const runtime = new ProviderRuntime({
      async get() {
        return {};
      },
      async set() {
        return undefined;
      },
    });
    await expect(runtime.handle("PROVIDER_RAW_HTTP", {})).rejects.toThrow(
      "INVALID_ARGUMENT",
    );
  });

  it("given_plugin_disable_then_provider_can_be_reenabled", async () => {
    let stored: Record<string, unknown> = {};
    const runtime = new ProviderRuntime({
      async get() {
        return stored;
      },
      async set(value) {
        stored = value;
      },
    });
    await runtime.handle("PROVIDER_SAVE", { id: "local", config });
    await runtime.handle("PLUGIN_SET_ENABLED", {
      plugin_id: "contextpilot.openai-compatible",
      enabled: false,
    });
    const disabled = await runtime.handle("PROVIDER_LIST", undefined);
    expect(
      (disabled.providers as Record<string, { enabled: boolean }>)["local"]
        ?.enabled,
    ).toBe(false);
    await runtime.handle("PLUGIN_SET_ENABLED", {
      plugin_id: "contextpilot.openai-compatible",
      enabled: true,
    });
    const enabled = await runtime.handle("PROVIDER_LIST", undefined);
    expect(
      (enabled.providers as Record<string, { enabled: boolean }>)["local"]
        ?.enabled,
    ).toBe(true);
  });
});
