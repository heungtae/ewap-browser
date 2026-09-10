import type { ChatEventPayload } from "../contracts/chat-events.js";
import type {
  LocalFixtureSessionBinding,
  SessionBinding,
} from "../state/local-session-binding.js";
import type { Run } from "../state/run-coordinator.js";
import type { TabChatSessionStore } from "../state/tab-chat-session-store.js";
import type { VisionCapture } from "./vision-capture.js";
import { ChatPersistence } from "./chat-persistence.js";
import type { BrowserChromeApi } from "./browser-api.js";
import type { ServiceCoordinator } from "./coordinator.js";
import type { PanelPort } from "./panel-port-lifecycle.js";

type Dependencies = {
  chrome: BrowserChromeApi | undefined;
  events: TabChatSessionStore;
  panels: Map<string, PanelPort>;
  captures: Map<string, VisionCapture>;
  coordinator: ServiceCoordinator;
  bindings: Map<string, SessionBinding>;
  localSessions: LocalFixtureSessionBinding;
};

export const createChatRunLifecycle = (dependencies: Dependencies) => {
  const persistence = new ChatPersistence(
    dependencies.chrome?.storage.session?.set
      ? {
          set: dependencies.chrome.storage.session.set.bind(
            dependencies.chrome.storage.session,
          ),
        }
      : undefined,
    () => dependencies.events.snapshot(),
  );
  const flush = (): void => persistence.flush();
  const schedule = (immediate = false): void => persistence.schedule(immediate);
  const clearScheduled = (): void => persistence.clearScheduled();
  const releaseVision = (runId: string): void => {
    for (const key of dependencies.captures.keys())
      if (key.startsWith(`${runId}:`)) dependencies.captures.delete(key);
  };
  const rememberVision = (runId: string, capture: VisionCapture): void => {
    dependencies.captures.set(`${runId}:${capture.capture_id}`, capture);
  };
  const publish = (runId: string, payload: ChatEventPayload): void => {
    if (
      !dependencies.events.has(runId) ||
      dependencies.events.terminal(runId)
    ) {
      return;
    }
    const event = dependencies.events.append(runId, payload);
    schedule(payload.type === "run_terminal");
    for (const [documentId, panel] of dependencies.panels) {
      void dependencies.chrome?.tabs
        .query({ active: true, windowId: panel.windowId })
        .then((tabs) => {
          if (tabs[0]?.id === event.tab_id)
            panel.port.postMessage?.({ kind: "CHAT_EVENT", event });
        })
        .catch(() => dependencies.panels.delete(documentId));
    }
  };
  const publishCancelled = (run: Run | undefined): void => {
    if (run) releaseVision(run.id);
    if (
      run &&
      dependencies.events.has(run.id) &&
      !dependencies.events.terminal(run.id)
    )
      publish(run.id, { type: "run_terminal", outcome: "CANCELLED" });
  };
  const cancelForPageChange = (run: Run): void => {
    const binding = dependencies.bindings.get(run.id);
    if (binding) dependencies.localSessions.clear(binding.id);
    dependencies.bindings.delete(run.id);
    dependencies.coordinator.cancel(run.tabId);
    publishCancelled(run);
  };
  return {
    cancelForPageChange,
    clearScheduled,
    flush,
    persistence,
    publish,
    publishCancelled,
    releaseVision,
    rememberVision,
    schedule,
  };
};
