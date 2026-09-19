import type {
  CollectionReadDescriptor,
  CollectionReadStepResult,
  CollectionReadMode,
  CollectionObjectKind,
  CollectionTerminalReason,
} from "../../contracts/collection-read-types.js";
import { BaseCollectionReader } from "./base-reader.js";

export class PaginatedReader extends BaseCollectionReader {
  public readonly kind: CollectionObjectKind = "pagination";
  public readonly supports_mode: readonly CollectionReadMode[] = ["full"];
  public readonly maxRecordsPerWindow = 200;
  public readonly maxTotalRecords = 10_000;

  public async readWindow(
    descriptor: CollectionReadDescriptor,
    _mode: CollectionReadMode = "full",
    _cursor?: string,
  ): Promise<CollectionReadStepResult> {
    void _mode;
    void _cursor;
    if (!descriptor.has_pagination) {
      return this.createEmptyResult("UNSUPPORTED_OBJECT");
    }

    return {
      window: {
        records: [],
        has_more: false,
        evidence: {
          stable_ids: [],
          aria_indices: [],
          aria_set_sizes: [],
          eof_observed: false,
        },
      },
      terminal: {
        coverage: "unavailable",
        reason: "UNSUPPORTED_OBJECT",
        restored_position: true,
      },
    };
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
        },
      },
      terminal: {
        coverage: "unavailable",
        reason,
        restored_position: false,
      },
    };
  }
}
