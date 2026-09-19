import type {
  SanitizedCollectionRecord,
  CollectionReadEvidence,
  CollectionCoverage,
  CollectionTerminalReason,
} from "../contracts/collection-read-types.js";

export type AccumulatedResult = {
  records: SanitizedCollectionRecord[];
  evidence: CollectionReadEvidence;
  coverage: CollectionCoverage;
  reason?: CollectionTerminalReason | undefined;
  sourceTotalHint?: number | undefined;
  restoredPosition: boolean;
  nextCursor?: string | undefined;
};

export class CollectionAccumulator {
  private readonly maxTotalRecords: number;
  private records: SanitizedCollectionRecord[] = [];
  private evidence: CollectionReadEvidence = {
    stable_ids: [] as string[],
    aria_indices: [] as number[],
    aria_set_sizes: [] as number[],
    eof_observed: false,
    total_hint: undefined,
    adapter_cursor: undefined,
    adapter_total: undefined,
    page_transition_verified: undefined,
  };
  private coverage: CollectionCoverage = "partial";
  private reason: CollectionTerminalReason | undefined = undefined;
  private sourceTotalHint: number | undefined = undefined;
  private restoredPosition = false;
  private nextCursor: string | undefined = undefined;
  private seenKeys = new Set<string>();

  public constructor(maxTotalRecords = 10_000) {
    this.maxTotalRecords = maxTotalRecords;
  }

  public accumulate(
    newRecords: readonly SanitizedCollectionRecord[],
    newEvidence: CollectionReadEvidence,
    newCoverage: CollectionCoverage,
    newReason?: CollectionTerminalReason,
    newSourceTotalHint?: number,
    newRestoredPosition = false,
    newNextCursor?: string,
  ): void {
    for (const record of newRecords) {
      if (this.records.length >= this.maxTotalRecords) break;

      const key = this.getRecordKey(record);
      if (key && this.seenKeys.has(key)) continue;

      if (key) this.seenKeys.add(key);
      this.records.push({ ...record, index: this.records.length });
    }

    this.mergeEvidence(newEvidence);
    this.coverage = newCoverage;
    this.reason = newReason ?? undefined;
    this.sourceTotalHint = newSourceTotalHint ?? this.sourceTotalHint;
    this.restoredPosition = newRestoredPosition;
    this.nextCursor = newNextCursor ?? undefined;
  }

  private mergeEvidence(newEvidence: CollectionReadEvidence): void {
    const stableIds = [...this.evidence.stable_ids];
    for (const id of newEvidence.stable_ids) {
      if (!stableIds.includes(id)) {
        stableIds.push(id);
      }
    }
    this.evidence.stable_ids = stableIds;

    const ariaIndices = [...this.evidence.aria_indices];
    for (const idx of newEvidence.aria_indices) {
      if (!ariaIndices.includes(idx)) {
        ariaIndices.push(idx);
      }
    }
    this.evidence.aria_indices = ariaIndices;

    const ariaSetSizes = [...this.evidence.aria_set_sizes];
    for (const sz of newEvidence.aria_set_sizes) {
      if (!ariaSetSizes.includes(sz)) {
        ariaSetSizes.push(sz);
      }
    }
    this.evidence.aria_set_sizes = ariaSetSizes;

    if (newEvidence.total_hint !== undefined) {
      this.evidence.total_hint = newEvidence.total_hint;
    }

    if (newEvidence.eof_observed) {
      this.evidence.eof_observed = true;
    }

    if (newEvidence.adapter_cursor !== undefined) {
      this.evidence.adapter_cursor = newEvidence.adapter_cursor;
    }

    if (newEvidence.adapter_total !== undefined) {
      this.evidence.adapter_total = newEvidence.adapter_total;
    }

    if (newEvidence.page_transition_verified) {
      this.evidence.page_transition_verified = true;
    }
  }

  private getRecordKey(record: SanitizedCollectionRecord): string | null {
    if (record.row_id) return `id:${record.row_id}`;
    if (record.aria_row_index !== undefined)
      return `ari:${record.aria_row_index}`;
    if (
      record.aria_pos_in_set !== undefined &&
      record.aria_set_size !== undefined
    ) {
      return `pos:${record.aria_pos_in_set}:${record.aria_set_size}`;
    }
    const cellHash = record.cells.join("|").slice(0, 100);
    return `hash:${cellHash}`;
  }

  public getResult(): AccumulatedResult {
    return {
      records: this.records,
      evidence: this.evidence,
      coverage: this.coverage,
      reason: this.reason ?? undefined,
      sourceTotalHint: this.sourceTotalHint ?? undefined,
      restoredPosition: this.restoredPosition,
      nextCursor: this.nextCursor ?? undefined,
    };
  }

  public getCollectedCount(): number {
    return this.records.length;
  }

  public isAtCapacity(): boolean {
    return this.records.length >= this.maxTotalRecords;
  }

  public reset(): void {
    this.records = [];
    this.evidence = {
      stable_ids: [] as string[],
      aria_indices: [] as number[],
      aria_set_sizes: [] as number[],
      eof_observed: false,
      total_hint: undefined,
      adapter_cursor: undefined,
      adapter_total: undefined,
      page_transition_verified: undefined,
    };
    this.coverage = "partial";
    this.reason = undefined;
    this.sourceTotalHint = undefined;
    this.restoredPosition = false;
    this.nextCursor = undefined;
    this.seenKeys.clear();
  }
}
