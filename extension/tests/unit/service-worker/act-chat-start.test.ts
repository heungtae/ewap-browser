import { describe, expect, it, vi } from "vitest";
import { ContractError } from "../../../src/security/validation.js";
import { createActChatStart } from "../../../src/service-worker/act-chat-start.js";

describe("Act chat start", () => {
  it("keeps an informational Act request out of workflow and action paths", async () => {
    const runStep = vi.fn(async () => ({
      ok: true,
      state: "ANSWER",
      message: "표의 내용을 요약했습니다.",
    }));
    const start = createActChatStart({
      readActive: async () => ({
        tabId: 7,
        origin: "https://reports.company.test",
        path: "/daily",
        snapshot: {
          schema_version: 2,
          document_epoch: "epoch-abcdefghijklmnop",
          frame_id: 0,
          visible_text: "Daily report",
          nodes: [],
        },
      }),
      resolveProfile: async () => {
        throw new ContractError("PROFILE_UNAVAILABLE");
      },
      candidates: async () => [],
      createId: () => "session-abcdefghijkl",
      selections: new Map(),
      persistSelections: async () => undefined,
      sessions: new Map(),
      startActivity: () => "activity-abcdefghijkl",
      progressActivity: () => undefined,
      finishActivity: () => undefined,
      runStep,
      route: async () => "QUESTION",
      runReadOnly: async () => ({
        ok: true,
        state: "ANSWER",
        message: "표의 내용을 요약했습니다.",
      }),
    });

    await expect(
      start({ mode: "act", prompt: "표를 요약해줘" }),
    ).resolves.toEqual({
      ok: true,
      state: "ANSWER",
      message: "표의 내용을 요약했습니다.",
    });
    expect(runStep).not.toHaveBeenCalled();
  });

  it("collects explicit analysis before action workflow discovery", async () => {
    const order: string[] = [];
    const collectAnalysisData = vi.fn(async () => {
      order.push("collect");
      return {
        source: { kind: "collection" as const, label: "table data" },
        coverage: "partial" as const,
        collected_count: 1,
        records: [{ index: 0, cells: ["safe"] }],
        truncated: false,
      };
    });
    const runStep = vi.fn(async (session) => {
      order.push("run");
      expect(session.analysisData).toMatchObject({ collected_count: 1 });
      return { ok: true, state: "ANSWER", message: "ready" };
    });
    const start = createActChatStart({
      readActive: async () => ({
        tabId: 7,
        origin: "https://reports.company.test",
        path: "/daily",
        snapshot: {
          schema_version: 2,
          document_epoch: "epoch-abcdefghijklmnop",
          frame_id: 0,
          visible_text: "Daily report",
          nodes: [],
        },
      }),
      resolveProfile: async () => {
        throw new ContractError("PROFILE_UNAVAILABLE");
      },
      candidates: async () => {
        order.push("candidates");
        return [];
      },
      createId: () => "session-abcdefghijkl",
      selections: new Map(),
      persistSelections: async () => undefined,
      sessions: new Map(),
      startActivity: () => "activity-abcdefghijkl",
      progressActivity: () => undefined,
      finishActivity: () => undefined,
      runStep,
      route: async () => "ACTION_REQUIRED",
      runReadOnly: async () => ({ ok: false, code: "UNEXPECTED" }),
      collectAnalysisData,
    });

    await expect(
      start({ mode: "act", prompt: "표 데이터를 분석하고 저장해" }),
    ).resolves.toMatchObject({ ok: true });
    expect(order).toEqual(["collect", "candidates", "run"]);
    expect(collectAnalysisData).toHaveBeenCalledWith(
      "표 데이터를 분석하고 저장해",
      expect.anything(),
      "session-abcdefghijkl",
      undefined,
      true,
    );
  });
});
