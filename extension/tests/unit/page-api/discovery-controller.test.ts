import { describe, expect, it, vi } from "vitest";
import { createDiscoveryController } from "../../../src/page-api/discovery/discovery-controller.js";

const context = {
  tabId: 3,
  documentId: "document-id",
  documentEpoch: "epoch",
  pageScopeEpoch: "scope",
};

const setup = (result: unknown) => {
  const executeScript = vi.fn(async () => [
    { frameId: 0, documentId: "document-id", result },
  ]);
  return {
    executeScript,
    controller: createDiscoveryController({
      scripting: { executeScript },
      documentFor: () => ({ epoch: "epoch", documentId: "document-id" }),
      scopeFor: () => ({ document_epoch: "epoch", page_scope_epoch: "scope" }),
    }),
  };
};

describe("page API discovery controller", () => {
  it("uses one document-pinned MAIN scanner and redacts all page identifiers", async () => {
    const { controller, executeScript } = setup({
      hints: [
        {
          kind: "public_js_function_hint",
          confidence: "medium",
          evidence: ["OWN_DATA_DESCRIPTOR", "FUNCTION_SHAPE"],
          limitations: ["UNTRUSTED_MAIN_WORLD", "NO_EXECUTION"],
        },
      ],
      truncated: false,
    });
    const result = await controller.start(context);
    expect(result).toMatchObject({ terminal: "COMPLETED", truncated: false });
    expect(result.candidates[0]).toMatchObject({
      kind: "public_js_function_hint",
      label: "Public function hint 1",
    });
    expect(JSON.stringify(result)).not.toContain("document-id");
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        world: "MAIN",
        target: { tabId: 3, documentIds: ["document-id"] },
        args: [],
      }),
    );
  });

  it("fails closed when the document scope changed before the scan", async () => {
    const controller = createDiscoveryController({
      scripting: { executeScript: vi.fn() },
      documentFor: () => ({ epoch: "other", documentId: "document-id" }),
      scopeFor: () => ({ document_epoch: "other", page_scope_epoch: "scope" }),
    });
    await expect(controller.start(context)).resolves.toMatchObject({
      terminal: "STALE",
      candidates: [],
    });
  });
});

it.each([
  "cancel",
  "scope",
  "wrong-frame",
  "wrong-document",
  "oversized",
  "error",
  "timeout",
])("Discovery drops candidates at %s boundary", async (scenario) => {
  vi.useFakeTimers();
  try {
    const scope = { document_epoch: "epoch", page_scope_epoch: "scope" };
    let release!: (
      value: { frameId: number; documentId: string; result: unknown }[],
    ) => void;
    const script = vi.fn(
      () =>
        new Promise<{ frameId: number; documentId: string; result: unknown }[]>(
          (resolve) => {
            release = resolve;
          },
        ),
    );
    const controller = createDiscoveryController({
      scripting: { executeScript: script },
      documentFor: () => ({ epoch: "epoch", documentId: "document-id" }),
      scopeFor: () => scope,
    });
    const pending = controller.start(context);
    if (scenario === "cancel") controller.cancel(context.tabId);
    if (scenario === "scope") scope.page_scope_epoch = "changed";
    if (scenario === "timeout") await vi.advanceTimersByTimeAsync(301);
    release([
      {
        frameId: scenario === "wrong-frame" ? 1 : 0,
        documentId: scenario === "wrong-document" ? "other" : "document-id",
        result:
          scenario === "error"
            ? { error: "raw secret" }
            : {
                hints:
                  scenario === "oversized"
                    ? Array.from({ length: 97 }, () => ({
                        kind: "script_endpoint_hint",
                        confidence: "low",
                        evidence: [],
                        limitations: [],
                      }))
                    : [],
                truncated: false,
              },
      },
    ]);
    const result = await pending;
    expect(result.candidates).toEqual([]);
    expect(result.terminal).toBe(
      scenario === "cancel"
        ? "CANCELLED"
        : scenario === "scope"
          ? "STALE"
          : "MAIN_UNRESPONSIVE",
    );
    expect(JSON.stringify(result)).not.toContain("raw secret");
    expect(script).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
