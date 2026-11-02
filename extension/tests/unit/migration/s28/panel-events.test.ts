import { expect, it } from "vitest";
import {
  bridgeEventSchema,
  panelEventSchema,
  panelResponseSchema,
} from "../../../../../packages/shared/src/bridge.js";
const prompt = {
  id: "prompt",
  requestId: "request",
  documentId: "document",
  revision: 1,
  expiresAt: 1000,
};
const event = {
  runId: "run",
  requestId: "request",
  type: "action_review_required",
  action: { tool: "click_by_ref", target_name: "Save" },
  prompt,
};
it("accepts closed display events but rejects persisted authority and ambiguous payloads", () => {
  expect(panelEventSchema.safeParse(event).success).toBe(true);
  expect(
    panelEventSchema.safeParse({
      ...event,
      action: { ...event.action, grant: "secret" },
    }).success,
  ).toBe(false);
  expect(
    panelEventSchema.safeParse({
      ...event,
      prompt: { ...prompt, token: "grant" },
    }).success,
  ).toBe(false);
  expect(
    bridgeEventSchema.safeParse({
      sequence: 1,
      revision: 1,
      kind: "presentation",
    }).success,
  ).toBe(false);
  expect(
    bridgeEventSchema.safeParse({
      sequence: 1,
      revision: 1,
      kind: "presentation",
      presentation: event,
      text: "mixed",
    }).success,
  ).toBe(false);
  expect(
    bridgeEventSchema.safeParse({
      sequence: 1,
      revision: 1,
      kind: "browser.connected",
      presentation: event,
    }).success,
  ).toBe(false);
});
it("preserves exact prompt binding in responses without allowing UI-supplied execution identity", () => {
  const response = {
    kind: "review",
    runId: "run",
    prompt,
    decision: "approve",
  };
  expect(panelResponseSchema.parse(response)).toEqual(response);
  expect(
    panelResponseSchema.safeParse({ ...response, method: "dispatch" }).success,
  ).toBe(false);
  expect(
    panelResponseSchema.safeParse({ ...response, decision: "execute" }).success,
  ).toBe(false);
  expect(
    panelResponseSchema.safeParse({
      kind: "value",
      runId: "run",
      prompt,
      value: "x".repeat(16385),
    }).success,
  ).toBe(false);
});
it("rejects contradictory completion facts and unknown event variants", () => {
  const terminal = {
    runId: "run",
    requestId: "request",
    type: "run_terminal",
    outcome: "UNKNOWN",
    completion: {
      action_outcome: "UNKNOWN",
      goal_status: "completed",
      reason: "GOAL_OBSERVED",
      reassessments: 0,
    },
  };
  expect(panelEventSchema.safeParse(terminal).success).toBe(false);
  expect(
    panelEventSchema.safeParse({
      runId: "run",
      requestId: "request",
      type: "run_started",
      mode: "act",
      permission_mode: "unknown",
    }).success,
  ).toBe(false);
  expect(
    panelEventSchema.safeParse({ ...event, type: "execute" }).success,
  ).toBe(false);
});
