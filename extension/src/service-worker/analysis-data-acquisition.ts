import type {
  CollectionReadDescriptor,
  CollectionReadResult,
  SanitizedCollectionRecord,
} from "../contracts/collection-read-types.js";
import {
  createAnalysisSourceSelection,
  type AnalysisSource,
} from "./analysis-source-selection.js";
import type {
  PageApiReadBinding,
  PageApiReadResult,
} from "./page-api-read-runner.js";
import type { Capability } from "../policy/permission-manager.js";
import { withDeadline } from "../security/deadline.js";
import type { BrowserChromeApi } from "./browser-api.js";
import { CollectionReadOrchestrator } from "./collection-read-orchestrator.js";
import type { ActivePage } from "./page-context-runtime.js";
import { assertRequestActive, type RequestContext } from "./request-context.js";

import type {
  AnalysisReason,
  AnalysisDataContext,
  AnalysisCollectionSelection,
  AnalysisDataAcquisitionResult,
} from "./analysis-data-types.js";
export type {
  AnalysisReason,
  AnalysisDataContext,
  AnalysisCollectionCandidate,
  AnalysisAdapterReview,
  AnalysisCollectionWait,
  AnalysisCollectionSelection,
  AnalysisDataAcquisitionResult,
} from "./analysis-data-types.js";

type Dependencies = {
  chrome: BrowserChromeApi;
  permissions: {
    check(
      capability: Capability,
      origin: string,
      runId: string,
    ): "ALLOW" | "DENY" | "REQUIRE_PERMISSION";
  };
  scopeFor(
    tabId: number,
  ): { document_epoch: string; page_scope_epoch: string } | undefined;
  permissionRequest?(
    origin: string,
    runId: string,
    capability?: "collection_read" | "page_api_read",
  ): string;
  pageApiSource?(
    active: ActivePage,
    runId: string,
  ): PageApiReadBinding | undefined;
  requiresAdapterReview?(
    active: ActivePage,
    runId: string,
    context?: RequestContext,
  ): Promise<boolean>;
  readPageApi?(
    binding: PageApiReadBinding,
    context?: RequestContext,
  ): Promise<PageApiReadResult>;
};

const objectKinds = new Set([
  "table",
  "grid",
  "list",
  "chart_svg",
  "chart_canvas",
  "pagination",
]);
const terminalReasons = new Set<AnalysisReason>([
  "CAP_REACHED",
  "NO_STABLE_ID",
  "NO_EOF_EVIDENCE",
  "PAGE_CHANGED",
  "UNSUPPORTED_OBJECT",
  "ADAPTER_UNAVAILABLE",
  "CANCELLED",
  "TIMEOUT",
]);
const invalidatedReadReasons = new Set<AnalysisReason>([
  "PAGE_CHANGED",
  "CANCELLED",
  "TIMEOUT",
]);
const MAX_CONTEXT_RECORDS = 100;
const MAX_CONTEXT_CELLS = 20;
const MAX_CONTEXT_CELL_CHARS = 160;
const MAX_CONTEXT_CHARS = 48_000;

/** Only explicit data-analysis requests may start collection reading. */
export const requestsCollectionAnalysis = (prompt: string): boolean =>
  /(?:데이터|표|테이블|그리드|목록)[^.!?。！？\n]*(?:분석|요약|집계|통계|정리)|(?:분석|요약|집계|통계|정리)[^.!?。！？\n]*(?:데이터|표|테이블|그리드|목록)|\b(?:analy[sz]e|summari[sz]e|aggregate|statistics?)\b[^.!?。！？\n]*\b(?:data|table|grid|list)\b|\b(?:data|table|grid|list)\b[^.!?。！？\n]*\b(?:analy[sz]e|summari[sz]e|aggregate|statistics?)\b/i.test(
    prompt,
  );

const isDescriptor = (value: unknown): value is CollectionReadDescriptor => {
  if (typeof value !== "object" || value === null) return false;
  const descriptor = value as Partial<CollectionReadDescriptor>;
  return (
    typeof descriptor.collection_ref === "string" &&
    descriptor.collection_ref.length > 0 &&
    objectKinds.has(descriptor.object_kind ?? "") &&
    typeof descriptor.container_xpath === "string" &&
    typeof descriptor.has_virtual_scroll === "boolean" &&
    typeof descriptor.has_pagination === "boolean" &&
    Array.isArray(descriptor.sample_rows)
  );
};

const isDiscovery = (
  value: unknown,
): value is {
  collections: unknown[];
  document_epoch: string;
  page_scope_epoch: string;
} =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as { collections?: unknown }).collections) &&
  typeof (value as { document_epoch?: unknown }).document_epoch === "string" &&
  typeof (value as { page_scope_epoch?: unknown }).page_scope_epoch ===
    "string";

const labelFor = (descriptor: CollectionReadDescriptor): string =>
  `${descriptor.object_kind.replace("_", " ")} data`;
/** Only an explicit, single object kind can disambiguate multiple sources. */
const requestedCollectionKind = (
  prompt: string,
): CollectionReadDescriptor["object_kind"] | undefined => {
  const kinds = [
    {
      kind: "table",
      pattern:
        /\btable\b|테이블|(?:^|[^\p{L}\p{N}])표(?=$|[^\p{L}\p{N}]|[은는이가을를의와과도])/iu,
    },
    { kind: "grid", pattern: /\bgrid\b|그리드/iu },
    { kind: "list", pattern: /\blist\b|목록/iu },
    // Charts and pagination have no safe single-kind mapping here. Their
    // mention also prevents a table/grid/list from winning a mixed request.
    { kind: "chart", pattern: /\bchart\b|\bgraph\b|차트|그래프/iu },
    { kind: "pagination", pattern: /\bpagination\b|페이지네이션/iu },
  ] as const;
  const matches = kinds.filter(({ pattern }) => pattern.test(prompt));
  const kind = matches.length === 1 ? matches[0]?.kind : undefined;
  return kind === "table" || kind === "grid" || kind === "list"
    ? kind
    : undefined;
};

const unavailable = (reason: AnalysisReason): AnalysisDataContext => ({
  source: { kind: "collection", label: "page collection" },
  coverage: "unavailable",
  reason,
  collected_count: 0,
  records: [],
  truncated: false,
});

const boundedRecords = (
  records: readonly SanitizedCollectionRecord[],
): { records: AnalysisDataContext["records"]; truncated: boolean } => {
  const result: { index: number; cells: readonly string[] }[] = [];
  let characters = 0;
  let truncated = false;
  for (const record of records) {
    if (result.length >= MAX_CONTEXT_RECORDS) {
      truncated = true;
      break;
    }
    if (record.cells.length > MAX_CONTEXT_CELLS) truncated = true;
    const cells = record.cells.slice(0, MAX_CONTEXT_CELLS).map((cell) => {
      const normalized = cell
        .split("")
        .filter((character) => {
          const code = character.charCodeAt(0);
          return code > 31 && code !== 127;
        })
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      if (normalized.length > MAX_CONTEXT_CELL_CHARS) truncated = true;
      return normalized.slice(0, MAX_CONTEXT_CELL_CHARS);
    });
    const size = cells.reduce((total, cell) => total + cell.length, 0);
    if (characters + size > MAX_CONTEXT_CHARS) {
      truncated = true;
      break;
    }
    characters += size;
    // Worker-only row IDs and ARIA positions do not cross into model context.
    result.push({ index: result.length, cells });
  }
  return { records: result, truncated };
};

const contextFromResult = (
  descriptor: CollectionReadDescriptor,
  result: CollectionReadResult,
): AnalysisDataContext => {
  const bounded = boundedRecords(result.records);
  const truncated =
    bounded.truncated || result.records.length < result.collected_count;
  const reason =
    truncated && result.coverage === "complete"
      ? "CONTEXT_TRUNCATED"
      : result.reason && terminalReasons.has(result.reason)
        ? result.reason
        : truncated
          ? "CONTEXT_TRUNCATED"
          : undefined;
  return {
    source: { kind: "collection", label: labelFor(descriptor) },
    coverage:
      truncated && result.coverage === "complete" ? "partial" : result.coverage,
    ...(reason ? { reason } : {}),
    collected_count: result.collected_count,
    records: bounded.records,
    truncated,
  };
};

/**
 * Reads exactly one DOM/ARIA collection for an explicit analysis request.
 * Page API candidates, descriptors, locators, cursors, and row IDs are never
 * exposed to the model.
 */
export const createAnalysisDataAcquisition = (dependencies: Dependencies) => {
  const selectSource = createAnalysisSourceSelection(dependencies);
  return async (
    prompt: string,
    active: ActivePage,
    runId: string,
    context?: RequestContext,
    force = false,
    selection?: AnalysisCollectionSelection,
  ): Promise<AnalysisDataAcquisitionResult> => {
    if (!force && !requestsCollectionAnalysis(prompt)) return undefined;
    assertRequestActive(context);
    const initialScope = dependencies.scopeFor(active.tabId);
    if (
      !initialScope ||
      initialScope.document_epoch !== active.snapshot.document_epoch
    )
      return unavailable("UNAVAILABLE");

    let discovery: unknown;
    try {
      discovery = await withDeadline(
        dependencies.chrome.tabs.sendMessage(active.tabId, {
          kind: "CONTENT_COLLECTION_DISCOVER",
        }),
        10_000,
        "REQUEST_TIMEOUT",
      );
    } catch {
      return unavailable("UNAVAILABLE");
    }
    assertRequestActive(context);
    if (
      !isDiscovery(discovery) ||
      discovery.document_epoch !== active.snapshot.document_epoch ||
      discovery.page_scope_epoch !== initialScope.page_scope_epoch
    )
      return unavailable("UNAVAILABLE");
    const currentScope = dependencies.scopeFor(active.tabId);
    if (
      !currentScope ||
      currentScope.document_epoch !== discovery.document_epoch ||
      currentScope.page_scope_epoch !== discovery.page_scope_epoch
    )
      return unavailable("UNAVAILABLE");
    const collections = discovery.collections.filter(isDescriptor);

    // A generic or mixed-kind request cannot choose between page objects.
    const requestedKind = requestedCollectionKind(prompt);
    const narrowed =
      collections.length > 1 && requestedKind
        ? collections.filter(
            (candidate) => candidate.object_kind === requestedKind,
          )
        : collections;
    const candidates: AnalysisSource[] = (
      narrowed.length > 0 ? narrowed : collections
    ).map((descriptor) => ({ kind: "collection", descriptor }));
    const api = dependencies.pageApiSource?.(
      active,
      context?.requestId ?? runId,
    );
    // An explicitly named DOM object keeps its collection scope. Otherwise a
    // reviewed API competes with collections and requires the same source choice.
    if (api && !requestedKind)
      candidates.push({ kind: "page_api_read", binding: api });
    if (candidates.length === 0) {
      if (selection) return unavailable("PAGE_CHANGED");
      if (
        await dependencies.requiresAdapterReview?.(
          active,
          context?.requestId ?? runId,
          context,
        )
      )
        return { ok: true, state: "ANALYSIS_ADAPTER_REVIEW_REQUIRED" };
      assertRequestActive(context);
      return unavailable("UNAVAILABLE");
    }
    const selected = selectSource(
      candidates,
      active,
      initialScope,
      context?.requestId ?? runId,
      selection,
      context,
    );
    if ("coverage" in selected || "state" in selected) return selected;
    if (selected.kind === "page_api_read") {
      assertRequestActive(context);
      const result = await dependencies.readPageApi?.(
        selected.binding,
        context,
      );
      assertRequestActive(context);
      if (result?.ok) return result.context;
      const reason: AnalysisReason =
        result?.code === "PAGE_SCOPE_STALE"
          ? "PAGE_CHANGED"
          : result?.code === "REQUEST_CANCELLED"
            ? "CANCELLED"
            : result?.code === "PAGE_API_TIMEOUT"
              ? "TIMEOUT"
              : result?.code === "PAGE_API_CONTRACT_INVALID"
                ? "INVALID_SCHEMA"
                : result?.code === "POLICY_DENIED"
                  ? "PERMISSION_REQUIRED"
                  : "UNAVAILABLE";
      return {
        ...unavailable(reason),
        source: { kind: "page_api_read", label: "reviewed page summary" },
      };
    }
    const descriptor = selected.descriptor;

    const cancel = (): void => CollectionReadOrchestrator.cancel();
    context?.signal.addEventListener("abort", cancel, { once: true });
    try {
      const response = await CollectionReadOrchestrator.start(
        {
          collection_ref: descriptor.collection_ref,
          object_kind: descriptor.object_kind,
          mode: "full",
          run_id: context?.requestId ?? runId,
          tab_id: active.tabId,
          frame_id: 0,
          document_epoch: discovery.document_epoch,
          page_scope_epoch: discovery.page_scope_epoch,
          origin: active.origin,
          page_url: `${active.origin}${active.path}`,
          capability: "collection_read",
          approval_digest: "",
        },
        descriptor,
        (tabId, message) =>
          dependencies.chrome.tabs.sendMessage(tabId, message),
      );
      assertRequestActive(context);
      const finalScope = dependencies.scopeFor(active.tabId);
      if (
        !finalScope ||
        finalScope.document_epoch !== discovery.document_epoch ||
        finalScope.page_scope_epoch !== discovery.page_scope_epoch
      )
        return unavailable("PAGE_CHANGED");
      if (!response.ok) return unavailable("UNAVAILABLE");
      if (
        response.result.reason &&
        invalidatedReadReasons.has(response.result.reason)
      )
        return unavailable(response.result.reason);
      return contextFromResult(descriptor, response.result);
    } finally {
      context?.signal.removeEventListener("abort", cancel);
    }
  };
};
