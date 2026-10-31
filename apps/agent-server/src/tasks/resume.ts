import { TaskHistory } from "../../../../packages/task-engine/src/durable/presentation.js";
import type { Task } from "../../../../packages/task-engine/src/durable/contracts.js";
import { receiptUncertain } from "./receipt-status.js";
import type { TaskStore } from "./store.js";
import { transaction } from "./database.js";

function project(task: Task) {
  const history = new TaskHistory();
  history.accept([{ taskId: task.id, sequence: task.revision, task }]);
  const view = history.view(task.id)!;
  return {
    ...view,
    state: task.phase === "suspended" ? ("SUSPENDED" as const) : view.state,
    phase: task.phase,
  };
}

// Internal owner-bound recovery source. It grants no lease, prompt or dispatch authority.
export function resumeTaskHistory(
  tasks: TaskStore,
  taskId: string,
  owner: string,
  after: number,
) {
  if (!Number.isSafeInteger(after) || after < 0)
    throw new Error("INVALID_CURSOR");
  return transaction(tasks.db, () => {
    const current = tasks.load(taskId, owner);
    if (after > current.revision) throw new Error("INVALID_CURSOR");
    const intents = tasks.db
      .prepare(
        "SELECT id,digest,step_id,receipt FROM dispatch_intents WHERE task_id=?",
      )
      .all(taskId);
    // Older retention may have removed receipts; missing evidence cannot prove no effect.
    const dispatchUnknown =
      current.attempts > intents.length || intents.some(receiptUncertain);
    const rows = tasks.replay(taskId, owner, after);
    let cursor = after;
    for (const event of rows) {
      if (
        event.taskId !== taskId ||
        event.task.id !== taskId ||
        event.sequence !== event.task.revision
      )
        throw new Error("EVENT_CONFLICT");
      if (event.sequence !== cursor + 1) {
        return {
          resync: true as const,
          dispatchUnknown,
          cursor: current.revision,
          snapshot: project(current),
          events: [],
        };
      }
      cursor = event.sequence;
    }
    if (cursor < current.revision && rows.length < 1000) {
      return {
        resync: true as const,
        dispatchUnknown,
        cursor: current.revision,
        snapshot: project(current),
        events: [],
      };
    }
    return {
      resync: false as const,
      dispatchUnknown,
      cursor,
      snapshot: null,
      events: rows.map((event) => project(event.task)),
    };
  });
}
