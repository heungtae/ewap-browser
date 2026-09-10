import { describe, expect, it } from "vitest";
import { ProviderRuntime } from "../../../src/providers/runtime.js";
import { CoreProviderTransport } from "../../../src/providers/transport.js";
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

const testRequest = {
  id: "local",
  include_messages: true,
  request: {
    wire_api: "chat_completions" as const,
    model: "fixture",
    messages: [{ role: "user" as const, content: "connection test" }],
    stream: false,
  },
};

const runtimeFor = (response: Response) => {
  let stored: Record<string, unknown> = {};
  return new ProviderRuntime(
    {
      async get() {
        return stored;
      },
      async set(value) {
        stored = value;
      },
    },
    new CoreProviderTransport(async () => response),
  );
};

describe("provider connection test", () => {
  it("returns redacted request and response messages when diagnostics are enabled", async () => {
    const runtime = runtimeFor(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "연결되었습니다.",
                api_key: "provider-secret",
                endpoint: "https://provider.company.test/v1",
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await runtime.handle("PROVIDER_SAVE", { id: "local", config });

    await expect(runtime.handle("PROVIDER_TEST", testRequest)).resolves.toEqual(
      {
        ok: true,
        status: 200,
        diagnostics: {
          request: testRequest.request,
          response: {
            choices: [
              {
                message: {
                  content: "연결되었습니다.",
                  api_key: "[REDACTED]",
                  endpoint: "[REDACTED]",
                },
              },
            ],
          },
        },
      },
    );
  });

  it("returns the provider error detail with diagnostics when testing fails", async () => {
    const runtime = runtimeFor(
      new Response(JSON.stringify({ error: { message: "Bad model" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    await runtime.handle("PROVIDER_SAVE", { id: "local", config });

    await expect(
      runtime.handle("PROVIDER_TEST", testRequest),
    ).resolves.toMatchObject({
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      detail: "HTTP 400; Bad model",
      diagnostics: {
        error: { code: "PROVIDER_UNAVAILABLE", detail: "HTTP 400; Bad model" },
      },
    });
  });
});
