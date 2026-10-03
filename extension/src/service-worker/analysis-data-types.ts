export type AnalysisReason =
  | "REQUIRES_SELECTION"
  | "PERMISSION_REQUIRED"
  | "UNAVAILABLE"
  | "CAP_REACHED"
  | "CONTEXT_TRUNCATED"
  | "NO_STABLE_ID"
  | "NO_EOF_EVIDENCE"
  | "PAGE_CHANGED"
  | "UNSUPPORTED_OBJECT"
  | "ADAPTER_UNAVAILABLE"
  | "CANCELLED"
  | "TIMEOUT"
  | "REQUIRES_ADAPTER_REVIEW"
  | "INVALID_SCHEMA";

export type AnalysisDataContext = {
  source: { kind: "collection" | "page_api_read"; label: string };
  coverage: "complete" | "partial" | "viewport_only" | "unavailable";
  reason?: AnalysisReason;
  collected_count: number;
  records: readonly { index: number; cells: readonly string[] }[];
  truncated: boolean;
};

export type AnalysisCollectionCandidate = {
  candidate_id: string;
  object_kind: string;
  label: string;
  estimated_total?: number;
  has_virtual_scroll: boolean;
};
export type AnalysisAdapterReview = {
  ok: true;
  state: "ANALYSIS_ADAPTER_REVIEW_REQUIRED";
};
export type AnalysisCollectionWait = {
  ok: true;
  state:
    | "ANALYSIS_COLLECTION_SELECTION_REQUIRED"
    | "ANALYSIS_COLLECTION_PERMISSION_REQUIRED";
  selection_id: string;
  candidates: readonly AnalysisCollectionCandidate[];
  selected_candidate_id?: string;
  permission_request_id?: string;
};
export type AnalysisCollectionSelection = {
  selection_id: string;
  candidate_id: string;
};
export type AnalysisDataAcquisitionResult =
  | AnalysisDataContext
  | AnalysisCollectionWait
  | AnalysisAdapterReview
  | undefined;
