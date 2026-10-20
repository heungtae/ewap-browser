import { canonical, digest } from "@contextpilot/codebase-schema";
import type { Approvals, PolicySnapshot } from "@contextpilot/policy-engine";
import type {
  ArgumentPort,
  BrowserPort,
  DispatchJournal,
  IntentJournal,
  Receipt,
  ToolContext,
  ToolId,
  ToolRegistry,
} from "@contextpilot/tool-registry";
import {
  prepareStep,
  assertCurrent,
  type PreparedRecord,
} from "./prepare-step.js";
import { executeStep } from "./execute-step.js";
import { receipt } from "./receipt.js";
export interface RuntimePorts {
  registry: ToolRegistry;
  capabilities: ReadonlySet<ToolId>;
  arguments: ArgumentPort;
  browser: BrowserPort;
  journal: DispatchJournal;
  intent: IntentJournal;
  approvals: Approvals;
  context(): ToolContext;
  policy(): PolicySnapshot;
  now(): number;
}
export class ToolRuntime {
  private cancelled = false;
  private active(): void {
    if (this.cancelled) throw new Error("RUNTIME_CANCELLED");
  }
  private steps = new Map<string, PreparedRecord>();
  private scopes = new Map<string, string>();
  private receipts = new Map<string, Receipt>();
  constructor(private ports: RuntimePorts) {}
  async prepare(
    tool: ToolId,
    input: unknown,
    expected?: ToolContext,
  ): Promise<PreparedRecord> {
    this.active();
    const context = this.ports.context();
    if (expected && canonical(expected) !== canonical(context))
      throw new Error("INVOCATION_STALE");
    const scope = canonical([
      context.taskId,
      context.stepId,
      context.planRevision,
    ]);
    const existing = this.scopes.get(scope);
    if (existing) {
      const record = this.steps.get(existing)!;
      assertCurrent(record.step, context, this.ports.now());
      if (
        record.step.tool !== tool ||
        record.step.intentDigest !== (await digest(input))
      )
        throw new Error("STEP_ID_CONFLICT");
      return structuredClone(record);
    }
    if (this.steps.size >= 64) throw new Error("TOOL_BUDGET_EXHAUSTED");
    const prepared = await prepareStep(
      tool,
      input,
      context,
      this.ports.registry,
      this.ports.capabilities,
      this.ports.arguments,
      this.ports.browser,
      this.ports.policy(),
      this.ports.now(),
    );
    this.active();
    assertCurrent(prepared.step, this.ports.context(), this.ports.now());
    if (this.scopes.has(scope)) throw new Error("STEP_PREPARATION_CONFLICT");
    this.steps.set(prepared.step.id, structuredClone(prepared));
    this.scopes.set(scope, prepared.step.id);
    return structuredClone(prepared);
  }
  async requestApproval(id: string) {
    this.active();
    const record = this.steps.get(id);
    if (!record) throw new Error("PREPARED_UNAVAILABLE");
    return this.ports.approvals.request(record.step, record.argument.value);
  }
  async execute(id: string, approvalId: string): Promise<Receipt> {
    const stored = this.receipts.get(id);
    if (stored) return structuredClone(stored);
    this.active();
    const record = this.steps.get(id);
    if (!record) throw new Error("PREPARED_UNAVAILABLE");
    const result = await executeStep(record, approvalId, this.ports);
    this.receipts.set(id, result);
    return structuredClone(result);
  }
  async recordNoOp(id: string): Promise<Receipt> {
    this.active();
    const record = this.steps.get(id);
    if (!record || !record.alreadySatisfied)
      throw new Error("NOOP_UNAVAILABLE");
    assertCurrent(record.step, this.ports.context(), this.ports.now());
    const observed = await this.ports.browser.observe(
      record.step,
      record.argument.value,
    );
    if (!observed.passed) throw new Error("NOOP_CHANGED");
    await this.ports.intent.record(record.step);
    const result = receipt(record.step, {
      noOp: true,
      verification: "passed",
      evidenceDigest: observed.digest,
    });
    const idempotency = result.dispatchId;
    const reservation = await this.ports.journal.reserve(
      idempotency,
      record.step,
    );
    if (!reservation.fresh)
      return (
        reservation.receipt ??
        receipt(record.step, {
          dispatch: "unknown",
          error: "DISPATCH_RESERVED_UNKNOWN",
        })
      );
    await this.ports.journal.settle(idempotency, result);
    this.receipts.set(id, result);
    return result;
  }
  cancel(): void {
    this.cancelled = true;
    this.ports.approvals.cancel();
  }
}
