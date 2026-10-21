import { canonical } from "../../../../packages/codebase-schema/src/digest.js";
import { createHash } from "node:crypto";
import {
  assertScope,
  safeCode,
  stepSchema,
  type Grant,
} from "../../../../packages/integration-adapters/src/contracts.js";
import type { ToolId } from "../../../../packages/tool-registry/src/inputs.js";
import type {
  RuntimePorts,
  ToolRuntime,
} from "../../../../packages/tool-runtime/src/runtime.js";
import { ToolRuntime as SharedRuntime } from "../../../../packages/tool-runtime/src/runtime.js";
import type { BoundTask, McpTaskApi } from "./task-api.js";
import { McpStepStore } from "./step-store.js";
export interface ExternalBinding {
  ports: RuntimePorts;
  origin(): string;
  approval(preparedId: string): Promise<string | null>;
}
export class ExternalTools {
  private active = new Map<
    string,
    {
      runtime: ToolRuntime;
      preparedId: string;
      binding: ExternalBinding;
      policyApproval?: string;
    }
  >();
  private inflight = new Set<string>();
  constructor(
    private tasks: McpTaskApi,
    private steps: McpStepStore,
    private resolve: (
      bound: BoundTask,
      callId: string,
    ) => Promise<ExternalBinding>,
    private currentGrant: (clientId: string) => Grant,
    private now = Date.now,
  ) {}
  summary(taskId: string) {
    return this.steps.summary(taskId);
  }
  cancelTask(taskId: string): void {
    for (const [key, entry] of this.active)
      if (key.startsWith(`${taskId}:`)) {
        entry.runtime.cancel();
        this.active.delete(key);
      }
  }
  async call(grant: Grant, tool: ToolId, raw: unknown) {
    const input = stepSchema.parse(raw),
      bound = this.tasks.bind(grant, { taskHandle: input.taskHandle });
    if (
      bound.controller !== "external" ||
      !grant.externalController ||
      !grant.tools.includes(tool)
    )
      throw new Error("MCP_TOOL_DENIED");
    if (["completed", "failed", "cancelled"].includes(bound.task.phase))
      throw new Error("MCP_TASK_TERMINAL");
    const signature = createHash("sha256")
      .update(canonical([tool, input.input]))
      .digest("hex");
    const key = `${bound.task.id}:${input.callId}`;
    if ([...this.inflight].some((k) => k.startsWith(`${bound.task.id}:`)))
      throw new Error("MCP_CALL_BUSY");
    this.inflight.add(key);
    let ownedReservation = false,
      executionStarted = false;
    const assertCurrent = (binding: ExternalBinding) => {
      const fresh = this.currentGrant(grant.clientId);
      if (
        fresh.revision !== grant.revision ||
        !fresh.tools.includes(tool) ||
        !fresh.externalController
      )
        throw new Error("MCP_SCOPE_REVOKED");
      assertScope(
        fresh,
        { ...bound.scope, origin: binding.origin() },
        this.now(),
      );
      const live = this.tasks.bind(fresh, { taskHandle: input.taskHandle });
      if (binding.origin() !== bound.scope.origin)
        throw new Error("MCP_ORIGIN_CHANGED");
      const c = binding.ports.context();
      this.tasks.tasks.assertFence(
        live.task,
        c.leaseId,
        c.cancellationGeneration,
      );
      if (c.runtimeEpoch !== live.task.epoch)
        throw new Error("MCP_RUNTIME_BINDING");
      if (
        c.taskId !== bound.task.id ||
        c.profileId !== bound.scope.profileId ||
        c.tabId !== bound.scope.tabId ||
        c.mode !== bound.scope.mode
      )
        throw new Error("MCP_RUNTIME_BINDING");
    };
    try {
      const reservation = this.steps.reserve(
        bound.task.id,
        input.callId,
        signature,
      );
      ownedReservation = true;
      if (!reservation.fresh && reservation.state.status === "reserved")
        return { status: "unknown", error: "MCP_RECONCILIATION_REQUIRED" };
      if (!reservation.fresh && reservation.state.status !== "pending")
        return reservation.state;
      let entry = this.active.get(key);
      if (!reservation.fresh && !entry)
        return { status: "unknown", error: "MCP_RECONCILIATION_REQUIRED" };
      if (!entry) {
        if (this.active.size >= 64) throw new Error("MCP_STEP_LIMIT");
        const binding = await this.resolve(bound, input.callId);
        assertCurrent(binding);
        const ports = binding.ports,
          browser = ports.browser;
        const runtime = new SharedRuntime({
          ...ports,
          browser: {
            resolve: browser.resolve.bind(browser),
            preflight: browser.preflight.bind(browser),
            observe: browser.observe.bind(browser),
            dispatch: (step, argument, before) =>
              browser.dispatch(step, argument, () => {
                assertCurrent(binding);
                before();
              }),
          },
        });
        const prepared = await runtime.prepare(tool, input.input);
        assertCurrent(binding);
        entry = { runtime, preparedId: prepared.step.id, binding };
        this.active.set(key, entry);
        const approval = await runtime.requestApproval(prepared.step.id);
        if (approval.kind === "denied") throw new Error("POLICY_DENIED");
        if (approval.kind === "approved")
          entry.policyApproval = approval.receipt.id;
      }
      assertCurrent(entry.binding);
      // Only a trusted UI/policy bridge can return this ID; caller arguments cannot contain it.
      const approvalId =
        entry.policyApproval ??
        (await entry.binding.approval(entry.preparedId));
      if (!approvalId) {
        const state = { digest: signature, status: "pending" as const };
        this.steps.save(bound.task.id, input.callId, state);
        return { status: "pending_approval", callId: input.callId };
      }
      assertCurrent(entry.binding);
      executionStarted = true;
      const receipt = await entry.runtime.execute(entry.preparedId, approvalId);
      const state = {
        digest: signature,
        status: "completed" as const,
        receipt,
      };
      this.steps.save(bound.task.id, input.callId, state);
      this.active.delete(key);
      return state;
    } catch (error) {
      if (!ownedReservation) throw error;
      const state = {
        digest: signature,
        status: "failed" as const,
        error: safeCode(error),
        uncertain: executionStarted,
      };
      this.steps.save(bound.task.id, input.callId, state);
      this.active.delete(key);
      return state;
    } finally {
      this.inflight.delete(key);
    }
  }
}
