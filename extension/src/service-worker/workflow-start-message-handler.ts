import type { WorkflowDeclaration } from "../contracts/workflow.js";
import type { BrowserSender } from "./browser-api.js";
import { exactKeys } from "./runtime-message-router.js";

type Respond = (response: unknown) => void;
type Candidate = {
  candidate: { status: string };
  declaration: WorkflowDeclaration;
};
type Selection = {
  id: string;
  tabId: number;
  origin: string;
  path: string;
  documentEpoch: string;
  candidates: Map<string, Candidate>;
  selectedId?: string;
};
type Active = {
  tabId: number;
  origin: string;
  path: string;
  snapshot: { document_epoch: string };
};
type Dependencies = {
  isPanelSender(sender: BrowserSender): boolean;
  selection(id: string): Selection | undefined;
  active(): Promise<Active>;
  start(
    selection: Selection,
    candidate: Candidate,
    respond: Respond,
  ): Promise<void>;
  safeFailure(code: string): unknown;
};

export const createWorkflowStartMessageHandler = (
  dependencies: Dependencies,
) => ({
  handle(message: object, sender: BrowserSender, respond: Respond) {
    if ((message as { kind?: unknown }).kind !== "WORKFLOW_START")
      return { handled: false };
    const id = (message as { selection_id?: unknown }).selection_id;
    const selection =
      typeof id === "string" ? dependencies.selection(id) : undefined;
    if (
      !dependencies.isPanelSender(sender) ||
      !exactKeys(message, ["kind", "selection_id"]) ||
      !selection ||
      !selection.selectedId
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    const candidate = selection.candidates.get(selection.selectedId);
    if (!candidate || candidate.candidate.status === "stale") {
      respond(dependencies.safeFailure("WORKFLOW_STATE_MISMATCH"));
      return { handled: true };
    }
    void dependencies
      .active()
      .then(async (active) => {
        if (
          active.tabId !== selection.tabId ||
          active.origin !== selection.origin ||
          active.path !== selection.path ||
          active.snapshot.document_epoch !== selection.documentEpoch
        )
          return respond(dependencies.safeFailure("WORKFLOW_STATE_MISMATCH"));
        await dependencies.start(selection, candidate, respond);
      })
      .catch(() =>
        respond(dependencies.safeFailure("WORKFLOW_STATE_MISMATCH")),
      );
    return { handled: true, keepAlive: true };
  },
});
