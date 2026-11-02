import type { TaskHistoryReplay } from "@contextpilot/shared/bridge";
import type { PresentationView } from "./view.js";
export function applyTaskHistory(
  batch: TaskHistoryReplay,
  cursor: number,
  expectedTask: string | undefined,
  view: PresentationView,
) {
  if (
    !expectedTask ||
    batch.taskId !== expectedTask ||
    !view.history ||
    batch.cursor < cursor
  )
    throw Error("HISTORY_BINDING");
  let next = cursor;
  if (batch.snapshot) next = batch.snapshot.revision;
  else
    for (const event of batch.events) {
      if (event.sequence !== next + 1) throw Error("HISTORY_GAP");
      next = event.sequence;
    }
  if (next !== batch.cursor) throw Error("HISTORY_GAP");
  if (batch.snapshot)
    view.history(batch.snapshot.history, batch.dispatchUnknown, true);
  else if (batch.events.length)
    for (const event of batch.events)
      view.history(event.history, batch.dispatchUnknown, false);
  else view.history(null, batch.dispatchUnknown, false);
  return next;
}
