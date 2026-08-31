import { validateWorkflowDeclaration } from "../contracts/workflow.js";
import { profileActionTools } from "../profile/profile.js";
import type { ResolvedProfile } from "../profile/resolver.js";
import { ContractError, fail, isPlainObject } from "../security/validation.js";
import type { ActivePage } from "./page-context-runtime.js";
import { selectActActionTools } from "./page-derived-actions.js";
import {
  genericActSystemPrompt,
  type ActSession,
} from "./act-session-types.js";

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
  candidates: Map<string, WorkflowCandidate>;
};

type Dependencies = {
  readActive(): Promise<ActivePage>;
  resolveProfile(active: ActivePage): Promise<ResolvedProfile>;
  candidates(
    active: ActivePage,
    profile: unknown,
  ): Promise<WorkflowCandidate[]>;
  createId(): string;
  selections: Map<string, PendingSelection>;
  persistSelections(): Promise<void>;
  sessions: Map<string, ActSession>;
  runStep(session: ActSession): Promise<Record<string, unknown>>;
};

export const createActChatStart =
  (dependencies: Dependencies) =>
  async (payload: unknown): Promise<Record<string, unknown>> => {
    const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
    if (
      typeof value.prompt !== "string" ||
      value.prompt.length === 0 ||
      value.prompt.length > 8_000 ||
      value.mode !== "act"
    )
      return fail("INVALID_ARGUMENT");
    const active = await dependencies.readActive();
    const resolved = await dependencies
      .resolveProfile(active)
      .catch((error: unknown) => {
        if (
          error instanceof ContractError &&
          error.code === "PROFILE_UNAVAILABLE"
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
    const candidates = await dependencies.candidates(active, matchedProfile);
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
        profile,
        profileDefinitions: matchedProfile?.definitions ?? [],
        candidates: new Map(
          candidates.map((candidate) => [candidate.candidate.id, candidate]),
        ),
      });
      await dependencies.persistSelections();
      return {
        ok: true,
        state: "WORKFLOW_CANDIDATES",
        selection_id: id,
        candidates: candidates.map((candidate) => candidate.candidate),
      };
    }
    if (selected.definitions.length === 0) return fail("PROFILE_UNAVAILABLE");
    const session: ActSession = {
      id: dependencies.createId(),
      tabId: active.tabId,
      origin: active.origin,
      prompt: value.prompt,
      messages: [
        { role: "system", content: genericActSystemPrompt },
        { role: "user", content: `User execution request: ${value.prompt}` },
      ],
      profile,
      discovery: selected.discovery,
      definitions: selected.definitions,
      profileDefinitions: matchedProfile?.definitions ?? [],
    };
    dependencies.sessions.set(session.id, session);
    return dependencies.runStep(session);
  };
