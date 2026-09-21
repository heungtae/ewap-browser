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
