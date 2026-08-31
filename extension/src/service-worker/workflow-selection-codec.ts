import { validateWorkflowDeclaration } from "../contracts/workflow.js";
import type { WorkflowCandidate } from "../contracts/workflow-catalog.js";
import type { ProfileActionTool } from "../profile/profile.js";
import { safeChatText } from "../state/tab-chat-session-store.js";
import { fail, isPlainObject, string } from "../security/validation.js";
import type { CandidateDefinition } from "./workflow-catalog-runtime.js";

export type WorkflowSelection = {
  id: string;
  expiresAt: number;
  tabId: number;
  origin: string;
  path: string;
  documentEpoch: string;
  prompt: string;
  profile: { id: string; version: number };
  profileDefinitions: readonly ProfileActionTool[];
  candidates: Map<string, CandidateDefinition>;
  selectedId?: string;
};

const candidate = (
  value: unknown,
  selection: Pick<WorkflowSelection, "origin" | "path">,
): WorkflowCandidate => {
  const keys = [
    "id",
    "source",
    "runtime_kind",
    "title",
    "origin",
    "path_prefix",
    "step_count",
    "status",
    "detail",
  ];
  if (
    !isPlainObject(value) ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    typeof value.id !== "string" ||
    !["profile", "recorded", "runtime"].includes(value.source as string) ||
    (value.runtime_kind !== undefined &&
      value.runtime_kind !== "page-declared" &&
      value.runtime_kind !== "code-analysis") ||
    typeof value.title !== "string" ||
    typeof value.origin !== "string" ||
    typeof value.path_prefix !== "string" ||
    typeof value.step_count !== "number" ||
    !Number.isInteger(value.step_count) ||
    value.step_count < 1 ||
    value.step_count > 12 ||
    !["verified", "draft", "stale"].includes(value.status as string) ||
    typeof value.detail !== "string"
  )
    return fail("INVALID_ARGUMENT");
  const result: WorkflowCandidate = {
    id: string(value.id, 128),
    source: value.source as WorkflowCandidate["source"],
    ...(value.runtime_kind === undefined
      ? {}
      : {
          runtime_kind: value.runtime_kind as NonNullable<
            WorkflowCandidate["runtime_kind"]
          >,
        }),
    title: string(value.title, 160),
    origin: string(value.origin, 512),
    path_prefix: string(value.path_prefix, 512),
    step_count: value.step_count,
    status: value.status as WorkflowCandidate["status"],
    detail: string(value.detail, 240),
  };
  if (
    result.origin !== selection.origin ||
    !selection.path.startsWith(result.path_prefix)
  )
    return fail("INVALID_ARGUMENT");
  return result;
};

export const serialiseWorkflowSelection = (selection: WorkflowSelection) => ({
  id: selection.id,
  expires_at: selection.expiresAt,
  tab_id: selection.tabId,
  origin: selection.origin,
  path: selection.path,
  document_epoch: selection.documentEpoch,
  prompt: safeChatText(selection.prompt),
  profile: selection.profile,
  candidates: [...selection.candidates.values()],
  ...(selection.selectedId === undefined
    ? {}
    : { selected_id: selection.selectedId }),
});

export const persistedWorkflowSelection = (
  value: unknown,
): WorkflowSelection => {
  const keys = [
    "id",
    "expires_at",
    "tab_id",
    "origin",
    "path",
    "document_epoch",
    "prompt",
    "profile",
    "candidates",
    "selected_id",
  ];
  if (
    !isPlainObject(value) ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    typeof value.id !== "string" ||
    typeof value.expires_at !== "number" ||
    !Number.isFinite(value.expires_at) ||
    typeof value.tab_id !== "number" ||
    !Number.isInteger(value.tab_id) ||
    value.tab_id < 0 ||
    typeof value.origin !== "string" ||
    typeof value.path !== "string" ||
    !value.path.startsWith("/") ||
    typeof value.document_epoch !== "string" ||
    typeof value.prompt !== "string" ||
    !isPlainObject(value.profile) ||
    Object.keys(value.profile).some(
      (key) => key !== "id" && key !== "version",
    ) ||
    typeof value.profile.id !== "string" ||
    typeof value.profile.version !== "number" ||
    !Number.isInteger(value.profile.version) ||
    value.profile.version < 1 ||
    !Array.isArray(value.candidates) ||
    value.candidates.length === 0 ||
    value.candidates.length > 1024 ||
    (value.selected_id !== undefined && typeof value.selected_id !== "string")
  )
    return fail("INVALID_ARGUMENT");
  const selection: WorkflowSelection = {
    id: string(value.id, 128),
    expiresAt: value.expires_at,
    tabId: value.tab_id,
    origin: string(value.origin, 512),
    path: string(value.path, 512),
    documentEpoch: string(value.document_epoch, 128),
    prompt: safeChatText(string(value.prompt, 8_000)),
    profile: {
      id: string(value.profile.id, 160),
      version: value.profile.version,
    },
    profileDefinitions: [],
    candidates: new Map(),
    ...(value.selected_id === undefined
      ? {}
      : { selectedId: string(value.selected_id, 128) }),
  };
  for (const item of value.candidates) {
    if (
      !isPlainObject(item) ||
      Object.keys(item).some(
        (key) => key !== "candidate" && key !== "declaration",
      )
    )
      return fail("INVALID_ARGUMENT");
    const record = candidate(item.candidate, selection);
    const declaration = validateWorkflowDeclaration(item.declaration);
    if (
      record.title !== declaration.title ||
      record.step_count !== declaration.steps.length ||
      selection.candidates.has(record.id)
    )
      return fail("INVALID_ARGUMENT");
    selection.candidates.set(record.id, { candidate: record, declaration });
  }
  if (
    selection.selectedId !== undefined &&
    !selection.candidates.has(selection.selectedId)
  )
    return fail("INVALID_ARGUMENT");
  return selection;
};
