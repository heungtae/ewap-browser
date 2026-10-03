import { expect, it, vi } from "vitest";
import { createActChatStart } from "../../../src/service-worker/act-chat-start.js";
import { ContractError } from "../../../src/security/validation.js";
it("keeps unreviewed API availability out of the action provider and workflows", async () => {
  const candidates = vi.fn(async () => []);
  const runStep = vi.fn(async () => ({ ok: true }));
  const finishActivity = vi.fn();
  const start = createActChatStart({
    readActive: async () => ({
      tabId: 9,
      origin: "https://fixture.invalid",
      path: "/report",
      snapshot: {
        schema_version: 2,
        document_epoch: "doc",
        frame_id: 0,
        visible_text: "Unreviewed data",
        nodes: [],
      },
    }),
    pageScope: (active) => ({
      document_epoch: active.snapshot.document_epoch,
      page_scope_epoch: "scope",
      origin: active.origin,
      path: active.path,
    }),
    resolveProfile: async () => {
      throw new ContractError("PROFILE_UNAVAILABLE", "resolver_not_configured");
    },
    candidates,
    runStep,
    createId: () => "session",
    sessions: new Map(),
    selections: new Map(),
    persistSelections: async () => undefined,
    startActivity: () => "activity",
    progressActivity: () => undefined,
    finishActivity,
    route: async () => "ACTION_REQUIRED",
    runReadOnly: async () => ({ ok: true }),
    collectAnalysisData: async () => ({
      ok: true,
      state: "ANALYSIS_ADAPTER_REVIEW_REQUIRED",
    }),
  });
  await expect(
    start({ mode: "act", prompt: "Analyze data and save" }),
  ).resolves.toEqual({ ok: true, state: "ANALYSIS_ADAPTER_REVIEW_REQUIRED" });
  expect(candidates).not.toHaveBeenCalled();
  expect(runStep).not.toHaveBeenCalled();
  expect(finishActivity).toHaveBeenCalledWith("activity", "COMPLETED");
});
