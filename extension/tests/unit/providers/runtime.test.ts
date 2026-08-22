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

  it("given_page_projection_tools_when_chatting_then_sends_system_and_tool_schema", async () => {
    let stored: Record<string, unknown> = {};
    let body: Record<string, unknown> | undefined;
    const runtime = new ProviderRuntime(
      {
        async get() {
          return stored;
        },
        async set(value) {
          stored = value;
        },
      },
      new CoreProviderTransport(async (_input, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "검색 결과는 현재 페이지에 있습니다.",
                },
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }),
    );
    await runtime.handle("PROVIDER_SAVE", { id: "local", config });

    await expect(
      runtime.chat({
        messages: [
          { role: "system", content: "system" },
          { role: "user", content: "[UNTRUSTED_PAGE_PROJECTION]{}" },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "read_semantic_projection",
              description: "Read the current page.",
              parameters: { type: "object" },
            },
          },
        ],
      }),
    ).resolves.toEqual({
      content: "검색 결과는 현재 페이지에 있습니다.",
      tool_calls: [],
    });
    expect(body).toMatchObject({
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "[UNTRUSTED_PAGE_PROJECTION]{}" },
      ],
      tools: [
        {
          type: "function",
          function: { name: "read_semantic_projection" },
        },
      ],
    });
  });

  it("given_provider_tool_call_when_chatting_then_normalizes_call", async () => {
    let stored: Record<string, unknown> = {};
    const runtime = new ProviderRuntime(
      {
        async get() {
          return stored;
        },
        async set(value) {
          stored = value;
        },
      },
      new CoreProviderTransport(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: "",
                    tool_calls: [
                      {
                        id: "call_1",
                        function: {
                          name: "read_semantic_projection",
                          arguments: "{}",
                        },
                      },
                    ],
                  },
                },
              ],
            }),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    );
    await runtime.handle("PROVIDER_SAVE", { id: "local", config });

    await expect(
      runtime.chat({ messages: [{ role: "user", content: "현재 페이지" }] }),
    ).resolves.toEqual({
      content: "",
      tool_calls: [
        { id: "call_1", name: "read_semantic_projection", arguments: "{}" },
      ],
    });
  });

  it("given_chat_completion_sse_when_chatting_then_emits_ordered_deltas", async () => {
    let stored: Record<string, unknown> = {};
    let request: Record<string, unknown> | undefined;
    const runtime = new ProviderRuntime(
      {
        async get() {
          return stored;
        },
        async set(value) {
          stored = value;
        },
      },
      new CoreProviderTransport(async (_input, init) => {
        request = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          [
            'data: {"choices":[{"delta":{"content":"첫 "}}]}',
            'data: {"choices":[{"delta":{"content":"응답"}}]}',
            "data: [DONE]",
          ].join("\n\n"),
          { headers: { "content-type": "text/event-stream" } },
        );
      }),
    );
    await runtime.handle("PROVIDER_SAVE", { id: "local", config });
    const deltas: string[] = [];
    await expect(
      runtime.chat(
        { messages: [{ role: "user", content: "현재 페이지" }] },
        { onDelta: (delta) => deltas.push(delta) },
      ),
    ).resolves.toEqual({ content: "첫 응답", tool_calls: [] });
    expect(deltas).toEqual(["첫 ", "응답"]);
    expect(request).toMatchObject({ stream: true });
  });

  it("given_responses_sse_lifecycle_event_when_chatting_then_waits_for_text_delta", async () => {
    let stored: Record<string, unknown> = {};
    const runtime = new ProviderRuntime(
      {
        async get() {
          return stored;
        },
        async set(value) {
          stored = value;
        },
      },
      new CoreProviderTransport(
        async () =>
          new Response(
            [
              'data: {"type":"response.created","response":{"id":"resp_1"}}',
              'data: {"type":"response.output_text.delta","delta":"페이지 "}',
              'data: {"type":"response.output_text.delta","delta":"요약"}',
              'data: {"type":"response.completed","response":{"id":"resp_1"}}',
            ].join("\n\n"),
            { headers: { "content-type": "text/event-stream" } },
          ),
      ),
    );
    await runtime.handle("PROVIDER_SAVE", {
      id: "local",
      config: { ...config, wire_api: "responses" },
    });
    const deltas: string[] = [];

    await expect(
      runtime.chat(
        { messages: [{ role: "user", content: "현재 페이지를 요약해" }] },
        { onDelta: (delta) => deltas.push(delta) },
      ),
    ).resolves.toEqual({ content: "페이지 요약", tool_calls: [] });
    expect(deltas).toEqual(["페이지 ", "요약"]);
  });

  it("given_responses_function_call_when_chatting_then_uses_call_id", async () => {
    let stored: Record<string, unknown> = {};
    const runtime = new ProviderRuntime(
      {
        async get() {
          return stored;
        },
        async set(value) {
          stored = value;
        },
      },
      new CoreProviderTransport(
        async () =>
          new Response(
            JSON.stringify({
              output: [
                {
                  id: "fc_123",
                  type: "function_call",
                  call_id: "call_123",
                  name: "read_semantic_projection",
                  arguments: "{}",
                },
              ],
            }),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    );
    await runtime.handle("PROVIDER_SAVE", {
      id: "local",
      config: { ...config, wire_api: "responses" },
    });

    await expect(
      runtime.chat({ messages: [{ role: "user", content: "현재 페이지" }] }),
    ).resolves.toEqual({
      content: "",
      tool_calls: [
        {
          id: "call_123",
          name: "read_semantic_projection",
          arguments: "{}",
        },
      ],
    });
  });

  it("given_responses_output_text_when_testing_then_requires_a_parseable_answer", async () => {
    let stored: Record<string, unknown> = {};
    const runtime = new ProviderRuntime(
      {
        async get() {
          return stored;
        },
        async set(value) {
          stored = value;
        },
      },
      new CoreProviderTransport(
        async () =>
          new Response(
            JSON.stringify({
              output: [
                {
                  type: "message",
                  content: [{ type: "output_text", text: "연결되었습니다." }],
                },
              ],
            }),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    );
    await runtime.handle("PROVIDER_SAVE", {
      id: "local",
      config: { ...config, wire_api: "responses" },
    });

    await expect(
      runtime.handle("PROVIDER_TEST", {
        id: "local",
        request: {
          wire_api: "responses",
          model: "fixture",
          messages: [{ role: "user", content: "connection test" }],
          stream: false,
        },
      }),
    ).resolves.toEqual({ ok: true, status: 200 });
  });
});
