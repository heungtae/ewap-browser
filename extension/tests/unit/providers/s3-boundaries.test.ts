import { describe, expect, it } from "vitest";
import { assertSafeRequestPlan } from "../../../src/providers/openai-compatible.js";
import { providerHeaders } from "../../../src/providers/provider-request.js";
import { ProviderRuntime } from "../../../src/providers/runtime.js";
import type {
  ProviderConfig,
  ProviderRequestPlan,
} from "../../../src/providers/types.js";

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

describe("provider boundaries", () => {
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
    await expect(
      runtime.handle("PROVIDER_SAVE", {
        id: "closed",
        config: { ...config, wire_api: "unsupported" },
      }),
    ).rejects.toThrow("INVALID_ARGUMENT");
    expect(stored).toEqual({});
  });
});
