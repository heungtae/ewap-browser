import { expect, it } from "vitest";
import { convertMg04 } from "../../../../../apps/chrome-extension/src/migration/mg04-convert.js";
import { historySource } from "./mg04-support.js";
it("preserves legacy transcript/context and verified action versus unknown goal as history only", () => {
  const source = historySource();
  const original = structuredClone(source);
  const result = convertMg04(source);
  expect(result.records).toHaveLength(1);
  expect(result.records[0]).toMatchObject({
    legacySessionId: source.chat_session_v1.session_id,
    historicalTabId: 7,
    historicalScope: { origin: "https://example.test", path: "/saved" },
    historyOnly: true,
    executable: false,
    reconnectAllowed: false,
  });
  const timeline = result.records[0]!.timeline;
  expect(timeline[1]?.display).toEqual({ text: "Original question" });
  expect(timeline[2]?.display).toEqual({ text: "Original answer" });
  expect(timeline[5]?.display).toMatchObject({
    outcome: "UNKNOWN",
    completion: { action_outcome: "VERIFIED", goal_status: "unknown" },
  });
  expect(JSON.stringify(timeline)).not.toContain('"type":');
  expect(source).toEqual(original);
});
it("archives a pending confirmation as a marker without nonce, proposal, value or live IDs", () => {
  const source = historySource();
  const thread = source.chat_session_v1.threads[0]!;
  thread.events.push({
    type: "confirmation_required",
    session_id: source.chat_session_v1.session_id,
    thread_id: thread.thread_id,
    tab_id: thread.tab_id,
    run_id: "legacy-run-000000002",
    sequence: 7,
    action: {
      session_id: source.chat_session_v1.session_id,
      proposal_id: "proposal-old-0000001",
      tool: "click_by_ref",
      target_name: "Submit",
      suggested_value: "PRIVATE_EPHEMERAL_VALUE",
    },
    confirmation_id: "confirmation-old-00001",
    confirmation_nonce: "PRIVATE_NONCE_0000001",
  });
  const result = convertMg04(source);
  expect(result.records).toHaveLength(1);
  expect(result.records[0]?.timeline[6]?.display).toEqual({
    historicalAuthorityOmitted: true,
  });
  const serialized = JSON.stringify(result);
  for (const denied of [
    "PRIVATE_EPHEMERAL_VALUE",
    "PRIVATE_NONCE_0000001",
    "proposal-old-0000001",
    "confirmation-old-00001",
    "tool_use_id",
  ])
    expect(serialized).not.toContain(denied);
});
it("quarantines mismatched event ownership, duplicate threads and decreasing sequences", () => {
  const source = historySource();
  const valid = structuredClone(source.chat_session_v1.threads[0]!);
  const wrongOwner = structuredClone(valid);
  wrongOwner.events[0]!.tab_id = 9;
  const wrongOrder = structuredClone(valid);
  wrongOrder.events[1]!.sequence = 1;
  source.chat_session_v1.threads.push(
    structuredClone(valid),
    wrongOwner,
    wrongOrder,
  );
  const result = convertMg04(source);
  expect(result.sourceCount).toBe(4);
  expect(result.records).toHaveLength(1);
  expect(result.quarantine.map((q) => q.reason)).toEqual([
    "DUPLICATE_THREAD",
    "INVALID_THREAD",
    "INVALID_THREAD",
  ]);
});
it("treats cleared/absent session as empty and unsupported data as quarantined original", () => {
  expect(
    convertMg04({
      chat_session_v1: { schema_version: 1, session_id: "bad", threads: [] },
    }).quarantine,
  ).toHaveLength(1);
  expect(convertMg04({}).sourceCount).toBe(0);
  expect(convertMg04({ chat_session_v1: null }).sourceCount).toBe(0);
  expect(
    convertMg04({ chat_session_v1: { schema_version: 2 } }).quarantine,
  ).toEqual([{ sourceIndex: -1, reason: "INVALID_CONTAINER" }]);
});
it("does not manufacture completion or reconnect for an interrupted legacy run", () => {
  const source = historySource();
  source.chat_session_v1.threads[0]!.events.pop();
  const result = convertMg04(source);
  expect(result.records[0]?.timeline).toHaveLength(5);
  expect(result.records[0]?.reconnectAllowed).toBe(false);
  expect(
    result.records[0]?.timeline.some(
      (event) => event.legacyType === "run_terminal",
    ),
  ).toBe(false);
});
