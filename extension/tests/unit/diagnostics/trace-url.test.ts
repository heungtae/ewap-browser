import { describe, expect, it } from "vitest";
import { maskTraceValue } from "../../../src/diagnostics/trace-mask.js";
import { safeMethodTraceSnapshot } from "../../../src/diagnostics/trace-export.js";
import {
  methodTraceSnapshot,
  setMethodTraceLevel,
  traceMethod,
} from "../../../src/diagnostics/method-trace.js";

const url = "https://diagnostic-url.fixture.test/approved?tab=news#article";
describe("ISS-20261011-004 diagnostic URL visibility", () => {
  it("keeps full URLs and their origin/path fields through nested contexts", () => {
    const result = maskTraceValue({
      url,
      href: url,
      target_url: url,
      beforeUrl: url,
      expectedUrl: url,
      observed_url: url,
      endpoint: url,
      origin: "https://diagnostic-url.fixture.test",
      host: "diagnostic-url.fixture.test",
      path: "/approved",
      content: `[UNTRUSTED_TOOL_RESULT]\n${JSON.stringify({ target_url: url })}\n[/UNTRUSTED_TOOL_RESULT]`,
    });
    expect(result.data).toMatchObject({
      url,
      href: url,
      target_url: url,
      beforeUrl: url,
      expectedUrl: url,
      observed_url: url,
      endpoint: url,
      origin: "https://diagnostic-url.fixture.test",
      host: "diagnostic-url.fixture.test",
      path: "/approved",
    });
    expect(JSON.stringify(result)).toContain(url);
    expect(result.masking.masked).toBe(false);
  });
  it("does not learn public URL hosts as credentials for future records", () => {
    maskTraceValue({ redirect: url });
    expect(
      maskTraceValue({ route: "diagnostic-url.fixture.test" }).data,
    ).toMatchObject({ route: "diagnostic-url.fixture.test" });
  });
  it("keeps credentials masked inside URL fields and leaves data images opaque", () => {
    const secret = "url-provider-credential-123456";
    maskTraceValue({ api_key: secret });
    const result = maskTraceValue({
      url: `${url}&key=${secret}`,
      target_url: "https://user:private-pass@public.fixture.test/approved",
      api_key: secret,
      data_url: "data:image/png;base64,private-image",
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("private-pass");
    expect(JSON.stringify(result)).not.toContain("private-image");
    expect(JSON.stringify(result)).toContain("public.fixture.test/approved");
  });
  it("preserves bare navigation method URL results while still hiding entered values", () => {
    const requestId = "77777777-7777-4777-8777-777777777777";
    setMethodTraceLevel("trace");
    traceMethod(
      "service-worker/url-test.ts:1:navigationTarget",
      { requestId },
      () => url,
    );
    traceMethod(
      "page-act-harness/value-binding.ts:1:bind",
      { requestId },
      () => url,
    );
    traceMethod(
      "service-worker/url-test.ts:2:insertText",
      { requestId },
      () => url,
    );
    const records = methodTraceSnapshot("worker", requestId).records;
    const results = records.filter((r) => r.event === "method.result");
    expect(
      JSON.stringify(
        results.find((r) => r.method.endsWith(":navigationTarget")),
      ),
    ).toContain(url);
    expect(
      JSON.stringify(results.find((r) => r.method.endsWith(":bind"))),
    ).not.toContain(url);
    expect(
      JSON.stringify(results.find((r) => r.method.endsWith(":insertText"))),
    ).not.toContain(url);
  });
  it("retains URL comparisons during the exported Content trace re-mask", () => {
    const result = safeMethodTraceSnapshot({
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
            method: "content/entry.ts:1:navigation",
            event: "method.result",
            level: "trace",
            detail: {
              data: { target_url: url },
              masking: { masked: false, fields: [], truncated: false },
            },
          },
        ],
      },
    });
    expect(JSON.stringify(result)).toContain(url);
  });
});
