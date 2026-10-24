import type { ChatEvent } from "../../../../extension/src/contracts/chat-events.js";
export function historyEvent(event: ChatEvent) {
  const base = {
    legacyType: event.type,
    legacyRunId: event.run_id,
    sequence: event.sequence,
  };
  switch (event.type) {
    case "user_message":
    case "assistant_delta":
      return { ...base, display: { text: event.text } };
    case "tool_started":
      return {
        ...base,
        display: {
          tool: event.tool,
          summary: event.summary,
          ...(event.target_name === undefined
            ? {}
            : { targetName: event.target_name }),
        },
      };
    case "tool_progress":
      return { ...base, display: { summary: event.summary } };
    case "tool_finished":
      return { ...base, display: { ...event.result } };
    case "run_terminal":
      return {
        ...base,
        display: {
          outcome: event.outcome,
          ...(event.code ? { code: event.code } : {}),
          ...(event.completion ? { completion: event.completion } : {}),
        },
      };
    case "run_started":
      return {
        ...base,
        display: {
          mode: event.mode,
          historicalPermissionMode: event.permission_mode,
        },
      };
    case "activity_started":
    case "activity_finished":
    case "activity_progress":
      return {
        ...base,
        display: {
          stage: event.stage,
          ...(event.type === "activity_progress" && event.completion
            ? { completion: event.completion }
            : {}),
        },
      };
    case "approval_decision":
      return {
        ...base,
        display: {
          category: event.category,
          historicalSource: event.approval_source,
          historicalOutcome: event.outcome,
          reason: event.reason,
        },
      };
    case "provider_activity":
      return {
        ...base,
        display: {
          role: event.provider_role,
          phase: event.phase,
          stage: event.stage,
          ...(event.code ? { code: event.code } : {}),
        },
      };
    case "learned_profile_status":
      return { ...base, display: { status: event.status } };
    case "page_scope_changed":
      return { ...base, display: { scopeChanged: true } };
    default:
      // Never retain proposed values, approval IDs/nonces, action objects,
      // capabilities or disclosure requests in the presentation projection.
      return { ...base, display: { historicalAuthorityOmitted: true } };
  }
}
