import type {
  ActionIntent,
  ModelActionProposal,
  MutationTool,
  Role,
  VerifierPredicate,
} from "../contracts/types.js";
import { digestCanonical } from "../security/canonical.js";
import { fail } from "../security/validation.js";
import type { SlotBinding } from "./value-slots.js";
import { RunCoordinator, type Run } from "./run-coordinator.js";

export type ActionDefinition = {
  tool: MutationTool;
  effect: "local-ui-only" | "server-side";
  risk: "R1" | "R2";
  eligibleRoles: readonly Role[];
  verifier: VerifierPredicate;
};
export type MutationTarget = {
  refId: string;
  role: Role;
  visible: boolean;
  enabled: boolean;
  sensitive: boolean;
  stale: boolean;
};
export type AwaitingValue = {
  state: "AWAITING_VALUE";
  valueSlotId: string;
  valueKind: "text" | "option";
};
export type AwaitingConfirmation = {
  state: "AWAITING_CONFIRMATION";
  confirmationId: string;
  confirmationNonce: string;
};
export type ReadyExecution = {
  state: "READY_TO_EXECUTE";
  intent: ActionIntent;
  value?: string;
};
type Pending = {
  intent: ActionIntent;
  target: MutationTarget;
  slot?: SlotBinding & { id: string };
  value?: string;
  sessionBindingId?: string;
};

export class MutationCoordinator {
  private readonly pending = new Map<string, Pending>();
  private readonly reserved = new Set<string>();
  public constructor(private readonly runs: RunCoordinator) {}

  public propose(
    run: Run,
    proposal: ModelActionProposal,
    target: MutationTarget,
    profile: { id: string; version: number },
    definition: ActionDefinition,
    sessionBindingId?: string,
    now = Date.now(),
  ): AwaitingValue | AwaitingConfirmation | ReadyExecution {
    if (run.mode !== "act" || run.phase === "TERMINAL")
      return fail("POLICY_DENIED");
    if (
      proposal.tool !== definition.tool ||
      !definition.eligibleRoles.includes(target.role)
    )
      return fail("TARGET_NOT_ACTIONABLE");
    if (target.sensitive || target.stale || !target.visible || !target.enabled)
      return fail(target.stale ? "TARGET_STALE" : "TARGET_NOT_ACTIONABLE");
    const intent = this.intent(run, proposal, target, profile, definition);
    const digest = digestCanonical(intent);
    if (this.reserved.has(digest)) return fail("POLICY_DENIED");
    this.reserved.add(digest);
    const pending: Pending = {
      intent,
      target,
      ...(sessionBindingId ? { sessionBindingId } : {}),
    };
    if (
      proposal.tool === "set_text_by_ref" ||
      proposal.tool === "select_option_by_ref"
    ) {
      const valueKind = proposal.tool === "set_text_by_ref" ? "text" : "option";
      const slotBinding: SlotBinding = {
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
      const slot = this.runs.values.create(slotBinding, now);
      pending.slot = { ...slotBinding, id: slot.id };
      this.pending.set(run.id, pending);
      this.runs.transition(run.id, "AWAITING_VALUE");
      return { state: "AWAITING_VALUE", valueSlotId: slot.id, valueKind };
    }
    this.pending.set(run.id, pending);
    return this.afterValue(run, pending, now);
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
      return fail("VALUE_BINDING_INVALID");
    this.runs.values.validate(slotId, this.binding(pending.slot), value, now);
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
      return fail("CONFIRMATION_INVALID");
    this.runs.confirmations.consume(
      confirmationId,
      confirmationNonce,
      {
        run_id: run.id,
        tab_context: run.tabContext,
        document_epoch: run.documentEpoch,
        intent_digest: digestCanonical(pending.intent),
        session_binding_id: pending.sessionBindingId,
      },
      now,
    );
    return this.execute(run, pending, now);
  }

  public executeR1(run: Run, now = Date.now()): ReadyExecution {
    const pending = this.requirePending(run);
    if (pending.intent.risk !== "R1" || run.phase !== "PREFLIGHT")
      return fail("POLICY_DENIED");
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
    pending: Pending,
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
    if (!pending.sessionBindingId) return fail("CONFIRMATION_INVALID");
    const token = this.runs.confirmations.issue(
      {
        run_id: run.id,
        tab_context: run.tabContext,
        document_epoch: run.documentEpoch,
        intent_digest: digestCanonical(pending.intent),
        session_binding_id: pending.sessionBindingId,
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

  private execute(run: Run, pending: Pending, now: number): ReadyExecution {
    let value: string | undefined;
    if (pending.slot) {
      if (pending.value === undefined) return fail("VALUE_BINDING_INVALID");
      const consumed = this.runs.values.consume(
        pending.slot.id,
        this.binding(pending.slot),
        pending.value,
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

  private requirePending(run: Run): Pending {
    const pending = this.pending.get(run.id);
    return pending ?? fail("INVALID_ARGUMENT");
  }
  private binding(slot: SlotBinding & { id: string }): SlotBinding {
    return {
      run_id: slot.run_id,
      tab_id: slot.tab_id,
      frame_id: slot.frame_id,
      document_epoch: slot.document_epoch,
      profile_id: slot.profile_id,
      profile_version: slot.profile_version,
      tool: slot.tool,
      ref_id: slot.ref_id,
      value_kind: slot.value_kind,
    };
  }
  private intent(
    run: Run,
    proposal: ModelActionProposal,
    target: MutationTarget,
    profile: { id: string; version: number },
    definition: ActionDefinition,
  ): ActionIntent {
    const base = {
      tool: proposal.tool,
      run_id: run.id,
      tab_id: run.tabId,
      frame_id: run.frameId,
      document_epoch: run.documentEpoch,
      profile,
      ref_id: target.refId,
      effect: definition.effect,
      verifier: definition.verifier,
    };
    if (proposal.tool === "set_checked_by_ref")
      return { ...base, risk: definition.risk, argument: proposal.argument };
    if (proposal.tool === "press_key_by_ref")
      return { ...base, risk: definition.risk, argument: proposal.argument };
    return { ...base, risk: definition.risk };
  }
}
