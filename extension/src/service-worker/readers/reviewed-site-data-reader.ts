import type {
  CollectionReadDescriptor,
  CollectionReadStepResult,
  CollectionReadMode,
  CollectionObjectKind,
  CollectionReadEvidence,
  CollectionTerminalReason,
  CollectionReaderAdapter,
  SanitizedCollectionRecord,
} from "../../contracts/collection-read-types.js";
import { BaseCollectionReader } from "./base-reader.js";

export class ReviewedSiteDataReader extends BaseCollectionReader {
  public readonly kind: CollectionObjectKind = "table";
  public readonly supports_mode: readonly CollectionReadMode[] = ["full"];
  public readonly maxRecordsPerWindow = 200;
  public readonly maxTotalRecords = 10_000;

  private readonly adapters: Map<string, CollectionReaderAdapter> = new Map();

  public registerAdapter(adapter: CollectionReaderAdapter): void {
    this.adapters.set(adapter.adapter_id, adapter);
  }

  public async readWindow(
    descriptor: CollectionReadDescriptor,
    _mode: CollectionReadMode = "full",
    cursor?: string,
  ): Promise<CollectionReadStepResult> {
    void _mode;
    const adapter = this.findMatchingAdapter(descriptor);
    if (!adapter) {
      return this.createEmptyResult("ADAPTER_UNAVAILABLE");
    }

    const validationResult = this.validateAdapter(adapter, descriptor);
    if (!validationResult.ok) {
      return this.createEmptyResult(
        validationResult.reason ?? "ADAPTER_UNAVAILABLE",
      );
    }

    try {
      const result = await adapter.readWindow(descriptor, cursor);

      const records = result.window.records.map((record, index) => ({
        ...record,
        index,
      }));

      const evidence: CollectionReadEvidence = {
        stable_ids: records
          .map((r) => r.row_id)
          .filter((id): id is string => id !== undefined),
        aria_indices: records
          .map((r) => r.aria_row_index)
          .filter((idx): idx is number => idx !== undefined),
        aria_set_sizes: records
          .map((r) => r.aria_set_size)
          .filter((sz): sz is number => sz !== undefined),
        total_hint: result.terminal?.source_total_hint ?? undefined,
        eof_observed: !result.window.has_more,
        adapter_cursor: result.window.cursor ?? undefined,
        adapter_total: result.terminal?.source_total_hint ?? undefined,
      };

      let coverage: "complete" | "partial" | "viewport_only" | "unavailable" =
        "partial";
      let reason: CollectionTerminalReason = "NO_EOF_EVIDENCE";

      if (result.terminal) {
        coverage = result.terminal.coverage;
        reason = result.terminal.reason;
      } else if (
        !result.window.has_more &&
        evidence.adapter_total !== undefined
      ) {
        coverage = "complete";
        reason = "CAP_REACHED";
      } else if (records.length >= this.maxTotalRecords) {
        coverage = "partial";
        reason = "CAP_REACHED";
      }

      const windowResult: {
        records: readonly SanitizedCollectionRecord[];
        has_more: boolean;
        evidence: CollectionReadEvidence;
        cursor?: string;
      } = {
        records: this.sanitizeRecords(records, this.maxRecordsPerWindow),
        has_more: result.window.has_more,
        evidence,
      };
      if (result.window.cursor !== undefined) {
        windowResult.cursor = result.window.cursor;
      }

      return {
        window: windowResult,
        terminal: {
          coverage,
          reason,
          source_total_hint: evidence.adapter_total ?? undefined,
          restored_position: true,
        },
      };
    } catch {
      return this.createEmptyResult("ADAPTER_UNAVAILABLE");
    }
  }

  private findMatchingAdapter(
    descriptor: CollectionReadDescriptor,
  ): CollectionReaderAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (
        adapter.origins.some((origin) =>
          descriptor.container_xpath.includes(origin),
        ) &&
        adapter.matchesDescriptor(descriptor)
      ) {
        return adapter;
      }
    }
    return undefined;
  }

  private validateAdapter(
    adapter: CollectionReaderAdapter,
    descriptor: CollectionReadDescriptor,
  ): { ok: boolean; reason?: CollectionTerminalReason } {
    if (!adapter.matchesDescriptor(descriptor)) {
      return { ok: false, reason: "ADAPTER_UNAVAILABLE" };
    }
    return { ok: true };
  }

  private createEmptyResult(
    reason: CollectionTerminalReason,
  ): CollectionReadStepResult {
    return {
      window: {
        records: [],
        has_more: false,
        evidence: {
          stable_ids: [],
          aria_indices: [],
          aria_set_sizes: [],
          eof_observed: false,
          total_hint: undefined,
          adapter_cursor: undefined,
          adapter_total: undefined,
          page_transition_verified: undefined,
        },
      },
      terminal: {
        coverage: "unavailable",
        reason,
        source_total_hint: undefined,
        restored_position: false,
      },
    };
  }
}

export const reviewedSiteDataReader = new ReviewedSiteDataReader();
