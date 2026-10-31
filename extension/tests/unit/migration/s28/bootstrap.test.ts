import { expect, it } from "vitest";
import {
  liveUiSender,
  unboundBootstrapResult,
} from "../../../../../apps/chrome-extension/src/bridge/api.js";

it("limits unbound side-panel bootstrap responses to connection status", () => {
  const capabilities = {
    taskReady: false,
    browserReady: true,
    health: {
      state: "SESSION_ONLY",
      taskReady: false,
      browserDispatchReady: false,
    },
  };
  expect(unboundBootstrapResult("capabilities", capabilities)).toEqual(
    capabilities,
  );
  expect(() =>
    unboundBootstrapResult("capabilities", {
      ...capabilities,
      task: "private",
    }),
  ).toThrow();
  expect(() =>
    unboundBootstrapResult("capabilities", {
      ...capabilities,
      taskReady: true,
    }),
  ).toThrow();
  const replay = {
    cursor: 1,
    resync: false,
    events: [{ sequence: 1, revision: 1, kind: "browser.connected" }],
  };
  expect(unboundBootstrapResult("resumeEvents", replay)).toEqual(replay);
  expect(() =>
    unboundBootstrapResult("resumeEvents", {
      ...replay,
      events: [{ ...replay.events[0], text: "private" }],
    }),
  ).toThrow("UI_CONTEXT_REQUIRED");
  expect(() =>
    unboundBootstrapResult("resumeEvents", {
      ...replay,
      events: [{ ...replay.events[0], kind: "message" }],
    }),
  ).toThrow("UI_CONTEXT_REQUIRED");
  expect(() => unboundBootstrapResult("migration.status", {})).toThrow(
    "UI_CONTEXT_REQUIRED",
  );
});

it("binds bridge requests to exactly one live extension document and window", async () => {
  const id = "a".repeat(32);
  const sender = {
    id,
    url: `chrome-extension://${id}/sidepanel/index.html`,
    documentId: "doc",
  };
  const context = {
    contextType: "SIDE_PANEL",
    documentUrl: sender.url,
    documentId: "doc",
    windowId: 1,
  };
  expect(await liveUiSender(id, sender, async () => [context])).toBe(true);
  expect(
    await liveUiSender(id, sender, async () => [
      { ...context, contextType: "TAB" },
    ]),
  ).toBe(true);
  expect(await liveUiSender(id, sender, async () => [])).toBe(false);
  expect(await liveUiSender(id, sender, async () => [context, context])).toBe(
    false,
  );
  expect(
    await liveUiSender(id, { ...sender, documentId: "old" }, async () => [
      context,
    ]),
  ).toBe(false);
  expect(
    await liveUiSender(id, sender, async () => [{ ...context, windowId: -1 }]),
  ).toBe(true);
  expect(
    await liveUiSender(id, sender, async () => [
      { ...context, contextType: "TAB", windowId: -1 },
    ]),
  ).toBe(false);
  expect(
    await liveUiSender(id, sender, async () => [
      { ...context, contextType: "BACKGROUND" },
    ]),
  ).toBe(false);
  expect(
    await liveUiSender(
      id,
      { ...sender, url: `chrome-extension://${id}/other.html` },
      async () => [context],
    ),
  ).toBe(false);
  const sidePanelSender = {
    id,
    url: sender.url,
    origin: `chrome-extension://${id}`,
  };
  const sidePanel = { ...context, windowId: -1 };
  expect(await liveUiSender(id, sidePanelSender, async () => [sidePanel])).toBe(
    false,
  );
  expect(
    await liveUiSender(id, sidePanelSender, async () => [sidePanel], true),
  ).toBe(true);
  expect(
    await liveUiSender(
      id,
      sidePanelSender,
      async () => [sidePanel, sidePanel],
      true,
    ),
  ).toBe(false);
  expect(
    await liveUiSender(
      id,
      { ...sidePanelSender, origin: "https://foreign.test" },
      async () => [sidePanel],
      true,
    ),
  ).toBe(false);
});
