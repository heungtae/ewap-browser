import { afterEach, expect, it, vi } from "vitest";
import type { PageApiIntent } from "../../../src/contracts/page-api-types.js";
import {
  createPageApiRunner,
  pageApiApprovalDigest,
} from "../../../src/service-worker/page-api-runner.js";
import { pageApiCompletionDigest } from "../../../src/service-worker/page-api-main.js";

const base = (): PageApiIntent => {
  const unsigned = {
    kind: "page_api" as const,
    frame_id: 0 as const,
    origin: "https://page-api-fixture.invalid",
    adapter_id: "fixture_variant",
    adapter_version: 1,
    action_id: "select_variant",
    option_id: "high",
    completion_digest: pageApiCompletionDigest({
      control_name: "Variant",
      option_name: "Variant",
    }),
    capability: "page_api" as const,
  };
  return {
    ...unsigned,
    run_id: "run-abcdefghijklmnop",
    tab_id: 1,
    document_id: "document-abcdefghijkl",
    document_epoch: "epoch-abcdefghijklmnop",
    page_scope_epoch: "scope-abcdefghijklmnop",
    approval_digest: pageApiApprovalDigest(unsigned),
  };
};
const setup = () => {
  const intent = base();
  const scope = {
    document_epoch: intent.document_epoch,
    page_scope_epoch: intent.page_scope_epoch,
  };
  const document = {
    epoch: intent.document_epoch,
    documentId: intent.document_id,
  };
  const executeScript = vi.fn(async (call: { args: unknown[] }) => [
    {
      frameId: 0,
      documentId: document.documentId,
      result: call.args.length ? "called" : true,
    },
  ]);
  const observe = vi.fn(async () =>
    executeScript.mock.calls.length > 1
      ? ("satisfied" as const)
      : ("pending" as const),
  );
  const beforeDispatch = vi.fn(async () => undefined);
  const runner = createPageApiRunner({
    scripting: { executeScript },
    beforeDispatch,
    documentFor: () => document,
    scope: () => scope,
    observe,
  });
  return {
    intent,
    scope,
    document,
    executeScript,
    observe,
    beforeDispatch,
    runner,
  };
};
afterEach(() => vi.useRealTimers());

it("API-01 pins probe and dispatch to MAIN document then verifies independently", async () => {
  const s = setup();
  expect(await s.runner.execute(s.intent, "/variant")).toEqual({
    ok: true,
    outcome: "VERIFIED",
  });
  expect(s.executeScript).toHaveBeenCalledTimes(2);
  expect(s.beforeDispatch).toHaveBeenCalledOnce();
  expect(s.executeScript.mock.calls[1]![0]).toMatchObject({
    world: "MAIN",
    target: { tabId: 1, documentIds: [s.intent.document_id] },
    args: ["fixture_variant", "select_variant", "high"],
  });
});
it("API-02 already satisfied never invokes or writes a dispatch marker", async () => {
  const s = setup();
  s.observe.mockResolvedValue("satisfied");
  expect(await s.runner.execute(s.intent, "/variant")).toEqual({
    ok: true,
    outcome: "ALREADY_SATISFIED",
  });
  expect(s.executeScript).toHaveBeenCalledOnce();
  expect(s.beforeDispatch).not.toHaveBeenCalled();
});
it.each([false, "page secret", { ok: true }])(
  "API-03 missing/invalid probe does not dispatch: %j",
  async (result) => {
    const s = setup();
    s.executeScript.mockResolvedValue([
      { frameId: 0, documentId: s.intent.document_id, result: result as never },
    ]);
    expect(await s.runner.execute(s.intent, "/variant")).toMatchObject({
      outcome: "FAILED",
      code: "PAGE_API_UNAVAILABLE",
    });
    expect(s.beforeDispatch).not.toHaveBeenCalled();
  },
);
it.each([
  { option_id: "eval(secret)" },
  { adapter_version: 2 },
  { origin: "https://evil.invalid" },
])("API-04/07 rejects enum, version, origin: %j", async (change) => {
  const s = setup();
  expect(
    await s.runner.execute({ ...s.intent, ...change }, "/variant"),
  ).toMatchObject({ outcome: "FAILED" });
  expect(s.executeScript).not.toHaveBeenCalled();
});
it.each([
  { option_id: "medium" },
  { approval_digest: "forged" },
  { completion_digest: "forged" },
])("API-05 rejects changed approved input: %j", async (change) => {
  const s = setup();
  expect(
    await s.runner.execute({ ...s.intent, ...change }, "/variant"),
  ).toMatchObject({ code: "PAGE_API_CONTRACT_INVALID" });
  expect(s.executeScript).not.toHaveBeenCalled();
});
it("API-06 scope change while writing dispatch marker prevents invocation", async () => {
  const s = setup();
  s.beforeDispatch.mockImplementation(async () => {
    s.scope.page_scope_epoch = "new-scope";
  });
  expect(await s.runner.execute(s.intent, "/variant")).toMatchObject({
    outcome: "FAILED",
    code: "PAGE_SCOPE_STALE",
  });
  expect(s.executeScript).toHaveBeenCalledOnce();
});
it("API-08 wrong UI remains UNKNOWN and is consumed", async () => {
  const s = setup();
  s.observe.mockResolvedValue("pending");
  expect(await s.runner.execute(s.intent, "/variant")).toMatchObject({
    outcome: "UNKNOWN",
    code: "POSTCONDITION_UNVERIFIED",
  });
  expect(await s.runner.execute(s.intent, "/variant")).toMatchObject({
    code: "POLICY_DENIED",
  });
  expect(s.executeScript).toHaveBeenCalledTimes(2);
});
it("API-09 hung invocation ends at five seconds and never redispatches", async () => {
  vi.useFakeTimers();
  const s = setup();
  s.executeScript.mockImplementation(async (call) =>
    call.args.length
      ? new Promise(() => undefined)
      : [{ frameId: 0, documentId: s.intent.document_id, result: true }],
  );
  const result = s.runner.execute(s.intent, "/variant");
  await vi.advanceTimersByTimeAsync(5001);
  expect(await result).toMatchObject({
    outcome: "UNKNOWN",
    code: "PAGE_API_TIMEOUT",
  });
  expect(await s.runner.execute(s.intent, "/variant")).toMatchObject({
    code: "POLICY_DENIED",
  });
});
it("API-09 invocation errors expose no page error", async () => {
  const s = setup();
  s.executeScript.mockImplementation(async (call) => {
    if (call.args.length) throw new Error("raw page secret");
    return [{ frameId: 0, documentId: s.intent.document_id, result: true }];
  });
  expect(await s.runner.execute(s.intent, "/variant")).toEqual({
    ok: false,
    outcome: "UNKNOWN",
    code: "PAGE_API_CALL_FAILED",
  });
});
it("API-10 concurrent approvals cannot pass the asynchronous probe twice", async () => {
  const s = setup();
  let finish!: (
    value: { frameId: number; documentId: string; result: boolean }[],
  ) => void;
  s.executeScript.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = s.runner.execute(s.intent, "/variant");
  expect(await s.runner.execute(s.intent, "/variant")).toMatchObject({
    code: "POLICY_DENIED",
  });
  finish([{ frameId: 0, documentId: s.intent.document_id, result: true }]);
  expect(await first).toMatchObject({ outcome: "VERIFIED" });
  expect(s.beforeDispatch).toHaveBeenCalledOnce();
});
it("API-11 final scope change cannot become VERIFIED even if UI matches", async () => {
  const s = setup();
  s.observe.mockImplementation(async () => {
    if (s.executeScript.mock.calls.length > 1) {
      s.scope.page_scope_epoch = "new";
      return "satisfied";
    }
    return "pending";
  });
  expect(await s.runner.execute(s.intent, "/variant")).toMatchObject({
    outcome: "UNKNOWN",
    code: "PAGE_SCOPE_STALE",
  });
});

it.each([{ frame_id: 1 }, { document_id: "other-document" }])(
  "API-07 rejects foreign frame/document binding %j",
  async (change) => {
    const s = setup();
    expect(
      await s.runner.execute(
        { ...s.intent, ...change } as PageApiIntent,
        "/variant",
      ),
    ).toMatchObject({ outcome: "FAILED" });
    expect(s.executeScript).not.toHaveBeenCalled();
  },
);
it("already-satisfied observation still requires the approved scope", async () => {
  const s = setup();
  s.observe.mockImplementation(async () => {
    s.scope.page_scope_epoch = "changed";
    return "satisfied";
  });
  expect(await s.runner.execute(s.intent, "/variant")).toMatchObject({
    outcome: "FAILED",
    code: "PAGE_SCOPE_STALE",
  });
  expect(s.beforeDispatch).not.toHaveBeenCalled();
});
