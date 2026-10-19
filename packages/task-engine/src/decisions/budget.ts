import { budgetSnapshotSchema } from "./schema.js";
export type BudgetLimits = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  activeMs: number;
  overallMs: number;
  callMs: number;
  outputReservation: number;
};
const defaults: BudgetLimits = {
  calls: 24,
  inputTokens: 48000,
  outputTokens: 4000,
  activeMs: 180000,
  overallMs: 600000,
  callMs: 10000,
  outputReservation: 1024,
};
export class DecisionBudget {
  public readonly limits: Readonly<BudgetLimits>;
  private calls = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private activeMs = 0;
  private pending = false;
  private readonly admittedAt: number;
  public constructor(
    limits: Partial<BudgetLimits> = {},
    private readonly now: () => number = Date.now,
  ) {
    this.limits = Object.freeze({ ...defaults, ...limits });
    for (const key of Object.keys(defaults) as (keyof BudgetLimits)[])
      if (
        !Number.isSafeInteger(this.limits[key]) ||
        this.limits[key] <= 0 ||
        this.limits[key] > defaults[key]
      )
        throw new Error("INVALID_BUDGET_LIMIT");
    this.admittedAt = now();
  }
  public snapshot() {
    return budgetSnapshotSchema.parse({
      version: "task-budget-v1",
      calls: this.calls,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      activeMs: this.activeMs,
      overallDeadline: this.admittedAt + this.limits.overallMs,
      responseByteLimit: Math.min(
        this.limits.outputReservation,
        Math.max(0, this.limits.outputTokens - this.outputTokens),
      ),
    });
  }
  public reserve(input: number) {
    const output = this.limits.outputReservation,
      startedAt = this.now();
    if (
      this.pending ||
      !Number.isSafeInteger(input) ||
      input < 1 ||
      this.calls >= this.limits.calls ||
      this.inputTokens + input > this.limits.inputTokens ||
      this.outputTokens + output > this.limits.outputTokens ||
      this.activeMs >= this.limits.activeMs ||
      startedAt >= this.admittedAt + this.limits.overallMs
    )
      throw new Error("CONTROLLER_BUDGET_EXHAUSTED");
    this.pending = true;
    this.calls++;
    this.inputTokens += input;
    this.outputTokens += output;
    let finished = false;
    return {
      timeoutMs: Math.min(
        this.limits.callMs,
        this.limits.activeMs - this.activeMs,
        this.admittedAt + this.limits.overallMs - startedAt,
      ),
      settle: (usage?: { input_tokens: number; output_tokens: number }) => {
        if (finished) throw new Error("DUPLICATE_SETTLEMENT");
        finished = true;
        this.pending = false;
        this.activeMs = Math.min(
          this.limits.activeMs,
          this.activeMs + Math.max(0, this.now() - startedAt),
        );
        if (usage) {
          if (
            !Number.isSafeInteger(usage.input_tokens) ||
            !Number.isSafeInteger(usage.output_tokens) ||
            usage.input_tokens < 0 ||
            usage.output_tokens < 0 ||
            usage.input_tokens > input ||
            usage.output_tokens > output
          )
            throw new Error("USAGE_EXCEEDS_RESERVATION");
          this.inputTokens -= input - usage.input_tokens;
          this.outputTokens -= output - usage.output_tokens;
        }
      },
    };
  }
}
