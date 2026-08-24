import { exactKeys } from "./runtime-message-router.js";
import type { BrowserSender } from "./browser-api.js";

type Respond = (response: unknown) => void;
type Candidate = { candidate: { status: string } };
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
  persist(): Promise<void>;
  safeFailure(code: string): unknown;
};

export const createWorkflowSelectionMessageHandler = (
  dependencies: Dependencies,
) => ({
  handle(
    message: object,
    sender: BrowserSender,
    respond: Respond,
  ): { handled: boolean; keepAlive?: boolean } {
    if ((message as { kind?: unknown }).kind !== "WORKFLOW_SELECT")
      return { handled: false };
    const selectionId = (message as { selection_id?: unknown }).selection_id;
    const candidateId = (message as { candidate_id?: unknown }).candidate_id;
    const selection =
      typeof selectionId === "string"
        ? dependencies.selection(selectionId)
        : undefined;
    if (
      !dependencies.isPanelSender(sender) ||
      !exactKeys(message, ["kind", "selection_id", "candidate_id"]) ||
      !selection ||
      typeof candidateId !== "string"
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    const candidate = selection.candidates.get(candidateId);
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
        selection.selectedId = candidateId;
        await dependencies.persist();
        respond({
          ok: true,
          state: "WORKFLOW_PLAN",
          selection_id: selection.id,
          candidate: candidate.candidate,
        });
      })
      .catch(() =>
        respond(dependencies.safeFailure("WORKFLOW_STATE_MISMATCH")),
      );
    return { handled: true, keepAlive: true };
  },
});
