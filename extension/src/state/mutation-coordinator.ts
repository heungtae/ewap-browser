import { digestCanonical } from "../security/canonical.js";
import { fail } from "../security/validation.js";
import { actionIntent, slotBinding } from "./mutation-intent.js";
import type {
  ActionDefinition,
  AwaitingConfirmation,
  AwaitingValue,
  MutationProposal,
  MutationTarget,
  PendingMutation,
  ReadyExecution,
} from "./mutation-types.js";
export type {
  ActionDefinition,
  AwaitingConfirmation,
  AwaitingValue,
  MutationTarget,
  ReadyExecution,
} from "./mutation-types.js";
import { RunCoordinator, type Run } from "./run-coordinator.js";
import type { SlotBinding } from "./value-slots.js";

export class MutationCoordinator {
  private readonly pending = new Map<string, PendingMutation>();
  private readonly reserved = new Set<string>();
  public constructor(private readonly runs: RunCoordinator) {}
  public propose(
    run: Run,
    proposal: MutationProposal,
    target: MutationTarget,
    profile: { id: string; version: number },
    definition: ActionDefinition,
    sessionBindingId?: string,
    now = Date.now(),
  ): AwaitingValue | AwaitingConfirmation | ReadyExecution {
    if (run.mode !== "act" || run.phase === "TERMINAL") fail("POLICY_DENIED");
    if (
      proposal.tool !== definition.tool ||
      !definition.eligibleRoles.includes(target.role)
    )
      fail("TARGET_NOT_ACTIONABLE");
    if (target.sensitive || target.stale || !target.visible || !target.enabled)
      fail(target.stale ? "TARGET_STALE" : "TARGET_NOT_ACTIONABLE");
    const intent = actionIntent(run, proposal, target, profile, definition);
    const digest = digestCanonical(intent);
    if (this.reserved.has(digest)) fail("POLICY_DENIED");
    this.reserved.add(digest);
    const pending: PendingMutation = {
      intent,
      ...(sessionBindingId ? { sessionBindingId } : {}),
    };
    this.pending.set(run.id, pending);
    if (
      proposal.tool !== "set_text_by_ref" &&
      proposal.tool !== "select_option_by_ref"
    )
      return this.afterValue(run, pending, now);
    const valueKind = proposal.tool === "set_text_by_ref" ? "text" : "option";
    const binding: SlotBinding = {
      run_id: run.id,
      tab_id: run.tabId,
      frame_id: run.frameId,
      document_epoch: run.documentEpoch,
      profile_id: profile.id,
      profile_version: profile.version,
      tool: proposal.tool,
      ref_id: target.refId,
      value_kind: valueKind,
    };
    const slot = this.runs.values.create(binding, now);
    pending.slot = { ...binding, id: slot.id };
    this.runs.transition(run.id, "AWAITING_VALUE");
    return { state: "AWAITING_VALUE", valueSlotId: slot.id, valueKind };
  }

  public submitValue(
    run: Run,
    slotId: string,
    value: string,
    now = Date.now(),
  ): AwaitingConfirmation | ReadyExecution {
    const pending = this.requirePending(run);
    if (
      run.phase !== "AWAITING_VALUE" ||
      !pending.slot ||
      pending.slot.id !== slotId
    )
      fail("VALUE_BINDING_INVALID");
    this.runs.values.validate(
      slotId,
      slotBinding(pending.slot as NonNullable<PendingMutation["slot"]>),
      value,
      now,
    );
    pending.value = value;
    return this.afterValue(run, pending, now);
  }

  public confirm(
    run: Run,
    confirmationId: string,
    confirmationNonce: string,
    now = Date.now(),
  ): ReadyExecution {
    const pending = this.requirePending(run);
    if (run.phase !== "AWAITING_CONFIRMATION" || !pending.sessionBindingId)
      fail("CONFIRMATION_INVALID");
    this.runs.confirmations.consume(
      confirmationId,
      confirmationNonce,
      {
        run_id: run.id,
        tab_context: run.tabContext,
        document_epoch: run.documentEpoch,
        intent_digest: digestCanonical(pending.intent),
        session_binding_id: pending.sessionBindingId as string,
      },
      now,
    );
    return this.execute(run, pending, now);
  }

  public executeR1(run: Run, now = Date.now()): ReadyExecution {
    const pending = this.requirePending(run);
    if (pending.intent.risk !== "R1" || run.phase !== "PREFLIGHT")
      fail("POLICY_DENIED");
    return this.execute(run, pending, now);
  }

  public terminal(
    run: Run,
    outcome: "VERIFIED" | "FAILED" | "UNKNOWN" | "CANCELLED",
  ): void {
    this.pending.delete(run.id);
    this.runs.terminal(run.id, outcome);
  }

  private afterValue(
    run: Run,
    pending: PendingMutation,
    now: number,
  ): AwaitingConfirmation | ReadyExecution {
    if (pending.intent.risk === "R1") {
      this.runs.transition(run.id, "PREFLIGHT");
      return {
        state: "READY_TO_EXECUTE",
        intent: pending.intent,
        ...(pending.value ? { value: pending.value } : {}),
      };
    }
    if (!pending.sessionBindingId) fail("CONFIRMATION_INVALID");
    const token = this.runs.confirmations.issue(
      {
        run_id: run.id,
        tab_context: run.tabContext,
        document_epoch: run.documentEpoch,
        intent_digest: digestCanonical(pending.intent),
        session_binding_id: pending.sessionBindingId as string,
      },
      now,
    );
    this.runs.transition(run.id, "AWAITING_CONFIRMATION");
    return {
      state: "AWAITING_CONFIRMATION",
      confirmationId: token.id,
      confirmationNonce: token.nonce,
    };
  }

  private execute(
    run: Run,
    pending: PendingMutation,
    now: number,
  ): ReadyExecution {
    let value: string | undefined;
    if (pending.slot) {
      if (pending.value === undefined) fail("VALUE_BINDING_INVALID");
      const consumed = this.runs.values.consume(
        pending.slot.id,
        slotBinding(pending.slot),
        pending.value as string,
        now,
      );
      value = pending.value;
      pending.intent = { ...pending.intent, value_binding: consumed.binding };
      delete pending.value;
    }
    this.runs.transition(run.id, "EXECUTING");
    return {
      state: "READY_TO_EXECUTE",
      intent: pending.intent,
      ...(value !== undefined ? { value } : {}),
    };
  }

  private requirePending(run: Run): PendingMutation {
    return this.pending.get(run.id) ?? fail("INVALID_ARGUMENT");
  }
}
