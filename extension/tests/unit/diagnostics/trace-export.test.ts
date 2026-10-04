import { expect, it } from "vitest";
import { safeMethodTraceSnapshot } from "../../../src/diagnostics/trace-export.js";
it("re-masks content data, preserves masking evidence, and rejects invalid records", () => {
  const safe = safeMethodTraceSnapshot({
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
          rogue_secret: "hidden",
          detail: {
            data: { password: "malicious-raw-secret" },
            masking: {
              masked: true,
              fields: [
                { path: "$.value", reason: "sensitive_field", count: 1 },
              ],
              truncated: false,
            },
          },
        },
        { method: "invalid" },
      ],
    },
  });
  expect(JSON.stringify(safe)).not.toContain("malicious-raw-secret");
  expect(JSON.stringify(safe)).not.toContain("rogue_secret");
  expect(safe?.rejected_count).toBe(1);
  expect(
    (safe?.records as Array<{ detail: { masking: { masked: boolean } } }>)[0]
      ?.detail.masking.masked,
  ).toBe(true);
});
