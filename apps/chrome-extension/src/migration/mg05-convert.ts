import { digestCanonical } from "../../../../extension/src/security/canonical.js";
import { isPlainObject } from "../../../../extension/src/security/validation.js";
import {
  legacyRequestSchema,
  dispatchPossible,
  dispatchUnknown,
} from "./mg05-request.js";
export const mg05Keys = [
  "execution_requests_v1",
  "contextpilot_pending_workflow_selections_v1",
] as const;
export type ExecutionSnapshot = Partial<
  Record<(typeof mg05Keys)[number], unknown>
>;
export function convertMg05(snapshot: ExecutionSnapshot) {
  const records: {
    sourceKey: string;
    sourceIndex: number;
    sourceDigest: string;
    executable: false;
    resumable: false;
    metadata: Record<string, unknown>;
  }[] = [];
  const quarantine: {
    sourceKey: string;
    sourceIndex: number;
    reason: string;
  }[] = [];
  let sourceCount = 0;
  for (const sourceKey of mg05Keys) {
    if (!(sourceKey in snapshot)) continue;
    const raw = snapshot[sourceKey];
    const requests = sourceKey === "execution_requests_v1";
    const values = requests
      ? raw
      : isPlainObject(raw) &&
          raw.schema_version === 1 &&
          Object.keys(raw).every((key) =>
            ["schema_version", "selections"].includes(key),
          )
        ? raw.selections
        : undefined;
    if (!Array.isArray(values) || values.length > (requests ? 100 : 8)) {
      sourceCount++;
      quarantine.push({
        sourceKey,
        sourceIndex: -1,
        reason: "INVALID_CONTAINER",
      });
      continue;
    }
    const ids = new Set<string>();
    for (const [sourceIndex, value] of values.entries()) {
      sourceCount++;
      try {
        let metadata: Record<string, unknown>;
        if (requests) {
          const row = legacyRequestSchema.parse(value);
          if (ids.has(row.request_id)) throw new Error("DUPLICATE_ID");
          ids.add(row.request_id);
          metadata = {
            kind: "legacy_request_archive",
            legacyRequestId: row.request_id,
            historicalTabId: row.tab_id,
            revision: row.revision,
            sourceState: row.state,
            sourceStage: row.stage,
            ...(row.outcome ? { sourceOutcome: row.outcome } : {}),
            ...(row.code ? { sourceCode: row.code } : {}),
            ...(row.completion ? { historicalCompletion: row.completion } : {}),
            startedAt: row.started_at_ms,
            lastProgressAt: row.last_progress_at_ms,
            requiresDrain: row.state !== "TERMINAL",
            dispatchRecorded: dispatchPossible(row),
            dispatchUncertain: dispatchUnknown(row),
          };
        } else {
          // Pending selections are deliberately not deserialized into live candidates.
          // All payload shapes stay in local backup; target contains only a discard marker.
          metadata = {
            kind: "discarded_pending_selection",
            authorityImported: false,
          };
        }
        records.push({
          sourceKey,
          sourceIndex,
          sourceDigest: digestCanonical(value),
          executable: false,
          resumable: false,
          metadata,
        });
      } catch {
        quarantine.push({
          sourceKey,
          sourceIndex,
          reason: "INVALID_OR_DUPLICATE_REQUEST",
        });
      }
    }
  }
  return {
    schema: "wca.mg05-archive/v1" as const,
    records,
    quarantine,
    sourceCount,
  };
}
export type ExecutionConversion = ReturnType<typeof convertMg05>;
