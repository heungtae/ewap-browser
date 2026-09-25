export type Debuggee = { tabId: number };
export type DebuggerApi = {
  attach(target: Debuggee, version: "1.3"): Promise<void>;
  sendCommand(
    target: Debuggee,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  detach(target: Debuggee): Promise<void>;
  onDetach?: {
    addListener(listener: (target: Debuggee, reason: string) => void): void;
  };
};
export type SessionMarker = {
  tabId: number;
  runId: string;
  actionId: string;
  phase: "attaching" | "attached";
};
export type MarkerStore = {
  set(marker: SessionMarker): Promise<void>;
  clear(tabId: number): Promise<void>;
  list?(): Promise<SessionMarker[]>;
};
