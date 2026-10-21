import { reduceOrchestration } from "../../../../packages/task-engine/src/orchestration/reduce.js";
import { digest } from "../../../../packages/task-engine/src/decisions/digest.js";
import type {
  JournalEntry,
  Orchestration,
  OrchestrationStore,
} from "../../../../packages/task-engine/src/orchestration/index.js";
import type { TaskStore } from "./store.js";
import { transaction } from "./database.js";
export class SqliteOrchestrationStore implements OrchestrationStore {
  constructor(
    private tasks: TaskStore,
    private taskId: string,
    private owner: string,
    private leaseId: string,
    private generation: number,
    private now = Date.now,
  ) {
    tasks.db.exec(`
      CREATE TABLE IF NOT EXISTS orchestration_states (
        task_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS orchestration_events (
        task_id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL,
        PRIMARY KEY (task_id, revision)
      );
    `);
  }
  private fence(state: Orchestration): void {
    const task = this.tasks.load(this.taskId, this.owner);
    this.tasks.assertFence(task, this.leaseId, this.generation);
    if (
      state.context.taskId !== task.id ||
      state.context.mode !== task.admission.mode ||
      state.context.cancellationGeneration !== task.generation ||
      state.deadline > task.admission.deadline
    )
      throw new Error("ORCHESTRATION_BINDING_MISMATCH");
  }
  initialize(state: Orchestration): void {
    transaction(this.tasks.db, () => {
      this.fence(state);
      if (state.phase !== "admission") throw new Error("ADMISSION_REQUIRED");
      this.tasks.db
        .prepare("INSERT INTO orchestration_states VALUES (?,?,?)")
        .run(this.taskId, state.context.taskRevision, JSON.stringify(state));
    });
  }
  load(): Orchestration {
    const row = this.tasks.db
      .prepare("SELECT body FROM orchestration_states WHERE task_id=?")
      .get(this.taskId);
    if (!row) throw new Error("ORCHESTRATION_UNAVAILABLE");
    const state = JSON.parse(String(row.body)) as Orchestration;
    this.fence(state);
    return state;
  }
  async commit(entry: JournalEntry): Promise<void> {
    transaction(this.tasks.db, () => {
      this.fence(entry.state);
      const current = this.load();
      const reduced = reduceOrchestration(
        current,
        entry.transition,
        this.now(),
      );
      if (digest(reduced) !== digest(entry.state))
        throw new Error("JOURNAL_STATE_CONFLICT");
      if (entry.state.context.taskRevision !== entry.previousRevision + 1)
        throw new Error("REVISION_CONFLICT");
      this.tasks.db
        .prepare(
          "UPDATE orchestration_states SET revision=?,body=? WHERE task_id=? AND revision=?",
        )
        .run(
          entry.state.context.taskRevision,
          JSON.stringify(entry.state),
          this.taskId,
          entry.previousRevision,
        );
      if (
        Number(
          this.tasks.db.prepare("SELECT changes() AS count").get()?.count,
        ) !== 1
      )
        throw new Error("REVISION_CONFLICT");
      this.tasks.db
        .prepare("INSERT INTO orchestration_events VALUES (?,?,?)")
        .run(
          this.taskId,
          entry.state.context.taskRevision,
          JSON.stringify(entry),
        );
    });
  }
}
