import { CdpAttachDenied, type CdpTransport } from "./types.js";
type Target = { tabId: number };
type EventListener = (target: Target, method: string, params?: object) => void;
type DetachListener = (target: Target, reason: string) => void;
export interface ChromeDebuggerApi {
  attach(target: Target, version: string): Promise<void>;
  detach(target: Target): Promise<void>;
  sendCommand(target: Target, method: string, params: object): Promise<unknown>;
  onEvent: {
    addListener(fn: EventListener): void;
    removeListener(fn: EventListener): void;
  };
  onDetach: {
    addListener(fn: DetachListener): void;
    removeListener(fn: DetachListener): void;
  };
}
const commands = new Set([
  "Accessibility.getFullAXTree",
  "Network.enable",
  "Network.getResponseBody",
  "Page.captureScreenshot",
  "Input.insertText",
]);
// Private trusted adapter. Runtime tools receive only the broker's typed operations.
export class ChromeDebuggerTransport implements CdpTransport {
  private owned = new Set<number>();
  constructor(private api: ChromeDebuggerApi) {}
  async attach(tabId: number) {
    if (!Number.isSafeInteger(tabId) || tabId < 0 || this.owned.has(tabId))
      throw new Error("CDP_TARGET");
    try {
      await this.api.attach({ tabId }, "1.3");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        /another debugger|not allowed|permission|cannot access|cannot attach to this target/i.test(
          message,
        )
      )
        throw new CdpAttachDenied("CDP_ATTACH_DENIED");
      throw new Error("CDP_ATTACH_UNKNOWN");
    }
    this.owned.add(tabId);
  }
  async detach(tabId: number) {
    if (!this.owned.has(tabId)) throw new Error("CDP_NOT_OWNED");
    await this.api.detach({ tabId });
    this.owned.delete(tabId);
  }
  send(tabId: number, method: string, params: Record<string, unknown>) {
    if (!this.owned.has(tabId) || !commands.has(method))
      throw new Error("CDP_COMMAND_DENIED");
    return this.api.sendCommand({ tabId }, method, params);
  }
  listen(tabId: number, listener: (method: string, params: unknown) => void) {
    const fn: EventListener = (target, method, params) => {
      if (target.tabId === tabId && this.owned.has(tabId))
        listener(method, params);
    };
    this.api.onEvent.addListener(fn);
    return () => this.api.onEvent.removeListener(fn);
  }
  onDetach(tabId: number, listener: () => void) {
    const fn: DetachListener = (target) => {
      if (target.tabId === tabId) {
        this.owned.delete(tabId);
        listener();
      }
    };
    this.api.onDetach.addListener(fn);
    return () => this.api.onDetach.removeListener(fn);
  }
}
