import type { ChatEvent } from "../contracts/chat-events.js";

/** A stale tab or already-terminated run never changes the visible panel. */
export const shouldRenderChatEvent = (
  event: ChatEvent,
  activeTabId: number | undefined,
  terminalRuns: ReadonlySet<string>,
  stoppedRuns: ReadonlySet<string>,
  activeRunId?: string,
): boolean => {
  if (activeTabId !== undefined && event.tab_id !== activeTabId) return false;
  if (
    activeRunId !== undefined &&
    event.run_id !== activeRunId &&
    event.type !== "page_scope_changed"
  )
    return false;
  if (terminalRuns.has(event.run_id)) return false;
  if (stoppedRuns.has(event.run_id) && event.type !== "run_terminal")
    return false;
  return true;
};
