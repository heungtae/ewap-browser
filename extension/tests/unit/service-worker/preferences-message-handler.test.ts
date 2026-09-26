import { describe, expect, it, vi } from "vitest";
import { defaultAgentPreferences } from "../../../src/policy/permission-mode.js";
import { createPreferencesMessageHandler } from "../../../src/service-worker/preferences-message-handler.js";

const sender = {
  id: "extension",
  url: "chrome-extension://extension/settings/index.html",
};
const next = {
  ...defaultAgentPreferences(),
  permission_mode: "skip_all_permission_checks" as const,
};

describe("permission mode settings", () => {
  it("requires exact acknowledgement and cancels runs around a mode save", async () => {
    const order: string[] = [];
    const savePreferences = vi.fn(async () => {
      order.push("save");
    });
    const cancelAllRuns = vi.fn(async () => {
      order.push("cancel");
    });
    const respond = vi.fn();
    const handler = createPreferencesMessageHandler({
      isPanelOrSettingsSender: () => true,
      isSettingsSender: () => true,
      preferences: defaultAgentPreferences,
      validatePreferences: () => next,
      savePreferences,
      cancelAllRuns,
      safeFailure: (code) => ({ ok: false, code }),
    });
    handler.handle(
      {
        kind: "AGENT_PREFERENCES_SAVE",
        payload: { preferences: next, acknowledgement: "wrong" },
      },
      sender,
      respond,
    );
    expect(respond).toHaveBeenLastCalledWith({
      ok: false,
      code: "INVALID_ARGUMENT",
    });
    expect(savePreferences).not.toHaveBeenCalled();
    handler.handle(
      {
        kind: "AGENT_PREFERENCES_SAVE",
        payload: { preferences: next, acknowledgement: "권한 질문 생략" },
      },
      sender,
      respond,
    );
    await vi.waitFor(() =>
      expect(respond).toHaveBeenLastCalledWith({ ok: true, preferences: next }),
    );
    expect(order).toEqual(["cancel", "save", "cancel"]);
  });
  it("rejects a Panel-origin mode save", () => {
    const respond = vi.fn();
    const handler = createPreferencesMessageHandler({
      isPanelOrSettingsSender: () => true,
      isSettingsSender: () => false,
      preferences: defaultAgentPreferences,
      validatePreferences: () => next,
      savePreferences: vi.fn(),
      cancelAllRuns: vi.fn(),
      safeFailure: (code) => ({ ok: false, code }),
    });
    handler.handle(
      {
        kind: "AGENT_PREFERENCES_SAVE",
        payload: { preferences: next, acknowledgement: "권한 질문 생략" },
      },
      sender,
      respond,
    );
    expect(respond).toHaveBeenCalledWith({
      ok: false,
      code: "INVALID_ARGUMENT",
    });
  });
});
