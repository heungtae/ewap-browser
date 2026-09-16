import { describe, expect, it } from "vitest";
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

describe("page API runner", () => {
  it("uses one document-pinned MAIN dispatch then independent UI observation", async () => {
    const calls: unknown[] = [];
    const runner = createPageApiRunner({
      scripting: {
        executeScript: async (call) => {
          calls.push(call);
          return [
            {
              frameId: 0,
              documentId: "document-abcdefghijkl",
              result: "called",
            },
          ];
        },
      },
      beforeDispatch: async () => undefined,
      documentFor: () => ({
        epoch: "epoch-abcdefghijklmnop",
        documentId: "document-abcdefghijkl",
      }),
      scope: () => ({
        document_epoch: "epoch-abcdefghijklmnop",
        page_scope_epoch: "scope-abcdefghijklmnop",
      }),
      observe: async () => (calls.length === 0 ? "pending" : "satisfied"),
    });
    await expect(runner.execute(base(), "/variant")).resolves.toEqual({
      ok: true,
      outcome: "VERIFIED",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      world: "MAIN",
      target: { tabId: 1, documentIds: ["document-abcdefghijkl"] },
      args: ["fixture_variant", "select_variant", "high"],
    });
  });

  it("does_not_call_the_page_when_the_control_is_already_satisfied", async () => {
    let calls = 0;
    const runner = createPageApiRunner({
      scripting: {
        executeScript: async () => {
          calls += 1;
          return [];
        },
      },
      beforeDispatch: async () => undefined,
      documentFor: () => ({
        epoch: "epoch-abcdefghijklmnop",
        documentId: "document-abcdefghijkl",
      }),
      scope: () => ({
        document_epoch: "epoch-abcdefghijklmnop",
        page_scope_epoch: "scope-abcdefghijklmnop",
      }),
      observe: async () => "satisfied",
    });
    await expect(runner.execute(base(), "/variant")).resolves.toEqual({
      ok: true,
      outcome: "ALREADY_SATISFIED",
    });
    expect(calls).toBe(0);
  });

  it("treats an unverified dispatched call as unknown and never redispatches it", async () => {
    let calls = 0;
    const runner = createPageApiRunner({
      scripting: {
        executeScript: async () => {
          calls += 1;
          return [
            {
              frameId: 0,
              documentId: "document-abcdefghijkl",
              result: "called",
            },
          ];
        },
      },
      beforeDispatch: async () => undefined,
      documentFor: () => ({
        epoch: "epoch-abcdefghijklmnop",
        documentId: "document-abcdefghijkl",
      }),
      scope: () => ({
        document_epoch: "epoch-abcdefghijklmnop",
        page_scope_epoch: "scope-abcdefghijklmnop",
      }),
      observe: async () => "pending",
    });
    await expect(runner.execute(base(), "/variant")).resolves.toEqual({
      ok: false,
      outcome: "UNKNOWN",
      code: "POSTCONDITION_UNVERIFIED",
    });
    await expect(runner.execute(base(), "/variant")).resolves.toEqual({
      ok: false,
      outcome: "FAILED",
      code: "POLICY_DENIED",
    });
    expect(calls).toBe(1);
  });
});
