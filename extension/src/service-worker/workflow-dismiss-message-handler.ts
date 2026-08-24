import { exactKeys } from "./runtime-message-router.js";
import type { BrowserSender } from "./browser-api.js";
import type { SemanticSnapshot } from "../contracts/types.js";

type Respond = (response: unknown) => void;
type Selection = {
  id: string;
  tabId: number;
  origin: string;
  documentEpoch: string;
};
type Active = {
  tabId: number;
  origin: string;
  snapshot: SemanticSnapshot;
};
type Dependencies = {
  isPanelSender(sender: BrowserSender): boolean;
  selection(id: string): Selection | undefined;
  active(): Promise<Active>;
  dismiss(
    selection: Selection,
    active: Active,
    respond: Respond,
  ): Promise<void>;
  safeFailure(code: string): unknown;
};

export const createWorkflowDismissMessageHandler = (
  dependencies: Dependencies,
) => ({
  handle(message: object, sender: BrowserSender, respond: Respond) {
    if ((message as { kind?: unknown }).kind !== "WORKFLOW_DISMISS")
      return { handled: false };
    const id = (message as { selection_id?: unknown }).selection_id;
    const selection =
      typeof id === "string" ? dependencies.selection(id) : undefined;
    if (
      !dependencies.isPanelSender(sender) ||
      !exactKeys(message, ["kind", "selection_id"]) ||
      !selection
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    void dependencies
      .active()
      .then(async (active) => {
        if (
          active.tabId !== selection.tabId ||
          active.origin !== selection.origin ||
          active.snapshot.document_epoch !== selection.documentEpoch
        )
          return respond(dependencies.safeFailure("WORKFLOW_STATE_MISMATCH"));
        await dependencies.dismiss(selection, active, respond);
      })
      .catch(() =>
        respond(dependencies.safeFailure("WORKFLOW_STATE_MISMATCH")),
      );
    return { handled: true, keepAlive: true };
  },
});
