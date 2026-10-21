import { createHash, randomUUID } from "node:crypto";
import {
  assertScope,
  executeSchema,
  statusSchema,
  type Grant,
  type Scope,
} from "../../../../packages/integration-adapters/src/contracts.js";
import type { Task } from "../../../../packages/task-engine/src/durable/contracts.js";
import type { TaskStore } from "../tasks/store.js";
import { transaction } from "../tasks/database.js";
const hash = (input: unknown) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");
export interface BoundTask {
  handle: string;
  task: Task;
  scope: Scope;
  controller: "jev" | "external";
}
export class McpTaskApi {
  constructor(
    readonly tasks: TaskStore,
    private ready: () => { controller: boolean; runtime: boolean },
    private now = Date.now,
  ) {
    tasks.db.exec(`CREATE TABLE IF NOT EXISTS mcp_handles (
      handle TEXT PRIMARY KEY, task_id TEXT UNIQUE NOT NULL, owner TEXT NOT NULL, scope TEXT NOT NULL, controller TEXT NOT NULL
    ); CREATE TABLE IF NOT EXISTS mcp_outbox (task_id TEXT PRIMARY KEY, body TEXT NOT NULL);`);
  }
  owner(grant: Grant): string {
    return `mcp_${hash([grant.clientId, grant.profileId])}`;
  }
  execute(grant: Grant, raw: unknown, controller: "jev" | "external") {
    const input = executeSchema.parse(raw);
    assertScope(grant, input, this.now());
    if (
      !this.ready().runtime ||
      (controller === "jev" && !this.ready().controller)
    )
      throw new Error("CONTROLLER_UNAVAILABLE");
    if (controller === "external" && !grant.externalController)
      throw new Error("MCP_EXTERNAL_DISABLED");
    const owner = this.owner(grant),
      requestId = `mcp_${hash([owner, input.requestId])}`;
    const digest = hash([input, controller]);
    const old = this.tasks.db
      .prepare("SELECT body FROM tasks WHERE request_id=?")
      .get(requestId);
    let task: Task;
    if (old) {
      task = JSON.parse(String(old.body)) as Task;
      if (task.admission.owner !== owner || task.admission.digest !== digest)
        throw new Error("REQUEST_ID_CONFLICT");
    } else {
      const count = this.tasks.db
        .prepare(
          "SELECT count(*) AS count FROM mcp_handles h JOIN tasks t ON h.task_id=t.id WHERE h.owner=? AND json_extract(t.body,'$.admission.deadline')>? AND json_extract(t.body,'$.phase') NOT IN ('completed','failed','cancelled')",
        )
        .get(owner, this.now());
      if (Number(count?.count) >= 32) throw new Error("MCP_TASK_LIMIT");
      task = this.tasks.admit({
        requestId,
        digest,
        owner,
        profileId: input.profileId,
        tabId: input.tabId,
        mode: input.mode,
        deadline: Math.min(this.now() + 180000, grant.expiresAt),
        activeLimit: 180000,
        attemptLimit: 64,
      });
    }
    const scope = {
      profileId: input.profileId,
      origin: input.origin,
      tabId: input.tabId,
      mode: input.mode,
    };
    const handle = transaction(this.tasks.db, () => {
      const existing = this.tasks.db
        .prepare("SELECT handle FROM mcp_handles WHERE task_id=? AND owner=?")
        .get(task.id, owner);
      if (existing) return String(existing.handle);
      const handle = randomUUID();
      this.tasks.db
        .prepare("INSERT INTO mcp_handles VALUES (?,?,?,?,?)")
        .run(handle, task.id, owner, JSON.stringify(scope), controller);
      // Retained work is independent of the MCP socket. Only the existing backend worker may drain it.
      this.tasks.db
        .prepare("INSERT INTO mcp_outbox VALUES (?,?)")
        .run(
          task.id,
          JSON.stringify({ objective: input.objective, controller, scope }),
        );
      return handle;
    });
    return this.status(grant, { taskHandle: handle });
  }
  bind(grant: Grant, raw: unknown): BoundTask {
    const { taskHandle } = statusSchema.parse(raw);
    const row = this.tasks.db
      .prepare("SELECT * FROM mcp_handles WHERE handle=? AND owner=?")
      .get(taskHandle, this.owner(grant));
    if (!row) throw new Error("MCP_TASK_UNAVAILABLE");
    const scope = JSON.parse(String(row.scope)) as Scope;
    assertScope(grant, scope, this.now());
    const task = this.tasks.load(String(row.task_id), this.owner(grant));
    if (this.now() >= task.admission.deadline) throw new Error("TASK_EXPIRED");
    return {
      handle: taskHandle,
      task,
      scope,
      controller: row.controller as BoundTask["controller"],
    };
  }
  status(grant: Grant, raw: unknown) {
    const bound = this.bind(grant, raw),
      task = bound.task;
    return {
      taskHandle: bound.handle,
      controller: bound.controller,
      revision: task.revision,
      phase: task.phase,
      pendingApprovalOrInput: task.phase === "waiting_user",
      actionVerified: task.actionVerified,
      goal: task.goal,
      firstFailure: task.firstFailure,
    };
  }
  cancel(grant: Grant, raw: unknown) {
    const bound = this.bind(grant, raw);
    this.tasks.cancel(bound.task.id, this.owner(grant));
    return this.status(grant, raw);
  }
}
