import type { Run } from "../state/run-coordinator.js";
import type { BrowserChromeApi } from "./browser-api.js";

type Dependencies = {
  chrome: BrowserChromeApi | undefined;
  stalePageTabs: Set<number>;
  pageScopes: Map<number, unknown>;
  activeRun(tabId: number): Run | undefined;
  cancelForPageChange(run: Run): void;
  cancel(tabId: number): void;
  publishCancelled(run: Run | undefined): void;
  removeChat(tabId: number): void;
  flushChat(): void;
};

export const registerTabLifecycle = (dependencies: Dependencies): void => {
  dependencies.chrome?.tabs.onUpdated?.addListener((tabId, changeInfo) => {
    if (!changeInfo.url) return;
    dependencies.stalePageTabs.add(tabId);
    const run = dependencies.activeRun(tabId);
    if (run?.phase === "VERIFYING_NAVIGATION") return;
    if (run) dependencies.cancelForPageChange(run);
  });
  dependencies.chrome?.tabs.onRemoved?.addListener((tabId) => {
    const run = dependencies.activeRun(tabId);
    if (run) {
      dependencies.cancel(tabId);
      dependencies.publishCancelled(run);
    }
    dependencies.pageScopes.delete(tabId);
    dependencies.stalePageTabs.delete(tabId);
    dependencies.removeChat(tabId);
    dependencies.flushChat();
  });
};
