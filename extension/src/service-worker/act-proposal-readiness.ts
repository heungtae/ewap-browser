import type { ModelActionProposal } from "../contracts/types.js";
import type { Role } from "../contracts/core-types.js";
import { digestCanonical } from "../security/canonical.js";
import { traceDecision } from "../diagnostics/method-trace.js";
import { isSensitive } from "../security/redaction.js";
import type {
  ActionDefinition,
  ReadyExecution,
} from "../state/mutation-coordinator.js";
import type { Run } from "../state/run-coordinator.js";
import type {
  ChatActionView,
  ChatEventPayload,
} from "../contracts/chat-events.js";
import type { ServiceCoordinator } from "./coordinator.js";
import type { ActSession } from "./act-session-types.js";
import type { ParsedActProposal } from "./act-proposal-parser.js";

type Target = {
  enabled: boolean;
  name: string;
  ref_id: string;
  role: Role;
  state: unknown;
  visible: boolean;
};
type Dependencies = {
  actionView(session: ActSession, proposal: ParsedActProposal): ChatActionView;
  coordinator: ServiceCoordinator;
  publish(runId: string, event: ChatEventPayload): void;
};
type Prepared =
  | { ready: ReadyExecution }
  | { response: Record<string, unknown> };

export const prepareActProposal = (
  dependencies: Dependencies,
  session: ActSession,
  run: Run,
  proposal: ParsedActProposal,
  target: Target,
  expectedRequestRevision?: number,
): Prepared => {
  // PAH-9: LLM-judged values bind to the approved proposal. A clear value
  // rides with the proposal (no extra value card); a missing value in the
  // harness path is a contract error for the model, never an automatic card.
  // The legacy target-only card remains only when no harness revision binds
  // this turn (pre-harness callers and existing unit paths).
  const isTextOrOption =
    proposal.tool === "set_text_by_ref" ||
    proposal.tool === "select_option_by_ref";
  if (isTextOrOption && isSensitive(target.role, target.name)) {
    traceDecision("page-act-harness.value.blocked", {
      tool: proposal.tool,
      request_revision: expectedRequestRevision ?? null,
    });
    return { response: { ok: false, code: "TARGET_NOT_ACTIONABLE" } };
  }
  if (
    proposal.tool === "set_text_by_ref" &&
    proposal.value === undefined &&
    expectedRequestRevision !== undefined
  ) {
    traceDecision("page-act-harness.value.missing", {
      request_revision: expectedRequestRevision,
    });
    return { response: { ok: false, code: "VALUE_BINDING_INVALID" } };
  }
  // PAH-9/R5: the option schema leaves value_source_revision optional so
  // schema-valid calls parse, but a harness-bound option value without its
  // source revision cannot prove freshness — a model contract error, never
  // an automatic card or a guessed binding.
  if (
    proposal.tool === "select_option_by_ref" &&
    proposal.value !== undefined &&
    proposal.valueSourceRevision === undefined &&
    expectedRequestRevision !== undefined
  ) {
    traceDecision("page-act-harness.value.missing_source", {
      request_revision: expectedRequestRevision,
    });
    return { response: { ok: false, code: "VALUE_BINDING_INVALID" } };
  }
  if (
    isTextOrOption &&
    proposal.value !== undefined &&
    proposal.valueSourceRevision !== undefined &&
    expectedRequestRevision !== undefined &&
    proposal.valueSourceRevision !== expectedRequestRevision
  ) {
    traceDecision("page-act-harness.value.stale_source", {
      value_source_revision: proposal.valueSourceRevision,
      request_revision: expectedRequestRevision,
    });
    return { response: { ok: false, code: "VALUE_BINDING_INVALID" } };
  }
  const definition: ActionDefinition = {
    tool: proposal.definition.tool,
    effect: proposal.definition.effect,
    risk: proposal.definition.risk,
    eligibleRoles: proposal.definition.eligible_roles,
    verifier: {
      ...proposal.definition.verifier,
      pre_state_digest: digestCanonical(target.state),
      required_changes: proposal.definition.verifier.required_changes.map(
        (change) => ({
          ...change,
          ...(change.ref_id === "$target" ? { ref_id: proposal.refId } : {}),
        }),
      ),
    },
    ...(proposal.definition.completion
      ? {
          completion: {
            ...proposal.definition.completion,
            ...(proposal.definition.completion.kind === "control_state"
              ? {
                  expected_changes:
                    proposal.definition.completion.expected_changes.map(
                      (change) => ({
                        ...change,
                        ...(change.ref_id === "$target"
                          ? { ref_id: proposal.refId }
                          : {}),
                      }),
                    ),
                }
              : {}),
          },
        }
      : {}),
  };
  if (
    definition.completion?.kind === "control_state" &&
    definition.verifier.kind === "semantic-state-transition"
  )
    definition.verifier.required_changes =
      definition.completion.expected_changes;
  if (
    proposal.tool === "click_by_ref" &&
    typeof target.state === "object" &&
    target.state !== null &&
    typeof (target.state as { expanded?: unknown }).expanded === "boolean" &&
    definition.verifier.kind === "semantic-state-transition" &&
    definition.verifier.required_changes.length === 0
  )
    definition.verifier.required_changes = [
      {
        ref_id: proposal.refId,
        field: "expanded",
        expected: !(target.state as { expanded: boolean }).expanded,
      },
    ];
  if (
    proposal.tool === "click_by_ref" &&
    typeof target.state === "object" &&
    target.state !== null &&
    (target.state as { expanded?: unknown }).expanded === false &&
    proposal.approvalScope === "session"
  )
    session.awaitingExpandedMenuSelection = true;
  if (
    proposal.tool === "click_by_ref" &&
    target.role === "tab" &&
    definition.verifier.kind === "semantic-state-transition" &&
    definition.verifier.required_changes.length === 0 &&
    (target.state as { selected?: unknown })?.selected === false
  )
    definition.verifier.required_changes = [
      { ref_id: proposal.refId, field: "selected", expected: true },
    ];
  const next = dependencies.coordinator.mutations.propose(
    run,
    {
      tool: proposal.tool,
      target: "approved-profile-target",
      ...(proposal.argument ? { argument: proposal.argument } : {}),
    } as ModelActionProposal,
    {
      refId: proposal.refId,
      role: target.role,
      name: target.name,
      visible: target.visible,
      enabled: target.enabled,
      sensitive: false,
      stale: false,
    },
    session.profile,
    definition,
    session.id,
  );
  if (next.state === "AWAITING_VALUE") {
    if (proposal.value) {
      let afterValue;
      try {
        afterValue = dependencies.coordinator.mutations.submitValue(
          run,
          next.valueSlotId,
          proposal.value,
        );
      } catch {
        traceDecision("page-act-harness.value.submit_failed", {
          value_length: [...proposal.value].length,
          request_revision: expectedRequestRevision ?? null,
        });
        return { response: { ok: false, code: "VALUE_BINDING_INVALID" } };
      }
      if (afterValue.state !== "READY_TO_EXECUTE")
        return { response: { ok: false, code: "CONFIRMATION_INVALID" } };
      traceDecision("page-act-harness.value.bound", {
        value_length: [...proposal.value].length,
        has_source_revision: proposal.valueSourceRevision !== undefined,
        value_source_revision: proposal.valueSourceRevision ?? null,
        request_revision: expectedRequestRevision ?? null,
      });
      return { ready: dependencies.coordinator.mutations.executeR1(run) };
    }
    session.awaitingValue = {
      runId: run.id,
      valueSlotId: next.valueSlotId,
      valueKind: next.valueKind,
    };
    dependencies.publish(run.id, {
      type: "value_required",
      action: dependencies.actionView(session, proposal),
      value_kind: next.valueKind,
    });
    return {
      response: {
        ok: true,
        state: "VALUE_REQUIRED",
        session_id: session.id,
        proposal_id: proposal.id,
        value_slot_id: next.valueSlotId,
        value_kind: next.valueKind,
        target_name: proposal.targetName,
      },
    };
  }
  if (next.state === "READY_TO_EXECUTE")
    return { ready: dependencies.coordinator.mutations.executeR1(run) };
  if (next.state === "AWAITING_CONFIRMATION") {
    session.awaitingConfirmation = {
      runId: run.id,
      confirmationId: next.confirmationId,
      confirmationNonce: next.confirmationNonce,
    };
    dependencies.publish(run.id, {
      type: "confirmation_required",
      action: dependencies.actionView(session, proposal),
      confirmation_id: next.confirmationId,
      confirmation_nonce: next.confirmationNonce,
    });
    return {
      response: {
        ok: true,
        state: "CONFIRMATION_REQUIRED",
        session_id: session.id,
        proposal_id: proposal.id,
      },
    };
  }
  return { response: { ok: false, code: "CONFIRMATION_INVALID" } };
};
