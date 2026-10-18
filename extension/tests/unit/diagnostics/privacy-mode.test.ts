import { afterEach, expect, it, vi } from "vitest";
import { maskTraceValue } from "../../../src/diagnostics/trace-mask.js";
import { safeMethodTraceSnapshot } from "../../../src/diagnostics/trace-export.js";
import { rawTraceValue } from "../../../src/diagnostics/raw-trace.js";
import { diagnosticsPrivacy } from "../../../src/diagnostics/privacy-mode.js";

afterEach(() => vi.unstubAllGlobals());

it.each(["development", "release"])(
  "preserves the %s logging policy through content export",
  (mode) => {
    vi.stubGlobal("__CONTEXTPILOT_DIAGNOSTICS_MODE__", mode);
    const raw = mode === "development";
    const input = {
      target_name: "DEVELOPMENT_TARGET_LABEL",
      prompt: "DEVELOPMENT_PROMPT_BODY",
      api_key: "DEVELOPMENT_CREDENTIAL_VALUE",
      arguments: { checked: true },
    };
    const detail = maskTraceValue(input);
    expect(detail.masking.masked).toBe(!raw);
    const snapshot = safeMethodTraceSnapshot({
      ok: true,
      trace: {
        schema_version: 1,
        scope: "content",
        level: "trace",
        dropped_count: 0,
        methods: [],
        records: [
          {
            sequence: 1,
            timestamp_ms: 1,
            call_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            method: "content/entry.ts:1:projection",
            event: "method.input",
            level: "trace",
            detail,
          },
        ],
      },
    });
    const exported = JSON.stringify(snapshot);
    for (const marker of [input.target_name, input.prompt, input.api_key])
      expect(exported.includes(marker)).toBe(raw);
    expect(diagnosticsPrivacy()).toEqual({
      diagnostics_mode: mode,
      diagnostics_masked: !raw,
    });
  },
);

it("defaults to masked release diagnostics when no build value is defined", () => {
  expect(diagnosticsPrivacy().diagnostics_masked).toBe(true);
  expect(maskTraceValue({ target_name: "PRIVATE_LABEL" }).masking.masked).toBe(
    true,
  );
});

it("serializes development values without invoking getters or toJSON", () => {
  const getter = vi.fn(() => {
    throw new Error("getter executed");
  });
  const json = vi.fn(() => {
    throw new Error("toJSON executed");
  });
  const input: Record<string, unknown> = { target_name: "500", toJSON: json };
  Object.defineProperty(input, "value", { enumerable: true, get: getter });
  input.self = input;
  const array: unknown[] = [];
  Object.defineProperty(array, "0", { get: getter });
  input.array = array;
  const result = rawTraceValue(input);
  expect(getter).not.toHaveBeenCalled();
  expect(json).not.toHaveBeenCalled();
  expect(result.data).toMatchObject({
    target_name: "500",
    value: "[ACCESSOR_NOT_READ]",
    self: "[CIRCULAR]",
  });
  expect(result.masking.masked).toBe(false);
});

it("bounds raw values explicitly and retains caught error details", () => {
  const error = Object.assign(new Error("DEVELOPMENT_ERROR_MESSAGE"), {
    code: "PROVIDER_UNAVAILABLE",
    detail: "DEVELOPMENT_ERROR_DETAIL",
  });
  expect(rawTraceValue(error).data).toMatchObject({
    message: error.message,
    code: error.code,
    detail: error.detail,
  });
  const bounded = rawTraceValue({ body: "x".repeat(70_000) });
  expect(bounded.masking).toMatchObject({ masked: false, truncated: true });
  expect(JSON.stringify(bounded.data)).toContain("[TRUNCATED]");
});
