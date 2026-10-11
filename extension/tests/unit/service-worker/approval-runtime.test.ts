import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultApprovalPolicy } from "../../../src/policy/approval-policy.js";
import {
  defaultAgentPreferences,
  validateAgentPreferences,
} from "../../../src/policy/permission-mode.js";
import {
  approvalSaveBoundary,
  configureApprovalRuntime,
  createApprovalGrant,
} from "../../../src/service-worker/approval-runtime.js";
import {
  requestSourceConsent,
  decideSourceConsent,
} from "../../../src/service-worker/source-consent.js";
import { createPreferencesMessageHandler } from "../../../src/service-worker/preferences-message-handler.js";
const full = () => ({
  ...defaultAgentPreferences(),
  approval_policy: { ...defaultApprovalPolicy(), mode: "full" as const },
});
afterEach(() => {
  configureApprovalRuntime(defaultAgentPreferences);
  approvalSaveBoundary(false);
});
describe("request-local approval grants", () => {
  it("consumes only once and rejects scope, cancellation and save drift", () => {
    let current = true;
    const issue = () =>
      createApprovalGrant({
        category: "action_execution",
        source: "policy",
        preferences: full(),
        binding: "request:document:intent",
        current: () => current,
      });
    const grant = issue();
    grant();
    expect(grant).toThrow("POLICY_DENIED");
    const stale = issue();
    current = false;
    expect(stale).toThrow("POLICY_DENIED");
    current = true;
    const saved = issue();
    approvalSaveBoundary(true);
    expect(saved).toThrow("POLICY_DENIED");
    approvalSaveBoundary(false);
    expect(saved).toThrow("POLICY_DENIED");
    expect(() =>
      createApprovalGrant({
        category: "action_execution",
        source: "policy",
        binding: "request",
        current: () => true,
      }),
    ).toThrow("POLICY_DENIED");
  });
  it("auto disclosure does not publish a consent card; deny reads nothing", async () => {
    const publish = vi.fn();
    const preferences = full();
    expect(
      await requestSourceConsent({
        runId: "run",
        category: "vision_disclosure",
        preferences,
        current: () => true,
        publish,
      }),
    ).toBe(true);
    preferences.approval_policy.mode = "custom" as never;
    preferences.approval_policy.categories.vision_disclosure = "deny";
    expect(
      await requestSourceConsent({
        runId: "run",
        category: "vision_disclosure",
        preferences,
        current: () => true,
        publish,
      }),
    ).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });
  it("human consent remains one-use and cancels on Stop", async () => {
    let id = "";
    const signal = new AbortController();
    const pending = requestSourceConsent({
      runId: "run",
      current: () => true,
      signal: signal.signal,
      publish: (value) => {
        id = value;
      },
    });
    expect(decideSourceConsent(id, "other", true)).toBe(false);
    expect(decideSourceConsent(id, "run", true)).toBe(true);
    expect(await pending).toBe(true);
    expect(decideSourceConsent(id, "run", true)).toBe(false);
    const stopped = requestSourceConsent({
      runId: "run",
      current: () => true,
      signal: signal.signal,
      publish: (value) => {
        id = value;
      },
    });
    signal.abort();
    expect(await stopped).toBe(false);
    expect(decideSourceConsent(id, "run", true)).toBe(false);
  });
  it("serializes settings saves and rejects a competing stale revision", async () => {
    let stored = full();
    const order: string[] = [];
    const handler = createPreferencesMessageHandler({
      isPanelOrSettingsSender: () => true,
      isSettingsSender: () => true,
      preferences: () => stored,
      validatePreferences: validateAgentPreferences,
      cancelAllRuns: async () => {
        order.push("cancel");
      },
      savePreferences: async (value) => {
        order.push("save");
        stored = value as typeof stored;
      },
      safeFailure: (code) => ({ ok: false, code }),
    });
    const first = vi.fn(),
      second = vi.fn();
    const message = {
      kind: "AGENT_PREFERENCES_SAVE",
      payload: { preferences: full() },
    };
    handler.handle(message, {}, first);
    handler.handle(message, {}, second);
    await vi.waitFor(() => expect(second).toHaveBeenCalled());
    expect(first.mock.calls[0]![0].ok).toBe(true);
    expect(stored.approval_policy.revision).toBe(1);
    expect(second).toHaveBeenCalledWith({
      ok: false,
      code: "INVALID_ARGUMENT",
    });
    expect(order).toEqual(["cancel", "save", "cancel"]);
  });
});
