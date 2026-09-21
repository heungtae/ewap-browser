import type {
  CollectionReadDescriptor,
  CollectionReadRequest,
  CollectionReadResponse,
  CollectionReadMode,
  CollectionObjectKind,
  CollectionReaderAdapter,
  SanitizedCollectionRecord,
} from "../contracts/collection-read-types.js";
import {
  MAX_COLLECTION_READ_TIME_MS,
  MAX_TOTAL_RECORDS,
} from "../contracts/collection-read-types.js";
import { withDeadline } from "../security/deadline.js";
import { CollectionAccumulator } from "./collection-accumulator.js";
import { collectionReaderRegistry } from "./collection-reader-registry.js";

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
  collectedCount: number;
  stepCount: number;
  phase: "reading" | "restoring";
};

type StaticReadResponse = {
  ok: true;
  result: {
    records: readonly SanitizedCollectionRecord[];
    total_rows: number;
    truncated: boolean;
  };
};

type WindowReadResponse = {
  ok: true;
  result: { records: readonly SanitizedCollectionRecord[] };
};

type ScrollStepResponse = {
  ok: true;
  atBottom: boolean;
};

type ContextResponse = {
  ok: true;
  document_epoch: string;
  page_scope_epoch: string;
};

const MAX_VIRTUAL_SCROLL_STEPS = 200;
const CONTENT_MESSAGE_TIMEOUT_MS = 10_000;

let orchestratorState: OrchestratorState | null = null;

/**
 * The worker owns binding and terminal state; all DOM work stays in the
 * content script. Virtual scrolling is a bounded content-script protocol;
 * paging and reviewed adapters remain separate reader paths.
 */
export class CollectionReadOrchestrator {
  public static async start(
    request: CollectionReadRequest,
    descriptor: CollectionReadDescriptor,
    sendToContent: (tabId: number, message: unknown) => Promise<unknown>,
  ): Promise<CollectionReadResponse> {
    if (orchestratorState?.active)
      return { ok: false, code: "ORCHESTRATOR_BUSY" };

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
      collectedCount: 0,
      stepCount: 0,
      phase: "reading",
    };

    try {
      const route = collectionReaderRegistry.selectRoute(
        descriptor,
        request.page_url,
      );
      if (route.kind === "reviewed_adapter")
        return await this.readAdapter(
          request,
          descriptor,
          route.adapter,
          sendToContent,
        );
      if (route.kind === "unavailable")
        return this.unavailable(request, "UNSUPPORTED_OBJECT");
      if (request.mode === "viewport" || route.kind === "content_viewport")
        return await this.readViewport(request, sendToContent);
      if (route.kind === "content_virtual")
        return await this.readVirtual(request, descriptor, sendToContent);

      if (!(await this.hasCurrentScope(request, sendToContent)))
        return this.partial(request, [], "PAGE_CHANGED");
      const response = await this.sendWithDeadline(
        sendToContent,
        request.tab_id,
        {
          kind: "CONTENT_COLLECTION_READ_STATIC",
          collection_ref: request.collection_ref,
        },
      );
      if (orchestratorState?.cancelled)
        return this.unavailable(request, "CANCELLED", "partial");
      if (!this.isStaticReadResponse(response))
        return this.unavailable(request, "UNSUPPORTED_OBJECT");

      const { records, total_rows: totalRows, truncated } = response.result;
      this.setProgress(records.length, 0);
      if (!(await this.hasCurrentScope(request, sendToContent)))
        return this.partial(request, records, "PAGE_CHANGED", totalRows);
      return {
        ok: true,
        result: {
          collection_ref: request.collection_ref,
          object_kind: request.object_kind,
          coverage: truncated ? "partial" : "complete",
          ...(truncated ? { reason: "CAP_REACHED" as const } : {}),
          source_total_hint: totalRows,
          collected_count: records.length,
          restored_position: true,
          records,
        },
      };
    } catch {
      return this.unavailable(request, "UNSUPPORTED_OBJECT");
    } finally {
      orchestratorState = null;
    }
  }

  private static async readAdapter(
    request: CollectionReadRequest,
    descriptor: CollectionReadDescriptor,
    adapter: CollectionReaderAdapter,
    sendToContent: (tabId: number, message: unknown) => Promise<unknown>,
  ): Promise<CollectionReadResponse> {
    const accumulator = new CollectionAccumulator(MAX_TOTAL_RECORDS);
    let cursor: string | undefined;
    let totalHint: number | undefined;
    let eofObserved = false;
    try {
      while (true) {
        if (orchestratorState?.cancelled)
          return this.adapterResult(
            request,
            accumulator,
            "partial",
            "CANCELLED",
            totalHint,
          );
        if (
          Date.now() - (orchestratorState?.startTime ?? 0) >
          MAX_COLLECTION_READ_TIME_MS
        )
          return this.adapterResult(
            request,
            accumulator,
            "partial",
            "TIMEOUT",
            totalHint,
          );
        if (!(await this.hasCurrentScope(request, sendToContent)))
          return this.adapterResult(
            request,
            accumulator,
            "partial",
            "PAGE_CHANGED",
            totalHint,
          );

        const step = await withDeadline(
          adapter.readWindow(descriptor, cursor),
          CONTENT_MESSAGE_TIMEOUT_MS,
          "REQUEST_TIMEOUT",
        );
        const evidence = step.window.evidence;
        totalHint =
          step.terminal?.source_total_hint ??
          evidence.adapter_total ??
          totalHint;
        accumulator.accumulate(
          step.window.records,
          evidence,
          step.terminal?.coverage ?? "partial",
          step.terminal?.reason,
          totalHint,
          true,
          step.window.cursor,
        );
        this.setProgress(accumulator.getCollectedCount(), 0);
        eofObserved = evidence.eof_observed || !step.window.has_more;
        if (accumulator.isAtCapacity())
          return this.adapterResult(
            request,
            accumulator,
            "partial",
            "CAP_REACHED",
            totalHint,
          );
        if (!step.window.has_more || step.terminal) break;
        if (!step.window.cursor || step.window.cursor === cursor)
          return this.adapterResult(
            request,
            accumulator,
            "partial",
            "NO_EOF_EVIDENCE",
            totalHint,
          );
        cursor = step.window.cursor;
      }
      const records = accumulator.getResult().records;
      const complete =
        eofObserved && totalHint !== undefined && records.length === totalHint;
      return this.adapterResult(
        request,
        accumulator,
        complete ? "complete" : "partial",
        complete ? undefined : "NO_EOF_EVIDENCE",
        totalHint,
      );
    } catch {
      return this.unavailable(request, "UNSUPPORTED_OBJECT");
    } finally {
      await this.sendWithDeadline(sendToContent, request.tab_id, {
        kind: "CONTENT_COLLECTION_RELEASE",
        collection_ref: request.collection_ref,
      }).catch(() => undefined);
    }
  }

  private static adapterResult(
    request: CollectionReadRequest,
    accumulator: CollectionAccumulator,
    coverage: "complete" | "partial",
    reason:
      | "CAP_REACHED"
      | "CANCELLED"
      | "TIMEOUT"
      | "PAGE_CHANGED"
      | "NO_EOF_EVIDENCE"
      | undefined,
    totalHint: number | undefined,
  ): CollectionReadResponse {
    const final = accumulator.getResult();
    return {
      ok: true,
      result: {
        collection_ref: request.collection_ref,
        object_kind: request.object_kind,
        coverage,
        ...(reason ? { reason } : {}),
        ...(totalHint === undefined ? {} : { source_total_hint: totalHint }),
        collected_count: final.records.length,
        ...(final.nextCursor ? { next_cursor: final.nextCursor } : {}),
        restored_position: true,
        records: final.records,
      },
    };
  }

  public static cancel(): void {
    if (orchestratorState) orchestratorState.cancelled = true;
  }

  private static setProgress(collectedCount: number, stepCount: number): void {
    if (!orchestratorState) return;
    orchestratorState.collectedCount = collectedCount;
    orchestratorState.stepCount = stepCount;
  }

  public static getState(): Readonly<OrchestratorState> | null {
    return orchestratorState ? { ...orchestratorState } : null;
  }

  private static unavailable(
    request: CollectionReadRequest,
    reason: "UNSUPPORTED_OBJECT" | "CANCELLED",
    coverage: "partial" | "unavailable" = "unavailable",
  ): CollectionReadResponse {
    return {
      ok: true,
      result: {
        collection_ref: request.collection_ref,
        object_kind: request.object_kind,
        coverage,
        reason,
        collected_count: 0,
        restored_position: true,
        records: [],
      },
    };
  }

  private static async readVirtual(
    request: CollectionReadRequest,
    descriptor: CollectionReadDescriptor,
    sendToContent: (tabId: number, message: unknown) => Promise<unknown>,
  ): Promise<CollectionReadResponse> {
    const send = (message: unknown) =>
      this.sendWithDeadline(sendToContent, request.tab_id, message);
    let restored = false;
    let scrollInitialized = false;
    let result: CollectionReadResponse | undefined;
    try {
      const initialized = await send({
        kind: "CONTENT_SCROLL_INIT",
        descriptor,
      });
      if (!this.isOk(initialized)) {
        result = this.unavailable(request, "UNSUPPORTED_OBJECT");
        return result;
      }
      scrollInitialized = true;

      const accumulator = new CollectionAccumulator(MAX_TOTAL_RECORDS);
      let records: SanitizedCollectionRecord[] = [];
      const identities = new Set<string>();
      let noStableIdentity = false;
      let eofObserved = false;
      let timedOut = false;
      let currentStep = 0;
      const collect = (record: SanitizedCollectionRecord): void => {
        accumulator.accumulate(
          [record],
          {
            stable_ids: record.row_id ? [record.row_id] : [],
            aria_indices:
              record.aria_row_index === undefined
                ? []
                : [record.aria_row_index],
            aria_set_sizes:
              record.aria_set_size === undefined ? [] : [record.aria_set_size],
            total_hint: descriptor.estimated_total,
            eof_observed: false,
          },
          "partial",
        );
        records = accumulator.getResult().records;
        this.setProgress(records.length, currentStep);
      };

      for (let step = 0; step <= MAX_VIRTUAL_SCROLL_STEPS; step += 1) {
        currentStep = step;
        if (orchestratorState?.cancelled) {
          result = this.virtualResult(
            request,
            records,
            "partial",
            "CANCELLED",
            descriptor.estimated_total,
            false,
          );
          return result;
        }
        if (
          Date.now() - (orchestratorState?.startTime ?? 0) >
          MAX_COLLECTION_READ_TIME_MS
        ) {
          timedOut = true;
          break;
        }
        if (!(await this.hasCurrentScope(request, sendToContent))) {
          result = this.partial(
            request,
            records,
            "PAGE_CHANGED",
            descriptor.estimated_total,
          );
          return result;
        }

        const window = await send({
          kind: "CONTENT_COLLECTION_READ_WINDOW",
          collection_ref: request.collection_ref,
        });
        if (!this.isWindowReadResponse(window)) {
          result = this.unavailable(request, "UNSUPPORTED_OBJECT");
          return result;
        }
        for (const record of window.result.records) {
          const identity = this.recordIdentity(record);
          if (!identity) {
            noStableIdentity = true;
            collect(record);
          } else if (!identities.has(identity)) {
            identities.add(identity);
            collect(record);
          }
          if (accumulator.isAtCapacity()) break;
        }
        if (accumulator.isAtCapacity()) break;
        // The preceding scroll reached EOF; this iteration has just read the
        // final mounted window and must not issue another no-op scroll.
        if (eofObserved) break;
        if (step === MAX_VIRTUAL_SCROLL_STEPS) break;

        const scroll = await send({ kind: "CONTENT_SCROLL_STEP" });
        if (!this.isScrollStepResponse(scroll)) {
          result = this.unavailable(request, "UNSUPPORTED_OBJECT");
          return result;
        }
        if (scroll.atBottom) {
          eofObserved = true;
          // Read the final mounted window on the next iteration.
          continue;
        }
      }

      const totalHint = descriptor.estimated_total;
      const maxAriaIndex = Math.max(
        0,
        ...records.map((record) => record.aria_row_index ?? 0),
      );
      const hasStableEvidence =
        records.length > 0 &&
        !noStableIdentity &&
        identities.size === records.length;
      const totalCovered =
        totalHint !== undefined &&
        (records.length === totalHint || maxAriaIndex >= totalHint);
      const complete = eofObserved && hasStableEvidence && totalCovered;
      const reason = complete
        ? undefined
        : records.length >= MAX_TOTAL_RECORDS
          ? "CAP_REACHED"
          : timedOut
            ? "TIMEOUT"
            : !hasStableEvidence
              ? "NO_STABLE_ID"
              : "NO_EOF_EVIDENCE";
      result = this.virtualResult(
        request,
        records,
        complete ? "complete" : "partial",
        reason,
        totalHint,
        false,
      );
      return result;
    } catch {
      result = this.unavailable(request, "UNSUPPORTED_OBJECT");
      return result;
    } finally {
      if (scrollInitialized) {
        if (orchestratorState) orchestratorState.phase = "restoring";
        try {
          const response = await send({ kind: "CONTENT_SCROLL_RESTORE" });
          restored =
            typeof response === "object" &&
            response !== null &&
            (response as { restored?: unknown }).restored === true;
        } catch {
          // Preserve the read result: position restoration is reported in it.
          restored = false;
        } finally {
          await send({ kind: "CONTENT_SCROLL_RESET" }).catch(() => undefined);
          await send({
            kind: "CONTENT_COLLECTION_RELEASE",
            collection_ref: request.collection_ref,
          }).catch(() => undefined);
        }
      }
      if (result?.ok) result.result.restored_position = restored;
    }
  }

  private static virtualResult(
    request: CollectionReadRequest,
    records: readonly SanitizedCollectionRecord[],
    coverage: "complete" | "partial",
    reason:
      | "CAP_REACHED"
      | "CANCELLED"
      | "TIMEOUT"
      | "NO_STABLE_ID"
      | "NO_EOF_EVIDENCE"
      | undefined,
    totalHint: number | undefined,
    restoredPosition: boolean,
  ): CollectionReadResponse {
    return {
      ok: true,
      result: {
        collection_ref: request.collection_ref,
        object_kind: request.object_kind,
        coverage,
        ...(reason ? { reason } : {}),
        ...(totalHint === undefined ? {} : { source_total_hint: totalHint }),
        collected_count: records.length,
        restored_position: restoredPosition,
        records,
      },
    };
  }

  private static async readViewport(
    request: CollectionReadRequest,
    sendToContent: (tabId: number, message: unknown) => Promise<unknown>,
  ): Promise<CollectionReadResponse> {
    try {
      if (!(await this.hasCurrentScope(request, sendToContent)))
        return this.partial(request, [], "PAGE_CHANGED");
      const response = await this.sendWithDeadline(
        sendToContent,
        request.tab_id,
        {
          kind: "CONTENT_COLLECTION_READ_VIEWPORT",
          collection_ref: request.collection_ref,
        },
      );
      if (!this.isWindowReadResponse(response))
        return this.unavailable(request, "UNSUPPORTED_OBJECT");
      return {
        ok: true,
        result: {
          collection_ref: request.collection_ref,
          object_kind: request.object_kind,
          coverage: "viewport_only",
          collected_count: response.result.records.length,
          restored_position: true,
          records: response.result.records,
        },
      };
    } catch {
      return this.unavailable(request, "UNSUPPORTED_OBJECT");
    } finally {
      await this.sendWithDeadline(sendToContent, request.tab_id, {
        kind: "CONTENT_COLLECTION_RELEASE",
        collection_ref: request.collection_ref,
      }).catch(() => undefined);
    }
  }

  private static partial(
    request: CollectionReadRequest,
    records: readonly SanitizedCollectionRecord[],
    reason: "PAGE_CHANGED",
    totalHint?: number,
  ): CollectionReadResponse {
    return {
      ok: true,
      result: {
        collection_ref: request.collection_ref,
        object_kind: request.object_kind,
        coverage: "partial",
        reason,
        ...(totalHint === undefined ? {} : { source_total_hint: totalHint }),
        collected_count: records.length,
        restored_position: false,
        records,
      },
    };
  }

  private static async hasCurrentScope(
    request: CollectionReadRequest,
    sendToContent: (tabId: number, message: unknown) => Promise<unknown>,
  ): Promise<boolean> {
    const response = await this.sendWithDeadline(
      sendToContent,
      request.tab_id,
      {
        kind: "CONTENT_COLLECTION_CONTEXT",
      },
    );
    return (
      this.isContextResponse(response) &&
      response.document_epoch === request.document_epoch &&
      response.page_scope_epoch === request.page_scope_epoch
    );
  }

  private static sendWithDeadline(
    sendToContent: (tabId: number, message: unknown) => Promise<unknown>,
    tabId: number,
    message: unknown,
  ): Promise<unknown> {
    return withDeadline(
      sendToContent(tabId, message),
      CONTENT_MESSAGE_TIMEOUT_MS,
      "REQUEST_TIMEOUT",
    );
  }

  private static recordIdentity(
    record: SanitizedCollectionRecord,
  ): string | undefined {
    if (record.row_id) return `id:${record.row_id}`;
    if (record.aria_row_index !== undefined)
      return `aria:${record.aria_row_index}`;
    if (
      record.aria_pos_in_set !== undefined &&
      record.aria_set_size !== undefined
    )
      return `position:${record.aria_pos_in_set}:${record.aria_set_size}`;
    return undefined;
  }

  private static isOk(value: unknown): value is { ok: true } {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as { ok?: unknown }).ok === true
    );
  }

  private static isWindowReadResponse(
    value: unknown,
  ): value is WindowReadResponse {
    const result =
      typeof value === "object" && value !== null
        ? (value as { result?: unknown }).result
        : undefined;
    return (
      this.isOk(value) &&
      typeof result === "object" &&
      result !== null &&
      Array.isArray((result as { records?: unknown }).records)
    );
  }

  private static isScrollStepResponse(
    value: unknown,
  ): value is ScrollStepResponse {
    return (
      this.isOk(value) &&
      typeof (value as { atBottom?: unknown }).atBottom === "boolean"
    );
  }

  private static isContextResponse(value: unknown): value is ContextResponse {
    return (
      this.isOk(value) &&
      typeof (value as { document_epoch?: unknown }).document_epoch ===
        "string" &&
      typeof (value as { page_scope_epoch?: unknown }).page_scope_epoch ===
        "string"
    );
  }

  private static isStaticReadResponse(
    value: unknown,
  ): value is StaticReadResponse {
    if (typeof value !== "object" || value === null) return false;
    const result = (value as { result?: unknown; ok?: unknown }).result;
    return (
      (value as { ok?: unknown }).ok === true &&
      typeof result === "object" &&
      result !== null &&
      Array.isArray((result as { records?: unknown }).records) &&
      Number.isInteger((result as { total_rows?: unknown }).total_rows) &&
      typeof (result as { truncated?: unknown }).truncated === "boolean"
    );
  }
}
