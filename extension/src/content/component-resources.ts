import { componentAlternative } from "./component-alternative.js";
import { digestCanonical, opaqueId } from "../security/canonical.js";
import { buildComponentDescriptor } from "../page-act-harness/component-descriptor.js";
import { discoverCollections } from "./collection-discovery.js";
import {
  componentSelector,
  observeComponent,
  visibleComponent,
  safeVisionPage,
} from "./component-observation.js";

export const createComponentResourceCollector = (
  doc: Document,
  epoch: string,
) => {
  const ids = new WeakMap<Element, string>();
  const idFor = (element: Element) => {
    let id = ids.get(element);
    if (!id) {
      id = opaqueId();
      ids.set(element, id);
    }
    return id;
  };
  const collect = async () => {
    const nodes = Array.from(doc.querySelectorAll(componentSelector)).filter(
      visibleComponent,
    );
    const entries = await Promise.all(
      nodes.slice(0, 128).map(async (element) => {
        const id = idFor(element);
        const observed = observeComponent(element);
        const alternative = await componentAlternative(element, idFor, epoch);
        const revision = await digestCanonical({
          epoch,
          ...observed,
          alternative: alternative ?? null,
        });
        const descriptor = buildComponentDescriptor({
          resource_id: id,
          binding_revision: revision,
          observed_hint: observed.kind,
          hint_basis: observed.hint_basis,
          visible_count: observed.visible_rows.length,
          logical_count: observed.rows.length,
          ...(observed.total !== undefined &&
          observed.total >= observed.rows.length
            ? { total_count: observed.total }
            : observed.complete
              ? { total_count: observed.rows.length }
              : {}),
          has_eof: observed.complete,
          channels: [
            { channel: "visible_rows", available: observed.rows.length > 0 },
            { channel: "description", available: true },
            { channel: "subtree", available: true },
            {
              channel: "bounded_scroll",
              available:
                observed.scroll &&
                ["table", "grid", "list"].includes(observed.kind),
              reason: "COLLECTION_APPROVAL_REQUIRED",
            },
            {
              channel: "reviewed_data",
              available: false,
              reason: "ADAPTER_NOT_REGISTERED",
            },
            {
              channel: "continuation",
              available: false,
              reason: "USE_APPROVED_UI_ACTION_FOR_PAGING_OR_EXPANSION",
            },
            {
              channel: "alt_table",
              available: !!alternative,
              reason: alternative
                ? "EXPLICIT_DOM_ASSOCIATION_NOT_VALUE_CORROBORATION"
                : "NO_VERIFIED_ASSOCIATION;READ_TABLE_AS_SEPARATE_COMPONENT",
            },
            {
              channel: "visual",
              available: safeVisionPage(doc),
              reason: "VISION_POLICY_AND_CONSENT_REQUIRED",
            },
          ],
          restoration: observed.scroll
            ? "collection reader restores original scroll position"
            : "none",
          side_effect: observed.scroll ? "DOM_MUTATION_SCROLL" : "none",
        });
        return {
          element,
          observed,
          alternative,
          descriptor,
          metadata: {
            resource_id: id,
            revision,
            kind: "component" as const,
            byte_length: null,
            readable: true,
            observed_hint: observed.kind,
          },
        };
      }),
    );
    return {
      entries,
      total_count: nodes.length,
      truncated: nodes.length > 128,
    };
  };
  return {
    collect,
    async handle(message: Record<string, unknown>): Promise<unknown> {
      if (message.document_epoch !== epoch) return { status: "STALE" };
      if (message.kind === "CONTENT_COMPONENT_VISION_CHECK")
        return {
          status: "AVAILABLE",
          document_epoch: epoch,
          safe: safeVisionPage(doc),
        };
      const data = await collect();
      const entry = data.entries.find(
        (item) => item.metadata.resource_id === message.resource_id,
      );
      if (!entry) return { status: "NOT_FOUND" };
      if (message.resource_revision !== entry.metadata.revision)
        return { status: "STALE" };
      if (message.kind === "CONTENT_COMPONENT_COLLECTION") {
        const collections = discoverCollections();
        const collection = collections.find((candidate) => {
          try {
            return (
              doc.evaluate(
                candidate.container_xpath,
                doc,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null,
              ).singleNodeValue === entry.element
            );
          } catch {
            return false;
          }
        });
        return {
          status: collection ? "AVAILABLE" : "UNSUPPORTED",
          document_epoch: epoch,
          collection,
        };
      }
      return {
        status: "AVAILABLE",
        document_epoch: epoch,
        descriptor: entry.descriptor,
        structure: {
          headers: entry.observed.headers,
          collapsed: entry.observed.collapsed,
          pagination: entry.observed.pagination,
          alternative: entry.alternative
            ? {
                resource_id: entry.alternative.resource_id,
                resource_revision: entry.alternative.resource_revision,
                correspondence: entry.alternative.correspondence,
              }
            : null,
        },
        rows: entry.observed.visible_rows,
        subtree_rows: entry.observed.rows,
        alternative: entry.alternative,
        description: entry.observed.description,
      };
    },
  };
};
