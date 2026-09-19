import type {
  CollectionReadDescriptor,
  CollectionReadStepResult,
  CollectionReadMode,
  CollectionObjectKind,
  CollectionReadEvidence,
  CollectionTerminalReason,
  SanitizedCollectionRecord,
} from "../../contracts/collection-read-types.js";
import { BaseCollectionReader } from "./base-reader.js";

export class VirtualScrollReader extends BaseCollectionReader {
  public readonly kind: CollectionObjectKind = "grid";
  public readonly supports_mode: readonly CollectionReadMode[] = ["full"];
  public readonly maxRecordsPerWindow = 200;
  public readonly maxTotalRecords = 10_000;

  private readonly scrollDriver = new VirtualScrollDriver();

  public async readWindow(
    descriptor: CollectionReadDescriptor,
    _mode: CollectionReadMode = "full",
    cursor?: string,
  ): Promise<CollectionReadStepResult> {
    void _mode;
    if (!descriptor.has_virtual_scroll) {
      return this.createEmptyResult("UNSUPPORTED_OBJECT");
    }

    const initResult = await this.scrollDriver.initialize(descriptor);
    if (!initResult.ok) {
      return this.createEmptyResult(
        initResult.error as CollectionTerminalReason,
      );
    }

    let allRecords: SanitizedCollectionRecord[] = [];
    let stepCount = 0;
    const maxSteps = 50;
    let hasStableIds = false;
    const totalHint = descriptor.estimated_total;
    let eofObserved = false;

    if (cursor) {
      const parsed = this.parseCursor(cursor);
      if (parsed) {
        allRecords = parsed.records;
        stepCount = parsed.stepCount;
      }
    }

    while (stepCount < maxSteps && allRecords.length < this.maxTotalRecords) {
      const stepResult = await this.scrollDriver.scrollStep();
      if (!stepResult.success) {
        break;
      }

      const newRecords = await this.extractRecordsFromContainer(
        this.scrollDriver.getContainer()!,
        descriptor,
      );

      const deduplicated = this.deduplicateRecords(allRecords, newRecords);
      const newCount = deduplicated.length - allRecords.length;
      allRecords = deduplicated;

      if (newCount === 0) {
        this.scrollDriver.incrementStableCount();
      } else {
        this.scrollDriver.resetStableCount();
      }

      if (this.scrollDriver.getStableCount() >= 3) {
        eofObserved = true;
        break;
      }

      if (stepResult.atBottom) {
        eofObserved = true;
        break;
      }

      stepCount++;
    }

    const restored = this.scrollDriver.restorePosition();

    const stableIds = allRecords
      .map((r) => r.row_id)
      .filter((id): id is string => id !== undefined);
    const ariaIndices = allRecords
      .map((r) => r.aria_row_index)
      .filter((idx): idx is number => idx !== undefined);
    const ariaSetSizes = allRecords
      .map((r) => r.aria_set_size)
      .filter((sz): sz is number => sz !== undefined);

    hasStableIds =
      stableIds.length > 0 && stableIds.length === allRecords.length;

    let coverage: "complete" | "partial" | "viewport_only" | "unavailable" =
      "partial";
    let reason: CollectionTerminalReason = "NO_EOF_EVIDENCE";

    if (eofObserved && hasStableIds) {
      coverage = "complete";
      reason = "CAP_REACHED";
    } else if (allRecords.length >= this.maxTotalRecords) {
      coverage = "partial";
      reason = "CAP_REACHED";
    } else if (!hasStableIds) {
      coverage = "partial";
      reason = "NO_STABLE_ID";
    } else if (!eofObserved) {
      coverage = "partial";
      reason = "NO_EOF_EVIDENCE";
    }

    const nextCursor = this.createCursor(allRecords, stepCount);

    const evidence: CollectionReadEvidence = {
      stable_ids: stableIds,
      aria_indices: ariaIndices,
      aria_set_sizes: ariaSetSizes,
      total_hint: totalHint,
      eof_observed: eofObserved,
    };

    return {
      window: {
        records: this.sanitizeRecords(allRecords, this.maxRecordsPerWindow),
        cursor: nextCursor,
        has_more: !eofObserved && allRecords.length < this.maxTotalRecords,
        evidence,
      },
      terminal: {
        coverage,
        reason,
        source_total_hint: totalHint,
        restored_position: restored,
      },
    };
  }

  private async extractRecordsFromContainer(
    container: Element,
    descriptor: CollectionReadDescriptor,
  ): Promise<SanitizedCollectionRecord[]> {
    const records: SanitizedCollectionRecord[] = [];

    let rowSelector = "tr, [role=row]";
    if (descriptor.object_kind === "list") {
      rowSelector = "li, [role=listitem], [role=option]";
    }

    let index = 0;
    for (const row of container.querySelectorAll(rowSelector)) {
      if (index >= this.maxRecordsPerWindow) break;

      const cells: string[] = [];
      if (
        descriptor.object_kind === "table" ||
        descriptor.object_kind === "grid"
      ) {
        for (const cell of row.querySelectorAll(
          "td, th, [role=cell], [role=gridcell], [role=columnheader], [role=rowheader]",
        )) {
          cells.push(cell.textContent?.trim().slice(0, 200) ?? "");
        }
      } else {
        cells.push(row.textContent?.trim().slice(0, 200) ?? "");
      }

      const ariaRowIndex = row.getAttribute("aria-rowindex");
      const ariaPosInSet = row.getAttribute("aria-posinset");
      const ariaSetSize = row.getAttribute("aria-setsize");
      const rowId = row.getAttribute("data-row-id") ?? row.id ?? undefined;

      records.push({
        index: index++,
        cells,
        row_id: rowId,
        aria_row_index: ariaRowIndex ? parseInt(ariaRowIndex, 10) : undefined,
        aria_pos_in_set: ariaPosInSet ? parseInt(ariaPosInSet, 10) : undefined,
        aria_set_size: ariaSetSize ? parseInt(ariaSetSize, 10) : undefined,
      });
    }

    return records;
  }

  private deduplicateRecords(
    existing: SanitizedCollectionRecord[],
    incoming: SanitizedCollectionRecord[],
  ): SanitizedCollectionRecord[] {
    const seen = new Set<string>();

    for (const record of existing) {
      const key = this.getRecordKey(record);
      if (key) seen.add(key);
    }

    const result = [...existing];
    for (const record of incoming) {
      const key = this.getRecordKey(record);
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(record);
      } else if (!key) {
        result.push(record);
      }
    }

    return result;
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
    return null;
  }

  private parseCursor(
    cursor: string,
  ): { records: SanitizedCollectionRecord[]; stepCount: number } | null {
    try {
      const decoded = JSON.parse(atob(cursor));
      return {
        records: decoded.records ?? [],
        stepCount: decoded.stepCount ?? 0,
      };
    } catch {
      return null;
    }
  }

  private createCursor(
    records: SanitizedCollectionRecord[],
    stepCount: number,
  ): string {
    return btoa(JSON.stringify({ records, stepCount }));
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

class VirtualScrollDriver {
  private container: HTMLElement | null = null;
  private originalScrollTop = 0;
  private originalScrollLeft = 0;
  private stepCount = 0;
  private lastScrollTop = -1;
  private stableCount = 0;

  private readonly SCROLL_STEP_PX = 400;
  private readonly STABILIZE_MS = 300;

  async initialize(
    descriptor: CollectionReadDescriptor,
  ): Promise<{ ok: boolean; error?: string }> {
    const container = this.findContainerByXPath(descriptor.container_xpath);
    if (!container) {
      return { ok: false, error: "CONTAINER_NOT_FOUND" };
    }

    if (!this.isScrollable(container)) {
      return { ok: false, error: "CONTAINER_NOT_SCROLLABLE" };
    }

    this.container = container as HTMLElement;
    this.originalScrollTop = this.container.scrollTop;
    this.originalScrollLeft = this.container.scrollLeft;
    this.stepCount = 0;
    this.lastScrollTop = -1;
    this.stableCount = 0;

    return { ok: true };
  }

  async scrollStep(): Promise<{
    success: boolean;
    newContent: boolean;
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    atBottom: boolean;
    error?: string;
  }> {
    if (!this.container) {
      return {
        success: false,
        newContent: false,
        scrollTop: 0,
        scrollHeight: 0,
        clientHeight: 0,
        atBottom: true,
        error: "DRIVER_NOT_INITIALIZED",
      };
    }

    const beforeScrollTop = this.container.scrollTop;
    const scrollHeight = this.container.scrollHeight;
    const clientHeight = this.container.clientHeight;

    const targetScrollTop = Math.min(
      beforeScrollTop + this.SCROLL_STEP_PX,
      scrollHeight - clientHeight,
    );

    this.container.scrollTop = targetScrollTop;

    await this.waitForMutations(this.container, this.STABILIZE_MS);

    const afterScrollTop = this.container.scrollTop;
    const atBottom = afterScrollTop >= scrollHeight - clientHeight - 1;

    let newContent = false;
    if (afterScrollTop !== this.lastScrollTop) {
      newContent = true;
      this.stableCount = 0;
    } else {
      this.stableCount++;
    }

    this.stepCount++;
    this.lastScrollTop = afterScrollTop;

    return {
      success: true,
      newContent,
      scrollTop: afterScrollTop,
      scrollHeight,
      clientHeight,
      atBottom,
    };
  }

  getContainer(): Element | null {
    return this.container;
  }

  getStepCount(): number {
    return this.stepCount;
  }

  getStableCount(): number {
    return this.stableCount;
  }

  incrementStableCount(): void {
    this.stableCount++;
  }

  resetStableCount(): void {
    this.stableCount = 0;
  }

  restorePosition(): boolean {
    if (!this.container) return false;

    try {
      this.container.scrollTop = this.originalScrollTop;
      this.container.scrollLeft = this.originalScrollLeft;
      return true;
    } catch {
      return false;
    }
  }

  private findContainerByXPath(xpath: string): Element | null {
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

  private isScrollable(element: Element): boolean {
    const style = getComputedStyle(element);
    return (
      style.overflow === "auto" ||
      style.overflow === "scroll" ||
      style.overflowY === "auto" ||
      style.overflowY === "scroll"
    );
  }

  private waitForMutations(
    container: Element,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      let resolved = false;
      const observer = new MutationObserver(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          resolve();
        }
      });

      observer.observe(container, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          "aria-rowindex",
          "aria-posinset",
          "aria-setsize",
          "data-row-id",
        ],
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          resolve();
        }
      }, timeoutMs);
    });
  }
}
