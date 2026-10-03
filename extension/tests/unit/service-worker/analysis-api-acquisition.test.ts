import { describe, expect, it, vi } from "vitest";
import { createAnalysisDataAcquisition } from "../../../src/service-worker/analysis-data-acquisition.js";
import type { AnalysisCollectionWait } from "../../../src/service-worker/analysis-data-acquisition.js";
import { analysisDataForScope } from "../../../src/service-worker/analysis-data-scope.js";

import {
  scope,
  active,
  binding,
  apiContext,
  descriptor,
  setup,
} from "./analysis-api-test-fixture.js";

describe("reviewed API analysis acquisition", () => {
  it("resumes the same source only after its independent R0 permission", async () => {
    const test = setup();
    const wait = (await test.collect(
      "Analyze page data",
      active,
      "run",
      test.request,
    )) as AnalysisCollectionWait;
    expect(wait).toMatchObject({
      state: "ANALYSIS_COLLECTION_PERMISSION_REQUIRED",
      candidates: [
        { object_kind: "page_api_read", label: "reviewed page summary" },
      ],
    });
    expect(test.permissionRequest).toHaveBeenCalledWith(
      active.origin,
      "request",
      "page_api_read",
    );
    expect(test.readPageApi).not.toHaveBeenCalled();
    test.allow();
    expect(
      await test.collect(
        "Analyze page data",
        active,
        "run",
        test.request,
        false,
        {
          selection_id: wait.selection_id,
          candidate_id: wait.selected_candidate_id!,
        },
      ),
    ).toEqual(apiContext);
    expect(test.readPageApi).toHaveBeenCalledWith(binding, test.request);
    expect(JSON.stringify(wait)).not.toContain("adapter_id");
    expect(JSON.stringify(apiContext)).not.toContain("document_id");
  });
  it("asks the user when a reviewed API competes with a collection", async () => {
    const test = setup([descriptor]);
    const wait = (await test.collect(
      "Analyze page data",
      active,
      "run",
      test.request,
    )) as AnalysisCollectionWait;
    expect(wait.state).toBe("ANALYSIS_COLLECTION_SELECTION_REQUIRED");
    expect(wait.candidates.map((item) => item.object_kind)).toEqual([
      "table",
      "page_api_read",
    ]);
    expect(test.check).not.toHaveBeenCalled();
    expect(test.readPageApi).not.toHaveBeenCalled();
  });
  it.each(["other request", "other path", "Stop"])(
    "rejects a selection after %s",
    async (reason) => {
      const test = setup();
      const wait = (await test.collect(
        "Analyze data",
        active,
        "run",
        test.request,
      )) as AnalysisCollectionWait;
      test.allow();
      if (reason === "Stop") test.controller.abort();
      const current =
        reason === "other path" ? { ...active, path: "/other" } : active;
      const request = {
        ...test.request,
        requestId:
          reason === "other request" ? "other" : test.request.requestId,
        signal: new AbortController().signal,
      };
      expect(
        await test.collect("Analyze data", current, "run", request, false, {
          selection_id: wait.selection_id,
          candidate_id: wait.selected_candidate_id!,
        }),
      ).toMatchObject({
        coverage: "unavailable",
        reason: "PAGE_CHANGED",
        records: [],
      });
      expect(test.readPageApi).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["PAGE_API_TIMEOUT", "TIMEOUT"],
    ["PAGE_API_CONTRACT_INVALID", "INVALID_SCHEMA"],
    ["PAGE_SCOPE_STALE", "PAGE_CHANGED"],
  ] as const)("discards a failed API result: %s", async (code, reason) => {
    const test = setup();
    test.allow();
    test.readPageApi.mockResolvedValue({ ok: false, code } as never);
    expect(
      await test.collect("Analyze data", active, "run", test.request),
    ).toMatchObject({
      source: { kind: "page_api_read" },
      coverage: "unavailable",
      reason,
      records: [],
      collected_count: 0,
    });
    expect(test.readPageApi).toHaveBeenCalledOnce();
  });
  it("returns review-only availability without invoking unreviewed candidates", async () => {
    const readPageApi = vi.fn();
    const collect = createAnalysisDataAcquisition({
      chrome: {
        tabs: { sendMessage: async () => ({ collections: [], ...scope }) },
      } as never,
      permissions: { check: () => "ALLOW" },
      scopeFor: () => scope,
      requiresAdapterReview: async () => true,
      readPageApi,
    });
    expect(await collect("Analyze data", active, "run")).toEqual({
      ok: true,
      state: "ANALYSIS_ADAPTER_REVIEW_REQUIRED",
    });
    expect(readPageApi).not.toHaveBeenCalled();
  });
  it("preserves the API source label while discarding stale records", () => {
    expect(
      analysisDataForScope(
        apiContext,
        { ...scope, origin: active.origin, path: active.path },
        {
          ...scope,
          page_scope_epoch: "changed",
          origin: active.origin,
          path: active.path,
        },
      ),
    ).toMatchObject({
      source: apiContext.source,
      reason: "PAGE_CHANGED",
      records: [],
    });
  });
});
