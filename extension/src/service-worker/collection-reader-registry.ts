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
import { VirtualScrollReader } from "./readers/virtual-scroll-reader.js";
import { PaginatedReader } from "./readers/paginated-reader.js";
import { SvgChartReader } from "./readers/svg-chart-reader.js";
import { CanvasChartReader } from "./readers/canvas-chart-reader.js";
import { reviewedSiteDataReader } from "./readers/reviewed-site-data-reader.js";

export class CollectionReaderRegistry {
  private readonly genericReaders: Map<CollectionObjectKind, CollectionReader> =
    new Map();
  private readonly adapters: CollectionReaderAdapter[] = [];

  public constructor() {
    this.genericReaders.set("table", new StaticTableListReader());
    this.genericReaders.set("grid", new StaticGridReader());
    this.genericReaders.set("list", new StaticListReader());
    this.genericReaders.set("grid", new VirtualScrollReader());
    this.genericReaders.set("pagination", new PaginatedReader());
    this.genericReaders.set("chart_svg", new SvgChartReader());
    this.genericReaders.set("chart_canvas", new CanvasChartReader());
    this.genericReaders.set("table", reviewedSiteDataReader);
  }

  public registerAdapter(adapter: CollectionReaderAdapter): void {
    this.adapters.push(adapter);
    reviewedSiteDataReader.registerAdapter(adapter);
  }

  public selectReader(
    descriptor: CollectionReadDescriptor,
  ): CollectionReader | null {
    for (const adapter of this.adapters) {
      if (
        adapter.origins.some(
          (origin) =>
            new URL(origin).origin === new URL(document.location.href).origin,
        ) &&
        adapter.matchesDescriptor(descriptor)
      ) {
        return reviewedSiteDataReader;
      }
    }

    const genericReader = this.genericReaders.get(descriptor.object_kind);
    if (genericReader) {
      return genericReader;
    }

    return null;
  }

  public getReader(kind: CollectionObjectKind): CollectionReader | undefined {
    return this.genericReaders.get(kind);
  }
}

export const collectionReaderRegistry = new CollectionReaderRegistry();
