import type { PageScope } from "../state/tab-chat-session-store.js";
import type { AnalysisDataContext } from "./analysis-data-acquisition.js";

/** Discard collected rows when the page has changed before model dispatch. */
export const analysisDataForScope = (
  data: AnalysisDataContext,
  acquired: PageScope | undefined,
  current: PageScope,
): AnalysisDataContext => {
  if (
    acquired &&
    acquired.document_epoch === current.document_epoch &&
    acquired.page_scope_epoch === current.page_scope_epoch &&
    acquired.origin === current.origin &&
    acquired.path === current.path
  )
    return data;
  return {
    source: { kind: "collection", label: "page collection" },
    coverage: "unavailable",
    reason: "PAGE_CHANGED",
    collected_count: 0,
    records: [],
    truncated: false,
  };
};
