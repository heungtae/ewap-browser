import { z } from "zod";
const revision = z.number().int().nonnegative().safe();
const taskId = z.string().uuid();
export const taskHistoryCommandSchema = z.strictObject({
  kind: z.literal("task.history"),
  taskId,
  afterSequence: revision,
});
// Safe committed facts only. No prompts, values, lease IDs, refs or policy grants.
export const taskHistoryStateSchema = z
  .strictObject({
    id: taskId,
    revision: revision.min(1),
    state: z.enum([
      "ACCEPTED",
      "RUNNING",
      "WAITING_USER",
      "SUSPENDED",
      "TERMINAL",
    ]),
    phase: z.enum([
      "accepted",
      "running",
      "waiting_user",
      "suspended",
      "completed",
      "failed",
      "cancelled",
    ]),
    actionVerified: z.boolean(),
    goal: z.enum(["unknown", "incomplete", "verified"]),
    firstFailure: z
      .string()
      .regex(/^[a-zA-Z0-9_.:-]{1,128}$/)
      .nullable(),
  })
  .refine(
    (s) =>
      s.state ===
      (s.phase === "accepted"
        ? "ACCEPTED"
        : s.phase === "running"
          ? "RUNNING"
          : s.phase === "waiting_user"
            ? "WAITING_USER"
            : s.phase === "suspended"
              ? "SUSPENDED"
              : "TERMINAL"),
    "HISTORY_STATE",
  );
export const taskHistoryEventSchema = z.strictObject({
  sequence: revision.min(1),
  revision: revision.min(1),
  kind: z.literal("task_state"),
  history: taskHistoryStateSchema,
  text: z.never().optional(),
  presentation: z.never().optional(),
});
export const taskHistorySnapshotSchema = z.strictObject({
  schema: z.literal("wca.task-history/v1"),
  taskId,
  revision: revision.min(1),
  history: taskHistoryStateSchema,
  dispatchUnknown: z.boolean(),
});
export const taskHistoryReplaySchema = z
  .strictObject({
    schema: z.literal("wca.task-history/v1"),
    taskId,
    streamId: taskId,
    events: z.array(taskHistoryEventSchema).max(64),
    cursor: revision,
    resync: z.boolean(),
    hasMore: z.boolean(),
    dispatchUnknown: z.boolean(),
    snapshot: taskHistorySnapshotSchema.nullable(),
  })
  .superRefine((r, ctx) => {
    const bad = () =>
      ctx.addIssue({ code: "custom", message: "HISTORY_BINDING" });
    if (
      r.taskId !== r.streamId ||
      r.resync !== (r.snapshot !== null) ||
      (r.hasMore && r.events.length === 0)
    )
      bad();
    if (
      r.snapshot &&
      (r.hasMore ||
        r.events.length ||
        r.snapshot.taskId !== r.taskId ||
        r.snapshot.revision !== r.cursor ||
        r.snapshot.history.id !== r.taskId ||
        r.snapshot.history.revision !== r.cursor ||
        r.snapshot.dispatchUnknown !== r.dispatchUnknown)
    )
      bad();
    let previous: number | undefined;
    for (const e of r.events) {
      if (
        e.history.id !== r.taskId ||
        e.sequence !== e.revision ||
        e.history.revision !== e.revision ||
        (previous !== undefined && e.sequence !== previous + 1)
      )
        bad();
      previous = e.sequence;
    }
    if (previous !== undefined && previous !== r.cursor) bad();
  });
export type TaskHistoryState = z.infer<typeof taskHistoryStateSchema>;
export type TaskHistoryReplay = z.infer<typeof taskHistoryReplaySchema>;
