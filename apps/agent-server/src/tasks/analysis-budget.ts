import { validateUsage } from "../../../../packages/analysis-engine/src/budget.js";
import type {
  BudgetStore,
  BudgetState,
} from "../../../../packages/analysis-engine/src/budget.js";
import { transaction } from "./database.js";
import type { TaskStore } from "./store.js";
export class SqliteAnalysisBudget implements BudgetStore {
  constructor(
    private tasks: TaskStore,
    private taskId: string,
    private owner: string,
    private leaseId: string,
    private generation: number,
  ) {
    tasks.db.exec(
      "CREATE TABLE IF NOT EXISTS analysis_budgets (task_id TEXT PRIMARY KEY, body TEXT NOT NULL)",
    );
  }
  private load(taskId: string, live: boolean): BudgetState {
    if (taskId !== this.taskId) throw new Error("ANALYSIS_BUDGET_TASK");
    const task = this.tasks.load(taskId, this.owner);
    if (live) this.tasks.assertFence(task, this.leaseId, this.generation);
    const row = this.tasks.db
      .prepare("SELECT body FROM analysis_budgets WHERE task_id=?")
      .get(taskId);
    return row
      ? (JSON.parse(String(row.body)) as BudgetState)
      : {
          taskId,
          calls: 0,
          bytes: 0,
          inputReserved: 0,
          outputReserved: 0,
          inputUsed: 0,
          outputUsed: 0,
          settled: 0,
          firstFailure: null,
        };
  }
  private save(state: BudgetState): void {
    this.tasks.db
      .prepare("INSERT OR REPLACE INTO analysis_budgets VALUES (?,?)")
      .run(state.taskId, JSON.stringify(state));
  }
  async reserve(taskId: string, bytes: number): Promise<BudgetState> {
    return transaction(this.tasks.db, () => {
      const state = this.load(taskId, true);
      if (
        !Number.isSafeInteger(bytes) ||
        bytes < 0 ||
        state.calls >= 2 ||
        state.bytes + bytes > 131072
      )
        throw new Error("ANALYSIS_BUDGET_EXHAUSTED");
      state.inputReserved += 24000;
      state.outputReserved += 4000;
      state.calls++;
      state.bytes += bytes;
      this.save(state);
      return state;
    });
  }
  async settle(
    taskId: string,
    usage: { inputTokens: number; outputTokens: number },
  ): Promise<BudgetState> {
    return transaction(this.tasks.db, () => {
      const state = this.load(taskId, false);
      validateUsage(usage);
      if (state.settled >= state.calls)
        throw new Error("ANALYSIS_USAGE_UNRESERVED");
      state.inputUsed += usage.inputTokens;
      state.outputUsed += usage.outputTokens;
      state.settled++;
      this.save(state);
      return state;
    });
  }
  async fail(taskId: string, code: string): Promise<BudgetState> {
    return transaction(this.tasks.db, () => {
      const state = this.load(taskId, false);
      if (!/^ANALYSIS_[A-Z0-9_]{1,128}$/.test(code))
        throw new Error("ANALYSIS_INVALID_ERROR");
      state.firstFailure ??= code;
      this.save(state);
      return state;
    });
  }
}
