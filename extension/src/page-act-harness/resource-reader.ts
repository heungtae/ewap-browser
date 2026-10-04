import {
  traceBranch,
  traceDecision,
  traceMethod,
} from "../diagnostics/method-trace.js";
import { validateReadEvidence, type ReadEvidence } from "./contracts.js";
import { maskSourceChunk } from "./resource-inventory.js";

export type SourceStore = {
  resource_id: string;
  revision: string;
  kind: string;
  body: string;
  consent: "GRANTED" | "REQUIRED" | "DENIED";
  readable: boolean;
};

export type ReadChunkInput = {
  evidence_id: string;
  request_revision: number;
  binding_revision: string;
  resource_id: string;
  offset: number;
  max_bytes: number;
  current_revision: string;
};

const encoder = new TextEncoder();

export const readResourceChunk = (
  store: SourceStore,
  input: ReadChunkInput,
): ReadEvidence =>
  traceMethod(
    "page-act-harness/resource-reader.ts:readResourceChunk",
    {
      offset: input.offset,
      max_bytes: input.max_bytes,
    },
    (context) => {
      const method = "page-act-harness/resource-reader.ts:readResourceChunk";
      if (!Number.isInteger(input.offset) || input.offset < 0)
        throw new Error("INVALID_OFFSET");
      if (
        !Number.isInteger(input.max_bytes) ||
        input.max_bytes < 1 ||
        input.max_bytes > 1024 * 1024
      )
        throw new Error("INVALID_MAX_BYTES");
      if (store.resource_id !== input.resource_id)
        return validateReadEvidence({
          evidence_id: input.evidence_id,
          request_revision: input.request_revision,
          binding_revision: input.binding_revision,
          resource_id: input.resource_id,
          resource_revision: input.current_revision,
          kind: store.kind,
          status: "NOT_FOUND",
          coverage: {
            scope: `offset:${input.offset}`,
            complete: false,
            truncated: false,
            reason: "RESOURCE_MISMATCH",
          },
          masking: { applied: true, categories: [], redacted_count: 0 },
          limitations: ["store/resource id mismatch; not an empty success"],
        });
      if (store.revision !== input.current_revision)
        return validateReadEvidence({
          evidence_id: input.evidence_id,
          request_revision: input.request_revision,
          binding_revision: input.binding_revision,
          resource_id: store.resource_id,
          resource_revision: store.revision,
          kind: store.kind,
          status: "STALE",
          coverage: {
            scope: `offset:${input.offset}`,
            complete: false,
            truncated: true,
            reason: "SOURCE_CHANGED",
          },
          continuation: {
            cursor: `offset:${input.offset}`,
            reason: "RE_DISCOVER",
          },
          masking: { applied: true, categories: [], redacted_count: 0 },
          limitations: [
            `source revision changed to ${store.revision}; re-discover before reading`,
          ],
        });
      if (store.consent === "DENIED")
        return validateReadEvidence({
          evidence_id: input.evidence_id,
          request_revision: input.request_revision,
          binding_revision: input.binding_revision,
          resource_id: store.resource_id,
          resource_revision: store.revision,
          kind: store.kind,
          status: "DENIED",
          coverage: {
            scope: `offset:${input.offset}`,
            complete: false,
            truncated: false,
            reason: "CONSENT_DENIED",
          },
          masking: { applied: true, categories: [], redacted_count: 0 },
          limitations: ["consent denied; empty success is not returned"],
        });
      if (store.consent === "REQUIRED")
        return validateReadEvidence({
          evidence_id: input.evidence_id,
          request_revision: input.request_revision,
          binding_revision: input.binding_revision,
          resource_id: store.resource_id,
          resource_revision: store.revision,
          kind: store.kind,
          status: "CONSENT_REQUIRED",
          coverage: {
            scope: `offset:${input.offset}`,
            complete: false,
            truncated: false,
            reason: "CONSENT_REQUIRED",
          },
          masking: { applied: true, categories: [], redacted_count: 0 },
          limitations: ["body withheld until user approves source transfer"],
        });
      if (!store.readable)
        return validateReadEvidence({
          evidence_id: input.evidence_id,
          request_revision: input.request_revision,
          binding_revision: input.binding_revision,
          resource_id: store.resource_id,
          resource_revision: store.revision,
          kind: store.kind,
          status: "UNSUPPORTED",
          coverage: {
            scope: `offset:${input.offset}`,
            complete: false,
            truncated: false,
            reason: "READ_CHANNEL_UNSUPPORTED",
          },
          masking: { applied: true, categories: [], redacted_count: 0 },
          limitations: ["channel unsupported (e.g. sourcemap/private state)"],
        });
      const bytes = encoder.encode(store.body);
      if (input.offset > bytes.length)
        return validateReadEvidence({
          evidence_id: input.evidence_id,
          request_revision: input.request_revision,
          binding_revision: input.binding_revision,
          resource_id: store.resource_id,
          resource_revision: store.revision,
          kind: store.kind,
          status: "FAILED",
          coverage: {
            scope: `offset:${input.offset}`,
            complete: false,
            truncated: false,
            reason: "OFFSET_BEYOND_END",
          },
          masking: { applied: true, categories: [], redacted_count: 0 },
          limitations: ["offset beyond source end; not an empty success"],
        });
      const slice = bytes.slice(input.offset, input.offset + input.max_bytes);
      const text = new TextDecoder().decode(slice);
      const masked = maskSourceChunk(text);
      const nextOffset = input.offset + slice.length;
      const truncated = nextOffset < bytes.length;
      const evidence = validateReadEvidence({
        evidence_id: input.evidence_id,
        request_revision: input.request_revision,
        binding_revision: input.binding_revision,
        resource_id: store.resource_id,
        resource_revision: store.revision,
        kind: store.kind,
        status: "AVAILABLE",
        content: { text: masked.text, byte_offset: input.offset },
        coverage: {
          scope: `offset:${input.offset}`,
          complete: !truncated,
          collected_count: bytes.length,
          supplied_count: slice.length,
          ...(truncated ? {} : { total_count: bytes.length }),
          truncated,
          reason: truncated ? "CHUNK_LIMIT" : "CHUNK_COMPLETE",
        },
        ...(truncated
          ? {
              continuation: {
                cursor: `offset:${nextOffset}`,
                reason: "CONTINUE_CHUNK",
              },
            }
          : {}),
        masking: {
          applied: true,
          categories: masked.categories,
          redacted_count: masked.redacted_count,
        },
        limitations:
          masked.redacted_count > 0 ? ["credential-like lines redacted"] : [],
      });
      traceDecision("page-act-harness.resource.read", {
        supplied_bytes: slice.length,
        truncated,
        redacted_count: masked.redacted_count,
      });
      // Source is read as static text: reading never grants arbitrary
      // JS execution or endpoint-call capability (design §5.4).
      return evidence;
    },
  );

export const searchAllowedSources = (
  stores: SourceStore[],
  query: string,
  opts?: { max_hits?: number },
): {
  hits: Array<{ resource_id: string; excerpt: string }>;
  complete: boolean;
  skipped_count: number;
} =>
  traceMethod(
    "page-act-harness/resource-reader.ts:searchAllowedSources",
    { source_count: stores.length, query_length: query.length },
    () => {
      const maxHits = opts?.max_hits ?? 10;
      if (!Number.isInteger(maxHits) || maxHits < 1 || maxHits > 50)
        throw new Error("INVALID_MAX_HITS");
      if (!query || query.length > 512) throw new Error("INVALID_QUERY");
      const hits: Array<{ resource_id: string; excerpt: string }> = [];
      let skipped = 0;
      for (const store of stores) {
        if (store.consent !== "GRANTED" || !store.readable) {
          skipped += 1;
          continue;
        }
        const index = store.body.indexOf(query);
        if (index >= 0) {
          const masked = maskSourceChunk(
            store.body.slice(Math.max(0, index - 80), index + 120),
          );
          hits.push({ resource_id: store.resource_id, excerpt: masked.text });
          if (hits.length >= maxHits) break;
        }
      }
      // complete=false when gating skipped sources or max_hits truncated:
      // a hit list is never a full code review (design §5.2).
      const complete = hits.length < maxHits && skipped === 0;
      traceDecision("page-act-harness.resource.searched", {
        hit_count: hits.length,
        skipped_count: skipped,
        complete,
      });
      return { hits, complete, skipped_count: skipped };
    },
  );
