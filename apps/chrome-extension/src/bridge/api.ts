import type { NativePort } from "./native.js";
interface Sender {
  id?: string;
  url?: string;
  documentId?: string;
}
export interface ExtensionContext {
  contextType: string;
  documentId?: string;
  documentUrl?: string;
  windowId: number;
}
export async function liveUiSender(
  extensionId: string,
  sender: Sender,
  getContexts: () => Promise<ExtensionContext[]>,
): Promise<boolean> {
  if (!sender.documentId || !sender.url || sender.id !== extensionId)
    return false;
  const urls = [
    "sidepanel/index.html",
    "settings/index.html",
    "settings/learned-profiles.html",
  ];
  if (
    !urls.some(
      (path) =>
        sender.url!.split("#")[0] ===
        `chrome-extension://${extensionId}/${path}`,
    )
  )
    return false;
  const matches = (await getContexts()).filter(
    (context) =>
      (context.contextType === "SIDE_PANEL" || context.contextType === "TAB") &&
      context.documentId === sender.documentId &&
      context.documentUrl === sender.url &&
      Number.isSafeInteger(context.windowId) &&
      context.windowId >= 0,
  );
  return matches.length === 1;
}
export interface ChromeApi {
  runtime: {
    id: string;
    connectNative(name: string): NativePort;
    sendMessage(value: unknown): Promise<unknown>;
    getContexts(filter: { documentIds: string[] }): Promise<ExtensionContext[]>;
    onMessage: {
      addListener(
        callback: (
          value: unknown,
          sender: Sender,
          reply: (value: unknown) => void,
        ) => boolean,
      ): void;
    };
    onInstalled: { addListener(callback: () => void): void };
  };
  storage: { session: { get(key: string): Promise<Record<string, unknown>> } };
  sidePanel: {
    setPanelBehavior(value: { openPanelOnActionClick: boolean }): Promise<void>;
  };
}
export const api = (globalThis as typeof globalThis & { chrome?: ChromeApi })
  .chrome;
