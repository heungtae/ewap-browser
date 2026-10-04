import { getTraceState } from "./trace-recording.js";
import { correlation } from "./trace-context.js";
export const methodTraceSnapshot = (
  scope: "worker" | "panel" | "content" | "offscreen",
  requestId?: string,
  tabId?: number,
) => {
  const {
    records,
    retained,
    methods,
    level,
    expires,
    dropped,
    sampledDropped,
  } = getTraceState();
  return {
    schema_version: 1,
    scope,
    level,
    expires_at_ms: expires,
    collection_expired: Date.now() >= expires,
    dropped_count: dropped,
    evicted_method_samples: sampledDropped,
    persistent: false,
    context_limit:
      "Content and Panel records are scoped to the current document; Worker records are filtered by request/tab binding.",
    methods: [...methods].map(([method, counts]) => ({ method, ...counts })),
    retention:
      "Bounded chronological buffer plus latest event per method/request; aggregate counts include all invocations.",
    records: [
      ...new Map(
        [...retained.values(), ...records].map((entry) => [
          entry.sequence,
          entry,
        ]),
      ).values(),
    ]
      .filter((entry) => {
        if (entry.timestamp_ms < Date.now() - 30 * 60_000) return false;
        if (scope !== "worker") return true;
        const owner = correlation(entry.context);
        return requestId
          ? owner.request_id === requestId
          : tabId !== undefined && owner.tab_id === tabId;
      })
      .sort((a, b) => a.sequence - b.sequence)
      .map(({ context, ...record }) => ({
        ...record,
        ...correlation(context),
      })),
  };
};
