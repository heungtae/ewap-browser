import {
  taskHistoryCommandSchema,
  taskHistoryReplaySchema,
  type TaskHistoryReplay,
} from "@contextpilot/shared/bridge";
import type { TaskStore } from "./store.js";
import type { Session } from "../ipc/session.js";
import { resumeTaskHistory } from "./resume.js";
export interface HistoryPrincipal {
  installationId: string;
  profileId: string;
  extensionId: string;
}
// Trusted backend composition supplies ownership. The wire caller never supplies owner.
export class TaskHistoryService {
  constructor(
    private tasks: TaskStore,
    private owner: (
      principal: HistoryPrincipal,
      taskId: string,
    ) => string | null,
  ) {}
  read(session: Session, raw: unknown): TaskHistoryReplay {
    const command = taskHistoryCommandSchema.parse(raw);
    if (!session.extensionId) throw Error("TASK_HISTORY_UNAVAILABLE");
    const owner = this.owner(
      {
        installationId: session.pairing.installationId,
        profileId: session.pairing.profileId,
        extensionId: session.extensionId,
      },
      command.taskId,
    );
    if (
      !owner ||
      this.tasks.load(command.taskId, owner).admission.profileId !==
        session.pairing.profileId
    )
      throw Error("TASK_HISTORY_UNAVAILABLE");
    const result = resumeTaskHistory(
      this.tasks,
      command.taskId,
      owner,
      command.afterSequence,
    );
    const events = result.events.slice(0, 64).map((history) => ({
      sequence: history.revision,
      revision: history.revision,
      kind: "task_state" as const,
      history,
    }));
    const cursor = result.resync
      ? result.cursor
      : (events.at(-1)?.sequence ?? command.afterSequence);
    return taskHistoryReplaySchema.parse({
      schema: "wca.task-history/v1",
      taskId: command.taskId,
      streamId: command.taskId,
      events,
      cursor,
      resync: result.resync,
      hasMore: !result.resync && (cursor < result.cursor || result.hasMore),
      dispatchUnknown: result.dispatchUnknown,
      snapshot: result.snapshot
        ? {
            schema: "wca.task-history/v1",
            taskId: command.taskId,
            revision: result.cursor,
            history: result.snapshot,
            dispatchUnknown: result.dispatchUnknown,
          }
        : null,
    });
  }
}
