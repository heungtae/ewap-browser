import type { DebuggerApi, MarkerStore } from "./cdp-types.js";

const notAttached = (error: unknown): boolean =>
  error instanceof Error &&
  /not attached|no debugger attached|target is not attached/i.test(
    error.message,
  );

export const recoverCdpSessions = async (
  debuggerApi: DebuggerApi,
  markers: MarkerStore,
  quarantine: (tabId: number) => void,
): Promise<void> => {
  const pending = await markers.list?.();
  if (!pending) return;
  for (const marker of pending) {
    const target = { tabId: marker.tabId };
    try {
      // A no-input command succeeds only when this extension owns the session.
      await debuggerApi.sendCommand(target, "DOM.getDocument", {
        depth: 0,
        pierce: false,
      });
    } catch (error) {
      if (notAttached(error)) await markers.clear(marker.tabId);
      else quarantine(marker.tabId);
      continue;
    }
    try {
      await debuggerApi.sendCommand(target, "DOM.disable");
      await debuggerApi.detach(target);
      await markers.clear(marker.tabId);
    } catch {
      quarantine(marker.tabId);
    }
  }
};
