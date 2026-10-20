import {
  canonical,
  digest,
} from "../../../../packages/codebase-schema/src/index.js";
import {
  preparedSchema,
  preparedBodySchema,
  receiptSchema,
  type PreparedStep,
  type Receipt,
  type IntentJournal,
} from "../../../../packages/tool-registry/src/index.js";
import { account } from "../../../../packages/task-engine/src/durable/index.js";
import { TaskStore } from "./store.js";
import { transaction } from "./database.js";
export class DurableIntents implements IntentJournal {
  constructor(
    private tasks: TaskStore,
    private owner: string,
  ) {}
  async record(raw: PreparedStep): Promise<void> {
    const step = preparedSchema.parse(raw);
    const { digest: preparedDigest, ...body } = step;
    if (preparedDigest !== (await digest(preparedBodySchema.parse(body))))
      throw new Error("PREPARED_DIGEST");
    const c = step.context;
    transaction(this.tasks.db, () => {
      const task = this.tasks.load(c.taskId, this.owner);
      this.tasks.assertFence(task, c.leaseId, c.cancellationGeneration);
      if (
        task.epoch !== c.runtimeEpoch ||
        task.admission.mode !== c.mode ||
        task.admission.profileId !== c.profileId ||
        task.admission.tabId !== c.tabId ||
        task.phase !== "running" ||
        step.expiresAt <= Date.now()
      )
        throw new Error("INTENT_STALE");
      const id = `dispatch_${step.toolCallId}`;
      const old = this.tasks.db
        .prepare("SELECT * FROM dispatch_intents WHERE id=?")
        .get(id);
      if (old) {
        if (old.digest !== step.digest || old.task_id !== c.taskId)
          throw new Error("DISPATCH_CONFLICT");
        return;
      }
      const prior = this.tasks.db
        .prepare(
          "SELECT id FROM dispatch_intents WHERE task_id=? AND step_id=?",
        )
        .get(c.taskId, c.stepId);
      if (prior) throw new Error("STEP_DISPATCH_CONFLICT");
      const accounted = account(task, Date.now(), true);
      accounted.revision++;
      this.tasks.save(accounted);
      // Only digests and ownership persist. Never store argument values or bindings.
      this.tasks.db
        .prepare("INSERT INTO dispatch_intents VALUES (?,?,?,?,NULL)")
        .run(id, c.taskId, step.digest, c.stepId);
    });
  }
  settle(taskId: string, raw: Receipt): void {
    const receipt = receiptSchema.parse(raw);
    transaction(this.tasks.db, () => {
      this.tasks.load(taskId, this.owner);
      const old = this.tasks.db
        .prepare("SELECT * FROM dispatch_intents WHERE id=?")
        .get(receipt.dispatchId);
      if (
        !old ||
        old.task_id !== taskId ||
        old.digest !== receipt.preparedDigest ||
        receipt.dispatchId !== `dispatch_${receipt.toolCallId}`
      )
        throw new Error("RECEIPT_CONFLICT");
      const body = canonical(receipt);
      if (old.receipt && old.receipt !== body)
        throw new Error("RECEIPT_CONFLICT");
      this.tasks.db
        .prepare("UPDATE dispatch_intents SET receipt=? WHERE id=?")
        .run(body, receipt.dispatchId);
    });
  }
  reconcile(taskId: string) {
    this.tasks.load(taskId, this.owner);
    return this.tasks.db
      .prepare("SELECT id,receipt FROM dispatch_intents WHERE task_id=?")
      .all(taskId)
      .map((row) => ({
        dispatchId: String(row.id),
        receipt: row.receipt
          ? receiptSchema.parse(JSON.parse(String(row.receipt)))
          : null,
        replayAllowed: false as const,
      }));
  }
}
