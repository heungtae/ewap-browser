import { ContractError } from "../security/validation.js";
import type { BrowserChromeApi, BrowserSender } from "./browser-api.js";

export const createPageSenderContext = (chrome?: BrowserChromeApi) => {
  const panelUrl = (): string | undefined =>
    chrome?.runtime.getURL("sidepanel/index.html");
  const isPanelSender = (sender: BrowserSender): boolean =>
    sender.id === chrome?.runtime.id && sender.url === panelUrl();
  const activeTabForPanel = async (
    sender: BrowserSender,
  ): Promise<{ id: number; title?: string; url?: string }> => {
    const documentId = sender.documentId;
    let windowId: number | undefined;
    if (sender.panelWindowId !== undefined)
      windowId = await windowForPanel(sender);
    if (
      windowId === undefined &&
      isPanelSender(sender) &&
      documentId &&
      chrome?.runtime.getContexts
    ) {
      const matches = (
        await chrome.runtime.getContexts({
          contextTypes: ["SIDE_PANEL"],
          documentIds: [documentId],
        })
      ).filter(
        (context) =>
          context.contextType === "SIDE_PANEL" &&
          context.documentId === documentId &&
          Number.isInteger(context.windowId),
      );
      if (matches.length === 1) windowId = matches[0]?.windowId;
    }
    const tab = (
      await chrome!.tabs.query(
        windowId === undefined
          ? { active: true, lastFocusedWindow: true }
          : { active: true, windowId },
      )
    )[0];
    if (!tab || tab.id === undefined)
      throw new ContractError("ORIGIN_NOT_ALLOWED");
    return {
      id: tab.id,
      ...(tab.title ? { title: tab.title } : {}),
      ...(tab.url ? { url: tab.url } : {}),
    };
  };
  const windowForPanel = async (sender: BrowserSender): Promise<number> => {
    if (!isPanelSender(sender) || !chrome?.runtime.getContexts)
      throw new ContractError("PANEL_CONTEXT_UNAVAILABLE");
    const documentId = sender.documentId;
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["SIDE_PANEL"],
      ...(documentId
        ? { documentIds: [documentId] }
        : { documentUrls: [panelUrl()!] }),
    });
    const matches = contexts.filter(
      (context) =>
        context.contextType === "SIDE_PANEL" &&
        (!documentId || context.documentId === documentId),
    );
    if (matches.length !== 1)
      throw new ContractError("PANEL_CONTEXT_UNAVAILABLE");
    const contextWindowId = matches[0]?.windowId;
    const claimed = sender.panelWindowId;
    if (Number.isInteger(contextWindowId) && contextWindowId! >= 0) {
      if (claimed !== undefined && claimed !== contextWindowId)
        throw new ContractError("PANEL_CONTEXT_UNAVAILABLE");
      return contextWindowId!;
    }
    // Chromium reports -1 for a real side panel. Only our authenticated
    // extension page may provide its chrome.windows.getCurrent() result.
    if (!Number.isInteger(claimed) || claimed! < 0)
      throw new ContractError("PANEL_CONTEXT_UNAVAILABLE");
    return claimed!;
  };
  const activeTabForBoundPanel = async (
    sender: BrowserSender,
  ): Promise<{ id: number; url?: string }> => {
    const windowId = await windowForPanel(sender);
    const tab = (await chrome!.tabs.query({ active: true, windowId }))[0];
    if (tab?.id === undefined)
      throw new ContractError("PANEL_CONTEXT_UNAVAILABLE");
    return { id: tab.id, ...(tab.url ? { url: tab.url } : {}) };
  };
  const isSettingsSender = (sender: BrowserSender): boolean =>
    sender.id === chrome?.runtime.id &&
    sender.url === chrome?.runtime.getURL("settings/index.html");
  const pageOrigin = (value: string | undefined): string => {
    try {
      const parsed = new URL(value ?? "");
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
        throw new Error();
      return parsed.origin;
    } catch {
      throw new ContractError("ORIGIN_NOT_ALLOWED");
    }
  };
  return {
    windowForPanel,
    activeTabForPanel,
    activeTabForBoundPanel,
    isPanelSender,
    isSettingsSender,
    isPanelOrSettingsSender: (sender: BrowserSender) =>
      isPanelSender(sender) || isSettingsSender(sender),
    pageOrigin,
  };
};
