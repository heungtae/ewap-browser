export type CollectionObjectKind =
  | "table"
  | "grid"
  | "list"
  | "chart_svg"
  | "chart_canvas"
  | "pagination";

export type CollectionReadMode = "viewport" | "full";

export type CollectionCoverage =
  | "complete"
  | "partial"
  | "viewport_only"
  | "unavailable";

export type CollectionTerminalReason =
  | "CAP_REACHED"
  | "NO_STABLE_ID"
  | "NO_EOF_EVIDENCE"
  | "PAGE_CHANGED"
  | "UNSUPPORTED_OBJECT"
  | "ADAPTER_UNAVAILABLE"
  | "CANCELLED"
  | "TIMEOUT";

export type SanitizedCollectionRecord = {
  index: number;
  cells: readonly string[];
  row_id?: string | undefined;
  aria_row_index?: number | undefined;
  aria_pos_in_set?: number | undefined;
  aria_set_size?: number | undefined;
};

export type CollectionReadDescriptor = {
  collection_ref: string;
  object_kind: CollectionObjectKind;
  container_selector: string;
  container_xpath: string;
  container_rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  estimated_total?: number | undefined;
  has_virtual_scroll: boolean;
  has_pagination: boolean;
  aria_attributes: Readonly<Record<string, string>>;
  roles: readonly string[];
  sample_row_count: number;
  sample_rows: readonly SanitizedCollectionRecord[];
};

export type CollectionReadWindow = {
  records: readonly SanitizedCollectionRecord[];
  cursor?: string;
  has_more: boolean;
  evidence: CollectionReadEvidence;
};

export type CollectionReadEvidence = {
  stable_ids: readonly string[];
  aria_indices: readonly number[];
  aria_set_sizes: readonly number[];
  total_hint?: number | undefined;
  eof_observed: boolean;
  page_transition_verified?: boolean | undefined;
  adapter_cursor?: string | undefined;
  adapter_total?: number | undefined;
};

export type CollectionReadStepResult = {
  window: CollectionReadWindow;
  terminal?: CollectionTerminal;
};

export type CollectionTerminal = {
  coverage: CollectionCoverage;
  reason: CollectionTerminalReason;
  source_total_hint?: number | undefined;
  restored_position: boolean;
};

export type CollectionReadResult = {
  collection_ref: string;
  object_kind: CollectionObjectKind;
  coverage: CollectionCoverage;
  reason?: CollectionTerminalReason | undefined;
  source_total_hint?: number | undefined;
  collected_count: number;
  next_cursor?: string | undefined;
  restored_position: boolean;
  records: readonly SanitizedCollectionRecord[];
};

export type CollectionReader = {
  readonly kind: CollectionObjectKind;
  readonly supports_mode: readonly CollectionReadMode[];
  discover(
    descriptor: CollectionReadDescriptor,
  ): Promise<CollectionReadDescriptor | null>;
  readWindow(
    descriptor: CollectionReadDescriptor,
    mode: CollectionReadMode,
    cursor?: string,
  ): Promise<CollectionReadStepResult>;
  readonly maxRecordsPerWindow: number;
  readonly maxTotalRecords: number;
};

export type CollectionReaderAdapter = {
  readonly adapter_id: string;
  readonly version: number;
  readonly origins: readonly string[];
  /** Exact pathnames; wildcards and user-provided endpoints are forbidden. */
  readonly paths: readonly string[];
  matchesDescriptor(descriptor: CollectionReadDescriptor): boolean;
  readWindow(
    descriptor: CollectionReadDescriptor,
    cursor?: string | undefined,
  ): Promise<CollectionReadStepResult>;
  readonly resultSchema: {
    readonly type: "collection_read_v1";
    readonly additionalProperties: false;
  };
};

export type CollectionReadRequest = {
  collection_ref: string;
  object_kind: CollectionObjectKind;
  mode: CollectionReadMode;
  run_id: string;
  tab_id: number;
  frame_id: number;
  document_epoch: string;
  page_scope_epoch: string;
  origin: string;
  /** Worker-only selected page URL; never sent to the model or panel. */
  page_url: string;
  capability: "collection_read";
  approval_digest: string;
};

export type CollectionReadResponse =
  | { ok: true; result: CollectionReadResult }
  | { ok: false; code: string };

export const COLLECTION_READ_CAPABILITY = "collection_read" as const;

export const MAX_RECORDS_PER_WINDOW = 200;
export const MAX_TOTAL_RECORDS = 10_000;
export const MAX_COLLECTION_READ_TIME_MS = 120_000;
export const SCROLL_STABILIZE_MS = 300;
export const SCROLL_STEP_PX = 400;
