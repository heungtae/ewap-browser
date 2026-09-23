import { describe, expect, it, vi } from "vitest";
import {
  createAnalysisDataAcquisition,
  requestsCollectionAnalysis,
} from "../../../src/service-worker/analysis-data-acquisition.js";
import type { CollectionReadDescriptor } from "../../../src/contracts/collection-read-types.js";
import type { ActivePage } from "../../../src/service-worker/page-context-runtime.js";
import { createAskChatRunner } from "../../../src/service-worker/ask-chat-runner.js";
import { ServiceCoordinator } from "../../../src/service-worker/coordinator.js";

const descriptor: CollectionReadDescriptor = {
  collection_ref: "worker-only-ref",
  object_kind: "table",
  container_selector: "",
  container_xpath: "/body/table[1]",
  container_rect: { x: 0, y: 0, width: 100, height: 100 },
  has_virtual_scroll: false,
  has_pagination: false,
  aria_attributes: {},
  roles: ["table"],
  sample_row_count: 1,
  sample_rows: [{ index: 0, cells: ["worker-only sample"], row_id: "row-1" }],
};

const active = (): ActivePage =>
  ({
    tabId: 9,
    origin: "https://fixture.invalid",
    path: "/table",
    snapshot: { document_epoch: "doc" },
  }) as ActivePage;

const scope = () => ({ document_epoch: "doc", page_scope_epoch: "scope" });

describe("analysis data acquisition", () => {
  it("only identifies explicit page-data analysis requests", () => {
    expect(requestsCollectionAnalysis("이 페이지 데이터를 분석 요약해")).toBe(
      true,
    );
    expect(requestsCollectionAnalysis("What does this button do?")).toBe(false);
  });

  it("reads one permitted collection and strips worker-only identifiers before provider context", async () => {
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
          result: {
            records: [
              {
                index: 47,
                cells: ["safe\u0000 value"],
                row_id: "must-not-reach-provider",
                aria_row_index: 48,
              },
            ],
            total_rows: 1,
            truncated: false,
          },
        };
      throw new Error(`unexpected ${String(kind)}`);
    });
    const collect = createAnalysisDataAcquisition({
      chrome: { tabs: { sendMessage } } as never,
      permissions: { check: () => "ALLOW" },
      scopeFor: scope,
    });

    const result = await collect("이 페이지 데이터를 분석해", active(), "run");

    expect(result).toEqual({
      source: { kind: "collection", label: "table data" },
      coverage: "complete",
      collected_count: 1,
      records: [{ index: 0, cells: ["safe value"] }],
      truncated: false,
    });
    expect(JSON.stringify(result)).not.toContain("row_id");
    expect(JSON.stringify(result)).not.toContain("aria_row_index");
    expect(JSON.stringify(result)).not.toContain("worker-only-ref");
    expect(sendMessage).toHaveBeenCalledWith(9, {
      kind: "CONTENT_COLLECTION_READ_STATIC",
      collection_ref: "worker-only-ref",
    });
  });

  it("does not select among multiple collections or bypass R0 permission", async () => {
    const sendMessage = vi.fn(async () => ({
      ok: true,
      collections: [descriptor, { ...descriptor, collection_ref: "second" }],
      document_epoch: "doc",
      page_scope_epoch: "scope",
    }));
    const check = vi.fn(() => "ALLOW" as const);
    const collect = createAnalysisDataAcquisition({
      chrome: { tabs: { sendMessage } } as never,
      permissions: { check },
      scopeFor: scope,
    });

    await expect(
      collect("데이터를 분석 요약해", active(), "run"),
    ).resolves.toEqual(
      expect.objectContaining({
        coverage: "unavailable",
        reason: "REQUIRES_SELECTION",
        records: [],
      }),
    );
    expect(check).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("reports no collection as unavailable without asking the user to select one", async () => {
    const sendMessage = vi.fn(async () => ({
      ok: true,
      collections: [],
      document_epoch: "doc",
      page_scope_epoch: "scope",
    }));
    const check = vi.fn(() => "ALLOW" as const);
    const collect = createAnalysisDataAcquisition({
      chrome: { tabs: { sendMessage } } as never,
      permissions: { check },
      scopeFor: scope,
    });

    await expect(collect("데이터를 분석해", active(), "run")).resolves.toEqual(
      expect.objectContaining({
        coverage: "unavailable",
        reason: "UNAVAILABLE",
        records: [],
      }),
    );
    expect(check).not.toHaveBeenCalled();
  });

  it("discards rows when the reader detects a page change after collecting them", async () => {
    let contextChecks = 0;
    const sendMessage = vi.fn(async (_tabId: number, message: unknown) => {
      const kind = (message as { kind?: unknown }).kind;
      if (kind === "CONTENT_COLLECTION_DISCOVER")
        return {
          collections: [descriptor],
          document_epoch: "doc",
          page_scope_epoch: "scope",
        };
      if (kind === "CONTENT_COLLECTION_CONTEXT")
        return {
          ok: true,
          document_epoch: "doc",
          page_scope_epoch: ++contextChecks === 1 ? "scope" : "new-scope",
        };
      if (kind === "CONTENT_COLLECTION_READ_STATIC")
        return {
          ok: true,
          result: {
            records: [{ index: 0, cells: ["stale row"] }],
            total_rows: 1,
            truncated: false,
          },
        };
      throw new Error(`unexpected ${String(kind)}`);
    });
    const collect = createAnalysisDataAcquisition({
      chrome: { tabs: { sendMessage } } as never,
      permissions: { check: () => "ALLOW" },
      scopeFor: scope,
    });

    const result = await collect("표 데이터를 분석해", active(), "run");
    expect(result).toMatchObject({
      coverage: "unavailable",
      reason: "PAGE_CHANGED",
      collected_count: 0,
      records: [],
    });
    expect(JSON.stringify(result)).not.toContain("stale row");
    expect(contextChecks).toBe(2);
  });

  it("checks worker scope again after a successful read before reinjection", async () => {
    let currentScope = scope();
    const sendMessage = vi.fn(async (_tabId: number, message: unknown) => {
      const kind = (message as { kind?: unknown }).kind;
      if (kind === "CONTENT_COLLECTION_DISCOVER")
        return {
          collections: [descriptor],
          document_epoch: "doc",
          page_scope_epoch: "scope",
        };
      if (kind === "CONTENT_COLLECTION_CONTEXT")
        return { ok: true, ...scope() };
      if (kind === "CONTENT_COLLECTION_READ_STATIC") {
        // The content reader still reports the old scope; the worker observes
        // the navigation only after the reader completes.
        currentScope = { document_epoch: "doc", page_scope_epoch: "new-scope" };
        return {
          ok: true,
          result: {
            records: [{ index: 0, cells: ["stale row"] }],
            total_rows: 1,
            truncated: false,
          },
        };
      }
      throw new Error(`unexpected ${String(kind)}`);
    });
    const collect = createAnalysisDataAcquisition({
      chrome: { tabs: { sendMessage } } as never,
      permissions: { check: () => "ALLOW" },
      scopeFor: () => currentScope,
    });

    const result = await collect("표 데이터를 분석해", active(), "run");
    expect(result).toMatchObject({
      coverage: "unavailable",
      reason: "PAGE_CHANGED",
      collected_count: 0,
      records: [],
    });
    expect(JSON.stringify(result)).not.toContain("stale row");
  });

  it("keeps the provider context unavailable until collection_read is allowed", async () => {
    const sendMessage = vi.fn(async () => ({
      ok: true,
      collections: [descriptor],
      document_epoch: "doc",
      page_scope_epoch: "scope",
    }));
    const collect = createAnalysisDataAcquisition({
      chrome: { tabs: { sendMessage } } as never,
      permissions: { check: () => "REQUIRE_PERMISSION" },
      scopeFor: scope,
    });

    await expect(
      collect("표 데이터를 분석해", active(), "run"),
    ).resolves.toEqual(
      expect.objectContaining({
        coverage: "unavailable",
        reason: "PERMISSION_REQUIRED",
        collected_count: 0,
      }),
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("reinjects only the bounded analysis context into the same Ask provider turn", async () => {
    const coordinator = new ServiceCoordinator({
      permission_origins: ["<all_urls>"],
      page_read_origins: ["<all_urls>"],
      profile_resolver_origins: [],
      llm_egress_origins: [],
    });
    const chat = vi.fn(async (_input: unknown) => ({
      content: "summary",
      tool_calls: [],
    }));
    const collectAnalysisData = vi.fn(async () => ({
      source: { kind: "collection" as const, label: "table data" },
      coverage: "partial" as const,
      reason: "CAP_REACHED" as const,
      collected_count: 400,
      records: [{ index: 0, cells: ["safe"] }],
      truncated: true,
    }));
    const runner = createAskChatRunner({
      chrome: { tabs: {} } as never,
      coordinator,
      provider: { chat } as never,
      preferences: () => ({ permission_mode: "standard" }) as never,
      readActive: async () =>
        ({
          ...active(),
          snapshot: {
            document_epoch: "doc",
            frame_id: 0,
            nodes: [],
            visible_text: "",
          },
        }) as ActivePage,
      resolveProfile: async () => undefined as never,
      threadContext: () => [],
      pageScope: () => ({
        document_epoch: "doc",
        page_scope_epoch: "scope",
        origin: "https://fixture.invalid",
        path: "/table",
      }),
      bindRun: () => undefined,
      publish: () => undefined,
      safeFailure: (code) => ({ ok: false, code }),
      askTools: [],
      systemPrompt: "system",
      serialise: JSON.stringify,
      redactedTitle: (value) => value ?? "",
      providerFetch: fetch,
      vision: () => undefined,
      rememberVision: () => undefined,
      releaseVision: () => undefined,
      collectAnalysisData,
    });

    await expect(
      runner({ mode: "ask", prompt: "이 페이지 데이터를 분석해" }),
    ).resolves.toEqual({ ok: true, message: "summary" });
    expect(collectAnalysisData).toHaveBeenCalledTimes(1);
    const firstInput = chat.mock.calls[0]?.[0] as
      | { messages: Array<{ content: string }> }
      | undefined;
    const content = firstInput?.messages.at(-1)?.content;
    expect(content).toContain("[UNTRUSTED_ANALYSIS_DATA]");
    expect(content).toContain('"coverage":"partial"');
    expect(content).not.toContain("row_id");
  });
});
