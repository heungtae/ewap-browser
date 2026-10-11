import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultApprovalPolicy } from "../../../src/policy/approval-policy.js";
import {
  defaultAgentPreferences,
  validateAgentPreferences,
} from "../../../src/policy/permission-mode.js";
import {
  approvalSaveBoundary,
  assertApprovalAvailable,
  configureApprovalRuntime,
  markApprovalSettingsInvalid,
} from "../../../src/service-worker/approval-runtime.js";
import { createPreferencesMessageHandler } from "../../../src/service-worker/preferences-message-handler.js";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import {
  makeS17Test,
  executionInventory,
  planArguments,
} from "./s17-test-support.js";
import { TabChatSessionStore } from "../../../src/state/tab-chat-session-store.js";
const full = () => ({
  ...defaultAgentPreferences(),
  approval_policy: { ...defaultApprovalPolicy(), mode: "full" as const },
});
afterEach(() => {
  configureApprovalRuntime(defaultAgentPreferences);
  approvalSaveBoundary(false);
  markApprovalSettingsInvalid(false);
});
describe("S22 continuation and recovery", () => {
  it("automatically accepts the current plan without publishing a review or invoking an action", async () => {
    const { session, dependencies } = makeS17Test();
    dependencies.preferences = full;
    dependencies.provider.chat = vi.fn(async (input) => {
      const inventory = executionInventory(input.messages);
      return {
        content: "",
        tool_calls: [
          {
            id: "plan-call",
            name: "submit_plan",
            arguments: JSON.stringify(
              planArguments(
                inventory.request_revision,
                inventory.observation_id,
              ),
            ),
          },
        ],
      };
    });
    await createActStepRunner(dependencies).runStep(session);
    expect(dependencies.executeApprovedProposal).toHaveBeenCalledOnce();
    expect(dependencies.publish).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "action_review_required" }),
    );
    expect(dependencies.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "approval_decision",
        category: "plan_approval",
        approval_source: "policy",
      }),
    );
    expect(session.executionEvidence).toBeUndefined();
  });
  it("blocks dispatch throughout a failed save until a successful recovery save", async () => {
    let stored = full();
    let failSave = true;
    const handler = createPreferencesMessageHandler({
      isPanelOrSettingsSender: () => true,
      isSettingsSender: () => true,
      preferences: () => stored,
      validatePreferences: validateAgentPreferences,
      cancelAllRuns: async () => {
        expect(assertApprovalAvailable).toThrow("POLICY_DENIED");
      },
      savePreferences: async (value) => {
        if (failSave) throw Error("storage unavailable");
        stored = value as typeof stored;
      },
      safeFailure: (code) => ({ ok: false, code }),
    });
    const response = vi.fn();
    const message = {
      kind: "AGENT_PREFERENCES_SAVE",
      payload: { preferences: full() },
    };
    handler.handle(message, {}, response);
    await vi.waitFor(() =>
      expect(response).toHaveBeenCalledWith({
        ok: false,
        code: "STORAGE_BOUNDARY_UNAVAILABLE",
      }),
    );
    expect(assertApprovalAvailable).toThrow("POLICY_DENIED");
    expect(stored.approval_policy.revision).toBe(0);
    failSave = false;
    handler.handle(message, {}, response);
    await vi.waitFor(() =>
      expect(response.mock.calls.at(-1)?.[0].ok).toBe(true),
    );
    expect(assertApprovalAvailable).not.toThrow();
    expect(stored.approval_policy.revision).toBe(1);
  });
  it("recovers only closed approval history and rejects replay capabilities in the event", () => {
    const store = new TabChatSessionStore();
    const runId = "run-abcdefghijklmnop";
    store.bindRun(runId, 1, {
      document_epoch: "epoch-abcdefghijklmnop",
      page_scope_epoch: "scope-abcdefghijklmnop",
      origin: "https://fixture.test",
      path: "/",
    });
    const event = {
      type: "approval_decision" as const,
      category: "source_disclosure" as const,
      approval_source: "policy" as const,
      policy_revision: 2,
      outcome: "consumed" as const,
      reason: "SETTINGS_AUTO" as const,
    };
    store.append(runId, event);
    const saved = store.snapshot();
    expect(JSON.stringify(saved)).not.toMatch(
      /nonce|binding|grant|source_text|data_url/,
    );
    const restored = new TabChatSessionStore();
    restored.restore(saved);
    expect(restored.recoverable(1)).toEqual(
      expect.arrayContaining([expect.objectContaining(event)]),
    );
    expect(() =>
      store.append(runId, { ...event, nonce: "secret" } as never),
    ).toThrow("INVALID_ARGUMENT");
  });
});
