import { describe, expect, it, vi } from "vitest";
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
  base_url: "https://provider.example/v1",
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

  it("given_non_https_endpoint_when_validating_then_rejects_it", () => {
    expect(() => validateProviderBaseUrl("http://192.168.1.5:8080/v1")).toThrow(
      "INVALID_ARGUMENT",
    );
    expect(() => validateProviderBaseUrl("ftp://provider.test/v1")).toThrow(
      "INVALID_ARGUMENT",
    );
  });

  it("given_http_error_when_sending_then_exposes_status_without_body", async () => {
    const transport = new CoreProviderTransport(
      async () =>
        new Response("secret provider error", {
          status: 502,
          headers: { "content-type": "text/plain" },
        }),
    );
    await expect(
      transport.send(config("none"), openAiCompatibleAdapter, request),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      detail: "HTTP 502",
    });
  });

  it("given_structured_provider_error_when_sending_then_exposes_safe_code_and_message", async () => {
    const transport = new CoreProviderTransport(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "invalid_request_error",
              message: "Unsupported tools payload for model.",
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
    );
    await expect(
      transport.send(config("none"), openAiCompatibleAdapter, request),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      detail:
        "HTTP 400; invalid_request_error; Unsupported tools payload for model.",
    });
  });

  it("given_fetch_network_error_when_sending_then_classifies_network_boundary", async () => {
    const transport = new CoreProviderTransport(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      transport.send(config("none"), openAiCompatibleAdapter, request),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      detail: "network/CORS/PNA request failed",
    });
  });

  it("given_headers_when_body_is_still_owned_then_deadline_remains_active", async () => {
    vi.useFakeTimers();
    try {
      const transport = new CoreProviderTransport(
        async () =>
          new Response(new ReadableStream(), {
            headers: { "content-type": "application/json" },
          }),
      );

      const result = await transport.send(
        config("none"),
        openAiCompatibleAdapter,
        request,
      );
      expect(result.signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(result.signal.aborted).toBe(true);
      result.release();
    } finally {
      vi.useRealTimers();
    }
  });
});
