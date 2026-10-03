import type { CollectionReadDescriptor } from "../contracts/collection-read-types.js";
import type { PageApiReadBinding } from "./page-api-read-runner.js";
import type { ActivePage } from "./page-context-runtime.js";
import type { RequestContext } from "./request-context.js";
import type {
  AnalysisCollectionSelection,
  AnalysisCollectionWait,
  AnalysisDataContext,
} from "./analysis-data-types.js";

export type AnalysisSource =
  | { kind: "collection"; descriptor: CollectionReadDescriptor }
  | { kind: "page_api_read"; binding: PageApiReadBinding };
type Scope = { document_epoch: string; page_scope_epoch: string };
type Pending = {
  runId: string;
  tabId: number;
  origin: string;
  path: string;
  scope: Scope;
  expiresAt: number;
  candidates: Map<string, AnalysisSource>;
};
type Dependencies = {
  permissions: {
    check(
      capability: "collection_read" | "page_api_read",
      origin: string,
      runId: string,
    ): "ALLOW" | "DENY" | "REQUIRE_PERMISSION";
  };
  permissionRequest?(
    origin: string,
    runId: string,
    capability?: "collection_read" | "page_api_read",
  ): string;
};
const binding = (source: AnalysisSource): string =>
  JSON.stringify(
    source.kind === "collection"
      ? {
          kind: source.kind,
          object_kind: source.descriptor.object_kind,
          container_xpath: source.descriptor.container_xpath,
          aria_attributes: source.descriptor.aria_attributes,
          roles: source.descriptor.roles,
        }
      : { kind: source.kind, ...source.binding },
  );
const failure = (
  reason: "PAGE_CHANGED" | "PERMISSION_REQUIRED" | "UNAVAILABLE",
): AnalysisDataContext => ({
  source: { kind: "collection", label: "page collection" },
  coverage: "unavailable",
  reason,
  collected_count: 0,
  records: [],
  truncated: false,
});
const display = (pending: Pending): AnalysisCollectionWait["candidates"] =>
  [...pending.candidates].map(([candidate_id, source], index) =>
    source.kind === "page_api_read"
      ? {
          candidate_id,
          object_kind: "page_api_read",
          label: "reviewed page summary",
          has_virtual_scroll: false,
        }
      : {
          candidate_id,
          object_kind: source.descriptor.object_kind,
          label: `${source.descriptor.object_kind.replace("_", " ")} data ${index + 1}`,
          ...(source.descriptor.estimated_total === undefined
            ? {}
            : { estimated_total: source.descriptor.estimated_total }),
          has_virtual_scroll: source.descriptor.has_virtual_scroll,
        },
  );

/** Selection refs are request-local authority, never persisted or sent to a model. */
export const createAnalysisSourceSelection = (dependencies: Dependencies) => {
  const pending = new Map<string, Pending>();
  return (
    sources: AnalysisSource[],
    active: ActivePage,
    scope: Scope,
    runId: string,
    selection?: AnalysisCollectionSelection,
    context?: RequestContext,
  ): AnalysisSource | AnalysisCollectionWait | AnalysisDataContext => {
    for (const [id, value] of pending)
      if (value.expiresAt <= Date.now()) pending.delete(id);
    let selectionId = selection?.selection_id;
    let stored = selectionId ? pending.get(selectionId) : undefined;
    let source: AnalysisSource | undefined;
    let candidateId = selection?.candidate_id;
    if (selection) {
      if (
        !stored ||
        stored.runId !== runId ||
        stored.tabId !== active.tabId ||
        stored.origin !== active.origin ||
        stored.path !== active.path ||
        stored.scope.document_epoch !== scope.document_epoch ||
        stored.scope.page_scope_epoch !== scope.page_scope_epoch
      ) {
        if (selectionId) pending.delete(selectionId);
        return failure("PAGE_CHANGED");
      }
      const selected = stored.candidates.get(selection.candidate_id);
      source = selected
        ? sources.find((item) => binding(item) === binding(selected))
        : undefined;
      if (!source) {
        pending.delete(selection.selection_id);
        return failure("PAGE_CHANGED");
      }
    } else if (sources.length === 1) source = sources[0];
    const capability =
      source?.kind === "page_api_read" ? "page_api_read" : "collection_read";
    const permission = source
      ? dependencies.permissions.check(capability, active.origin, runId)
      : undefined;
    if (permission === "DENY") {
      if (selectionId) pending.delete(selectionId);
      return failure("PERMISSION_REQUIRED");
    }
    if (source && permission === "ALLOW") {
      if (selectionId) pending.delete(selectionId);
      return source;
    }
    if (pending.size >= 256 && !stored) return failure("UNAVAILABLE");
    if (!stored) {
      selectionId = crypto.randomUUID();
      stored = {
        runId,
        tabId: active.tabId,
        origin: active.origin,
        path: active.path,
        scope,
        expiresAt: Date.now() + 5 * 60_000,
        candidates: new Map(sources.map((item) => [crypto.randomUUID(), item])),
      };
      pending.set(selectionId, stored);
      const id = selectionId;
      context?.signal.addEventListener("abort", () => pending.delete(id), {
        once: true,
      });
    }
    if (source) {
      candidateId ??= [...stored.candidates].find(
        ([, item]) => binding(item) === binding(source),
      )?.[0];
      const permissionId = dependencies.permissionRequest?.(
        active.origin,
        runId,
        capability,
      );
      if (!permissionId || !candidateId) {
        pending.delete(selectionId!);
        return failure("PERMISSION_REQUIRED");
      }
      return {
        ok: true,
        state: "ANALYSIS_COLLECTION_PERMISSION_REQUIRED",
        selection_id: selectionId!,
        candidates: display(stored),
        selected_candidate_id: candidateId,
        permission_request_id: permissionId,
      };
    }
    return {
      ok: true,
      state: "ANALYSIS_COLLECTION_SELECTION_REQUIRED",
      selection_id: selectionId!,
      candidates: display(stored),
    };
  };
};
