import { describe, expect, it, vi } from "vitest";
import { CollectionReadOrchestrator } from "../../../src/service-worker/collection-read-orchestrator.js";
import type {
  CollectionReadDescriptor,
  CollectionReadRequest,
} from "../../../src/contracts/collection-read-types.js";

const request: CollectionReadRequest = {
  collection_ref: "ref",
  object_kind: "table",
  mode: "full",
  run_id: "run",
  tab_id: 4,
  frame_id: 0,
  document_epoch: "doc",
  page_scope_epoch: "scope",
  origin: "https://fixture.invalid",
  page_url: "https://fixture.invalid/table",
  capability: "collection_read",
  approval_digest: "approval",
};

const descriptor = (
  overrides: Partial<CollectionReadDescriptor> = {},
): CollectionReadDescriptor => ({
  collection_ref: "ref",
  object_kind: "table",
  container_selector: "",
  container_xpath: "/body/table",
  container_rect: { x: 0, y: 0, width: 100, height: 100 },
  has_virtual_scroll: false,
  has_pagination: false,
  aria_attributes: {},
  roles: [],
  sample_row_count: 0,
  sample_rows: [],
  ...overrides,
});

describe("CollectionReadOrchestrator", () => {
  it("reads a static object in the content script and marks an untruncated result complete", async () => {
    const send = vi.fn(async (_tabId: number, message: unknown) =>
      (message as { kind?: unknown }).kind === "CONTENT_COLLECTION_CONTEXT"
        ? { ok: true, document_epoch: "doc", page_scope_epoch: "scope" }
        : {
            ok: true,
            result: {
              records: [{ index: 0, cells: ["safe"] }],
              total_rows: 1,
              truncated: false,
            },
          },
    );

    await expect(
      CollectionReadOrchestrator.start(request, descriptor(), send),
    ).resolves.toMatchObject({
      ok: true,
      result: { coverage: "complete", collected_count: 1 },
    });
    expect(send).toHaveBeenCalledWith(4, {
      kind: "CONTENT_COLLECTION_READ_STATIC",
      collection_ref: "ref",
    });
  });

  it("never claims complete when the content cap truncates a static object", async () => {
    const send = vi.fn(async (_tabId: number, message: unknown) =>
      (message as { kind?: unknown }).kind === "CONTENT_COLLECTION_CONTEXT"
        ? { ok: true, document_epoch: "doc", page_scope_epoch: "scope" }
        : {
            ok: true,
            result: { records: [], total_rows: 10_001, truncated: true },
          },
    );

    await expect(
      CollectionReadOrchestrator.start(request, descriptor(), send),
    ).resolves.toMatchObject({
      ok: true,
      result: { coverage: "partial", reason: "CAP_REACHED" },
    });
  });

  it("collects a virtual grid through the content-owned scroll lifecycle", async () => {
    let windowCount = 0;
    const send = vi.fn(async (_tabId: number, message: unknown) => {
      const kind = (message as { kind?: unknown }).kind;
      if (kind === "CONTENT_COLLECTION_CONTEXT")
        return { ok: true, document_epoch: "doc", page_scope_epoch: "scope" };
      if (kind === "CONTENT_SCROLL_INIT") return { ok: true };
      if (kind === "CONTENT_COLLECTION_READ_WINDOW")
        return {
          ok: true,
          result: {
            records: [
              {
                index: 0,
                cells: ["safe"],
                row_id: ++windowCount === 1 ? "row-1" : "row-2",
                aria_row_index: windowCount === 1 ? 2 : 3,
              },
            ],
          },
        };
      if (kind === "CONTENT_SCROLL_STEP") return { ok: true, atBottom: true };
      if (kind === "CONTENT_SCROLL_RESTORE")
        return { ok: true, restored: true };
      if (kind === "CONTENT_SCROLL_RESET") return { ok: true };
      if (kind === "CONTENT_COLLECTION_RELEASE") return { ok: true };
      throw new Error("unexpected content message");
    });
    await expect(
      CollectionReadOrchestrator.start(
        { ...request, object_kind: "grid" },
        descriptor({
          object_kind: "grid",
          has_virtual_scroll: true,
          estimated_total: 3,
        }),
        send,
      ),
    ).resolves.toMatchObject({
      ok: true,
      result: {
        coverage: "complete",
        collected_count: 2,
        restored_position: true,
      },
    });
    expect(send).toHaveBeenCalledWith(4, {
      kind: "CONTENT_SCROLL_INIT",
      descriptor: expect.any(Object),
    });
    expect(send).toHaveBeenCalledWith(4, { kind: "CONTENT_SCROLL_RESTORE" });
    expect(send).toHaveBeenCalledWith(4, {
      kind: "CONTENT_COLLECTION_RELEASE",
      collection_ref: "ref",
    });
  });

  it("does_not_claim_complete_for_a_virtual grid_without_stable_identity", async () => {
    const send = vi.fn(async (_tabId: number, message: unknown) => {
      const kind = (message as { kind?: unknown }).kind;
      if (kind === "CONTENT_COLLECTION_CONTEXT")
        return { ok: true, document_epoch: "doc", page_scope_epoch: "scope" };
      if (kind === "CONTENT_SCROLL_INIT") return { ok: true };
      if (kind === "CONTENT_COLLECTION_READ_WINDOW")
        return {
          ok: true,
          result: { records: [{ index: 0, cells: ["same"] }] },
        };
      if (kind === "CONTENT_SCROLL_STEP") return { ok: true, atBottom: true };
      if (kind === "CONTENT_SCROLL_RESTORE")
        return { ok: true, restored: true };
      if (kind === "CONTENT_SCROLL_RESET") return { ok: true };
      if (kind === "CONTENT_COLLECTION_RELEASE") return { ok: true };
      throw new Error("unexpected content message");
    });

    await expect(
      CollectionReadOrchestrator.start(
        { ...request, object_kind: "grid" },
        descriptor({
          object_kind: "grid",
          has_virtual_scroll: true,
          estimated_total: 1,
        }),
        send,
      ),
    ).resolves.toMatchObject({
      ok: true,
      result: { coverage: "partial", reason: "NO_STABLE_ID" },
    });
  });

  it("stops a virtual read when the bound page scope changes", async () => {
    const send = vi.fn(async (_tabId: number, message: unknown) => {
      const kind = (message as { kind?: unknown }).kind;
      if (kind === "CONTENT_SCROLL_INIT") return { ok: true };
      if (kind === "CONTENT_COLLECTION_CONTEXT")
        return { ok: true, document_epoch: "doc", page_scope_epoch: "changed" };
      if (kind === "CONTENT_SCROLL_RESTORE")
        return { ok: true, restored: true };
      if (kind === "CONTENT_SCROLL_RESET") return { ok: true };
      if (kind === "CONTENT_COLLECTION_RELEASE") return { ok: true };
      throw new Error("unexpected content message");
    });
    await expect(
      CollectionReadOrchestrator.start(
        { ...request, object_kind: "grid" },
        descriptor({ object_kind: "grid", has_virtual_scroll: true }),
        send,
      ),
    ).resolves.toMatchObject({
      ok: true,
      result: { coverage: "partial", reason: "PAGE_CHANGED" },
    });
    expect(send).not.toHaveBeenCalledWith(4, {
      kind: "CONTENT_COLLECTION_READ_WINDOW",
      collection_ref: "ref",
    });
  });

  it("keeps generic SVG and canvas reads viewport-only", async () => {
    const send = vi.fn(async (_tabId: number, message: unknown) => {
      const kind = (message as { kind?: unknown }).kind;
      if (kind === "CONTENT_COLLECTION_CONTEXT")
        return { ok: true, document_epoch: "doc", page_scope_epoch: "scope" };
      if (kind === "CONTENT_COLLECTION_READ_VIEWPORT")
        return {
          ok: true,
          result: { records: [{ index: 0, cells: ["label"] }] },
        };
      if (kind === "CONTENT_COLLECTION_RELEASE") return { ok: true };
      throw new Error("unexpected content message");
    });
    await expect(
      CollectionReadOrchestrator.start(
        { ...request, object_kind: "chart_svg" },
        descriptor({ object_kind: "chart_svg" }),
        send,
      ),
    ).resolves.toMatchObject({
      ok: true,
      result: { coverage: "viewport_only", collected_count: 1 },
    });
  });
});
