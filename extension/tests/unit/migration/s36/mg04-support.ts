import { TabChatSessionStore } from "../../../../src/state/tab-chat-session-store.js";
export function historySource() {
  const store = new TabChatSessionStore();
  const scope = {
    document_epoch: "document-old",
    page_scope_epoch: "scope-old",
    origin: "https://example.test",
    path: "/saved",
  };
  const run = "legacy-run-000000001";
  store.bindRun(run, 7, scope);
  store.append(run, {
    type: "run_started",
    mode: "act",
    permission_mode: "full",
  });
  store.append(run, { type: "user_message", text: "Original question" });
  store.append(run, { type: "assistant_delta", text: "Original answer" });
  store.append(run, {
    type: "approval_decision",
    category: "action_execution",
    approval_source: "user",
    policy_revision: 3,
    outcome: "consumed",
    reason: "USER_APPROVED",
  });
  store.append(run, {
    type: "tool_finished",
    tool_use_id: "legacy-tool-000000001",
    result: { outcome: "VERIFIED", summary: "Input verified" },
  });
  store.append(run, {
    type: "run_terminal",
    outcome: "UNKNOWN",
    completion: {
      action_outcome: "VERIFIED",
      goal_status: "unknown",
      reason: "GOAL_UNCONFIRMED",
      reassessments: 1,
    },
  });
  return { chat_session_v1: store.snapshot() };
}
