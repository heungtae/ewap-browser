import { exactKeys } from "./runtime-message-router.js";
import type { BrowserSender } from "./browser-api.js";
import type { WorkflowDeclaration } from "../contracts/workflow.js";
import type { SemanticSnapshot } from "../contracts/types.js";

type Respond = (response: unknown) => void;
type Candidate = {
  candidate: { source: string };
  declaration: WorkflowDeclaration;
};
type Selection = {
  tabId: number;
  origin: string;
  documentEpoch: string;
  candidates: Map<string, Candidate>;
};
type Active = {
  tabId: number;
  origin: string;
  path: string;
  snapshot: SemanticSnapshot;
};
type Dependencies = {
  isPanelSender(sender: BrowserSender): boolean;
  selection(id: string): Selection | undefined;
  active(): Promise<Active>;
  record(
    declaration: WorkflowDeclaration,
    active: Active,
    title: string,
  ): Promise<unknown>;
  safeFailure(code: string): unknown;
};

export const createWorkflowSaveMessageHandler = (
  dependencies: Dependencies,
) => ({
  handle(
    message: object,
    sender: BrowserSender,
    respond: Respond,
  ): { handled: boolean; keepAlive?: boolean } {
    if ((message as { kind?: unknown }).kind !== "WORKFLOW_SAVE")
      return { handled: false };
    const selectionId = (message as { selection_id?: unknown }).selection_id;
    const candidateId = (message as { candidate_id?: unknown }).candidate_id;
    const title = (message as { title?: unknown }).title;
    const selection =
      typeof selectionId === "string"
        ? dependencies.selection(selectionId)
        : undefined;
    if (
      !dependencies.isPanelSender(sender) ||
      !exactKeys(message, ["kind", "selection_id", "candidate_id", "title"]) ||
      !selection ||
      typeof candidateId !== "string" ||
      typeof title !== "string"
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    const candidate = selection.candidates.get(candidateId);
    if (!candidate || candidate.candidate.source !== "runtime") {
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
        respond({
          ok: true,
          record: await dependencies.record(
            candidate.declaration,
            active,
            title,
          ),
        });
      })
      .catch(() =>
        respond(dependencies.safeFailure("STORAGE_BOUNDARY_UNAVAILABLE")),
      );
    return { handled: true, keepAlive: true };
  },
});
