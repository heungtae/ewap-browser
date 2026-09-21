import { describe, expect, it, vi } from "vitest";
import { createCollectionReadMessageHandler } from "../../../src/service-worker/collection-read-message-handler.js";
import type { CollectionReadDescriptor } from "../../../src/contracts/collection-read-types.js";

const descriptor: CollectionReadDescriptor = {
  collection_ref: "trusted-ref",
  object_kind: "table",
  container_selector: "",
  container_xpath: "/body/table[1]",
  container_rect: { x: 0, y: 0, width: 100, height: 100 },
  has_virtual_scroll: false,
  has_pagination: false,
  aria_attributes: {},
  roles: ["table"],
  sample_row_count: 1,
  sample_rows: [{ index: 0, cells: ["must not leave worker"] }],
};

const sender = {
  id: "extension",
  url: "chrome-extension://id/sidepanel/index.html",
};
const invoke = <T>(
  call: (respond: (response: unknown) => void) => Promise<void>,
) =>
  new Promise<T>((resolve) => void call((response) => resolve(response as T)));

describe("collection read message handler", () => {
  it("binds a start request to a short-lived discovered ref and keeps the locator out of the panel response", async () => {
    const sendMessage = vi.fn(async (_tabId: number, message: unknown) => {
      const kind = (message as { kind?: unknown }).kind;
      if (kind === "CONTENT_COLLECTION_DISCOVER")
        return {
          ok: true,
          collections: [descriptor],
          document_epoch: "doc",
          page_scope_epoch: "scope",
        };
      if (kind === "CONTENT_COLLECTION_READ_STATIC")
        return {
          ok: true,
          result: {
            records: [{ index: 0, cells: ["safe"] }],
            total_rows: 1,
            truncated: false,
          },
        };
      if (kind === "CONTENT_COLLECTION_CONTEXT")
        return { ok: true, document_epoch: "doc", page_scope_epoch: "scope" };
      throw new Error("unexpected message");
    });
    const handler = createCollectionReadMessageHandler({
      chrome: { tabs: { sendMessage } } as never,
      permissions: { check: () => "ALLOW" as const },
      requests: new Map(),
      activeTabForBoundPanel: async () => ({
        id: 4,
        url: "https://fixture.invalid/table",
      }),
      documentFor: () => ({ epoch: "doc", documentId: "document" }),
      scopeFor: () => ({ document_epoch: "doc", page_scope_epoch: "scope" }),
      isPanelSender: () => true,
      isPanelOrSettingsSender: () => false,
      safeFailure: (code: string) => ({ ok: false, code }),
    });

    const discovery = await invoke<Record<string, unknown>>((respond) =>
      handler.handleCollectionDiscover(sender, respond),
    );
    expect(discovery).toEqual({
      ok: true,
      collections: [
        {
          collection_ref: "trusted-ref",
          object_kind: "table",
          estimated_total: undefined,
          has_virtual_scroll: false,
          has_pagination: false,
          sample_row_count: 1,
        },
      ],
    });
    expect(JSON.stringify(discovery)).not.toContain("container_xpath");
    expect(JSON.stringify(discovery)).not.toContain("must not leave worker");

    const result = await invoke<Record<string, unknown>>((respond) =>
      handler.handleCollectionReadStart(
        sender,
        { collection_ref: "trusted-ref", mode: "full" },
        respond,
      ),
    );
    expect(result).toMatchObject({
      ok: true,
      result: { coverage: "complete", collected_count: 1 },
    });
    expect(sendMessage).toHaveBeenCalledWith(4, {
      kind: "CONTENT_COLLECTION_READ_STATIC",
      collection_ref: "trusted-ref",
    });
  });

  it("rejects a caller-supplied descriptor instead of trusting its locator", async () => {
    const handler = createCollectionReadMessageHandler({
      chrome: { tabs: { sendMessage: vi.fn() } } as never,
      permissions: { check: () => "ALLOW" as const },
      requests: new Map(),
      activeTabForBoundPanel: async () => ({
        id: 4,
        url: "https://fixture.invalid/table",
      }),
      documentFor: () => ({ epoch: "doc", documentId: "document" }),
      scopeFor: () => ({ document_epoch: "doc", page_scope_epoch: "scope" }),
      isPanelSender: () => true,
      isPanelOrSettingsSender: () => false,
      safeFailure: (code: string) => ({ ok: false, code }),
    });
    await expect(
      invoke<Record<string, unknown>>((respond) =>
        handler.handleCollectionReadStart(
          sender,
          { collection_ref: "trusted-ref", mode: "full", descriptor },
          respond,
        ),
      ),
    ).resolves.toEqual({ ok: false, code: "INVALID_ARGUMENT" });
  });

  it("returns bounded chunks behind an opaque, scope-bound cursor", async () => {
    const records = Array.from({ length: 201 }, (_, index) => ({
      index,
      cells: [String(index)],
    }));
    const sendMessage = vi.fn(async (_tabId: number, message: unknown) => {
      const kind = (message as { kind?: unknown }).kind;
      if (kind === "CONTENT_COLLECTION_DISCOVER")
        return {
          ok: true,
          collections: [descriptor],
          document_epoch: "doc",
          page_scope_epoch: "scope",
        };
      if (kind === "CONTENT_COLLECTION_CONTEXT")
        return { ok: true, document_epoch: "doc", page_scope_epoch: "scope" };
      if (kind === "CONTENT_COLLECTION_READ_STATIC")
        return {
          ok: true,
          result: { records, total_rows: records.length, truncated: false },
        };
      throw new Error("unexpected message");
    });
    const handler = createCollectionReadMessageHandler({
      chrome: { tabs: { sendMessage } } as never,
      permissions: { check: () => "ALLOW" as const },
      requests: new Map(),
      activeTabForBoundPanel: async () => ({
        id: 4,
        url: "https://fixture.invalid/table",
      }),
      documentFor: () => ({ epoch: "doc", documentId: "document" }),
      scopeFor: () => ({ document_epoch: "doc", page_scope_epoch: "scope" }),
      isPanelSender: () => true,
      isPanelOrSettingsSender: () => false,
      safeFailure: (code: string) => ({ ok: false, code }),
    });
    await invoke((respond) =>
      handler.handleCollectionDiscover(sender, respond),
    );
    const first = await invoke<{
      ok: boolean;
      result: { records: unknown[]; next_cursor?: string };
    }>((respond) =>
      handler.handleCollectionReadStart(
        sender,
        { collection_ref: "trusted-ref", mode: "full" },
        respond,
      ),
    );
    expect(first.result.records).toHaveLength(200);
    expect(first.result.next_cursor).toEqual(expect.any(String));
    const second = await invoke<{
      ok: boolean;
      result: { records: unknown[]; next_cursor?: string };
    }>((respond) =>
      handler.handleCollectionReadNext(
        sender,
        { next_cursor: first.result.next_cursor! },
        respond,
      ),
    );
    expect(second.result.records).toHaveLength(1);
    expect(second.result.next_cursor).toBeUndefined();
  });
});
