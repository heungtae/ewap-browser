import { createTaskHistoryClient } from "../../../../apps/chrome-extension/src/bridge/task-history-client.js";
import { api } from "../../../../apps/chrome-extension/src/bridge/api.js";
import { createView } from "../../../../apps/chrome-extension/src/presentation/view.js";
import { mountPresentation } from "../../../../apps/chrome-extension/src/presentation/controller.js";
async function mountHistory() {
  const taskId = (await api!.storage.session.get("historyFixtureTask"))
    .historyFixtureTask as string;
  const tasks = createTaskHistoryClient(taskId, async (command) => {
    const response = (await api!.runtime.sendMessage(command)) as {
      ok: boolean;
      result?: unknown;
    };
    if (!response.ok) throw Error("FIXTURE_HISTORY_UNAVAILABLE");
    return response.result;
  });
  let responses = 0;
  tasks.panel = {
    async start() {
      throw Error("UNAVAILABLE");
    },
    async clear() {
      throw Error("UNAVAILABLE");
    },
    async cancel() {
      throw Error("UNAVAILABLE");
    },
    async respond() {
      responses++;
    },
  };
  const view = createView(document);
  const fixture = {
    responses: () => responses,
    seedOldValue() {
      const base = { runId: taskId, requestId: "history_request" };
      view.event?.({
        ...base,
        type: "run_started",
        mode: "act",
        permission_mode: "standard",
      });
      view.event?.({
        ...base,
        type: "value_required",
        value_kind: "text",
        action: {
          tool: "click_by_ref",
          target_name: "Fixture",
          approval_scope: "single_step",
        },
        prompt: {
          id: "old_value",
          revision: 1,
          requestId: base.requestId,
          documentId: "fixture_document",
          expiresAt: Date.now() + 60000,
        },
      });
      const input = document.querySelector<HTMLInputElement>(
        "[data-kind=value] input",
      )!;
      input.value = "PRIVATE_OLD_VALUE";
      return !input.disabled;
    },
  };
  (
    globalThis as typeof globalThis & { __historyFixture?: typeof fixture }
  ).__historyFixture = fixture;
  const state = { cursor: 0, snapshotRequired: false };
  const settings = {
    read: async () => ({
      controllerReady: false,
      analystReady: false,
      secretMode: "session-only" as const,
    }),
  };
  let dispose: (() => void) | undefined;
  const mount = () => {
    dispose ??= mountPresentation(document, view, tasks, settings, state);
  };
  window.addEventListener("pagehide", () => {
    dispose?.();
    dispose = undefined;
  });
  window.addEventListener("pageshow", mount);
  mount();
}
void mountHistory();
