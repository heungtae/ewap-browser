import type {
  CollectionReader,
  CollectionReadDescriptor,
  CollectionObjectKind,
  CollectionReaderAdapter,
} from "../contracts/collection-read-types.js";
import {
  StaticTableListReader,
  StaticGridReader,
  StaticListReader,
} from "./readers/static-table-list-reader.js";
import { PaginatedReader } from "./readers/paginated-reader.js";
import { SvgChartReader } from "./readers/svg-chart-reader.js";
import { CanvasChartReader } from "./readers/canvas-chart-reader.js";
import { reviewedSiteDataReader } from "./readers/reviewed-site-data-reader.js";

export type CollectionReadRoute =
  | { kind: "content_static" }
  | { kind: "content_virtual" }
  | { kind: "content_viewport" }
  | { kind: "reviewed_adapter"; adapter: CollectionReaderAdapter }
  | { kind: "unavailable" };

export class CollectionReaderRegistry {
  private readonly genericReaders: Map<CollectionObjectKind, CollectionReader> =
    new Map();
  private readonly adapters: CollectionReaderAdapter[] = [];

  public constructor() {
    this.genericReaders.set("table", new StaticTableListReader());
    this.genericReaders.set("grid", new StaticGridReader());
    this.genericReaders.set("list", new StaticListReader());
    this.genericReaders.set("pagination", new PaginatedReader());
    this.genericReaders.set("chart_svg", new SvgChartReader());
    this.genericReaders.set("chart_canvas", new CanvasChartReader());
  }

  public registerAdapter(adapter: CollectionReaderAdapter): void {
    if (
      !adapter.adapter_id ||
      !Number.isSafeInteger(adapter.version) ||
      adapter.version < 1 ||
      adapter.origins.length === 0 ||
      adapter.paths.length === 0 ||
      adapter.paths.some(
        (path) => !path.startsWith("/") || path.includes("*"),
      ) ||
      adapter.resultSchema.type !== "collection_read_v1" ||
      adapter.resultSchema.additionalProperties !== false
    )
      throw new Error("INVALID_COLLECTION_ADAPTER");
    for (const origin of adapter.origins) {
      const parsed = new URL(origin);
      if (parsed.origin !== origin || parsed.protocol !== "https:")
        throw new Error("INVALID_COLLECTION_ADAPTER");
    }
    this.adapters.push(adapter);
    reviewedSiteDataReader.registerAdapter(adapter);
  }

  public selectReader(
    descriptor: CollectionReadDescriptor,
    origin?: string,
  ): CollectionReader | null {
    for (const adapter of this.adapters) {
      if (
        origin !== undefined &&
        adapter.origins.some(
          (adapterOrigin) =>
            new URL(adapterOrigin).origin === new URL(origin).origin,
        ) &&
        adapter.matchesDescriptor(descriptor)
      ) {
        return reviewedSiteDataReader;
      }
    }

    // A service worker cannot operate the page DOM. Virtual scrolling must be
    // selected only by a content-script-backed protocol, not this registry.
    const genericReader = descriptor.has_virtual_scroll
      ? undefined
      : this.genericReaders.get(descriptor.object_kind);
    if (genericReader) {
      return genericReader;
    }

    return null;
  }

  /**
   * Selects exactly one execution boundary. DOM-backed routes are fulfilled by
   * the content script; only a registered, origin-bound adapter can replace
   * them for pagination or site data.
   */
  public selectRoute(
    descriptor: CollectionReadDescriptor,
    pageUrl: string,
  ): CollectionReadRoute {
    const page = new URL(pageUrl);
    const adapter = this.adapters.find(
      (candidate) =>
        candidate.origins.some(
          (candidateOrigin) => new URL(candidateOrigin).origin === page.origin,
        ) &&
        candidate.paths.includes(page.pathname) &&
        candidate.matchesDescriptor(descriptor),
    );
    if (adapter) return { kind: "reviewed_adapter", adapter };
    if (descriptor.has_pagination) return { kind: "unavailable" };
    if (descriptor.has_virtual_scroll) return { kind: "content_virtual" };
    if (
      descriptor.object_kind === "chart_svg" ||
      descriptor.object_kind === "chart_canvas"
    )
      return { kind: "content_viewport" };
    if (["table", "grid", "list"].includes(descriptor.object_kind))
      return { kind: "content_static" };
    return { kind: "unavailable" };
  }

  public getReader(kind: CollectionObjectKind): CollectionReader | undefined {
    return this.genericReaders.get(kind);
  }
}

export const collectionReaderRegistry = new CollectionReaderRegistry();
