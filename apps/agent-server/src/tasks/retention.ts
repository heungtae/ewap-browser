import {
  type Task,
  terminal,
} from "../../../../packages/task-engine/src/durable/index.js";
import { transaction } from "./database.js";
import { TaskStore } from "./store.js";
import { receiptUncertain } from "./receipt-status.js";
export const receiptRetentionMs = 30 * 24 * 60 * 60 * 1000;
export function pruneTerminalDetails(tasks: TaskStore, now: number): number {
  return transaction(tasks.db, () => {
    let count = 0;
    for (const row of tasks.db.prepare("SELECT body FROM tasks").all()) {
      const task = JSON.parse(String(row.body)) as Task;
      if (
        !terminal(task) ||
        task.terminalAt === null ||
        now <
          Math.max(
            task.terminalAt + receiptRetentionMs,
            task.admission.deadline,
          )
      )
        continue;
      // Retain the admission tombstone forever so lost ACKs/old IDs never reopen.
      for (const intent of tasks.db
        .prepare(
          "SELECT id,digest,step_id,receipt FROM dispatch_intents WHERE task_id=?",
        )
        .all(task.id)) {
        if (!receiptUncertain(intent))
          tasks.db
            .prepare("DELETE FROM dispatch_intents WHERE task_id=? AND id=?")
            .run(task.id, String(intent.id));
      }
      tasks.db
        .prepare("DELETE FROM task_events WHERE task_id=? AND sequence<?")
        .run(task.id, task.revision);
      count++;
    }
    return count;
  });
}
