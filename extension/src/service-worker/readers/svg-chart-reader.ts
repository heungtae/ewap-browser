import type {
  CollectionReadDescriptor,
  CollectionReadStepResult,
  CollectionReadMode,
  CollectionObjectKind,
  CollectionReadEvidence,
  SanitizedCollectionRecord,
} from "../../contracts/collection-read-types.js";
import { BaseCollectionReader } from "./base-reader.js";

export class SvgChartReader extends BaseCollectionReader {
  public readonly kind: CollectionObjectKind = "chart_svg";
  public readonly supports_mode: readonly CollectionReadMode[] = [
    "viewport",
    "full",
  ];
  public readonly maxRecordsPerWindow = 100;
  public readonly maxTotalRecords = 1_000;

  public async readWindow(
    descriptor: CollectionReadDescriptor,
    _mode: CollectionReadMode = "viewport",
    _cursor?: string,
  ): Promise<CollectionReadStepResult> {
    void _mode;
    void _cursor;
    const records = await this.extractSvgData(descriptor);

    const evidence: CollectionReadEvidence = {
      stable_ids: [],
      aria_indices: [],
      aria_set_sizes: [],
      eof_observed: true,
    };

    return {
      window: {
        records: this.sanitizeRecords(records, this.maxRecordsPerWindow),
        has_more: false,
        evidence,
      },
      terminal: {
        coverage: records.length > 0 ? "complete" : "viewport_only",
        reason: records.length > 0 ? "CAP_REACHED" : "NO_EOF_EVIDENCE",
        source_total_hint: records.length > 0 ? records.length : undefined,
        restored_position: true,
      },
    };
  }

  private async extractSvgData(
    descriptor: CollectionReadDescriptor,
  ): Promise<SanitizedCollectionRecord[]> {
    const container = this.findContainerByXPath(descriptor.container_xpath);
    if (!container) return [];

    const records: SanitizedCollectionRecord[] = [];

    const textElements = container.querySelectorAll(
      "text, tspan, [role=cell], [role=gridcell]",
    );
    let index = 0;

    for (const element of textElements) {
      if (index >= this.maxRecordsPerWindow) break;

      const text = element.textContent?.trim();
      if (!text) continue;

      records.push({
        index: index++,
        cells: [text],
        aria_row_index: index,
      });
    }

    const tables = container.querySelectorAll(
      "table, [role=table], [role=grid]",
    );
    for (const table of tables) {
      for (const row of table.querySelectorAll("tr, [role=row]")) {
        if (index >= this.maxRecordsPerWindow) break;

        const cells: string[] = [];
        for (const cell of row.querySelectorAll(
          "td, th, [role=cell], [role=gridcell]",
        )) {
          cells.push(cell.textContent?.trim().slice(0, 200) ?? "");
        }

        if (cells.length > 0) {
          records.push({
            index: index++,
            cells,
            aria_row_index: index,
          });
        }
      }
    }

    return records;
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
}
