import { afterEach, describe, expect, it } from "vitest";
import type { PageMethodRef } from "../../../src/contracts/page-method-types.js";
import { createPageMethodRunner } from "../../../src/service-worker/page-method-runner.js";
import { pageMethodApprovalDigest } from "../../../src/service-worker/page-method-runner-contract.js";
import { digestCanonical } from "../../../src/security/canonical.js";
import { discoverPageMethodsMain } from "../../../src/service-worker/page-method-main.js";

const root = "__contextPilotS23Fixture";
afterEach(() => Reflect.deleteProperty(globalThis, root));

describe("page method runner", () => {
  it("binds dispatch to document and request generation and consumes a method ref once", async () => {
    const api = { read: () => ({ result: "ok" }) };
    Object.defineProperty(globalThis, root, {
      configurable: true,
      enumerable: true,
      value: api,
    });
    const method = api.read;
    const source = Function.prototype.toString.call(method);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index++)
      hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
    const descriptor: PageMethodRef = {
      method_ref: "method-ref-once-abcdefghijkl",
      object_path: [root, "read"],
      method_name: "read",
      arity: 0,
      function_kind: "unknown",
      locator_revision: `read:0:${source.length}:${(hash >>> 0).toString(16)}`,
    };
    let invocations = 0;
    const runner = createPageMethodRunner({
      scripting: {
        async executeScript(input) {
          if (input.func === discoverPageMethodsMain)
            return [
              {
                frameId: 0,
                documentId: "doc",
                result: [
                  {
                    object_path: descriptor.object_path,
                    method_name: descriptor.method_name,
                    arity: descriptor.arity,
                    function_kind: descriptor.function_kind,
                    locator_revision: descriptor.locator_revision,
                  },
                ],
              },
            ];
          invocations++;
          return [
            {
              frameId: 0,
              documentId: "doc",
              result: await input.func(...(input.args as never[])),
            },
          ];
        },
      },
      beforeDispatch: async () => undefined,
      documentFor: () => ({ epoch: "epoch", documentId: "doc" }),
      scope: () => ({ document_epoch: "epoch", page_scope_epoch: "scope" }),
    });
    const base = {
      kind: "page_method" as const,
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
    const intent = { ...base, approval_digest: pageMethodApprovalDigest(base) };
    const context = {
      requestId: "request",
      generation: 7,
      tabId: 1,
      signal: new AbortController().signal,
      check() {},
    };
    const first = await runner.execute(intent, context);
    expect(first).toEqual({
      dispatch: "dispatched",
      invocation: "returned",
      return_data: {
        available: true,
        value: { result: "ok" },
        truncated: false,
      },
    });
    await expect(runner.execute(intent, context)).resolves.toMatchObject({
      dispatch: "not_dispatched",
      invocation: "not_started",
    });
    expect(invocations).toBe(1);
  });
});
