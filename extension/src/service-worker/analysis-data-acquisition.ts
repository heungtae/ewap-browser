import type {
  CollectionReadDescriptor,
  CollectionReadResult,
  SanitizedCollectionRecord,
} from "../contracts/collection-read-types.js";
import type { Capability } from "../policy/permission-manager.js";
import { withDeadline } from "../security/deadline.js";
import type { BrowserChromeApi } from "./browser-api.js";
import { CollectionReadOrchestrator } from "./collection-read-orchestrator.js";
import type { ActivePage } from "./page-context-runtime.js";
import { assertRequestActive, type RequestContext } from "./request-context.js";

type AnalysisReason =
  | "REQUIRES_SELECTION"
  | "PERMISSION_REQUIRED"
  | "UNAVAILABLE"
  | "CAP_REACHED"
  | "NO_STABLE_ID"
  | "NO_EOF_EVIDENCE"
  | "PAGE_CHANGED"
  | "UNSUPPORTED_OBJECT"
  | "ADAPTER_UNAVAILABLE"
  | "CANCELLED"
  | "TIMEOUT";

export type AnalysisDataContext = {
  source: { kind: "collection"; label: string };
  coverage: "complete" | "partial" | "viewport_only" | "unavailable";
  reason?: AnalysisReason;
  collected_count: number;
  records: readonly { index: number; cells: readonly string[] }[];
  truncated: boolean;
};

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
const MAX_CONTEXT_RECORDS = 100;
const MAX_CONTEXT_CELLS = 20;
const MAX_CONTEXT_CELL_CHARS = 160;
const MAX_CONTEXT_CHARS = 48_000;

/** Only explicit data-analysis requests may start collection reading. */
export const requestsCollectionAnalysis = (prompt: string): boolean =>
  /(?:데이터|표|테이블|그리드|목록).{0,32}(?:분석|요약|집계|통계)|(?:분석|요약|집계|통계).{0,32}(?:데이터|표|테이블|그리드|목록)|\b(?:analy[sz]e|summari[sz]e|aggregate|statistics?)\b.{0,48}\b(?:data|table|grid|list)\b|\b(?:data|table|grid|list)\b.{0,48}\b(?:analy[sz]e|summari[sz]e|aggregate|statistics?)\b/i.test(
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

const unavailable = (
  reason: Extract<
    AnalysisReason,
    "REQUIRES_SELECTION" | "PERMISSION_REQUIRED" | "UNAVAILABLE"
  >,
): AnalysisDataContext => ({
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
  for (const record of records) {
    if (result.length >= MAX_CONTEXT_RECORDS) break;
    const cells = record.cells.slice(0, MAX_CONTEXT_CELLS).map((cell) =>
      cell
        .split("")
        .filter((character) => {
          const code = character.charCodeAt(0);
          return code > 31 && code !== 127;
        })
        .join("")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_CONTEXT_CELL_CHARS),
    );
    const size = cells.reduce((total, cell) => total + cell.length, 0);
    if (characters + size > MAX_CONTEXT_CHARS) break;
    characters += size;
    // Worker-only row IDs and ARIA positions do not cross into model context.
    result.push({ index: result.length, cells });
  }
  return { records: result, truncated: result.length < records.length };
};

const contextFromResult = (
  descriptor: CollectionReadDescriptor,
  result: CollectionReadResult,
): AnalysisDataContext => {
  const bounded = boundedRecords(result.records);
  return {
    source: { kind: "collection", label: labelFor(descriptor) },
    coverage: result.coverage,
    ...(result.reason && terminalReasons.has(result.reason)
      ? { reason: result.reason }
      : {}),
    collected_count: result.collected_count,
    records: bounded.records,
    truncated:
      bounded.truncated || result.records.length < result.collected_count,
  };
};

/**
 * Reads exactly one DOM/ARIA collection for an explicit analysis request.
 * Page API candidates, descriptors, locators, cursors, and row IDs are never
 * exposed to the model.
 */
export const createAnalysisDataAcquisition =
  (dependencies: Dependencies) =>
  async (
    prompt: string,
    active: ActivePage,
    runId: string,
    context?: RequestContext,
  ): Promise<AnalysisDataContext | undefined> => {
    if (!requestsCollectionAnalysis(prompt)) return undefined;
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
    if (collections.length !== 1) return unavailable("REQUIRES_SELECTION");
    const descriptor = collections[0];
    if (!descriptor) return unavailable("UNAVAILABLE");
    const permission = dependencies.permissions.check(
      "collection_read",
      active.origin,
      runId,
    );
    if (permission !== "ALLOW")
      return unavailable(
        permission === "REQUIRE_PERMISSION"
          ? "PERMISSION_REQUIRED"
          : "UNAVAILABLE",
      );

    const cancel = (): void => CollectionReadOrchestrator.cancel();
    context?.signal.addEventListener("abort", cancel, { once: true });
    try {
      const response = await CollectionReadOrchestrator.start(
        {
          collection_ref: descriptor.collection_ref,
          object_kind: descriptor.object_kind,
          mode: "full",
          run_id: runId,
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
      return response.ok
        ? contextFromResult(descriptor, response.result)
        : unavailable("UNAVAILABLE");
    } finally {
      context?.signal.removeEventListener("abort", cancel);
    }
  };
