import type { NativePort } from "./native.js";
interface Sender {
  id?: string;
  url?: string;
}
export interface ChromeApi {
  runtime: {
    id: string;
    connectNative(name: string): NativePort;
    sendMessage(value: unknown): Promise<unknown>;
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
