import type { NativePort } from "./native.js";
import { replaySchema } from "@contextpilot/shared/bridge";
import { z } from "zod";
interface Sender {
  id?: string;
  url?: string;
  documentId?: string;
  origin?: string;
  tab?: unknown;
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
  allowPanelBootstrap = false,
): Promise<boolean> {
  if (!sender.url || sender.id !== extensionId) return false;
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
  if (!sender.documentId) {
    if (
      !allowPanelBootstrap ||
      sender.url.split("#")[0] !==
        `chrome-extension://${extensionId}/sidepanel/index.html` ||
      sender.origin !== `chrome-extension://${extensionId}`
    )
      return false;
    const panels = (await getContexts()).filter(
      (context) =>
        context.contextType === "SIDE_PANEL" &&
        context.documentUrl === sender.url &&
        !!context.documentId &&
        Number.isSafeInteger(context.windowId) &&
        context.windowId >= -1,
    );
    return panels.length === 1;
  }
  const matches = (await getContexts()).filter(
    (context) =>
      (context.contextType === "SIDE_PANEL" || context.contextType === "TAB") &&
      context.documentId === sender.documentId &&
      context.documentUrl === sender.url &&
      Number.isSafeInteger(context.windowId) &&
      (context.windowId >= 0 ||
        (context.contextType === "SIDE_PANEL" && context.windowId === -1)),
  );
  return matches.length === 1;
}
const bootstrapCapabilities = z.strictObject({
  taskReady: z.literal(false),
  browserReady: z.boolean(),
  health: z.strictObject({
    state: z.enum([
      "MISSING_HOST",
      "INVALID_EXECUTABLE",
      "INCOMPATIBLE_VERSION",
      "UNPAIRED",
      "SESSION_ONLY",
      "BRIDGE_READY",
    ]),
    taskReady: z.literal(false),
    browserDispatchReady: z.literal(false),
  }),
});
export function unboundBootstrapResult(kind: unknown, value: unknown): unknown {
  if (kind === "capabilities") return bootstrapCapabilities.parse(value);
  if (kind === "resumeEvents") {
    const result = replaySchema.parse(value);
    if (
      result.events.some(
        (event) =>
          !["browser.connected", "browser.waiting"].includes(event.kind) ||
          event.text !== undefined ||
          event.presentation !== undefined,
      )
    )
      throw new Error("UI_CONTEXT_REQUIRED");
    return result;
  }
  throw new Error("UI_CONTEXT_REQUIRED");
}
export interface ChromeApi {
  runtime: {
    id: string;
    connectNative(name: string): NativePort;
    sendMessage(value: unknown): Promise<unknown>;
    getContexts(filter: {
      documentIds?: string[];
      contextTypes?: string[];
    }): Promise<ExtensionContext[]>;
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
  action: {
    onClicked: {
      addListener(
        callback: (tab: { id?: number; windowId: number }) => void,
      ): void;
    };
  };
  tabs: {
    get(id: number): Promise<{ id?: number; windowId: number }>;
    onRemoved: { addListener(callback: (id: number) => void): void };
    onDetached: { addListener(callback: (id: number) => void): void };
    onUpdated: {
      addListener(
        callback: (
          id: number,
          change: { status?: string; url?: string },
        ) => void,
      ): void;
    };
  };
  sidePanel: {
    setOptions(value: {
      tabId: number;
      path: string;
      enabled: boolean;
    }): Promise<void>;
    open(value: { tabId: number }): Promise<void>;
    setPanelBehavior(value: { openPanelOnActionClick: boolean }): Promise<void>;
  };
}
export const api = (globalThis as typeof globalThis & { chrome?: ChromeApi })
  .chrome;
