export interface BudgetState {
  taskId: string;
  calls: number;
  bytes: number;
  inputReserved: number;
  outputReserved: number;
  inputUsed: number;
  outputUsed: number;
  settled: number;
  firstFailure: string | null;
}
export interface BudgetStore {
  // Atomically reserve against persistent task-scoped counters; must survive retries/reconnects.
  reserve(taskId: string, bytes: number): Promise<BudgetState>;
  settle(
    taskId: string,
    usage: { inputTokens: number; outputTokens: number },
  ): Promise<BudgetState>;
  fail(taskId: string, code: string): Promise<BudgetState>;
}
export class MemoryAnalysisBudget implements BudgetStore {
  private state: BudgetState;
  constructor(taskId: string) {
    this.state = {
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
  async reserve(taskId: string, bytes: number) {
    if (taskId !== this.state.taskId) throw new Error("ANALYSIS_BUDGET_TASK");
    if (
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      this.state.calls >= 2 ||
      this.state.bytes + bytes > 131072
    )
      throw new Error("ANALYSIS_BUDGET_EXHAUSTED");
    this.state.inputReserved += 24000;
    this.state.outputReserved += 4000;
    this.state.calls++;
    this.state.bytes += bytes;
    return structuredClone(this.state);
  }
  async settle(
    taskId: string,
    usage: { inputTokens: number; outputTokens: number },
  ) {
    if (taskId !== this.state.taskId) throw new Error("ANALYSIS_BUDGET_TASK");
    validateUsage(usage);
    if (this.state.settled >= this.state.calls)
      throw new Error("ANALYSIS_USAGE_UNRESERVED");
    this.state.inputUsed += usage.inputTokens;
    this.state.outputUsed += usage.outputTokens;
    this.state.settled++;
    return structuredClone(this.state);
  }
  async fail(taskId: string, code: string) {
    if (taskId !== this.state.taskId) throw new Error("ANALYSIS_BUDGET_TASK");
    this.state.firstFailure ??= code;
    return structuredClone(this.state);
  }
}

export function validateUsage(usage: {
  inputTokens: number;
  outputTokens: number;
}): void {
  if (
    !Number.isSafeInteger(usage.inputTokens) ||
    usage.inputTokens < 0 ||
    usage.inputTokens > 24000 ||
    !Number.isSafeInteger(usage.outputTokens) ||
    usage.outputTokens < 0 ||
    usage.outputTokens > 4000
  )
    throw new Error("ANALYSIS_USAGE_LIMIT");
}
