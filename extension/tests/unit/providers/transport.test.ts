import { describe, expect, it } from "vitest";
import { openAiCompatibleAdapter } from "../../../src/providers/openai-compatible.js";
import {
  CoreProviderTransport,
  validateProviderBaseUrl,
} from "../../../src/providers/transport.js";
import type { ProviderConfig } from "../../../src/providers/types.js";

const config = (scheme: ProviderConfig["api_key_header"]): ProviderConfig => ({
  plugin_id: "contextpilot.openai-compatible",
  plugin_version: "1.0.0",
  label: "fixture",
  base_url: "http://127.0.0.1:8080/v1",
  wire_api: "chat_completions",
  model: "fixture-model",
  api_key: scheme === "none" ? "" : "test-secret",
  api_key_header: scheme,
  headers: [{ name: "X-Company-Client", value: "fixture" }],
  timeout_ms: 1000,
  enabled: true,
});
const request = {
  wire_api: "chat_completions" as const,
  model: "fixture-model",
  messages: [{ role: "user" as const, content: "hello" }],
  stream: true,
};

describe("core provider transport", () => {
  it.each([
    ["authorization_bearer", "authorization", "Bearer test-secret"],
    ["api-key", "api-key", "test-secret"],
    ["x-goog-api-key", "x-goog-api-key", "test-secret"],
  ] as const)(
    "given_%s_when_sending_then_core_injects_exact_header",
    async (scheme, name, expected) => {
      let captured: RequestInit | undefined;
      const transport = new CoreProviderTransport(async (_url, init) => {
        captured = init;
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });
      await transport.send(config(scheme), openAiCompatibleAdapter, request);
      expect(new Headers(captured?.headers).get(name)).toBe(expected);
      expect(new Headers(captured?.headers).get("X-Company-Client")).toBe(
        "fixture",
      );
      expect(String(captured?.body)).not.toContain("test-secret");
    },
  );

  it("given_conflicting_static_auth_header_when_sending_then_fails_closed", async () => {
    const transport = new CoreProviderTransport(async () => new Response("{}"));
    await expect(
      transport.send(
        {
          ...config("api-key"),
          headers: [{ name: "Authorization", value: "bad" }],
        },
        openAiCompatibleAdapter,
        request,
      ),
    ).rejects.toThrow("INVALID_ARGUMENT");
  });

  it("given_private_http_endpoint_when_not_opted_in_then_rejected", () => {
    expect(() => validateProviderBaseUrl("http://192.168.1.5:8080/v1")).toThrow(
      "INVALID_ARGUMENT",
    );
    expect(() =>
      validateProviderBaseUrl("http://192.168.1.5:8080/v1", true),
    ).not.toThrow();
  });
});
