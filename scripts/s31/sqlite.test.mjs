import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TaskStore,
  DurableIntents,
  pruneTerminalDetails,
  receiptRetentionMs,
} from "../../dist/s31/tasks.mjs";
import { TaskHistory } from "../../dist/s31/engine.mjs";
function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), "s31-"));
  let now = Date.now();
  const path = join(dir, "tasks.sqlite");
  const db = new DatabaseSync(path);
  const other = new DatabaseSync(path);
  const a = new TaskStore(db, () => now),
    b = new TaskStore(other, () => now);
  const admission = {
    requestId: "request",
    digest: "a".repeat(64),
    owner: "owner",
    profileId: "profile",
    tabId: 1,
    mode: "act",
    deadline: now + 60000,
    activeLimit: 30000,
    attemptLimit: 3,
  };
  try {
    run({
      a,
      b,
      db,
      other,
      admission,
      tick: (n) => (now += n),
      now: () => now,
    });
  } finally {
    db.close();
    other.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
const event = (type, code = null) => ({
  type,
  code,
  correlationId: "correlation",
});
function advance(a, task, type, attempt = false, code = null) {
  return a.advance(
    task.id,
    "owner",
    task.revision,
    task.leaseId,
    task.generation,
    event(type, code),
    attempt,
  );
}
test("R01 durable lost ACK, digest/owner conflict, task/tab CAS and rollback", () =>
  fixture(({ a, b, db, admission }) => {
    const task = a.admit(admission);
    assert.deepEqual(b.admit(admission), task);
    assert.throws(
      () => b.admit({ ...admission, digest: "b".repeat(64) }),
      /REQUEST_ID_CONFLICT/,
    );
    assert.throws(
      () => b.admit({ ...admission, owner: "intruder" }),
      /REQUEST_ID_CONFLICT/,
    );
    const lease = a.claim(task.id, "owner", task.revision);
    assert.throws(
      () => b.claim(task.id, "owner", task.revision),
      /REVISION_CONFLICT/,
    );
    const second = b.admit({ ...admission, requestId: "second" });
    assert.throws(
      () => b.claim(second.id, "owner", second.revision),
      /TAB_LEASE_BUSY/,
    );
    db.exec(
      "CREATE TRIGGER fail_event BEFORE INSERT ON task_events BEGIN SELECT RAISE(ABORT, 'INJECTED_QUOTA'); END;",
    );
    assert.throws(() => advance(a, lease, "started"), /INJECTED_QUOTA/);
    assert.deepEqual(b.load(task.id, "owner"), lease);
    db.exec("DROP TRIGGER fail_event");
    assert.equal(advance(a, lease, "started").phase, "running");
  }));
test("R03 restart invalidates lease/epoch and cannot reset consumed budgets", () =>
  fixture(({ a, b, admission, tick }) => {
    let task = a.admit(admission);
    task = a.claim(task.id, "owner", 1, 1000);
    task = advance(a, task, "started", true);
    tick(1001);
    const recovered = b.claim(task.id, "owner", task.revision);
    assert.equal(recovered.phase, "suspended");
    assert.equal(recovered.epoch, task.epoch + 1);
    assert.equal(recovered.attempts, 1);
    assert.equal(recovered.activeUsed, 1001);
    assert.throws(() => advance(a, task, "prompt"), /LEASE_STALE/);
    assert.equal(advance(b, recovered, "resumed").phase, "running");
  }));
test("R04 cancel is durable, idempotent and revokes all writers", () =>
  fixture(({ a, b, admission }) => {
    let task = a.admit(admission);
    task = a.claim(task.id, "owner", 1);
    task = advance(a, task, "started");
    const cancelled = b.cancel(task.id, "owner");
    assert.deepEqual(a.cancel(task.id, "owner"), cancelled);
    assert.throws(() => advance(a, task, "prompt"), /TASK_TERMINAL/);
    assert.throws(() => a.load(task.id, "other"), /TASK_OWNER/);
  }));
test("R05 active/wait/overall budgets and terminal retention never reopen IDs", () =>
  fixture(({ a, b, admission, tick, now }) => {
    let task = a.admit({ ...admission, activeLimit: 10 });
    task = a.claim(task.id, "owner", 1);
    task = advance(a, task, "started", true);
    tick(5);
    task = advance(a, task, "prompt");
    tick(1000);
    task = advance(a, task, "resumed");
    assert.equal(task.activeUsed, 5);
    tick(6);
    assert.throws(() => advance(a, task, "prompt"), /BUDGET_EXHAUSTED/);
    task = b.cancel(task.id, "owner");
    tick(receiptRetentionMs + 60000);
    pruneTerminalDetails(a, now());
    assert.equal(a.replay(task.id, "owner").length, 1);
    assert.throws(
      () => a.claim(task.id, "owner", task.revision),
      /TASK_EXPIRED/,
    );
    assert.throws(() => a.admit(admission), /TASK_EXPIRED/);
  }));
test("R06 reordered duplicate history preserves verified action and first failure", () =>
  fixture(({ a, admission }) => {
    let task = a.admit(admission);
    task = a.claim(task.id, "owner", 1);
    task = advance(a, task, "started");
    task = advance(a, task, "action_verified");
    task = advance(a, task, "goal_incomplete", false, "FIRST_FAILURE");
    task = advance(a, task, "failed", false, "LATER_FAILURE");
    const events = a.replay(task.id, "owner");
    const history = new TaskHistory();
    history.accept([...events].reverse());
    history.accept(events);
    history.accept(events);
    assert.deepEqual(history.view(task.id), {
      id: task.id,
      revision: task.revision,
      state: "TERMINAL",
      actionVerified: true,
      goal: "incomplete",
      firstFailure: "FIRST_FAILURE",
    });
  }));
test("R02 intent/receipt survive separate connections and cannot conflict", () =>
  fixture(({ a, b, db, admission }) => {
    const task = a.admit(admission);
    // Inject the post-intent/pre-browser crash window directly in the SQLite journal.
    db.prepare("INSERT INTO dispatch_intents VALUES (?,?,?,?,NULL)").run(
      "dispatch_call",
      task.id,
      "c".repeat(64),
      "step",
    );
    const intents = new DurableIntents(b, "owner");
    assert.deepEqual(intents.reconcile(task.id), [
      { dispatchId: "dispatch_call", receipt: null, replayAllowed: false },
    ]);
    const receipt = {
      schema: "wca.tool/v1",
      kind: "receipt",
      toolCallId: "call",
      tool: "web.fill",
      stepId: "step",
      preparedDigest: "c".repeat(64),
      dispatchId: "dispatch_call",
      dispatch: "unknown",
      commands: 1,
      verification: "unknown",
      evidenceDigest: null,
      error: "PARTIAL_DISPATCH",
      noOp: false,
      goalVerified: false,
    };
    intents.settle(task.id, receipt);
    intents.settle(task.id, receipt);
    assert.equal(
      new DurableIntents(a, "owner").reconcile(task.id)[0].receipt.commands,
      1,
    );
    assert.throws(
      () => intents.settle(task.id, { ...receipt, commands: 2 }),
      /RECEIPT_CONFLICT/,
    );
  }));
test("R02 actual ToolRuntime commits SQLite intent before IDB/effect and syncs lost receipt ACK", async () => {
  const { runtimeFixture, IDBFactory, ReceiptSyncJournal } = await import(
    "../../dist/s31/fixture.mjs"
  );
  const dir = mkdtempSync(join(tmpdir(), "s31-composed-"));
  const db = new DatabaseSync(join(dir, "tasks.sqlite"));
  let f;
  try {
    const tasks = new TaskStore(db);
    const now = Date.now();
    let task = tasks.admit({
      requestId: "composed",
      digest: "d".repeat(64),
      owner: "owner",
      profileId: "profile",
      tabId: 1,
      mode: "act",
      deadline: now + 60000,
      activeLimit: 30000,
      attemptLimit: 3,
    });
    task = tasks.claim(task.id, "owner", task.revision);
    task = advance(tasks, task, "started");
    f = await runtimeFixture(new IDBFactory());
    Object.assign(f.context, {
      taskId: task.id,
      runtimeEpoch: task.epoch,
      leaseId: task.leaseId,
      leaseExpiresAt: task.leaseUntil,
      deadline: task.admission.deadline,
    });
    f.context.capabilityDigest = (
      await f.registry.snapshot(f.context, f.capabilities)
    ).digest;
    f.adapter.context = structuredClone(f.context);
    const argument = f.sources.admit(f.principal, "requested");
    const intents = new DurableIntents(tasks, "owner");
    f.ports.intent = intents;
    f.ports.journal = new ReceiptSyncJournal(f.journal, async (receipt) => {
      intents.settle(task.id, receipt);
      throw new Error("RECEIPT_ACK_LOST");
    });
    const original = f.adapter.dispatch;
    f.adapter.dispatch = async (...args) => {
      assert.equal(intents.reconcile(task.id).length, 1);
      assert.equal(intents.reconcile(task.id)[0].receipt, null);
      return original(...args);
    };
    const prepared = await f.runtime.prepare("web.fill", {
      action: f.target,
      argument,
    });
    const approval = await f.runtime.requestApproval(prepared.step.id);
    assert.equal(approval.kind, "approved");
    await assert.rejects(
      f.runtime.execute(prepared.step.id, approval.receipt.id),
      /RECEIPT_ACK_LOST/,
    );
    assert.equal(f.state.dispatches, 1);
    assert.equal(intents.reconcile(task.id)[0].receipt.verification, "passed");
    assert.equal(tasks.load(task.id, "owner").attempts, 1);
    await intents.record(prepared.step);
    assert.equal(tasks.load(task.id, "owner").attempts, 1);
    await assert.rejects(
      intents.record({ ...prepared.step, digest: "0".repeat(64) }),
      /PREPARED_DIGEST/,
    );
    tasks.cancel(task.id, "owner");
    await assert.rejects(intents.record(prepared.step), /TASK_TERMINAL/);
  } finally {
    f?.db.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("R01 abrupt backend process exit preserves admission before any ACK", async () => {
  const { spawnSync } = await import("node:child_process");
  const { pathToFileURL } = await import("node:url");
  const { resolve } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "s31-crash-"));
  const path = join(dir, "tasks.sqlite");
  const admission = {
    requestId: "crashed",
    digest: "a".repeat(64),
    owner: "owner",
    profileId: "profile",
    tabId: 1,
    mode: "act",
    deadline: Date.now() + 60000,
    activeLimit: 30000,
    attemptLimit: 3,
  };
  try {
    const code = `import {DatabaseSync} from 'node:sqlite'; import {TaskStore} from ${JSON.stringify(pathToFileURL(resolve("dist/s31/tasks.mjs")).href)}; new TaskStore(new DatabaseSync(${JSON.stringify(path)})).admit(${JSON.stringify(admission)}); process.exit(9);`;
    const child = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", code],
      { encoding: "utf8", timeout: 10000 },
    );
    assert.equal(child.status, 9, child.stderr);
    const db = new DatabaseSync(path);
    try {
      const tasks = new TaskStore(db);
      const task = tasks.admit(admission);
      assert.equal(tasks.replay(task.id, "owner").length, 1);
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
