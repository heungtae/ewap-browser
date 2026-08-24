import type { DebuggerApi } from "../cdp/bounded-adapter.js";

export type BrowserSender = {
  id?: string;
  url?: string;
  tab?: { id?: number };
  frameId?: number;
  documentId?: string;
  documentLifecycle?: string;
};

export type BrowserRuntime = {
  id: string;
  getURL(path: string): string;
  sendMessage(message: unknown): Promise<unknown>;
  getContexts?: (filter: {
    contextTypes: Array<"OFFSCREEN_DOCUMENT" | "SIDE_PANEL">;
    documentUrls?: string[];
    documentIds?: string[];
  }) => Promise<
    Array<{ contextType?: string; documentId?: string; windowId?: number }>
  >;
  onMessage: {
    addListener(
      listener: (
        message: unknown,
        sender: BrowserSender,
        respond: (response: unknown) => void,
      ) => boolean | void,
    ): void;
  };
  onConnect: { addListener(listener: (port: BrowserPort) => void): void };
  lastError?: { message?: string };
};

export type BrowserPort = {
  name: string;
  sender?: { id?: string; url?: string; documentId?: string };
  postMessage?(message: unknown): void;
  disconnect?(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
};

export type BrowserTabs = {
  query(query: Record<string, unknown>): Promise<
    Array<{
      id?: number;
      url?: string;
      windowId?: number;
      title?: string;
      status?: "loading" | "complete";
    }>
  >;
  get(tabId: number): Promise<{ url?: string }>;
  captureVisibleTab(
    windowId?: number,
    options?: { format?: "jpeg" | "png"; quality?: number },
  ): Promise<string>;
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
  onUpdated?: {
    addListener(
      listener: (
        tabId: number,
        changeInfo: { url?: string; status?: string },
      ) => void,
    ): void;
  };
  onActivated?: {
    addListener(
      listener: (activeInfo: { tabId: number; windowId: number }) => void,
    ): void;
  };
  onRemoved?: { addListener(listener: (tabId: number) => void): void };
};

type BrowserStorageArea = {
  setAccessLevel(level: { accessLevel: "TRUSTED_CONTEXTS" }): Promise<void>;
  get?(key: string): Promise<Record<string, unknown>>;
  set?(value: Record<string, unknown>): Promise<void>;
};

export type BrowserStorage = {
  managed: BrowserStorageArea;
  local: BrowserStorageArea;
  session: BrowserStorageArea;
};

export type BrowserOffscreen = {
  hasDocument?: () => Promise<boolean>;
  createDocument(options: {
    url: string;
    reasons: ["BLOBS"];
    justification: string;
  }): Promise<void>;
};
export type BrowserPermissions = {
  contains(query: { permissions: string[] }): Promise<boolean>;
};
export type BrowserScripting = {
  executeScript(injection: {
    target: { tabId: number };
    files: string[];
  }): Promise<unknown>;
};

export type BrowserChromeApi = {
  runtime: BrowserRuntime;
  tabs: BrowserTabs;
  debugger?: DebuggerApi;
  storage: BrowserStorage;
  offscreen?: BrowserOffscreen;
  permissions?: BrowserPermissions;
  scripting?: BrowserScripting;
};
