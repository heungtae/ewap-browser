import { randomUUID } from "node:crypto";
import {
  admissionSchema,
  assertLive,
  account,
  reduceTask,
  terminal,
  type Admission,
  type Task,
  type TaskEvent,
} from "../../../../packages/task-engine/src/durable/index.js";
import { initialize, transaction, type Sqlite } from "./database.js";
export class TaskStore {
  constructor(
    readonly db: Sqlite,
    private now = Date.now,
  ) {
    initialize(db);
  }
  load(id: string, owner: string): Task {
    const row = this.db.prepare("SELECT body FROM tasks WHERE id=?").get(id);
    if (!row) throw new Error("TASK_UNAVAILABLE");
    const task = JSON.parse(String(row.body)) as Task;
    if (task.admission.owner !== owner) throw new Error("TASK_OWNER");
    return task;
  }
  save(task: Task): void {
    const body = JSON.stringify(task);
    this.db.prepare("UPDATE tasks SET body=? WHERE id=?").run(body, task.id);
    this.db
      .prepare("INSERT INTO task_events VALUES (?,?,?)")
      .run(task.id, task.revision, body);
  }
  admit(raw: Admission): Task {
    const admission = admissionSchema.parse(raw);
    if (admission.deadline <= this.now()) throw new Error("TASK_EXPIRED");
    return transaction(this.db, () => {
      const old = this.db
        .prepare("SELECT body FROM tasks WHERE request_id=?")
        .get(admission.requestId);
      if (old) {
        const task = JSON.parse(String(old.body)) as Task;
        if (JSON.stringify(task.admission) !== JSON.stringify(admission))
          throw new Error("REQUEST_ID_CONFLICT");
        return task;
      }
      const task: Task = {
        id: randomUUID(),
        admission,
        revision: 1,
        phase: "accepted",
        epoch: 0,
        generation: 0,
        leaseId: null,
        leaseUntil: 0,
        activeUsed: 0,
        attempts: 0,
        accountedAt: this.now(),
        terminalAt: null,
        firstFailure: null,
        actionVerified: false,
        goal: "unknown",
      };
      this.db
        .prepare("INSERT INTO tasks VALUES (?,?,?)")
        .run(task.id, admission.requestId, JSON.stringify(task));
      this.db
        .prepare("INSERT INTO task_events VALUES (?,?,?)")
        .run(task.id, 1, JSON.stringify(task));
      return task;
    });
  }
  claim(id: string, owner: string, revision: number, ttl = 10000): Task {
    return transaction(this.db, () => {
      const task = this.load(id, owner);
      const now = this.now();
      assertLive(task, now);
      if (task.revision !== revision) throw new Error("REVISION_CONFLICT");
      if (!Number.isSafeInteger(ttl) || ttl <= 0 || ttl > 30000)
        throw new Error("LEASE_TTL");
      const scope = JSON.stringify([
        task.admission.profileId,
        task.admission.tabId,
      ]);
      const lease = this.db
        .prepare("SELECT * FROM leases WHERE scope=?")
        .get(scope);
      if (lease && Number(lease.until_ms) > now)
        throw new Error("TAB_LEASE_BUSY");
      // Every reclaim rotates the epoch. Old prepared targets/prompts cannot survive.
      const next = account(task, now, false);
      next.epoch++;
      next.revision++;
      next.leaseId = randomUUID();
      next.leaseUntil = Math.min(now + ttl, task.admission.deadline);
      if (task.epoch > 0) next.phase = "suspended";
      this.db
        .prepare("INSERT OR REPLACE INTO leases VALUES (?,?,?,?)")
        .run(scope, id, next.leaseId, next.leaseUntil);
      this.save(next);
      return next;
    });
  }
  assertFence(task: Task, leaseId: string, generation: number): void {
    assertLive(task, this.now());
    if (
      task.leaseId !== leaseId ||
      task.generation !== generation ||
      task.leaseUntil <= this.now()
    )
      throw new Error("LEASE_STALE");
    const scope = JSON.stringify([
      task.admission.profileId,
      task.admission.tabId,
    ]);
    const lease = this.db
      .prepare("SELECT * FROM leases WHERE scope=?")
      .get(scope);
    if (!lease || lease.lease_id !== leaseId || lease.task_id !== task.id)
      throw new Error("TAB_FENCED");
  }
  advance(
    id: string,
    owner: string,
    revision: number,
    leaseId: string,
    generation: number,
    event: TaskEvent,
    attempt = false,
  ): Task {
    return transaction(this.db, () => {
      const task = this.load(id, owner);
      this.assertFence(task, leaseId, generation);
      if (task.revision !== revision) throw new Error("REVISION_CONFLICT");
      const next = reduceTask(
        account(task, this.now(), attempt),
        event,
        this.now(),
      );
      this.save(next);
      return next;
    });
  }
  cancel(id: string, owner: string): Task {
    return transaction(this.db, () => {
      const task = this.load(id, owner);
      if (terminal(task)) return task;
      task.generation++;
      task.epoch++;
      task.revision++;
      task.phase = "cancelled";
      task.terminalAt = this.now();
      task.leaseUntil = 0;
      this.db.prepare("DELETE FROM leases WHERE task_id=?").run(id);
      this.save(task);
      return task;
    });
  }
  replay(id: string, owner: string, after = 0) {
    this.load(id, owner);
    return this.db
      .prepare(
        "SELECT sequence,body FROM task_events WHERE task_id=? AND sequence>? ORDER BY sequence LIMIT 1000",
      )
      .all(id, after)
      .map((row) => ({
        taskId: id,
        sequence: Number(row.sequence),
        task: JSON.parse(String(row.body)) as Task,
      }));
  }
}
