import type {
  CollectionReader,
  CollectionReadDescriptor,
  CollectionReadStepResult,
  CollectionReadMode,
  CollectionObjectKind,
  CollectionTerminalReason,
  CollectionTerminal,
} from "../../contracts/collection-read-types.js";

export abstract class BaseCollectionReader implements CollectionReader {
  public abstract readonly kind: CollectionObjectKind;
  public abstract readonly supports_mode: readonly CollectionReadMode[];
  public abstract readonly maxRecordsPerWindow: number;
  public abstract readonly maxTotalRecords: number;

  public async discover(
    descriptor: CollectionReadDescriptor,
  ): Promise<CollectionReadDescriptor | null> {
    if (descriptor.object_kind !== this.kind) {
      return null;
    }
    return descriptor;
  }

  public abstract readWindow(
    descriptor: CollectionReadDescriptor,
    mode: CollectionReadMode,
    cursor?: string,
  ): Promise<CollectionReadStepResult>;

  protected createTerminalResult(
    coverage: "complete" | "partial" | "viewport_only" | "unavailable",
    reason: CollectionTerminalReason,
    restoredPosition: boolean,
    sourceTotalHint?: number | undefined,
  ): CollectionTerminal {
    return {
      coverage,
      reason,
      source_total_hint: sourceTotalHint,
      restored_position: restoredPosition,
    };
  }

  protected sanitizeRecords(
    records: CollectionReadStepResult["window"]["records"],
    maxRecords: number,
  ): CollectionReadStepResult["window"]["records"] {
    return records.slice(0, maxRecords).map((record, index) => ({
      ...record,
      index,
    }));
  }
}
