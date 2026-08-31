import type { WorkflowDeclaration } from "../contracts/workflow.js";
import { ContractError } from "../security/validation.js";
import { selectActActionTools } from "./page-derived-actions.js";
import {
  genericActSystemPrompt,
  type ActSession,
} from "./act-session-types.js";
import type { SemanticSnapshot } from "../contracts/types.js";
import type { WorkflowSelection } from "./workflow-selection-codec.js";

type Candidate = { declaration: WorkflowDeclaration };
type Active = { snapshot: SemanticSnapshot };
type Dependencies = {
  selections: Map<string, WorkflowSelection>;
  persist(): Promise<void>;
  sessions: Map<string, ActSession>;
  createId(): string;
  runStep(session: ActSession): Promise<Record<string, unknown>>;
  safeFailure(code: string): Record<string, unknown>;
};
type Respond = (response: unknown) => void;

export const createWorkflowSessionActions = (dependencies: Dependencies) => {
  const startSession = (
    selection: WorkflowSelection,
    session: ActSession,
    respond: Respond,
  ): void => {
    dependencies.selections.delete(selection.id);
    void dependencies
      .persist()
      .then(() => {
        dependencies.sessions.set(session.id, session);
        return dependencies.runStep(session);
      })
      .then((result) => respond(result.ok ? { ok: true } : result))
      .catch((error) =>
        respond(
          dependencies.safeFailure(
            error instanceof ContractError ? error.code : "INTERNAL_FAILURE",
          ),
        ),
      );
  };
  const dismiss = async (
    selection: WorkflowSelection,
    active: Active,
    respond: Respond,
  ): Promise<void> => {
    const current = dependencies.selections.get(selection.id);
    if (!current)
      return respond(dependencies.safeFailure("WORKFLOW_STATE_MISMATCH"));
    const selected = selectActActionTools(
      active.snapshot,
      current.profileDefinitions,
    );
    if (selected.definitions.length === 0)
      return respond(dependencies.safeFailure("PROFILE_UNAVAILABLE"));
    startSession(
      current,
      {
        id: dependencies.createId(),
        tabId: current.tabId,
        origin: current.origin,
        prompt: current.prompt,
        messages: [
          { role: "system", content: genericActSystemPrompt },
          {
            role: "user",
            content: `User execution request: ${current.prompt}`,
          },
        ],
        profile: current.profile,
        discovery: selected.discovery,
        definitions: selected.definitions,
        profileDefinitions: current.profileDefinitions,
      },
      respond,
    );
  };
  const start = async (
    selection: WorkflowSelection,
    candidate: Candidate,
    respond: Respond,
  ): Promise<void> => {
    const first = candidate.declaration.steps[0];
    const current = dependencies.selections.get(selection.id);
    if (!first || !current)
      return respond(dependencies.safeFailure("WORKFLOW_STATE_MISMATCH"));
    startSession(
      current,
      {
        id: dependencies.createId(),
        tabId: current.tabId,
        origin: current.origin,
        prompt: current.prompt,
        messages: [
          { role: "system", content: genericActSystemPrompt },
          {
            role: "user",
            content: `User execution request: ${current.prompt}`,
          },
        ],
        profile: current.profile,
        discovery: "page-derived",
        definitions: [],
        profileDefinitions: current.profileDefinitions,
        workflow: { declaration: candidate.declaration, step: first, count: 0 },
      },
      respond,
    );
  };
  return { dismiss, start };
};
