import { validateWorkflowDeclaration } from "../contracts/workflow.js";
import { profileActionTools } from "../profile/profile.js";
import { profileModelContext } from "../profile/profile-model-context.js";
import type { ResolvedProfile } from "../profile/resolver.js";
import { ContractError, fail, isPlainObject } from "../security/validation.js";
import type { ActivePage } from "./page-context-runtime.js";
import type { ActivityStage } from "../contracts/chat-event-types.js";
import { selectActActionTools } from "./page-derived-actions.js";
import {
  composeActEntryEnvelope,
  toHarnessRevision,
} from "../page-act-harness/act-entry-bridge.js";
import { isOpaqueId } from "../page-act-harness/contracts.js";
import { traceDecision } from "../diagnostics/method-trace.js";
import {
  genericActSystemPrompt,
  sourceReadSystemPrompt,
  type ActSession,
} from "./act-session-types.js";
import { assertRequestActive, type RequestContext } from "./request-context.js";
import { withDeadline } from "../security/deadline.js";
import type {
  AnalysisCollectionSelection,
  AnalysisCollectionWait,
  AnalysisAdapterReview,
  AnalysisDataAcquisitionResult,
} from "./analysis-data-acquisition.js";
import { requestsCollectionAnalysis } from "./analysis-data-acquisition.js";
import type { ActIntentRoute } from "./ask-act-intent-router.js";
import type { PageScope } from "../state/tab-chat-session-store.js";

type WorkflowCandidate = { candidate: { id: string } };
type PendingSelection = {
  id: string;
  expiresAt: number;
  tabId: number;
  origin: string;
  path: string;
  documentEpoch: string;
  prompt: string;
  profile: { id: string; version: number };
  profileDefinitions: ActSession["profileDefinitions"];
  analysisData?: NonNullable<ActSession["analysisData"]>;
  analysisScope?: PageScope;
  requestContext?: RequestContext;
  candidates: Map<string, WorkflowCandidate>;
};

type Dependencies = {
  pageScope(active: ActivePage): PageScope;
  readActive(scope?: undefined, tabId?: number): Promise<ActivePage>;
  resolveProfile(active: ActivePage): Promise<ResolvedProfile>;
  candidates(
    active: ActivePage,
    profile: unknown,
  ): Promise<WorkflowCandidate[]>;
  createId(): string;
  selections: Map<string, PendingSelection>;
  persistSelections(): Promise<void>;
  sessions: Map<string, ActSession>;
  startActivity(active: ActivePage): string;
  progressActivity(activityId: string, stage: ActivityStage): void;
  finishActivity(
    activityId: string,
    stage: "SELECTION_REQUIRED" | "COMPLETED" | "FAILED",
  ): void;
  runStep(session: ActSession): Promise<Record<string, unknown>>;
  route(
    prompt: string,
    active: ActivePage,
    context?: RequestContext,
  ): Promise<ActIntentRoute>;
  runReadOnly(
    payload: unknown,
    context?: RequestContext,
    options?: {
      analysisRequested?: boolean;
      analysisSelection?: AnalysisCollectionSelection;
      resumeRunId?: string;
    },
  ): Promise<Record<string, unknown>>;
  collectAnalysisData?(
    prompt: string,
    active: ActivePage,
    runId: string,
    context?: RequestContext,
    force?: boolean,
    selection?: AnalysisCollectionSelection,
  ): Promise<AnalysisDataAcquisitionResult>;
};

// Page Act Harness entry wiring: compose and validate the bootstrap envelope
// from the live snapshot so the harness runs on every Act start. Best
// effort: without an opaque request id / binding epochs there is nothing to
// bind the envelope to, so the start proceeds untracked (traced, never
// silent). Envelope validation failures likewise never break the start.
const attachHarnessCapabilities = (
  session: ActSession,
  prompt: string,
  active: ActivePage,
  definitionTools: string[],
  dependencies: Pick<Dependencies, "createId" | "pageScope">,
  context?: RequestContext,
): void => {
  try {
    const requestId = context?.requestId;
    if (requestId === undefined || !isOpaqueId(requestId)) {
      traceDecision("page-act-harness.entry.skipped", {
        reason: "REQUEST_ID_UNAVAILABLE",
      });
      return;
    }
    const scope = dependencies.pageScope(active);
    const revision = toHarnessRevision(context?.generation);
    const { envelope, propose_tools, entry_roles } = composeActEntryEnvelope({
      request_id: requestId,
      request_revision: revision,
      mode: "act",
      text: prompt,
      document_epoch: active.snapshot.document_epoch,
      page_scope_epoch: scope.page_scope_epoch,
      origin: active.origin,
      path: active.path,
      nodes: active.snapshot.nodes,
      definition_tools: definitionTools,
      inventory_id: dependencies.createId(),
      observation_evidence_id: dependencies.createId(),
      script_read: "CONSENT_REQUIRED",
    });
    session.harnessCapabilities = {
      request_revision: revision,
      read_tools: [...envelope.capabilities.read],
      propose_tools,
      entry_roles,
    };
    traceDecision("page-act-harness.entry.attached", {
      request_revision: revision,
      propose_tools,
      entry_roles,
    });
  } catch (error) {
    traceDecision("page-act-harness.entry.skipped", {
      reason: error instanceof Error ? error.message : "UNKNOWN",
    });
  }
};

export const createActChatStart =
  (dependencies: Dependencies) =>
  async (
    payload: unknown,
    context?: RequestContext,
    options?: {
      analysisSelection?: AnalysisCollectionSelection;
      resumeRunId?: string;
    },
  ): Promise<Record<string, unknown>> => {
    const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
    if (
      typeof value.prompt !== "string" ||
      value.prompt.length === 0 ||
      value.prompt.length > 8_000 ||
      value.mode !== "act"
    )
      return fail("INVALID_ARGUMENT");
    assertRequestActive(context);
    const active = await dependencies.readActive(undefined, context?.tabId);
    assertRequestActive(context);
    if (
      context?.documentEpoch &&
      active.snapshot.document_epoch !== context.documentEpoch
    )
      return fail("PAGE_SCOPE_STALE");
    const route = await dependencies.route(value.prompt, active, context);
    if (route !== "ACTION_REQUIRED" && route !== "SOURCE_READ_REQUIRED")
      return dependencies.runReadOnly(value, context, {
        analysisRequested: route === "ANALYSIS_READ_REQUIRED",
        ...(options?.analysisSelection
          ? { analysisSelection: options.analysisSelection }
          : {}),
        ...(options?.resumeRunId ? { resumeRunId: options.resumeRunId } : {}),
      });
    const activityId = dependencies.startActivity(active);
    try {
      dependencies.progressActivity(activityId, "RESOLVING_PROFILE");
      const resolved = await dependencies
        .resolveProfile(active)
        .catch((error: unknown) => {
          if (
            error instanceof ContractError &&
            error.code === "PROFILE_UNAVAILABLE" &&
            error.detail === "resolver_not_configured"
          )
            return undefined;
          throw error;
        });
      const matchedProfile =
        resolved?.profile.resolution === "MATCHED" &&
        resolved.profile.profile_id &&
        resolved.profile.profile_version
          ? {
              id: resolved.profile.profile_id,
              version: resolved.profile.profile_version,
              definitions: profileActionTools(resolved.profile),
              ...(resolved.profile.workflow === undefined
                ? {}
                : {
                    workflow: validateWorkflowDeclaration(
                      resolved.profile.workflow,
                    ),
                  }),
            }
          : undefined;
      const selected = selectActActionTools(
        active.snapshot,
        matchedProfile?.definitions ?? [],
      );
      const profile =
        selected.discovery === "profile" && matchedProfile
          ? { id: matchedProfile.id, version: matchedProfile.version }
          : { id: "page-derived-ui-v1", version: 1 };
      const modelContext =
        resolved?.profile.resolution === "MATCHED" &&
        resolved.profile.model_context !== undefined
          ? profileModelContext(resolved.profile.model_context)
          : undefined;
      const session: ActSession = {
        ...(context ? { requestContext: context } : {}),
        id: dependencies.createId(),
        ...(route === "SOURCE_READ_REQUIRED"
          ? { sourceReadOnly: true as const }
          : {}),
        tabId: active.tabId,
        origin: active.origin,
        prompt: value.prompt,
        messages: [
          {
            role: "system",
            content:
              route === "SOURCE_READ_REQUIRED"
                ? sourceReadSystemPrompt
                : genericActSystemPrompt,
          },
          { role: "user", content: `User execution request: ${value.prompt}` },
        ],
        profile,
        ...(modelContext ? { modelContext } : {}),
        discovery: selected.discovery,
        definitions: selected.definitions,
        profileDefinitions: matchedProfile?.definitions ?? [],
      };
      attachHarnessCapabilities(
        session,
        value.prompt,
        active,
        route === "SOURCE_READ_REQUIRED"
          ? []
          : selected.definitions.map((definition) => definition.tool),
        dependencies,
        context,
      );
      if (route === "SOURCE_READ_REQUIRED") {
        dependencies.sessions.set(session.id, session);
        dependencies.finishActivity(activityId, "COMPLETED");
        return dependencies.runStep(session);
      }
      if (requestsCollectionAnalysis(value.prompt)) {
        const analysisScope = dependencies.pageScope(active);
        const analysisData = await dependencies.collectAnalysisData?.(
          value.prompt,
          active,
          session.id,
          context,
          true,
          options?.analysisSelection,
        );
        if (isAnalysisWait(analysisData)) {
          dependencies.finishActivity(
            activityId,
            analysisData.state === "ANALYSIS_ADAPTER_REVIEW_REQUIRED"
              ? "COMPLETED"
              : "SELECTION_REQUIRED",
          );
          return analysisData;
        }
        if (analysisData) {
          session.analysisData = analysisData;
          session.analysisScope = analysisScope;
        }
      }
      assertRequestActive(context);
      dependencies.progressActivity(activityId, "DISCOVERING_WORKFLOWS");
      const candidates = await withDeadline(
        dependencies.candidates(active, matchedProfile),
        10_000,
        "WORKFLOW_DISCOVERY_TIMEOUT",
      );
      assertRequestActive(context);
      if (candidates.length > 0) {
        const id = dependencies.createId();
        dependencies.selections.set(id, {
          id,
          expiresAt: Date.now() + 5 * 60_000,
          tabId: active.tabId,
          origin: active.origin,
          path: active.path,
          documentEpoch: active.snapshot.document_epoch,
          prompt: value.prompt,
          ...(session.analysisData
            ? {
                analysisData: session.analysisData,
                ...(session.analysisScope
                  ? { analysisScope: session.analysisScope }
                  : {}),
                ...(context ? { requestContext: context } : {}),
              }
            : {}),
          profile,
          profileDefinitions: matchedProfile?.definitions ?? [],
          candidates: new Map(
            candidates.map((candidate) => [candidate.candidate.id, candidate]),
          ),
        });
        context?.signal.addEventListener(
          "abort",
          () => {
            dependencies.selections.delete(id);
            void dependencies.persistSelections().catch(() => undefined);
          },
          { once: true },
        );
        await dependencies.persistSelections();
        dependencies.finishActivity(activityId, "SELECTION_REQUIRED");
        return {
          ok: true,
          state: "WORKFLOW_CANDIDATES",
          selection_id: id,
          candidates: candidates.map((candidate) => candidate.candidate),
        };
      }
      dependencies.sessions.set(session.id, session);
      dependencies.finishActivity(activityId, "COMPLETED");
      return dependencies.runStep(session);
    } catch (error) {
      dependencies.finishActivity(activityId, "FAILED");
      throw error;
    }
  };

const isAnalysisWait = (
  value: unknown,
): value is AnalysisCollectionWait | AnalysisAdapterReview =>
  typeof value === "object" &&
  value !== null &&
  ((value as { state?: unknown }).state ===
    "ANALYSIS_ADAPTER_REVIEW_REQUIRED" ||
    (value as { state?: unknown }).state ===
      "ANALYSIS_COLLECTION_SELECTION_REQUIRED" ||
    (value as { state?: unknown }).state ===
      "ANALYSIS_COLLECTION_PERMISSION_REQUIRED");
