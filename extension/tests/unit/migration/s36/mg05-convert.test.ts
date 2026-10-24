import { expect, it } from "vitest";
import { convertMg05 } from "../../../../../apps/chrome-extension/src/migration/mg05-convert.js";
import { archivedRequest } from "./mg05-support.js";
it("archives expired terminal summaries without TTL loss or a resumable task", () => {
  const result = convertMg05({
    execution_requests_v1: [
      archivedRequest({
        dispatch_started: true,
        completion: {
          action_outcome: "VERIFIED",
          goal_status: "unknown",
          reason: "GOAL_UNCONFIRMED",
          reassessments: 0,
        },
      }),
    ],
  });
  expect(result.records[0]).toMatchObject({
    executable: false,
    resumable: false,
    metadata: {
      requiresDrain: false,
      dispatchRecorded: true,
      dispatchUncertain: false,
      historicalCompletion: {
        action_outcome: "VERIFIED",
        goal_status: "unknown",
      },
    },
  });
});
it("preserves active or cancelled dispatch uncertainty, including legacy stage-only hints", () => {
  const rows = [
    archivedRequest({ state: "RUNNING", stage: "DISPATCH" }),
    archivedRequest({
      request_id: "30000000-0000-4000-8000-000000000001",
      outcome: "CANCELLED",
      dispatch_started: true,
    }),
  ];
  const result = convertMg05({ execution_requests_v1: rows });
  expect(result.records.map((row) => row.metadata.dispatchUncertain)).toEqual([
    true,
    true,
  ]);
  expect(result.records[0]?.metadata.requiresDrain).toBe(true);
  expect(rows[0]?.state).toBe("RUNNING");
});
it("never imports pending selection candidates, prompts or selected IDs into target authority", () => {
  const result = convertMg05({
    contextpilot_pending_workflow_selections_v1: {
      schema_version: 1,
      selections: [
        {
          selected_id: "SECRET_SELECTED_ID",
          prompt: "PRIVATE_PROMPT",
          candidate: "OLD_CANDIDATE",
        },
      ],
    },
  });
  expect(result.records[0]?.metadata).toEqual({
    kind: "discarded_pending_selection",
    authorityImported: false,
  });
  expect(JSON.stringify(result)).not.toMatch(
    /SECRET_SELECTED_ID|PRIVATE_PROMPT|OLD_CANDIDATE/,
  );
});
it("quarantines bad, duplicate and unsupported request records without silent filtering", () => {
  const result = convertMg05({
    execution_requests_v1: [
      archivedRequest(),
      archivedRequest(),
      archivedRequest({ state: "UNSUPPORTED" }),
      archivedRequest({ owner: 1 }),
    ],
  });
  expect(result.sourceCount).toBe(4);
  expect(result.records).toHaveLength(1);
  expect(result.quarantine).toHaveLength(3);
  expect(convertMg05({ execution_requests_v1: {} }).quarantine).toHaveLength(1);
});
