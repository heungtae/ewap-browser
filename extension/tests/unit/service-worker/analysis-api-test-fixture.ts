import { vi } from "vitest";
import { createAnalysisDataAcquisition } from "../../../src/service-worker/analysis-data-acquisition.js";
import type { ActivePage } from "../../../src/service-worker/page-context-runtime.js";
export const scope = { document_epoch: "doc", page_scope_epoch: "scope" };
export const active = {
  tabId: 9,
  origin: "https://page-api-fixture.invalid",
  path: "/variant",
  snapshot: { document_epoch: "doc" },
} as ActivePage;
export const binding = {
  run_id: "request",
  tab_id: 9,
  document_id: "document",
  ...scope,
  origin: active.origin,
  path: active.path,
  adapter_id: "fixture_summary",
  adapter_version: 1,
  option_id: "summary",
};
export const apiContext = {
  source: {
    kind: "page_api_read" as const,
    label: "reviewed page summary" as const,
  },
  coverage: "complete" as const,
  collected_count: 1,
  records: [{ index: 0, cells: ["North", "12"] }],
  truncated: false,
};
export const descriptor = {
  collection_ref: "private-ref",
  object_kind: "table",
  container_xpath: "/table",
  has_virtual_scroll: false,
  has_pagination: false,
  sample_rows: [],
};
export const setup = (collections: unknown[] = []) => {
  let allowed = false;
  const controller = new AbortController();
  const request = {
    requestId: "request",
    tabId: 9,
    signal: controller.signal,
    check: () => undefined,
  };
  const check = vi.fn((capability: string) =>
    allowed && capability === "page_api_read"
      ? ("ALLOW" as const)
      : ("REQUIRE_PERMISSION" as const),
  );
  const permissionRequest = vi.fn(() => "api-permission");
  const readPageApi = vi.fn(async () => ({
    ok: true as const,
    context: apiContext,
  }));
  const collect = createAnalysisDataAcquisition({
    chrome: {
      tabs: { sendMessage: async () => ({ collections, ...scope }) },
    } as never,
    permissions: { check },
    scopeFor: () => scope,
    pageApiSource: () => binding,
    readPageApi,
    permissionRequest,
  });
  return {
    collect,
    request,
    controller,
    check,
    permissionRequest,
    readPageApi,
    allow: () => {
      allowed = true;
    },
  };
};
