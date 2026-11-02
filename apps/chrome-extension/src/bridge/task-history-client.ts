import {
  taskHistoryCommandSchema,
  taskHistoryReplaySchema,
  type TaskClient,
} from "@contextpilot/shared/bridge";
export function createTaskHistoryClient(
  taskId: string,
  request: (command: unknown) => Promise<unknown>,
): TaskClient {
  taskHistoryCommandSchema.parse({
    kind: "task.history",
    taskId,
    afterSequence: 0,
  });
  return {
    taskId,
    async resume(afterSequence, streamId) {
      if (streamId !== undefined && streamId !== taskId)
        throw Error("TASK_HISTORY_BINDING");
      const command = taskHistoryCommandSchema.parse({
        kind: "task.history",
        taskId,
        afterSequence,
      });
      const parsed = taskHistoryReplaySchema.safeParse(await request(command));
      if (!parsed.success) throw Error("TASK_HISTORY_UNAVAILABLE");
      const result = parsed.data;
      if (
        result.taskId !== taskId ||
        result.cursor < afterSequence ||
        (!result.resync &&
          (result.events[0]?.sequence ?? result.cursor + 1) !==
            afterSequence + 1)
      )
        throw Error("TASK_HISTORY_BINDING");
      return result;
    },
  };
}
