import type {
  CollectionReadDescriptor,
  CollectionReadStepResult,
  CollectionReadMode,
  CollectionObjectKind,
  CollectionReadEvidence,
} from "../../contracts/collection-read-types.js";
import { BaseCollectionReader } from "./base-reader.js";

export class CanvasChartReader extends BaseCollectionReader {
  public readonly kind: CollectionObjectKind = "chart_canvas";
  public readonly supports_mode: readonly CollectionReadMode[] = ["viewport"];
  public readonly maxRecordsPerWindow = 0;
  public readonly maxTotalRecords = 0;

  public async readWindow(
    descriptor: CollectionReadDescriptor,
    _mode: CollectionReadMode = "viewport",
    _cursor?: string,
  ): Promise<CollectionReadStepResult> {
    void _mode;
    void _cursor;
    const evidence: CollectionReadEvidence = {
      stable_ids: [],
      aria_indices: [],
      aria_set_sizes: [],
      eof_observed: false,
    };

    return {
      window: {
        records: [],
        has_more: false,
        evidence,
      },
      terminal: {
        coverage: "viewport_only",
        reason: "UNSUPPORTED_OBJECT",
        restored_position: true,
      },
    };
  }
}
