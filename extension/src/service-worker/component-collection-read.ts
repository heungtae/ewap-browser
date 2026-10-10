import { collectionReaderRegistry } from "./collection-reader-registry.js";
import type { CollectionReadDescriptor } from "../contracts/collection-read-types.js";
import { isPlainObject } from "../security/validation.js";
import { CollectionReadOrchestrator } from "./collection-read-orchestrator.js";
import type { PageResourceOptions } from "./page-resource-store.js";

export const componentCollectionRoute = async (
  opts: Pick<PageResourceOptions, "tabs" | "tabId" | "documentEpoch">,
  args: Record<string, unknown>,
) => {
  const reply = await opts.tabs.sendMessage(opts.tabId, {
    kind: "CONTENT_COMPONENT_COLLECTION",
    document_epoch: opts.documentEpoch,
    resource_id: args.resource_id,
    resource_revision: args.resource_revision,
  });
  if (
    !isPlainObject(reply) ||
    reply.status !== "AVAILABLE" ||
    reply.document_epoch !== opts.documentEpoch ||
    !isPlainObject(reply.collection)
  )
    return undefined;
  const descriptor = reply.collection as CollectionReadDescriptor;
  const tab = await opts.tabs.get(opts.tabId);
  const url = new URL(tab.url ?? "");
  return {
    descriptor,
    url,
    route: collectionReaderRegistry.selectRoute(
      descriptor,
      `${url.origin}${url.pathname}`,
    ),
  };
};
export const readApprovedComponentCollection = async (
  opts: PageResourceOptions & { runId: string; allowCollection(): boolean },
  args: Record<string, unknown>,
) => {
  if (!opts.allowCollection())
    return { status: "DENIED", code: "COLLECTION_POLICY_DENIED" };
  if (!(await opts.consent(["component-scroll"]))) return { status: "DENIED" };
  if (opts.signal?.aborted || !opts.current()) return { status: "CANCELLED" };
  const selected = await componentCollectionRoute(opts, args);
  if (!selected) return { status: "STALE" };
  if (
    args.channel === "reviewed_data"
      ? selected.route.kind !== "reviewed_adapter"
      : selected.route.kind !== "content_virtual"
  )
    return { status: "UNSUPPORTED", code: "CHANNEL_ROUTE_UNAVAILABLE" };
  const { descriptor, url } = selected;
  const context = await opts.tabs.sendMessage(opts.tabId, {
    kind: "CONTENT_COLLECTION_CONTEXT",
  });
  if (
    !isPlainObject(context) ||
    context.document_epoch !== opts.documentEpoch ||
    typeof context.page_scope_epoch !== "string" ||
    opts.signal?.aborted ||
    !opts.current() ||
    !opts.allowCollection()
  )
    return { status: "STALE" };
  const cancel = () => {
    const state = CollectionReadOrchestrator.getState();
    if (
      state?.runId === opts.runId &&
      state.collectionRef === descriptor.collection_ref
    )
      CollectionReadOrchestrator.cancel();
  };
  opts.signal?.addEventListener("abort", cancel, { once: true });
  try {
    const response = await CollectionReadOrchestrator.start(
      {
        collection_ref: descriptor.collection_ref,
        object_kind: descriptor.object_kind,
        mode: "full",
        run_id: opts.runId,
        tab_id: opts.tabId,
        frame_id: 0,
        document_epoch: opts.documentEpoch,
        page_scope_epoch: context.page_scope_epoch,
        origin: url.origin,
        page_url: `${url.origin}${url.pathname}`,
        capability: "collection_read",
        approval_digest: "",
      },
      descriptor,
      (id, message) => opts.tabs.sendMessage(id, message),
    );
    if (opts.signal?.aborted || !opts.current())
      return {
        status: "CANCELLED",
        restored_position: response.ok
          ? response.result.restored_position
          : false,
      };
    const latest = await opts.tabs.sendMessage(opts.tabId, {
      kind: "CONTENT_COLLECTION_CONTEXT",
    });
    if (
      !isPlainObject(latest) ||
      latest.document_epoch !== opts.documentEpoch ||
      latest.page_scope_epoch !== context.page_scope_epoch
    )
      return {
        status: "STALE",
        restored_position: response.ok
          ? response.result.restored_position
          : false,
      };
    if (!response.ok) return { status: "FAILED" };
    if (response.result.reason === "PAGE_CHANGED")
      return {
        status: "STALE",
        restored_position: response.result.restored_position,
      };
    if (response.result.reason === "CANCELLED")
      return {
        status: "CANCELLED",
        restored_position: response.result.restored_position,
      };
    return { status: "AVAILABLE", result: response.result };
  } finally {
    opts.signal?.removeEventListener("abort", cancel);
  }
};
