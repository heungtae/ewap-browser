import { describe, expect, it, vi } from "vitest";
import { createPageApiDiscoveryDomainHandler } from "../../../src/service-worker/page-api-discovery-domain-handler.js";

const sender = { id: "extension", panelWindowId: 4 };
const message = { kind: "PAGE_API_DISCOVERY_START" };

describe("page API Discovery domain handler", () => {
  it("re-registers only the current content document after worker state is lost", async () => {
    let document: { epoch: string; documentId: string } | undefined;
    let scope: { document_epoch: string; page_scope_epoch: string } | undefined;
    const ensureDocument = vi.fn(async () => {
      document = { epoch: "doc", documentId: "document-id" };
      scope = { document_epoch: "doc", page_scope_epoch: "scope" };
    });
    const start = vi.fn(async () => ({
      candidates: [],
      truncated: false,
      terminal: "COMPLETED" as const,
      duration_ms: 1,
    }));
    const handler = createPageApiDiscoveryDomainHandler({
      activeTabForBoundPanel: async () => ({
        id: 7,
        url: "https://fixture.invalid/page",
      }),
      isPanelSender: () => true,
      ensureDocument,
      documentFor: () => document,
      scopeFor: () => scope,
      authorize: async () => true,
      start,
      cancel: () => undefined,
      safeFailure: (code) => ({ ok: false, code }),
    });
    const response = await new Promise<unknown>((resolve) => {
      handler.handle(message, sender, resolve);
    });

    expect(ensureDocument).toHaveBeenCalledWith(7);
    expect(start).toHaveBeenCalledWith({
      tabId: 7,
      documentId: "document-id",
      documentEpoch: "doc",
      pageScopeEpoch: "scope",
    });
    expect(response).toMatchObject({
      ok: true,
      result: { terminal: "COMPLETED" },
    });
  });

  it("fails closed when current-document re-registration does not restore scope", async () => {
    const handler = createPageApiDiscoveryDomainHandler({
      activeTabForBoundPanel: async () => ({
        id: 7,
        url: "https://fixture.invalid/page",
      }),
      isPanelSender: () => true,
      ensureDocument: async () => undefined,
      documentFor: () => undefined,
      scopeFor: () => undefined,
      authorize: async () => true,
      start: async () => ({
        candidates: [],
        truncated: false,
        terminal: "COMPLETED" as const,
        duration_ms: 1,
      }),
      cancel: () => undefined,
      safeFailure: (code) => ({ ok: false, code }),
    });
    const response = await new Promise<unknown>((resolve) => {
      handler.handle(message, sender, resolve);
    });

    expect(response).toEqual({ ok: false, code: "PAGE_SCOPE_STALE" });
  });
});
