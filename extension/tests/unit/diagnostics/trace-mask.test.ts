import { describe, expect, it } from "vitest";
import { maskTraceValue } from "../../../src/diagnostics/trace-mask.js";

describe("diagnostic masking with useful context", () => {
  it("withholds source echoed in provider deltas and nested answer messages", () => {
    const source = "function echoedCalculation(rows) { return rows; }";
    const result = maskTraceValue({
      delta: source,
      message: `Explanation: ${source}`,
      result: { message: source, code: "SOURCE_SEARCH_INCOMPLETE" },
      query: source,
      coverage: { complete: false },
    });
    expect(JSON.stringify(result)).not.toContain("echoedCalculation");
    expect(result.data).toMatchObject({
      result: { code: "SOURCE_SEARCH_INCOMPLETE" },
      coverage: { complete: false },
    });
  });
  it("withholds static source search excerpts while retaining coverage metadata", () => {
    const result = maskTraceValue({
      hits: [
        {
          resource_id: "opaque-source",
          excerpt: "function PRIVATE_SCRIPT_CODE() { return 7; }",
          byte_offset: 42,
        },
      ],
      coverage: { supplied_count: 1, complete: false },
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_SCRIPT_CODE");
    expect(JSON.stringify(result)).toContain("supplied_count");
    expect(result.masking.masked).toBe(true);
  });

  it("retains intent and failure evidence while reporting every masking decision", () => {
    const result = maskTraceValue({
      prompt:
        "저장 버튼을 눌러줘 password=super-private-value user@example.com",
      route: "ACTION_REQUIRED",
      tool_count: 0,
      response: "No usable save button",
      api_key: "arbitrary-provider-key",
      headers: { "x-custom": "custom-private" },
      records: [{ account: "private-cell" }],
    });
    const text = JSON.stringify(result);
    for (const secret of [
      "super-private-value",
      "user@example.com",
      "arbitrary-provider-key",
      "custom-private",
      "private-cell",
    ])
      expect(text).not.toContain(secret);
    expect(text).not.toContain("저장 버튼을 눌러줘");
    expect(text).toContain("ACTION_REQUIRED");
    expect(text).toContain("No usable save button");
    expect(result.masking.masked).toBe(true);
    expect(result.masking.fields.map((field) => field.reason)).toContain(
      "sensitive_field",
    );
    expect(
      result.masking.fields.some((field) => field.path === "$.headers"),
    ).toBe(true);
  });
  it("masks nested JSON and known credentials echoed under unrelated fields", () => {
    maskTraceValue({ api_key: "raw-provider-credential-12345" });
    const result = maskTraceValue({
      message:
        '{"authorization":"raw-provider-credential-12345","answer":"Saved"}',
      echo: "used raw-provider-credential-12345",
    });
    expect(JSON.stringify(result)).not.toContain(
      "raw-provider-credential-12345",
    );
    expect(JSON.stringify(result)).not.toContain("Saved");
  });
  it("does not invoke getters or read opaque browser object internals", () => {
    let reads = 0;
    const result = maskTraceValue({
      get password() {
        reads++;
        throw new Error("should never read");
      },
      signal: new AbortController().signal,
    });
    expect(reads).toBe(0);
    expect(result.masking.fields.map((field) => field.reason)).toEqual([
      "accessor",
      "opaque_instance",
    ]);
  });
  it("reports bounds and cycles without losing the closed failure reason", () => {
    const input: Record<string, unknown> = {
      reason: "PAGE_CHANGED",
      long_summary: "x".repeat(20_000),
    };
    input.loop = input;
    const result = maskTraceValue(input);
    expect(result.masking.truncated).toBe(true);
    expect(JSON.stringify(result)).toContain("PAGE_CHANGED");
    expect(JSON.stringify(result)).toContain("CIRCULAR");
  });
});

it("masks raw records inside wrapped Provider context while retaining coverage", () => {
  const result = maskTraceValue({
    content:
      '[UNTRUSTED_ANALYSIS_DATA]\n{"coverage":"partial","reason":"CONTEXT_TRUNCATED","records":[{"customer":"arbitrary confidential customer"}]}\n[/UNTRUSTED_ANALYSIS_DATA]',
  });
  expect(JSON.stringify(result)).not.toContain(
    "arbitrary confidential customer",
  );
  expect(JSON.stringify(result)).toContain("CONTEXT_TRUNCATED");
  expect(
    result.masking.fields.some((field) => field.path.endsWith(".records")),
  ).toBe(true);
});

it("redacts full approval values and legacy excerpts while preserving binding metadata", () => {
  const raw = "s15-middle-private";
  const result = maskTraceValue({
    action: {
      suggested_value: "x".repeat(512) + raw + "z".repeat(584),
      suggested_value_tail: raw,
      suggested_value_length: 1114,
      value_source_revision: 2,
    },
  });
  expect(JSON.stringify(result)).not.toContain(raw);
  expect(result.data).toMatchObject({
    action: { suggested_value_length: 1114, value_source_revision: 2 },
  });
});

it("redacts user requests and clarification echoes throughout conversation traces", () => {
  const value = "s15-raw-value-amber";
  const result = maskTraceValue({
    prompt: `Type ${value}`,
    messages: [
      {
        role: "user",
        content: `User clarification answer (revision 1): ${value}`,
      },
      {
        role: "tool",
        content: `[UNTRUSTED_TOOL_RESULT]\n${JSON.stringify({ answer: value, request_revision: 1 })}\n[/UNTRUSTED_TOOL_RESULT]`,
      },
    ],
    event: { type: "assistant_delta", text: value },
  });
  expect(JSON.stringify(result)).not.toContain(value);
  expect(JSON.stringify(result)).toContain("request_revision");
});

it("redacts a user request appended outside an untrusted page context", () => {
  const raw = "s15-appended-input";
  const result = maskTraceValue({
    content: `[UNTRUSTED_PAGE_READ_CONTEXT]page[/UNTRUSTED_PAGE_READ_CONTEXT]\nUser request: ${raw}`,
  });
  expect(JSON.stringify(result)).not.toContain(raw);
});

it("redacts streamed provider bodies and reasoning that echo input values", () => {
  const raw = "s15-stream-private";
  const result = maskTraceValue({
    body: `data: ${JSON.stringify({ choices: [{ delta: { content: raw } }] })}`,
    reasoning: raw,
  });
  expect(JSON.stringify(result)).not.toContain(raw);
});
