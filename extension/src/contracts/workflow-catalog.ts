import { semanticFingerprint } from "../profile/fingerprint.js";
import { fail, isPlainObject, string } from "../security/validation.js";
import type { SemanticSnapshot } from "./types.js";
import {
  validateWorkflowDeclaration,
  type WorkflowDeclaration,
} from "./workflow.js";

export type WorkflowSource = "profile" | "recorded" | "runtime";
export type WorkflowCandidateStatus = "verified" | "draft" | "stale";
export type WorkflowCandidate = {
  id: string;
  source: WorkflowSource;
  runtime_kind?: "page-declared" | "code-analysis";
  title: string;
  origin: string;
  path_prefix: string;
  step_count: number;
  status: WorkflowCandidateStatus;
  detail: string;
};
export type StoredWorkflow = {
  id: string;
  title: string;
  enabled: boolean;
  origin: string;
  path_prefix: string;
  fingerprint: string;
  created_at: string;
  updated_at: string;
  declaration: WorkflowDeclaration;
};
export type WorkflowCatalogState = {
  schema_version: 1;
  records: StoredWorkflow[];
};

const validOrigin = (value: unknown): string => {
  if (typeof value !== "string") return fail("INVALID_ARGUMENT");
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.origin !== value
    )
      return fail("INVALID_ARGUMENT");
    return parsed.origin;
  } catch {
    return fail("INVALID_ARGUMENT");
  }
};
const isoDate = (value: unknown): string => {
  if (typeof value !== "string" || Number.isNaN(new Date(value).valueOf()))
    return fail("INVALID_ARGUMENT");
  return value;
};
const record = (value: unknown): StoredWorkflow => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "id",
          "title",
          "enabled",
          "origin",
          "path_prefix",
          "fingerprint",
          "created_at",
          "updated_at",
          "declaration",
        ].includes(key),
    ) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.enabled !== "boolean" ||
    typeof value.path_prefix !== "string" ||
    !value.path_prefix.startsWith("/") ||
    value.path_prefix.includes("?") ||
    value.path_prefix.includes("#") ||
    typeof value.fingerprint !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(value.id)
  )
    return fail("INVALID_ARGUMENT");
  const declaration = validateWorkflowDeclaration(value.declaration);
  return {
    id: value.id,
    title: string(value.title, 160),
    enabled: value.enabled,
    origin: validOrigin(value.origin),
    path_prefix: string(value.path_prefix, 512),
    fingerprint: string(value.fingerprint, 128),
    created_at: isoDate(value.created_at),
    updated_at: isoDate(value.updated_at),
    declaration,
  };
};

export const validateWorkflowCatalogState = (
  value: unknown,
): WorkflowCatalogState => {
  if (
    !isPlainObject(value) ||
    value.schema_version !== 1 ||
    !Array.isArray(value.records) ||
    value.records.length > 100 ||
    Object.keys(value).some(
      (key) => !["schema_version", "records"].includes(key),
    )
  )
    return fail("INVALID_ARGUMENT");
  const records = value.records.map(record);
  if (new Set(records.map((item) => item.id)).size !== records.length)
    return fail("INVALID_ARGUMENT");
  return { schema_version: 1, records };
};

export const emptyWorkflowCatalog = (): WorkflowCatalogState => ({
  schema_version: 1,
  records: [],
});

export const recordMatchesPage = (
  item: StoredWorkflow,
  origin: string,
  path: string,
  snapshot: SemanticSnapshot,
): boolean =>
  item.enabled &&
  item.origin === origin &&
  path.startsWith(item.path_prefix) &&
  item.fingerprint === semanticFingerprint(snapshot).fingerprint;

export const recordCandidate = (
  item: StoredWorkflow,
  status: WorkflowCandidateStatus,
): WorkflowCandidate => ({
  id: item.id,
  source: "recorded",
  title: item.title,
  origin: item.origin,
  path_prefix: item.path_prefix,
  step_count: item.declaration.steps.length,
  status,
  detail:
    status === "verified"
      ? `내가 기록함 · ${item.updated_at.slice(0, 10)}`
      : "현재 페이지 구조가 기록과 다릅니다.",
});
