import { describe, expect, it } from "vitest";
import {
  methodTraceSnapshot,
  setMethodTraceLevel,
  traceMethod,
  traceBranch,
  withMethodContext,
} from "../../../src/diagnostics/method-trace.js";

describe("method diagnostics", () => {
  it("withholds source callback arrays while retaining primary coverage", () => {
    const requestId = "44444444-4444-4444-4444-444444444444";
    setMethodTraceLevel("trace");
    traceMethod(
      "page-act-harness/resource-reader.ts:readResourceChunk",
      { requestId },
      () => {
        traceMethod(
          "page-act-harness/resource-reader.ts:readResourceChunk:callback0",
          ["function PRIVATE_SOURCE_LINE() {}", 0],
          () => ["function PRIVATE_SOURCE_LINE() {}"],
        );
        return { status: "AVAILABLE", coverage: { supplied_count: 1 } };
      },
    );
    const snapshot = JSON.stringify(methodTraceSnapshot("worker", requestId));
    expect(snapshot).not.toContain("PRIVATE_SOURCE_LINE");
    expect(snapshot).toContain("supplied_count");
  });

  it("keeps concurrent async requests separate and records rejection before rethrow", async () => {
    setMethodTraceLevel("trace");
    const first = "11111111-1111-1111-1111-111111111111";
    const second = "22222222-2222-2222-2222-222222222222";
    const invoke = (requestId: string, fail: boolean) =>
      traceMethod(
        "service-worker/test.ts:1:invoke",
        { requestId, tabId: 17, prompt: "click save password=private" },
        async (context) => {
          await Promise.resolve();
          return withMethodContext(context, () =>
            traceMethod("service-worker/test.ts:2:child", {}, () => {
              traceBranch(
                context,
                "service-worker/test.ts:1:invoke",
                "policy.allowed",
                !fail,
              );
              if (fail)
                throw new Error("password=private PROVIDER_UNAVAILABLE");
              return { state: "ANSWER", tool_count: 0 };
            }),
          );
        },
      );
    const outcomes = await Promise.allSettled([
      invoke(first, false),
      invoke(second, true),
    ]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const a = methodTraceSnapshot("worker", first);
    const b = methodTraceSnapshot("worker", second);
    expect(a.records.some((record) => record.event === "method.throw")).toBe(
      false,
    );
    expect(b.records.some((record) => record.event === "method.throw")).toBe(
      true,
    );
    expect(a.records.every((record) => record.request_id === first)).toBe(true);
    expect(JSON.stringify(b)).not.toContain("password=private");
    expect(JSON.stringify(b)).toContain("PROVIDER_UNAVAILABLE");
    expect(
      a.records.some(
        (record) =>
          record.event === "method.input" && record.detail.masking.masked,
      ),
    ).toBe(true);
  });
  it("honors debug threshold without losing entry/exit and branch logs", () => {
    setMethodTraceLevel("debug");
    traceMethod("service-worker/test.ts:3:debugOnly", {}, () => 42);
    const records = methodTraceSnapshot("panel").records.filter((record) =>
      record.method.endsWith(":debugOnly"),
    );
    expect(records.map((record) => record.event)).toEqual([
      "method.enter",
      "method.exit",
    ]);
    setMethodTraceLevel("trace");
  });
});

it("retains the causal input after hot loops evict chronological records", () => {
  setMethodTraceLevel("trace");
  const requestId = "44444444-4444-4444-4444-444444444444";
  traceMethod(
    "service-worker/test.ts:4:causalInput",
    { requestId, prompt: "저장 버튼을 눌러줘" },
    () => true,
  );
  for (let index = 0; index < 1100; index++)
    traceMethod("content/test.ts:1:hotLoop", { index }, () => index);
  const snapshot = methodTraceSnapshot("worker", requestId);
  expect(snapshot.dropped_count).toBeGreaterThan(0);
  expect(
    snapshot.records.some(
      (record) =>
        record.event === "method.input" &&
        record.method.endsWith(":causalInput") &&
        JSON.stringify(record.detail).includes("sensitive_field"),
    ),
  ).toBe(true);
  expect(JSON.stringify(snapshot.records)).not.toContain("저장 버튼");
});

it("prefers invocation ownership over a callback factory's boot-time closure", () => {
  setMethodTraceLevel("trace");
  const provider = traceMethod(
    "providers/test.ts:1:factory",
    {},
    (boot) => () =>
      traceMethod("providers/test.ts:2:chat", {}, () => "answer", boot),
  );
  const requestId = "55555555-5555-5555-5555-555555555555";
  traceMethod("service-worker/test.ts:5:owner", { requestId }, (owner) =>
    withMethodContext(owner, provider),
  );
  expect(
    methodTraceSnapshot("worker", requestId).records.some(
      (record) => record.method === "providers/test.ts:2:chat",
    ),
  ).toBe(true);
});
