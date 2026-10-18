import { afterEach, expect, it, vi } from "vitest";
import {
  createProviderCallTrace,
  providerDiagnosticConfig,
  traceProviderHandling,
  traceProviderRequest,
  traceProviderResponse,
} from "../../../src/providers/provider-call-diagnostics.js";
import type { ProviderConfig } from "../../../src/providers/types.js";
import {
  methodTraceSnapshot,
  setMethodTraceLevel,
} from "../../../src/diagnostics/method-trace.js";

afterEach(() => vi.unstubAllGlobals());

it.each(["development", "release"])(
  "records full captured request/response/configuration only for %s builds",
  (mode) => {
    vi.stubGlobal("__CONTEXTPILOT_DIAGNOSTICS_MODE__", mode);
    setMethodTraceLevel("debug");
    const config: ProviderConfig = {
      plugin_id: "contextpilot.openai-compatible",
      plugin_version: "1.0.0",
      label: "fixture",
      base_url: "https://development-config.example",
      wire_api: "responses",
      model: "fixture",
      api_key: "DEVELOPMENT_API_VALUE",
      api_key_header: "authorization_bearer",
      headers: [],
      timeout_ms: 1000,
      enabled: true,
    };
    const trace = createProviderCallTrace(config, "result_acceptance");
    traceProviderRequest(trace, {
      wire_api: "responses",
      model: "fixture",
      stream: false,
      messages: [{ role: "user", content: "DEVELOPMENT_LLM_REQUEST" }],
    });
    const response = {
      content: "DEVELOPMENT_LLM_RESPONSE",
      tool_calls: [
        {
          id: "call-aaaaaaaaaaaaaaaa",
          name: "submit_answer_review",
          arguments: '{"verdict":"further_work"}',
        },
      ],
    };
    traceProviderResponse(trace, response);
    traceProviderHandling(response, {
      target_name: "DEVELOPMENT_TARGET_NAME",
      outcome: "blocked",
    });
    const records = methodTraceSnapshot("panel").records.filter((record) =>
      record.method.endsWith(`:${trace.provider_call_id}`),
    );
    const serialized = JSON.stringify(records);
    for (const marker of [
      "DEVELOPMENT_LLM_REQUEST",
      response.content,
      "DEVELOPMENT_TARGET_NAME",
    ])
      expect(serialized.includes(marker)).toBe(mode === "development");
    const exportedConfig = JSON.stringify(providerDiagnosticConfig(config));
    for (const marker of [config.api_key, config.base_url])
      expect(exportedConfig.includes(marker)).toBe(mode === "development");
  },
);
