import { DatabaseSync } from "node:sqlite";
import { mkdirSync, lstatSync, chmodSync, openSync, closeSync } from "node:fs";
import { join } from "node:path";
import { TaskStore, DurableIntents } from "../../dist/s31/tasks.mjs";
// Explicit target-runtime factory; not wired to the legacy daemon or model routes.
export function openTaskStore(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const info = lstatSync(directory);
  if (
    !info.isDirectory() ||
    info.uid !== process.getuid?.() ||
    info.mode & 0o077
  )
    throw new Error("TASK_STORAGE_PRINCIPAL");
  const path = join(directory, "tasks-v1.sqlite");
  try {
    closeSync(openSync(path, "wx", 0o600));
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const file = lstatSync(path);
  if (!file.isFile() || file.uid !== process.getuid?.())
    throw new Error("TASK_STORAGE_PRINCIPAL");
  chmodSync(path, 0o600);
  const db = new DatabaseSync(path);
  try {
    const tasks = new TaskStore(db);
    return {
      tasks,
      intents: (owner) => new DurableIntents(tasks, owner),
      close: () => db.close(),
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
