import { isPlainObject } from "../security/validation.js";
import { exactKeys } from "./runtime-message-router.js";
import type { BrowserSender } from "./browser-api.js";

type Respond = (response: unknown) => void;
type Active = {
  tabId: number;
  origin: string;
  path: string;
  snapshot: { document_epoch: string };
};
type Recording = {
  tabId: number;
  documentEpoch: string;
  origin: string;
  path: string;
};
type Dependencies = {
  isPanelSender(sender: BrowserSender): boolean;
  active(): Promise<Active>;
  createId(): string;
  send(tabId: number, message: unknown): Promise<unknown>;
  recordings: Map<string, Recording>;
  safeFailure(code: string): unknown;
};

export const createWorkflowRecordStartMessageHandler = (
  dependencies: Dependencies,
) => ({
  handle(
    message: object,
    sender: BrowserSender,
    respond: Respond,
  ): { handled: boolean; keepAlive?: boolean } {
    if ((message as { kind?: unknown }).kind !== "WORKFLOW_RECORD_START")
      return { handled: false };
    if (!dependencies.isPanelSender(sender) || !exactKeys(message, ["kind"])) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    void dependencies
      .active()
      .then(async (active) => {
        const id = dependencies.createId();
        const result = await dependencies.send(active.tabId, {
          kind: "CONTENT_WORKFLOW_RECORD_START",
          recording_id: id,
          document_epoch: active.snapshot.document_epoch,
        });
        if (!isPlainObject(result) || result.ok !== true)
          return respond(dependencies.safeFailure("WORKFLOW_STATE_MISMATCH"));
        dependencies.recordings.set(id, {
          tabId: active.tabId,
          documentEpoch: active.snapshot.document_epoch,
          origin: active.origin,
          path: active.path,
        });
        respond({ ok: true, recording_id: id });
      })
      .catch(() =>
        respond(dependencies.safeFailure("WORKFLOW_STATE_MISMATCH")),
      );
    return { handled: true, keepAlive: true };
  },
});
