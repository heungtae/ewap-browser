import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "./history-fixture.mjs";
import { Session, createTaskHistoryClient } from "../../dist/s28/history.mjs";
test("authenticated socket pages actual SQLite history and reconnects without duplicate revisions", async () => {
  const f = await fixture();
  try {
    f.append(1001);
    await f.start();
    let bridge = await f.peer(),
      client = createTaskHistoryClient(f.task.id, (command) =>
        bridge.request(command),
      );
    let cursor = 0,
      pages = 0;
    const seen = new Set();
    while (cursor < 1002) {
      const page = await client.resume(cursor, f.task.id);
      assert.equal(page.resync, false);
      assert.ok(page.events.length <= 64);
      assert.ok(Buffer.byteLength(JSON.stringify(page)) < 256 * 1024);
      for (const event of page.events) {
        assert.equal(seen.has(event.sequence), false);
        seen.add(event.sequence);
      }
      cursor = page.cursor;
      pages++;
      assert.equal(page.hasMore, cursor < 1002);
      if (pages === 2) {
        bridge.close();
        bridge = await f.peer();
        client = createTaskHistoryClient(f.task.id, (command) =>
          bridge.request(command),
        );
      }
    }
    assert.equal(seen.size, 1002);
    assert.equal(pages, 16);
    const empty = await client.resume(cursor);
    assert.equal(empty.events.length, 0);
    assert.equal(JSON.stringify(empty).includes("trusted_owner"), false);
  } finally {
    await f.close();
  }
});
test("pruned history returns a current safe snapshot after database reopen, preserving uncertain dispatch", async () => {
  const f = await fixture();
  try {
    f.append(4);
    f.tasks.cancel(f.task.id, "trusted_owner");
    f.db
      .prepare("INSERT INTO dispatch_intents VALUES (?,?,?,?,NULL)")
      .run("dispatch_unknown", f.task.id, "e".repeat(64), "step_unknown");
    f.db
      .prepare("DELETE FROM task_events WHERE task_id=? AND sequence<6")
      .run(f.task.id);
    f.restartStore();
    await f.start();
    const bridge = await f.peer(),
      client = createTaskHistoryClient(f.task.id, (command) =>
        bridge.request(command),
      );
    const page = await client.resume(2);
    assert.equal(page.resync, true);
    assert.equal(page.cursor, 6);
    assert.equal(page.snapshot.history.phase, "cancelled");
    assert.equal(page.dispatchUnknown, true);
    for (const secret of [
      "leaseId",
      "generation",
      "trusted_owner",
      "dispatch_unknown",
      "step_unknown",
    ])
      assert.equal(JSON.stringify(page).includes(secret), false);
  } finally {
    await f.close();
  }
});
test("checks actual authenticated extension/profile/owner before reading any requested task", async () => {
  const f = await fixture();
  try {
    const read = { kind: "task.history", taskId: f.task.id, afterSequence: 0 };
    for (const session of [
      new Session(f.serverPairing, 1, "c".repeat(32)),
      new Session(
        { ...f.serverPairing, profileId: randomUUID() },
        1,
        f.pairing.extensionId,
      ),
      new Session(
        { ...f.serverPairing, installationId: randomUUID() },
        1,
        f.pairing.extensionId,
      ),
      new Session(f.serverPairing, 1),
    ])
      assert.throws(
        () => f.endpoint.read(session, read),
        /TASK_HISTORY_UNAVAILABLE/,
      );
    assert.throws(
      () => f.endpoint.read(f.session, { ...read, taskId: randomUUID() }),
      /TASK_HISTORY_UNAVAILABLE/,
    );
    assert.throws(() =>
      f.endpoint.read(f.session, { ...read, owner: "trusted_owner" }),
    );
    await f.start();
    const denied = await f.peer("c".repeat(32));
    await assert.rejects(denied.request(read), /BACKEND_DISCONNECTED/);
    const allowed = await f.peer();
    assert.equal((await allowed.request(read)).events.length, 1);
  } finally {
    await f.close();
  }
});
test("legacy peers retain heartbeat and cannot silently acquire task-history capability", async () => {
  const f = await fixture();
  try {
    await f.start();
    const bridge = await f.peer(f.pairing.extensionId, false);
    assert.deepEqual(await bridge.request({ kind: "heartbeat" }), {
      kind: "heartbeat",
    });
    await assert.rejects(
      bridge.request({
        kind: "task.history",
        taskId: f.task.id,
        afterSequence: 0,
      }),
      /TASK_HISTORY_UNAVAILABLE/,
    );
    assert.equal(f.checks, 0);
  } finally {
    await f.close();
  }
});
