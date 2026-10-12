import { afterEach, describe, expect, it, vi } from "vitest";
import type { PageMethodIntent } from "../../../src/contracts/page-method-types.js";
import {
  createPageMethodRunner,
  pageMethodApprovalDigest,
} from "../../../src/service-worker/page-method-runner.js";
import { digestCanonical } from "../../../src/security/canonical.js";
import {
  discoverPageMethodsMain,
  invokePageMethodMain,
} from "../../../src/service-worker/page-method-main.js";

const root = "__contextPilotS23Fixture";
afterEach(() => {
  Reflect.deleteProperty(globalThis, root);
  vi.useRealTimers();
});
const harness = async () => {
  let invocations = 0;
  let epoch = "epoch";
  let beforeDispatch = async () => {};
  const api: { read: () => unknown } = { read: () => ({ result: "ok" }) };
  Object.defineProperty(globalThis, root, {
    configurable: true,
    enumerable: true,
    value: api,
  });
  const runner = createPageMethodRunner({
    scripting: {
      async executeScript(input) {
        if (input.func === invokePageMethodMain) invocations++;
        return [
          {
            frameId: 0,
            documentId: "doc",
            result: await input.func(...(input.args as never[])),
          },
        ];
      },
    },
    beforeDispatch: () => beforeDispatch(),
    documentFor: () => ({ epoch, documentId: "doc" }),
    scope: () => ({ document_epoch: epoch, page_scope_epoch: "scope" }),
  });
  const candidates = await runner.discover(1, "doc");
  const methods = candidates[0]!.result as ReturnType<
    typeof discoverPageMethodsMain
  >;
  const descriptor = {
    ...methods.find((item) => item.object_path.join(".") === `${root}.read`)!,
    method_ref: "method-ref-once-abcdefghijkl",
  };
  const controller = new AbortController();
  const context = {
    requestId: "request",
    generation: 7,
    tabId: 1,
    signal: controller.signal,
    check() {},
  };
  const intentFor = (id = "call-1"): PageMethodIntent => {
    const base = {
      kind: "page_method" as const,
      invocation_id: id,
      request_id: "request",
      run_id: "run",
      tab_id: 1,
      document_id: "doc",
      document_epoch: "epoch",
      page_scope_epoch: "scope",
      origin: "https://example.com",
      request_generation: 7,
      source_evidence_id: "source-evidence-abcdefghijkl",
      method: descriptor,
      arguments: [],
      arguments_digest: digestCanonical([]),
      capability: "page_method" as const,
    };
    return { ...base, approval_digest: pageMethodApprovalDigest(base) };
  };
  return {
    runner,
    context,
    controller,
    intentFor,
    api,
    count: () => invocations,
    changeEpoch: () => {
      epoch = "new";
    },
    before: (fn: () => Promise<void>) => {
      beforeDispatch = fn;
    },
  };
};

describe("page method dispatch ownership", () => {
  it("consumes each approved call once and allows a separately approved repeat", async () => {
    const h = await harness();
    expect(await h.runner.execute(h.intentFor(), h.context)).toMatchObject({
      dispatch: "dispatched",
      invocation: "returned",
      return_data: { kind: "json", value: { result: "ok" } },
    });
    expect(await h.runner.execute(h.intentFor(), h.context)).toMatchObject({
      dispatch: "not_dispatched",
    });
    expect(
      await h.runner.execute(h.intentFor("call-2"), h.context),
    ).toMatchObject({ dispatch: "dispatched" });
    expect(h.count()).toBe(2);
  });
  it("does not dispatch concurrently duplicated approval responses", async () => {
    const h = await harness();
    const results = await Promise.all([
      h.runner.execute(h.intentFor(), h.context),
      h.runner.execute(h.intentFor(), h.context),
    ]);
    expect(
      results.filter((item) => item.dispatch === "dispatched"),
    ).toHaveLength(1);
    expect(h.count()).toBe(1);
  });
  it.each(["stop", "navigation", "replacement", "tamper"])(
    "rejects %s before dispatch",
    async (reason) => {
      const h = await harness();
      const intent = h.intentFor();
      if (reason === "tamper") intent.arguments = ["changed"];
      h.before(async () => {
        if (reason === "stop") h.controller.abort();
        if (reason === "navigation") h.changeEpoch();
        if (reason === "replacement") h.api.read = () => ({ result: "new" });
      });
      const result = await h.runner.execute(intent, h.context);
      expect(result.dispatch).toBe("not_dispatched");
      // The MAIN resolver rejects replacement before Reflect.apply.
      expect(result.invocation).toBe("not_started");
    },
  );
  it("keeps an unknown timed-out call consumed", async () => {
    const h = await harness();
    h.api.read = () => new Promise(() => {});
    const fresh = await h.runner.discover(1, "doc");
    const descriptor = (
      fresh[0]!.result as ReturnType<typeof discoverPageMethodsMain>
    ).find((item) => item.object_path.join(".") === `${root}.read`)!;
    const intent = h.intentFor();
    intent.method = { ...descriptor, method_ref: intent.method.method_ref };
    intent.approval_digest = pageMethodApprovalDigest(intent);
    vi.useFakeTimers();
    const resultPromise = h.runner.execute(intent, h.context);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await resultPromise).toMatchObject({
      dispatch: "unknown",
      invocation: "timed_out",
    });
    expect(await h.runner.execute(intent, h.context)).toMatchObject({
      dispatch: "not_dispatched",
    });
    expect(h.count()).toBe(1);
  });
  it("does not resume old identities with a new worker runner", async () => {
    const h = await harness();
    const old = h.intentFor();
    const restarted = await harness();
    expect(
      await restarted.runner.execute(old, restarted.context),
    ).toMatchObject({ dispatch: "not_dispatched" });
  });
});
