import { z } from "zod";
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_.:-]+$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const admissionSchema = z.strictObject({
  requestId: id,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  owner: id,
  profileId: id,
  tabId: count,
  mode: z.enum(["ask", "act"]),
  deadline: count,
  activeLimit: count.positive(),
  attemptLimit: count.positive(),
});
export const phaseSchema = z.enum([
  "accepted",
  "running",
  "waiting_user",
  "suspended",
  "completed",
  "failed",
  "cancelled",
]);
export const eventSchema = z.strictObject({
  type: z.enum([
    "started",
    "prompt",
    "resumed",
    "suspended",
    "completed",
    "failed",
    "cancelled",
    "action_verified",
    "goal_incomplete",
  ]),
  correlationId: id,
  code: id.nullable(),
});
export type Admission = z.infer<typeof admissionSchema>;
export type TaskEvent = z.infer<typeof eventSchema>;
export interface Task {
  id: string;
  admission: Admission;
  revision: number;
  phase: z.infer<typeof phaseSchema>;
  epoch: number;
  generation: number;
  leaseId: string | null;
  leaseUntil: number;
  activeUsed: number;
  attempts: number;
  accountedAt: number;
  terminalAt: number | null;
  firstFailure: string | null;
  actionVerified: boolean;
  goal: "unknown" | "incomplete" | "verified";
}
export interface CommittedEvent {
  sequence: number;
  taskId: string;
  task: Task;
}
export const terminal = (task: Task): boolean =>
  ["completed", "failed", "cancelled"].includes(task.phase);
export function assertLive(task: Task, now: number): void {
  if (now >= task.admission.deadline) throw new Error("TASK_EXPIRED");
  if (terminal(task)) throw new Error("TASK_TERMINAL");
}
