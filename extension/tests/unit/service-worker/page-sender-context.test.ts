import { describe, expect, it, vi } from "vitest";
import { createPageSenderContext } from "../../../src/service-worker/page-sender-context.js";
import type { BrowserChromeApi } from "../../../src/service-worker/browser-api.js";

const panel = "chrome-extension://test/sidepanel/index.html";
const setup = (contexts: Array<{ documentId: string; windowId: number }>) => {
  const query = vi.fn(async () => [{ id: 7 }]);
  const getContexts = vi.fn(async () =>
    contexts.map((context) => ({ contextType: "SIDE_PANEL", ...context })),
  );
  const chrome = {
    runtime: { id: "test", getURL: () => panel, getContexts },
    tabs: { query },
  } as unknown as BrowserChromeApi;
  return { context: createPageSenderContext(chrome), query, getContexts };
};
describe("bound panel context", () => {
  it("authenticates the profile manager without granting general Settings authority", () => {
    const chrome = {
      runtime: {
        id: "test",
        getURL: (path: string) => `chrome-extension://test/${path}`,
      },
    } as unknown as BrowserChromeApi;
    const context = createPageSenderContext(chrome);
    const sender = {
      id: "test",
      url: "chrome-extension://test/settings/learned-profiles.html",
    };
    expect(context.isLearnedProfileManagerSender(sender)).toBe(true);
    expect(context.isSettingsSender(sender)).toBe(false);
    expect(context.isPanelOrSettingsSender(sender)).toBe(false);
    for (const candidate of [
      { ...sender, id: "foreign" },
      { ...sender, url: "https://example.test/settings/learned-profiles.html" },
      { ...sender, url: `${sender.url}?untrusted=1` },
      { ...sender, url: panel },
    ])
      expect(context.isLearnedProfileManagerSender(candidate)).toBe(false);
  });
  it("recovers the panel's bound tab while another window is focused", async () => {
    const query = vi.fn(async (options: { windowId?: number }) => [
      { id: options.windowId === 4 ? 7 : 99 },
    ]);
    const chrome = {
      runtime: {
        id: "test",
        getURL: () => panel,
        getContexts: async () => [
          { contextType: "SIDE_PANEL", documentId: "doc", windowId: -1 },
        ],
      },
      tabs: { query },
    } as unknown as BrowserChromeApi;
    const context = createPageSenderContext(chrome);
    await expect(
      context.activeTabForPanel({
        id: "test",
        url: panel,
        documentId: "doc",
        panelWindowId: 4,
      }),
    ).resolves.toEqual({ id: 7 });
    expect(query).toHaveBeenCalledWith({ active: true, windowId: 4 });
  });
  it("resolves a browser-authenticated unique panel when sender document ID is absent", async () => {
    const { context, query, getContexts } = setup([
      { documentId: "doc", windowId: 4 },
    ]);
    await expect(
      context.activeTabForBoundPanel({ id: "test", url: panel }),
    ).resolves.toEqual({ id: 7 });
    expect(getContexts).toHaveBeenCalledWith({
      contextTypes: ["SIDE_PANEL"],
      documentUrls: [panel],
    });
    expect(query).toHaveBeenCalledWith({ active: true, windowId: 4 });
  });
  it("uses the panel's current window when Chromium reports minus one", async () => {
    const { context, query } = setup([{ documentId: "doc", windowId: -1 }]);
    const sender = {
      id: "test",
      url: panel,
      documentId: "doc",
      panelWindowId: 9,
    };
    await expect(context.activeTabForBoundPanel(sender)).resolves.toEqual({
      id: 7,
    });
    await context.activeTabForPanel(sender);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenLastCalledWith({ active: true, windowId: 9 });
  });
  it("rejects a claimed window that conflicts with browser context", async () => {
    const { context, query } = setup([{ documentId: "doc", windowId: 4 }]);
    await expect(
      context.activeTabForBoundPanel({
        id: "test",
        url: panel,
        documentId: "doc",
        panelWindowId: 9,
      }),
    ).rejects.toThrow("PANEL_CONTEXT_UNAVAILABLE");
    expect(query).not.toHaveBeenCalled();
  });
  it.for([
    [],
    [
      { documentId: "a", windowId: 4 },
      { documentId: "b", windowId: 5 },
    ],
    [{ documentId: "a", windowId: -1 }],
  ])("rejects unresolved or ambiguous windows", async (contexts) => {
    const { context, query } = setup(contexts);
    await expect(
      context.activeTabForBoundPanel({ id: "test", url: panel }),
    ).rejects.toThrow("PANEL_CONTEXT_UNAVAILABLE");
    expect(query).not.toHaveBeenCalled();
  });
  it("does not fall back when a supplied document ID does not match", async () => {
    const { context } = setup([{ documentId: "other", windowId: 4 }]);
    await expect(
      context.activeTabForBoundPanel({
        id: "test",
        url: panel,
        documentId: "doc",
      }),
    ).rejects.toThrow("PANEL_CONTEXT_UNAVAILABLE");
  });
  it("rejects a foreign sender", async () => {
    const { context, getContexts } = setup([
      { documentId: "doc", windowId: 4 },
    ]);
    await expect(
      context.activeTabForBoundPanel({ id: "foreign", url: panel }),
    ).rejects.toThrow("PANEL_CONTEXT_UNAVAILABLE");
    expect(getContexts).not.toHaveBeenCalled();
  });
});
