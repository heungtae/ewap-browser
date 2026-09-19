import type {
  CollectionReadDescriptor,
  CollectionReadStepResult,
  CollectionReadMode,
  CollectionObjectKind,
  CollectionReadEvidence,
  CollectionTerminalReason,
  CollectionTerminal,
} from "../../contracts/collection-read-types.js";
import { BaseCollectionReader } from "./base-reader.js";

export class StaticTableListReader extends BaseCollectionReader {
  public readonly kind: CollectionObjectKind = "table";
  public readonly supports_mode: readonly CollectionReadMode[] = [
    "viewport",
    "full",
  ];
  public readonly maxRecordsPerWindow = 200;
  public readonly maxTotalRecords = 10_000;

  public async readWindow(
    descriptor: CollectionReadDescriptor,
    _mode: CollectionReadMode = "full",
    _cursor?: string,
  ): Promise<CollectionReadStepResult> {
    void _mode;
    void _cursor;
    const records = descriptor.sample_rows.map((row, index) => ({
      ...row,
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
      total_hint: descriptor.estimated_total ?? undefined,
      eof_observed: true,
      adapter_cursor: undefined,
      adapter_total: undefined,
      page_transition_verified: undefined,
    };

    const terminalReason: CollectionTerminalReason =
      records.length >= this.maxTotalRecords
        ? "CAP_REACHED"
        : "NO_EOF_EVIDENCE";

    const terminal: CollectionTerminal = {
      coverage: records.length >= this.maxTotalRecords ? "partial" : "complete",
      reason: terminalReason,
      source_total_hint: descriptor.estimated_total ?? undefined,
      restored_position: true,
    };

    return {
      window: {
        records: this.sanitizeRecords(records, this.maxRecordsPerWindow),
        has_more: false,
        evidence,
      },
      terminal,
    };
  }
}

export class StaticGridReader extends BaseCollectionReader {
  public readonly kind: CollectionObjectKind = "grid";
  public readonly supports_mode: readonly CollectionReadMode[] = [
    "viewport",
    "full",
  ];
  public readonly maxRecordsPerWindow = 200;
  public readonly maxTotalRecords = 10_000;

  public async readWindow(
    descriptor: CollectionReadDescriptor,
    _mode: CollectionReadMode = "full",
    _cursor?: string,
  ): Promise<CollectionReadStepResult> {
    void _mode;
    void _cursor;
    const records = descriptor.sample_rows.map((row, index) => ({
      ...row,
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
      total_hint: descriptor.estimated_total ?? undefined,
      eof_observed: true,
      adapter_cursor: undefined,
      adapter_total: undefined,
      page_transition_verified: undefined,
    };

    const terminalReason: CollectionTerminalReason =
      records.length >= this.maxTotalRecords
        ? "CAP_REACHED"
        : "NO_EOF_EVIDENCE";

    const terminal: CollectionTerminal = {
      coverage: records.length >= this.maxTotalRecords ? "partial" : "complete",
      reason: terminalReason,
      source_total_hint: descriptor.estimated_total ?? undefined,
      restored_position: true,
    };

    return {
      window: {
        records: this.sanitizeRecords(records, this.maxRecordsPerWindow),
        has_more: false,
        evidence,
      },
      terminal,
    };
  }
}

export class StaticListReader extends BaseCollectionReader {
  public readonly kind: CollectionObjectKind = "list";
  public readonly supports_mode: readonly CollectionReadMode[] = [
    "viewport",
    "full",
  ];
  public readonly maxRecordsPerWindow = 200;
  public readonly maxTotalRecords = 10_000;

  public async readWindow(
    descriptor: CollectionReadDescriptor,
    _mode: CollectionReadMode = "full",
    _cursor?: string,
  ): Promise<CollectionReadStepResult> {
    void _mode;
    void _cursor;
    const records = descriptor.sample_rows.map((row, index) => ({
      ...row,
      index,
    }));

    const evidence: CollectionReadEvidence = {
      stable_ids: records
        .map((r) => r.row_id)
        .filter((id): id is string => id !== undefined),
      aria_indices: records
        .map((r) => r.aria_pos_in_set)
        .filter((idx): idx is number => idx !== undefined),
      aria_set_sizes: records
        .map((r) => r.aria_set_size)
        .filter((sz): sz is number => sz !== undefined),
      total_hint: descriptor.estimated_total ?? undefined,
      eof_observed: true,
      adapter_cursor: undefined,
      adapter_total: undefined,
      page_transition_verified: undefined,
    };

    const terminalReason: CollectionTerminalReason =
      records.length >= this.maxTotalRecords
        ? "CAP_REACHED"
        : "NO_EOF_EVIDENCE";

    const terminal: CollectionTerminal = {
      coverage: records.length >= this.maxTotalRecords ? "partial" : "complete",
      reason: terminalReason,
      source_total_hint: descriptor.estimated_total ?? undefined,
      restored_position: true,
    };

    return {
      window: {
        records: this.sanitizeRecords(records, this.maxRecordsPerWindow),
        has_more: false,
        evidence,
      },
      terminal,
    };
  }
}
