import type { CommittedEvent, Task } from "./contracts.js";
import { terminal } from "./contracts.js";
export class TaskHistory {
  private tasks = new Map<string, Task>();
  accept(events: CommittedEvent[]): void {
    for (const event of events) {
      if (
        event.taskId !== event.task.id ||
        event.sequence !== event.task.revision
      )
        throw new Error("EVENT_CONFLICT");
      const old = this.tasks.get(event.taskId);
      if (!old || old.revision < event.sequence)
        this.tasks.set(event.taskId, structuredClone(event.task));
    }
  }
  view(id: string) {
    const task = this.tasks.get(id);
    if (!task) return null;
    return {
      id,
      revision: task.revision,
      state: terminal(task)
        ? "TERMINAL"
        : task.phase === "waiting_user"
          ? "WAITING_USER"
          : task.phase === "accepted"
            ? "ACCEPTED"
            : "RUNNING",
      actionVerified: task.actionVerified,
      goal: task.goal,
      firstFailure: task.firstFailure,
    };
  }
}
