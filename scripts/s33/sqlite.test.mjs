import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore, SqliteOrchestrationStore } from "../../dist/s33/store.mjs";
import { admitOrchestration, advanceTask } from "../../dist/s33/engine.mjs";
test("S33 atomic journal, concurrent CAS, rollback and Stop fencing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "s33-"));
  const db = new DatabaseSync(join(dir, "tasks.sqlite"));
  const other = new DatabaseSync(join(dir, "tasks.sqlite"));
  try {
    const tasks = new TaskStore(db, () => 1);
    const remote = new TaskStore(other, () => 1);
    const task = tasks.admit({
      requestId: "request",
      digest: "a".repeat(64),
      owner: "owner",
      profileId: "profile",
      tabId: 1,
      mode: "act",
      deadline: 1000,
      activeLimit: 100,
      attemptLimit: 24,
    });
    const lease = tasks.claim(task.id, "owner", task.revision);
    const context = {
      taskId: task.id,
      taskRevision: 0,
      planRevision: 0,
      graphRevision: 1,
      evidenceRevision: 1,
      capabilityRevision: 1,
      cancellationGeneration: 0,
      mode: "act",
      scopeId: "scope",
    };
    const state = admitOrchestration(
      context,
      { enabled: true, configured: true, qualified: true },
      1000,
      1,
    );
    const a = new SqliteOrchestrationStore(
      tasks,
      task.id,
      "owner",
      lease.leaseId,
      0,
      () => 1,
    );
    const b = new SqliteOrchestrationStore(
      remote,
      task.id,
      "owner",
      lease.leaseId,
      0,
      () => 1,
    );
    a.initialize(state);
    assert.deepEqual(b.load(), state);
    const event = {
      expectedRevision: 0,
      next: "intent_classification",
      role: "runtime",
      evidenceRefs: [],
      progressDigest: "b".repeat(64),
    };
    db.exec(
      "CREATE TRIGGER fail_s33 BEFORE INSERT ON orchestration_events BEGIN SELECT RAISE(ABORT, 'INJECTED_QUOTA'); END;",
    );
    await assert.rejects(advanceTask(state, event, a, 1), /INJECTED_QUOTA/);
    assert.deepEqual(b.load(), state);
    db.exec("DROP TRIGGER fail_s33");
    const next = await advanceTask(state, event, a, 1);
    await assert.rejects(advanceTask(state, event, b, 1), /REVISION_CONFLICT/);
    assert.deepEqual(b.load(), next);
    await assert.rejects(
      a.commit({
        previousRevision: 1,
        transition: {
          ...event,
          expectedRevision: 1,
          next: "codebase_discovery",
          role: "jev",
        },
        state: {
          ...next,
          phase: "completed",
          outcome: "VERIFIED",
          context: { ...next.context, taskRevision: 2 },
        },
      }),
      /JOURNAL_STATE_CONFLICT/,
    );
    assert.deepEqual(b.load(), next);
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM orchestration_events").get().n,
      1,
    );
    remote.cancel(task.id, "owner");
    await assert.rejects(
      advanceTask(
        next,
        {
          ...event,
          expectedRevision: 1,
          next: "codebase_discovery",
          role: "jev",
        },
        a,
        1,
      ),
      /TASK_TERMINAL/,
    );
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM orchestration_events").get().n,
      1,
    );
  } finally {
    db.close();
    other.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
