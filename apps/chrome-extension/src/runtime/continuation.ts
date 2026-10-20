import type { Approvals, UiPrincipal } from "@contextpilot/policy-engine";
import type {
  ApprovalPrompt,
  Receipt,
  ToolId,
  ToolContext,
} from "@contextpilot/tool-registry";
import type { ToolRuntime } from "@contextpilot/tool-runtime";
export class ToolContinuation {
  private pending = new Map<
    string,
    { preparedId: string; toolCallId: string }
  >();
  constructor(
    private runtime: ToolRuntime,
    private approvals: Approvals,
  ) {}
  async start(
    tool: ToolId,
    intent: unknown,
    expected?: ToolContext,
  ): Promise<ApprovalPrompt | Receipt> {
    const prepared = await this.runtime.prepare(tool, intent, expected);
    if (prepared.alreadySatisfied)
      return this.runtime.recordNoOp(prepared.step.id);
    const approval = await this.runtime.requestApproval(prepared.step.id);
    if (approval.kind === "denied") throw new Error("POLICY_DENIED");
    if (approval.kind === "approved")
      return this.runtime.execute(prepared.step.id, approval.receipt.id);
    this.pending.set(approval.prompt.id, {
      preparedId: prepared.step.id,
      toolCallId: prepared.step.toolCallId,
    });
    return approval.prompt;
  }
  async respond(
    principal: UiPrincipal,
    input: unknown,
  ): Promise<Receipt | null> {
    const approval = await this.approvals.respond(principal, input);
    if (!approval?.promptId) return null;
    const pending = this.pending.get(approval.promptId);
    if (!pending) throw new Error("CONTINUATION_UNAVAILABLE");
    this.pending.delete(approval.promptId);
    const receipt = await this.runtime.execute(pending.preparedId, approval.id);
    if (receipt.toolCallId !== pending.toolCallId)
      throw new Error("TOOL_CALL_MISMATCH");
    return receipt;
  }
  stop(): void {
    this.pending.clear();
    this.runtime.cancel();
  }
}
