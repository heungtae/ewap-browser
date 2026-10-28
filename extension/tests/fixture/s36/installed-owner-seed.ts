import { historySource } from "../../unit/migration/s36/mg04-support.js";
import { diagnosticsSource } from "../../unit/migration/s36/mg06-support.js";
// Synthetic input supplied explicitly by the qualification fixture, not recovered user data.
export function controlledSessionSource() {
  const history = historySource();
  history.chat_session_v1.session_id = "fixture-session-0000000000000001";
  for (const thread of history.chat_session_v1.threads) {
    thread.thread_id = "fixture-thread-00000000000000001";
    for (const event of thread.events) {
      event.session_id = history.chat_session_v1.session_id;
      event.thread_id = thread.thread_id;
    }
  }
  return {
    ...history,
    ...diagnosticsSource(),
    execution_requests_v1: [
      {
        request_id: "20000000-0000-4000-8000-000000000001",
        revision: 1,
        state: "TERMINAL",
        stage: "TERMINAL",
        tab_id: 4,
        owner: "old-owner",
        started_at_ms: 0,
        stage_started_at_ms: 0,
        last_progress_at_ms: 0,
        outcome: "VERIFIED",
      },
    ],
  };
}
