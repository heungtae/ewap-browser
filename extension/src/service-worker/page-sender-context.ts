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
    if (isPanelSender(sender) && documentId && chrome?.runtime.getContexts) {
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
    activeTabForPanel,
    isPanelSender,
    isSettingsSender,
    isPanelOrSettingsSender: (sender: BrowserSender) =>
      isPanelSender(sender) || isSettingsSender(sender),
    pageOrigin,
  };
};
