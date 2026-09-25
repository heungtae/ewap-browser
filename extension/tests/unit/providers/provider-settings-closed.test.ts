import { describe, expect, it } from "vitest";
import { ProviderRuntime } from "../../../src/providers/runtime.js";
import type { ProviderConfig } from "../../../src/providers/types.js";

const config: ProviderConfig = {
  plugin_id: "contextpilot.openai-compatible",
  plugin_version: "1.0.0",
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

describe("S3 Provider settings input", () => {
  it("rejects OAuth, token and browser authority fields before persistence", async () => {
    let stored: Record<string, unknown> = {};
    const runtime = new ProviderRuntime({
      async get() {
        return stored;
      },
      async set(value) {
        stored = value;
      },
    });
    for (const field of [
      "oauth",
      "token_endpoint",
      "refresh_token",
      "cdp_method",
      "selector",
      "coordinates",
      "execution_path",
    ]) {
      await expect(
        runtime.handle("PROVIDER_SAVE", {
          id: "fixture",
          config: { ...config, [field]: "x" },
        }),
      ).rejects.toThrow("INVALID_ARGUMENT");
      expect(stored).toEqual({});
    }
  });

  it("rejects invalid static headers and auth before persistence", async () => {
    let stored: Record<string, unknown> = {};
    const runtime = new ProviderRuntime({
      async get() {
        return stored;
      },
      async set(value) {
        stored = value;
      },
    });
    for (const invalid of [
      { headers: [{ name: "X-A", value: "one\ntwo" }] },
      { headers: [{ name: "Authorization", value: "bad" }] },
      { api_key: "unexpected" },
      { api_key_header: "oauth_pkce" },
    ]) {
      await expect(
        runtime.handle("PROVIDER_SAVE", {
          id: "fixture",
          config: { ...config, ...invalid },
        }),
      ).rejects.toThrow();
      expect(stored).toEqual({});
    }
  });

  it("fails closed on unsupported stored schema", async () => {
    const runtime = new ProviderRuntime({
      async get() {
        return {
          provider_settings: {
            schema_version: 0,
            providers: { fixture: { type: "openai_compatible" } },
          },
        };
      },
      async set() {
        throw new Error("unexpected write");
      },
    });
    await expect(runtime.handle("PROVIDER_LIST", undefined)).rejects.toThrow(
      "INVALID_ARGUMENT",
    );
  });
});
