import type { BrowserChromeApi, BrowserPort } from "./browser-api.js";
import { createPageSenderContext } from "./page-sender-context.js";

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
      let disconnected = false;
      let generation = 0;
      const key = documentId ?? crypto.randomUUID();
      port.onDisconnect.addListener(() => {
        disconnected = true;
        if (panelPorts.get(key)?.port === port) panelPorts.delete(key);
        unboundPanelPorts.delete(port);
      });
      const bind = async (panelWindowId?: number): Promise<void> => {
        const attempt = ++generation;
        try {
          const windowId = await createPageSenderContext(chrome).windowForPanel(
            {
              ...port.sender,
              ...(panelWindowId === undefined ? {} : { panelWindowId }),
            },
          );
          if (disconnected || attempt !== generation) return;
          panelPorts.set(key, { port, windowId });
          unboundPanelPorts.delete(port);
        } catch {
          if (!disconnected && attempt === generation) rememberUnbound(port);
        }
      };
      port.onMessage.addListener((message) => {
        if (typeof message !== "object" || message === null) return;
        const value = message as { kind?: unknown; window_id?: unknown };
        if (
          value.kind === "PANEL_BIND" &&
          Object.keys(value).length === 2 &&
          Number.isInteger(value.window_id) &&
          (value.window_id as number) >= 0
        )
          void bind(value.window_id as number);
      });
      void bind();
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
