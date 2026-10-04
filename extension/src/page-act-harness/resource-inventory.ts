import { traceDecision, traceMethod } from "../diagnostics/method-trace.js";
import { isOpaqueId } from "./contracts.js";

export type ResourceKind =
  | "page_description"
  | "inline_script"
  | "external_script"
  | "allowed_doc";

export type ResourceMetadataInput = {
  resource_id: string;
  kind: ResourceKind;
  parent?: string;
  origin?: string;
  byte_length: number;
  revision: string;
  consent: "GRANTED" | "REQUIRED" | "DENIED";
  readable: boolean;
};

export type InventoryPage = {
  items: Array<{
    resource_id: string;
    kind: ResourceKind;
    state: "AVAILABLE" | "CONSENT_REQUIRED" | "UNSUPPORTED" | "DENIED";
  }>;
  next_cursor: string | null;
};

const CREDENTIAL_LIKE =
  /(api[_-]?key|secret|passwd|password|otp|mfa|token|cookie|bearer|jwt|private[_-]?key)/i;
// A value line split off from its keyword line (e.g. `api_key` on one line,
// the value on the next, or either side landing in different chunks) must
// still be treated as sensitive. Fail-closed: the line following a keyword
// line is sensitive when it carries an assignment, quoting, or a long token.
const VALUE_LIKE = /[:=]|["']|[A-Za-z0-9\-_+/=]{16,}/;

const hostOf = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
};

export const containsCredentialLike = (value: string): boolean =>
  CREDENTIAL_LIKE.test(value);

export const buildResourceInventory = (
  inputs: ResourceMetadataInput[],
  opts?: { cursor?: string; page_size?: number; page_origin?: string },
): InventoryPage =>
  traceMethod(
    "page-act-harness/resource-inventory.ts:buildResourceInventory",
    { input_count: inputs.length, cursor: opts?.cursor ?? null },
    () => {
      // Never ingest Page API Discovery private candidates: only explicit
      // ResourceMetadataInput entries are listed. Anything else is ignored
      // by construction (no discovery import here).
      const pageSize = opts?.page_size ?? 20;
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
        throw new Error("INVALID_PAGE_SIZE");
      if (opts?.cursor !== undefined && !/^\d+$/.test(opts.cursor))
        throw new Error("INVALID_CURSOR");
      const safeStart = opts?.cursor ? Number.parseInt(opts.cursor, 10) : 0;
      if (safeStart > inputs.length) throw new Error("INVALID_CURSOR");
      const items = inputs.map((input) => {
        if (!isOpaqueId(input.resource_id))
          throw new Error("RESOURCE_ID_INVALID");
        if (input.consent === "DENIED")
          return {
            resource_id: input.resource_id,
            kind: input.kind,
            state: "DENIED" as const,
          };
        if (input.consent === "REQUIRED")
          return {
            resource_id: input.resource_id,
            kind: input.kind,
            state: "CONSENT_REQUIRED" as const,
          };
        if (!input.readable)
          return {
            resource_id: input.resource_id,
            kind: input.kind,
            state: "UNSUPPORTED" as const,
          };
        if (input.kind === "external_script") {
          // Fail-closed: cross-origin fetch needs an explicit page origin
          // and a matching host. Missing/unparsable/mismatched origins deny.
          const pageHost = hostOf(opts?.page_origin);
          const sourceHost = hostOf(input.origin);
          if (!pageHost || !sourceHost || pageHost !== sourceHost)
            return {
              resource_id: input.resource_id,
              kind: input.kind,
              state: "DENIED" as const,
            };
        }
        return {
          resource_id: input.resource_id,
          kind: input.kind,
          state: "AVAILABLE" as const,
        };
      });
      const page = items.slice(safeStart, safeStart + pageSize);
      const nextCursor =
        safeStart + pageSize < items.length
          ? String(safeStart + pageSize)
          : null;
      traceDecision("page-act-harness.inventory.built", {
        supplied: page.length,
        total_known: items.length,
        has_continuation: nextCursor !== null,
      });
      return { items: page, next_cursor: nextCursor };
    },
  );

export const maskSourceChunk = (
  text: string,
): { text: string; categories: string[]; redacted_count: number } => {
  const lines = text.split("\n");
  const sensitive = classifySensitiveLines(text);
  let redacted = 0;
  const masked = lines
    .map((line, index) =>
      sensitive[index] === true
        ? ((redacted += 1), "[REDACTED:credential-like]")
        : line,
    )
    .join("\n");
  return {
    text: masked,
    categories: redacted > 0 ? ["credential-like"] : [],
    redacted_count: redacted,
  };
};

// Full-body line classification. Chunking/search must classify against the
// FULL text first: a keyword cut by a chunk boundary, or a value stranded on
// the next line, is still sensitive and must not leak through a partial read.
export const classifySensitiveLines = (body: string): boolean[] => {
  const lines = body.split("\n");
  return lines.map((line, index) => {
    if (CREDENTIAL_LIKE.test(line)) return true;
    if (index === 0) return false;
    const prev = lines[index - 1] ?? "";
    return CREDENTIAL_LIKE.test(prev) && VALUE_LIKE.test(line);
  });
};
