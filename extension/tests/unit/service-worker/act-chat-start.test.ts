import { describe, expect, it, vi } from "vitest";
import { ContractError } from "../../../src/security/validation.js";
import { createActChatStart } from "../../../src/service-worker/act-chat-start.js";

describe("Act chat start", () => {
  it("starts_a_read_only_session_when_the_page_has_no_action_or_profile", async () => {
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
    });

    await expect(
      start({ mode: "act", prompt: "표를 요약해줘" }),
    ).resolves.toEqual({
      ok: true,
      state: "ANSWER",
      message: "표의 내용을 요약했습니다.",
    });
    expect(runStep).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: { id: "page-derived-ui-v1", version: 1 },
        discovery: "profile",
        definitions: [],
        profileDefinitions: [],
      }),
    );
  });
});
