import type { CandidateDefinition } from "./workflow-catalog-runtime.js";
import { digestCanonical, opaqueId } from "../security/canonical.js";
import { redactForChat } from "../security/chat-redaction.js";
import { isSensitive } from "../security/redaction.js";

export const workflowResourceKey = (item: CandidateDefinition): string =>
  `${item.candidate.source}:${item.candidate.source === "recorded" ? item.candidate.id : item.declaration.id}`;
export const workflowResourceRevision = (item: CandidateDefinition): string =>
  digestCanonical({
    declaration: item.declaration,
    origin: item.candidate.origin,
    path: item.candidate.path_prefix,
    status: item.candidate.status,
    detail: item.candidate.detail,
  });
const mask = (value: unknown): unknown => {
  if (typeof value === "string") return redactForChat(value, 16384);
  if (Array.isArray(value)) return value.map(mask);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, mask(child)]),
    );
  return value;
};
export const createWorkflowResourceStore = (items: CandidateDefinition[]) =>
  items.map((item) => {
    const body = JSON.stringify(mask(item.declaration));
    const blocked =
      ["stale", "incomparable"].includes(item.candidate.status) ||
      item.declaration.steps.some((step) =>
        isSensitive(step.target.role, step.target.name),
      );
    return {
      revision: workflowResourceRevision(item),
      key: workflowResourceKey(item),
      item,
      bytes: new TextEncoder().encode(body),
      readUntil: 0,
      metadata: {
        resource_id: opaqueId(),
        resource_revision: opaqueId(),
        original_complete: body === JSON.stringify(item.declaration),
        candidate_id: item.candidate.id,
        source:
          item.candidate.source === "recorded"
            ? "saved"
            : item.candidate.source === "profile"
              ? "profile"
              : "page_generated",
        title: redactForChat(item.candidate.title, 160),
        catalog_status: item.candidate.status,
        detail: item.candidate.detail,
        integrity:
          item.candidate.source === "profile"
            ? "resolved_profile"
            : item.candidate.source === "recorded"
              ? "stored_local_record"
              : "untrusted_generated",
        suitability: "unreviewed",
        executable: false,
        readable: !blocked && body.length <= 262144,
        limitations: ["stale", "incomparable"].includes(item.candidate.status)
          ? ["CATALOG_SCOPE_UNVERIFIED"]
          : body !== JSON.stringify(item.declaration)
            ? ["MASKED_ORIGINAL_REQUIRES_CLARIFICATION"]
            : blocked
              ? ["SENSITIVE_TARGET_WITHHELD"]
              : body.length > 262144
                ? ["SOURCE_LIMIT_EXCEEDED"]
                : [],
        source_kind: item.candidate.runtime_kind ?? item.candidate.source,
        authority:
          "discovery_only; explicit selection, fresh review, plan and action approval required",
      },
    };
  });
