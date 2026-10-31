import { reduceOrchestration } from "../../../../packages/task-engine/src/orchestration/reduce.js";
import { advanceTask } from "../../../../packages/task-engine/src/orchestration/advance-task.js";
import { admitOrchestration } from "../../../../packages/task-engine/src/orchestration/admission.js";
import { OrchestrationHistory } from "../../../../packages/task-engine/src/orchestration/presentation.js";
import { digest } from "../../../../packages/task-engine/src/decisions/digest.js";
import type { DecisionContext } from "../../../../packages/task-engine/src/decisions/schema.js";
import type {
  JournalEntry,
  Orchestration,
  OrchestrationStore,
  Transition,
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
    private readiness: () => {
      enabled: boolean;
      configured: boolean;
      qualified: boolean;
    },
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
  admit(
    input: Pick<
      DecisionContext,
      "scopeId" | "graphRevision" | "evidenceRevision" | "capabilityRevision"
    >,
  ): Orchestration {
    const task = this.tasks.load(this.taskId, this.owner);
    this.tasks.assertFence(task, this.leaseId, this.generation);
    const state = admitOrchestration(
      {
        ...input,
        taskId: task.id,
        taskRevision: 0,
        planRevision: 0,
        cancellationGeneration: task.generation,
        mode: task.admission.mode,
      },
      this.readiness(),
      task.admission.deadline,
      this.now(),
    );
    this.initialize(state);
    return state;
  }
  initialize(state: Orchestration): void {
    transaction(this.tasks.db, () => {
      this.fence(state);
      if (state.phase !== "admission") throw new Error("ADMISSION_REQUIRED");
      const initial = admitOrchestration(
        state.context,
        this.readiness(),
        state.deadline,
        this.now(),
      );
      if (state.context.taskRevision !== 0 || digest(initial) !== digest(state))
        throw new Error("ORCHESTRATION_INITIAL_STATE_INVALID");
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
  presentation() {
    return transaction(this.tasks.db, () => {
      const task = this.tasks.load(this.taskId, this.owner);
      const row = this.tasks.db
        .prepare("SELECT body FROM orchestration_states WHERE task_id=?")
        .get(this.taskId);
      if (!row) throw new Error("ORCHESTRATION_UNAVAILABLE");
      const state = JSON.parse(String(row.body)) as Orchestration;
      if (
        state.context.taskId !== task.id ||
        state.context.mode !== task.admission.mode
      )
        throw new Error("ORCHESTRATION_BINDING_MISMATCH");
      const history = new OrchestrationHistory();
      history.accept(state);
      return { task: history.view(task.id), durablePhase: task.phase };
    });
  }
  // Internal trusted callers supply the transition; persisted state is authoritative.
  async advance(event: Transition): Promise<Orchestration> {
    return advanceTask(this.load(), event, this, this.now());
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
