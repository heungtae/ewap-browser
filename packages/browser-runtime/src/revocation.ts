import {
  completed,
  key,
  request,
  type Stored,
} from "@contextpilot/codebase-repository";
import type {
  BrowserPort,
  PreparedStep,
  ToolContext,
} from "@contextpilot/tool-registry";
export class BrowserRevocations {
  private blocked = new Set<string>();
  private ready = false;
  constructor(
    private db: IDBDatabase,
    private partitionId: string,
  ) {}
  async restore(): Promise<void> {
    const tx = this.db.transaction("migrationJournal", "readonly");
    const done = completed(tx);
    const rows = (await request(
      tx
        .objectStore("migrationJournal")
        .index("partitionId")
        .getAll(this.partitionId),
    )) as Stored[];
    for (const row of rows)
      if (row.kind === "task_revocation") this.blocked.add(row.parentId);
    await done;
    this.ready = true;
  }
  // Synchronous memory revocation precedes the first await or connection access.
  async stop(taskId: string): Promise<void> {
    this.blocked.add(taskId);
    const tx = this.db.transaction("migrationJournal", "readwrite");
    const done = completed(tx);
    tx.objectStore("migrationJournal").put({
      key: key(this.partitionId, "stop", taskId),
      partitionId: this.partitionId,
      pageKey: "",
      kind: "task_revocation",
      parentId: taskId,
      name: "",
      status: "pending",
      source: "runtime",
      time: Date.now(),
      bytes: 0,
      pinUntil: Number.MAX_SAFE_INTEGER,
      expiresAt: Number.MAX_SAFE_INTEGER,
      value: null,
    } satisfies Stored);
    await done;
  }
  assert(context: ToolContext): void {
    if (!this.ready) throw new Error("RECOVERY_REQUIRED");
    if (
      context.partitionId !== this.partitionId ||
      this.blocked.has(context.taskId)
    )
      throw new Error("TASK_REVOKED");
  }
  async acknowledge(taskId: string): Promise<void> {
    if (!this.blocked.has(taskId)) throw new Error("CANCEL_UNAVAILABLE");
    const tx = this.db.transaction("migrationJournal", "readwrite");
    const done = completed(tx);
    const store = tx.objectStore("migrationJournal");
    const row = (await request(
      store.get(key(this.partitionId, "stop", taskId)),
    )) as Stored | undefined;
    if (!row) {
      await done;
      throw new Error("CANCEL_UNAVAILABLE");
    }
    store.put({ ...row, status: "acknowledged" });
    await done;
  }
  async pending(): Promise<string[]> {
    const tx = this.db.transaction("migrationJournal", "readonly");
    const done = completed(tx);
    const rows = (await request(
      tx
        .objectStore("migrationJournal")
        .index("partitionId")
        .getAll(this.partitionId),
    )) as Stored[];
    await done;
    return rows
      .filter(
        (row) => row.kind === "task_revocation" && row.status === "pending",
      )
      .map((row) => row.parentId);
  }
  guard(browser: BrowserPort): BrowserPort {
    const check = (step: PreparedStep) => this.assert(step.context);
    return {
      resolve: (...args) => {
        this.assert(args[2]);
        return browser.resolve(...args);
      },
      preflight: (step, arg) => {
        check(step);
        return browser.preflight(step, arg);
      },
      observe: (step, arg) => {
        check(step);
        return browser.observe(step, arg);
      },
      dispatch: (step, arg, before) => {
        check(step);
        return browser.dispatch(step, arg, () => {
          check(step);
          before();
        });
      },
    };
  }
}
