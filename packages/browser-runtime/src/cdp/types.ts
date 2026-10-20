import type { ToolContext } from "@contextpilot/tool-registry";
export type CdpCapability = "ax" | "network" | "capture" | "input";
export interface CdpTransport {
  attach(tabId: number): Promise<void>;
  detach(tabId: number): Promise<void>;
  send(
    tabId: number,
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown>;
  listen(
    tabId: number,
    listener: (method: string, params: unknown) => void,
  ): () => void;
  onDetach(tabId: number, listener: () => void): () => void;
}
export interface CdpOwnership {
  mark(
    tabId: number,
    owner: string,
    state: "attaching" | "owned" | "quarantined",
  ): Promise<void>;
  clear(tabId: number, owner: string): Promise<void>;
  available(tabId: number): Promise<boolean>;
}
export interface BrokerOptions {
  transport: CdpTransport;
  ownership: CdpOwnership;
  current(): ToolContext;
  allowed(capability: CdpCapability, context: ToolContext): boolean;
}
export interface ObservedResponse {
  requestId: string;
  url: string;
  method: string;
  status: number;
  mime: string;
  bytes: number | null;
  finished: boolean;
}
export async function within<T>(operation: Promise<T>, ms = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("CDP_TIMEOUT")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Only adapters with a definitive native rejection may release an attach intent.
export class CdpAttachDenied extends Error {}
