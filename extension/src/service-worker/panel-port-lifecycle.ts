import type { BrowserChromeApi, BrowserPort } from "./browser-api.js";

export type PanelPort = { port: BrowserPort; windowId: number };

type Dependencies = {
  chrome: BrowserChromeApi | undefined;
  handleProvider(port: BrowserPort): void;
};

export const createPanelPortLifecycle = (dependencies: Dependencies) => {
  const panelPorts = new Map<string, PanelPort>();
  const unboundPanelPorts = new Set<BrowserPort>();
  const rememberUnbound = (port: BrowserPort): void => {
    unboundPanelPorts.add(port);
    port.onDisconnect.addListener(() => unboundPanelPorts.delete(port));
  };
  const register = (): void => {
    dependencies.chrome?.runtime.onConnect.addListener((port) => {
      if (port.name !== "contextpilot-panel") {
        dependencies.handleProvider(port);
        return;
      }
      const chrome = dependencies.chrome;
      const documentId = port.sender?.documentId;
      if (
        !chrome ||
        port.sender?.id !== chrome.runtime.id ||
        port.sender?.url !== chrome.runtime.getURL("sidepanel/index.html")
      )
        return;
      if (!documentId || !chrome.runtime.getContexts) {
        rememberUnbound(port);
        return;
      }
      void chrome.runtime
        .getContexts({
          contextTypes: ["SIDE_PANEL"],
          documentIds: [documentId],
        })
        .then((contexts) => {
          const matches = contexts.filter(
            (context) =>
              context.contextType === "SIDE_PANEL" &&
              context.documentId === documentId &&
              Number.isInteger(context.windowId),
          );
          const windowId = matches[0]?.windowId;
          if (matches.length !== 1 || windowId === undefined) {
            rememberUnbound(port);
            return;
          }
          panelPorts.set(documentId, { port, windowId });
          port.onDisconnect.addListener(() => {
            panelPorts.delete(documentId);
            unboundPanelPorts.delete(port);
          });
        })
        .catch(() => rememberUnbound(port));
    });
  };
  const notifyTabActivation = (tabId: number, windowId: number): void => {
    for (const panel of panelPorts.values())
      if (panel.windowId === windowId)
        panel.port.postMessage?.({
          kind: "CHAT_THREAD_CHANGED",
          tab_id: tabId,
        });
    if (unboundPanelPorts.size === 1)
      [...unboundPanelPorts][0]?.postMessage?.({ kind: "CHAT_THREAD_CHANGED" });
  };
  return { notifyTabActivation, panelPorts, register, unboundPanelPorts };
};
