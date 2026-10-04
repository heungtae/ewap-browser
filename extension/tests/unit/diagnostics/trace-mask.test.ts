import { describe, expect, it } from "vitest";
import { maskTraceValue } from "../../../src/diagnostics/trace-mask.js";

describe("diagnostic masking with useful context", () => {
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
    expect(text).toContain("저장 버튼을 눌러줘");
    expect(text).toContain("No usable save button");
    expect(result.masking.masked).toBe(true);
    expect(result.masking.fields.map((field) => field.reason)).toContain(
      "credential_assignment",
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
    expect(JSON.stringify(result)).toContain("Saved");
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
      text: "x".repeat(20_000),
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
