import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { access, readFile, writeFile } from "node:fs/promises";
import {
  TaskStore,
  TaskHistoryService,
  listenLocal,
  stopLocal,
} from "../../dist/s28/history.mjs";
const [path, report] = process.argv.slice(2),
  config = JSON.parse(await readFile(path, "utf8"));
const db = new DatabaseSync(`${path}.tasks.sqlite`),
  tasks = new TaskStore(db);
const owner = "fixture_owned_reader";
let task;
const old = db
  .prepare("SELECT id FROM tasks WHERE request_id=?")
  .get("chrome_history_fixture");
if (old) task = tasks.load(old.id, owner);
else {
  task = tasks.admit({
    requestId: "chrome_history_fixture",
    digest: "a".repeat(64),
    owner,
    profileId: config.profileId,
    tabId: 1,
    mode: "act",
    deadline: Date.now() + 600000,
    activeLimit: 300000,
    attemptLimit: 64,
  });
  task = tasks.claim(task.id, owner, task.revision);
  for (const type of ["started", "prompt", "suspended"])
    task = tasks.advance(
      task.id,
      owner,
      task.revision,
      task.leaseId,
      task.generation,
      { type, correlationId: "fixture_history", code: null },
    );
}
const history = new TaskHistoryService(tasks, (principal, taskId) =>
  principal.installationId === config.installationId &&
  principal.profileId === config.profileId &&
  config.extensionIds.includes(principal.extensionId) &&
  taskId === task.id
    ? owner
    : null,
);
const reader = {
  read(session, raw) {
    const result = history.read(session, raw);
    writeFileSync(
      report + ".read",
      JSON.stringify({
        connectionId: session.connectionId,
        afterSequence: raw.afterSequence,
        cursor: result.cursor,
        resync: result.resync,
      }),
      { mode: 0o600 },
    );
    return result;
  },
};
const server = await listenLocal(
  config.socketPath,
  config,
  undefined,
  undefined,
  undefined,
  reader,
);
const status = (state) =>
  writeFile(
    report,
    JSON.stringify({ state, taskId: task.id, revision: task.revision }),
  );
await status("READY");
const exists = (path) =>
  access(path).then(
    () => true,
    () => false,
  );
let pruned = false,
  cancelled = false,
  busy = false;
const timer = setInterval(() => {
  if (busy) return;
  busy = true;
  void (async () => {
    if (!pruned && (await exists(report + ".prune"))) {
      db.prepare("DELETE FROM task_events WHERE task_id=? AND sequence<?").run(
        task.id,
        task.revision,
      );
      pruned = true;
      await status("PRUNED");
    }
    if (!cancelled && (await exists(report + ".cancel"))) {
      task = tasks.cancel(task.id, owner);
      db.prepare(
        "INSERT OR IGNORE INTO dispatch_intents VALUES (?,?,?,?,NULL)",
      ).run("dispatch_unknown", task.id, "b".repeat(64), "step_unknown");
      cancelled = true;
      await status("CANCELLED");
    }
  })().finally(() => {
    busy = false;
  });
}, 25);
process.once("SIGTERM", () => {
  clearInterval(timer);
  void stopLocal(server).then(() => {
    db.close();
    process.exit(0);
  });
});
