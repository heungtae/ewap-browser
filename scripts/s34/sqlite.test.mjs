import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore, SqliteAnalysisBudget } from "../../dist/s34/fixtures.mjs";
test("S34 persistent two-call accounting, first failure, rollback and task/Stop fencing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "s34-"));
  const path = join(dir, "tasks.sqlite");
  const db = new DatabaseSync(path),
    other = new DatabaseSync(path);
  try {
    const tasks = new TaskStore(db, () => 1),
      remote = new TaskStore(other, () => 1);
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
    const a = new SqliteAnalysisBudget(
      tasks,
      task.id,
      "owner",
      lease.leaseId,
      0,
    );
    const b = new SqliteAnalysisBudget(
      remote,
      task.id,
      "owner",
      lease.leaseId,
      0,
    );
    await assert.rejects(a.reserve("foreign-task", 10), /ANALYSIS_BUDGET_TASK/);
    assert.equal((await a.reserve(task.id, 100)).calls, 1);
    await a.fail(task.id, "ANALYSIS_HTTP_429");
    db.exec(
      "CREATE TRIGGER fail_s34 BEFORE INSERT ON analysis_budgets BEGIN SELECT RAISE(ABORT, 'INJECTED_QUOTA'); END;",
    );
    await assert.rejects(a.reserve(task.id, 200), /INJECTED_QUOTA/);
    db.exec("DROP TRIGGER fail_s34");
    // A new adapter/connection cannot reset counters after reconnect/restart.
    assert.deepEqual(await b.reserve(task.id, 200), {
      taskId: task.id,
      calls: 2,
      bytes: 300,
      inputReserved: 48000,
      outputReserved: 8000,
      inputUsed: 0,
      outputUsed: 0,
      settled: 0,
      firstFailure: "ANALYSIS_HTTP_429",
    });
    await assert.rejects(a.reserve(task.id, 1), /ANALYSIS_BUDGET_EXHAUSTED/);
    assert.equal(
      (await b.fail(task.id, "ANALYSIS_TIMEOUT")).firstFailure,
      "ANALYSIS_HTTP_429",
    );
    const usage = await b.settle(task.id, {
      inputTokens: 100,
      outputTokens: 200,
    });
    assert.equal(usage.inputUsed, 100);
    assert.equal(usage.outputUsed, 200);
    assert.equal(usage.inputReserved, 48000);
    await assert.rejects(
      a.settle(task.id, { inputTokens: 24001, outputTokens: 1 }),
      /ANALYSIS_USAGE_LIMIT/,
    );
    tasks.cancel(task.id, "owner");
    await assert.rejects(b.reserve(task.id, 1), /TASK_TERMINAL/);
    const state = JSON.parse(
      String(
        db
          .prepare("SELECT body FROM analysis_budgets WHERE task_id=?")
          .get(task.id).body,
      ),
    );
    assert.equal(state.calls, 2);
  } finally {
    db.close();
    other.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
