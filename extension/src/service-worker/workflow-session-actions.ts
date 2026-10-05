import type { WorkflowDeclaration } from "../contracts/workflow.js";
import { ContractError } from "../security/validation.js";
import { selectActActionTools } from "./page-derived-actions.js";
import {
  genericActSystemPrompt,
  type ActSession,
} from "./act-session-types.js";
import type { SemanticSnapshot } from "../contracts/types.js";
import type { WorkflowSelection } from "./workflow-selection-codec.js";
import { traceDecision } from "../diagnostics/method-trace.js";
import { isSensitive } from "../security/redaction.js";
import {
  proposeNamesFor,
  toHarnessRevision,
} from "../page-act-harness/act-entry-bridge.js";
import { listActReadTools } from "../page-act-harness/capability-check.js";
import type { WorkflowSource } from "../page-act-harness/workflow-review.js";

type Candidate = {
  // Product callers (WORKFLOW_START handler) always supply candidate
  // identity; legacy/direct callers may pass a bare declaration, in which
  // case the session starts without the harness review gate.
  candidate?: { id: string; source: string; status: string };
  declaration: WorkflowDeclaration;
};
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
    const requestRevision = toHarnessRevision(
      current.requestContext?.generation,
    );
    traceDecision("page-act-harness.workflow.dismissed", {
      discovery: selected.discovery,
      definition_count: selected.definitions.length,
    });
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
        // Dismissed back to the generic path: declare entry capabilities so
        // the step runner can still detect silent narrowing. No review gate
        // applies here (no workflow was chosen). Sensitive roles never count
        // as entry targets, matching the bootstrap composer.
        harnessCapabilities: {
          request_revision: requestRevision,
          read_tools: listActReadTools(),
          propose_tools: proposeNamesFor(
            selected.definitions.map((definition) => definition.tool),
          ),
          entry_roles: [
            ...new Set(
              active.snapshot.nodes
                .filter(
                  (node) =>
                    node.visible &&
                    node.enabled &&
                    !isSensitive(node.role, node.name),
                )
                .map((node) => node.role),
            ),
          ],
        },
        ...(current.analysisData
          ? {
              analysisData: current.analysisData,
              ...(current.analysisScope
                ? { analysisScope: current.analysisScope }
                : {}),
              ...(current.requestContext
                ? { requestContext: current.requestContext }
                : {}),
            }
          : {}),
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
    // Harness review gate: the new session carries the selected candidate's
    // provenance plus a review approval id. The step runner grants and
    // consumes the single-use approval atomically with the session's
    // effective request revision when the LLM review passes — never here,
    // so generation drift between selection and dispatch cannot desync
    // grant and consume. The stored workflow is never edited, narrowed
    // silently, or executed unreviewed. Without candidate identity
    // (legacy callers) the gate is skipped.
    const identity = candidate.candidate;
    const source: WorkflowSource =
      identity?.source === "profile"
        ? "profile"
        : identity?.source === "recorded"
          ? "saved"
          : "page_generated";
    const requestRevision = toHarnessRevision(
      current.requestContext?.generation,
    );
    const approvalId = dependencies.createId();
    if (identity) {
      traceDecision("page-act-harness.workflow.session_started", {
        candidate_id: identity.id,
        source,
      });
    }
    const full = identity ? current.candidates.get(identity.id) : undefined;
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
        harnessCapabilities: {
          request_revision: requestRevision,
          read_tools: listActReadTools(),
          propose_tools: proposeNamesFor(
            current.profileDefinitions.map((definition) => definition.tool),
          ),
          entry_roles: [],
        },
        ...(identity
          ? {
              harnessReview: {
                candidate_id: identity.id,
                source,
                request_revision: requestRevision,
                catalog_status: (identity.status === "draft"
                  ? "draft"
                  : "verified") as "verified" | "draft",
                ...(full
                  ? {
                      stored_scope: {
                        origin: full.candidate.origin,
                        path: full.candidate.path_prefix,
                      },
                    }
                  : {}),
                current_origin: current.origin,
                approval_id: approvalId,
                status: "PENDING_REVIEW" as const,
              },
            }
          : {}),
        ...(current.analysisData
          ? {
              analysisData: current.analysisData,
              ...(current.analysisScope
                ? { analysisScope: current.analysisScope }
                : {}),
              ...(current.requestContext
                ? { requestContext: current.requestContext }
                : {}),
            }
          : {}),
        workflow: { declaration: candidate.declaration, step: first, count: 0 },
      },
      respond,
    );
  };
  return { dismiss, start };
};
