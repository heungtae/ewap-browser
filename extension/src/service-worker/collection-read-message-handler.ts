import type { Capability } from "../policy/permission-manager.js";
import type { BrowserChromeApi, BrowserSender } from "./browser-api.js";
import { CollectionReadOrchestrator } from "./collection-read-orchestrator.js";
import type {
  CollectionReadDescriptor,
  CollectionReadMode,
  CollectionReadRequest,
  CollectionReadResponse,
  CollectionReadResult,
} from "../contracts/collection-read-types.js";
import { MAX_RECORDS_PER_WINDOW } from "../contracts/collection-read-types.js";
import { withDeadline } from "../security/deadline.js";

type PermissionRequest = {
  capability: Capability;
  origin: string;
  expiresAt: number;
  act_session_id?: string;
};

type DiscoveredCollection = {
  descriptor: CollectionReadDescriptor;
  tabId: number;
  origin: string;
  pageUrl: string;
  runId: string;
  documentEpoch: string;
  pageScopeEpoch: string;
  expiresAt: number;
};

type PendingChunk = {
  result: CollectionReadResult;
  offset: number;
  tabId: number;
  origin: string;
  documentEpoch: string;
  pageScopeEpoch: string;
  expiresAt: number;
};

type CollectionReadDependencies = {
  chrome: BrowserChromeApi;
  permissions: {
    check(
      capability: Capability,
      origin: string,
      runId: string,
    ): "ALLOW" | "DENY" | "REQUIRE_PERMISSION";
  };
  requests: Map<string, PermissionRequest>;
  activeTabForBoundPanel(
    sender: BrowserSender,
  ): Promise<{ id: number; url?: string }>;
  documentFor(tabId: number): { epoch: string; documentId: string } | undefined;
  scopeFor(
    tabId: number,
  ): { document_epoch: string; page_scope_epoch: string } | undefined;
  isPanelSender(sender: BrowserSender): boolean;
  isPanelOrSettingsSender(sender: BrowserSender): boolean;
  safeFailure(code: string, detail?: string): Record<string, unknown>;
};

const DISCOVERY_TTL_MS = 60_000;
const objectKinds = new Set([
  "table",
  "grid",
  "list",
  "chart_svg",
  "chart_canvas",
  "pagination",
]);

const originFor = (url: string | undefined): string | undefined => {
  try {
    const origin = new URL(url ?? "").origin;
    return origin === "null" ? undefined : origin;
  } catch {
    return undefined;
  }
};

const isDescriptor = (value: unknown): value is CollectionReadDescriptor => {
  if (typeof value !== "object" || value === null) return false;
  const descriptor = value as Partial<CollectionReadDescriptor>;
  return (
    typeof descriptor.collection_ref === "string" &&
    objectKinds.has(descriptor.object_kind ?? "") &&
    typeof descriptor.container_xpath === "string" &&
    typeof descriptor.has_virtual_scroll === "boolean" &&
    typeof descriptor.has_pagination === "boolean" &&
    Array.isArray(descriptor.sample_rows)
  );
};

const isCollectionDiscoveryResponse = (
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

const isStartRequest = (
  value: unknown,
): value is { collection_ref: string; mode: CollectionReadMode } =>
  typeof value === "object" &&
  value !== null &&
  Object.keys(value).length === 2 &&
  typeof (value as { collection_ref?: unknown }).collection_ref === "string" &&
  ["viewport", "full"].includes((value as { mode?: unknown }).mode as string);

const isNextRequest = (value: unknown): value is { next_cursor: string } =>
  typeof value === "object" &&
  value !== null &&
  Object.keys(value).length === 1 &&
  typeof (value as { next_cursor?: unknown }).next_cursor === "string";

export const createCollectionReadMessageHandler = (
  dependencies: CollectionReadDependencies,
) => {
  const discovered = new Map<string, DiscoveredCollection>();
  const chunks = new Map<string, PendingChunk>();
  const expireChunks = (now = Date.now()): void => {
    for (const [cursor, chunk] of chunks)
      if (chunk.expiresAt <= now) chunks.delete(cursor);
  };

  const activePanelPage = async (sender: BrowserSender) => {
    const active = await dependencies.activeTabForBoundPanel(sender);
    const origin = originFor(active.url);
    if (!origin || !active.url) throw new Error("ORIGIN_NOT_ALLOWED");
    return { tabId: active.id, origin, pageUrl: active.url };
  };
  const chunkResponse = (
    response: CollectionReadResponse,
    binding: Omit<PendingChunk, "result" | "offset" | "expiresAt">,
  ): CollectionReadResponse => {
    if (
      !response.ok ||
      response.result.records.length <= MAX_RECORDS_PER_WINDOW
    )
      return response;
    const cursor = crypto.randomUUID();
    chunks.set(cursor, {
      ...binding,
      result: response.result,
      offset: MAX_RECORDS_PER_WINDOW,
      expiresAt: Date.now() + DISCOVERY_TTL_MS,
    });
    return {
      ok: true,
      result: {
        ...response.result,
        records: response.result.records.slice(0, MAX_RECORDS_PER_WINDOW),
        next_cursor: cursor,
      },
    };
  };

  const handleCollectionDiscover = async (
    sender: BrowserSender,
    respond: (response: unknown) => void,
  ): Promise<void> => {
    if (!dependencies.isPanelSender(sender)) {
      respond(dependencies.safeFailure("PERMISSION_DENIED"));
      return;
    }
    try {
      const active = await activePanelPage(sender);
      const responseFromContent = await withDeadline(
        dependencies.chrome.tabs.sendMessage(active.tabId, {
          kind: "CONTENT_COLLECTION_DISCOVER",
        }),
        10_000,
        "REQUEST_TIMEOUT",
      );
      if (!isCollectionDiscoveryResponse(responseFromContent)) {
        respond(dependencies.safeFailure("COLLECTION_DISCOVER_FAILED"));
        return;
      }
      const registered = dependencies.documentFor(active.tabId);
      const scope = dependencies.scopeFor(active.tabId);
      if (
        !registered ||
        !scope ||
        registered.epoch !== responseFromContent.document_epoch ||
        scope.document_epoch !== responseFromContent.document_epoch ||
        scope.page_scope_epoch !== responseFromContent.page_scope_epoch
      ) {
        respond(dependencies.safeFailure("PAGE_SCOPE_STALE"));
        return;
      }
      const now = Date.now();
      expireChunks(now);
      for (const [ref, item] of discovered)
        if (item.expiresAt <= now) discovered.delete(ref);
      const collections = responseFromContent.collections.filter(isDescriptor);
      for (const descriptor of collections) {
        discovered.set(descriptor.collection_ref, {
          descriptor,
          tabId: active.tabId,
          origin: active.origin,
          pageUrl: active.pageUrl,
          runId: crypto.randomUUID(),
          documentEpoch: responseFromContent.document_epoch,
          pageScopeEpoch: responseFromContent.page_scope_epoch,
          expiresAt: now + DISCOVERY_TTL_MS,
        });
      }
      // Do not expose locator, row IDs, or sample page data across the panel
      // boundary. The worker keeps the trusted descriptor for this short run.
      respond({
        ok: true,
        collections: collections.map((descriptor) => ({
          collection_ref: descriptor.collection_ref,
          object_kind: descriptor.object_kind,
          estimated_total: descriptor.estimated_total,
          has_virtual_scroll: descriptor.has_virtual_scroll,
          has_pagination: descriptor.has_pagination,
          sample_row_count: descriptor.sample_row_count,
        })),
      });
    } catch (error) {
      respond(
        dependencies.safeFailure("COLLECTION_DISCOVER_FAILED", String(error)),
      );
    }
  };

  const handleCollectionReadStart = async (
    sender: BrowserSender,
    start: unknown,
    respond: (response: unknown) => void,
  ): Promise<void> => {
    if (!dependencies.isPanelSender(sender) || !isStartRequest(start)) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return;
    }
    try {
      expireChunks();
      const active = await activePanelPage(sender);
      const selected = discovered.get(start.collection_ref);
      const registered = dependencies.documentFor(active.tabId);
      const scope = dependencies.scopeFor(active.tabId);
      if (
        !selected ||
        selected.expiresAt < Date.now() ||
        selected.tabId !== active.tabId ||
        selected.origin !== active.origin ||
        selected.pageUrl !== active.pageUrl ||
        !registered ||
        !scope ||
        registered.epoch !== selected.documentEpoch ||
        scope.document_epoch !== selected.documentEpoch ||
        scope.page_scope_epoch !== selected.pageScopeEpoch
      ) {
        respond(dependencies.safeFailure("PAGE_SCOPE_STALE"));
        return;
      }
      const permission = dependencies.permissions.check(
        "collection_read",
        selected.origin,
        selected.runId,
      );
      if (permission === "DENY") {
        respond(dependencies.safeFailure("PERMISSION_DENIED"));
        return;
      }
      if (permission === "REQUIRE_PERMISSION") {
        const requestId = crypto.randomUUID();
        dependencies.requests.set(requestId, {
          capability: "collection_read",
          origin: selected.origin,
          expiresAt: Date.now() + DISCOVERY_TTL_MS,
          act_session_id: selected.runId,
        });
        respond({
          ok: false,
          code: "REQUIRE_PERMISSION",
          request_id: requestId,
        });
        return;
      }
      const request: CollectionReadRequest = {
        collection_ref: start.collection_ref,
        object_kind: selected.descriptor.object_kind,
        mode: start.mode,
        run_id: selected.runId,
        tab_id: selected.tabId,
        frame_id: 0,
        document_epoch: selected.documentEpoch,
        page_scope_epoch: selected.pageScopeEpoch,
        origin: selected.origin,
        page_url: selected.pageUrl,
        capability: "collection_read",
        approval_digest: "",
      };
      const result = await CollectionReadOrchestrator.start(
        request,
        selected.descriptor,
        (tabId, message) =>
          dependencies.chrome.tabs.sendMessage(tabId, message),
      );
      discovered.delete(start.collection_ref);
      respond(
        chunkResponse(result, {
          tabId: selected.tabId,
          origin: selected.origin,
          documentEpoch: selected.documentEpoch,
          pageScopeEpoch: selected.pageScopeEpoch,
        }),
      );
    } catch (error) {
      respond(
        dependencies.safeFailure("COLLECTION_READ_FAILED", String(error)),
      );
    }
  };

  const handleCollectionReadNext = async (
    sender: BrowserSender,
    request: unknown,
    respond: (response: unknown) => void,
  ): Promise<void> => {
    if (!dependencies.isPanelSender(sender) || !isNextRequest(request)) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return;
    }
    try {
      expireChunks();
      const active = await activePanelPage(sender);
      const pending = chunks.get(request.next_cursor);
      const registered = dependencies.documentFor(active.tabId);
      const scope = dependencies.scopeFor(active.tabId);
      if (
        !pending ||
        pending.expiresAt < Date.now() ||
        pending.tabId !== active.tabId ||
        pending.origin !== active.origin ||
        registered?.epoch !== pending.documentEpoch ||
        scope?.document_epoch !== pending.documentEpoch ||
        scope?.page_scope_epoch !== pending.pageScopeEpoch
      ) {
        chunks.delete(request.next_cursor);
        respond(dependencies.safeFailure("PAGE_SCOPE_STALE"));
        return;
      }
      const nextOffset = pending.offset + MAX_RECORDS_PER_WINDOW;
      const records = pending.result.records.slice(pending.offset, nextOffset);
      if (nextOffset >= pending.result.records.length)
        chunks.delete(request.next_cursor);
      else pending.offset = nextOffset;
      respond({
        ok: true,
        result: {
          ...pending.result,
          records,
          ...(nextOffset < pending.result.records.length
            ? { next_cursor: request.next_cursor }
            : {}),
        },
      });
    } catch (error) {
      respond(
        dependencies.safeFailure("COLLECTION_READ_FAILED", String(error)),
      );
    }
  };

  return {
    handleCollectionDiscover,
    handleCollectionReadStart,
    handleCollectionReadNext,
    handleCollectionReadCancel: (
      respond: (response: unknown) => void,
    ): void => {
      CollectionReadOrchestrator.cancel();
      respond({ ok: true });
    },
    handleCollectionReadState: (respond: (response: unknown) => void): void => {
      respond({ ok: true, state: CollectionReadOrchestrator.getState() });
    },
  };
};
