import type { PageResourceInventory } from "../contracts/page-resource-types.js";
import type { BrowserTabs } from "./browser-api.js";
import { isPlainObject } from "../security/validation.js";
import { isOpaqueId } from "../page-act-harness/contracts.js";
import { opaqueId } from "../security/canonical.js";
import { maskSourceChunk } from "../page-act-harness/resource-inventory.js";
import type { SourceStore } from "../page-act-harness/resource-reader.js";
export type PageResourceOptions = {
  tabs: BrowserTabs;
  tabId: number;
  documentEpoch: string;
  requestRevision: number;
  signal?: AbortSignal;
  current(): boolean;
  consent(resources: string[]): Promise<boolean>;
};
export const createPageResourceStore = (opts: PageResourceOptions) => {
  const namespace = opaqueId();
  let inventory: PageResourceInventory | undefined;
  const grants = new Map<string, boolean>();
  const stores = new Map<string, SourceStore>();
  let collectedBytes = 0;
  const cursors = new Map<
    string,
    { kind: string; offset: number; key: string }
  >();
  const active = () => {
    if (opts.signal?.aborted || !opts.current())
      throw new Error("REQUEST_CANCELLED");
  };
  const refresh = async () => {
    active();
    const value = await opts.tabs.sendMessage(opts.tabId, {
      kind: "CONTENT_PAGE_RESOURCES",
      document_epoch: opts.documentEpoch,
    });
    active();
    if (isPlainObject(value) && value.status === "STALE")
      throw new Error("SOURCE_CHANGED");
    if (isPlainObject(value) && value.status === "DENIED")
      throw new Error("SOURCE_ACCESS_DENIED");
    if (isPlainObject(value) && value.status === "FAILED")
      throw new Error("SOURCE_COLLECTION_FAILED");
    if (
      !isPlainObject(value) ||
      value.document_epoch !== opts.documentEpoch ||
      typeof value.revision !== "string" ||
      !Array.isArray(value.items) ||
      value.items.length > 257 ||
      typeof value.total_count !== "number" ||
      typeof value.truncated !== "boolean" ||
      value.items.some(
        (item) =>
          !isPlainObject(item) ||
          typeof item.resource_id !== "string" ||
          !isOpaqueId(item.resource_id) ||
          typeof item.revision !== "string" ||
          typeof item.readable !== "boolean" ||
          (item.byte_length !== null && typeof item.byte_length !== "number") ||
          !["page_description", "inline_script", "external_script"].includes(
            String(item.kind),
          ),
      )
    )
      throw new Error("RESOURCE_INVENTORY_INVALID");
    const fresh = value as PageResourceInventory;
    if (inventory && inventory.revision !== fresh.revision) {
      grants.clear();
      stores.clear();
      collectedBytes = 0;
      cursors.clear();
      inventory = fresh;
      throw new Error("SOURCE_CHANGED");
    }
    inventory = fresh;
    return fresh;
  };
  const cursor = (kind: string, offset: number, key: string) => {
    const id = opaqueId();
    cursors.set(id, { kind, offset, key });
    return id;
  };
  const position = (raw: unknown, kind: string, key: string) => {
    if (raw === undefined) return 0;
    if (typeof raw !== "string") throw new Error("INVALID_CURSOR");
    const value = cursors.get(raw);
    if (!value || value.kind !== kind || value.key !== key)
      throw new Error("INVALID_CURSOR");
    return value.offset;
  };
  const load = async (ids: string[]) => {
    const fresh = await refresh();
    const pending = ids.filter(
      (id) =>
        fresh.items.some(
          (item) =>
            item.resource_id === id &&
            item.readable &&
            item.kind !== "page_description",
        ) && !grants.has(id),
    );
    if (pending.length) {
      const allowed = await opts.consent(pending);
      active();
      await refresh();
      for (const id of pending) grants.set(id, allowed);
    }
    for (const id of ids) {
      active();
      const meta = fresh.items.find((item) => item.resource_id === id);
      if (
        !meta ||
        !meta.readable ||
        (stores.has(id) && meta.kind !== "external_script") ||
        (meta.kind !== "page_description" && grants.get(id) !== true)
      )
        continue;
      const response = await opts.tabs.sendMessage(opts.tabId, {
        kind: "CONTENT_PAGE_RESOURCE_READ",
        document_epoch: opts.documentEpoch,
        inventory_revision: fresh.revision,
        resource_id: id,
        source_consent: grants.get(id) === true,
      });
      active();
      await refresh();
      if (!isPlainObject(response) || response.status !== "AVAILABLE") continue;
      if (
        response.document_epoch !== opts.documentEpoch ||
        response.inventory_revision !== fresh.revision ||
        response.resource_id !== id ||
        typeof response.revision !== "string" ||
        typeof response.body !== "string" ||
        new TextEncoder().encode(response.body).length > 1024 * 1024
      )
        throw new Error("RESOURCE_BODY_INVALID");
      const previous = stores.get(id);
      if (previous && previous.revision !== response.revision) {
        grants.delete(id);
        stores.delete(id);
        cursors.clear();
        throw new Error("SOURCE_CHANGED");
      }
      if (!previous) {
        const width = new TextEncoder().encode(response.body).length;
        if (collectedBytes + width > 4 * 1024 * 1024)
          throw new Error("SOURCE_BYTE_BUDGET_EXCEEDED");
        collectedBytes += width;
      }
      // Keep only masked source in worker memory, before any provider payload or trace.
      stores.set(id, {
        resource_id: id,
        revision: response.revision,
        kind: meta.kind,
        body: maskSourceChunk(response.body).text,
        readable: true,
        consent: "GRANTED",
      });
    }
  };
  const state = (id: string) => {
    const meta = inventory?.items.find((item) => item.resource_id === id);
    return !meta
      ? "NOT_FOUND"
      : !meta.readable
        ? "UNSUPPORTED"
        : grants.get(id) === false
          ? "DENIED"
          : "FAILED";
  };
  return {
    bootstrap: async () => {
      const data = await refresh();
      return {
        ...data,
        items: data.items.slice(0, 20).map((item) => ({
          ...item,
          state: !item.readable
            ? "UNSUPPORTED"
            : item.kind === "page_description"
              ? "AVAILABLE"
              : "CONSENT_REQUIRED",
        })),
        supplied_count: Math.min(data.items.length, 20),
        truncated: data.truncated || data.items.length > 20,
      };
    },
    namespace,
    grants,
    stores,
    cursors,
    refresh,
    cursor,
    position,
    load,
    state,
  };
};
