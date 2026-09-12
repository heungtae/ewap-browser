import { describe, expect, it, vi } from "vitest";
import { createPageLifecycleMessageHandler } from "../../../src/service-worker/page-lifecycle-message-handler.js";

describe("page lifecycle message handler", () => {
  it("releases_navigation_staleness_when_the_new_document_registers", () => {
    const stalePageTabs = new Set([7]);
    const handler = createPageLifecycleMessageHandler({
      extensionId: () => "extension-id",
      registrationKey: (tabId, frameId) => `${tabId}:${frameId}`,
      registered: new Map(),
      pageScopes: new Map(),
      stalePageTabs,
      activeRun: () => undefined,
      cancelRunForPageChange: () => undefined,
      safeFailure: (code) => ({ ok: false, code }),
    });
    const respond = vi.fn();

    handler.handle(
      {
        schema_version: 1,
        kind: "DOCUMENT_REGISTER",
        document_epoch: "epoch-abcdefghijklmnop",
      },
      {
        id: "extension-id",
        tab: { id: 7 },
        frameId: 0,
        documentId: "document-abcdefghijklmnop",
        documentLifecycle: "active",
      },
      respond,
    );

    expect(stalePageTabs.has(7)).toBe(false);
    expect(respond).toHaveBeenCalledWith({ ok: true });
  });
});
