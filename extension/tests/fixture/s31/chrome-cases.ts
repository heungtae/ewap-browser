import { setup } from "../s30/setup.js";
import { digest } from "../../../../packages/codebase-schema/src/index.js";
import { openDatabase } from "../../../../packages/codebase-repository/src/index.js";
import {
  bindControl,
  LiveBindings,
  IndexedDbDispatchJournal,
  BrowserRevocations,
} from "../../../../packages/browser-runtime/src/index.js";
import {
  ArgumentSources,
  ToolRuntime,
} from "../../../../packages/tool-runtime/src/index.js";
import { ReceiptSyncJournal } from "../../../../apps/chrome-extension/src/runtime/durable-dispatch.js";
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export async function runCases() {
  const outcomes: string[] = [];
  let dispatches = 0;
  for (const mode of [
    "before_reservation",
    "after_reservation",
    "receipt_ack_lost",
    "navigation",
    "offline_stop",
  ] as const) {
    const f = await setup();
    const guard = await digest(crypto.randomUUID());
    let db = await openDatabase(indexedDB, guard);
    const element = document.createElement("input");
    document.body.append(element);
    let inputs = 0;
    element.addEventListener("input", () => inputs++);
    const sources = new ArgumentSources(f.ui, () => f.context);
    const argument = sources.admit(f.principal, "requested");
    const bindings = new LiveBindings(() => f.context);
    bindings.install(
      await bindControl({
        element,
        tool: "web.fill",
        target: f.target,
        context: structuredClone(f.context),
        effect: f.effect,
        unique: () => true,
      }),
    );
    const journal = new IndexedDbDispatchJournal(db, f.context.partitionId);
    const revocation = new BrowserRevocations(db, f.context.partitionId);
    await revocation.restore();
    const runtime = new ToolRuntime({
      registry: f.registry,
      capabilities: f.capabilities,
      arguments: sources,
      browser: revocation.guard(bindings),
      journal:
        mode === "receipt_ack_lost"
          ? new ReceiptSyncJournal(journal, async () => {
              throw new Error("ACK_LOST");
            })
          : journal,
      intent: { async record() {} },
      approvals: f.approvals,
      context: () => f.context,
      policy: () => f.policy,
      now: Date.now,
    });
    const p = await runtime.prepare("web.fill", { action: f.target, argument });
    const a = await runtime.requestApproval(p.step.id);
    assert(a.kind === "approved", "approval");
    if (mode === "after_reservation")
      await journal.reserve(`dispatch_${p.step.toolCallId}`, p.step);
    if (mode === "navigation") f.context.documentEpoch++;
    if (mode === "offline_stop") await revocation.stop(f.context.taskId);
    let error = "";
    let receipt;
    try {
      receipt = await runtime.execute(p.step.id, a.receipt.id);
    } catch (e) {
      error = (e as Error).message;
    }
    if (mode === "before_reservation")
      assert(
        receipt?.verification === "passed" && inputs === 1,
        "normal dispatch",
      );
    if (mode === "after_reservation")
      assert(
        receipt?.dispatch === "unknown" && inputs === 0,
        "reserved crash replay",
      );
    if (mode === "receipt_ack_lost")
      assert(error === "ACK_LOST" && inputs === 1, "lost receipt ACK");
    if (mode === "navigation")
      assert(error === "PREPARED_STALE" && inputs === 0, `navigation:${error}`);
    if (mode === "offline_stop")
      assert(error === "TASK_REVOKED" && inputs === 0, "offline stop");
    db.close();
    db = await openDatabase(indexedDB, guard);
    if (mode === "receipt_ack_lost" || mode === "after_reservation") {
      const recovered = await new IndexedDbDispatchJournal(
        db,
        f.context.partitionId,
      ).reserve(`dispatch_${p.step.toolCallId}`, p.step);
      assert(!recovered.fresh, "reopened ledger");
      assert(
        mode === "receipt_ack_lost"
          ? recovered.receipt?.verification === "passed"
          : recovered.receipt === null,
        "receipt recovery",
      );
    }
    if (mode === "offline_stop") {
      const restored = new BrowserRevocations(db, f.context.partitionId);
      await restored.restore();
      assert(
        (await restored.pending()).includes(f.context.taskId),
        "persistent cancel pending",
      );
    }
    dispatches += inputs;
    db.close();
    element.remove();
    outcomes.push(mode);
  }
  document.body.textContent = `S31 recovery PASS: ${outcomes.join(", ")}; DOM dispatches=${dispatches}`;
  return {
    outcomes,
    dispatches,
    providerCalls: 0,
    scope:
      "Real Chrome DOM/IndexedDB close-reopen; fixture UI principal and backend intent; not MV3 worker kill, actual backend pairing or installed product recovery",
  };
}
