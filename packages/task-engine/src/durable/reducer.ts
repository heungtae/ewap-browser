import {
  assertLive,
  eventSchema,
  type Task,
  type TaskEvent,
} from "./contracts.js";
export function reduceTask(input: Task, raw: TaskEvent, now: number): Task {
  assertLive(input, now);
  const event = eventSchema.parse(raw);
  const task = structuredClone(input);
  const allowed: Record<TaskEvent["type"], Task["phase"][]> = {
    started: ["accepted"],
    prompt: ["running"],
    resumed: ["waiting_user", "suspended"],
    suspended: ["accepted", "running", "waiting_user"],
    completed: ["running"],
    failed: ["accepted", "running", "waiting_user", "suspended"],
    cancelled: ["accepted", "running", "waiting_user", "suspended"],
    action_verified: ["running"],
    goal_incomplete: ["running"],
  };
  if (!allowed[event.type].includes(task.phase))
    throw new Error("ILLEGAL_TRANSITION");
  if (event.type === "completed")
    throw new Error("GOAL_ACCEPTANCE_UNAVAILABLE");
  const phases = {
    started: "running",
    prompt: "waiting_user",
    resumed: "running",
    suspended: "suspended",
    failed: "failed",
    cancelled: "cancelled",
  } as const;
  if (event.type in phases)
    task.phase = phases[event.type as keyof typeof phases];
  if (event.type === "action_verified") task.actionVerified = true;
  if (event.type === "goal_incomplete") task.goal = "incomplete";
  if (event.type === "failed" || event.type === "goal_incomplete")
    task.firstFailure ??= event.code ?? event.correlationId;
  if (task.phase === "failed" || task.phase === "cancelled")
    task.terminalAt = now;
  task.revision++;
  return task;
}
export function account(task: Task, now: number, attempt: boolean): Task {
  assertLive(task, now);
  if (now < task.accountedAt) throw new Error("CLOCK_REGRESSION");
  const elapsed = task.phase === "running" ? now - task.accountedAt : 0;
  const next = {
    ...task,
    activeUsed: task.activeUsed + elapsed,
    attempts: task.attempts + Number(attempt),
    accountedAt: now,
  };
  if (
    next.activeUsed > task.admission.activeLimit ||
    next.attempts > task.admission.attemptLimit
  )
    throw new Error("BUDGET_EXHAUSTED");
  return next;
}
