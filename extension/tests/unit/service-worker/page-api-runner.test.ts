import { ChatRequestLifecycle } from "../../../src/service-worker/chat-request-lifecycle.js";
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
  const lifecycle = new ChatRequestLifecycle();
  lifecycle.start({
    request_id: "original",
    tab_id: 1,
    mode: "act",
    prompt: "change",
  });
  const generation = lifecycle.startRun("original")!;
  const context = lifecycle.context("original");
  const beforeDispatch = vi.fn(async () =>
    lifecycle.beforeDispatch(1, context),
  );
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
    runner: {
      execute: (value: PageApiIntent, path: string) =>
        runner.execute(value, path, context),
    },
    lifecycle,
    context,
    generation,
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

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
it.each(["probe", "pending", "satisfied", "marker", "dispatch"])(
  "S10-R cancellation during %s preserves original and replacement requests",
  async (stage) => {
    const s = setup();
    const gate = deferred<never>();
    const entered = deferred<void>();
    if (stage === "probe" || stage === "dispatch") {
      const original = s.executeScript.getMockImplementation()!;
      s.executeScript.mockImplementation(async (call) => {
        if ((stage === "probe") === (call.args.length === 0)) {
          entered.resolve();
          await gate.promise;
        }
        return original(call);
      });
    } else if (stage === "marker") {
      const flush = s.lifecycle.flush.bind(s.lifecycle);
      vi.spyOn(s.lifecycle, "flush").mockImplementation(async () => {
        entered.resolve();
        await gate.promise;
        await flush();
      });
    } else {
      s.observe.mockImplementationOnce(async () => {
        entered.resolve();
        await gate.promise;
        return stage as "pending" | "satisfied";
      });
    }
    const execution = s.runner.execute(s.intent, "/variant");
    await entered.promise;
    const cancelled = s.lifecycle.cancel("original", 1)!;
    s.lifecycle.start({
      request_id: "replacement",
      tab_id: 1,
      mode: "ask",
      prompt: "read",
    });
    s.lifecycle.startRun("replacement");
    const replacement = s.lifecycle.status("replacement", 1);
    gate.resolve(undefined as never);
    expect(await execution).toMatchObject({
      outcome: stage === "dispatch" ? "UNKNOWN" : "FAILED",
      code: "POLICY_DENIED",
    });
    expect(
      s.executeScript.mock.calls.filter(([call]) => call.args.length),
    ).toHaveLength(stage === "dispatch" ? 1 : 0);
    expect(s.lifecycle.status("original", 1)).toEqual(cancelled);
    expect(s.lifecycle.status("replacement", 1)).toEqual(replacement);
    expect(cancelled.outcome).toBe(
      stage === "dispatch" || stage === "marker" ? "UNKNOWN" : "CANCELLED",
    );
    s.lifecycle.finish("replacement", 0, "VERIFIED");
  },
);
it("S10-R rejects absent, foreign-tab and terminal dispatch ownership", async () => {
  const s = setup();
  await expect(s.lifecycle.beforeDispatch(2, s.context)).rejects.toThrow();
  s.lifecycle.cancel("original", 1);
  await expect(s.lifecycle.beforeDispatch(1, s.context)).rejects.toThrow();
  await expect(s.lifecycle.beforeDispatch(1)).rejects.toThrow();
});

it("S10-R old generation and replaced store objects cannot dispatch", async () => {
  class ControlledLifecycle extends ChatRequestLifecycle {
    advance() {
      this.requests.get("original")!.generation += 1;
    }
    replace() {
      const request = this.requests.get("original")!;
      this.requests.set("original", { ...request });
    }
  }
  for (const change of ["advance", "replace"] as const) {
    const lifecycle = new ControlledLifecycle();
    lifecycle.start({
      request_id: "original",
      tab_id: 1,
      mode: "act",
      prompt: "change",
    });
    lifecycle.startRun("original");
    const context = lifecycle.context("original");
    lifecycle[change]();
    const snapshot = lifecycle.status("original", 1);
    await expect(lifecycle.beforeDispatch(1, context)).rejects.toThrow(
      "POLICY_DENIED",
    );
    expect(lifecycle.status("original", 1)).toEqual(snapshot);
    lifecycle.endTab(1, "FAILED");
  }
});
