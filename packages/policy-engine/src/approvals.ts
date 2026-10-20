import { canonical, digest } from "@contextpilot/codebase-schema";
import {
  approvalSchema,
  type Argument,
  responseSchema,
  type ApprovalPrompt,
  type ApprovalReceipt,
  type PreparedStep,
  type ToolContext,
} from "@contextpilot/tool-registry";
import { evaluate, type PolicySnapshot } from "./evaluate.js";
import { UiAuthority, type UiPrincipal } from "./ui-authority.js";
import { makePrompt } from "./approval-prompt.js";
const mint = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
export class Approvals {
  private epoch = 0;
  private pending = new Map<
    string,
    { prompt: ApprovalPrompt; step: PreparedStep }
  >();
  private approvals = new Map<
    string,
    { receipt: ApprovalReceipt; used: boolean; policyCanonical: string }
  >();
  constructor(
    private ui: UiAuthority,
    private policy: () => PolicySnapshot,
    private context: () => ToolContext,
    private now: () => number = Date.now,
  ) {}
  private async current(step: PreparedStep) {
    const epoch = this.epoch;
    const policyDigest = await digest(this.policy());
    if (
      epoch !== this.epoch ||
      canonical(step.context) !== canonical(this.context()) ||
      step.expiresAt <= this.now() ||
      policyDigest !== step.context.policyDigest
    )
      throw new Error("APPROVAL_BINDING_STALE");
  }
  async request(
    step: PreparedStep,
    argument?: Argument,
  ): Promise<
    | { kind: "denied" }
    | { kind: "approved"; receipt: ApprovalReceipt }
    | { kind: "prompt"; prompt: ApprovalPrompt }
  > {
    await this.current(step);
    const decision = evaluate(
      this.policy(),
      step.tool,
      step.effect,
      step.context,
    );
    if (decision === "deny") return { kind: "denied" };
    if (this.approvals.size >= 256 || this.pending.size >= 32)
      throw new Error("APPROVAL_LIMIT");
    if (decision === "policy")
      return {
        kind: "approved",
        receipt: await this.issue(step, "policy", null, null),
      };
    const epoch = this.epoch;
    const prompt = await makePrompt(step, argument, this.now());
    if (epoch !== this.epoch) throw new Error("APPROVAL_REVOKED");
    await this.current(step);
    this.pending.set(prompt.id, { prompt, step });
    return { kind: "prompt", prompt: structuredClone(prompt) };
  }
  async respond(
    principal: UiPrincipal,
    input: unknown,
  ): Promise<ApprovalReceipt | null> {
    const epoch = this.epoch;
    const response = responseSchema.parse(input);
    const entry = this.pending.get(response.promptId);
    if (!entry) throw new Error("PROMPT_UNAVAILABLE");
    const { prompt, step } = entry;
    this.ui.assert(principal, step.context.profileId, step.context.windowId);
    await this.current(step);
    if (
      prompt.expiresAt <= this.now() ||
      response.promptRevision !== prompt.revision ||
      response.planRevision !== prompt.planRevision ||
      response.preparedDigest !== step.digest ||
      response.contextDigest !== prompt.contextDigest ||
      response.disclosureScope !== prompt.disclosureScope
    )
      throw new Error("PROMPT_MISMATCH");
    if (epoch !== this.epoch || !this.pending.has(prompt.id))
      throw new Error("APPROVAL_REVOKED");
    this.pending.delete(prompt.id);
    if (response.choice === "deny") return null;
    if (
      evaluate(this.policy(), step.tool, step.effect, step.context) === "deny"
    )
      throw new Error("POLICY_DENIED");
    return this.issue(step, "user", prompt.id, prompt.disclosureScope);
  }
  private async issue(
    step: PreparedStep,
    source: "user" | "policy",
    promptId: string | null,
    scope: string | null,
  ): Promise<ApprovalReceipt> {
    const epoch = this.epoch;
    const receipt = approvalSchema.parse({
      schema: "wca.policy/v1",
      kind: "approval_receipt",
      id: mint("approval"),
      promptId,
      source,
      taskId: step.context.taskId,
      stepId: step.context.stepId,
      preparedDigest: step.digest,
      contextDigest: await digest(step.context),
      policyRevision: step.context.policyRevision,
      planRevision: step.context.planRevision,
      runtimeEpoch: step.context.runtimeEpoch,
      cancellationGeneration: step.context.cancellationGeneration,
      effect: step.effect,
      disclosureScope: scope,
      expiresAt: step.expiresAt,
    });
    await this.current(step);
    if (epoch !== this.epoch) throw new Error("APPROVAL_REVOKED");
    this.approvals.set(receipt.id, {
      receipt,
      used: false,
      policyCanonical: canonical(this.policy()),
    });
    return structuredClone(receipt);
  }
  async validate(id: string, step: PreparedStep): Promise<void> {
    const stored = this.approvals.get(id);
    if (!stored || stored.used) throw new Error("APPROVAL_UNAVAILABLE");
    await this.current(step);
    const r = stored.receipt;
    if (
      r.preparedDigest !== step.digest ||
      r.contextDigest !== (await digest(step.context)) ||
      r.expiresAt <= this.now() ||
      r.disclosureScope !== step.disclosureScope
    )
      throw new Error("APPROVAL_MISMATCH");
    const decision = evaluate(
      this.policy(),
      step.tool,
      step.effect,
      step.context,
    );
    if (decision === "deny" || (decision === "explicit" && r.source !== "user"))
      throw new Error("POLICY_DENIED");
  }
  consume(id: string, step: PreparedStep): void {
    const record = this.approvals.get(id);
    if (
      !record ||
      record.used ||
      record.receipt.preparedDigest !== step.digest ||
      canonical(step.context) !== canonical(this.context()) ||
      record.receipt.expiresAt <= this.now() ||
      record.policyCanonical !== canonical(this.policy()) ||
      evaluate(this.policy(), step.tool, step.effect, step.context) ===
        "deny" ||
      (evaluate(this.policy(), step.tool, step.effect, step.context) ===
        "explicit" &&
        record.receipt.source !== "user")
    )
      throw new Error("APPROVAL_REVOKED");
    record.used = true;
  }
  assertActive(id: string): void {
    if (!this.approvals.has(id)) throw new Error("APPROVAL_REVOKED");
  }
  cancel(): void {
    this.epoch++;
    this.pending.clear();
    this.approvals.clear();
  }
}
