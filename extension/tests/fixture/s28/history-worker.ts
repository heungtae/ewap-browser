import {
  api,
  liveUiSender,
} from "../../../../apps/chrome-extension/src/bridge/api.js";
import { NativeBridge } from "../../../../apps/chrome-extension/src/bridge/native.js";
import { taskHistoryCommandSchema } from "../../../../packages/shared/src/bridge.js";
let connection: Promise<NativeBridge> | undefined;
async function connect() {
  return (connection ??= (async () => {
    const p = (await api!.storage.session.get("s28Pairing"))
      .s28Pairing as Record<string, string>;
    return new NativeBridge(
      api!.runtime.connectNative("ai.contextpilot.agent"),
      {
        installationId: p.installationId!,
        profileId: p.profileId!,
        secret: p.secret!,
        extensionId: api!.runtime.id,
      },
      { history: true },
    );
  })());
}
// Fixture composition only. Ownership is injected from the runner's actual Chrome tab.
// This route is not included in the target Worker and cannot admit/execute a task.
api!.runtime.onMessage.addListener((raw, sender, reply) => {
  void (async () => {
    const command = taskHistoryCommandSchema.parse(raw);
    const bound = (await api!.storage.session.get("historyFixtureTab"))
      .historyFixtureTab as { id: number; windowId: number };
    const tab = sender.tab as { id?: number; windowId?: number } | undefined;
    if (
      !bound ||
      tab?.id !== bound.id ||
      tab.windowId !== bound.windowId ||
      sender.url !==
        `chrome-extension://${api!.runtime.id}/sidepanel/index.html` ||
      !(await liveUiSender(api!.runtime.id, sender, () =>
        api!.runtime.getContexts({ documentIds: [sender.documentId!] }),
      ))
    )
      throw Error("HISTORY_OWNER");
    const bridge = await connect();
    try {
      return await bridge.request(command);
    } catch (error) {
      bridge.close();
      connection = undefined;
      throw error;
    }
  })().then(
    (result) => reply({ ok: true, result }),
    (error: unknown) => {
      const reason =
        error instanceof Error &&
        [
          "HISTORY_OWNER",
          "BACKEND_DISCONNECTED",
          "MIGRATION_UNAVAILABLE",
          "TASK_HISTORY_UNAVAILABLE",
          "BACKEND_UNAVAILABLE",
          "BRIDGE_TIMEOUT",
        ].includes(error.message)
          ? error.message
          : "INVALID_FIXTURE_READ";
      reply({ ok: false, reason });
    },
  );
  return true;
});
