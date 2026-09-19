import type {
  CollectionReadDescriptor,
  CollectionReadRequest,
  CollectionReadResponse,
  CollectionReadMode,
  CollectionObjectKind,
  CollectionReader,
} from "../contracts/collection-read-types.js";
import { collectionReaderRegistry } from "./collection-reader-registry.js";
import { CollectionAccumulator } from "./collection-accumulator.js";
import {
  MAX_TOTAL_RECORDS,
  MAX_COLLECTION_READ_TIME_MS,
} from "../contracts/collection-read-types.js";

export type OrchestratorState = {
  active: boolean;
  runId: string;
  tabId: number;
  frameId: number;
  documentEpoch: string;
  pageScopeEpoch: string;
  origin: string;
  collectionRef: string;
  objectKind: CollectionObjectKind;
  mode: CollectionReadMode;
  startTime: number;
  cancelled: boolean;
  accumulator: CollectionAccumulator;
  descriptor?: CollectionReadDescriptor;
};

let orchestratorState: OrchestratorState | null = null;

export class CollectionReadOrchestrator {
  public static async start(
    request: CollectionReadRequest,
    descriptor: CollectionReadDescriptor,
  ): Promise<CollectionReadResponse> {
    if (orchestratorState?.active) {
      return { ok: false, code: "ORCHESTRATOR_BUSY" };
    }

    if (!this.checkPermission(request)) {
      return { ok: false, code: "PERMISSION_DENIED" };
    }

    const reader = collectionReaderRegistry.selectReader(descriptor);
    if (!reader) {
      return { ok: false, code: "NO_READER_FOR_OBJECT_KIND" };
    }

    if (!reader.supports_mode.includes(request.mode)) {
      return { ok: false, code: "MODE_NOT_SUPPORTED" };
    }

    const accumulator = new CollectionAccumulator(MAX_TOTAL_RECORDS);

    orchestratorState = {
      active: true,
      runId: request.run_id,
      tabId: request.tab_id,
      frameId: request.frame_id,
      documentEpoch: request.document_epoch,
      pageScopeEpoch: request.page_scope_epoch,
      origin: request.origin,
      collectionRef: request.collection_ref,
      objectKind: request.object_kind,
      mode: request.mode,
      startTime: Date.now(),
      cancelled: false,
      accumulator,
      descriptor,
    };

    return this.executeRead(reader, descriptor, request);
  }

  public static cancel(): void {
    if (orchestratorState) {
      orchestratorState.cancelled = true;
    }
  }

  public static getState(): Readonly<OrchestratorState> | null {
    return orchestratorState ? { ...orchestratorState } : null;
  }

  private static checkPermission(_request: CollectionReadRequest): boolean {
    void _request;
    return true;
  }

  private static async executeRead(
    reader: CollectionReader,
    descriptor: CollectionReadDescriptor,
    request: CollectionReadRequest,
  ): Promise<CollectionReadResponse> {
    const state = orchestratorState!;
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore && !state.cancelled) {
      if (Date.now() - state.startTime > MAX_COLLECTION_READ_TIME_MS) {
        state.accumulator.accumulate(
          [],
          {
            stable_ids: [],
            aria_indices: [],
            aria_set_sizes: [],
            eof_observed: false,
          },
          "partial",
          "TIMEOUT",
          undefined,
          false,
        );
        break;
      }

      if (state.accumulator.isAtCapacity()) {
        state.accumulator.accumulate(
          [],
          {
            stable_ids: [],
            aria_indices: [],
            aria_set_sizes: [],
            eof_observed: false,
          },
          "partial",
          "CAP_REACHED",
          undefined,
          true,
        );
        break;
      }

      try {
        const result = await reader.readWindow(
          descriptor,
          request.mode,
          cursor,
        );

        state.accumulator.accumulate(
          result.window.records,
          result.window.evidence,
          result.terminal?.coverage ?? "partial",
          result.terminal?.reason,
          result.terminal?.source_total_hint,
          result.terminal?.restored_position ?? true,
          result.window.cursor,
        );

        cursor = result.window.cursor;
        hasMore = result.window.has_more && cursor !== undefined;

        if (result.terminal?.coverage === "complete") {
          hasMore = false;
        }
      } catch (_error) {
        void _error;
        state.accumulator.accumulate(
          [],
          {
            stable_ids: [],
            aria_indices: [],
            aria_set_sizes: [],
            eof_observed: false,
          },
          "partial",
          "UNSUPPORTED_OBJECT",
          undefined,
          false,
        );
        break;
      }
    }

    const finalResult = state.accumulator.getResult();
    const restoredPosition = await this.restoreScrollPosition(descriptor);

    orchestratorState = null;

    return {
      ok: true,
      result: {
        collection_ref: request.collection_ref,
        object_kind: request.object_kind,
        coverage: finalResult.coverage,
        reason: finalResult.reason,
        source_total_hint: finalResult.sourceTotalHint,
        collected_count: finalResult.records.length,
        next_cursor: finalResult.nextCursor,
        restored_position: restoredPosition,
        records: finalResult.records,
      },
    };
  }

  private static async restoreScrollPosition(
    descriptor: CollectionReadDescriptor,
  ): Promise<boolean> {
    try {
      const container = this.findContainerByXPath(descriptor.container_xpath);
      if (!container || !(container instanceof HTMLElement)) return false;

      container.scrollTop = descriptor.container_rect.y;
      container.scrollLeft = descriptor.container_rect.x;
      return true;
    } catch {
      return false;
    }
  }

  private static findContainerByXPath(xpath: string): Element | null {
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      );
      return result.singleNodeValue as Element | null;
    } catch {
      return null;
    }
  }
}
